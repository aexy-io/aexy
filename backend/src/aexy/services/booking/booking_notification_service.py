"""Notification service for booking module."""

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.booking import Booking, EventType, BookingWebhook
from aexy.models.developer import Developer


class BookingNotificationServiceError(Exception):
    """Base exception for booking notification service errors."""

    pass


class BookingNotificationService:
    """Service for sending booking-related notifications.

    Integrates with existing email service for sending notifications.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def send_confirmation(
        self,
        booking: Booking,
        email_service=None,  # Inject existing email service
    ) -> dict:
        """Send booking confirmation email to invitee and host."""
        # Get event type for details
        stmt = select(EventType).where(EventType.id == booking.event_type_id)
        result = await self.db.execute(stmt)
        event_type = result.scalar_one_or_none()

        # Get host info
        host_stmt = select(Developer).where(Developer.id == booking.host_id)
        host_result = await self.db.execute(host_stmt)
        host = host_result.scalar_one_or_none()

        # Build email context
        context = self._build_email_context(booking, event_type, host)

        emails_sent = []

        # Send to invitee
        if email_service:
            await email_service.send_template_email(
                to_email=booking.invitee_email,
                template_name="booking_confirmation_invitee",
                context=context,
            )
            emails_sent.append(booking.invitee_email)

        # Send to host
        if host and email_service:
            await email_service.send_template_email(
                to_email=host.email,
                template_name="booking_confirmation_host",
                context=context,
            )
            emails_sent.append(host.email)

        return {
            "type": "confirmation",
            "booking_id": booking.id,
            "emails_sent": emails_sent,
        }

    async def send_reminder(
        self,
        booking: Booking,
        email_service=None,
    ) -> dict:
        """Send reminder email to invitee and host."""
        stmt = select(EventType).where(EventType.id == booking.event_type_id)
        result = await self.db.execute(stmt)
        event_type = result.scalar_one_or_none()

        host_stmt = select(Developer).where(Developer.id == booking.host_id)
        host_result = await self.db.execute(host_stmt)
        host = host_result.scalar_one_or_none()

        context = self._build_email_context(booking, event_type, host)

        emails_sent = []

        if email_service:
            # Send to invitee
            await email_service.send_template_email(
                to_email=booking.invitee_email,
                template_name="booking_reminder_invitee",
                context=context,
            )
            emails_sent.append(booking.invitee_email)

            # Send to host
            if host:
                await email_service.send_template_email(
                    to_email=host.email,
                    template_name="booking_reminder_host",
                    context=context,
                )
                emails_sent.append(host.email)

        return {
            "type": "reminder",
            "booking_id": booking.id,
            "emails_sent": emails_sent,
        }

    async def send_cancellation(
        self,
        booking: Booking,
        cancelled_by: str,  # host, invitee, system
        reason: str | None = None,
        email_service=None,
    ) -> dict:
        """Send cancellation notification to invitee and host."""
        stmt = select(EventType).where(EventType.id == booking.event_type_id)
        result = await self.db.execute(stmt)
        event_type = result.scalar_one_or_none()

        host_stmt = select(Developer).where(Developer.id == booking.host_id)
        host_result = await self.db.execute(host_stmt)
        host = host_result.scalar_one_or_none()

        context = self._build_email_context(booking, event_type, host)
        context["cancelled_by"] = cancelled_by
        context["cancellation_reason"] = reason

        emails_sent = []

        if email_service:
            # Notify the other party
            if cancelled_by == "host" or cancelled_by == "system":
                # Notify invitee
                await email_service.send_template_email(
                    to_email=booking.invitee_email,
                    template_name="booking_cancelled_invitee",
                    context=context,
                )
                emails_sent.append(booking.invitee_email)
            elif cancelled_by == "invitee":
                # Notify host
                if host:
                    await email_service.send_template_email(
                        to_email=host.email,
                        template_name="booking_cancelled_host",
                        context=context,
                    )
                    emails_sent.append(host.email)

        return {
            "type": "cancellation",
            "booking_id": booking.id,
            "cancelled_by": cancelled_by,
            "emails_sent": emails_sent,
        }

    async def send_reschedule(
        self,
        booking: Booking,
        old_start_time: datetime,
        email_service=None,
    ) -> dict:
        """Send reschedule notification to invitee and host."""
        stmt = select(EventType).where(EventType.id == booking.event_type_id)
        result = await self.db.execute(stmt)
        event_type = result.scalar_one_or_none()

        host_stmt = select(Developer).where(Developer.id == booking.host_id)
        host_result = await self.db.execute(host_stmt)
        host = host_result.scalar_one_or_none()

        context = self._build_email_context(booking, event_type, host)
        context["old_start_time"] = old_start_time.isoformat()

        emails_sent = []

        if email_service:
            # Send to invitee
            await email_service.send_template_email(
                to_email=booking.invitee_email,
                template_name="booking_rescheduled_invitee",
                context=context,
            )
            emails_sent.append(booking.invitee_email)

            # Send to host
            if host:
                await email_service.send_template_email(
                    to_email=host.email,
                    template_name="booking_rescheduled_host",
                    context=context,
                )
                emails_sent.append(host.email)

        return {
            "type": "reschedule",
            "booking_id": booking.id,
            "emails_sent": emails_sent,
        }

    def _build_email_context(
        self,
        booking: Booking,
        event_type: EventType | None,
        host: Developer | None,
    ) -> dict:
        """Build common email context for all notifications."""
        return {
            "booking_id": booking.id,
            "event_name": event_type.name if event_type else "Meeting",
            "event_description": event_type.description if event_type else None,
            "duration_minutes": event_type.duration_minutes if event_type else 30,
            "start_time": booking.start_time.isoformat(),
            "end_time": booking.end_time.isoformat(),
            "timezone": booking.timezone,
            "location": booking.location,
            "meeting_link": booking.meeting_link,
            "invitee_name": booking.invitee_name,
            "invitee_email": booking.invitee_email,
            "host_name": host.name if host else None,
            "host_email": host.email if host else None,
            "confirmation_message": event_type.confirmation_message if event_type else None,
            "cancel_token": booking.action_token,
            "answers": booking.answers,
        }

    # Webhook dispatching

    async def dispatch_webhook(
        self,
        booking: Booking,
        event: str,  # booking.created, booking.cancelled, etc.
        http_client=None,  # Inject HTTP client for webhook calls
    ) -> list[dict]:
        """Dispatch webhooks for a booking event."""
        # Get active webhooks for this workspace and event
        stmt = select(BookingWebhook).where(
            BookingWebhook.workspace_id == booking.workspace_id,
            BookingWebhook.is_active == True,
        )
        result = await self.db.execute(stmt)
        webhooks = result.scalars().all()

        results = []

        for webhook in webhooks:
            # Check if this webhook is subscribed to this event
            if event not in webhook.events:
                continue

            # Build payload
            payload = self._build_webhook_payload(booking, event)

            # Sign payload
            signature = self._sign_payload(payload, webhook.secret)

            if http_client:
                try:
                    response = await http_client.post(
                        webhook.url,
                        json=payload,
                        headers={
                            "X-Aexy-Signature": signature,
                            "X-Aexy-Event": event,
                            "Content-Type": "application/json",
                        },
                        timeout=10,
                    )

                    webhook.last_triggered_at = datetime.now(ZoneInfo("UTC"))

                    if response.status_code >= 400:
                        webhook.failure_count += 1
                        webhook.last_failure_at = datetime.now(ZoneInfo("UTC"))
                        webhook.last_failure_reason = f"HTTP {response.status_code}"

                    results.append({
                        "webhook_id": webhook.id,
                        "url": webhook.url,
                        "success": response.status_code < 400,
                        "status_code": response.status_code,
                    })

                except Exception as e:
                    webhook.failure_count += 1
                    webhook.last_failure_at = datetime.now(ZoneInfo("UTC"))
                    webhook.last_failure_reason = str(e)

                    results.append({
                        "webhook_id": webhook.id,
                        "url": webhook.url,
                        "success": False,
                        "error": str(e),
                    })

        await self.db.flush()
        return results

    def _build_webhook_payload(self, booking: Booking, event: str) -> dict:
        """Build webhook payload for a booking event."""
        return {
            "event": event,
            "timestamp": datetime.now(ZoneInfo("UTC")).isoformat(),
            "data": {
                "booking_id": booking.id,
                "event_type_id": booking.event_type_id,
                "workspace_id": booking.workspace_id,
                "host_id": booking.host_id,
                "invitee_email": booking.invitee_email,
                "invitee_name": booking.invitee_name,
                "start_time": booking.start_time.isoformat(),
                "end_time": booking.end_time.isoformat(),
                "timezone": booking.timezone,
                "status": booking.status,
                "location": booking.location,
                "meeting_link": booking.meeting_link,
                "payment_status": booking.payment_status,
                "payment_amount": booking.payment_amount,
                "payment_currency": booking.payment_currency,
            },
        }

    def _sign_payload(self, payload: dict, secret: str) -> str:
        """Sign webhook payload with HMAC-SHA256."""
        import hashlib
        import hmac
        import json

        payload_str = json.dumps(payload, sort_keys=True)
        signature = hmac.new(
            secret.encode("utf-8"),
            payload_str.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        return f"sha256={signature}"
