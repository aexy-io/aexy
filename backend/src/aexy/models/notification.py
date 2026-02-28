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

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer


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

    # Task mentions
    TASK_MENTIONED = "task_mentioned"  # User was mentioned in a task description with @
    MENTION = "mention"  # User was @mentioned in a comment or note

    # Usage alerts (billing)
    USAGE_ALERT_80 = "usage_alert_80"  # 80% of limit reached
    USAGE_ALERT_90 = "usage_alert_90"  # 90% of limit reached (critical)
    USAGE_ALERT_100 = "usage_alert_100"  # Limit reached

    # Insights alerts
    INSIGHT_ALERT_WARNING = "insight_alert_warning"
    INSIGHT_ALERT_CRITICAL = "insight_alert_critical"

    # Leave related
    LEAVE_REQUEST_SUBMITTED = "leave_request_submitted"
    LEAVE_REQUEST_APPROVED = "leave_request_approved"
    LEAVE_REQUEST_REJECTED = "leave_request_rejected"
    LEAVE_REQUEST_CANCELLED = "leave_request_cancelled"

    # App access requests
    APP_ACCESS_REQUESTED = "app_access_requested"
    APP_ACCESS_APPROVED = "app_access_approved"
    APP_ACCESS_REJECTED = "app_access_rejected"

    # Reminder related
    REMINDER_DUE = "reminder_due"  # Reminder is due
    REMINDER_ACKNOWLEDGED = "reminder_acknowledged"  # Reminder was acknowledged
    REMINDER_COMPLETED = "reminder_completed"  # Reminder was completed
    REMINDER_ESCALATED = "reminder_escalated"  # Reminder was escalated
    REMINDER_OVERDUE = "reminder_overdue"  # Reminder is overdue
    REMINDER_ASSIGNED = "reminder_assigned"  # Reminder was assigned

    # Agent mentions
    AGENT_INVOKED = "agent_invoked"

    # Agent policy events
    AGENT_TOOL_BLOCKED = "agent_tool_blocked"
    AGENT_APPROVAL_REQUIRED = "agent_approval_required"
    AGENT_CONFIG_CHANGED = "agent_config_changed"

    # Blocker escalation
    BLOCKER_ESCALATED = "blocker_escalated"

    # Uptime
    UPTIME_INCIDENT_CREATED = "uptime_incident_created"
    UPTIME_INCIDENT_RESOLVED = "uptime_incident_resolved"

    # Learning
    LEARNING_APPROVAL_REQUESTED = "learning_approval_requested"
    LEARNING_APPROVAL_DECIDED = "learning_approval_decided"
    LEARNING_GOAL_ASSIGNED = "learning_goal_assigned"
    LEARNING_GOAL_OVERDUE = "learning_goal_overdue"
    LEARNING_ACTIVITY_COMPLETED = "learning_activity_completed"

    # Forms
    FORM_SUBMISSION_RECEIVED = "form_submission_received"
    FORM_SUBMISSION_FAILED = "form_submission_failed"

    # Campaigns
    CAMPAIGN_COMPLETED = "campaign_completed"
    CAMPAIGN_SCHEDULED = "campaign_scheduled"

    # Automations
    AUTOMATION_RUN_FAILED = "automation_run_failed"
    AUTOMATION_RUN_COMPLETED = "automation_run_completed"

    # Hiring / Assessments
    ASSESSMENT_INVITATION_SENT = "assessment_invitation_sent"
    ASSESSMENT_COMPLETED = "assessment_completed"
    CANDIDATE_STAGE_CHANGED = "candidate_stage_changed"

    # GTM
    GTM_ALERT_TRIGGERED = "gtm_alert_triggered"

    # Documents
    DOCUMENT_SHARED = "document_shared"
    DOCUMENT_MENTIONED = "document_mentioned"
    DOCUMENT_COMMENTED = "document_commented"


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
    slack_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    slack_sent_at: Mapped[datetime | None] = mapped_column(
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
    web_push_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

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


class WebPushSubscription(Base):
    """Browser push notification subscription.

    Stores Web Push API subscription info per device/browser for a developer.
    Uses VAPID for authentication with the push service.
    """

    __tablename__ = "web_push_subscriptions"
    __table_args__ = (
        UniqueConstraint("developer_id", "endpoint", name="uq_web_push_sub_developer_endpoint"),
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
    endpoint: Mapped[str] = mapped_column(Text)
    p256dh_key: Mapped[str] = mapped_column(Text)
    auth_key: Mapped[str] = mapped_column(Text)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class NotificationCategoryPreference(Base):
    """Category-level notification preferences with optional Slack channel routing.

    Provides master toggles for entire notification categories and allows
    routing Slack notifications to a specific channel per category.
    """

    __tablename__ = "notification_category_preferences"
    __table_args__ = (
        UniqueConstraint("developer_id", "category", name="uq_notif_cat_pref_developer_category"),
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
    category: Mapped[str] = mapped_column(String(100))

    # Channel master toggles
    in_app_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    slack_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    web_push_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # Slack channel routing (optional - if set, notifications go to this channel instead of DM)
    slack_channel_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    slack_channel_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


# Category mapping for notification event types
NOTIFICATION_CATEGORIES: dict[str, list[str]] = {
    "reviews_and_goals": [
        NotificationEventType.PEER_REVIEW_REQUESTED.value,
        NotificationEventType.PEER_REVIEW_RECEIVED.value,
        NotificationEventType.REVIEW_CYCLE_PHASE_CHANGED.value,
        NotificationEventType.MANAGER_REVIEW_COMPLETED.value,
        NotificationEventType.REVIEW_ACKNOWLEDGED.value,
        NotificationEventType.GOAL_AUTO_LINKED.value,
        NotificationEventType.GOAL_AT_RISK.value,
        NotificationEventType.GOAL_COMPLETED.value,
    ],
    "reminders": [
        NotificationEventType.DEADLINE_REMINDER_1_DAY.value,
        NotificationEventType.DEADLINE_REMINDER_DAY_OF.value,
        NotificationEventType.REMINDER_DUE.value,
        NotificationEventType.REMINDER_ACKNOWLEDGED.value,
        NotificationEventType.REMINDER_COMPLETED.value,
        NotificationEventType.REMINDER_ESCALATED.value,
        NotificationEventType.REMINDER_OVERDUE.value,
        NotificationEventType.REMINDER_ASSIGNED.value,
    ],
    "on_call": [
        NotificationEventType.ONCALL_SHIFT_STARTING.value,
        NotificationEventType.ONCALL_SHIFT_STARTED.value,
        NotificationEventType.ONCALL_SHIFT_ENDING.value,
        NotificationEventType.ONCALL_SWAP_REQUESTED.value,
        NotificationEventType.ONCALL_SWAP_ACCEPTED.value,
        NotificationEventType.ONCALL_SWAP_DECLINED.value,
    ],
    "workspace": [
        NotificationEventType.WORKSPACE_INVITE.value,
        NotificationEventType.TEAM_ADDED.value,
    ],
    "mentions": [
        NotificationEventType.TASK_MENTIONED.value,
        NotificationEventType.MENTION.value,
    ],
    "billing_and_usage": [
        NotificationEventType.USAGE_ALERT_80.value,
        NotificationEventType.USAGE_ALERT_90.value,
        NotificationEventType.USAGE_ALERT_100.value,
    ],
    "insights": [
        NotificationEventType.INSIGHT_ALERT_WARNING.value,
        NotificationEventType.INSIGHT_ALERT_CRITICAL.value,
        NotificationEventType.BLOCKER_ESCALATED.value,
    ],
    "leave": [
        NotificationEventType.LEAVE_REQUEST_SUBMITTED.value,
        NotificationEventType.LEAVE_REQUEST_APPROVED.value,
        NotificationEventType.LEAVE_REQUEST_REJECTED.value,
        NotificationEventType.LEAVE_REQUEST_CANCELLED.value,
    ],
    "app_access": [
        NotificationEventType.APP_ACCESS_REQUESTED.value,
        NotificationEventType.APP_ACCESS_APPROVED.value,
        NotificationEventType.APP_ACCESS_REJECTED.value,
    ],
    "agents": [
        NotificationEventType.AGENT_INVOKED.value,
        NotificationEventType.AGENT_TOOL_BLOCKED.value,
        NotificationEventType.AGENT_APPROVAL_REQUIRED.value,
        NotificationEventType.AGENT_CONFIG_CHANGED.value,
    ],
    "uptime": [
        NotificationEventType.UPTIME_INCIDENT_CREATED.value,
        NotificationEventType.UPTIME_INCIDENT_RESOLVED.value,
    ],
    "learning": [
        NotificationEventType.LEARNING_APPROVAL_REQUESTED.value,
        NotificationEventType.LEARNING_APPROVAL_DECIDED.value,
        NotificationEventType.LEARNING_GOAL_ASSIGNED.value,
        NotificationEventType.LEARNING_GOAL_OVERDUE.value,
        NotificationEventType.LEARNING_ACTIVITY_COMPLETED.value,
    ],
    "forms": [
        NotificationEventType.FORM_SUBMISSION_RECEIVED.value,
        NotificationEventType.FORM_SUBMISSION_FAILED.value,
    ],
    "campaigns": [
        NotificationEventType.CAMPAIGN_COMPLETED.value,
        NotificationEventType.CAMPAIGN_SCHEDULED.value,
    ],
    "automations": [
        NotificationEventType.AUTOMATION_RUN_FAILED.value,
        NotificationEventType.AUTOMATION_RUN_COMPLETED.value,
    ],
    "hiring": [
        NotificationEventType.ASSESSMENT_INVITATION_SENT.value,
        NotificationEventType.ASSESSMENT_COMPLETED.value,
        NotificationEventType.CANDIDATE_STAGE_CHANGED.value,
    ],
    "gtm": [
        NotificationEventType.GTM_ALERT_TRIGGERED.value,
    ],
    "documents": [
        NotificationEventType.DOCUMENT_SHARED.value,
        NotificationEventType.DOCUMENT_MENTIONED.value,
        NotificationEventType.DOCUMENT_COMMENTED.value,
    ],
}

# Reverse mapping: event_type -> category
EVENT_TYPE_TO_CATEGORY: dict[str, str] = {
    event_type: category
    for category, event_types in NOTIFICATION_CATEGORIES.items()
    for event_type in event_types
}


# Default preferences for new users
DEFAULT_NOTIFICATION_PREFERENCES = {
    NotificationEventType.PEER_REVIEW_REQUESTED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.PEER_REVIEW_RECEIVED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.REVIEW_CYCLE_PHASE_CHANGED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.MANAGER_REVIEW_COMPLETED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.REVIEW_ACKNOWLEDGED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.DEADLINE_REMINDER_1_DAY: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.DEADLINE_REMINDER_DAY_OF: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.GOAL_AUTO_LINKED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.GOAL_AT_RISK: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.GOAL_COMPLETED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.WORKSPACE_INVITE: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.TEAM_ADDED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    # On-call notifications (web_push enabled by default for critical alerts)
    NotificationEventType.ONCALL_SHIFT_STARTING: {"in_app": True, "email": True, "slack": True, "web_push": True},
    NotificationEventType.ONCALL_SHIFT_STARTED: {"in_app": True, "email": False, "slack": True, "web_push": True},
    NotificationEventType.ONCALL_SHIFT_ENDING: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.ONCALL_SWAP_REQUESTED: {"in_app": True, "email": True, "slack": True, "web_push": True},
    NotificationEventType.ONCALL_SWAP_ACCEPTED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.ONCALL_SWAP_DECLINED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Task mentions
    NotificationEventType.TASK_MENTIONED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.MENTION: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Insights alerts
    NotificationEventType.INSIGHT_ALERT_WARNING: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.INSIGHT_ALERT_CRITICAL: {"in_app": True, "email": True, "slack": False, "web_push": True},
    # Leave notifications
    NotificationEventType.LEAVE_REQUEST_SUBMITTED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.LEAVE_REQUEST_APPROVED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.LEAVE_REQUEST_REJECTED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.LEAVE_REQUEST_CANCELLED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    # App access requests
    NotificationEventType.APP_ACCESS_REQUESTED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.APP_ACCESS_APPROVED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.APP_ACCESS_REJECTED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Reminders
    NotificationEventType.REMINDER_DUE: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.REMINDER_ACKNOWLEDGED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.REMINDER_COMPLETED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.REMINDER_ESCALATED: {"in_app": True, "email": True, "slack": True, "web_push": True},
    NotificationEventType.REMINDER_OVERDUE: {"in_app": True, "email": True, "slack": True, "web_push": True},
    NotificationEventType.REMINDER_ASSIGNED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Agent mentions
    NotificationEventType.AGENT_INVOKED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    # Agent policy events
    NotificationEventType.AGENT_TOOL_BLOCKED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.AGENT_APPROVAL_REQUIRED: {"in_app": True, "email": True, "slack": True, "web_push": True},
    NotificationEventType.AGENT_CONFIG_CHANGED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    # Blocker escalation
    NotificationEventType.BLOCKER_ESCALATED: {"in_app": True, "email": True, "slack": True, "web_push": True},
    # Uptime
    NotificationEventType.UPTIME_INCIDENT_CREATED: {"in_app": True, "email": True, "slack": True, "web_push": True},
    NotificationEventType.UPTIME_INCIDENT_RESOLVED: {"in_app": True, "email": True, "slack": True, "web_push": False},
    # Learning
    NotificationEventType.LEARNING_APPROVAL_REQUESTED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.LEARNING_APPROVAL_DECIDED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.LEARNING_GOAL_ASSIGNED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.LEARNING_GOAL_OVERDUE: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.LEARNING_ACTIVITY_COMPLETED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    # Forms
    NotificationEventType.FORM_SUBMISSION_RECEIVED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.FORM_SUBMISSION_FAILED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Campaigns
    NotificationEventType.CAMPAIGN_COMPLETED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.CAMPAIGN_SCHEDULED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    # Automations
    NotificationEventType.AUTOMATION_RUN_FAILED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.AUTOMATION_RUN_COMPLETED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    # Hiring / Assessments
    NotificationEventType.ASSESSMENT_INVITATION_SENT: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.ASSESSMENT_COMPLETED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.CANDIDATE_STAGE_CHANGED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    # GTM
    NotificationEventType.GTM_ALERT_TRIGGERED: {"in_app": True, "email": True, "slack": True, "web_push": False},
    # Documents
    NotificationEventType.DOCUMENT_SHARED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.DOCUMENT_MENTIONED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.DOCUMENT_COMMENTED: {"in_app": True, "email": True, "slack": False, "web_push": False},
}
