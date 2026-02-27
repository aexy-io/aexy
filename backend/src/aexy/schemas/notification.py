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

    # Mentions
    MENTION = "mention"

    # App access requests
    APP_ACCESS_REQUESTED = "app_access_requested"
    APP_ACCESS_APPROVED = "app_access_approved"
    APP_ACCESS_REJECTED = "app_access_rejected"

    # Usage alerts (billing)
    USAGE_ALERT_80 = "usage_alert_80"  # 80% of limit reached
    USAGE_ALERT_90 = "usage_alert_90"  # 90% of limit reached (critical)
    USAGE_ALERT_100 = "usage_alert_100"  # Limit reached

    # On-call
    ONCALL_SHIFT_STARTING = "oncall_shift_starting"
    ONCALL_SHIFT_STARTED = "oncall_shift_started"
    ONCALL_SHIFT_ENDING = "oncall_shift_ending"
    ONCALL_SWAP_REQUESTED = "oncall_swap_requested"
    ONCALL_SWAP_ACCEPTED = "oncall_swap_accepted"
    ONCALL_SWAP_DECLINED = "oncall_swap_declined"

    # Task mentions
    TASK_MENTIONED = "task_mentioned"

    # Insights
    INSIGHT_ALERT_WARNING = "insight_alert_warning"
    INSIGHT_ALERT_CRITICAL = "insight_alert_critical"

    # Leave
    LEAVE_REQUEST_SUBMITTED = "leave_request_submitted"
    LEAVE_REQUEST_APPROVED = "leave_request_approved"
    LEAVE_REQUEST_REJECTED = "leave_request_rejected"
    LEAVE_REQUEST_CANCELLED = "leave_request_cancelled"

    # Reminders
    REMINDER_DUE = "reminder_due"
    REMINDER_ACKNOWLEDGED = "reminder_acknowledged"
    REMINDER_COMPLETED = "reminder_completed"
    REMINDER_ESCALATED = "reminder_escalated"
    REMINDER_OVERDUE = "reminder_overdue"
    REMINDER_ASSIGNED = "reminder_assigned"

    # Agent mentions
    AGENT_INVOKED = "agent_invoked"

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
    slack_sent: bool = False
    slack_sent_at: datetime | None = None
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
    web_push_enabled: bool = False


class NotificationPreferenceUpdate(BaseModel):
    """Update notification preference."""

    in_app_enabled: bool | None = None
    email_enabled: bool | None = None
    slack_enabled: bool | None = None
    web_push_enabled: bool | None = None


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
    categories: dict[str, "CategoryPreferenceResponse"] = Field(default_factory=dict)
    category_map: dict[str, list[str]] = Field(default_factory=dict)


class BulkPreferenceUpdate(BaseModel):
    """Bulk update notification preferences."""

    event_type: NotificationEventType
    in_app_enabled: bool | None = None
    email_enabled: bool | None = None
    slack_enabled: bool | None = None
    web_push_enabled: bool | None = None


# Web Push Subscription schemas
class WebPushSubscriptionCreate(BaseModel):
    """Create a web push subscription."""

    endpoint: str
    p256dh_key: str
    auth_key: str
    user_agent: str | None = None


class WebPushSubscriptionResponse(BaseModel):
    """Web push subscription response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    developer_id: str
    endpoint: str
    is_active: bool
    created_at: datetime


# Category Preference schemas
class CategoryPreferenceResponse(BaseModel):
    """Category-level notification preference response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    category: str
    in_app_enabled: bool = True
    email_enabled: bool = True
    slack_enabled: bool = False
    web_push_enabled: bool = False
    slack_channel_id: str | None = None
    slack_channel_name: str | None = None


class CategoryPreferenceUpdate(BaseModel):
    """Update category-level notification preference."""

    in_app_enabled: bool | None = None
    email_enabled: bool | None = None
    slack_enabled: bool | None = None
    web_push_enabled: bool | None = None
    slack_channel_id: str | None = None
    slack_channel_name: str | None = None


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
    NotificationEventType.MENTION: {
        "title": "You were mentioned",
        "body_template": "{mentioner_name} mentioned you in a {entity_type}: {snippet}",
        "email_subject": "{mentioner_name} mentioned you",
    },
    NotificationEventType.APP_ACCESS_REQUESTED: {
        "title": "App Access Request",
        "body_template": "{requester_name} requested access to {app_name}",
        "email_subject": "New App Access Request: {app_name}",
    },
    NotificationEventType.APP_ACCESS_APPROVED: {
        "title": "Access Request Approved",
        "body_template": "Your request for access to {app_name} was approved",
        "email_subject": "Access Approved: {app_name}",
    },
    NotificationEventType.APP_ACCESS_REJECTED: {
        "title": "Access Request Declined",
        "body_template": "Your request for access to {app_name} was not approved",
        "email_subject": "Access Request Update: {app_name}",
    },
    NotificationEventType.USAGE_ALERT_80: {
        "title": "Usage Alert",
        "body_template": "You've used 80% of your {resource_type}. Current usage: {current}/{limit}.",
        "email_subject": "Usage Alert: 80% of {resource_type} Used",
    },
    NotificationEventType.USAGE_ALERT_90: {
        "title": "Critical Usage Alert",
        "body_template": "You've used 90% of your {resource_type}. Current usage: {current}/{limit}. Consider upgrading your plan.",
        "email_subject": "Critical: 90% of {resource_type} Used",
    },
    NotificationEventType.USAGE_ALERT_100: {
        "title": "Limit Reached",
        "body_template": "You've reached your {resource_type} limit ({limit}). Upgrade your plan to continue using this feature.",
        "email_subject": "Action Required: {resource_type} Limit Reached",
    },
    # Leave
    NotificationEventType.LEAVE_REQUEST_SUBMITTED: {
        "title": "Leave Request Submitted",
        "body_template": "{requester_name} submitted a leave request ({leave_type}, {start_date} - {end_date})",
        "email_subject": "Leave Request from {requester_name}",
    },
    NotificationEventType.LEAVE_REQUEST_APPROVED: {
        "title": "Leave Request Approved",
        "body_template": "Your leave request ({leave_type}, {start_date} - {end_date}) has been approved",
        "email_subject": "Leave Request Approved",
    },
    NotificationEventType.LEAVE_REQUEST_REJECTED: {
        "title": "Leave Request Rejected",
        "body_template": "Your leave request ({leave_type}, {start_date} - {end_date}) was rejected",
        "email_subject": "Leave Request Rejected",
    },
    NotificationEventType.LEAVE_REQUEST_CANCELLED: {
        "title": "Leave Request Cancelled",
        "body_template": "{requester_name} cancelled their approved leave ({leave_type}, {start_date} - {end_date})",
        "email_subject": "Leave Request Cancelled by {requester_name}",
    },
    # Agent
    NotificationEventType.AGENT_INVOKED: {
        "title": "Agent Working",
        "body_template": "The {agent_name} agent has been invoked and is processing your request",
        "email_subject": "{agent_name} is working on your request",
    },
    # Blocker
    NotificationEventType.BLOCKER_ESCALATED: {
        "title": "Blocker Escalated",
        "body_template": "A blocker has been active too long: {description}",
        "email_subject": "Blocker Escalated: Action Required",
    },
    # Uptime
    NotificationEventType.UPTIME_INCIDENT_CREATED: {
        "title": "Service Down",
        "body_template": "{monitor_name} is down — incident created",
        "email_subject": "[DOWN] {monitor_name} is not responding",
    },
    NotificationEventType.UPTIME_INCIDENT_RESOLVED: {
        "title": "Service Recovered",
        "body_template": "{monitor_name} is back up — incident resolved",
        "email_subject": "[RECOVERED] {monitor_name} is back up",
    },
    # Learning
    NotificationEventType.LEARNING_APPROVAL_REQUESTED: {
        "title": "Learning Approval Requested",
        "body_template": "{requester_name} requested approval for: {course_title}",
        "email_subject": "Learning Approval Request: {course_title}",
    },
    NotificationEventType.LEARNING_APPROVAL_DECIDED: {
        "title": "Learning Request {decision}",
        "body_template": "Your request for \"{course_title}\" has been {decision}",
        "email_subject": "Learning Request {decision}: {course_title}",
    },
    NotificationEventType.LEARNING_GOAL_ASSIGNED: {
        "title": "Learning Goal Assigned",
        "body_template": "A new learning goal has been assigned to you: {goal_title}",
        "email_subject": "New Learning Goal: {goal_title}",
    },
    NotificationEventType.LEARNING_GOAL_OVERDUE: {
        "title": "Learning Goal Overdue",
        "body_template": "Your learning goal \"{goal_title}\" is past its due date",
        "email_subject": "Overdue: Learning Goal \"{goal_title}\"",
    },
    NotificationEventType.LEARNING_ACTIVITY_COMPLETED: {
        "title": "Activity Completed",
        "body_template": "You completed \"{activity_title}\" and earned {points} points",
        "email_subject": "Activity Completed: {activity_title}",
    },
    # Forms
    NotificationEventType.FORM_SUBMISSION_RECEIVED: {
        "title": "New Form Submission",
        "body_template": "New submission on \"{form_name}\" from {submitter_name}",
        "email_subject": "New Submission: {form_name}",
    },
    NotificationEventType.FORM_SUBMISSION_FAILED: {
        "title": "Form Submission Failed",
        "body_template": "A submission on \"{form_name}\" failed to process",
        "email_subject": "Failed Submission: {form_name}",
    },
    # Campaigns
    NotificationEventType.CAMPAIGN_COMPLETED: {
        "title": "Campaign Completed",
        "body_template": "Campaign \"{campaign_name}\" has been sent to {total_recipients} recipients",
        "email_subject": "Campaign Sent: {campaign_name}",
    },
    NotificationEventType.CAMPAIGN_SCHEDULED: {
        "title": "Campaign Scheduled",
        "body_template": "Campaign \"{campaign_name}\" is scheduled for {scheduled_at}",
        "email_subject": "Campaign Scheduled: {campaign_name}",
    },
    # Automations
    NotificationEventType.AUTOMATION_RUN_FAILED: {
        "title": "Automation Failed",
        "body_template": "Automation \"{automation_name}\" failed: {error}",
        "email_subject": "Automation Failed: {automation_name}",
    },
    NotificationEventType.AUTOMATION_RUN_COMPLETED: {
        "title": "Automation Completed",
        "body_template": "Automation \"{automation_name}\" completed successfully",
        "email_subject": "Automation Completed: {automation_name}",
    },
    # Hiring / Assessments
    NotificationEventType.ASSESSMENT_INVITATION_SENT: {
        "title": "Assessment Published",
        "body_template": "Assessment \"{assessment_title}\" published with {invitation_count} invitations",
        "email_subject": "Assessment Published: {assessment_title}",
    },
    NotificationEventType.ASSESSMENT_COMPLETED: {
        "title": "Assessment Completed",
        "body_template": "{candidate_name} completed the assessment \"{assessment_title}\"",
        "email_subject": "Assessment Completed: {candidate_name}",
    },
    NotificationEventType.CANDIDATE_STAGE_CHANGED: {
        "title": "Candidate Stage Changed",
        "body_template": "{candidate_name} moved to {new_stage} stage",
        "email_subject": "Candidate Update: {candidate_name} → {new_stage}",
    },
    # GTM
    NotificationEventType.GTM_ALERT_TRIGGERED: {
        "title": "GTM Alert",
        "body_template": "Alert triggered: {event_type} — {summary}",
        "email_subject": "GTM Alert: {event_type}",
    },
    # Documents
    NotificationEventType.DOCUMENT_SHARED: {
        "title": "Document Shared",
        "body_template": "{sharer_name} shared \"{document_title}\" with you",
        "email_subject": "{sharer_name} shared a document with you",
    },
    NotificationEventType.DOCUMENT_MENTIONED: {
        "title": "Mentioned in Document",
        "body_template": "{mentioner_name} mentioned you in \"{document_title}\"",
        "email_subject": "You were mentioned in \"{document_title}\"",
    },
    NotificationEventType.DOCUMENT_COMMENTED: {
        "title": "New Comment on Document",
        "body_template": "{commenter_name} commented on \"{document_title}\"",
        "email_subject": "New comment on \"{document_title}\"",
    },
}
