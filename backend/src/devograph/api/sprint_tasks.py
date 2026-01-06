"""Sprint Tasks API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.core.database import get_db
from devograph.api.developers import get_current_developer
from devograph.models.developer import Developer
from devograph.schemas.sprint import (
    SprintTaskCreate,
    SprintTaskUpdate,
    SprintTaskStatusUpdate,
    SprintTaskAssign,
    SprintTaskBulkAssign,
    SprintTaskResponse,
    TaskImportRequest,
    TaskImportResponse,
    TaskActivityCreate,
    TaskActivityResponse,
    TaskActivityListResponse,
)
from devograph.services.sprint_service import SprintService
from devograph.services.sprint_task_service import SprintTaskService
from devograph.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/sprints/{sprint_id}/tasks", tags=["Sprint Tasks"])


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

    from devograph.services.sprint_planning_service import SprintPlanningService

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

    from devograph.services.sprint_planning_service import SprintPlanningService

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

    from devograph.services.sprint_planning_service import SprintPlanningService

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

    from devograph.services.sprint_planning_service import SprintPlanningService

    planning_service = SprintPlanningService(db)
    result = await planning_service.predict_completion(sprint_id)

    return {
        "predicted_completion_rate": result.predicted_completion_rate,
        "confidence": result.confidence,
        "risk_factors": result.risk_factors,
        "at_risk_tasks": result.at_risk_tasks,
        "recommendations": result.recommendations,
    }


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

    # Build kwargs, handling epic_id specially to allow setting to None
    update_kwargs = {
        "task_id": task_id,
        "title": data.title,
        "description": data.description,
        "story_points": data.story_points,
        "priority": data.priority,
        "status": data.status,
        "labels": data.labels,
    }
    # Only pass epic_id if it was explicitly provided in the request
    if data.epic_id is not None or "epic_id" in data.model_fields_set:
        update_kwargs["epic_id"] = data.epic_id

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
    """Remove a task from a sprint."""
    await get_sprint_and_check_permission(sprint_id, current_user, db, "member")

    task_service = SprintTaskService(db)

    # Verify task belongs to sprint
    task = await task_service.get_task(task_id)
    if not task or task.sprint_id != sprint_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    await task_service.remove_task(task_id)
    await db.commit()


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
    task = await task_service.unassign_task(task_id)

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
