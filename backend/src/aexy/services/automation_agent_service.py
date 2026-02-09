"""Service for spawning and managing agents from automations.

Provides functionality to:
- Configure agent triggers on automations
- Spawn agents with full context from automation/workflow execution
- Track and await agent completion
- Map automation context to agent input
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from aexy.models.automation_agent import (
    AutomationAgentTrigger,
    AutomationAgentExecution,
    AgentTriggerPoint,
    AutomationAgentExecutionStatus,
)
from aexy.models.agent import CRMAgent, CRMAgentExecution
from aexy.models.crm import CRMAutomation, CRMRecord

logger = logging.getLogger(__name__)


class AutomationAgentService:
    """Service for spawning and managing agents from automations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # TRIGGER CONFIGURATION
    # =========================================================================

    async def configure_agent_trigger(
        self,
        automation_id: str,
        agent_id: str,
        trigger_point: str,
        trigger_config: dict | None = None,
        input_mapping: dict | None = None,
        wait_for_completion: bool = False,
        timeout_seconds: int = 300,
    ) -> AutomationAgentTrigger:
        """Configure an agent trigger for an automation.

        Args:
            automation_id: ID of the automation
            agent_id: ID of the agent to trigger
            trigger_point: When to trigger ('on_start', 'on_condition_match', 'as_action')
            trigger_config: Additional trigger configuration
            input_mapping: Map automation context to agent input fields
            wait_for_completion: Whether to wait for agent completion
            timeout_seconds: Max time to wait for completion

        Returns:
            The created or updated trigger configuration

        Raises:
            ValueError: If automation or agent not found
        """
        # Verify automation exists
        stmt = select(CRMAutomation).where(CRMAutomation.id == automation_id)
        result = await self.db.execute(stmt)
        automation = result.scalar_one_or_none()
        if not automation:
            raise ValueError(f"Automation {automation_id} not found")

        # Verify agent exists
        stmt = select(CRMAgent).where(CRMAgent.id == agent_id)
        result = await self.db.execute(stmt)
        agent = result.scalar_one_or_none()
        if not agent:
            raise ValueError(f"Agent {agent_id} not found")

        # Check for existing trigger with same automation/agent/trigger_point
        stmt = select(AutomationAgentTrigger).where(
            and_(
                AutomationAgentTrigger.automation_id == automation_id,
                AutomationAgentTrigger.agent_id == agent_id,
                AutomationAgentTrigger.trigger_point == trigger_point,
            )
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing trigger
            existing.trigger_config = trigger_config or {}
            existing.input_mapping = input_mapping or {}
            existing.wait_for_completion = wait_for_completion
            existing.timeout_seconds = timeout_seconds
            existing.is_active = True
            await self.db.flush()
            await self.db.refresh(existing)
            return existing

        # Create new trigger
        trigger = AutomationAgentTrigger(
            id=str(uuid4()),
            automation_id=automation_id,
            agent_id=agent_id,
            trigger_point=trigger_point,
            trigger_config=trigger_config or {},
            input_mapping=input_mapping or {},
            wait_for_completion=wait_for_completion,
            timeout_seconds=timeout_seconds,
            is_active=True,
        )
        self.db.add(trigger)
        await self.db.flush()
        await self.db.refresh(trigger)
        return trigger

    async def get_agent_trigger(self, trigger_id: str) -> AutomationAgentTrigger | None:
        """Get an agent trigger by ID."""
        stmt = select(AutomationAgentTrigger).where(AutomationAgentTrigger.id == trigger_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_agent_triggers(
        self,
        automation_id: str,
        trigger_point: str | None = None,
        active_only: bool = True,
    ) -> list[AutomationAgentTrigger]:
        """Get agent triggers for an automation.

        Args:
            automation_id: ID of the automation
            trigger_point: Filter by specific trigger point
            active_only: Only return active triggers

        Returns:
            List of matching triggers
        """
        stmt = select(AutomationAgentTrigger).where(
            AutomationAgentTrigger.automation_id == automation_id
        )

        if trigger_point:
            stmt = stmt.where(AutomationAgentTrigger.trigger_point == trigger_point)

        if active_only:
            stmt = stmt.where(AutomationAgentTrigger.is_active == True)

        stmt = stmt.order_by(AutomationAgentTrigger.created_at)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_agent_trigger(
        self,
        trigger_id: str,
        **kwargs,
    ) -> AutomationAgentTrigger | None:
        """Update an agent trigger."""
        trigger = await self.get_agent_trigger(trigger_id)
        if not trigger:
            return None

        allowed_fields = {
            "trigger_config",
            "input_mapping",
            "wait_for_completion",
            "timeout_seconds",
            "is_active",
        }

        for key, value in kwargs.items():
            if key in allowed_fields and value is not None:
                setattr(trigger, key, value)

        await self.db.flush()
        await self.db.refresh(trigger)
        return trigger

    async def delete_agent_trigger(self, trigger_id: str) -> bool:
        """Delete an agent trigger."""
        trigger = await self.get_agent_trigger(trigger_id)
        if not trigger:
            return False

        await self.db.delete(trigger)
        await self.db.flush()
        return True

    # =========================================================================
    # AGENT SPAWNING
    # =========================================================================

    async def spawn_agent(
        self,
        agent_id: str,
        trigger_point: str,
        context: dict,
        automation_run_id: str | None = None,
        workflow_execution_id: str | None = None,
        workflow_step_id: str | None = None,
        input_mapping: dict | None = None,
        wait_for_completion: bool = False,
        timeout_seconds: int = 300,
    ) -> AutomationAgentExecution:
        """Spawn an agent from an automation or workflow.

        Args:
            agent_id: ID of the agent to spawn
            trigger_point: Where in the automation this is triggered
            context: Context data available from the automation/workflow
            automation_run_id: ID of the automation run (if simple automation)
            workflow_execution_id: ID of the workflow execution (if visual workflow)
            workflow_step_id: ID of the workflow step (if agent node)
            input_mapping: Custom mapping of context to agent input
            wait_for_completion: Whether to wait for agent completion
            timeout_seconds: Max time to wait for completion

        Returns:
            The automation agent execution record

        Raises:
            ValueError: If agent not found or not active
        """
        # Verify agent exists and is active
        stmt = select(CRMAgent).where(CRMAgent.id == agent_id)
        result = await self.db.execute(stmt)
        agent = result.scalar_one_or_none()

        if not agent:
            raise ValueError(f"Agent {agent_id} not found")
        if not agent.is_active:
            raise ValueError(f"Agent {agent.name} is not active")

        # Build input context using mapping
        input_context = self._build_input_context(context, input_mapping or {})

        # Create automation agent execution record
        execution = AutomationAgentExecution(
            id=str(uuid4()),
            automation_run_id=automation_run_id,
            workflow_execution_id=workflow_execution_id,
            workflow_step_id=workflow_step_id,
            agent_id=agent_id,
            trigger_point=trigger_point,
            input_context=input_context,
            status=AutomationAgentExecutionStatus.PENDING.value,
        )
        self.db.add(execution)
        await self.db.flush()

        # Start agent execution asynchronously
        execution = await self._execute_agent(execution, agent, wait_for_completion, timeout_seconds)

        return execution

    async def _execute_agent(
        self,
        execution: AutomationAgentExecution,
        agent: CRMAgent,
        wait_for_completion: bool,
        timeout_seconds: int,
    ) -> AutomationAgentExecution:
        """Execute the agent and optionally wait for completion."""
        from aexy.services.agent_service import AgentService

        execution.status = AutomationAgentExecutionStatus.RUNNING.value
        execution.started_at = datetime.now(timezone.utc)
        await self.db.flush()

        try:
            # Execute the agent
            agent_service = AgentService(self.db)

            # Get record_id from input context if available
            record_id = execution.input_context.get("record_id")

            agent_execution = await agent_service.execute_agent(
                agent_id=agent.id,
                record_id=record_id,
                context=execution.input_context,
                triggered_by="automation",
                trigger_id=execution.automation_run_id or execution.workflow_execution_id,
            )

            # Link to the agent execution
            execution.agent_execution_id = agent_execution.id

            if wait_for_completion:
                # Wait for completion with timeout
                result = await self._wait_for_agent_completion(
                    agent_execution.id,
                    timeout_seconds,
                )
                execution.output_result = result.get("output")
                execution.status = (
                    AutomationAgentExecutionStatus.COMPLETED.value
                    if result.get("status") == "completed"
                    else AutomationAgentExecutionStatus.FAILED.value
                )
                if result.get("error"):
                    execution.error_message = result.get("error")
            else:
                # Just mark as running - will be updated when agent completes
                execution.status = AutomationAgentExecutionStatus.RUNNING.value
                execution.output_result = {"execution_id": agent_execution.id, "status": "spawned"}

            execution.completed_at = datetime.now(timezone.utc)

        except asyncio.TimeoutError:
            execution.status = AutomationAgentExecutionStatus.TIMEOUT.value
            execution.error_message = f"Agent execution timed out after {timeout_seconds} seconds"
            execution.completed_at = datetime.now(timezone.utc)

        except Exception as e:
            logger.exception(f"Error executing agent {agent.id}: {e}")
            execution.status = AutomationAgentExecutionStatus.FAILED.value
            execution.error_message = str(e)
            execution.completed_at = datetime.now(timezone.utc)

        await self.db.flush()
        await self.db.refresh(execution)
        return execution

    async def _wait_for_agent_completion(
        self,
        agent_execution_id: str,
        timeout_seconds: int,
    ) -> dict:
        """Wait for an agent execution to complete."""
        start_time = datetime.now(timezone.utc)

        while True:
            # Check if timed out
            elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
            if elapsed >= timeout_seconds:
                raise asyncio.TimeoutError()

            # Check execution status
            stmt = select(CRMAgentExecution).where(CRMAgentExecution.id == agent_execution_id)
            result = await self.db.execute(stmt)
            agent_execution = result.scalar_one_or_none()

            if not agent_execution:
                return {"status": "failed", "error": "Agent execution not found"}

            if agent_execution.status in ("completed", "failed", "cancelled"):
                return {
                    "status": agent_execution.status,
                    "output": agent_execution.output_result,
                    "error": agent_execution.error_message,
                    "steps": agent_execution.steps,
                }

            # Wait before checking again
            await asyncio.sleep(1)

    async def await_agent_completion(
        self,
        execution_id: str,
        timeout_seconds: int = 300,
    ) -> dict:
        """Wait for an automation agent execution to complete.

        Args:
            execution_id: ID of the AutomationAgentExecution
            timeout_seconds: Max time to wait

        Returns:
            Dict with status, output, and error information
        """
        start_time = datetime.now(timezone.utc)

        while True:
            elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
            if elapsed >= timeout_seconds:
                return {"status": "timeout", "error": f"Timed out after {timeout_seconds} seconds"}

            stmt = select(AutomationAgentExecution).where(
                AutomationAgentExecution.id == execution_id
            )
            result = await self.db.execute(stmt)
            execution = result.scalar_one_or_none()

            if not execution:
                return {"status": "failed", "error": "Execution not found"}

            if execution.status in ("completed", "failed", "timeout"):
                return {
                    "status": execution.status,
                    "output": execution.output_result,
                    "error": execution.error_message,
                }

            await asyncio.sleep(1)

    # =========================================================================
    # EXECUTION QUERIES
    # =========================================================================

    async def get_execution(self, execution_id: str) -> AutomationAgentExecution | None:
        """Get an automation agent execution by ID."""
        stmt = select(AutomationAgentExecution).where(
            AutomationAgentExecution.id == execution_id
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_executions_for_automation_run(
        self,
        automation_run_id: str,
        skip: int = 0,
        limit: int = 50,
    ) -> list[AutomationAgentExecution]:
        """List agent executions for an automation run."""
        stmt = (
            select(AutomationAgentExecution)
            .where(AutomationAgentExecution.automation_run_id == automation_run_id)
            .order_by(AutomationAgentExecution.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_executions_for_workflow(
        self,
        workflow_execution_id: str,
        skip: int = 0,
        limit: int = 50,
    ) -> list[AutomationAgentExecution]:
        """List agent executions for a workflow execution."""
        stmt = (
            select(AutomationAgentExecution)
            .where(AutomationAgentExecution.workflow_execution_id == workflow_execution_id)
            .order_by(AutomationAgentExecution.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_executions_for_agent(
        self,
        agent_id: str,
        skip: int = 0,
        limit: int = 50,
    ) -> list[AutomationAgentExecution]:
        """List automation-triggered executions for an agent."""
        stmt = (
            select(AutomationAgentExecution)
            .where(AutomationAgentExecution.agent_id == agent_id)
            .order_by(AutomationAgentExecution.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_executions_for_automation(
        self,
        automation_id: str,
        skip: int = 0,
        limit: int = 50,
    ) -> list[AutomationAgentExecution]:
        """List all agent executions for an automation (across all runs)."""
        from aexy.models.crm import CRMAutomationRun

        # Get automation runs for this automation
        stmt = (
            select(AutomationAgentExecution)
            .join(
                CRMAutomationRun,
                AutomationAgentExecution.automation_run_id == CRMAutomationRun.id,
            )
            .where(CRMAutomationRun.automation_id == automation_id)
            .order_by(AutomationAgentExecution.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # =========================================================================
    # HELPER METHODS
    # =========================================================================

    def _build_input_context(self, context: dict, input_mapping: dict) -> dict:
        """Build the input context for an agent using the mapping.

        Args:
            context: The raw context from the automation/workflow
            input_mapping: Mapping of agent input keys to context paths

        Returns:
            Dict with mapped input values
        """
        if not input_mapping:
            # If no mapping, pass through the entire context
            return context

        input_context = {}

        for agent_key, context_path in input_mapping.items():
            value = self._resolve_path(context_path, context)
            if value is not None:
                input_context[agent_key] = value

        # Always include record_id if available
        if "record_id" in context and "record_id" not in input_context:
            input_context["record_id"] = context["record_id"]

        return input_context

    def _resolve_path(self, path: str, context: dict) -> Any:
        """Resolve a dot-notation path in the context.

        Args:
            path: Path like "record.values.name" or "trigger_data.field"
            context: The context dict to resolve from

        Returns:
            The resolved value or None
        """
        parts = path.split(".")
        current = context

        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None

            if current is None:
                return None

        return current


class SyncAutomationAgentService:
    """Synchronous version of AutomationAgentService for Temporal workers."""

    def __init__(self, db: Session):
        self.db = db

    def spawn_agent_sync(
        self,
        agent_id: str,
        trigger_point: str,
        context: dict,
        automation_run_id: str | None = None,
        workflow_execution_id: str | None = None,
        workflow_step_id: str | None = None,
        input_mapping: dict | None = None,
    ) -> dict:
        """Spawn an agent synchronously (for Temporal workers).

        Note: This version does not support wait_for_completion.
        """
        from aexy.services.agent_service import SyncAgentService

        # Verify agent exists and is active
        agent = self.db.execute(
            select(CRMAgent).where(CRMAgent.id == agent_id)
        ).scalar_one_or_none()

        if not agent:
            return {"status": "failed", "error": f"Agent {agent_id} not found"}
        if not agent.is_active:
            return {"status": "failed", "error": f"Agent {agent.name} is not active"}

        # Build input context using mapping
        input_context = self._build_input_context(context, input_mapping or {})

        # Create automation agent execution record
        execution = AutomationAgentExecution(
            id=str(uuid4()),
            automation_run_id=automation_run_id,
            workflow_execution_id=workflow_execution_id,
            workflow_step_id=workflow_step_id,
            agent_id=agent_id,
            trigger_point=trigger_point,
            input_context=input_context,
            status=AutomationAgentExecutionStatus.RUNNING.value,
            started_at=datetime.now(timezone.utc),
        )
        self.db.add(execution)
        self.db.commit()

        # Execute the agent
        try:
            agent_service = SyncAgentService(self.db)
            record_id = input_context.get("record_id")

            result = agent_service.run_agent(
                agent_id=agent_id,
                input_data=input_context,
                workspace_id=agent.workspace_id,
                record_id=record_id,
            )

            # Update execution record
            execution.status = (
                AutomationAgentExecutionStatus.COMPLETED.value
                if result.get("status") == "completed"
                else AutomationAgentExecutionStatus.FAILED.value
            )
            execution.output_result = result.get("output")
            execution.error_message = result.get("error")
            execution.agent_execution_id = result.get("execution_id")
            execution.completed_at = datetime.now(timezone.utc)
            self.db.commit()

            return {
                "status": execution.status,
                "output": execution.output_result,
                "error": execution.error_message,
                "execution_id": execution.id,
            }

        except Exception as e:
            logger.exception(f"Error executing agent {agent_id}: {e}")
            execution.status = AutomationAgentExecutionStatus.FAILED.value
            execution.error_message = str(e)
            execution.completed_at = datetime.now(timezone.utc)
            self.db.commit()

            return {
                "status": "failed",
                "error": str(e),
                "execution_id": execution.id,
            }

    def _build_input_context(self, context: dict, input_mapping: dict) -> dict:
        """Build the input context for an agent using the mapping."""
        if not input_mapping:
            return context

        input_context = {}

        for agent_key, context_path in input_mapping.items():
            value = self._resolve_path(context_path, context)
            if value is not None:
                input_context[agent_key] = value

        if "record_id" in context and "record_id" not in input_context:
            input_context["record_id"] = context["record_id"]

        return input_context

    def _resolve_path(self, path: str, context: dict) -> Any:
        """Resolve a dot-notation path in the context."""
        parts = path.split(".")
        current = context

        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None

            if current is None:
                return None

        return current
