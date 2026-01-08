"""Epic API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.epic import (
    EpicCreate,
    EpicUpdate,
    EpicResponse,
    EpicListResponse,
    EpicDetailResponse,
    EpicAddTasksRequest,
    EpicAddTasksResponse,
    EpicTimelineResponse,
    EpicProgressResponse,
    EpicBurndownResponse,
)
from aexy.services.epic_service import EpicService
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}/epics", tags=["Epics"])


async def check_workspace_permission(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace epics."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this workspace",
        )


def epic_to_response(epic) -> EpicResponse:
    """Convert Epic model to response schema."""
    return EpicResponse(
        id=str(epic.id),
        workspace_id=str(epic.workspace_id),
        key=epic.key,
        title=epic.title,
        description=epic.description,
        status=epic.status,
        color=epic.color,
        owner_id=str(epic.owner_id) if epic.owner_id else None,
        owner_name=epic.owner.name if epic.owner else None,
        owner_avatar_url=epic.owner.avatar_url if epic.owner else None,
        start_date=epic.start_date,
        target_date=epic.target_date,
        completed_date=epic.completed_date,
        priority=epic.priority,
        labels=epic.labels or [],
        total_tasks=epic.total_tasks,
        completed_tasks=epic.completed_tasks,
        total_story_points=epic.total_story_points,
        completed_story_points=epic.completed_story_points,
        progress_percentage=epic.progress_percentage,
        source_type=epic.source_type or "manual",
        source_id=epic.source_id,
        source_url=epic.source_url,
        created_at=epic.created_at,
        updated_at=epic.updated_at,
    )


def epic_to_list_response(epic) -> EpicListResponse:
    """Convert Epic model to list response schema."""
    return EpicListResponse(
        id=str(epic.id),
        workspace_id=str(epic.workspace_id),
        key=epic.key,
        title=epic.title,
        status=epic.status,
        color=epic.color,
        owner_id=str(epic.owner_id) if epic.owner_id else None,
        owner_name=epic.owner.name if epic.owner else None,
        priority=epic.priority,
        target_date=epic.target_date,
        total_tasks=epic.total_tasks,
        completed_tasks=epic.completed_tasks,
        progress_percentage=epic.progress_percentage,
    )


# ==================== Epic CRUD ====================

@router.get("", response_model=list[EpicListResponse])
async def list_epics(
    workspace_id: str,
    status: str | None = None,
    owner_id: str | None = None,
    priority: str | None = None,
    include_archived: bool = False,
    search: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List epics for a workspace."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = EpicService(db)
    epics = await service.list_epics(
        workspace_id=workspace_id,
        status=status,
        owner_id=owner_id,
        priority=priority,
        include_archived=include_archived,
        search=search,
        limit=limit,
        offset=offset,
    )

    return [epic_to_list_response(epic) for epic in epics]


@router.post("", response_model=EpicResponse, status_code=status.HTTP_201_CREATED)
async def create_epic(
    workspace_id: str,
    data: EpicCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new epic."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = EpicService(db)
    epic = await service.create_epic(
        workspace_id=workspace_id,
        title=data.title,
        description=data.description,
        status=data.status,
        color=data.color,
        owner_id=data.owner_id,
        start_date=data.start_date,
        target_date=data.target_date,
        priority=data.priority,
        labels=data.labels,
        source_type=data.source_type,
        source_id=data.source_id,
        source_url=data.source_url,
    )

    await db.commit()
    return epic_to_response(epic)


@router.get("/{epic_id}", response_model=EpicResponse)
async def get_epic(
    workspace_id: str,
    epic_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get an epic by ID."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = EpicService(db)
    epic = await service.get_epic(epic_id)

    if not epic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Epic not found",
        )

    if str(epic.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Epic not found in this workspace",
        )

    return epic_to_response(epic)


@router.get("/{epic_id}/detail", response_model=EpicDetailResponse)
async def get_epic_detail(
    workspace_id: str,
    epic_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get epic with detailed breakdown."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = EpicService(db)
    detail = await service.get_epic_detail(epic_id)

    if not detail or not detail.get("epic"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Epic not found",
        )

    epic = detail["epic"]
    if str(epic.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Epic not found in this workspace",
        )

    response = epic_to_response(epic)
    return EpicDetailResponse(
        **response.model_dump(),
        tasks_by_status=detail["tasks_by_status"],
        tasks_by_team=detail["tasks_by_team"],
        recent_completions=detail["recent_completions"],
    )


@router.patch("/{epic_id}", response_model=EpicResponse)
async def update_epic(
    workspace_id: str,
    epic_id: str,
    data: EpicUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update an epic."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = EpicService(db)

    # Build update kwargs from non-None fields
    update_data = data.model_dump(exclude_unset=True)

    epic = await service.update_epic(epic_id, **update_data)

    if not epic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Epic not found",
        )

    if str(epic.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Epic not found in this workspace",
        )

    await db.commit()
    return epic_to_response(epic)


@router.delete("/{epic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_epic(
    workspace_id: str,
    epic_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete an epic."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    service = EpicService(db)

    # Verify epic belongs to workspace
    epic = await service.get_epic(epic_id)
    if not epic or str(epic.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Epic not found",
        )

    deleted = await service.delete_epic(epic_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Epic not found",
        )

    await db.commit()


@router.post("/{epic_id}/archive", response_model=EpicResponse)
async def archive_epic(
    workspace_id: str,
    epic_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Archive an epic."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = EpicService(db)
    epic = await service.archive_epic(epic_id)

    if not epic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Epic not found",
        )

    await db.commit()
    return epic_to_response(epic)


@router.post("/{epic_id}/unarchive", response_model=EpicResponse)
async def unarchive_epic(
    workspace_id: str,
    epic_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Unarchive an epic."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = EpicService(db)
    epic = await service.unarchive_epic(epic_id)

    if not epic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Epic not found",
        )

    await db.commit()
    return epic_to_response(epic)


# ==================== Task Management ====================

@router.post("/{epic_id}/tasks", response_model=EpicAddTasksResponse)
async def add_tasks_to_epic(
    workspace_id: str,
    epic_id: str,
    data: EpicAddTasksRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add tasks to an epic."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = EpicService(db)

    # Verify epic belongs to workspace
    epic = await service.get_epic(epic_id)
    if not epic or str(epic.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Epic not found",
        )

    result = await service.add_tasks_to_epic(epic_id, data.task_ids)

    if "error" in result:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["error"],
        )

    await db.commit()
    return EpicAddTasksResponse(**result)


@router.delete("/{epic_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_task_from_epic(
    workspace_id: str,
    epic_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove a task from an epic."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    service = EpicService(db)

    # Verify epic belongs to workspace
    epic = await service.get_epic(epic_id)
    if not epic or str(epic.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Epic not found",
        )

    removed = await service.remove_task_from_epic(epic_id, task_id)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found in epic",
        )

    await db.commit()


# ==================== Timeline & Metrics ====================

@router.get("/{epic_id}/timeline", response_model=EpicTimelineResponse)
async def get_epic_timeline(
    workspace_id: str,
    epic_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get timeline view of epic tasks grouped by sprint."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = EpicService(db)

    # Verify epic belongs to workspace
    epic = await service.get_epic(epic_id)
    if not epic or str(epic.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Epic not found",
        )

    result = await service.get_epic_timeline(epic_id)
    return EpicTimelineResponse(**result)


@router.get("/{epic_id}/progress", response_model=EpicProgressResponse)
async def get_epic_progress(
    workspace_id: str,
    epic_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get progress metrics for an epic."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = EpicService(db)

    # Verify epic belongs to workspace
    epic = await service.get_epic(epic_id)
    if not epic or str(epic.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Epic not found",
        )

    result = await service.get_epic_progress(epic_id)
    return EpicProgressResponse(**result)


@router.get("/{epic_id}/burndown", response_model=EpicBurndownResponse)
async def get_epic_burndown(
    workspace_id: str,
    epic_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get burndown chart data for an epic."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    service = EpicService(db)

    # Verify epic belongs to workspace
    epic = await service.get_epic(epic_id)
    if not epic or str(epic.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Epic not found",
        )

    result = await service.get_epic_burndown(epic_id)
    return EpicBurndownResponse(**result)
