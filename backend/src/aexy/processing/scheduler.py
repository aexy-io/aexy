"""Scheduler for batch processing jobs."""

import logging
from datetime import datetime, timezone
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)


class AnalysisScheduler:
    """Scheduler for LLM analysis jobs."""

    def __init__(self) -> None:
        """Initialize the scheduler."""
        self.scheduler = AsyncIOScheduler()
        self._is_running = False

    def start(self) -> None:
        """Start the scheduler with configured jobs."""
        if self._is_running:
            logger.warning("Scheduler already running")
            return

        # Schedule nightly batch at 2 AM UTC
        self.scheduler.add_job(
            self._run_nightly_batch,
            CronTrigger(hour=2, minute=0, timezone="UTC"),
            id="nightly_batch",
            name="Nightly LLM Batch Processing",
            replace_existing=True,
        )

        # Schedule hourly cleanup at minute 30
        self.scheduler.add_job(
            self._cleanup_expired_cache,
            CronTrigger(minute=30, timezone="UTC"),
            id="cache_cleanup",
            name="Cache Cleanup",
            replace_existing=True,
        )

        self.scheduler.start()
        self._is_running = True
        logger.info("Analysis scheduler started")

    def stop(self) -> None:
        """Stop the scheduler."""
        if self._is_running:
            self.scheduler.shutdown(wait=False)
            self._is_running = False
            logger.info("Analysis scheduler stopped")

    async def _run_nightly_batch(self) -> dict[str, Any]:
        """Run nightly batch processing."""
        logger.info("Starting nightly batch processing")

        from aexy.processing.tasks import batch_profile_sync_task

        try:
            # Trigger the Celery task
            result = batch_profile_sync_task.delay()
            logger.info(f"Nightly batch triggered: {result.id}")

            return {
                "task_id": result.id,
                "triggered_at": datetime.now(timezone.utc).isoformat(),
            }

        except Exception as e:
            logger.error(f"Nightly batch failed: {e}")
            return {"error": str(e)}

    async def _cleanup_expired_cache(self) -> dict[str, Any]:
        """Clean up expired cache entries."""
        logger.debug("Running cache cleanup")

        from aexy.cache import get_analysis_cache

        try:
            cache = get_analysis_cache()
            # Cache handles TTL automatically, but we can force cleanup
            stats = await cache.get_stats()

            return {
                "cleaned_at": datetime.now(timezone.utc).isoformat(),
                "cache_stats": stats,
            }

        except Exception as e:
            logger.warning(f"Cache cleanup failed: {e}")
            return {"error": str(e)}

    def trigger_batch_now(self) -> str:
        """Manually trigger batch processing.

        Returns:
            Task ID.
        """
        from aexy.processing.tasks import batch_profile_sync_task

        result = batch_profile_sync_task.delay()
        logger.info(f"Manual batch triggered: {result.id}")
        return result.id

    def get_scheduled_jobs(self) -> list[dict[str, Any]]:
        """Get list of scheduled jobs.

        Returns:
            List of job info dicts.
        """
        jobs = []
        for job in self.scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
                "trigger": str(job.trigger),
            })
        return jobs

    @property
    def is_running(self) -> bool:
        """Check if scheduler is running."""
        return self._is_running


# Singleton scheduler
_scheduler: AnalysisScheduler | None = None


def get_scheduler() -> AnalysisScheduler:
    """Get the scheduler singleton.

    Returns:
        Scheduler instance.
    """
    global _scheduler
    if _scheduler is None:
        _scheduler = AnalysisScheduler()
    return _scheduler
