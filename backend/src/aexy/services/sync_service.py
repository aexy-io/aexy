"""Sync service for historical data synchronization and webhook management."""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.core.config import get_settings
from aexy.core.database import async_session_maker
from aexy.models.activity import CodeReview, Commit, PullRequest
from aexy.models.developer import Developer, GitHubConnection, GitHubInstallation
from aexy.models.repository import DeveloperRepository, Repository, WorkspaceRepository
from aexy.services.github_service import GitHubAPIError, GitHubAuthError, GitHubNotFoundError, GitHubService
from aexy.services.sync_enrichment import (
    build_patch_sample,
    classify_author,
    classify_change,
    content_hash,
    is_merge_commit,
    is_revert_commit,
    size_bucket,
    source_churn,
)

logger = logging.getLogger(__name__)
settings = get_settings()

# Sync mode types
SyncMode = Literal["async", "temporal"]
SyncType = Literal["full", "incremental"]


def _github_ts(value: str | None) -> datetime | None:
    """Parse a GitHub ISO-8601 timestamp. None in, None out."""
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def adopted_workspace_rows(
    db: AsyncSession, developer_id: str, repository_id: str
) -> list[WorkspaceRepository]:
    """Workspace catalog rows a sync of (repo, developer) speaks for.

    The scheduler dispatches one sync per `workspace_repositories` row and
    drives it with the adopter's token, so a completed sync answers for every
    row this developer adopted this repo into — usually one, more when two
    workspaces named the same adopter.
    """
    result = await db.execute(
        select(WorkspaceRepository).where(
            WorkspaceRepository.repository_id == repository_id,
            WorkspaceRepository.adopted_by_developer_id == developer_id,
        )
    )
    return list(result.scalars().all())


def record_workspace_sync_state(
    rows: list[WorkspaceRepository],
    *,
    status: str,
    error: str | None = None,
    synced_at: datetime | None = None,
    counts: dict[str, int] | None = None,
) -> None:
    """Advance the workspace catalog row's own sync state.

    `check_repo_auto_sync` throttles on `WorkspaceRepository.last_sync_at` and
    skips rows already `syncing` — but every sync path wrote its state to
    `DeveloperRepository` instead, so those two columns never moved off their
    adoption defaults. `last_sync_at` stayed NULL, the frequency check behind
    it never fired, and each 5-minute tick re-dispatched every eligible repo
    whatever the adopter had chosen; the in-flight skip never matched either.
    The API had already worked around the stale row by overlaying the adopter's
    `DeveloperRepository` values onto the response, so the catalog page looked
    right while the scheduler read columns nobody wrote.

    Kept separate from `SyncService` so a test can call the writer the sync
    actually uses rather than restate it.
    """
    for row in rows:
        row.sync_status = status
        row.sync_error = error
        if synced_at is not None:
            row.last_sync_at = synced_at
        if counts is not None:
            row.commits_synced = counts.get("commits", row.commits_synced)
            row.prs_synced = counts.get("prs", row.prs_synced)
            row.reviews_synced = counts.get("reviews", row.reviews_synced)


class SyncService:
    """Service for historical data sync and webhook management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def start_historical_sync(
        self,
        developer_id: str,
        repository_id: str,
        sync_type: SyncType = "incremental",
        use_background: bool = False,
    ) -> str:
        """
        Start historical sync for a repository.

        Args:
            developer_id: Developer ID.
            repository_id: Repository ID.
            sync_type: "full" or "incremental" sync.
            use_background: Use Temporal workflow instead of async background task.

        Returns job ID for tracking.
        """
        # Get developer repository
        stmt = (
            select(DeveloperRepository)
            .where(
                DeveloperRepository.developer_id == developer_id,
                DeveloperRepository.repository_id == repository_id,
            )
            .options(selectinload(DeveloperRepository.repository))
        )
        result = await self.db.execute(stmt)
        dev_repo = result.scalar_one_or_none()

        if not dev_repo:
            raise ValueError("Repository not found for this developer")

        # Note: per-developer is_enabled gate was removed in 0.7.72 —
        # adoption is now workspace-scoped and the auto-sync scheduler
        # only fires for adopted workspace_repositories. Manual callers
        # should hit /workspaces/{id}/repositories/.../sync instead.

        # Update sync status
        dev_repo.sync_status = "syncing"
        dev_repo.sync_error = None
        dev_repo.updated_at = datetime.now(timezone.utc)
        await self.db.commit()

        # Get access token
        stmt = select(GitHubConnection).where(GitHubConnection.developer_id == developer_id)
        result = await self.db.execute(stmt)
        connection = result.scalar_one_or_none()

        if not connection:
            raise ValueError("GitHub connection not found")

        job_id = str(uuid4())

        if use_background:
            # Use Temporal workflow for production workloads
            from aexy.temporal.dispatch import dispatch
            from aexy.temporal.task_queues import TaskQueue
            from aexy.temporal.activities.sync import SyncRepositoryInput

            workflow_id = await dispatch(
                "sync_repository",
                SyncRepositoryInput(
                    repository_id=repository_id,
                    developer_id=developer_id,
                ),
                task_queue=TaskQueue.SYNC,
            )
            return workflow_id
        else:
            # Start sync in background (async task)
            asyncio.create_task(
                self._run_sync(
                    developer_id=developer_id,
                    repository_id=repository_id,
                    access_token=connection.access_token,
                    job_id=job_id,
                    sync_type=sync_type,
                )
            )

            return job_id

    async def sync_repository(
        self,
        developer_id: str,
        repository_id: str,
        heartbeat_fn: Any = None,
    ) -> dict[str, Any]:
        """Sync a repository's commits, PRs, and reviews.

        This is the public entry point used by the Temporal activity.
        Fetches the access token and runs the full sync within self.db session.
        """
        # Get developer repo
        stmt = (
            select(DeveloperRepository)
            .where(
                DeveloperRepository.developer_id == developer_id,
                DeveloperRepository.repository_id == repository_id,
            )
            .options(selectinload(DeveloperRepository.repository))
        )
        result = await self.db.execute(stmt)
        dev_repo = result.scalar_one_or_none()

        if not dev_repo:
            # Adoption creates this row now, but rows adopted before that do
            # not have one, and it can be pruned later. It holds sync state
            # rather than permission, so make it and carry on — refusing here
            # only turned a missing bookkeeping row into a repo that never
            # syncs and never says why.
            dev_repo = await self._create_developer_repository(
                developer_id, repository_id
            )

        # Note: per-developer is_enabled gate was removed in 0.7.72 —
        # adoption is now workspace-scoped and the auto-sync scheduler
        # only fires for adopted workspace_repositories. Manual callers
        # should hit /workspaces/{id}/repositories/.../sync instead.

        # Get access token
        stmt = select(GitHubConnection).where(GitHubConnection.developer_id == developer_id)
        result = await self.db.execute(stmt)
        connection = result.scalar_one_or_none()

        if not connection:
            raise ValueError("GitHub connection not found")

        repo = dev_repo.repository
        owner, repo_name = repo.full_name.split("/")
        repo_language = repo.language if hasattr(repo, 'language') else None
        github_username = connection.github_username or developer_id

        # Mark as syncing before any work that could fail. The API entry point
        # (start_historical_sync) also pre-sets this, so we must ensure the
        # except handlers below flip it back to "failed" on any error — otherwise
        # the UI gets stuck on "syncing".
        dev_repo.sync_status = "syncing"
        dev_repo.sync_error = None
        # The workspace catalog rows carry the state the scheduler reads. They
        # are updated alongside dev_repo on every exit path below.
        workspace_rows = await adopted_workspace_rows(
            self.db, developer_id, repository_id
        )
        record_workspace_sync_state(workspace_rows, status="syncing")
        await self.db.flush()

        # Initialize developer lookup caches
        self._dev_cache_by_github_id: dict[int, str] = {}
        self._dev_cache_by_email: dict[str, str] = {}

        try:
            # Refresh token if expired (GitHub App tokens expire after ~8 hours).
            # Inside the try block so refresh failures flip sync_status to "failed".
            await self._ensure_valid_token(connection)

            logger.info(
                f"Starting sync for {repo.full_name} using token of @{github_username}"
            )

            if heartbeat_fn:
                heartbeat_fn("Fetching commits...")

            async with GitHubService(access_token=connection.access_token) as gh:
                commits_synced = await self._sync_commits_with_session(
                    self.db,
                    gh,
                    owner,
                    repo_name,
                    developer_id,
                    repository_id,
                    repo_language,
                    sync_branches=repo.sync_branches,
                    default_branch=repo.default_branch,
                    heartbeat_fn=heartbeat_fn,
                )

                if heartbeat_fn:
                    heartbeat_fn(f"Synced {commits_synced} commits, fetching PRs...")

                prs_synced = await self._sync_pull_requests_with_session(
                    self.db, gh, owner, repo_name, developer_id, repository_id,
                    heartbeat_fn=heartbeat_fn,
                )

                if heartbeat_fn:
                    heartbeat_fn(f"Synced {prs_synced} PRs, fetching reviews...")

                reviews_synced = await self._sync_reviews_with_session(
                    self.db, gh, owner, repo_name, developer_id, repository_id,
                    heartbeat_fn=heartbeat_fn,
                )

            # Update status
            synced_at = datetime.now(timezone.utc)
            dev_repo.sync_status = "synced"
            dev_repo.last_sync_at = synced_at
            dev_repo.commits_synced = commits_synced
            dev_repo.prs_synced = prs_synced
            dev_repo.reviews_synced = reviews_synced
            dev_repo.updated_at = synced_at
            record_workspace_sync_state(
                workspace_rows,
                status="synced",
                synced_at=synced_at,
                counts={
                    "commits": commits_synced,
                    "prs": prs_synced,
                    "reviews": reviews_synced,
                },
            )
            await self.db.flush()

            logger.info(
                f"Sync complete for {repo.full_name} (@{github_username}): "
                f"{commits_synced} commits, {prs_synced} PRs, {reviews_synced} reviews"
            )

            # Trigger profile sync
            try:
                from aexy.services.profile_sync import ProfileSyncService
                profile_sync = ProfileSyncService()
                await profile_sync.sync_developer_profile(developer_id, self.db)
                await self.db.flush()
                logger.info(f"Profile sync complete for developer {developer_id}")
            except Exception as profile_error:
                logger.warning(f"Profile sync failed: {profile_error}")

            # Fan out AI analysis for newly synced commits/PRs/reviews. Failures
            # here must not poison the sync — the worst case is the cursor
            # doesn't advance and the next sync re-enqueues.
            try:
                from aexy.temporal.activities.sync import EnqueueAIAnalysisInput
                from aexy.temporal.dispatch import dispatch
                from aexy.temporal.task_queues import TaskQueue

                await dispatch(
                    "enqueue_ai_analysis",
                    EnqueueAIAnalysisInput(repository_id=str(repository_id)),
                    task_queue=TaskQueue.SYNC,
                )
            except Exception as enqueue_error:
                logger.warning(
                    f"Failed to enqueue AI analysis for {repo.full_name}: {enqueue_error}"
                )

            return {
                "commits_synced": commits_synced,
                "prs_synced": prs_synced,
                "reviews_synced": reviews_synced,
                "repository": repo.full_name,
            }

        except GitHubAuthError as e:
            logger.error(f"GitHub auth failed for {repo.full_name} (@{github_username}): {e}")
            dev_repo.sync_status = "failed"
            dev_repo.sync_error = "GitHub authentication failed - please reconnect your GitHub account"
            dev_repo.updated_at = datetime.now(timezone.utc)
            # `no_credentials`, not `failed`: it is the state the scheduler
            # would set on its next pass anyway, and the one `reclaim_repository`
            # knows how to clear when somebody else lends their installation.
            record_workspace_sync_state(
                workspace_rows,
                status="no_credentials",
                error=dev_repo.sync_error,
            )
            # Mark the GitHub connection as broken (unless already marked by _ensure_valid_token)
            if connection.auth_status != "error":
                connection.auth_status = "error"
                connection.auth_error = "GitHub token is invalid or has been revoked. Please reconnect your GitHub account."
                # Only inside the guard: this is the active -> error edge, and
                # telling people is a thing to do once per breakage, not once
                # per failed sync of an account already known to be broken.
                await self._report_connection_broken(
                    self.db,
                    developer_id=developer_id,
                    github_username=connection.github_username,
                    reason="GitHub refused the saved credentials",
                )
            await self.db.flush()
            raise
        except GitHubNotFoundError as e:
            # Check if this is a GitHub App token with limited repo access
            sync_error = await self._get_not_found_error_message(
                connection, owner, repo_name, repo.full_name
            )
            logger.error(f"Repository not accessible: {repo.full_name} (@{github_username}): {e}")
            dev_repo.sync_status = "failed"
            dev_repo.sync_error = sync_error
            dev_repo.is_enabled = False
            dev_repo.updated_at = datetime.now(timezone.utc)
            record_workspace_sync_state(
                workspace_rows, status="failed", error=sync_error
            )
            logger.warning(f"Disabled auto-sync for inaccessible repo {repo.full_name}")
            await self.db.flush()
            raise
        except Exception as e:
            logger.error(f"Sync failed for {repo.full_name} (@{github_username}): {e}")
            dev_repo.sync_status = "failed"
            dev_repo.sync_error = str(e)
            dev_repo.updated_at = datetime.now(timezone.utc)
            record_workspace_sync_state(
                workspace_rows, status="failed", error=str(e)
            )
            await self.db.flush()
            raise

    async def _resolve_merger(
        self, db: AsyncSession, merged_by: dict, fallback_developer_id: str
    ) -> str | None:
        """Developer id for whoever merged, or None when that is a bot.

        `_resolve_developer_for_pr` invents a ghost developer for a login it
        doesn't know, which is right for an author — a human wrote that code
        and their work should land somewhere. For a merger it is wrong: a
        merge queue would become a person, and then a row in the contribution
        report crediting Mergify with half the team's integration load. The
        login is still stored, so the raw answer to "who merged this" survives.
        """
        login = merged_by.get("login")
        if not login or classify_author(login, None) == "bot":
            return None
        return await self._resolve_developer_for_pr(db, merged_by, fallback_developer_id)

    async def _create_developer_repository(
        self, developer_id: str, repository_id: str
    ) -> DeveloperRepository:
        """Create the per-developer sync-state row for a repo that exists.

        A missing *repository* is still an error — that is a bad id, not a
        gap in bookkeeping.
        """
        repository = await self.db.get(Repository, repository_id)
        if repository is None:
            raise ValueError(f"Repository {repository_id} not found")

        dev_repo = DeveloperRepository(
            id=str(uuid4()),
            developer_id=developer_id,
            repository_id=repository_id,
            is_enabled=True,
            sync_status="pending",
            webhook_status="none",
        )
        self.db.add(dev_repo)
        await self.db.flush()
        dev_repo.repository = repository
        logger.info(
            f"Created missing developer_repository for {repository.full_name} "
            f"/ developer {developer_id}"
        )
        return dev_repo

    async def _report_connection_broken(
        self,
        db: AsyncSession,
        *,
        developer_id: str,
        github_username: str | None,
        reason: str,
    ) -> None:
        """Announce a connection this sync just marked broken.

        Takes the session explicitly because the two callers do not share one:
        the refresh path holds its own transaction so it can lock the row.

        Swallows everything. A sync that already failed on auth must not fail a
        second time, or differently, because the notification did.
        """
        try:
            from aexy.services.integration_health import (
                notify_github_connection_broken,
            )

            await notify_github_connection_broken(
                db,
                developer_id=str(developer_id),
                github_username=github_username,
                reason=reason,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(
                "Could not report broken GitHub connection for %s: %s",
                developer_id,
                exc,
            )

    async def _ensure_valid_token(self, connection: GitHubConnection) -> None:
        """Refresh the GitHub token if it's expired or about to expire.

        GitHub App user-to-server tokens (ghu_) expire after ~8 hours.
        This method uses the stored refresh token to get a new access token.

        GitHub refresh tokens are single-use: once consumed, the old refresh
        token is invalidated. To avoid races when concurrent syncs run for the
        same developer (e.g. auto-sync fans out to many repos at once), the
        refresh runs in a dedicated transaction with row-level locking and
        double-checked expiry. Without this, only the first parallel sync wins
        and the others falsely mark the connection broken.
        """
        if not connection.token_expires_at or not connection.refresh_token:
            return  # No expiry info or no refresh token — nothing to do

        # Refresh if token expires within 5 minutes
        if connection.token_expires_at > datetime.now(timezone.utc) + timedelta(minutes=5):
            return  # Token still valid

        async with async_session_maker() as refresh_db:
            locked_stmt = (
                select(GitHubConnection)
                .where(GitHubConnection.id == connection.id)
                .with_for_update()
            )
            locked_conn = (await refresh_db.execute(locked_stmt)).scalar_one()

            # Another concurrent sync may have already refreshed while we waited
            # for the lock. Pick up its tokens instead of refreshing again.
            if (
                locked_conn.token_expires_at
                and locked_conn.token_expires_at
                > datetime.now(timezone.utc) + timedelta(minutes=5)
            ):
                connection.access_token = locked_conn.access_token
                connection.refresh_token = locked_conn.refresh_token
                connection.token_expires_at = locked_conn.token_expires_at
                connection.auth_status = locked_conn.auth_status
                connection.auth_error = locked_conn.auth_error
                await refresh_db.commit()
                return

            logger.info(
                f"Refreshing expired GitHub token for @{locked_conn.github_username}"
            )
            try:
                gh = GitHubService()
                refreshed = await gh.refresh_access_token(locked_conn.refresh_token)
            except GitHubAuthError as e:
                logger.error(
                    f"Failed to refresh GitHub token for @{locked_conn.github_username}: {e}"
                )
                # Guarded, and reported here rather than left to the caller:
                # this re-raises into the GitHubAuthError handler in
                # `sync_repository`, which finds the status already flipped and
                # so stays quiet. Without this the refresh-token path — the way
                # a connection most often dies, since these tokens expire every
                # eight hours — would never announce itself.
                first_failure = locked_conn.auth_status != "error"
                locked_conn.auth_status = "error"
                locked_conn.auth_error = (
                    "GitHub refresh token is invalid or expired. "
                    "Please reconnect your GitHub account."
                )
                await refresh_db.commit()
                # After the commit, not before: the notification writes rows of
                # its own, and this transaction holds a FOR UPDATE lock on the
                # connection that every concurrent sync of this developer is
                # queued behind.
                if first_failure:
                    await self._report_connection_broken(
                        refresh_db,
                        developer_id=locked_conn.developer_id,
                        github_username=locked_conn.github_username,
                        reason="GitHub rejected the refresh token",
                    )
                connection.auth_status = locked_conn.auth_status
                connection.auth_error = locked_conn.auth_error
                raise

            locked_conn.access_token = refreshed.access_token
            locked_conn.auth_status = "active"
            locked_conn.auth_error = None
            if refreshed.refresh_token:
                locked_conn.refresh_token = refreshed.refresh_token
            if refreshed.expires_in:
                locked_conn.token_expires_at = (
                    datetime.now(timezone.utc) + timedelta(seconds=refreshed.expires_in)
                )
            await refresh_db.commit()
            logger.info(f"GitHub token refreshed for @{locked_conn.github_username}")

            connection.access_token = locked_conn.access_token
            connection.refresh_token = locked_conn.refresh_token
            connection.token_expires_at = locked_conn.token_expires_at
            connection.auth_status = "active"
            connection.auth_error = None

    async def _get_not_found_error_message(
        self,
        connection: GitHubConnection,
        owner: str,
        repo_name: str,
        full_name: str,
    ) -> str:
        """Build a user-friendly error message for 404 errors.

        Detects whether the 404 is likely due to GitHub App installation
        permissions vs the repo genuinely not existing.
        """
        # ghu_ tokens are GitHub App user-to-server tokens with limited repo access
        if connection.access_token.startswith("ghu_"):
            # Check if installation uses "selected" repos
            stmt = select(GitHubInstallation).where(
                GitHubInstallation.github_connection_id == connection.id,
                GitHubInstallation.account_login == owner,
            )
            result = await self.db.execute(stmt)
            installation = result.scalar_one_or_none()

            if installation and installation.repository_selection == "selected":
                return (
                    f"Repository '{full_name}' is not accessible with your current GitHub App permissions. "
                    f"Go to https://github.com/settings/installations/{installation.installation_id} "
                    f"and add this repository, or switch to 'All repositories'."
                )
            elif installation:
                return (
                    f"Repository '{full_name}' not found on GitHub - "
                    f"it may have been deleted, renamed, or made private"
                )
            else:
                return (
                    f"Repository '{full_name}' is not accessible. "
                    f"No GitHub App installation found for '{owner}'. "
                    f"Please reinstall the GitHub App or reconnect your account."
                )

        return (
            "Repository not found on GitHub - "
            "it may have been deleted, renamed, or made private"
        )

    async def _run_sync(
        self,
        developer_id: str,
        repository_id: str,
        access_token: str,
        job_id: str,
        sync_type: SyncType = "incremental",
    ) -> None:
        """Run sync as a background asyncio task (legacy path)."""
        async with async_session_maker() as db:
            service = SyncService(db)
            try:
                await service.sync_repository(
                    developer_id=developer_id,
                    repository_id=repository_id,
                )
                await db.commit()
            except Exception as e:
                logger.error(f"Background sync failed for repository {repository_id}: {e}")
                await db.commit()  # Commit the failed status update from sync_repository

    async def _resolve_developer_for_commit(
        self,
        db: AsyncSession,
        commit_data: dict,
        fallback_developer_id: str,
    ) -> tuple[str, str | None, str | None]:
        """Resolve developer_id for a commit author.

        Returns (developer_id, github_login, author_email).
        """
        author_obj = commit_data.get("author") or {}  # GitHub user object (may be null)
        commit_author = commit_data.get("commit", {}).get("author", {})

        github_login = author_obj.get("login") if author_obj else None
        author_email = commit_author.get("email")
        author_name = commit_author.get("name")

        # 1. Try matching by GitHub ID (most reliable) — check cache first
        github_id = author_obj.get("id") if author_obj else None
        if github_id:
            if github_id in self._dev_cache_by_github_id:
                return self._dev_cache_by_github_id[github_id], github_login, author_email

            stmt = (
                select(Developer)
                .join(GitHubConnection)
                .where(GitHubConnection.github_id == github_id)
            )
            result = await db.execute(stmt)
            dev = result.scalar_one_or_none()
            if dev:
                self._dev_cache_by_github_id[github_id] = dev.id
                return dev.id, github_login, author_email

        # 2. Try matching by email — check cache first
        if author_email:
            if author_email in self._dev_cache_by_email:
                return self._dev_cache_by_email[author_email], github_login, author_email

            stmt = select(Developer).where(Developer.email == author_email)
            result = await db.execute(stmt)
            dev = result.scalar_one_or_none()
            if dev:
                self._dev_cache_by_email[author_email] = dev.id
                if github_id:
                    self._dev_cache_by_github_id[github_id] = dev.id
                return dev.id, github_login, author_email

            # 2.5. Try matching by alias email (case-insensitive). Lets
            # a developer's secondary git-config email route to their
            # canonical Developer without creating a pseudo-ghost.
            from aexy.models.developer import DeveloperEmailAlias

            alias_stmt = (
                select(Developer)
                .join(
                    DeveloperEmailAlias,
                    DeveloperEmailAlias.developer_id == Developer.id,
                )
                .where(func.lower(DeveloperEmailAlias.email) == author_email.lower())
            )
            dev = (await db.execute(alias_stmt)).scalar_one_or_none()
            if dev:
                self._dev_cache_by_email[author_email] = dev.id
                if github_id:
                    self._dev_cache_by_github_id[github_id] = dev.id
                return dev.id, github_login, author_email

            # 3. Auto-create ghost developer
            new_dev = Developer(email=author_email, name=author_name)
            db.add(new_dev)
            await db.flush()
            self._dev_cache_by_email[author_email] = new_dev.id
            if github_id:
                self._dev_cache_by_github_id[github_id] = new_dev.id
            return new_dev.id, github_login, author_email

        # 4. Fallback to connecting developer
        return fallback_developer_id, github_login, author_email

    async def _resolve_developer_for_pr(
        self,
        db: AsyncSession,
        user_data: dict,
        fallback_developer_id: str,
    ) -> str:
        """Resolve developer_id for a PR/review author."""
        if not user_data:
            return fallback_developer_id

        github_id = user_data.get("id")
        github_login = user_data.get("login")

        # 1. Try GitHub ID — check cache first
        if github_id:
            if github_id in self._dev_cache_by_github_id:
                return self._dev_cache_by_github_id[github_id]

            stmt = (
                select(Developer)
                .join(GitHubConnection)
                .where(GitHubConnection.github_id == github_id)
            )
            result = await db.execute(stmt)
            dev = result.scalar_one_or_none()
            if dev:
                self._dev_cache_by_github_id[github_id] = dev.id
                return dev.id

        # 2. Create or find ghost developer by github_login
        if github_login:
            cache_key = f"gh:{github_login}"
            if cache_key in self._dev_cache_by_email:
                return self._dev_cache_by_email[cache_key]

            # Check if a ghost developer already exists for this login
            # (ghost = no email, name matches github login)
            with db.no_autoflush:
                stmt = select(Developer).where(
                    Developer.name == github_login,
                    Developer.email.is_(None),
                )
                result = await db.execute(stmt)
                existing_ghost = result.scalar_one_or_none()

            if existing_ghost:
                self._dev_cache_by_email[cache_key] = existing_ghost.id
                if github_id:
                    self._dev_cache_by_github_id[github_id] = existing_ghost.id
                return existing_ghost.id

            # Create new ghost developer (email is nullable)
            new_dev = Developer(name=github_login)
            db.add(new_dev)
            await db.flush()
            self._dev_cache_by_email[cache_key] = new_dev.id
            if github_id:
                self._dev_cache_by_github_id[github_id] = new_dev.id
            return new_dev.id

        # 3. Fallback to connecting developer (no login available)
        return fallback_developer_id

    async def _sync_commits_with_session(
        self,
        db: AsyncSession,
        gh: GitHubService,
        owner: str,
        repo: str,
        developer_id: str,
        repository_id: str,
        repo_language: str | None = None,
        sync_branches: list[str] | None = None,
        default_branch: str | None = None,
        heartbeat_fn: Any = None,
    ) -> int:
        """Sync commits from repository (all contributors).

        Walks every branch in `sync_branches` (or the auto-detected active
        branch set if None). The default branch alone hides feature-branch
        work; cross-branch dedup is handled by `Commit.sha`'s UNIQUE
        constraint plus an in-memory `seen_shas` guard.
        """
        # Resolve which branches to walk. Three modes:
        #   1) Explicit whitelist on the Repository row → use as-is
        #   2) Auto-detect: any branch with a commit in the last 90 days
        #   3) On error / empty: fall back to the GitHub default branch (None)
        branches_to_sync: list[str | None]
        if sync_branches:
            branches_to_sync = list(sync_branches)
        else:
            try:
                active = await gh.get_active_branches(owner, repo, since_days=90)
                # `None` here means "let GitHub pick the default branch".
                # We include it so we always cover the default even if it
                # somehow wasn't reported active (e.g. dormant project).
                branches_to_sync = [None, *active] if active else [None]
                # Dedup while preserving order: list(dict.fromkeys(...))
                branches_to_sync = list(dict.fromkeys(branches_to_sync))
            except GitHubAPIError:
                logger.warning(
                    f"Failed to enumerate branches for {owner}/{repo}; "
                    "falling back to default branch only"
                )
                branches_to_sync = [None]

        synced = 0
        seen_shas: set[str] = set()

        for branch in branches_to_sync:
            page = 1
            while True:
                try:
                    commits = await gh.get_commits(
                        owner, repo, per_page=100, page=page, sha=branch
                    )
                except GitHubAPIError:
                    break

                if not commits:
                    break

                if heartbeat_fn:
                    heartbeat_fn(f"Commits: {synced} synced so far...")

                for idx, commit_data in enumerate(commits):
                    # get_commit_details below is a per-commit network call; keep the
                    # Temporal activity heartbeat alive through large pages so the
                    # activity isn't killed mid-sync (which would strand the data).
                    if heartbeat_fn and idx % 25 == 0:
                        heartbeat_fn(f"Commits: {synced} synced so far...")
                    sha = commit_data["sha"]
                    if sha in seen_shas:
                        continue
                    seen_shas.add(sha)

                    # Check if commit already exists (no_autoflush to prevent
                    # flushing pending inserts which can cause IntegrityError)
                    with db.no_autoflush:
                        stmt = select(Commit).where(Commit.sha == sha)
                        result = await db.execute(stmt)
                        existing = result.scalar_one_or_none()

                    if not existing:
                        # Resolve which developer this commit belongs to
                        resolved_dev_id, github_login, author_email = (
                            await self._resolve_developer_for_commit(db, commit_data, developer_id)
                        )

                        # Get commit details for stats
                        try:
                            details = await gh.get_commit_details(owner, repo, commit_data["sha"])
                            stats = details.get("stats", {})
                            files = details.get("files", [])
                        except GitHubAPIError:
                            stats = {}
                            files = []

                        # Extract file types from filenames
                        file_types = set()
                        detected_languages = set()
                        if repo_language:
                            detected_languages.add(repo_language)

                        for file in files:
                            filename = file.get("filename", "")
                            if "." in filename:
                                ext = filename.rsplit(".", 1)[-1].lower()
                                file_types.add(ext)
                                # Map common extensions to languages
                                ext_to_lang = {
                                    "py": "Python", "js": "JavaScript", "ts": "TypeScript",
                                    "tsx": "TypeScript", "jsx": "JavaScript", "java": "Java",
                                    "go": "Go", "rs": "Rust", "rb": "Ruby", "php": "PHP",
                                    "cs": "C#", "cpp": "C++", "c": "C", "swift": "Swift",
                                    "kt": "Kotlin", "scala": "Scala", "vue": "Vue",
                                }
                                if ext in ext_to_lang:
                                    detected_languages.add(ext_to_lang[ext])

                        full_message = commit_data["commit"]["message"] or ""
                        # None when the details fetch failed — stored as NULL so
                        # a report reads it as unmeasured, not as an empty commit.
                        churn = source_churn(files)

                        commit = Commit(
                            id=str(uuid4()),
                            developer_id=resolved_dev_id,
                            repository=f"{owner}/{repo}",
                            sha=commit_data["sha"],
                            message=full_message[:500],
                            additions=stats.get("additions", 0),
                            deletions=stats.get("deletions", 0),
                            files_changed=len(files),
                            source_additions=churn[0] if churn else None,
                            source_deletions=churn[1] if churn else None,
                            source_files_changed=churn[2] if churn else None,
                            languages=list(detected_languages) if detected_languages else None,
                            file_types=list(file_types) if file_types else None,
                            author_github_login=github_login,
                            author_email=author_email,
                            author_class=classify_author(github_login, author_email),
                            change_class=classify_change(files),
                            is_merge=is_merge_commit(commit_data),
                            is_revert=is_revert_commit(full_message),
                            content_hash=content_hash(files),
                            branch=branch or default_branch,
                            patch_sample=build_patch_sample(files),
                            committed_at=_github_ts(
                                commit_data["commit"]["committer"]["date"]
                            ),
                            authored_at=_github_ts(
                                (commit_data["commit"].get("author") or {}).get("date")
                            ),
                        )
                        db.add(commit)
                        synced += 1

                if len(commits) < 100:
                    break
                page += 1

                # Batch commit every 100 records
                if synced % 100 == 0:
                    await db.commit()

        await db.commit()
        return synced

    async def _sync_pull_requests_with_session(
        self,
        db: AsyncSession,
        gh: GitHubService,
        owner: str,
        repo: str,
        developer_id: str,
        repository_id: str,
        heartbeat_fn: Any = None,
    ) -> int:
        """Sync pull requests from repository (all contributors)."""
        synced = 0
        page = 1

        while True:
            try:
                prs = await gh.get_pull_requests(owner, repo, state="all", per_page=100, page=page)
            except GitHubAPIError:
                break

            if not prs:
                break

            if heartbeat_fn:
                heartbeat_fn(f"Pull requests: {synced} synced so far...")

            for pr_data in prs:
                # Check if PR already exists
                with db.no_autoflush:
                    stmt = select(PullRequest).where(
                        PullRequest.github_id == pr_data["id"],
                    )
                    result = await db.execute(stmt)
                    existing = result.scalar_one_or_none()

                # GitHub API returns "closed" for merged PRs — normalize to "merged"
                pr_state = "merged" if pr_data.get("merged_at") else pr_data["state"]

                if not existing:
                    # Resolve which developer this PR belongs to
                    resolved_dev_id = await self._resolve_developer_for_pr(
                        db, pr_data.get("user", {}), developer_id
                    )

                    # The list endpoint carries none of the metrics and no
                    # merged_by — only the per-PR detail call does. One extra
                    # request per *new* PR: a real cost on a first backfill,
                    # negligible afterwards, and the alternative is six zeroed
                    # columns and a PR the AI pass writes off as "xs".
                    detail = pr_data
                    try:
                        detail = await gh.get_pull_request(owner, repo, pr_data["number"])
                    except GitHubAPIError:
                        logger.warning(
                            f"PR detail unavailable for {owner}/{repo}"
                            f"#{pr_data['number']}; storing list-endpoint fields only"
                        )

                    pr_additions = detail.get("additions", 0)
                    pr_deletions = detail.get("deletions", 0)
                    pr_files_changed = detail.get("changed_files", 0)
                    merged_by = detail.get("merged_by") or {}
                    merged_by_id = await self._resolve_merger(db, merged_by, developer_id)
                    pr = PullRequest(
                        id=str(uuid4()),
                        developer_id=resolved_dev_id,
                        repository=f"{owner}/{repo}",
                        github_id=pr_data["id"],
                        number=pr_data["number"],
                        title=pr_data["title"][:500] if pr_data["title"] else "",
                        state=pr_state,
                        additions=pr_additions,
                        deletions=pr_deletions,
                        files_changed=pr_files_changed,
                        commits_count=detail.get("commits", 0),
                        comments_count=detail.get("comments", 0),
                        review_comments_count=detail.get("review_comments", 0),
                        merged_by_developer_id=merged_by_id,
                        merged_by_login=merged_by.get("login"),
                        size_bucket=size_bucket(pr_additions, pr_deletions, pr_files_changed),
                        created_at_github=_github_ts(pr_data["created_at"]),
                        merged_at=_github_ts(pr_data.get("merged_at")),
                        closed_at=_github_ts(pr_data.get("closed_at")),
                    )
                    db.add(pr)
                    synced += 1
                else:
                    # Update existing PR state and timestamps
                    existing.state = pr_state
                    existing.merged_at = (
                        _github_ts(pr_data.get("merged_at")) or existing.merged_at
                    )
                    existing.closed_at = (
                        _github_ts(pr_data.get("closed_at")) or existing.closed_at
                    )
                    # Rows synced before the detail call existed carry six
                    # zeroed metrics and no merger. Refill them once — the
                    # condition stops being true as soon as it works, so this
                    # does not turn into a request per PR per sync.
                    if (
                        existing.additions == 0
                        and existing.deletions == 0
                        and existing.files_changed == 0
                    ):
                        await self._backfill_pr_detail(db, gh, owner, repo, existing)

            if len(prs) < 100:
                break
            page += 1

            if synced % 100 == 0:
                await db.commit()

        await db.commit()
        return synced

    async def _backfill_pr_detail(
        self,
        db: AsyncSession,
        gh: GitHubService,
        owner: str,
        repo: str,
        pr: PullRequest,
    ) -> None:
        """Refill a PR row that was stored from the list endpoint alone.

        Those rows have additions, deletions, changed files, commits and both
        comment counts at zero, no merger, and a `size_bucket` of "xs" derived
        from the zeros — which the AI pass reads as "too small to look at",
        stamping `ai_analyzed_at` as it skips. Clearing that stamp here puts the
        PR back in the queue; the accompanying migration does the same for rows
        that will not be revisited.
        """
        try:
            detail = await gh.get_pull_request(owner, repo, pr.number)
        except GitHubAPIError:
            return

        pr.additions = detail.get("additions", 0)
        pr.deletions = detail.get("deletions", 0)
        pr.files_changed = detail.get("changed_files", 0)
        pr.commits_count = detail.get("commits", 0)
        pr.comments_count = detail.get("comments", 0)
        pr.review_comments_count = detail.get("review_comments", 0)
        pr.size_bucket = size_bucket(pr.additions, pr.deletions, pr.files_changed)

        merged_by = detail.get("merged_by") or {}
        if merged_by.get("login"):
            pr.merged_by_login = merged_by.get("login")
            pr.merged_by_developer_id = await self._resolve_merger(
                db, merged_by, str(pr.developer_id)
            )

        if pr.ai_analysis is None and pr.size_bucket != "xs":
            pr.ai_analyzed_at = None

    async def _sync_reviews_with_session(
        self,
        db: AsyncSession,
        gh: GitHubService,
        owner: str,
        repo: str,
        developer_id: str,
        repository_id: str,
        heartbeat_fn: Any = None,
    ) -> int:
        """Sync code reviews from repository (all contributors)."""
        synced = 0
        page = 1

        # Get all PRs first, then fetch reviews for each
        while True:
            try:
                prs = await gh.get_pull_requests(owner, repo, state="all", per_page=100, page=page)
            except GitHubAPIError:
                break

            if not prs:
                break

            for idx, pr_data in enumerate(prs):
                # get_pull_request_reviews is a per-PR network call; heartbeat
                # through large pages so the activity isn't killed mid-sync.
                if heartbeat_fn and idx % 10 == 0:
                    heartbeat_fn(f"Reviews: {synced} synced so far...")
                try:
                    reviews = await gh.get_pull_request_reviews(owner, repo, pr_data["number"])
                except GitHubAPIError:
                    continue

                for review_data in reviews:
                    # Check if review already exists
                    with db.no_autoflush:
                        stmt = select(CodeReview).where(
                            CodeReview.github_id == review_data["id"],
                        )
                        result = await db.execute(stmt)
                        existing = result.scalar_one_or_none()

                    if not existing:
                        # Resolve which developer this review belongs to
                        resolved_dev_id = await self._resolve_developer_for_pr(
                            db, review_data.get("user", {}), developer_id
                        )

                        review = CodeReview(
                            id=str(uuid4()),
                            developer_id=resolved_dev_id,
                            repository=f"{owner}/{repo}",
                            github_id=review_data["id"],
                            pull_request_github_id=pr_data["id"],
                            state=review_data["state"],
                            body=review_data.get("body", "")[:1000] if review_data.get("body") else None,
                            submitted_at=datetime.fromisoformat(
                                review_data["submitted_at"].replace("Z", "+00:00")
                            ) if review_data.get("submitted_at") else None,
                        )
                        db.add(review)
                        synced += 1

            if len(prs) < 100:
                break
            page += 1

            if synced % 50 == 0:
                await db.commit()

        await db.commit()
        return synced

    async def register_webhook(
        self,
        developer_id: str,
        repository_id: str,
    ) -> int:
        """Register a GitHub webhook for real-time updates."""
        # Get developer repository
        stmt = (
            select(DeveloperRepository)
            .where(
                DeveloperRepository.developer_id == developer_id,
                DeveloperRepository.repository_id == repository_id,
            )
            .options(selectinload(DeveloperRepository.repository))
        )
        result = await self.db.execute(stmt)
        dev_repo = result.scalar_one_or_none()

        if not dev_repo:
            raise ValueError("Repository not found for this developer")

        repo = dev_repo.repository
        owner, repo_name = repo.full_name.split("/")

        # Get access token
        stmt = select(GitHubConnection).where(GitHubConnection.developer_id == developer_id)
        result = await self.db.execute(stmt)
        connection = result.scalar_one_or_none()

        if not connection:
            raise ValueError("GitHub connection not found")

        # Build webhook URL
        webhook_url = f"{settings.github_redirect_uri.rsplit('/', 2)[0]}/webhooks/github"
        webhook_secret = settings.github_webhook_secret or "aexy-webhook"

        try:
            async with GitHubService(access_token=connection.access_token) as gh:
                result = await gh.create_repo_webhook(
                    owner=owner,
                    repo=repo_name,
                    callback_url=webhook_url,
                    secret=webhook_secret,
                )

            webhook_id = result["id"]

            # Update repository with webhook info
            dev_repo.webhook_id = webhook_id
            dev_repo.webhook_status = "active"
            dev_repo.updated_at = datetime.now(timezone.utc)
            await self.db.commit()

            return webhook_id

        except GitHubAPIError as e:
            dev_repo.webhook_status = "failed"
            dev_repo.updated_at = datetime.now(timezone.utc)
            await self.db.commit()
            raise ValueError(f"Failed to create webhook: {e}")

    async def unregister_webhook(
        self,
        developer_id: str,
        repository_id: str,
    ) -> None:
        """Remove a GitHub webhook."""
        # Get developer repository
        stmt = (
            select(DeveloperRepository)
            .where(
                DeveloperRepository.developer_id == developer_id,
                DeveloperRepository.repository_id == repository_id,
            )
            .options(selectinload(DeveloperRepository.repository))
        )
        result = await self.db.execute(stmt)
        dev_repo = result.scalar_one_or_none()

        if not dev_repo:
            raise ValueError("Repository not found for this developer")

        if not dev_repo.webhook_id:
            return  # No webhook to remove

        repo = dev_repo.repository
        owner, repo_name = repo.full_name.split("/")

        # Get access token
        stmt = select(GitHubConnection).where(GitHubConnection.developer_id == developer_id)
        result = await self.db.execute(stmt)
        connection = result.scalar_one_or_none()

        if not connection:
            raise ValueError("GitHub connection not found")

        try:
            async with GitHubService(access_token=connection.access_token) as gh:
                await gh.delete_repo_webhook(owner, repo_name, dev_repo.webhook_id)
        except GitHubAPIError:
            pass  # Webhook may already be deleted

        dev_repo.webhook_id = None
        dev_repo.webhook_status = "none"
        dev_repo.updated_at = datetime.now(timezone.utc)
        await self.db.commit()

    async def get_sync_status(
        self,
        developer_id: str,
        repository_id: str,
    ) -> dict[str, Any]:
        """Get sync and webhook status for a repository."""
        stmt = (
            select(DeveloperRepository)
            .where(
                DeveloperRepository.developer_id == developer_id,
                DeveloperRepository.repository_id == repository_id,
            )
            .options(selectinload(DeveloperRepository.repository))
        )
        result = await self.db.execute(stmt)
        dev_repo = result.scalar_one_or_none()

        if not dev_repo:
            raise ValueError("Repository not found for this developer")

        return {
            "repository_id": repository_id,
            "is_enabled": dev_repo.is_enabled,
            "sync_status": dev_repo.sync_status,
            "last_sync_at": dev_repo.last_sync_at.isoformat() if dev_repo.last_sync_at else None,
            "sync_error": dev_repo.sync_error,
            "commits_synced": dev_repo.commits_synced,
            "prs_synced": dev_repo.prs_synced,
            "reviews_synced": dev_repo.reviews_synced,
            "webhook_id": dev_repo.webhook_id,
            "webhook_status": dev_repo.webhook_status,
        }
