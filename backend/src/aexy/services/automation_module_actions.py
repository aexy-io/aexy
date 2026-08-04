"""Domain logic for module-specific automation actions, shared by both executors.

An automation runs on one of two paths: the canvas/Temporal executor
(``WorkflowActionHandler``) or the inline executor (``CRMAutomationService``).
The registry only offers an action when BOTH can run it, so anything
implemented on one path alone is invisible to users — which is exactly how
add_response, add_tag, remove_tag, add_note, create_offer and send_reminder
came to be withheld despite having working canvas handlers.

Putting the work here means a module action is written once. The two executors
differ only in how they read their config (``config``/``data`` dicts, different
placeholder resolvers) and how they wrap the outcome (a plain dict inline, a
``NodeExecutionResult`` on the canvas).

Every function returns a plain dict: ``{"error": "..."}`` when it refuses,
otherwise the step's output. Errors are values rather than exceptions because
both executors treat an ``error`` key as a failed step, and neither wants a
raised exception from a domain service to abort the whole run.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def _missing(field: str) -> dict:
    return {"error": f"No {field} specified"}


def _not_found(entity: str, entity_id: Any) -> dict:
    return {"error": f"{entity} {entity_id} not found"}


# =============================================================================
# TICKETS
# =============================================================================

async def add_ticket_response(
    db: AsyncSession,
    *,
    ticket_id: str | None,
    message: str,
    is_internal: bool = True,
    author_id: str | None = None,
) -> dict:
    """Post a reply on a ticket.

    Internal by default, for two reasons. TicketService.add_response dispatches
    `response.received` — "the submitter replied" — for any reply with no
    author, so a public automated reply posted without one both mislabels itself
    and can retrigger the very automation that wrote it. Internal notes dispatch
    nothing. A customer-visible reply therefore has to name its author, which
    also makes it dispatch `response.sent`.
    """
    from aexy.schemas.ticketing import TicketCommentCreate
    from aexy.services.ticket_service import TicketService

    if not ticket_id:
        return _missing("ticket_id")
    if not message:
        return _missing("message")
    if not is_internal and not author_id:
        return {
            "error": (
                "A customer-visible reply needs an author_id — without one the "
                "reply is recorded as the submitter's and can retrigger this "
                "automation. Set an author, or leave the reply internal."
            )
        }

    try:
        reply = await TicketService(db).add_response(
            ticket_id=ticket_id,
            author_id=author_id,
            comment_data=TicketCommentCreate(content=message, is_internal=is_internal),
        )
    except Exception as exc:  # domain service refusal
        logger.warning("add_response failed for ticket %s: %s", ticket_id, exc)
        return {"error": str(exc)}

    return {
        "ticket_id": ticket_id,
        "response_id": reply.id if reply else None,
        "is_internal": is_internal,
        "response_added": True,
    }


# Tickets have no tags column. Automation tags live under this key inside the
# ticket's existing `field_values` JSON so they persist — the canvas handlers
# used to assign `ticket.tags`, which SQLAlchemy accepted as a plain Python
# attribute and never wrote to the database, so every add_tag step reported
# success and changed nothing.
_TAGS_KEY = "tags"


async def _set_ticket_tags(db: AsyncSession, ticket_id: str, mutate) -> dict:
    from aexy.services.ticket_service import TicketService

    try:
        ticket = await TicketService(db).get_ticket(ticket_id)
    except Exception as exc:
        return {"error": str(exc)}
    if not ticket:
        return _not_found("Ticket", ticket_id)

    field_values = dict(ticket.field_values or {})
    raw = field_values.get(_TAGS_KEY) or []
    tags = [str(t) for t in raw] if isinstance(raw, (list, tuple)) else []

    changed_tags = mutate(tags)
    if changed_tags is None:
        return {"tags": tags, "changed": False}

    field_values[_TAGS_KEY] = changed_tags
    ticket.field_values = field_values
    await db.flush()
    return {"tags": changed_tags, "changed": True}


async def add_ticket_tag(db: AsyncSession, *, ticket_id: str | None, tag: str) -> dict:
    """Add a tag to a ticket. Adding one it already has is a no-op, not an error."""
    if not ticket_id:
        return _missing("ticket_id")
    if not tag:
        return _missing("tag")

    def mutate(tags: list[str]) -> list[str] | None:
        if tag in tags:
            return None
        return [*tags, tag]

    result = await _set_ticket_tags(db, ticket_id, mutate)
    if "error" in result:
        return result
    return {"ticket_id": ticket_id, "tag": tag, **result}


async def remove_ticket_tag(db: AsyncSession, *, ticket_id: str | None, tag: str) -> dict:
    """Remove a tag from a ticket. Removing one it lacks is a no-op."""
    if not ticket_id:
        return _missing("ticket_id")
    if not tag:
        return _missing("tag")

    def mutate(tags: list[str]) -> list[str] | None:
        if tag not in tags:
            return None
        return [t for t in tags if t != tag]

    result = await _set_ticket_tags(db, ticket_id, mutate)
    if "error" in result:
        return result
    return {"ticket_id": ticket_id, "tag_removed": tag, **result}


async def change_ticket_status(
    db: AsyncSession,
    *,
    ticket_id: str | None,
    status: str,
    updated_by_id: str | None = None,
) -> dict:
    """Move a ticket to a status.

    An unknown status is refused by TicketUpdate's enum rather than written, so
    a typo cannot put a ticket into a state the Service Desk can't display.
    """
    from pydantic import ValidationError

    from aexy.schemas.ticketing import TicketUpdate
    from aexy.services.ticket_service import TicketService

    if not ticket_id:
        return _missing("ticket_id")
    if not status:
        return _missing("status")

    try:
        update = TicketUpdate(status=status)
    except ValidationError:
        return {"error": f"'{status}' is not a valid ticket status"}

    try:
        ticket = await TicketService(db).update_ticket(
            ticket_id=ticket_id, update_data=update, updated_by_id=updated_by_id
        )
    except Exception as exc:
        logger.warning("change_status failed for ticket %s: %s", ticket_id, exc)
        return {"error": str(exc)}

    if not ticket:
        return _not_found("Ticket", ticket_id)
    return {"ticket_id": ticket_id, "status": getattr(ticket, "status", status)}


async def merge_tickets(
    db: AsyncSession,
    *,
    ticket_id: str | None,
    into_ticket_id: str | None,
) -> dict:
    """Merge one ticket into another: the source is closed and cross-referenced.

    Deliberately conservative — no reply/attachment migration, because losing a
    customer's message to a merge is worse than leaving it on the closed ticket,
    which stays linked from the survivor.
    """
    from aexy.models.ticketing import Ticket

    if not ticket_id:
        return _missing("ticket_id")
    if not into_ticket_id:
        return _missing("into_ticket_id")
    if ticket_id == into_ticket_id:
        return {"error": "Cannot merge a ticket into itself"}

    source = (
        await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ).scalar_one_or_none()
    if not source:
        return _not_found("Ticket", ticket_id)

    target = (
        await db.execute(select(Ticket).where(Ticket.id == into_ticket_id))
    ).scalar_one_or_none()
    if not target:
        return _not_found("Ticket", into_ticket_id)
    if source.workspace_id != target.workspace_id:
        return {"error": "Cannot merge tickets across workspaces"}

    metadata = dict(source.field_values or {})
    metadata["merged_into_ticket_id"] = into_ticket_id
    source.field_values = metadata
    source.status = "closed"

    target_metadata = dict(target.field_values or {})
    merged = list(target_metadata.get("merged_ticket_ids") or [])
    if ticket_id not in merged:
        merged.append(ticket_id)
    target_metadata["merged_ticket_ids"] = merged
    target.field_values = target_metadata

    await db.flush()
    return {
        "ticket_id": ticket_id,
        "merged_into": into_ticket_id,
        "merged_ticket_ids": merged,
    }


# =============================================================================
# HIRING
# =============================================================================

async def _load_candidate(db: AsyncSession, candidate_id: str):
    from aexy.models.assessment import Candidate

    return (
        await db.execute(select(Candidate).where(Candidate.id == candidate_id))
    ).scalar_one_or_none()


async def add_candidate_note(
    db: AsyncSession, *, candidate_id: str | None, note: str
) -> dict:
    """Append an internal note to a candidate, keeping earlier notes."""
    if not candidate_id:
        return _missing("candidate_id")
    if not note:
        return _missing("note")

    candidate = await _load_candidate(db, candidate_id)
    if not candidate:
        return _not_found("Candidate", candidate_id)

    custom_fields = dict(candidate.custom_fields or {})
    existing = custom_fields.get("notes", "")
    custom_fields["notes"] = f"{existing}\n\n---\n{note}" if existing else note
    candidate.custom_fields = custom_fields
    await db.flush()

    return {"candidate_id": candidate.id, "note_added": True}


async def create_candidate_offer(
    db: AsyncSession,
    *,
    candidate_id: str | None,
    position: str = "",
    salary: str = "",
    start_date: str = "",
    notes: str = "",
    now: str | None = None,
) -> dict:
    """Record an offer on a candidate and move them to the offer stage."""
    if not candidate_id:
        return _missing("candidate_id")

    candidate = await _load_candidate(db, candidate_id)
    if not candidate:
        return _not_found("Candidate", candidate_id)

    custom_fields = dict(candidate.custom_fields or {})
    custom_fields["hiring_status"] = "offer"
    custom_fields["offer_details"] = {
        "position": position,
        "salary": salary,
        "start_date": start_date,
        "notes": notes,
        "created_at": now or datetime.now(timezone.utc).isoformat(),
    }
    candidate.custom_fields = custom_fields
    await db.flush()

    return {"candidate_id": candidate.id, "offer_created": True}


async def reject_candidate(
    db: AsyncSession,
    *,
    candidate_id: str | None,
    reason: str = "",
    now: str | None = None,
) -> dict:
    """Mark a candidate rejected, recording the reason."""
    if not candidate_id:
        return _missing("candidate_id")

    candidate = await _load_candidate(db, candidate_id)
    if not candidate:
        return _not_found("Candidate", candidate_id)

    custom_fields = dict(candidate.custom_fields or {})
    custom_fields["hiring_status"] = "rejected"
    custom_fields["rejection"] = {
        "reason": reason,
        "rejected_at": now or datetime.now(timezone.utc).isoformat(),
    }
    candidate.custom_fields = custom_fields
    await db.flush()

    return {"candidate_id": candidate.id, "rejected": True, "reason": reason}


async def send_candidate_assessment(
    db: AsyncSession,
    *,
    candidate_id: str | None,
    assessment_id: str | None,
    now: str | None = None,
) -> dict:
    """Assign an assessment to a candidate.

    Returns the invite details so a following send_email step can deliver them;
    this action records the assignment rather than sending mail itself, because
    the module already owns the assessment-taking flow.
    """
    from aexy.models.assessment import Assessment

    if not candidate_id:
        return _missing("candidate_id")
    if not assessment_id:
        return _missing("assessment_id")

    candidate = await _load_candidate(db, candidate_id)
    if not candidate:
        return _not_found("Candidate", candidate_id)

    assessment = (
        await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    ).scalar_one_or_none()
    if not assessment:
        return _not_found("Assessment", assessment_id)

    custom_fields = dict(candidate.custom_fields or {})
    assigned = list(custom_fields.get("assigned_assessments") or [])
    if assessment_id not in assigned:
        assigned.append(assessment_id)
    custom_fields["assigned_assessments"] = assigned
    custom_fields["assessment_sent_at"] = now or datetime.now(timezone.utc).isoformat()
    candidate.custom_fields = custom_fields
    await db.flush()

    return {
        "candidate_id": candidate.id,
        "assessment_id": assessment_id,
        "assessment_title": getattr(assessment, "title", None),
        "candidate_email": getattr(candidate, "email", None),
    }


# =============================================================================
# UPTIME
# =============================================================================

async def acknowledge_incident(
    db: AsyncSession,
    *,
    incident_id: str | None,
    acknowledged_by_id: str | None = None,
) -> dict:
    """Acknowledge an open incident.

    UptimeService requires the acknowledging developer, so a step with no
    responder configured is refused rather than attributed to nobody.
    """
    from aexy.services.uptime_service import UptimeService

    if not incident_id:
        return _missing("incident_id")
    if not acknowledged_by_id:
        return {
            "error": "No acknowledged_by_id specified — an acknowledgement needs a responder"
        }

    try:
        incident = await UptimeService(db).acknowledge_incident(
            incident_id, acknowledged_by_id
        )
    except Exception as exc:
        logger.warning("acknowledge_incident failed for %s: %s", incident_id, exc)
        return {"error": str(exc)}

    if not incident:
        return _not_found("Incident", incident_id)
    return {
        "incident_id": incident_id,
        "acknowledged": True,
        "acknowledged_at": getattr(incident, "acknowledged_at", None),
    }


# =============================================================================
# SPRINTS
# =============================================================================

async def set_task_sprint(
    db: AsyncSession,
    *,
    task_id: str | None,
    sprint_id: str | None,
) -> dict:
    """Move a task into a sprint, or out of every sprint when sprint_id is None.

    Backs both add_to_sprint and remove_from_sprint — the two differ only in
    whether a sprint is named.
    """
    from aexy.models.sprint import Sprint, SprintTask

    if not task_id:
        return _missing("task_id")

    task = (
        await db.execute(select(SprintTask).where(SprintTask.id == task_id))
    ).scalar_one_or_none()
    if not task:
        return _not_found("Task", task_id)

    if sprint_id:
        sprint = (
            await db.execute(select(Sprint).where(Sprint.id == sprint_id))
        ).scalar_one_or_none()
        if not sprint:
            return _not_found("Sprint", sprint_id)
        if sprint.workspace_id != task.workspace_id:
            return {"error": "Cannot move a task into another workspace's sprint"}

    previous_sprint_id = task.sprint_id
    task.sprint_id = sprint_id
    await db.flush()

    return {
        "task_id": task_id,
        "sprint_id": sprint_id,
        "previous_sprint_id": previous_sprint_id,
    }


# =============================================================================
# EMAIL MARKETING
# =============================================================================

async def pause_campaign(
    db: AsyncSession, *, campaign_id: str | None, workspace_id: str
) -> dict:
    """Pause a sending campaign."""
    from aexy.services.campaign_service import CampaignService

    if not campaign_id:
        return _missing("campaign_id")
    try:
        campaign = await CampaignService(db).pause_campaign(campaign_id, workspace_id)
    except Exception as exc:
        return {"error": str(exc)}
    if not campaign:
        return _not_found("Campaign", campaign_id)
    return {"campaign_id": campaign_id, "status": getattr(campaign, "status", "paused")}


async def resume_campaign(
    db: AsyncSession, *, campaign_id: str | None, workspace_id: str
) -> dict:
    """Resume a paused campaign."""
    from aexy.services.campaign_service import CampaignService

    if not campaign_id:
        return _missing("campaign_id")
    try:
        campaign = await CampaignService(db).resume_campaign(campaign_id, workspace_id)
    except Exception as exc:
        return {"error": str(exc)}
    if not campaign:
        return _not_found("Campaign", campaign_id)
    return {"campaign_id": campaign_id, "status": getattr(campaign, "status", "sending")}


async def add_campaign_recipient(
    db: AsyncSession,
    *,
    campaign_id: str | None,
    email: str,
    recipient_name: str | None = None,
    record_id: str | None = None,
) -> dict:
    """Add one recipient to a campaign.

    Idempotent per (campaign, email) — the table has a unique constraint on that
    pair, so re-running an automation must not raise.
    """
    from aexy.models.email_marketing import CampaignRecipient, EmailCampaign

    if not campaign_id:
        return _missing("campaign_id")
    if not email:
        return _missing("email")

    campaign = (
        await db.execute(select(EmailCampaign).where(EmailCampaign.id == campaign_id))
    ).scalar_one_or_none()
    if not campaign:
        return _not_found("Campaign", campaign_id)

    existing = (
        await db.execute(
            select(CampaignRecipient).where(
                CampaignRecipient.campaign_id == campaign_id,
                CampaignRecipient.email == email,
            )
        )
    ).scalar_one_or_none()
    if existing:
        return {
            "campaign_id": campaign_id,
            "email": email,
            "recipient_id": existing.id,
            "added": False,
        }

    recipient = CampaignRecipient(
        campaign_id=campaign_id,
        email=email,
        recipient_name=recipient_name,
        record_id=record_id,
        context={},
    )
    db.add(recipient)
    await db.flush()

    return {
        "campaign_id": campaign_id,
        "email": email,
        "recipient_id": recipient.id,
        "added": True,
    }


async def remove_campaign_recipient(
    db: AsyncSession,
    *,
    campaign_id: str | None,
    email: str,
) -> dict:
    """Remove a recipient from a campaign before it sends."""
    from aexy.models.email_marketing import CampaignRecipient

    if not campaign_id:
        return _missing("campaign_id")
    if not email:
        return _missing("email")

    recipient = (
        await db.execute(
            select(CampaignRecipient).where(
                CampaignRecipient.campaign_id == campaign_id,
                CampaignRecipient.email == email,
            )
        )
    ).scalar_one_or_none()
    if not recipient:
        return {"campaign_id": campaign_id, "email": email, "removed": False}

    await db.delete(recipient)
    await db.flush()
    return {"campaign_id": campaign_id, "email": email, "removed": True}


async def update_campaign_recipient(
    db: AsyncSession,
    *,
    campaign_id: str | None,
    email: str,
    status: str | None = None,
    recipient_name: str | None = None,
    context_updates: dict | None = None,
) -> dict:
    """Update a campaign recipient's status, name, or personalization context."""
    from aexy.models.email_marketing import CampaignRecipient, RecipientStatus

    if not campaign_id:
        return _missing("campaign_id")
    if not email:
        return _missing("email")

    recipient = (
        await db.execute(
            select(CampaignRecipient).where(
                CampaignRecipient.campaign_id == campaign_id,
                CampaignRecipient.email == email,
            )
        )
    ).scalar_one_or_none()
    if not recipient:
        return _not_found("Recipient", email)

    if status:
        valid = {member.value for member in RecipientStatus}
        if status not in valid:
            return {"error": f"'{status}' is not a valid recipient status"}
        recipient.status = status
    if recipient_name is not None:
        recipient.recipient_name = recipient_name
    if context_updates:
        recipient.context = {**(recipient.context or {}), **context_updates}

    await db.flush()
    return {
        "campaign_id": campaign_id,
        "email": email,
        "status": recipient.status,
        "updated": True,
    }


# =============================================================================
# TRACKING
# =============================================================================

async def escalate_blocker(
    db: AsyncSession,
    *,
    blocker_id: str | None,
    escalate_to_id: str | None = None,
) -> dict:
    """Escalate a blocker, optionally naming who it goes to."""
    from aexy.models.tracking import Blocker, BlockerStatus

    if not blocker_id:
        return _missing("blocker_id")

    blocker = (
        await db.execute(select(Blocker).where(Blocker.id == blocker_id))
    ).scalar_one_or_none()
    if not blocker:
        return _not_found("Blocker", blocker_id)

    if blocker.status == BlockerStatus.RESOLVED.value:
        return {"error": "Cannot escalate a resolved blocker"}

    blocker.status = BlockerStatus.ESCALATED.value
    if escalate_to_id:
        blocker.escalated_to_id = escalate_to_id
    await db.flush()

    return {
        "blocker_id": blocker_id,
        "status": blocker.status,
        "escalated_to_id": blocker.escalated_to_id,
    }


async def flag_time_entry_anomaly(
    db: AsyncSession,
    *,
    time_entry_id: str | None,
    reason: str = "",
    now: str | None = None,
) -> dict:
    """Flag a time entry for human review.

    Recorded on the entry's inference_metadata rather than as a new column so an
    automation can raise a flag without a schema change; the review UI reads the
    same dict.
    """
    from aexy.models.tracking import TimeEntry

    if not time_entry_id:
        return _missing("time_entry_id")

    entry = (
        await db.execute(select(TimeEntry).where(TimeEntry.id == time_entry_id))
    ).scalar_one_or_none()
    if not entry:
        return _not_found("Time entry", time_entry_id)

    metadata = dict(entry.inference_metadata or {})
    metadata["anomaly_flag"] = {
        "reason": reason,
        "flagged_at": now or datetime.now(timezone.utc).isoformat(),
    }
    entry.inference_metadata = metadata
    entry.attribution_status = "needs_review"
    await db.flush()

    return {
        "time_entry_id": time_entry_id,
        "flagged": True,
        "attribution_status": entry.attribution_status,
    }


# =============================================================================
# COMPLIANCE
# =============================================================================

async def waive_training_assignment(
    db: AsyncSession,
    *,
    assignment_id: str | None,
    workspace_id: str,
    waived_by_id: str | None = None,
    reason: str = "",
) -> dict:
    """Waive a training assignment (the compliance module's status change).

    The waiver reason is required and has a 10-character floor in
    TrainingAssignmentWaive — a waived compliance requirement has to say why, so
    a step with no reason is refused here rather than raising inside the service.
    """
    from pydantic import ValidationError

    from aexy.schemas.compliance import TrainingAssignmentWaive
    from aexy.services.compliance_service import ComplianceService

    if not assignment_id:
        return _missing("assignment_id")
    if not waived_by_id:
        return {"error": "No waived_by_id specified — a waiver needs an approver"}

    try:
        waive_data = TrainingAssignmentWaive(reason=reason)
    except ValidationError:
        return {
            "error": "A waiver reason of at least 10 characters is required"
        }

    try:
        assignment = await ComplianceService(db).waive_assignment(
            assignment_id=assignment_id,
            workspace_id=workspace_id,
            data=waive_data,
            waived_by_id=waived_by_id,
        )
    except Exception as exc:
        logger.warning("waive_assignment failed for %s: %s", assignment_id, exc)
        return {"error": str(exc)}

    if not assignment:
        return _not_found("Assignment", assignment_id)
    return {
        "assignment_id": assignment_id,
        "status": getattr(assignment, "status", "waived"),
    }


# =============================================================================
# FORMS
# =============================================================================

async def create_crm_record_from_submission(
    db: AsyncSession,
    *,
    workspace_id: str,
    object_id: str | None,
    values: dict | None,
    created_by_id: str | None = None,
) -> dict:
    """Create a CRM record from form submission data."""
    from aexy.services.crm_service import CRMObjectService, CRMRecordService

    if not object_id:
        return _missing("object_id")
    if not values:
        return _missing("values")

    crm_object = await CRMObjectService(db).get_object(object_id)
    if not crm_object:
        return _not_found("CRM object", object_id)
    if crm_object.workspace_id != workspace_id:
        return {"error": "CRM object belongs to another workspace"}

    record = await CRMRecordService(db).create_record(
        workspace_id=workspace_id,
        object_id=object_id,
        values=values,
        created_by_id=created_by_id,
    )
    return {"record_id": record.id, "object_id": object_id, "created": True}


async def create_ticket_from_submission(
    db: AsyncSession,
    *,
    workspace_id: str,
    form_id: str | None,
    submitter_email: str | None,
    submitter_name: str | None,
    field_values: dict | None,
) -> dict:
    """Open a support ticket from form submission data."""
    from pydantic import ValidationError

    from aexy.schemas.ticketing import PublicTicketSubmission
    from aexy.services.ticket_service import TicketService

    if not form_id:
        return _missing("form_id")

    try:
        submission = PublicTicketSubmission(
            submitter_email=submitter_email or None,
            submitter_name=submitter_name or None,
            field_values=field_values or {},
        )
    except ValidationError as exc:
        return {"error": f"Invalid ticket submission: {exc.errors()[0]['msg']}"}

    try:
        ticket = await TicketService(db).create_ticket(
            form_id=form_id,
            workspace_id=workspace_id,
            submission=submission,
        )
    except Exception as exc:
        logger.warning("create_ticket failed for form %s: %s", form_id, exc)
        return {"error": str(exc)}

    return {
        "ticket_id": ticket.id,
        "ticket_number": ticket.ticket_number,
        "created": True,
    }


# =============================================================================
# EXECUTOR-FACING DISPATCH
# =============================================================================

def _first(*values: Any) -> Any:
    """First value that is neither None nor an empty string."""
    for value in values:
        if value not in (None, ""):
            return value
    return None


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _split_list(value: Any) -> list[str]:
    """Accept a list, or a newline/comma separated string."""
    if value is None or value == "":
        return []
    if isinstance(value, (list, tuple, set)):
        return [str(v).strip() for v in value if str(v).strip()]
    return [part.strip() for part in re.split(r"[\n,;]+", str(value)) if part.strip()]


class ModuleActionContext:
    """What a module action needs, independent of which executor is running it.

    `render` applies the running executor's own placeholder resolution — the
    inline path's _replace_placeholders or the canvas path's _render_template —
    so `{{record.values.email}}` means the same thing in both.
    """

    def __init__(
        self,
        db: AsyncSession,
        *,
        config: dict,
        workspace_id: str,
        trigger_data: dict | None,
        render,
        actor_id: str | None = None,
    ) -> None:
        self.db = db
        self.config = config or {}
        self.workspace_id = workspace_id
        self.trigger_data = trigger_data or {}
        self._render = render
        self.actor_id = actor_id

    def text(self, *keys: str, default: str = "") -> str:
        """A config value with placeholders resolved."""
        raw = _first(*(self.config.get(key) for key in keys))
        if raw in (None, ""):
            return default
        return self._render(str(raw))

    def raw(self, *keys: str, default: Any = None) -> Any:
        value = _first(*(self.config.get(key) for key in keys))
        return default if value is None else value

    def entity_id(self, *keys: str) -> str | None:
        """An id from config, falling back to the trigger payload.

        A step usually acts on whatever fired it — the ticket that was created,
        the blocker that went stale — so the trigger's own id is the default.
        """
        from_config = _first(*(self.config.get(key) for key in keys))
        if from_config not in (None, ""):
            return str(self._render(str(from_config)))
        from_trigger = _first(*(self.trigger_data.get(key) for key in keys))
        return str(from_trigger) if from_trigger not in (None, "") else None


async def _act_add_response(ctx: ModuleActionContext) -> dict:
    return await add_ticket_response(
        ctx.db,
        ticket_id=ctx.entity_id("ticket_id"),
        message=ctx.text("message", "response", "response_message"),
        is_internal=_as_bool(ctx.raw("is_internal"), default=True),
        author_id=ctx.raw("author_id") or ctx.actor_id,
    )


async def _act_add_tag(ctx: ModuleActionContext) -> dict:
    return await add_ticket_tag(
        ctx.db,
        ticket_id=ctx.entity_id("ticket_id"),
        tag=ctx.text("tag", "tag_name"),
    )


async def _act_remove_tag(ctx: ModuleActionContext) -> dict:
    return await remove_ticket_tag(
        ctx.db,
        ticket_id=ctx.entity_id("ticket_id"),
        tag=ctx.text("tag", "tag_name"),
    )


async def _act_change_status(ctx: ModuleActionContext) -> dict:
    return await change_ticket_status(
        ctx.db,
        ticket_id=ctx.entity_id("ticket_id"),
        status=ctx.text("status", "new_status", "ticket_status"),
        updated_by_id=ctx.raw("updated_by_id") or ctx.actor_id,
    )


async def _act_merge_tickets(ctx: ModuleActionContext) -> dict:
    return await merge_tickets(
        ctx.db,
        ticket_id=ctx.entity_id("ticket_id"),
        into_ticket_id=ctx.text("into_ticket_id", "target_ticket_id") or None,
    )


async def _act_add_note(ctx: ModuleActionContext) -> dict:
    return await add_candidate_note(
        ctx.db,
        candidate_id=ctx.entity_id("candidate_id"),
        note=ctx.text("note", "message", "note_text"),
    )


async def _act_create_offer(ctx: ModuleActionContext) -> dict:
    return await create_candidate_offer(
        ctx.db,
        candidate_id=ctx.entity_id("candidate_id"),
        position=ctx.text("position"),
        salary=ctx.text("salary"),
        start_date=ctx.text("start_date"),
        notes=ctx.text("notes"),
    )


async def _act_reject_candidate(ctx: ModuleActionContext) -> dict:
    return await reject_candidate(
        ctx.db,
        candidate_id=ctx.entity_id("candidate_id"),
        reason=ctx.text("reason", "rejection_reason"),
    )


async def _act_send_assessment(ctx: ModuleActionContext) -> dict:
    return await send_candidate_assessment(
        ctx.db,
        candidate_id=ctx.entity_id("candidate_id"),
        assessment_id=ctx.text("assessment_id") or None,
    )


async def _act_acknowledge_incident(ctx: ModuleActionContext) -> dict:
    return await acknowledge_incident(
        ctx.db,
        incident_id=ctx.entity_id("incident_id"),
        acknowledged_by_id=ctx.raw("acknowledged_by_id", "responder_id") or ctx.actor_id,
    )


async def _act_add_to_sprint(ctx: ModuleActionContext) -> dict:
    return await set_task_sprint(
        ctx.db,
        task_id=ctx.entity_id("task_id"),
        sprint_id=ctx.text("sprint_id") or None,
    )


async def _act_remove_from_sprint(ctx: ModuleActionContext) -> dict:
    return await set_task_sprint(
        ctx.db, task_id=ctx.entity_id("task_id"), sprint_id=None
    )


async def _act_add_to_campaign(ctx: ModuleActionContext) -> dict:
    return await add_campaign_recipient(
        ctx.db,
        campaign_id=ctx.text("campaign_id") or ctx.entity_id("campaign_id"),
        email=ctx.text("email", "recipient_email", "to"),
        recipient_name=ctx.text("recipient_name") or None,
        record_id=ctx.entity_id("record_id"),
    )


async def _act_remove_from_campaign(ctx: ModuleActionContext) -> dict:
    return await remove_campaign_recipient(
        ctx.db,
        campaign_id=ctx.text("campaign_id") or ctx.entity_id("campaign_id"),
        email=ctx.text("email", "recipient_email", "to"),
    )


async def _act_update_recipient(ctx: ModuleActionContext) -> dict:
    return await update_campaign_recipient(
        ctx.db,
        campaign_id=ctx.text("campaign_id") or ctx.entity_id("campaign_id"),
        email=ctx.text("email", "recipient_email", "to"),
        status=ctx.text("status", "recipient_status") or None,
        recipient_name=ctx.text("recipient_name") or None,
        context_updates=ctx.raw("context_updates") if isinstance(ctx.raw("context_updates"), dict) else None,
    )


async def _act_pause_campaign(ctx: ModuleActionContext) -> dict:
    return await pause_campaign(
        ctx.db,
        campaign_id=ctx.text("campaign_id") or ctx.entity_id("campaign_id"),
        workspace_id=ctx.workspace_id,
    )


async def _act_resume_campaign(ctx: ModuleActionContext) -> dict:
    return await resume_campaign(
        ctx.db,
        campaign_id=ctx.text("campaign_id") or ctx.entity_id("campaign_id"),
        workspace_id=ctx.workspace_id,
    )


async def _act_escalate_blocker(ctx: ModuleActionContext) -> dict:
    return await escalate_blocker(
        ctx.db,
        blocker_id=ctx.entity_id("blocker_id"),
        escalate_to_id=ctx.raw("escalate_to_id", "escalated_to_id"),
    )


async def _act_flag_anomaly(ctx: ModuleActionContext) -> dict:
    return await flag_time_entry_anomaly(
        ctx.db,
        time_entry_id=ctx.entity_id("time_entry_id", "entry_id"),
        reason=ctx.text("reason"),
    )


async def _act_waive_training(ctx: ModuleActionContext) -> dict:
    return await waive_training_assignment(
        ctx.db,
        assignment_id=ctx.entity_id("assignment_id"),
        workspace_id=ctx.workspace_id,
        waived_by_id=ctx.raw("waived_by_id", "approver_id") or ctx.actor_id,
        reason=ctx.text("reason", "waiver_reason"),
    )


async def _act_create_crm_record(ctx: ModuleActionContext) -> dict:
    values = ctx.raw("values")
    if not isinstance(values, dict) or not values:
        # A form step's natural source is the submission payload itself.
        submitted = ctx.trigger_data.get("data")
        values = submitted if isinstance(submitted, dict) else {}
    return await create_crm_record_from_submission(
        ctx.db,
        workspace_id=ctx.workspace_id,
        object_id=ctx.text("object_id", "target_object_id") or None,
        values=values,
        created_by_id=ctx.actor_id,
    )


async def _act_create_ticket(ctx: ModuleActionContext) -> dict:
    field_values = ctx.raw("field_values")
    if not isinstance(field_values, dict) or not field_values:
        submitted = ctx.trigger_data.get("data")
        field_values = submitted if isinstance(submitted, dict) else {}
    return await create_ticket_from_submission(
        ctx.db,
        workspace_id=ctx.workspace_id,
        form_id=ctx.text("ticket_form_id") or ctx.entity_id("form_id"),
        submitter_email=ctx.text("submitter_email"),
        submitter_name=ctx.text("submitter_name"),
        field_values=field_values,
    )


# action id -> adapter. Both executors consult this table, so a module action is
# implemented once and can never be available on one path only.
MODULE_ACTION_ADAPTERS = {
    # tickets
    "add_response": _act_add_response,
    "add_tag": _act_add_tag,
    "remove_tag": _act_remove_tag,
    "change_status": _act_change_status,
    "merge_tickets": _act_merge_tickets,
    # hiring
    "add_note": _act_add_note,
    "create_offer": _act_create_offer,
    "reject_candidate": _act_reject_candidate,
    "send_assessment": _act_send_assessment,
    # uptime
    "acknowledge_incident": _act_acknowledge_incident,
    # sprints
    "add_to_sprint": _act_add_to_sprint,
    "remove_from_sprint": _act_remove_from_sprint,
    # email marketing
    "add_to_campaign": _act_add_to_campaign,
    "remove_from_campaign": _act_remove_from_campaign,
    "update_recipient": _act_update_recipient,
    "pause_campaign": _act_pause_campaign,
    "resume_campaign": _act_resume_campaign,
    # tracking
    "escalate_blocker": _act_escalate_blocker,
    "flag_anomaly": _act_flag_anomaly,
    # compliance
    "waive_training": _act_waive_training,
    # forms
    "create_crm_record": _act_create_crm_record,
    "create_ticket": _act_create_ticket,
}


async def run_module_action(
    action_type: str,
    db: AsyncSession,
    *,
    config: dict,
    workspace_id: str,
    trigger_data: dict | None,
    render,
    actor_id: str | None = None,
) -> dict | None:
    """Run a shared module action, or return None if this isn't one."""
    adapter = MODULE_ACTION_ADAPTERS.get(action_type)
    if adapter is None:
        return None
    ctx = ModuleActionContext(
        db,
        config=config,
        workspace_id=workspace_id,
        trigger_data=trigger_data,
        render=render,
        actor_id=actor_id,
    )
    return await adapter(ctx)
