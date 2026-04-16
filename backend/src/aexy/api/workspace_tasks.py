"""Workspace-level Tasks API — aggregates tasks across every team/sprint in a workspace."""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import status as http_status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.api.sprint_tasks import task_to_response
from aexy.models.developer import Developer
from aexy.schemas.sprint import SprintTaskResponse, SprintTaskStatusUpdate
from aexy.services.sprint_task_service import SprintTaskService
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}/tasks", tags=["Workspace Tasks"])


@router.get("", response_model=list[SprintTaskResponse])
async def list_workspace_tasks(
    workspace_id: str,
    status: list[str] | None = Query(None, description="Filter by status slug(s)"),
    status_id: list[str] | None = Query(None, description="Filter by custom status id(s)"),
    assignee_id: list[str] | None = Query(None, description="Filter by assignee developer id(s)"),
    priority: list[str] | None = Query(None, description="Filter by priority"),
    team_id: list[str] | None = Query(None, description="Filter by team/project id(s)"),
    sprint_id: list[str] | None = Query(None, description="Filter by sprint id(s)"),
    epic_id: list[str] | None = Query(None, description="Filter by epic id(s)"),
    labels: list[str] | None = Query(None, description="Filter by label(s) — match if task has any"),
    search: str | None = Query(None, description="Case-insensitive substring match on title/description"),
    include_archived: bool = Query(False),
    limit: int = Query(500, le=1000, ge=1),
    offset: int = Query(0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List every task in a workspace (across all teams, sprints, and backlogs)."""
    ws_service = WorkspaceService(db)
    if not await ws_service.check_permission(workspace_id, str(current_user.id), "viewer"):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    task_service = SprintTaskService(db)
    tasks = await task_service.get_workspace_tasks(
        workspace_id,
        status=status,
        status_id=status_id,
        assignee_ids=assignee_id,
        priorities=priority,
        team_ids=team_id,
        sprint_ids=sprint_id,
        epic_ids=epic_id,
        labels=labels,
        search=search,
        include_archived=include_archived,
        limit=limit,
        offset=offset,
    )
    return [task_to_response(t) for t in tasks]


@router.patch("/{task_id}/status", response_model=SprintTaskResponse)
async def update_workspace_task_status(
    workspace_id: str,
    task_id: str,
    data: SprintTaskStatusUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a task's status from the workspace-level Kanban (drag-drop).

    Verifies the task belongs to the given workspace so that a user can't
    mutate a task outside their workspace scope.
    """
    ws_service = WorkspaceService(db)
    if not await ws_service.check_permission(workspace_id, str(current_user.id), "member"):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    task_service = SprintTaskService(db)
    existing = await task_service.get_task(task_id)
    if not existing or str(existing.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    updated = await task_service.update_task(task_id, status=data.status)
    if not updated:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    await db.commit()
    return task_to_response(updated)
