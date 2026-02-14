"""Team calendar schemas for unified calendar view."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class TeamCalendarEvent(BaseModel):
    """Unified calendar event for team calendar view."""

    id: str
    title: str
    start: str  # ISO date or datetime
    end: str  # ISO date or datetime
    type: str  # "leave", "booking", "holiday"
    color: str
    all_day: bool = False

    # Developer info (for leaves/bookings)
    developer_id: str | None = None
    developer_name: str | None = None
    developer_avatar: str | None = None

    # Metadata
    metadata: dict = Field(default_factory=dict)


class TeamCalendarResponse(BaseModel):
    """Response for team calendar events."""

    events: list[TeamCalendarEvent]
    total: int


class WhoIsOutEntry(BaseModel):
    """Entry for who-is-out panel."""

    developer_id: str
    developer_name: str | None = None
    developer_avatar: str | None = None
    leave_type: str
    leave_type_color: str
    start_date: date
    end_date: date
    is_half_day: bool = False
    half_day_period: str | None = None


class WhoIsOutResponse(BaseModel):
    """Response for who-is-out query."""

    date: date
    entries: list[WhoIsOutEntry]
    total_out: int


class AvailabilitySummary(BaseModel):
    """Summary of team availability."""

    date: date
    total: int
    available: int
    on_leave: int
    on_holiday: int
