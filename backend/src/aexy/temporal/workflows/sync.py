"""Sync workflows for GitHub and Google integration."""

import logging
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy

logger = logging.getLogger(__name__)


@dataclass
class SyncRepositoryWorkflowInput:
    repository_id: str
    developer_id: str
    installation_id: int | None = None


@dataclass
class SyncGmailWorkflowInput:
    job_id: str
    workspace_id: str
    integration_id: str
    max_messages: int = 500


@workflow.defn
class SyncRepositoryWorkflow:
    """Workflow for syncing a GitHub repository."""

    @workflow.run
    async def run(self, input: SyncRepositoryWorkflowInput) -> dict[str, Any]:
        from aexy.temporal.activities.sync import SyncRepositoryInput

        return await workflow.execute_activity(
            "sync_repository",
            SyncRepositoryInput(
                repository_id=input.repository_id,
                developer_id=input.developer_id,
                installation_id=input.installation_id,
            ),
            start_to_close_timeout=timedelta(hours=2),
            heartbeat_timeout=timedelta(minutes=5),
            retry_policy=RetryPolicy(
                initial_interval=timedelta(seconds=60),
                maximum_attempts=4,
            ),
        )


@workflow.defn
class SyncGmailWorkflow:
    """Workflow for syncing Gmail messages."""

    @workflow.run
    async def run(self, input: SyncGmailWorkflowInput) -> dict[str, Any]:
        from aexy.temporal.activities.google_sync import SyncGmailInput

        return await workflow.execute_activity(
            "sync_gmail",
            SyncGmailInput(
                job_id=input.job_id,
                workspace_id=input.workspace_id,
                integration_id=input.integration_id,
                max_messages=input.max_messages,
            ),
            start_to_close_timeout=timedelta(minutes=30),
            heartbeat_timeout=timedelta(minutes=5),
            retry_policy=RetryPolicy(
                initial_interval=timedelta(seconds=60),
                maximum_attempts=4,
            ),
        )
