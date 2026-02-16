"""Temporal activities for GitHub synchronization.

Replaces: aexy.processing.sync_tasks
Reuses: _sync_repository, _sync_commits_standalone async implementations.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)

# Frequency string to timedelta mapping
FREQUENCY_MAP = {
    "30m": timedelta(minutes=30),
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "12h": timedelta(hours=12),
    "24h": timedelta(hours=24),
}


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


@dataclass
class CheckRepoAutoSyncInput:
    """Input for the periodic auto-sync check activity."""

    pass


@activity.defn
async def check_repo_auto_sync(input: CheckRepoAutoSyncInput) -> dict[str, Any]:
    """Check developers with auto-sync enabled and trigger incremental syncs.

    Runs periodically via Temporal schedule. For each developer with auto-sync
    enabled, checks which repos are due for sync based on their configured
    frequency and last_sync_at timestamp.
    """
    logger.info("Checking for repositories that need auto-sync")

    from sqlalchemy import and_, select

    from aexy.models.developer import Developer
    from aexy.models.repository import DeveloperRepository
    from aexy.temporal.dispatch import dispatch

    now = datetime.now(timezone.utc)
    syncs_triggered = 0

    async with async_session_maker() as db:
        # Find all developers with auto-sync enabled
        result = await db.execute(
            select(Developer).where(
                Developer.repo_sync_settings.isnot(None),
            )
        )
        developers = result.scalars().all()

        for developer in developers:
            settings = developer.repo_sync_settings or {}
            if not settings.get("enabled"):
                continue

            frequency = settings.get("frequency", "1h")
            interval = FREQUENCY_MAP.get(frequency, timedelta(hours=1))

            # Get enabled repos for this developer
            repos_result = await db.execute(
                select(DeveloperRepository).where(
                    and_(
                        DeveloperRepository.developer_id == developer.id,
                        DeveloperRepository.is_enabled == True,
                        DeveloperRepository.sync_status != "syncing",
                    )
                )
            )
            dev_repos = repos_result.scalars().all()

            for dev_repo in dev_repos:
                # Skip if synced recently within the configured interval
                if dev_repo.last_sync_at and now < dev_repo.last_sync_at + interval:
                    continue

                # Dispatch incremental sync via Temporal
                try:
                    await dispatch(
                        "sync_repository",
                        SyncRepositoryInput(
                            repository_id=dev_repo.repository_id,
                            developer_id=developer.id,
                        ),
                    )
                    syncs_triggered += 1
                    logger.info(
                        f"Auto-sync triggered for repo {dev_repo.repository_id} "
                        f"(developer {developer.id})"
                    )
                except Exception:
                    logger.exception(
                        f"Failed to dispatch auto-sync for repo {dev_repo.repository_id}"
                    )

    logger.info(f"Auto-sync check complete: {syncs_triggered} syncs triggered")
    return {"syncs_triggered": syncs_triggered}
