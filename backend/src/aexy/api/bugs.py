"""Bug/Defect API endpoints."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import uuid4

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.models.bug import Bug, BugActivity
from aexy.schemas.bug import (
    BugCreate,
    BugUpdate,
    BugResponse,
    BugListResponse,
    BugDetailResponse,
    BugConfirmRequest,
    BugFixRequest,
    BugVerifyRequest,
    BugCloseRequest,
    BugReopenRequest,
    BugLinkStoryRequest,
    BugLinkTaskRequest,
    BugStatsResponse,
    BugsBySeverityResponse,
    ReproductionStep,
    BugAttachment,
)
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}/bugs", tags=["Bugs"])


async def check_workspace_permission(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace bugs."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this workspace",
        )


async def generate_bug_key(db: AsyncSession, workspace_id: str) -> str:
    """Generate a unique bug key for the workspace."""
    result = await db.execute(
        select(func.count(Bug.id)).where(Bug.workspace_id == workspace_id)
    )
    count = result.scalar() or 0
    return f"BUG-{count + 1:03d}"


def bug_to_response(bug: Bug) -> BugResponse:
    """Convert Bug model to response schema."""
    return BugResponse(
        id=str(bug.id),
        workspace_id=str(bug.workspace_id),
        project_id=str(bug.project_id) if bug.project_id else None,
        project_name=bug.project.name if bug.project else None,
        key=bug.key,
        title=bug.title,
        description=bug.description,
        description_json=bug.description_json,
        steps_to_reproduce=[ReproductionStep(**s) for s in (bug.steps_to_reproduce or [])],
        expected_behavior=bug.expected_behavior,
        actual_behavior=bug.actual_behavior,
        severity=bug.severity,
        priority=bug.priority,
        bug_type=bug.bug_type,
        status=bug.status,
        environment=bug.environment,
        affected_version=bug.affected_version,
        fixed_in_version=bug.fixed_in_version,
        browser=bug.browser,
        os=bug.os,
        device=bug.device,
        story_id=str(bug.story_id) if bug.story_id else None,
        story_key=bug.story.key if bug.story else None,
        story_title=bug.story.title if bug.story else None,
        release_id=str(bug.release_id) if bug.release_id else None,
        release_name=bug.release.name if bug.release else None,
        fix_task_id=str(bug.fix_task_id) if bug.fix_task_id else None,
        fix_task_title=bug.fix_task.title if bug.fix_task else None,
        duplicate_of_id=str(bug.duplicate_of_id) if bug.duplicate_of_id else None,
        duplicate_of_key=bug.duplicate_of.key if bug.duplicate_of else None,
        is_regression=bug.is_regression,
        regressed_from_release_id=str(bug.regressed_from_release_id) if bug.regressed_from_release_id else None,
        regressed_from_release_name=bug.regressed_from_release.name if bug.regressed_from_release else None,
        reporter_id=str(bug.reporter_id) if bug.reporter_id else None,
        reporter_name=bug.reporter.name if bug.reporter else None,
        assignee_id=str(bug.assignee_id) if bug.assignee_id else None,
        assignee_name=bug.assignee.name if bug.assignee else None,
        assignee_avatar_url=bug.assignee.avatar_url if bug.assignee else None,
        verified_by_id=str(bug.verified_by_id) if bug.verified_by_id else None,
        verified_by_name=bug.verified_by.name if bug.verified_by else None,
        attachments=[BugAttachment(**a) for a in (bug.attachments or [])],
        labels=bug.labels or [],
        root_cause=bug.root_cause,
        resolution_notes=bug.resolution_notes,
        time_to_fix_hours=bug.time_to_fix_hours,
        source_type=bug.source_type or "manual",
        source_id=bug.source_id,
        source_url=bug.source_url,
        confirmed_at=bug.confirmed_at,
        fixed_at=bug.fixed_at,
        verified_at=bug.verified_at,
        closed_at=bug.closed_at,
        created_at=bug.created_at,
        updated_at=bug.updated_at,
    )


def bug_to_list_response(bug: Bug) -> BugListResponse:
    """Convert Bug model to list response schema."""
    return BugListResponse(
        id=str(bug.id),
        workspace_id=str(bug.workspace_id),
        project_id=str(bug.project_id) if bug.project_id else None,
        project_name=bug.project.name if bug.project else None,
        key=bug.key,
        title=bug.title,
        severity=bug.severity,
        priority=bug.priority,
        bug_type=bug.bug_type,
        status=bug.status,
        environment=bug.environment,
        affected_version=bug.affected_version,
        reporter_id=str(bug.reporter_id) if bug.reporter_id else None,
        reporter_name=bug.reporter.name if bug.reporter else None,
        assignee_id=str(bug.assignee_id) if bug.assignee_id else None,
        assignee_name=bug.assignee.name if bug.assignee else None,
        is_regression=bug.is_regression,
        release_id=str(bug.release_id) if bug.release_id else None,
        release_name=bug.release.name if bug.release else None,
        created_at=bug.created_at,
    )


# ==================== Bug CRUD ====================

@router.get("", response_model=list[BugListResponse])
async def list_bugs(
    workspace_id: str,
    project_id: str | None = None,
    status: str | None = None,
    severity: str | None = None,
    priority: str | None = None,
    bug_type: str | None = None,
    assignee_id: str | None = None,
    release_id: str | None = None,
    is_regression: bool | None = None,
    include_closed: bool = False,
    search: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List bugs for a workspace."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    query = select(Bug).where(Bug.workspace_id == workspace_id)

    if project_id:
        query = query.where(Bug.project_id == project_id)

    if status:
        query = query.where(Bug.status == status)
    if severity:
        query = query.where(Bug.severity == severity)
    if priority:
        query = query.where(Bug.priority == priority)
    if bug_type:
        query = query.where(Bug.bug_type == bug_type)
    if assignee_id:
        query = query.where(Bug.assignee_id == assignee_id)
    if release_id:
        query = query.where(Bug.release_id == release_id)
    if is_regression is not None:
        query = query.where(Bug.is_regression == is_regression)
    if not include_closed:
        query = query.where(Bug.status.notin_(["closed", "wont_fix"]))
    if search:
        query = query.where(
            Bug.title.ilike(f"%{search}%") |
            Bug.key.ilike(f"%{search}%")
        )

    query = query.order_by(Bug.created_at.desc())
    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    bugs = result.scalars().all()

    return [bug_to_list_response(bug) for bug in bugs]


@router.post("", response_model=BugResponse, status_code=status.HTTP_201_CREATED)
async def create_bug(
    workspace_id: str,
    data: BugCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new bug."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    key = await generate_bug_key(db, workspace_id)

    steps = [
        {"step_number": i + 1, "description": s.description}
        for i, s in enumerate(data.steps_to_reproduce)
    ]

    bug = Bug(
        workspace_id=workspace_id,
        project_id=data.project_id,
        key=key,
        title=data.title,
        description=data.description,
        description_json=data.description_json,
        steps_to_reproduce=steps,
        expected_behavior=data.expected_behavior,
        actual_behavior=data.actual_behavior,
        severity=data.severity,
        priority=data.priority,
        bug_type=data.bug_type,
        environment=data.environment,
        affected_version=data.affected_version,
        browser=data.browser,
        os=data.os,
        device=data.device,
        story_id=data.story_id,
        release_id=data.release_id,
        reporter_id=str(current_user.id),
        assignee_id=data.assignee_id,
        labels=data.labels,
        source_type=data.source_type,
        source_id=data.source_id,
        source_url=data.source_url,
        is_regression=data.is_regression,
    )

    db.add(bug)
    await db.flush()  # Flush to get the bug.id assigned

    activity = BugActivity(
        bug_id=bug.id,
        action="created",
        actor_id=str(current_user.id),
    )
    db.add(activity)

    await db.commit()
    await db.refresh(bug)

    return bug_to_response(bug)


# ==================== Statistics (must be before /{bug_id} routes) ====================

@router.get("/stats", response_model=BugStatsResponse)
async def get_bug_stats(
    workspace_id: str,
    project_id: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get bug statistics for the workspace (optionally filtered by project)."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    # Build base filter
    base_filter = [Bug.workspace_id == workspace_id]
    if project_id:
        base_filter.append(Bug.project_id == project_id)

    # Total counts
    total_result = await db.execute(
        select(func.count(Bug.id)).where(*base_filter)
    )
    total_bugs = total_result.scalar() or 0

    # By status
    status_result = await db.execute(
        select(Bug.status, func.count(Bug.id))
        .where(*base_filter)
        .group_by(Bug.status)
    )
    by_status = {row[0]: row[1] for row in status_result.all()}

    open_statuses = ["new", "confirmed", "in_progress", "fixed"]
    open_bugs = sum(by_status.get(s, 0) for s in open_statuses)
    closed_bugs = by_status.get("closed", 0) + by_status.get("wont_fix", 0)

    # By severity
    severity_result = await db.execute(
        select(Bug.severity, func.count(Bug.id))
        .where(*base_filter, Bug.status.notin_(["closed", "wont_fix"]))
        .group_by(Bug.severity)
    )
    by_severity = {row[0]: row[1] for row in severity_result.all()}

    # By type
    type_result = await db.execute(
        select(Bug.bug_type, func.count(Bug.id))
        .where(*base_filter)
        .group_by(Bug.bug_type)
    )
    by_type = {row[0]: row[1] for row in type_result.all()}

    # Regression count
    regression_result = await db.execute(
        select(func.count(Bug.id)).where(
            *base_filter,
            Bug.is_regression == True
        )
    )
    regression_count = regression_result.scalar() or 0

    # Average time to fix
    avg_fix_result = await db.execute(
        select(func.avg(Bug.time_to_fix_hours)).where(
            *base_filter,
            Bug.time_to_fix_hours != None
        )
    )
    avg_time_to_fix = avg_fix_result.scalar()

    return BugStatsResponse(
        workspace_id=workspace_id,
        total_bugs=total_bugs,
        open_bugs=open_bugs,
        closed_bugs=closed_bugs,
        new_bugs=by_status.get("new", 0),
        confirmed_bugs=by_status.get("confirmed", 0),
        in_progress_bugs=by_status.get("in_progress", 0),
        fixed_bugs=by_status.get("fixed", 0),
        verified_bugs=by_status.get("verified", 0),
        blocker_bugs=by_severity.get("blocker", 0),
        critical_bugs=by_severity.get("critical", 0),
        major_bugs=by_severity.get("major", 0),
        minor_bugs=by_severity.get("minor", 0),
        trivial_bugs=by_severity.get("trivial", 0),
        bugs_by_type=by_type,
        regression_count=regression_count,
        avg_time_to_fix_hours=avg_time_to_fix,
    )


# ==================== Bug Detail Routes ====================

@router.get("/{bug_id}", response_model=BugResponse)
async def get_bug(
    workspace_id: str,
    bug_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a bug by ID."""
    await check_workspace_permission(workspace_id, current_user, db, "viewer")

    result = await db.execute(select(Bug).where(Bug.id == bug_id))
    bug = result.scalar_one_or_none()

    if not bug or str(bug.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bug not found")

    return bug_to_response(bug)


@router.patch("/{bug_id}", response_model=BugResponse)
async def update_bug(
    workspace_id: str,
    bug_id: str,
    data: BugUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a bug."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Bug).where(Bug.id == bug_id))
    bug = result.scalar_one_or_none()

    if not bug or str(bug.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bug not found")

    update_data = data.model_dump(exclude_unset=True)

    # Convert steps if provided
    if "steps_to_reproduce" in update_data and update_data["steps_to_reproduce"]:
        update_data["steps_to_reproduce"] = [
            {"step_number": i + 1, "description": s.description if hasattr(s, "description") else s["description"]}
            for i, s in enumerate(update_data["steps_to_reproduce"])
        ]

    for field, value in update_data.items():
        old_value = getattr(bug, field, None)
        setattr(bug, field, value)

        if field in ("status", "severity", "priority", "assignee_id"):
            activity = BugActivity(
                bug_id=bug_id,
                action="updated",
                actor_id=str(current_user.id),
                field_name=field,
                old_value=str(old_value) if old_value else None,
                new_value=str(value) if value else None,
            )
            db.add(activity)

    await db.commit()
    await db.refresh(bug)

    return bug_to_response(bug)


@router.delete("/{bug_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bug(
    workspace_id: str,
    bug_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a bug."""
    await check_workspace_permission(workspace_id, current_user, db, "admin")

    result = await db.execute(select(Bug).where(Bug.id == bug_id))
    bug = result.scalar_one_or_none()

    if not bug or str(bug.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bug not found")

    await db.delete(bug)
    await db.commit()


# ==================== Status Transitions ====================

@router.post("/{bug_id}/confirm", response_model=BugResponse)
async def confirm_bug(
    workspace_id: str,
    bug_id: str,
    data: BugConfirmRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Confirm a bug is reproducible."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Bug).where(Bug.id == bug_id))
    bug = result.scalar_one_or_none()

    if not bug or str(bug.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bug not found")

    old_status = bug.status
    bug.status = "confirmed"
    bug.confirmed_at = datetime.now(timezone.utc)

    activity = BugActivity(
        bug_id=bug_id,
        action="status_changed",
        actor_id=str(current_user.id),
        field_name="status",
        old_value=old_status,
        new_value="confirmed",
        comment=data.notes,
    )
    db.add(activity)

    await db.commit()
    await db.refresh(bug)

    return bug_to_response(bug)


@router.post("/{bug_id}/fix", response_model=BugResponse)
async def mark_bug_fixed(
    workspace_id: str,
    bug_id: str,
    data: BugFixRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Mark a bug as fixed."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Bug).where(Bug.id == bug_id))
    bug = result.scalar_one_or_none()

    if not bug or str(bug.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bug not found")

    old_status = bug.status
    bug.status = "fixed"
    bug.fixed_at = datetime.now(timezone.utc)

    if data.fixed_in_version:
        bug.fixed_in_version = data.fixed_in_version
    if data.fix_task_id:
        bug.fix_task_id = data.fix_task_id
    if data.root_cause:
        bug.root_cause = data.root_cause
    if data.resolution_notes:
        bug.resolution_notes = data.resolution_notes

    # Calculate time to fix
    if bug.created_at:
        delta = bug.fixed_at - bug.created_at
        bug.time_to_fix_hours = delta.total_seconds() / 3600

    activity = BugActivity(
        bug_id=bug_id,
        action="status_changed",
        actor_id=str(current_user.id),
        field_name="status",
        old_value=old_status,
        new_value="fixed",
    )
    db.add(activity)

    await db.commit()
    await db.refresh(bug)

    return bug_to_response(bug)


@router.post("/{bug_id}/verify", response_model=BugResponse)
async def verify_bug_fix(
    workspace_id: str,
    bug_id: str,
    data: BugVerifyRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Verify a bug fix."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Bug).where(Bug.id == bug_id))
    bug = result.scalar_one_or_none()

    if not bug or str(bug.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bug not found")

    old_status = bug.status
    bug.status = "verified"
    bug.verified_at = datetime.now(timezone.utc)
    bug.verified_by_id = str(current_user.id)

    activity = BugActivity(
        bug_id=bug_id,
        action="verified",
        actor_id=str(current_user.id),
        field_name="status",
        old_value=old_status,
        new_value="verified",
        comment=data.notes,
    )
    db.add(activity)

    await db.commit()
    await db.refresh(bug)

    return bug_to_response(bug)


@router.post("/{bug_id}/close", response_model=BugResponse)
async def close_bug(
    workspace_id: str,
    bug_id: str,
    data: BugCloseRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Close a bug."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Bug).where(Bug.id == bug_id))
    bug = result.scalar_one_or_none()

    if not bug or str(bug.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bug not found")

    old_status = bug.status

    if data.resolution == "duplicate" and data.duplicate_of_id:
        bug.status = "duplicate"
        bug.duplicate_of_id = data.duplicate_of_id
    elif data.resolution == "wont_fix":
        bug.status = "wont_fix"
    elif data.resolution == "cannot_reproduce":
        bug.status = "cannot_reproduce"
    else:
        bug.status = "closed"

    bug.closed_at = datetime.now(timezone.utc)

    activity = BugActivity(
        bug_id=bug_id,
        action="status_changed",
        actor_id=str(current_user.id),
        field_name="status",
        old_value=old_status,
        new_value=bug.status,
        comment=data.notes,
    )
    db.add(activity)

    await db.commit()
    await db.refresh(bug)

    return bug_to_response(bug)


@router.post("/{bug_id}/reopen", response_model=BugResponse)
async def reopen_bug(
    workspace_id: str,
    bug_id: str,
    data: BugReopenRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Reopen a closed bug."""
    await check_workspace_permission(workspace_id, current_user, db, "member")

    result = await db.execute(select(Bug).where(Bug.id == bug_id))
    bug = result.scalar_one_or_none()

    if not bug or str(bug.workspace_id) != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bug not found")

    old_status = bug.status
    bug.status = "confirmed"
    bug.closed_at = None
    bug.verified_at = None
    bug.fixed_at = None

    activity = BugActivity(
        bug_id=bug_id,
        action="reopened",
        actor_id=str(current_user.id),
        field_name="status",
        old_value=old_status,
        new_value="confirmed",
        comment=data.reason,
    )
    db.add(activity)

    await db.commit()
    await db.refresh(bug)

    return bug_to_response(bug)
