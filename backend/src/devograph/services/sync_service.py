"""Sync service for historical data synchronization and webhook management."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devograph.core.config import get_settings
from devograph.models.activity import CodeReview, Commit, PullRequest
from devograph.models.developer import GitHubConnection
from devograph.models.repository import DeveloperRepository, Repository
from devograph.services.github_service import GitHubAPIError, GitHubService

logger = logging.getLogger(__name__)
settings = get_settings()


class SyncService:
    """Service for historical data sync and webhook management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def start_historical_sync(
        self,
        developer_id: str,
        repository_id: str,
    ) -> str:
        """
        Start historical sync for a repository.

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

        # Start sync in background
        job_id = str(uuid4())
        asyncio.create_task(
            self._run_sync(
                developer_id=developer_id,
                repository_id=repository_id,
                access_token=connection.access_token,
                job_id=job_id,
            )
        )

        return job_id

    async def _run_sync(
        self,
        developer_id: str,
        repository_id: str,
        access_token: str,
        job_id: str,
    ) -> None:
        """Run the actual sync operation."""
        try:
            # Re-fetch developer repo since we're in a new task
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
                return

            repo = dev_repo.repository
            owner, repo_name = repo.full_name.split("/")

            # Get GitHub username for filtering
            stmt = select(GitHubConnection).where(GitHubConnection.developer_id == developer_id)
            result = await self.db.execute(stmt)
            connection = result.scalar_one_or_none()
            github_username = connection.github_username if connection else None

            async with GitHubService(access_token=access_token) as gh:
                # Sync commits
                commits_synced = await self._sync_commits(
                    gh, owner, repo_name, developer_id, repository_id, github_username
                )

                # Sync PRs
                prs_synced = await self._sync_pull_requests(
                    gh, owner, repo_name, developer_id, repository_id, github_username
                )

                # Sync reviews
                reviews_synced = await self._sync_reviews(
                    gh, owner, repo_name, developer_id, repository_id, github_username
                )

            # Update sync status
            dev_repo.sync_status = "synced"
            dev_repo.last_sync_at = datetime.now(timezone.utc)
            dev_repo.commits_synced = commits_synced
            dev_repo.prs_synced = prs_synced
            dev_repo.reviews_synced = reviews_synced
            dev_repo.updated_at = datetime.now(timezone.utc)

            await self.db.commit()

            logger.info(
                f"Sync complete for {repo.full_name}: "
                f"{commits_synced} commits, {prs_synced} PRs, {reviews_synced} reviews"
            )

        except Exception as e:
            logger.error(f"Sync failed for repository {repository_id}: {e}")

            # Update status to failed
            stmt = select(DeveloperRepository).where(
                DeveloperRepository.developer_id == developer_id,
                DeveloperRepository.repository_id == repository_id,
            )
            result = await self.db.execute(stmt)
            dev_repo = result.scalar_one_or_none()

            if dev_repo:
                dev_repo.sync_status = "failed"
                dev_repo.sync_error = str(e)
                dev_repo.updated_at = datetime.now(timezone.utc)
                await self.db.commit()

    async def _sync_commits(
        self,
        gh: GitHubService,
        owner: str,
        repo: str,
        developer_id: str,
        repository_id: str,
        github_username: str | None,
    ) -> int:
        """Sync commits from repository."""
        synced = 0
        page = 1

        while True:
            try:
                commits = await gh.get_commits(
                    owner, repo, author=github_username, per_page=100, page=page
                )
            except GitHubAPIError:
                break

            if not commits:
                break

            for commit_data in commits:
                # Check if commit already exists
                stmt = select(Commit).where(Commit.sha == commit_data["sha"])
                result = await self.db.execute(stmt)
                existing = result.scalar_one_or_none()

                if not existing:
                    # Get commit details for stats
                    try:
                        details = await gh.get_commit_details(owner, repo, commit_data["sha"])
                        stats = details.get("stats", {})
                    except GitHubAPIError:
                        stats = {}

                    commit = Commit(
                        id=str(uuid4()),
                        developer_id=developer_id,
                        repository=f"{owner}/{repo}",
                        sha=commit_data["sha"],
                        message=commit_data["commit"]["message"][:500] if commit_data["commit"]["message"] else "",
                        additions=stats.get("additions", 0),
                        deletions=stats.get("deletions", 0),
                        files_changed=len(details.get("files", [])) if "files" in details else 0,
                        committed_at=datetime.fromisoformat(
                            commit_data["commit"]["committer"]["date"].replace("Z", "+00:00")
                        ),
                    )
                    self.db.add(commit)
                    synced += 1

            if len(commits) < 100:
                break
            page += 1

            # Batch commit every 100 records
            if synced % 100 == 0:
                await self.db.commit()

        await self.db.commit()
        return synced

    async def _sync_pull_requests(
        self,
        gh: GitHubService,
        owner: str,
        repo: str,
        developer_id: str,
        repository_id: str,
        github_username: str | None,
    ) -> int:
        """Sync pull requests from repository."""
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
                # Filter by author if username provided
                if github_username and pr_data["user"]["login"] != github_username:
                    continue

                # Check if PR already exists
                stmt = select(PullRequest).where(
                    PullRequest.github_id == pr_data["id"],
                )
                result = await self.db.execute(stmt)
                existing = result.scalar_one_or_none()

                if not existing:
                    pr = PullRequest(
                        id=str(uuid4()),
                        developer_id=developer_id,
                        repository=f"{owner}/{repo}",
                        github_id=pr_data["id"],
                        number=pr_data["number"],
                        title=pr_data["title"][:500] if pr_data["title"] else "",
                        state=pr_data["state"],
                        additions=pr_data.get("additions", 0),
                        deletions=pr_data.get("deletions", 0),
                        changed_files=pr_data.get("changed_files", 0),
                        commits=pr_data.get("commits", 0),
                        comments=pr_data.get("comments", 0) + pr_data.get("review_comments", 0),
                        created_at=datetime.fromisoformat(
                            pr_data["created_at"].replace("Z", "+00:00")
                        ),
                        merged_at=datetime.fromisoformat(
                            pr_data["merged_at"].replace("Z", "+00:00")
                        ) if pr_data.get("merged_at") else None,
                        closed_at=datetime.fromisoformat(
                            pr_data["closed_at"].replace("Z", "+00:00")
                        ) if pr_data.get("closed_at") else None,
                    )
                    self.db.add(pr)
                    synced += 1

            if len(prs) < 100:
                break
            page += 1

            if synced % 100 == 0:
                await self.db.commit()

        await self.db.commit()
        return synced

    async def _sync_reviews(
        self,
        gh: GitHubService,
        owner: str,
        repo: str,
        developer_id: str,
        repository_id: str,
        github_username: str | None,
    ) -> int:
        """Sync code reviews from repository."""
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
                    # Filter by reviewer if username provided
                    if github_username and review_data["user"]["login"] != github_username:
                        continue

                    # Check if review already exists
                    stmt = select(CodeReview).where(
                        CodeReview.github_id == review_data["id"],
                    )
                    result = await self.db.execute(stmt)
                    existing = result.scalar_one_or_none()

                    if not existing:
                        review = CodeReview(
                            id=str(uuid4()),
                            developer_id=developer_id,
                            repository=f"{owner}/{repo}",
                            github_id=review_data["id"],
                            pull_request_id=pr_data["id"],
                            state=review_data["state"],
                            body=review_data.get("body", "")[:1000] if review_data.get("body") else None,
                            submitted_at=datetime.fromisoformat(
                                review_data["submitted_at"].replace("Z", "+00:00")
                            ) if review_data.get("submitted_at") else None,
                        )
                        self.db.add(review)
                        synced += 1

            if len(prs) < 100:
                break
            page += 1

            if synced % 50 == 0:
                await self.db.commit()

        await self.db.commit()
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
        webhook_secret = settings.github_webhook_secret or "devograph-webhook"

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
