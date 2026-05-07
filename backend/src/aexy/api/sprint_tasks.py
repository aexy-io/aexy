"""Sprint Tasks API endpoints."""

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.activity import PullRequest
from aexy.models.developer import Developer
from aexy.models.sprint import SprintTask, TaskGitHubLink
from aexy.models.workspace import WorkspaceMember
from aexy.schemas.sprint import (
    SprintTaskCreate,
    SprintTaskUpdate,
    SprintTaskStatusUpdate,
    SprintTaskAssign,
    SprintTaskBulkAssign,
    SprintTaskBulkStatusUpdate,
    SprintTaskBulkMove,
    SprintTaskReorder,
    SprintTaskResponse,
    TaskAttachmentListResponse,
    TaskImportRequest,
    TaskImportResponse,
    TaskActivityCreate,
    TaskActivityResponse,
    TaskActivityListResponse,
    WipLimitsConfig,
)
from aexy.services.sprint_service import SprintService
from aexy.services.sprint_task_service import SprintTaskService
from aexy.services.github_task_sync_service import GitHubTaskSyncService
from aexy.services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sprints/{sprint_id}/tasks", tags=["Sprint Tasks"])


class PullRequestSummary(BaseModel):
    """Compact pull request summary for task linking."""

    id: str
    github_id: int
    number: int
    repository: str
    title: str
    state: str
    url: str | None = None


class GitHubIssueSummary(BaseModel):
    """Compact GitHub issue summary for task linking."""

    repository: str
    number: int
    title: str | None = None
    state: str | None = None
    url: str


class GitHubIssueRepositoryContext(BaseModel):
    """Known GitHub issue repositories and the repo used for bare #123 links."""

    repositories: list[str]
    inferred_repository: str | None = None


class TaskGitHubLinkResponse(BaseModel):
    """Task GitHub link with optional pull request details."""

    id: str
    link_type: str
    is_auto_linked: bool
    created_at: str
    pull_request: PullRequestSummary | None = None
    github_issue: GitHubIssueSummary | None = None


class PullRequestLinkCreate(BaseModel):
    """Request body for linking a pull request to a task."""

    pull_request_id: str = Field(..., min_length=1)


class GitHubIssueLinkCreate(BaseModel):
    """Request body for linking a GitHub issue to a task."""

    repository: str | None = None
    issue_number: int = Field(..., gt=0)
    title: str | None = None
    state: str | None = None
    url: str | None = None


def pull_request_url(pr: PullRequest) -> str | None:
    """Build a GitHub PR URL from stored repository and number when possible."""
    if not pr.repository or "/" not in pr.repository or not pr.number:
        return None
    return f"https://github.com/{pr.repository}/pull/{pr.number}"


def pull_request_to_summary(pr: PullRequest) -> PullRequestSummary:
    """Convert a PullRequest model to a compact API response."""
    return PullRequestSummary(
        id=str(pr.id),
        github_id=pr.github_id,
        number=pr.number,
        repository=pr.repository,
        title=pr.title,
        state=pr.state,
        url=pull_request_url(pr),
    )


def github_link_to_response(link: TaskGitHubLink) -> TaskGitHubLinkResponse:
    """Convert a TaskGitHubLink model to an API response."""
    github_issue = None
    if link.github_issue_repository and link.github_issue_number:
        github_issue = GitHubIssueSummary(
            repository=link.github_issue_repository,
            number=link.github_issue_number,
            title=link.github_issue_title,
            state=link.github_issue_state,
            url=link.github_issue_url
            or GitHubTaskSyncService.issue_url(link.github_issue_repository, link.github_issue_number),
        )

    return TaskGitHubLinkResponse(
        id=str(link.id),
        link_type=link.link_type,
        is_auto_linked=link.is_auto_linked,
        created_at=link.created_at.isoformat(),
        pull_request=pull_request_to_summary(link.pull_request) if link.pull_request else None,
        github_issue=github_issue,
    )


from aexy.services.sprint_task_response import task_to_response  # noqa: E402,F401


async def get_sprint_and_check_permission(
    sprint_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "member",
):
    """Get sprint and check workspace permission."""
    sprint_service = SprintService(db)
    workspace_service = WorkspaceService(db)

    sprint = await sprint_service.get_sprint(sprint_id)
    if not sprint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sprint not found",
        )

    if not await workspace_service.check_permission(
        sprint.workspace_id, str(current_user.id), required_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    return sprint


# Task CRUD
@router.get("", response_model=list[SprintTaskResponse])
async def list_tasks(
    sprint_id: str,
    status_filter: str | None = None,
    assignee_id: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all tasks in a sprint."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")

    task_service = SprintTaskService(db)
    tasks = await task_service.get_sprint_tasks(
        sprint_id=sprint_id,
        status=status_filter,
        assignee_id=assignee_id,
    )

    return [task_to_response(t) for t in tasks]


@router.post("", response_model=SprintTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    sprint_id: str,
    data: SprintTaskCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a new task to a sprint."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)
    task = await task_service.add_task(
        sprint_id=sprint_id,
        title=data.title,
        source_type=data.source_type,
        source_id=data.source_id,
        source_url=data.source_url,
        description=data.description,
        story_points=data.story_points,
        priority=data.priority,
        labels=data.labels,
        assignee_id=data.assignee_id,
        status=data.status,
        epic_id=data.epic_id,
        parent_task_id=data.parent_task_id,
        start_date=data.start_date,
        end_date=data.end_date,
        estimated_hours=data.estimated_hours,
        actor_id=str(current_user.id),
    )

    await db.commit()
    return task_to_response(task)


# NOTE: Specific routes MUST be defined before /{task_id} routes to avoid route matching issues


@router.post("/bulk-assign", response_model=list[SprintTaskResponse])
async def bulk_assign_tasks(
    sprint_id: str,
    data: SprintTaskBulkAssign,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Bulk assign multiple tasks."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)
    tasks = await task_service.bulk_assign_tasks(data.assignments)

    await db.commit()
    return [task_to_response(t) for t in tasks]


@router.post("/bulk-status", response_model=list[SprintTaskResponse])
async def bulk_update_status(
    sprint_id: str,
    data: SprintTaskBulkStatusUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Bulk update status for multiple tasks."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)
    tasks = await task_service.bulk_update_status(
        data.task_ids, data.status, actor_id=str(current_user.id)
    )

    await db.commit()
    return [task_to_response(t) for t in tasks]


@router.post("/bulk-move", response_model=list[SprintTaskResponse])
async def bulk_move_tasks(
    sprint_id: str,
    data: SprintTaskBulkMove,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Bulk move tasks to another sprint."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)
    tasks = await task_service.bulk_move_to_sprint(
        data.task_ids, data.target_sprint_id, actor_id=str(current_user.id)
    )

    await db.commit()
    return [task_to_response(t) for t in tasks]


@router.post("/reorder", response_model=list[SprintTaskResponse])
async def reorder_tasks(
    sprint_id: str,
    data: SprintTaskReorder,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Reorder tasks within a sprint (drag-and-drop prioritization)."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)
    tasks = await task_service.reorder_tasks(data.task_ids, sprint_id)

    await db.commit()
    return [task_to_response(t) for t in tasks]


@router.post("/import", response_model=TaskImportResponse)
async def import_tasks(
    sprint_id: str,
    data: TaskImportRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Import tasks from external sources (GitHub, Jira, Linear)."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)
    imported_tasks = []

    try:
        if data.source == "github_issue" and data.github:
            imported_tasks = await task_service.import_github_issues(
                sprint_id=sprint_id,
                owner=data.github.owner,
                repo=data.github.repo,
                api_token=data.github.api_token,
                labels=data.github.labels,
                limit=data.github.limit,
            )
        elif data.source == "jira" and data.jira:
            imported_tasks = await task_service.import_jira_issues(
                sprint_id=sprint_id,
                api_url=data.jira.api_url,
                api_key=data.jira.api_key,
                project_key=data.jira.project_key,
                jql_filter=data.jira.jql_filter,
                limit=data.jira.limit,
            )
        elif data.source == "linear" and data.linear:
            imported_tasks = await task_service.import_linear_issues(
                sprint_id=sprint_id,
                api_key=data.linear.api_key,
                team_id=data.linear.team_id,
                labels=data.linear.labels,
                limit=data.linear.limit,
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing configuration for source: {data.source}",
            )

        await db.commit()

        return TaskImportResponse(
            imported_count=len(imported_tasks),
            tasks=[task_to_response(t) for t in imported_tasks],
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Import failed: {str(e)}",
        )


@router.post("/suggest-assignments")
async def suggest_assignments(
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get AI-powered assignment suggestions for unassigned tasks."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    from aexy.services.sprint_planning_service import SprintPlanningService

    planning_service = SprintPlanningService(db)
    suggestions = await planning_service.suggest_assignments(sprint_id)

    return [
        {
            "task_id": s.task_id,
            "task_title": s.task_title,
            "suggested_developer_id": s.suggested_developer_id,
            "suggested_developer_name": s.suggested_developer_name,
            "confidence": s.confidence,
            "reasoning": s.reasoning,
            "alternative_developers": s.alternative_developers,
        }
        for s in suggestions
    ]


@router.post("/optimize")
async def optimize_sprint(
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Optimize task assignments to balance workload."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    from aexy.services.sprint_planning_service import SprintPlanningService

    planning_service = SprintPlanningService(db)
    result = await planning_service.optimize_sprint(sprint_id)

    return {
        "original_score": result.original_score,
        "optimized_score": result.optimized_score,
        "improvement": result.improvement,
        "changes": result.changes,
        "recommendations": result.recommendations,
    }


@router.get("/capacity")
async def analyze_capacity(
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Analyze sprint capacity vs commitment."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")

    from aexy.services.sprint_planning_service import SprintPlanningService

    planning_service = SprintPlanningService(db)
    result = await planning_service.analyze_capacity(sprint_id)

    return {
        "total_capacity_hours": result.total_capacity_hours,
        "committed_hours": result.committed_hours,
        "utilization_rate": result.utilization_rate,
        "overcommitted": result.overcommitted,
        "per_member_capacity": result.per_member_capacity,
        "recommendations": result.recommendations,
    }


@router.get("/completion-prediction")
async def predict_completion(
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Predict sprint completion likelihood."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")

    from aexy.services.sprint_planning_service import SprintPlanningService

    planning_service = SprintPlanningService(db)
    result = await planning_service.predict_completion(sprint_id)

    return {
        "predicted_completion_rate": result.predicted_completion_rate,
        "confidence": result.confidence,
        "risk_factors": result.risk_factors,
        "at_risk_tasks": result.at_risk_tasks,
        "recommendations": result.recommendations,
    }


# ============================================================================
# WIP Limits Endpoints (must be before /{task_id} routes)
# ============================================================================


@router.get("/wip-limits")
async def get_wip_limits(
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get WIP limits and current column counts for a sprint."""
    sprint = await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")
    task_service = SprintTaskService(db)
    tasks = await task_service.get_sprint_tasks(sprint_id)

    # Get limits from sprint settings
    settings = sprint.settings or {}
    wip_limits = settings.get("wip_limits", {})

    # Count tasks per status
    counts: dict[str, int] = {}
    for status_val in ("backlog", "todo", "in_progress", "review", "done"):
        counts[status_val] = len([t for t in tasks if t.status == status_val])

    # Detect violations
    violations = []
    for status_val, limit in wip_limits.items():
        if limit is not None and limit > 0 and counts.get(status_val, 0) > limit:
            violations.append({
                "status": status_val,
                "limit": limit,
                "count": counts[status_val],
                "over_by": counts[status_val] - limit,
            })

    return {
        "limits": wip_limits,
        "counts": counts,
        "violations": violations,
    }


@router.put("/wip-limits")
async def update_wip_limits(
    sprint_id: str,
    config: WipLimitsConfig,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Set WIP limits for a sprint. Stored in sprint settings JSONB."""
    sprint = await get_sprint_and_check_permission(sprint_id, current_user, db, "admin")

    settings = dict(sprint.settings or {})
    settings["wip_limits"] = config.model_dump(exclude_none=True)
    sprint.settings = settings

    await db.flush()
    await db.commit()
    await db.refresh(sprint)

    return {"wip_limits": sprint.settings.get("wip_limits", {})}


# ============================================================================
# Sprint Goal Endpoints (must be before /{task_id} routes)
# ============================================================================


@router.get("/goal-progress")
async def get_goal_progress(
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get sprint goal progress based on tasks marked as contributing to goal."""
    sprint = await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")
    task_service = SprintTaskService(db)
    tasks = await task_service.get_sprint_tasks(sprint_id)

    goal_tasks = [t for t in tasks if getattr(t, 'contributes_to_goal', False)]
    completed_goal_tasks = [t for t in goal_tasks if t.status == "done"]

    return {
        "goal": sprint.goal,
        "total_goal_tasks": len(goal_tasks),
        "completed_goal_tasks": len(completed_goal_tasks),
        "percentage": round(len(completed_goal_tasks) / len(goal_tasks) * 100, 1) if goal_tasks else 0,
        "goal_task_ids": [str(t.id) for t in goal_tasks],
    }


# ============================================================================
# Auto-Assign Endpoint (must be before /{task_id} routes)
# ============================================================================


@router.post("/auto-assign")
async def auto_assign_sprint(
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Auto-assign unassigned tasks based on AI suggestions weighted by capacity."""
    sprint = await get_sprint_and_check_permission(sprint_id, current_user, db, "admin")

    from aexy.services.sprint_planning_service import SprintPlanningService
    planning_service = SprintPlanningService(db)

    # Get capacity-aware suggestions
    suggestions = await planning_service.suggest_assignments(sprint_id)
    capacity = await planning_service.analyze_capacity(sprint_id)

    # Build utilization map
    utilization_map = {
        pm["developer_id"]: pm["utilization"]
        for pm in capacity.per_member_capacity
    }

    task_service = SprintTaskService(db)
    assigned = []
    skipped = []

    for suggestion in suggestions:
        dev_util = utilization_map.get(suggestion.suggested_developer_id, 0)
        if dev_util > 0.9:
            skipped.append({
                "task_id": suggestion.task_id,
                "task_title": suggestion.task_title,
                "reason": f"Developer {suggestion.suggested_developer_name} is at {int(dev_util * 100)}% capacity",
                "suggested_developer": suggestion.suggested_developer_name,
            })
            continue

        if suggestion.confidence < 0.3:
            skipped.append({
                "task_id": suggestion.task_id,
                "task_title": suggestion.task_title,
                "reason": f"Low confidence ({int(suggestion.confidence * 100)}%)",
                "suggested_developer": suggestion.suggested_developer_name,
            })
            continue

        # Apply assignment
        await task_service.assign_task(
            task_id=suggestion.task_id,
            developer_id=suggestion.suggested_developer_id,
            reason=suggestion.reasoning,
            confidence=suggestion.confidence,
        )
        assigned.append({
            "task_id": suggestion.task_id,
            "task_title": suggestion.task_title,
            "developer_id": suggestion.suggested_developer_id,
            "developer_name": suggestion.suggested_developer_name,
            "confidence": suggestion.confidence,
            "reasoning": suggestion.reasoning,
        })

    await db.commit()

    return {
        "assigned": assigned,
        "skipped": skipped,
        "total_assigned": len(assigned),
        "total_skipped": len(skipped),
    }


# ============================================================================
# GitHub Link Endpoints (must be before /{task_id} routes)
# ============================================================================


@router.get("/github/pull-requests", response_model=list[PullRequestSummary])
async def search_pull_requests_for_task_linking(
    sprint_id: str,
    query: str | None = None,
    limit: int = 50,
    offset: int = 0,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Search PRs from repos selected for this sprint's team.

    Scopes via the sprint's team → `team_repositories` →
    `workspace_repositories`. PRs from repos not in the team's
    selection don't surface here.
    """
    from aexy.models.repository import (
        Repository,
        TeamRepository,
        WorkspaceRepository,
    )

    sprint = await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")
    limit = min(max(limit, 1), 100)
    offset = max(offset, 0)

    conditions = [
        TeamRepository.team_id == sprint.team_id,
        WorkspaceRepository.is_active == True,  # noqa: E712
    ]
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
        .join(Repository, Repository.full_name == PullRequest.repository)
        .join(
            WorkspaceRepository,
            WorkspaceRepository.repository_id == Repository.id,
        )
        .join(
            TeamRepository,
            TeamRepository.workspace_repository_id == WorkspaceRepository.id,
        )
        .where(and_(*conditions))
        .order_by(PullRequest.updated_at_github.desc().nullslast(), PullRequest.created_at_github.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [pull_request_to_summary(pr) for pr in result.scalars().unique().all()]


@router.get("/github/issues", response_model=list[GitHubIssueSummary])
async def search_github_issues_for_task_linking(
    sprint_id: str,
    query: str | None = None,
    limit: int = 50,
    offset: int = 0,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Search imported GitHub issues available for manual task linking."""
    sprint = await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")
    service = GitHubTaskSyncService(db)
    issues = await service.search_imported_issues(
        team_id=str(sprint.team_id),
        query=query,
        limit=min(max(limit, 1), 100),
        offset=max(offset, 0),
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


@router.get("/{task_id}/github-links", response_model=list[TaskGitHubLinkResponse])
async def list_task_github_links(
    sprint_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List GitHub links for a task."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")

    task = await db.get(SprintTask, task_id)
    if not task or str(task.sprint_id) != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    service = GitHubTaskSyncService(db)
    links = await service.get_task_links(task_id)
    return [
        github_link_to_response(link)
        for link in links
        if link.link_type in ("pull_request", "github_issue")
    ]


@router.get("/{task_id}/github-links/issue-repositories", response_model=GitHubIssueRepositoryContext)
async def get_task_github_issue_repository_context(
    sprint_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Return GitHub issue repository context for linking and bare #123 references."""
    sprint = await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")

    task = await db.get(SprintTask, task_id)
    if not task or str(task.sprint_id) != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    service = GitHubTaskSyncService(db)
    repositories = await service.get_project_issue_repositories(str(sprint.team_id))
    return GitHubIssueRepositoryContext(
        repositories=repositories,
        inferred_repository=await service.infer_repository_for_task(task),
    )


@router.post("/{task_id}/github-links/pull-requests", response_model=TaskGitHubLinkResponse, status_code=status.HTTP_201_CREATED)
async def link_pull_request_to_task(
    sprint_id: str,
    task_id: str,
    data: PullRequestLinkCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Manually link a synced pull request to a task."""
    sprint = await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task = await db.get(SprintTask, task_id)
    if not task or str(task.sprint_id) != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    pr = await db.get(PullRequest, data.pull_request_id)
    if not pr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pull request not found",
        )
    membership_stmt = select(WorkspaceMember).where(
        and_(
            WorkspaceMember.workspace_id == sprint.workspace_id,
            WorkspaceMember.developer_id == pr.developer_id,
        )
    )
    membership_result = await db.execute(membership_stmt)
    if not membership_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pull request not found",
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
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to link pull request",
            )

    await db.commit()
    await db.refresh(link)
    link.pull_request = pr
    return github_link_to_response(link)


@router.post("/{task_id}/github-links/issues", response_model=TaskGitHubLinkResponse, status_code=status.HTTP_201_CREATED)
async def link_github_issue_to_task(
    sprint_id: str,
    task_id: str,
    data: GitHubIssueLinkCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Manually link a GitHub issue to a task."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task = await db.get(SprintTask, task_id)
    if not task or str(task.sprint_id) != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

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
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to link GitHub issue",
            )

    await db.commit()
    await db.refresh(link)
    return github_link_to_response(link)


@router.delete("/{task_id}/github-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_github_link_from_task(
    sprint_id: str,
    task_id: str,
    link_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove a manual or auto-detected GitHub link from a task."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    link = await db.get(TaskGitHubLink, link_id)
    if not link or str(link.task_id) != task_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="GitHub link not found",
        )

    task = await db.get(SprintTask, task_id)
    if not task or str(task.sprint_id) != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    service = GitHubTaskSyncService(db)
    removed = await service.remove_link(link_id)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="GitHub link not found",
        )

    await db.commit()


# Task CRUD with path parameters (must come after specific routes)
@router.get("/{task_id}", response_model=SprintTaskResponse)
async def get_task(
    sprint_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a task by ID."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")

    task_service = SprintTaskService(db)
    task = await task_service.get_task(task_id)

    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    return task_to_response(task)


@router.patch("/{task_id}", response_model=SprintTaskResponse)
async def update_task(
    sprint_id: str,
    task_id: str,
    data: SprintTaskUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a task."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)

    # Build kwargs, handling epic_id and assignee_id specially to allow setting to None
    update_kwargs = {
        "task_id": task_id,
        "title": data.title,
        "description": data.description,
        "story_points": data.story_points,
        "priority": data.priority,
        "status": data.status,
        "labels": data.labels,
        "actor_id": str(current_user.id),
    }
    # description_json is the rich-text representation; pass through only when
    # the caller explicitly set it so we don't clobber it on partial updates.
    if "description_json" in data.model_fields_set:
        update_kwargs["description_json"] = data.description_json
    # Only pass epic_id if it was explicitly provided in the request
    if data.epic_id is not None or "epic_id" in data.model_fields_set:
        update_kwargs["epic_id"] = data.epic_id
    # Only pass assignee_id if it was explicitly provided in the request
    if data.assignee_id is not None or "assignee_id" in data.model_fields_set:
        update_kwargs["assignee_id"] = data.assignee_id
    # contributes_to_goal is a non-nullable bool on the model — only apply
    # when the caller explicitly set true/false.
    if data.contributes_to_goal is not None:
        update_kwargs["contributes_to_goal"] = data.contributes_to_goal
    # Pass scheduled-timeline fields only if explicitly set so callers can
    # clear the dates by sending null and not just leave them unspecified.
    if "start_date" in data.model_fields_set:
        update_kwargs["start_date"] = data.start_date
    if "end_date" in data.model_fields_set:
        update_kwargs["end_date"] = data.end_date
    if "estimated_hours" in data.model_fields_set:
        update_kwargs["estimated_hours"] = data.estimated_hours

    task = await task_service.update_task(**update_kwargs)

    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    await db.commit()
    return task_to_response(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    sprint_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Archive a task (soft delete)."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)

    # Verify task belongs to sprint
    task = await task_service.get_task(task_id)
    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    await task_service.archive_task(task_id, actor_id=str(current_user.id))
    await db.commit()


@router.post("/{task_id}/unarchive", response_model=SprintTaskResponse)
async def unarchive_task(
    sprint_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Unarchive a task (restore from soft delete)."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)

    task = await task_service.get_task(task_id)
    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    restored = await task_service.unarchive_task(task_id, actor_id=str(current_user.id))
    await db.commit()
    return task_to_response(restored)


# Subtasks
@router.get("/{task_id}/subtasks", response_model=list[SprintTaskResponse])
async def get_subtasks(
    sprint_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get all subtasks for a task."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")

    task_service = SprintTaskService(db)
    task = await task_service.get_task(task_id)

    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    return [task_to_response(t) for t in task.subtasks]


# Status updates
@router.patch("/{task_id}/status", response_model=SprintTaskResponse)
async def update_task_status(
    sprint_id: str,
    task_id: str,
    data: SprintTaskStatusUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a task's status."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)
    task = await task_service.update_task_status(
        task_id, data.status, actor_id=str(current_user.id)
    )

    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    await db.commit()
    return task_to_response(task)


# Assignment
@router.post("/{task_id}/assign", response_model=SprintTaskResponse)
async def assign_task(
    sprint_id: str,
    task_id: str,
    data: SprintTaskAssign,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Assign a task to a developer."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)
    task = await task_service.assign_task(
        task_id=task_id,
        developer_id=data.developer_id,
        reason=data.reason,
        confidence=data.confidence,
        actor_id=str(current_user.id),
    )

    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    await db.commit()
    return task_to_response(task)


@router.delete("/{task_id}/assign", response_model=SprintTaskResponse)
async def unassign_task(
    sprint_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove assignment from a task."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)
    task = await task_service.unassign_task(task_id, actor_id=str(current_user.id))

    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    await db.commit()
    return task_to_response(task)


# Sync from source
@router.post("/{task_id}/sync", response_model=SprintTaskResponse)
async def sync_task(
    sprint_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Sync a task's data from its external source."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)
    task = await task_service.sync_task_from_source(task_id)

    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    await db.commit()
    return task_to_response(task)


# Activity Log
def activity_to_response(activity) -> TaskActivityResponse:
    """Convert TaskActivity model to response schema."""
    actor = activity.actor
    return TaskActivityResponse(
        id=str(activity.id),
        task_id=str(activity.task_id),
        action=activity.action,
        actor_id=str(activity.actor_id) if activity.actor_id else None,
        actor_name=actor.name if actor else None,
        actor_avatar_url=actor.avatar_url if actor else None,
        field_name=activity.field_name,
        old_value=activity.old_value,
        new_value=activity.new_value,
        comment=activity.comment,
        metadata=activity.activity_metadata or {},
        created_at=activity.created_at,
    )


@router.get("/{task_id}/activities", response_model=TaskActivityListResponse)
async def get_task_activities(
    sprint_id: str,
    task_id: str,
    limit: int = 50,
    offset: int = 0,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get the activity log for a task."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")

    task_service = SprintTaskService(db)

    # Verify task exists and belongs to sprint
    task = await task_service.get_task(task_id)
    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    activities, total = await task_service.get_task_activities(
        task_id=task_id,
        limit=limit,
        offset=offset,
    )

    return TaskActivityListResponse(
        activities=[activity_to_response(a) for a in activities],
        total=total,
    )


@router.post("/{task_id}/comments", response_model=TaskActivityResponse, status_code=status.HTTP_201_CREATED)
async def add_comment(
    sprint_id: str,
    task_id: str,
    data: TaskActivityCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a comment to a task."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)

    # Verify task exists and belongs to sprint
    task = await task_service.get_task(task_id)
    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    activity = await task_service.add_comment(
        task_id=task_id,
        comment=data.comment,
        actor_id=str(current_user.id),
    )

    await db.commit()
    await db.refresh(activity)
    return activity_to_response(activity)


# ============================================================================
# Export Endpoints
# ============================================================================

from fastapi.responses import StreamingResponse
from aexy.schemas.analytics import ExportFormat
from aexy.services.export_service import ExportService
import io


@router.get("/export/{format}")
async def export_sprint_tasks(
    sprint_id: str,
    format: ExportFormat,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Export sprint tasks in specified format (csv, xlsx, pdf, json)."""
    task_service = SprintTaskService(db)
    sprint_service = SprintService(db)

    # Get sprint info
    sprint = await sprint_service.get_sprint(sprint_id)
    if not sprint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sprint not found",
        )

    # Check workspace permission
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(str(sprint.workspace_id), str(current_user.id), "viewer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this sprint",
        )

    # Get all tasks for the sprint
    tasks = await task_service.get_sprint_tasks(sprint_id)

    # Calculate stats
    stats = {
        "total": len(tasks),
        "completed": len([t for t in tasks if t.status == "done"]),
        "in_progress": len([t for t in tasks if t.status == "in_progress"]),
        "todo": len([t for t in tasks if t.status in ["todo", "backlog"]]),
        "review": len([t for t in tasks if t.status == "review"]),
        "total_points": sum(t.story_points or 0 for t in tasks),
        "completed_points": sum(t.story_points or 0 for t in tasks if t.status == "done"),
    }

    # Convert tasks to export format
    export_tasks = []
    for task in tasks:
        assignee = task.assignee
        epic = task.epic if hasattr(task, "epic") else None
        export_tasks.append({
            "id": str(task.id),
            "title": task.title,
            "description": task.description or "",
            "status": task.status,
            "priority": task.priority,
            "story_points": task.story_points,
            "labels": task.labels or [],
            "assignee_id": str(task.assignee_id) if task.assignee_id else None,
            "assignee_name": assignee.name if assignee else None,
            "epic_id": str(task.epic_id) if task.epic_id else None,
            "epic_title": epic.title if epic else None,
            "created_at": task.created_at.isoformat() if task.created_at else None,
            "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        })

    data = {
        "title": f"Sprint: {sprint.name}",
        "sprint_name": sprint.name,
        "sprint_id": str(sprint.id),
        "stats": stats,
        "tasks": export_tasks,
    }

    # Use export service
    from aexy.schemas.analytics import ExportRequest, ExportType
    export_service = ExportService()
    request = ExportRequest(
        export_type=ExportType.SPRINT_TASKS,
        format=format,
        config={"sprint_id": sprint_id},
    )

    job = await export_service.create_export_job(request, str(current_user.id), db)
    await db.commit()

    completed_job = await export_service.process_export(job.id, db, data)
    await db.commit()

    if not completed_job or not completed_job.file_path:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate export",
        )

    # Return the file
    from pathlib import Path
    file_path = Path(completed_job.file_path)

    content_types = {
        ExportFormat.CSV: "text/csv",
        ExportFormat.JSON: "application/json",
        ExportFormat.PDF: "application/pdf",
        ExportFormat.XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
    extensions = {
        ExportFormat.CSV: "csv",
        ExportFormat.JSON: "json",
        ExportFormat.PDF: "pdf",
        ExportFormat.XLSX: "xlsx",
    }

    filename = f"{sprint.name.replace(' ', '_')}_tasks.{extensions[format]}"

    with open(file_path, "rb") as f:
        content = f.read()

    return StreamingResponse(
        io.BytesIO(content),
        media_type=content_types[format],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Attachments ────────────────────────────────────────────────────────────
@router.post(
    "/{task_id}/attachments",
    response_model=TaskAttachmentListResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_task_attachments(
    sprint_id: str,
    task_id: str,
    files: list[UploadFile] = File(...),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Upload one or more file attachments to a task."""
    from aexy.services.task_attachment_service import upload_attachments_for_task

    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)
    task = await task_service.get_task(task_id)
    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    return await upload_attachments_for_task(db, task, files, current_user)


@router.get(
    "/{task_id}/attachments",
    response_model=TaskAttachmentListResponse,
)
async def list_task_attachments(
    sprint_id: str,
    task_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List attachments on a task."""
    from aexy.services.task_attachment_service import list_attachments_for_task

    await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")

    task_service = SprintTaskService(db)
    task = await task_service.get_task(task_id)
    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    return await list_attachments_for_task(db, task)


@router.delete(
    "/{task_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_task_attachment(
    sprint_id: str,
    task_id: str,
    attachment_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a task attachment."""
    from aexy.services.task_attachment_service import delete_attachment_for_task

    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)
    task = await task_service.get_task(task_id)
    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    await delete_attachment_for_task(db, task, attachment_id, actor_id=str(current_user.id))
    return None
