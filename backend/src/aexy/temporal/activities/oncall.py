"""Temporal activities for on-call scheduling.

Replaces: aexy.processing.oncall_tasks
"""

import logging
from dataclasses import dataclass
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class CheckUpcomingShiftsInput:
    pass


@dataclass
class CheckEndingShiftsInput:
    pass


@dataclass
class SyncCalendarEventsInput:
    config_id: str


@dataclass
class SendSwapNotificationInput:
    swap_id: str
    notification_type: str


@activity.defn
async def check_upcoming_shifts(input: CheckUpcomingShiftsInput) -> dict[str, Any]:
    """Check for shifts starting soon and send notifications."""
    logger.info("Checking upcoming on-call shifts")

    from aexy.processing.oncall_tasks import _check_upcoming_shifts_async
    await _check_upcoming_shifts_async()
    return {"status": "completed"}


@activity.defn
async def check_ending_shifts(input: CheckEndingShiftsInput) -> dict[str, Any]:
    """Check for shifts ending soon and send notifications."""
    logger.info("Checking ending on-call shifts")

    from aexy.processing.oncall_tasks import _check_ending_shifts_async
    await _check_ending_shifts_async()
    return {"status": "completed"}


@activity.defn
async def sync_oncall_calendar_events(input: SyncCalendarEventsInput) -> dict[str, Any]:
    """Sync on-call schedules to Google Calendar."""
    logger.info(f"Syncing calendar events for config {input.config_id}")

    from aexy.services.google_calendar_service import GoogleCalendarService

    async with async_session_maker() as db:
        try:
            service = GoogleCalendarService(db)
            synced = await service.sync_all_schedules(input.config_id)
            await db.commit()
            return {"synced": synced}
        except Exception as e:
            await db.rollback()
            raise


@activity.defn
async def send_swap_notification(input: SendSwapNotificationInput) -> dict[str, Any]:
    """Send notification for a swap request event."""
    logger.info(f"Sending {input.notification_type} notification for swap {input.swap_id}")

    from aexy.processing.oncall_tasks import _send_swap_notification_async
    await _send_swap_notification_async(input.swap_id, input.notification_type)
    return {"status": "sent", "type": input.notification_type}
