"""Release/Milestone API endpoints."""

from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import uuid4

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.models.release import Release, ReleaseSprint
from aexy.models.story import UserStory
from aexy.models.sprint import Sprint
from aexy.models.bug import Bug
from aexy.schemas.release import (
    ReleaseCreate,
    ReleaseUpdate,
    ReleaseResponse,
    ReleaseListResponse,
    ReleaseDetailResponse,
    ReleaseSprintInfo,
    ReleaseAddSprintRequest,
    ReleaseAddStoriesRequest,
    ReleaseAddStoriesResponse,
    ReleaseFreezeRequest,
    ReleasePublishRequest,
    ReleaseReadinessResponse,
    ReleaseChecklistToggleRequest,
    ReleaseBurndownResponse,
    ReleaseBurndownDataPoint,
    ReadinessChecklistItem,
)
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}/releases", tags=["Releases"])


async def check_workspace_permission(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace releases."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this workspace",
        )


def release_to_response(release: Release) -> ReleaseResponse:
    """Convert Release model to response schema."""
    return ReleaseResponse(
        id=str(release.id),
        workspace_id=str(release.workspace_id),
        project_id=str(release.project_id) if release.project_id else None,
        project_name=release.project.name if release.project else None,
        name=release.name,
        version=release.version,
        codename=release.codename,
        description=release.description,
        color=release.color,
        start_date=release.start_date,
        target_date=release.target_date,
        code_freeze_date=release.code_freeze_date,
        actual_release_date=release.actual_release_date,
        status=release.status,
        risk_level=release.risk_level,
        risk_notes=release.risk_notes,
        readiness_checklist=[
            ReadinessChecklistItem(**item) for item in (release.readiness_checklist or [])
        ],
        release_notes=release.release_notes,
        release_notes_json=release.release_notes_json,
        owner_id=str(release.owner_id) if release.owner_id else None,
        owner_name=release.owner.name if release.owner else None,
        owner_avatar_url=release.owner.avatar_url if release.owner else None,
        labels=release.labels or [],
        total_stories=release.total_stories,
        completed_stories=release.completed_stories,
        total_story_points=release.total_story_points,
        completed_story_points=release.completed_story_points,
        total_tasks=release.total_tasks,
        completed_tasks=release.completed_tasks,
        progress_percentage=release.progress_percentage,
        open_bugs=release.open_bugs,
        critical_bugs=release.critical_bugs,
        created_at=release.created_at,
        updated_at=release.updated_at,
    )


def release_to_list_response(release: Release) -> ReleaseListResponse:
    """Convert Release model to list response schema."""
    return ReleaseListResponse(
        id=str(release.id),
        workspace_id=str(release.workspace_id),
        project_id=str(release.project_id) if release.project_id else None,
        project_name=release.project.name if release.project else None,
        name=release.name,
        version=release.version,
        status=release.status,
        risk_level=release.risk_level,
        color=release.color,
        target_date=release.target_date,
        actual_release_date=release.actual_release_date,
        owner_id=str(release.owner_id) if release.owner_id else None,
        owner_name=release.owner.name if release.owner else None,
        total_stories=release.total_stories,
        completed_stories=release.completed_stories,
        progress_percentage=release.progress_percentage,
        open_bugs=release.open_bugs,
        critical_bugs=release.critical_bugs,
    )


# ==================== Release CRUD ====================

@router.get("", response_model=list[ReleaseListResponse])
async def list_releases(
    workspace_id: str,
    status: str | None = None,
    project_id: str | None = None,
    include_archived: bool = False,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List releases for a workspace."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    query = select(Release).where(Release.workspace_id == workspace_id)

    if status:
        query = query.where(Release.status == status)
    if project_id:
        query = query.where(Release.project_id == project_id)
    if not include_archived:
        query = query.where(Release.is_archived == False)

    query = query.order_by(Release.target_date.desc())
    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    releases = result.scalars().all()

    return [release_to_list_response(release) for release in releases]


@router.post("", response_model=ReleaseResponse, status_code=status.HTTP_201_CREATED)
async def create_release(
    workspace_id: str,
    data: ReleaseCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new release."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    readiness_checklist = [
        {
            "id": str(uuid4()),
            "item": item.item,
            "completed": False,
            "required": item.required,
            "completed_at": None,
            "completed_by": None,
        }
        for item in data.readiness_checklist
    ]

    release = Release(
        workspace_id=workspace_id,
        project_id=data.project_id,
        name=data.name,
        version=data.version,
        codename=data.codename,
        description=data.description,
        color=data.color,
        start_date=data.start_date,
        target_date=data.target_date,
        code_freeze_date=data.code_freeze_date,
        status=data.status,
        risk_level=data.risk_level,
        risk_notes=data.risk_notes,
        readiness_checklist=readiness_checklist,
        owner_id=data.owner_id,
        labels=data.labels,
    )

    db.add(release)
    await db.commit()
    await db.refresh(release)

    return release_to_response(release)


@router.get("/{release_id}", response_model=ReleaseResponse)
async def get_release(
    workspace_id: str,
    release_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a release by ID."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    result = await db.execute(
        select(Release).where(Release.id == release_id)
    )
    release = result.scalar_one_or_none()

    if not release or str(release.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release not found")

    return release_to_response(release)


@router.get("/{release_id}/detail", response_model=ReleaseDetailResponse)
async def get_release_detail(
    workspace_id: str,
    release_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get release with detailed breakdown."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    result = await db.execute(select(Release).where(Release.id == release_id))
    release = result.scalar_one_or_none()

    if not release or str(release.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release not found")

    # Get sprints
    sprints_result = await db.execute(
        select(ReleaseSprint, Sprint)
        .join(Sprint, ReleaseSprint.sprint_id == Sprint.id)
        .where(ReleaseSprint.release_id == release_id)
        .order_by(ReleaseSprint.position)
    )
    sprint_infos = [
        ReleaseSprintInfo(
            sprint_id=str(rs.sprint_id),
            sprint_name=sprint.name,
            team_id=str(sprint.team_id),
            team_name=sprint.team.name if sprint.team else "",
            status=sprint.status,
            start_date=sprint.start_date,
            end_date=sprint.end_date,
        )
        for rs, sprint in sprints_result.all()
    ]

    # Get stories by status
    stories_result = await db.execute(
        select(UserStory.status, func.count(UserStory.id))
        .where(UserStory.release_id == release_id)
        .group_by(UserStory.status)
    )
    stories_by_status = {row[0]: row[1] for row in stories_result.all()}

    # Calculate days remaining
    today = date.today()
    days_until_target = (release.target_date - today).days if release.target_date else None
    days_until_code_freeze = (release.code_freeze_date - today).days if release.code_freeze_date else None

    response = release_to_response(release)
    return ReleaseDetailResponse(
        **response.model_dump(),
        sprints=sprint_infos,
        stories_by_status=stories_by_status,
        days_until_target=days_until_target,
        days_until_code_freeze=days_until_code_freeze,
    )


@router.patch("/{release_id}", response_model=ReleaseResponse)
async def update_release(
    workspace_id: str,
    release_id: str,
    data: ReleaseUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a release."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Release).where(Release.id == release_id))
    release = result.scalar_one_or_none()

    if not release or str(release.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(release, field, value)

    await db.commit()
    await db.refresh(release)

    return release_to_response(release)


@router.delete("/{release_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_release(
    workspace_id: str,
    release_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a release."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    result = await db.execute(select(Release).where(Release.id == release_id))
    release = result.scalar_one_or_none()

    if not release or str(release.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release not found")

    await db.delete(release)
    await db.commit()


# ==================== Sprint Management ====================

@router.post("/{release_id}/sprints", status_code=status.HTTP_201_CREATED)
async def add_sprint_to_release(
    workspace_id: str,
    release_id: str,
    data: ReleaseAddSprintRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a sprint to a release."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    # Verify release exists
    result = await db.execute(select(Release).where(Release.id == release_id))
    release = result.scalar_one_or_none()
    if not release or str(release.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release not found")

    # Check if already linked
    existing = await db.execute(
        select(ReleaseSprint).where(
            ReleaseSprint.release_id == release_id,
            ReleaseSprint.sprint_id == data.sprint_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sprint already in release")

    # Get next position
    pos_result = await db.execute(
        select(func.max(ReleaseSprint.position)).where(ReleaseSprint.release_id == release_id)
    )
    next_pos = (pos_result.scalar() or 0) + 1

    release_sprint = ReleaseSprint(
        release_id=release_id,
        sprint_id=data.sprint_id,
        position=next_pos,
    )
    db.add(release_sprint)
    await db.commit()

    return {"message": "Sprint added to release"}


@router.delete("/{release_id}/sprints/{sprint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_sprint_from_release(
    workspace_id: str,
    release_id: str,
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove a sprint from a release."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(
        select(ReleaseSprint).where(
            ReleaseSprint.release_id == release_id,
            ReleaseSprint.sprint_id == sprint_id
        )
    )
    release_sprint = result.scalar_one_or_none()

    if not release_sprint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sprint not in release")

    await db.delete(release_sprint)
    await db.commit()


# ==================== Story Management ====================

@router.post("/{release_id}/stories", response_model=ReleaseAddStoriesResponse)
async def add_stories_to_release(
    workspace_id: str,
    release_id: str,
    data: ReleaseAddStoriesRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add stories to a release."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Release).where(Release.id == release_id))
    release = result.scalar_one_or_none()
    if not release or str(release.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release not found")

    added_ids = []
    already_in_release = 0

    for story_id in data.story_ids:
        story_result = await db.execute(select(UserStory).where(UserStory.id == story_id))
        story = story_result.scalar_one_or_none()

        if story:
            if str(story.release_id) == release_id:
                already_in_release += 1
            else:
                story.release_id = release_id
                added_ids.append(story_id)

    await _update_release_metrics(db, release)
    await db.commit()

    return ReleaseAddStoriesResponse(
        added_count=len(added_ids),
        already_in_release=already_in_release,
        story_ids=added_ids,
    )


# ==================== Lifecycle ====================

@router.post("/{release_id}/freeze", response_model=ReleaseResponse)
async def freeze_release(
    workspace_id: str,
    release_id: str,
    data: ReleaseFreezeRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Enter code freeze for a release."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Release).where(Release.id == release_id))
    release = result.scalar_one_or_none()
    if not release or str(release.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release not found")

    release.status = "code_freeze"
    release.code_freeze_date = date.today()

    await db.commit()
    await db.refresh(release)

    return release_to_response(release)


@router.post("/{release_id}/publish", response_model=ReleaseResponse)
async def publish_release(
    workspace_id: str,
    release_id: str,
    data: ReleasePublishRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Mark a release as published."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Release).where(Release.id == release_id))
    release = result.scalar_one_or_none()
    if not release or str(release.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release not found")

    release.status = "released"
    release.actual_release_date = data.actual_release_date or date.today()
    if data.release_notes:
        release.release_notes = data.release_notes

    await db.commit()
    await db.refresh(release)

    return release_to_response(release)


# ==================== Readiness ====================

@router.get("/{release_id}/readiness", response_model=ReleaseReadinessResponse)
async def get_release_readiness(
    workspace_id: str,
    release_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get release readiness status."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    result = await db.execute(select(Release).where(Release.id == release_id))
    release = result.scalar_one_or_none()
    if not release or str(release.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release not found")

    checklist = release.readiness_checklist or []
    total_items = len(checklist)
    completed_items = sum(1 for item in checklist if item.get("completed", False))
    required_items = sum(1 for item in checklist if item.get("required", True))
    required_completed = sum(1 for item in checklist if item.get("required", True) and item.get("completed", False))

    # Get story readiness
    stories_result = await db.execute(
        select(UserStory.status, func.count(UserStory.id))
        .where(UserStory.release_id == release_id)
        .group_by(UserStory.status)
    )
    stories_by_status = {row[0]: row[1] for row in stories_result.all()}
    stories_ready = stories_by_status.get("accepted", 0)
    stories_not_ready = sum(v for k, v in stories_by_status.items() if k != "accepted")
    total_stories = stories_ready + stories_not_ready

    # Get bug counts
    bugs_result = await db.execute(
        select(Bug.severity, func.count(Bug.id))
        .where(Bug.release_id == release_id, Bug.status.notin_(["closed", "wont_fix"]))
        .group_by(Bug.severity)
    )
    bugs_by_severity = {row[0]: row[1] for row in bugs_result.all()}

    open_bugs = sum(bugs_by_severity.values())
    critical_bugs = bugs_by_severity.get("critical", 0)
    blocker_bugs = bugs_by_severity.get("blocker", 0)

    # Determine readiness
    blocking_issues = []
    if required_completed < required_items:
        blocking_issues.append(f"{required_items - required_completed} required checklist items incomplete")
    if blocker_bugs > 0:
        blocking_issues.append(f"{blocker_bugs} blocker bugs")
    if critical_bugs > 0:
        blocking_issues.append(f"{critical_bugs} critical bugs")

    is_ready = len(blocking_issues) == 0 and stories_ready > 0

    return ReleaseReadinessResponse(
        release_id=release_id,
        status=release.status,
        risk_level=release.risk_level,
        total_items=total_items,
        completed_items=completed_items,
        required_items=required_items,
        required_completed=required_completed,
        checklist_percentage=(completed_items / total_items * 100) if total_items > 0 else 0,
        stories_ready=stories_ready,
        stories_not_ready=stories_not_ready,
        story_readiness_percentage=(stories_ready / total_stories * 100) if total_stories > 0 else 0,
        open_bugs=open_bugs,
        critical_bugs=critical_bugs,
        blocker_bugs=blocker_bugs,
        is_ready=is_ready,
        blocking_issues=blocking_issues,
    )


@router.post("/{release_id}/checklist/{item_id}/toggle", response_model=ReleaseResponse)
async def toggle_checklist_item(
    workspace_id: str,
    release_id: str,
    item_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Toggle a readiness checklist item."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Release).where(Release.id == release_id))
    release = result.scalar_one_or_none()
    if not release or str(release.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release not found")

    checklist = release.readiness_checklist or []
    updated = False

    for item in checklist:
        if item.get("id") == item_id:
            item["completed"] = not item.get("completed", False)
            if item["completed"]:
                item["completed_at"] = datetime.now(timezone.utc).isoformat()
                item["completed_by"] = str(current_user.id)
            else:
                item["completed_at"] = None
                item["completed_by"] = None
            updated = True
            break

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found")

    release.readiness_checklist = checklist
    await db.commit()
    await db.refresh(release)

    return release_to_response(release)


async def _update_release_metrics(db: AsyncSession, release: Release) -> None:
    """Update cached metrics on a release."""
    # Story metrics
    stories_result = await db.execute(
        select(
            func.count(UserStory.id),
            func.count(UserStory.id).filter(UserStory.status == "accepted"),
            func.coalesce(func.sum(UserStory.story_points), 0),
            func.coalesce(func.sum(UserStory.story_points).filter(UserStory.status == "accepted"), 0),
        ).where(UserStory.release_id == release.id)
    )
    row = stories_result.one()

    release.total_stories = row[0]
    release.completed_stories = row[1]
    release.total_story_points = row[2] or 0
    release.completed_story_points = row[3] or 0

    if release.total_stories > 0:
        release.progress_percentage = (release.completed_stories / release.total_stories) * 100
    else:
        release.progress_percentage = 0.0

    # Bug metrics
    bugs_result = await db.execute(
        select(func.count(Bug.id), func.count(Bug.id).filter(Bug.severity == "critical"))
        .where(Bug.release_id == release.id, Bug.status.notin_(["closed", "wont_fix"]))
    )
    bug_row = bugs_result.one()
    release.open_bugs = bug_row[0]
    release.critical_bugs = bug_row[1]
