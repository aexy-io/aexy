"""Entity Activity API endpoints for timeline tracking."""

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models import Developer, EntityActivity
from aexy.services.workspace_service import WorkspaceService
from aexy.schemas.entity_activity import (
    EntityActivityCreate,
    EntityActivityResponse,
    EntityActivityListResponse,
    EntityCommentCreate,
    TimelineEntry,
    TimelineResponse,
    ActorInfo,
    EntityType,
    ActivityType,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/activities", tags=["Entity Activities"])


async def check_workspace_permission(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
) -> None:
    """Check if user has permission to access workspace activities."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(workspace_id, str(current_user.id), "member"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this workspace",
        )


def _format_activity_response(activity: EntityActivity) -> EntityActivityResponse:
    """Format an EntityActivity model to response schema."""
    return EntityActivityResponse(
        id=activity.id,
        workspace_id=activity.workspace_id,
        entity_type=activity.entity_type,
        entity_id=activity.entity_id,
        activity_type=activity.activity_type,
        actor_id=activity.actor_id,
        actor_name=activity.actor.name if activity.actor else None,
        actor_email=activity.actor.email if activity.actor else None,
        actor_avatar_url=activity.actor.avatar_url if activity.actor else None,
        title=activity.title,
        content=activity.content,
        changes=activity.changes,
        metadata=activity.activity_metadata,
        created_at=activity.created_at,
    )


def _get_display_text(activity: EntityActivity) -> str:
    """Generate human-readable display text for an activity."""
    actor_name = activity.actor.name if activity.actor else "Someone"

    if activity.activity_type == "created":
        return f"{actor_name} created this {activity.entity_type}"
    elif activity.activity_type == "updated":
        if activity.changes:
            fields = list(activity.changes.keys())
            if len(fields) == 1:
                return f"{actor_name} updated {fields[0]}"
            return f"{actor_name} updated {', '.join(fields[:2])}{'...' if len(fields) > 2 else ''}"
        return f"{actor_name} made changes"
    elif activity.activity_type == "comment":
        return f"{actor_name} added a comment"
    elif activity.activity_type == "status_changed":
        if activity.changes and "status" in activity.changes:
            old_val = activity.changes["status"].get("old", "unknown")
            new_val = activity.changes["status"].get("new", "unknown")
            return f"{actor_name} changed status from {old_val} to {new_val}"
        return f"{actor_name} changed the status"
    elif activity.activity_type == "assigned":
        return activity.title or f"{actor_name} assigned this"
    elif activity.activity_type == "progress_updated":
        if activity.changes and "progress_percentage" in activity.changes:
            new_val = activity.changes["progress_percentage"].get("new", 0)
            return f"{actor_name} updated progress to {new_val}%"
        return f"{actor_name} updated progress"
    elif activity.activity_type == "linked":
        return activity.title or f"{actor_name} linked to another item"
    elif activity.activity_type == "unlinked":
        return activity.title or f"{actor_name} removed a link"

    return activity.title or f"{actor_name} performed an action"


def _get_activity_icon(activity_type: str) -> str:
    """Get icon name for activity type."""
    icons = {
        "created": "plus-circle",
        "updated": "edit",
        "comment": "message-circle",
        "status_changed": "refresh-cw",
        "assigned": "user-plus",
        "progress_updated": "trending-up",
        "linked": "link",
        "unlinked": "link-off",
    }
    return icons.get(activity_type, "activity")


def _format_timeline_entry(activity: EntityActivity) -> TimelineEntry:
    """Format an EntityActivity to a timeline entry."""
    actor = None
    if activity.actor:
        actor = ActorInfo(
            id=activity.actor_id,
            name=activity.actor.name,
            email=activity.actor.email,
            avatar_url=activity.actor.avatar_url,
        )

    return TimelineEntry(
        id=activity.id,
        activity_type=activity.activity_type,
        actor=actor,
        title=activity.title,
        content=activity.content,
        changes=activity.changes,
        metadata=activity.activity_metadata,
        created_at=activity.created_at,
        display_text=_get_display_text(activity),
        icon=_get_activity_icon(activity.activity_type),
    )


@router.get("", response_model=EntityActivityListResponse)
async def list_activities(
    workspace_id: str,
    entity_type: EntityType | None = Query(default=None),
    entity_id: str | None = Query(default=None),
    activity_type: ActivityType | None = Query(default=None),
    actor_id: str | None = Query(default=None),
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List activities for a workspace with optional filters."""
    await check_workspace_permission(workspace_id, current_developer, db)

    query = (
        select(EntityActivity)
        .options(selectinload(EntityActivity.actor))
        .where(EntityActivity.workspace_id == workspace_id)
        .order_by(desc(EntityActivity.created_at))
    )

    if entity_type:
        query = query.where(EntityActivity.entity_type == entity_type)
    if entity_id:
        query = query.where(EntityActivity.entity_id == entity_id)
    if activity_type:
        query = query.where(EntityActivity.activity_type == activity_type)
    if actor_id:
        query = query.where(EntityActivity.actor_id == actor_id)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    activities = result.scalars().all()

    return EntityActivityListResponse(
        items=[_format_activity_response(a) for a in activities],
        total=total,
        has_more=(offset + len(activities)) < total,
    )


@router.get("/timeline/{entity_type}/{entity_id}", response_model=TimelineResponse)
async def get_entity_timeline(
    workspace_id: str,
    entity_type: EntityType,
    entity_id: str,
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get timeline for a specific entity."""
    await check_workspace_permission(workspace_id, current_developer, db)

    query = (
        select(EntityActivity)
        .options(selectinload(EntityActivity.actor))
        .where(
            EntityActivity.workspace_id == workspace_id,
            EntityActivity.entity_type == entity_type,
            EntityActivity.entity_id == entity_id,
        )
        .order_by(desc(EntityActivity.created_at))
    )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination
    query = query.offset(offset).limit(limit)
    result = await db.execute(query)
    activities = result.scalars().all()

    return TimelineResponse(
        entity_type=entity_type,
        entity_id=entity_id,
        entries=[_format_timeline_entry(a) for a in activities],
        total=total,
    )


@router.post("", response_model=EntityActivityResponse, status_code=201)
async def create_activity(
    workspace_id: str,
    data: EntityActivityCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Create an activity entry (mainly for comments)."""
    await check_workspace_permission(workspace_id, current_developer, db)

    activity = EntityActivity(
        id=str(uuid4()),
        workspace_id=workspace_id,
        entity_type=data.entity_type,
        entity_id=data.entity_id,
        activity_type=data.activity_type,
        actor_id=current_developer.id,
        title=data.title,
        content=data.content,
        activity_metadata=data.metadata,
    )

    db.add(activity)
    await db.commit()
    await db.refresh(activity, ["actor"])

    return _format_activity_response(activity)


@router.post("/{entity_type}/{entity_id}/comment", response_model=EntityActivityResponse, status_code=201)
async def add_comment(
    workspace_id: str,
    entity_type: EntityType,
    entity_id: str,
    data: EntityCommentCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Add a comment to an entity."""
    await check_workspace_permission(workspace_id, current_developer, db)

    activity = EntityActivity(
        id=str(uuid4()),
        workspace_id=workspace_id,
        entity_type=entity_type,
        entity_id=entity_id,
        activity_type="comment",
        actor_id=current_developer.id,
        content=data.content,
    )

    db.add(activity)
    await db.commit()
    await db.refresh(activity, ["actor"])

    return _format_activity_response(activity)


@router.delete("/{activity_id}", status_code=204)
async def delete_activity(
    workspace_id: str,
    activity_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Delete an activity entry (only comments can be deleted by their author)."""
    await check_workspace_permission(workspace_id, current_developer, db)

    result = await db.execute(
        select(EntityActivity).where(
            EntityActivity.id == activity_id,
            EntityActivity.workspace_id == workspace_id,
        )
    )
    activity = result.scalar_one_or_none()

    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Only allow deleting comments, and only by the author
    if activity.activity_type != "comment":
        raise HTTPException(status_code=403, detail="Only comments can be deleted")

    if activity.actor_id != current_developer.id:
        raise HTTPException(status_code=403, detail="You can only delete your own comments")

    await db.delete(activity)
    await db.commit()


# ==================== Helper function for other modules ====================

async def create_entity_activity(
    db: AsyncSession,
    workspace_id: str,
    entity_type: str,
    entity_id: str,
    activity_type: str,
    actor_id: str | None = None,
    title: str | None = None,
    content: str | None = None,
    changes: dict | None = None,
    metadata: dict | None = None,
) -> EntityActivity:
    """Helper function to create entity activity from other modules."""
    activity = EntityActivity(
        id=str(uuid4()),
        workspace_id=workspace_id,
        entity_type=entity_type,
        entity_id=entity_id,
        activity_type=activity_type,
        actor_id=actor_id,
        title=title,
        content=content,
        changes=changes,
        activity_metadata=metadata,
    )

    db.add(activity)
    return activity
