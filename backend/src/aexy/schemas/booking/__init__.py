"""Booking module schemas."""

from aexy.schemas.booking.event_type import (
    EventTypeCreate,
    EventTypeUpdate,
    EventTypeResponse,
    EventTypeListResponse,
    EventTypePublicResponse,
    CustomQuestion,
)
from aexy.schemas.booking.availability import (
    AvailabilitySlotCreate,
    AvailabilitySlotUpdate,
    AvailabilitySlotResponse,
    AvailabilityScheduleResponse,
    AvailabilityOverrideCreate,
    AvailabilityOverrideResponse,
    TimeSlot,
    AvailableSlotsResponse,
)
from aexy.schemas.booking.booking import (
    BookingCreate,
    BookingUpdate,
    BookingResponse,
    BookingListResponse,
    BookingCancelRequest,
    BookingRescheduleRequest,
    BookingPublicCreate,
    BookingConfirmationResponse,
)
from aexy.schemas.booking.calendar import (
    CalendarConnectionResponse,
    CalendarListResponse,
    CalendarConnectRequest,
    CalendarSyncResponse,
)
from aexy.schemas.booking.webhook import (
    BookingWebhookCreate,
    BookingWebhookUpdate,
    BookingWebhookResponse,
    BookingWebhookListResponse,
)
from aexy.schemas.booking.team import (
    TeamEventMemberCreate,
    TeamEventMemberResponse,
    TeamEventMembersUpdate,
)

__all__ = [
    # Event Type
    "EventTypeCreate",
    "EventTypeUpdate",
    "EventTypeResponse",
    "EventTypeListResponse",
    "EventTypePublicResponse",
    "CustomQuestion",
    # Availability
    "AvailabilitySlotCreate",
    "AvailabilitySlotUpdate",
    "AvailabilitySlotResponse",
    "AvailabilityScheduleResponse",
    "AvailabilityOverrideCreate",
    "AvailabilityOverrideResponse",
    "TimeSlot",
    "AvailableSlotsResponse",
    # Booking
    "BookingCreate",
    "BookingUpdate",
    "BookingResponse",
    "BookingListResponse",
    "BookingCancelRequest",
    "BookingRescheduleRequest",
    "BookingPublicCreate",
    "BookingConfirmationResponse",
    # Calendar
    "CalendarConnectionResponse",
    "CalendarListResponse",
    "CalendarConnectRequest",
    "CalendarSyncResponse",
    # Webhook
    "BookingWebhookCreate",
    "BookingWebhookUpdate",
    "BookingWebhookResponse",
    "BookingWebhookListResponse",
    # Team
    "TeamEventMemberCreate",
    "TeamEventMemberResponse",
    "TeamEventMembersUpdate",
]
