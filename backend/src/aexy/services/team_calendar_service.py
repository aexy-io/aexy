"""Team calendar service for aggregating leaves, bookings, and holidays."""

from datetime import date

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.leave import LeaveRequest, LeaveRequestStatus, Holiday
from aexy.models.booking import Booking, BookingStatus
from aexy.models.workspace import WorkspaceMember
from aexy.models.team import TeamMember
from aexy.schemas.team_calendar import (
    TeamCalendarEvent,
    WhoIsOutEntry,
    AvailabilitySummary,
)


class TeamCalendarService:
    """Service for aggregating calendar events from multiple sources."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_team_calendar_events(
        self,
        workspace_id: str,
        start_date: date,
        end_date: date,
        team_id: str | None = None,
        event_types: list[str] | None = None,
    ) -> list[TeamCalendarEvent]:
        """Get unified calendar events from leaves, bookings, and holidays."""
        events: list[TeamCalendarEvent] = []
        types = event_types or ["leave", "booking", "holiday"]

        # Get team member IDs if team_id specified
        member_ids = None
        if team_id:
            member_ids = await self._get_team_member_ids(team_id)

        if "leave" in types:
            leave_events = await self._get_leave_events(
                workspace_id, start_date, end_date, member_ids
            )
            events.extend(leave_events)

        if "booking" in types:
            booking_events = await self._get_booking_events(
                workspace_id, start_date, end_date, member_ids
            )
            events.extend(booking_events)

        if "holiday" in types:
            holiday_events = await self._get_holiday_events(
                workspace_id, start_date, end_date
            )
            events.extend(holiday_events)

        # Sort by start date
        events.sort(key=lambda e: e.start)
        return events

    async def get_who_is_out(
        self,
        workspace_id: str,
        target_date: date,
        team_id: str | None = None,
    ) -> list[WhoIsOutEntry]:
        """Get who's out on a specific date."""
        conditions = [
            LeaveRequest.workspace_id == workspace_id,
            LeaveRequest.status == LeaveRequestStatus.APPROVED.value,
            LeaveRequest.start_date <= target_date,
            LeaveRequest.end_date >= target_date,
        ]

        if team_id:
            member_ids = await self._get_team_member_ids(team_id)
            if member_ids:
                conditions.append(LeaveRequest.developer_id.in_(member_ids))

        stmt = select(LeaveRequest).where(and_(*conditions))
        result = await self.db.execute(stmt)
        requests = list(result.scalars().all())

        entries = []
        for req in requests:
            entries.append(
                WhoIsOutEntry(
                    developer_id=req.developer_id,
                    developer_name=req.developer.name if req.developer else None,
                    developer_avatar=req.developer.avatar_url if req.developer else None,
                    leave_type=req.leave_type.name if req.leave_type else "Leave",
                    leave_type_color=req.leave_type.color if req.leave_type else "#3b82f6",
                    start_date=req.start_date,
                    end_date=req.end_date,
                    is_half_day=req.is_half_day,
                    half_day_period=req.half_day_period,
                )
            )

        return entries

    async def get_availability_summary(
        self,
        workspace_id: str,
        target_date: date,
        team_id: str | None = None,
    ) -> AvailabilitySummary:
        """Get availability summary for a date."""
        # Get total members
        if team_id:
            member_ids = await self._get_team_member_ids(team_id)
            total = len(member_ids) if member_ids else 0
        else:
            member_stmt = select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id
            )
            member_result = await self.db.execute(member_stmt)
            total = len(list(member_result.scalars().all()))

        # Count on leave
        who_is_out = await self.get_who_is_out(workspace_id, target_date, team_id)
        on_leave = len(who_is_out)

        # Check if it's a holiday
        holiday_stmt = select(Holiday).where(
            and_(
                Holiday.workspace_id == workspace_id,
                Holiday.date == target_date,
                Holiday.is_optional == False,  # noqa: E712
            )
        )
        holiday_result = await self.db.execute(holiday_stmt)
        on_holiday = total if holiday_result.scalar_one_or_none() else 0

        available = max(total - on_leave - on_holiday, 0)

        return AvailabilitySummary(
            date=target_date,
            total=total,
            available=available,
            on_leave=on_leave,
            on_holiday=on_holiday,
        )

    async def _get_team_member_ids(self, team_id: str) -> list[str]:
        """Get developer IDs for a team."""
        stmt = select(TeamMember.developer_id).where(
            TeamMember.team_id == team_id
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def _get_leave_events(
        self,
        workspace_id: str,
        start_date: date,
        end_date: date,
        member_ids: list[str] | None = None,
    ) -> list[TeamCalendarEvent]:
        """Get approved leave requests as calendar events."""
        conditions = [
            LeaveRequest.workspace_id == workspace_id,
            LeaveRequest.status == LeaveRequestStatus.APPROVED.value,
            LeaveRequest.end_date >= start_date,
            LeaveRequest.start_date <= end_date,
        ]

        if member_ids is not None:
            conditions.append(LeaveRequest.developer_id.in_(member_ids))

        stmt = select(LeaveRequest).where(and_(*conditions))
        result = await self.db.execute(stmt)
        requests = list(result.scalars().all())

        events = []
        for req in requests:
            dev_name = req.developer.name if req.developer else "Unknown"
            type_name = req.leave_type.name if req.leave_type else "Leave"
            color = req.leave_type.color if req.leave_type else "#3b82f6"

            events.append(
                TeamCalendarEvent(
                    id=req.id,
                    title=f"{dev_name} - {type_name}",
                    start=req.start_date.isoformat(),
                    end=req.end_date.isoformat(),
                    type="leave",
                    color=color,
                    all_day=True,
                    developer_id=req.developer_id,
                    developer_name=dev_name,
                    developer_avatar=req.developer.avatar_url if req.developer else None,
                    metadata={
                        "leave_type": type_name,
                        "is_half_day": req.is_half_day,
                        "half_day_period": req.half_day_period,
                        "total_days": req.total_days,
                        "reason": req.reason,
                    },
                )
            )

        return events

    async def _get_booking_events(
        self,
        workspace_id: str,
        start_date: date,
        end_date: date,
        member_ids: list[str] | None = None,
    ) -> list[TeamCalendarEvent]:
        """Get confirmed bookings as calendar events."""
        from datetime import datetime, time

        start_dt = datetime.combine(start_date, time.min)
        end_dt = datetime.combine(end_date, time.max)

        conditions = [
            Booking.workspace_id == workspace_id,
            Booking.status == BookingStatus.CONFIRMED.value,
            Booking.end_time >= start_dt,
            Booking.start_time <= end_dt,
        ]

        if member_ids is not None:
            conditions.append(Booking.host_id.in_(member_ids))

        stmt = select(Booking).where(and_(*conditions))
        result = await self.db.execute(stmt)
        bookings = list(result.scalars().all())

        events = []
        for booking in bookings:
            host_name = booking.host.name if booking.host else "Unknown"
            event_name = (
                booking.event_type.name if booking.event_type else "Meeting"
            )

            events.append(
                TeamCalendarEvent(
                    id=booking.id,
                    title=f"{host_name} - {event_name}",
                    start=booking.start_time.isoformat(),
                    end=booking.end_time.isoformat(),
                    type="booking",
                    color=booking.event_type.color if booking.event_type else "#6366f1",
                    all_day=False,
                    developer_id=booking.host_id,
                    developer_name=host_name,
                    developer_avatar=booking.host.avatar_url if booking.host else None,
                    metadata={
                        "event_type": event_name,
                        "invitee_name": booking.invitee_name,
                        "invitee_email": booking.invitee_email,
                    },
                )
            )

        return events

    async def _get_holiday_events(
        self,
        workspace_id: str,
        start_date: date,
        end_date: date,
    ) -> list[TeamCalendarEvent]:
        """Get holidays as calendar events."""
        stmt = (
            select(Holiday)
            .where(
                and_(
                    Holiday.workspace_id == workspace_id,
                    Holiday.date >= start_date,
                    Holiday.date <= end_date,
                )
            )
            .order_by(Holiday.date.asc())
        )
        result = await self.db.execute(stmt)
        holidays = list(result.scalars().all())

        events = []
        for holiday in holidays:
            events.append(
                TeamCalendarEvent(
                    id=holiday.id,
                    title=holiday.name,
                    start=holiday.date.isoformat(),
                    end=holiday.date.isoformat(),
                    type="holiday",
                    color="#f59e0b" if holiday.is_optional else "#ef4444",
                    all_day=True,
                    metadata={
                        "description": holiday.description,
                        "is_optional": holiday.is_optional,
                    },
                )
            )

        return events
