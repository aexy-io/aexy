"""Event types API endpoints for booking module."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.booking import (
    EventTypeCreate,
    EventTypeUpdate,
    EventTypeResponse,
    EventTypeListResponse,
    TeamEventMemberCreate,
    TeamEventMemberResponse,
    TeamEventMembersUpdate,
)
from aexy.schemas.booking.team import TeamEventMembersResponse
from aexy.services.booking import EventTypeService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/booking/event-types",
    tags=["Booking - Event Types"],
)


def event_type_to_response(event_type) -> EventTypeResponse:
    """Convert EventType model to response schema."""
    owner_data = None
    if event_type.owner:
        owner_data = {
            "id": event_type.owner.id,
            "name": event_type.owner.name,
            "email": event_type.owner.email,
            "avatar_url": event_type.owner.avatar_url,
        }

    return EventTypeResponse(
        id=event_type.id,
        workspace_id=event_type.workspace_id,
        owner_id=event_type.owner_id,
        owner=owner_data,
        name=event_type.name,
        slug=event_type.slug,
        description=event_type.description,
        duration_minutes=event_type.duration_minutes,
        location_type=event_type.location_type,
        custom_location=event_type.custom_location,
        color=event_type.color,
        is_active=event_type.is_active,
        is_team_event=event_type.is_team_event,
        buffer_before=event_type.buffer_before,
        buffer_after=event_type.buffer_after,
        min_notice_hours=event_type.min_notice_hours,
        max_future_days=event_type.max_future_days,
        questions=event_type.questions,
        payment_enabled=event_type.payment_enabled,
        payment_amount=event_type.payment_amount,
        payment_currency=event_type.payment_currency,
        confirmation_message=event_type.confirmation_message,
        created_at=event_type.created_at,
        updated_at=event_type.updated_at,
    )


@router.post("", response_model=EventTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_event_type(
    workspace_id: str,
    data: EventTypeCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new event type."""
    from aexy.services.booking.event_type_service import SlugAlreadyExistsError

    service = EventTypeService(db)

    try:
        event_type = await service.create_event_type(
            workspace_id=workspace_id,
            owner_id=str(current_user.id),
            name=data.name,
            slug=data.slug,
            description=data.description,
            duration_minutes=data.duration_minutes,
            location_type=data.location_type.value,
            custom_location=data.custom_location,
            color=data.color,
            is_team_event=data.is_team_event,
            buffer_before=data.buffer_before,
            buffer_after=data.buffer_after,
            min_notice_hours=data.min_notice_hours,
            max_future_days=data.max_future_days,
            questions=[q.model_dump() for q in data.questions],
            payment_enabled=data.payment_enabled,
            payment_amount=data.payment_amount,
            payment_currency=data.payment_currency,
            confirmation_message=data.confirmation_message,
        )

        await db.commit()
        await db.refresh(event_type)

        return event_type_to_response(event_type)

    except SlugAlreadyExistsError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )


@router.get("", response_model=EventTypeListResponse)
async def list_event_types(
    workspace_id: str,
    is_active: bool | None = None,
    is_team_event: bool | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List event types in workspace."""
    service = EventTypeService(db)

    event_types = await service.list_event_types(
        workspace_id=workspace_id,
        is_active=is_active,
        is_team_event=is_team_event,
    )

    return EventTypeListResponse(
        event_types=[event_type_to_response(et) for et in event_types],
        total=len(event_types),
    )


@router.get("/my", response_model=EventTypeListResponse)
async def list_my_event_types(
    workspace_id: str,
    is_active: bool | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List current user's event types."""
    service = EventTypeService(db)

    event_types = await service.list_event_types(
        workspace_id=workspace_id,
        owner_id=str(current_user.id),
        is_active=is_active,
    )

    return EventTypeListResponse(
        event_types=[event_type_to_response(et) for et in event_types],
        total=len(event_types),
    )


@router.get("/{event_type_id}", response_model=EventTypeResponse)
async def get_event_type(
    workspace_id: str,
    event_type_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific event type."""
    service = EventTypeService(db)

    event_type = await service.get_event_type(event_type_id)

    if not event_type or event_type.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event type not found",
        )

    return event_type_to_response(event_type)


@router.patch("/{event_type_id}", response_model=EventTypeResponse)
async def update_event_type(
    workspace_id: str,
    event_type_id: str,
    data: EventTypeUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update an event type."""
    from aexy.services.booking.event_type_service import SlugAlreadyExistsError

    service = EventTypeService(db)

    event_type = await service.get_event_type(event_type_id)

    if not event_type or event_type.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event type not found",
        )

    # Check ownership
    if event_type.owner_id != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own event types",
        )

    update_data = data.model_dump(exclude_unset=True)

    # Convert location_type enum if present
    if "location_type" in update_data and update_data["location_type"]:
        update_data["location_type"] = update_data["location_type"].value

    # Convert questions if present
    if "questions" in update_data and update_data["questions"]:
        update_data["questions"] = [q.model_dump() for q in data.questions]

    try:
        event_type = await service.update_event_type(event_type_id, **update_data)
        await db.commit()
        await db.refresh(event_type)

        return event_type_to_response(event_type)

    except SlugAlreadyExistsError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )


@router.delete("/{event_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event_type(
    workspace_id: str,
    event_type_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete an event type."""
    service = EventTypeService(db)

    event_type = await service.get_event_type(event_type_id)

    if not event_type or event_type.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event type not found",
        )

    if event_type.owner_id != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own event types",
        )

    await service.delete_event_type(event_type_id)
    await db.commit()


@router.post("/{event_type_id}/duplicate", response_model=EventTypeResponse)
async def duplicate_event_type(
    workspace_id: str,
    event_type_id: str,
    new_name: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Duplicate an event type."""
    service = EventTypeService(db)

    event_type = await service.get_event_type(event_type_id)

    if not event_type or event_type.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event type not found",
        )

    duplicate = await service.duplicate_event_type(event_type_id, new_name)

    if not duplicate:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to duplicate event type",
        )

    await db.commit()
    await db.refresh(duplicate)

    return event_type_to_response(duplicate)


# Team event member endpoints


@router.get("/{event_type_id}/members", response_model=TeamEventMembersResponse)
async def get_team_members(
    workspace_id: str,
    event_type_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get team members for an event type."""
    service = EventTypeService(db)

    event_type = await service.get_event_type(event_type_id)

    if not event_type or event_type.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event type not found",
        )

    members = await service.get_team_members(event_type_id)

    member_responses = []
    for member in members:
        user_data = None
        if member.user:
            user_data = {
                "id": member.user.id,
                "name": member.user.name,
                "email": member.user.email,
                "avatar_url": member.user.avatar_url,
            }

        member_responses.append(
            TeamEventMemberResponse(
                id=member.id,
                event_type_id=member.event_type_id,
                user_id=member.user_id,
                user=user_data,
                assignment_type=member.assignment_type,
                priority=member.priority,
                is_active=member.is_active,
                last_assigned_at=member.last_assigned_at,
                assignment_count=member.assignment_count,
                created_at=member.created_at,
                updated_at=member.updated_at,
            )
        )

    return TeamEventMembersResponse(
        event_type_id=event_type_id,
        members=member_responses,
        total=len(member_responses),
    )


@router.put("/{event_type_id}/members", response_model=TeamEventMembersResponse)
async def update_team_members(
    workspace_id: str,
    event_type_id: str,
    data: TeamEventMembersUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update team members for an event type."""
    service = EventTypeService(db)

    event_type = await service.get_event_type(event_type_id)

    if not event_type or event_type.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event type not found",
        )

    if event_type.owner_id != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage members of your own event types",
        )

    members = await service.update_team_members(
        event_type_id,
        [
            {
                "user_id": m.user_id,
                "assignment_type": m.assignment_type.value,
                "priority": m.priority,
            }
            for m in data.members
        ],
    )

    await db.commit()

    # Refresh and build response
    members = await service.get_team_members(event_type_id)

    member_responses = []
    for member in members:
        user_data = None
        if member.user:
            user_data = {
                "id": member.user.id,
                "name": member.user.name,
                "email": member.user.email,
                "avatar_url": member.user.avatar_url,
            }

        member_responses.append(
            TeamEventMemberResponse(
                id=member.id,
                event_type_id=member.event_type_id,
                user_id=member.user_id,
                user=user_data,
                assignment_type=member.assignment_type,
                priority=member.priority,
                is_active=member.is_active,
                last_assigned_at=member.last_assigned_at,
                assignment_count=member.assignment_count,
                created_at=member.created_at,
                updated_at=member.updated_at,
            )
        )

    return TeamEventMembersResponse(
        event_type_id=event_type_id,
        members=member_responses,
        total=len(member_responses),
    )
