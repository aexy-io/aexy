"""User Story API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import uuid4

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.models.story import UserStory, StoryActivity
from aexy.models.epic import Epic
from aexy.models.release import Release
from aexy.models.sprint import SprintTask
from aexy.schemas.story import (
    StoryCreate,
    StoryUpdate,
    StoryResponse,
    StoryListResponse,
    StoryDetailResponse,
    StoryReadyRequest,
    StoryAcceptRequest,
    StoryRejectRequest,
    StoryAddTasksRequest,
    StoryAddTasksResponse,
    StoryProgressResponse,
    AcceptanceCriterion,
    AcceptanceCriterionCreate,
    TaskBriefResponse,
)
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}/stories", tags=["User Stories"])


async def check_workspace_permission(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace stories."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this workspace",
        )


async def generate_story_key(db: AsyncSession, workspace_id: str) -> str:
    """Generate a unique story key for the workspace."""
    result = await db.execute(
        select(func.count(UserStory.id)).where(UserStory.workspace_id == workspace_id)
    )
    count = result.scalar() or 0
    return f"STORY-{count + 1:03d}"


def story_to_response(story: UserStory) -> StoryResponse:
    """Convert UserStory model to response schema."""
    return StoryResponse(
        id=str(story.id),
        workspace_id=str(story.workspace_id),
        key=story.key,
        title=story.title,
        as_a=story.as_a,
        i_want=story.i_want,
        so_that=story.so_that,
        description=story.description,
        description_json=story.description_json,
        acceptance_criteria=[
            AcceptanceCriterion(**ac) for ac in (story.acceptance_criteria or [])
        ],
        story_points=story.story_points,
        estimated_hours=story.estimated_hours,
        status=story.status,
        priority=story.priority,
        position=story.position,
        color=story.color,
        epic_id=str(story.epic_id) if story.epic_id else None,
        epic_key=story.epic.key if story.epic else None,
        epic_title=story.epic.title if story.epic else None,
        release_id=str(story.release_id) if story.release_id else None,
        release_name=story.release.name if story.release else None,
        reporter_id=str(story.reporter_id) if story.reporter_id else None,
        reporter_name=story.reporter.name if story.reporter else None,
        owner_id=str(story.owner_id) if story.owner_id else None,
        owner_name=story.owner.name if story.owner else None,
        owner_avatar_url=story.owner.avatar_url if story.owner else None,
        labels=story.labels or [],
        design_links=story.design_links or [],
        spec_links=story.spec_links or [],
        total_tasks=story.total_tasks,
        completed_tasks=story.completed_tasks,
        total_story_points=story.total_story_points,
        completed_story_points=story.completed_story_points,
        progress_percentage=story.progress_percentage,
        start_date=story.start_date,
        target_date=story.target_date,
        accepted_at=story.accepted_at,
        source_type=story.source_type or "manual",
        source_id=story.source_id,
        source_url=story.source_url,
        created_at=story.created_at,
        updated_at=story.updated_at,
    )


def story_to_list_response(story: UserStory) -> StoryListResponse:
    """Convert UserStory model to list response schema."""
    criteria = story.acceptance_criteria or []
    completed_criteria = sum(1 for ac in criteria if ac.get("completed", False))

    return StoryListResponse(
        id=str(story.id),
        workspace_id=str(story.workspace_id),
        key=story.key,
        title=story.title,
        as_a=story.as_a,
        i_want=story.i_want,
        status=story.status,
        priority=story.priority,
        color=story.color,
        story_points=story.story_points,
        epic_id=str(story.epic_id) if story.epic_id else None,
        epic_key=story.epic.key if story.epic else None,
        release_id=str(story.release_id) if story.release_id else None,
        release_name=story.release.name if story.release else None,
        owner_id=str(story.owner_id) if story.owner_id else None,
        owner_name=story.owner.name if story.owner else None,
        target_date=story.target_date,
        total_tasks=story.total_tasks,
        completed_tasks=story.completed_tasks,
        progress_percentage=story.progress_percentage,
        acceptance_criteria_count=len(criteria),
        acceptance_criteria_completed=completed_criteria,
    )


# ==================== Story CRUD ====================

@router.get("", response_model=list[StoryListResponse])
async def list_stories(
    workspace_id: str,
    status: str | None = None,
    priority: str | None = None,
    epic_id: str | None = None,
    release_id: str | None = None,
    owner_id: str | None = None,
    include_archived: bool = False,
    search: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List user stories for a workspace."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    query = select(UserStory).where(UserStory.workspace_id == workspace_id)

    if status:
        query = query.where(UserStory.status == status)
    if priority:
        query = query.where(UserStory.priority == priority)
    if epic_id:
        query = query.where(UserStory.epic_id == epic_id)
    if release_id:
        query = query.where(UserStory.release_id == release_id)
    if owner_id:
        query = query.where(UserStory.owner_id == owner_id)
    if not include_archived:
        query = query.where(UserStory.is_archived == False)
    if search:
        query = query.where(
            UserStory.title.ilike(f"%{search}%") |
            UserStory.key.ilike(f"%{search}%")
        )

    query = query.order_by(UserStory.position, UserStory.created_at.desc())
    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    stories = result.scalars().all()

    return [story_to_list_response(story) for story in stories]


@router.post("", response_model=StoryResponse, status_code=status.HTTP_201_CREATED)
async def create_story(
    workspace_id: str,
    data: StoryCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user story."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    key = await generate_story_key(db, workspace_id)

    # Convert acceptance criteria to proper format
    acceptance_criteria = [
        {
            "id": str(uuid4()),
            "description": ac.description,
            "completed": False,
            "completed_at": None,
            "completed_by": None,
        }
        for ac in data.acceptance_criteria
    ]

    story = UserStory(
        workspace_id=workspace_id,
        key=key,
        title=data.title,
        as_a=data.as_a,
        i_want=data.i_want,
        so_that=data.so_that,
        description=data.description,
        description_json=data.description_json,
        acceptance_criteria=acceptance_criteria,
        story_points=data.story_points,
        estimated_hours=data.estimated_hours,
        status=data.status,
        priority=data.priority,
        color=data.color,
        epic_id=data.epic_id,
        release_id=data.release_id,
        owner_id=data.owner_id,
        reporter_id=str(current_user.id),
        start_date=data.start_date,
        target_date=data.target_date,
        labels=data.labels,
        design_links=[link.model_dump() for link in data.design_links],
        spec_links=[link.model_dump() for link in data.spec_links],
        source_type=data.source_type,
        source_id=data.source_id,
        source_url=data.source_url,
    )

    db.add(story)

    # Create activity log
    activity = StoryActivity(
        story_id=story.id,
        action="created",
        actor_id=str(current_user.id),
    )
    db.add(activity)

    await db.commit()
    await db.refresh(story)

    return story_to_response(story)


@router.get("/{story_id}", response_model=StoryResponse)
async def get_story(
    workspace_id: str,
    story_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a story by ID."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    result = await db.execute(
        select(UserStory).where(UserStory.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found",
        )

    if str(story.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found in this workspace",
        )

    return story_to_response(story)


@router.get("/{story_id}/detail", response_model=StoryDetailResponse)
async def get_story_detail(
    workspace_id: str,
    story_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get story with detailed breakdown."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    result = await db.execute(
        select(UserStory).where(UserStory.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story or str(story.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found",
        )

    # Get tasks by status
    tasks_result = await db.execute(
        select(SprintTask.status, func.count(SprintTask.id))
        .where(SprintTask.story_id == story_id)
        .group_by(SprintTask.status)
    )
    tasks_by_status = {row[0]: row[1] for row in tasks_result.all()}

    # Get task list
    tasks_result = await db.execute(
        select(SprintTask).where(SprintTask.story_id == story_id)
    )
    tasks = tasks_result.scalars().all()
    task_briefs = [
        TaskBriefResponse(
            id=str(task.id),
            title=task.title,
            status=task.status,
            priority=task.priority,
            story_points=task.story_points,
            assignee_id=str(task.assignee_id) if task.assignee_id else None,
            assignee_name=task.assignee.name if task.assignee else None,
        )
        for task in tasks
    ]

    # Get activity count
    activity_result = await db.execute(
        select(func.count(StoryActivity.id)).where(StoryActivity.story_id == story_id)
    )
    activity_count = activity_result.scalar() or 0

    response = story_to_response(story)
    return StoryDetailResponse(
        **response.model_dump(),
        tasks_by_status=tasks_by_status,
        tasks=task_briefs,
        activity_count=activity_count,
        blocked_by_count=0,  # TODO: Implement from dependencies
        blocking_count=0,
    )


@router.patch("/{story_id}", response_model=StoryResponse)
async def update_story(
    workspace_id: str,
    story_id: str,
    data: StoryUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a story."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(
        select(UserStory).where(UserStory.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story or str(story.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found",
        )

    update_data = data.model_dump(exclude_unset=True)

    # Handle design/spec links conversion
    if "design_links" in update_data and update_data["design_links"]:
        update_data["design_links"] = [link.model_dump() if hasattr(link, "model_dump") else link for link in update_data["design_links"]]
    if "spec_links" in update_data and update_data["spec_links"]:
        update_data["spec_links"] = [link.model_dump() if hasattr(link, "model_dump") else link for link in update_data["spec_links"]]

    for field, value in update_data.items():
        old_value = getattr(story, field, None)
        setattr(story, field, value)

        # Log significant changes
        if field in ("status", "priority", "owner_id", "story_points"):
            activity = StoryActivity(
                story_id=story_id,
                action="updated",
                actor_id=str(current_user.id),
                field_name=field,
                old_value=str(old_value) if old_value else None,
                new_value=str(value) if value else None,
            )
            db.add(activity)

    await db.commit()
    await db.refresh(story)

    return story_to_response(story)


@router.delete("/{story_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_story(
    workspace_id: str,
    story_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a story."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    result = await db.execute(
        select(UserStory).where(UserStory.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story or str(story.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found",
        )

    await db.delete(story)
    await db.commit()


# ==================== Status Transitions ====================

@router.post("/{story_id}/ready", response_model=StoryResponse)
async def mark_story_ready(
    workspace_id: str,
    story_id: str,
    data: StoryReadyRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Mark a story as ready for development."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(
        select(UserStory).where(UserStory.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story or str(story.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found",
        )

    old_status = story.status
    story.status = "ready"

    activity = StoryActivity(
        story_id=story_id,
        action="status_changed",
        actor_id=str(current_user.id),
        field_name="status",
        old_value=old_status,
        new_value="ready",
        comment=data.notes,
    )
    db.add(activity)

    await db.commit()
    await db.refresh(story)

    return story_to_response(story)


@router.post("/{story_id}/accept", response_model=StoryResponse)
async def accept_story(
    workspace_id: str,
    story_id: str,
    data: StoryAcceptRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Accept a story (mark as done)."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(
        select(UserStory).where(UserStory.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story or str(story.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found",
        )

    from datetime import datetime, timezone

    old_status = story.status
    story.status = "accepted"
    story.accepted_at = datetime.now(timezone.utc)

    activity = StoryActivity(
        story_id=story_id,
        action="accepted",
        actor_id=str(current_user.id),
        field_name="status",
        old_value=old_status,
        new_value="accepted",
        comment=data.notes,
    )
    db.add(activity)

    await db.commit()
    await db.refresh(story)

    return story_to_response(story)


@router.post("/{story_id}/reject", response_model=StoryResponse)
async def reject_story(
    workspace_id: str,
    story_id: str,
    data: StoryRejectRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Reject a story."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(
        select(UserStory).where(UserStory.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story or str(story.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found",
        )

    old_status = story.status
    story.status = "rejected"

    activity = StoryActivity(
        story_id=story_id,
        action="rejected",
        actor_id=str(current_user.id),
        field_name="status",
        old_value=old_status,
        new_value="rejected",
        comment=data.reason,
    )
    db.add(activity)

    await db.commit()
    await db.refresh(story)

    return story_to_response(story)


# ==================== Acceptance Criteria ====================

@router.post("/{story_id}/acceptance-criteria", response_model=StoryResponse)
async def add_acceptance_criterion(
    workspace_id: str,
    story_id: str,
    data: AcceptanceCriterionCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add an acceptance criterion to a story."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(
        select(UserStory).where(UserStory.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story or str(story.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found",
        )

    criteria = story.acceptance_criteria or []
    new_criterion = {
        "id": str(uuid4()),
        "description": data.description,
        "completed": False,
        "completed_at": None,
        "completed_by": None,
    }
    criteria.append(new_criterion)
    story.acceptance_criteria = criteria

    activity = StoryActivity(
        story_id=story_id,
        action="criteria_added",
        actor_id=str(current_user.id),
        new_value=data.description,
    )
    db.add(activity)

    await db.commit()
    await db.refresh(story)

    return story_to_response(story)


@router.post("/{story_id}/acceptance-criteria/{criterion_id}/toggle", response_model=StoryResponse)
async def toggle_acceptance_criterion(
    workspace_id: str,
    story_id: str,
    criterion_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Toggle an acceptance criterion completion status."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(
        select(UserStory).where(UserStory.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story or str(story.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found",
        )

    criteria = story.acceptance_criteria or []
    updated = False

    from datetime import datetime, timezone

    for criterion in criteria:
        if criterion.get("id") == criterion_id:
            criterion["completed"] = not criterion.get("completed", False)
            if criterion["completed"]:
                criterion["completed_at"] = datetime.now(timezone.utc).isoformat()
                criterion["completed_by"] = str(current_user.id)
            else:
                criterion["completed_at"] = None
                criterion["completed_by"] = None
            updated = True
            break

    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Acceptance criterion not found",
        )

    story.acceptance_criteria = criteria

    activity = StoryActivity(
        story_id=story_id,
        action="criteria_completed" if criterion["completed"] else "criteria_uncompleted",
        actor_id=str(current_user.id),
        new_value=criterion.get("description"),
    )
    db.add(activity)

    await db.commit()
    await db.refresh(story)

    return story_to_response(story)


# ==================== Task Management ====================

@router.get("/{story_id}/tasks", response_model=list[TaskBriefResponse])
async def get_story_tasks(
    workspace_id: str,
    story_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get tasks linked to a story."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    # Verify story exists
    result = await db.execute(
        select(UserStory).where(UserStory.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story or str(story.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found",
        )

    tasks_result = await db.execute(
        select(SprintTask).where(SprintTask.story_id == story_id)
    )
    tasks = tasks_result.scalars().all()

    return [
        TaskBriefResponse(
            id=str(task.id),
            title=task.title,
            status=task.status,
            priority=task.priority,
            story_points=task.story_points,
            assignee_id=str(task.assignee_id) if task.assignee_id else None,
            assignee_name=task.assignee.name if task.assignee else None,
        )
        for task in tasks
    ]


@router.post("/{story_id}/tasks", response_model=StoryAddTasksResponse)
async def add_tasks_to_story(
    workspace_id: str,
    story_id: str,
    data: StoryAddTasksRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add tasks to a story."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    # Verify story exists
    result = await db.execute(
        select(UserStory).where(UserStory.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story or str(story.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found",
        )

    added_ids = []
    already_in_story = 0

    for task_id in data.task_ids:
        task_result = await db.execute(
            select(SprintTask).where(SprintTask.id == task_id)
        )
        task = task_result.scalar_one_or_none()

        if task:
            if task.story_id == story_id:
                already_in_story += 1
            else:
                task.story_id = story_id
                added_ids.append(task_id)

    # Update story metrics
    await _update_story_metrics(db, story)

    await db.commit()

    return StoryAddTasksResponse(
        added_count=len(added_ids),
        already_in_story=already_in_story,
        task_ids=added_ids,
    )


async def _update_story_metrics(db: AsyncSession, story: UserStory) -> None:
    """Update cached metrics on a story based on its tasks."""
    result = await db.execute(
        select(
            func.count(SprintTask.id),
            func.count(SprintTask.id).filter(SprintTask.status == "done"),
            func.coalesce(func.sum(SprintTask.story_points), 0),
            func.coalesce(
                func.sum(SprintTask.story_points).filter(SprintTask.status == "done"), 0
            ),
        ).where(SprintTask.story_id == story.id)
    )
    row = result.one()

    story.total_tasks = row[0]
    story.completed_tasks = row[1]
    story.total_story_points = row[2] or 0
    story.completed_story_points = row[3] or 0

    if story.total_tasks > 0:
        story.progress_percentage = (story.completed_tasks / story.total_tasks) * 100
    else:
        story.progress_percentage = 0.0


# ==================== Progress ====================

@router.get("/{story_id}/progress", response_model=StoryProgressResponse)
async def get_story_progress(
    workspace_id: str,
    story_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get progress metrics for a story."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    result = await db.execute(
        select(UserStory).where(UserStory.id == story_id)
    )
    story = result.scalar_one_or_none()

    if not story or str(story.workspace_id) != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Story not found",
        )

    # Get task breakdown
    tasks_result = await db.execute(
        select(SprintTask.status, func.count(SprintTask.id), func.coalesce(func.sum(SprintTask.story_points), 0))
        .where(SprintTask.story_id == story_id)
        .group_by(SprintTask.status)
    )
    tasks_by_status = {row[0]: {"count": row[1], "points": row[2]} for row in tasks_result.all()}

    total_tasks = sum(d["count"] for d in tasks_by_status.values())
    completed_tasks = tasks_by_status.get("done", {}).get("count", 0)
    in_progress_tasks = tasks_by_status.get("in_progress", {}).get("count", 0)
    blocked_tasks = 0  # TODO: Implement from dependencies

    total_points = sum(d["points"] for d in tasks_by_status.values())
    completed_points = tasks_by_status.get("done", {}).get("points", 0)

    criteria = story.acceptance_criteria or []
    total_criteria = len(criteria)
    completed_criteria = sum(1 for c in criteria if c.get("completed", False))

    task_pct = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
    criteria_pct = (completed_criteria / total_criteria * 100) if total_criteria > 0 else 0

    return StoryProgressResponse(
        story_id=story_id,
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        in_progress_tasks=in_progress_tasks,
        blocked_tasks=blocked_tasks,
        total_story_points=total_points,
        completed_story_points=completed_points,
        remaining_story_points=total_points - completed_points,
        total_criteria=total_criteria,
        completed_criteria=completed_criteria,
        task_completion_percentage=task_pct,
        criteria_completion_percentage=criteria_pct,
    )
