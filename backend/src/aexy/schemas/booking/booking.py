"""Booking schemas for booking module."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from aexy.models.booking import BookingStatus, PaymentStatus


class BookingCreate(BaseModel):
    """Schema for creating a booking (internal/admin use)."""

    event_type_id: str
    invitee_email: EmailStr
    invitee_name: str = Field(..., min_length=1, max_length=255)
    invitee_phone: str | None = Field(default=None, max_length=50)
    start_time: datetime
    timezone: str = Field(default="UTC", max_length=100)
    answers: dict = Field(default_factory=dict)
    location: str | None = Field(default=None, max_length=500)


class BookingPublicCreate(BaseModel):
    """Schema for creating a booking (public booking page)."""

    start_time: datetime
    timezone: str = Field(default="UTC", max_length=100)
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=50)
    answers: dict = Field(default_factory=dict)
    payment_method_id: str | None = None  # For paid events
    # Team booking fields
    team_id: str | None = None  # Team ID or slug for team bookings
    member_ids: list[str] | None = None  # Specific team members to book with


class BookingUpdate(BaseModel):
    """Schema for updating a booking."""

    status: BookingStatus | None = None
    location: str | None = None
    meeting_link: str | None = None
    answers: dict | None = None


class BookingCancelRequest(BaseModel):
    """Schema for cancelling a booking."""

    reason: str | None = Field(default=None, max_length=1000)


class BookingRescheduleRequest(BaseModel):
    """Schema for rescheduling a booking."""

    new_start_time: datetime
    timezone: str = Field(default="UTC", max_length=100)


class HostBrief(BaseModel):
    """Brief host info for booking response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None


class AttendeeResponse(BaseModel):
    """Attendee info for booking response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    status: str  # pending, confirmed, declined
    responded_at: datetime | None = None
    user: HostBrief | None = None


class EventTypeBrief(BaseModel):
    """Brief event type info for booking response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    duration_minutes: int
    location_type: str
    color: str


class BookingResponse(BaseModel):
    """Schema for booking response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    event_type_id: str
    workspace_id: str
    host_id: str | None = None

    event_type: EventTypeBrief | None = None
    host: HostBrief | None = None
    attendees: list[AttendeeResponse] = Field(default_factory=list)

    invitee_email: str
    invitee_name: str
    invitee_phone: str | None = None

    start_time: datetime
    end_time: datetime
    timezone: str

    status: str
    location: str | None = None
    meeting_link: str | None = None

    answers: dict

    cancellation_reason: str | None = None
    cancelled_by: str | None = None
    cancelled_at: datetime | None = None

    payment_status: str
    payment_amount: int | None = None
    payment_currency: str | None = None

    calendar_event_id: str | None = None

    reminder_sent: bool

    created_at: datetime
    updated_at: datetime


class BookingListResponse(BaseModel):
    """Wrapper for booking list response."""

    bookings: list[BookingResponse]
    total: int


class BookingConfirmationResponse(BaseModel):
    """Schema for booking confirmation (public)."""

    id: str
    event_name: str
    host_name: str | None = None
    host_email: str | None = None
    invitee_name: str
    invitee_email: str
    start_time: datetime
    end_time: datetime
    timezone: str
    status: str
    location: str | None = None
    meeting_link: str | None = None
    confirmation_message: str | None = None
    can_cancel: bool = True
    can_reschedule: bool = True
    cancel_token: str | None = None


class BookingFilters(BaseModel):
    """Filters for listing bookings."""

    status: BookingStatus | None = None
    event_type_id: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    invitee_email: str | None = None
    host_id: str | None = None
