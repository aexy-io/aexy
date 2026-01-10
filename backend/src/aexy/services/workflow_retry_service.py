"""Workflow retry service for handling transient failures."""

from datetime import datetime, timezone, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from aexy.models.workflow import (
    WorkflowExecution,
    WorkflowExecutionStep,
    WorkflowDefinition,
    WorkflowDeadLetter,
    WorkflowStepStatus,
    WorkflowExecutionStatus,
    DEFAULT_RETRY_CONFIG,
    RETRYABLE_ERROR_TYPES,
)


def classify_error(error_message: str) -> str | None:
    """
    Classify an error message into a retryable error type.

    Returns the error type if retryable, None otherwise.
    """
    if not error_message:
        return None

    error_lower = error_message.lower()

    for error_type, patterns in RETRYABLE_ERROR_TYPES.items():
        for pattern in patterns:
            if pattern in error_lower:
                return error_type

    return None


def is_retryable_error(error_message: str, retry_config: dict[str, Any]) -> bool:
    """Check if an error is retryable based on configuration."""
    error_type = classify_error(error_message)
    if not error_type:
        return False

    retryable_types = retry_config.get("retryable_errors", DEFAULT_RETRY_CONFIG["retryable_errors"])
    return error_type in retryable_types


def calculate_retry_delay(
    retry_count: int,
    retry_config: dict[str, Any],
) -> int:
    """
    Calculate the delay in seconds before the next retry using exponential backoff.

    Returns the delay in seconds.
    """
    initial_delay = retry_config.get("initial_delay_seconds", DEFAULT_RETRY_CONFIG["initial_delay_seconds"])
    backoff_multiplier = retry_config.get("backoff_multiplier", DEFAULT_RETRY_CONFIG["backoff_multiplier"])
    max_delay = retry_config.get("max_delay_seconds", DEFAULT_RETRY_CONFIG["max_delay_seconds"])

    # Exponential backoff: initial * (multiplier ^ retry_count)
    delay = initial_delay * (backoff_multiplier ** retry_count)

    # Cap at max delay
    return min(int(delay), max_delay)


def should_retry(
    step: WorkflowExecutionStep,
    retry_config: dict[str, Any],
) -> bool:
    """
    Determine if a step should be retried.

    Returns True if the step should be retried, False otherwise.
    """
    # Check if error is retryable
    if not step.error:
        return False

    if not is_retryable_error(step.error, retry_config):
        return False

    # Check retry count
    max_retries = retry_config.get("max_retries", DEFAULT_RETRY_CONFIG["max_retries"])
    if step.retry_count >= max_retries:
        return False

    return True


class SyncWorkflowRetryService:
    """Synchronous service for workflow retry operations."""

    def __init__(self, db: Session):
        self.db = db

    def schedule_retry(
        self,
        step: WorkflowExecutionStep,
        execution: WorkflowExecution,
        retry_config: dict[str, Any],
    ) -> WorkflowExecutionStep:
        """
        Schedule a step for retry.

        Updates the step with retry information and returns the updated step.
        """
        # Classify the error
        error_type = classify_error(step.error or "")

        # Calculate delay
        delay = calculate_retry_delay(step.retry_count, retry_config)
        next_retry_at = datetime.now(timezone.utc) + timedelta(seconds=delay)

        # Update step
        step.status = WorkflowStepStatus.RETRYING.value
        step.error_type = error_type
        step.retry_count += 1
        step.max_retries = retry_config.get("max_retries", DEFAULT_RETRY_CONFIG["max_retries"])
        step.next_retry_at = next_retry_at

        # Update execution status
        execution.status = WorkflowExecutionStatus.PAUSED.value
        execution.paused_at = datetime.now(timezone.utc)
        execution.current_node_id = step.node_id

        self.db.commit()

        return step

    def send_to_dead_letter(
        self,
        step: WorkflowExecutionStep,
        execution: WorkflowExecution,
        input_data: dict[str, Any] | None = None,
    ) -> WorkflowDeadLetter:
        """
        Send a failed step to the dead letter queue.

        Creates a dead letter entry and returns it.
        """
        error_type = classify_error(step.error or "") or "unknown"

        dead_letter = WorkflowDeadLetter(
            id=str(uuid4()),
            execution_id=execution.id,
            step_id=step.id,
            workspace_id=execution.workspace_id,
            automation_id=execution.automation_id,
            error_type=error_type,
            error_message=step.error or "Unknown error",
            node_id=step.node_id,
            node_type=step.node_type,
            input_data=input_data,
            execution_context=execution.context,
            status="pending",
        )

        self.db.add(dead_letter)

        # Mark step as permanently failed
        step.status = WorkflowStepStatus.FAILED.value

        # Mark execution as failed
        execution.status = WorkflowExecutionStatus.FAILED.value
        execution.completed_at = datetime.now(timezone.utc)
        execution.error = step.error
        execution.error_node_id = step.node_id

        self.db.commit()

        return dead_letter

    def get_steps_ready_for_retry(self) -> list[tuple[WorkflowExecutionStep, WorkflowExecution]]:
        """
        Get all steps that are ready to be retried.

        Returns a list of (step, execution) tuples.
        """
        now = datetime.now(timezone.utc)

        stmt = (
            select(WorkflowExecutionStep, WorkflowExecution)
            .join(WorkflowExecution)
            .where(
                WorkflowExecutionStep.status == WorkflowStepStatus.RETRYING.value,
                WorkflowExecutionStep.next_retry_at <= now,
            )
        )

        result = self.db.execute(stmt)
        return list(result.all())

    def resolve_dead_letter(
        self,
        dead_letter_id: str,
        resolved_by: str,
        resolution: str = "resolved",
        notes: str | None = None,
    ) -> WorkflowDeadLetter | None:
        """
        Resolve a dead letter entry.

        Returns the updated dead letter entry or None if not found.
        """
        stmt = select(WorkflowDeadLetter).where(WorkflowDeadLetter.id == dead_letter_id)
        result = self.db.execute(stmt)
        dead_letter = result.scalar_one_or_none()

        if not dead_letter:
            return None

        dead_letter.status = resolution
        dead_letter.resolved_at = datetime.now(timezone.utc)
        dead_letter.resolved_by = resolved_by
        dead_letter.resolution_notes = notes

        self.db.commit()

        return dead_letter

    def get_dead_letters(
        self,
        workspace_id: str,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[WorkflowDeadLetter]:
        """Get dead letter entries for a workspace."""
        stmt = select(WorkflowDeadLetter).where(
            WorkflowDeadLetter.workspace_id == workspace_id
        )

        if status:
            stmt = stmt.where(WorkflowDeadLetter.status == status)

        stmt = stmt.order_by(WorkflowDeadLetter.created_at.desc())
        stmt = stmt.offset(offset).limit(limit)

        result = self.db.execute(stmt)
        return list(result.scalars().all())
