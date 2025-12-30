"""Sprint API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.core.database import get_db
from devograph.api.developers import get_current_developer
from devograph.models.developer import Developer
from devograph.schemas.sprint import (
    SprintCreate,
    SprintUpdate,
    SprintResponse,
    SprintListResponse,
    SprintStatsResponse,
    CarryOverRequest,
    CarryOverResponse,
    SprintTaskResponse,
)
from devograph.services.sprint_service import SprintService
from devograph.services.workspace_service import WorkspaceService

router = APIRouter(tags=["Sprints"])


def sprint_to_response(sprint, stats: dict | None = None) -> SprintResponse:
    """Convert Sprint model to response schema."""
    stats = stats or {}
    return SprintResponse(
        id=str(sprint.id),
        team_id=str(sprint.team_id),
        workspace_id=str(sprint.workspace_id),
        name=sprint.name,
        goal=sprint.goal,
        status=sprint.status,
        start_date=sprint.start_date,
        end_date=sprint.end_date,
        capacity_hours=sprint.capacity_hours,
        velocity_commitment=sprint.velocity_commitment,
        settings=sprint.settings or {},
        created_by_id=str(sprint.created_by_id) if sprint.created_by_id else None,
        created_at=sprint.created_at,
        updated_at=sprint.updated_at,
        tasks_count=stats.get("total_tasks", len(sprint.tasks) if sprint.tasks else 0),
        completed_count=stats.get("completed_tasks", 0),
        total_points=stats.get("total_points", 0),
        completed_points=stats.get("completed_points", 0),
    )


def sprint_to_list_response(sprint, stats: dict | None = None) -> SprintListResponse:
    """Convert Sprint model to list response schema."""
    stats = stats or {}
    return SprintListResponse(
        id=str(sprint.id),
        team_id=str(sprint.team_id),
        name=sprint.name,
        goal=sprint.goal,
        status=sprint.status,
        start_date=sprint.start_date,
        end_date=sprint.end_date,
        tasks_count=stats.get("total_tasks", len(sprint.tasks) if sprint.tasks else 0),
        completed_count=stats.get("completed_tasks", 0),
        total_points=stats.get("total_points", 0),
        completed_points=stats.get("completed_points", 0),
    )


def task_to_response(task) -> SprintTaskResponse:
    """Convert SprintTask model to response schema."""
    assignee = task.assignee
    return SprintTaskResponse(
        id=str(task.id),
        sprint_id=str(task.sprint_id),
        source_type=task.source_type,
        source_id=task.source_id,
        source_url=task.source_url,
        title=task.title,
        description=task.description,
        story_points=task.story_points,
        priority=task.priority,
        labels=task.labels or [],
        assignee_id=str(task.assignee_id) if task.assignee_id else None,
        assignee_name=assignee.name if assignee else None,
        assignee_avatar_url=assignee.avatar_url if assignee else None,
        assignment_reason=task.assignment_reason,
        assignment_confidence=task.assignment_confidence,
        status=task.status,
        started_at=task.started_at,
        completed_at=task.completed_at,
        carried_over_from_sprint_id=str(task.carried_over_from_sprint_id) if task.carried_over_from_sprint_id else None,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


# Sprint CRUD
@router.post(
    "/workspaces/{workspace_id}/teams/{team_id}/sprints",
    response_model=SprintResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_sprint(
    workspace_id: str,
    team_id: str,
    data: SprintCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new sprint for a team."""
    workspace_service = WorkspaceService(db)
    sprint_service = SprintService(db)

    # Check workspace membership (must be at least a member)
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), "member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    # Check team membership OR workspace admin status
    is_team_member = await sprint_service.check_team_membership(team_id, str(current_user.id))
    is_workspace_admin = await workspace_service.check_permission(workspace_id, str(current_user.id), "admin")

    if not is_team_member and not is_workspace_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this team",
        )

    sprint = await sprint_service.create_sprint(
        team_id=team_id,
        workspace_id=workspace_id,
        name=data.name,
        start_date=data.start_date,
        end_date=data.end_date,
        goal=data.goal,
        capacity_hours=data.capacity_hours,
        velocity_commitment=data.velocity_commitment,
        created_by_id=str(current_user.id),
        settings=data.settings,
    )

    await db.commit()
    return sprint_to_response(sprint)


@router.get(
    "/workspaces/{workspace_id}/teams/{team_id}/sprints",
    response_model=list[SprintListResponse],
)
async def list_sprints(
    workspace_id: str,
    team_id: str,
    status_filter: str | None = None,
    limit: int | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all sprints for a team."""
    workspace_service = WorkspaceService(db)
    sprint_service = SprintService(db)

    # Check workspace membership
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), "viewer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    sprints = await sprint_service.list_team_sprints(
        team_id=team_id,
        status=status_filter,
        limit=limit,
    )

    results = []
    for sprint in sprints:
        stats = await sprint_service.get_sprint_stats(sprint.id)
        results.append(sprint_to_list_response(sprint, stats))

    return results


@router.get(
    "/workspaces/{workspace_id}/teams/{team_id}/sprints/active",
    response_model=SprintResponse | None,
)
async def get_active_sprint(
    workspace_id: str,
    team_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get the currently active sprint for a team."""
    workspace_service = WorkspaceService(db)
    sprint_service = SprintService(db)

    # Check workspace membership
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), "viewer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    sprint = await sprint_service.get_active_sprint(team_id)
    if not sprint:
        return None

    stats = await sprint_service.get_sprint_stats(sprint.id)
    return sprint_to_response(sprint, stats)


@router.get(
    "/workspaces/{workspace_id}/teams/{team_id}/sprints/{sprint_id}",
    response_model=SprintResponse,
)
async def get_sprint(
    workspace_id: str,
    team_id: str,
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a sprint by ID."""
    workspace_service = WorkspaceService(db)
    sprint_service = SprintService(db)

    # Check workspace membership
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), "viewer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    sprint = await sprint_service.get_sprint(sprint_id)
    if not sprint or sprint.team_id != team_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sprint not found",
        )

    stats = await sprint_service.get_sprint_stats(sprint.id)
    return sprint_to_response(sprint, stats)


@router.patch(
    "/workspaces/{workspace_id}/teams/{team_id}/sprints/{sprint_id}",
    response_model=SprintResponse,
)
async def update_sprint(
    workspace_id: str,
    team_id: str,
    sprint_id: str,
    data: SprintUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a sprint."""
    workspace_service = WorkspaceService(db)
    sprint_service = SprintService(db)

    # Check workspace membership
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), "member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    sprint = await sprint_service.update_sprint(
        sprint_id=sprint_id,
        name=data.name,
        goal=data.goal,
        start_date=data.start_date,
        end_date=data.end_date,
        capacity_hours=data.capacity_hours,
        velocity_commitment=data.velocity_commitment,
        settings=data.settings,
    )

    if not sprint or sprint.team_id != team_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sprint not found",
        )

    await db.commit()
    stats = await sprint_service.get_sprint_stats(sprint.id)
    return sprint_to_response(sprint, stats)


@router.delete(
    "/workspaces/{workspace_id}/teams/{team_id}/sprints/{sprint_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_sprint(
    workspace_id: str,
    team_id: str,
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a sprint (only if in planning status)."""
    workspace_service = WorkspaceService(db)
    sprint_service = SprintService(db)

    # Check workspace membership
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    try:
        if not await sprint_service.delete_sprint(sprint_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Sprint not found",
            )
        await db.commit()
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# Lifecycle endpoints
@router.post(
    "/workspaces/{workspace_id}/teams/{team_id}/sprints/{sprint_id}/start",
    response_model=SprintResponse,
)
async def start_sprint(
    workspace_id: str,
    team_id: str,
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Start a sprint (transition from planning to active)."""
    workspace_service = WorkspaceService(db)
    sprint_service = SprintService(db)

    if not await workspace_service.check_permission(workspace_id, str(current_user.id), "member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    try:
        sprint = await sprint_service.start_sprint(sprint_id)
        await db.commit()
        stats = await sprint_service.get_sprint_stats(sprint.id)
        return sprint_to_response(sprint, stats)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post(
    "/workspaces/{workspace_id}/teams/{team_id}/sprints/{sprint_id}/review",
    response_model=SprintResponse,
)
async def start_sprint_review(
    workspace_id: str,
    team_id: str,
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Start sprint review (transition from active to review)."""
    workspace_service = WorkspaceService(db)
    sprint_service = SprintService(db)

    if not await workspace_service.check_permission(workspace_id, str(current_user.id), "member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    try:
        sprint = await sprint_service.start_review(sprint_id)
        await db.commit()
        stats = await sprint_service.get_sprint_stats(sprint.id)
        return sprint_to_response(sprint, stats)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post(
    "/workspaces/{workspace_id}/teams/{team_id}/sprints/{sprint_id}/retro",
    response_model=SprintResponse,
)
async def start_sprint_retro(
    workspace_id: str,
    team_id: str,
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Start sprint retrospective (transition from review to retrospective)."""
    workspace_service = WorkspaceService(db)
    sprint_service = SprintService(db)

    if not await workspace_service.check_permission(workspace_id, str(current_user.id), "member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    try:
        sprint = await sprint_service.start_retrospective(sprint_id)
        await db.commit()
        stats = await sprint_service.get_sprint_stats(sprint.id)
        return sprint_to_response(sprint, stats)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post(
    "/workspaces/{workspace_id}/teams/{team_id}/sprints/{sprint_id}/complete",
    response_model=SprintResponse,
)
async def complete_sprint(
    workspace_id: str,
    team_id: str,
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Complete a sprint (transition from retrospective to completed)."""
    workspace_service = WorkspaceService(db)
    sprint_service = SprintService(db)

    if not await workspace_service.check_permission(workspace_id, str(current_user.id), "member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    try:
        sprint = await sprint_service.complete_sprint(sprint_id)
        await db.commit()
        stats = await sprint_service.get_sprint_stats(sprint.id)
        return sprint_to_response(sprint, stats)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# Stats endpoint
@router.get(
    "/workspaces/{workspace_id}/teams/{team_id}/sprints/{sprint_id}/stats",
    response_model=SprintStatsResponse,
)
async def get_sprint_stats(
    workspace_id: str,
    team_id: str,
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get sprint statistics."""
    workspace_service = WorkspaceService(db)
    sprint_service = SprintService(db)

    if not await workspace_service.check_permission(workspace_id, str(current_user.id), "viewer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    sprint = await sprint_service.get_sprint(sprint_id)
    if not sprint or sprint.team_id != team_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sprint not found",
        )

    stats = await sprint_service.get_sprint_stats(sprint_id)
    return SprintStatsResponse(**stats)


# Carry-over endpoint
@router.post(
    "/workspaces/{workspace_id}/teams/{team_id}/sprints/{sprint_id}/carry-over/{target_sprint_id}",
    response_model=CarryOverResponse,
)
async def carry_over_tasks(
    workspace_id: str,
    team_id: str,
    sprint_id: str,
    target_sprint_id: str,
    data: CarryOverRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Carry over incomplete tasks to another sprint."""
    workspace_service = WorkspaceService(db)
    sprint_service = SprintService(db)

    if not await workspace_service.check_permission(workspace_id, str(current_user.id), "member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    try:
        carried_tasks = await sprint_service.carry_over_tasks(
            from_sprint_id=sprint_id,
            to_sprint_id=target_sprint_id,
            task_ids=data.task_ids,
        )
        await db.commit()

        return CarryOverResponse(
            carried_count=len(carried_tasks),
            tasks=[task_to_response(t) for t in carried_tasks],
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
