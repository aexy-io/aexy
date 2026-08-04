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
        # status.changed omitted on purpose: nothing emits it, and pipeline
        # status moves already surface as stage.changed. Re-add with an emitter.
        {"id": "stage.changed", "description": "When a record moves to a different pipeline stage"},
        {"id": "schedule.daily", "description": "When the daily schedule fires"},
        {"id": "schedule.weekly", "description": "When the weekly schedule fires"},
        {"id": "date.approaching", "description": "When a date field is approaching its target"},
        {"id": "date.passed", "description": "When a date field has passed its target"},
        {"id": "webhook.received", "description": "When an inbound webhook payload is received"},
        {"id": "form.submitted", "description": "When a linked form submission is received"},
        {"id": "email.opened", "description": "When a tracked email is opened by a contact"},
        {"id": "email.clicked", "description": "When a link in a tracked email is clicked"},
        # email.replied omitted on purpose: the dispatcher exists but no inbound
        # mail path calls it, so offering it would build automations that never run.
    ],
    "tickets": [
        {"id": "ticket.created", "description": "When a new support ticket is created"},
        {"id": "ticket.updated", "description": "When a support ticket is updated"},
        {"id": "ticket.status_changed", "description": "When a ticket status changes"},
        {"id": "ticket.assigned", "description": "When a ticket is assigned to an agent"},
        {"id": "ticket.priority_changed", "description": "When a ticket priority level changes"},
        {"id": "ticket.escalated", "description": "When a ticket is escalated to a higher tier"},
        {"id": "ticket.reopened", "description": "When a resolved or closed ticket is reopened"},
        {"id": "alert.ticket_created", "description": "When an observability alert (e.g. OpenObserve) opens a new ticket"},
        {"id": "alert.ticket_updated", "description": "When a recurring observability alert updates an existing ticket"},
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
        {"id": "monitor.ssl_expiring", "description": "When an SSL certificate is approaching expiration"},
        {"id": "monitor.repeated_failures", "description": "When a monitor has multiple consecutive failures"},
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
        {"id": "sprint.velocity_calculated", "description": "When sprint velocity is calculated after completion"},
        {"id": "sprint.burndown_off_track", "description": "When the burndown chart deviates significantly from ideal"},
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
        {"id": "branch", "description": "Route the workflow through the first matching path"},
    ],
    "crm": [
        {"id": "create_record", "description": "Create a new CRM record"},
        {"id": "update_record", "description": "Update fields on an existing CRM record"},
        {"id": "delete_record", "description": "Delete a CRM record"},
        {"id": "link_records", "description": "Link two CRM records together"},
        {"id": "assign_owner", "description": "Assign a CRM record to a workspace member"},
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
        # The one compliance status change the module actually models.
        {"id": "waive_training", "description": "Waive a training assignment, with a recorded reason"},
    ],
}


# =============================================================================
# BACKWARD-COMPATIBLE HELPER FUNCTIONS
# These extract just the string IDs for code that does membership checks
# =============================================================================

# =============================================================================
# MODULE SCOPE
# Automations were CRM-only from 2026-07-15 because no other module dispatched
# trigger events — the condition the descope note set for re-activation was
# "add it to ENABLED_MODULES and wire its trigger dispatch". Every module in
# TRIGGER_REGISTRY now dispatches: crm through CRMEventService.process_trigger,
# the other nine through dispatch_automation_event() (tickets in ticket_service
# + alert_ingestion_service, hiring in hiring/api + hiring_intelligence +
# assessment_take, email_marketing in campaign_service + email_tracking, uptime
# in uptime_service, sprints in sprint_service/sprint_task_service/epic_service/
# sprint_analytics_service, forms in form_submission_handler, booking in
# booking_service + activities/booking, tracking in tracking_events, compliance
# in compliance_service + activities/compliance_automation), so all ten are
# offered again.
#
# Enabling a module does NOT mean every entry in its registry is live. Triggers
# nothing emits, and actions with no executor on both run paths, stay withheld
# per module below — the palette must never offer a step that cannot run.
# =============================================================================

ENABLED_MODULES: tuple[str, ...] = (
    "crm",
    "tickets",
    "hiring",
    "email_marketing",
    "uptime",
    "sprints",
    "forms",
    "booking",
    "tracking",
    "compliance",
)

UNAVAILABLE_TRIGGER_REASONS: dict[str, str] = {
    # schedule.daily/weekly, date.approaching/passed un-hidden 2026-07-23:
    # the hourly dispatch_crm_schedules runner now fires them.
    # webhook.received: no inbound endpoint dispatches it yet.
    "webhook.received": "No inbound endpoint dispatches this trigger.",
    # email.replied: no reply-detection source event exists yet (deferred).
    "email.replied": "No inbound reply-detection event source exists.",
    # status.changed retired for CRM 2026-07-23: a record's status IS its
    # pipeline stage, already covered by stage.changed; other categorical
    # fields are covered by field.changed. No distinct CRM use case.
    "status.changed": "CRM status changes are represented by stage.changed.",
    # list_entry.added un-hidden 2026-07-20; list_entry.removed, form.submitted,
    # email.opened, email.clicked un-hidden 2026-07-23 now that CRMEventService
    # emits CRM-scoped events for each (routed through process_trigger, which
    # ignores the module column).
}

UNAVAILABLE_ACTION_REASONS: dict[str, str] = {
    # api_request un-hidden 2026-07-29. It was withheld because no executor
    # was connected, which was accurate: the panel wrote api_url/api_method/
    # api_body and the handler read webhook_url/http_method/body_template, so
    # the step failed on "No webhook URL specified" whatever you configured,
    # and its auth fields were read by nothing at all. Both executors now read
    # those keys and apply the auth config, so the reason no longer holds. It
    # shares _webhook_call with webhook_call, and so the same SSRF guard,
    # idempotency key and response scrubbing.
    "enrich_record": "No published executor is connected.",
    "classify_record": "No published executor is connected.",
    "generate_summary": "No published executor is connected.",
    "add_to_list": "List actions remain outside the approved release scope.",
    "remove_from_list": "List actions remain outside the approved release scope.",
}

# Compatibility names for older imports. An entry is available precisely when
# it is absent from these sets; every unavailable entry carries an internal
# reason above, so hiding a capability is an explicit product/runtime decision.
HIDDEN_TRIGGERS: frozenset[str] = frozenset(UNAVAILABLE_TRIGGER_REASONS)
HIDDEN_ACTIONS: frozenset[str] = frozenset(UNAVAILABLE_ACTION_REASONS)

# Per-module withholding. The flat maps above hide an id everywhere, which
# cannot express a capability that is live in one module and dead in another:
# tracking emits blocker.created/blocker.resolved, sprints declares the same two
# ids and emits neither. Ids listed here are hidden only for the named module.
UNAVAILABLE_TRIGGER_REASONS_BY_MODULE: dict[str, dict[str, str]] = {
    "tickets": {
        # sla.breached dispatches from the breach clock; the warning threshold
        # ahead of it has no emitter.
        "sla.warning": "Nothing emits an SLA warning ahead of sla.breached.",
    },
    "hiring": {
        # The offer lifecycle is stage text on the candidate ("offer_accepted"
        # is compared as a stage in api/hiring.py), not a dispatched event.
        "offer.sent": "Offer state is candidate stage text; no event is dispatched.",
        "offer.accepted": "Offer state is candidate stage text; no event is dispatched.",
        "offer.declined": "Offer state is candidate stage text; no event is dispatched.",
    },
    "email_marketing": {
        # email.opened/clicked/unsubscribed dispatch from email_tracking; these
        # three have no provider-webhook path into automations. email.bounced
        # exists as a CRM activity type and a workflow-trigger catalog entry,
        # neither of which reaches process_module_trigger.
        "email.bounced": "No provider bounce webhook dispatches an automation event.",
        "email.complained": "No provider complaint webhook dispatches an automation event.",
        "recipient.removed": "Only recipient.added is dispatched by campaign_service.",
    },
    "sprints": {
        # Both ids belong to tracking, which does emit them under module
        # "tracking". Nothing emits them under "sprints".
        "blocker.created": "Blocker events are dispatched under the tracking module.",
        "blocker.resolved": "Blocker events are dispatched under the tracking module.",
    },
    "forms": {
        # form_submission_handler dispatches form.submitted only; partial-fill
        # telemetry is not collected.
        "form.started": "Partial form fills are not tracked, so nothing emits this.",
        "form.abandoned": "Partial form fills are not tracked, so nothing emits this.",
    },
    "booking": {
        "event_type.created": "Event-type CRUD does not dispatch automation events.",
    },
}

# Same idea for actions. An action is offered only when BOTH run paths can
# execute it — the canvas/Temporal path (WorkflowActionHandler) and the inline
# path (CRMAutomationService). Several ids below are implemented on the canvas
# path only; offering them would fail any automation that runs inline, so they
# stay hidden until they are added to CRMAutomationService.INLINE_ACTION_TYPES.
UNAVAILABLE_ACTION_REASONS_BY_MODULE: dict[str, dict[str, str]] = {
    "uptime": {
        # An on-call rota does not exist as a concept anywhere in the product —
        # there is no schedule, no escalation ladder and no paging integration to
        # route to, so this cannot be more than a notification with a misleading
        # name. Offer notify_user/send_slack until one exists.
        "page_on_call": "No on-call rota or paging integration exists to route to.",
    },
    "tracking": {
        # "Activity pattern" is not a stored thing: the tracking module records
        # standups, work logs, time entries and blockers, and derives patterns at
        # read time. There is nothing to update.
        "update_activity_pattern": "No stored activity pattern exists to update.",
        # Both are notifications whose audience is the standup participants; the
        # module has no participant roster to resolve, so notify_user/notify_team
        # with an explicit target is the honest way to send these today.
        "send_standup_reminder": "No standup roster to resolve recipients from; use notify_user/notify_team.",
        "celebrate_streak": "No standup roster to resolve recipients from; use notify_user/notify_team.",
    },
    "forms": {
        # A confirmation is an email to the submitter. send_email already owns
        # delivery, and the submission's email is in the trigger payload
        # ({{trigger.data.email}}), so a dedicated action would only duplicate it.
        "send_confirmation": "Compose from the form trigger plus send_email.",
    },
    "compliance": {
        # Compliance status is per training assignment, not per member: there is
        # no member-level status column to write. waive_training changes the
        # status that does exist.
        "update_compliance_status": "Compliance status is per assignment; use waive_training.",
        # Revoking app access from an automation would need an explicit,
        # auditable restriction model (what is restricted, by whom, until when,
        # and how it is restored). Writing app-access grants without that is how
        # people get locked out with no trail.
        "restrict_permissions": "Needs an auditable, reversible access-restriction model first.",
        # Both are deliveries, not state changes. They read overdue assignments
        # and then send, which send_email / notify_user already do properly
        # (outbox, retries, per-recipient step accounting).
        "send_training_reminder": "Compose from a compliance trigger plus send_email/notify_user.",
        "send_compliance_digest": "Compose from a compliance trigger plus send_email.",
    },
}

# Structural palette capabilities share the registry transport with actions,
# but the frontend creates their real canvas node type instead of an action
# node. This keeps the server as the sole visibility source without duplicating
# a second frontend-only list.
STRUCTURAL_CAPABILITIES: dict[str, str] = {
    "condition": "condition",
    "wait": "wait",
    "run_agent": "agent",
    "branch": "branch",
}

# Actions that are only offered when the workspace has the integration they
# depend on. Unlike HIDDEN_ACTIONS this cannot be decided from the registry
# alone, so the API layer applies it per workspace.
INTEGRATION_GATED_ACTIONS: dict[str, str] = {
    "send_slack": "slack",
}


def hidden_triggers_for_module(module: str) -> frozenset[str]:
    """Trigger ids withheld for this module: hidden everywhere, or just here."""
    return HIDDEN_TRIGGERS | frozenset(
        UNAVAILABLE_TRIGGER_REASONS_BY_MODULE.get(module, {})
    )


def hidden_actions_for_module(module: str) -> frozenset[str]:
    """Action ids withheld for this module: hidden everywhere, or just here."""
    return HIDDEN_ACTIONS | frozenset(
        UNAVAILABLE_ACTION_REASONS_BY_MODULE.get(module, {})
    )


def _visible_triggers(module: str, entries: list[dict[str, str]]) -> list[dict[str, str]]:
    hidden = hidden_triggers_for_module(module)
    return [e for e in entries if e["id"] not in hidden]


def _visible_actions(module: str, entries: list[dict[str, str]]) -> list[dict[str, str]]:
    hidden = hidden_actions_for_module(module)
    return [e for e in entries if e["id"] not in hidden]


def get_enabled_modules() -> list[str]:
    """Modules the builder may offer, in registry order."""
    return list(ENABLED_MODULES)


def get_trigger_ids(module: str) -> list[str]:
    """Get visible trigger IDs for an enabled module (empty for descoped modules)."""
    if module not in ENABLED_MODULES:
        return []
    return [
        entry["id"] for entry in _visible_triggers(module, TRIGGER_REGISTRY.get(module, []))
    ]


def get_action_ids(module: str) -> list[str]:
    """Get visible action IDs for an enabled module (common + module-specific)."""
    return [entry["id"] for entry in get_actions_for_module(module)]


def get_all_trigger_ids() -> dict[str, list[str]]:
    """Get visible trigger IDs organized by enabled module."""
    return {module: get_trigger_ids(module) for module in ENABLED_MODULES}


def get_all_action_ids() -> dict[str, list[str]]:
    """Get visible action IDs organized by enabled module."""
    return {module: get_action_ids(module) for module in ENABLED_MODULES}


# =============================================================================
# RICH REGISTRY ACCESSOR FUNCTIONS (return id + description)
# =============================================================================

def get_triggers_for_module(module: str) -> list[dict[str, str]]:
    """Get visible trigger types with descriptions for an enabled module."""
    if module not in ENABLED_MODULES:
        return []
    return _visible_triggers(module, TRIGGER_REGISTRY.get(module, []))


def get_actions_for_module(module: str) -> list[dict[str, str]]:
    """Get visible action types with descriptions for an enabled module (common + module-specific).

    An id declared in both scopes is returned once, keeping the common set's
    position but the module's description — sprints redeclares `create_task`
    ("Create a new task in a sprint"), which is the more useful wording there,
    and returning it twice made the registry double-count its own palette.
    """
    if module not in ENABLED_MODULES:
        return []
    merged = {
        entry["id"]: entry
        for entry in _visible_actions(module, ACTION_REGISTRY.get("common", []))
    }
    for entry in _visible_actions(module, ACTION_REGISTRY.get(module, [])):
        merged[entry["id"]] = entry
    return list(merged.values())


def get_all_triggers() -> dict[str, list[dict[str, str]]]:
    """Get visible triggers organized by enabled module with descriptions."""
    return {module: get_triggers_for_module(module) for module in ENABLED_MODULES}


def get_all_actions() -> dict[str, list[dict[str, str]]]:
    """Get visible actions organized by enabled module (plus the shared 'common' set)."""
    # "common" is not a module, so only the flat HIDDEN_ACTIONS apply to it —
    # per-module withholding is keyed by the module that declares the action.
    result = {"common": _visible_actions("common", ACTION_REGISTRY.get("common", []))}
    for module in ENABLED_MODULES:
        result[module] = _visible_actions(module, ACTION_REGISTRY.get(module, []))
    return result


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
    """Schema for updating an automation (platform-wide).

    `extra="forbid"` deliberately. Pydantic drops undeclared fields by default,
    so every field missing from this list was accepted with a 200 and thrown
    away. That is worse than a refusal, because the caller cannot tell: a PATCH
    carrying `runs_this_month` looked like it reset the counter and did not,
    and the builder's "keep trigger_type in step with the trigger node" PATCH
    had never once taken effect — `trigger_type` was not declared here, so the
    automation kept whatever trigger it was created with while the canvas
    showed a different one.

    Counters (`runs_this_month`, `total_runs`, `successful_runs`,
    `failed_runs`, `last_run_at`) are owned by the execution engine and are not
    settable over the API at all — they are what the monthly limit is enforced
    against. `module` and `object_id` are also refused: changing either
    reinterprets the automation's stored actions against a different registry
    or a different record type, which is a rebuild rather than an edit.
    """
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    module_config: dict | None = None
    # The builder PATCHes this whenever the trigger node changes. Checked
    # against the module's registry by the endpoint before it is applied.
    trigger_type: str | None = None
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


class EnabledModule(BaseModel):
    """One module the builder may create automations for."""
    module: str
    trigger_count: int
    action_count: int


class ModuleRegistryResponse(BaseModel):
    """Response schema for the enabled-module list.

    The builder's module picker reads this instead of hardcoding a list, so a
    module can never be offered in the UI while its registry is empty.
    """
    modules: list[EnabledModule]
