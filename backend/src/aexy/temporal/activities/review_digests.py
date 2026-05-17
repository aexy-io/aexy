"""Phase B — performance-review aggregation activities.

Three activities:
  * compose_developer_review_period — per-developer rollup for any window
    (weekly / monthly / quarterly / semi_annual / yearly)
  * compose_team_review_period      — per-workspace or per-team rollup
  * enqueue_review_cycle_digests    — fan-out when a ReviewCycle is created

These sit one level above the Phase 3 weekly digests: they roll up multiple
weeks/months of activity, fold in the existing weekly InsightsSnapshot rows
when available, and produce a single review-ready narrative.
"""

from __future__ import annotations

import json
import logging
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)

DEV_REVIEW_PROMPT_VERSION = "dev-review-v1"
TEAM_REVIEW_PROMPT_VERSION = "team-review-v1"

# Recognized review-period names. These match the values
# `_get_period_boundaries` in `temporal/activities/insights.py` accepts.
ALLOWED_PERIODS = {
    "weekly",
    "monthly",
    "quarterly",
    "semi_annual",
    "yearly",
    # `custom` skips period-boundary logic — caller passes explicit start/end.
    "custom",
}


@dataclass
class ComposeDeveloperReviewInput:
    developer_id: str
    workspace_id: str
    period_type: str  # weekly | monthly | quarterly | semi_annual | yearly | custom
    period_start_iso: str
    period_end_iso: str
    cycle_id: str | None = None  # links snapshot back to a ReviewCycle


@dataclass
class ComposeTeamReviewInput:
    workspace_id: str
    team_id: str | None  # null = workspace-wide
    period_type: str
    period_start_iso: str
    period_end_iso: str
    cycle_id: str | None = None


@dataclass
class EnqueueReviewCycleDigestsInput:
    """Fan-out triggered when a ReviewCycle is created. Dispatches a
    per-participant developer digest + (optionally) team digests."""

    cycle_id: str


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _safe_parse_json(raw: str) -> dict[str, Any]:
    stripped = raw.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", stripped, re.DOTALL)
    if fence:
        stripped = fence.group(1).strip()
    try:
        parsed = json.loads(stripped)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    return {"summary": raw[:2000], "_unparsed": True}


# ─── Developer review digest ────────────────────────────────────────────


_DEV_REVIEW_SYSTEM_PROMPT = """You are an engineering manager writing the engineering portion of a performance review.
You will receive a developer's activity stats over a review period plus per-week digests already generated for them. Output ONE JSON object:
  headline: one sentence — the dominant theme of their period
  shipped: list of 1-8 short bullets — concrete things they delivered
  growth: list of 0-5 short bullets — new skills, tech, or ownership demonstrated
  strengths: list of 0-3 short bullets — sustained patterns of high-quality work
  areas_to_invest: list of 0-3 short bullets — places to invest time next period
  blockers: list of 0-3 short bullets — recurring friction signals (lots of reverts, large unreviewed PRs, late nights)
  collaboration: list of 0-3 short bullets — review give/get patterns, knowledge sharing
  confidence: float 0-1 — how confident the summary is given input volume
Return ONLY the JSON. No prose, no Markdown fences."""


@activity.defn
async def compose_developer_review_period(
    input: ComposeDeveloperReviewInput,
) -> dict[str, Any]:
    """Roll up a developer's full review period into an InsightsSnapshot.

    Aggregates commits/PRs/reviews directly, AND walks the existing
    `weekly_digest` snapshots inside the window for fine-grained
    week-by-week narrative. The output is what populates a review form.
    """
    from sqlalchemy import select

    from aexy.llm.gateway import get_llm_gateway
    from aexy.models.activity import CodeReview, Commit, PullRequest
    from aexy.models.insights_snapshot import InsightsSnapshot
    from aexy.temporal.activities.ai_digests import _workspace_repo_full_names

    logger.info(
        f"Composing developer review period for {input.developer_id} "
        f"({input.period_type} {input.period_start_iso} → {input.period_end_iso})"
    )

    if input.period_type not in ALLOWED_PERIODS:
        return {"status": "invalid_period_type", "period_type": input.period_type}

    period_start = _parse_iso(input.period_start_iso)
    period_end = _parse_iso(input.period_end_iso)

    async with async_session_maker() as db:
        existing = (
            await db.execute(
                select(InsightsSnapshot.id).where(
                    InsightsSnapshot.scope_type == "developer",
                    InsightsSnapshot.scope_id == input.developer_id,
                    InsightsSnapshot.kind == "review_summary",
                    InsightsSnapshot.period_start == period_start,
                    InsightsSnapshot.period_end == period_end,
                )
            )
        ).scalar_one_or_none()
        if existing:
            return {"status": "exists", "snapshot_id": str(existing)}

        # Workspace-scope: a developer can be a member of multiple workspaces,
        # so we filter activity to repositories THIS workspace has adopted.
        # Without this, a digest for workspace A could leak the developer's
        # work on workspace B's repos.
        repo_full_names = await _workspace_repo_full_names(db, input.workspace_id)
        if not repo_full_names:
            snapshot = InsightsSnapshot(
                scope_type="developer",
                scope_id=input.developer_id,
                workspace_id=input.workspace_id,
                kind="review_summary",
                period_start=period_start,
                period_end=period_end,
                payload={
                    "prompt_version": DEV_REVIEW_PROMPT_VERSION,
                    "period_type": input.period_type,
                    "cycle_id": input.cycle_id,
                    "headline": "Workspace has not adopted any repositories yet.",
                    "metrics": {"commits": 0, "prs": 0, "reviews": 0},
                    "shipped": [],
                    "growth": [],
                    "strengths": [],
                    "areas_to_invest": [],
                    "blockers": [],
                    "collaboration": [],
                    "week_by_week": [],
                    "confidence": 1.0,
                },
            )
            db.add(snapshot)
            await db.commit()
            return {"status": "no_adopted_repos", "snapshot_id": str(snapshot.id)}

        commits = (
            await db.execute(
                select(Commit).where(
                    Commit.developer_id == input.developer_id,
                    Commit.repository.in_(repo_full_names),
                    Commit.committed_at >= period_start,
                    Commit.committed_at < period_end,
                )
            )
        ).scalars().all()
        prs = (
            await db.execute(
                select(PullRequest).where(
                    PullRequest.developer_id == input.developer_id,
                    PullRequest.repository.in_(repo_full_names),
                    PullRequest.created_at_github >= period_start,
                    PullRequest.created_at_github < period_end,
                )
            )
        ).scalars().all()
        reviews = (
            await db.execute(
                select(CodeReview).where(
                    CodeReview.developer_id == input.developer_id,
                    CodeReview.repository.in_(repo_full_names),
                    CodeReview.submitted_at >= period_start,
                    CodeReview.submitted_at < period_end,
                )
            )
        ).scalars().all()

        # Roll up the existing weekly_digest snapshots inside this window —
        # the LLM has already paid the per-week token cost; we reuse them
        # as condensed weekly bullet points instead of re-summarising raw
        # activity.
        weekly_digests = (
            await db.execute(
                select(InsightsSnapshot).where(
                    InsightsSnapshot.scope_type == "developer",
                    InsightsSnapshot.scope_id == input.developer_id,
                    InsightsSnapshot.kind == "weekly_digest",
                    InsightsSnapshot.period_start >= period_start,
                    InsightsSnapshot.period_end <= period_end,
                )
                .order_by(InsightsSnapshot.period_start.asc())
            )
        ).scalars().all()

        # Empty period — write a placeholder so the review form still
        # has something to show.
        if not (commits or prs or reviews or weekly_digests):
            snapshot = InsightsSnapshot(
                scope_type="developer",
                scope_id=input.developer_id,
                workspace_id=input.workspace_id,
                kind="review_summary",
                period_start=period_start,
                period_end=period_end,
                payload={
                    "prompt_version": DEV_REVIEW_PROMPT_VERSION,
                    "period_type": input.period_type,
                    "cycle_id": input.cycle_id,
                    "headline": "No engineering activity recorded for this period.",
                    "metrics": {"commits": 0, "prs": 0, "reviews": 0},
                    "shipped": [],
                    "growth": [],
                    "strengths": [],
                    "areas_to_invest": [],
                    "blockers": [],
                    "collaboration": [],
                    "week_by_week": [],
                    "confidence": 1.0,
                },
            )
            db.add(snapshot)
            await db.commit()
            return {"status": "no_activity", "snapshot_id": str(snapshot.id)}

        # Deterministic aggregates (no LLM cost).
        commit_categories: Counter[str] = Counter()
        languages: Counter[str] = Counter()
        for c in commits:
            commit_categories[c.change_class or "code"] += 1
            for lang in c.languages or []:
                languages[lang] += 1
        pr_size_dist: Counter[str] = Counter()
        merged_prs = 0
        for pr in prs:
            pr_size_dist[pr.size_bucket or "unknown"] += 1
            if pr.merged_at is not None:
                merged_prs += 1

        # Distill each weekly_digest down to a compact summary the LLM
        # can fold into its narrative without re-paying the per-week cost.
        week_by_week = []
        for snap in weekly_digests:
            payload = snap.payload or {}
            week_by_week.append(
                {
                    "period_start": snap.period_start.isoformat(),
                    "period_end": snap.period_end.isoformat(),
                    "headline": payload.get("headline"),
                    "metrics": payload.get("metrics", {}),
                    # Cap the bullets so the rollup prompt doesn't blow up
                    # token-wise on long periods.
                    "what_shipped": (payload.get("what_shipped") or [])[:3],
                    "blockers": (payload.get("blockers") or [])[:2],
                }
            )

        metrics = {
            "commits": len(commits),
            "merge_commits": sum(1 for c in commits if c.is_merge),
            "reverts": sum(1 for c in commits if c.is_revert),
            "prs_opened": len(prs),
            "prs_merged": merged_prs,
            "reviews_given": len(reviews),
        }

        user_payload = {
            "period_type": input.period_type,
            "period_start": input.period_start_iso,
            "period_end": input.period_end_iso,
            "metrics": metrics,
            "commit_categories": dict(commit_categories),
            "pr_size_distribution": dict(pr_size_dist),
            "languages_touched": [name for name, _ in languages.most_common(10)],
            "week_by_week": week_by_week,
        }

        gateway = get_llm_gateway()
        if gateway is None:
            snapshot = InsightsSnapshot(
                scope_type="developer",
                scope_id=input.developer_id,
                workspace_id=input.workspace_id,
                kind="review_summary",
                period_start=period_start,
                period_end=period_end,
                payload={
                    "prompt_version": DEV_REVIEW_PROMPT_VERSION,
                    "period_type": input.period_type,
                    "cycle_id": input.cycle_id,
                    "headline": "AI review summary unavailable (no LLM provider configured).",
                    "metrics": metrics,
                    "shipped": [],
                    "growth": [],
                    "strengths": [],
                    "areas_to_invest": [],
                    "blockers": [],
                    "collaboration": [],
                    "week_by_week": week_by_week,
                    "confidence": 0.0,
                    "_raw_stats": user_payload,
                },
            )
            db.add(snapshot)
            await db.commit()
            return {"status": "no_llm", "snapshot_id": str(snapshot.id)}

        try:
            response_text, total_tokens, input_tokens, output_tokens = (
                await gateway.call_llm(
                    system_prompt=_DEV_REVIEW_SYSTEM_PROMPT,
                    user_prompt=(
                        "Compose the developer review summary. Return JSON per the system prompt.\n\n"
                        + json.dumps(user_payload, indent=2)
                    ),
                    tokens_estimate=4000,
                    workspace_id=input.workspace_id,
                    developer_id=input.developer_id,
                )
            )
        except Exception as e:
            logger.exception(f"Developer review LLM call failed: {e}")
            raise

        review = _safe_parse_json(response_text)
        review.setdefault("prompt_version", DEV_REVIEW_PROMPT_VERSION)
        review["period_type"] = input.period_type
        review["cycle_id"] = input.cycle_id
        review["metrics"] = metrics
        review["week_by_week"] = week_by_week

        snapshot = InsightsSnapshot(
            scope_type="developer",
            scope_id=input.developer_id,
            workspace_id=input.workspace_id,
            kind="review_summary",
            period_start=period_start,
            period_end=period_end,
            payload=review,
            model=getattr(gateway.provider, "model", None),
            token_usage={
                "input": input_tokens,
                "output": output_tokens,
                "total": total_tokens,
            },
        )
        db.add(snapshot)
        await db.commit()

        return {
            "status": "composed",
            "snapshot_id": str(snapshot.id),
            "token_usage": {
                "input": input_tokens,
                "output": output_tokens,
                "total": total_tokens,
            },
        }


# ─── Team review digest ─────────────────────────────────────────────────


_TEAM_REVIEW_SYSTEM_PROMPT = """You are a director of engineering writing a team-level review.
You will receive per-developer review summaries plus cross-team metrics. Output ONE JSON object:
  headline: one sentence — what defined the team this period
  highlights: list of 0-5 bullets — member-level standouts (use names)
  cross_team_patterns: list of 0-3 bullets — collaboration & process observations
  knowledge_risks: list of 0-3 bullets — hotspots with few authors / single-owner code
  team_strengths: list of 0-3 bullets
  team_growth_areas: list of 0-3 bullets
  confidence: float 0-1
Return ONLY the JSON."""


@activity.defn
async def compose_team_review_period(
    input: ComposeTeamReviewInput,
) -> dict[str, Any]:
    """Roll up team-level signals from per-member review summaries."""
    from sqlalchemy import select

    from aexy.llm.gateway import get_llm_gateway
    from aexy.models.developer import Developer
    from aexy.models.insights_snapshot import InsightsSnapshot
    from aexy.models.team import TeamMember
    from aexy.models.workspace import WorkspaceMember

    logger.info(
        f"Composing team review for workspace={input.workspace_id} team={input.team_id} "
        f"({input.period_type} {input.period_start_iso} → {input.period_end_iso})"
    )

    if input.period_type not in ALLOWED_PERIODS:
        return {"status": "invalid_period_type", "period_type": input.period_type}

    period_start = _parse_iso(input.period_start_iso)
    period_end = _parse_iso(input.period_end_iso)

    async with async_session_maker() as db:
        scope_id = input.team_id or input.workspace_id
        scope_type = "team" if input.team_id else "workspace"

        existing = (
            await db.execute(
                select(InsightsSnapshot.id).where(
                    InsightsSnapshot.scope_type == scope_type,
                    InsightsSnapshot.scope_id == scope_id,
                    InsightsSnapshot.kind == "team_review_summary",
                    InsightsSnapshot.period_start == period_start,
                    InsightsSnapshot.period_end == period_end,
                )
            )
        ).scalar_one_or_none()
        if existing:
            return {"status": "exists", "snapshot_id": str(existing)}

        # Resolve member developer ids.
        if input.team_id:
            # Validate the team actually belongs to this workspace —
            # otherwise an admin could roll up activity from teams owned
            # by another workspace.
            from aexy.models.team import Team

            team = await db.get(Team, input.team_id)
            if team is None or str(team.workspace_id) != str(input.workspace_id):
                return {"status": "team_not_in_workspace"}
            member_rows = (
                await db.execute(
                    select(TeamMember.developer_id).where(
                        TeamMember.team_id == input.team_id,
                    )
                )
            ).scalars().all()
        else:
            member_rows = (
                await db.execute(
                    select(WorkspaceMember.developer_id).where(
                        WorkspaceMember.workspace_id == input.workspace_id,
                    )
                )
            ).scalars().all()
        member_ids = [str(m) for m in member_rows]

        if not member_ids:
            return {"status": "no_members"}

        # Load each member's review_summary snapshot for this period.
        # Scope per-member snapshots to THIS workspace — otherwise we'd
        # pull review summaries from any other workspace the developer is
        # in. The compose_developer_review_period activity writes
        # workspace_id alongside scope_id, so this filter is sufficient.
        per_member_snapshots = (
            await db.execute(
                select(InsightsSnapshot, Developer.name).join(
                    Developer,
                    Developer.id == InsightsSnapshot.scope_id,
                ).where(
                    InsightsSnapshot.scope_type == "developer",
                    InsightsSnapshot.scope_id.in_(member_ids),
                    InsightsSnapshot.workspace_id == input.workspace_id,
                    InsightsSnapshot.kind == "review_summary",
                    InsightsSnapshot.period_start == period_start,
                    InsightsSnapshot.period_end == period_end,
                )
            )
        ).all()

        member_summaries: list[dict[str, Any]] = []
        for snap, name in per_member_snapshots:
            payload = snap.payload or {}
            member_summaries.append(
                {
                    "developer_id": snap.scope_id,
                    "name": name,
                    "headline": payload.get("headline"),
                    "metrics": payload.get("metrics", {}),
                    "shipped": (payload.get("shipped") or [])[:5],
                    "strengths": (payload.get("strengths") or [])[:3],
                    "blockers": (payload.get("blockers") or [])[:3],
                }
            )

        if not member_summaries:
            return {"status": "no_member_summaries"}

        # Aggregate team-level metrics.
        team_metrics = {"commits": 0, "prs_merged": 0, "reviews_given": 0}
        for m in member_summaries:
            for k, v in (m.get("metrics") or {}).items():
                if k in team_metrics and isinstance(v, (int, float)):
                    team_metrics[k] += int(v)

        user_payload = {
            "scope": scope_type,
            "scope_id": scope_id,
            "period_type": input.period_type,
            "period_start": input.period_start_iso,
            "period_end": input.period_end_iso,
            "team_metrics": team_metrics,
            "member_summaries": member_summaries,
        }

        gateway = get_llm_gateway()
        if gateway is None:
            snapshot = InsightsSnapshot(
                scope_type=scope_type,
                scope_id=scope_id,
                workspace_id=input.workspace_id,
                kind="team_review_summary",
                period_start=period_start,
                period_end=period_end,
                payload={
                    "prompt_version": TEAM_REVIEW_PROMPT_VERSION,
                    "period_type": input.period_type,
                    "cycle_id": input.cycle_id,
                    "headline": "AI team review unavailable (no LLM provider configured).",
                    "team_metrics": team_metrics,
                    "highlights": [],
                    "cross_team_patterns": [],
                    "knowledge_risks": [],
                    "team_strengths": [],
                    "team_growth_areas": [],
                    "members": member_summaries,
                    "confidence": 0.0,
                },
            )
            db.add(snapshot)
            await db.commit()
            return {"status": "no_llm", "snapshot_id": str(snapshot.id)}

        try:
            response_text, total_tokens, input_tokens, output_tokens = (
                await gateway.call_llm(
                    system_prompt=_TEAM_REVIEW_SYSTEM_PROMPT,
                    user_prompt=(
                        "Compose the team review summary. Return JSON per the system prompt.\n\n"
                        + json.dumps(user_payload, indent=2)
                    ),
                    tokens_estimate=5000,
                    workspace_id=input.workspace_id,
                )
            )
        except Exception as e:
            logger.exception(f"Team review LLM call failed: {e}")
            raise

        review = _safe_parse_json(response_text)
        review.setdefault("prompt_version", TEAM_REVIEW_PROMPT_VERSION)
        review["period_type"] = input.period_type
        review["cycle_id"] = input.cycle_id
        review["team_metrics"] = team_metrics
        review["members"] = member_summaries

        snapshot = InsightsSnapshot(
            scope_type=scope_type,
            scope_id=scope_id,
            workspace_id=input.workspace_id,
            kind="team_review_summary",
            period_start=period_start,
            period_end=period_end,
            payload=review,
            model=getattr(gateway.provider, "model", None),
            token_usage={
                "input": input_tokens,
                "output": output_tokens,
                "total": total_tokens,
            },
        )
        db.add(snapshot)
        await db.commit()

        return {
            "status": "composed",
            "snapshot_id": str(snapshot.id),
            "token_usage": {
                "input": input_tokens,
                "output": output_tokens,
                "total": total_tokens,
            },
        }


# ─── ReviewCycle auto fan-out ───────────────────────────────────────────


@activity.defn
async def enqueue_review_cycle_digests(
    input: EnqueueReviewCycleDigestsInput,
) -> dict[str, Any]:
    """Fired when a ReviewCycle is created. Dispatches per-participant
    `compose_developer_review_period` jobs + a workspace-level team digest.
    """
    from sqlalchemy import select

    from aexy.models.review import ReviewCycle, IndividualReview
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    logger.info(f"Enqueueing review-cycle digests for cycle {input.cycle_id}")

    async with async_session_maker() as db:
        cycle = await db.get(ReviewCycle, input.cycle_id)
        if not cycle:
            return {"status": "cycle_not_found", "cycle_id": input.cycle_id}

        # Map ReviewCycle.cycle_type → our period_type taxonomy. Anything
        # we don't recognise falls back to `custom` (use period_start/end
        # verbatim, no boundary alignment).
        type_map = {
            "weekly": "weekly",
            "monthly": "monthly",
            "quarterly": "quarterly",
            "semi_annual": "semi_annual",
            "biannual": "semi_annual",
            "annual": "yearly",
            "yearly": "yearly",
        }
        period_type = type_map.get(cycle.cycle_type, "custom")
        period_start = cycle.period_start
        period_end = cycle.period_end
        if not period_start or not period_end:
            return {"status": "cycle_missing_dates", "cycle_id": input.cycle_id}

        # Reviewees are the developer_id field on IndividualReview rows.
        reviewees = (
            await db.execute(
                select(IndividualReview.developer_id).where(
                    IndividualReview.review_cycle_id == input.cycle_id,
                )
            )
        ).scalars().all()

        dispatches = 0
        for reviewee_id in reviewees:
            await dispatch(
                "compose_developer_review_period",
                ComposeDeveloperReviewInput(
                    developer_id=str(reviewee_id),
                    workspace_id=str(cycle.workspace_id),
                    period_type=period_type,
                    period_start_iso=period_start.isoformat()
                    if hasattr(period_start, "isoformat")
                    else str(period_start),
                    period_end_iso=period_end.isoformat()
                    if hasattr(period_end, "isoformat")
                    else str(period_end),
                    cycle_id=str(input.cycle_id),
                ),
                task_queue=TaskQueue.ANALYSIS,
                workflow_id=(
                    f"dev-review-{input.cycle_id}-{reviewee_id}"
                ),
            )
            dispatches += 1

        # Workspace-level team digest. Single dispatch covers the whole
        # workspace; per-team digests can be opted in later.
        await dispatch(
            "compose_team_review_period",
            ComposeTeamReviewInput(
                workspace_id=str(cycle.workspace_id),
                team_id=None,
                period_type=period_type,
                period_start_iso=period_start.isoformat()
                if hasattr(period_start, "isoformat")
                else str(period_start),
                period_end_iso=period_end.isoformat()
                if hasattr(period_end, "isoformat")
                else str(period_end),
                cycle_id=str(input.cycle_id),
            ),
            task_queue=TaskQueue.ANALYSIS,
            workflow_id=f"team-review-{input.cycle_id}",
        )

        return {
            "status": "enqueued",
            "cycle_id": str(input.cycle_id),
            "developer_digests": dispatches,
            "team_digest": 1,
        }
