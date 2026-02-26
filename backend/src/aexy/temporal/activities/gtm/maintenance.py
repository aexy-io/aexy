"""Maintenance activities: GDPR compliance, data retention.

Activities:
    - cleanup_ip_addresses: Null out IP addresses older than retention period
    - purge_behavioral_events: Delete old behavioral events beyond retention window
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


# =============================================================================
# INPUT DATACLASSES
# =============================================================================

@dataclass
class CleanupIPAddressesInput:
    retention_days: int = 90


@dataclass
class PurgeBehavioralEventsInput:
    retention_days: int = 365
    batch_size: int = 10000


# =============================================================================
# ACTIVITIES
# =============================================================================

@activity.defn(name="cleanup_ip_addresses")
async def cleanup_ip_addresses(input: CleanupIPAddressesInput) -> dict:
    """Null out IP addresses older than retention_days for GDPR compliance.

    Cleans three tables:
    - behavioral_events: NULL ip_address where received_at < cutoff
    - visitor_sessions: NULL ip_address where created_at < cutoff
    - visitor_identifications: replace ip_address with '0.0.0.0' where created_at < cutoff
      (column is NOT NULL so we use a placeholder)
    """
    from sqlalchemy import update

    from aexy.models.gtm import BehavioralEvent, VisitorSession, VisitorIdentification

    cutoff = datetime.now(timezone.utc) - timedelta(days=input.retention_days)

    logger.info(
        f"Cleaning up IP addresses older than {input.retention_days} days "
        f"(cutoff={cutoff.isoformat()})"
    )

    async with async_session_maker() as db:
        # 1. NULL out ip_address on behavioral_events
        result_events = await db.execute(
            update(BehavioralEvent)
            .where(BehavioralEvent.received_at < cutoff)
            .where(BehavioralEvent.ip_address.isnot(None))
            .values(ip_address=None)
        )
        events_updated = result_events.rowcount
        logger.info(f"Cleaned {events_updated} rows in behavioral_events")
        activity.heartbeat(f"behavioral_events: {events_updated} rows cleaned")

        # 2. NULL out ip_address on visitor_sessions
        result_sessions = await db.execute(
            update(VisitorSession)
            .where(VisitorSession.created_at < cutoff)
            .where(VisitorSession.ip_address.isnot(None))
            .values(ip_address=None)
        )
        sessions_updated = result_sessions.rowcount
        logger.info(f"Cleaned {sessions_updated} rows in visitor_sessions")
        activity.heartbeat(f"visitor_sessions: {sessions_updated} rows cleaned")

        # 3. Replace ip_address with '0.0.0.0' on visitor_identifications (NOT NULL column)
        result_idents = await db.execute(
            update(VisitorIdentification)
            .where(VisitorIdentification.created_at < cutoff)
            .where(VisitorIdentification.ip_address != '0.0.0.0')
            .values(ip_address='0.0.0.0')
        )
        idents_updated = result_idents.rowcount
        logger.info(f"Cleaned {idents_updated} rows in visitor_identifications")
        activity.heartbeat(f"visitor_identifications: {idents_updated} rows cleaned")

        await db.commit()

    total = events_updated + sessions_updated + idents_updated
    logger.info(f"IP address cleanup complete: {total} total rows updated")

    return {
        "retention_days": input.retention_days,
        "cutoff": cutoff.isoformat(),
        "behavioral_events_cleaned": events_updated,
        "visitor_sessions_cleaned": sessions_updated,
        "visitor_identifications_cleaned": idents_updated,
        "total_rows_updated": total,
    }


@activity.defn(name="purge_behavioral_events")
async def purge_behavioral_events(input: PurgeBehavioralEventsInput) -> dict:
    """Delete old behavioral events beyond the retention window.

    Deletes in batches to avoid long-running transactions and lock contention.
    """
    from sqlalchemy import delete, select, func

    from aexy.models.gtm import BehavioralEvent

    cutoff = datetime.now(timezone.utc) - timedelta(days=input.retention_days)
    total_deleted = 0

    logger.info(
        f"Purging behavioral events older than {input.retention_days} days "
        f"(cutoff={cutoff.isoformat()}, batch_size={input.batch_size})"
    )

    async with async_session_maker() as db:
        # Get total count for logging
        count_result = await db.execute(
            select(func.count(BehavioralEvent.id)).where(
                BehavioralEvent.received_at < cutoff
            )
        )
        total_eligible = count_result.scalar() or 0
        logger.info(f"Found {total_eligible} events eligible for purge")

        while True:
            # Delete in batches using a subquery to limit rows
            batch_ids = (
                select(BehavioralEvent.id)
                .where(BehavioralEvent.received_at < cutoff)
                .limit(input.batch_size)
            ).scalar_subquery()

            result = await db.execute(
                delete(BehavioralEvent).where(BehavioralEvent.id.in_(batch_ids))
            )
            deleted = result.rowcount
            await db.commit()

            total_deleted += deleted
            activity.heartbeat(f"Deleted {total_deleted}/{total_eligible} events")

            if deleted < input.batch_size:
                break

    logger.info(f"Purge complete: {total_deleted} behavioral events deleted")

    return {
        "retention_days": input.retention_days,
        "cutoff": cutoff.isoformat(),
        "total_eligible": total_eligible,
        "total_deleted": total_deleted,
    }
