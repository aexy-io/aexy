"""Notification Pydantic schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# The event-type enum lives with the model, not here, and is re-exported for the
# many callers that import it from this module. There used to be a second
# declaration below and the two drifted: this one grew `workspace_join_*` and an
# `assessment_invitation` duplicate while the model's copy grew
# `ai_conversation_shared`. Because EmailService imports the enum from *this*
# module, a model-only member failed the cast and its email was silently recorded
# as failed and never retried, and NotificationService.get_preference could not
# resolve it either, so it defaulted to email-enabled and never appeared in the
# notification settings screen. Re-exporting makes that class of bug impossible
# rather than merely fixed.
from aexy.models.notification import NotificationEventType  # noqa: E402

__all__ = ["NotificationEventType", "NOTIFICATION_TEMPLATES"]


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
    NotificationEventType.REVIEW_CYCLE_ACTIVATED: {
        "title": "Review Cycle Started",
        "body_template": "The {cycle_name} review cycle is now active. Open it to start your self-review.",
        "email_subject": "Review Cycle Started: {cycle_name}",
    },
    NotificationEventType.REVIEW_CYCLE_PHASE_CHANGED: {
        "title": "Review Cycle Update",
        "body_template": "The {cycle_name} review cycle has moved to {new_phase} phase",
        "email_subject": "Review Cycle Phase Change: {cycle_name}",
    },
    NotificationEventType.REVIEW_DEADLINE_REMINDER: {
        "title": "Review deadline approaching",
        "body_template": "{phase_label} for {cycle_name} is due in {days_remaining} day(s) ({deadline})",
        "email_subject": "Reminder: {phase_label} due in {days_remaining} day(s)",
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
    # Naming the item matters more here than anywhere else: somebody with eight
    # things assigned needs to know *which* one is due, and "task deadline is
    # tomorrow" made them open the app to find out.
    NotificationEventType.DEADLINE_REMINDER_1_DAY: {
        "title": "Due tomorrow",
        "body_template": "Your {task_type} \"{title}\" is due tomorrow ({deadline})",
        "email_subject": "Due tomorrow: {title}",
    },
    NotificationEventType.DEADLINE_REMINDER_DAY_OF: {
        "title": "Due today",
        "body_template": "Your {task_type} \"{title}\" is due today ({deadline})",
        "email_subject": "Due today: {title}",
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
    # `assessment_invitation` (the candidate-facing "you have been invited to take
    # this assessment" note) is deliberately absent. It was declared here and
    # nowhere else, and it could not have worked: notification preferences hang off
    # a Developer row, and the recipient of that message is a candidate. Candidate
    # invitations go out through the assessment service's own mail path.
    NotificationEventType.MENTION: {
        "title": "You were mentioned",
        "body_template": "{mentioner_name} mentioned you in a {entity_type}: {snippet}",
        "email_subject": "{mentioner_name} mentioned you",
    },
    # Task assignment and lifecycle. `item_label` is the kind of thing as the user
    # would name it ("task", "bug", "story", "card") so one template covers the
    # board, the backlog and the project view without reading as though everything
    # is a "task".
    NotificationEventType.CANDIDATE_STAGE_CHANGED: {
        "title": "Candidate stage changed",
        "body_template": "{actor_name} moved {candidate_name} from {old_stage} to {new_stage}",
        "email_subject": "{candidate_name} is now at {new_stage}",
    },
    NotificationEventType.DOCUMENT_MENTIONED: {
        "title": "Mentioned in a document",
        "body_template": "{actor_name} mentioned you in \"{document_title}\": {snippet}",
        "email_subject": "{actor_name} mentioned you in {document_title}",
    },
    NotificationEventType.DOCUMENT_COMMENTED: {
        "title": "New comment",
        "body_template": "{actor_name} commented on \"{document_title}\": {snippet}",
        "email_subject": "New comment on {document_title}",
    },
    NotificationEventType.DOCUMENT_AI_PROPOSAL: {
        "title": "AI proposed a doc update",
        "body_template": "{actor_label} proposed an update to \"{document_title}\" — review pending",
        "email_subject": "Review pending: proposed update to {document_title}",
    },
    NotificationEventType.CHAT_MENTION: {
        "title": "Mentioned in chat",
        "body_template": "{mentioner_name} mentioned you: {snippet}",
        "email_subject": "{mentioner_name} mentioned you in chat",
    },
    NotificationEventType.AI_CONVERSATION_SHARED: {
        "title": "Conversation shared with you",
        "body_template": "{actor_name} shared an AI conversation with you: {conversation_title}",
        "email_subject": "{actor_name} shared a conversation with you",
    },
    NotificationEventType.TASK_ASSIGNED: {
        "title": "Assigned to you",
        "body_template": "{actor_name} assigned you the {item_label} \"{task_title}\"",
        "email_subject": "Assigned to you: {task_title}",
    },
    NotificationEventType.TASK_UNASSIGNED: {
        "title": "Removed from a task",
        "body_template": "{actor_name} took you off the {item_label} \"{task_title}\"",
        "email_subject": "You were removed from: {task_title}",
    },
    NotificationEventType.TASK_STATUS_CHANGED: {
        "title": "Status changed",
        "body_template": "{actor_name} moved \"{task_title}\" from {old_status} to {new_status}",
        "email_subject": "{task_title} is now {new_status}",
    },
    NotificationEventType.TASK_COMMENTED: {
        "title": "New comment",
        "body_template": "{actor_name} commented on \"{task_title}\": {snippet}",
        "email_subject": "New comment on {task_title}",
    },
    NotificationEventType.TICKET_ASSIGNED: {
        "title": "Ticket assigned to you",
        "body_template": "{actor_name} assigned you ticket {ticket_reference}: {ticket_title}",
        "email_subject": "Ticket assigned to you: {ticket_title}",
    },
    NotificationEventType.DESK_TICKET_ASSIGNED: {
        "title": "Service desk ticket assigned to you",
        "body_template": "{actor_name} made you the owner of {ticket_reference}: {ticket_title}",
        "email_subject": "You now own {ticket_reference}: {ticket_title}",
    },
    NotificationEventType.DESK_TICKET_PENDING_WITH_CHANGED: {
        "title": "Ticket is with your queue",
        "body_template": "{ticket_reference} ({ticket_title}) is now pending with {pending_with}",
        "email_subject": "Pending with you: {ticket_reference} {ticket_title}",
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
    NotificationEventType.AGENT_TOOL_BLOCKED: {
        "title": "Agent Tool Blocked",
        "body_template": "{agent_name} attempted to use '{tool_name}' but was blocked by policy",
        "email_subject": "Agent tool blocked: {tool_name}",
    },
    NotificationEventType.AGENT_APPROVAL_REQUIRED: {
        "title": "Agent Action Needs Approval",
        "body_template": "{agent_name} wants to use '{tool_name}' — approval required",
        "email_subject": "Approval needed: {agent_name} wants to use {tool_name}",
    },
    NotificationEventType.AGENT_CONFIG_CHANGED: {
        "title": "Agent Config Changed",
        "body_template": "{changed_by_name} {change_type}d the configuration for {agent_name}",
        "email_subject": "Agent config {change_type}d: {agent_name}",
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
    NotificationEventType.CAMPAIGN_SEND_BLOCKED: {
        "title": "Campaign Could Not Send",
        "body_template": "Campaign \"{campaign_name}\" was due to send but couldn't: {reason}",
        "email_subject": "Campaign Not Sent: {campaign_name}",
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
