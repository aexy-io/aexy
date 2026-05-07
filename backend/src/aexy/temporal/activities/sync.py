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

    from aexy.services.github_service import GitHubAuthError, GitHubNotFoundError
    from aexy.services.sync_service import SyncService

    async with async_session_maker() as db:
        service = SyncService(db)
        try:
            result = await service.sync_repository(
                developer_id=input.developer_id,
                repository_id=input.repository_id,
                heartbeat_fn=activity.heartbeat,
            )
            await db.commit()
            return result
        except (GitHubAuthError, GitHubNotFoundError):
            # Commit the status/error changes made by SyncService
            try:
                await db.commit()
            except Exception:
                await db.rollback()
            raise
        except Exception:
            # Commit any status changes (e.g. sync_status=failed).
            # If the session is poisoned by an IntegrityError, rollback instead.
            try:
                await db.commit()
            except Exception:
                await db.rollback()
            raise


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

    from aexy.models.developer import Developer, GitHubConnection
    from aexy.models.repository import WorkspaceRepository
    from aexy.temporal.dispatch import dispatch

    now = datetime.now(timezone.utc)
    syncs_triggered = 0
    skipped_auth = 0

    async with async_session_maker() as db:
        # Walk every active workspace_repository. Sync uses the
        # adopter's installation token; if their auth is broken the
        # workspace_repository's sync_status flips to no_credentials so
        # the catalog UI can prompt a reclaim.
        wrs_stmt = (
            select(WorkspaceRepository)
            .where(
                WorkspaceRepository.is_active == True,  # noqa: E712
                WorkspaceRepository.sync_status != "syncing",
                WorkspaceRepository.adopted_by_developer_id.is_not(None),
            )
        )
        wrs = (await db.execute(wrs_stmt)).scalars().all()

        for wr in wrs:
            adopter_id = wr.adopted_by_developer_id
            if not adopter_id:
                continue

            developer = await db.get(Developer, adopter_id)
            if not developer:
                continue

            settings = developer.repo_sync_settings or {}
            if not settings.get("enabled"):
                # Adopter hasn't opted into auto-sync; skip silently.
                continue

            conn_result = await db.execute(
                select(GitHubConnection).where(
                    GitHubConnection.developer_id == developer.id
                )
            )
            connection = conn_result.scalar_one_or_none()
            if not connection or connection.auth_status == "error":
                skipped_auth += 1
                wr.sync_status = "no_credentials"
                continue

            frequency = settings.get("frequency", "1h")
            interval = FREQUENCY_MAP.get(frequency, timedelta(hours=1))

            if wr.last_sync_at and now < wr.last_sync_at + interval:
                continue

            try:
                await dispatch(
                    "sync_repository",
                    SyncRepositoryInput(
                        repository_id=wr.repository_id,
                        developer_id=str(developer.id),
                    ),
                )
                syncs_triggered += 1
                logger.info(
                    f"Auto-sync triggered for workspace_repository {wr.id} "
                    f"(repo {wr.repository_id}, adopter {developer.id})"
                )
            except Exception:
                logger.exception(
                    f"Failed to dispatch auto-sync for workspace_repository {wr.id}"
                )

    if skipped_auth:
        logger.warning(f"Auto-sync skipped {skipped_auth} developers with broken GitHub auth")

    logger.info(f"Auto-sync check complete: {syncs_triggered} syncs triggered")
    return {"syncs_triggered": syncs_triggered}
