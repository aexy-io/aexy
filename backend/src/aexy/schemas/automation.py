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
# Each module registers its supported trigger types
# =============================================================================

TRIGGER_REGISTRY: dict[str, list[str]] = {
    "crm": [
        "record.created",
        "record.updated",
        "record.deleted",
        "field.changed",
        "list_entry.added",
        "list_entry.removed",
        "status.changed",
        "stage.changed",
        "schedule.daily",
        "schedule.weekly",
        "date.approaching",
        "date.passed",
        "webhook.received",
        "form.submitted",
        "email.opened",
        "email.clicked",
        "email.replied",
    ],
    "tickets": [
        "ticket.created",
        "ticket.updated",
        "ticket.status_changed",
        "ticket.assigned",
        "ticket.priority_changed",
        "ticket.escalated",
        "sla.warning",
        "sla.breached",
        "response.received",
        "response.sent",
    ],
    "hiring": [
        "candidate.created",
        "candidate.updated",
        "candidate.stage_changed",
        "candidate.rejected",
        "candidate.hired",
        "assessment.completed",
        "assessment.score_above",
        "assessment.score_below",
        "requirement.created",
        "requirement.status_changed",
        "offer.sent",
        "offer.accepted",
        "offer.declined",
    ],
    "email_marketing": [
        "campaign.sent",
        "campaign.scheduled",
        "email.opened",
        "email.clicked",
        "email.bounced",
        "email.unsubscribed",
        "email.complained",
        "recipient.added",
        "recipient.removed",
    ],
    "uptime": [
        "monitor.created",
        "monitor.down",
        "monitor.up",
        "monitor.degraded",
        "incident.created",
        "incident.resolved",
        "incident.acknowledged",
    ],
    "sprints": [
        "task.created",
        "task.status_changed",
        "task.assigned",
        "task.completed",
        "sprint.started",
        "sprint.completed",
        "epic.completed",
        "blocker.created",
        "blocker.resolved",
    ],
    "forms": [
        "form.submitted",
        "form.started",
        "form.abandoned",
    ],
    "booking": [
        "booking.created",
        "booking.confirmed",
        "booking.cancelled",
        "booking.rescheduled",
        "booking.completed",
        "booking.no_show",
        "booking.reminder",
        "event_type.created",
    ],
    "tracking": [
        "standup.submitted",
        "standup.missed",
        "standup.streak",
        "time_entry.created",
        "time_entry.threshold",
        "time_entry.anomaly",
        "blocker.created",
        "blocker.escalated",
        "blocker.resolved",
        "blocker.stale",
        "blocker.pattern_detected",
        "work_log.submitted",
        "sentiment.negative",
        "participation.low",
    ],
    "compliance": [
        "training.created",
        "training.assigned",
        "training.started",
        "training.completed",
        "training.waived",
        "assignment.approaching_due",
        "assignment.overdue",
        "training.bulk_overdue",
        "certification.added",
        "certification.expiring",
        "certification.expired",
        "certification.renewed",
        "certification.revoked",
        "certification.prerequisite_unmet",
        "compliance.status_changed",
        "audit.logged",
    ],
}


# =============================================================================
# ACTION REGISTRY
# Common actions available across all modules, plus module-specific actions
# =============================================================================

ACTION_REGISTRY: dict[str, list[str]] = {
    "common": [
        "send_email",
        "send_slack",
        "send_sms",
        "webhook_call",
        "api_request",
        "run_agent",
        "create_task",
        "notify_user",
        "notify_team",
        "wait",
        "condition",
    ],
    "crm": [
        "create_record",
        "update_record",
        "delete_record",
        "link_records",
        "add_to_list",
        "remove_from_list",
        "enroll_in_sequence",
        "remove_from_sequence",
        "enrich_record",
        "classify_record",
        "generate_summary",
    ],
    "tickets": [
        "assign_ticket",
        "change_status",
        "change_priority",
        "add_response",
        "escalate",
        "add_tag",
        "remove_tag",
        "merge_tickets",
    ],
    "hiring": [
        "move_stage",
        "reject_candidate",
        "schedule_interview",
        "send_assessment",
        "create_offer",
        "add_note",
    ],
    "email_marketing": [
        "add_to_campaign",
        "remove_from_campaign",
        "update_recipient",
        "pause_campaign",
        "resume_campaign",
    ],
    "uptime": [
        "create_incident",
        "resolve_incident",
        "acknowledge_incident",
        "page_on_call",
    ],
    "sprints": [
        "create_task",
        "move_task",
        "assign_task",
        "add_to_sprint",
        "remove_from_sprint",
    ],
    "forms": [
        "create_crm_record",
        "create_ticket",
        "send_confirmation",
    ],
    "booking": [
        "confirm_booking",
        "cancel_booking",
        "reschedule_booking",
        "send_reminder",
    ],
    "tracking": [
        "update_activity_pattern",
        "send_standup_reminder",
        "celebrate_streak",
        "escalate_blocker",
        "flag_anomaly",
    ],
    "compliance": [
        "send_training_reminder",
        "update_compliance_status",
        "restrict_permissions",
        "send_compliance_digest",
    ],
}


def get_triggers_for_module(module: str) -> list[str]:
    """Get all supported trigger types for a module."""
    return TRIGGER_REGISTRY.get(module, [])


def get_actions_for_module(module: str) -> list[str]:
    """Get all supported action types for a module (common + module-specific)."""
    common = ACTION_REGISTRY.get("common", [])
    module_specific = ACTION_REGISTRY.get(module, [])
    return common + module_specific


def get_all_triggers() -> dict[str, list[str]]:
    """Get all triggers organized by module."""
    return TRIGGER_REGISTRY.copy()


def get_all_actions() -> dict[str, list[str]]:
    """Get all actions organized by module."""
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


class TriggerRegistryResponse(BaseModel):
    """Response schema for trigger registry."""
    triggers: dict[str, list[str]]


class ActionRegistryResponse(BaseModel):
    """Response schema for action registry."""
    actions: dict[str, list[str]]


class ModuleTriggersResponse(BaseModel):
    """Response schema for module-specific triggers."""
    module: str
    triggers: list[str]


class ModuleActionsResponse(BaseModel):
    """Response schema for module-specific actions."""
    module: str
    actions: list[str]
