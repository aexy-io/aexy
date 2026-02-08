"""Temporal activities for GitHub synchronization.

Replaces: aexy.processing.sync_tasks
Reuses: _sync_repository, _sync_commits_standalone async implementations.
"""

import logging
from dataclasses import dataclass
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class SyncRepositoryInput:
    repository_id: str
    developer_id: str
    installation_id: int | None = None


@dataclass
class SyncCommitsInput:
    repository_id: str
    developer_id: str
    since: str | None = None
    until: str | None = None


@activity.defn
async def sync_repository(input: SyncRepositoryInput) -> dict[str, Any]:
    """Sync a repository's commits, PRs, and reviews."""
    logger.info(f"Syncing repository {input.repository_id}")
    activity.heartbeat("Starting repository sync")

    from aexy.services.sync_service import SyncService

    async with async_session_maker() as db:
        service = SyncService(db)
        result = await service.sync_repository(
            repository_id=input.repository_id,
            developer_id=input.developer_id,
            installation_id=input.installation_id,
            heartbeat_fn=activity.heartbeat,
        )
        await db.commit()
        return result


@activity.defn
async def sync_commits(input: SyncCommitsInput) -> dict[str, Any]:
    """Sync commits for a repository."""
    logger.info(f"Syncing commits for repository {input.repository_id}")
    activity.heartbeat("Starting commit sync")

    from aexy.services.sync_service import SyncService

    async with async_session_maker() as db:
        service = SyncService(db)
        result = await service.sync_commits(
            repository_id=input.repository_id,
            developer_id=input.developer_id,
            since=input.since,
            until=input.until,
        )
        await db.commit()
        return result
