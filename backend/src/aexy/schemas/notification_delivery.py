"""Schemas for notification delivery status center."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class DeliveryChannelEnum(str, Enum):
    IN_APP = "in_app"
    EMAIL = "email"
    WEB_PUSH = "web_push"
    SLACK = "slack"


class DeliveryStatusEnum(str, Enum):
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    OPENED = "opened"
    CLICKED = "clicked"
    FAILED = "failed"
    BOUNCED = "bounced"


class DeliveryEventResponse(BaseModel):
    id: str
    channel: str
    status: str
    provider: str | None = None
    provider_message_id: str | None = None
    event_metadata: dict = {}
    event_timestamp: datetime
    created_at: datetime


class ChannelDeliveryStatus(BaseModel):
    channel: str
    current_status: str
    events: list[DeliveryEventResponse] = []


class DeliveryTimelineResponse(BaseModel):
    notification_id: str
    channels: dict[str, ChannelDeliveryStatus]


class NotificationWithDelivery(BaseModel):
    id: str
    event_type: str
    title: str
    body: str
    created_at: datetime
    is_read: bool
    channels: dict[str, str]  # channel -> current_status


class PaginatedDeliveryStatusResponse(BaseModel):
    items: list[NotificationWithDelivery]
    total: int
    page: int
    per_page: int
    has_next: bool


class ChannelStats(BaseModel):
    channel: str
    total_sent: int
    total_delivered: int
    total_opened: int
    total_clicked: int
    total_failed: int
    total_bounced: int
    delivery_rate: float
    open_rate: float
    click_rate: float


class DeliveryStatsResponse(BaseModel):
    channels: list[ChannelStats]
    overall_delivery_rate: float
    total_notifications: int
    period_start: str | None = None
    period_end: str | None = None
