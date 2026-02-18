"""Sync service for historical data synchronization and webhook management."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.core.config import get_settings
from aexy.core.database import async_session_maker
from aexy.models.activity import CodeReview, Commit, PullRequest
from aexy.models.developer import Developer, GitHubConnection
from aexy.models.repository import DeveloperRepository, Repository
from aexy.services.github_service import GitHubAPIError, GitHubAuthError, GitHubService

logger = logging.getLogger(__name__)
settings = get_settings()

# Sync mode types
SyncMode = Literal["async", "temporal"]
SyncType = Literal["full", "incremental"]


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

        if not dev_repo.is_enabled:
            raise ValueError("Repository is not enabled")

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
            raise ValueError("Repository not found for this developer")

        if not dev_repo.is_enabled:
            raise ValueError("Repository is not enabled")

        # Get access token
        stmt = select(GitHubConnection).where(GitHubConnection.developer_id == developer_id)
        result = await self.db.execute(stmt)
        connection = result.scalar_one_or_none()

        if not connection:
            raise ValueError("GitHub connection not found")

        repo = dev_repo.repository
        owner, repo_name = repo.full_name.split("/")
        repo_language = repo.language if hasattr(repo, 'language') else None

        # Mark as syncing
        dev_repo.sync_status = "syncing"
        dev_repo.sync_error = None
        await self.db.flush()

        if heartbeat_fn:
            heartbeat_fn("Fetching commits...")

        # Initialize developer lookup caches
        self._dev_cache_by_github_id: dict[int, str] = {}
        self._dev_cache_by_email: dict[str, str] = {}

        try:
            async with GitHubService(access_token=connection.access_token) as gh:
                commits_synced = await self._sync_commits_with_session(
                    self.db, gh, owner, repo_name, developer_id, repository_id, repo_language
                )

                if heartbeat_fn:
                    heartbeat_fn(f"Synced {commits_synced} commits, fetching PRs...")

                prs_synced = await self._sync_pull_requests_with_session(
                    self.db, gh, owner, repo_name, developer_id, repository_id
                )

                if heartbeat_fn:
                    heartbeat_fn(f"Synced {prs_synced} PRs, fetching reviews...")

                reviews_synced = await self._sync_reviews_with_session(
                    self.db, gh, owner, repo_name, developer_id, repository_id
                )

            # Update status
            dev_repo.sync_status = "synced"
            dev_repo.last_sync_at = datetime.now(timezone.utc)
            dev_repo.commits_synced = commits_synced
            dev_repo.prs_synced = prs_synced
            dev_repo.reviews_synced = reviews_synced
            dev_repo.updated_at = datetime.now(timezone.utc)
            await self.db.flush()

            logger.info(
                f"Sync complete for {repo.full_name}: "
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

            return {
                "commits_synced": commits_synced,
                "prs_synced": prs_synced,
                "reviews_synced": reviews_synced,
                "repository": repo.full_name,
            }

        except GitHubAuthError as e:
            logger.error(f"GitHub auth failed for repository {repository_id}: {e}")
            dev_repo.sync_status = "failed"
            dev_repo.sync_error = "GitHub authentication failed - please reconnect your GitHub account"
            dev_repo.updated_at = datetime.now(timezone.utc)
            # Mark the GitHub connection as broken
            connection.auth_status = "error"
            connection.auth_error = "GitHub token is invalid or has been revoked. Please reconnect your GitHub account."
            await self.db.flush()
            raise
        except Exception as e:
            logger.error(f"Sync failed for repository {repository_id}: {e}")
            dev_repo.sync_status = "failed"
            dev_repo.sync_error = str(e)
            dev_repo.updated_at = datetime.now(timezone.utc)
            await self.db.flush()
            raise

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

        # 2. Auto-create ghost developer if we have a login
        if github_login:
            # Check if a developer with this login already exists (by email-like key)
            cache_key = f"gh:{github_login}"
            if cache_key in self._dev_cache_by_email:
                return self._dev_cache_by_email[cache_key]

            new_dev = Developer(name=github_login)
            db.add(new_dev)
            await db.flush()
            self._dev_cache_by_email[cache_key] = new_dev.id
            if github_id:
                self._dev_cache_by_github_id[github_id] = new_dev.id
            return new_dev.id

        # 3. Fallback to connecting developer
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
    ) -> int:
        """Sync commits from repository (all contributors)."""
        synced = 0
        page = 1

        while True:
            try:
                commits = await gh.get_commits(
                    owner, repo, per_page=100, page=page
                )
            except GitHubAPIError:
                break

            if not commits:
                break

            for commit_data in commits:
                # Check if commit already exists
                stmt = select(Commit).where(Commit.sha == commit_data["sha"])
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

                    commit = Commit(
                        id=str(uuid4()),
                        developer_id=resolved_dev_id,
                        repository=f"{owner}/{repo}",
                        sha=commit_data["sha"],
                        message=commit_data["commit"]["message"][:500] if commit_data["commit"]["message"] else "",
                        additions=stats.get("additions", 0),
                        deletions=stats.get("deletions", 0),
                        files_changed=len(files),
                        languages=list(detected_languages) if detected_languages else None,
                        file_types=list(file_types) if file_types else None,
                        author_github_login=github_login,
                        author_email=author_email,
                        committed_at=datetime.fromisoformat(
                            commit_data["commit"]["committer"]["date"].replace("Z", "+00:00")
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

            for pr_data in prs:
                # Check if PR already exists
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

                    pr = PullRequest(
                        id=str(uuid4()),
                        developer_id=resolved_dev_id,
                        repository=f"{owner}/{repo}",
                        github_id=pr_data["id"],
                        number=pr_data["number"],
                        title=pr_data["title"][:500] if pr_data["title"] else "",
                        state=pr_state,
                        additions=pr_data.get("additions", 0),
                        deletions=pr_data.get("deletions", 0),
                        files_changed=pr_data.get("changed_files", 0),
                        commits_count=pr_data.get("commits", 0),
                        comments_count=pr_data.get("comments", 0) + pr_data.get("review_comments", 0),
                        created_at_github=datetime.fromisoformat(
                            pr_data["created_at"].replace("Z", "+00:00")
                        ),
                        merged_at=datetime.fromisoformat(
                            pr_data["merged_at"].replace("Z", "+00:00")
                        ) if pr_data.get("merged_at") else None,
                        closed_at=datetime.fromisoformat(
                            pr_data["closed_at"].replace("Z", "+00:00")
                        ) if pr_data.get("closed_at") else None,
                    )
                    db.add(pr)
                    synced += 1
                else:
                    # Update existing PR state and timestamps
                    existing.state = pr_state
                    existing.merged_at = datetime.fromisoformat(
                        pr_data["merged_at"].replace("Z", "+00:00")
                    ) if pr_data.get("merged_at") else existing.merged_at
                    existing.closed_at = datetime.fromisoformat(
                        pr_data["closed_at"].replace("Z", "+00:00")
                    ) if pr_data.get("closed_at") else existing.closed_at

            if len(prs) < 100:
                break
            page += 1

            if synced % 100 == 0:
                await db.commit()

        await db.commit()
        return synced

    async def _sync_reviews_with_session(
        self,
        db: AsyncSession,
        gh: GitHubService,
        owner: str,
        repo: str,
        developer_id: str,
        repository_id: str,
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

            for pr_data in prs:
                try:
                    reviews = await gh.get_pull_request_reviews(owner, repo, pr_data["number"])
                except GitHubAPIError:
                    continue

                for review_data in reviews:
                    # Check if review already exists
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
