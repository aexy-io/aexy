"""Project Tasks API endpoints.

Handles tasks at the project/team level (without requiring a sprint).
These tasks can be in the project backlog and optionally assigned to sprints later.
"""

from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devograph.core.database import get_db
from devograph.api.developers import get_current_developer
from devograph.models.developer import Developer
from devograph.models.sprint import SprintTask
from devograph.models.notification import NotificationEventType
from devograph.schemas.sprint import (
    ProjectTaskCreate,
    SprintTaskUpdate,
    SprintTaskStatusUpdate,
    SprintTaskResponse,
    TaskStatus,
)
from devograph.services.workspace_service import WorkspaceService
from devograph.services.notification_service import NotificationService

router = APIRouter(prefix="/teams/{team_id}/tasks", tags=["Project Tasks"])


def task_to_response(task) -> SprintTaskResponse:
    """Convert SprintTask model to response schema."""
    assignee = task.assignee
    subtasks_count = len(task.subtasks) if task.subtasks else 0
    return SprintTaskResponse(
        id=str(task.id),
        sprint_id=str(task.sprint_id) if task.sprint_id else None,
        team_id=str(task.team_id) if task.team_id else None,
        workspace_id=str(task.workspace_id) if task.workspace_id else None,
        source_type=task.source_type,
        source_id=task.source_id,
        source_url=task.source_url,
        title=task.title,
        description=task.description,
        description_json=task.description_json,
        story_points=task.story_points,
        priority=task.priority,
        labels=task.labels or [],
        assignee_id=str(task.assignee_id) if task.assignee_id else None,
        assignee_name=assignee.name if assignee else None,
        assignee_avatar_url=assignee.avatar_url if assignee else None,
        assignment_reason=task.assignment_reason,
        assignment_confidence=task.assignment_confidence,
        status=task.status,
        status_id=str(task.status_id) if task.status_id else None,
        custom_fields=task.custom_fields or {},
        epic_id=str(task.epic_id) if task.epic_id else None,
        parent_task_id=str(task.parent_task_id) if task.parent_task_id else None,
        subtasks_count=subtasks_count,
        started_at=task.started_at,
        completed_at=task.completed_at,
        carried_over_from_sprint_id=str(task.carried_over_from_sprint_id) if task.carried_over_from_sprint_id else None,
        mentioned_user_ids=task.mentioned_user_ids or [],
        mentioned_file_paths=task.mentioned_file_paths or [],
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


async def get_team_and_check_permission(
    team_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "member",
):
    """Get team and check workspace permission."""
    from devograph.models.team import Team

    workspace_service = WorkspaceService(db)

    # Get team to find workspace
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    if not await workspace_service.check_permission(
        team.workspace_id, str(current_user.id), required_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    return team


async def send_mention_notifications(
    db: AsyncSession,
    task: SprintTask,
    mentioned_user_ids: list[str],
    actor_id: str,
    actor_name: str,
):
    """Send notifications to mentioned users."""
    notification_service = NotificationService(db)

    for user_id in mentioned_user_ids:
        if user_id != actor_id:  # Don't notify yourself
            await notification_service.create_notification(
                recipient_id=user_id,
                event_type=NotificationEventType.TASK_MENTIONED,
                title="You were mentioned in a task",
                body=f"{actor_name} mentioned you in task: {task.title}",
                context={
                    "task_id": str(task.id),
                    "task_title": task.title,
                    "actor_name": actor_name,
                    "action_url": f"/sprints/{task.team_id}/board?task={task.id}",
                },
            )


@router.get("", response_model=list[SprintTaskResponse])
async def list_project_tasks(
    team_id: str,
    status_filter: str | None = None,
    assignee_id: str | None = None,
    include_sprint_tasks: bool = False,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all tasks for a project/team.

    By default, only returns tasks without a sprint (backlog items).
    Set include_sprint_tasks=True to get all tasks including those in sprints.
    """
    team = await get_team_and_check_permission(team_id, current_user, db, "viewer")

    query = select(SprintTask).options(
        selectinload(SprintTask.assignee),
        selectinload(SprintTask.subtasks),
    ).where(SprintTask.team_id == team_id)

    # By default, only get tasks without a sprint
    if not include_sprint_tasks:
        query = query.where(SprintTask.sprint_id.is_(None))

    if status_filter:
        query = query.where(SprintTask.status == status_filter)

    if assignee_id:
        query = query.where(SprintTask.assignee_id == assignee_id)

    query = query.order_by(SprintTask.created_at.desc())

    result = await db.execute(query)
    tasks = result.scalars().all()

    return [task_to_response(t) for t in tasks]


@router.post("", response_model=SprintTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_project_task(
    team_id: str,
    data: ProjectTaskCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new task at the project level (without sprint)."""
    team = await get_team_and_check_permission(team_id, current_user, db, "member")

    # Create the task
    task = SprintTask(
        id=str(uuid4()),
        team_id=team_id,
        workspace_id=team.workspace_id,
        sprint_id=data.sprint_id,  # Can be null or set to a sprint
        source_type="manual",
        source_id=str(uuid4()),
        title=data.title,
        description=data.description,
        description_json=data.description_json,
        story_points=data.story_points,
        priority=data.priority,
        labels=data.labels or [],
        assignee_id=data.assignee_id,
        status=data.status,
        epic_id=data.epic_id,
        mentioned_user_ids=data.mentioned_user_ids or [],
        mentioned_file_paths=data.mentioned_file_paths or [],
    )

    db.add(task)
    await db.commit()
    await db.refresh(task)

    # Send mention notifications
    if data.mentioned_user_ids:
        await send_mention_notifications(
            db=db,
            task=task,
            mentioned_user_ids=data.mentioned_user_ids,
            actor_id=str(current_user.id),
            actor_name=current_user.name or "Someone",
        )

    return task_to_response(task)


@router.get("/{task_id}", response_model=SprintTaskResponse)
async def get_task(
    team_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a task by ID."""
    await get_team_and_check_permission(team_id, current_user, db, "viewer")

    query = select(SprintTask).options(
        selectinload(SprintTask.assignee),
        selectinload(SprintTask.subtasks),
    ).where(SprintTask.id == task_id, SprintTask.team_id == team_id)

    result = await db.execute(query)
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    return task_to_response(task)


@router.patch("/{task_id}", response_model=SprintTaskResponse)
async def update_task(
    team_id: str,
    task_id: str,
    data: SprintTaskUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a task."""
    await get_team_and_check_permission(team_id, current_user, db, "member")

    query = select(SprintTask).options(
        selectinload(SprintTask.assignee),
        selectinload(SprintTask.subtasks),
    ).where(SprintTask.id == task_id, SprintTask.team_id == team_id)

    result = await db.execute(query)
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Track old mentions to find new ones
    old_mentioned_users = set(task.mentioned_user_ids or [])

    # Update fields
    if data.title is not None:
        task.title = data.title
    if data.description is not None:
        task.description = data.description
    if data.description_json is not None:
        task.description_json = data.description_json
    if data.story_points is not None:
        task.story_points = data.story_points
    if data.priority is not None:
        task.priority = data.priority
    if data.status is not None:
        task.status = data.status
    if data.labels is not None:
        task.labels = data.labels
    if data.epic_id is not None or "epic_id" in data.model_fields_set:
        task.epic_id = data.epic_id
    if data.sprint_id is not None or "sprint_id" in data.model_fields_set:
        task.sprint_id = data.sprint_id
    if data.mentioned_user_ids is not None:
        task.mentioned_user_ids = data.mentioned_user_ids
    if data.mentioned_file_paths is not None:
        task.mentioned_file_paths = data.mentioned_file_paths

    await db.commit()
    await db.refresh(task)

    # Send notifications for new mentions
    if data.mentioned_user_ids:
        new_mentioned_users = set(data.mentioned_user_ids) - old_mentioned_users
        if new_mentioned_users:
            await send_mention_notifications(
                db=db,
                task=task,
                mentioned_user_ids=list(new_mentioned_users),
                actor_id=str(current_user.id),
                actor_name=current_user.name or "Someone",
            )

    return task_to_response(task)


@router.patch("/{task_id}/status", response_model=SprintTaskResponse)
async def update_task_status(
    team_id: str,
    task_id: str,
    data: SprintTaskStatusUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a task's status."""
    await get_team_and_check_permission(team_id, current_user, db, "member")

    query = select(SprintTask).options(
        selectinload(SprintTask.assignee),
        selectinload(SprintTask.subtasks),
    ).where(SprintTask.id == task_id, SprintTask.team_id == team_id)

    result = await db.execute(query)
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    task.status = data.status
    await db.commit()
    await db.refresh(task)

    return task_to_response(task)


@router.patch("/{task_id}/move-to-sprint", response_model=SprintTaskResponse)
async def move_task_to_sprint(
    team_id: str,
    task_id: str,
    sprint_id: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Move a task to a sprint or back to backlog (sprint_id=None)."""
    await get_team_and_check_permission(team_id, current_user, db, "member")

    query = select(SprintTask).options(
        selectinload(SprintTask.assignee),
        selectinload(SprintTask.subtasks),
    ).where(SprintTask.id == task_id, SprintTask.team_id == team_id)

    result = await db.execute(query)
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    task.sprint_id = sprint_id
    await db.commit()
    await db.refresh(task)

    return task_to_response(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    team_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a task."""
    await get_team_and_check_permission(team_id, current_user, db, "member")

    query = select(SprintTask).where(SprintTask.id == task_id, SprintTask.team_id == team_id)
    result = await db.execute(query)
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    await db.delete(task)
    await db.commit()
