"""Temporal activities for booking module.

Replaces: aexy.processing.booking_tasks
"""

import logging
from dataclasses import dataclass
from typing import Any

from temporalio import activity

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


@dataclass
class SendBookingRemindersInput:
    pass


@dataclass
class SyncAllCalendarsInput:
    pass


@dataclass
class ProcessBookingWebhooksInput:
    booking_id: str
    event_type: str


@dataclass
class CleanupExpiredPendingInput:
    pass


@dataclass
class MarkCompletedBookingsInput:
    pass


@dataclass
class GenerateBookingAnalyticsInput:
    workspace_id: str


@dataclass
class SendBookingNotificationInput:
    booking_id: str
    notification_type: str


@dataclass
class CreateCalendarEventInput:
    booking_id: str


@activity.defn
async def send_booking_reminders(input: SendBookingRemindersInput) -> dict[str, Any]:
    """Send reminder emails for upcoming bookings."""
    logger.info("Sending booking reminders")

    from datetime import datetime, timedelta, timezone
    from sqlalchemy import select, and_
    from aexy.models.booking import Booking, BookingStatus

    async with async_session_maker() as db:
        try:
            now = datetime.now(timezone.utc)

            # 24-hour reminders
            reminder_24h_start = now + timedelta(hours=23, minutes=45)
            reminder_24h_end = now + timedelta(hours=24, minutes=15)

            stmt_24h = select(Booking).where(
                and_(
                    Booking.status == BookingStatus.CONFIRMED,
                    Booking.start_time >= reminder_24h_start,
                    Booking.start_time <= reminder_24h_end,
                    Booking.reminder_sent == False,
                )
            )
            result = await db.execute(stmt_24h)
            bookings_24h = result.scalars().all()

            for booking in bookings_24h:
                try:
                    from aexy.services.booking.booking_notification_service import BookingNotificationService
                    notification_service = BookingNotificationService(db)
                    await notification_service.send_reminder(str(booking.id), hours_before=24)
                except Exception as e:
                    logger.error(f"Failed to send 24h reminder for booking {booking.id}: {e}")

            # 1-hour reminders
            reminder_1h_start = now + timedelta(minutes=55)
            reminder_1h_end = now + timedelta(hours=1, minutes=5)

            stmt_1h = select(Booking).where(
                and_(
                    Booking.status == BookingStatus.CONFIRMED,
                    Booking.start_time >= reminder_1h_start,
                    Booking.start_time <= reminder_1h_end,
                    Booking.reminder_sent == True,
                )
            )
            result = await db.execute(stmt_1h)
            bookings_1h = result.scalars().all()

            for booking in bookings_1h:
                try:
                    from aexy.services.booking.booking_notification_service import BookingNotificationService
                    notification_service = BookingNotificationService(db)
                    await notification_service.send_reminder(str(booking.id), hours_before=1)
                except Exception as e:
                    logger.error(f"Failed to send 1h reminder for booking {booking.id}: {e}")

            await db.commit()
            return {
                "reminders_24h": len(bookings_24h),
                "reminders_1h": len(bookings_1h),
            }
        except Exception as e:
            await db.rollback()
            logger.error(f"Error sending booking reminders: {e}")
            raise


@activity.defn
async def sync_all_calendars(input: SyncAllCalendarsInput) -> dict[str, Any]:
    """Sync calendar events for all active connections."""
    logger.info("Syncing all calendars")

    from sqlalchemy import select
    from aexy.models.booking import CalendarConnection

    async with async_session_maker() as db:
        try:
            stmt = select(CalendarConnection).where(CalendarConnection.sync_enabled == True)
            result = await db.execute(stmt)
            connections = result.scalars().all()

            synced_count = 0
            for connection in connections:
                try:
                    from aexy.services.booking.calendar_sync_service import CalendarSyncService
                    calendar_service = CalendarSyncService(db)
                    await calendar_service.sync_calendar_events(str(connection.id))
                    synced_count += 1
                except Exception as e:
                    logger.error(f"Failed to sync calendar connection {connection.id}: {e}")

            await db.commit()
            return {"synced": synced_count, "total": len(connections)}
        except Exception as e:
            await db.rollback()
            raise


@activity.defn
async def process_booking_webhooks(input: ProcessBookingWebhooksInput) -> dict[str, Any]:
    """Dispatch webhooks for a booking event."""
    logger.info(f"Processing webhooks for booking {input.booking_id}")

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from aexy.models.booking import Booking, BookingWebhook

    async with async_session_maker() as db:
        try:
            stmt = (
                select(Booking)
                .where(Booking.id == input.booking_id)
                .options(selectinload(Booking.event_type), selectinload(Booking.host))
            )
            result = await db.execute(stmt)
            booking = result.scalar_one_or_none()

            if not booking:
                return {"error": "Booking not found"}

            stmt = select(BookingWebhook).where(
                BookingWebhook.workspace_id == booking.workspace_id,
                BookingWebhook.is_active == True,
                BookingWebhook.events.contains([input.event_type]),
            )
            result = await db.execute(stmt)
            webhooks = result.scalars().all()

            dispatched = 0
            for webhook in webhooks:
                try:
                    from aexy.services.booking.booking_notification_service import BookingNotificationService
                    notification_service = BookingNotificationService(db)
                    await notification_service.dispatch_webhook(webhook, booking, input.event_type)
                    dispatched += 1
                except Exception as e:
                    logger.error(f"Failed to dispatch webhook {webhook.id}: {e}")
                    webhook.failure_count = (webhook.failure_count or 0) + 1
                    if webhook.failure_count >= 5:
                        webhook.is_active = False

            await db.commit()
            return {"dispatched": dispatched}
        except Exception as e:
            await db.rollback()
            raise


@activity.defn
async def cleanup_expired_pending(input: CleanupExpiredPendingInput) -> dict[str, Any]:
    """Cancel bookings that have been pending payment for too long."""
    logger.info("Cleaning up expired pending bookings")

    from datetime import datetime, timedelta, timezone
    from sqlalchemy import select, and_
    from aexy.models.booking import Booking, BookingStatus, PaymentStatus

    async with async_session_maker() as db:
        try:
            now = datetime.now(timezone.utc)
            expiry_time = now - timedelta(minutes=30)

            stmt = select(Booking).where(
                and_(
                    Booking.payment_status == PaymentStatus.PENDING,
                    Booking.status == BookingStatus.PENDING,
                    Booking.created_at < expiry_time,
                )
            )
            result = await db.execute(stmt)
            expired = result.scalars().all()

            for booking in expired:
                booking.status = BookingStatus.CANCELLED
                booking.cancellation_reason = "Payment not completed within 30 minutes"
                booking.cancelled_at = now

            await db.commit()
            return {"cleaned_up": len(expired)}
        except Exception as e:
            await db.rollback()
            raise


@activity.defn
async def mark_completed_bookings(input: MarkCompletedBookingsInput) -> dict[str, Any]:
    """Mark confirmed bookings as completed after their end time."""
    logger.info("Marking completed bookings")

    from datetime import datetime, timezone
    from sqlalchemy import select, and_
    from aexy.models.booking import Booking, BookingStatus

    async with async_session_maker() as db:
        try:
            now = datetime.now(timezone.utc)
            stmt = select(Booking).where(
                and_(
                    Booking.status == BookingStatus.CONFIRMED,
                    Booking.end_time < now,
                )
            )
            result = await db.execute(stmt)
            completed = result.scalars().all()

            for booking in completed:
                booking.status = BookingStatus.COMPLETED

            await db.commit()
            return {"completed": len(completed)}
        except Exception as e:
            await db.rollback()
            raise


@activity.defn
async def generate_booking_analytics(input: GenerateBookingAnalyticsInput) -> dict[str, Any]:
    """Generate booking analytics for a workspace."""
    logger.info(f"Generating booking analytics for workspace {input.workspace_id}")

    from datetime import datetime, timedelta, timezone
    from sqlalchemy import select, func, and_
    from aexy.models.booking import Booking, BookingStatus

    async with async_session_maker() as db:
        now = datetime.now(timezone.utc)
        month_ago = now - timedelta(days=30)

        total_result = await db.execute(
            select(func.count(Booking.id)).where(Booking.workspace_id == input.workspace_id)
        )
        total = total_result.scalar() or 0

        status_result = await db.execute(
            select(Booking.status, func.count(Booking.id))
            .where(and_(Booking.workspace_id == input.workspace_id, Booking.created_at >= month_ago))
            .group_by(Booking.status)
        )
        status_breakdown = {str(row[0].value): row[1] for row in status_result.all()}

        return {"total": total, "status_breakdown": status_breakdown}


@activity.defn
async def send_booking_notification(input: SendBookingNotificationInput) -> dict[str, Any]:
    """Send a notification for a booking event."""
    logger.info(f"Sending {input.notification_type} notification for booking {input.booking_id}")

    async with async_session_maker() as db:
        try:
            from aexy.services.booking.booking_notification_service import BookingNotificationService
            service = BookingNotificationService(db)

            if input.notification_type == "confirmation":
                await service.send_confirmation(input.booking_id)
            elif input.notification_type == "cancellation":
                await service.send_cancellation(input.booking_id)
            elif input.notification_type == "reschedule":
                await service.send_reschedule(input.booking_id)

            await db.commit()
            return {"status": "sent", "type": input.notification_type}
        except Exception as e:
            await db.rollback()
            raise


@activity.defn
async def create_calendar_event(input: CreateCalendarEventInput) -> dict[str, Any]:
    """Create a calendar event for a confirmed booking."""
    logger.info(f"Creating calendar event for booking {input.booking_id}")

    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from aexy.models.booking import Booking

    async with async_session_maker() as db:
        try:
            stmt = (
                select(Booking)
                .where(Booking.id == input.booking_id)
                .options(selectinload(Booking.event_type))
            )
            result = await db.execute(stmt)
            booking = result.scalar_one_or_none()

            if not booking:
                return {"error": "Booking not found"}

            from aexy.services.booking.calendar_sync_service import CalendarSyncService
            calendar_service = CalendarSyncService(db)
            await calendar_service.create_calendar_event(booking)
            await db.commit()
            return {"status": "created"}
        except Exception as e:
            await db.rollback()
            raise
