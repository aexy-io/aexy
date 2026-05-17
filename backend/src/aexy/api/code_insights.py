"""Read endpoints for AI-derived analysis on commits / PRs / reviews.

Surfaces the JSONB payloads written by the Phase 1 analysis activities:
  * commits.semantic_analysis
  * pull_requests.ai_analysis
  * code_reviews.quality_metrics

These are lazy-loaded by the frontend on the PR-detail / commit-detail views
so list endpoints stay slim.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.activity import CodeReview, Commit, PullRequest
from aexy.models.developer import Developer
from aexy.models.repository import Repository, WorkspaceRepository
from aexy.models.workspace import WorkspaceMember

router = APIRouter(prefix="/code-insights", tags=["Code Insights"])


async def _user_can_read_repo(
    db: AsyncSession, developer_id: str, repository_full_name: str
) -> bool:
    """User can read AI insights iff they're a member of any workspace that
    adopted the repo (matched by full_name since activity rows store the
    full_name string, not the repository id)."""
    stmt = (
        select(WorkspaceRepository.id)
        .join(Repository, Repository.id == WorkspaceRepository.repository_id)
        .join(
            WorkspaceMember,
            WorkspaceMember.workspace_id == WorkspaceRepository.workspace_id,
        )
        .where(
            Repository.full_name == repository_full_name,
            WorkspaceMember.developer_id == developer_id,
            WorkspaceRepository.is_active == True,  # noqa: E712
        )
        .limit(1)
    )
    return (await db.execute(stmt)).first() is not None


@router.get("/commits/{commit_id}")
async def get_commit_insight(
    commit_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict:
    commit = (
        await db.execute(select(Commit).where(Commit.id == commit_id))
    ).scalar_one_or_none()
    if not commit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Commit not found")
    if not await _user_can_read_repo(db, str(current_user.id), commit.repository):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    return {
        "commit_id": commit_id,
        "sha": commit.sha,
        "author_class": commit.author_class,
        "change_class": commit.change_class,
        "is_merge": commit.is_merge,
        "is_revert": commit.is_revert,
        "analysis": commit.semantic_analysis,
        "analyzed_at": commit.ai_analyzed_at.isoformat() if commit.ai_analyzed_at else None,
    }


@router.get("/pull-requests/{pr_id}")
async def get_pr_insight(
    pr_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict:
    pr = (
        await db.execute(select(PullRequest).where(PullRequest.id == pr_id))
    ).scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PR not found")
    if not await _user_can_read_repo(db, str(current_user.id), pr.repository):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    return {
        "pr_id": pr_id,
        "github_id": pr.github_id,
        "number": pr.number,
        "size_bucket": pr.size_bucket,
        "analysis": pr.ai_analysis,
        "analyzed_at": pr.ai_analyzed_at.isoformat() if pr.ai_analyzed_at else None,
    }


@router.get("/reviews/{review_id}")
async def get_review_insight(
    review_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict:
    review = (
        await db.execute(select(CodeReview).where(CodeReview.id == review_id))
    ).scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    if not await _user_can_read_repo(db, str(current_user.id), review.repository):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    return {
        "review_id": review_id,
        "github_id": review.github_id,
        "state": review.state,
        "quality_metrics": review.quality_metrics,
        "analyzed_at": review.ai_analyzed_at.isoformat() if review.ai_analyzed_at else None,
    }


@router.get("/pull-requests/{pr_id}/similar")
async def get_similar_prs(
    pr_id: str,
    limit: int = 5,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Find PRs with semantically-similar descriptions (pgvector cosine).

    Restricts the candidate set to PRs in repos the requesting user can read.
    Returns at most `limit` matches, ordered by ascending cosine distance
    (smaller = more similar).
    """
    pr = (
        await db.execute(select(PullRequest).where(PullRequest.id == pr_id))
    ).scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PR not found")
    if not await _user_can_read_repo(db, str(current_user.id), pr.repository):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    if pr.embedding is None:
        return {"pr_id": pr_id, "matches": [], "reason": "not_embedded"}

    # Find repos this user has access to so cross-workspace PR leakage isn't possible.
    accessible_repos = (
        await db.execute(
            select(Repository.full_name)
            .join(WorkspaceRepository, WorkspaceRepository.repository_id == Repository.id)
            .join(
                WorkspaceMember,
                WorkspaceMember.workspace_id == WorkspaceRepository.workspace_id,
            )
            .where(
                WorkspaceMember.developer_id == str(current_user.id),
                WorkspaceRepository.is_active == True,  # noqa: E712
            )
        )
    ).scalars().all()
    if not accessible_repos:
        return {"pr_id": pr_id, "matches": []}

    # cosine_distance from pgvector. Smaller is more similar.
    distance = PullRequest.embedding.cosine_distance(pr.embedding)
    rows = (
        await db.execute(
            select(
                PullRequest.id,
                PullRequest.number,
                PullRequest.title,
                PullRequest.repository,
                distance.label("distance"),
            )
            .where(
                PullRequest.embedding.is_not(None),
                PullRequest.id != pr_id,
                PullRequest.repository.in_(set(accessible_repos)),
            )
            .order_by(distance.asc())
            .limit(max(1, min(limit, 25)))
        )
    ).all()

    return {
        "pr_id": pr_id,
        "matches": [
            {
                "pr_id": str(row.id),
                "number": row.number,
                "title": row.title,
                "repository": row.repository,
                # Cosine *similarity* (1 - distance) reads better in a UI.
                "similarity": max(0.0, 1.0 - float(row.distance)),
            }
            for row in rows
        ],
    }


@router.get("/pull-requests/{pr_id}/reviewer-suggestions")
async def get_reviewer_suggestions(
    pr_id: str,
    limit: int = 5,
    similar_pr_pool: int = 20,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Suggest reviewers based on who has worked on semantically-similar past PRs.

    Algorithm:
      1. Find the top-`similar_pr_pool` PRs by cosine similarity (excluding this PR
         and PRs from inaccessible repos).
      2. For each match, the PR author and its reviewers count as "experienced
         with this kind of change". Weight by similarity × recency.
      3. Exclude the current PR's author from the suggestions.
      4. Return up to `limit` developers, each with a score and a short rationale.

    No LLM calls — pure ranking. Surfacing the model output to the user is the
    UI's job.
    """
    from datetime import datetime, timezone

    from aexy.models.activity import CodeReview
    from aexy.models.developer import Developer as DeveloperModel, GitHubConnection

    pr = (
        await db.execute(select(PullRequest).where(PullRequest.id == pr_id))
    ).scalar_one_or_none()
    if not pr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PR not found")
    if not await _user_can_read_repo(db, str(current_user.id), pr.repository):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    if pr.embedding is None:
        return {"pr_id": pr_id, "suggestions": [], "reason": "not_embedded"}

    accessible_repos = (
        await db.execute(
            select(Repository.full_name)
            .join(WorkspaceRepository, WorkspaceRepository.repository_id == Repository.id)
            .join(
                WorkspaceMember,
                WorkspaceMember.workspace_id == WorkspaceRepository.workspace_id,
            )
            .where(
                WorkspaceMember.developer_id == str(current_user.id),
                WorkspaceRepository.is_active == True,  # noqa: E712
            )
        )
    ).scalars().all()
    if not accessible_repos:
        return {"pr_id": pr_id, "suggestions": []}

    # Pull the top-N similar PRs with metadata we'll need for ranking.
    distance = PullRequest.embedding.cosine_distance(pr.embedding)
    pool_rows = (
        await db.execute(
            select(
                PullRequest.id,
                PullRequest.number,
                PullRequest.repository,
                PullRequest.developer_id,
                PullRequest.github_id,
                PullRequest.created_at_github,
                distance.label("distance"),
            )
            .where(
                PullRequest.embedding.is_not(None),
                PullRequest.id != pr_id,
                PullRequest.repository.in_(set(accessible_repos)),
            )
            .order_by(distance.asc())
            .limit(max(1, min(similar_pr_pool, 50)))
        )
    ).all()
    if not pool_rows:
        return {"pr_id": pr_id, "suggestions": []}

    # Build a recency factor that decays smoothly with age. ~6 months half-life.
    now = datetime.now(timezone.utc)
    half_life_days = 180.0

    def recency_weight(created_at) -> float:
        if not created_at:
            return 0.25
        age_days = max(0.0, (now - created_at).total_seconds() / 86_400.0)
        # Exponential decay: 1.0 at age 0, ~0.5 at half_life_days
        return 0.5 ** (age_days / half_life_days)

    # Collect reviewers per similar PR — one query, group in Python.
    similar_pr_github_ids = [row.github_id for row in pool_rows]
    reviews = (
        await db.execute(
            select(
                CodeReview.pull_request_github_id,
                CodeReview.developer_id,
            ).where(
                CodeReview.pull_request_github_id.in_(similar_pr_github_ids),
                CodeReview.state.in_(("approved", "changes_requested", "commented")),
            )
        )
    ).all()
    reviewers_by_pr: dict[int, set[str]] = {}
    for github_id, dev_id in reviews:
        reviewers_by_pr.setdefault(github_id, set()).add(str(dev_id))

    # Scoring: each similar PR contributes (1 - distance) × recency × role_weight
    # to its author (weight 1.0) and reviewers (weight 0.6).
    scores: dict[str, float] = {}
    evidence: dict[str, list[dict]] = {}
    for row in pool_rows:
        similarity = max(0.0, 1.0 - float(row.distance))
        recency = recency_weight(row.created_at_github)
        base = similarity * recency

        # Author contribution
        author_id = str(row.developer_id)
        if author_id and author_id != str(pr.developer_id):
            scores[author_id] = scores.get(author_id, 0.0) + base
            evidence.setdefault(author_id, []).append(
                {
                    "pr_number": row.number,
                    "repository": row.repository,
                    "role": "author",
                    "similarity": round(similarity, 3),
                }
            )

        # Reviewer contribution
        for reviewer_id in reviewers_by_pr.get(row.github_id, set()):
            if reviewer_id == str(pr.developer_id):
                continue
            scores[reviewer_id] = scores.get(reviewer_id, 0.0) + base * 0.6
            evidence.setdefault(reviewer_id, []).append(
                {
                    "pr_number": row.number,
                    "repository": row.repository,
                    "role": "reviewer",
                    "similarity": round(similarity, 3),
                }
            )

    if not scores:
        return {"pr_id": pr_id, "suggestions": []}

    # Sort + hydrate developer info (left-join GitHubConnection for the handle).
    top_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)[: max(1, min(limit, 20))]
    dev_rows = (
        await db.execute(
            select(
                DeveloperModel.id,
                DeveloperModel.name,
                DeveloperModel.avatar_url,
                GitHubConnection.github_username,
            )
            .outerjoin(
                GitHubConnection,
                GitHubConnection.developer_id == DeveloperModel.id,
            )
            .where(DeveloperModel.id.in_(top_ids))
        )
    ).all()
    devs_by_id = {str(row.id): row for row in dev_rows}

    suggestions = []
    for dev_id in top_ids:
        row = devs_by_id.get(dev_id)
        if not row:
            continue
        # Trim evidence to the top 3 most-relevant similar PRs for this person.
        relevant = sorted(
            evidence.get(dev_id, []),
            key=lambda e: e["similarity"],
            reverse=True,
        )[:3]
        suggestions.append(
            {
                "developer_id": dev_id,
                "name": row.name,
                "github_username": row.github_username,
                "avatar_url": row.avatar_url,
                "score": round(scores[dev_id], 3),
                "evidence": relevant,
            }
        )

    return {
        "pr_id": pr_id,
        "suggestions": suggestions,
    }


@router.post("/reviews/generate")
async def generate_review_digest(
    payload: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Manually trigger a developer or team review digest.

    Body:
      {
        "scope_type": "developer" | "team" | "workspace",
        "scope_id":   "<uuid>",
        "workspace_id": "<uuid>",
        "period_type": "weekly" | "monthly" | "quarterly" | "semi_annual" | "yearly" | "custom",
        "period_start"?: ISO8601,    # required if period_type=custom
        "period_end"?:   ISO8601,    # required if period_type=custom
      }

    Returns the dispatched workflow id. Caller polls
    GET /code-insights/snapshots?... to see the resulting snapshot.
    """
    from aexy.services.workspace_service import WorkspaceService
    from aexy.temporal.activities.insights import _get_period_boundaries
    from aexy.temporal.activities.review_digests import (
        ComposeDeveloperReviewInput,
        ComposeTeamReviewInput,
    )
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    scope_type = payload.get("scope_type")
    scope_id = payload.get("scope_id")
    workspace_id = payload.get("workspace_id")
    period_type = payload.get("period_type", "monthly")

    if scope_type not in {"developer", "team", "workspace"}:
        raise HTTPException(status_code=400, detail="Invalid scope_type")
    if not scope_id or not workspace_id:
        raise HTTPException(status_code=400, detail="scope_id and workspace_id required")

    # Caller must be a workspace member.
    ws_service = WorkspaceService(db)
    if not await ws_service.check_permission(
        workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")

    # Resolve the period window.
    if period_type == "custom":
        period_start_iso = payload.get("period_start")
        period_end_iso = payload.get("period_end")
        if not (period_start_iso and period_end_iso):
            raise HTTPException(
                status_code=400,
                detail="period_start and period_end required for custom period_type",
            )
    else:
        start, end = _get_period_boundaries(period_type)
        period_start_iso = start.isoformat()
        period_end_iso = end.isoformat()

    if scope_type == "developer":
        workflow_id = await dispatch(
            "compose_developer_review_period",
            ComposeDeveloperReviewInput(
                developer_id=scope_id,
                workspace_id=workspace_id,
                period_type=period_type,
                period_start_iso=period_start_iso,
                period_end_iso=period_end_iso,
            ),
            task_queue=TaskQueue.ANALYSIS,
            workflow_id=f"dev-review-manual-{scope_id}-{period_type}-{period_start_iso[:10]}",
        )
    else:
        # team or workspace
        team_id = scope_id if scope_type == "team" else None
        workflow_id = await dispatch(
            "compose_team_review_period",
            ComposeTeamReviewInput(
                workspace_id=workspace_id,
                team_id=team_id,
                period_type=period_type,
                period_start_iso=period_start_iso,
                period_end_iso=period_end_iso,
            ),
            task_queue=TaskQueue.ANALYSIS,
            workflow_id=f"team-review-manual-{scope_id}-{period_type}-{period_start_iso[:10]}",
        )

    return {
        "workflow_id": workflow_id,
        "scope_type": scope_type,
        "scope_id": scope_id,
        "period_type": period_type,
        "period_start": period_start_iso,
        "period_end": period_end_iso,
    }


@router.get("/task-pr-links/{link_id}/alignment")
async def get_task_pr_alignment(
    link_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return the LLM-derived alignment between a SprintTask and a linked PR."""
    from aexy.models.sprint import SprintTask, TaskGitHubLink

    link = await db.get(TaskGitHubLink, link_id)
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")

    pr = (
        await db.execute(
            select(PullRequest).where(PullRequest.id == link.pull_request_id)
        )
    ).scalar_one_or_none()
    if pr and not await _user_can_read_repo(db, str(current_user.id), pr.repository):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    task = await db.get(SprintTask, link.task_id)
    return {
        "link_id": link_id,
        "task_id": link.task_id,
        "task_title": task.title if task else None,
        "pull_request_id": link.pull_request_id,
        "pull_request_number": pr.number if pr else None,
        "alignment": link.alignment,
        "analyzed_at": (
            link.alignment_analyzed_at.isoformat()
            if link.alignment_analyzed_at
            else None
        ),
    }


@router.get("/llm-usage")
async def get_llm_usage(
    workspace_id: str,
    days: int = 30,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Aggregate LLM token usage for a workspace.

    Reads `llm_prompt_logs` rows for the workspace over the last `days`
    days and rolls them up by day, by provider, and by operation. Used
    by /settings/insights to surface the AI cost story.

    Admin-only. Numbers are token counts (input + output); cost can be
    inferred client-side using a per-provider price card.
    """
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import func as sa_func

    from aexy.models.llm_prompt_log import LLMPromptLog
    from aexy.services.workspace_service import WorkspaceService

    days = max(1, min(days, 90))

    ws_service = WorkspaceService(db)
    if not await ws_service.check_permission(
        workspace_id, str(current_user.id), "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    since = datetime.now(timezone.utc) - timedelta(days=days)

    # Totals (single SELECT).
    totals_row = (
        await db.execute(
            select(
                sa_func.count(LLMPromptLog.id).label("calls"),
                sa_func.coalesce(sa_func.sum(LLMPromptLog.input_tokens), 0).label("input_tokens"),
                sa_func.coalesce(sa_func.sum(LLMPromptLog.output_tokens), 0).label("output_tokens"),
                sa_func.coalesce(sa_func.sum(LLMPromptLog.total_tokens), 0).label("total_tokens"),
            ).where(
                LLMPromptLog.workspace_id == workspace_id,
                LLMPromptLog.created_at >= since,
            )
        )
    ).one()

    # Per-day series.
    day_col = sa_func.date_trunc("day", LLMPromptLog.created_at).label("day")
    by_day_rows = (
        await db.execute(
            select(
                day_col,
                sa_func.count(LLMPromptLog.id).label("calls"),
                sa_func.coalesce(sa_func.sum(LLMPromptLog.input_tokens), 0).label("input_tokens"),
                sa_func.coalesce(sa_func.sum(LLMPromptLog.output_tokens), 0).label("output_tokens"),
            )
            .where(
                LLMPromptLog.workspace_id == workspace_id,
                LLMPromptLog.created_at >= since,
            )
            .group_by(day_col)
            .order_by(day_col.asc())
        )
    ).all()

    # Per-provider rollup.
    by_provider_rows = (
        await db.execute(
            select(
                LLMPromptLog.provider,
                LLMPromptLog.model,
                sa_func.count(LLMPromptLog.id).label("calls"),
                sa_func.coalesce(sa_func.sum(LLMPromptLog.input_tokens), 0).label("input_tokens"),
                sa_func.coalesce(sa_func.sum(LLMPromptLog.output_tokens), 0).label("output_tokens"),
            )
            .where(
                LLMPromptLog.workspace_id == workspace_id,
                LLMPromptLog.created_at >= since,
            )
            .group_by(LLMPromptLog.provider, LLMPromptLog.model)
            .order_by(sa_func.sum(LLMPromptLog.total_tokens).desc().nulls_last())
        )
    ).all()

    # Per-operation rollup (top-N by token volume).
    by_operation_rows = (
        await db.execute(
            select(
                LLMPromptLog.operation,
                sa_func.count(LLMPromptLog.id).label("calls"),
                sa_func.coalesce(sa_func.sum(LLMPromptLog.input_tokens), 0).label("input_tokens"),
                sa_func.coalesce(sa_func.sum(LLMPromptLog.output_tokens), 0).label("output_tokens"),
            )
            .where(
                LLMPromptLog.workspace_id == workspace_id,
                LLMPromptLog.created_at >= since,
            )
            .group_by(LLMPromptLog.operation)
            .order_by(sa_func.sum(LLMPromptLog.total_tokens).desc().nulls_last())
            .limit(20)
        )
    ).all()

    return {
        "workspace_id": workspace_id,
        "days": days,
        "since": since.isoformat(),
        "totals": {
            "calls": int(totals_row.calls or 0),
            "input_tokens": int(totals_row.input_tokens or 0),
            "output_tokens": int(totals_row.output_tokens or 0),
            "total_tokens": int(totals_row.total_tokens or 0),
        },
        "by_day": [
            {
                "day": r.day.date().isoformat(),
                "calls": int(r.calls),
                "input_tokens": int(r.input_tokens),
                "output_tokens": int(r.output_tokens),
            }
            for r in by_day_rows
        ],
        "by_provider": [
            {
                "provider": r.provider,
                "model": r.model,
                "calls": int(r.calls),
                "input_tokens": int(r.input_tokens),
                "output_tokens": int(r.output_tokens),
            }
            for r in by_provider_rows
        ],
        "by_operation": [
            {
                "operation": r.operation or "unknown",
                "calls": int(r.calls),
                "input_tokens": int(r.input_tokens),
                "output_tokens": int(r.output_tokens),
            }
            for r in by_operation_rows
        ],
    }


# ─── Insights snapshots ────────────────────────────────────────────────


@router.get("/snapshots")
async def list_snapshots(
    workspace_id: str,
    scope_type: str,
    scope_id: str,
    kind: str | None = None,
    limit: int = 10,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return recent insights snapshots for a developer/repo/workspace.

    Requires the caller to be a member of the workspace that owns the snapshots.
    """
    from aexy.models.insights_snapshot import InsightsSnapshot
    from aexy.services.workspace_service import WorkspaceService

    if scope_type not in {"developer", "repository", "workspace"}:
        raise HTTPException(status_code=400, detail="Invalid scope_type")

    ws_service = WorkspaceService(db)
    if not await ws_service.check_permission(
        workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")

    stmt = (
        select(InsightsSnapshot)
        .where(
            InsightsSnapshot.workspace_id == workspace_id,
            InsightsSnapshot.scope_type == scope_type,
            InsightsSnapshot.scope_id == scope_id,
        )
        .order_by(InsightsSnapshot.period_start.desc())
        .limit(max(1, min(limit, 50)))
    )
    if kind:
        stmt = stmt.where(InsightsSnapshot.kind == kind)

    rows = (await db.execute(stmt)).scalars().all()
    return {
        "snapshots": [
            {
                "id": str(s.id),
                "scope_type": s.scope_type,
                "scope_id": s.scope_id,
                "kind": s.kind,
                "period_start": s.period_start.isoformat(),
                "period_end": s.period_end.isoformat(),
                "payload": s.payload,
                "model": s.model,
                "created_at": s.created_at.isoformat(),
            }
            for s in rows
        ]
    }
