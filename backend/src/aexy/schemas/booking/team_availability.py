"""Team availability schemas for booking module."""

from datetime import date, datetime, time
from pydantic import BaseModel, ConfigDict, Field


class UserBrief(BaseModel):
    """Brief user info for team availability."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None


class TimeWindow(BaseModel):
    """A time window representing availability."""

    start: str  # HH:MM format
    end: str  # HH:MM format


class BusyTime(BaseModel):
    """A busy time slot."""

    start: datetime
    end: datetime
    title: str | None = None  # Optional title for context (e.g., "Meeting")


class DayAvailability(BaseModel):
    """Availability for a single day."""

    date: str  # YYYY-MM-DD format
    windows: list[TimeWindow] = Field(default_factory=list)
    busy_times: list[BusyTime] = Field(default_factory=list)


class MemberAvailability(BaseModel):
    """Availability data for a single team member."""

    user_id: str
    user: UserBrief
    availability: list[DayAvailability] = Field(default_factory=list)


class OverlappingSlot(BaseModel):
    """A time slot where all team members are available."""

    date: str  # YYYY-MM-DD format
    windows: list[TimeWindow] = Field(default_factory=list)


class TeamBookingBrief(BaseModel):
    """Brief booking info for team calendar."""

    id: str
    event_type_id: str
    event_name: str | None = None
    host_id: str | None = None
    host_name: str | None = None
    invitee_name: str
    start_time: datetime
    end_time: datetime
    status: str


class TeamAvailabilityResponse(BaseModel):
    """Response for team availability endpoint."""

    event_type_id: str | None = None
    team_id: str | None = None
    start_date: str  # YYYY-MM-DD format
    end_date: str  # YYYY-MM-DD format
    timezone: str
    members: list[MemberAvailability] = Field(default_factory=list)
    overlapping_slots: list[OverlappingSlot] = Field(default_factory=list)
    bookings: list[TeamBookingBrief] = Field(default_factory=list)


class TeamAvailabilityRequest(BaseModel):
    """Request parameters for team availability."""

    start_date: str  # YYYY-MM-DD format
    end_date: str  # YYYY-MM-DD format
    timezone: str = "UTC"
    event_type_id: str | None = None
    team_id: str | None = None
    user_ids: list[str] | None = None  # Custom list of user IDs
