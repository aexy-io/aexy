"""Celery tasks for GitHub data synchronization with rate limiting."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from celery import shared_task

from devograph.processing.tasks import run_async

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=5,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
)
def sync_repository_task(
    self,
    developer_id: str,
    repository_id: str,
    sync_type: str = "incremental",
    access_token: str | None = None,
) -> dict[str, Any]:
    """Main sync task - orchestrates commit/PR/review sync.

    Args:
        developer_id: Developer ID.
        repository_id: Repository ID.
        sync_type: "full" or "incremental".
        access_token: Optional GitHub access token (will be fetched if not provided).

    Returns:
        Sync result summary.
    """
    logger.info(
        f"Starting {sync_type} sync for repository {repository_id} "
        f"(developer: {developer_id})"
    )

    try:
        result = run_async(
            _sync_repository(
                developer_id=developer_id,
                repository_id=repository_id,
                sync_type=sync_type,
                access_token=access_token,
            )
        )
        return result
    except Exception as exc:
        logger.error(f"Repository sync failed: {exc}")
        raise self.retry(exc=exc)


async def _sync_repository(
    developer_id: str,
    repository_id: str,
    sync_type: str,
    access_token: str | None,
) -> dict[str, Any]:
    """Async implementation of repository sync."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from devograph.core.database import async_session_maker
    from devograph.models.developer import GitHubConnection
    from devograph.models.repository import DeveloperRepository
    from devograph.services.github_rate_limiter import get_rate_limiter
    from devograph.services.github_service import GitHubService
    from devograph.services.limits_service import LimitsService

    rate_limiter = get_rate_limiter()

    async with async_session_maker() as db:
        # Get limits for this developer
        limits_service = LimitsService(db)
        sync_limits = await limits_service.get_sync_limits(developer_id)

        # Get repository info
        stmt = (
            select(DeveloperRepository)
            .where(
                DeveloperRepository.developer_id == developer_id,
                DeveloperRepository.repository_id == repository_id,
            )
            .options(selectinload(DeveloperRepository.repository))
        )
        result = await db.execute(stmt)
        dev_repo = result.scalar_one_or_none()

        if not dev_repo:
            return {"error": "Repository not found", "repository_id": repository_id}

        repo = dev_repo.repository
        owner, repo_name = repo.full_name.split("/")

        # Get access token if not provided
        if not access_token:
            stmt = select(GitHubConnection).where(
                GitHubConnection.developer_id == developer_id
            )
            result = await db.execute(stmt)
            connection = result.scalar_one_or_none()

            if not connection:
                dev_repo.sync_status = "failed"
                dev_repo.sync_error = "GitHub connection not found"
                await db.commit()
                return {"error": "GitHub connection not found"}

            access_token = connection.access_token
            github_username = connection.github_username
        else:
            github_username = None

        # Update status
        dev_repo.sync_status = "syncing"
        dev_repo.sync_error = None
        await db.commit()

        # Determine since date for incremental sync
        since_date = None
        if sync_type == "incremental" and dev_repo.incremental_sync_enabled:
            since_date = dev_repo.last_commit_date
            # Also apply plan limit
            plan_since = sync_limits.get_since_date()
            if plan_since and (not since_date or plan_since > since_date):
                since_date = plan_since
        elif sync_type == "full":
            since_date = sync_limits.get_since_date()

        try:
            # Check rate limit before starting
            await rate_limiter.check_and_wait(access_token)

            async with GitHubService(access_token=access_token) as gh:
                # Sync commits
                commits_synced, last_commit = await _sync_commits(
                    db=db,
                    gh=gh,
                    rate_limiter=rate_limiter,
                    access_token=access_token,
                    owner=owner,
                    repo_name=repo_name,
                    developer_id=developer_id,
                    repository_id=repository_id,
                    github_username=github_username,
                    since=since_date,
                    max_commits=sync_limits.max_commits_per_repo,
                )

                # Sync PRs
                prs_synced, last_pr = await _sync_pull_requests(
                    db=db,
                    gh=gh,
                    rate_limiter=rate_limiter,
                    access_token=access_token,
                    owner=owner,
                    repo_name=repo_name,
                    developer_id=developer_id,
                    repository_id=repository_id,
                    github_username=github_username,
                    since=since_date,
                    max_prs=sync_limits.max_prs_per_repo,
                )

                # Sync reviews
                reviews_synced = await _sync_reviews(
                    db=db,
                    gh=gh,
                    rate_limiter=rate_limiter,
                    access_token=access_token,
                    owner=owner,
                    repo_name=repo_name,
                    developer_id=developer_id,
                    repository_id=repository_id,
                    github_username=github_username,
                    since=since_date,
                )

            # Update sync status
            dev_repo.sync_status = "synced"
            dev_repo.last_sync_at = datetime.now(timezone.utc)
            dev_repo.commits_synced = (dev_repo.commits_synced or 0) + commits_synced
            dev_repo.prs_synced = (dev_repo.prs_synced or 0) + prs_synced
            dev_repo.reviews_synced = (dev_repo.reviews_synced or 0) + reviews_synced

            # Update incremental sync tracking
            if last_commit:
                dev_repo.last_commit_sha = last_commit["sha"]
                dev_repo.last_commit_date = last_commit["date"]

            if last_pr:
                dev_repo.last_pr_number = last_pr["number"]
                dev_repo.last_pr_date = last_pr["date"]

            await db.commit()

            logger.info(
                f"Sync complete for {repo.full_name}: "
                f"{commits_synced} commits, {prs_synced} PRs, {reviews_synced} reviews"
            )

            return {
                "repository_id": repository_id,
                "sync_type": sync_type,
                "commits_synced": commits_synced,
                "prs_synced": prs_synced,
                "reviews_synced": reviews_synced,
                "status": "synced",
            }

        except Exception as e:
            logger.error(f"Sync failed for {repo.full_name}: {e}")

            dev_repo.sync_status = "failed"
            dev_repo.sync_error = str(e)
            await db.commit()

            raise


async def _sync_commits(
    db,
    gh,
    rate_limiter,
    access_token: str,
    owner: str,
    repo_name: str,
    developer_id: str,
    repository_id: str,
    github_username: str | None,
    since: datetime | None,
    max_commits: int,
) -> tuple[int, dict | None]:
    """Sync commits with rate limiting and pagination.

    Returns (count_synced, last_commit_info).
    """
    from sqlalchemy import select

    from devograph.models.activity import Commit
    from devograph.services.github_service import GitHubAPIError

    synced = 0
    last_commit = None
    page = 1

    # -1 means unlimited
    is_unlimited = max_commits == -1

    while is_unlimited or synced < max_commits:
        # Check rate limit
        await rate_limiter.check_and_wait(access_token)
        await rate_limiter.record_request(access_token)

        try:
            commits = await gh.get_commits(
                owner,
                repo_name,
                author=github_username,
                since=since,
                per_page=100,
                page=page,
            )
        except GitHubAPIError:
            break

        if not commits:
            break

        for commit_data in commits:
            if not is_unlimited and synced >= max_commits:
                break

            # Check if commit already exists
            stmt = select(Commit).where(Commit.sha == commit_data["sha"])
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()

            if not existing:
                # Get commit details for stats
                await rate_limiter.check_and_wait(access_token)
                await rate_limiter.record_request(access_token)

                try:
                    details = await gh.get_commit_details(owner, repo_name, commit_data["sha"])
                    stats = details.get("stats", {})
                except GitHubAPIError:
                    stats = {}

                commit_date = datetime.fromisoformat(
                    commit_data["commit"]["committer"]["date"].replace("Z", "+00:00")
                )

                commit = Commit(
                    id=str(uuid4()),
                    developer_id=developer_id,
                    repository=f"{owner}/{repo_name}",
                    sha=commit_data["sha"],
                    message=commit_data["commit"]["message"][:500] if commit_data["commit"]["message"] else "",
                    additions=stats.get("additions", 0),
                    deletions=stats.get("deletions", 0),
                    files_changed=len(details.get("files", [])) if "files" in details else 0,
                    committed_at=commit_date,
                )
                db.add(commit)
                synced += 1

                # Track last commit for incremental sync
                if last_commit is None or commit_date > last_commit.get("date", datetime.min.replace(tzinfo=timezone.utc)):
                    last_commit = {"sha": commit_data["sha"], "date": commit_date}

        # Batch commit every 100 records
        if synced % 100 == 0:
            await db.commit()

        if len(commits) < 100:
            break
        page += 1

    await db.commit()
    return synced, last_commit


async def _sync_pull_requests(
    db,
    gh,
    rate_limiter,
    access_token: str,
    owner: str,
    repo_name: str,
    developer_id: str,
    repository_id: str,
    github_username: str | None,
    since: datetime | None,
    max_prs: int,
) -> tuple[int, dict | None]:
    """Sync pull requests with rate limiting.

    Returns (count_synced, last_pr_info).
    """
    from sqlalchemy import select

    from devograph.models.activity import PullRequest
    from devograph.services.github_service import GitHubAPIError

    synced = 0
    last_pr = None
    page = 1

    is_unlimited = max_prs == -1

    while is_unlimited or synced < max_prs:
        await rate_limiter.check_and_wait(access_token)
        await rate_limiter.record_request(access_token)

        try:
            prs = await gh.get_pull_requests(
                owner, repo_name, state="all", per_page=100, page=page
            )
        except GitHubAPIError:
            break

        if not prs:
            break

        for pr_data in prs:
            if not is_unlimited and synced >= max_prs:
                break

            # Filter by author if username provided
            if github_username and pr_data["user"]["login"] != github_username:
                continue

            # Filter by since date
            pr_created = datetime.fromisoformat(
                pr_data["created_at"].replace("Z", "+00:00")
            )
            if since and pr_created < since:
                continue

            # Check if PR already exists
            stmt = select(PullRequest).where(
                PullRequest.github_id == pr_data["id"],
            )
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()

            if not existing:
                pr = PullRequest(
                    id=str(uuid4()),
                    developer_id=developer_id,
                    repository=f"{owner}/{repo_name}",
                    github_id=pr_data["id"],
                    number=pr_data["number"],
                    title=pr_data["title"][:500] if pr_data["title"] else "",
                    state=pr_data["state"],
                    additions=pr_data.get("additions", 0),
                    deletions=pr_data.get("deletions", 0),
                    changed_files=pr_data.get("changed_files", 0),
                    commits=pr_data.get("commits", 0),
                    comments=pr_data.get("comments", 0) + pr_data.get("review_comments", 0),
                    created_at=pr_created,
                    merged_at=datetime.fromisoformat(
                        pr_data["merged_at"].replace("Z", "+00:00")
                    ) if pr_data.get("merged_at") else None,
                    closed_at=datetime.fromisoformat(
                        pr_data["closed_at"].replace("Z", "+00:00")
                    ) if pr_data.get("closed_at") else None,
                )
                db.add(pr)
                synced += 1

                # Track last PR for incremental sync
                if last_pr is None or pr_created > last_pr.get("date", datetime.min.replace(tzinfo=timezone.utc)):
                    last_pr = {"number": pr_data["number"], "date": pr_created}

        if synced % 100 == 0:
            await db.commit()

        if len(prs) < 100:
            break
        page += 1

    await db.commit()
    return synced, last_pr


async def _sync_reviews(
    db,
    gh,
    rate_limiter,
    access_token: str,
    owner: str,
    repo_name: str,
    developer_id: str,
    repository_id: str,
    github_username: str | None,
    since: datetime | None,
) -> int:
    """Sync code reviews with rate limiting."""
    from sqlalchemy import select

    from devograph.models.activity import CodeReview
    from devograph.services.github_service import GitHubAPIError

    synced = 0
    page = 1

    # Get PRs to fetch reviews from
    while True:
        await rate_limiter.check_and_wait(access_token)
        await rate_limiter.record_request(access_token)

        try:
            prs = await gh.get_pull_requests(
                owner, repo_name, state="all", per_page=100, page=page
            )
        except GitHubAPIError:
            break

        if not prs:
            break

        for pr_data in prs:
            # Filter by since date
            pr_created = datetime.fromisoformat(
                pr_data["created_at"].replace("Z", "+00:00")
            )
            if since and pr_created < since:
                continue

            await rate_limiter.check_and_wait(access_token)
            await rate_limiter.record_request(access_token)

            try:
                reviews = await gh.get_pull_request_reviews(
                    owner, repo_name, pr_data["number"]
                )
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
                result = await db.execute(stmt)
                existing = result.scalar_one_or_none()

                if not existing:
                    review = CodeReview(
                        id=str(uuid4()),
                        developer_id=developer_id,
                        repository=f"{owner}/{repo_name}",
                        github_id=review_data["id"],
                        pull_request_id=pr_data["id"],
                        state=review_data["state"],
                        body=review_data.get("body", "")[:1000] if review_data.get("body") else None,
                        submitted_at=datetime.fromisoformat(
                            review_data["submitted_at"].replace("Z", "+00:00")
                        ) if review_data.get("submitted_at") else None,
                    )
                    db.add(review)
                    synced += 1

            if synced % 50 == 0:
                await db.commit()

        if len(prs) < 100:
            break
        page += 1

    await db.commit()
    return synced


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def sync_commits_task(
    self,
    developer_id: str,
    repository_id: str,
    since: str | None = None,
    max_commits: int = 500,
) -> dict[str, Any]:
    """Sync commits for a repository.

    Args:
        developer_id: Developer ID.
        repository_id: Repository ID.
        since: ISO datetime string for incremental sync.
        max_commits: Maximum commits to sync.

    Returns:
        Sync result.
    """
    logger.info(f"Syncing commits for repository {repository_id}")

    try:
        since_dt = datetime.fromisoformat(since) if since else None
        result = run_async(
            _sync_commits_standalone(
                developer_id=developer_id,
                repository_id=repository_id,
                since=since_dt,
                max_commits=max_commits,
            )
        )
        return result
    except Exception as exc:
        logger.error(f"Commit sync failed: {exc}")
        raise self.retry(exc=exc)


async def _sync_commits_standalone(
    developer_id: str,
    repository_id: str,
    since: datetime | None,
    max_commits: int,
) -> dict[str, Any]:
    """Standalone commit sync implementation."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from devograph.core.database import async_session_maker
    from devograph.models.developer import GitHubConnection
    from devograph.models.repository import DeveloperRepository
    from devograph.services.github_rate_limiter import get_rate_limiter
    from devograph.services.github_service import GitHubService

    rate_limiter = get_rate_limiter()

    async with async_session_maker() as db:
        # Get repository info
        stmt = (
            select(DeveloperRepository)
            .where(
                DeveloperRepository.developer_id == developer_id,
                DeveloperRepository.repository_id == repository_id,
            )
            .options(selectinload(DeveloperRepository.repository))
        )
        result = await db.execute(stmt)
        dev_repo = result.scalar_one_or_none()

        if not dev_repo:
            return {"error": "Repository not found"}

        repo = dev_repo.repository
        owner, repo_name = repo.full_name.split("/")

        # Get access token
        stmt = select(GitHubConnection).where(
            GitHubConnection.developer_id == developer_id
        )
        result = await db.execute(stmt)
        connection = result.scalar_one_or_none()

        if not connection:
            return {"error": "GitHub connection not found"}

        async with GitHubService(access_token=connection.access_token) as gh:
            synced, last_commit = await _sync_commits(
                db=db,
                gh=gh,
                rate_limiter=rate_limiter,
                access_token=connection.access_token,
                owner=owner,
                repo_name=repo_name,
                developer_id=developer_id,
                repository_id=repository_id,
                github_username=connection.github_username,
                since=since,
                max_commits=max_commits,
            )

        return {
            "repository_id": repository_id,
            "commits_synced": synced,
            "last_commit": last_commit,
        }
