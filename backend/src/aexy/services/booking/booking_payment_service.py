"""Payment service for booking module."""

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.booking import Booking, BookingStatus, PaymentStatus, EventType


class BookingPaymentServiceError(Exception):
    """Base exception for booking payment service errors."""

    pass


class PaymentNotRequiredError(BookingPaymentServiceError):
    """Payment is not required for this booking."""

    pass


class PaymentAlreadyProcessedError(BookingPaymentServiceError):
    """Payment has already been processed."""

    pass


class BookingPaymentService:
    """Service for handling booking payments.

    This service integrates with the existing Stripe service for payment processing.
    Payment collection is only available on the FREE tier.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_payment_intent(
        self,
        booking_id: str,
        stripe_service=None,  # Optional: inject existing Stripe service
    ) -> dict:
        """Create a Stripe Payment Intent for a booking.

        Args:
            booking_id: The booking ID
            stripe_service: Optional Stripe service instance

        Returns:
            Dict with payment_intent_id and client_secret
        """
        # Get booking
        stmt = select(Booking).where(Booking.id == booking_id)
        result = await self.db.execute(stmt)
        booking = result.scalar_one_or_none()

        if not booking:
            raise BookingPaymentServiceError(f"Booking {booking_id} not found")

        # Get event type for payment details
        event_stmt = select(EventType).where(EventType.id == booking.event_type_id)
        event_result = await self.db.execute(event_stmt)
        event_type = event_result.scalar_one_or_none()

        if not event_type or not event_type.payment_enabled:
            raise PaymentNotRequiredError("Payment is not required for this booking")

        if booking.payment_status not in [
            PaymentStatus.NONE.value,
            PaymentStatus.PENDING.value,
        ]:
            raise PaymentAlreadyProcessedError(
                f"Payment already processed: {booking.payment_status}"
            )

        amount = event_type.payment_amount
        currency = event_type.payment_currency.lower()

        if not amount:
            raise BookingPaymentServiceError("Payment amount not set on event type")

        # Create Payment Intent via Stripe
        # This would use the existing Stripe service
        if stripe_service:
            payment_intent = await stripe_service.create_payment_intent(
                amount=amount,
                currency=currency,
                metadata={
                    "booking_id": booking_id,
                    "event_type_id": booking.event_type_id,
                    "invitee_email": booking.invitee_email,
                },
            )

            # Update booking with payment intent
            booking.payment_intent_id = payment_intent.id
            booking.payment_amount = amount
            booking.payment_currency = currency
            booking.payment_status = PaymentStatus.PENDING.value

            await self.db.flush()

            return {
                "payment_intent_id": payment_intent.id,
                "client_secret": payment_intent.client_secret,
                "amount": amount,
                "currency": currency,
            }

        # Placeholder for when Stripe service is not provided
        # In production, this should always use the Stripe service
        booking.payment_amount = amount
        booking.payment_currency = currency
        booking.payment_status = PaymentStatus.PENDING.value

        await self.db.flush()

        return {
            "payment_intent_id": None,
            "client_secret": None,
            "amount": amount,
            "currency": currency,
            "message": "Stripe service not configured",
        }

    async def confirm_payment(
        self,
        payment_intent_id: str,
    ) -> Booking:
        """Confirm payment was successful.

        Called when Stripe webhook indicates payment success.
        """
        # Find booking by payment intent
        stmt = select(Booking).where(Booking.payment_intent_id == payment_intent_id)
        result = await self.db.execute(stmt)
        booking = result.scalar_one_or_none()

        if not booking:
            raise BookingPaymentServiceError(
                f"Booking not found for payment intent {payment_intent_id}"
            )

        if booking.payment_status == PaymentStatus.PAID.value:
            return booking  # Already confirmed

        booking.payment_status = PaymentStatus.PAID.value
        booking.status = BookingStatus.CONFIRMED.value

        await self.db.flush()
        await self.db.refresh(booking)
        return booking

    async def handle_payment_failure(
        self,
        payment_intent_id: str,
        failure_reason: str | None = None,
    ) -> Booking:
        """Handle payment failure.

        Called when Stripe webhook indicates payment failure.
        """
        stmt = select(Booking).where(Booking.payment_intent_id == payment_intent_id)
        result = await self.db.execute(stmt)
        booking = result.scalar_one_or_none()

        if not booking:
            raise BookingPaymentServiceError(
                f"Booking not found for payment intent {payment_intent_id}"
            )

        booking.payment_status = PaymentStatus.FAILED.value
        # Keep booking in pending state - user can retry payment

        await self.db.flush()
        await self.db.refresh(booking)
        return booking

    async def process_refund(
        self,
        booking_id: str,
        reason: str | None = None,
        stripe_service=None,
    ) -> dict:
        """Process a refund for a cancelled booking.

        Args:
            booking_id: The booking ID
            reason: Optional reason for refund
            stripe_service: Optional Stripe service instance

        Returns:
            Dict with refund details
        """
        stmt = select(Booking).where(Booking.id == booking_id)
        result = await self.db.execute(stmt)
        booking = result.scalar_one_or_none()

        if not booking:
            raise BookingPaymentServiceError(f"Booking {booking_id} not found")

        if booking.payment_status != PaymentStatus.PAID.value:
            raise BookingPaymentServiceError(
                f"Cannot refund booking with payment status: {booking.payment_status}"
            )

        if not booking.payment_intent_id:
            raise BookingPaymentServiceError("No payment intent found for booking")

        # Process refund via Stripe
        if stripe_service:
            refund = await stripe_service.create_refund(
                payment_intent=booking.payment_intent_id,
                reason=reason,
            )

            booking.payment_status = PaymentStatus.REFUNDED.value

            await self.db.flush()

            return {
                "refund_id": refund.id,
                "amount": refund.amount,
                "status": refund.status,
            }

        # Placeholder when Stripe service not provided
        booking.payment_status = PaymentStatus.REFUNDED.value
        await self.db.flush()

        return {
            "refund_id": None,
            "amount": booking.payment_amount,
            "status": "pending",
            "message": "Stripe service not configured",
        }

    async def handle_stripe_webhook(
        self,
        event_type: str,
        event_data: dict,
    ) -> dict:
        """Handle Stripe webhook events related to bookings.

        Args:
            event_type: The Stripe event type
            event_data: The event data from Stripe

        Returns:
            Dict with handling result
        """
        payment_intent_id = event_data.get("id")

        if not payment_intent_id:
            return {"handled": False, "reason": "No payment intent ID"}

        if event_type == "payment_intent.succeeded":
            booking = await self.confirm_payment(payment_intent_id)
            return {
                "handled": True,
                "booking_id": booking.id,
                "action": "confirmed",
            }

        elif event_type == "payment_intent.payment_failed":
            failure_reason = event_data.get("last_payment_error", {}).get("message")
            booking = await self.handle_payment_failure(
                payment_intent_id, failure_reason
            )
            return {
                "handled": True,
                "booking_id": booking.id,
                "action": "failed",
            }

        elif event_type == "charge.refunded":
            # Find booking and update status
            stmt = select(Booking).where(Booking.payment_intent_id == payment_intent_id)
            result = await self.db.execute(stmt)
            booking = result.scalar_one_or_none()

            if booking:
                booking.payment_status = PaymentStatus.REFUNDED.value
                await self.db.flush()
                return {
                    "handled": True,
                    "booking_id": booking.id,
                    "action": "refunded",
                }

        return {"handled": False, "reason": f"Unhandled event type: {event_type}"}

    async def get_payment_status(self, booking_id: str) -> dict:
        """Get payment status for a booking."""
        stmt = select(Booking).where(Booking.id == booking_id)
        result = await self.db.execute(stmt)
        booking = result.scalar_one_or_none()

        if not booking:
            raise BookingPaymentServiceError(f"Booking {booking_id} not found")

        return {
            "booking_id": booking.id,
            "payment_status": booking.payment_status,
            "payment_amount": booking.payment_amount,
            "payment_currency": booking.payment_currency,
            "payment_intent_id": booking.payment_intent_id,
        }

    async def check_payment_feature_access(
        self,
        workspace_id: str,
    ) -> dict:
        """Check if workspace has access to payment collection feature.

        Payment collection is only available on FREE tier.
        """
        # This would check the workspace subscription tier
        # For now, return True as a placeholder
        # In production, integrate with billing/subscription service

        return {
            "has_access": True,
            "tier": "free",
            "message": "Payment collection is available on FREE tier only",
        }
