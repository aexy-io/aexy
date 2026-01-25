"""RSVP API endpoints for booking module.

These endpoints are PUBLIC (no authentication required) because
attendees access them via email links with secure tokens.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.services.booking import BookingService
from aexy.services.booking.booking_service import (
    BookingNotFoundError,
    InvalidBookingStateError,
)

router = APIRouter(
    prefix="/booking/rsvp",
    tags=["Booking - RSVP"],
)


class RSVPBookingDetails(BaseModel):
    """Booking details for RSVP page."""

    booking_id: str
    event_name: str | None = None
    host_name: str | None = None
    invitee_name: str
    invitee_email: str
    start_time: str
    end_time: str
    timezone: str
    status: str
    location: str | None = None
    meeting_link: str | None = None
    attendee_status: str
    attendee_name: str | None = None


class RSVPResponse(BaseModel):
    """Response after RSVP action."""

    success: bool
    message: str
    attendee_status: str


class RSVPRequest(BaseModel):
    """Request body for RSVP action."""

    accept: bool


@router.get("/{token}", response_model=RSVPBookingDetails)
async def get_rsvp_details(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Get booking details for RSVP.

    This is a public endpoint - attendees access it via email links.
    """
    service = BookingService(db)

    attendee = await service.get_attendee_by_token(token)
    if not attendee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired RSVP token",
        )

    booking = await service.get_booking(attendee.booking_id)
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    return RSVPBookingDetails(
        booking_id=booking.id,
        event_name=booking.event_type.name if booking.event_type else None,
        host_name=booking.host.name if booking.host else None,
        invitee_name=booking.invitee_name,
        invitee_email=booking.invitee_email,
        start_time=booking.start_time.isoformat(),
        end_time=booking.end_time.isoformat(),
        timezone=booking.timezone,
        status=booking.status,
        location=booking.location,
        meeting_link=booking.meeting_link,
        attendee_status=attendee.status,
        attendee_name=attendee.user.name if attendee.user else None,
    )


@router.post("/{token}/respond", response_model=RSVPResponse)
async def respond_to_rsvp(
    token: str,
    data: RSVPRequest,
    db: AsyncSession = Depends(get_db),
):
    """Accept or decline an RSVP invitation.

    This is a public endpoint - attendees access it via email links.
    """
    service = BookingService(db)

    try:
        attendee = await service.respond_to_rsvp(
            response_token=token,
            accept=data.accept,
        )

        await db.commit()

        return RSVPResponse(
            success=True,
            message="You have accepted the meeting invitation." if data.accept
            else "You have declined the meeting invitation.",
            attendee_status=attendee.status,
        )

    except BookingNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except InvalidBookingStateError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
