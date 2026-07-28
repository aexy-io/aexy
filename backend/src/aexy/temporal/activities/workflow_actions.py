"""Temporal activities for CRM workflow node execution.

Replaces: aexy.services.workflow_actions.py action handler
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from temporalio import activity
from temporalio.exceptions import ApplicationError

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


@dataclass
class MarkAutomationRunInput:
    run_id: str
    status: str  # "completed" | "failed"
    error: str | None = None
    # Node outcomes from the durable workflow, appended to the run's step log.
    steps: list[dict[str, Any]] = field(default_factory=list)


def _as_run_steps(node_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Translate workflow node results into run step-log entries.

    Keeps the shape the inline executor writes, so one reader can render a run
    whichever path produced it.
    """
    steps: list[dict[str, Any]] = []
    for order, node in enumerate(node_results or []):
        output = node.get("output") or {}
        inner = output.get("output") if isinstance(output, dict) else {}
        inner = inner if isinstance(inner, dict) else {}
        step = {
            "type": node.get("type") or inner.get("action_type") or "action",
            "order": order,
            "node_id": node.get("node_id"),
            "status": "failed" if node.get("status") == "failed" else node.get("status"),
        }
        if node.get("error") or output.get("error"):
            step["error"] = str(node.get("error") or output.get("error"))
        if inner:
            step["result"] = inner
            # Same top-level target the inline path surfaces, so "who did this
            # go to" is answerable without opening the result.
            if inner.get("to"):
                step["recipient"] = inner["to"]
        steps.append(step)
    return steps


@activity.defn
async def mark_crm_automation_run(input: MarkAutomationRunInput) -> dict[str, Any]:
    """Close out a CRMAutomationRun after the durable workflow finishes.

    Live triggers create the run row up front and hand execution to Temporal;
    without this the row would sit at "running" forever, so run history would
    lie about anything containing a wait.
    """
    from sqlalchemy import select
    from datetime import datetime, timezone
    from aexy.models.crm import CRMAutomationRun

    async with async_session_maker() as db:
        run = (await db.execute(
            select(CRMAutomationRun).where(CRMAutomationRun.id == input.run_id)
        )).scalar_one_or_none()
        if not run:
            return {"updated": False}
        # A run the executor (or the outbox) already decided must not be
        # reopened or overwritten here — this activity retries, and a second
        # pass would otherwise restamp a finished run.
        if run.status in {"completed", "failed"}:
            return {"updated": False, "reason": "already final"}
        run.status = input.status
        # Keep the handoff entry (it says why this ran durably) and add what the
        # workflow actually did, so the run shows each step and its outcome.
        run.steps_executed = [
            *(run.steps_executed or []),
            *_as_run_steps(input.steps),
        ]
        run.completed_at = datetime.now(timezone.utc)
        if run.started_at:
            run.duration_ms = int(
                (run.completed_at - run.started_at).total_seconds() * 1000
            )
        if input.error:
            # error_message is the column; assigning `run.error` set a plain
            # Python attribute that was never persisted, so every durable run
            # that failed showed a bare "failed" with no reason anywhere.
            run.error_message = str(input.error)[:500]
        await db.commit()
        return {"updated": True}


@activity.defn
async def execute_workflow_action(input: ExecuteWorkflowActionInput) -> dict[str, Any]:
    """Execute a single CRM workflow action node.

    Dispatches to the appropriate action handler based on node type/action_type.
    """
    action_type = input.node_data.get("action_type", "unknown")
    logger.info(f"Executing workflow action: {action_type} for execution {input.execution_id}")

    # aexy.services.workflow_action_handler has never existed, so every action
    # node of a published builder automation died here with ModuleNotFoundError
    # and its run stayed "running" forever. The handler lives in
    # workflow_actions, and takes a typed context rather than loose kwargs.
    from aexy.schemas.workflow import WorkflowExecutionContext
    from aexy.services.workflow_actions import WorkflowActionHandler

    context = input.context or {}

    async with async_session_maker() as db:
        handler = WorkflowActionHandler(db)
        result = await handler.execute_action(
            action_type=action_type,
            data=input.node_data,
            context=WorkflowExecutionContext(
                workspace_id=input.workspace_id,
                record_id=input.record_id,
                record_data=context.get("record_data") or {},
                trigger_data=context.get("trigger_data") or {},
                variables=context.get("variables") or {},
            ),
        )
        await db.commit()

    if result.status == "failed":
        # The workflow only fails a run when the activity raises, so returning
        # a failed result quietly would record the run completed having not
        # done the thing. Non-retryable: the handler reached a verdict, and
        # retrying would repeat any side effect it already had.
        raise ApplicationError(
            result.error or f"Action '{action_type}' failed",
            type="WorkflowActionFailed",
            non_retryable=True,
        )

    return result.model_dump(mode="json")


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
