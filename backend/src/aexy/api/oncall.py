"""On-call scheduling API endpoints."""

from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.oncall import (
    OnCallConfigCreate,
    OnCallConfigUpdate,
    OnCallConfigResponse,
    OnCallScheduleCreate,
    OnCallScheduleBulkCreate,
    OnCallScheduleUpdate,
    OnCallScheduleResponse,
    OnCallScheduleListResponse,
    CurrentOnCallResponse,
    SwapRequestCreate,
    SwapRequestResponse,
    SwapRequestDecline,
    OverrideCreate,
    DeveloperBrief,
)
from aexy.services.oncall_service import (
    OnCallService,
    OnCallServiceError,
    OnCallNotEnabledError,
    ScheduleConflictError,
    SwapNotAllowedError,
)
from aexy.services.workspace_service import WorkspaceService
from aexy.services.google_calendar_service import GoogleCalendarService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/teams/{team_id}/oncall",
    tags=["On-Call"],
)


# =============================================================================
# Helper Functions
# =============================================================================

async def verify_workspace_access(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "viewer",
) -> WorkspaceService:
    """Verify the user has access to the workspace."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(workspace_id, str(current_user.id), required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{required_role.capitalize()} permission required",
        )

    return workspace_service


def developer_to_brief(developer: Developer | None) -> DeveloperBrief | None:
    """Convert Developer to DeveloperBrief."""
    if not developer:
        return None
    return DeveloperBrief(
        id=str(developer.id),
        name=developer.name,
        email=developer.email,
        avatar_url=developer.avatar_url,
    )


def schedule_to_response(schedule) -> OnCallScheduleResponse:
    """Convert OnCallSchedule to response schema."""
    return OnCallScheduleResponse(
        id=str(schedule.id),
        config_id=str(schedule.config_id),
        developer_id=str(schedule.developer_id),
        developer=developer_to_brief(schedule.developer),
        start_time=schedule.start_time,
        end_time=schedule.end_time,
        is_override=schedule.is_override,
        original_developer_id=str(schedule.original_developer_id) if schedule.original_developer_id else None,
        original_developer=developer_to_brief(schedule.original_developer) if schedule.original_developer else None,
        override_reason=schedule.override_reason,
        google_event_id=schedule.google_event_id,
        created_by_id=str(schedule.created_by_id) if schedule.created_by_id else None,
        created_at=schedule.created_at,
        updated_at=schedule.updated_at,
    )


def swap_to_response(swap) -> SwapRequestResponse:
    """Convert OnCallSwapRequest to response schema."""
    return SwapRequestResponse(
        id=str(swap.id),
        schedule_id=str(swap.schedule_id),
        schedule=schedule_to_response(swap.schedule) if swap.schedule else None,
        requester_id=str(swap.requester_id),
        requester=developer_to_brief(swap.requester),
        target_id=str(swap.target_id),
        target=developer_to_brief(swap.target),
        status=swap.status,
        message=swap.message,
        responded_at=swap.responded_at,
        response_message=swap.response_message,
        created_at=swap.created_at,
    )


# =============================================================================
# Config Endpoints
# =============================================================================

@router.get("", response_model=OnCallConfigResponse | None)
async def get_oncall_config(
    workspace_id: str,
    team_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get on-call configuration for a team."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = OnCallService(db)
    config = await service.get_config(team_id)

    if not config:
        return None

    # Get current on-call
    current = await service.get_current_oncall(team_id)

    return OnCallConfigResponse(
        id=str(config.id),
        team_id=str(config.team_id),
        is_enabled=config.is_enabled,
        timezone=config.timezone,
        default_shift_duration_hours=config.default_shift_duration_hours,
        google_calendar_enabled=config.google_calendar_enabled,
        google_calendar_id=config.google_calendar_id,
        slack_channel_id=config.slack_channel_id,
        notify_before_shift_minutes=config.notify_before_shift_minutes,
        notify_on_shift_change=config.notify_on_shift_change,
        created_at=config.created_at,
        updated_at=config.updated_at,
        current_oncall=schedule_to_response(current) if current else None,
    )


@router.post("/enable", response_model=OnCallConfigResponse, status_code=status.HTTP_201_CREATED)
async def enable_oncall(
    workspace_id: str,
    team_id: str,
    data: OnCallConfigCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Enable on-call for a team."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = OnCallService(db)
    config = await service.enable_oncall(team_id, data)
    await db.commit()

    return OnCallConfigResponse(
        id=str(config.id),
        team_id=str(config.team_id),
        is_enabled=config.is_enabled,
        timezone=config.timezone,
        default_shift_duration_hours=config.default_shift_duration_hours,
        google_calendar_enabled=config.google_calendar_enabled,
        google_calendar_id=config.google_calendar_id,
        slack_channel_id=config.slack_channel_id,
        notify_before_shift_minutes=config.notify_before_shift_minutes,
        notify_on_shift_change=config.notify_on_shift_change,
        created_at=config.created_at,
        updated_at=config.updated_at,
        current_oncall=None,
    )


@router.post("/disable", status_code=status.HTTP_204_NO_CONTENT)
async def disable_oncall(
    workspace_id: str,
    team_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Disable on-call for a team."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = OnCallService(db)
    await service.disable_oncall(team_id)
    await db.commit()


@router.patch("/config", response_model=OnCallConfigResponse)
async def update_oncall_config(
    workspace_id: str,
    team_id: str,
    data: OnCallConfigUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update on-call configuration."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = OnCallService(db)
    config = await service.update_config(team_id, data)

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="On-call is not enabled for this team",
        )

    await db.commit()

    current = await service.get_current_oncall(team_id)

    return OnCallConfigResponse(
        id=str(config.id),
        team_id=str(config.team_id),
        is_enabled=config.is_enabled,
        timezone=config.timezone,
        default_shift_duration_hours=config.default_shift_duration_hours,
        google_calendar_enabled=config.google_calendar_enabled,
        google_calendar_id=config.google_calendar_id,
        slack_channel_id=config.slack_channel_id,
        notify_before_shift_minutes=config.notify_before_shift_minutes,
        notify_on_shift_change=config.notify_on_shift_change,
        created_at=config.created_at,
        updated_at=config.updated_at,
        current_oncall=schedule_to_response(current) if current else None,
    )


# =============================================================================
# Schedule Endpoints
# =============================================================================

@router.get("/schedules", response_model=OnCallScheduleListResponse)
async def list_schedules(
    workspace_id: str,
    team_id: str,
    start_date: datetime = Query(default_factory=lambda: datetime.now(timezone.utc)),
    end_date: datetime = Query(default_factory=lambda: datetime.now(timezone.utc) + timedelta(days=30)),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List on-call schedules for a team within a date range."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = OnCallService(db)
    schedules = await service.get_schedules(team_id, start_date, end_date)

    return OnCallScheduleListResponse(
        schedules=[schedule_to_response(s) for s in schedules],
        total=len(schedules),
        start_date=start_date,
        end_date=end_date,
    )


@router.post("/schedules", response_model=OnCallScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    workspace_id: str,
    team_id: str,
    data: OnCallScheduleCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new on-call schedule."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = OnCallService(db)

    try:
        schedule = await service.create_schedule(
            team_id=team_id,
            schedule=data,
            created_by_id=str(current_user.id),
        )
    except OnCallNotEnabledError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="On-call is not enabled for this team",
        )
    except ScheduleConflictError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )

    # Sync to Google Calendar if enabled
    calendar_service = GoogleCalendarService(db)
    await calendar_service.sync_schedule_to_calendar(schedule)

    await db.commit()
    return schedule_to_response(schedule)


@router.post("/schedules/bulk", response_model=list[OnCallScheduleResponse], status_code=status.HTTP_201_CREATED)
async def create_bulk_schedules(
    workspace_id: str,
    team_id: str,
    data: OnCallScheduleBulkCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create multiple on-call schedules at once."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = OnCallService(db)

    try:
        schedules = await service.create_bulk_schedules(
            team_id=team_id,
            schedules=data.schedules,
            created_by_id=str(current_user.id),
        )
    except OnCallNotEnabledError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="On-call is not enabled for this team",
        )

    # Sync to Google Calendar if enabled
    calendar_service = GoogleCalendarService(db)
    for schedule in schedules:
        await calendar_service.sync_schedule_to_calendar(schedule)

    await db.commit()
    return [schedule_to_response(s) for s in schedules]


@router.patch("/schedules/{schedule_id}", response_model=OnCallScheduleResponse)
async def update_schedule(
    workspace_id: str,
    team_id: str,
    schedule_id: str,
    data: OnCallScheduleUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update an on-call schedule."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = OnCallService(db)
    schedule = await service.update_schedule(
        schedule_id=schedule_id,
        developer_id=data.developer_id,
        start_time=data.start_time,
        end_time=data.end_time,
    )

    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found",
        )

    # Sync to Google Calendar if enabled
    calendar_service = GoogleCalendarService(db)
    await calendar_service.sync_schedule_to_calendar(schedule)

    await db.commit()
    return schedule_to_response(schedule)


@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    workspace_id: str,
    team_id: str,
    schedule_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete an on-call schedule."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = OnCallService(db)

    # Get schedule first to remove from calendar
    schedule = await service.get_schedule(schedule_id)
    if schedule:
        calendar_service = GoogleCalendarService(db)
        await calendar_service.remove_schedule_from_calendar(schedule)

    if not await service.delete_schedule(schedule_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found",
        )

    await db.commit()


# =============================================================================
# Current On-Call Endpoints
# =============================================================================

@router.get("/current", response_model=CurrentOnCallResponse)
async def get_current_oncall(
    workspace_id: str,
    team_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get the current on-call person for a team."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = OnCallService(db)
    current = await service.get_current_oncall(team_id)
    next_schedule = await service.get_next_oncall(team_id)

    return CurrentOnCallResponse(
        is_active=current is not None,
        schedule=schedule_to_response(current) if current else None,
        next_schedule=schedule_to_response(next_schedule) if next_schedule else None,
    )


# =============================================================================
# Swap Request Endpoints
# =============================================================================

@router.post("/schedules/{schedule_id}/swap-request", response_model=SwapRequestResponse, status_code=status.HTTP_201_CREATED)
async def request_swap(
    workspace_id: str,
    team_id: str,
    schedule_id: str,
    data: SwapRequestCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Request to swap a shift with another team member."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    service = OnCallService(db)

    try:
        swap = await service.request_swap(
            schedule_id=schedule_id,
            requester_id=str(current_user.id),
            target_id=data.target_id,
            message=data.message,
        )
    except SwapNotAllowedError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await db.commit()
    return swap_to_response(swap)


@router.get("/swap-requests", response_model=list[SwapRequestResponse])
async def list_swap_requests(
    workspace_id: str,
    team_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List pending swap requests for the current user."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    service = OnCallService(db)
    swaps = await service.get_pending_swaps_for_developer(
        developer_id=str(current_user.id),
        team_id=team_id,
    )

    return [swap_to_response(s) for s in swaps]


@router.post("/swap-requests/{swap_id}/accept", response_model=SwapRequestResponse)
async def accept_swap(
    workspace_id: str,
    team_id: str,
    swap_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Accept a swap request."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    service = OnCallService(db)

    try:
        swap = await service.accept_swap(
            swap_id=swap_id,
            responder_id=str(current_user.id),
        )
    except SwapNotAllowedError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Sync updated schedule to Google Calendar
    if swap.schedule:
        calendar_service = GoogleCalendarService(db)
        await calendar_service.sync_schedule_to_calendar(swap.schedule)

    await db.commit()
    return swap_to_response(swap)


@router.post("/swap-requests/{swap_id}/decline", response_model=SwapRequestResponse)
async def decline_swap(
    workspace_id: str,
    team_id: str,
    swap_id: str,
    data: SwapRequestDecline | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Decline a swap request."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    service = OnCallService(db)

    try:
        swap = await service.decline_swap(
            swap_id=swap_id,
            responder_id=str(current_user.id),
            response_message=data.response_message if data else None,
        )
    except SwapNotAllowedError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    await db.commit()
    return swap_to_response(swap)


# =============================================================================
# Override Endpoints
# =============================================================================

@router.post("/schedules/{schedule_id}/override", response_model=OnCallScheduleResponse)
async def create_override(
    workspace_id: str,
    team_id: str,
    schedule_id: str,
    data: OverrideCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create an override - directly assign a new developer to a shift."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = OnCallService(db)

    try:
        schedule = await service.create_override(
            schedule_id=schedule_id,
            new_developer_id=data.new_developer_id,
            reason=data.reason,
            created_by_id=str(current_user.id),
        )
    except OnCallServiceError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    # Sync to Google Calendar if enabled
    calendar_service = GoogleCalendarService(db)
    await calendar_service.sync_schedule_to_calendar(schedule)

    await db.commit()
    return schedule_to_response(schedule)
