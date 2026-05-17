"""Phase 3 AI-aggregation activities.

Three sibling activities + one fan-out:

  * compose_developer_digest — weekly per-developer rollup → insights_snapshots
  * compose_repo_health      — weekly per-repo rollup → insights_snapshots
  * embed_pr_summary         — backfill pull_requests.embedding
  * enqueue_workspace_weekly_digests — schedule-triggered fan-out across
    all AI-enabled workspaces

Per-artifact (Layer-1) analysis is in `activities/analysis.py`. This module
operates one level up: it consumes those analyses + raw activity rows and
produces narrative summaries.
"""

from __future__ import annotations

import json
import logging
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)

# Bump these to invalidate cached digests on prompt changes. Snapshots
# carry the version in their payload so a UI can show "needs refresh".
DEV_DIGEST_PROMPT_VERSION = "dev-digest-v1"
REPO_HEALTH_PROMPT_VERSION = "repo-health-v1"
TASK_PR_ALIGNMENT_PROMPT_VERSION = "task-pr-alignment-v1"


@dataclass
class ComposeDeveloperDigestInput:
    developer_id: str
    workspace_id: str
    period_start_iso: str  # ISO8601, UTC
    period_end_iso: str


@dataclass
class ComposeRepoHealthInput:
    repository_id: str
    workspace_id: str
    period_start_iso: str
    period_end_iso: str


@dataclass
class EmbedPRSummaryInput:
    pr_id: str
    workspace_id: str | None = None


@dataclass
class AnalyzeTaskPRAlignmentInput:
    """Score how well a linked PR delivers what a SprintTask asked for."""

    task_github_link_id: str
    workspace_id: str | None = None


@dataclass
class EnqueueWorkspaceWeeklyDigestsInput:
    """Schedule-triggered fan-out. Walks every active, AI-enabled workspace
    and dispatches per-developer + per-repo digest jobs for the most recent
    completed ISO week (Mon 00:00 UTC → next Mon 00:00 UTC)."""

    pass


def _parse_iso(value: str) -> datetime:
    """Tolerate both 'Z' and explicit '+00:00' suffixes."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def _workspace_repo_full_names(db, workspace_id: str) -> set[str]:
    """Return the set of `Repository.full_name` strings adopted by a workspace.

    The activity-side tables (`commits`, `pull_requests`, `code_reviews`)
    join to repos by full_name (not FK), so this set is what we filter by
    to keep digests workspace-scoped. Returns an empty set when the
    workspace has adopted nothing yet.

    Lives here (not on a service class) because all the digest activities
    need it and importing service code would pull the FastAPI surface
    transitively.
    """
    from sqlalchemy import select as _select

    from aexy.models.repository import Repository, WorkspaceRepository

    rows = (
        await db.execute(
            _select(Repository.full_name)
            .join(
                WorkspaceRepository,
                WorkspaceRepository.repository_id == Repository.id,
            )
            .where(
                WorkspaceRepository.workspace_id == workspace_id,
                WorkspaceRepository.is_active == True,  # noqa: E712
            )
        )
    ).scalars().all()
    return set(rows)


def _safe_parse_json(raw: str) -> dict[str, Any]:
    """Best-effort JSON parse for LLM output.

    Strips Markdown code fences (```json … ```) that some providers wrap
    around structured responses, then falls back to a plain text payload
    if parsing still fails.
    """
    stripped = raw.strip()
    # Strip ```json ... ``` or ``` ... ``` fences
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


# ─── Developer weekly digest ────────────────────────────────────────────

_DEV_DIGEST_SYSTEM_PROMPT = """You are an engineering manager writing a short weekly digest for one developer.
You will receive structured stats and a sample of their work. Output ONE JSON object with these keys:
  headline: one sentence — what was the dominant theme of their week?
  what_shipped: list of 1-5 bullet strings — concrete things they delivered
  hotspots: list of 0-3 bullets — code areas they spent the most time in
  growth_signals: list of 0-3 bullets — new tech / skills / ownership they picked up
  blockers: list of 0-3 bullets — things slowing them down (e.g. lots of reverts, large unreviewed PRs, late nights)
  confidence: float 0-1 — how confident the summary is given the input volume
Return ONLY the JSON. No prose, no Markdown fences."""


@activity.defn
async def compose_developer_digest(
    input: ComposeDeveloperDigestInput,
) -> dict[str, Any]:
    """Roll up a developer's week into an InsightsSnapshot."""
    from sqlalchemy import select

    from aexy.llm.gateway import get_llm_gateway
    from aexy.models.activity import CodeReview, Commit, PullRequest
    from aexy.models.insights_snapshot import InsightsSnapshot

    logger.info(
        f"Composing developer digest for {input.developer_id} "
        f"({input.period_start_iso} → {input.period_end_iso})"
    )

    period_start = _parse_iso(input.period_start_iso)
    period_end = _parse_iso(input.period_end_iso)

    async with async_session_maker() as db:
        # Idempotency: skip if a snapshot for this scope+kind+period already exists.
        existing = (
            await db.execute(
                select(InsightsSnapshot.id).where(
                    InsightsSnapshot.scope_type == "developer",
                    InsightsSnapshot.scope_id == input.developer_id,
                    InsightsSnapshot.kind == "weekly_digest",
                    InsightsSnapshot.period_start == period_start,
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
            # The workspace hasn't adopted any repos — nothing to report.
            snapshot = InsightsSnapshot(
                scope_type="developer",
                scope_id=input.developer_id,
                workspace_id=input.workspace_id,
                kind="weekly_digest",
                period_start=period_start,
                period_end=period_end,
                payload={
                    "prompt_version": DEV_DIGEST_PROMPT_VERSION,
                    "headline": "Workspace has not adopted any repositories yet.",
                    "metrics": {"commits": 0, "prs": 0, "reviews": 0},
                    "what_shipped": [],
                    "hotspots": [],
                    "growth_signals": [],
                    "blockers": [],
                    "confidence": 1.0,
                },
            )
            db.add(snapshot)
            await db.commit()
            return {"status": "no_adopted_repos", "snapshot_id": str(snapshot.id)}

        # Commit stats — scoped to workspace-adopted repos.
        commit_rows = (
            await db.execute(
                select(Commit).where(
                    Commit.developer_id == input.developer_id,
                    Commit.repository.in_(repo_full_names),
                    Commit.committed_at >= period_start,
                    Commit.committed_at < period_end,
                )
            )
        ).scalars().all()

        # PR stats (with their AI summaries when present) — scoped.
        pr_rows = (
            await db.execute(
                select(PullRequest).where(
                    PullRequest.developer_id == input.developer_id,
                    PullRequest.repository.in_(repo_full_names),
                    PullRequest.created_at_github >= period_start,
                    PullRequest.created_at_github < period_end,
                )
            )
        ).scalars().all()

        review_rows = (
            await db.execute(
                select(CodeReview).where(
                    CodeReview.developer_id == input.developer_id,
                    CodeReview.repository.in_(repo_full_names),
                    CodeReview.submitted_at >= period_start,
                    CodeReview.submitted_at < period_end,
                )
            )
        ).scalars().all()

        # If the developer was completely inactive, write a minimal snapshot
        # and skip the LLM call. Saves tokens on people on PTO.
        if not (commit_rows or pr_rows or review_rows):
            snapshot = InsightsSnapshot(
                scope_type="developer",
                scope_id=input.developer_id,
                workspace_id=input.workspace_id,
                kind="weekly_digest",
                period_start=period_start,
                period_end=period_end,
                payload={
                    "prompt_version": DEV_DIGEST_PROMPT_VERSION,
                    "headline": "No activity recorded this week.",
                    "metrics": {"commits": 0, "prs": 0, "reviews": 0},
                    "what_shipped": [],
                    "hotspots": [],
                    "growth_signals": [],
                    "blockers": [],
                    "confidence": 1.0,
                },
            )
            db.add(snapshot)
            await db.commit()
            return {"status": "no_activity", "snapshot_id": str(snapshot.id)}

        # Build aggregates the LLM will see.
        commit_categories: Counter[str] = Counter()
        languages: Counter[str] = Counter()
        for c in commit_rows:
            commit_categories[c.change_class or "code"] += 1
            for lang in c.languages or []:
                languages[lang] += 1

        pr_size_dist: Counter[str] = Counter()
        for pr in pr_rows:
            pr_size_dist[pr.size_bucket or "unknown"] += 1

        # Sample summaries — keep the prompt size bounded.
        sample_commit_messages = [
            (c.message or "")[:160]
            for c in commit_rows
            if c.author_class != "bot"
        ][:10]
        sample_pr_summaries: list[str] = []
        for pr in pr_rows[:10]:
            base = f"#{pr.number}: {pr.title or ''}"
            if pr.ai_analysis and isinstance(pr.ai_analysis, dict):
                summary = pr.ai_analysis.get("summary")
                if summary:
                    base += f" — {summary[:160]}"
            sample_pr_summaries.append(base[:240])

        # User-message structured input. JSON keeps the LLM consistent.
        user_payload = {
            "period_start": input.period_start_iso,
            "period_end": input.period_end_iso,
            "metrics": {
                "commits": len(commit_rows),
                "merge_commits": sum(1 for c in commit_rows if c.is_merge),
                "reverts": sum(1 for c in commit_rows if c.is_revert),
                "prs": len(pr_rows),
                "reviews": len(review_rows),
            },
            "commit_categories": dict(commit_categories),
            "pr_size_distribution": dict(pr_size_dist),
            "languages_touched": [
                name for name, _ in languages.most_common(8)
            ],
            "sample_commit_messages": sample_commit_messages,
            "sample_pr_summaries": sample_pr_summaries,
        }

        gateway = get_llm_gateway()
        if gateway is None:
            # Persist a deterministic-only snapshot so the UI still has
            # something to show until an LLM provider is configured.
            payload = {
                "prompt_version": DEV_DIGEST_PROMPT_VERSION,
                "headline": "AI digest unavailable (no LLM provider configured).",
                "metrics": user_payload["metrics"],
                "what_shipped": [],
                "hotspots": [],
                "growth_signals": [],
                "blockers": [],
                "confidence": 0.0,
                "_raw_stats": user_payload,
            }
            snapshot = InsightsSnapshot(
                scope_type="developer",
                scope_id=input.developer_id,
                workspace_id=input.workspace_id,
                kind="weekly_digest",
                period_start=period_start,
                period_end=period_end,
                payload=payload,
                model=None,
            )
            db.add(snapshot)
            await db.commit()
            return {"status": "no_llm", "snapshot_id": str(snapshot.id)}

        user_prompt = (
            "Here is the developer's week. Return the JSON described in the system prompt.\n\n"
            + json.dumps(user_payload, indent=2)
        )

        try:
            response_text, total_tokens, input_tokens, output_tokens = (
                await gateway.call_llm(
                    system_prompt=_DEV_DIGEST_SYSTEM_PROMPT,
                    user_prompt=user_prompt,
                    tokens_estimate=2000,
                    workspace_id=input.workspace_id,
                    developer_id=input.developer_id,
                )
            )
        except Exception as e:
            logger.exception(f"Developer digest LLM call failed: {e}")
            raise

        digest = _safe_parse_json(response_text)
        digest.setdefault("prompt_version", DEV_DIGEST_PROMPT_VERSION)
        digest["metrics"] = user_payload["metrics"]

        snapshot = InsightsSnapshot(
            scope_type="developer",
            scope_id=input.developer_id,
            workspace_id=input.workspace_id,
            kind="weekly_digest",
            period_start=period_start,
            period_end=period_end,
            payload=digest,
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


# ─── Repo health rollup ─────────────────────────────────────────────────

_REPO_HEALTH_SYSTEM_PROMPT = """You are a staff engineer writing a short repo-health note for one repository.
You'll receive activity stats and a list of churned files. Output ONE JSON object with these keys:
  headline: one sentence summarizing the week
  hotspots: list of 0-5 files that absorbed the most change (path strings)
  risks: list of 0-3 short bullets — what looks worrying (reverts, large unreviewed PRs, thin review)
  highlights: list of 0-3 short bullets — what went well
  trends: list of 0-3 short bullets — direction-of-travel observations
  confidence: float 0-1
Return ONLY the JSON. No prose, no Markdown fences."""


@activity.defn
async def compose_repo_health(input: ComposeRepoHealthInput) -> dict[str, Any]:
    """Roll up a repository's week into a repo-health InsightsSnapshot."""
    from sqlalchemy import select

    from aexy.llm.gateway import get_llm_gateway
    from aexy.models.activity import CodeReview, Commit, PullRequest
    from aexy.models.insights_snapshot import InsightsSnapshot
    from aexy.models.repository import Repository

    logger.info(
        f"Composing repo health for {input.repository_id} "
        f"({input.period_start_iso} → {input.period_end_iso})"
    )

    period_start = _parse_iso(input.period_start_iso)
    period_end = _parse_iso(input.period_end_iso)

    async with async_session_maker() as db:
        repo = await db.get(Repository, input.repository_id)
        if not repo:
            return {"error": "Repository not found", "repository_id": input.repository_id}

        existing = (
            await db.execute(
                select(InsightsSnapshot.id).where(
                    InsightsSnapshot.scope_type == "repository",
                    InsightsSnapshot.scope_id == input.repository_id,
                    InsightsSnapshot.kind == "repo_health",
                    InsightsSnapshot.period_start == period_start,
                )
            )
        ).scalar_one_or_none()
        if existing:
            return {"status": "exists", "snapshot_id": str(existing)}

        repo_full_name = repo.full_name

        commits = (
            await db.execute(
                select(Commit).where(
                    Commit.repository == repo_full_name,
                    Commit.committed_at >= period_start,
                    Commit.committed_at < period_end,
                )
            )
        ).scalars().all()

        prs = (
            await db.execute(
                select(PullRequest).where(
                    PullRequest.repository == repo_full_name,
                    PullRequest.created_at_github >= period_start,
                    PullRequest.created_at_github < period_end,
                )
            )
        ).scalars().all()

        reviews = (
            await db.execute(
                select(CodeReview).where(
                    CodeReview.repository == repo_full_name,
                    CodeReview.submitted_at >= period_start,
                    CodeReview.submitted_at < period_end,
                )
            )
        ).scalars().all()

        # Deterministic hotspot extraction from patch_sample headers. The
        # sync layer writes "--- {filename} ---" markers around each per-file
        # diff so we can count file occurrences without re-fetching from
        # GitHub.
        file_churn: Counter[str] = Counter()
        for c in commits:
            if not c.patch_sample:
                continue
            for match in re.finditer(r"^---\s+(\S+?)\s+---", c.patch_sample, re.MULTILINE):
                file_churn[match.group(1)] += 1

        size_dist: Counter[str] = Counter()
        for pr in prs:
            size_dist[pr.size_bucket or "unknown"] += 1

        # Review thinness: count merged-state PRs with no associated review.
        review_pr_ids = {r.pull_request_github_id for r in reviews}
        merged_prs = [pr for pr in prs if pr.state == "merged"]
        merged_without_review = sum(
            1 for pr in merged_prs if pr.github_id not in review_pr_ids
        )

        metrics = {
            "commits": len(commits),
            "merge_commits": sum(1 for c in commits if c.is_merge),
            "reverts": sum(1 for c in commits if c.is_revert),
            "prs_opened": len(prs),
            "prs_merged": len(merged_prs),
            "merged_without_review": merged_without_review,
            "reviews": len(reviews),
        }

        if metrics["commits"] == 0 and metrics["prs_opened"] == 0:
            payload = {
                "prompt_version": REPO_HEALTH_PROMPT_VERSION,
                "headline": "No activity in this period.",
                "hotspots": [],
                "risks": [],
                "highlights": [],
                "trends": [],
                "confidence": 1.0,
                "metrics": metrics,
            }
            snapshot = InsightsSnapshot(
                scope_type="repository",
                scope_id=input.repository_id,
                workspace_id=input.workspace_id,
                kind="repo_health",
                period_start=period_start,
                period_end=period_end,
                payload=payload,
            )
            db.add(snapshot)
            await db.commit()
            return {"status": "no_activity", "snapshot_id": str(snapshot.id)}

        user_payload = {
            "repository": repo_full_name,
            "period_start": input.period_start_iso,
            "period_end": input.period_end_iso,
            "metrics": metrics,
            "pr_size_distribution": dict(size_dist),
            "top_files_by_churn": [
                {"path": p, "touches": n}
                for p, n in file_churn.most_common(10)
            ],
        }

        gateway = get_llm_gateway()
        if gateway is None:
            payload = {
                "prompt_version": REPO_HEALTH_PROMPT_VERSION,
                "headline": "AI digest unavailable (no LLM provider configured).",
                "hotspots": [p for p, _ in file_churn.most_common(5)],
                "risks": [],
                "highlights": [],
                "trends": [],
                "confidence": 0.0,
                "metrics": metrics,
                "_raw_stats": user_payload,
            }
            snapshot = InsightsSnapshot(
                scope_type="repository",
                scope_id=input.repository_id,
                workspace_id=input.workspace_id,
                kind="repo_health",
                period_start=period_start,
                period_end=period_end,
                payload=payload,
            )
            db.add(snapshot)
            await db.commit()
            return {"status": "no_llm", "snapshot_id": str(snapshot.id)}

        user_prompt = (
            "Here is the repo's week. Return the JSON described in the system prompt.\n\n"
            + json.dumps(user_payload, indent=2)
        )

        try:
            response_text, total_tokens, input_tokens, output_tokens = (
                await gateway.call_llm(
                    system_prompt=_REPO_HEALTH_SYSTEM_PROMPT,
                    user_prompt=user_prompt,
                    tokens_estimate=2000,
                    workspace_id=input.workspace_id,
                )
            )
        except Exception as e:
            logger.exception(f"Repo health LLM call failed: {e}")
            raise

        digest = _safe_parse_json(response_text)
        digest.setdefault("prompt_version", REPO_HEALTH_PROMPT_VERSION)
        digest["metrics"] = metrics

        snapshot = InsightsSnapshot(
            scope_type="repository",
            scope_id=input.repository_id,
            workspace_id=input.workspace_id,
            kind="repo_health",
            period_start=period_start,
            period_end=period_end,
            payload=digest,
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


# ─── Embedding (Phase 3) ─────────────────────────────────────────────────


@activity.defn
async def embed_pr_summary(input: EmbedPRSummaryInput) -> dict[str, Any]:
    """Write `pull_requests.embedding` for similarity search.

    Uses the title + description + AI summary (if any). Skips if the PR
    already has an embedding from the same model. Backs off cleanly when
    no embedding provider is configured.
    """
    from sqlalchemy import select

    from aexy.llm.gateway import get_llm_gateway
    from aexy.models.activity import PullRequest

    logger.info(f"Embedding PR {input.pr_id}")

    gateway = get_llm_gateway()
    if gateway is None:
        return {"pr_id": input.pr_id, "status": "no_llm"}

    embedder = gateway.embeddings
    target_model = embedder.provider_name

    async with async_session_maker() as db:
        pr = (
            await db.execute(select(PullRequest).where(PullRequest.id == input.pr_id))
        ).scalar_one_or_none()
        if not pr:
            return {"pr_id": input.pr_id, "status": "not_found"}

        if pr.embedding is not None and pr.embedding_model == target_model:
            return {"pr_id": input.pr_id, "status": "already_embedded"}

        parts: list[str] = []
        if pr.title:
            parts.append(pr.title)
        if pr.description:
            parts.append(pr.description[:2000])
        if pr.ai_analysis and isinstance(pr.ai_analysis, dict):
            summary = pr.ai_analysis.get("summary")
            if isinstance(summary, str) and summary:
                parts.append(summary[:1000])
        text = "\n\n".join(p for p in parts if p)
        if not text.strip():
            return {"pr_id": input.pr_id, "status": "empty"}

        vectors = await gateway.embed_batch_limited(
            [text],
            workspace_id=input.workspace_id,
        )
        if not vectors:
            return {"pr_id": input.pr_id, "status": "empty_response"}

        pr.embedding = vectors[0]
        pr.embedding_model = target_model
        pr.embedded_at = datetime.now(timezone.utc)
        await db.commit()

        return {"pr_id": input.pr_id, "status": "embedded", "model": target_model}


# ─── Task ↔ PR alignment (Phase 4C) ─────────────────────────────────────


_ALIGNMENT_SYSTEM_PROMPT = """You are a senior engineer reviewing whether a pull request delivers what a task asked for.
You will receive the task description and the PR's title + description + AI summary.
Output ONE JSON object with these keys:
  matches_intent: float 0-1 — how well the PR delivers the task's stated intent
  gaps: list of 0-3 short bullets — things the task asked for that the PR doesn't appear to do
  extras: list of 0-3 short bullets — things the PR does that weren't in the task
  notes: list of 0-2 short bullets — anything else a reviewer should know
  confidence: float 0-1 — how confident the assessment is given the input quality
Return ONLY the JSON. No prose, no Markdown fences."""


@activity.defn
async def analyze_task_pr_alignment(
    input: AnalyzeTaskPRAlignmentInput,
) -> dict[str, Any]:
    """Score how well a linked PR delivers what its SprintTask asked.

    Reads task description + PR title/description/ai_analysis.summary,
    asks the LLM for a structured assessment, and writes to
    `task_github_links.alignment`. Idempotent on the link id; reruns only
    when the task or PR has been updated since the last analysis.
    """
    from aexy.llm.gateway import get_llm_gateway
    from aexy.models.activity import PullRequest
    from aexy.models.sprint import SprintTask, TaskGitHubLink

    logger.info(f"Aligning task ↔ PR for link {input.task_github_link_id}")

    async with async_session_maker() as db:
        link = await db.get(TaskGitHubLink, input.task_github_link_id)
        if not link:
            return {"status": "not_found"}
        if link.link_type != "pull_request" or link.pull_request_id is None:
            return {"status": "not_a_pr_link"}

        # Skip if already analyzed and neither side has been updated since.
        # (We don't have updated_at on the link, so use the timestamp.)
        if link.alignment_analyzed_at is not None and link.alignment:
            return {
                "status": "already_analyzed",
                "task_github_link_id": input.task_github_link_id,
            }

        task = await db.get(SprintTask, link.task_id)
        if not task:
            return {"status": "task_not_found"}
        pr = await db.get(PullRequest, link.pull_request_id)
        if not pr:
            return {"status": "pr_not_found"}

        task_text = (task.description or "").strip()
        # Task title alone is rarely enough signal — without a description
        # the LLM would hallucinate. Skip cleanly.
        if not task_text or len(task_text) < 20:
            link.alignment = {
                "prompt_version": TASK_PR_ALIGNMENT_PROMPT_VERSION,
                "matches_intent": None,
                "gaps": [],
                "extras": [],
                "notes": ["Task has no description; alignment cannot be scored."],
                "confidence": 0.0,
            }
            link.alignment_analyzed_at = datetime.now(timezone.utc)
            await db.commit()
            return {"status": "task_too_short"}

        pr_summary = None
        if pr.ai_analysis and isinstance(pr.ai_analysis, dict):
            summary = pr.ai_analysis.get("summary")
            if isinstance(summary, str):
                pr_summary = summary

        gateway = get_llm_gateway()
        if gateway is None:
            return {"status": "no_llm"}

        user_payload = {
            "task": {
                "title": task.title or "",
                "description": task_text[:4000],
            },
            "pull_request": {
                "title": pr.title or "",
                "description": (pr.description or "")[:4000],
                "ai_summary": pr_summary,
                "size_bucket": pr.size_bucket,
            },
        }

        try:
            response_text, total_tokens, input_tokens, output_tokens = (
                await gateway.call_llm(
                    system_prompt=_ALIGNMENT_SYSTEM_PROMPT,
                    user_prompt=(
                        "Assess the alignment. Return the JSON described in the system prompt.\n\n"
                        + json.dumps(user_payload, indent=2)
                    ),
                    tokens_estimate=1500,
                    workspace_id=input.workspace_id,
                )
            )
        except Exception as e:
            logger.exception(f"Task-PR alignment LLM call failed: {e}")
            raise

        alignment = _safe_parse_json(response_text)
        alignment.setdefault("prompt_version", TASK_PR_ALIGNMENT_PROMPT_VERSION)

        link.alignment = alignment
        link.alignment_analyzed_at = datetime.now(timezone.utc)
        await db.commit()

        return {
            "status": "analyzed",
            "task_github_link_id": input.task_github_link_id,
            "matches_intent": alignment.get("matches_intent"),
            "token_usage": {
                "input": input_tokens,
                "output": output_tokens,
                "total": total_tokens,
            },
        }


# ─── Weekly fan-out (cron entry point) ──────────────────────────────────


@activity.defn
async def enqueue_workspace_weekly_digests(
    input: EnqueueWorkspaceWeeklyDigestsInput,
) -> dict[str, Any]:
    """For every AI-enabled workspace, dispatch per-developer + per-repo
    digests for the most recently completed ISO week, plus catch-up embedding
    jobs for any PRs that haven't been embedded yet.
    """
    from sqlalchemy import select

    from aexy.models.activity import PullRequest
    from aexy.models.repository import WorkspaceRepository
    from aexy.models.workspace import Workspace, WorkspaceMember
    from aexy.services.ai_settings import settings_for_workspace
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    logger.info("Enqueueing weekly workspace digests")

    # Most recent completed ISO week (Mon 00:00 UTC → next Mon 00:00 UTC).
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    this_monday = today - timedelta(days=today.weekday())
    period_end = this_monday
    period_start = period_end - timedelta(days=7)

    dev_digests = 0
    repo_digests = 0
    embeddings = 0

    async with async_session_maker() as db:
        workspaces = (
            await db.execute(
                select(Workspace).where(Workspace.is_active == True)  # noqa: E712
            )
        ).scalars().all()

        for ws in workspaces:
            if not settings_for_workspace(ws).enabled:
                continue

            # Per-developer digests for every active workspace member.
            members = (
                await db.execute(
                    select(WorkspaceMember.developer_id).where(
                        WorkspaceMember.workspace_id == ws.id,
                    )
                )
            ).scalars().all()

            for developer_id in members:
                await dispatch(
                    "compose_developer_digest",
                    ComposeDeveloperDigestInput(
                        developer_id=str(developer_id),
                        workspace_id=str(ws.id),
                        period_start_iso=period_start.isoformat(),
                        period_end_iso=period_end.isoformat(),
                    ),
                    task_queue=TaskQueue.ANALYSIS,
                    workflow_id=(
                        f"dev-digest-{ws.id}-{developer_id}-{period_start.date().isoformat()}"
                    ),
                )
                dev_digests += 1

            # Per-repo health for every adopted repo.
            adopted_repos = (
                await db.execute(
                    select(WorkspaceRepository.repository_id).where(
                        WorkspaceRepository.workspace_id == ws.id,
                        WorkspaceRepository.is_active == True,  # noqa: E712
                    )
                )
            ).scalars().all()

            for repository_id in adopted_repos:
                await dispatch(
                    "compose_repo_health",
                    ComposeRepoHealthInput(
                        repository_id=str(repository_id),
                        workspace_id=str(ws.id),
                        period_start_iso=period_start.isoformat(),
                        period_end_iso=period_end.isoformat(),
                    ),
                    task_queue=TaskQueue.ANALYSIS,
                    workflow_id=(
                        f"repo-health-{ws.id}-{repository_id}-{period_start.date().isoformat()}"
                    ),
                )
                repo_digests += 1

        # Embedding catch-up: any analyzed PR without an embedding yet. We
        # cap each run so a fresh workspace doesn't fire 10K embedding jobs.
        catchup_prs = (
            await db.execute(
                select(PullRequest.id).where(
                    PullRequest.ai_analyzed_at.is_not(None),
                    PullRequest.embedded_at.is_(None),
                )
                .limit(500)
            )
        ).scalars().all()

        for pr_id in catchup_prs:
            await dispatch(
                "embed_pr_summary",
                EmbedPRSummaryInput(pr_id=str(pr_id)),
                task_queue=TaskQueue.ANALYSIS,
                workflow_id=f"embed-pr-{pr_id}",
            )
            embeddings += 1

    summary = {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "dev_digests_dispatched": dev_digests,
        "repo_digests_dispatched": repo_digests,
        "embeddings_dispatched": embeddings,
    }
    logger.info(f"Weekly digest fan-out complete: {summary}")
    return summary
