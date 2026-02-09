"""Maintenance and cleanup workflows."""

import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy

logger = logging.getLogger(__name__)


@dataclass
class CleanupWorkflowInput:
    days: int = 30


@workflow.defn
class CleanupWorkflow:
    """Workflow for periodic cleanup tasks."""

    @workflow.run
    async def run(self, input: CleanupWorkflowInput) -> dict[str, Any]:
        from aexy.temporal.activities.workflow_actions import CleanupOldExecutionsInput

        return await workflow.execute_activity(
            "cleanup_old_executions",
            CleanupOldExecutionsInput(days=input.days),
            start_to_close_timeout=timedelta(minutes=30),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )
