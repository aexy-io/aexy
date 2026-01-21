"""Bookings API endpoints for booking module."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.models.booking import BookingStatus
from aexy.schemas.booking import (
    BookingCreate,
    BookingUpdate,
    BookingResponse,
    BookingListResponse,
    BookingCancelRequest,
    BookingRescheduleRequest,
)
from aexy.schemas.booking.booking import HostBrief, EventTypeBrief
from aexy.services.booking import BookingService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/booking/bookings",
    tags=["Booking - Bookings"],
)


def booking_to_response(booking) -> BookingResponse:
    """Convert Booking model to response schema."""
    event_type_data = None
    if booking.event_type:
        event_type_data = EventTypeBrief(
            id=booking.event_type.id,
            name=booking.event_type.name,
            slug=booking.event_type.slug,
            duration_minutes=booking.event_type.duration_minutes,
            location_type=booking.event_type.location_type,
            color=booking.event_type.color,
        )

    host_data = None
    if booking.host:
        host_data = HostBrief(
            id=booking.host.id,
            name=booking.host.name,
            email=booking.host.email,
            avatar_url=booking.host.avatar_url,
        )

    return BookingResponse(
        id=booking.id,
        event_type_id=booking.event_type_id,
        workspace_id=booking.workspace_id,
        host_id=booking.host_id,
        event_type=event_type_data,
        host=host_data,
        invitee_email=booking.invitee_email,
        invitee_name=booking.invitee_name,
        invitee_phone=booking.invitee_phone,
        start_time=booking.start_time,
        end_time=booking.end_time,
        timezone=booking.timezone,
        status=booking.status,
        location=booking.location,
        meeting_link=booking.meeting_link,
        answers=booking.answers,
        cancellation_reason=booking.cancellation_reason,
        cancelled_by=booking.cancelled_by,
        cancelled_at=booking.cancelled_at,
        payment_status=booking.payment_status,
        payment_amount=booking.payment_amount,
        payment_currency=booking.payment_currency,
        calendar_event_id=booking.calendar_event_id,
        reminder_sent=booking.reminder_sent,
        created_at=booking.created_at,
        updated_at=booking.updated_at,
    )


@router.post("", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
async def create_booking(
    workspace_id: str,
    data: BookingCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a booking (admin/internal use)."""
    from aexy.services.booking.booking_service import BookingServiceError

    service = BookingService(db)

    try:
        booking = await service.create_booking(
            event_type_id=data.event_type_id,
            invitee_email=data.invitee_email,
            invitee_name=data.invitee_name,
            start_time=data.start_time,
            timezone=data.timezone,
            workspace_id=workspace_id,
            invitee_phone=data.invitee_phone,
            answers=data.answers,
            location=data.location,
        )

        await db.commit()
        await db.refresh(booking)

        return booking_to_response(booking)

    except BookingServiceError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("", response_model=BookingListResponse)
async def list_bookings(
    workspace_id: str,
    status_filter: BookingStatus | None = Query(default=None, alias="status"),
    event_type_id: str | None = Query(default=None),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    invitee_email: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List bookings with filters."""
    service = BookingService(db)

    bookings, total = await service.list_bookings(
        workspace_id=workspace_id,
        status=status_filter,
        event_type_id=event_type_id,
        start_date=start_date,
        end_date=end_date,
        invitee_email=invitee_email,
        limit=limit,
        offset=offset,
    )

    return BookingListResponse(
        bookings=[booking_to_response(b) for b in bookings],
        total=total,
    )


@router.get("/my", response_model=BookingListResponse)
async def list_my_bookings(
    workspace_id: str,
    status_filter: BookingStatus | None = Query(default=None, alias="status"),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List current user's bookings as host."""
    service = BookingService(db)

    bookings, total = await service.list_bookings(
        workspace_id=workspace_id,
        host_id=str(current_user.id),
        status=status_filter,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )

    return BookingListResponse(
        bookings=[booking_to_response(b) for b in bookings],
        total=total,
    )


@router.get("/upcoming", response_model=list[BookingResponse])
async def get_upcoming_bookings(
    workspace_id: str,
    limit: int = Query(default=10, ge=1, le=50),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get upcoming bookings for current user."""
    service = BookingService(db)

    bookings = await service.get_upcoming_bookings(
        host_id=str(current_user.id),
        limit=limit,
    )

    return [booking_to_response(b) for b in bookings]


@router.get("/stats")
async def get_booking_stats(
    workspace_id: str,
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get booking statistics."""
    service = BookingService(db)

    stats = await service.get_booking_stats(
        workspace_id=workspace_id,
        start_date=start_date,
        end_date=end_date,
    )

    return stats


@router.get("/{booking_id}", response_model=BookingResponse)
async def get_booking(
    workspace_id: str,
    booking_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific booking."""
    service = BookingService(db)

    booking = await service.get_booking(booking_id)

    if not booking or booking.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    return booking_to_response(booking)


@router.put("/{booking_id}/cancel", response_model=BookingResponse)
async def cancel_booking(
    workspace_id: str,
    booking_id: str,
    data: BookingCancelRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a booking."""
    from aexy.services.booking.booking_service import (
        BookingNotFoundError,
        InvalidBookingStateError,
    )

    service = BookingService(db)

    try:
        booking = await service.cancel_booking(
            booking_id=booking_id,
            reason=data.reason,
            cancelled_by="host",
        )

        await db.commit()
        await db.refresh(booking)

        return booking_to_response(booking)

    except BookingNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )
    except InvalidBookingStateError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.put("/{booking_id}/reschedule", response_model=BookingResponse)
async def reschedule_booking(
    workspace_id: str,
    booking_id: str,
    data: BookingRescheduleRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Reschedule a booking."""
    from aexy.services.booking.booking_service import (
        BookingNotFoundError,
        InvalidBookingStateError,
        BookingServiceError,
    )

    service = BookingService(db)

    try:
        booking = await service.reschedule_booking(
            booking_id=booking_id,
            new_start_time=data.new_start_time,
            timezone=data.timezone,
        )

        await db.commit()
        await db.refresh(booking)

        return booking_to_response(booking)

    except BookingNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )
    except InvalidBookingStateError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except BookingServiceError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.put("/{booking_id}/no-show", response_model=BookingResponse)
async def mark_no_show(
    workspace_id: str,
    booking_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Mark a booking as no-show."""
    from aexy.services.booking.booking_service import (
        BookingNotFoundError,
        InvalidBookingStateError,
    )

    service = BookingService(db)

    try:
        booking = await service.mark_no_show(booking_id)

        await db.commit()
        await db.refresh(booking)

        return booking_to_response(booking)

    except BookingNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )
    except InvalidBookingStateError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.put("/{booking_id}/complete", response_model=BookingResponse)
async def complete_booking(
    workspace_id: str,
    booking_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Mark a booking as completed."""
    from aexy.services.booking.booking_service import (
        BookingNotFoundError,
        InvalidBookingStateError,
    )

    service = BookingService(db)

    try:
        booking = await service.complete_booking(booking_id)

        await db.commit()
        await db.refresh(booking)

        return booking_to_response(booking)

    except BookingNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )
    except InvalidBookingStateError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
