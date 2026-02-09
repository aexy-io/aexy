"""Temporal activities for email warming.

Replaces: aexy.processing.warming_tasks
"""

import logging
from dataclasses import dataclass
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class ProcessWarmingDayInput:
    pass


@dataclass
class CheckWarmingThresholdsInput:
    pass


@dataclass
class ResetDailyVolumesInput:
    pass


@dataclass
class UpdateWarmingMetricsInput:
    domain_id: str
    emails_sent: int


@activity.defn
async def process_warming_day(input: ProcessWarmingDayInput) -> dict[str, Any]:
    """Daily task to advance warming for all domains."""
    logger.info("Processing warming day")

    from aexy.services.warming_service import WarmingService

    async with async_session_maker() as db:
        service = WarmingService(db)
        result = await service.process_warming_day()
        await db.commit()
        return result


@activity.defn
async def check_warming_thresholds(input: CheckWarmingThresholdsInput) -> dict[str, Any]:
    """Hourly task to check warming thresholds."""
    logger.info("Checking warming thresholds")

    from aexy.services.warming_service import WarmingService

    async with async_session_maker() as db:
        service = WarmingService(db)
        result = await service.check_warming_thresholds()
        await db.commit()
        return result


@activity.defn
async def reset_daily_volumes(input: ResetDailyVolumesInput) -> dict[str, Any]:
    """Daily task to reset daily send counters."""
    logger.info("Resetting daily email volumes")

    from aexy.services.warming_service import WarmingService

    async with async_session_maker() as db:
        service = WarmingService(db)
        result = await service.reset_daily_volumes()
        await db.commit()
        return result


@activity.defn
async def update_warming_metrics(input: UpdateWarmingMetricsInput) -> dict[str, Any]:
    """Update warming metrics after sending emails."""
    logger.info(f"Updating warming metrics for domain {input.domain_id}")

    from aexy.services.warming_service import WarmingService

    async with async_session_maker() as db:
        service = WarmingService(db)
        result = await service.update_warming_metrics(
            domain_id=input.domain_id,
            emails_sent=input.emails_sent,
        )
        await db.commit()
        return result
