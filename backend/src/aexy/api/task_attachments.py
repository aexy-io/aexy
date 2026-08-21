"""Reading the bytes of a task attachment.

Uploading, listing and deleting attachments happen under the sprint router
(`/sprints/{sprint_id}/tasks/…`) or the team router (`/teams/{team_id}/tasks/…`),
because those are the two ways a task is addressed. Reading gets its own
workspace-agnostic route so an attachment has exactly one URL no matter which
of the two listed it — a URL that is stored in `file_url`, handed to clients,
and stays correct if the task later moves between a sprint and the backlog.
"""

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.models.sprint import Sprint, SprintTask, TaskAttachment
from aexy.models.team import Team
from aexy.services.task_attachment_service import stream_attachment_object
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/task-attachments", tags=["Task Attachments"])


async def _workspace_for_task(task: SprintTask, db: AsyncSession) -> str | None:
    """The workspace that governs access to `task`.

    Tasks created before `workspace_id` existed don't carry one, so fall back to
    the sprint or team they hang off — the same two owners the upload routers
    check against.
    """
    if task.workspace_id:
        return str(task.workspace_id)

    if task.sprint_id:
        sprint = (
            await db.execute(select(Sprint).where(Sprint.id == task.sprint_id))
        ).scalar_one_or_none()
        if sprint and sprint.workspace_id:
            return str(sprint.workspace_id)

    if task.team_id:
        team = (
            await db.execute(select(Team).where(Team.id == task.team_id))
        ).scalar_one_or_none()
        if team and team.workspace_id:
            return str(team.workspace_id)

    return None


@router.get("/{attachment_id}")
async def download_task_attachment(
    attachment_id: str,
    range_header: str | None = Header(default=None, alias="Range"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Stream one task attachment to a workspace member."""
    attachment = (
        await db.execute(
            select(TaskAttachment).where(TaskAttachment.id == attachment_id)
        )
    ).scalar_one_or_none()
    if attachment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found",
        )

    task = (
        await db.execute(
            select(SprintTask).where(SprintTask.id == attachment.task_id)
        )
    ).scalar_one_or_none()
    workspace_id = await _workspace_for_task(task, db) if task else None
    if workspace_id is None:
        # An attachment whose task is gone or unplaceable has no one who can be
        # said to own it, so there is no membership that would grant access.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found",
        )

    if not await WorkspaceService(db).check_permission(
        workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    return stream_attachment_object(attachment, range_header)
