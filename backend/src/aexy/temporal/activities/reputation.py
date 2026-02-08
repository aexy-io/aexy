"""Temporal activities for email reputation monitoring.

Replaces: aexy.processing.reputation_tasks
"""

import logging
from dataclasses import dataclass
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class CalculateDailyHealthInput:
    pass


@dataclass
class CalculateISPMetricsInput:
    pass


@dataclass
class AutoPauseUnhealthyDomainsInput:
    pass


@dataclass
class ProcessUnprocessedEventsInput:
    pass


@activity.defn
async def calculate_daily_health(input: CalculateDailyHealthInput) -> dict[str, Any]:
    """Daily task to calculate health scores for all domains."""
    logger.info("Calculating daily health scores")

    from aexy.services.reputation_service import ReputationService

    async with async_session_maker() as db:
        service = ReputationService(db)
        result = await service.calculate_daily_health()
        await db.commit()
        return result


@activity.defn
async def calculate_isp_metrics(input: CalculateISPMetricsInput) -> dict[str, Any]:
    """Daily task to calculate ISP-specific metrics."""
    logger.info("Calculating ISP metrics")

    from aexy.services.reputation_service import ReputationService

    async with async_session_maker() as db:
        service = ReputationService(db)
        result = await service.calculate_isp_metrics()
        await db.commit()
        return result


@activity.defn
async def auto_pause_unhealthy_domains(input: AutoPauseUnhealthyDomainsInput) -> dict[str, Any]:
    """Auto-pause domains with critical health."""
    logger.info("Auto-pausing unhealthy domains")

    from aexy.services.reputation_service import ReputationService

    async with async_session_maker() as db:
        service = ReputationService(db)
        result = await service.auto_pause_unhealthy_domains()
        await db.commit()
        return result


@activity.defn
async def process_unprocessed_events(input: ProcessUnprocessedEventsInput) -> dict[str, Any]:
    """Process unprocessed provider events."""
    logger.info("Processing unprocessed reputation events")

    from aexy.services.reputation_service import ReputationService

    async with async_session_maker() as db:
        service = ReputationService(db)
        result = await service.process_unprocessed_events()
        await db.commit()
        return result
