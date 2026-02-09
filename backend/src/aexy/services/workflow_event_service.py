"""Workflow event service for handling external events and resuming workflows."""

import logging
from datetime import datetime, timezone, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from aexy.models.workflow import (
    WorkflowExecution,
    WorkflowEventSubscription,
    WorkflowExecutionStatus,
)

logger = logging.getLogger(__name__)


# Supported event types
EVENT_TYPES = {
    "email.opened": {
        "label": "Email Opened",
        "description": "Triggered when a tracked email is opened",
        "filter_fields": ["email_id", "record_id", "recipient_email"],
    },
    "email.clicked": {
        "label": "Email Link Clicked",
        "description": "Triggered when a link in a tracked email is clicked",
        "filter_fields": ["email_id", "record_id", "link_url"],
    },
    "email.replied": {
        "label": "Email Replied",
        "description": "Triggered when a reply to an email is received",
        "filter_fields": ["email_id", "record_id", "thread_id"],
    },
    "email.bounced": {
        "label": "Email Bounced",
        "description": "Triggered when an email bounces",
        "filter_fields": ["email_id", "record_id"],
    },
    "form.submitted": {
        "label": "Form Submitted",
        "description": "Triggered when a form is submitted",
        "filter_fields": ["form_id", "record_id"],
    },
    "meeting.scheduled": {
        "label": "Meeting Scheduled",
        "description": "Triggered when a meeting is scheduled (e.g., via Calendly)",
        "filter_fields": ["calendar_id", "record_id", "meeting_type"],
    },
    "meeting.completed": {
        "label": "Meeting Completed",
        "description": "Triggered when a scheduled meeting ends",
        "filter_fields": ["meeting_id", "record_id"],
    },
    "meeting.cancelled": {
        "label": "Meeting Cancelled",
        "description": "Triggered when a meeting is cancelled",
        "filter_fields": ["meeting_id", "record_id"],
    },
    "webhook.received": {
        "label": "Webhook Received",
        "description": "Triggered by a custom webhook",
        "filter_fields": ["webhook_id", "record_id"],
    },
    "record.updated": {
        "label": "Record Updated",
        "description": "Triggered when a specific record is updated",
        "filter_fields": ["record_id", "field_changed"],
    },
}


class WorkflowEventService:
    """Async service for handling workflow events."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_subscription(
        self,
        execution_id: str,
        workspace_id: str,
        event_type: str,
        event_filter: dict | None = None,
        timeout_hours: int = 24,
    ) -> WorkflowEventSubscription:
        """
        Create an event subscription for a waiting workflow.

        Args:
            execution_id: The workflow execution waiting for the event
            workspace_id: The workspace ID
            event_type: Type of event to wait for
            event_filter: Criteria to match incoming events
            timeout_hours: Hours before the subscription times out

        Returns:
            The created subscription
        """
        timeout_at = datetime.now(timezone.utc) + timedelta(hours=timeout_hours)

        subscription = WorkflowEventSubscription(
            id=str(uuid4()),
            execution_id=execution_id,
            workspace_id=workspace_id,
            event_type=event_type,
            event_filter=event_filter or {},
            timeout_at=timeout_at,
            is_active=True,
        )

        self.db.add(subscription)
        await self.db.commit()
        await self.db.refresh(subscription)

        logger.info(
            f"Created event subscription {subscription.id} for execution {execution_id}, "
            f"event_type={event_type}"
        )

        return subscription

    async def handle_event(
        self,
        workspace_id: str,
        event_type: str,
        event_data: dict,
    ) -> list[str]:
        """
        Handle an incoming event and resume matching workflows.

        Args:
            workspace_id: The workspace the event belongs to
            event_type: Type of the event
            event_data: Event payload data

        Returns:
            List of execution IDs that were resumed
        """
        logger.info(f"Handling event {event_type} for workspace {workspace_id}")

        # Find active subscriptions for this event type
        stmt = select(WorkflowEventSubscription).where(
            and_(
                WorkflowEventSubscription.workspace_id == workspace_id,
                WorkflowEventSubscription.event_type == event_type,
                WorkflowEventSubscription.is_active == True,
            )
        )
        result = await self.db.execute(stmt)
        subscriptions = result.scalars().all()

        resumed_executions = []

        for subscription in subscriptions:
            # Check if event matches the filter
            if self._matches_filter(event_data, subscription.event_filter):
                # Mark subscription as matched
                subscription.is_active = False
                subscription.matched_at = datetime.now(timezone.utc)
                subscription.matched_event_data = event_data

                # Resume the execution
                execution_id = subscription.execution_id
                await self._resume_execution(execution_id, event_type, event_data)
                resumed_executions.append(execution_id)

                logger.info(
                    f"Event {event_type} matched subscription {subscription.id}, "
                    f"resuming execution {execution_id}"
                )

        await self.db.commit()

        return resumed_executions

    def _matches_filter(self, event_data: dict, event_filter: dict) -> bool:
        """Check if event data matches the subscription filter."""
        if not event_filter:
            return True

        for key, expected_value in event_filter.items():
            actual_value = event_data.get(key)

            # Handle nested paths (e.g., "record.id")
            if "." in key:
                parts = key.split(".")
                actual_value = event_data
                for part in parts:
                    if isinstance(actual_value, dict):
                        actual_value = actual_value.get(part)
                    else:
                        actual_value = None
                        break

            if actual_value != expected_value:
                return False

        return True

    async def _resume_execution(
        self,
        execution_id: str,
        event_type: str,
        event_data: dict,
    ):
        """Resume a paused workflow execution."""
        stmt = select(WorkflowExecution).where(WorkflowExecution.id == execution_id)
        result = await self.db.execute(stmt)
        execution = result.scalar_one_or_none()

        if not execution:
            logger.warning(f"Execution {execution_id} not found")
            return

        if execution.status != WorkflowExecutionStatus.PAUSED.value:
            logger.warning(
                f"Execution {execution_id} is not paused (status={execution.status})"
            )
            return

        # Update context with event data
        context = execution.context or {}
        context["event_data"] = event_data
        context["event_type"] = event_type
        context["event_received_at"] = datetime.now(timezone.utc).isoformat()

        execution.context = context
        execution.wait_event_type = None
        execution.wait_timeout_at = None

        # Signal the running Temporal workflow to resume
        from aexy.temporal.client import get_temporal_client
        from aexy.temporal.workflows.crm_workflow import CRMAutomationWorkflow

        client = await get_temporal_client()
        handle = client.get_workflow_handle(f"crm-workflow-{execution_id}")
        await handle.signal(CRMAutomationWorkflow.on_event, event_type, event_data)

    async def cancel_subscriptions(self, execution_id: str):
        """Cancel all active subscriptions for an execution."""
        stmt = select(WorkflowEventSubscription).where(
            and_(
                WorkflowEventSubscription.execution_id == execution_id,
                WorkflowEventSubscription.is_active == True,
            )
        )
        result = await self.db.execute(stmt)
        subscriptions = result.scalars().all()

        for subscription in subscriptions:
            subscription.is_active = False

        await self.db.commit()

    async def check_timed_out_subscriptions(self) -> int:
        """Check for and handle timed out subscriptions."""
        now = datetime.now(timezone.utc)

        stmt = select(WorkflowEventSubscription).where(
            and_(
                WorkflowEventSubscription.is_active == True,
                WorkflowEventSubscription.timeout_at <= now,
            )
        )
        result = await self.db.execute(stmt)
        timed_out = result.scalars().all()

        count = 0
        for subscription in timed_out:
            subscription.is_active = False

            # Fail the execution
            exec_stmt = select(WorkflowExecution).where(
                WorkflowExecution.id == subscription.execution_id
            )
            exec_result = await self.db.execute(exec_stmt)
            execution = exec_result.scalar_one_or_none()

            if execution and execution.status == WorkflowExecutionStatus.PAUSED.value:
                execution.status = WorkflowExecutionStatus.FAILED.value
                execution.error = f"Timeout waiting for event: {subscription.event_type}"
                execution.completed_at = now
                count += 1

        await self.db.commit()

        logger.info(f"Handled {count} timed out event subscriptions")
        return count

    @staticmethod
    def get_supported_events() -> list[dict]:
        """Get list of supported event types."""
        return [
            {
                "type": event_type,
                "label": config["label"],
                "description": config["description"],
                "filter_fields": config["filter_fields"],
            }
            for event_type, config in EVENT_TYPES.items()
        ]


class SyncWorkflowEventService:
    """Synchronous service for Temporal workers."""

    def __init__(self, db: Session):
        self.db = db

    def create_subscription(
        self,
        execution_id: str,
        workspace_id: str,
        event_type: str,
        event_filter: dict | None = None,
        timeout_hours: int = 24,
    ) -> WorkflowEventSubscription:
        """Create an event subscription synchronously."""
        timeout_at = datetime.now(timezone.utc) + timedelta(hours=timeout_hours)

        subscription = WorkflowEventSubscription(
            id=str(uuid4()),
            execution_id=execution_id,
            workspace_id=workspace_id,
            event_type=event_type,
            event_filter=event_filter or {},
            timeout_at=timeout_at,
            is_active=True,
        )

        self.db.add(subscription)
        self.db.commit()

        logger.info(
            f"Created event subscription {subscription.id} for execution {execution_id}"
        )

        return subscription

    def handle_event(
        self,
        workspace_id: str,
        event_type: str,
        event_data: dict,
    ) -> list[str]:
        """Handle an incoming event synchronously."""
        logger.info(f"Handling event {event_type} for workspace {workspace_id}")

        stmt = select(WorkflowEventSubscription).where(
            and_(
                WorkflowEventSubscription.workspace_id == workspace_id,
                WorkflowEventSubscription.event_type == event_type,
                WorkflowEventSubscription.is_active == True,
            )
        )
        result = self.db.execute(stmt)
        subscriptions = result.scalars().all()

        resumed_executions = []

        for subscription in subscriptions:
            if self._matches_filter(event_data, subscription.event_filter):
                subscription.is_active = False
                subscription.matched_at = datetime.now(timezone.utc)
                subscription.matched_event_data = event_data

                execution_id = subscription.execution_id
                self._resume_execution(execution_id, event_type, event_data)
                resumed_executions.append(execution_id)

        self.db.commit()

        return resumed_executions

    def _matches_filter(self, event_data: dict, event_filter: dict) -> bool:
        """Check if event data matches filter."""
        if not event_filter:
            return True

        for key, expected_value in event_filter.items():
            actual_value = event_data.get(key)
            if "." in key:
                parts = key.split(".")
                actual_value = event_data
                for part in parts:
                    if isinstance(actual_value, dict):
                        actual_value = actual_value.get(part)
                    else:
                        actual_value = None
                        break

            if actual_value != expected_value:
                return False

        return True

    def _resume_execution(
        self,
        execution_id: str,
        event_type: str,
        event_data: dict,
    ):
        """Resume a paused execution."""
        execution = self.db.execute(
            select(WorkflowExecution).where(WorkflowExecution.id == execution_id)
        ).scalar_one_or_none()

        if not execution or execution.status != WorkflowExecutionStatus.PAUSED.value:
            return

        context = execution.context or {}
        context["event_data"] = event_data
        context["event_type"] = event_type
        context["event_received_at"] = datetime.now(timezone.utc).isoformat()
        execution.context = context
        execution.wait_event_type = None
        execution.wait_timeout_at = None
        self.db.commit()

        # Signal the running Temporal workflow to resume
        import asyncio
        from aexy.temporal.client import get_temporal_client
        from aexy.temporal.workflows.crm_workflow import CRMAutomationWorkflow

        async def _signal():
            client = await get_temporal_client()
            handle = client.get_workflow_handle(f"crm-workflow-{execution_id}")
            await handle.signal(CRMAutomationWorkflow.on_event, event_type, event_data)

        asyncio.get_event_loop().run_until_complete(_signal())

    def check_timed_out_subscriptions(self) -> int:
        """Check for and handle timed out subscriptions (sync version)."""
        now = datetime.now(timezone.utc)

        stmt = select(WorkflowEventSubscription).where(
            and_(
                WorkflowEventSubscription.is_active == True,
                WorkflowEventSubscription.timeout_at <= now,
            )
        )
        result = self.db.execute(stmt)
        timed_out = result.scalars().all()

        count = 0
        for subscription in timed_out:
            subscription.is_active = False

            # Fail the execution
            exec_stmt = select(WorkflowExecution).where(
                WorkflowExecution.id == subscription.execution_id
            )
            exec_result = self.db.execute(exec_stmt)
            execution = exec_result.scalar_one_or_none()

            if execution and execution.status == WorkflowExecutionStatus.PAUSED.value:
                execution.status = WorkflowExecutionStatus.FAILED.value
                execution.error = f"Timeout waiting for event: {subscription.event_type}"
                execution.completed_at = now
                count += 1

        self.db.commit()

        logger.info(f"Handled {count} timed out event subscriptions (sync)")
        return count
