"""Temporal activities for LLM analysis.

Replaces: aexy.processing.tasks (analyze_commit_task, analyze_pr_task, etc.)
Reuses: _analyze_commit, _analyze_pr, _analyze_developer async implementations.
"""

import logging
from dataclasses import dataclass
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class AnalyzeCommitInput:
    developer_id: str
    commit_id: str


@dataclass
class AnalyzePRInput:
    developer_id: str
    pr_id: str


@dataclass
class AnalyzeReviewInput:
    developer_id: str
    review_id: str


@dataclass
class AnalyzeDeveloperInput:
    developer_id: str


# Prompt template version. Bump when the analyzer's prompt/schema changes so
# old cached results don't get reused with a new shape.
COMMIT_PROMPT_VERSION = "commit-v1"
PR_PROMPT_VERSION = "pr-v1"
REVIEW_PROMPT_VERSION = "review-v1"


@dataclass
class ResetDailyLimitsInput:
    pass


@dataclass
class ReportUsageInput:
    workspace_id: str


@dataclass
class BatchReportUsageInput:
    pass


@dataclass
class AggregateBillingUsageInput:
    pass


@dataclass
class BatchProfileSyncInput:
    pass


@dataclass
class ProcessDocumentSyncQueueInput:
    workspace_id: str


@dataclass
class RegenerateDocumentInput:
    document_id: str
    workspace_id: str


@activity.defn
async def analyze_commit(input: AnalyzeCommitInput) -> dict[str, Any]:
    """Run LLM analysis on a single commit and persist to commits.semantic_analysis.

    Skips if already analyzed (ai_analyzed_at set) or if Layer-0 enrichment
    flagged the commit as bot / merge / docs-only / formatter-only. Looks up the
    LLM analysis cache by content hash to dedup re-runs.
    """
    from datetime import datetime, timezone

    from sqlalchemy import select

    from aexy.llm.gateway import get_llm_gateway
    from aexy.models.activity import Commit
    from aexy.services.code_analyzer import CodeAnalyzer
    from aexy.services.llm_analysis_cache_service import LlmAnalysisCacheService, hash_payload
    from aexy.services.security_scanner import scan_patch_sample, summary_metrics

    logger.info(f"Analyzing commit {input.commit_id} for developer {input.developer_id}")

    gateway = get_llm_gateway()

    async with async_session_maker() as db:
        commit = (
            await db.execute(select(Commit).where(Commit.id == input.commit_id))
        ).scalar_one_or_none()
        if not commit:
            return {"error": "Commit not found", "commit_id": input.commit_id, "status": "skipped"}

        if commit.ai_analyzed_at is not None:
            return {"commit_id": input.commit_id, "status": "already_analyzed"}

        # Layer-0 gates — these classes carry zero LLM signal.
        if commit.author_class == "bot":
            return {"commit_id": input.commit_id, "status": "skipped_bot"}
        if commit.is_merge:
            return {"commit_id": input.commit_id, "status": "skipped_merge"}
        if commit.change_class in {"docs_only", "formatter_only", "generated"}:
            return {
                "commit_id": input.commit_id,
                "status": "skipped_change_class",
                "change_class": commit.change_class,
            }

        # Phase 4B — deterministic security scan. Runs regardless of LLM availability.
        security_findings = scan_patch_sample(commit.patch_sample)
        security_block = {
            "findings": [f.to_dict() for f in security_findings],
            "summary": summary_metrics(security_findings),
        }

        # If LLM isn't configured, still write the deterministic security block
        # so reviewers see the findings.
        if not gateway:
            commit.semantic_analysis = {"security": security_block}
            commit.ai_analyzed_at = datetime.now(timezone.utc)
            await db.commit()
            return {
                "commit_id": input.commit_id,
                "status": "security_only",
                "findings": security_block["summary"]["total"],
            }

        cache = LlmAnalysisCacheService(db)
        payload = {
            "sha": commit.sha,
            "message": commit.message or "",
            "additions": commit.additions or 0,
            "deletions": commit.deletions or 0,
            "files_changed": commit.files_changed or 0,
            "patch_sample": commit.patch_sample or "",
        }
        prompt_hash = hash_payload(COMMIT_PROMPT_VERSION, payload)

        cached = await cache.get(prompt_hash)
        if cached is not None:
            merged = dict(cached)
            merged["security"] = security_block
            commit.semantic_analysis = merged
            commit.ai_analyzed_at = datetime.now(timezone.utc)
            await db.commit()
            return {"commit_id": input.commit_id, "status": "cache_hit"}

        analyzer = CodeAnalyzer(llm_gateway=gateway)
        result = await analyzer.analyze_commit_message(
            message=commit.message or "",
            files_changed=commit.files_changed or 0,
            additions=commit.additions or 0,
            deletions=commit.deletions or 0,
        )
        analysis_json = result.model_dump(mode="json")
        token_usage = {
            "input": result.input_tokens,
            "output": result.output_tokens,
            "total": result.tokens_used,
        }

        await cache.put(
            prompt_hash=prompt_hash,
            analysis=analysis_json,
            model=result.model or "",
            prompt_version=COMMIT_PROMPT_VERSION,
            token_usage=token_usage,
        )

        # Merge the deterministic security block on top of the LLM output before
        # persisting so a single read of `semantic_analysis` gives reviewers both.
        analysis_json["security"] = security_block
        commit.semantic_analysis = analysis_json
        commit.ai_analyzed_at = datetime.now(timezone.utc)
        await db.commit()

        return {
            "commit_id": input.commit_id,
            "developer_id": input.developer_id,
            "status": "analyzed",
            "token_usage": token_usage,
        }


@activity.defn
async def analyze_pr(input: AnalyzePRInput) -> dict[str, Any]:
    """Run LLM analysis on a PR and persist to pull_requests.ai_analysis.

    Also runs the deterministic security scanner against the PR's stored
    patch_sample and writes findings into ai_analysis.security_findings.
    The scanner is pure Python — no extra tokens — so it runs even when
    the LLM provider is unavailable.
    """
    from datetime import datetime, timezone

    from sqlalchemy import select

    from aexy.llm.gateway import get_llm_gateway
    from aexy.models.activity import PullRequest
    from aexy.services.code_analyzer import CodeAnalyzer
    from aexy.services.llm_analysis_cache_service import LlmAnalysisCacheService, hash_payload
    from aexy.services.security_scanner import scan_patch_sample, summary_metrics

    logger.info(f"Analyzing PR {input.pr_id} for developer {input.developer_id}")

    gateway = get_llm_gateway()

    async with async_session_maker() as db:
        pr = (
            await db.execute(select(PullRequest).where(PullRequest.id == input.pr_id))
        ).scalar_one_or_none()
        if not pr:
            return {"error": "PR not found", "pr_id": input.pr_id, "status": "skipped"}

        if pr.ai_analyzed_at is not None:
            return {"pr_id": input.pr_id, "status": "already_analyzed"}

        # Phase 4B — scan PR description body for accidentally-pasted secrets.
        # The PR has no patch_sample of its own; per-commit findings live on
        # `commits.semantic_analysis.security`.
        body_text = "\n".join(p for p in [pr.title or "", pr.description or ""] if p)
        # Wrap the body as a synthetic single-file patch so the scanner's
        # `+` line filter applies — every line is an "addition".
        synthetic_patch = (
            "--- pr-description ---\n"
            + "\n".join("+" + ln for ln in body_text.splitlines())
        ) if body_text else None
        body_findings = scan_patch_sample(synthetic_patch) if synthetic_patch else []
        security_block = {
            "findings": [f.to_dict() for f in body_findings],
            "summary": summary_metrics(body_findings),
        }

        # Layer-0 gate — xs PRs are typically version bumps / typo fixes.
        # Still persist the security scan even when we skip the LLM call.
        if pr.size_bucket == "xs":
            pr.ai_analysis = {"security": security_block}
            pr.ai_analyzed_at = datetime.now(timezone.utc)
            await db.commit()
            await _dispatch_alignment_for_pr(db, pr_id=str(pr.id), trigger="xs")
            return {"pr_id": input.pr_id, "status": "skipped_size_xs"}

        if not gateway:
            pr.ai_analysis = {"security": security_block}
            pr.ai_analyzed_at = datetime.now(timezone.utc)
            await db.commit()
            await _dispatch_alignment_for_pr(db, pr_id=str(pr.id), trigger="no_llm")
            return {"pr_id": input.pr_id, "status": "security_only"}

        cache = LlmAnalysisCacheService(db)
        payload = {
            "github_id": pr.github_id,
            "title": pr.title or "",
            "description": pr.description or "",
            "additions": pr.additions or 0,
            "deletions": pr.deletions or 0,
            "files_changed": pr.files_changed or 0,
        }
        prompt_hash = hash_payload(PR_PROMPT_VERSION, payload)

        cached = await cache.get(prompt_hash)
        if cached is not None:
            merged = dict(cached)
            merged["security"] = security_block
            pr.ai_analysis = merged
            pr.ai_analyzed_at = datetime.now(timezone.utc)
            await db.commit()
            await _dispatch_alignment_for_pr(db, pr_id=str(pr.id), trigger="cache_hit")
            return {"pr_id": input.pr_id, "status": "cache_hit"}

        analyzer = CodeAnalyzer(llm_gateway=gateway)
        result = await analyzer.analyze_pr_description(
            title=pr.title or "",
            description=pr.description or "",
            files_changed=pr.files_changed or 0,
            additions=pr.additions or 0,
            deletions=pr.deletions or 0,
        )
        analysis_json = result.model_dump(mode="json")
        token_usage = {
            "input": result.input_tokens,
            "output": result.output_tokens,
            "total": result.tokens_used,
        }

        await cache.put(
            prompt_hash=prompt_hash,
            analysis=analysis_json,
            model=result.model or "",
            prompt_version=PR_PROMPT_VERSION,
            token_usage=token_usage,
        )

        analysis_json["security"] = security_block
        pr.ai_analysis = analysis_json
        pr.ai_analyzed_at = datetime.now(timezone.utc)
        await db.commit()

        # Fan out alignment AFTER the PR analysis is durably persisted, so
        # `analyze_task_pr_alignment` reads the fresh `ai_analysis` summary
        # rather than a stale (or empty) one. Best-effort: dispatch
        # failures are logged but don't fail the analysis itself.
        await _dispatch_alignment_for_pr(db, pr_id=str(pr.id), trigger="analyze_pr")

        return {
            "pr_id": input.pr_id,
            "developer_id": input.developer_id,
            "status": "analyzed",
            "token_usage": token_usage,
        }


async def _dispatch_alignment_for_pr(db, pr_id: str, trigger: str) -> int:
    """Fan out `analyze_task_pr_alignment` for every TaskGitHubLink that
    references this PR. Called from `analyze_pr` so alignment always sees
    the freshly-written `pr.ai_analysis`. Returns the count dispatched.

    The workflow_id keys on (link_id, content_hash) only — same content,
    same workflow id, Temporal deduplicates. `trigger` is logged but not
    in the id so repeat triggers on unchanged content (webhook + poll +
    cache hit) don't fire redundant alignment runs.
    """
    import hashlib

    from sqlalchemy import select as _select

    from aexy.models.activity import PullRequest
    from aexy.models.sprint import TaskGitHubLink
    from aexy.temporal.activities.ai_digests import AnalyzeTaskPRAlignmentInput
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    pr = await db.get(PullRequest, pr_id)
    if pr is None:
        return 0

    content = f"{pr.title or ''}\n{pr.description or ''}"
    content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()[:8]

    link_ids = (
        await db.execute(
            _select(TaskGitHubLink.id).where(
                TaskGitHubLink.pull_request_id == pr_id,
            )
        )
    ).scalars().all()
    dispatched = 0
    for link_id in link_ids:
        try:
            await dispatch(
                "analyze_task_pr_alignment",
                AnalyzeTaskPRAlignmentInput(task_github_link_id=str(link_id)),
                task_queue=TaskQueue.ANALYSIS,
                workflow_id=f"task-pr-alignment-{link_id}-{content_hash}",
            )
            dispatched += 1
        except Exception:
            logger.exception(
                f"Failed to dispatch alignment for link {link_id} "
                f"(pr {pr_id}, trigger={trigger})"
            )
    return dispatched


@activity.defn
async def analyze_review(input: AnalyzeReviewInput) -> dict[str, Any]:
    """Run LLM analysis on a code review and persist to code_reviews.quality_metrics."""
    from datetime import datetime, timezone

    from sqlalchemy import select

    from aexy.llm.gateway import get_llm_gateway
    from aexy.models.activity import CodeReview
    from aexy.services.code_analyzer import CodeAnalyzer
    from aexy.services.llm_analysis_cache_service import LlmAnalysisCacheService, hash_payload

    logger.info(f"Analyzing review {input.review_id} for developer {input.developer_id}")

    gateway = get_llm_gateway()
    if not gateway:
        return {"error": "LLM not configured", "review_id": input.review_id, "status": "skipped"}

    async with async_session_maker() as db:
        review = (
            await db.execute(select(CodeReview).where(CodeReview.id == input.review_id))
        ).scalar_one_or_none()
        if not review:
            return {"error": "Review not found", "review_id": input.review_id, "status": "skipped"}

        if review.ai_analyzed_at is not None:
            return {"review_id": input.review_id, "status": "already_analyzed"}

        # Reviews with no body and no inline comments carry no LLM signal —
        # the deterministic state ("approved" / "changes_requested") is already known.
        if not (review.body or "").strip() and (review.comments_count or 0) == 0:
            return {"review_id": input.review_id, "status": "skipped_empty"}

        cache = LlmAnalysisCacheService(db)
        payload = {
            "github_id": review.github_id,
            "state": review.state,
            "body": review.body or "",
            "comments_count": review.comments_count or 0,
        }
        prompt_hash = hash_payload(REVIEW_PROMPT_VERSION, payload)

        cached = await cache.get(prompt_hash)
        if cached is not None:
            review.quality_metrics = cached
            review.ai_analyzed_at = datetime.now(timezone.utc)
            await db.commit()
            return {"review_id": input.review_id, "status": "cache_hit"}

        analyzer = CodeAnalyzer(llm_gateway=gateway)
        result = await analyzer.analyze_review_comment(
            comment=review.body or "",
            state=review.state or "commented",
        )
        analysis_json = result.model_dump(mode="json")
        token_usage = {
            "input": result.input_tokens,
            "output": result.output_tokens,
            "total": result.tokens_used,
        }

        await cache.put(
            prompt_hash=prompt_hash,
            analysis=analysis_json,
            model=result.model or "",
            prompt_version=REVIEW_PROMPT_VERSION,
            token_usage=token_usage,
        )

        review.quality_metrics = analysis_json
        review.ai_analyzed_at = datetime.now(timezone.utc)
        await db.commit()

        return {
            "review_id": input.review_id,
            "developer_id": input.developer_id,
            "status": "analyzed",
            "token_usage": token_usage,
        }


@activity.defn
async def analyze_developer(input: AnalyzeDeveloperInput) -> dict[str, Any]:
    """Analyze a developer's full profile with LLM."""
    logger.info(f"Analyzing developer {input.developer_id}")

    from aexy.services.developer_analysis_service import DeveloperAnalysisService

    async with async_session_maker() as db:
        service = DeveloperAnalysisService(db)
        result = await service.analyze_developer(input.developer_id)
        await db.commit()
        return result


@activity.defn
async def reset_daily_limits(input: ResetDailyLimitsInput) -> dict[str, Any]:
    """Reset daily LLM usage limits.

    Note: Redis sliding windows auto-expire, and developer daily counters
    reset lazily via LimitsService._maybe_reset_llm_usage() on each request.
    This activity is kept for schedule compatibility.
    """
    logger.info("Daily LLM limits reset (handled lazily per-request)")
    return {"status": "reset"}


@activity.defn
async def batch_report_usage(input: BatchReportUsageInput) -> dict[str, Any]:
    """Report LLM usage to Stripe for all workspaces."""
    logger.info("Batch reporting usage to Stripe")

    try:
        from aexy.services.usage_reporting_service import UsageReportingService
    except ImportError:
        logger.info("UsageReportingService not implemented yet, skipping")
        return {"status": "skipped", "reason": "not_implemented"}

    async with async_session_maker() as db:
        service = UsageReportingService(db)
        result = await service.batch_report_usage()
        await db.commit()
        return result


@activity.defn
async def aggregate_billing_usage(input: AggregateBillingUsageInput) -> dict[str, Any]:
    """Refresh `usage_aggregates` for every active workspace's current period.

    Drives the historical billing-breakdown view. Without this the prior-month
    panels are empty because nothing else writes to `usage_aggregates`.
    """
    logger.info("Refreshing usage aggregates for billing breakdown")

    from aexy.services.billing_breakdown_service import (
        aggregate_all_workspaces_usage,
    )

    async with async_session_maker() as db:
        result = await aggregate_all_workspaces_usage(db)
        await db.commit()
        return result


@activity.defn
async def batch_profile_sync(input: BatchProfileSyncInput) -> dict[str, Any]:
    """Batch sync all developer profiles."""
    logger.info("Starting batch profile sync")

    from aexy.services.developer_analysis_service import DeveloperAnalysisService

    async with async_session_maker() as db:
        service = DeveloperAnalysisService(db)
        result = await service.batch_profile_sync()
        await db.commit()
        return result


@activity.defn
async def process_document_sync_queue(input: ProcessDocumentSyncQueueInput) -> dict[str, Any]:
    """Process document sync queue for a workspace."""
    logger.info(f"Processing document sync queue for workspace {input.workspace_id}")

    from aexy.services.document_sync_service import DocumentSyncService

    async with async_session_maker() as db:
        service = DocumentSyncService(db)
        result = await service.process_queue(input.workspace_id)
        await db.commit()
        return result


@activity.defn
async def regenerate_document(input: RegenerateDocumentInput) -> dict[str, Any]:
    """Regenerate a document."""
    logger.info(f"Regenerating document {input.document_id}")

    from aexy.services.document_sync_service import DocumentSyncService

    async with async_session_maker() as db:
        service = DocumentSyncService(db)
        result = await service.regenerate_document(
            document_id=input.document_id,
            workspace_id=input.workspace_id,
        )
        await db.commit()
        return result
