"""API endpoints for the Notification Delivery Status Center."""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer_id
from aexy.core.database import get_db
from aexy.services.notification_delivery_service import NotificationDeliveryService
from aexy.schemas.notification_delivery import (
    PaginatedDeliveryStatusResponse,
    DeliveryTimelineResponse,
    ChannelDeliveryStatus,
    DeliveryStatsResponse,
    ChannelStats,
)

router = APIRouter(prefix="/notification-delivery")


@router.get("/", response_model=PaginatedDeliveryStatusResponse)
async def list_delivery_status(
    channel: Optional[str] = Query(None, description="Filter by channel: in_app, email, web_push, slack"),
    status: Optional[str] = Query(None, description="Filter by status: queued, sent, delivered, opened, clicked, failed, bounced"),
    date_from: Optional[datetime] = Query(None, description="Filter from date (ISO 8601)"),
    date_to: Optional[datetime] = Query(None, description="Filter to date (ISO 8601)"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
):
    """List notifications with their delivery status per channel."""
    service = NotificationDeliveryService(db)
    return await service.list_notifications_with_delivery(
        developer_id=developer_id,
        channel=channel,
        status=status,
        date_from=date_from,
        date_to=date_to,
        page=page,
        per_page=per_page,
    )


@router.get("/{notification_id}/timeline", response_model=DeliveryTimelineResponse)
async def get_delivery_timeline(
    notification_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
):
    """Get the full delivery timeline for a notification across all channels."""
    service = NotificationDeliveryService(db)
    result = await service.get_delivery_timeline(notification_id, developer_id)

    # Transform to response schema
    channels = {}
    for ch, data in result.get("channels", {}).items():
        channels[ch] = ChannelDeliveryStatus(
            channel=ch,
            current_status=data["current_status"],
            events=data["events"],
        )

    return DeliveryTimelineResponse(
        notification_id=notification_id,
        channels=channels,
    )


@router.get("/{notification_id}/status")
async def get_delivery_status(
    notification_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
):
    """Get current delivery status per channel for a notification."""
    service = NotificationDeliveryService(db)
    return await service.get_delivery_status_summary(notification_id, developer_id)


@router.get("/stats/aggregate", response_model=DeliveryStatsResponse)
async def get_delivery_stats(
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregate delivery stats per channel."""
    service = NotificationDeliveryService(db)
    result = await service.get_aggregate_stats(
        developer_id=developer_id,
        date_from=date_from,
        date_to=date_to,
    )

    return DeliveryStatsResponse(
        channels=[ChannelStats(**ch) for ch in result["channels"]],
        overall_delivery_rate=result["overall_delivery_rate"],
        total_notifications=result["total_notifications"],
        period_start=result.get("period_start"),
        period_end=result.get("period_end"),
    )
