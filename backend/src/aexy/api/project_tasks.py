"""Project Tasks API endpoints.

Handles tasks at the project/team level (without requiring a sprint).
These tasks can be in the project backlog and optionally assigned to sprints later.
"""

from uuid import uuid4
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.activity import PullRequest
from aexy.models.developer import Developer
from aexy.models.sprint import SprintTask, TaskGitHubLink
from aexy.models.notification import NotificationEventType
from aexy.models.workspace import WorkspaceMember
from aexy.schemas.sprint import (
    ProjectTaskCreate,
    SprintTaskUpdate,
    SprintTaskStatusUpdate,
    SprintTaskResponse,
    TaskAttachmentListResponse,
    TaskImportRequest,
    TaskImportResponse,
    TaskStatus,
)
from aexy.services.workspace_service import WorkspaceService
from aexy.services.notification_service import NotificationService
from aexy.services.activity_logger import log_activity
from aexy.services.github_task_sync_service import GitHubTaskSyncService
from aexy.services.sprint_task_service import SprintTaskService

router = APIRouter(prefix="/teams/{team_id}/tasks", tags=["Project Tasks"])


class GitHubIssueSummary(BaseModel):
    repository: str
    number: int
    title: str | None = None
    state: str | None = None
    url: str


class GitHubIssueRepositoryContext(BaseModel):
    repositories: list[str]
    inferred_repository: str | None = None


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


class GitHubIssueLinkCreate(BaseModel):
    repository: str | None = None
    issue_number: int = Field(..., gt=0)
    title: str | None = None
    state: str | None = None
    url: str | None = None


class PullRequestLinkCreate(BaseModel):
    pull_request_id: str = Field(..., min_length=1)


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
    ).where(SprintTask.team_id == team_id).where(SprintTask.is_archived == False)

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
        start_date=data.start_date,
        end_date=data.end_date,
        estimated_hours=data.estimated_hours,
    )

    db.add(task)
    await db.flush()
    await GitHubTaskSyncService(db).auto_link_issue_references(task)

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
    if data.assignee_id is not None or "assignee_id" in data.model_fields_set:
        task.assignee_id = data.assignee_id
    if data.mentioned_user_ids is not None:
        task.mentioned_user_ids = data.mentioned_user_ids
    if data.mentioned_file_paths is not None:
        task.mentioned_file_paths = data.mentioned_file_paths
    # contributes_to_goal is a non-nullable bool — apply only when the caller
    # explicitly set true/false.
    if data.contributes_to_goal is not None:
        task.contributes_to_goal = data.contributes_to_goal
    # `model_fields_set` lets callers clear date/hours fields by sending an
    # explicit null; checking `is not None` alone would silently drop a clear.
    if "start_date" in data.model_fields_set:
        task.start_date = data.start_date
    if "end_date" in data.model_fields_set:
        task.end_date = data.end_date
    if "estimated_hours" in data.model_fields_set:
        task.estimated_hours = data.estimated_hours

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


@router.get("/github/issues", response_model=list[GitHubIssueSummary])
async def search_project_github_issues(
    team_id: str,
    query: str | None = None,
    limit: int = 20,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Search imported GitHub issues for manual project task linking."""
    await get_team_and_check_permission(team_id, current_user, db, "viewer")
    service = GitHubTaskSyncService(db)
    issues = await service.search_imported_issues(
        team_id=team_id,
        query=query,
        limit=min(max(limit, 1), 50),
    )
    summaries: list[GitHubIssueSummary] = []
    for issue in issues:
        repository = service.repository_from_issue_url(issue.source_url)
        number = service.issue_number_from_issue_url(issue.source_url)
        if not repository or not number:
            continue
        summaries.append(
            GitHubIssueSummary(
                repository=repository,
                number=number,
                title=issue.title,
                state=issue.status,
                url=issue.source_url or service.issue_url(repository, number),
            )
        )
    return summaries


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


@router.get("/github/pull-requests", response_model=list[PullRequestSummary])
async def search_project_pull_requests(
    team_id: str,
    query: str | None = None,
    limit: int = 20,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Search synced workspace pull requests for project-level task linking."""
    team = await get_team_and_check_permission(team_id, current_user, db, "viewer")
    limit = min(max(limit, 1), 50)

    conditions = [WorkspaceMember.workspace_id == team.workspace_id]
    if query:
        stripped_query = query.strip()
        search = f"%{stripped_query}%"
        query_conditions = [
            PullRequest.title.ilike(search),
            PullRequest.repository.ilike(search),
        ]
        if stripped_query.isdigit():
            query_conditions.append(PullRequest.number == int(stripped_query))
        conditions.append(or_(*query_conditions))

    stmt = (
        select(PullRequest)
        .join(WorkspaceMember, WorkspaceMember.developer_id == PullRequest.developer_id)
        .where(and_(*conditions))
        .order_by(
            PullRequest.updated_at_github.desc().nullslast(),
            PullRequest.created_at_github.desc(),
        )
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [pull_request_to_summary(pr) for pr in result.scalars().unique().all()]


@router.post(
    "/{task_id}/github-links/pull-requests",
    response_model=ProjectTaskGitHubLinkResponse,
    status_code=status.HTTP_201_CREATED,
)
async def link_pull_request_to_project_task(
    team_id: str,
    task_id: str,
    data: PullRequestLinkCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Link a synced workspace PR to a project-level (backlog) task."""
    team = await get_team_and_check_permission(team_id, current_user, db, "member")

    task = await db.get(SprintTask, task_id)
    if not task or str(task.team_id) != team_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    pr = await db.get(PullRequest, data.pull_request_id)
    if not pr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pull request not found"
        )
    # Confirm the PR's author is a member of this team's workspace, mirroring
    # the sprint-scoped check so users can't link PRs outside their workspace.
    membership_stmt = select(WorkspaceMember).where(
        and_(
            WorkspaceMember.workspace_id == team.workspace_id,
            WorkspaceMember.developer_id == pr.developer_id,
        )
    )
    membership_result = await db.execute(membership_stmt)
    if not membership_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pull request not found"
        )

    service = GitHubTaskSyncService(db)
    link = await service.link_pr_manually(task_id, data.pull_request_id)
    if not link:
        existing_stmt = select(TaskGitHubLink).where(
            and_(
                TaskGitHubLink.task_id == task_id,
                TaskGitHubLink.pull_request_id == data.pull_request_id,
            )
        )
        existing_result = await db.execute(existing_stmt)
        link = existing_result.scalar_one_or_none()
        if not link:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to link pull request"
            )

    await db.commit()
    await db.refresh(link)
    link.pull_request = pr
    return github_link_to_response(link)


@router.get("/{task_id}/github-links/issue-repositories", response_model=GitHubIssueRepositoryContext)
async def get_project_task_github_issue_repository_context(
    team_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Return GitHub issue repository context for project-level task linking."""
    await get_team_and_check_permission(team_id, current_user, db, "viewer")
    task = await db.get(SprintTask, task_id)
    if not task or str(task.team_id) != team_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    service = GitHubTaskSyncService(db)
    return GitHubIssueRepositoryContext(
        repositories=await service.get_project_issue_repositories(team_id),
        inferred_repository=await service.infer_repository_for_task(task),
    )


@router.post("/{task_id}/github-links/issues", response_model=ProjectTaskGitHubLinkResponse, status_code=status.HTTP_201_CREATED)
async def link_github_issue_to_project_task(
    team_id: str,
    task_id: str,
    data: GitHubIssueLinkCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Manually link a GitHub issue to a project-level task."""
    await get_team_and_check_permission(team_id, current_user, db, "member")
    task = await db.get(SprintTask, task_id)
    if not task or str(task.team_id) != team_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    service = GitHubTaskSyncService(db)
    repository = data.repository or await service.infer_repository_for_task(task)
    if not repository:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Repository is required when the project has no single GitHub issue repository",
        )

    link = await service.link_issue_manually(
        task_id,
        repository,
        data.issue_number,
        title=data.title,
        state=data.state,
        url=data.url,
    )
    if not link:
        existing_stmt = select(TaskGitHubLink).where(
            and_(
                TaskGitHubLink.task_id == task_id,
                TaskGitHubLink.github_issue_repository == repository,
                TaskGitHubLink.github_issue_number == data.issue_number,
            )
        )
        existing_result = await db.execute(existing_stmt)
        link = existing_result.scalar_one_or_none()
        if not link:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to link GitHub issue")

    await db.commit()
    await db.refresh(link)
    return github_link_to_response(link)


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

    old_status = task.status
    task.status = data.status

    if task.workspace_id and old_status != data.status:
        act_type = "status_changed"
        if data.status == "done":
            act_type = "resolved"
        await log_activity(
            db,
            workspace_id=str(task.workspace_id),
            entity_type="task",
            entity_id=task_id,
            activity_type=act_type,
            actor_id=str(current_user.id),
            title=f"Task '{task.title}' status changed",
            changes={"status": {"old": old_status, "new": data.status}},
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
    await delete_attachment_for_task(db, task, attachment_id)
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
