"""On-call scheduling Pydantic schemas."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


# =============================================================================
# On-Call Config Schemas
# =============================================================================

class OnCallConfigCreate(BaseModel):
    """Schema for enabling on-call for a team."""

    timezone: str = Field(default="UTC", max_length=100)
    default_shift_duration_hours: int = Field(default=24, ge=1, le=168)  # 1 hour to 1 week
    slack_channel_id: str | None = None
    notify_before_shift_minutes: int = Field(default=30, ge=0, le=1440)  # 0 to 24 hours
    notify_on_shift_change: bool = True


class OnCallConfigUpdate(BaseModel):
    """Schema for updating on-call config."""

    timezone: str | None = None
    default_shift_duration_hours: int | None = Field(default=None, ge=1, le=168)
    google_calendar_enabled: bool | None = None
    google_calendar_id: str | None = None
    slack_channel_id: str | None = None
    notify_before_shift_minutes: int | None = Field(default=None, ge=0, le=1440)
    notify_on_shift_change: bool | None = None


class OnCallConfigResponse(BaseModel):
    """Schema for on-call config response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    team_id: str
    is_enabled: bool
    timezone: str
    default_shift_duration_hours: int
    google_calendar_enabled: bool
    google_calendar_id: str | None
    slack_channel_id: str | None
    notify_before_shift_minutes: int
    notify_on_shift_change: bool
    created_at: datetime
    updated_at: datetime
    # Current on-call info (populated by service)
    current_oncall: "OnCallScheduleResponse | None" = None


# =============================================================================
# On-Call Schedule Schemas
# =============================================================================

class OnCallScheduleCreate(BaseModel):
    """Schema for creating a single schedule."""

    developer_id: str
    start_time: datetime
    end_time: datetime


class OnCallScheduleBulkCreate(BaseModel):
    """Schema for creating multiple schedules at once."""

    schedules: list[OnCallScheduleCreate] = Field(..., min_length=1, max_length=100)


class OnCallScheduleUpdate(BaseModel):
    """Schema for updating a schedule."""

    developer_id: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None


class DeveloperBrief(BaseModel):
    """Brief developer info for schedule responses."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None


class OnCallScheduleResponse(BaseModel):
    """Schema for on-call schedule response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    config_id: str
    developer_id: str
    developer: DeveloperBrief | None = None
    start_time: datetime
    end_time: datetime
    is_override: bool
    original_developer_id: str | None
    original_developer: DeveloperBrief | None = None
    override_reason: str | None
    google_event_id: str | None
    created_by_id: str | None
    created_at: datetime
    updated_at: datetime


class OnCallScheduleListResponse(BaseModel):
    """Schema for listing schedules with pagination info."""

    schedules: list[OnCallScheduleResponse]
    total: int
    start_date: datetime
    end_date: datetime


class CurrentOnCallResponse(BaseModel):
    """Schema for current on-call response."""

    is_active: bool
    schedule: OnCallScheduleResponse | None = None
    next_schedule: OnCallScheduleResponse | None = None


# =============================================================================
# Swap Request Schemas
# =============================================================================

class SwapRequestCreate(BaseModel):
    """Schema for creating a swap request."""

    target_id: str  # Who to swap with
    message: str | None = Field(default=None, max_length=500)


class SwapRequestResponse(BaseModel):
    """Schema for swap request response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    schedule_id: str
    schedule: OnCallScheduleResponse | None = None
    requester_id: str
    requester: DeveloperBrief | None = None
    target_id: str
    target: DeveloperBrief | None = None
    status: str
    message: str | None
    responded_at: datetime | None
    response_message: str | None
    created_at: datetime


class SwapRequestDecline(BaseModel):
    """Schema for declining a swap request."""

    response_message: str | None = Field(default=None, max_length=500)


# =============================================================================
# Override Schemas
# =============================================================================

class OverrideCreate(BaseModel):
    """Schema for creating an override (taking over a shift)."""

    new_developer_id: str
    reason: str | None = Field(default=None, max_length=500)


# =============================================================================
# Google Calendar Schemas
# =============================================================================

class GoogleCalendarConnectResponse(BaseModel):
    """Schema for Google Calendar OAuth URL."""

    auth_url: str


class GoogleCalendarStatusResponse(BaseModel):
    """Schema for Google Calendar connection status."""

    is_connected: bool
    calendar_email: str | None = None
    last_sync_at: datetime | None = None
    last_error: str | None = None


class GoogleCalendarInfo(BaseModel):
    """Schema for a Google Calendar."""

    id: str
    summary: str  # Calendar name
    description: str | None = None
    primary: bool = False
    access_role: str | None = None


class GoogleCalendarListResponse(BaseModel):
    """Schema for list of available calendars."""

    calendars: list[GoogleCalendarInfo]


class GoogleCalendarSelectRequest(BaseModel):
    """Schema for selecting a calendar to sync."""

    calendar_id: str


# Update forward references
OnCallConfigResponse.model_rebuild()
