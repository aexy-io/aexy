"""Legacy task functions for reputation monitoring and health calculation.

Business logic has been moved to Temporal activities.
These functions are retained as plain functions for backward compatibility.
"""

import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, and_

from aexy.core.database import get_sync_session
from aexy.models.email_infrastructure import (
    SendingDomain,
    ProviderEventLog,
    DomainStatus,
    DomainHealthStatus,
)

logger = logging.getLogger(__name__)


def calculate_daily_health(date_str: str | None = None) -> dict:
    """
    Daily task to calculate health scores for all domains.

    Args:
        date_str: Optional date string (YYYY-MM-DD) to calculate for.
                  Defaults to yesterday.
    """
    if date_str:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        # Default to yesterday
        target_date = datetime.now(timezone.utc) - timedelta(days=1)

    logger.info(f"Calculating daily health for {target_date.date()}")

    with get_sync_session() as db:
        # Get all active domains
        result = db.execute(
            select(SendingDomain).where(
                SendingDomain.status.in_([
                    DomainStatus.ACTIVE.value,
                    DomainStatus.WARMING.value,
                    DomainStatus.VERIFIED.value,
                ])
            )
        )
        domains = list(result.scalars().all())

        processed = 0
        errors = 0

        for domain in domains:
            try:
                _calculate_domain_health_sync(db, domain.id, target_date)
                processed += 1
            except Exception as e:
                logger.error(f"Error calculating health for domain {domain.id}: {e}")
                errors += 1

        logger.info(f"Health calculation complete: {processed} processed, {errors} errors")
        return {
            "processed": processed,
            "errors": errors,
            "date": str(target_date.date()),
        }


def calculate_isp_metrics(date_str: str | None = None) -> dict:
    """
    Daily task to calculate ISP-specific metrics for all domains.

    Args:
        date_str: Optional date string (YYYY-MM-DD) to calculate for.
    """
    if date_str:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    else:
        target_date = datetime.now(timezone.utc) - timedelta(days=1)

    logger.info(f"Calculating ISP metrics for {target_date.date()}")

    with get_sync_session() as db:
        from aexy.services.reputation_service import ReputationService

        # Get all active domains
        result = db.execute(
            select(SendingDomain).where(
                SendingDomain.status.in_([
                    DomainStatus.ACTIVE.value,
                    DomainStatus.WARMING.value,
                    DomainStatus.VERIFIED.value,
                ])
            )
        )
        domains = list(result.scalars().all())

        processed = 0
        errors = 0

        for domain in domains:
            try:
                _calculate_isp_metrics_sync(db, domain.id, target_date)
                processed += 1
            except Exception as e:
                logger.error(f"Error calculating ISP metrics for domain {domain.id}: {e}")
                errors += 1

        logger.info(f"ISP metrics complete: {processed} processed, {errors} errors")
        return {
            "processed": processed,
            "errors": errors,
            "date": str(target_date.date()),
        }


def auto_pause_unhealthy_domains() -> dict:
    """
    Task to auto-pause domains with critical health.

    Runs every 15 minutes to check for domains that need pausing.
    """
    logger.info("Checking for unhealthy domains to pause")

    with get_sync_session() as db:
        # Find domains with critical health that are still active
        result = db.execute(
            select(SendingDomain).where(
                and_(
                    SendingDomain.health_status == DomainHealthStatus.CRITICAL.value,
                    SendingDomain.status.in_([
                        DomainStatus.ACTIVE.value,
                        DomainStatus.WARMING.value,
                        DomainStatus.VERIFIED.value,
                    ]),
                )
            )
        )
        domains = list(result.scalars().all())

        paused = []

        for domain in domains:
            domain.status = DomainStatus.PAUSED.value
            paused.append(domain.id)
            logger.warning(f"Auto-paused domain {domain.domain} due to critical health")

        if paused:
            db.commit()

        logger.info(f"Auto-pause complete: {len(paused)} domains paused")
        return {"paused_count": len(paused), "paused_ids": paused}


def process_unprocessed_events(limit: int = 1000) -> dict:
    """
    Task to process unprocessed provider events.

    Updates domain metrics based on accumulated events.
    """
    logger.info(f"Processing unprocessed events (limit: {limit})")

    with get_sync_session() as db:
        # Get unprocessed events
        result = db.execute(
            select(ProviderEventLog)
            .where(ProviderEventLog.processed == False)
            .order_by(ProviderEventLog.created_at.asc())
            .limit(limit)
        )
        events = list(result.scalars().all())

        processed = 0
        errors = 0

        for event in events:
            try:
                # Mark as processed
                event.processed = True
                event.processed_at = datetime.now(timezone.utc)
                processed += 1
            except Exception as e:
                logger.error(f"Error processing event {event.id}: {e}")
                errors += 1

        db.commit()

        logger.info(f"Event processing complete: {processed} processed, {errors} errors")
        return {"processed": processed, "errors": errors}


# =============================================================================
# SYNC HELPER FUNCTIONS
# =============================================================================

def _calculate_domain_health_sync(db, domain_id: str, date: datetime):
    """Sync version of domain health calculation."""
    from uuid import uuid4
    from sqlalchemy import func
    from aexy.models.email_infrastructure import DomainHealth, EventType

    day_start = date.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)

    # Get domain
    domain_result = db.execute(
        select(SendingDomain).where(SendingDomain.id == domain_id)
    )
    domain = domain_result.scalar_one_or_none()
    if not domain:
        return

    # Get event counts
    event_counts = {}
    result = db.execute(
        select(
            ProviderEventLog.event_type,
            func.count(ProviderEventLog.id),
        )
        .where(
            and_(
                ProviderEventLog.domain_id == domain_id,
                ProviderEventLog.created_at >= day_start,
                ProviderEventLog.created_at < day_end,
            )
        )
        .group_by(ProviderEventLog.event_type)
    )
    for row in result.all():
        event_counts[row[0]] = row[1]

    sent = event_counts.get("send", 0)
    delivered = event_counts.get("delivery", 0)
    bounced = event_counts.get("bounce", 0)
    complaints = event_counts.get("complaint", 0)
    opens = event_counts.get("open", 0)
    clicks = event_counts.get("click", 0)

    # Get bounce types
    bounce_counts = {}
    result = db.execute(
        select(
            ProviderEventLog.bounce_type,
            func.count(ProviderEventLog.id),
        )
        .where(
            and_(
                ProviderEventLog.domain_id == domain_id,
                ProviderEventLog.event_type == "bounce",
                ProviderEventLog.created_at >= day_start,
                ProviderEventLog.created_at < day_end,
            )
        )
        .group_by(ProviderEventLog.bounce_type)
    )
    for row in result.all():
        bounce_counts[row[0]] = row[1]

    hard_bounces = bounce_counts.get("hard", 0)
    soft_bounces = bounce_counts.get("soft", 0)

    # Calculate rates
    delivery_rate = delivered / sent if sent > 0 else None
    bounce_rate = bounced / sent if sent > 0 else None
    complaint_rate = complaints / sent if sent > 0 else None
    open_rate = opens / delivered if delivered > 0 else None
    click_rate = clicks / delivered if delivered > 0 else None

    # Calculate health score
    health_score, score_factors = _calculate_score(
        sent, delivered, bounced, hard_bounces, complaints, opens, clicks
    )
    health_status = _get_status(health_score)

    # Upsert health entry
    health_result = db.execute(
        select(DomainHealth).where(
            and_(
                DomainHealth.domain_id == domain_id,
                DomainHealth.date == day_start,
            )
        )
    )
    existing = health_result.scalar_one_or_none()

    if existing:
        existing.total_sent = sent
        existing.total_delivered = delivered
        existing.total_bounced = bounced
        existing.hard_bounces = hard_bounces
        existing.soft_bounces = soft_bounces
        existing.complaints = complaints
        existing.opens = opens
        existing.clicks = clicks
        existing.delivery_rate = delivery_rate
        existing.bounce_rate = bounce_rate
        existing.complaint_rate = complaint_rate
        existing.open_rate = open_rate
        existing.click_rate = click_rate
        existing.health_score = health_score
        existing.health_status = health_status
        existing.score_factors = score_factors
    else:
        health = DomainHealth(
            id=str(uuid4()),
            domain_id=domain_id,
            date=day_start,
            total_sent=sent,
            total_delivered=delivered,
            total_bounced=bounced,
            hard_bounces=hard_bounces,
            soft_bounces=soft_bounces,
            complaints=complaints,
            opens=opens,
            clicks=clicks,
            delivery_rate=delivery_rate,
            bounce_rate=bounce_rate,
            complaint_rate=complaint_rate,
            open_rate=open_rate,
            click_rate=click_rate,
            health_score=health_score,
            health_status=health_status,
            score_factors=score_factors,
        )
        db.add(health)

    # Update domain health
    domain.health_score = health_score
    domain.health_status = health_status

    db.commit()


def _calculate_isp_metrics_sync(db, domain_id: str, date: datetime):
    """Sync version of ISP metrics calculation."""
    from uuid import uuid4
    from aexy.models.email_infrastructure import ISPMetrics, ISP_DOMAINS

    day_start = date.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)

    # Get events
    result = db.execute(
        select(ProviderEventLog)
        .where(
            and_(
                ProviderEventLog.domain_id == domain_id,
                ProviderEventLog.created_at >= day_start,
                ProviderEventLog.created_at < day_end,
                ProviderEventLog.recipient_email.isnot(None),
            )
        )
    )
    events = list(result.scalars().all())

    # Group by ISP
    isp_data = {}
    for event in events:
        email = event.recipient_email
        if not email or "@" not in email:
            continue

        email_domain = email.split("@")[1].lower()
        isp = "other"
        for isp_name, domains in ISP_DOMAINS.items():
            if email_domain in domains:
                isp = isp_name
                break

        if isp not in isp_data:
            isp_data[isp] = {
                "send": 0, "delivery": 0, "bounce": 0,
                "complaint": 0, "open": 0, "click": 0
            }

        event_type = event.event_type
        if event_type in isp_data[isp]:
            isp_data[isp][event_type] += 1

    # Create/update metrics
    for isp, counts in isp_data.items():
        sent = counts.get("send", 0)
        delivered = counts.get("delivery", 0)
        bounced = counts.get("bounce", 0)
        complaints = counts.get("complaint", 0)
        opens = counts.get("open", 0)
        clicks = counts.get("click", 0)

        delivery_rate = delivered / sent if sent > 0 else None
        bounce_rate = bounced / sent if sent > 0 else None
        complaint_rate = complaints / sent if sent > 0 else None
        open_rate = opens / delivered if delivered > 0 else None

        health_score, _ = _calculate_score(
            sent, delivered, bounced, 0, complaints, opens, clicks
        )

        # Check existing
        metrics_result = db.execute(
            select(ISPMetrics).where(
                and_(
                    ISPMetrics.domain_id == domain_id,
                    ISPMetrics.isp == isp,
                    ISPMetrics.date == day_start,
                )
            )
        )
        existing = metrics_result.scalar_one_or_none()

        if existing:
            existing.sent = sent
            existing.delivered = delivered
            existing.bounced = bounced
            existing.complaints = complaints
            existing.opens = opens
            existing.clicks = clicks
            existing.delivery_rate = delivery_rate
            existing.bounce_rate = bounce_rate
            existing.complaint_rate = complaint_rate
            existing.open_rate = open_rate
            existing.health_score = health_score
        else:
            metrics = ISPMetrics(
                id=str(uuid4()),
                domain_id=domain_id,
                isp=isp,
                date=day_start,
                sent=sent,
                delivered=delivered,
                bounced=bounced,
                complaints=complaints,
                opens=opens,
                clicks=clicks,
                delivery_rate=delivery_rate,
                bounce_rate=bounce_rate,
                complaint_rate=complaint_rate,
                open_rate=open_rate,
                health_score=health_score,
            )
            db.add(metrics)

    db.commit()


def _calculate_score(sent, delivered, bounced, hard_bounces, complaints, opens, clicks):
    """Calculate health score."""
    if sent == 0:
        return 100, {"note": "No emails sent"}

    bounce_rate = bounced / sent
    hard_bounce_rate = hard_bounces / sent if hard_bounces else 0
    complaint_rate = complaints / sent
    delivery_rate = delivered / sent

    bounce_factor = max(0, min(100, 100 - (bounce_rate * 500) - (hard_bounce_rate * 500)))
    complaint_factor = max(0, min(100, 100 - (complaint_rate * 100000)))
    delivery_factor = delivery_rate * 100

    if delivered > 0:
        open_rate = opens / delivered
        click_rate = clicks / delivered
        engagement_factor = min(100, (open_rate * 200) + (click_rate * 1000))
    else:
        engagement_factor = 50

    score = int(
        bounce_factor * 0.35 +
        complaint_factor * 0.35 +
        delivery_factor * 0.15 +
        engagement_factor * 0.15
    )
    score = max(0, min(100, score))

    return score, {
        "bounce_factor": int(bounce_factor),
        "complaint_factor": int(complaint_factor),
        "delivery_factor": int(delivery_factor),
        "engagement_factor": int(engagement_factor),
    }


def _get_status(score: int) -> str:
    """Get health status from score."""
    if score >= 90:
        return DomainHealthStatus.EXCELLENT.value
    elif score >= 70:
        return DomainHealthStatus.GOOD.value
    elif score >= 50:
        return DomainHealthStatus.FAIR.value
    elif score >= 30:
        return DomainHealthStatus.POOR.value
    else:
        return DomainHealthStatus.CRITICAL.value
