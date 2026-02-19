"""Legacy task functions for the booking module.

Business logic has been moved to Temporal activities.
These functions are retained as plain functions for backward compatibility.

These tasks handle:
- Booking reminders (24h and 1h before)
- Calendar sync for all users
- Webhook dispatching
- Cleanup of expired pending bookings
- Analytics generation
"""

import logging
from datetime import datetime, timedelta, timezone

from aexy.core.database import async_session_maker

logger = logging.getLogger(__name__)


def send_booking_reminders():
    """Send reminder emails for upcoming bookings.

    This task runs every 15 minutes and:
    1. Finds bookings starting within 24 hours that haven't had a 24h reminder
    2. Finds bookings starting within 1 hour that haven't had a 1h reminder
    3. Sends reminder notifications to both host and invitee
    4. Marks bookings as having received reminders
    """
    from aexy.processing.tasks import run_async
    run_async(_send_booking_reminders_async())


async def _send_booking_reminders_async():
    """Async implementation of booking reminders."""
    from sqlalchemy import select, and_
    from aexy.models.booking import Booking, BookingStatus

    async with async_session_maker() as db:
        try:
            now = datetime.now(timezone.utc)

            # 24-hour reminders
            reminder_24h_start = now + timedelta(hours=23, minutes=45)
            reminder_24h_end = now + timedelta(hours=24, minutes=15)

            stmt_24h = (
                select(Booking)
                .where(
                    and_(
                        Booking.status == BookingStatus.CONFIRMED,
                        Booking.start_time >= reminder_24h_start,
                        Booking.start_time <= reminder_24h_end,
                        Booking.reminder_sent == False,
                    )
                )
            )
            result = await db.execute(stmt_24h)
            bookings_24h = result.scalars().all()

            for booking in bookings_24h:
                try:
                    from aexy.services.booking.booking_notification_service import BookingNotificationService
                    notification_service = BookingNotificationService(db)
                    await notification_service.send_reminder(str(booking.id), hours_before=24)
                    logger.info(f"Sent 24h reminder for booking {booking.id}")
                except Exception as e:
                    logger.error(f"Failed to send 24h reminder for booking {booking.id}: {e}")

            # 1-hour reminders (use a separate flag or check time)
            reminder_1h_start = now + timedelta(minutes=55)
            reminder_1h_end = now + timedelta(hours=1, minutes=5)

            stmt_1h = (
                select(Booking)
                .where(
                    and_(
                        Booking.status == BookingStatus.CONFIRMED,
                        Booking.start_time >= reminder_1h_start,
                        Booking.start_time <= reminder_1h_end,
                        Booking.reminder_sent == True,  # Already got 24h reminder
                    )
                )
            )
            result = await db.execute(stmt_1h)
            bookings_1h = result.scalars().all()

            for booking in bookings_1h:
                try:
                    from aexy.services.booking.booking_notification_service import BookingNotificationService
                    notification_service = BookingNotificationService(db)
                    await notification_service.send_reminder(str(booking.id), hours_before=1)
                    logger.info(f"Sent 1h reminder for booking {booking.id}")
                except Exception as e:
                    logger.error(f"Failed to send 1h reminder for booking {booking.id}: {e}")

            await db.commit()
            logger.info(f"Processed {len(bookings_24h)} 24h reminders and {len(bookings_1h)} 1h reminders")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error sending booking reminders: {e}")
            raise


def sync_all_calendars():
    """Sync calendar events for all active calendar connections.

    This task runs every 5 minutes and:
    1. Finds all calendar connections with sync_enabled=True
    2. Syncs each connection's events
    3. Updates last_synced_at timestamp
    """
    from aexy.processing.tasks import run_async
    run_async(_sync_all_calendars_async())


async def _sync_all_calendars_async():
    """Async implementation of calendar sync."""
    from sqlalchemy import select
    from aexy.models.booking import CalendarConnection

    async with async_session_maker() as db:
        try:
            stmt = (
                select(CalendarConnection)
                .where(CalendarConnection.sync_enabled == True)
            )
            result = await db.execute(stmt)
            connections = result.scalars().all()

            synced_count = 0
            for connection in connections:
                try:
                    from aexy.services.booking.calendar_sync_service import CalendarSyncService
                    calendar_service = CalendarSyncService(db)
                    await calendar_service.sync_calendar(str(connection.id))
                    synced_count += 1
                except Exception as e:
                    logger.error(f"Failed to sync calendar connection {connection.id}: {e}")

            await db.commit()
            logger.info(f"Synced {synced_count}/{len(connections)} calendar connections")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error syncing calendars: {e}")
            raise


def process_booking_webhooks(booking_id: str, event_type: str):
    """Dispatch webhooks for a booking event.

    Args:
        booking_id: The booking ID that triggered the event.
        event_type: One of 'booking.created', 'booking.cancelled', 'booking.rescheduled', 'booking.completed'.
    """
    from aexy.processing.tasks import run_async
    run_async(_process_booking_webhooks_async(booking_id, event_type))


async def _process_booking_webhooks_async(booking_id: str, event_type: str):
    """Async implementation of webhook processing."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from aexy.models.booking import Booking, BookingWebhook

    async with async_session_maker() as db:
        try:
            # Get booking with relations
            stmt = (
                select(Booking)
                .where(Booking.id == booking_id)
                .options(
                    selectinload(Booking.event_type),
                    selectinload(Booking.host),
                )
            )
            result = await db.execute(stmt)
            booking = result.scalar_one_or_none()

            if not booking:
                logger.warning(f"Booking {booking_id} not found for webhook")
                return

            # Get active webhooks for this workspace that listen to this event
            from sqlalchemy.dialects.postgresql import ARRAY
            stmt = (
                select(BookingWebhook)
                .where(
                    BookingWebhook.workspace_id == booking.workspace_id,
                    BookingWebhook.is_active == True,
                    BookingWebhook.events.contains([event_type]),
                )
            )
            result = await db.execute(stmt)
            webhooks = result.scalars().all()

            for webhook in webhooks:
                try:
                    from aexy.services.booking.booking_notification_service import BookingNotificationService
                    notification_service = BookingNotificationService(db)
                    await notification_service.dispatch_webhook(webhook, booking, event_type)
                    logger.info(f"Dispatched {event_type} webhook to {webhook.url}")
                except Exception as e:
                    logger.error(f"Failed to dispatch webhook {webhook.id}: {e}")
                    # Update failure count
                    webhook.failure_count = (webhook.failure_count or 0) + 1
                    if webhook.failure_count >= 5:
                        webhook.is_active = False
                        logger.warning(f"Webhook {webhook.id} disabled after 5 failures")

            await db.commit()

        except Exception as e:
            await db.rollback()
            logger.error(f"Error processing webhooks for booking {booking_id}: {e}")
            raise


def cleanup_expired_pending_bookings():
    """Cancel bookings that have been pending payment for too long.

    This task runs every 10 minutes and:
    1. Finds bookings with payment_status='pending' older than 30 minutes
    2. Cancels them and releases the time slot
    """
    from aexy.processing.tasks import run_async
    run_async(_cleanup_expired_pending_bookings_async())


async def _cleanup_expired_pending_bookings_async():
    """Async implementation of pending booking cleanup."""
    from sqlalchemy import select, and_
    from aexy.models.booking import Booking, BookingStatus, PaymentStatus

    async with async_session_maker() as db:
        try:
            now = datetime.now(timezone.utc)
            expiry_time = now - timedelta(minutes=30)

            stmt = (
                select(Booking)
                .where(
                    and_(
                        Booking.payment_status == PaymentStatus.PENDING,
                        Booking.status == BookingStatus.PENDING,
                        Booking.created_at < expiry_time,
                    )
                )
            )
            result = await db.execute(stmt)
            expired_bookings = result.scalars().all()

            for booking in expired_bookings:
                booking.status = BookingStatus.CANCELLED
                booking.cancellation_reason = "Payment not completed within 30 minutes"
                booking.cancelled_at = now
                logger.info(f"Cancelled expired pending booking {booking.id}")

            await db.commit()
            logger.info(f"Cleaned up {len(expired_bookings)} expired pending bookings")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error cleaning up expired bookings: {e}")
            raise


def mark_completed_bookings():
    """Mark confirmed bookings as completed after their end time.

    This task runs hourly and:
    1. Finds confirmed bookings whose end_time has passed
    2. Updates their status to 'completed'
    """
    from aexy.processing.tasks import run_async
    run_async(_mark_completed_bookings_async())


async def _mark_completed_bookings_async():
    """Async implementation of marking completed bookings."""
    from sqlalchemy import select, and_
    from aexy.models.booking import Booking, BookingStatus

    async with async_session_maker() as db:
        try:
            now = datetime.now(timezone.utc)

            stmt = (
                select(Booking)
                .where(
                    and_(
                        Booking.status == BookingStatus.CONFIRMED,
                        Booking.end_time < now,
                    )
                )
            )
            result = await db.execute(stmt)
            completed_bookings = result.scalars().all()

            for booking in completed_bookings:
                booking.status = BookingStatus.COMPLETED

                # Trigger webhook (direct call - Temporal handles scheduling)
                # Note: In Temporal, this would be dispatched as a separate activity
                pass  # Webhook dispatch is handled by Temporal activities

            await db.commit()
            logger.info(f"Marked {len(completed_bookings)} bookings as completed")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error marking completed bookings: {e}")
            raise


def generate_booking_analytics(workspace_id: str):
    """Generate booking analytics for a workspace.

    Args:
        workspace_id: The workspace ID to generate analytics for.
    """
    from aexy.processing.tasks import run_async
    run_async(_generate_booking_analytics_async(workspace_id))


async def _generate_booking_analytics_async(workspace_id: str):
    """Async implementation of analytics generation."""
    from sqlalchemy import select, func, and_
    from aexy.models.booking import Booking, BookingStatus

    async with async_session_maker() as db:
        try:
            now = datetime.now(timezone.utc)
            week_ago = now - timedelta(days=7)
            month_ago = now - timedelta(days=30)

            # Get booking stats
            total_stmt = (
                select(func.count(Booking.id))
                .where(Booking.workspace_id == workspace_id)
            )
            total_result = await db.execute(total_stmt)
            total_bookings = total_result.scalar() or 0

            # Weekly stats
            weekly_stmt = (
                select(func.count(Booking.id))
                .where(
                    and_(
                        Booking.workspace_id == workspace_id,
                        Booking.created_at >= week_ago,
                    )
                )
            )
            weekly_result = await db.execute(weekly_stmt)
            weekly_bookings = weekly_result.scalar() or 0

            # Status breakdown
            status_stmt = (
                select(
                    Booking.status,
                    func.count(Booking.id)
                )
                .where(
                    and_(
                        Booking.workspace_id == workspace_id,
                        Booking.created_at >= month_ago,
                    )
                )
                .group_by(Booking.status)
            )
            status_result = await db.execute(status_stmt)
            status_breakdown = {str(row[0].value): row[1] for row in status_result.all()}

            # Calculate rates
            completed = status_breakdown.get("completed", 0)
            no_shows = status_breakdown.get("no_show", 0)
            cancelled = status_breakdown.get("cancelled", 0)
            total_finished = completed + no_shows + cancelled

            completion_rate = (completed / total_finished * 100) if total_finished > 0 else 0
            no_show_rate = (no_shows / total_finished * 100) if total_finished > 0 else 0

            logger.info(
                f"Analytics for workspace {workspace_id}: "
                f"total={total_bookings}, weekly={weekly_bookings}, "
                f"completion_rate={completion_rate:.1f}%, no_show_rate={no_show_rate:.1f}%"
            )

        except Exception as e:
            logger.error(f"Error generating analytics for workspace {workspace_id}: {e}")
            raise


def send_booking_notification(booking_id: str, notification_type: str):
    """Send a notification for a booking event.

    Args:
        booking_id: The booking ID.
        notification_type: One of 'confirmation', 'cancellation', 'reschedule'.
    """
    from aexy.processing.tasks import run_async
    run_async(_send_booking_notification_async(booking_id, notification_type))


async def _send_booking_notification_async(booking_id: str, notification_type: str):
    """Async implementation of booking notification."""
    async with async_session_maker() as db:
        try:
            from aexy.services.booking.booking_notification_service import BookingNotificationService
            notification_service = BookingNotificationService(db)

            if notification_type == "confirmation":
                await notification_service.send_confirmation(booking_id)
            elif notification_type == "cancellation":
                await notification_service.send_cancellation(booking_id)
            elif notification_type == "reschedule":
                await notification_service.send_reschedule(booking_id)
            else:
                logger.warning(f"Unknown notification type: {notification_type}")
                return

            await db.commit()
            logger.info(f"Sent {notification_type} notification for booking {booking_id}")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error sending {notification_type} notification for booking {booking_id}: {e}")
            raise


def create_calendar_event(booking_id: str):
    """Create a calendar event for a confirmed booking.

    Args:
        booking_id: The booking ID.
    """
    from aexy.processing.tasks import run_async
    run_async(_create_calendar_event_async(booking_id))


async def _create_calendar_event_async(booking_id: str):
    """Async implementation of calendar event creation."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from aexy.models.booking import Booking

    async with async_session_maker() as db:
        try:
            # Get booking
            stmt = (
                select(Booking)
                .where(Booking.id == booking_id)
                .options(selectinload(Booking.event_type))
            )
            result = await db.execute(stmt)
            booking = result.scalar_one_or_none()

            if not booking:
                logger.warning(f"Booking {booking_id} not found")
                return

            from aexy.services.booking.calendar_sync_service import CalendarSyncService
            calendar_service = CalendarSyncService(db)
            await calendar_service.create_calendar_event(booking)
            await db.commit()
            logger.info(f"Created calendar event for booking {booking_id}")

        except Exception as e:
            await db.rollback()
            logger.error(f"Error creating calendar event for booking {booking_id}: {e}")
            raise
