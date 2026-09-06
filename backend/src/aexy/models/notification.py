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
    """Types of notification events.

    This enum is the single source of truth. ``aexy.schemas.notification``
    re-exports it rather than declaring its own copy — there were two
    declarations and they drifted, which is not a cosmetic problem:
    ``EmailService`` imports the schema one, so a member that existed only here
    failed the ``NotificationEventType(...)`` cast and the email died inside a
    broad ``except Exception``, and ``get_preference`` fell back to
    "email enabled" for a member it could not parse, leaving the event
    un-silenceable and absent from the settings screen.

    Adding a member here is not enough to make it work. A new event needs an
    entry in ``NOTIFICATION_CATEGORIES`` (category toggle + Slack routing) and
    in ``DEFAULT_NOTIFICATION_PREFERENCES`` (so it appears in settings and has
    channel defaults); ``tests/unit/test_notification_event_coverage.py``
    fails if either is missing. Do not add a member without a real emitter —
    a toggle that controls nothing is worse than no toggle.
    """

    # Review-related
    PEER_REVIEW_REQUESTED = "peer_review_requested"
    PEER_REVIEW_RECEIVED = "peer_review_received"
    REVIEW_CYCLE_ACTIVATED = "review_cycle_activated"
    REVIEW_CYCLE_PHASE_CHANGED = "review_cycle_phase_changed"
    REVIEW_DEADLINE_REMINDER = "review_deadline_reminder"
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

    # Workspace join requests
    WORKSPACE_JOIN_REQUEST = "workspace_join_request"
    WORKSPACE_JOIN_APPROVED = "workspace_join_approved"
    WORKSPACE_JOIN_REJECTED = "workspace_join_rejected"

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

    # Task assignment and lifecycle. Covers sprint tasks, backlog/project cards,
    # bugs and stories — they are all rows in the same table, reached through
    # different screens.
    TASK_ASSIGNED = "task_assigned"  # Task/card assigned to you, or you were added as an assignee
    TASK_UNASSIGNED = "task_unassigned"  # You were taken off a task you were on
    TASK_STATUS_CHANGED = "task_status_changed"  # Somebody else moved a task you are on
    TASK_COMMENTED = "task_commented"  # Somebody commented on a task you are on or reported

    # Ticket assignment (form tickets — the internal request queue)
    TICKET_ASSIGNED = "ticket_assigned"
    # The work behind a ticket finished. Sent to the ticket's owner, who is
    # usually not the person who completed the task — the developer closed a
    # sprint task and has no idea a ticket was waiting on it.
    TICKET_RESOLVED = "ticket_resolved"

    # Service desk. `pending_with` is the desk's real handoff — a ticket moves
    # between team queues far more often than it changes assigned owner, and the
    # queue it lands in is the one that has to act.
    DESK_TICKET_ASSIGNED = "desk_ticket_assigned"
    DESK_TICKET_PENDING_WITH_CHANGED = "desk_ticket_pending_with_changed"

    # A connected account stopped working. Not "a sync failed" — one failed sync
    # is noise and retries. This fires when the connection itself is refused and
    # will keep being refused until a person reconnects it, which is the only
    # sync problem a notification can actually resolve.
    INTEGRATION_DISCONNECTED = "integration_disconnected"

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

    # Product feedback. FEEDBACK_SUBMITTED goes to platform admins, not to the
    # workspace's own admins — feedback is addressed to us.
    FEEDBACK_SUBMITTED = "feedback_submitted"
    FEEDBACK_STATUS_CHANGED = "feedback_status_changed"

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
    # A held agent action was approved or rejected. Sent to whoever's grant
    # the agent ran under, so the person the agent works for learns the
    # outcome without polling the queue.
    AGENT_ACTION_DECIDED = "agent_action_decided"

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
    # A scheduled campaign whose send time passed while it still could not send.
    # Without this the poller's only record was a log line on a worker, and the
    # campaign sat looking scheduled indefinitely.
    CAMPAIGN_SEND_BLOCKED = "campaign_send_blocked"

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
    # An AI proposed an edit to a document you own. Previously delivered through a
    # separate `document_notifications` table with its own inbox in the docs
    # sidebar, which meant no email, no per-user preference and nothing in the
    # main notification bell — so a proposal waited silently for someone to go
    # looking in the right panel.
    DOCUMENT_AI_PROPOSAL = "document_ai_proposal"
    # Inherited responsibility, not a request. Someone who set up a doc-to-code
    # sync has left the workspace and their syncs now answer to you — silence
    # here means the first you hear of it is an AI proposal you did not ask for
    # on a document you did not know you owned.
    DOCUMENT_SYNC_OWNERSHIP_TRANSFERRED = "document_sync_ownership_transferred"
    # The Word edit you asked the AI to draft in the background is ready to
    # review. Addressed to the person who ASKED, which is why it is distinct
    # from DOCUMENT_AI_PROPOSAL: that one tells a document's owner something is
    # waiting on them, and the self-action guard there deliberately suppresses
    # it for the requester. Without this, asking for a draft and closing the tab
    # meant never hearing that it arrived.
    DOCX_AI_DRAFT_READY = "docx_ai_draft_ready"
    # The AI answered the comment you left in a Word document. Addressed to the
    # comment's author, who may be neither the requester nor the owner — often
    # they are a reviewer who typed a remark in Word and has no reason to be
    # watching Aexy at all.
    DOCX_AI_COMMENT_ANSWERED = "docx_ai_comment_answered"

    # Documentation impact — the only two events in the product addressed to the
    # recipient about their *own* action, which is why their emitters must not
    # pass `actor_id`: `_notify_quietly` drops the actor.
    #
    # A pull request is open and touches code that documented pages describe. The
    # moment worth catching, because the author can still fix it in this branch.
    DOCUMENT_IMPACT_PR_OPENED = "document_impact_pr_opened"
    # It merged and those pages are now wrong. Distinct from DOCUMENT_AI_PROPOSAL:
    # that one tells a document's owner a proposal is waiting for review, this
    # tells the change's author about the debt their merge just created.
    DOCUMENT_IMPACT_PR_MERGED = "document_impact_pr_merged"

    # Chat
    CHAT_MENTION = "chat_mention"
    AI_CONVERSATION_SHARED = "ai_conversation_shared"

    # Community forum. Distinct from the chat events because the audience is
    # different: these are strangers posting on a public page, and the team needs
    # to hear about them whether or not anybody was @mentioned.
    COMMUNITY_TOPIC = "community_topic"
    COMMUNITY_REPLY = "community_reply"
    COMMUNITY_PENDING_REVIEW = "community_pending_review"


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
        NotificationEventType.REVIEW_CYCLE_ACTIVATED.value,
        NotificationEventType.REVIEW_CYCLE_PHASE_CHANGED.value,
        NotificationEventType.REVIEW_DEADLINE_REMINDER.value,
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
        NotificationEventType.WORKSPACE_JOIN_REQUEST.value,
        NotificationEventType.WORKSPACE_JOIN_APPROVED.value,
        NotificationEventType.WORKSPACE_JOIN_REJECTED.value,
        NotificationEventType.INTEGRATION_DISCONNECTED.value,
    ],
    "mentions": [
        NotificationEventType.TASK_MENTIONED.value,
        NotificationEventType.MENTION.value,
    ],
    "tasks": [
        NotificationEventType.TASK_ASSIGNED.value,
        NotificationEventType.TASK_UNASSIGNED.value,
        NotificationEventType.TASK_STATUS_CHANGED.value,
        NotificationEventType.TASK_COMMENTED.value,
        NotificationEventType.TICKET_ASSIGNED.value,
        NotificationEventType.TICKET_RESOLVED.value,
    ],
    "service_desk": [
        NotificationEventType.DESK_TICKET_ASSIGNED.value,
        NotificationEventType.DESK_TICKET_PENDING_WITH_CHANGED.value,
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
    "feedback": [
        NotificationEventType.FEEDBACK_SUBMITTED.value,
        NotificationEventType.FEEDBACK_STATUS_CHANGED.value,
    ],
    "agents": [
        NotificationEventType.AGENT_INVOKED.value,
        NotificationEventType.AGENT_TOOL_BLOCKED.value,
        NotificationEventType.AGENT_APPROVAL_REQUIRED.value,
        NotificationEventType.AGENT_CONFIG_CHANGED.value,
        NotificationEventType.AGENT_ACTION_DECIDED.value,
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
        NotificationEventType.CAMPAIGN_SEND_BLOCKED.value,
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
        NotificationEventType.DOCUMENT_AI_PROPOSAL.value,
        NotificationEventType.DOCUMENT_SYNC_OWNERSHIP_TRANSFERRED.value,
        NotificationEventType.DOCX_AI_DRAFT_READY.value,
        NotificationEventType.DOCX_AI_COMMENT_ANSWERED.value,
    ],
    # Its own category rather than joining "documents", for two reasons worth the
    # two lines: turning off document comments should not silence feedback on your
    # own pull requests as a side effect, and `slack_channel_id` is per category —
    # so a team can route doc-impact to #docs without also routing mentions there.
    "documentation_impact": [
        NotificationEventType.DOCUMENT_IMPACT_PR_OPENED.value,
        NotificationEventType.DOCUMENT_IMPACT_PR_MERGED.value,
    ],
    "chat": [
        NotificationEventType.CHAT_MENTION.value,
        NotificationEventType.AI_CONVERSATION_SHARED.value,
    ],
    # Its own category, not part of "chat": a team that mutes internal chat
    # noise still needs to know a customer asked something in public, and the
    # per-category Slack routing means community traffic can go to its own
    # channel.
    "community": [
        NotificationEventType.COMMUNITY_TOPIC.value,
        NotificationEventType.COMMUNITY_REPLY.value,
        NotificationEventType.COMMUNITY_PENDING_REVIEW.value,
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
    NotificationEventType.REVIEW_CYCLE_ACTIVATED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.REVIEW_CYCLE_PHASE_CHANGED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.REVIEW_DEADLINE_REMINDER: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.MANAGER_REVIEW_COMPLETED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.REVIEW_ACKNOWLEDGED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.DEADLINE_REMINDER_1_DAY: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.DEADLINE_REMINDER_DAY_OF: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Opt-in: fires during GitHub sync and can match many commits at once, so
    # every channel is off until somebody asks for it.
    NotificationEventType.GOAL_AUTO_LINKED: {"in_app": False, "email": False, "slack": False, "web_push": False},
    NotificationEventType.GOAL_AT_RISK: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.GOAL_COMPLETED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.WORKSPACE_INVITE: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.TEAM_ADDED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    # Workspace join requests. An admin who misses the request leaves somebody
    # locked out of the workspace, so email is on; the decision notices go to the
    # requester, who is waiting on exactly this answer.
    NotificationEventType.WORKSPACE_JOIN_REQUEST: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.WORKSPACE_JOIN_APPROVED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.WORKSPACE_JOIN_REJECTED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Task assignment and lifecycle.
    #
    # Assignment emails, because work landing on you is the one thing you cannot
    # discover by not opening the app — until now that was true of nothing in
    # this product, which is why the events exist at all.
    #
    # Status changes and comments are in-app only by default. They fire on every
    # column drag and every comment on anything you touch; defaulting those to
    # email is how a notification system trains people to filter it.
    NotificationEventType.TASK_ASSIGNED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.TASK_UNASSIGNED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.TASK_STATUS_CHANGED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.TASK_COMMENTED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.TICKET_ASSIGNED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Email on by default: the owner is told the work behind their ticket is
    # finished and it is theirs to confirm with the requester. In-app alone
    # would be missed by exactly the people who do not live on the board.
    NotificationEventType.TICKET_RESOLVED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Service desk. These carry an external SLA clock, so both the new owner and
    # the queue a ticket lands in get email — the daily digest was previously the
    # only signal and it can be up to a day late.
    NotificationEventType.DESK_TICKET_ASSIGNED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.DESK_TICKET_PENDING_WITH_CHANGED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # On-call notifications (web_push enabled by default for critical alerts)
    NotificationEventType.ONCALL_SHIFT_STARTING: {"in_app": True, "email": True, "slack": True, "web_push": True},
    # Nothing fires this. `oncall_shift_starting` is the wired one and goes out
    # 30 minutes ahead; a second alert at the exact moment the shift begins tells
    # the engineer what they were told half an hour ago. Off on every channel so
    # the toggle cannot promise delivery that will not happen.
    NotificationEventType.ONCALL_SHIFT_STARTED: {"in_app": False, "email": False, "slack": False, "web_push": False},
    NotificationEventType.ONCALL_SHIFT_ENDING: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.ONCALL_SWAP_REQUESTED: {"in_app": True, "email": True, "slack": True, "web_push": True},
    NotificationEventType.ONCALL_SWAP_ACCEPTED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.ONCALL_SWAP_DECLINED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Task mentions
    NotificationEventType.TASK_MENTIONED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.MENTION: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Usage alerts (billing). These were emitted but had no defaults entry, so
    # get_preferences() never created a row, they never appeared in the settings
    # list, and get_preference()'s unknown-event fallback defaulted email to on —
    # billing mail nobody could switch off. 80% is in-app only; the two that mean
    # service is about to stop, or has, get email.
    NotificationEventType.USAGE_ALERT_80: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.USAGE_ALERT_90: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.USAGE_ALERT_100: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Email on by default: the person who can reconnect the account is not
    # necessarily looking at the app, and not looking is exactly how a desk goes
    # a day without noticing its mail stopped.
    NotificationEventType.INTEGRATION_DISCONNECTED: {"in_app": True, "email": True, "slack": False, "web_push": False},
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
    # Email off by default on both: platform admins get a daily digest instead
    # of a message per item, and an author watching their own suggestion does
    # not need mail every time it moves a stage.
    NotificationEventType.FEEDBACK_SUBMITTED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.FEEDBACK_STATUS_CHANGED: {"in_app": True, "email": False, "slack": False, "web_push": False},
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
    NotificationEventType.AGENT_ACTION_DECIDED: {"in_app": True, "email": False, "slack": False, "web_push": False},
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
    # Email on by default: the send time has already passed, so nobody is going to
    # discover this by opening the app at the right moment.
    NotificationEventType.CAMPAIGN_SEND_BLOCKED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Automations
    NotificationEventType.AUTOMATION_RUN_FAILED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Opt-in: a run that worked is the normal case, and a workspace with hourly
    # automations would collect hundreds of these a week.
    NotificationEventType.AUTOMATION_RUN_COMPLETED: {"in_app": False, "email": False, "slack": False, "web_push": False},
    # Hiring / Assessments
    NotificationEventType.ASSESSMENT_INVITATION_SENT: {"in_app": True, "email": False, "slack": False, "web_push": False},
    NotificationEventType.ASSESSMENT_COMPLETED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Goes to `HiringCandidate.owner_id`, the recruiter accountable for the
    # candidate. In-app only: it fires on every drag of the hiring board, and the
    # owner moving their own candidate is filtered out as the actor, so what is
    # left is "somebody else touched your candidate".
    NotificationEventType.CANDIDATE_STAGE_CHANGED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    # GTM
    NotificationEventType.GTM_ALERT_TRIGGERED: {"in_app": True, "email": True, "slack": True, "web_push": False},
    # Documents
    NotificationEventType.DOCUMENT_SHARED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Being named in a document is addressed to you personally, so it emails like
    # every other mention in the product.
    NotificationEventType.DOCUMENT_MENTIONED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # A comment on a thread you are in is ambient rather than addressed — and a
    # busy document produces a lot of them — so it stays in-app. Anyone mentioned
    # by name in the same comment gets DOCUMENT_MENTIONED instead, which emails.
    NotificationEventType.DOCUMENT_COMMENTED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    # A proposal sits in a review queue waiting on the document owner, so it is
    # worth an email — that queue is exactly the thing nobody thinks to check.
    NotificationEventType.DOCUMENT_AI_PROPOSAL: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Email too: this arrives when a colleague leaves, which is exactly when
    # nobody is watching the bell.
    NotificationEventType.DOCUMENT_SYNC_OWNERSHIP_TRANSFERRED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Email on by default: you asked for this and then went to do something
    # else, which is the whole reason the background path exists. In-app alone
    # would only reach you if you were still looking at Aexy.
    NotificationEventType.DOCX_AI_DRAFT_READY: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Email on by default for a different reason: the recipient is often a
    # reviewer who wrote a comment in Word and has no habit of opening Aexy, so
    # in-app would be a notification nobody ever sees.
    NotificationEventType.DOCX_AI_COMMENT_ANSWERED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Documentation impact
    #
    # Fires on every pull request that touches a documented module, which on a
    # well-documented repository is most of them. In-app only: an email per pull
    # request is how you teach somebody to filter your sender. The loud channels
    # for this moment are the pull request comment and the check run, which are
    # already in front of the author.
    NotificationEventType.DOCUMENT_IMPACT_PR_OPENED: {"in_app": True, "email": False, "slack": False, "web_push": False},
    # Once per pull request, at the moment the author stops thinking about it.
    # Email on, because the whole failure mode is that nobody is looking here.
    NotificationEventType.DOCUMENT_IMPACT_PR_MERGED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Chat
    NotificationEventType.CHAT_MENTION: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.AI_CONVERSATION_SHARED: {"in_app": True, "email": True, "slack": False, "web_push": False},
    # Community. Email on by default for all three: an unanswered question on a
    # public page is worse than an unread in-app badge, and a post held for
    # review is invisible to everyone until somebody acts on it.
    NotificationEventType.COMMUNITY_TOPIC: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.COMMUNITY_REPLY: {"in_app": True, "email": True, "slack": False, "web_push": False},
    NotificationEventType.COMMUNITY_PENDING_REVIEW: {"in_app": True, "email": True, "slack": False, "web_push": False},
}
