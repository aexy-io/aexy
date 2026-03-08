"""Notification delivery event ledger.

Event-sourced table that records every delivery state change per notification
per channel (in_app, email, web_push, slack). Each row is an immutable event.
The latest event per channel determines the current delivery status.
"""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base


class DeliveryChannel(str, Enum):
    """Notification delivery channels."""
    IN_APP = "in_app"
    EMAIL = "email"
    WEB_PUSH = "web_push"
    SLACK = "slack"


class DeliveryStatus(str, Enum):
    """Delivery status progression."""
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    OPENED = "opened"
    CLICKED = "clicked"
    FAILED = "failed"
    BOUNCED = "bounced"


class NotificationDeliveryEvent(Base):
    """Immutable delivery event for a notification on a specific channel.

    Append-only ledger — never update rows, only insert new events.
    The most recent event per (notification_id, channel) is the current status.
    """

    __tablename__ = "notification_delivery_events"
    __table_args__ = (
        Index("ix_nde_notification_channel", "notification_id", "channel"),
        Index("ix_nde_developer_created", "developer_id", "created_at"),
        Index("ix_nde_developer_channel_status", "developer_id", "channel", "status"),
        Index("ix_nde_provider_message_id", "provider_message_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    notification_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("notifications.id", ondelete="CASCADE"),
        nullable=False,
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Channel and status
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)

    # Provider info
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Extra context (error details, bounce type, user agent, link URL, etc.)
    event_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)

    # When the event actually occurred (from provider)
    event_timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    # When we recorded it
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
