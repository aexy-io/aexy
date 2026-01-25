"""Notification API endpoints."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.models.notification import NotificationEventType
from aexy.schemas.notification import (
    BulkPreferenceUpdate,
    MarkReadRequest,
    NotificationListResponse,
    NotificationPreferenceResponse,
    NotificationPreferencesResponse,
    NotificationPreferenceUpdate,
    NotificationResponse,
    PollResponse,
    UnreadCountResponse,
)
from aexy.services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


# ============ Notification Endpoints ============


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    developer_id: str = Query(..., description="Developer ID to get notifications for"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    unread_only: bool = Query(False, description="Only return unread notifications"),
    db: AsyncSession = Depends(get_db),
):
    """Get paginated list of notifications for a developer."""
    service = NotificationService(db)

    offset = (page - 1) * per_page
    notifications, total = await service.get_notifications(
        developer_id=developer_id,
        limit=per_page,
        offset=offset,
        unread_only=unread_only,
    )

    unread_count = await service.get_unread_count(developer_id)

    return NotificationListResponse(
        notifications=[NotificationResponse.model_validate(n) for n in notifications],
        total=total,
        page=page,
        per_page=per_page,
        has_next=(page * per_page) < total,
        unread_count=unread_count,
    )


@router.get("/count", response_model=UnreadCountResponse)
async def get_unread_count(
    developer_id: str = Query(..., description="Developer ID"),
    db: AsyncSession = Depends(get_db),
):
    """Get count of unread notifications for badge display."""
    service = NotificationService(db)
    count = await service.get_unread_count(developer_id)
    return UnreadCountResponse(count=count)


@router.get("/poll", response_model=PollResponse)
async def poll_notifications(
    developer_id: str = Query(..., description="Developer ID"),
    since: datetime = Query(..., description="ISO timestamp to poll from"),
    db: AsyncSession = Depends(get_db),
):
    """Poll for new notifications since a timestamp.

    Use this for real-time notification updates.
    Recommended polling interval: 30-60 seconds.
    """
    service = NotificationService(db)
    notifications = await service.poll_notifications(developer_id, since)

    latest = notifications[0].created_at if notifications else None

    return PollResponse(
        notifications=[NotificationResponse.model_validate(n) for n in notifications],
        latest_timestamp=latest,
    )


@router.get("/{notification_id}", response_model=NotificationResponse)
async def get_notification(
    notification_id: str,
    developer_id: str = Query(..., description="Developer ID for authorization"),
    db: AsyncSession = Depends(get_db),
):
    """Get a single notification."""
    service = NotificationService(db)
    notification = await service.get_notification(notification_id, developer_id)

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    return NotificationResponse.model_validate(notification)


@router.post("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: str,
    developer_id: str = Query(..., description="Developer ID for authorization"),
    db: AsyncSession = Depends(get_db),
):
    """Mark a notification as read."""
    service = NotificationService(db)
    notification = await service.mark_as_read(notification_id, developer_id)

    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    return NotificationResponse.model_validate(notification)


@router.post("/read-all", response_model=dict)
async def mark_all_notifications_read(
    developer_id: str = Query(..., description="Developer ID"),
    db: AsyncSession = Depends(get_db),
):
    """Mark all notifications as read for a developer."""
    service = NotificationService(db)
    count = await service.mark_all_as_read(developer_id)
    return {"marked_read": count}


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: str,
    developer_id: str = Query(..., description="Developer ID for authorization"),
    db: AsyncSession = Depends(get_db),
):
    """Delete a notification."""
    service = NotificationService(db)
    deleted = await service.delete_notification(notification_id, developer_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Notification not found")


# ============ Preference Endpoints ============


@router.get("/preferences", response_model=NotificationPreferencesResponse)
async def get_notification_preferences(
    developer_id: str = Query(..., description="Developer ID"),
    db: AsyncSession = Depends(get_db),
):
    """Get all notification preferences for a developer.

    Returns preferences for all event types with current settings.
    Missing preferences are created with defaults.
    """
    service = NotificationService(db)
    preferences = await service.get_preferences(developer_id)

    return NotificationPreferencesResponse(
        preferences={
            event_type: NotificationPreferenceResponse.model_validate(pref)
            for event_type, pref in preferences.items()
        },
        available_event_types=[e.value for e in NotificationEventType],
    )


@router.get("/preferences/{event_type}", response_model=NotificationPreferenceResponse)
async def get_notification_preference(
    event_type: str,
    developer_id: str = Query(..., description="Developer ID"),
    db: AsyncSession = Depends(get_db),
):
    """Get notification preference for a specific event type."""
    # Validate event type
    try:
        NotificationEventType(event_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid event type. Valid types: {[e.value for e in NotificationEventType]}",
        )

    service = NotificationService(db)
    pref = await service.get_preference(developer_id, event_type)

    return NotificationPreferenceResponse.model_validate(pref)


@router.put("/preferences/{event_type}", response_model=NotificationPreferenceResponse)
async def update_notification_preference(
    event_type: str,
    data: NotificationPreferenceUpdate,
    developer_id: str = Query(..., description="Developer ID"),
    db: AsyncSession = Depends(get_db),
):
    """Update notification preference for a specific event type."""
    # Validate event type
    try:
        NotificationEventType(event_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid event type. Valid types: {[e.value for e in NotificationEventType]}",
        )

    service = NotificationService(db)
    pref = await service.update_preference(
        developer_id=developer_id,
        event_type=event_type,
        in_app_enabled=data.in_app_enabled,
        email_enabled=data.email_enabled,
        slack_enabled=data.slack_enabled,
    )

    return NotificationPreferenceResponse.model_validate(pref)


@router.post("/preferences/bulk", response_model=list[NotificationPreferenceResponse])
async def bulk_update_preferences(
    updates: list[BulkPreferenceUpdate],
    developer_id: str = Query(..., description="Developer ID"),
    db: AsyncSession = Depends(get_db),
):
    """Bulk update multiple notification preferences."""
    service = NotificationService(db)
    results = []

    for update in updates:
        pref = await service.update_preference(
            developer_id=developer_id,
            event_type=update.event_type.value,
            in_app_enabled=update.in_app_enabled,
            email_enabled=update.email_enabled,
            slack_enabled=update.slack_enabled,
        )
        results.append(NotificationPreferenceResponse.model_validate(pref))

    return results


# ============ Workspace Email Delivery Endpoints (Enterprise Only) ============


from datetime import timedelta, timezone as tz
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from aexy.api.developers import get_current_developer_id
from aexy.models.notification import EmailNotificationLog, Notification
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.models.plan import PlanTier


class WorkspaceEmailStatsResponse(BaseModel):
    """Email delivery statistics for a workspace."""

    total_sent: int
    total_delivered: int
    total_failed: int
    total_bounced: int
    total_pending: int
    delivery_rate: float
    bounce_rate: float
    sent_today: int
    sent_this_week: int
    sent_this_month: int


class WorkspaceEmailLogResponse(BaseModel):
    """Email log for workspace view."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    notification_id: str | None
    recipient_email: str
    subject: str
    template_name: str | None
    ses_message_id: str | None
    status: str
    error_message: str | None
    sent_at: datetime | None
    created_at: datetime
    notification_type: str | None = None


class PaginatedWorkspaceEmailLogs(BaseModel):
    """Paginated email logs for workspace."""

    items: list[WorkspaceEmailLogResponse]
    total: int
    page: int
    per_page: int
    has_next: bool


async def require_enterprise_workspace(
    workspace_id: str,
    developer_id: str,
    db: AsyncSession,
) -> Workspace:
    """Verify workspace has Enterprise subscription and user has admin access.

    Returns the workspace if checks pass, raises HTTPException otherwise.
    """
    # Get workspace with plan info
    query = (
        select(Workspace)
        .options(selectinload(Workspace.plan))
        .where(Workspace.id == workspace_id)
    )
    result = await db.execute(query)
    workspace = result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    # Check if user is admin of the workspace
    member_query = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.developer_id == developer_id,
        WorkspaceMember.role.in_(["owner", "admin"]),
    )
    member_result = await db.execute(member_query)
    member = member_result.scalar_one_or_none()

    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Workspace admin access required",
        )

    # Check for Enterprise tier
    if not workspace.plan or workspace.plan.tier != PlanTier.ENTERPRISE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Enterprise subscription required for this feature",
        )

    return workspace


@router.get("/workspace/{workspace_id}/emails", response_model=PaginatedWorkspaceEmailLogs)
async def get_workspace_email_logs(
    workspace_id: str,
    developer_id: str = Query(..., description="Developer ID for authorization"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    status_filter: str | None = Query(None, description="Filter by status"),
    db: AsyncSession = Depends(get_db),
):
    """Get email logs for a workspace (Enterprise only).

    Returns paginated email logs for emails sent to workspace members
    or from workspace notifications.
    """
    # Verify enterprise access
    workspace = await require_enterprise_workspace(workspace_id, developer_id, db)

    # Get workspace member emails
    member_emails_query = (
        select(WorkspaceMember)
        .options(selectinload(WorkspaceMember.developer))
        .where(WorkspaceMember.workspace_id == workspace_id)
    )
    member_result = await db.execute(member_emails_query)
    members = member_result.scalars().all()
    member_emails = [m.developer.email for m in members if m.developer]

    if not member_emails:
        return PaginatedWorkspaceEmailLogs(
            items=[],
            total=0,
            page=page,
            per_page=per_page,
            has_next=False,
        )

    # Query email logs for workspace members
    query = (
        select(EmailNotificationLog)
        .options(selectinload(EmailNotificationLog.notification))
        .where(EmailNotificationLog.recipient_email.in_(member_emails))
    )

    if status_filter:
        query = query.where(EmailNotificationLog.status == status_filter)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query) or 0

    # Apply pagination and ordering
    offset = (page - 1) * per_page
    query = query.order_by(EmailNotificationLog.created_at.desc())
    query = query.offset(offset).limit(per_page)

    result = await db.execute(query)
    logs = result.scalars().all()

    items = []
    for log in logs:
        notification_type = None
        if log.notification:
            notification_type = log.notification.event_type

        items.append(
            WorkspaceEmailLogResponse(
                id=log.id,
                notification_id=log.notification_id,
                recipient_email=log.recipient_email,
                subject=log.subject,
                template_name=log.template_name,
                ses_message_id=log.ses_message_id,
                status=log.status,
                error_message=log.error_message,
                sent_at=log.sent_at,
                created_at=log.created_at,
                notification_type=notification_type,
            )
        )

    return PaginatedWorkspaceEmailLogs(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        has_next=(page * per_page) < total,
    )


@router.get("/workspace/{workspace_id}/email-stats", response_model=WorkspaceEmailStatsResponse)
async def get_workspace_email_stats(
    workspace_id: str,
    developer_id: str = Query(..., description="Developer ID for authorization"),
    db: AsyncSession = Depends(get_db),
):
    """Get email delivery statistics for a workspace (Enterprise only)."""
    # Verify enterprise access
    workspace = await require_enterprise_workspace(workspace_id, developer_id, db)

    # Get workspace member emails
    member_emails_query = (
        select(WorkspaceMember)
        .options(selectinload(WorkspaceMember.developer))
        .where(WorkspaceMember.workspace_id == workspace_id)
    )
    member_result = await db.execute(member_emails_query)
    members = member_result.scalars().all()
    member_emails = [m.developer.email for m in members if m.developer]

    if not member_emails:
        return WorkspaceEmailStatsResponse(
            total_sent=0,
            total_delivered=0,
            total_failed=0,
            total_bounced=0,
            total_pending=0,
            delivery_rate=1.0,
            bounce_rate=0.0,
            sent_today=0,
            sent_this_week=0,
            sent_this_month=0,
        )

    now = datetime.now(tz.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    month_start = today_start - timedelta(days=30)

    # Base filter for workspace member emails
    base_filter = EmailNotificationLog.recipient_email.in_(member_emails)

    # Count by status
    total_sent = await db.scalar(
        select(func.count(EmailNotificationLog.id)).where(
            base_filter,
            EmailNotificationLog.status.in_(["sent", "delivered"]),
        )
    ) or 0

    total_delivered = await db.scalar(
        select(func.count(EmailNotificationLog.id)).where(
            base_filter,
            EmailNotificationLog.status == "delivered",
        )
    ) or 0

    total_failed = await db.scalar(
        select(func.count(EmailNotificationLog.id)).where(
            base_filter,
            EmailNotificationLog.status == "failed",
        )
    ) or 0

    total_bounced = await db.scalar(
        select(func.count(EmailNotificationLog.id)).where(
            base_filter,
            EmailNotificationLog.status == "bounced",
        )
    ) or 0

    total_pending = await db.scalar(
        select(func.count(EmailNotificationLog.id)).where(
            base_filter,
            EmailNotificationLog.status == "pending",
        )
    ) or 0

    # Time-based stats
    sent_today = await db.scalar(
        select(func.count(EmailNotificationLog.id)).where(
            base_filter,
            EmailNotificationLog.created_at >= today_start,
        )
    ) or 0

    sent_this_week = await db.scalar(
        select(func.count(EmailNotificationLog.id)).where(
            base_filter,
            EmailNotificationLog.created_at >= week_start,
        )
    ) or 0

    sent_this_month = await db.scalar(
        select(func.count(EmailNotificationLog.id)).where(
            base_filter,
            EmailNotificationLog.created_at >= month_start,
        )
    ) or 0

    # Calculate rates
    total_processed = total_sent + total_failed + total_bounced
    delivery_rate = total_sent / total_processed if total_processed > 0 else 1.0
    bounce_rate = total_bounced / total_processed if total_processed > 0 else 0.0

    return WorkspaceEmailStatsResponse(
        total_sent=total_sent,
        total_delivered=total_delivered,
        total_failed=total_failed,
        total_bounced=total_bounced,
        total_pending=total_pending,
        delivery_rate=delivery_rate,
        bounce_rate=bounce_rate,
        sent_today=sent_today,
        sent_this_week=sent_this_week,
        sent_this_month=sent_this_month,
    )


# ============ Admin/Debug Endpoints ============


@router.post("/test", response_model=NotificationResponse, include_in_schema=False)
async def send_test_notification(
    developer_id: str = Query(..., description="Developer ID"),
    event_type: str = Query("peer_review_requested", description="Event type to test"),
    db: AsyncSession = Depends(get_db),
):
    """Send a test notification (for development/debugging)."""
    service = NotificationService(db)

    try:
        event_enum = NotificationEventType(event_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid event type")

    notification = await service.create_notification_from_event(
        recipient_id=developer_id,
        event_type=event_enum,
        context={
            "requester_name": "Test User",
            "requester_avatar": None,
            "review_id": "test-review-123",
            "request_id": "test-request-123",
            "action_url": "/reviews/test",
            "cycle_name": "Test Cycle",
            "new_phase": "self_review",
            "goal_title": "Test Goal",
            "count": 5,
            "task_type": "Self Review",
            "deadline": "2024-01-15",
            "developer_name": "Test Developer",
            "workspace_name": "Test Workspace",
            "team_name": "Test Team",
        },
    )

    if not notification:
        raise HTTPException(
            status_code=400,
            detail="Notification not created (may be disabled by preferences)",
        )

    return NotificationResponse.model_validate(notification)
