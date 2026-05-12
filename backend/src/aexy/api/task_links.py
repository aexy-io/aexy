"""Resolve shareable task identifiers to navigation targets.

A copy-from-kanban link looks like `/t/{workspace_slug}/{task_key}`.
The frontend short-link route hits this endpoint to discover which
sprint/project to redirect to, then opens the task drawer on that
page via `?task=<uuid>`.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.models.project import Project, ProjectTeam
from aexy.models.sprint import SprintTask
from aexy.models.workspace import Workspace, WorkspaceMember

router = APIRouter(prefix="/tasks", tags=["task-links"])


class TaskLinkResolution(BaseModel):
    """Where the kanban deep-link should land for a `[slug:key]` identifier."""

    task_id: str
    workspace_id: str
    workspace_slug: str
    task_key: int
    sprint_id: str | None
    team_id: str | None
    # The frontend route is /sprints/{project_id}/{sprint_id|...} —
    # we resolve the project on the backend so the redirect can be
    # built without an extra round trip.
    project_id: str | None
    is_archived: bool


@router.get("/by-key/{workspace_slug}/{task_key}", response_model=TaskLinkResolution)
async def resolve_task_link(
    workspace_slug: str,
    task_key: int,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> TaskLinkResolution:
    """Resolve a [workspace_slug:task_key] identifier to its task + location."""
    stmt = (
        select(SprintTask, Workspace)
        .join(Workspace, Workspace.id == SprintTask.workspace_id)
        .where(
            and_(
                Workspace.slug == workspace_slug.lower(),
                SprintTask.task_key == task_key,
            )
        )
        .limit(1)
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    task, workspace = row

    # Access check: only members of the workspace can resolve.
    member_check = await db.execute(
        select(WorkspaceMember).where(
            and_(
                WorkspaceMember.workspace_id == workspace.id,
                WorkspaceMember.developer_id == current_user.id,
                WorkspaceMember.status == "active",
            )
        )
    )
    if member_check.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access")

    # Best-effort project resolution: tasks aren't directly project-scoped,
    # so we look up via the team's first associated project. Null is fine —
    # the frontend falls back to a workspace-wide landing in that case.
    project_id: str | None = None
    if task.team_id:
        project_row = await db.execute(
            select(Project.id)
            .join(ProjectTeam, ProjectTeam.project_id == Project.id)
            .where(ProjectTeam.team_id == task.team_id)
            .order_by(Project.created_at.asc())
            .limit(1)
        )
        project_id = project_row.scalar_one_or_none()

    return TaskLinkResolution(
        task_id=task.id,
        workspace_id=workspace.id,
        workspace_slug=workspace.slug,
        task_key=task.task_key,
        sprint_id=task.sprint_id,
        team_id=task.team_id,
        project_id=project_id,
        is_archived=task.is_archived,
    )
