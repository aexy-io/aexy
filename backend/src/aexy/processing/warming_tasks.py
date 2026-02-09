"""Legacy task functions for email warming automation.

Business logic has been moved to Temporal activities.
These functions are retained as plain functions for backward compatibility.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import select, and_

from aexy.core.database import get_sync_session
from aexy.models.email_infrastructure import (
    SendingDomain,
    DedicatedIP,
    WarmingStatus,
    DomainStatus,
)

logger = logging.getLogger(__name__)


def process_warming_day() -> dict:
    """
    Daily task to advance warming for all domains.

    Runs at midnight UTC to:
    - Advance domains to next warming day
    - Update daily limits based on schedule
    - Check threshold violations
    """
    logger.info("Processing daily warming advancement")

    with get_sync_session() as db:
        from aexy.services.warming_service import WarmingService

        # Find all domains in warming
        result = db.execute(
            select(SendingDomain).where(
                SendingDomain.warming_status == WarmingStatus.IN_PROGRESS.value
            )
        )
        domains = list(result.scalars().all())

        advanced = 0
        completed = 0
        paused = 0

        service = WarmingService(db)

        for domain in domains:
            try:
                # Use sync version of advance
                from sqlalchemy import select as sync_select

                # Get schedule
                from aexy.models.email_infrastructure import WarmingSchedule, WarmingProgress
                schedule_result = db.execute(
                    sync_select(WarmingSchedule).where(
                        WarmingSchedule.id == domain.warming_schedule_id
                    )
                )
                schedule = schedule_result.scalar_one_or_none()

                if not schedule:
                    continue

                steps = schedule.steps
                current_day = domain.warming_day
                next_day = current_day + 1

                # Mark current day as completed
                progress_result = db.execute(
                    sync_select(WarmingProgress).where(
                        and_(
                            WarmingProgress.domain_id == domain.id,
                            WarmingProgress.day_number == current_day,
                        )
                    )
                )
                current_progress = progress_result.scalar_one_or_none()

                if current_progress:
                    current_progress.completed = True
                    current_progress.actual_volume = domain.daily_sent

                    # Calculate rates
                    if current_progress.sent > 0:
                        current_progress.delivery_rate = current_progress.delivered / current_progress.sent
                        current_progress.bounce_rate = current_progress.bounced / current_progress.sent
                        current_progress.complaint_rate = current_progress.complaints / current_progress.sent

                        # Check thresholds
                        if (current_progress.bounce_rate > schedule.max_bounce_rate or
                            current_progress.complaint_rate > schedule.max_complaint_rate):
                            current_progress.threshold_exceeded = True

                            if schedule.auto_pause_on_threshold:
                                domain.warming_status = WarmingStatus.PAUSED.value
                                domain.status = DomainStatus.PAUSED.value
                                paused += 1
                                logger.warning(f"Auto-paused warming for domain {domain.domain}")
                                db.commit()
                                continue

                # Check if warming is complete
                max_day = max(step.get("day", 0) for step in steps)
                if next_day > max_day:
                    domain.warming_status = WarmingStatus.COMPLETED.value
                    domain.status = DomainStatus.ACTIVE.value
                    domain.daily_limit = steps[-1].get("volume", 100000)
                    completed += 1
                    logger.info(f"Warming completed for domain {domain.domain}")
                    db.commit()
                    continue

                # Find volume for next day
                next_volume = None
                for i, step in enumerate(steps):
                    if step.get("day") >= next_day:
                        if i == 0:
                            next_volume = step.get("volume")
                        else:
                            prev_step = steps[i - 1]
                            prev_day = prev_step.get("day")
                            prev_vol = prev_step.get("volume")
                            curr_day = step.get("day")
                            curr_vol = step.get("volume")

                            if curr_day == prev_day:
                                next_volume = curr_vol
                            else:
                                ratio = (next_day - prev_day) / (curr_day - prev_day)
                                next_volume = int(prev_vol + (curr_vol - prev_vol) * ratio)
                        break

                if next_volume is None:
                    next_volume = steps[-1].get("volume", 100000)

                # Update domain
                domain.warming_day = next_day
                domain.daily_limit = next_volume
                domain.daily_sent = 0

                # Create new progress entry
                from uuid import uuid4
                new_progress = WarmingProgress(
                    id=str(uuid4()),
                    domain_id=domain.id,
                    day_number=next_day,
                    date=datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0),
                    target_volume=next_volume,
                )
                db.add(new_progress)

                advanced += 1
                logger.info(f"Advanced domain {domain.domain} to day {next_day}")

                db.commit()

            except Exception as e:
                logger.error(f"Error advancing warming for domain {domain.id}: {e}")
                db.rollback()

        logger.info(f"Warming day complete: {advanced} advanced, {completed} completed, {paused} paused")
        return {
            "advanced": advanced,
            "completed": completed,
            "paused": paused,
        }


def check_warming_thresholds() -> dict:
    """
    Hourly task to check warming thresholds.

    Checks current day metrics against thresholds and pauses if exceeded.
    """
    logger.info("Checking warming thresholds")

    with get_sync_session() as db:
        from aexy.models.email_infrastructure import WarmingSchedule, WarmingProgress

        # Find all domains in warming
        result = db.execute(
            select(SendingDomain).where(
                SendingDomain.warming_status == WarmingStatus.IN_PROGRESS.value
            )
        )
        domains = list(result.scalars().all())

        paused = 0

        for domain in domains:
            try:
                # Get current progress
                progress_result = db.execute(
                    select(WarmingProgress).where(
                        and_(
                            WarmingProgress.domain_id == domain.id,
                            WarmingProgress.day_number == domain.warming_day,
                        )
                    )
                )
                progress = progress_result.scalar_one_or_none()

                if not progress or progress.sent == 0:
                    continue

                # Get schedule
                schedule_result = db.execute(
                    select(WarmingSchedule).where(
                        WarmingSchedule.id == domain.warming_schedule_id
                    )
                )
                schedule = schedule_result.scalar_one_or_none()

                if not schedule:
                    continue

                # Calculate current rates
                bounce_rate = progress.bounced / progress.sent if progress.sent > 0 else 0
                complaint_rate = progress.complaints / progress.sent if progress.sent > 0 else 0

                # Check thresholds
                if schedule.auto_pause_on_threshold:
                    if bounce_rate > schedule.max_bounce_rate:
                        domain.warming_status = WarmingStatus.PAUSED.value
                        domain.status = DomainStatus.PAUSED.value
                        progress.threshold_exceeded = True
                        paused += 1
                        logger.warning(f"Paused {domain.domain}: bounce rate {bounce_rate:.2%}")

                    elif complaint_rate > schedule.max_complaint_rate:
                        domain.warming_status = WarmingStatus.PAUSED.value
                        domain.status = DomainStatus.PAUSED.value
                        progress.threshold_exceeded = True
                        paused += 1
                        logger.warning(f"Paused {domain.domain}: complaint rate {complaint_rate:.4%}")

                db.commit()

            except Exception as e:
                logger.error(f"Error checking thresholds for domain {domain.id}: {e}")
                db.rollback()

        return {"paused": paused}


def reset_daily_volumes() -> dict:
    """
    Daily task to reset daily send counters.

    Runs at midnight UTC to reset:
    - Domain daily_sent counters
    - Provider current_daily_sends counters
    """
    logger.info("Resetting daily send volumes")

    with get_sync_session() as db:
        from aexy.models.email_infrastructure import EmailProvider

        now = datetime.now(timezone.utc)

        # Reset domain counters
        domain_result = db.execute(select(SendingDomain))
        domains = list(domain_result.scalars().all())

        for domain in domains:
            domain.daily_sent = 0
            domain.daily_reset_at = now

        # Reset provider counters
        provider_result = db.execute(select(EmailProvider))
        providers = list(provider_result.scalars().all())

        for provider in providers:
            provider.current_daily_sends = 0
            provider.daily_sends_reset_at = now

        db.commit()

        logger.info(f"Reset daily volumes for {len(domains)} domains and {len(providers)} providers")
        return {
            "domains_reset": len(domains),
            "providers_reset": len(providers),
        }


def update_warming_metrics(
    domain_id: str,
    sent: int = 0,
    delivered: int = 0,
    bounced: int = 0,
    complaints: int = 0,
) -> dict:
    """
    Task to update warming metrics after sending emails.

    Called by email sending tasks to update daily progress.
    """
    with get_sync_session() as db:
        from aexy.models.email_infrastructure import WarmingProgress

        # Get domain
        domain_result = db.execute(
            select(SendingDomain).where(SendingDomain.id == domain_id)
        )
        domain = domain_result.scalar_one_or_none()

        if not domain or domain.warming_status != WarmingStatus.IN_PROGRESS.value:
            return {"updated": False, "reason": "Domain not in warming"}

        # Get today's progress
        progress_result = db.execute(
            select(WarmingProgress).where(
                and_(
                    WarmingProgress.domain_id == domain_id,
                    WarmingProgress.day_number == domain.warming_day,
                )
            )
        )
        progress = progress_result.scalar_one_or_none()

        if progress:
            progress.sent += sent
            progress.delivered += delivered
            progress.bounced += bounced
            progress.complaints += complaints
            db.commit()
            return {"updated": True}

        return {"updated": False, "reason": "Progress entry not found"}
