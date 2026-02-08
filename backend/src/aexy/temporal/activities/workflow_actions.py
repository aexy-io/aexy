"""Temporal activities for CRM workflow node execution.

Replaces: aexy.services.workflow_actions.py action handler
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class ExecuteWorkflowActionInput:
    node_type: str
    node_data: dict[str, Any] = field(default_factory=dict)
    context: dict[str, Any] = field(default_factory=dict)
    execution_id: str = ""
    workspace_id: str = ""
    record_id: str | None = None


@dataclass
class CleanupOldExecutionsInput:
    days: int = 30


@activity.defn
async def execute_workflow_action(input: ExecuteWorkflowActionInput) -> dict[str, Any]:
    """Execute a single CRM workflow action node.

    Dispatches to the appropriate action handler based on node type/action_type.
    """
    action_type = input.node_data.get("action_type", "unknown")
    logger.info(f"Executing workflow action: {action_type} for execution {input.execution_id}")

    from aexy.services.workflow_action_handler import WorkflowActionHandler

    async with async_session_maker() as db:
        handler = WorkflowActionHandler(db)
        result = await handler.execute_action(
            action_type=action_type,
            node_data=input.node_data,
            context=input.context,
            execution_id=input.execution_id,
            workspace_id=input.workspace_id,
            record_id=input.record_id,
        )
        await db.commit()
        return result


@activity.defn
async def cleanup_old_executions(input: CleanupOldExecutionsInput) -> dict[str, Any]:
    """Cleanup old workflow executions to prevent database bloat."""
    logger.info(f"Cleaning up workflow executions older than {input.days} days")

    from datetime import datetime, timezone, timedelta
    from sqlalchemy import select, and_
    from aexy.models.workflow import WorkflowExecution, WorkflowExecutionStatus

    cutoff = datetime.now(timezone.utc) - timedelta(days=input.days)

    async with async_session_maker() as db:
        result = await db.execute(
            select(WorkflowExecution).where(
                and_(
                    WorkflowExecution.status.in_([
                        WorkflowExecutionStatus.COMPLETED.value,
                        WorkflowExecutionStatus.FAILED.value,
                        WorkflowExecutionStatus.CANCELLED.value,
                    ]),
                    WorkflowExecution.created_at < cutoff,
                )
            )
        )
        executions = result.scalars().all()
        count = len(executions)
        for execution in executions:
            await db.delete(execution)
        await db.commit()

    return {"deleted": count}
