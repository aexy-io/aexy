"""Notification Pydantic schemas."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


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

    # Workspace join requests
    WORKSPACE_JOIN_REQUEST = "workspace_join_request"
    WORKSPACE_JOIN_APPROVED = "workspace_join_approved"
    WORKSPACE_JOIN_REJECTED = "workspace_join_rejected"

    # Assessment invitations
    ASSESSMENT_INVITATION = "assessment_invitation"


class NotificationContext(BaseModel):
    """Context for notification rendering and navigation."""

    review_id: str | None = None
    goal_id: str | None = None
    cycle_id: str | None = None
    request_id: str | None = None
    requester_name: str | None = None
    requester_avatar: str | None = None
    action_url: str | None = None
    workspace_id: str | None = None
    workspace_name: str | None = None
    extra: dict | None = None


# Notification schemas
class NotificationBase(BaseModel):
    """Base notification schema."""

    event_type: NotificationEventType
    title: str
    body: str
    context: NotificationContext = Field(default_factory=NotificationContext)


class NotificationCreate(NotificationBase):
    """Create a notification."""

    recipient_id: str


class NotificationResponse(BaseModel):
    """Notification response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    recipient_id: str
    event_type: str
    title: str
    body: str
    context: dict
    is_read: bool
    read_at: datetime | None = None
    in_app_delivered: bool
    email_sent: bool
    email_sent_at: datetime | None = None
    created_at: datetime


class NotificationListResponse(BaseModel):
    """Paginated notification list response."""

    notifications: list[NotificationResponse]
    total: int
    page: int
    per_page: int
    has_next: bool
    unread_count: int


class UnreadCountResponse(BaseModel):
    """Unread notification count."""

    count: int


class PollResponse(BaseModel):
    """Poll for new notifications response."""

    notifications: list[NotificationResponse]
    latest_timestamp: datetime | None = None


class MarkReadRequest(BaseModel):
    """Mark notifications as read request."""

    notification_ids: list[str] | None = None  # None means mark all as read


# Notification Preference schemas
class NotificationPreferenceBase(BaseModel):
    """Base notification preference schema."""

    in_app_enabled: bool = True
    email_enabled: bool = True
    slack_enabled: bool = False


class NotificationPreferenceUpdate(BaseModel):
    """Update notification preference."""

    in_app_enabled: bool | None = None
    email_enabled: bool | None = None
    slack_enabled: bool | None = None


class NotificationPreferenceResponse(NotificationPreferenceBase):
    """Notification preference response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    developer_id: str
    event_type: str
    created_at: datetime
    updated_at: datetime


class NotificationPreferencesResponse(BaseModel):
    """All notification preferences for a user."""

    preferences: dict[str, NotificationPreferenceResponse]
    available_event_types: list[str]


class BulkPreferenceUpdate(BaseModel):
    """Bulk update notification preferences."""

    event_type: NotificationEventType
    in_app_enabled: bool | None = None
    email_enabled: bool | None = None
    slack_enabled: bool | None = None


# Email notification log schemas
class EmailLogResponse(BaseModel):
    """Email notification log response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    notification_id: str | None = None
    recipient_email: str
    subject: str
    template_name: str | None = None
    ses_message_id: str | None = None
    status: str
    error_message: str | None = None
    sent_at: datetime | None = None
    created_at: datetime


# Notification templates (for reference)
NOTIFICATION_TEMPLATES = {
    NotificationEventType.PEER_REVIEW_REQUESTED: {
        "title": "Peer Review Request",
        "body_template": "{requester_name} requested your feedback for their performance review",
        "email_subject": "Action Required: Peer Review Request from {requester_name}",
    },
    NotificationEventType.PEER_REVIEW_RECEIVED: {
        "title": "Peer Feedback Received",
        "body_template": "You received new peer feedback for your performance review",
        "email_subject": "New Peer Feedback Received",
    },
    NotificationEventType.REVIEW_CYCLE_PHASE_CHANGED: {
        "title": "Review Cycle Update",
        "body_template": "The {cycle_name} review cycle has moved to {new_phase} phase",
        "email_subject": "Review Cycle Phase Change: {cycle_name}",
    },
    NotificationEventType.MANAGER_REVIEW_COMPLETED: {
        "title": "Manager Review Completed",
        "body_template": "Your manager has completed your performance review",
        "email_subject": "Your Performance Review is Ready",
    },
    NotificationEventType.REVIEW_ACKNOWLEDGED: {
        "title": "Review Acknowledged",
        "body_template": "{developer_name} has acknowledged their performance review",
        "email_subject": "Review Acknowledged by {developer_name}",
    },
    NotificationEventType.DEADLINE_REMINDER_1_DAY: {
        "title": "Deadline Reminder",
        "body_template": "{task_type} deadline is tomorrow ({deadline})",
        "email_subject": "Reminder: {task_type} Due Tomorrow",
    },
    NotificationEventType.DEADLINE_REMINDER_DAY_OF: {
        "title": "Deadline Today",
        "body_template": "{task_type} is due today ({deadline})",
        "email_subject": "URGENT: {task_type} Due Today",
    },
    NotificationEventType.GOAL_AUTO_LINKED: {
        "title": "Contributions Linked",
        "body_template": "{count} new contributions were auto-linked to your goal \"{goal_title}\"",
        "email_subject": "New Contributions Linked to Your Goal",
    },
    NotificationEventType.GOAL_AT_RISK: {
        "title": "Goal At Risk",
        "body_template": "Your goal \"{goal_title}\" may not meet its deadline",
        "email_subject": "Action Required: Goal At Risk",
    },
    NotificationEventType.GOAL_COMPLETED: {
        "title": "Goal Completed",
        "body_template": "Congratulations! You completed your goal \"{goal_title}\"",
        "email_subject": "Goal Completed: {goal_title}",
    },
    NotificationEventType.WORKSPACE_INVITE: {
        "title": "Workspace Invitation",
        "body_template": "You've been invited to join {workspace_name}",
        "email_subject": "Invitation to Join {workspace_name}",
    },
    NotificationEventType.TEAM_ADDED: {
        "title": "Added to Team",
        "body_template": "You've been added to {team_name} in {workspace_name}",
        "email_subject": "Welcome to {team_name}",
    },
    NotificationEventType.WORKSPACE_JOIN_REQUEST: {
        "title": "Workspace Join Request",
        "body_template": "{requester_name} ({requester_email}) has requested to join {workspace_name}",
        "email_subject": "New Join Request for {workspace_name}",
    },
    NotificationEventType.WORKSPACE_JOIN_APPROVED: {
        "title": "Join Request Approved",
        "body_template": "Your request to join {workspace_name} has been approved. Welcome aboard!",
        "email_subject": "Welcome to {workspace_name}!",
    },
    NotificationEventType.WORKSPACE_JOIN_REJECTED: {
        "title": "Join Request Declined",
        "body_template": "Your request to join {workspace_name} was not approved",
        "email_subject": "Update on Your Join Request for {workspace_name}",
    },
    NotificationEventType.ASSESSMENT_INVITATION: {
        "title": "Assessment Invitation",
        "body_template": "You have been invited to take the assessment: {assessment_title}. Please complete it by {deadline}.",
        "email_subject": "You're Invited: {assessment_title} Assessment",
    },
}
