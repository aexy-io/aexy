"""Availability service for booking module."""

from datetime import date, datetime, time, timedelta
from typing import TYPE_CHECKING
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import and_, select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.booking import (
    UserAvailability,
    AvailabilityOverride,
    EventType,
    Booking,
    BookingStatus,
    CalendarConnection,
)

if TYPE_CHECKING:
    from aexy.services.booking.calendar_sync_service import CalendarSyncService


class AvailabilityServiceError(Exception):
    """Base exception for availability service errors."""

    pass


class InvalidTimeRangeError(AvailabilityServiceError):
    """Invalid time range provided."""

    pass


class AvailabilityService:
    """Service for managing availability and calculating available slots."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # User availability management

    async def set_availability(
        self,
        user_id: str,
        workspace_id: str,
        day_of_week: int,
        start_time: time,
        end_time: time,
        timezone: str = "UTC",
    ) -> UserAvailability:
        """Set availability for a specific day of the week."""
        if start_time >= end_time:
            raise InvalidTimeRangeError("Start time must be before end time")

        # Check for existing slot on same day
        stmt = select(UserAvailability).where(
            and_(
                UserAvailability.user_id == user_id,
                UserAvailability.workspace_id == workspace_id,
                UserAvailability.day_of_week == day_of_week,
                UserAvailability.start_time == start_time,
            )
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            existing.end_time = end_time
            existing.timezone = timezone
            existing.is_active = True
            await self.db.flush()
            return existing

        availability = UserAvailability(
            id=str(uuid4()),
            user_id=user_id,
            workspace_id=workspace_id,
            day_of_week=day_of_week,
            start_time=start_time,
            end_time=end_time,
            timezone=timezone,
        )
        self.db.add(availability)
        await self.db.flush()
        return availability

    async def get_user_availability(
        self,
        user_id: str,
        workspace_id: str,
    ) -> list[UserAvailability]:
        """Get all availability slots for a user."""
        stmt = (
            select(UserAvailability)
            .where(
                and_(
                    UserAvailability.user_id == user_id,
                    UserAvailability.workspace_id == workspace_id,
                    UserAvailability.is_active == True,
                )
            )
            .order_by(UserAvailability.day_of_week, UserAvailability.start_time)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def bulk_update_availability(
        self,
        user_id: str,
        workspace_id: str,
        slots: list[dict],
        timezone: str = "UTC",
    ) -> list[UserAvailability]:
        """Bulk update availability schedule."""
        # Delete existing availability
        stmt = delete(UserAvailability).where(
            and_(
                UserAvailability.user_id == user_id,
                UserAvailability.workspace_id == workspace_id,
            )
        )
        await self.db.execute(stmt)

        # Create new slots
        new_slots = []
        for slot_data in slots:
            slot = UserAvailability(
                id=str(uuid4()),
                user_id=user_id,
                workspace_id=workspace_id,
                day_of_week=slot_data["day_of_week"],
                start_time=slot_data["start_time"],
                end_time=slot_data["end_time"],
                timezone=timezone,
            )
            self.db.add(slot)
            new_slots.append(slot)

        await self.db.flush()
        return new_slots

    async def delete_availability_slot(self, slot_id: str) -> bool:
        """Delete an availability slot."""
        stmt = select(UserAvailability).where(UserAvailability.id == slot_id)
        result = await self.db.execute(stmt)
        slot = result.scalar_one_or_none()

        if not slot:
            return False

        await self.db.delete(slot)
        await self.db.flush()
        return True

    # Availability overrides

    async def create_override(
        self,
        user_id: str,
        override_date: date,
        is_available: bool = False,
        start_time: time | None = None,
        end_time: time | None = None,
        reason: str | None = None,
        notes: str | None = None,
    ) -> AvailabilityOverride:
        """Create an availability override for a specific date."""
        if is_available and (not start_time or not end_time):
            raise InvalidTimeRangeError(
                "Start and end time required when marking as available"
            )

        # Check for existing override on same date
        stmt = select(AvailabilityOverride).where(
            and_(
                AvailabilityOverride.user_id == user_id,
                AvailabilityOverride.date == override_date,
            )
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            existing.is_available = is_available
            existing.start_time = start_time
            existing.end_time = end_time
            existing.reason = reason
            existing.notes = notes
            await self.db.flush()
            return existing

        override = AvailabilityOverride(
            id=str(uuid4()),
            user_id=user_id,
            date=override_date,
            is_available=is_available,
            start_time=start_time,
            end_time=end_time,
            reason=reason,
            notes=notes,
        )
        self.db.add(override)
        await self.db.flush()
        return override

    async def get_overrides(
        self,
        user_id: str,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[AvailabilityOverride]:
        """Get availability overrides for a user."""
        conditions = [AvailabilityOverride.user_id == user_id]

        if start_date:
            conditions.append(AvailabilityOverride.date >= start_date)
        if end_date:
            conditions.append(AvailabilityOverride.date <= end_date)

        stmt = (
            select(AvailabilityOverride)
            .where(and_(*conditions))
            .order_by(AvailabilityOverride.date)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def delete_override(self, override_id: str) -> bool:
        """Delete an availability override."""
        stmt = select(AvailabilityOverride).where(
            AvailabilityOverride.id == override_id
        )
        result = await self.db.execute(stmt)
        override = result.scalar_one_or_none()

        if not override:
            return False

        await self.db.delete(override)
        await self.db.flush()
        return True

    # Slot calculation

    async def get_available_slots(
        self,
        event_type_id: str,
        target_date: date,
        timezone: str = "UTC",
        calendar_service: "CalendarSyncService | None" = None,
    ) -> list[dict]:
        """Get available time slots for a specific date."""
        # Get event type
        stmt = select(EventType).where(EventType.id == event_type_id)
        result = await self.db.execute(stmt)
        event_type = result.scalar_one_or_none()

        if not event_type:
            return []

        # Check if date is within booking window
        now = datetime.now(ZoneInfo(timezone))
        today = now.date()

        # Min notice check
        min_booking_date = today
        if event_type.min_notice_hours > 0:
            min_booking_datetime = now + timedelta(hours=event_type.min_notice_hours)
            min_booking_date = min_booking_datetime.date()

        # Max future days check
        max_booking_date = today + timedelta(days=event_type.max_future_days)

        if target_date < min_booking_date or target_date > max_booking_date:
            return []

        # Get host ID(s)
        if event_type.is_team_event:
            host_ids = await self._get_team_member_ids(event_type_id)
        else:
            host_ids = [event_type.owner_id]

        if not host_ids:
            return []

        # Get base availability for the day
        day_of_week = target_date.weekday()  # 0=Monday, 6=Sunday
        available_windows = await self._get_day_availability(
            host_ids, event_type.workspace_id, day_of_week, target_date
        )

        if not available_windows:
            return []

        # Get existing bookings
        busy_times = await self._get_busy_times(
            host_ids, target_date, timezone
        )

        # Get calendar busy times if service is provided
        if calendar_service:
            for host_id in host_ids:
                calendar_busy = await calendar_service.get_busy_times(
                    host_id, target_date, target_date
                )
                busy_times.extend(calendar_busy)

        # Generate slots
        slots = self._generate_slots(
            available_windows=available_windows,
            busy_times=busy_times,
            duration_minutes=event_type.duration_minutes,
            buffer_before=event_type.buffer_before,
            buffer_after=event_type.buffer_after,
            target_date=target_date,
            timezone=timezone,
            min_booking_datetime=now + timedelta(hours=event_type.min_notice_hours)
            if event_type.min_notice_hours > 0
            else now,
        )

        return slots

    async def check_slot_availability(
        self,
        event_type_id: str,
        start_time: datetime,
        timezone: str = "UTC",
    ) -> bool:
        """Check if a specific slot is available."""
        slots = await self.get_available_slots(
            event_type_id=event_type_id,
            target_date=start_time.date(),
            timezone=timezone,
        )

        for slot in slots:
            if slot["start_time"] == start_time and slot["available"]:
                return True

        return False

    async def _get_team_member_ids(self, event_type_id: str) -> list[str]:
        """Get active team member IDs for an event type."""
        from aexy.models.booking import TeamEventMember

        stmt = select(TeamEventMember.user_id).where(
            and_(
                TeamEventMember.event_type_id == event_type_id,
                TeamEventMember.is_active == True,
            )
        )
        result = await self.db.execute(stmt)
        return [row[0] for row in result.all()]

    async def _get_day_availability(
        self,
        user_ids: list[str],
        workspace_id: str,
        day_of_week: int,
        target_date: date,
    ) -> list[dict]:
        """Get availability windows for a specific day."""
        windows = []

        for user_id in user_ids:
            # Check for override first
            override_stmt = select(AvailabilityOverride).where(
                and_(
                    AvailabilityOverride.user_id == user_id,
                    AvailabilityOverride.date == target_date,
                )
            )
            override_result = await self.db.execute(override_stmt)
            override = override_result.scalar_one_or_none()

            if override:
                if override.is_available and override.start_time and override.end_time:
                    windows.append(
                        {
                            "user_id": user_id,
                            "start_time": override.start_time,
                            "end_time": override.end_time,
                        }
                    )
                # If override exists but is_available=False, skip this user for this date
                continue

            # Get regular availability
            avail_stmt = select(UserAvailability).where(
                and_(
                    UserAvailability.user_id == user_id,
                    UserAvailability.workspace_id == workspace_id,
                    UserAvailability.day_of_week == day_of_week,
                    UserAvailability.is_active == True,
                )
            )
            avail_result = await self.db.execute(avail_stmt)
            availabilities = avail_result.scalars().all()

            for avail in availabilities:
                windows.append(
                    {
                        "user_id": user_id,
                        "start_time": avail.start_time,
                        "end_time": avail.end_time,
                    }
                )

        return windows

    async def _get_busy_times(
        self,
        user_ids: list[str],
        target_date: date,
        timezone: str,
    ) -> list[dict]:
        """Get busy times from existing bookings."""
        tz = ZoneInfo(timezone)
        start_of_day = datetime.combine(target_date, time.min, tzinfo=tz)
        end_of_day = datetime.combine(target_date, time.max, tzinfo=tz)

        stmt = select(Booking).where(
            and_(
                Booking.host_id.in_(user_ids),
                Booking.start_time >= start_of_day,
                Booking.end_time <= end_of_day,
                Booking.status.in_(
                    [BookingStatus.PENDING.value, BookingStatus.CONFIRMED.value]
                ),
            )
        )
        result = await self.db.execute(stmt)
        bookings = result.scalars().all()

        busy_times = []
        for booking in bookings:
            busy_times.append(
                {
                    "start": booking.start_time,
                    "end": booking.end_time,
                }
            )

        return busy_times

    def _generate_slots(
        self,
        available_windows: list[dict],
        busy_times: list[dict],
        duration_minutes: int,
        buffer_before: int,
        buffer_after: int,
        target_date: date,
        timezone: str,
        min_booking_datetime: datetime,
    ) -> list[dict]:
        """Generate available time slots."""
        tz = ZoneInfo(timezone)
        slots = []
        slot_duration = timedelta(minutes=duration_minutes)
        total_buffer = buffer_before + buffer_after

        for window in available_windows:
            # Convert window times to datetime
            window_start = datetime.combine(
                target_date, window["start_time"], tzinfo=tz
            )
            window_end = datetime.combine(target_date, window["end_time"], tzinfo=tz)

            # Generate slots within the window
            current = window_start
            while current + slot_duration <= window_end:
                slot_start = current
                slot_end = current + slot_duration

                # Check if slot is after minimum booking time
                if slot_start < min_booking_datetime:
                    current += timedelta(minutes=15)  # Move to next 15-min increment
                    continue

                # Check for conflicts with busy times (including buffers)
                buffered_start = slot_start - timedelta(minutes=buffer_before)
                buffered_end = slot_end + timedelta(minutes=buffer_after)

                is_available = True
                for busy in busy_times:
                    busy_start = busy["start"]
                    busy_end = busy["end"]

                    # Check for overlap
                    if buffered_start < busy_end and buffered_end > busy_start:
                        is_available = False
                        break

                slots.append(
                    {
                        "start_time": slot_start,
                        "end_time": slot_end,
                        "available": is_available,
                    }
                )

                current += timedelta(minutes=15)  # 15-minute increments

        return slots

    # Team availability aggregation

    async def get_team_available_slots(
        self,
        event_type_id: str,
        target_date: date,
        timezone: str = "UTC",
        calendar_service: "CalendarSyncService | None" = None,
    ) -> list[dict]:
        """Get available slots for a team event (all members must be free for collective)."""
        from aexy.models.booking import TeamEventMember, AssignmentType

        # Get event type
        stmt = select(EventType).where(EventType.id == event_type_id)
        result = await self.db.execute(stmt)
        event_type = result.scalar_one_or_none()

        if not event_type or not event_type.is_team_event:
            return await self.get_available_slots(
                event_type_id, target_date, timezone, calendar_service
            )

        # Get team members and their assignment type
        member_stmt = select(TeamEventMember).where(
            and_(
                TeamEventMember.event_type_id == event_type_id,
                TeamEventMember.is_active == True,
            )
        )
        member_result = await self.db.execute(member_stmt)
        members = list(member_result.scalars().all())

        if not members:
            return []

        # Check assignment type (assume all same for simplicity)
        assignment_type = members[0].assignment_type

        if assignment_type == AssignmentType.COLLECTIVE.value:
            # All members must be free - intersection of availability
            all_slots = []
            for member in members:
                # Create a temporary single-user event type context
                member_slots = await self._get_user_slots(
                    member.user_id,
                    event_type,
                    target_date,
                    timezone,
                    calendar_service,
                )
                all_slots.append(set(s["start_time"] for s in member_slots if s["available"]))

            if not all_slots:
                return []

            # Find intersection
            common_times = all_slots[0]
            for slot_set in all_slots[1:]:
                common_times = common_times.intersection(slot_set)

            # Build slot list
            return [
                {"start_time": t, "end_time": t + timedelta(minutes=event_type.duration_minutes), "available": True}
                for t in sorted(common_times)
            ]

        else:
            # Round-robin - union of availability (any member free is fine)
            return await self.get_available_slots(
                event_type_id, target_date, timezone, calendar_service
            )

    async def _get_user_slots(
        self,
        user_id: str,
        event_type: EventType,
        target_date: date,
        timezone: str,
        calendar_service: "CalendarSyncService | None",
    ) -> list[dict]:
        """Get available slots for a single user."""
        tz = ZoneInfo(timezone)
        now = datetime.now(tz)
        day_of_week = target_date.weekday()

        # Get availability windows
        windows = await self._get_day_availability(
            [user_id], event_type.workspace_id, day_of_week, target_date
        )

        if not windows:
            return []

        # Get busy times
        busy_times = await self._get_busy_times([user_id], target_date, timezone)

        if calendar_service:
            calendar_busy = await calendar_service.get_busy_times(
                user_id, target_date, target_date
            )
            busy_times.extend(calendar_busy)

        min_booking_datetime = now + timedelta(hours=event_type.min_notice_hours)

        return self._generate_slots(
            available_windows=windows,
            busy_times=busy_times,
            duration_minutes=event_type.duration_minutes,
            buffer_before=event_type.buffer_before,
            buffer_after=event_type.buffer_after,
            target_date=target_date,
            timezone=timezone,
            min_booking_datetime=min_booking_datetime,
        )
