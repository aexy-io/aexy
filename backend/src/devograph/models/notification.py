"""Notification models for in-app and email notifications.

This module provides models for:
- Notifications (in-app notification center)
- NotificationPreferences (per-user settings)
- EmailNotificationLog (AWS SES email tracking)
"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from devograph.core.database import Base

if TYPE_CHECKING:
    from devograph.models.developer import Developer


class NotificationEventType(str, Enum):
    """Types of notification events."""

    # Review-related
    PEER_REVIEW_REQUESTED = "peer_review_requested"
    PEER_REVIEW_RECEIVED = "peer_review_received"
    REVIEW_CYCLE_PHASE_CHANGED = "review_cycle_phase_changed"
    MANAGER_REVIEW_COMPLETED = "manager_review_completed"
    REVIEW_ACKNOWLEDGED = "review_acknowledged"

    # Deadline reminders
    DEADLINE_REMINDER_1_DAY = "deadline_reminder_1_day"
    DEADLINE_REMINDER_DAY_OF = "deadline_reminder_day_of"

    # Goal-related
    GOAL_AUTO_LINKED = "goal_auto_linked"
    GOAL_AT_RISK = "goal_at_risk"
    GOAL_COMPLETED = "goal_completed"

    # General
    WORKSPACE_INVITE = "workspace_invite"
    TEAM_ADDED = "team_added"

    # On-call related
    ONCALL_SHIFT_STARTING = "oncall_shift_starting"  # Reminder before shift
    ONCALL_SHIFT_STARTED = "oncall_shift_started"
    ONCALL_SHIFT_ENDING = "oncall_shift_ending"  # Reminder before shift ends
    ONCALL_SWAP_REQUESTED = "oncall_swap_requested"
    ONCALL_SWAP_ACCEPTED = "oncall_swap_accepted"
    ONCALL_SWAP_DECLINED = "oncall_swap_declined"


class Notification(Base):
    """In-app notification for a user.

    Stores notifications that appear in the notification bell/center.
    Can optionally trigger email notifications based on user preferences.
    """

    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    recipient_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )

    # Event details
    event_type: Mapped[str] = mapped_column(String(100), index=True)
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text)

    # Context for rendering and navigation (JSONB)
    context: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )
    # {
    #   "review_id": "...",
    #   "goal_id": "...",
    #   "cycle_id": "...",
    #   "requester_name": "John Doe",
    #   "requester_avatar": "...",
    #   "action_url": "/reviews/abc123",
    #   "workspace_id": "..."
    # }

    # Read status
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Delivery status
    in_app_delivered: Mapped[bool] = mapped_column(Boolean, default=True)
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    email_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
    )

    # Relationships
    recipient: Mapped["Developer"] = relationship(
        "Developer",
        back_populates="notifications",
    )


class NotificationPreference(Base):
    """User preferences for notification delivery per event type.

    Controls which channels (in-app, email, slack) receive notifications
    for each event type. Defaults are created on first access.
    """

    __tablename__ = "notification_preferences"
    __table_args__ = (
        UniqueConstraint("developer_id", "event_type", name="uq_notification_pref_developer_event"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(100))

    # Channel preferences
    in_app_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    slack_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    developer: Mapped["Developer"] = relationship(
        "Developer",
        back_populates="notification_preferences",
    )


class EmailNotificationLog(Base):
    """Log of email notifications sent via AWS SES.

    Tracks email delivery status and provides audit trail
    for sent notifications.
    """

    __tablename__ = "email_notification_logs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    notification_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("notifications.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Email details
    recipient_email: Mapped[str] = mapped_column(String(255))
    subject: Mapped[str] = mapped_column(String(500))
    template_name: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # AWS SES tracking
    ses_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(50),
        default="pending",
    )  # "pending", "sent", "delivered", "bounced", "failed"
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    notification: Mapped["Notification | None"] = relationship(
        "Notification",
    )


# Default preferences for new users
DEFAULT_NOTIFICATION_PREFERENCES = {
    NotificationEventType.PEER_REVIEW_REQUESTED: {"in_app": True, "email": True, "slack": False},
    NotificationEventType.PEER_REVIEW_RECEIVED: {"in_app": True, "email": True, "slack": False},
    NotificationEventType.REVIEW_CYCLE_PHASE_CHANGED: {"in_app": True, "email": True, "slack": False},
    NotificationEventType.MANAGER_REVIEW_COMPLETED: {"in_app": True, "email": True, "slack": False},
    NotificationEventType.REVIEW_ACKNOWLEDGED: {"in_app": True, "email": False, "slack": False},
    NotificationEventType.DEADLINE_REMINDER_1_DAY: {"in_app": True, "email": True, "slack": False},
    NotificationEventType.DEADLINE_REMINDER_DAY_OF: {"in_app": True, "email": True, "slack": False},
    NotificationEventType.GOAL_AUTO_LINKED: {"in_app": True, "email": False, "slack": False},
    NotificationEventType.GOAL_AT_RISK: {"in_app": True, "email": True, "slack": False},
    NotificationEventType.GOAL_COMPLETED: {"in_app": True, "email": False, "slack": False},
    NotificationEventType.WORKSPACE_INVITE: {"in_app": True, "email": True, "slack": False},
    NotificationEventType.TEAM_ADDED: {"in_app": True, "email": False, "slack": False},
    # On-call notifications
    NotificationEventType.ONCALL_SHIFT_STARTING: {"in_app": True, "email": True, "slack": True},
    NotificationEventType.ONCALL_SHIFT_STARTED: {"in_app": True, "email": False, "slack": True},
    NotificationEventType.ONCALL_SHIFT_ENDING: {"in_app": True, "email": False, "slack": False},
    NotificationEventType.ONCALL_SWAP_REQUESTED: {"in_app": True, "email": True, "slack": True},
    NotificationEventType.ONCALL_SWAP_ACCEPTED: {"in_app": True, "email": True, "slack": False},
    NotificationEventType.ONCALL_SWAP_DECLINED: {"in_app": True, "email": True, "slack": False},
}
