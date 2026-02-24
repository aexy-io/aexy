"""Platform-wide Automation schemas.

This module provides generic automation schemas that extend CRM automation
schemas to support multiple modules (Tickets, Hiring, Email Marketing, etc.).
"""

from datetime import datetime
from typing import Literal, Any
from pydantic import BaseModel, ConfigDict, Field

from aexy.schemas.crm import (
    AutomationCondition,
    AutomationAction,
    FilterOperator,
)


# =============================================================================
# MODULE TYPES
# =============================================================================

AutomationModule = Literal[
    "crm",           # CRM records, stages, activities
    "tickets",       # Support tickets, SLAs
    "hiring",        # Candidates, requirements
    "email_marketing",  # Campaigns, recipients
    "uptime",        # Monitors, incidents
    "sprints",       # Tasks, sprints
    "forms",         # Form submissions
    "booking",       # Bookings, events
    "tracking",      # Standups, blockers, time entries
    "compliance",    # Training, certifications, audits
]


# =============================================================================
# TRIGGER REGISTRY
# Each module registers its supported trigger types with descriptions
# =============================================================================

TRIGGER_REGISTRY: dict[str, list[dict[str, str]]] = {
    "crm": [
        {"id": "record.created", "description": "When a new CRM record is created"},
        {"id": "record.updated", "description": "When a CRM record is updated"},
        {"id": "record.deleted", "description": "When a CRM record is deleted"},
        {"id": "field.changed", "description": "When a specific field value changes on a record"},
        {"id": "list_entry.added", "description": "When a record is added to a list"},
        {"id": "list_entry.removed", "description": "When a record is removed from a list"},
        {"id": "status.changed", "description": "When a record status changes"},
        {"id": "stage.changed", "description": "When a record moves to a different pipeline stage"},
        {"id": "schedule.daily", "description": "When the daily schedule fires"},
        {"id": "schedule.weekly", "description": "When the weekly schedule fires"},
        {"id": "date.approaching", "description": "When a date field is approaching its target"},
        {"id": "date.passed", "description": "When a date field has passed its target"},
        {"id": "webhook.received", "description": "When an inbound webhook payload is received"},
        {"id": "form.submitted", "description": "When a linked form submission is received"},
        {"id": "email.opened", "description": "When a tracked email is opened by a contact"},
        {"id": "email.clicked", "description": "When a link in a tracked email is clicked"},
        {"id": "email.replied", "description": "When a contact replies to a tracked email"},
    ],
    "tickets": [
        {"id": "ticket.created", "description": "When a new support ticket is created"},
        {"id": "ticket.updated", "description": "When a support ticket is updated"},
        {"id": "ticket.status_changed", "description": "When a ticket status changes"},
        {"id": "ticket.assigned", "description": "When a ticket is assigned to an agent"},
        {"id": "ticket.priority_changed", "description": "When a ticket priority level changes"},
        {"id": "ticket.escalated", "description": "When a ticket is escalated to a higher tier"},
        {"id": "sla.warning", "description": "When an SLA deadline is approaching"},
        {"id": "sla.breached", "description": "When an SLA deadline has been breached"},
        {"id": "response.received", "description": "When a customer response is received on a ticket"},
        {"id": "response.sent", "description": "When an agent response is sent on a ticket"},
    ],
    "hiring": [
        {"id": "candidate.created", "description": "When a new candidate is added to the pipeline"},
        {"id": "candidate.updated", "description": "When candidate information is updated"},
        {"id": "candidate.stage_changed", "description": "When a candidate moves to a new hiring stage"},
        {"id": "candidate.rejected", "description": "When a candidate is rejected"},
        {"id": "candidate.hired", "description": "When a candidate is marked as hired"},
        {"id": "assessment.completed", "description": "When a candidate completes an assessment"},
        {"id": "assessment.score_above", "description": "When an assessment score exceeds a threshold"},
        {"id": "assessment.score_below", "description": "When an assessment score falls below a threshold"},
        {"id": "requirement.created", "description": "When a new hiring requirement is created"},
        {"id": "requirement.status_changed", "description": "When a hiring requirement status changes"},
        {"id": "offer.sent", "description": "When a job offer is sent to a candidate"},
        {"id": "offer.accepted", "description": "When a candidate accepts a job offer"},
        {"id": "offer.declined", "description": "When a candidate declines a job offer"},
    ],
    "email_marketing": [
        {"id": "campaign.sent", "description": "When an email campaign is sent to recipients"},
        {"id": "campaign.scheduled", "description": "When an email campaign is scheduled for delivery"},
        {"id": "email.opened", "description": "When a campaign email is opened by a recipient"},
        {"id": "email.clicked", "description": "When a link in a campaign email is clicked"},
        {"id": "email.bounced", "description": "When a campaign email bounces"},
        {"id": "email.unsubscribed", "description": "When a recipient unsubscribes from emails"},
        {"id": "email.complained", "description": "When a recipient marks an email as spam"},
        {"id": "recipient.added", "description": "When a recipient is added to a campaign"},
        {"id": "recipient.removed", "description": "When a recipient is removed from a campaign"},
    ],
    "uptime": [
        {"id": "monitor.created", "description": "When a new uptime monitor is created"},
        {"id": "monitor.down", "description": "When a monitored service goes down"},
        {"id": "monitor.up", "description": "When a monitored service comes back up"},
        {"id": "monitor.degraded", "description": "When a monitored service shows degraded performance"},
        {"id": "incident.created", "description": "When a new incident is created"},
        {"id": "incident.resolved", "description": "When an incident is marked as resolved"},
        {"id": "incident.acknowledged", "description": "When an incident is acknowledged by responder"},
    ],
    "sprints": [
        {"id": "task.created", "description": "When a new task is created in a sprint"},
        {"id": "task.status_changed", "description": "When a task status changes"},
        {"id": "task.assigned", "description": "When a task is assigned to a team member"},
        {"id": "task.completed", "description": "When a task is marked as completed"},
        {"id": "sprint.started", "description": "When a sprint is started"},
        {"id": "sprint.completed", "description": "When a sprint is completed"},
        {"id": "epic.completed", "description": "When all tasks in an epic are completed"},
        {"id": "blocker.created", "description": "When a new blocker is reported on a task"},
        {"id": "blocker.resolved", "description": "When a task blocker is resolved"},
    ],
    "forms": [
        {"id": "form.submitted", "description": "When a form submission is received"},
        {"id": "form.started", "description": "When a user begins filling out a form"},
        {"id": "form.abandoned", "description": "When a user abandons a partially filled form"},
    ],
    "booking": [
        {"id": "booking.created", "description": "When a new booking is created"},
        {"id": "booking.confirmed", "description": "When a booking is confirmed"},
        {"id": "booking.cancelled", "description": "When a booking is cancelled"},
        {"id": "booking.rescheduled", "description": "When a booking is rescheduled"},
        {"id": "booking.completed", "description": "When a booking session is completed"},
        {"id": "booking.no_show", "description": "When an attendee does not show up for a booking"},
        {"id": "booking.reminder", "description": "When a booking reminder time is reached"},
        {"id": "event_type.created", "description": "When a new bookable event type is created"},
    ],
    "tracking": [
        {"id": "standup.submitted", "description": "When a team member submits a standup update"},
        {"id": "standup.missed", "description": "When a team member misses a standup deadline"},
        {"id": "standup.streak", "description": "When a standup submission streak milestone is reached"},
        {"id": "time_entry.created", "description": "When a new time entry is logged"},
        {"id": "time_entry.threshold", "description": "When logged hours exceed a configured threshold"},
        {"id": "time_entry.anomaly", "description": "When an unusual time entry pattern is detected"},
        {"id": "blocker.created", "description": "When a new blocker is reported in tracking"},
        {"id": "blocker.escalated", "description": "When a blocker is escalated to management"},
        {"id": "blocker.resolved", "description": "When a tracked blocker is resolved"},
        {"id": "blocker.stale", "description": "When a blocker remains unresolved past its threshold"},
        {"id": "blocker.pattern_detected", "description": "When a recurring blocker pattern is detected"},
        {"id": "work_log.submitted", "description": "When a work log entry is submitted"},
        {"id": "sentiment.negative", "description": "When negative sentiment is detected in updates"},
        {"id": "participation.low", "description": "When team participation drops below threshold"},
    ],
    "compliance": [
        {"id": "training.created", "description": "When a new training program is created"},
        {"id": "training.assigned", "description": "When training is assigned to team members"},
        {"id": "training.started", "description": "When a team member starts assigned training"},
        {"id": "training.completed", "description": "When a team member completes assigned training"},
        {"id": "training.waived", "description": "When a training requirement is waived"},
        {"id": "assignment.approaching_due", "description": "When a training assignment due date is approaching"},
        {"id": "assignment.overdue", "description": "When a training assignment becomes overdue"},
        {"id": "training.bulk_overdue", "description": "When multiple training assignments become overdue"},
        {"id": "certification.added", "description": "When a new certification is added to a profile"},
        {"id": "certification.expiring", "description": "When a certification is approaching expiration"},
        {"id": "certification.expired", "description": "When a certification has expired"},
        {"id": "certification.renewed", "description": "When an expired certification is renewed"},
        {"id": "certification.revoked", "description": "When a certification is revoked"},
        {"id": "certification.prerequisite_unmet", "description": "When a certification prerequisite is not met"},
        {"id": "compliance.status_changed", "description": "When overall compliance status changes for a member"},
        {"id": "audit.logged", "description": "When a compliance audit event is logged"},
    ],
}


# =============================================================================
# ACTION REGISTRY
# Common actions available across all modules, plus module-specific actions
# =============================================================================

ACTION_REGISTRY: dict[str, list[dict[str, str]]] = {
    "common": [
        {"id": "send_email", "description": "Send an email notification"},
        {"id": "send_slack", "description": "Send a Slack message to a channel or user"},
        {"id": "send_sms", "description": "Send an SMS text message"},
        {"id": "webhook_call", "description": "Call an external webhook URL"},
        {"id": "api_request", "description": "Make a custom HTTP API request"},
        {"id": "run_agent", "description": "Run an AI agent with the trigger context"},
        {"id": "create_task", "description": "Create a follow-up task"},
        {"id": "notify_user", "description": "Send an in-app notification to a user"},
        {"id": "notify_team", "description": "Send an in-app notification to a team"},
        {"id": "wait", "description": "Wait for a specified duration before continuing"},
        {"id": "condition", "description": "Evaluate a condition to branch the workflow"},
    ],
    "crm": [
        {"id": "create_record", "description": "Create a new CRM record"},
        {"id": "update_record", "description": "Update fields on an existing CRM record"},
        {"id": "delete_record", "description": "Delete a CRM record"},
        {"id": "link_records", "description": "Link two CRM records together"},
        {"id": "add_to_list", "description": "Add a record to a CRM list"},
        {"id": "remove_from_list", "description": "Remove a record from a CRM list"},
        {"id": "enroll_in_sequence", "description": "Enroll a contact in an email sequence"},
        {"id": "remove_from_sequence", "description": "Remove a contact from an email sequence"},
        {"id": "enrich_record", "description": "Enrich a record with external data"},
        {"id": "classify_record", "description": "Classify a record using AI categorization"},
        {"id": "generate_summary", "description": "Generate an AI summary for a record"},
    ],
    "tickets": [
        {"id": "assign_ticket", "description": "Assign a ticket to an agent or team"},
        {"id": "change_status", "description": "Change the status of a ticket"},
        {"id": "change_priority", "description": "Change the priority level of a ticket"},
        {"id": "add_response", "description": "Add an automated response to a ticket"},
        {"id": "escalate", "description": "Escalate a ticket to a higher support tier"},
        {"id": "add_tag", "description": "Add a tag to a ticket"},
        {"id": "remove_tag", "description": "Remove a tag from a ticket"},
        {"id": "merge_tickets", "description": "Merge duplicate tickets together"},
    ],
    "hiring": [
        {"id": "move_stage", "description": "Move a candidate to a different hiring stage"},
        {"id": "reject_candidate", "description": "Reject a candidate from the pipeline"},
        {"id": "schedule_interview", "description": "Schedule an interview with a candidate"},
        {"id": "send_assessment", "description": "Send an assessment to a candidate"},
        {"id": "create_offer", "description": "Create a job offer for a candidate"},
        {"id": "add_note", "description": "Add an internal note to a candidate profile"},
    ],
    "email_marketing": [
        {"id": "add_to_campaign", "description": "Add a recipient to an email campaign"},
        {"id": "remove_from_campaign", "description": "Remove a recipient from an email campaign"},
        {"id": "update_recipient", "description": "Update recipient attributes or segments"},
        {"id": "pause_campaign", "description": "Pause an active email campaign"},
        {"id": "resume_campaign", "description": "Resume a paused email campaign"},
    ],
    "uptime": [
        {"id": "create_incident", "description": "Create a new incident from a monitor alert"},
        {"id": "resolve_incident", "description": "Resolve an existing incident"},
        {"id": "acknowledge_incident", "description": "Acknowledge an open incident"},
        {"id": "page_on_call", "description": "Page the on-call responder"},
    ],
    "sprints": [
        {"id": "create_task", "description": "Create a new task in a sprint"},
        {"id": "move_task", "description": "Move a task to a different status column"},
        {"id": "assign_task", "description": "Assign a task to a team member"},
        {"id": "add_to_sprint", "description": "Add a task to a sprint"},
        {"id": "remove_from_sprint", "description": "Remove a task from a sprint"},
    ],
    "forms": [
        {"id": "create_crm_record", "description": "Create a CRM record from form data"},
        {"id": "create_ticket", "description": "Create a support ticket from form data"},
        {"id": "send_confirmation", "description": "Send a confirmation email to the submitter"},
    ],
    "booking": [
        {"id": "confirm_booking", "description": "Confirm a pending booking"},
        {"id": "cancel_booking", "description": "Cancel an existing booking"},
        {"id": "reschedule_booking", "description": "Reschedule a booking to a new time"},
        {"id": "send_reminder", "description": "Send a reminder for an upcoming booking"},
    ],
    "tracking": [
        {"id": "update_activity_pattern", "description": "Update the tracked activity pattern for a member"},
        {"id": "send_standup_reminder", "description": "Send a reminder to submit standup updates"},
        {"id": "celebrate_streak", "description": "Celebrate a standup streak milestone"},
        {"id": "escalate_blocker", "description": "Escalate a stale blocker to management"},
        {"id": "flag_anomaly", "description": "Flag an anomalous time entry for review"},
    ],
    "compliance": [
        {"id": "send_training_reminder", "description": "Send a reminder for pending training assignments"},
        {"id": "update_compliance_status", "description": "Update compliance status for a team member"},
        {"id": "restrict_permissions", "description": "Restrict permissions due to non-compliance"},
        {"id": "send_compliance_digest", "description": "Send a compliance status digest to managers"},
    ],
}


# =============================================================================
# BACKWARD-COMPATIBLE HELPER FUNCTIONS
# These extract just the string IDs for code that does membership checks
# =============================================================================

def get_trigger_ids(module: str) -> list[str]:
    """Get trigger IDs (strings only) for a module. For backward-compatible membership checks."""
    entries = TRIGGER_REGISTRY.get(module, [])
    return [entry["id"] for entry in entries]


def get_action_ids(module: str) -> list[str]:
    """Get action IDs (strings only) for a module (common + module-specific). For backward-compatible membership checks."""
    common = ACTION_REGISTRY.get("common", [])
    module_specific = ACTION_REGISTRY.get(module, [])
    return [entry["id"] for entry in common] + [entry["id"] for entry in module_specific]


def get_all_trigger_ids() -> dict[str, list[str]]:
    """Get all trigger IDs organized by module (strings only)."""
    return {module: [entry["id"] for entry in entries] for module, entries in TRIGGER_REGISTRY.items()}


def get_all_action_ids() -> dict[str, list[str]]:
    """Get all action IDs organized by module (strings only)."""
    return {module: [entry["id"] for entry in entries] for module, entries in ACTION_REGISTRY.items()}


# =============================================================================
# RICH REGISTRY ACCESSOR FUNCTIONS (return id + description)
# =============================================================================

def get_triggers_for_module(module: str) -> list[dict[str, str]]:
    """Get all supported trigger types with descriptions for a module."""
    return TRIGGER_REGISTRY.get(module, [])


def get_actions_for_module(module: str) -> list[dict[str, str]]:
    """Get all supported action types with descriptions for a module (common + module-specific)."""
    common = ACTION_REGISTRY.get("common", [])
    module_specific = ACTION_REGISTRY.get(module, [])
    return common + module_specific


def get_all_triggers() -> dict[str, list[dict[str, str]]]:
    """Get all triggers organized by module with descriptions."""
    return TRIGGER_REGISTRY.copy()


def get_all_actions() -> dict[str, list[dict[str, str]]]:
    """Get all actions organized by module with descriptions."""
    return ACTION_REGISTRY.copy()


# =============================================================================
# GENERIC AUTOMATION SCHEMAS
# =============================================================================

class AutomationCreate(BaseModel):
    """Schema for creating an automation (platform-wide)."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    module: AutomationModule = "crm"
    module_config: dict = Field(default_factory=dict)
    object_id: str | None = None  # CRM object ID, or module-specific entity ID
    trigger_type: str  # Module-specific trigger type
    trigger_config: dict = Field(default_factory=dict)
    conditions: list[AutomationCondition] | None = None
    actions: list[AutomationAction] = Field(default_factory=list)
    error_handling: Literal["stop", "continue", "retry"] = "stop"
    run_limit_per_month: int | None = None
    is_active: bool = True


class AutomationUpdate(BaseModel):
    """Schema for updating an automation (platform-wide)."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    module_config: dict | None = None
    trigger_config: dict | None = None
    conditions: list[AutomationCondition] | None = None
    actions: list[AutomationAction] | None = None
    error_handling: Literal["stop", "continue", "retry"] | None = None
    run_limit_per_month: int | None = None
    is_active: bool | None = None


class AutomationResponse(BaseModel):
    """Schema for automation response (platform-wide)."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None = None
    module: str
    module_config: dict = Field(default_factory=dict)
    object_id: str | None = None
    trigger_type: str
    trigger_config: dict
    conditions: list[dict]
    actions: list[dict]
    error_handling: str
    is_active: bool
    run_limit_per_month: int | None = None
    runs_this_month: int
    total_runs: int
    successful_runs: int
    failed_runs: int
    last_run_at: datetime | None = None
    created_by_id: str | None = None
    created_at: datetime
    updated_at: datetime


class AutomationRunResponse(BaseModel):
    """Schema for automation run response (platform-wide)."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    automation_id: str
    module: str
    record_id: str | None = None
    trigger_data: dict
    status: str
    steps_executed: list[dict]
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_ms: int | None = None
    created_at: datetime


class AutomationListParams(BaseModel):
    """Parameters for listing automations."""
    module: AutomationModule | None = None
    object_id: str | None = None
    is_active: bool | None = None
    skip: int = Field(default=0, ge=0)
    limit: int = Field(default=50, ge=1, le=100)


class RegistryEntry(BaseModel):
    """A single trigger or action entry with ID and description."""
    id: str
    description: str


class TriggerRegistryResponse(BaseModel):
    """Response schema for trigger registry."""
    triggers: dict[str, list[RegistryEntry]]


class ActionRegistryResponse(BaseModel):
    """Response schema for action registry."""
    actions: dict[str, list[RegistryEntry]]


class ModuleTriggersResponse(BaseModel):
    """Response schema for module-specific triggers."""
    module: str
    triggers: list[RegistryEntry]


class ModuleActionsResponse(BaseModel):
    """Response schema for module-specific actions."""
    module: str
    actions: list[RegistryEntry]
