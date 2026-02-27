"""Entity Activity API endpoints for timeline tracking."""

from typing import Optional
from uuid import uuid4, UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models import Developer, EntityActivity
from aexy.services.workspace_service import WorkspaceService
from aexy.services.agent_mention_service import get_agent_mention_service
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
    elif activity.activity_type == "published":
        return activity.title or f"{actor_name} published this {activity.entity_type}"
    elif activity.activity_type == "archived":
        return activity.title or f"{actor_name} archived this {activity.entity_type}"
    elif activity.activity_type == "resolved":
        return activity.title or f"{actor_name} resolved this {activity.entity_type}"
    elif activity.activity_type == "escalated":
        return activity.title or f"{actor_name} escalated this {activity.entity_type}"
    elif activity.activity_type == "deleted":
        return activity.title or f"{actor_name} deleted this {activity.entity_type}"
    elif activity.activity_type == "completed":
        return activity.title or f"{actor_name} completed this {activity.entity_type}"
    elif activity.activity_type == "started":
        return activity.title or f"{actor_name} started this {activity.entity_type}"
    elif activity.activity_type == "paused":
        return activity.title or f"{actor_name} paused this {activity.entity_type}"
    elif activity.activity_type == "resumed":
        return activity.title or f"{actor_name} resumed this {activity.entity_type}"
    elif activity.activity_type == "submitted":
        return activity.title or f"{actor_name} submitted this {activity.entity_type}"
    elif activity.activity_type == "approved":
        return activity.title or f"{actor_name} approved this {activity.entity_type}"
    elif activity.activity_type == "rejected":
        return activity.title or f"{actor_name} rejected this {activity.entity_type}"
    elif activity.activity_type == "duplicated":
        return activity.title or f"{actor_name} duplicated this {activity.entity_type}"
    elif activity.activity_type == "toggled":
        return activity.title or f"{actor_name} toggled this {activity.entity_type}"
    elif activity.activity_type == "withdrawn":
        return activity.title or f"{actor_name} withdrew this {activity.entity_type}"
    elif activity.activity_type == "cancelled":
        return activity.title or f"{actor_name} cancelled this {activity.entity_type}"

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
        "published": "send",
        "archived": "archive",
        "resolved": "check-circle",
        "escalated": "alert-triangle",
        "deleted": "trash-2",
        "completed": "check-circle",
        "started": "play",
        "paused": "pause",
        "resumed": "play",
        "submitted": "send",
        "approved": "check-circle",
        "rejected": "x-circle",
        "duplicated": "copy",
        "toggled": "toggle-left",
        "withdrawn": "undo",
        "cancelled": "x-circle",
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
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Add a comment to an entity.

    If the comment contains @agent-name mentions, the corresponding agents
    will be invoked to process the request.
    """
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

    # Process @agent mentions in background
    background_tasks.add_task(
        _process_agent_mentions,
        workspace_id=workspace_id,
        entity_type=entity_type,
        entity_id=entity_id,
        activity_id=activity.id,
        content=data.content,
        author_id=current_developer.id,
        author_name=current_developer.name,
    )

    return _format_activity_response(activity)


async def _process_agent_mentions(
    workspace_id: str,
    entity_type: str,
    entity_id: str,
    activity_id: str,
    content: str,
    author_id: str,
    author_name: Optional[str],
):
    """Background task to process agent mentions in a comment."""
    from aexy.core.database import async_session_maker

    async with async_session_maker() as db:
        try:
            service = get_agent_mention_service(db)
            await service.process_comment_for_mentions(
                workspace_id=UUID(workspace_id),
                entity_type=entity_type,
                entity_id=UUID(entity_id),
                activity_id=UUID(activity_id),
                comment_content=content,
                author_id=UUID(author_id),
                author_name=author_name,
            )
        except Exception as e:
            import logging
            logging.error(f"Failed to process agent mentions: {e}")


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


# ==================== Agent Mention Endpoints ====================

class AgentInfoResponse(BaseModel):
    """Agent info for @mention autocomplete."""
    id: str
    name: str
    handle: str
    type: str
    description: Optional[str] = None


class PendingActionResponse(BaseModel):
    """Pending agent action for review."""
    id: str
    agent_id: str
    action_type: str
    target_entity_type: Optional[str] = None
    target_entity_id: Optional[str] = None
    payload: dict
    confidence: float
    reasoning: Optional[str] = None
    preview: Optional[str] = None


class ReviewActionRequest(BaseModel):
    """Request to review an action."""
    notes: Optional[str] = None
    modified_payload: Optional[dict] = None


@router.get("/agents", response_model=list[AgentInfoResponse])
async def get_available_agents(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get available AI agents for @mention autocomplete.

    Returns a list of agents that can be mentioned in comments
    to trigger automated actions.
    """
    await check_workspace_permission(workspace_id, current_developer, db)

    service = get_agent_mention_service(db)
    agents = await service.get_available_agents(UUID(workspace_id))
    return [AgentInfoResponse(**a) for a in agents]


@router.get("/agents/pending-actions", response_model=list[PendingActionResponse])
async def get_pending_agent_actions(
    workspace_id: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get pending agent actions that need review.

    Returns actions proposed by AI agents that require human approval
    before they are executed.
    """
    await check_workspace_permission(workspace_id, current_developer, db)

    service = get_agent_mention_service(db)
    actions = await service.get_pending_reviews_for_user(
        workspace_id=UUID(workspace_id),
        user_id=UUID(current_developer.id),
        entity_type=entity_type,
        entity_id=UUID(entity_id) if entity_id else None,
    )
    return [PendingActionResponse(**a) for a in actions]


@router.post("/agents/actions/{action_id}/approve")
async def approve_agent_action(
    workspace_id: str,
    action_id: str,
    data: ReviewActionRequest,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Approve an agent action for execution.

    Once approved, the action will be executed automatically.
    You can optionally modify the action payload before approving.
    """
    await check_workspace_permission(workspace_id, current_developer, db)

    service = get_agent_mention_service(db)
    result = await service.approve_action(
        action_id=UUID(action_id),
        user_id=UUID(current_developer.id),
        user_name=current_developer.name,
        notes=data.notes,
        modified_payload=data.modified_payload,
    )
    return result


@router.post("/agents/actions/{action_id}/reject")
async def reject_agent_action(
    workspace_id: str,
    action_id: str,
    data: ReviewActionRequest,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Reject an agent action.

    The action will not be executed and the agent will learn from this feedback.
    """
    await check_workspace_permission(workspace_id, current_developer, db)

    service = get_agent_mention_service(db)
    result = await service.reject_action(
        action_id=UUID(action_id),
        user_id=UUID(current_developer.id),
        user_name=current_developer.name,
        notes=data.notes,
    )
    return result


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
