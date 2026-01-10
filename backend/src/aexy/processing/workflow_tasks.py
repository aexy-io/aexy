"""Celery tasks for workflow execution and scheduling."""

import logging
from datetime import datetime, timezone, timedelta

from celery import shared_task
from sqlalchemy import select, and_

from aexy.core.database import get_sync_session
from aexy.models.workflow import (
    WorkflowExecution,
    WorkflowExecutionStep,
    WorkflowExecutionStatus,
    WorkflowStepStatus,
    WorkflowDefinition,
)
from aexy.models.crm import CRMAutomation, CRMRecord

logger = logging.getLogger(__name__)


@shared_task(
    name="aexy.processing.workflow_tasks.execute_workflow_task",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def execute_workflow_task(
    self,
    execution_id: str,
) -> dict:
    """
    Execute a workflow from the beginning or resume from a specific node.

    Args:
        execution_id: The workflow execution ID to run

    Returns:
        Dict with execution result
    """
    logger.info(f"Starting workflow execution: {execution_id}")

    with get_sync_session() as db:
        # Load execution
        execution = db.execute(
            select(WorkflowExecution).where(WorkflowExecution.id == execution_id)
        ).scalar_one_or_none()

        if not execution:
            logger.error(f"Execution not found: {execution_id}")
            return {"status": "error", "message": "Execution not found"}

        # Check if already completed or cancelled
        if execution.status in [
            WorkflowExecutionStatus.COMPLETED.value,
            WorkflowExecutionStatus.CANCELLED.value,
        ]:
            logger.info(f"Execution {execution_id} already {execution.status}")
            return {"status": execution.status}

        # Load workflow definition
        workflow = db.execute(
            select(WorkflowDefinition).where(WorkflowDefinition.id == execution.workflow_id)
        ).scalar_one_or_none()

        if not workflow:
            execution.status = WorkflowExecutionStatus.FAILED.value
            execution.error = "Workflow definition not found"
            db.commit()
            return {"status": "error", "message": "Workflow definition not found"}

        # Load record if specified
        record_data = {}
        if execution.record_id:
            record = db.execute(
                select(CRMRecord).where(CRMRecord.id == execution.record_id)
            ).scalar_one_or_none()
            if record:
                record_data = {
                    "id": record.id,
                    "object_id": record.object_id,
                    "values": record.values,
                    "owner_id": record.owner_id,
                }

        # Update execution status to running
        execution.status = WorkflowExecutionStatus.RUNNING.value
        if not execution.started_at:
            execution.started_at = datetime.now(timezone.utc)
        db.commit()

        try:
            # Import executor here to avoid circular imports
            from aexy.services.workflow_execution_service import (
                SyncWorkflowExecutor,
            )

            executor = SyncWorkflowExecutor(db)
            result = executor.execute(
                execution=execution,
                workflow=workflow,
                record_data=record_data,
            )

            return result

        except Exception as e:
            logger.exception(f"Workflow execution failed: {execution_id}")
            execution.status = WorkflowExecutionStatus.FAILED.value
            execution.error = str(e)
            execution.completed_at = datetime.now(timezone.utc)
            db.commit()

            # Retry on transient errors
            if "timeout" in str(e).lower() or "connection" in str(e).lower():
                raise self.retry(exc=e)

            return {"status": "error", "message": str(e)}


@shared_task(
    name="aexy.processing.workflow_tasks.resume_workflow_task",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def resume_workflow_task(
    self,
    execution_id: str,
) -> dict:
    """
    Resume a paused workflow execution.

    Args:
        execution_id: The workflow execution ID to resume

    Returns:
        Dict with execution result
    """
    logger.info(f"Resuming workflow execution: {execution_id}")

    with get_sync_session() as db:
        execution = db.execute(
            select(WorkflowExecution).where(WorkflowExecution.id == execution_id)
        ).scalar_one_or_none()

        if not execution:
            logger.error(f"Execution not found: {execution_id}")
            return {"status": "error", "message": "Execution not found"}

        # Only resume paused executions
        if execution.status != WorkflowExecutionStatus.PAUSED.value:
            logger.info(f"Execution {execution_id} is not paused (status: {execution.status})")
            return {"status": "skipped", "message": f"Execution is {execution.status}"}

        # Clear wait state
        execution.resume_at = None
        execution.wait_event_type = None
        execution.wait_timeout_at = None
        execution.paused_at = None
        db.commit()

    # Delegate to execute task
    return execute_workflow_task(execution_id)


@shared_task(name="aexy.processing.workflow_tasks.check_paused_workflows")
def check_paused_workflows() -> dict:
    """
    Periodic task to check for workflows that need to be resumed.

    This task runs every minute and checks for:
    1. Workflows paused with a resume_at time that has passed
    2. Workflows waiting for events that have timed out

    Returns:
        Dict with count of resumed workflows
    """
    logger.info("Checking for paused workflows to resume")

    now = datetime.now(timezone.utc)
    resumed_count = 0
    timed_out_count = 0

    with get_sync_session() as db:
        # Find workflows ready to resume (duration/datetime waits)
        ready_to_resume = db.execute(
            select(WorkflowExecution).where(
                and_(
                    WorkflowExecution.status == WorkflowExecutionStatus.PAUSED.value,
                    WorkflowExecution.resume_at <= now,
                    WorkflowExecution.resume_at.isnot(None),
                )
            )
        ).scalars().all()

        for execution in ready_to_resume:
            logger.info(f"Resuming workflow {execution.id} (scheduled for {execution.resume_at})")
            resume_workflow_task.delay(execution.id)
            resumed_count += 1

        # Find workflows waiting for events that have timed out
        timed_out = db.execute(
            select(WorkflowExecution).where(
                and_(
                    WorkflowExecution.status == WorkflowExecutionStatus.PAUSED.value,
                    WorkflowExecution.wait_event_type.isnot(None),
                    WorkflowExecution.wait_timeout_at <= now,
                    WorkflowExecution.wait_timeout_at.isnot(None),
                )
            )
        ).scalars().all()

        for execution in timed_out:
            logger.info(f"Workflow {execution.id} timed out waiting for {execution.wait_event_type}")
            # Mark as failed due to timeout
            execution.status = WorkflowExecutionStatus.FAILED.value
            execution.error = f"Timeout waiting for event: {execution.wait_event_type}"
            execution.completed_at = now
            timed_out_count += 1

        if timed_out:
            db.commit()

    logger.info(f"Resumed {resumed_count} workflows, timed out {timed_out_count} workflows")

    return {
        "resumed": resumed_count,
        "timed_out": timed_out_count,
    }


@shared_task(name="aexy.processing.workflow_tasks.handle_workflow_event")
def handle_workflow_event(
    event_type: str,
    event_data: dict,
) -> dict:
    """
    Handle an external event that may resume waiting workflows.

    Args:
        event_type: Type of event (e.g., 'email.opened', 'form.submitted')
        event_data: Event data for matching (e.g., {'email_id': '...', 'record_id': '...'})

    Returns:
        Dict with count of resumed workflows
    """
    logger.info(f"Handling workflow event: {event_type}")

    resumed_count = 0

    with get_sync_session() as db:
        # Find workflows waiting for this event type
        waiting_executions = db.execute(
            select(WorkflowExecution).where(
                and_(
                    WorkflowExecution.status == WorkflowExecutionStatus.PAUSED.value,
                    WorkflowExecution.wait_event_type == event_type,
                )
            )
        ).scalars().all()

        for execution in waiting_executions:
            # Check if event matches this execution's context
            # Match by record_id if present
            if "record_id" in event_data and execution.record_id:
                if event_data["record_id"] != execution.record_id:
                    continue

            # Match by workspace_id if present
            context = execution.context or {}
            if "workspace_id" in event_data and context.get("workspace_id"):
                if event_data["workspace_id"] != context.get("workspace_id"):
                    continue

            logger.info(f"Event {event_type} matched execution {execution.id}")

            # Update context with event data
            execution.context = {
                **context,
                "event_data": event_data,
                "event_type": event_type,
                "event_received_at": datetime.now(timezone.utc).isoformat(),
            }
            db.commit()

            # Resume the workflow
            resume_workflow_task.delay(execution.id)
            resumed_count += 1

    logger.info(f"Event {event_type} resumed {resumed_count} workflows")

    return {"resumed": resumed_count}


@shared_task(name="aexy.processing.workflow_tasks.cancel_workflow_task")
def cancel_workflow_task(execution_id: str) -> dict:
    """
    Cancel a running or paused workflow execution.

    Args:
        execution_id: The workflow execution ID to cancel

    Returns:
        Dict with cancellation result
    """
    logger.info(f"Cancelling workflow execution: {execution_id}")

    with get_sync_session() as db:
        execution = db.execute(
            select(WorkflowExecution).where(WorkflowExecution.id == execution_id)
        ).scalar_one_or_none()

        if not execution:
            return {"status": "error", "message": "Execution not found"}

        if execution.status in [
            WorkflowExecutionStatus.COMPLETED.value,
            WorkflowExecutionStatus.FAILED.value,
            WorkflowExecutionStatus.CANCELLED.value,
        ]:
            return {"status": "skipped", "message": f"Execution already {execution.status}"}

        execution.status = WorkflowExecutionStatus.CANCELLED.value
        execution.completed_at = datetime.now(timezone.utc)
        execution.error = "Cancelled by user"
        db.commit()

        return {"status": "cancelled"}


@shared_task(name="aexy.processing.workflow_tasks.check_event_subscription_timeouts")
def check_event_subscription_timeouts() -> dict:
    """
    Periodic task to check for event subscriptions that have timed out.

    This task runs every minute and handles subscriptions that have exceeded
    their timeout period without receiving a matching event.

    Returns:
        Dict with count of timed out subscriptions
    """
    logger.info("Checking for timed out event subscriptions")

    with get_sync_session() as db:
        from aexy.services.workflow_event_service import SyncWorkflowEventService

        event_service = SyncWorkflowEventService(db)
        count = event_service.check_timed_out_subscriptions()

    logger.info(f"Handled {count} timed out event subscriptions")

    return {"timed_out": count}


@shared_task(name="aexy.processing.workflow_tasks.process_workflow_retries")
def process_workflow_retries() -> dict:
    """
    Periodic task to process workflow steps that are scheduled for retry.

    This task runs every minute and processes steps that have reached
    their next_retry_at time.

    Returns:
        Dict with count of retried steps
    """
    logger.info("Processing workflow retries")

    retried_count = 0
    failed_count = 0

    with get_sync_session() as db:
        from aexy.services.workflow_retry_service import SyncWorkflowRetryService

        retry_service = SyncWorkflowRetryService(db)
        steps_to_retry = retry_service.get_steps_ready_for_retry()

        for step, execution in steps_to_retry:
            logger.info(f"Retrying step {step.node_id} (attempt {step.retry_count}) for execution {execution.id}")

            # Clear retry state and mark as running
            step.status = WorkflowStepStatus.RUNNING.value
            step.next_retry_at = None
            step.error = None
            db.commit()

            # Re-execute the workflow from this step
            execute_workflow_task.delay(execution.id)
            retried_count += 1

    logger.info(f"Processed {retried_count} retries, {failed_count} permanently failed")

    return {"retried": retried_count, "failed": failed_count}


@shared_task(name="aexy.processing.workflow_tasks.cleanup_old_executions")
def cleanup_old_executions(days: int = 30) -> dict:
    """
    Cleanup old workflow executions to prevent database bloat.

    Args:
        days: Number of days to keep executions (default 30)

    Returns:
        Dict with cleanup results
    """
    logger.info(f"Cleaning up workflow executions older than {days} days")

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    with get_sync_session() as db:
        # Delete old completed/failed/cancelled executions
        result = db.execute(
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
        ).scalars().all()

        count = len(result)
        for execution in result:
            db.delete(execution)

        db.commit()

    logger.info(f"Deleted {count} old workflow executions")

    return {"deleted": count}
