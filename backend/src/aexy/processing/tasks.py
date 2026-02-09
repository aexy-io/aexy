"""Legacy task functions for LLM analysis.

Business logic has been moved to Temporal activities.
These functions are retained as plain functions so other processing modules
can import and use the run_async helper and inner async functions.
"""

import asyncio
import logging
from typing import Any

from aexy.llm.base import LLMRateLimitError

logger = logging.getLogger(__name__)


def run_async(coro):
    """Run an async coroutine in a sync context.

    Always creates a new event loop to avoid conflicts between
    concurrent tasks sharing the same worker process.

    IMPORTANT: This disposes the database connection pool after each run
    to prevent asyncpg connections created on one event loop from being
    reused on a different loop (which causes "Future attached to a
    different loop" errors).
    """
    from aexy.core.database import get_engine

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        # Dispose all pooled connections before closing the loop.
        # This prevents asyncpg connections from being reused on a
        # different event loop in the next task execution.
        try:
            engine = get_engine()
            loop.run_until_complete(engine.dispose())
        except Exception:
            pass  # Best effort - don't fail the task if disposal fails
        loop.close()


def analyze_commit_task(developer_id: str, commit_id: str) -> dict[str, Any]:
    """Analyze a commit with LLM.

    Args:
        developer_id: Developer ID.
        commit_id: Commit ID.

    Returns:
        Analysis result dict.
    """
    logger.info(f"Analyzing commit {commit_id} for developer {developer_id}")
    result = run_async(_analyze_commit(developer_id, commit_id))
    return result


async def _analyze_commit(developer_id: str, commit_id: str) -> dict[str, Any]:
    """Async implementation of commit analysis."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession

    from aexy.core.database import async_session_maker
    from aexy.llm.gateway import get_llm_gateway
    from aexy.models.activity import Commit
    from aexy.services.code_analyzer import CodeAnalyzer

    gateway = get_llm_gateway()
    if not gateway:
        return {"error": "LLM not configured", "commit_id": commit_id}

    analyzer = CodeAnalyzer(llm_gateway=gateway)

    async with async_session_maker() as db:
        # Fetch commit
        result = await db.execute(
            select(Commit).where(Commit.id == commit_id)
        )
        commit = result.scalar_one_or_none()

        if not commit:
            return {"error": "Commit not found", "commit_id": commit_id}

        # Analyze commit message
        analysis = await analyzer.analyze_commit_message(
            message=commit.message or "",
            files_changed=commit.files_changed or 0,
            additions=commit.additions or 0,
            deletions=commit.deletions or 0,
        )

        # Store result
        commit.llm_analyzed = True
        commit.llm_analysis_result = analysis.model_dump()
        await db.commit()

        return {
            "commit_id": commit_id,
            "developer_id": developer_id,
            "analysis": analysis.model_dump(),
        }


def analyze_pr_task(developer_id: str, pr_id: str) -> dict[str, Any]:
    """Analyze a pull request with LLM.

    Args:
        developer_id: Developer ID.
        pr_id: Pull request ID.

    Returns:
        Analysis result dict.
    """
    logger.info(f"Analyzing PR {pr_id} for developer {developer_id}")
    result = run_async(_analyze_pr(developer_id, pr_id))
    return result


async def _analyze_pr(developer_id: str, pr_id: str) -> dict[str, Any]:
    """Async implementation of PR analysis."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession

    from aexy.core.database import async_session_maker
    from aexy.llm.gateway import get_llm_gateway
    from aexy.models.activity import PullRequest
    from aexy.services.code_analyzer import CodeAnalyzer
    from aexy.services.soft_skills_analyzer import SoftSkillsAnalyzer

    gateway = get_llm_gateway()
    if not gateway:
        return {"error": "LLM not configured", "pr_id": pr_id}

    code_analyzer = CodeAnalyzer(llm_gateway=gateway)
    soft_skills_analyzer = SoftSkillsAnalyzer(llm_gateway=gateway)

    async with async_session_maker() as db:
        # Fetch PR
        result = await db.execute(
            select(PullRequest).where(PullRequest.id == pr_id)
        )
        pr = result.scalar_one_or_none()

        if not pr:
            return {"error": "PR not found", "pr_id": pr_id}

        # Analyze PR description
        code_analysis = await code_analyzer.analyze_pr_description(
            title=pr.title or "",
            description=pr.description or "",
            files_changed=pr.files_changed or 0,
            additions=pr.additions or 0,
            deletions=pr.deletions or 0,
        )

        # Analyze for soft skills
        soft_skills = await soft_skills_analyzer.analyze_pr_communication(
            title=pr.title or "",
            description=pr.description or "",
            files_changed=pr.files_changed or 0,
            additions=pr.additions or 0,
            deletions=pr.deletions or 0,
        )

        # Store results
        pr.llm_analyzed = True
        pr.llm_analysis_result = code_analysis.model_dump()
        pr.soft_skills_signals = [s.model_dump() for s in soft_skills]
        await db.commit()

        return {
            "pr_id": pr_id,
            "developer_id": developer_id,
            "code_analysis": code_analysis.model_dump(),
            "soft_skills": [s.model_dump() for s in soft_skills],
        }


def analyze_developer_task(developer_id: str) -> dict[str, Any]:
    """Full LLM analysis for a developer's activity.

    Args:
        developer_id: Developer ID.

    Returns:
        Analysis result dict.
    """
    logger.info(f"Running full analysis for developer {developer_id}")
    result = run_async(_analyze_developer(developer_id))
    return result


async def _analyze_developer(developer_id: str) -> dict[str, Any]:
    """Async implementation of full developer analysis."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession

    from aexy.core.database import async_session_maker
    from aexy.llm.gateway import get_llm_gateway
    from aexy.models.activity import CodeReview, Commit, PullRequest
    from aexy.models.developer import Developer
    from aexy.services.code_analyzer import CodeAnalyzer
    from aexy.services.soft_skills_analyzer import SoftSkillsAnalyzer

    gateway = get_llm_gateway()
    if not gateway:
        return {"error": "LLM not configured", "developer_id": developer_id}

    code_analyzer = CodeAnalyzer(llm_gateway=gateway)
    soft_skills_analyzer = SoftSkillsAnalyzer(llm_gateway=gateway)

    async with async_session_maker() as db:
        # Fetch developer
        result = await db.execute(
            select(Developer).where(Developer.id == developer_id)
        )
        developer = result.scalar_one_or_none()

        if not developer:
            return {"error": "Developer not found", "developer_id": developer_id}

        # Fetch recent activity
        commits_result = await db.execute(
            select(Commit)
            .where(Commit.developer_id == developer_id)
            .order_by(Commit.committed_at.desc())
            .limit(20)
        )
        commits = commits_result.scalars().all()

        prs_result = await db.execute(
            select(PullRequest)
            .where(PullRequest.developer_id == developer_id)
            .order_by(PullRequest.created_at_github.desc())
            .limit(10)
        )
        prs = prs_result.scalars().all()

        reviews_result = await db.execute(
            select(CodeReview)
            .where(CodeReview.developer_id == developer_id)
            .order_by(CodeReview.submitted_at.desc())
            .limit(15)
        )
        reviews = reviews_result.scalars().all()

        # Analyze activity
        commits_data = [
            {
                "message": c.message,
                "files_changed": c.files_changed,
                "additions": c.additions,
                "deletions": c.deletions,
            }
            for c in commits
        ]

        prs_data = [
            {
                "title": p.title,
                "description": p.description,
                "files_changed": p.files_changed,
                "additions": p.additions,
                "deletions": p.deletions,
            }
            for p in prs
        ]

        reviews_data = [
            {"body": r.body, "state": r.state}
            for r in reviews
        ]

        # Run code analysis
        code_result = await code_analyzer.analyze_developer_activity(
            commits=commits_data,
            pull_requests=prs_data,
            reviews=reviews_data,
        )

        # Run soft skills analysis
        soft_skills = await soft_skills_analyzer.build_profile(
            pull_requests=prs_data,
            reviews=reviews_data,
        )

        # Update developer profile
        developer.llm_analysis_version = (developer.llm_analysis_version or 0) + 1
        developer.soft_skills = soft_skills.model_dump()

        # Merge LLM results into skill fingerprint
        if developer.skill_fingerprint:
            fingerprint = developer.skill_fingerprint.copy()
        else:
            fingerprint = {"languages": [], "frameworks": [], "domains": [], "tools": []}

        # Add LLM-detected skills
        for lang in code_result.languages.values():
            existing = next(
                (l for l in fingerprint.get("languages", []) if l.get("name") == lang.name),
                None,
            )
            if existing:
                existing["llm_confidence"] = lang.confidence
            else:
                fingerprint["languages"].append({
                    "name": lang.name,
                    "proficiency_score": int(lang.confidence * 100),
                    "llm_confidence": lang.confidence,
                })

        for domain in code_result.domains.values():
            existing = next(
                (d for d in fingerprint.get("domains", []) if d.get("name") == domain.name),
                None,
            )
            if existing:
                existing["llm_confidence"] = domain.confidence
            else:
                fingerprint["domains"].append({
                    "name": domain.name,
                    "confidence_score": int(domain.confidence * 100),
                    "llm_confidence": domain.confidence,
                })

        developer.skill_fingerprint = fingerprint

        from datetime import datetime, timezone
        developer.last_llm_analysis_at = datetime.now(timezone.utc)

        await db.commit()

        return {
            "developer_id": developer_id,
            "code_analysis": code_result.to_dict(),
            "soft_skills": soft_skills.model_dump(),
            "version": developer.llm_analysis_version,
        }


def batch_profile_sync_task() -> dict[str, Any]:
    """Run batch profile sync for all developers.

    Returns:
        Summary of processed developers.
    """
    logger.info("Starting batch profile sync")

    try:
        result = run_async(_batch_profile_sync())
        return result
    except Exception as exc:
        logger.error(f"Batch sync failed: {exc}")
        raise


def reset_daily_limits_task() -> dict[str, Any]:
    """Reset daily LLM usage limits for developers.

    Returns:
        Summary of reset operations.
    """
    logger.info("Checking for daily limit resets")

    try:
        result = run_async(_reset_daily_limits())
        return result
    except Exception as exc:
        logger.error(f"Daily limit reset failed: {exc}")
        raise


async def _reset_daily_limits() -> dict[str, Any]:
    """Async implementation of daily limit reset."""
    from datetime import datetime, timezone

    from sqlalchemy import select

    from aexy.core.database import async_session_maker
    from aexy.models.developer import Developer

    async with async_session_maker() as db:
        now = datetime.now(timezone.utc)

        # Find developers whose reset time has passed
        result = await db.execute(
            select(Developer).where(
                Developer.llm_requests_reset_at <= now
            )
        )
        developers = result.scalars().all()

        reset_count = 0
        for developer in developers:
            developer.llm_requests_today = 0
            # Set next reset to tomorrow at midnight UTC
            next_reset = now.replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            from datetime import timedelta
            next_reset += timedelta(days=1)
            developer.llm_requests_reset_at = next_reset
            reset_count += 1

        await db.commit()

        return {
            "developers_reset": reset_count,
            "timestamp": now.isoformat(),
        }


def report_usage_to_stripe_task(developer_id: str) -> dict[str, Any]:
    """Report accumulated usage to Stripe for a developer.

    Args:
        developer_id: Developer ID.

    Returns:
        Summary of reported usage.
    """
    logger.info(f"Reporting usage to Stripe for developer {developer_id}")
    result = run_async(_report_usage_to_stripe(developer_id))
    return result


async def _report_usage_to_stripe(developer_id: str) -> dict[str, Any]:
    """Async implementation of Stripe usage reporting."""
    from aexy.core.database import async_session_maker
    from aexy.services.usage_service import UsageService

    async with async_session_maker() as db:
        usage_service = UsageService(db)
        result = await usage_service.report_usage_to_stripe(developer_id)
        return result


def batch_report_usage_task() -> dict[str, Any]:
    """Report usage to Stripe for all developers with unreported usage.

    Returns:
        Summary of reporting operations.
    """
    logger.info("Starting batch usage reporting to Stripe")

    try:
        result = run_async(_batch_report_usage())
        return result
    except Exception as exc:
        logger.error(f"Batch usage reporting failed: {exc}")
        raise


async def _batch_report_usage() -> dict[str, Any]:
    """Async implementation of batch usage reporting."""
    from datetime import datetime, timezone

    from sqlalchemy import select

    from aexy.core.database import async_session_maker
    from aexy.models.billing import CustomerBilling, UsageRecord
    from aexy.services.usage_service import UsageService

    async with async_session_maker() as db:
        # Find customers with unreported usage and get their developer_ids
        result = await db.execute(
            select(CustomerBilling.developer_id)
            .join(UsageRecord, UsageRecord.customer_id == CustomerBilling.id)
            .where(UsageRecord.reported_to_stripe == False)
            .group_by(CustomerBilling.developer_id)
        )
        developer_ids = [row[0] for row in result.fetchall()]

        usage_service = UsageService(db)
        reported = 0
        errors = 0

        for developer_id in developer_ids:
            try:
                await usage_service.report_usage_to_stripe(developer_id)
                reported += 1
            except Exception as e:
                logger.error(f"Failed to report usage for {developer_id}: {e}")
                errors += 1

        return {
            "developers_processed": len(developer_ids),
            "developers_reported": reported,
            "errors": errors,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


async def _batch_profile_sync() -> dict[str, Any]:
    """Async implementation of batch profile sync."""
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import or_, select

    from aexy.core.database import async_session_maker
    from aexy.models.developer import Developer
    from aexy.processing.queue import ProcessingMode, ProcessingQueue

    queue = ProcessingQueue(mode=ProcessingMode.BATCH)
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    async with async_session_maker() as db:
        # Find developers needing refresh
        result = await db.execute(
            select(Developer).where(
                or_(
                    Developer.last_llm_analysis_at.is_(None),
                    Developer.last_llm_analysis_at < cutoff,
                )
            )
        )
        developers = result.scalars().all()

        queued = 0
        for developer in developers:
            queue.enqueue_developer_refresh(
                developer_id=developer.id,
                mode=ProcessingMode.REAL_TIME,  # Process immediately in batch
                priority=3,
            )
            queued += 1

        return {
            "developers_found": len(developers),
            "developers_queued": queued,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


# ============================================================================
# Document Sync Tasks
# ============================================================================


def process_document_sync_queue_task() -> dict[str, Any]:
    """Process pending documents in the sync queue.

    This is the batch sync task for mid-tier plans.
    Should be scheduled to run daily.

    Returns:
        Summary of processed documents.
    """
    logger.info("Processing document sync queue")

    try:
        result = run_async(_process_document_sync_queue())
        return result
    except Exception as exc:
        logger.error(f"Document sync queue processing failed: {exc}")
        raise


async def _process_document_sync_queue() -> dict[str, Any]:
    """Async implementation of document sync queue processing."""
    from datetime import datetime, timezone

    from aexy.core.database import async_session_maker
    from aexy.services.document_sync_service import DocumentSyncService
    from aexy.services.document_generation_service import DocumentGenerationService

    async with async_session_maker() as db:
        sync_service = DocumentSyncService(db)
        gen_service = DocumentGenerationService(db)

        # Get pending items
        pending = await sync_service.get_pending_sync_queue(limit=50)

        if not pending:
            return {
                "processed": 0,
                "succeeded": 0,
                "failed": 0,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        # Mark as processing
        queue_ids = [str(item.id) for item in pending]
        await sync_service.mark_sync_processing(queue_ids)
        await db.commit()

        succeeded = 0
        failed = 0

        for item in pending:
            try:
                document = item.document
                if not document:
                    await sync_service.mark_sync_completed(
                        str(item.id), success=False, error_message="Document not found"
                    )
                    failed += 1
                    continue

                # Get code links
                from aexy.models.documentation import DocumentCodeLink
                from sqlalchemy import select

                stmt = select(DocumentCodeLink).where(
                    DocumentCodeLink.document_id == str(document.id)
                )
                result = await db.execute(stmt)
                code_links = result.scalars().all()

                if not code_links:
                    await sync_service.mark_sync_completed(
                        str(item.id), success=False, error_message="No code links"
                    )
                    failed += 1
                    continue

                # For each code link with pending changes, regenerate
                for link in code_links:
                    if link.has_pending_changes:
                        try:
                            # Mark link as synced
                            link.has_pending_changes = False
                            link.last_synced_at = datetime.now(timezone.utc)
                        except Exception as e:
                            logger.warning(f"Failed to regenerate from link: {e}")

                # Update document status
                document.generation_status = "synced"
                document.last_generated_at = datetime.now(timezone.utc)

                await sync_service.mark_sync_completed(str(item.id), success=True)
                succeeded += 1

            except Exception as e:
                logger.error(f"Failed to process sync item {item.id}: {e}")
                await sync_service.mark_sync_completed(
                    str(item.id), success=False, error_message=str(e)
                )
                failed += 1

        await db.commit()

        return {
            "processed": len(pending),
            "succeeded": succeeded,
            "failed": failed,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


def regenerate_document_task(
    document_id: str, developer_id: str
) -> dict[str, Any]:
    """Regenerate a single document from its linked code.

    Args:
        document_id: Document to regenerate.
        developer_id: Developer requesting the regeneration.

    Returns:
        Regeneration result.
    """
    logger.info(f"Regenerating document {document_id}")
    result = run_async(_regenerate_document(document_id, developer_id))
    return result


async def _regenerate_document(
    document_id: str, developer_id: str
) -> dict[str, Any]:
    """Async implementation of document regeneration."""
    from datetime import datetime, timezone

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    from aexy.core.database import async_session_maker
    from aexy.models.documentation import Document, DocumentCodeLink, TemplateCategory
    from aexy.services.document_generation_service import DocumentGenerationService
    from aexy.services.github_app_service import GitHubAppService

    async with async_session_maker() as db:
        # Get document with code links
        stmt = (
            select(Document)
            .options(selectinload(Document.code_links))
            .where(Document.id == document_id)
        )
        result = await db.execute(stmt)
        document = result.scalar_one_or_none()

        if not document:
            return {"error": "Document not found", "document_id": document_id}

        if not document.code_links:
            return {"error": "No code links", "document_id": document_id}

        # Get the first code link
        code_link = document.code_links[0]

        # Get GitHub service and generate
        github_service = GitHubAppService(db)
        gen_service = DocumentGenerationService(db)

        try:
            # Get repository info
            from aexy.services.repository_service import RepositoryService

            repo_service = RepositoryService(db)
            repo = await repo_service.get_repository_by_id(str(code_link.repository_id))

            if not repo:
                return {"error": "Repository not found", "document_id": document_id}

            # Determine template category
            category = TemplateCategory.FUNCTION_DOCS
            if code_link.link_type == "directory":
                category = TemplateCategory.MODULE_DOCS

            # Generate content
            content = await gen_service.generate_from_repository(
                github_service=github_service,
                repository_full_name=repo.full_name,
                path=code_link.path,
                template_category=category,
                branch=code_link.branch or "main",
                developer_id=developer_id,
            )

            # Update document
            document.content = content
            document.generation_status = "generated"
            document.last_generated_at = datetime.now(timezone.utc)

            # Update code link
            code_link.has_pending_changes = False
            code_link.last_synced_at = datetime.now(timezone.utc)

            await db.commit()

            return {
                "document_id": document_id,
                "status": "success",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            logger.error(f"Failed to regenerate document: {e}")
            document.generation_status = "failed"
            await db.commit()
            return {
                "document_id": document_id,
                "status": "failed",
                "error": str(e),
            }
