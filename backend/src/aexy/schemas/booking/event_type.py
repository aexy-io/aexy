"""Event type schemas for booking module."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

from aexy.models.booking import LocationType


class CustomQuestion(BaseModel):
    """Custom intake question for event type."""

    id: str
    label: str = Field(..., min_length=1, max_length=255)
    type: str = Field(default="text")  # text, textarea, select, checkbox
    required: bool = False
    options: list[str] | None = None  # For select type
    placeholder: str | None = None


class EventTypeCreate(BaseModel):
    """Schema for creating an event type."""

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")
    description: str | None = Field(default=None, max_length=2000)
    duration_minutes: int = Field(default=30, ge=5, le=480)

    location_type: LocationType = LocationType.GOOGLE_MEET
    custom_location: str | None = Field(default=None, max_length=500)
    color: str = Field(default="#3B82F6", pattern=r"^#[0-9A-Fa-f]{6}$")

    is_team_event: bool = False

    buffer_before: int = Field(default=0, ge=0, le=120)
    buffer_after: int = Field(default=0, ge=0, le=120)

    min_notice_hours: int = Field(default=24, ge=0, le=720)
    max_future_days: int = Field(default=60, ge=1, le=365)

    questions: list[CustomQuestion] = Field(default_factory=list)

    payment_enabled: bool = False
    payment_amount: int | None = Field(default=None, ge=0)  # In cents
    payment_currency: str = Field(default="USD", min_length=3, max_length=3)

    confirmation_message: str | None = Field(default=None, max_length=2000)


class EventTypeUpdate(BaseModel):
    """Schema for updating an event type."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")
    description: str | None = None
    duration_minutes: int | None = Field(default=None, ge=5, le=480)

    location_type: LocationType | None = None
    custom_location: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")

    is_active: bool | None = None
    is_team_event: bool | None = None

    buffer_before: int | None = Field(default=None, ge=0, le=120)
    buffer_after: int | None = Field(default=None, ge=0, le=120)

    min_notice_hours: int | None = Field(default=None, ge=0, le=720)
    max_future_days: int | None = Field(default=None, ge=1, le=365)

    questions: list[CustomQuestion] | None = None

    payment_enabled: bool | None = None
    payment_amount: int | None = None
    payment_currency: str | None = Field(default=None, min_length=3, max_length=3)

    confirmation_message: str | None = None


class OwnerBrief(BaseModel):
    """Brief owner info for event type response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None


class EventTypeResponse(BaseModel):
    """Schema for event type response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    owner_id: str
    owner: OwnerBrief | None = None

    name: str
    slug: str
    description: str | None = None
    duration_minutes: int

    location_type: str
    custom_location: str | None = None
    color: str

    is_active: bool
    is_team_event: bool

    buffer_before: int
    buffer_after: int

    min_notice_hours: int
    max_future_days: int

    questions: list[dict]

    payment_enabled: bool
    payment_amount: int | None = None
    payment_currency: str

    confirmation_message: str | None = None

    created_at: datetime
    updated_at: datetime


class EventTypeListResponse(BaseModel):
    """Wrapper for event type list response."""

    event_types: list[EventTypeResponse]
    total: int


class EventTypePublicResponse(BaseModel):
    """Schema for public event type response (limited info)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    description: str | None = None
    duration_minutes: int
    location_type: str
    color: str
    questions: list[dict]
    payment_enabled: bool
    payment_amount: int | None = None
    payment_currency: str

    # Host info
    host_name: str | None = None
    host_avatar_url: str | None = None
