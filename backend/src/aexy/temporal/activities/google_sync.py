"""Temporal activities for Google Gmail and Calendar sync.

Replaces: aexy.processing.google_sync_tasks
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


# How long a job may sit in pending/running before it is treated as dead.
#
# A sync is minutes of work. An hour means the process running it is gone —
# killed mid-flight by a deploy, an OOM, or a database that went away — and it
# will never write a terminal status of its own.
STALE_SYNC_JOB_AFTER = timedelta(hours=1)


async def has_live_sync_job(db, integration, job_type: str) -> bool:
    """Is a sync already pending or running for *this account*?

    Pulled out of `check_auto_sync_integrations` so it can be tested without a
    Temporal worker — the guard is where the defect was, and a test that
    restates the query rather than calling it would pass against the bug.

    It used to match on workspace and job type alone, so one mailbox's in-flight
    sync suppressed every other mailbox in the workspace: the second person to
    connect could wait indefinitely. It also used `scalar_one_or_none()`, which
    raises when an account genuinely has two live jobs — swallowed by the
    caller's broad `except` and reported as a failure to trigger.

    And it had no age bound, which is the same bug once more: a job whose worker
    died still reads as live, so this returns True on every tick from then on
    and that account never syncs again. Nothing else reclaims it, and nothing
    says so — a desk simply stops receiving mail. Anything older than
    ``STALE_SYNC_JOB_AFTER`` is marked failed here and does not block the next
    run.
    """
    from datetime import datetime, timezone

    from sqlalchemy import and_, select

    from aexy.models.google_integration import GoogleSyncJob

    result = await db.execute(
        select(GoogleSyncJob).where(
            and_(
                GoogleSyncJob.workspace_id == integration.workspace_id,
                GoogleSyncJob.integration_id == integration.id,
                GoogleSyncJob.job_type == job_type,
                GoogleSyncJob.status.in_(["pending", "running"]),
            )
        )
    )
    jobs = result.scalars().all()
    if not jobs:
        return False

    cutoff = datetime.now(timezone.utc) - STALE_SYNC_JOB_AFTER
    live = False
    for job in jobs:
        started = job.started_at or job.created_at
        # Postgres hands these back aware; SQLite (tests) hands them back naive.
        # Comparing the two raises, and the raise is swallowed by the caller's
        # broad `except` and reported as a failure to trigger — the same way the
        # last two defects in this function hid.
        if started is not None and started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        # A row written this instant can have no timestamp yet; treat it as live
        # rather than reclaiming a job that is genuinely starting.
        if started is not None and started < cutoff:
            job.status = "failed"
            job.error = "Abandoned: no worker finished this job, reclaimed by the scheduler"
            logger.warning(
                "Reclaimed a stale %s sync job for integration %s (started %s)",
                job_type,
                integration.id,
                started.isoformat(),
            )
        else:
            live = True
    await db.commit()
    return live


@dataclass
class SyncGmailInput:
    job_id: str
    workspace_id: str
    integration_id: str
    max_messages: int = 500


@dataclass
class SyncCalendarInput:
    job_id: str
    workspace_id: str
    integration_id: str
    calendar_ids: list[str] | None = None
    days_back: int = 30
    days_forward: int = 90


@dataclass
class CheckAutoSyncInput:
    pass


@dataclass
class SyncGmailPushInput:
    integration_id: str


@dataclass
class RenewGmailWatchesInput:
    pass


@activity.defn
async def sync_gmail(input: SyncGmailInput) -> dict[str, Any]:
    """Sync Gmail messages for a workspace."""
    logger.info(f"Starting Gmail sync job {input.job_id}")
    activity.heartbeat("Starting Gmail sync")

    from aexy.processing.google_sync_tasks import _sync_gmail
    from aexy.services.gmail_sync_service import GmailAuthError

    try:
        result = await _sync_gmail(
            job_id=input.job_id,
            workspace_id=input.workspace_id,
            integration_id=input.integration_id,
            max_messages=input.max_messages,
        )
        return result
    except GmailAuthError:
        # Auth errors are not transient — deactivate integration so auto-sync
        # stops retrying until the user re-authenticates.
        logger.warning(
            f"Gmail auth failed for integration {input.integration_id}, "
            "deactivating until re-auth"
        )
        await _deactivate_integration(input.integration_id, "Google token expired or revoked. Please reconnect your Google account.")
        raise


@activity.defn
async def sync_calendar(input: SyncCalendarInput) -> dict[str, Any]:
    """Sync Google Calendar events for a workspace."""
    logger.info(f"Starting Calendar sync job {input.job_id}")
    activity.heartbeat("Starting Calendar sync")

    from aexy.processing.google_sync_tasks import _sync_calendar
    from aexy.services.gmail_sync_service import GmailAuthError

    try:
        result = await _sync_calendar(
            job_id=input.job_id,
            workspace_id=input.workspace_id,
            integration_id=input.integration_id,
            calendar_ids=input.calendar_ids,
            days_back=input.days_back,
            days_forward=input.days_forward,
        )
        return result
    except GmailAuthError:
        logger.warning(
            f"Google auth failed for integration {input.integration_id}, "
            "deactivating until re-auth"
        )
        await _deactivate_integration(input.integration_id, "Google token expired or revoked. Please reconnect your Google account.")
        raise


async def _deactivate_integration(integration_id: str, error_message: str) -> None:
    """Mark a Google integration as inactive with an error message."""
    try:
        from sqlalchemy import select
        from aexy.models.google_integration import GoogleIntegration

        async with async_session_maker() as db:
            result = await db.execute(
                select(GoogleIntegration).where(GoogleIntegration.id == integration_id)
            )
            integration = result.scalar_one_or_none()
            if integration:
                integration.is_active = False
                integration.last_error = error_message
                await db.commit()
                logger.info(f"Deactivated integration {integration_id} due to auth error")

                # This is the end of the line for this account: nothing retries
                # it, and the poller now skips it. Somebody has to be told, or
                # the first sign is a person asking why their mail stopped.
                from aexy.services.integration_health import (
                    notify_integration_disconnected,
                )

                await notify_integration_disconnected(
                    db,
                    workspace_id=integration.workspace_id,
                    provider="Google",
                    account_label=integration.google_email or "Google account",
                    reason=error_message,
                    connected_by_id=integration.connected_by_id,
                    settings_path="/settings/integrations",
                )
                await db.commit()
    except Exception as e:
        logger.error(f"Failed to deactivate integration {integration_id}: {e}")


@activity.defn
async def check_auto_sync_integrations(input: CheckAutoSyncInput) -> dict[str, Any]:
    """Check and trigger auto-syncs for integrations."""
    logger.info("Checking for integrations that need auto-sync")

    from datetime import datetime, timedelta, timezone
    from uuid import uuid4
    from sqlalchemy import false, or_, select, and_
    from aexy.models.google_integration import GoogleIntegration, GoogleSyncJob
    from aexy.models.service_desk import MailboxChannel, ServiceDeskMailbox
    from aexy.services.service_desk_config import intake_poll_minutes
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    gmail_syncs = 0
    calendar_syncs = 0
    gmail_skipped_interval = 0
    gmail_skipped_live = 0

    async with async_session_maker() as db:
        now = datetime.now(timezone.utc)

        # Which integrations are somebody's Service Desk intake. A desk mailbox
        # is not a personal inbox: mail arriving on it is a request waiting for a
        # ticket, so it is polled on the desk's own interval rather than the
        # 15-minute default a mailbox inherits for CRM enrichment.
        desk_integrations: dict[str, str] = {
            str(integration_id): str(workspace_id)
            for integration_id, workspace_id in (
                await db.execute(
                    select(ServiceDeskMailbox.integration_id, ServiceDeskMailbox.workspace_id).where(
                        ServiceDeskMailbox.is_active.is_(True),
                        ServiceDeskMailbox.channel == MailboxChannel.GMAIL_SYNC.value,
                        ServiceDeskMailbox.integration_id.is_not(None),
                    )
                )
            ).all()
        }

        # A desk mailbox whose integration is switched off is invisible to the
        # query below — it is excluded by the same `is_active` clause that keeps
        # personal accounts out. That is the failure with no symptom: the poller
        # runs on time, reports nothing wrong, and the desk quietly stops
        # receiving mail. Say so on every tick, with the reason.
        if desk_integrations:
            unhealthy = (
                await db.execute(
                    select(
                        ServiceDeskMailbox.address,
                        GoogleIntegration.is_active,
                        GoogleIntegration.gmail_sync_enabled,
                        GoogleIntegration.last_error,
                    )
                    .join(
                        GoogleIntegration,
                        GoogleIntegration.id == ServiceDeskMailbox.integration_id,
                    )
                    .where(
                        ServiceDeskMailbox.is_active.is_(True),
                        ServiceDeskMailbox.channel == MailboxChannel.GMAIL_SYNC.value,
                        or_(
                            GoogleIntegration.is_active.is_(False),
                            GoogleIntegration.gmail_sync_enabled.is_(False),
                        ),
                    )
                )
            ).all()
            for address, active, sync_enabled, last_error in unhealthy:
                logger.warning(
                    "Service desk mailbox %s is not being polled: "
                    "google integration is_active=%s gmail_sync_enabled=%s last_error=%s. "
                    "No tickets will be created from this mailbox until it is reconnected.",
                    address,
                    active,
                    sync_enabled,
                    last_error or "none",
                )

        # Gmail Auto-Sync
        gmail_result = await db.execute(
            select(GoogleIntegration).where(
                and_(
                    GoogleIntegration.is_active == True,
                    GoogleIntegration.gmail_sync_enabled == True,
                    # `> 0` means "auto-sync switched off" for a personal inbox,
                    # and that is right — but a desk mailbox on such an
                    # integration then never polled at all, and the desk simply
                    # received nothing with nothing to say why.
                    or_(
                        GoogleIntegration.auto_sync_interval_minutes > 0,
                        GoogleIntegration.id.in_(list(desk_integrations))
                        if desk_integrations
                        else false(),
                    ),
                )
            )
        )
        gmail_integrations = gmail_result.scalars().all()

        for integration in gmail_integrations:
            try:
                interval = integration.auto_sync_interval_minutes
                desk_workspace_id = desk_integrations.get(str(integration.id))
                if desk_workspace_id is not None:
                    desk_interval = await intake_poll_minutes(db, desk_workspace_id)
                    # A floor, not an override: an account already polling every
                    # minute for other reasons keeps doing so.
                    interval = min(interval, desk_interval) if interval > 0 else desk_interval
                last_sync = integration.gmail_last_sync_at
                if last_sync and now < last_sync + timedelta(minutes=interval):
                    gmail_skipped_interval += 1
                    continue

                if await has_live_sync_job(db, integration, "gmail"):
                    gmail_skipped_live += 1
                    continue

                job = GoogleSyncJob(
                    id=str(uuid4()), workspace_id=integration.workspace_id,
                    integration_id=integration.id, job_type="gmail",
                    status="pending", progress_message="Gmail auto-sync queued...",
                )
                db.add(job)
                await db.commit()

                await dispatch(
                    "sync_gmail",
                    SyncGmailInput(
                        job_id=job.id, workspace_id=integration.workspace_id,
                        integration_id=integration.id, max_messages=200,
                    ),
                    task_queue=TaskQueue.SYNC,
                )
                gmail_syncs += 1
            except Exception as e:
                logger.error(f"Failed to trigger Gmail auto-sync: {e}")

        # Calendar Auto-Sync
        calendar_result = await db.execute(
            select(GoogleIntegration).where(
                and_(
                    GoogleIntegration.is_active == True,
                    GoogleIntegration.calendar_sync_enabled == True,
                    GoogleIntegration.auto_sync_calendar_interval_minutes > 0,
                )
            )
        )
        calendar_integrations = calendar_result.scalars().all()

        for integration in calendar_integrations:
            try:
                interval = integration.auto_sync_calendar_interval_minutes
                last_sync = integration.calendar_last_sync_at
                if last_sync and now < last_sync + timedelta(minutes=interval):
                    continue

                if await has_live_sync_job(db, integration, "calendar"):
                    continue

                job = GoogleSyncJob(
                    id=str(uuid4()), workspace_id=integration.workspace_id,
                    integration_id=integration.id, job_type="calendar",
                    status="pending", progress_message="Calendar auto-sync queued...",
                )
                db.add(job)
                await db.commit()

                await dispatch(
                    "sync_calendar",
                    SyncCalendarInput(
                        job_id=job.id, workspace_id=integration.workspace_id,
                        integration_id=integration.id,
                    ),
                    task_queue=TaskQueue.SYNC,
                )
                calendar_syncs += 1
            except Exception as e:
                logger.error(f"Failed to trigger Calendar auto-sync: {e}")

    # The repo auto-sync has always logged its tally and this had not, so a desk
    # receiving nothing looked identical to a desk with nothing to receive.
    logger.info(
        "Gmail auto-sync check complete: %d triggered, %d within their interval, "
        "%d already running, %d desk mailbox(es) configured",
        gmail_syncs,
        gmail_skipped_interval,
        gmail_skipped_live,
        len(desk_integrations),
    )
    return {"gmail_syncs": gmail_syncs, "calendar_syncs": calendar_syncs}


@activity.defn
async def sync_gmail_push(input: SyncGmailPushInput) -> dict[str, Any]:
    """Run one incremental sync because Gmail said this mailbox changed.

    The same work the poller does, reached sooner. Deliberately incremental
    only: a push notification means "there is history since your cursor", and
    falling back to a full sync here would let one dropped notification trigger
    a whole-mailbox re-read on a queue meant for seconds-long jobs.
    """
    from aexy.core.database import get_async_session
    from aexy.models.google_integration import GoogleIntegration
    from aexy.services.gmail_sync_service import GmailSyncService

    async with get_async_session() as session:
        integration = await session.get(GoogleIntegration, input.integration_id)
        if integration is None or not integration.gmail_sync_enabled:
            return {"skipped": "integration unavailable"}
        result = await GmailSyncService(session).start_incremental_sync(integration)
        integration.gmail_last_sync_at = datetime.now(timezone.utc)
    logger.info("Gmail push sync for %s: %s", input.integration_id, result)
    return result


@activity.defn
async def renew_gmail_watches(input: RenewGmailWatchesInput) -> int:
    """Re-register push subscriptions before Gmail drops them.

    Gmail expires a watch after seven days and then simply stops delivering —
    no error, no callback. A desk that registered once would go quiet a week
    later and look like its mail had stopped arriving, so this runs daily and
    renews anything lapsing within two days.

    Registering again on a live watch is how renewal works: Gmail replaces it
    and returns a fresh expiry, so there is nothing to tear down first.
    """
    from datetime import timedelta

    from sqlalchemy import or_, select

    from aexy.core.config import get_settings
    from aexy.core.database import get_async_session
    from aexy.models.google_integration import GoogleIntegration
    from aexy.models.service_desk import MailboxChannel, ServiceDeskMailbox
    from aexy.services.gmail_sync_service import GmailSyncService

    if not get_settings().gmail_push_topic:
        return 0

    renewed = 0
    cutoff = datetime.now(timezone.utc) + timedelta(days=2)
    async with get_async_session() as session:
        integrations = (
            await session.execute(
                select(GoogleIntegration)
                .join(
                    ServiceDeskMailbox,
                    ServiceDeskMailbox.integration_id == GoogleIntegration.id,
                )
                .where(
                    GoogleIntegration.is_active.is_(True),
                    GoogleIntegration.gmail_sync_enabled.is_(True),
                    ServiceDeskMailbox.is_active.is_(True),
                    ServiceDeskMailbox.channel == MailboxChannel.GMAIL_SYNC.value,
                    # Never registered, or lapsing soon. The first is how a
                    # newly connected desk mailbox gets onto push at all.
                    or_(
                        GoogleIntegration.gmail_watch_expires_at.is_(None),
                        GoogleIntegration.gmail_watch_expires_at <= cutoff,
                    ),
                )
                .distinct()
            )
        ).scalars().all()

        for integration in integrations:
            try:
                await GmailSyncService(session).start_watch(integration)
                renewed += 1
            except Exception:  # noqa: BLE001 — one bad mailbox must not stop the rest
                logger.exception(
                    "Gmail push: could not renew the watch for integration %s. "
                    "This mailbox stays on the polling path.",
                    integration.id,
                )
                await session.rollback()
    logger.info("Gmail push: renewed %s watches", renewed)
    return renewed
