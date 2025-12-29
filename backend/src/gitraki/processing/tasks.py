"""Celery tasks for LLM analysis."""

import asyncio
import logging
from typing import Any

from celery import shared_task

logger = logging.getLogger(__name__)


def run_async(coro):
    """Run an async coroutine in a sync context."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    return loop.run_until_complete(coro)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def analyze_commit_task(self, developer_id: str, commit_id: str) -> dict[str, Any]:
    """Analyze a commit with LLM.

    Args:
        developer_id: Developer ID.
        commit_id: Commit ID.

    Returns:
        Analysis result dict.
    """
    logger.info(f"Analyzing commit {commit_id} for developer {developer_id}")

    try:
        result = run_async(_analyze_commit(developer_id, commit_id))
        return result
    except Exception as exc:
        logger.error(f"Commit analysis failed: {exc}")
        raise self.retry(exc=exc)


async def _analyze_commit(developer_id: str, commit_id: str) -> dict[str, Any]:
    """Async implementation of commit analysis."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession

    from gitraki.core.database import async_session_maker
    from gitraki.llm.gateway import get_llm_gateway
    from gitraki.models.activity import Commit
    from gitraki.services.code_analyzer import CodeAnalyzer

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


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def analyze_pr_task(self, developer_id: str, pr_id: str) -> dict[str, Any]:
    """Analyze a pull request with LLM.

    Args:
        developer_id: Developer ID.
        pr_id: Pull request ID.

    Returns:
        Analysis result dict.
    """
    logger.info(f"Analyzing PR {pr_id} for developer {developer_id}")

    try:
        result = run_async(_analyze_pr(developer_id, pr_id))
        return result
    except Exception as exc:
        logger.error(f"PR analysis failed: {exc}")
        raise self.retry(exc=exc)


async def _analyze_pr(developer_id: str, pr_id: str) -> dict[str, Any]:
    """Async implementation of PR analysis."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession

    from gitraki.core.database import async_session_maker
    from gitraki.llm.gateway import get_llm_gateway
    from gitraki.models.activity import PullRequest
    from gitraki.services.code_analyzer import CodeAnalyzer
    from gitraki.services.soft_skills_analyzer import SoftSkillsAnalyzer

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


@shared_task(bind=True, max_retries=3, default_retry_delay=120)
def analyze_developer_task(self, developer_id: str) -> dict[str, Any]:
    """Full LLM analysis for a developer's activity.

    Args:
        developer_id: Developer ID.

    Returns:
        Analysis result dict.
    """
    logger.info(f"Running full analysis for developer {developer_id}")

    try:
        result = run_async(_analyze_developer(developer_id))
        return result
    except Exception as exc:
        logger.error(f"Developer analysis failed: {exc}")
        raise self.retry(exc=exc)


async def _analyze_developer(developer_id: str) -> dict[str, Any]:
    """Async implementation of full developer analysis."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession

    from gitraki.core.database import async_session_maker
    from gitraki.llm.gateway import get_llm_gateway
    from gitraki.models.activity import CodeReview, Commit, PullRequest
    from gitraki.models.developer import Developer
    from gitraki.services.code_analyzer import CodeAnalyzer
    from gitraki.services.soft_skills_analyzer import SoftSkillsAnalyzer

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


@shared_task
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


async def _batch_profile_sync() -> dict[str, Any]:
    """Async implementation of batch profile sync."""
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import or_, select

    from gitraki.core.database import async_session_maker
    from gitraki.models.developer import Developer
    from gitraki.processing.queue import ProcessingMode, ProcessingQueue

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
