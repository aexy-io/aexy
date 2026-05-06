"""Sprint Tasks API endpoints."""

import logging
import re
from uuid import uuid4

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
    TaskAttachmentResponse,
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
from aexy.services.storage_quota_service import StorageQuotaService
from aexy.services.storage_service import get_storage_service
from aexy.services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)
ATTACHMENTS_PREFIX = "task-attachments"
SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")

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


def task_to_response(task) -> SprintTaskResponse:
    """Convert SprintTask model to response schema."""
    assignee = task.assignee
    subtasks_count = len(task.subtasks) if task.subtasks else 0
    attachments = [
        TaskAttachmentResponse(
            id=str(a.id),
            task_id=str(a.task_id),
            file_name=a.file_name,
            file_url=a.file_url,
            file_size=a.file_size,
            content_type=a.content_type,
            uploaded_by_id=str(a.uploaded_by_id) if a.uploaded_by_id else None,
            uploaded_at=a.uploaded_at,
        )
        for a in (task.attachments or [])
    ] if hasattr(task, "attachments") else []
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
        work_started_at=task.work_started_at,
        cycle_time_hours=task.cycle_time_hours,
        lead_time_hours=task.lead_time_hours,
        contributes_to_goal=task.contributes_to_goal,
        carried_over_from_sprint_id=str(task.carried_over_from_sprint_id) if task.carried_over_from_sprint_id else None,
        mentioned_user_ids=task.mentioned_user_ids or [],
        mentioned_file_paths=task.mentioned_file_paths or [],
        is_archived=task.is_archived,
        start_date=task.start_date,
        end_date=task.end_date,
        estimated_hours=task.estimated_hours,
        attachments=attachments,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


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
    tasks = await task_service.bulk_update_status(data.task_ids, data.status)

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
    tasks = await task_service.bulk_move_to_sprint(data.task_ids, data.target_sprint_id)

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
    limit: int = 20,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Search synced workspace pull requests available for manual task linking."""
    sprint = await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")
    limit = min(max(limit, 1), 50)

    conditions = [WorkspaceMember.workspace_id == sprint.workspace_id]
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
        .order_by(PullRequest.updated_at_github.desc().nullslast(), PullRequest.created_at_github.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [pull_request_to_summary(pr) for pr in result.scalars().unique().all()]


@router.get("/github/issues", response_model=list[GitHubIssueSummary])
async def search_github_issues_for_task_linking(
    sprint_id: str,
    query: str | None = None,
    limit: int = 20,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Search imported GitHub issues available for manual task linking."""
    sprint = await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")
    service = GitHubTaskSyncService(db)
    issues = await service.search_imported_issues(
        team_id=str(sprint.team_id),
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
    # Only pass epic_id if it was explicitly provided in the request
    if data.epic_id is not None or "epic_id" in data.model_fields_set:
        update_kwargs["epic_id"] = data.epic_id
    # Only pass assignee_id if it was explicitly provided in the request
    if data.assignee_id is not None or "assignee_id" in data.model_fields_set:
        update_kwargs["assignee_id"] = data.assignee_id
    # Only pass contributes_to_goal if it was explicitly provided
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

    await task_service.archive_task(task_id)
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

    restored = await task_service.unarchive_task(task_id)
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
    task = await task_service.update_task_status(task_id, data.status)

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
def _attachment_to_response(
    attachment, ai_row: object | None = None
) -> TaskAttachmentResponse:
    from aexy.models.file_metadata import SOURCE_TASK_ATTACHMENT
    from aexy.schemas.file_metadata import metadata_to_ai_response

    return TaskAttachmentResponse(
        id=str(attachment.id),
        task_id=str(attachment.task_id),
        file_name=attachment.file_name,
        file_url=attachment.file_url,
        file_size=attachment.file_size,
        content_type=attachment.content_type,
        uploaded_by_id=str(attachment.uploaded_by_id) if attachment.uploaded_by_id else None,
        uploaded_at=attachment.uploaded_at,
        ai=metadata_to_ai_response(SOURCE_TASK_ATTACHMENT, str(attachment.id), ai_row),
    )


async def _attachments_with_ai(db, attachments) -> list[TaskAttachmentResponse]:
    """Build attachment responses with their `ai` block populated in one
    extra query (no N+1)."""
    from aexy.models.file_metadata import SOURCE_TASK_ATTACHMENT
    from aexy.services.file_metadata_service import get_metadata_batch

    if not attachments:
        return []
    ids = [str(a.id) for a in attachments]
    ai_map = await get_metadata_batch(db, SOURCE_TASK_ATTACHMENT, ids)
    return [_attachment_to_response(a, ai_map.get(str(a.id))) for a in attachments]


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
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)
    task = await task_service.get_task(task_id)
    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files provided",
        )

    storage = get_storage_service()
    if not storage.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File storage is not configured on this deployment",
        )

    # Read every file into memory up front so we can quota-check the batch
    # before persisting anything. Loading is unavoidable because we then
    # `put_object` to S3 with the bytes; making a second pass wouldn't help.
    bodies: list[tuple[UploadFile, bytes]] = []
    total_bytes = 0
    for upload in files:
        body = await upload.read()
        if not body:
            continue
        bodies.append((upload, body))
        total_bytes += len(body)

    if not bodies:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No non-empty files provided",
        )

    quota = StorageQuotaService(db)
    if task.workspace_id:
        await quota.assert_storage_available(
            workspace_id=str(task.workspace_id),
            incoming_bytes=total_bytes,
            developer_id=str(current_user.id),
        )

    created: list = []
    for upload, body in bodies:
        original_name = upload.filename or "attachment"
        safe_name = SAFE_FILENAME_RE.sub("_", original_name) or "attachment"
        key = f"{ATTACHMENTS_PREFIX}/{task_id}/{uuid4().hex}_{safe_name}"
        content_type = upload.content_type or "application/octet-stream"
        ok = storage.put_object(key=key, data=body, content_type=content_type)
        if not ok:
            logger.error("Failed to upload attachment %s for task %s", original_name, task_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload attachment '{original_name}'",
            )

        attachment = await task_service.add_attachment(
            task_id=task_id,
            file_name=original_name,
            file_url=storage.get_object_url(key),
            file_size=len(body),
            content_type=content_type,
            uploaded_by_id=str(current_user.id),
        )
        created.append(attachment)

    await db.commit()
    if task.workspace_id:
        await quota.invalidate_workspace_usage(str(task.workspace_id))

    # Fire-and-forget AI metadata pipeline per attachment. Failure here must
    # never block the upload — the file is already persisted.
    from aexy.models.file_metadata import SOURCE_TASK_ATTACHMENT
    from aexy.temporal.activities.file_metadata import ExtractFileMetadataInput
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue

    for attachment in created:
        try:
            await dispatch(
                "extract_file_ai_metadata",
                ExtractFileMetadataInput(
                    source_type=SOURCE_TASK_ATTACHMENT,
                    source_id=str(attachment.id),
                ),
                task_queue=TaskQueue.ANALYSIS,
                workflow_id=f"file-ai-task_attachment-{attachment.id}",
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "Failed to dispatch file AI pipeline for attachment %s: %s",
                attachment.id, exc,
            )

    return TaskAttachmentListResponse(
        attachments=await _attachments_with_ai(db, created),
    )


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
    await get_sprint_and_check_permission(sprint_id, current_user, db, "viewer")

    task_service = SprintTaskService(db)
    task = await task_service.get_task(task_id)
    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    attachments = await task_service.list_attachments(task_id)
    return TaskAttachmentListResponse(
        attachments=await _attachments_with_ai(db, attachments),
    )


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
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)
    task = await task_service.get_task(task_id)
    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    attachment = await task_service.get_attachment(attachment_id)
    if not attachment or str(attachment.task_id) != task_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found",
        )

    await task_service.delete_attachment(attachment_id)
    await db.commit()
    return None
