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
    node_id: str = ""
    node_data: dict[str, Any] = field(default_factory=dict)
    context: dict[str, Any] = field(default_factory=dict)
    execution_id: str = ""
    workspace_id: str = ""
    record_id: str | None = None
    retry_failures: bool = False


@dataclass
class CleanupOldExecutionsInput:
    days: int = 30


@dataclass
class MarkAutomationRunInput:
    status: str  # "completed" | "failed"
    # A live CRM trigger creates a CRMAutomationRun; the builder's Run button
    # creates a WorkflowExecution. Both are started as the same workflow, and
    # whichever row exists has to be closed or it reads "still going" forever.
    run_id: str | None = None
    execution_id: str | None = None
    error: str | None = None
    # Node outcomes from the durable workflow, appended to the run's step log.
    steps: list[dict[str, Any]] = field(default_factory=list)


def current_attempt() -> int:
    """This activity's attempt number, or 1 when called outside Temporal.

    `activity.info()` raises RuntimeError off the activity thread, so reading
    it unguarded makes the surrounding function impossible to call directly
    from a unit test. The attempt is only ever reported, never branched on, so
    a stand-in value costs nothing.
    """
    try:
        return activity.info().attempt
    except RuntimeError:
        return 1


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
        if output:
            step["result"] = output
        if node.get("attempts"):
            step["attempts"] = node["attempts"]
        if inner:
            # Same top-level target the inline path surfaces, so "who did this
            # go to" is answerable without opening the result.
            if inner.get("to"):
                step["recipient"] = inner["to"]
        steps.append(step)
    return steps


@activity.defn
async def mark_crm_automation_run(input: MarkAutomationRunInput) -> dict[str, Any]:
    """Close out whatever row is tracking this durable workflow.

    Two things start CRMAutomationWorkflow. A live CRM trigger creates a
    CRMAutomationRun and passes crm_run_id; the builder's Run button creates a
    WorkflowExecution and passes only execution_id. Both rows are written
    before the handoff and neither resolves on its own, so a row left unclosed
    reads "still going" forever — the same lie for the builder's history that
    an unclosed CRMAutomationRun was for automation history.
    """
    from sqlalchemy import select
    from datetime import datetime, timezone
    from aexy.models.crm import CRMAutomationRun

    updated: list[str] = []

    async with async_session_maker() as db:
        if input.run_id:
            run = (await db.execute(
                select(CRMAutomationRun).where(CRMAutomationRun.id == input.run_id)
            )).scalar_one_or_none()
            # A run the executor (or the outbox) already decided must not be
            # reopened or overwritten here — this activity retries, and a second
            # pass would otherwise restamp a finished run.
            if run and run.status not in {"completed", "failed"}:
                run.status = input.status
                # Keep the handoff entry (it says why this ran durably) and add
                # what the workflow actually did, so the run shows each step and
                # its outcome.
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
                    # error_message is the column; assigning `run.error` set a
                    # plain Python attribute that was never persisted, so every
                    # durable run that failed showed a bare "failed" with no
                    # reason anywhere.
                    run.error_message = str(input.error)[:500]
                updated.append("automation_run")

        if input.execution_id:
            updated.extend(
                await _close_workflow_execution(db, input)
            )

        await db.commit()

    return {"updated": bool(updated), "rows": updated}


async def _close_workflow_execution(
    db: Any, input: MarkAutomationRunInput
) -> list[str]:
    """Write the workflow's verdict onto the builder's WorkflowExecution row.

    Nothing else does. The endpoint inserts the row as `pending` and hands off
    to Temporal, so every live run started from the builder stayed pending for
    good — success and failure alike — and its node results were never stored.
    """
    from datetime import datetime, timezone
    from uuid import uuid4

    from sqlalchemy import select

    from aexy.models.workflow import (
        WorkflowExecution,
        WorkflowExecutionStatus,
        WorkflowExecutionStep,
    )

    execution = (await db.execute(
        select(WorkflowExecution).where(
            WorkflowExecution.id == input.execution_id
        )
    )).scalar_one_or_none()
    if not execution:
        return []

    terminal = {
        WorkflowExecutionStatus.COMPLETED.value,
        WorkflowExecutionStatus.FAILED.value,
        WorkflowExecutionStatus.CANCELLED.value,
    }
    # Same retry guard as the automation run: never restamp a decided row, and
    # never resurrect one a user cancelled.
    if execution.status in terminal:
        return []

    failed_node = next(
        (n for n in (input.steps or []) if n.get("status") == "failed"), None
    )

    execution.status = (
        WorkflowExecutionStatus.COMPLETED.value
        if input.status == "completed"
        else WorkflowExecutionStatus.FAILED.value
    )
    execution.completed_at = datetime.now(timezone.utc)
    if input.error:
        execution.error = str(input.error)[:500]
    if failed_node and failed_node.get("node_id"):
        execution.error_node_id = failed_node["node_id"]

    # Per-node detail lives in its own table, not a column on the execution —
    # the detail endpoint reads execution.steps. Writing only the status would
    # leave a failed run with no indication of which step failed or why.
    existing = {
        step.node_id
        for step in (
            await db.execute(
                select(WorkflowExecutionStep).where(
                    WorkflowExecutionStep.execution_id == execution.id
                )
            )
        ).scalars()
    }
    for node in input.steps or []:
        node_id = node.get("node_id")
        if not node_id or node_id in existing:
            continue
        output = node.get("output")
        db.add(
            WorkflowExecutionStep(
                id=str(uuid4()),
                execution_id=execution.id,
                node_id=node_id,
                node_type=node.get("type") or "action",
                status=_STEP_STATUS.get(node.get("status"), "success"),
                output_data=output if isinstance(output, dict) else None,
                error=(str(node["error"])[:500] if node.get("error") else None),
                executed_at=execution.completed_at,
            )
        )

    return ["workflow_execution"]


# The workflow reports a node as "completed"; the step row's schema calls that
# "success". Writing the workflow's own word through made the detail endpoint
# fail its response validation with a 500, so a finished run became unreadable.
_STEP_STATUS: dict[str | None, str] = {
    "completed": "success",
    "success": "success",
    "failed": "failed",
    "timed_out": "failed",
    "skipped": "skipped",
}


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
    trigger_data = dict(context.get("trigger_data") or {})
    trigger_data.update(
        {
            "execution_id": input.execution_id,
            "node_id": input.node_id,
        }
    )

    async with async_session_maker() as db:
        handler = WorkflowActionHandler(db)
        result = await handler.execute_action(
            action_type=action_type,
            data=input.node_data,
            context=WorkflowExecutionContext(
                workspace_id=input.workspace_id,
                record_id=input.record_id,
                record_data=context.get("record_data") or {},
                trigger_data=trigger_data,
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
            non_retryable=not input.retry_failures,
        )

    payload = result.model_dump(mode="json")
    payload["attempt"] = current_attempt()
    return payload


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
