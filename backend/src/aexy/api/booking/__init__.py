"""Booking API routes."""

from fastapi import APIRouter

from aexy.api.booking.event_types import router as event_types_router
from aexy.api.booking.availability import router as availability_router
from aexy.api.booking.bookings import router as bookings_router
from aexy.api.booking.calendars import router as calendars_router
from aexy.api.booking.webhooks import router as webhooks_router
from aexy.api.booking.public import router as public_router

router = APIRouter()

# Authenticated routes under /api/v1/workspaces/{workspace_id}/booking
router.include_router(event_types_router)
router.include_router(availability_router)
router.include_router(bookings_router)
router.include_router(calendars_router)
router.include_router(webhooks_router)

# Public routes (separate prefix)
public_booking_router = public_router

__all__ = ["router", "public_booking_router"]
