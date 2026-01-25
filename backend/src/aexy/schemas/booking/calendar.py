"""Calendar connection schemas for booking module."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

from aexy.models.booking import CalendarProvider


class CalendarConnectRequest(BaseModel):
    """Schema for connecting a calendar."""

    provider: CalendarProvider
    auth_code: str  # OAuth authorization code
    redirect_uri: str | None = None


class CalendarConnectionResponse(BaseModel):
    """Schema for calendar connection response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    workspace_id: str
    provider: str
    calendar_id: str
    calendar_name: str
    account_email: str | None = None
    is_primary: bool
    sync_enabled: bool
    check_conflicts: bool
    create_events: bool
    last_synced_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class CalendarListResponse(BaseModel):
    """Wrapper for calendar list response."""

    calendars: list[CalendarConnectionResponse]
    total: int


class CalendarSyncResponse(BaseModel):
    """Schema for calendar sync response."""

    calendar_id: str
    synced: bool
    events_synced: int
    last_synced_at: datetime


class CalendarSettingsUpdate(BaseModel):
    """Schema for updating calendar settings."""

    is_primary: bool | None = None
    sync_enabled: bool | None = None
    check_conflicts: bool | None = None
    create_events: bool | None = None


class BusyTime(BaseModel):
    """Busy time slot from calendar."""

    start: datetime
    end: datetime
    title: str | None = None
    calendar_id: str | None = None


class BusyTimesResponse(BaseModel):
    """Response for busy times query."""

    user_id: str
    start_date: datetime
    end_date: datetime
    busy_times: list[BusyTime]
