"""Analysis workflows for batch processing."""

import logging
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy

logger = logging.getLogger(__name__)


@dataclass
class BatchProfileSyncInput:
    pass


@workflow.defn
class BatchProfileSyncWorkflow:
    """Workflow for nightly batch profile sync.

    Orchestrates syncing and analyzing all developer profiles.
    """

    @workflow.run
    async def run(self, input: BatchProfileSyncInput) -> dict[str, Any]:
        from aexy.temporal.activities.analysis import BatchProfileSyncInput as ActivityInput

        return await workflow.execute_activity(
            "batch_profile_sync",
            ActivityInput(),
            start_to_close_timeout=timedelta(hours=2),
            heartbeat_timeout=timedelta(minutes=5),
            retry_policy=RetryPolicy(
                initial_interval=timedelta(seconds=60),
                maximum_attempts=3,
            ),
        )
