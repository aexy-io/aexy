"""Legacy task functions for on-call scheduling.

Business logic has been moved to Temporal activities.
These functions are retained as plain functions so Temporal activities can
import and call the inner async helpers (e.g. _check_upcoming_shifts_async).

These tasks handle:
- Shift change notifications
- Upcoming shift reminders
- Google Calendar sync
"""

import logging
from datetime import datetime, timezone

from aexy.core.database import async_session_maker
from aexy.services.oncall_service import OnCallService
from aexy.services.notification_service import NotificationService
from aexy.services.google_calendar_service import GoogleCalendarService
from aexy.models.notification import NotificationEventType

logger = logging.getLogger(__name__)


def check_upcoming_shifts():
    """Check for shifts starting soon and send notifications.

    This task runs every 5 minutes and:
    1. Finds shifts starting within the next 30 minutes
    2. Sends ONCALL_SHIFT_STARTING notifications to the developer
    3. Marks the shift as notified to prevent duplicate notifications
    """
    from aexy.processing.tasks import run_async
    run_async(_check_upcoming_shifts_async())


async def _check_upcoming_shifts_async():
    """Async implementation of shift checking."""
    async with async_session_maker() as db:
        try:
            oncall_service = OnCallService(db)
            notification_service = NotificationService(db)

            # Get shifts starting soon
            shifts = await oncall_service.get_upcoming_shifts_to_notify(minutes_ahead=30)

            for shift in shifts:
                developer = shift.developer
                config = shift.config
                team = config.team if config else None

                if not developer or not team:
                    continue

                # Create notification
                await notification_service.create_notification(
                    recipient_id=str(developer.id),
                    event_type=NotificationEventType.ONCALL_SHIFT_STARTING,
                    title=f"Your on-call shift starts soon",
                    body=f"Your on-call shift for {team.name} starts at {shift.start_time.strftime('%H:%M %Z')}",
                    context={
                        "team_id": str(team.id),
                        "team_name": team.name,
                        "schedule_id": str(shift.id),
                        "start_time": shift.start_time.isoformat(),
                        "end_time": shift.end_time.isoformat(),
                        "workspace_id": str(team.workspace_id),
                    },
                )

                # Mark as notified
                await oncall_service.mark_shift_start_notified(str(shift.id))

                logger.info(f"Sent shift starting notification for schedule {shift.id}")

            await db.commit()
            logger.info(f"Processed {len(shifts)} upcoming shift notifications")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error checking upcoming shifts: {e}")
            raise


def check_ending_shifts():
    """Check for shifts ending soon and send notifications.

    This task runs every 5 minutes and sends ONCALL_SHIFT_ENDING
    notifications 30 minutes before a shift ends.
    """
    from aexy.processing.tasks import run_async
    run_async(_check_ending_shifts_async())


async def _check_ending_shifts_async():
    """Async implementation of ending shift checking."""
    async with async_session_maker() as db:
        try:
            oncall_service = OnCallService(db)
            notification_service = NotificationService(db)

            # Get shifts ending soon
            shifts = await oncall_service.get_ending_shifts_to_notify(minutes_ahead=30)

            for shift in shifts:
                developer = shift.developer
                config = shift.config
                team = config.team if config else None

                if not developer or not team:
                    continue

                # Get next shift info for handoff context
                next_shift = await oncall_service.get_next_oncall(str(team.id))
                next_person = None
                if next_shift and next_shift.developer:
                    next_person = next_shift.developer.name or next_shift.developer.email

                body = f"Your on-call shift for {team.name} ends at {shift.end_time.strftime('%H:%M %Z')}"
                if next_person:
                    body += f"\n{next_person} will be taking over."

                # Create notification
                await notification_service.create_notification(
                    recipient_id=str(developer.id),
                    event_type=NotificationEventType.ONCALL_SHIFT_ENDING,
                    title=f"Your on-call shift ends soon",
                    body=body,
                    context={
                        "team_id": str(team.id),
                        "team_name": team.name,
                        "schedule_id": str(shift.id),
                        "end_time": shift.end_time.isoformat(),
                        "next_oncall": next_person,
                        "workspace_id": str(team.workspace_id),
                    },
                )

                # Mark as notified
                await oncall_service.mark_shift_end_notified(str(shift.id))

                logger.info(f"Sent shift ending notification for schedule {shift.id}")

            await db.commit()
            logger.info(f"Processed {len(shifts)} ending shift notifications")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error checking ending shifts: {e}")
            raise


def sync_calendar_events(config_id: str):
    """Sync all on-call schedules for a config to Google Calendar.

    Args:
        config_id: The on-call config ID to sync.
    """
    from aexy.processing.tasks import run_async
    run_async(_sync_calendar_events_async(config_id))


async def _sync_calendar_events_async(config_id: str):
    """Async implementation of calendar sync."""
    async with async_session_maker() as db:
        try:
            calendar_service = GoogleCalendarService(db)
            synced_count = await calendar_service.sync_all_schedules(config_id)
            await db.commit()
            logger.info(f"Synced {synced_count} schedules to Google Calendar for config {config_id}")
        except Exception as e:
            await db.rollback()
            logger.error(f"Error syncing calendar events for config {config_id}: {e}")
            raise


def send_swap_notification(swap_id: str, notification_type: str):
    """Send notification for a swap request event.

    Args:
        swap_id: The swap request ID.
        notification_type: One of 'requested', 'accepted', 'declined'.
    """
    from aexy.processing.tasks import run_async
    run_async(_send_swap_notification_async(swap_id, notification_type))


async def _send_swap_notification_async(swap_id: str, notification_type: str):
    """Async implementation of swap notification."""
    from sqlalchemy import select
    from aexy.models.oncall import OnCallSwapRequest

    async with async_session_maker() as db:
        try:
            # Get swap request with relations
            from sqlalchemy.orm import selectinload
            stmt = (
                select(OnCallSwapRequest)
                .where(OnCallSwapRequest.id == swap_id)
                .options(
                    selectinload(OnCallSwapRequest.requester),
                    selectinload(OnCallSwapRequest.target),
                    selectinload(OnCallSwapRequest.schedule),
                )
            )
            result = await db.execute(stmt)
            swap = result.scalar_one_or_none()

            if not swap:
                logger.warning(f"Swap request {swap_id} not found")
                return

            notification_service = NotificationService(db)

            if notification_type == "requested":
                # Notify target that they received a swap request
                await notification_service.create_notification(
                    recipient_id=str(swap.target_id),
                    event_type=NotificationEventType.ONCALL_SWAP_REQUESTED,
                    title="On-call swap request",
                    body=f"{swap.requester.name or swap.requester.email} wants to swap their on-call shift with you",
                    context={
                        "swap_id": str(swap.id),
                        "requester_name": swap.requester.name or swap.requester.email,
                        "schedule_id": str(swap.schedule_id),
                        "message": swap.message,
                    },
                )

            elif notification_type == "accepted":
                # Notify requester that swap was accepted
                await notification_service.create_notification(
                    recipient_id=str(swap.requester_id),
                    event_type=NotificationEventType.ONCALL_SWAP_ACCEPTED,
                    title="Swap request accepted",
                    body=f"{swap.target.name or swap.target.email} accepted your on-call swap request",
                    context={
                        "swap_id": str(swap.id),
                        "target_name": swap.target.name or swap.target.email,
                        "schedule_id": str(swap.schedule_id),
                    },
                )

            elif notification_type == "declined":
                # Notify requester that swap was declined
                await notification_service.create_notification(
                    recipient_id=str(swap.requester_id),
                    event_type=NotificationEventType.ONCALL_SWAP_DECLINED,
                    title="Swap request declined",
                    body=f"{swap.target.name or swap.target.email} declined your on-call swap request",
                    context={
                        "swap_id": str(swap.id),
                        "target_name": swap.target.name or swap.target.email,
                        "schedule_id": str(swap.schedule_id),
                        "response_message": swap.response_message,
                    },
                )

            await db.commit()
            logger.info(f"Sent {notification_type} notification for swap {swap_id}")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error sending swap notification: {e}")
            raise
