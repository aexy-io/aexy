"""Goal/OKR API endpoints."""

from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from uuid import uuid4

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.api.entity_activity import create_entity_activity
from aexy.models.developer import Developer
from aexy.models.goal import Goal, GoalProject, GoalEpic
from aexy.models.epic import Epic
from aexy.schemas.goal import (
    GoalCreate,
    GoalUpdate,
    GoalResponse,
    GoalListResponse,
    GoalDetailResponse,
    GoalCheckIn,
    GoalCheckInCreate,
    GoalProgressUpdateRequest,
    GoalConfidenceUpdateRequest,
    GoalLinkProjectRequest,
    GoalLinkEpicRequest,
    KeyResultCreate,
    GoalDashboardResponse,
    LinkedProjectInfo,
    LinkedEpicInfo,
)
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}/goals", tags=["Goals"])


async def check_workspace_permission(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace goals."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this workspace",
        )


async def generate_goal_key(db: AsyncSession, workspace_id: str, goal_type: str) -> str:
    """Generate a unique goal key for the workspace."""
    prefix = "OKR" if goal_type == "key_result" else "GOAL"
    result = await db.execute(
        select(func.count(Goal.id)).where(Goal.workspace_id == workspace_id)
    )
    count = result.scalar() or 0
    return f"{prefix}-{count + 1:03d}"


def goal_to_response(goal: Goal, key_results_count: int = 0, linked_projects_count: int = 0, linked_epics_count: int = 0) -> GoalResponse:
    """Convert Goal model to response schema."""
    return GoalResponse(
        id=str(goal.id),
        workspace_id=str(goal.workspace_id),
        key=goal.key,
        title=goal.title,
        description=goal.description,
        goal_type=goal.goal_type,
        parent_goal_id=str(goal.parent_goal_id) if goal.parent_goal_id else None,
        parent_goal_title=goal.parent_goal.title if goal.parent_goal else None,
        period_type=goal.period_type,
        period_label=goal.period_label,
        start_date=goal.start_date,
        end_date=goal.end_date,
        metric_type=goal.metric_type,
        target_value=goal.target_value,
        starting_value=goal.starting_value,
        current_value=goal.current_value,
        unit=goal.unit,
        progress_percentage=goal.progress_percentage,
        status=goal.status,
        confidence_level=goal.confidence_level,
        confidence_notes=goal.confidence_notes,
        color=goal.color,
        owner_id=str(goal.owner_id) if goal.owner_id else None,
        owner_name=goal.owner.name if goal.owner else None,
        owner_avatar_url=goal.owner.avatar_url if goal.owner else None,
        is_public=goal.is_public,
        weight=goal.weight,
        labels=goal.labels or [],
        check_ins=[GoalCheckIn(**ci) for ci in (goal.check_ins or [])],
        key_results_count=key_results_count,
        linked_projects_count=linked_projects_count,
        linked_epics_count=linked_epics_count,
        created_at=goal.created_at,
        updated_at=goal.updated_at,
    )


def goal_to_list_response(goal: Goal) -> GoalListResponse:
    """Convert Goal model to list response schema."""
    return GoalListResponse(
        id=str(goal.id),
        workspace_id=str(goal.workspace_id),
        key=goal.key,
        title=goal.title,
        goal_type=goal.goal_type,
        parent_goal_id=str(goal.parent_goal_id) if goal.parent_goal_id else None,
        status=goal.status,
        color=goal.color,
        progress_percentage=goal.progress_percentage,
        confidence_level=goal.confidence_level,
        period_label=goal.period_label,
        start_date=goal.start_date,
        end_date=goal.end_date,
        owner_id=str(goal.owner_id) if goal.owner_id else None,
        owner_name=goal.owner.name if goal.owner else None,
        key_results_count=len(goal.key_results) if goal.key_results else 0,
    )


# ==================== Goal CRUD ====================

@router.get("", response_model=list[GoalListResponse])
async def list_goals(
    workspace_id: str,
    goal_type: str | None = None,
    status: str | None = None,
    owner_id: str | None = None,
    period_label: str | None = None,
    parent_goal_id: str | None = None,
    top_level_only: bool = False,
    include_archived: bool = False,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List goals for a workspace."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    query = select(Goal).where(Goal.workspace_id == workspace_id).options(
        selectinload(Goal.owner),
        selectinload(Goal.key_results),
    )

    if goal_type:
        query = query.where(Goal.goal_type == goal_type)
    if status:
        query = query.where(Goal.status == status)
    if owner_id:
        query = query.where(Goal.owner_id == owner_id)
    if period_label:
        query = query.where(Goal.period_label == period_label)
    if parent_goal_id:
        query = query.where(Goal.parent_goal_id == parent_goal_id)
    if top_level_only:
        query = query.where(Goal.parent_goal_id == None)
    if not include_archived:
        query = query.where(Goal.is_archived == False)

    query = query.order_by(Goal.created_at.desc())
    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    goals = result.scalars().unique().all()

    return [goal_to_list_response(goal) for goal in goals]


# ==================== Dashboard ====================

@router.get("/dashboard", response_model=GoalDashboardResponse)
async def get_goal_dashboard(
    workspace_id: str,
    period_label: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get goal dashboard overview."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    query = select(Goal).where(
        Goal.workspace_id == workspace_id,
        Goal.is_archived == False
    ).options(
        selectinload(Goal.owner),
        selectinload(Goal.key_results),
    )

    if period_label:
        query = query.where(Goal.period_label == period_label)

    result = await db.execute(query)
    goals = result.scalars().unique().all()

    objectives = [g for g in goals if g.goal_type == "objective"]
    key_results = [g for g in goals if g.goal_type == "key_result"]

    on_track = sum(1 for g in goals if g.status == "on_track")
    at_risk = sum(1 for g in goals if g.status == "at_risk")
    behind = sum(1 for g in goals if g.status == "behind")
    achieved = sum(1 for g in goals if g.status == "achieved")

    avg_progress = sum(g.progress_percentage for g in goals) / len(goals) if goals else 0
    confidences = [g.confidence_level for g in goals if g.confidence_level]
    avg_confidence = sum(confidences) / len(confidences) if confidences else None

    return GoalDashboardResponse(
        workspace_id=workspace_id,
        period_label=period_label,
        total_objectives=len(objectives),
        total_key_results=len(key_results),
        on_track_count=on_track,
        at_risk_count=at_risk,
        behind_count=behind,
        achieved_count=achieved,
        avg_progress=avg_progress,
        avg_confidence=avg_confidence,
        objectives=[goal_to_list_response(o) for o in objectives],
    )


# ==================== Goal CRUD (continued) ====================

@router.post("", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(
    workspace_id: str,
    data: GoalCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new goal/OKR."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    key = await generate_goal_key(db, workspace_id, data.goal_type)

    goal = Goal(
        workspace_id=workspace_id,
        key=key,
        title=data.title,
        description=data.description,
        goal_type=data.goal_type,
        parent_goal_id=data.parent_goal_id,
        period_type=data.period_type,
        period_label=data.period_label,
        start_date=data.start_date,
        end_date=data.end_date,
        metric_type=data.metric_type,
        target_value=data.target_value,
        starting_value=data.starting_value,
        current_value=data.current_value or data.starting_value,
        unit=data.unit,
        status=data.status,
        confidence_level=data.confidence_level,
        confidence_notes=data.confidence_notes,
        color=data.color,
        owner_id=data.owner_id,
        is_public=data.is_public,
        weight=data.weight,
        labels=data.labels,
    )

    # Calculate initial progress
    _calculate_progress(goal)

    db.add(goal)
    await db.flush()  # Flush to generate the goal ID

    # Create activity record for creation
    await create_entity_activity(
        db=db,
        workspace_id=workspace_id,
        entity_type="goal",
        entity_id=str(goal.id),
        activity_type="created",
        actor_id=str(current_user.id),
        title=f"Created {goal.goal_type} '{goal.title}'",
    )

    await db.commit()
    await db.refresh(goal)

    return goal_to_response(goal)


@router.get("/{goal_id}", response_model=GoalResponse)
async def get_goal(
    workspace_id: str,
    goal_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a goal by ID."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    result = await db.execute(
        select(Goal).where(Goal.id == goal_id).options(
            selectinload(Goal.owner),
            selectinload(Goal.parent_goal),
            selectinload(Goal.key_results),
            selectinload(Goal.linked_projects),
            selectinload(Goal.linked_epics),
        )
    )
    goal = result.scalar_one_or_none()

    if not goal or str(goal.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    # Get counts
    kr_count = len(goal.key_results) if goal.key_results else 0
    lp_count = len(goal.linked_projects) if goal.linked_projects else 0
    le_count = len(goal.linked_epics) if goal.linked_epics else 0

    return goal_to_response(goal, kr_count, lp_count, le_count)


@router.get("/{goal_id}/detail", response_model=GoalDetailResponse)
async def get_goal_detail(
    workspace_id: str,
    goal_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get goal with key results and links."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    result = await db.execute(
        select(Goal).where(Goal.id == goal_id).options(
            selectinload(Goal.owner),
            selectinload(Goal.parent_goal),
            selectinload(Goal.key_results).selectinload(Goal.owner),
            selectinload(Goal.linked_projects).selectinload(GoalProject.project),
            selectinload(Goal.linked_epics).selectinload(GoalEpic.epic),
        )
    )
    goal = result.scalar_one_or_none()

    if not goal or str(goal.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    # Get key results
    key_results = [goal_to_list_response(kr) for kr in (goal.key_results or [])]

    # Get linked projects
    linked_projects = []
    for gp in (goal.linked_projects or []):
        if gp.project:
            linked_projects.append(LinkedProjectInfo(
                project_id=str(gp.project_id),
                project_name=gp.project.name,
                contribution_weight=gp.contribution_weight,
            ))

    # Get linked epics
    linked_epics = []
    for ge in (goal.linked_epics or []):
        if ge.epic:
            linked_epics.append(LinkedEpicInfo(
                epic_id=str(ge.epic_id),
                epic_key=ge.epic.key,
                epic_title=ge.epic.title,
                contribution_weight=ge.contribution_weight,
                progress_percentage=ge.epic.progress_percentage,
            ))

    # Calculate days remaining
    today = date.today()
    days_remaining = (goal.end_date - today).days if goal.end_date else None
    is_overdue = days_remaining is not None and days_remaining < 0

    response = goal_to_response(goal, len(key_results), len(linked_projects), len(linked_epics))
    return GoalDetailResponse(
        **response.model_dump(),
        key_results=key_results,
        linked_projects=linked_projects,
        linked_epics=linked_epics,
        days_remaining=days_remaining,
        is_overdue=is_overdue,
    )


@router.patch("/{goal_id}", response_model=GoalResponse)
async def update_goal(
    workspace_id: str,
    goal_id: str,
    data: GoalUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a goal."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = result.scalar_one_or_none()

    if not goal or str(goal.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    # Extract comment before processing update
    comment = data.comment
    update_data = data.model_dump(exclude_unset=True, exclude={"comment"})

    # Track changes for activity
    changes = {}
    old_status = goal.status

    for field, value in update_data.items():
        old_value = getattr(goal, field, None)
        if old_value != value:
            # Convert to string for JSON storage
            changes[field] = {
                "old": str(old_value) if old_value is not None else None,
                "new": str(value) if value is not None else None,
            }
        setattr(goal, field, value)

    # Recalculate progress if values changed
    if any(k in update_data for k in ["current_value", "target_value", "starting_value"]):
        _calculate_progress(goal)

    # Determine activity type
    activity_type = "updated"
    activity_title = None

    if "status" in changes and old_status != goal.status:
        activity_type = "status_changed"
        activity_title = f"Changed status from {old_status} to {goal.status}"
    elif "owner_id" in changes:
        activity_type = "assigned"
        activity_title = "Reassigned goal"
    elif "current_value" in changes or "progress_percentage" in changes:
        activity_type = "progress_updated"
        activity_title = f"Updated progress to {goal.progress_percentage:.0f}%"

    # Create activity record if there are changes or a comment
    if changes or comment:
        await create_entity_activity(
            db=db,
            workspace_id=workspace_id,
            entity_type="goal",
            entity_id=goal_id,
            activity_type=activity_type,
            actor_id=str(current_user.id),
            title=activity_title,
            content=comment,
            changes=changes if changes else None,
        )

    await db.commit()
    await db.refresh(goal)

    return goal_to_response(goal)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    workspace_id: str,
    goal_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a goal."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    result = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = result.scalar_one_or_none()

    if not goal or str(goal.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    await db.delete(goal)
    await db.commit()


# ==================== Key Results ====================

@router.post("/{goal_id}/key-results", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def add_key_result(
    workspace_id: str,
    goal_id: str,
    data: KeyResultCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a key result to an objective."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Goal).where(Goal.id == goal_id))
    parent = result.scalar_one_or_none()

    if not parent or str(parent.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    if parent.goal_type != "objective":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Key results can only be added to objectives")

    key = await generate_goal_key(db, workspace_id, "key_result")

    kr = Goal(
        workspace_id=workspace_id,
        key=key,
        title=data.title,
        description=data.description,
        goal_type="key_result",
        parent_goal_id=goal_id,
        period_type=parent.period_type,
        period_label=parent.period_label,
        start_date=parent.start_date,
        end_date=parent.end_date,
        metric_type=data.metric_type,
        target_value=data.target_value,
        starting_value=data.starting_value,
        current_value=data.current_value or data.starting_value,
        unit=data.unit,
        status="not_started",
        owner_id=data.owner_id,
        weight=data.weight,
    )

    _calculate_progress(kr)

    db.add(kr)
    await db.commit()
    await db.refresh(kr)

    return goal_to_response(kr)


# ==================== Progress & Check-ins ====================

@router.post("/{goal_id}/progress", response_model=GoalResponse)
async def update_progress(
    workspace_id: str,
    goal_id: str,
    data: GoalProgressUpdateRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update goal progress with a check-in."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = result.scalar_one_or_none()

    if not goal or str(goal.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    # Track old values
    old_value = goal.current_value
    old_progress = goal.progress_percentage

    # Update current value
    goal.current_value = data.current_value
    _calculate_progress(goal)

    # Add check-in
    check_ins = goal.check_ins or []
    check_ins.append({
        "id": str(uuid4()),
        "date": date.today().isoformat(),
        "value": data.current_value,
        "notes": data.notes,
        "by_id": str(current_user.id),
        "by_name": current_user.name,
    })
    goal.check_ins = check_ins

    # Update status based on progress
    _update_status_from_progress(goal)

    # Create activity record
    await create_entity_activity(
        db=db,
        workspace_id=workspace_id,
        entity_type="goal",
        entity_id=goal_id,
        activity_type="progress_updated",
        actor_id=str(current_user.id),
        title=f"Updated progress to {goal.progress_percentage:.0f}%",
        content=data.notes,
        changes={
            "current_value": {
                "old": str(old_value) if old_value is not None else None,
                "new": str(data.current_value),
            },
            "progress_percentage": {
                "old": f"{old_progress:.0f}%",
                "new": f"{goal.progress_percentage:.0f}%",
            },
        },
    )

    await db.commit()
    await db.refresh(goal)

    return goal_to_response(goal)


@router.post("/{goal_id}/confidence", response_model=GoalResponse)
async def update_confidence(
    workspace_id: str,
    goal_id: str,
    data: GoalConfidenceUpdateRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update goal confidence level."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = result.scalar_one_or_none()

    if not goal or str(goal.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    goal.confidence_level = data.confidence_level
    goal.confidence_notes = data.notes

    await db.commit()
    await db.refresh(goal)

    return goal_to_response(goal)


# ==================== Linking ====================

@router.post("/{goal_id}/link-project", status_code=status.HTTP_201_CREATED)
async def link_project(
    workspace_id: str,
    goal_id: str,
    data: GoalLinkProjectRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Link a project to a goal."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = result.scalar_one_or_none()

    if not goal or str(goal.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    # Check if already linked
    existing = await db.execute(
        select(GoalProject).where(GoalProject.goal_id == goal_id, GoalProject.project_id == data.project_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project already linked")

    link = GoalProject(
        goal_id=goal_id,
        project_id=data.project_id,
        contribution_weight=data.contribution_weight,
    )
    db.add(link)
    await db.commit()

    return {"message": "Project linked to goal"}


@router.post("/{goal_id}/link-epic", status_code=status.HTTP_201_CREATED)
async def link_epic(
    workspace_id: str,
    goal_id: str,
    data: GoalLinkEpicRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Link an epic to a goal."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = result.scalar_one_or_none()

    if not goal or str(goal.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    # Check if already linked
    existing = await db.execute(
        select(GoalEpic).where(GoalEpic.goal_id == goal_id, GoalEpic.epic_id == data.epic_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Epic already linked")

    link = GoalEpic(
        goal_id=goal_id,
        epic_id=data.epic_id,
        contribution_weight=data.contribution_weight,
    )
    db.add(link)
    await db.commit()

    return {"message": "Epic linked to goal"}


@router.delete("/{goal_id}/unlink-epic/{epic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_epic(
    workspace_id: str,
    goal_id: str,
    epic_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Unlink an epic from a goal."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(
        select(GoalEpic).where(GoalEpic.goal_id == goal_id, GoalEpic.epic_id == epic_id)
    )
    link = result.scalar_one_or_none()

    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")

    await db.delete(link)
    await db.commit()


# ==================== Helper Functions ====================

def _calculate_progress(goal: Goal) -> None:
    """Calculate progress percentage based on metric type."""
    if goal.metric_type == "boolean":
        goal.progress_percentage = 100.0 if goal.current_value else 0.0
    elif goal.target_value is not None and goal.starting_value is not None:
        if goal.target_value != goal.starting_value:
            current = goal.current_value or goal.starting_value
            progress = (current - goal.starting_value) / (goal.target_value - goal.starting_value) * 100
            goal.progress_percentage = max(0, min(100, progress))
        else:
            goal.progress_percentage = 100.0 if goal.current_value == goal.target_value else 0.0
    elif goal.target_value is not None and goal.current_value is not None:
        goal.progress_percentage = min(100, (goal.current_value / goal.target_value) * 100)
    else:
        goal.progress_percentage = 0.0


def _update_status_from_progress(goal: Goal) -> None:
    """Update goal status based on progress and time remaining."""
    if goal.progress_percentage >= 100:
        goal.status = "achieved"
    elif goal.end_date:
        today = date.today()
        total_days = (goal.end_date - goal.start_date).days if goal.start_date else 0
        elapsed_days = (today - goal.start_date).days if goal.start_date else 0

        if total_days > 0 and elapsed_days > 0:
            expected_progress = (elapsed_days / total_days) * 100

            if goal.progress_percentage >= expected_progress * 0.9:
                goal.status = "on_track"
            elif goal.progress_percentage >= expected_progress * 0.7:
                goal.status = "at_risk"
            else:
                goal.status = "behind"

        if today > goal.end_date and goal.progress_percentage < 100:
            goal.status = "missed"
