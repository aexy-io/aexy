"""Temporal activities for Google Gmail and Calendar sync.

Replaces: aexy.processing.google_sync_tasks
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


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

    result = await _sync_gmail(
        job_id=input.job_id,
        workspace_id=input.workspace_id,
        integration_id=input.integration_id,
        max_messages=input.max_messages,
    )
    return result


@activity.defn
async def sync_calendar(input: SyncCalendarInput) -> dict[str, Any]:
    """Sync Google Calendar events for a workspace."""
    logger.info(f"Starting Calendar sync job {input.job_id}")
    activity.heartbeat("Starting Calendar sync")

    from aexy.processing.google_sync_tasks import _sync_calendar

    result = await _sync_calendar(
        job_id=input.job_id,
        workspace_id=input.workspace_id,
        integration_id=input.integration_id,
        calendar_ids=input.calendar_ids,
        days_back=input.days_back,
        days_forward=input.days_forward,
    )
    return result


@activity.defn
async def check_auto_sync_integrations(input: CheckAutoSyncInput) -> dict[str, Any]:
    """Check and trigger auto-syncs for integrations."""
    logger.info("Checking for integrations that need auto-sync")

    from datetime import datetime, timedelta, timezone
    from uuid import uuid4
    from sqlalchemy import select, and_
    from aexy.models.google_integration import GoogleIntegration, GoogleSyncJob
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    gmail_syncs = 0
    calendar_syncs = 0

    async with async_session_maker() as db:
        now = datetime.now(timezone.utc)

        # Gmail Auto-Sync
        gmail_result = await db.execute(
            select(GoogleIntegration).where(
                and_(
                    GoogleIntegration.is_active == True,
                    GoogleIntegration.gmail_sync_enabled == True,
                    GoogleIntegration.auto_sync_interval_minutes > 0,
                )
            )
        )
        gmail_integrations = gmail_result.scalars().all()

        for integration in gmail_integrations:
            try:
                interval = integration.auto_sync_interval_minutes
                last_sync = integration.gmail_last_sync_at
                if last_sync and now < last_sync + timedelta(minutes=interval):
                    continue

                existing = await db.execute(
                    select(GoogleSyncJob).where(
                        and_(
                            GoogleSyncJob.workspace_id == integration.workspace_id,
                            GoogleSyncJob.job_type == "gmail",
                            GoogleSyncJob.status.in_(["pending", "running"]),
                        )
                    )
                )
                if existing.scalar_one_or_none():
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

                existing = await db.execute(
                    select(GoogleSyncJob).where(
                        and_(
                            GoogleSyncJob.workspace_id == integration.workspace_id,
                            GoogleSyncJob.job_type == "calendar",
                            GoogleSyncJob.status.in_(["pending", "running"]),
                        )
                    )
                )
                if existing.scalar_one_or_none():
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
