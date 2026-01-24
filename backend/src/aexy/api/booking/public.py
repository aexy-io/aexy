"""Public booking API endpoints for booking module.

These endpoints are accessible without authentication and are used
for the public booking pages.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.models.booking import EventType, Booking, BookingStatus
from aexy.models.workspace import Workspace
from aexy.models.developer import Developer
from aexy.models.team import Team, TeamMember
from aexy.schemas.booking import (
    EventTypePublicResponse,
    BookingPublicCreate,
    BookingConfirmationResponse,
    BookingCancelRequest,
    BookingRescheduleRequest,
    AvailableSlotsResponse,
    TimeSlot,
)
from aexy.services.booking import BookingService, AvailabilityService, CalendarSyncService
from aexy.services.booking.booking_notification_service import BookingNotificationService
from aexy.services.email_service import EmailService

router = APIRouter(
    prefix="/public/book",
    tags=["Booking - Public"],
)


@router.get("/{workspace_slug}")
async def get_workspace_booking_page(
    workspace_slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Get workspace info and available event types for booking."""
    # Get workspace
    stmt = select(Workspace).where(Workspace.slug == workspace_slug)
    result = await db.execute(stmt)
    workspace = result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    # Get active event types
    event_stmt = (
        select(EventType)
        .where(
            and_(
                EventType.workspace_id == workspace.id,
                EventType.is_active == True,
            )
        )
        .order_by(EventType.name)
    )
    event_result = await db.execute(event_stmt)
    event_types = event_result.scalars().all()

    return {
        "workspace": {
            "id": workspace.id,
            "name": workspace.name,
            "slug": workspace.slug,
        },
        "event_types": [
            {
                "id": et.id,
                "name": et.name,
                "slug": et.slug,
                "description": et.description,
                "duration_minutes": et.duration_minutes,
                "color": et.color,
            }
            for et in event_types
        ],
    }


@router.get("/{workspace_slug}/teams")
async def get_workspace_teams(
    workspace_slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Get all active teams in a workspace for public booking."""
    # Get workspace
    stmt = select(Workspace).where(Workspace.slug == workspace_slug)
    result = await db.execute(stmt)
    workspace = result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    # Get active teams
    team_stmt = (
        select(Team)
        .where(
            and_(
                Team.workspace_id == workspace.id,
                Team.is_active == True,
            )
        )
        .order_by(Team.name)
    )
    team_result = await db.execute(team_stmt)
    teams = team_result.scalars().all()

    return {
        "teams": [
            {
                "id": t.id,
                "name": t.name,
                "slug": t.slug,
                "description": t.description,
                "members": [
                    {
                        "id": m.developer.id,
                        "name": m.developer.name,
                        "email": m.developer.email,
                        "avatar_url": m.developer.avatar_url,
                    }
                    for m in t.members
                    if m.developer
                ],
            }
            for t in teams
        ]
    }


@router.get("/{workspace_slug}/team/{team_id}")
async def get_team_info(
    workspace_slug: str,
    team_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get team info for public booking page."""
    # Get workspace
    workspace_stmt = select(Workspace).where(Workspace.slug == workspace_slug)
    workspace_result = await db.execute(workspace_stmt)
    workspace = workspace_result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    # Get team - try by ID first, then by slug
    team_stmt = select(Team).where(
        and_(
            Team.workspace_id == workspace.id,
            Team.is_active == True,
        )
    )

    # Try to find by ID or slug
    from sqlalchemy import or_
    team_stmt = team_stmt.where(
        or_(
            Team.id == team_id,
            Team.slug == team_id,
        )
    )
    team_result = await db.execute(team_stmt)
    team = team_result.scalar_one_or_none()

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    return {
        "id": team.id,
        "name": team.name,
        "slug": team.slug,
        "description": team.description,
        "members": [
            {
                "id": m.developer.id,
                "name": m.developer.name,
                "email": m.developer.email,
                "avatar_url": m.developer.avatar_url,
            }
            for m in team.members
            if m.developer
        ],
    }


@router.get("/{workspace_slug}/{event_slug}", response_model=EventTypePublicResponse)
async def get_event_type_public(
    workspace_slug: str,
    event_slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Get event type details for public booking page."""
    # Get workspace
    workspace_stmt = select(Workspace).where(Workspace.slug == workspace_slug)
    workspace_result = await db.execute(workspace_stmt)
    workspace = workspace_result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    # Get event type
    event_stmt = select(EventType).where(
        and_(
            EventType.workspace_id == workspace.id,
            EventType.slug == event_slug,
            EventType.is_active == True,
        )
    )
    event_result = await db.execute(event_stmt)
    event_type = event_result.scalar_one_or_none()

    if not event_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event type not found",
        )

    # Get host info
    host_stmt = select(Developer).where(Developer.id == event_type.owner_id)
    host_result = await db.execute(host_stmt)
    host = host_result.scalar_one_or_none()

    return EventTypePublicResponse(
        id=event_type.id,
        name=event_type.name,
        slug=event_type.slug,
        description=event_type.description,
        duration_minutes=event_type.duration_minutes,
        location_type=event_type.location_type,
        color=event_type.color,
        questions=event_type.questions,
        payment_enabled=event_type.payment_enabled,
        payment_amount=event_type.payment_amount,
        payment_currency=event_type.payment_currency,
        host_name=host.name if host else None,
        host_avatar_url=host.avatar_url if host else None,
    )


@router.get("/{workspace_slug}/{event_slug}/slots", response_model=AvailableSlotsResponse)
async def get_available_slots(
    workspace_slug: str,
    event_slug: str,
    target_date: date = Query(..., alias="date"),
    timezone: str = Query(default="UTC"),
    team_id: str | None = Query(default=None),
    member_ids: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Get available time slots for a specific date.

    Optionally filter by team or specific members for team bookings.
    """
    # Get workspace
    workspace_stmt = select(Workspace).where(Workspace.slug == workspace_slug)
    workspace_result = await db.execute(workspace_stmt)
    workspace = workspace_result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    # Get event type
    event_stmt = select(EventType).where(
        and_(
            EventType.workspace_id == workspace.id,
            EventType.slug == event_slug,
            EventType.is_active == True,
        )
    )
    event_result = await db.execute(event_stmt)
    event_type = event_result.scalar_one_or_none()

    if not event_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event type not found",
        )

    # Parse member_ids if provided
    user_ids: list[str] | None = None
    if member_ids:
        user_ids = [uid.strip() for uid in member_ids.split(",") if uid.strip()]

    # If team_id is provided, get team members
    if team_id and not user_ids:
        from sqlalchemy import or_
        team_stmt = select(Team).where(
            and_(
                Team.workspace_id == workspace.id,
                Team.is_active == True,
                or_(Team.id == team_id, Team.slug == team_id),
            )
        )
        team_result = await db.execute(team_stmt)
        team = team_result.scalar_one_or_none()

        if team:
            user_ids = [m.developer_id for m in team.members]

    # Get available slots (including calendar busy times check)
    availability_service = AvailabilityService(db)
    calendar_service = CalendarSyncService(db)

    slots = await availability_service.get_available_slots(
        event_type_id=event_type.id,
        target_date=target_date,
        timezone=timezone,
        calendar_service=calendar_service,
        user_ids=user_ids,
    )

    return AvailableSlotsResponse(
        event_type_id=event_type.id,
        date=target_date,
        timezone=timezone,
        slots=[
            TimeSlot(
                start_time=s["start_time"],
                end_time=s["end_time"],
                available=s["available"],
            )
            for s in slots
        ],
    )


@router.post("/{workspace_slug}/{event_slug}/book", response_model=BookingConfirmationResponse)
async def create_public_booking(
    workspace_slug: str,
    event_slug: str,
    data: BookingPublicCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a booking from the public booking page."""
    from aexy.services.booking.booking_service import BookingServiceError

    # Get workspace
    workspace_stmt = select(Workspace).where(Workspace.slug == workspace_slug)
    workspace_result = await db.execute(workspace_stmt)
    workspace = workspace_result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    # Get event type
    event_stmt = select(EventType).where(
        and_(
            EventType.workspace_id == workspace.id,
            EventType.slug == event_slug,
            EventType.is_active == True,
        )
    )
    event_result = await db.execute(event_stmt)
    event_type = event_result.scalar_one_or_none()

    if not event_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event type not found",
        )

    # Resolve team members if team_id is provided
    team_member_ids: list[str] | None = None
    if data.team_id:
        from sqlalchemy import or_
        team_stmt = select(Team).where(
            and_(
                Team.workspace_id == workspace.id,
                Team.is_active == True,
                or_(Team.id == data.team_id, Team.slug == data.team_id),
            )
        )
        team_result = await db.execute(team_stmt)
        team = team_result.scalar_one_or_none()

        if team:
            # Use specific member_ids if provided, otherwise use all team members
            if data.member_ids:
                # Validate that all member_ids are part of the team
                valid_member_ids = {m.developer_id for m in team.members}
                team_member_ids = [uid for uid in data.member_ids if uid in valid_member_ids]
            else:
                team_member_ids = [m.developer_id for m in team.members]

    # Verify slot availability (with team filtering if applicable)
    availability_service = AvailabilityService(db)
    is_available = await availability_service.check_slot_availability(
        event_type_id=event_type.id,
        start_time=data.start_time,
        timezone=data.timezone,
        user_ids=team_member_ids,
    )

    if not is_available:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Selected time slot is no longer available",
        )

    # Create booking
    booking_service = BookingService(db)

    try:
        booking = await booking_service.create_booking(
            event_type_id=event_type.id,
            invitee_email=data.email,
            invitee_name=data.name,
            start_time=data.start_time,
            timezone=data.timezone,
            workspace_id=workspace.id,
            invitee_phone=data.phone,
            answers=data.answers,
            payment_required=event_type.payment_enabled,
            payment_amount=event_type.payment_amount,
            payment_currency=event_type.payment_currency,
            team_member_ids=team_member_ids,
        )

        await db.commit()
        await db.refresh(booking)

        # Create calendar events for host and team attendees
        # This also generates meeting links (Google Meet / Microsoft Teams)
        calendar_service = CalendarSyncService(db)
        try:
            if event_type.is_team_event and booking.attendees:
                # Create events for all team members
                attendee_ids = [a.user_id for a in booking.attendees]
                await calendar_service.create_calendar_events_for_team(
                    booking, attendee_ids
                )
            else:
                # Create event for host only
                await calendar_service.create_calendar_event(booking)

            # Commit and refresh to get the meeting link that was set by calendar service
            await db.commit()
            await db.refresh(booking)
        except Exception as e:
            # Log but don't fail the booking if calendar creation fails
            import logging
            logging.warning(f"Failed to create calendar events for booking {booking.id}: {e}")

        # Send confirmation emails to host and invitee
        try:
            notification_service = BookingNotificationService(db)
            email_service = EmailService()
            await notification_service.send_confirmation(booking, email_service=email_service)
        except Exception as e:
            # Log but don't fail the booking if email fails
            import logging
            logging.warning(f"Failed to send confirmation email for booking {booking.id}: {e}")

        # Get host info
        host_stmt = select(Developer).where(Developer.id == booking.host_id)
        host_result = await db.execute(host_stmt)
        host = host_result.scalar_one_or_none()

        return BookingConfirmationResponse(
            id=booking.id,
            event_name=event_type.name,
            host_name=host.name if host else None,
            host_email=host.email if host else None,
            invitee_name=booking.invitee_name,
            invitee_email=booking.invitee_email,
            start_time=booking.start_time,
            end_time=booking.end_time,
            timezone=booking.timezone,
            status=booking.status,
            location=booking.location,
            meeting_link=booking.meeting_link,
            confirmation_message=event_type.confirmation_message,
            can_cancel=True,
            can_reschedule=True,
            cancel_token=booking.action_token,
        )

    except BookingServiceError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/booking/{booking_id}", response_model=BookingConfirmationResponse)
async def get_booking_confirmation(
    booking_id: str,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Get booking confirmation details."""
    booking_service = BookingService(db)

    booking = await booking_service.get_booking(booking_id)

    if not booking or booking.action_token != token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    # Get event type
    event_stmt = select(EventType).where(EventType.id == booking.event_type_id)
    event_result = await db.execute(event_stmt)
    event_type = event_result.scalar_one_or_none()

    # Get host
    host_stmt = select(Developer).where(Developer.id == booking.host_id)
    host_result = await db.execute(host_stmt)
    host = host_result.scalar_one_or_none()

    # Check if can cancel/reschedule
    now = datetime.now(ZoneInfo("UTC"))
    can_modify = booking.status in [
        BookingStatus.PENDING.value,
        BookingStatus.CONFIRMED.value,
    ] and booking.start_time > now

    return BookingConfirmationResponse(
        id=booking.id,
        event_name=event_type.name if event_type else "Meeting",
        host_name=host.name if host else None,
        host_email=host.email if host else None,
        invitee_name=booking.invitee_name,
        invitee_email=booking.invitee_email,
        start_time=booking.start_time,
        end_time=booking.end_time,
        timezone=booking.timezone,
        status=booking.status,
        location=booking.location,
        meeting_link=booking.meeting_link,
        confirmation_message=event_type.confirmation_message if event_type else None,
        can_cancel=can_modify,
        can_reschedule=can_modify,
        cancel_token=booking.action_token,
    )


@router.post("/booking/{booking_id}/cancel", response_model=BookingConfirmationResponse)
async def cancel_booking_public(
    booking_id: str,
    token: str = Query(...),
    data: BookingCancelRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Cancel a booking (invitee action)."""
    from aexy.services.booking.booking_service import (
        BookingNotFoundError,
        InvalidBookingStateError,
    )

    booking_service = BookingService(db)

    booking = await booking_service.get_booking(booking_id)

    if not booking or booking.action_token != token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    try:
        booking = await booking_service.cancel_booking(
            booking_id=booking_id,
            reason=data.reason if data else None,
            cancelled_by="invitee",
        )

        await db.commit()
        await db.refresh(booking)

        # Get event type
        event_stmt = select(EventType).where(EventType.id == booking.event_type_id)
        event_result = await db.execute(event_stmt)
        event_type = event_result.scalar_one_or_none()

        # Get host
        host_stmt = select(Developer).where(Developer.id == booking.host_id)
        host_result = await db.execute(host_stmt)
        host = host_result.scalar_one_or_none()

        return BookingConfirmationResponse(
            id=booking.id,
            event_name=event_type.name if event_type else "Meeting",
            host_name=host.name if host else None,
            host_email=host.email if host else None,
            invitee_name=booking.invitee_name,
            invitee_email=booking.invitee_email,
            start_time=booking.start_time,
            end_time=booking.end_time,
            timezone=booking.timezone,
            status=booking.status,
            location=booking.location,
            meeting_link=booking.meeting_link,
            confirmation_message=None,
            can_cancel=False,
            can_reschedule=False,
            cancel_token=booking.action_token,
        )

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


@router.post("/booking/{booking_id}/reschedule", response_model=BookingConfirmationResponse)
async def reschedule_booking_public(
    booking_id: str,
    data: BookingRescheduleRequest,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Reschedule a booking (invitee action)."""
    from aexy.services.booking.booking_service import (
        BookingNotFoundError,
        InvalidBookingStateError,
        BookingServiceError,
    )

    booking_service = BookingService(db)
    availability_service = AvailabilityService(db)

    booking = await booking_service.get_booking(booking_id)

    if not booking or booking.action_token != token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found",
        )

    # Verify new slot availability
    is_available = await availability_service.check_slot_availability(
        event_type_id=booking.event_type_id,
        start_time=data.new_start_time,
        timezone=data.timezone,
    )

    if not is_available:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Selected time slot is not available",
        )

    try:
        booking = await booking_service.reschedule_booking(
            booking_id=booking_id,
            new_start_time=data.new_start_time,
            timezone=data.timezone,
        )

        await db.commit()
        await db.refresh(booking)

        # Get event type
        event_stmt = select(EventType).where(EventType.id == booking.event_type_id)
        event_result = await db.execute(event_stmt)
        event_type = event_result.scalar_one_or_none()

        # Get host
        host_stmt = select(Developer).where(Developer.id == booking.host_id)
        host_result = await db.execute(host_stmt)
        host = host_result.scalar_one_or_none()

        return BookingConfirmationResponse(
            id=booking.id,
            event_name=event_type.name if event_type else "Meeting",
            host_name=host.name if host else None,
            host_email=host.email if host else None,
            invitee_name=booking.invitee_name,
            invitee_email=booking.invitee_email,
            start_time=booking.start_time,
            end_time=booking.end_time,
            timezone=booking.timezone,
            status=booking.status,
            location=booking.location,
            meeting_link=booking.meeting_link,
            confirmation_message=event_type.confirmation_message if event_type else None,
            can_cancel=True,
            can_reschedule=True,
            cancel_token=booking.action_token,
        )

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
