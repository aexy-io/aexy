"""Booking webhook schemas for booking module."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, HttpUrl


# Webhook event types
WEBHOOK_EVENTS = [
    "booking.created",
    "booking.confirmed",
    "booking.cancelled",
    "booking.rescheduled",
    "booking.completed",
    "booking.no_show",
    "booking.reminder_sent",
    "payment.received",
    "payment.refunded",
]


class BookingWebhookCreate(BaseModel):
    """Schema for creating a booking webhook."""

    name: str = Field(..., min_length=1, max_length=255)
    url: str = Field(..., max_length=500)
    events: list[str] = Field(..., min_length=1)

    def __init__(self, **data):
        super().__init__(**data)
        # Validate events
        for event in self.events:
            if event not in WEBHOOK_EVENTS:
                raise ValueError(f"Invalid event: {event}. Valid events: {WEBHOOK_EVENTS}")


class BookingWebhookUpdate(BaseModel):
    """Schema for updating a booking webhook."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    url: str | None = Field(default=None, max_length=500)
    events: list[str] | None = None
    is_active: bool | None = None


class BookingWebhookResponse(BaseModel):
    """Schema for booking webhook response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    url: str
    events: list[str]
    is_active: bool
    last_triggered_at: datetime | None = None
    failure_count: int
    last_failure_at: datetime | None = None
    last_failure_reason: str | None = None
    created_at: datetime
    updated_at: datetime


class BookingWebhookListResponse(BaseModel):
    """Wrapper for webhook list response."""

    webhooks: list[BookingWebhookResponse]
    total: int


class WebhookTestResponse(BaseModel):
    """Response for webhook test."""

    success: bool
    status_code: int | None = None
    response_time_ms: int | None = None
    error: str | None = None
