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
class AnalyzeDeveloperInput:
    developer_id: str


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
    """Analyze a commit with LLM."""
    logger.info(f"Analyzing commit {input.commit_id} for developer {input.developer_id}")

    from sqlalchemy import select
    from aexy.llm.gateway import get_llm_gateway
    from aexy.models.activity import Commit
    from aexy.services.code_analyzer import CodeAnalyzer

    gateway = get_llm_gateway()
    if not gateway:
        return {"error": "LLM not configured", "commit_id": input.commit_id}

    analyzer = CodeAnalyzer(llm_gateway=gateway)

    async with async_session_maker() as db:
        result = await db.execute(
            select(Commit).where(Commit.id == input.commit_id)
        )
        commit = result.scalar_one_or_none()

        if not commit:
            return {"error": "Commit not found", "commit_id": input.commit_id}

        analysis = await analyzer.analyze_commit_message(
            message=commit.message or "",
            files_changed=commit.files_changed or 0,
            additions=commit.additions or 0,
            deletions=commit.deletions or 0,
        )

        commit.analysis = analysis
        commit.analyzed = True
        await db.commit()

        return {
            "commit_id": input.commit_id,
            "developer_id": input.developer_id,
            "status": "analyzed",
            "analysis": analysis,
        }


@activity.defn
async def analyze_pr(input: AnalyzePRInput) -> dict[str, Any]:
    """Analyze a pull request with LLM."""
    logger.info(f"Analyzing PR {input.pr_id} for developer {input.developer_id}")

    from sqlalchemy import select
    from aexy.llm.gateway import get_llm_gateway
    from aexy.models.activity import PullRequest
    from aexy.services.code_analyzer import CodeAnalyzer

    gateway = get_llm_gateway()
    if not gateway:
        return {"error": "LLM not configured", "pr_id": input.pr_id}

    analyzer = CodeAnalyzer(llm_gateway=gateway)

    async with async_session_maker() as db:
        result = await db.execute(
            select(PullRequest).where(PullRequest.id == input.pr_id)
        )
        pr = result.scalar_one_or_none()

        if not pr:
            return {"error": "PR not found", "pr_id": input.pr_id}

        analysis = await analyzer.analyze_pr(
            title=pr.title or "",
            body=pr.body or "",
            files_changed=pr.changed_files or 0,
            additions=pr.additions or 0,
            deletions=pr.deletions or 0,
        )

        pr.analysis = analysis
        pr.analyzed = True
        await db.commit()

        return {
            "pr_id": input.pr_id,
            "developer_id": input.developer_id,
            "status": "analyzed",
            "analysis": analysis,
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
    """Reset daily LLM usage limits."""
    logger.info("Resetting daily LLM limits")

    from aexy.services.llm_rate_limiter import get_llm_rate_limiter

    rate_limiter = get_llm_rate_limiter()
    await rate_limiter.reset_daily_limits()
    return {"status": "reset"}


@activity.defn
async def batch_report_usage(input: BatchReportUsageInput) -> dict[str, Any]:
    """Report LLM usage to Stripe for all workspaces."""
    logger.info("Batch reporting usage to Stripe")

    from aexy.services.usage_reporting_service import UsageReportingService

    async with async_session_maker() as db:
        service = UsageReportingService(db)
        result = await service.batch_report_usage()
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
