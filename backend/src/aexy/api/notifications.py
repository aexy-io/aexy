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
