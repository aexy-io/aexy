"""Temporal activities for Google Gmail and Calendar sync.

Replaces: aexy.processing.google_sync_tasks
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


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
    """
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
    return result.scalars().first() is not None


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
                    continue

                if await has_live_sync_job(db, integration, "gmail"):
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

    return {"gmail_syncs": gmail_syncs, "calendar_syncs": calendar_syncs}
