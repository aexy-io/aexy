"""Project Tasks API endpoints.

Handles tasks at the project/team level (without requiring a sprint).
These tasks can be in the project backlog and optionally assigned to sprints later.
"""

from uuid import uuid4
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.activity import PullRequest
from aexy.models.developer import Developer
from aexy.models.sprint import SprintTask, TaskAssignee, TaskGitHubLink
from aexy.models.notification import NotificationEventType
from aexy.schemas.sprint import (
    BulkMoveResponse,
    ProjectTaskCreate,
    SprintTaskUpdate,
    SprintTaskStatusUpdate,
    SprintTaskResponse,
    TaskActivityCreate,
    TaskActivityListResponse,
    TaskActivityResponse,
    TaskAssigneeAdd,
    TaskAssigneesUpdate,
    TaskAttachmentListResponse,
    TaskBulkMoveToProjectRequest,
    TaskImportRequest,
    TaskImportResponse,
    TaskMoveToProjectRequest,
    TaskPrimaryAssigneeUpdate,
    TaskStatus,
)
from aexy.api import task_assignee_ops
from aexy.services.workspace_service import WorkspaceService
from aexy.services.notification_service import NotificationService
from aexy.services.activity_logger import log_activity
from aexy.services.github_task_sync_service import GitHubTaskSyncService
from aexy.services.sprint_task_service import SprintTaskService, TaskValidationError

router = APIRouter(prefix="/teams/{team_id}/tasks", tags=["Project Tasks"])


class GitHubIssueSummary(BaseModel):
    repository: str
    number: int
    title: str | None = None
    state: str | None = None
    url: str


class PullRequestSummary(BaseModel):
    id: str
    repository: str | None = None
    number: int | None = None
    title: str | None = None
    state: str | None = None
    url: str | None = None


class ProjectTaskGitHubLinkResponse(BaseModel):
    id: str
    link_type: str
    is_auto_linked: bool
    created_at: str
    github_issue: GitHubIssueSummary | None = None
    pull_request: PullRequestSummary | None = None


def pull_request_url(pr: PullRequest) -> str | None:
    if not pr.repository or not pr.number:
        return None
    return f"https://github.com/{pr.repository}/pull/{pr.number}"


def pull_request_to_summary(pr: PullRequest) -> PullRequestSummary:
    return PullRequestSummary(
        id=str(pr.id),
        repository=pr.repository,
        number=pr.number,
        title=pr.title,
        state=pr.state,
        url=pull_request_url(pr),
    )


def github_issue_to_summary(link: TaskGitHubLink) -> GitHubIssueSummary | None:
    if not link.github_issue_repository or not link.github_issue_number:
        return None
    return GitHubIssueSummary(
        repository=link.github_issue_repository,
        number=link.github_issue_number,
        title=link.github_issue_title,
        state=link.github_issue_state,
        url=link.github_issue_url
        or GitHubTaskSyncService.issue_url(link.github_issue_repository, link.github_issue_number),
    )


def github_link_to_response(link: TaskGitHubLink) -> ProjectTaskGitHubLinkResponse:
    return ProjectTaskGitHubLinkResponse(
        id=str(link.id),
        link_type=link.link_type,
        is_auto_linked=link.is_auto_linked,
        created_at=link.created_at.isoformat(),
        github_issue=github_issue_to_summary(link),
        pull_request=pull_request_to_summary(link.pull_request) if link.pull_request else None,
    )


from aexy.services.sprint_task_response import task_to_response  # noqa: E402,F401


async def get_team_and_check_permission(
    team_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "member",
):
    """Get team and check workspace permission."""
    from aexy.models.team import Team

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
    include_archived: bool = False,
    archived_only: bool = False,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all tasks for a project/team.

    By default, only returns tasks without a sprint (backlog items).
    Set include_sprint_tasks=True to get all tasks including those in sprints.
    Set archived_only=True to list only archived tasks, or include_archived=True
    to return both active and archived in one list.
    """
    team = await get_team_and_check_permission(team_id, current_user, db, "viewer")

    query = select(SprintTask).options(
        selectinload(SprintTask.assignee),
        selectinload(SprintTask.subtasks),
    ).where(SprintTask.team_id == team_id)

    if archived_only:
        query = query.where(SprintTask.is_archived.is_(True))
    elif not include_archived:
        query = query.where(SprintTask.is_archived.is_(False))

    # By default, only get tasks without a sprint
    if not include_sprint_tasks:
        query = query.where(SprintTask.sprint_id.is_(None))

    if status_filter:
        query = query.where(SprintTask.status == status_filter)

    if assignee_id:
        # Match collaborators too, not just the primary. Filtering to a person
        # and not seeing work they are genuinely on is worse than no filter —
        # it reads as "nothing assigned to them".
        query = query.where(
            or_(
                SprintTask.assignee_id == assignee_id,
                SprintTask.id.in_(
                    select(TaskAssignee.task_id).where(
                        TaskAssignee.developer_id == assignee_id
                    )
                ),
            )
        )

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
        start_date=data.start_date,
        end_date=data.end_date,
        estimated_hours=data.estimated_hours,
    )

    db.add(task)
    await db.flush()
    await GitHubTaskSyncService(db).auto_link_issue_references(task)

    # Per-task History row so the modal shows "X created this task" instead
    # of an empty timeline. The sprint create path does this via
    # SprintTaskService.add_task; project create reproduces it here.
    task_service = SprintTaskService(db)
    # Same reason this path has to reproduce the history row: it builds the
    # SprintTask directly instead of going through add_task, so a project task
    # created with an assignee would carry the column and no assignee row —
    # showing nobody on it in the UI.
    if task.assignee_id:
        await task_service.sync_assignee_rows_from_column(
            task, actor_id=str(current_user.id)
        )
    await task_service.log_activity(
        task_id=str(task.id),
        action="created",
        actor_id=str(current_user.id),
    )

    await log_activity(
        db,
        workspace_id=str(team.workspace_id),
        entity_type="task",
        entity_id=str(task.id),
        activity_type="created",
        actor_id=str(current_user.id),
        title=f"Created task '{task.title}'",
        metadata={"team_id": team_id},
    )

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
    """Update a task.

    Delegates field updates to `SprintTaskService.update_task` so every
    field change writes a per-task History entry — same behavior as the
    sprint-scoped PATCH. Mentions, sprint_id moves, and workspace-level
    activity are handled inline since the service doesn't cover them.
    """
    await get_team_and_check_permission(team_id, current_user, db, "member")

    task_service = SprintTaskService(db)

    # Resolve the task with team scoping before delegating, so we keep the
    # team-membership boundary even though the service is workspace-wide.
    query = select(SprintTask).options(
        selectinload(SprintTask.assignee),
        selectinload(SprintTask.subtasks),
    ).where(SprintTask.id == task_id, SprintTask.team_id == team_id)
    result = await db.execute(query)
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        )

    old_mentioned_users = set(task.mentioned_user_ids or [])

    # Build kwargs for the canonical update path (writes per-field activity
    # rows for everything that actually changed). Mirror the conditional
    # forwarding from sprint_tasks.update_task so we don't clobber
    # unspecified fields.
    update_kwargs: dict = {
        "task_id": task_id,
        "title": data.title,
        "description": data.description,
        "story_points": data.story_points,
        "priority": data.priority,
        "status": data.status,
        "labels": data.labels,
        "actor_id": str(current_user.id),
    }
    if "description_json" in data.model_fields_set:
        update_kwargs["description_json"] = data.description_json
    if data.epic_id is not None or "epic_id" in data.model_fields_set:
        update_kwargs["epic_id"] = data.epic_id
    if data.assignee_id is not None or "assignee_id" in data.model_fields_set:
        update_kwargs["assignee_id"] = data.assignee_id
    if data.contributes_to_goal is not None:
        update_kwargs["contributes_to_goal"] = data.contributes_to_goal
    if "start_date" in data.model_fields_set:
        update_kwargs["start_date"] = data.start_date
    if "end_date" in data.model_fields_set:
        update_kwargs["end_date"] = data.end_date
    if "estimated_hours" in data.model_fields_set:
        update_kwargs["estimated_hours"] = data.estimated_hours

    try:
        task = await task_service.update_task(**update_kwargs)
    except TaskValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=exc.code
        )
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        )

    # sprint_id and mentions aren't service-handled — keep them inline.
    if "sprint_id" in data.model_fields_set:
        prior_sprint_id = str(task.sprint_id) if task.sprint_id else None
        new_sprint_id = str(data.sprint_id) if data.sprint_id else None
        task.sprint_id = data.sprint_id
        if prior_sprint_id != new_sprint_id:
            await task_service.log_activity(
                task_id=task_id,
                action="sprint_changed",
                actor_id=str(current_user.id),
                field_name="sprint_id",
                old_value=prior_sprint_id,
                new_value=new_sprint_id,
            )
    if data.mentioned_user_ids is not None:
        task.mentioned_user_ids = data.mentioned_user_ids
    if data.mentioned_file_paths is not None:
        task.mentioned_file_paths = data.mentioned_file_paths

    await GitHubTaskSyncService(db).auto_link_issue_references(task)

    if task.workspace_id:
        await log_activity(
            db,
            workspace_id=str(task.workspace_id),
            entity_type="task",
            entity_id=task_id,
            activity_type="updated",
            actor_id=str(current_user.id),
            title=f"Updated task '{task.title}'",
        )

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


@router.get("/{task_id}/github-links", response_model=list[ProjectTaskGitHubLinkResponse])
async def list_project_task_github_links(
    team_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List GitHub issue + PR links for a project-level task."""
    await get_team_and_check_permission(team_id, current_user, db, "viewer")
    task = await db.get(SprintTask, task_id)
    if not task or str(task.team_id) != team_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    service = GitHubTaskSyncService(db)
    links = await service.get_task_links(task_id)
    return [
        github_link_to_response(link)
        for link in links
        if link.link_type in ("pull_request", "github_issue")
    ]


@router.delete("/{task_id}/github-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_project_task_github_link(
    team_id: str,
    task_id: str,
    link_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove a GitHub issue link from a project-level task."""
    await get_team_and_check_permission(team_id, current_user, db, "member")
    task = await db.get(SprintTask, task_id)
    if not task or str(task.team_id) != team_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    link = await db.get(TaskGitHubLink, link_id)
    if not link or str(link.task_id) != task_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GitHub link not found")

    removed = await GitHubTaskSyncService(db).remove_link(link_id)
    if not removed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="GitHub link not found")
    await db.commit()


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

    task_service = SprintTaskService(db)
    try:
        # Canonicalise, don't just validate: the board buckets by task.status, so
        # storing a spelling it has no column for hides the task entirely.
        new_status = await task_service.canonical_status_slug(task, data.status)
    except TaskValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.code)

    old_status = task.status
    task.status = new_status

    if old_status != new_status:
        # Per-task History row so the modal shows status changes alongside
        # other field-change events.
        await task_service.log_activity(
            task_id=task_id,
            action="status_changed",
            actor_id=str(current_user.id),
            field_name="status",
            old_value=old_status,
            new_value=new_status,
        )

    if task.workspace_id and old_status != new_status:
        act_type = "status_changed"
        if new_status == "done":
            act_type = "resolved"
        await log_activity(
            db,
            workspace_id=str(task.workspace_id),
            entity_type="task",
            entity_id=task_id,
            activity_type=act_type,
            actor_id=str(current_user.id),
            title=f"Task '{task.title}' status changed",
            changes={"status": {"old": old_status, "new": new_status}},
        )

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

    prior_sprint_id = str(task.sprint_id) if task.sprint_id else None
    task.sprint_id = sprint_id
    if prior_sprint_id != (sprint_id or None):
        # History tab event so sprint moves render alongside other activity.
        task_service = SprintTaskService(db)
        await task_service.log_activity(
            task_id=task_id,
            action="sprint_changed",
            actor_id=str(current_user.id),
            field_name="sprint_id",
            old_value=prior_sprint_id,
            new_value=sprint_id,
        )
    await db.commit()
    await db.refresh(task)

    return task_to_response(task)


@router.post("/{task_id}/move-to-project", response_model=SprintTaskResponse)
async def move_task_to_project(
    team_id: str,
    task_id: str,
    body: TaskMoveToProjectRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Fork-and-link move of a task to another project in the same
    workspace. Returns the newly created task; the source is either
    archived or marked done per `body.source_action`."""
    await get_team_and_check_permission(team_id, current_user, db, "member")

    task_service = SprintTaskService(db)
    try:
        new_task = await task_service.move_to_project(
            task_id=task_id,
            target_project_id=body.target_project_id,
            source_action=body.source_action,
            subtask_strategy=body.subtask_strategy,
            actor_id=str(current_user.id),
            target_status_slug=body.target_status_slug,
        )
    except TaskValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=exc.code
        )

    await db.commit()
    return task_to_response(new_task)


@router.post("/bulk-move-to-project", response_model=BulkMoveResponse)
async def bulk_move_tasks_to_project(
    team_id: str,
    body: TaskBulkMoveToProjectRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Per-task fork-and-link move. Failures are reported per task; the
    batch is not aborted on the first error."""
    await get_team_and_check_permission(team_id, current_user, db, "member")

    task_service = SprintTaskService(db)
    results = await task_service.bulk_move_to_project(
        task_ids=body.task_ids,
        target_project_id=body.target_project_id,
        source_action=body.source_action,
        subtask_strategy=body.subtask_strategy,
        actor_id=str(current_user.id),
        target_status_slug=body.target_status_slug,
    )
    await db.commit()
    return {"results": results}


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    team_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Archive a task (soft delete)."""
    await get_team_and_check_permission(team_id, current_user, db, "member")

    query = select(SprintTask).where(SprintTask.id == task_id, SprintTask.team_id == team_id)
    result = await db.execute(query)
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    task_title = task.title

    if task.workspace_id:
        await log_activity(
            db,
            workspace_id=str(task.workspace_id),
            entity_type="task",
            entity_id=task_id,
            activity_type="deleted",
            actor_id=str(current_user.id),
            title=f"Deleted task '{task_title}'",
        )

    task.is_archived = True
    # Per-task History event so backlog timelines show the archive action.
    task_service = SprintTaskService(db)
    await task_service.log_activity(
        task_id=task_id,
        action="archived",
        actor_id=str(current_user.id),
    )
    await db.commit()


@router.post("/{task_id}/unarchive", response_model=SprintTaskResponse)
async def unarchive_task(
    team_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Unarchive a task (restore from soft delete)."""
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

    task.is_archived = False
    task_service = SprintTaskService(db)
    await task_service.log_activity(
        task_id=task_id,
        action="unarchived",
        actor_id=str(current_user.id),
    )
    await db.commit()
    await db.refresh(task)

    return task_to_response(task)



# ─── Attachments (project-level / sprint-less tasks) ────────────────────────
async def _resolve_team_task(team_id: str, task_id: str, db: AsyncSession) -> SprintTask:
    """Fetch a task in this team or 404. Used by attachment endpoints."""
    result = await db.execute(
        select(SprintTask).where(
            SprintTask.id == task_id,
            SprintTask.team_id == team_id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )
    return task


@router.post(
    "/{task_id}/attachments",
    response_model=TaskAttachmentListResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_project_task_attachments(
    team_id: str,
    task_id: str,
    files: list[UploadFile] = File(...),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Upload attachments to a project-level task (with or without a sprint)."""
    from aexy.services.task_attachment_service import upload_attachments_for_task

    await get_team_and_check_permission(team_id, current_user, db, "member")
    task = await _resolve_team_task(team_id, task_id, db)
    return await upload_attachments_for_task(db, task, files, current_user)


@router.get(
    "/{task_id}/attachments",
    response_model=TaskAttachmentListResponse,
)
async def list_project_task_attachments(
    team_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List attachments on a project-level task."""
    from aexy.services.task_attachment_service import list_attachments_for_task

    await get_team_and_check_permission(team_id, current_user, db, "viewer")
    task = await _resolve_team_task(team_id, task_id, db)
    return await list_attachments_for_task(db, task)


@router.delete(
    "/{task_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_project_task_attachment(
    team_id: str,
    task_id: str,
    attachment_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete an attachment from a project-level task."""
    from aexy.services.task_attachment_service import delete_attachment_for_task

    await get_team_and_check_permission(team_id, current_user, db, "member")
    task = await _resolve_team_task(team_id, task_id, db)
    await delete_attachment_for_task(db, task, attachment_id, actor_id=str(current_user.id))
    return None


# ─── Import (project-level / no sprint required) ────────────────────────────
@router.post("/import", response_model=TaskImportResponse)
async def import_project_tasks(
    team_id: str,
    data: TaskImportRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Import tasks from GitHub / Jira / Linear into the project backlog.

    Mirrors `POST /sprints/{sprint_id}/tasks/import` but doesn't require a
    sprint — the resulting tasks are sprint-less project-level rows. For
    GitHub specifically, this populates the "Select issue" dropdown across
    every task in the team.
    """
    await get_team_and_check_permission(team_id, current_user, db, "member")
    task_service = SprintTaskService(db)
    imported_tasks: list[SprintTask] = []

    try:
        if data.source == "github_issue" and data.github:
            imported_tasks = await task_service.import_project_github_issues(
                team_id=team_id,
                owner=data.github.owner,
                repo=data.github.repo,
                api_token=data.github.api_token,
                labels=data.github.labels,
                limit=data.github.limit,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Source '{data.source}' not supported for project-level "
                    "import yet. Use the sprint import for Jira/Linear."
                ),
            )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Import failed: {exc}",
        )

    await db.commit()
    return TaskImportResponse(
        imported_count=len(imported_tasks),
        tasks=[task_to_response(t) for t in imported_tasks],
    )


# ─── Activity log + comments (project-level / works for backlog tasks) ──────
from aexy.api.sprint_tasks import activity_to_response  # noqa: E402


@router.get("/{task_id}/activities", response_model=TaskActivityListResponse)
async def get_project_task_activities(
    team_id: str,
    task_id: str,
    limit: int = 50,
    offset: int = 0,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get the activity log for a project-level (backlog) task.

    Mirrors the sprint-scoped activity log. The History tab now works
    regardless of whether the task has a sprint.
    """
    await get_team_and_check_permission(team_id, current_user, db, "viewer")
    task_service = SprintTaskService(db)
    task = await task_service.get_task(task_id)
    if not task or str(task.team_id) != team_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        )

    activities, total = await task_service.get_task_activities(
        task_id=task_id, limit=limit, offset=offset
    )
    return TaskActivityListResponse(
        activities=[activity_to_response(a) for a in activities],
        total=total,
    )


@router.post(
    "/{task_id}/comments",
    response_model=TaskActivityResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_project_task_comment(
    team_id: str,
    task_id: str,
    data: TaskActivityCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to a project-level (backlog) task."""
    await get_team_and_check_permission(team_id, current_user, db, "member")
    task_service = SprintTaskService(db)
    task = await task_service.get_task(task_id)
    if not task or str(task.team_id) != team_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        )

    activity = await task_service.add_comment(
        task_id=task_id,
        comment=data.comment,
        actor_id=str(current_user.id),
    )
    await db.commit()
    await db.refresh(activity)
    return activity_to_response(activity)


# Assignee set (primary + collaborators).
#
# This router previously had no assignment endpoints at all — the project board
# could only reassign through the generic PATCH, which is part of why assignment
# from the project view behaved differently from the sprint view. Bodies are
# shared with the sprint router; see api/task_assignee_ops.py.
@router.put("/{task_id}/assignees", response_model=SprintTaskResponse)
async def set_task_assignees(
    team_id: str,
    task_id: str,
    data: TaskAssigneesUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Replace the whole assignee set for a task."""
    await get_team_and_check_permission(team_id, current_user, db, "member")
    return await task_assignee_ops.set_assignees(
        db, task_id, data, str(current_user.id), lambda t: t.team_id == team_id
    )


@router.post("/{task_id}/assignees", response_model=SprintTaskResponse)
async def add_task_assignee(
    team_id: str,
    task_id: str,
    data: TaskAssigneeAdd,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add one person to a task without disturbing the others."""
    await get_team_and_check_permission(team_id, current_user, db, "member")
    return await task_assignee_ops.add_assignee(
        db, task_id, data, str(current_user.id), lambda t: t.team_id == team_id
    )


@router.delete("/{task_id}/assignees/{developer_id}", response_model=SprintTaskResponse)
async def remove_task_assignee(
    team_id: str,
    task_id: str,
    developer_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Take one person off a task, leaving the rest."""
    await get_team_and_check_permission(team_id, current_user, db, "member")
    return await task_assignee_ops.remove_assignee(
        db, task_id, developer_id, str(current_user.id), lambda t: t.team_id == team_id
    )


@router.put("/{task_id}/assignees/primary", response_model=SprintTaskResponse)
async def set_task_primary_assignee(
    team_id: str,
    task_id: str,
    data: TaskPrimaryAssigneeUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Move the primary badge, or clear it so all assignees are equal."""
    await get_team_and_check_permission(team_id, current_user, db, "member")
    return await task_assignee_ops.set_primary_assignee(
        db, task_id, data, str(current_user.id), lambda t: t.team_id == team_id
    )
