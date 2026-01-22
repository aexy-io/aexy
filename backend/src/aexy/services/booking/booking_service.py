"""Booking service for booking module."""

import secrets
from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.booking import (
    Booking,
    BookingStatus,
    PaymentStatus,
    EventType,
    TeamEventMember,
    AssignmentType,
    BookingAttendee,
    AttendeeStatus,
)


class BookingServiceError(Exception):
    """Base exception for booking service errors."""

    pass


class SlotNotAvailableError(BookingServiceError):
    """Requested slot is not available."""

    pass


class BookingNotFoundError(BookingServiceError):
    """Booking not found."""

    pass


class InvalidBookingStateError(BookingServiceError):
    """Invalid booking state for the requested operation."""

    pass


class BookingService:
    """Service for managing bookings."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_booking(
        self,
        event_type_id: str,
        invitee_email: str,
        invitee_name: str,
        start_time: datetime,
        timezone: str,
        workspace_id: str,
        host_id: str | None = None,
        invitee_phone: str | None = None,
        answers: dict | None = None,
        location: str | None = None,
        payment_required: bool = False,
        payment_amount: int | None = None,
        payment_currency: str | None = None,
    ) -> Booking:
        """Create a new booking."""
        # Get event type for duration
        stmt = select(EventType).where(EventType.id == event_type_id)
        result = await self.db.execute(stmt)
        event_type = result.scalar_one_or_none()

        if not event_type:
            raise BookingServiceError("Event type not found")

        # Track if this is an ALL_HANDS team event for attendee creation
        is_all_hands = False
        team_member_ids: list[str] = []

        # If no host specified and it's a team event, assign one
        if not host_id:
            if event_type.is_team_event:
                # Check assignment type
                assignment_type = await self._get_team_assignment_type(event_type_id)
                if assignment_type == AssignmentType.ALL_HANDS.value:
                    # For ALL_HANDS, owner is primary host, all members are attendees
                    host_id = event_type.owner_id
                    is_all_hands = True
                    team_member_ids = await self._get_team_member_ids(event_type_id)
                else:
                    host_id = await self._assign_team_member(event_type_id, start_time)
            else:
                host_id = event_type.owner_id

        # Calculate end time
        end_time = start_time + timedelta(minutes=event_type.duration_minutes)

        # Set initial status based on payment
        initial_status = (
            BookingStatus.PENDING.value
            if payment_required
            else BookingStatus.CONFIRMED.value
        )

        # Generate action token for invitee actions
        action_token = secrets.token_urlsafe(32)

        booking = Booking(
            id=str(uuid4()),
            event_type_id=event_type_id,
            workspace_id=workspace_id,
            host_id=host_id,
            invitee_email=invitee_email,
            invitee_name=invitee_name,
            invitee_phone=invitee_phone,
            start_time=start_time,
            end_time=end_time,
            timezone=timezone,
            status=initial_status,
            location=location or event_type.custom_location,
            answers=answers or {},
            payment_status=PaymentStatus.PENDING.value
            if payment_required
            else PaymentStatus.NONE.value,
            payment_amount=payment_amount,
            payment_currency=payment_currency,
            action_token=action_token,
        )

        self.db.add(booking)
        await self.db.flush()

        # Create attendee records for ALL_HANDS team events
        if is_all_hands and team_member_ids:
            for member_id in team_member_ids:
                attendee = BookingAttendee(
                    booking_id=booking.id,
                    user_id=member_id,
                    status=AttendeeStatus.PENDING.value,
                    response_token=secrets.token_urlsafe(32),
                )
                self.db.add(attendee)
            await self.db.flush()

        return booking

    async def get_booking(self, booking_id: str) -> Booking | None:
        """Get a booking by ID."""
        stmt = select(Booking).where(Booking.id == booking_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_booking_by_token(self, action_token: str) -> Booking | None:
        """Get a booking by action token."""
        stmt = select(Booking).where(Booking.action_token == action_token)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_bookings(
        self,
        workspace_id: str,
        host_id: str | None = None,
        event_type_id: str | None = None,
        status: BookingStatus | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        invitee_email: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Booking], int]:
        """List bookings with filters."""
        conditions = [Booking.workspace_id == workspace_id]

        if host_id:
            conditions.append(Booking.host_id == host_id)
        if event_type_id:
            conditions.append(Booking.event_type_id == event_type_id)
        if status:
            conditions.append(Booking.status == status.value)
        if start_date:
            conditions.append(Booking.start_time >= start_date)
        if end_date:
            conditions.append(Booking.start_time <= end_date)
        if invitee_email:
            conditions.append(Booking.invitee_email == invitee_email)

        # Get total count
        count_stmt = select(func.count(Booking.id)).where(and_(*conditions))
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Get bookings
        stmt = (
            select(Booking)
            .where(and_(*conditions))
            .order_by(Booking.start_time.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        bookings = list(result.scalars().all())

        return bookings, total

    async def get_upcoming_bookings(
        self,
        host_id: str,
        limit: int = 10,
    ) -> list[Booking]:
        """Get upcoming bookings for a host."""
        now = datetime.now(ZoneInfo("UTC"))

        stmt = (
            select(Booking)
            .where(
                and_(
                    Booking.host_id == host_id,
                    Booking.start_time >= now,
                    Booking.status.in_(
                        [BookingStatus.PENDING.value, BookingStatus.CONFIRMED.value]
                    ),
                )
            )
            .order_by(Booking.start_time.asc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def cancel_booking(
        self,
        booking_id: str,
        reason: str | None = None,
        cancelled_by: str = "host",  # host, invitee, system
    ) -> Booking:
        """Cancel a booking."""
        booking = await self.get_booking(booking_id)
        if not booking:
            raise BookingNotFoundError(f"Booking {booking_id} not found")

        if booking.status in [
            BookingStatus.CANCELLED.value,
            BookingStatus.COMPLETED.value,
        ]:
            raise InvalidBookingStateError(
                f"Cannot cancel booking in {booking.status} state"
            )

        booking.status = BookingStatus.CANCELLED.value
        booking.cancellation_reason = reason
        booking.cancelled_by = cancelled_by
        booking.cancelled_at = datetime.now(ZoneInfo("UTC"))

        await self.db.flush()
        await self.db.refresh(booking)
        return booking

    async def reschedule_booking(
        self,
        booking_id: str,
        new_start_time: datetime,
        timezone: str,
    ) -> Booking:
        """Reschedule a booking to a new time."""
        booking = await self.get_booking(booking_id)
        if not booking:
            raise BookingNotFoundError(f"Booking {booking_id} not found")

        if booking.status not in [
            BookingStatus.PENDING.value,
            BookingStatus.CONFIRMED.value,
        ]:
            raise InvalidBookingStateError(
                f"Cannot reschedule booking in {booking.status} state"
            )

        # Get event type for duration
        stmt = select(EventType).where(EventType.id == booking.event_type_id)
        result = await self.db.execute(stmt)
        event_type = result.scalar_one_or_none()

        if not event_type:
            raise BookingServiceError("Event type not found")

        # Update times
        booking.start_time = new_start_time
        booking.end_time = new_start_time + timedelta(minutes=event_type.duration_minutes)
        booking.timezone = timezone

        await self.db.flush()
        await self.db.refresh(booking)
        return booking

    async def mark_no_show(self, booking_id: str) -> Booking:
        """Mark a booking as no-show."""
        booking = await self.get_booking(booking_id)
        if not booking:
            raise BookingNotFoundError(f"Booking {booking_id} not found")

        if booking.status != BookingStatus.CONFIRMED.value:
            raise InvalidBookingStateError(
                f"Can only mark confirmed bookings as no-show, current status: {booking.status}"
            )

        booking.status = BookingStatus.NO_SHOW.value

        await self.db.flush()
        await self.db.refresh(booking)
        return booking

    async def complete_booking(self, booking_id: str) -> Booking:
        """Mark a booking as completed."""
        booking = await self.get_booking(booking_id)
        if not booking:
            raise BookingNotFoundError(f"Booking {booking_id} not found")

        if booking.status != BookingStatus.CONFIRMED.value:
            raise InvalidBookingStateError(
                f"Can only complete confirmed bookings, current status: {booking.status}"
            )

        booking.status = BookingStatus.COMPLETED.value

        await self.db.flush()
        await self.db.refresh(booking)
        return booking

    async def confirm_booking(self, booking_id: str) -> Booking:
        """Confirm a pending booking (e.g., after payment)."""
        booking = await self.get_booking(booking_id)
        if not booking:
            raise BookingNotFoundError(f"Booking {booking_id} not found")

        if booking.status != BookingStatus.PENDING.value:
            raise InvalidBookingStateError(
                f"Can only confirm pending bookings, current status: {booking.status}"
            )

        booking.status = BookingStatus.CONFIRMED.value

        await self.db.flush()
        await self.db.refresh(booking)
        return booking

    async def update_meeting_link(
        self,
        booking_id: str,
        meeting_link: str,
    ) -> Booking:
        """Update the meeting link for a booking."""
        booking = await self.get_booking(booking_id)
        if not booking:
            raise BookingNotFoundError(f"Booking {booking_id} not found")

        booking.meeting_link = meeting_link

        await self.db.flush()
        await self.db.refresh(booking)
        return booking

    async def update_calendar_event(
        self,
        booking_id: str,
        calendar_event_id: str,
        calendar_provider: str,
    ) -> Booking:
        """Link booking to a calendar event."""
        booking = await self.get_booking(booking_id)
        if not booking:
            raise BookingNotFoundError(f"Booking {booking_id} not found")

        booking.calendar_event_id = calendar_event_id
        booking.calendar_provider = calendar_provider

        await self.db.flush()
        await self.db.refresh(booking)
        return booking

    async def mark_reminder_sent(self, booking_id: str) -> Booking:
        """Mark that a reminder was sent for this booking."""
        booking = await self.get_booking(booking_id)
        if not booking:
            raise BookingNotFoundError(f"Booking {booking_id} not found")

        booking.reminder_sent = True
        booking.reminder_sent_at = datetime.now(ZoneInfo("UTC"))

        await self.db.flush()
        await self.db.refresh(booking)
        return booking

    async def get_bookings_needing_reminder(
        self,
        hours_before: int = 24,
    ) -> list[Booking]:
        """Get bookings that need reminder emails."""
        now = datetime.now(ZoneInfo("UTC"))
        reminder_window_start = now
        reminder_window_end = now + timedelta(hours=hours_before)

        stmt = select(Booking).where(
            and_(
                Booking.status == BookingStatus.CONFIRMED.value,
                Booking.reminder_sent == False,
                Booking.start_time >= reminder_window_start,
                Booking.start_time <= reminder_window_end,
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def _assign_team_member(
        self,
        event_type_id: str,
        start_time: datetime,
    ) -> str:
        """Assign a team member for round-robin booking."""
        # Get team members ordered by last assignment
        stmt = (
            select(TeamEventMember)
            .where(
                and_(
                    TeamEventMember.event_type_id == event_type_id,
                    TeamEventMember.is_active == True,
                )
            )
            .order_by(
                TeamEventMember.last_assigned_at.asc().nullsfirst(),
                TeamEventMember.assignment_count.asc(),
                TeamEventMember.priority.asc(),
            )
        )
        result = await self.db.execute(stmt)
        members = list(result.scalars().all())

        if not members:
            raise BookingServiceError("No team members available for assignment")

        # Simple round-robin: pick the member with least recent assignment
        selected_member = members[0]

        # Update assignment tracking
        selected_member.last_assigned_at = datetime.now(ZoneInfo("UTC"))
        selected_member.assignment_count += 1

        await self.db.flush()
        return selected_member.user_id

    async def _get_team_assignment_type(
        self,
        event_type_id: str,
    ) -> str:
        """Get the assignment type for a team event."""
        stmt = (
            select(TeamEventMember.assignment_type)
            .where(
                and_(
                    TeamEventMember.event_type_id == event_type_id,
                    TeamEventMember.is_active == True,
                )
            )
            .limit(1)
        )
        result = await self.db.execute(stmt)
        row = result.first()
        return row[0] if row else AssignmentType.ROUND_ROBIN.value

    async def _get_team_member_ids(
        self,
        event_type_id: str,
    ) -> list[str]:
        """Get active team member IDs for an event type."""
        stmt = select(TeamEventMember.user_id).where(
            and_(
                TeamEventMember.event_type_id == event_type_id,
                TeamEventMember.is_active == True,
            )
        )
        result = await self.db.execute(stmt)
        return [row[0] for row in result.all()]

    # RSVP methods

    async def get_attendee_by_token(self, response_token: str) -> BookingAttendee | None:
        """Get a booking attendee by their RSVP token."""
        stmt = select(BookingAttendee).where(
            BookingAttendee.response_token == response_token
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def respond_to_rsvp(
        self,
        response_token: str,
        accept: bool,
    ) -> BookingAttendee:
        """Process an RSVP response from an attendee."""
        attendee = await self.get_attendee_by_token(response_token)
        if not attendee:
            raise BookingNotFoundError("RSVP token not found or invalid")

        # Get the associated booking
        booking = await self.get_booking(attendee.booking_id)
        if not booking:
            raise BookingNotFoundError("Booking not found")

        # Check booking status
        if booking.status in [BookingStatus.CANCELLED.value, BookingStatus.COMPLETED.value]:
            raise InvalidBookingStateError(
                f"Cannot respond to booking in {booking.status} state"
            )

        # Update attendee status
        attendee.status = AttendeeStatus.CONFIRMED.value if accept else AttendeeStatus.DECLINED.value
        attendee.responded_at = datetime.now(ZoneInfo("UTC"))

        await self.db.flush()
        await self.db.refresh(attendee)
        return attendee

    async def get_booking_attendees(
        self,
        booking_id: str,
    ) -> list[BookingAttendee]:
        """Get all attendees for a booking."""
        stmt = (
            select(BookingAttendee)
            .where(BookingAttendee.booking_id == booking_id)
            .order_by(BookingAttendee.created_at)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # Statistics

    async def get_booking_stats(
        self,
        workspace_id: str,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> dict:
        """Get booking statistics for a workspace."""
        conditions = [Booking.workspace_id == workspace_id]

        if start_date:
            conditions.append(Booking.created_at >= start_date)
        if end_date:
            conditions.append(Booking.created_at <= end_date)

        # Total bookings
        total_stmt = select(func.count(Booking.id)).where(and_(*conditions))
        total_result = await self.db.execute(total_stmt)
        total = total_result.scalar() or 0

        # By status
        status_stmt = (
            select(Booking.status, func.count(Booking.id))
            .where(and_(*conditions))
            .group_by(Booking.status)
        )
        status_result = await self.db.execute(status_stmt)
        by_status = {row[0]: row[1] for row in status_result.all()}

        # Completion rate
        confirmed_completed = by_status.get(BookingStatus.CONFIRMED.value, 0) + by_status.get(
            BookingStatus.COMPLETED.value, 0
        )
        completion_rate = (confirmed_completed / total * 100) if total > 0 else 0

        # No-show rate
        no_shows = by_status.get(BookingStatus.NO_SHOW.value, 0)
        no_show_rate = (no_shows / total * 100) if total > 0 else 0

        return {
            "total_bookings": total,
            "by_status": by_status,
            "completion_rate": round(completion_rate, 2),
            "no_show_rate": round(no_show_rate, 2),
        }
