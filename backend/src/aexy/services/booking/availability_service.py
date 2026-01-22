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
        user_ids: list[str] | None = None,
    ) -> list[dict]:
        """Get available time slots for a specific date.

        Args:
            event_type_id: The event type to get slots for
            target_date: The date to get slots for
            timezone: The timezone to use
            calendar_service: Optional calendar service for external busy times
            user_ids: Optional list of specific user IDs to check availability for.
                      When provided, only returns slots when ALL specified users are free.
        """
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
        # If user_ids is provided, use those instead of the default team/owner lookup
        if user_ids:
            host_ids = user_ids
        elif event_type.is_team_event:
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
        user_ids: list[str] | None = None,
    ) -> bool:
        """Check if a specific slot is available.

        Args:
            event_type_id: The event type to check
            start_time: The start time to check
            timezone: The timezone to use
            user_ids: Optional list of specific user IDs to check availability for
        """
        slots = await self.get_available_slots(
            event_type_id=event_type_id,
            target_date=start_time.date(),
            timezone=timezone,
            user_ids=user_ids,
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

    # Team availability for calendar view

    async def get_team_availability(
        self,
        workspace_id: str,
        start_date: date,
        end_date: date,
        timezone: str = "UTC",
        event_type_id: str | None = None,
        team_id: str | None = None,
        user_ids: list[str] | None = None,
        calendar_service: "CalendarSyncService | None" = None,
    ) -> dict:
        """Get team availability for a date range.

        Returns availability windows, busy times, and existing bookings
        for multiple team members, suitable for a team calendar view.

        Args:
            workspace_id: The workspace ID
            start_date: Start of date range
            end_date: End of date range
            timezone: Timezone for the response
            event_type_id: Optional event type ID to get members from
            team_id: Optional team ID to get members from
            user_ids: Optional explicit list of user IDs
            calendar_service: Optional calendar sync service for external calendars

        Returns:
            Dict with members, overlapping_slots, and bookings
        """
        from aexy.models.team import Team, TeamMember
        from aexy.models.developer import Developer

        # Determine which users to include
        member_ids: list[str] = []

        if user_ids:
            # Use explicit user list
            member_ids = user_ids
        elif event_type_id:
            # Get members from event type
            member_ids = await self._get_team_member_ids(event_type_id)
        elif team_id:
            # Get members from workspace team
            stmt = select(TeamMember.user_id).where(
                TeamMember.team_id == team_id
            )
            result = await self.db.execute(stmt)
            member_ids = [row[0] for row in result.all()]

        if not member_ids:
            return {
                "members": [],
                "overlapping_slots": [],
                "bookings": [],
            }

        # Get user details
        user_stmt = select(Developer).where(Developer.id.in_(member_ids))
        user_result = await self.db.execute(user_stmt)
        users = {u.id: u for u in user_result.scalars().all()}

        # Build response structure
        members_data = []
        all_available_times: dict[str, list[set]] = {}  # date -> list of time sets per user

        # Process each day in the range
        current_date = start_date
        while current_date <= end_date:
            date_str = current_date.isoformat()
            all_available_times[date_str] = []

            for user_id in member_ids:
                # Initialize member data on first iteration
                member_entry = next(
                    (m for m in members_data if m["user_id"] == user_id), None
                )
                if not member_entry:
                    user = users.get(user_id)
                    member_entry = {
                        "user_id": user_id,
                        "user": {
                            "id": user_id,
                            "name": user.name if user else None,
                            "email": user.email if user else None,
                            "avatar_url": user.avatar_url if user else None,
                        },
                        "availability": [],
                    }
                    members_data.append(member_entry)

                # Get day's availability
                day_of_week = current_date.weekday()
                windows = await self._get_day_availability(
                    [user_id], workspace_id, day_of_week, current_date
                )

                # Get busy times from bookings
                busy_times = await self._get_busy_times([user_id], current_date, timezone)

                # Get calendar busy times if available
                if calendar_service:
                    calendar_busy = await calendar_service.get_busy_times(
                        user_id, current_date, current_date
                    )
                    busy_times.extend(calendar_busy)

                # Format windows
                formatted_windows = []
                available_minutes = set()

                for window in windows:
                    formatted_windows.append({
                        "start": window["start_time"].strftime("%H:%M"),
                        "end": window["end_time"].strftime("%H:%M"),
                    })

                    # Track available times (in 15-min increments)
                    start_minutes = window["start_time"].hour * 60 + window["start_time"].minute
                    end_minutes = window["end_time"].hour * 60 + window["end_time"].minute
                    for m in range(start_minutes, end_minutes, 15):
                        available_minutes.add(m)

                # Remove busy times from available minutes
                for busy in busy_times:
                    busy_start = busy["start"]
                    busy_end = busy["end"]
                    if busy_start.date() == current_date:
                        start_m = busy_start.hour * 60 + busy_start.minute
                        end_m = busy_end.hour * 60 + busy_end.minute
                        for m in range(start_m, end_m, 15):
                            available_minutes.discard(m)

                all_available_times[date_str].append(available_minutes)

                # Format busy times
                formatted_busy = [
                    {
                        "start": bt["start"].isoformat(),
                        "end": bt["end"].isoformat(),
                        "title": None,
                    }
                    for bt in busy_times
                ]

                member_entry["availability"].append({
                    "date": date_str,
                    "windows": formatted_windows,
                    "busy_times": formatted_busy,
                })

            current_date += timedelta(days=1)

        # Calculate overlapping slots (times when ALL members are free)
        overlapping_slots = []
        for date_str, time_sets in all_available_times.items():
            if time_sets:
                common_times = time_sets[0]
                for ts in time_sets[1:]:
                    common_times = common_times.intersection(ts)

                if common_times:
                    # Convert back to windows
                    sorted_times = sorted(common_times)
                    windows = []
                    if sorted_times:
                        window_start = sorted_times[0]
                        prev = sorted_times[0]
                        for t in sorted_times[1:] + [sorted_times[-1] + 15]:
                            if t - prev > 15:
                                # End of window
                                windows.append({
                                    "start": f"{window_start // 60:02d}:{window_start % 60:02d}",
                                    "end": f"{prev // 60 + (1 if prev % 60 == 45 else 0):02d}:{(prev % 60 + 15) % 60:02d}",
                                })
                                window_start = t
                            prev = t

                    overlapping_slots.append({
                        "date": date_str,
                        "windows": windows,
                    })

        # Get existing bookings for the team in this range
        tz = ZoneInfo(timezone)
        range_start = datetime.combine(start_date, time.min, tzinfo=tz)
        range_end = datetime.combine(end_date, time.max, tzinfo=tz)

        booking_stmt = select(Booking).where(
            and_(
                Booking.host_id.in_(member_ids),
                Booking.start_time >= range_start,
                Booking.end_time <= range_end,
                Booking.status.in_([
                    BookingStatus.PENDING.value,
                    BookingStatus.CONFIRMED.value,
                ]),
            )
        )
        booking_result = await self.db.execute(booking_stmt)
        bookings = booking_result.scalars().all()

        bookings_data = []
        for b in bookings:
            bookings_data.append({
                "id": b.id,
                "event_type_id": b.event_type_id,
                "event_name": b.event_type.name if b.event_type else None,
                "host_id": b.host_id,
                "host_name": users.get(b.host_id).name if b.host_id and b.host_id in users else None,
                "invitee_name": b.invitee_name,
                "start_time": b.start_time.isoformat(),
                "end_time": b.end_time.isoformat(),
                "status": b.status,
            })

        return {
            "members": members_data,
            "overlapping_slots": overlapping_slots,
            "bookings": bookings_data,
        }
