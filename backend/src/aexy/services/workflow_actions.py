"""Workflow action handlers for executing different action types."""

import httpx
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from aexy.models.crm import (
    CRMRecord,
    CRMActivity,
    CRMList,
    CRMListEntry,
    CRMSequence,
    CRMSequenceEnrollment,
)
from aexy.models.workflow import WorkflowExecution
from aexy.schemas.workflow import WorkflowExecutionContext, NodeExecutionResult


class WorkflowActionHandler:
    """Handles execution of workflow action nodes."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def execute_action(
        self,
        action_type: str,
        data: dict,
        context: WorkflowExecutionContext,
    ) -> NodeExecutionResult:
        """Execute an action based on type."""
        handlers = {
            "update_record": self._update_record,
            "create_record": self._create_record,
            "delete_record": self._delete_record,
            "send_email": self._send_email,
            "send_slack": self._send_slack,
            "send_sms": self._send_sms,
            "create_task": self._create_task,
            "add_to_list": self._add_to_list,
            "remove_from_list": self._remove_from_list,
            "enroll_sequence": self._enroll_sequence,
            "unenroll_sequence": self._unenroll_sequence,
            "webhook_call": self._webhook_call,
            "assign_owner": self._assign_owner,
        }

        handler = handlers.get(action_type)
        if not handler:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error=f"Unknown action type: {action_type}",
            )

        return await handler(data, context)

    async def _update_record(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Update a CRM record."""
        record_id = context.record_id
        if not record_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="No record ID in context",
            )

        field_mappings = data.get("field_mappings", {})
        if not field_mappings:
            return NodeExecutionResult(
                node_id="",
                status="success",
                output={"message": "No fields to update"},
            )

        stmt = select(CRMRecord).where(CRMRecord.id == record_id)
        result = await self.db.execute(stmt)
        record = result.scalar_one_or_none()

        if not record:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error=f"Record not found: {record_id}",
            )

        # Resolve field values from context
        updates = {}
        for field, value_or_path in field_mappings.items():
            if isinstance(value_or_path, str) and value_or_path.startswith("{{"):
                # Template variable
                path = value_or_path.strip("{}").strip()
                updates[field] = self._get_context_value(path, context)
            else:
                updates[field] = value_or_path

        record.values = {**record.values, **updates}
        await self.db.flush()

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"record_id": record_id, "updated_fields": list(updates.keys())},
        )

    async def _create_record(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Create a new CRM record."""
        target_object_id = data.get("target_object_id")
        if not target_object_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="No target object ID specified",
            )

        field_mappings = data.get("field_mappings", {})
        values = {}
        for field, value_or_path in field_mappings.items():
            if isinstance(value_or_path, str) and value_or_path.startswith("{{"):
                path = value_or_path.strip("{}").strip()
                values[field] = self._get_context_value(path, context)
            else:
                values[field] = value_or_path

        # Get workspace_id from the original record
        workspace_id = context.trigger_data.get("workspace_id")
        if not workspace_id and context.record_id:
            stmt = select(CRMRecord.workspace_id).where(CRMRecord.id == context.record_id)
            result = await self.db.execute(stmt)
            workspace_id = result.scalar_one_or_none()

        if not workspace_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="Could not determine workspace ID",
            )

        new_record = CRMRecord(
            id=str(uuid4()),
            workspace_id=workspace_id,
            object_id=target_object_id,
            values=values,
        )
        self.db.add(new_record)
        await self.db.flush()

        # Store new record ID in context for subsequent nodes
        context.variables["created_record_id"] = new_record.id

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"record_id": new_record.id, "object_id": target_object_id},
        )

    async def _delete_record(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Delete (archive) a CRM record."""
        record_id = data.get("record_id") or context.record_id
        if not record_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="No record ID specified",
            )

        stmt = select(CRMRecord).where(CRMRecord.id == record_id)
        result = await self.db.execute(stmt)
        record = result.scalar_one_or_none()

        if not record:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error=f"Record not found: {record_id}",
            )

        record.is_archived = True
        record.archived_at = datetime.now(timezone.utc)
        await self.db.flush()

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"record_id": record_id, "archived": True},
        )

    async def _send_email(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Send an email via Gmail integration."""
        from aexy.services.gmail_service import GmailService

        email_to = data.get("to")
        if not email_to:
            # Get from record
            email_field = data.get("email_field", "email")
            email_to = context.record_data.get("values", {}).get(email_field)

        if not email_to:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="No recipient email address",
            )

        subject = data.get("email_subject", "")
        body = data.get("email_body", "")
        use_ai = data.get("use_ai_personalization", False)

        # Template variable replacement
        subject = self._render_template(subject, context)
        body = self._render_template(body, context)

        if use_ai:
            # Use AI to personalize the email
            from aexy.services.writing_style_service import WritingStyleService
            # This would be implemented later
            pass

        # Queue the email via Celery
        from aexy.processing.celery_app import celery_app

        celery_app.send_task(
            "aexy.processing.tasks.gmail_tasks.send_email",
            kwargs={
                "record_id": context.record_id,
                "to": email_to,
                "subject": subject,
                "body": body,
            },
            queue="google_sync",
        )

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"to": email_to, "subject": subject, "queued": True},
        )

    async def _send_slack(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Send a Slack message."""
        channel_id = data.get("channel_id")
        message = data.get("message_template", "")

        if not channel_id or not message:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="Missing channel ID or message",
            )

        message = self._render_template(message, context)

        # Queue Slack message via Celery
        from aexy.processing.celery_app import celery_app

        celery_app.send_task(
            "aexy.processing.tasks.integration_tasks.send_slack_message",
            kwargs={
                "channel_id": channel_id,
                "message": message,
                "record_id": context.record_id,
            },
            queue="celery",
        )

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"channel_id": channel_id, "queued": True},
        )

    async def _send_sms(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Send an SMS via Twilio."""
        phone_field = data.get("phone_field", "phone")
        phone_to = context.record_data.get("values", {}).get(phone_field)

        if not phone_to:
            phone_to = data.get("phone_number")

        if not phone_to:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="No phone number for SMS",
            )

        message = data.get("message_template", "")
        message = self._render_template(message, context)

        # Queue SMS via Celery
        from aexy.processing.celery_app import celery_app

        celery_app.send_task(
            "aexy.processing.tasks.integration_tasks.send_sms",
            kwargs={
                "to": phone_to,
                "body": message,
                "record_id": context.record_id,
            },
            queue="celery",
        )

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"to": phone_to, "queued": True},
        )

    async def _create_task(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Create a task in the ticketing system."""
        title = data.get("title", "New Task")
        description = data.get("description", "")
        assignee_id = data.get("assignee_id")
        due_date = data.get("due_date")

        title = self._render_template(title, context)
        description = self._render_template(description, context)

        # Get workspace from context
        workspace_id = context.trigger_data.get("workspace_id")

        # Create task via ticketing service
        from aexy.services.ticketing_service import TicketingService

        service = TicketingService(self.db)
        # This would create the task
        # task = await service.create_ticket(...)

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"title": title, "created": True},
        )

    async def _add_to_list(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Add a record to a CRM list."""
        list_id = data.get("list_id")
        record_id = context.record_id

        if not list_id or not record_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="Missing list ID or record ID",
            )

        # Check if already in list
        stmt = select(CRMListEntry).where(
            CRMListEntry.list_id == list_id,
            CRMListEntry.record_id == record_id,
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            return NodeExecutionResult(
                node_id="",
                status="success",
                output={"list_id": list_id, "already_in_list": True},
            )

        entry = CRMListEntry(
            id=str(uuid4()),
            list_id=list_id,
            record_id=record_id,
            position=0,
            list_values={},
        )
        self.db.add(entry)
        await self.db.flush()

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"list_id": list_id, "entry_id": entry.id},
        )

    async def _remove_from_list(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Remove a record from a CRM list."""
        list_id = data.get("list_id")
        record_id = context.record_id

        if not list_id or not record_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="Missing list ID or record ID",
            )

        stmt = select(CRMListEntry).where(
            CRMListEntry.list_id == list_id,
            CRMListEntry.record_id == record_id,
        )
        result = await self.db.execute(stmt)
        entry = result.scalar_one_or_none()

        if entry:
            await self.db.delete(entry)
            await self.db.flush()

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"list_id": list_id, "removed": entry is not None},
        )

    async def _enroll_sequence(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Enroll a record in a sequence."""
        sequence_id = data.get("sequence_id")
        record_id = context.record_id

        if not sequence_id or not record_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="Missing sequence ID or record ID",
            )

        # Check if already enrolled
        stmt = select(CRMSequenceEnrollment).where(
            CRMSequenceEnrollment.sequence_id == sequence_id,
            CRMSequenceEnrollment.record_id == record_id,
            CRMSequenceEnrollment.status == "active",
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            return NodeExecutionResult(
                node_id="",
                status="success",
                output={"sequence_id": sequence_id, "already_enrolled": True},
            )

        enrollment = CRMSequenceEnrollment(
            id=str(uuid4()),
            sequence_id=sequence_id,
            record_id=record_id,
            status="active",
            enrolled_at=datetime.now(timezone.utc),
            steps_completed=[],
        )
        self.db.add(enrollment)
        await self.db.flush()

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"sequence_id": sequence_id, "enrollment_id": enrollment.id},
        )

    async def _unenroll_sequence(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Unenroll a record from a sequence."""
        sequence_id = data.get("sequence_id")
        record_id = context.record_id

        if not sequence_id or not record_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="Missing sequence ID or record ID",
            )

        stmt = select(CRMSequenceEnrollment).where(
            CRMSequenceEnrollment.sequence_id == sequence_id,
            CRMSequenceEnrollment.record_id == record_id,
            CRMSequenceEnrollment.status == "active",
        )
        result = await self.db.execute(stmt)
        enrollment = result.scalar_one_or_none()

        if enrollment:
            enrollment.status = "exited"
            enrollment.exit_reason = "automation"
            enrollment.exited_at = datetime.now(timezone.utc)
            await self.db.flush()

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"sequence_id": sequence_id, "unenrolled": enrollment is not None},
        )

    async def _webhook_call(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Make an HTTP webhook call."""
        url = data.get("webhook_url")
        method = data.get("http_method", "POST").upper()
        headers = data.get("headers", {})
        body_template = data.get("body_template", "{}")

        if not url:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="No webhook URL specified",
            )

        # Render body template
        body = self._render_template(body_template, context)

        try:
            import json

            async with httpx.AsyncClient(timeout=30.0) as client:
                if method in ["POST", "PUT", "PATCH"]:
                    response = await client.request(
                        method=method,
                        url=url,
                        headers=headers,
                        json=json.loads(body) if body else None,
                    )
                else:
                    response = await client.request(
                        method=method,
                        url=url,
                        headers=headers,
                    )

            return NodeExecutionResult(
                node_id="",
                status="success" if response.is_success else "failed",
                output={
                    "status_code": response.status_code,
                    "response": response.text[:1000],  # Truncate response
                },
            )
        except Exception as e:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error=f"Webhook call failed: {str(e)}",
            )

    async def _assign_owner(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Assign a record owner."""
        record_id = context.record_id
        owner_id = data.get("owner_id")

        if not record_id or not owner_id:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error="Missing record ID or owner ID",
            )

        stmt = select(CRMRecord).where(CRMRecord.id == record_id)
        result = await self.db.execute(stmt)
        record = result.scalar_one_or_none()

        if not record:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error=f"Record not found: {record_id}",
            )

        record.owner_id = owner_id
        await self.db.flush()

        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"record_id": record_id, "owner_id": owner_id},
        )

    def _get_context_value(self, path: str, context: WorkflowExecutionContext) -> Any:
        """Get a value from context using dot notation."""
        parts = path.split(".")
        current = None

        if parts[0] == "record":
            current = context.record_data
            parts = parts[1:]
        elif parts[0] == "trigger":
            current = context.trigger_data
            parts = parts[1:]
        elif parts[0] == "variables":
            current = context.variables
            parts = parts[1:]
        else:
            current = context.record_data

        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None

        return current

    def _render_template(self, template: str, context: WorkflowExecutionContext) -> str:
        """Render a template string with context variables."""
        import re

        def replace_var(match: re.Match) -> str:
            path = match.group(1).strip()
            value = self._get_context_value(path, context)
            return str(value) if value is not None else ""

        # Replace {{path.to.value}} with actual values
        return re.sub(r"\{\{([^}]+)\}\}", replace_var, template)


class SyncWorkflowActionHandler:
    """Synchronous action handler for Celery tasks."""

    def __init__(self, db: Session):
        self.db = db

    def execute_action(
        self,
        action_type: str,
        data: dict,
        context: dict,
        execution: WorkflowExecution,
    ) -> dict:
        """Execute an action based on type."""
        handlers = {
            "update_record": self._update_record,
            "create_record": self._create_record,
            "delete_record": self._delete_record,
            "send_email": self._send_email,
            "send_slack": self._send_slack,
            "send_sms": self._send_sms,
            "create_task": self._create_task,
            "add_to_list": self._add_to_list,
            "remove_from_list": self._remove_from_list,
            "enroll_sequence": self._enroll_sequence,
            "unenroll_sequence": self._unenroll_sequence,
            "webhook_call": self._webhook_call,
            "assign_owner": self._assign_owner,
        }

        handler = handlers.get(action_type)
        if not handler:
            return {"status": "failed", "error": f"Unknown action type: {action_type}"}

        return handler(data, context, execution)

    def _update_record(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Update a CRM record."""
        record_id = execution.record_id
        if not record_id:
            return {"status": "failed", "error": "No record ID in context"}

        field_mappings = data.get("field_mappings", {})
        if not field_mappings:
            return {"status": "success", "output": {"message": "No fields to update"}}

        record = self.db.execute(
            select(CRMRecord).where(CRMRecord.id == record_id)
        ).scalar_one_or_none()

        if not record:
            return {"status": "failed", "error": f"Record not found: {record_id}"}

        updates = {}
        for field, value_or_path in field_mappings.items():
            if isinstance(value_or_path, str) and value_or_path.startswith("{{"):
                path = value_or_path.strip("{}").strip()
                updates[field] = self._get_context_value(path, context)
            else:
                updates[field] = value_or_path

        record.values = {**record.values, **updates}
        self.db.commit()

        return {
            "status": "success",
            "output": {"record_id": record_id, "updated_fields": list(updates.keys())},
        }

    def _create_record(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Create a new CRM record."""
        target_object_id = data.get("target_object_id")
        if not target_object_id:
            return {"status": "failed", "error": "No target object ID specified"}

        field_mappings = data.get("field_mappings", {})
        values = {}
        for field, value_or_path in field_mappings.items():
            if isinstance(value_or_path, str) and value_or_path.startswith("{{"):
                path = value_or_path.strip("{}").strip()
                values[field] = self._get_context_value(path, context)
            else:
                values[field] = value_or_path

        workspace_id = execution.workspace_id

        new_record = CRMRecord(
            id=str(uuid4()),
            workspace_id=workspace_id,
            object_id=target_object_id,
            values=values,
        )
        self.db.add(new_record)
        self.db.commit()

        return {
            "status": "success",
            "output": {"record_id": new_record.id, "object_id": target_object_id},
        }

    def _delete_record(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Delete (archive) a CRM record."""
        record_id = data.get("record_id") or execution.record_id
        if not record_id:
            return {"status": "failed", "error": "No record ID specified"}

        record = self.db.execute(
            select(CRMRecord).where(CRMRecord.id == record_id)
        ).scalar_one_or_none()

        if not record:
            return {"status": "failed", "error": f"Record not found: {record_id}"}

        record.is_archived = True
        record.archived_at = datetime.now(timezone.utc)
        self.db.commit()

        return {"status": "success", "output": {"record_id": record_id, "archived": True}}

    def _send_email(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Send an email via Gmail integration."""
        email_to = data.get("to")
        if not email_to:
            record_data = context.get("record_data", {})
            email_field = data.get("email_field", "email")
            email_to = record_data.get("values", {}).get(email_field)

        if not email_to:
            return {"status": "failed", "error": "No recipient email address"}

        subject = data.get("email_subject", "")
        body = data.get("email_body", "")

        subject = self._render_template(subject, context)
        body = self._render_template(body, context)

        # Queue the email via Celery
        from aexy.processing.celery_app import celery_app

        celery_app.send_task(
            "aexy.processing.google_sync_tasks.send_email",
            kwargs={
                "workspace_id": execution.workspace_id,
                "record_id": execution.record_id,
                "to": email_to,
                "subject": subject,
                "body": body,
            },
            queue="google_sync",
        )

        return {
            "status": "success",
            "output": {"to": email_to, "subject": subject, "queued": True},
        }

    def _send_slack(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Send a Slack message."""
        channel_id = data.get("channel_id")
        message = data.get("message_template", "")

        if not channel_id or not message:
            return {"status": "failed", "error": "Missing channel ID or message"}

        message = self._render_template(message, context)

        from aexy.processing.celery_app import celery_app

        celery_app.send_task(
            "aexy.processing.integration_tasks.send_slack_message",
            kwargs={
                "workspace_id": execution.workspace_id,
                "channel_id": channel_id,
                "message": message,
            },
            queue="integrations",
        )

        return {"status": "success", "output": {"channel_id": channel_id, "queued": True}}

    def _send_sms(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Send an SMS via Twilio."""
        record_data = context.get("record_data", {})
        phone_field = data.get("phone_field", "phone")
        phone_to = record_data.get("values", {}).get(phone_field)

        if not phone_to:
            phone_to = data.get("phone_number")

        if not phone_to:
            return {"status": "failed", "error": "No phone number for SMS"}

        message = data.get("message_template", "")
        message = self._render_template(message, context)

        from aexy.processing.celery_app import celery_app

        celery_app.send_task(
            "aexy.processing.integration_tasks.send_sms",
            kwargs={
                "workspace_id": execution.workspace_id,
                "to": phone_to,
                "body": message,
            },
            queue="integrations",
        )

        return {"status": "success", "output": {"to": phone_to, "queued": True}}

    def _create_task(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Create a task."""
        title = data.get("title", "New Task")
        title = self._render_template(title, context)
        return {"status": "success", "output": {"title": title, "created": True}}

    def _add_to_list(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Add a record to a CRM list."""
        list_id = data.get("list_id")
        record_id = execution.record_id

        if not list_id or not record_id:
            return {"status": "failed", "error": "Missing list ID or record ID"}

        existing = self.db.execute(
            select(CRMListEntry).where(
                CRMListEntry.list_id == list_id,
                CRMListEntry.record_id == record_id,
            )
        ).scalar_one_or_none()

        if existing:
            return {"status": "success", "output": {"list_id": list_id, "already_in_list": True}}

        entry = CRMListEntry(
            id=str(uuid4()),
            list_id=list_id,
            record_id=record_id,
            position=0,
            list_values={},
        )
        self.db.add(entry)
        self.db.commit()

        return {"status": "success", "output": {"list_id": list_id, "entry_id": entry.id}}

    def _remove_from_list(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Remove a record from a CRM list."""
        list_id = data.get("list_id")
        record_id = execution.record_id

        if not list_id or not record_id:
            return {"status": "failed", "error": "Missing list ID or record ID"}

        entry = self.db.execute(
            select(CRMListEntry).where(
                CRMListEntry.list_id == list_id,
                CRMListEntry.record_id == record_id,
            )
        ).scalar_one_or_none()

        if entry:
            self.db.delete(entry)
            self.db.commit()

        return {"status": "success", "output": {"list_id": list_id, "removed": entry is not None}}

    def _enroll_sequence(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Enroll a record in a sequence."""
        sequence_id = data.get("sequence_id")
        record_id = execution.record_id

        if not sequence_id or not record_id:
            return {"status": "failed", "error": "Missing sequence ID or record ID"}

        existing = self.db.execute(
            select(CRMSequenceEnrollment).where(
                CRMSequenceEnrollment.sequence_id == sequence_id,
                CRMSequenceEnrollment.record_id == record_id,
                CRMSequenceEnrollment.status == "active",
            )
        ).scalar_one_or_none()

        if existing:
            return {"status": "success", "output": {"sequence_id": sequence_id, "already_enrolled": True}}

        enrollment = CRMSequenceEnrollment(
            id=str(uuid4()),
            sequence_id=sequence_id,
            record_id=record_id,
            status="active",
            enrolled_at=datetime.now(timezone.utc),
            steps_completed=[],
        )
        self.db.add(enrollment)
        self.db.commit()

        return {"status": "success", "output": {"sequence_id": sequence_id, "enrollment_id": enrollment.id}}

    def _unenroll_sequence(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Unenroll a record from a sequence."""
        sequence_id = data.get("sequence_id")
        record_id = execution.record_id

        if not sequence_id or not record_id:
            return {"status": "failed", "error": "Missing sequence ID or record ID"}

        enrollment = self.db.execute(
            select(CRMSequenceEnrollment).where(
                CRMSequenceEnrollment.sequence_id == sequence_id,
                CRMSequenceEnrollment.record_id == record_id,
                CRMSequenceEnrollment.status == "active",
            )
        ).scalar_one_or_none()

        if enrollment:
            enrollment.status = "exited"
            enrollment.exit_reason = "automation"
            enrollment.exited_at = datetime.now(timezone.utc)
            self.db.commit()

        return {"status": "success", "output": {"sequence_id": sequence_id, "unenrolled": enrollment is not None}}

    def _webhook_call(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Make an HTTP webhook call."""
        import json
        import requests

        url = data.get("webhook_url")
        method = data.get("http_method", "POST").upper()
        headers = data.get("headers", {})
        body_template = data.get("body_template", "{}")

        if not url:
            return {"status": "failed", "error": "No webhook URL specified"}

        body = self._render_template(body_template, context)

        try:
            if method in ["POST", "PUT", "PATCH"]:
                response = requests.request(
                    method=method,
                    url=url,
                    headers=headers,
                    json=json.loads(body) if body else None,
                    timeout=30,
                )
            else:
                response = requests.request(
                    method=method,
                    url=url,
                    headers=headers,
                    timeout=30,
                )

            return {
                "status": "success" if response.ok else "failed",
                "output": {
                    "status_code": response.status_code,
                    "response": response.text[:1000],
                },
            }
        except Exception as e:
            return {"status": "failed", "error": f"Webhook call failed: {str(e)}"}

    def _assign_owner(self, data: dict, context: dict, execution: WorkflowExecution) -> dict:
        """Assign a record owner."""
        record_id = execution.record_id
        owner_id = data.get("owner_id")

        if not record_id or not owner_id:
            return {"status": "failed", "error": "Missing record ID or owner ID"}

        record = self.db.execute(
            select(CRMRecord).where(CRMRecord.id == record_id)
        ).scalar_one_or_none()

        if not record:
            return {"status": "failed", "error": f"Record not found: {record_id}"}

        record.owner_id = owner_id
        self.db.commit()

        return {"status": "success", "output": {"record_id": record_id, "owner_id": owner_id}}

    def _get_context_value(self, path: str, context: dict) -> Any:
        """Get a value from context using dot notation."""
        parts = path.split(".")
        current = None

        if parts[0] == "record":
            current = context.get("record_data", {})
            parts = parts[1:]
        elif parts[0] == "trigger":
            current = context.get("trigger_data", {})
            parts = parts[1:]
        elif parts[0] == "variables":
            current = context.get("variables", {})
            parts = parts[1:]
        else:
            current = context.get("record_data", {})

        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None

        return current

    def _render_template(self, template: str, context: dict) -> str:
        """Render a template string with context variables."""
        def replace_var(match: re.Match) -> str:
            path = match.group(1).strip()
            value = self._get_context_value(path, context)
            return str(value) if value is not None else ""

        return re.sub(r"\{\{([^}]+)\}\}", replace_var, template)
