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

    from sqlalchemy import select
    from aexy.models.email_infrastructure import SendingDomain
    from aexy.services.reputation_service import ReputationService

    async with async_session_maker() as db:
        result = await db.execute(select(SendingDomain.id))
        domain_ids = [row[0] for row in result.all()]

        service = ReputationService(db)
        processed = 0
        for domain_id in domain_ids:
            try:
                await service.calculate_domain_health(domain_id)
                processed += 1
            except Exception as e:
                logger.warning(f"Failed to calculate health for domain {domain_id}: {e}")
        await db.commit()
        return {"domains_processed": processed, "total": len(domain_ids)}


@activity.defn
async def calculate_isp_metrics(input: CalculateISPMetricsInput) -> dict[str, Any]:
    """Daily task to calculate ISP-specific metrics."""
    logger.info("Calculating ISP metrics")

    from sqlalchemy import select
    from aexy.models.email_infrastructure import SendingDomain
    from aexy.services.reputation_service import ReputationService

    async with async_session_maker() as db:
        result = await db.execute(select(SendingDomain.id))
        domain_ids = [row[0] for row in result.all()]

        service = ReputationService(db)
        processed = 0
        for domain_id in domain_ids:
            try:
                await service.calculate_isp_metrics(domain_id)
                processed += 1
            except Exception as e:
                logger.warning(f"Failed to calculate ISP metrics for domain {domain_id}: {e}")
        await db.commit()
        return {"domains_processed": processed, "total": len(domain_ids)}


@activity.defn
async def auto_pause_unhealthy_domains(input: AutoPauseUnhealthyDomainsInput) -> dict[str, Any]:
    """Auto-pause domains with critical health."""
    logger.info("Auto-pausing unhealthy domains")

    from aexy.services.reputation_service import ReputationService

    async with async_session_maker() as db:
        service = ReputationService(db)
        paused = await service.check_and_pause_unhealthy_domains()
        return {"paused_count": len(paused), "paused_domain_ids": paused}


@activity.defn
async def process_unprocessed_events(input: ProcessUnprocessedEventsInput) -> dict[str, Any]:
    """Process unprocessed provider events by recalculating health for affected domains."""
    logger.info("Processing unprocessed reputation events")

    from sqlalchemy import select, update
    from aexy.models.email_infrastructure import ProviderEventLog
    from aexy.services.reputation_service import ReputationService

    async with async_session_maker() as db:
        # Find domains with unprocessed events
        stmt = (
            select(ProviderEventLog.domain_id)
            .where(ProviderEventLog.processed == False)
            .where(ProviderEventLog.domain_id.isnot(None))
            .distinct()
        )
        result = await db.execute(stmt)
        domain_ids = [row[0] for row in result.all()]

        if not domain_ids:
            return {"processed": 0, "domains_affected": 0}

        service = ReputationService(db)
        for domain_id in domain_ids:
            try:
                await service.calculate_domain_health(domain_id)
            except Exception as e:
                logger.warning(f"Failed to recalculate health for domain {domain_id}: {e}")

        # Mark events as processed
        from datetime import datetime, timezone
        await db.execute(
            update(ProviderEventLog)
            .where(ProviderEventLog.processed == False)
            .where(ProviderEventLog.domain_id.in_(domain_ids))
            .values(processed=True, processed_at=datetime.now(timezone.utc))
        )
        await db.commit()
        return {"domains_affected": len(domain_ids)}
