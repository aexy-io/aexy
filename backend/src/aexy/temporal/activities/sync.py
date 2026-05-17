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

    from sqlalchemy import select

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


@dataclass
class EnqueueAIAnalysisInput:
    """Fan-out trigger for the GitHub AI pipeline.

    Walks artifacts on `repository_id` whose timestamp is past
    `repositories.ai_analysis_cursor`, applies Layer-0 gates, and dispatches
    per-artifact analysis activities. Bounded by `max_commits` / `max_prs` /
    `max_reviews` so a fresh backfill can't fire 10K LLM jobs.
    """

    repository_id: str
    # Default backfill window for first-time analysis on a repo: 90 days.
    # Smaller windows on subsequent runs are governed by ai_analysis_cursor.
    backfill_days: int = 90
    max_commits: int = 500
    max_prs: int = 200
    max_reviews: int = 200


@activity.defn
async def enqueue_ai_analysis(input: EnqueueAIAnalysisInput) -> dict[str, Any]:
    """Walk recent commits/PRs/reviews on a repo and dispatch AI analysis.

    Layer-0 gates (bot, merge, docs_only, formatter_only, size_bucket=xs)
    short-circuit before dispatch — work that wouldn't survive the gate
    inside the per-artifact activity is filtered here to keep Temporal
    workflow noise down.
    """
    from sqlalchemy import select

    from aexy.models.activity import CodeReview, Commit, PullRequest
    from aexy.models.repository import Repository
    from aexy.services.ai_settings import any_adopter_enables_ai
    from aexy.temporal.activities.analysis import (
        AnalyzeCommitInput,
        AnalyzePRInput,
        AnalyzeReviewInput,
    )
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    logger.info(f"Enqueuing AI analysis for repository {input.repository_id}")

    async with async_session_maker() as db:
        repo = await db.get(Repository, input.repository_id)
        if not repo:
            return {"error": "Repository not found", "repository_id": input.repository_id}

        # Privacy gate: never enqueue if every adopting workspace has AI off.
        # Strictly enforced before any payload could leave for an LLM.
        if not await any_adopter_enables_ai(db, str(repo.id)):
            logger.info(
                f"AI analysis disabled by workspace settings for {repo.full_name}"
            )
            return {
                "repository_id": input.repository_id,
                "status": "disabled_by_settings",
            }

        now = datetime.now(timezone.utc)
        cursor = repo.ai_analysis_cursor or (now - timedelta(days=input.backfill_days))

        repo_full_name = repo.full_name

        # Process oldest-first so the cursor naturally advances forward.
        # If a repo has more eligible artifacts than max_*, the unprocessed
        # tail stays > cursor and gets picked up on the next run instead of
        # being permanently skipped.
        commits = (
            await db.execute(
                select(Commit)
                .where(
                    Commit.repository == repo_full_name,
                    Commit.committed_at > cursor,
                    Commit.ai_analyzed_at.is_(None),
                )
                .order_by(Commit.committed_at.asc())
                .limit(input.max_commits)
            )
        ).scalars().all()

        prs = (
            await db.execute(
                select(PullRequest)
                .where(
                    PullRequest.repository == repo_full_name,
                    PullRequest.created_at_github > cursor,
                    PullRequest.ai_analyzed_at.is_(None),
                )
                .order_by(PullRequest.created_at_github.asc())
                .limit(input.max_prs)
            )
        ).scalars().all()

        reviews = (
            await db.execute(
                select(CodeReview)
                .where(
                    CodeReview.repository == repo_full_name,
                    CodeReview.submitted_at > cursor,
                    CodeReview.ai_analyzed_at.is_(None),
                )
                .order_by(CodeReview.submitted_at.asc())
                .limit(input.max_reviews)
            )
        ).scalars().all()

        # Track the newest timestamp we *touched* across each stream
        # (dispatched + gated-skipped both count — we don't want to see them
        # again). The cursor advances to the min of these so the slowest
        # stream determines the high-water mark, otherwise a stream with a
        # newer-but-skipped batch could fast-forward past unprocessed work in
        # another stream.
        max_commit_ts = cursor
        max_pr_ts = cursor
        max_review_ts = cursor

        commit_dispatches = 0
        commit_skipped = 0
        for commit in commits:
            max_commit_ts = max(max_commit_ts, commit.committed_at)
            if (
                commit.author_class == "bot"
                or commit.is_merge
                or commit.change_class in {"docs_only", "formatter_only", "generated"}
            ):
                # Mark as "analyzed" with an empty payload so the filter
                # excludes it next time too — saves the gate re-evaluation.
                commit.ai_analyzed_at = now
                commit_skipped += 1
                continue
            await dispatch(
                "analyze_commit",
                AnalyzeCommitInput(
                    developer_id=str(commit.developer_id),
                    commit_id=str(commit.id),
                ),
                task_queue=TaskQueue.ANALYSIS,
                workflow_id=f"analyze_commit-{commit.id}",
            )
            commit_dispatches += 1

        pr_dispatches = 0
        pr_skipped = 0
        # Alignment is dispatched as the tail of `analyze_pr` so it always
        # sees the freshly-written `pr.ai_analysis`. We no longer fan out
        # alignment from here.
        for pr in prs:
            max_pr_ts = max(max_pr_ts, pr.created_at_github)
            if pr.size_bucket == "xs":
                pr.ai_analyzed_at = now
                pr_skipped += 1
                continue
            await dispatch(
                "analyze_pr",
                AnalyzePRInput(
                    developer_id=str(pr.developer_id),
                    pr_id=str(pr.id),
                ),
                task_queue=TaskQueue.ANALYSIS,
                workflow_id=f"analyze_pr-{pr.id}",
            )
            pr_dispatches += 1

        review_dispatches = 0
        review_skipped = 0
        for review in reviews:
            max_review_ts = max(max_review_ts, review.submitted_at)
            if not (review.body or "").strip() and (review.comments_count or 0) == 0:
                review.ai_analyzed_at = now
                review_skipped += 1
                continue
            await dispatch(
                "analyze_review",
                AnalyzeReviewInput(
                    developer_id=str(review.developer_id),
                    review_id=str(review.id),
                ),
                task_queue=TaskQueue.ANALYSIS,
                workflow_id=f"analyze_review-{review.id}",
            )
            review_dispatches += 1

        # Advance to the lowest stream's newest touched timestamp so we don't
        # outrun any stream still holding unprocessed work. If a stream was
        # exhausted (returned < limit and we touched everything), its max is
        # bounded above by `now`, so the cursor is at most `now`.
        candidates = []
        if len(commits) == input.max_commits:
            candidates.append(max_commit_ts)
        if len(prs) == input.max_prs:
            candidates.append(max_pr_ts)
        if len(reviews) == input.max_reviews:
            candidates.append(max_review_ts)
        repo.ai_analysis_cursor = min(candidates) if candidates else now
        await db.commit()

    summary = {
        "repository_id": input.repository_id,
        "commits_dispatched": commit_dispatches,
        "commits_skipped": commit_skipped,
        "prs_dispatched": pr_dispatches,
        "prs_skipped": pr_skipped,
        "reviews_dispatched": review_dispatches,
        "reviews_skipped": review_skipped,
        "cursor_advanced_to": repo.ai_analysis_cursor.isoformat() if repo.ai_analysis_cursor else None,
    }
    logger.info(f"AI analysis enqueue complete: {summary}")
    return summary


# ─── Active-PR fast-track poll (C2) ─────────────────────────────────────


@dataclass
class EnqueueActivePRRefreshInput:
    """Schedule-triggered fan-out. Walks every open PR across all
    AI-enabled workspaces and dispatches a per-PR refresh job. Bounded
    by `max_prs_per_run` to keep a Temporal queue burst sane.
    """

    max_prs_per_run: int = 500


@dataclass
class RefreshSinglePRInput:
    """Fetch the latest state of a single PR from GitHub, update the DB if
    anything changed, and fan out re-analysis when the description has
    been edited."""

    pr_id: str
    workspace_id: str | None = None


@activity.defn
async def enqueue_active_pr_refresh(
    input: EnqueueActivePRRefreshInput,
) -> dict[str, Any]:
    """Fan out per-PR refresh jobs for every open PR in AI-enabled workspaces."""
    from sqlalchemy import select

    from aexy.models.activity import PullRequest
    from aexy.models.repository import Repository, WorkspaceRepository
    from aexy.models.workspace import Workspace
    from aexy.services.ai_settings import settings_for_workspace
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    logger.info("Active-PR refresh: scanning for open PRs to poll")

    today = datetime.now(timezone.utc).date()
    dispatches = 0

    async with async_session_maker() as db:
        workspaces = (
            await db.execute(
                select(Workspace).where(Workspace.is_active == True)  # noqa: E712
            )
        ).scalars().all()

        for ws in workspaces:
            if not settings_for_workspace(ws).enabled:
                continue

            # Repos this workspace has actively adopted.
            adopted = (
                await db.execute(
                    select(Repository.full_name)
                    .join(
                        WorkspaceRepository,
                        WorkspaceRepository.repository_id == Repository.id,
                    )
                    .where(
                        WorkspaceRepository.workspace_id == ws.id,
                        WorkspaceRepository.is_active == True,  # noqa: E712
                    )
                )
            ).scalars().all()
            if not adopted:
                continue

            # Open / draft PRs only. We treat "merged" and "closed" as
            # terminal — once a PR transitions out of `open`/`draft`,
            # there's no further state to poll.
            open_prs = (
                await db.execute(
                    select(PullRequest.id).where(
                        PullRequest.repository.in_(set(adopted)),
                        PullRequest.state.in_(("open", "draft")),
                    )
                    .limit(input.max_prs_per_run)
                )
            ).scalars().all()

            for pr_id in open_prs:
                # Daily workflow_id suffix so the same PR can be re-polled
                # across days, but burst webhooks within a day dedupe.
                await dispatch(
                    "refresh_single_pr",
                    RefreshSinglePRInput(
                        pr_id=str(pr_id),
                        workspace_id=str(ws.id),
                    ),
                    task_queue=TaskQueue.SYNC,
                    workflow_id=f"refresh-pr-{pr_id}-{today.isoformat()}",
                )
                dispatches += 1

    summary = {
        "dispatches": dispatches,
        "date": today.isoformat(),
    }
    logger.info(f"Active-PR refresh enqueue complete: {summary}")
    return summary


@activity.defn
async def refresh_single_pr(input: RefreshSinglePRInput) -> dict[str, Any]:
    """Fetch the latest state for one PR and dispatch re-analysis on change.

    Cheap path: one GitHub call. Updates `state`, title, description, and
    `merged_at`/`closed_at` as needed. If the title or description text
    changed, dispatches `analyze_pr` (which deduplicates internally via the
    content hash) + `analyze_task_pr_alignment` for any linked sprint tasks.
    """
    from sqlalchemy import select

    from aexy.models.activity import PullRequest
    from aexy.models.developer import GitHubConnection
    from aexy.models.sprint import TaskGitHubLink
    from aexy.services.github_service import (
        GitHubAuthError,
        GitHubAPIError,
        GitHubNotFoundError,
        GitHubService,
    )
    from aexy.temporal.activities.analysis import AnalyzePRInput
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    async with async_session_maker() as db:
        pr = (
            await db.execute(select(PullRequest).where(PullRequest.id == input.pr_id))
        ).scalar_one_or_none()
        if not pr:
            return {"status": "not_found", "pr_id": input.pr_id}

        # If the PR is already past `open`/`draft`, the caller shouldn't
        # have dispatched us — skip cleanly.
        if pr.state not in ("open", "draft"):
            return {"status": "terminal", "pr_id": input.pr_id, "state": pr.state}

        # Find a GitHub token scoped to THIS workspace's adopter for the PR's
        # repository. Using the first global active token (the old behavior)
        # could leak another tenant's credentials at a private repo or fail
        # with permissions errors. We require an `input.workspace_id` so the
        # token always traces back to a workspace that legitimately adopted
        # the repo.
        owner, repo_name = pr.repository.split("/", 1)
        if not input.workspace_id:
            return {"status": "no_workspace_context", "pr_id": input.pr_id}

        from aexy.models.repository import Repository, WorkspaceRepository

        # WorkspaceRepository → adopter → GitHubConnection, in one join.
        token_row = (
            await db.execute(
                select(GitHubConnection)
                .join(
                    WorkspaceRepository,
                    WorkspaceRepository.adopted_by_developer_id
                    == GitHubConnection.developer_id,
                )
                .join(
                    Repository,
                    Repository.id == WorkspaceRepository.repository_id,
                )
                .where(
                    WorkspaceRepository.workspace_id == input.workspace_id,
                    WorkspaceRepository.is_active == True,  # noqa: E712
                    Repository.full_name == pr.repository,
                    GitHubConnection.auth_status == "active",
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if not token_row:
            # Workspace doesn't adopt this repo (any longer), the adopter
            # has no valid token, or auth is broken — fall through cleanly.
            return {"status": "no_token", "pr_id": input.pr_id}

        # Fetch fresh state from GitHub.
        try:
            async with GitHubService(access_token=token_row.access_token) as gh:
                fresh = await gh.get_pull_request(owner, repo_name, pr.number)
        except GitHubNotFoundError:
            # PR deleted on GitHub — leave the row alone.
            return {"status": "not_found_remote", "pr_id": input.pr_id}
        except (GitHubAuthError, GitHubAPIError) as e:
            return {"status": "fetch_failed", "pr_id": input.pr_id, "error": str(e)}

        # Detect what changed. State transitions matter for the polling
        # lifecycle; title/description changes drive re-analysis.
        old_state = pr.state
        old_title = pr.title or ""
        old_description = pr.description or ""

        # GitHub returns "merged: true" alongside "state: closed" for merged PRs;
        # normalize to our 3-value enum.
        new_state = fresh.get("state", pr.state)
        if new_state == "closed" and fresh.get("merged_at"):
            new_state = "merged"
        new_title = (fresh.get("title") or "")[:500]
        new_description = fresh.get("body") or ""

        state_changed = new_state != old_state
        title_changed = new_title != old_title
        body_changed = new_description != old_description

        if state_changed:
            pr.state = new_state
            if new_state == "merged":
                merged_at_iso = fresh.get("merged_at")
                if merged_at_iso:
                    pr.merged_at = datetime.fromisoformat(
                        merged_at_iso.replace("Z", "+00:00")
                    )
            if new_state in ("closed", "merged"):
                closed_at_iso = fresh.get("closed_at")
                if closed_at_iso:
                    pr.closed_at = datetime.fromisoformat(
                        closed_at_iso.replace("Z", "+00:00")
                    )
        if title_changed:
            pr.title = new_title
        if body_changed:
            pr.description = new_description
            # Mark for re-analysis: clear ai_analyzed_at so the next
            # analyze_pr / alignment cycle reprocesses (the prompt hash
            # changes when the body changes, so the cache won't hit).
            pr.ai_analyzed_at = None

        if not (state_changed or title_changed or body_changed):
            return {"status": "unchanged", "pr_id": input.pr_id}

        await db.commit()

        # On description changes: re-dispatch analysis. Alignment is fanned
        # out as the tail of `analyze_pr` itself so it always reads the
        # freshly-written `pr.ai_analysis`. We just need to clear the
        # alignment cursor on linked tasks so the alignment activity
        # actually recomputes (it bails out if `alignment_analyzed_at` is
        # set with no new content).
        import hashlib

        dispatched: list[str] = []
        if title_changed or body_changed:
            # Content-hash workflow_id so multiple edits in one day get
            # distinct workflow ids and don't collide.
            content = f"{new_title}\n{new_description}"
            content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()[:8]

            await dispatch(
                "analyze_pr",
                AnalyzePRInput(
                    developer_id=str(pr.developer_id),
                    pr_id=str(pr.id),
                ),
                task_queue=TaskQueue.ANALYSIS,
                workflow_id=f"analyze_pr-{pr.id}-poll-{content_hash}",
            )
            dispatched.append("analyze_pr")

            # Invalidate any prior alignment so the activity recomputes
            # next time (analyze_pr will redispatch alignment).
            await db.execute(
                TaskGitHubLink.__table__.update()
                .where(TaskGitHubLink.pull_request_id == pr.id)
                .values(alignment_analyzed_at=None)
            )
            await db.commit()

        return {
            "status": "refreshed",
            "pr_id": input.pr_id,
            "state": new_state,
            "state_changed": state_changed,
            "title_changed": title_changed,
            "body_changed": body_changed,
            "dispatched": dispatched,
        }
