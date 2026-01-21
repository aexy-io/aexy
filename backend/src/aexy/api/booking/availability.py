"""Availability API endpoints for booking module."""

from datetime import date, time
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.booking import (
    AvailabilitySlotCreate,
    AvailabilitySlotResponse,
    AvailabilityScheduleResponse,
    AvailabilityOverrideCreate,
    AvailabilityOverrideResponse,
)
from aexy.schemas.booking.availability import DayAvailability, BulkAvailabilityUpdate
from aexy.services.booking import AvailabilityService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/booking/availability",
    tags=["Booking - Availability"],
)

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def slot_to_response(slot) -> AvailabilitySlotResponse:
    """Convert UserAvailability model to response schema."""
    return AvailabilitySlotResponse(
        id=slot.id,
        user_id=slot.user_id,
        workspace_id=slot.workspace_id,
        day_of_week=slot.day_of_week,
        start_time=slot.start_time,
        end_time=slot.end_time,
        timezone=slot.timezone,
        is_active=slot.is_active,
        created_at=slot.created_at,
        updated_at=slot.updated_at,
    )


def override_to_response(override) -> AvailabilityOverrideResponse:
    """Convert AvailabilityOverride model to response schema."""
    return AvailabilityOverrideResponse(
        id=override.id,
        user_id=override.user_id,
        date=override.date,
        is_available=override.is_available,
        start_time=override.start_time,
        end_time=override.end_time,
        reason=override.reason,
        notes=override.notes,
        created_at=override.created_at,
        updated_at=override.updated_at,
    )


@router.get("", response_model=AvailabilityScheduleResponse)
async def get_availability(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's availability schedule."""
    service = AvailabilityService(db)

    slots = await service.get_user_availability(
        user_id=str(current_user.id),
        workspace_id=workspace_id,
    )

    # Group by day
    days_map = {i: [] for i in range(7)}
    timezone = "UTC"

    for slot in slots:
        days_map[slot.day_of_week].append(slot_to_response(slot))
        timezone = slot.timezone  # Use the most recent timezone

    schedule = []
    for day_num in range(7):
        day_slots = days_map[day_num]
        schedule.append(
            DayAvailability(
                day_of_week=day_num,
                day_name=DAY_NAMES[day_num],
                is_available=len(day_slots) > 0,
                slots=day_slots,
            )
        )

    return AvailabilityScheduleResponse(
        user_id=str(current_user.id),
        workspace_id=workspace_id,
        timezone=timezone,
        schedule=schedule,
    )


@router.put("", response_model=AvailabilityScheduleResponse)
async def update_availability(
    workspace_id: str,
    data: BulkAvailabilityUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update availability schedule (bulk)."""
    service = AvailabilityService(db)

    slots_data = [
        {
            "day_of_week": slot.day_of_week,
            "start_time": slot.start_time,
            "end_time": slot.end_time,
        }
        for slot in data.slots
    ]

    await service.bulk_update_availability(
        user_id=str(current_user.id),
        workspace_id=workspace_id,
        slots=slots_data,
        timezone=data.timezone,
    )

    await db.commit()

    # Return updated schedule
    slots = await service.get_user_availability(
        user_id=str(current_user.id),
        workspace_id=workspace_id,
    )

    days_map = {i: [] for i in range(7)}

    for slot in slots:
        days_map[slot.day_of_week].append(slot_to_response(slot))

    schedule = []
    for day_num in range(7):
        day_slots = days_map[day_num]
        schedule.append(
            DayAvailability(
                day_of_week=day_num,
                day_name=DAY_NAMES[day_num],
                is_available=len(day_slots) > 0,
                slots=day_slots,
            )
        )

    return AvailabilityScheduleResponse(
        user_id=str(current_user.id),
        workspace_id=workspace_id,
        timezone=data.timezone,
        schedule=schedule,
    )


@router.post("/slots", response_model=AvailabilitySlotResponse, status_code=status.HTTP_201_CREATED)
async def add_availability_slot(
    workspace_id: str,
    data: AvailabilitySlotCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a single availability slot."""
    from aexy.services.booking.availability_service import InvalidTimeRangeError

    service = AvailabilityService(db)

    try:
        slot = await service.set_availability(
            user_id=str(current_user.id),
            workspace_id=workspace_id,
            day_of_week=data.day_of_week,
            start_time=data.start_time,
            end_time=data.end_time,
            timezone=data.timezone,
        )

        await db.commit()
        await db.refresh(slot)

        return slot_to_response(slot)

    except InvalidTimeRangeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/slots/{slot_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_availability_slot(
    workspace_id: str,
    slot_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete an availability slot."""
    service = AvailabilityService(db)

    deleted = await service.delete_availability_slot(slot_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Availability slot not found",
        )

    await db.commit()


# Overrides


@router.get("/overrides", response_model=list[AvailabilityOverrideResponse])
async def list_overrides(
    workspace_id: str,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List availability overrides."""
    service = AvailabilityService(db)

    overrides = await service.get_overrides(
        user_id=str(current_user.id),
        start_date=start_date,
        end_date=end_date,
    )

    return [override_to_response(o) for o in overrides]


@router.post("/overrides", response_model=AvailabilityOverrideResponse, status_code=status.HTTP_201_CREATED)
async def create_override(
    workspace_id: str,
    data: AvailabilityOverrideCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create an availability override (vacation, special hours, etc.)."""
    from aexy.services.booking.availability_service import InvalidTimeRangeError

    service = AvailabilityService(db)

    try:
        override = await service.create_override(
            user_id=str(current_user.id),
            override_date=data.date,
            is_available=data.is_available,
            start_time=data.start_time,
            end_time=data.end_time,
            reason=data.reason,
            notes=data.notes,
        )

        await db.commit()
        await db.refresh(override)

        return override_to_response(override)

    except InvalidTimeRangeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/overrides/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_override(
    workspace_id: str,
    override_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete an availability override."""
    service = AvailabilityService(db)

    deleted = await service.delete_override(override_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Override not found",
        )

    await db.commit()
