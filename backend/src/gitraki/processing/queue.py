"""Processing queue management."""

import logging
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class ProcessingMode(str, Enum):
    """Processing modes for LLM analysis."""

    REAL_TIME = "real_time"
    BATCH = "batch"
    ON_DEMAND = "on_demand"


class AnalysisJob(BaseModel):
    """Represents an analysis job in the queue."""

    job_id: str
    developer_id: str
    activity_type: str  # commit, pr, review
    activity_id: str
    mode: ProcessingMode
    priority: int = Field(default=0, ge=0, le=10)
    retry_count: int = Field(default=0)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProcessingQueue:
    """Queue manager for LLM analysis jobs."""

    def __init__(self, mode: ProcessingMode = ProcessingMode.BATCH) -> None:
        """Initialize the queue.

        Args:
            mode: Default processing mode.
        """
        self.default_mode = mode
        self._pending_jobs: list[AnalysisJob] = []

    def enqueue_commit_analysis(
        self,
        developer_id: str | UUID,
        commit_id: str | UUID,
        mode: ProcessingMode | None = None,
        priority: int = 0,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Queue a commit for LLM analysis.

        Args:
            developer_id: Developer ID.
            commit_id: Commit ID.
            mode: Processing mode override.
            priority: Job priority (0-10).
            metadata: Additional metadata.

        Returns:
            Task ID.
        """
        from gitraki.processing.tasks import analyze_commit_task

        effective_mode = mode or self.default_mode

        if effective_mode == ProcessingMode.REAL_TIME:
            # Execute immediately
            result = analyze_commit_task.delay(
                str(developer_id),
                str(commit_id),
            )
            logger.info(f"Queued real-time commit analysis: {result.id}")
            return result.id

        elif effective_mode == ProcessingMode.BATCH:
            # Add to batch queue (will be processed by scheduler)
            job = AnalysisJob(
                job_id=f"commit-{commit_id}",
                developer_id=str(developer_id),
                activity_type="commit",
                activity_id=str(commit_id),
                mode=effective_mode,
                priority=priority,
                metadata=metadata or {},
            )
            self._pending_jobs.append(job)
            logger.debug(f"Added commit to batch queue: {job.job_id}")
            return job.job_id

        else:
            # On-demand - don't queue, return placeholder
            return f"on-demand-commit-{commit_id}"

    def enqueue_pr_analysis(
        self,
        developer_id: str | UUID,
        pr_id: str | UUID,
        mode: ProcessingMode | None = None,
        priority: int = 0,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Queue a PR for LLM analysis.

        Args:
            developer_id: Developer ID.
            pr_id: Pull request ID.
            mode: Processing mode override.
            priority: Job priority.
            metadata: Additional metadata.

        Returns:
            Task ID.
        """
        from gitraki.processing.tasks import analyze_pr_task

        effective_mode = mode or self.default_mode

        if effective_mode == ProcessingMode.REAL_TIME:
            result = analyze_pr_task.delay(
                str(developer_id),
                str(pr_id),
            )
            logger.info(f"Queued real-time PR analysis: {result.id}")
            return result.id

        elif effective_mode == ProcessingMode.BATCH:
            job = AnalysisJob(
                job_id=f"pr-{pr_id}",
                developer_id=str(developer_id),
                activity_type="pr",
                activity_id=str(pr_id),
                mode=effective_mode,
                priority=priority,
                metadata=metadata or {},
            )
            self._pending_jobs.append(job)
            logger.debug(f"Added PR to batch queue: {job.job_id}")
            return job.job_id

        else:
            return f"on-demand-pr-{pr_id}"

    def enqueue_developer_refresh(
        self,
        developer_id: str | UUID,
        mode: ProcessingMode | None = None,
        priority: int = 5,
    ) -> str:
        """Queue a full developer profile refresh.

        Args:
            developer_id: Developer ID.
            mode: Processing mode override.
            priority: Job priority (default higher for refresh).

        Returns:
            Task ID.
        """
        from gitraki.processing.tasks import analyze_developer_task

        effective_mode = mode or self.default_mode

        if effective_mode in (ProcessingMode.REAL_TIME, ProcessingMode.ON_DEMAND):
            result = analyze_developer_task.delay(str(developer_id))
            logger.info(f"Queued developer analysis: {result.id}")
            return result.id

        else:
            job = AnalysisJob(
                job_id=f"developer-{developer_id}",
                developer_id=str(developer_id),
                activity_type="developer",
                activity_id=str(developer_id),
                mode=effective_mode,
                priority=priority,
            )
            self._pending_jobs.append(job)
            return job.job_id

    def get_pending_jobs(self) -> list[AnalysisJob]:
        """Get all pending batch jobs.

        Returns:
            List of pending jobs.
        """
        return sorted(self._pending_jobs, key=lambda j: -j.priority)

    def clear_pending(self) -> int:
        """Clear all pending batch jobs.

        Returns:
            Number of jobs cleared.
        """
        count = len(self._pending_jobs)
        self._pending_jobs.clear()
        return count

    def process_batch(self) -> list[str]:
        """Process all pending batch jobs.

        Returns:
            List of task IDs.
        """
        from gitraki.processing.tasks import (
            analyze_commit_task,
            analyze_developer_task,
            analyze_pr_task,
        )

        task_ids = []
        jobs = self.get_pending_jobs()

        for job in jobs:
            try:
                if job.activity_type == "commit":
                    result = analyze_commit_task.delay(
                        job.developer_id,
                        job.activity_id,
                    )
                elif job.activity_type == "pr":
                    result = analyze_pr_task.delay(
                        job.developer_id,
                        job.activity_id,
                    )
                elif job.activity_type == "developer":
                    result = analyze_developer_task.delay(job.developer_id)
                else:
                    continue

                task_ids.append(result.id)

            except Exception as e:
                logger.error(f"Failed to process job {job.job_id}: {e}")

        self.clear_pending()
        return task_ids


# Singleton queue instance
_processing_queue: ProcessingQueue | None = None


def get_processing_queue() -> ProcessingQueue:
    """Get the processing queue singleton.

    Returns:
        Processing queue instance.
    """
    global _processing_queue

    if _processing_queue is None:
        settings = get_settings()
        mode = ProcessingMode(settings.llm.processing_mode.value)
        _processing_queue = ProcessingQueue(mode=mode)

    return _processing_queue


def get_settings():
    """Import settings lazily to avoid circular imports."""
    from gitraki.core.config import get_settings as _get_settings
    return _get_settings()
