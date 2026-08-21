"""Ticket service for managing tickets and responses."""

import logging
import re
import secrets
from datetime import datetime, timezone
from uuid import uuid4

import bcrypt
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.core.config import settings
from aexy.models.developer import Developer
from aexy.models.ticketing import (
    EscalationMatrix,
    SLAPolicy,
    Ticket,
    TicketEscalation,
    TicketForm,
    TicketPriority,
    TicketShareLink,
    TicketStatus,
)
from aexy.models.ticketing import (
    TicketResponse as TicketResponseModel,
)
from aexy.models.workspace import Workspace
from aexy.schemas.ticketing import (
    EscalationMatrixCreate,
    EscalationMatrixUpdate,
    PublicTicketSubmission,
    TicketCommentCreate,
    TicketCreate,
    TicketFilters,
    TicketUpdate,
)
from aexy.services.activity_logger import log_activity
from aexy.services.automation_service import dispatch_automation_event
from aexy.services.notification_service import (
    _get_text_snippet,
    extract_mentioned_user_ids,
    notify_mention,
)
from aexy.services.storage_service import get_storage_service


logger = logging.getLogger(__name__)

TICKET_ATTACHMENTS_PREFIX = "ticket-attachments"

# Field keys a form commonly uses for the ticket's headline, most specific
# first. A form builder names this field whatever suits the form, so there is no
# single key to read — but these three cover what the templates ship with.
_HEADLINE_KEYS = ("title", "subject", "summary")


def headline_from_field_values(field_values: dict | None) -> str | None:
    """The one-line description of a ticket, taken from its submission.

    Used to fill `Ticket.title` at creation and to fall back for rows the
    backfill could not fill. Returns None rather than an empty string so a blank
    subject stays absent instead of becoming a title of "".
    """
    for key in _HEADLINE_KEYS:
        value = (field_values or {}).get(key)
        if value:
            text = " ".join(str(value).split())
            if text:
                return text[:500]
    return None
_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


class TicketService:
    """Service for managing tickets and responses."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ==================== Ticket CRUD ====================

    async def create_ticket(
        self,
        form_id: str,
        workspace_id: str,
        submission: PublicTicketSubmission,
        source_ip: str | None = None,
        user_agent: str | None = None,
        referrer_url: str | None = None,
        attachments: list[dict] | None = None,
    ) -> Ticket:
        """Create a ticket from a public form submission.

        Args:
            form_id: Form ID.
            workspace_id: Workspace ID.
            submission: Submission data.
            source_ip: Request IP address.
            user_agent: Request user agent.
            referrer_url: Request referrer.
            attachments: Files already streamed to storage by the public upload
                endpoint. Set on the ticket directly — re-uploading them here
                would duplicate the stored objects.

        Returns:
            Created Ticket.
        """
        # Get next ticket number for workspace
        ticket_number = await self._get_next_ticket_number(workspace_id)

        # Generate verification token if email provided
        verification_token = None
        if submission.submitter_email:
            verification_token = secrets.token_urlsafe(32)

        ticket = Ticket(
            id=str(uuid4()),
            form_id=form_id,
            workspace_id=workspace_id,
            ticket_number=ticket_number,
            submitter_email=submission.submitter_email,
            submitter_name=submission.submitter_name,
            email_verified=False,
            verification_token=verification_token,
            field_values=submission.field_values,
            title=headline_from_field_values(submission.field_values),
            attachments=attachments or [],
            status=TicketStatus.NEW.value,
            source_ip=source_ip,
            user_agent=user_agent,
            referrer_url=referrer_url,
        )
        self.db.add(ticket)

        # Calculate SLA due date
        await self._apply_sla(ticket)

        await self.db.flush()
        await self.db.refresh(ticket)

        # Dispatch ticket.created event for automations
        await dispatch_automation_event(
            db=self.db,
            workspace_id=workspace_id,
            module="tickets",
            trigger_type="ticket.created",
            entity_id=ticket.id,
            trigger_data={
                "ticket_id": ticket.id,
                "ticket_number": ticket.ticket_number,
                "form_id": form_id,
                "submitter_email": ticket.submitter_email,
                "submitter_name": ticket.submitter_name,
                "status": ticket.status,
                "priority": ticket.priority,
                "field_values": ticket.field_values,
                "workspace_id": workspace_id,
            },
        )

        await log_activity(
            self.db,
            workspace_id=workspace_id,
            entity_type="ticket",
            entity_id=str(ticket.id),
            activity_type="created",
            title=f"Created ticket #{ticket.ticket_number}",
            metadata={"ticket_number": ticket.ticket_number, "submitter_email": ticket.submitter_email},
        )

        # Auto-create a public share link when the form defaults to shareable.
        form_result = await self.db.execute(
            select(TicketForm.default_share_enabled).where(TicketForm.id == form_id)
        )
        if form_result.scalar_one_or_none():
            self.db.add(
                TicketShareLink(
                    id=str(uuid4()),
                    ticket_id=ticket.id,
                    workspace_id=workspace_id,
                    token=secrets.token_urlsafe(16),
                    is_active=True,
                )
            )
            await self.db.flush()

        return ticket

    async def _get_next_ticket_number(self, workspace_id: str) -> int:
        """The next ticket number, allocated atomically.

        Was `max(ticket_number) + 1` read in one statement and written in
        another: two concurrent submissions read the same number and both used
        it. `tickets` has a unique constraint on (workspace_id, ticket_number),
        so that surfaced as an IntegrityError — a 500 on a public form, which is
        the worst place to have one.

        The UPDATE...RETURNING locks the workspace row, so concurrent
        submissions serialize on it and get distinct numbers. Same mechanism as
        `SprintTask.task_key` and the bug and story keys.

        `next_ticket_number` holds the value to assign NEXT, so a fresh
        workspace's first ticket is #1 and the counter becomes 2.
        """
        row = (
            await self.db.execute(
                update(Workspace)
                .where(Workspace.id == workspace_id)
                .values(next_ticket_number=Workspace.next_ticket_number + 1)
                .returning(Workspace.next_ticket_number)
            )
        ).fetchone()
        if row is None:
            raise ValueError(f"Workspace {workspace_id} does not exist")
        return int(row[0]) - 1

    async def _apply_sla(self, ticket: Ticket) -> None:
        """Apply SLA policy to a ticket."""
        # Find matching SLA policy
        stmt = (
            select(SLAPolicy)
            .where(
                and_(
                    SLAPolicy.workspace_id == ticket.workspace_id,
                    SLAPolicy.is_active == True,
                )
            )
            .order_by(SLAPolicy.priority_order)
        )
        result = await self.db.execute(stmt)
        policies = list(result.scalars().all())

        for policy in policies:
            conditions = policy.conditions or {}

            # Check if policy matches
            form_ids = conditions.get("form_ids", [])
            if form_ids and ticket.form_id not in form_ids:
                continue

            priorities = conditions.get("priorities", [])
            if priorities and ticket.priority not in priorities:
                continue

            # Apply first matching policy
            if policy.first_response_target_minutes:
                from datetime import timedelta
                ticket.sla_due_at = datetime.now(timezone.utc) + timedelta(
                    minutes=policy.first_response_target_minutes
                )
            break

    async def get_ticket(self, ticket_id: str) -> Ticket | None:
        """Get a ticket by ID."""
        stmt = (
            select(Ticket)
            .where(Ticket.id == ticket_id)
            .options(
                selectinload(Ticket.form),
                selectinload(Ticket.assignee),
                selectinload(Ticket.team),
                selectinload(Ticket.responses),
            )
            .execution_options(populate_existing=True)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_ticket_by_number(
        self,
        workspace_id: str,
        ticket_number: int,
    ) -> Ticket | None:
        """Get a ticket by its number within a workspace."""
        stmt = (
            select(Ticket)
            .where(
                and_(
                    Ticket.workspace_id == workspace_id,
                    Ticket.ticket_number == ticket_number,
                )
            )
            .options(
                selectinload(Ticket.form),
                selectinload(Ticket.assignee),
                selectinload(Ticket.team),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_tickets(
        self,
        workspace_id: str,
        filters: TicketFilters | None = None,
        limit: int = 50,
        offset: int = 0,
        visibility_clause=None,
    ) -> tuple[list[Ticket], int]:
        """List tickets for a workspace with filters.

        Args:
            workspace_id: Workspace ID.
            filters: Optional filters.
            limit: Maximum number of tickets to return.
            offset: Number of tickets to skip.
            visibility_clause: Optional row-level restriction from the caller's
                scope (see service_desk_service.generic_ticket_scope_clause).

        Returns:
            Tuple of (tickets, total_count).
        """
        base_stmt = select(Ticket).where(Ticket.workspace_id == workspace_id)
        if visibility_clause is not None:
            base_stmt = base_stmt.where(visibility_clause)

        if filters:
            if filters.form_id:
                base_stmt = base_stmt.where(Ticket.form_id == filters.form_id)
            if filters.status:
                base_stmt = base_stmt.where(Ticket.status.in_(filters.status))
            if filters.priority:
                base_stmt = base_stmt.where(Ticket.priority.in_(filters.priority))
            if filters.assignee_id:
                base_stmt = base_stmt.where(Ticket.assignee_id == filters.assignee_id)
            if filters.team_id:
                base_stmt = base_stmt.where(Ticket.team_id == filters.team_id)
            if filters.submitter_email:
                base_stmt = base_stmt.where(
                    Ticket.submitter_email.ilike(f"%{filters.submitter_email}%")
                )
            if filters.sla_breached is not None:
                base_stmt = base_stmt.where(Ticket.sla_breached == filters.sla_breached)
            if filters.created_after:
                base_stmt = base_stmt.where(Ticket.created_at >= filters.created_after)
            if filters.created_before:
                base_stmt = base_stmt.where(Ticket.created_at <= filters.created_before)

        # Service Desk tickets live in their own module (source='service_desk_*').
        # Exclude them from the generic tickets list unless a caller explicitly
        # scopes to a form (which opts back in).
        if not (filters and filters.form_id):
            base_stmt = base_stmt.where(
                or_(Ticket.source.is_(None), Ticket.source.notlike("service_desk%"))
            )

        # Count total
        count_stmt = select(func.count()).select_from(base_stmt.subquery())
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Get paginated results
        stmt = (
            base_stmt
            .options(selectinload(Ticket.form), selectinload(Ticket.assignee))
            .order_by(Ticket.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        tickets = list(result.scalars().all())

        return tickets, total

    async def update_ticket(
        self,
        ticket_id: str,
        update_data: TicketUpdate,
        updated_by_id: str | None = None,
    ) -> Ticket | None:
        """Update a ticket.

        Args:
            ticket_id: Ticket ID.
            update_data: Update data.
            updated_by_id: Developer ID making the update.

        Returns:
            Updated Ticket.
        """
        ticket = await self.get_ticket(ticket_id)
        if not ticket:
            return None

        old_status = ticket.status
        old_priority = ticket.priority
        data = update_data.model_dump(exclude_unset=True)

        if "assignee_id" in data:
            from aexy.services.service_desk_ticket_service import (
                reassign_service_desk_ticket_family,
            )

            family = await reassign_service_desk_ticket_family(
                self.db,
                str(ticket.workspace_id),
                str(ticket.id),
                data.pop("assignee_id"),
            )
            ticket = next(member for member in family if str(member.id) == ticket_id)

        for field, value in data.items():
            setattr(ticket, field, value)

        # Track status changes
        if "status" in data and data["status"] != old_status:
            new_status = data["status"]

            # Track first response
            if not ticket.first_response_at and new_status != TicketStatus.NEW.value:
                ticket.first_response_at = datetime.now(timezone.utc)

            # Track resolution
            if new_status == TicketStatus.RESOLVED.value:
                ticket.resolved_at = datetime.now(timezone.utc)
            elif new_status == TicketStatus.CLOSED.value:
                ticket.closed_at = datetime.now(timezone.utc)

            # Create status change response
            if updated_by_id:
                response = TicketResponseModel(
                    id=str(uuid4()),
                    ticket_id=ticket_id,
                    author_id=updated_by_id,
                    is_internal=True,
                    content=f"Status changed from {old_status} to {new_status}",
                    old_status=old_status,
                    new_status=new_status,
                )
                self.db.add(response)

        await self.db.flush()
        await self.db.refresh(ticket)

        # Dispatch automation events
        if "status" in data and data["status"] != old_status:
            new_status = data["status"]
            # Dispatch ticket.status_changed
            await dispatch_automation_event(
                db=self.db,
                workspace_id=ticket.workspace_id,
                module="tickets",
                trigger_type="ticket.status_changed",
                entity_id=ticket.id,
                trigger_data={
                    "ticket_id": ticket.id,
                    "ticket_number": ticket.ticket_number,
                    "old_status": old_status,
                    "new_status": new_status,
                    "submitter_email": ticket.submitter_email,
                    "assignee_id": ticket.assignee_id,
                    "workspace_id": ticket.workspace_id,
                },
            )

            # Dispatch ticket.reopened when a resolved/closed ticket goes back to open state
            closed_statuses = {TicketStatus.RESOLVED.value, TicketStatus.CLOSED.value}
            open_statuses = {TicketStatus.NEW.value, TicketStatus.ACKNOWLEDGED.value, TicketStatus.IN_PROGRESS.value}
            if old_status in closed_statuses and new_status in open_statuses:
                await dispatch_automation_event(
                    db=self.db,
                    workspace_id=ticket.workspace_id,
                    module="tickets",
                    trigger_type="ticket.reopened",
                    entity_id=ticket.id,
                    trigger_data={
                        "ticket_id": ticket.id,
                        "ticket_number": ticket.ticket_number,
                        "old_status": old_status,
                        "new_status": new_status,
                        "reopened_by_id": updated_by_id,
                        "submitter_email": ticket.submitter_email,
                        "assignee_id": ticket.assignee_id,
                        "workspace_id": ticket.workspace_id,
                    },
                )
        else:
            # Dispatch ticket.updated for other changes
            await dispatch_automation_event(
                db=self.db,
                workspace_id=ticket.workspace_id,
                module="tickets",
                trigger_type="ticket.updated",
                entity_id=ticket.id,
                trigger_data={
                    "ticket_id": ticket.id,
                    "ticket_number": ticket.ticket_number,
                    "status": ticket.status,
                    "priority": ticket.priority,
                    "submitter_email": ticket.submitter_email,
                    "updated_fields": list(data.keys()),
                    "workspace_id": ticket.workspace_id,
                },
            )

        # Dispatch ticket.priority_changed
        if "priority" in data and data["priority"] != old_priority:
            await dispatch_automation_event(
                db=self.db,
                workspace_id=ticket.workspace_id,
                module="tickets",
                trigger_type="ticket.priority_changed",
                entity_id=ticket.id,
                trigger_data={
                    "ticket_id": ticket.id,
                    "ticket_number": ticket.ticket_number,
                    "old_priority": old_priority,
                    "new_priority": data["priority"],
                    "submitter_email": ticket.submitter_email,
                    "workspace_id": ticket.workspace_id,
                },
            )

        # Log entity activity
        changes = {}
        if "status" in data and data["status"] != old_status:
            changes["status"] = {"old": old_status, "new": data["status"]}
        if "priority" in data and data["priority"] != old_priority:
            changes["priority"] = {"old": old_priority, "new": data["priority"]}
        for field, value in data.items():
            if field not in ("status", "priority"):
                changes[field] = {"new": str(value) if value is not None else None}

        if changes:
            activity_type = "status_changed" if "status" in changes else "updated"
            if "status" in changes and data.get("status") == TicketStatus.RESOLVED.value:
                activity_type = "resolved"
            title = (
                f"Changed status from {old_status} to {data['status']}"
                if "status" in changes
                else f"Updated ticket #{ticket.ticket_number}"
            )
            await log_activity(
                self.db,
                workspace_id=ticket.workspace_id,
                entity_type="ticket",
                entity_id=str(ticket.id),
                activity_type=activity_type,
                actor_id=updated_by_id,
                title=title,
                changes=changes,
            )

        return await self.get_ticket(ticket_id)

    async def resolve_for_completed_task(
        self,
        task_id: str,
        task_title: str,
        actor_id: str | None = None,
    ) -> Ticket | None:
        """Resolve the ticket a task was created from, now that the task is done.

        `linked_task_id` has been written by the convert-to-task flow since it
        existed and was read by nothing, so finishing the work left the ticket
        open. The requester chased a ticket whose engineering was done days ago,
        and the desk's open count was wrong.

        **Resolved, not Closed.** The ticket is a conversation with somebody
        outside the workspace and the developer who dragged the card has not
        spoken to them. Closing it here would end that conversation on a
        developer's board action; Resolved says the work is done and leaves the
        confirmation to a person.

        Idempotent: a task can reach done more than once (dragged back and
        forth, reopened, bulk-updated), and each pass must not re-resolve, re-log
        or re-notify.
        """
        result = await self.db.execute(
            select(Ticket).where(Ticket.linked_task_id == task_id)
        )
        ticket = result.scalar_one_or_none()
        if ticket is None:
            return None

        already_done = {TicketStatus.RESOLVED.value, TicketStatus.CLOSED.value}
        if ticket.status in already_done:
            return ticket

        # Goes through `update_ticket` rather than setting the column, so the
        # status-change response row, `resolved_at`, the automation events and
        # the entity-activity entry all happen exactly as they do when a human
        # resolves it. Reimplementing those here is how the two paths drift.
        updated = await self.update_ticket(
            ticket_id=str(ticket.id),
            update_data=TicketUpdate(status=TicketStatus.RESOLVED.value),
            updated_by_id=actor_id,
        )
        if updated is None:
            return None

        self.db.add(
            TicketResponseModel(
                id=str(uuid4()),
                ticket_id=str(updated.id),
                author_id=actor_id,
                is_internal=True,
                content=(
                    f'Resolved automatically: the linked task "{task_title}" was completed. '
                    "Confirm with the requester before closing."
                ),
            )
        )
        await self.db.flush()

        # And park it in the terminal bucket. Without this the ticket read as
        # Resolved while still sitting in the queue of whoever the work was
        # pending with, so it stayed on their board and the breach clock kept
        # running against them after the work was finished.
        #
        # Best-effort: a ticket that is resolved but still in an open bucket is a
        # visible, fixable state; refusing to resolve because the ledger write
        # failed is not.
        try:
            from aexy.services.service_desk_ticket_service import (
                ServiceDeskTicketService,
            )

            await ServiceDeskTicketService(self.db).stop_clock_for_resolution(
                str(updated.workspace_id),
                str(updated.id),
                reason=f'the linked task "{task_title}" was completed',
                actor_id=actor_id,
            )
        except Exception:
            logger.exception(
                "Ticket %s resolved but its pending-with clock was not stopped",
                updated.id,
            )

        await self._notify_ticket_resolved(updated, task_id=task_id, task_title=task_title)
        return updated

    async def _notify_ticket_resolved(
        self, ticket: Ticket, *, task_id: str, task_title: str
    ) -> None:
        """Tell the ticket's owner, and the requester if we can reach them.

        Two different audiences and two different channels. The owner is a
        workspace member, so this goes through the notification system and
        honours their preferences. The requester is usually external and has no
        account, so the only way to reach them is the address they wrote in.

        Never raises: the ticket is already resolved by the time this runs, and
        an SMTP failure must not roll that back.
        """
        reference = f"TKT-{ticket.ticket_number}"
        title = ticket.title or (ticket.field_values or {}).get("subject") or reference

        try:
            if ticket.assignee_id:
                from aexy.services.notification_service import notify_ticket_resolved

                await notify_ticket_resolved(
                    self.db,
                    recipient_id=str(ticket.assignee_id),
                    ticket_reference=reference,
                    ticket_title=str(title),
                    task_title=task_title,
                    action_url=f"/tickets/{ticket.id}",
                    workspace_id=str(ticket.workspace_id),
                )
        except Exception:
            logger.exception(
                "Ticket %s resolved but notifying its owner failed", ticket.id
            )

        if not ticket.submitter_email:
            return
        try:
            from aexy.services.email_service import EmailService

            email = EmailService()
            if not email.is_configured:
                return
            await email.send_templated_email(
                db=self.db,
                recipient_email=ticket.submitter_email,
                subject=f"[{reference}] Resolved: {title}",
                # Deliberately says nothing about the internal task — the
                # requester has no view of the board and the task title is
                # internal wording.
                body_text=(
                    f"Hello,\n\n{reference} has been resolved.\n\n"
                    "If this is not sorted from your side, reply to this message and "
                    "the ticket will reopen.\n"
                ),
                # Marks the message as machine-composed. Without it a watched
                # Service Desk mailbox turns our own outbound copy into a new
                # ticket, so resolving one ticket opens another.
                auto_generated=True,
            )
        except Exception:
            logger.exception(
                "Ticket %s resolved but emailing the requester failed", ticket.id
            )

    async def assign_ticket(
        self,
        ticket_id: str,
        assignee_id: str | None = None,
        team_id: str | None = None,
        assigned_by_id: str | None = None,
    ) -> Ticket | None:
        """Assign a ticket to a developer or team.

        Args:
            ticket_id: Ticket ID.
            assignee_id: Developer ID to assign.
            team_id: Team ID to assign.
            assigned_by_id: Developer ID making the assignment.

        Returns:
            Updated Ticket.
        """
        ticket = await self.get_ticket(ticket_id)
        if not ticket:
            return None

        old_assignee = ticket.assignee_id
        from aexy.services.service_desk_ticket_service import (
            reassign_service_desk_ticket_family,
        )

        family = await reassign_service_desk_ticket_family(
            self.db,
            str(ticket.workspace_id),
            str(ticket.id),
            assignee_id,
        )
        ticket = next(member for member in family if str(member.id) == ticket_id)
        ticket.team_id = team_id

        # Create assignment response
        if assigned_by_id and assignee_id != old_assignee:
            content = (
                f"Assigned to developer {assignee_id}"
                if assignee_id
                else "Unassigned"
            )
            response = TicketResponseModel(
                id=str(uuid4()),
                ticket_id=ticket_id,
                author_id=assigned_by_id,
                is_internal=True,
                content=content,
            )
            self.db.add(response)

        await self.db.flush()
        await self.db.refresh(ticket)

        # Dispatch ticket.assigned event if assignee changed
        if assignee_id != old_assignee:
            await dispatch_automation_event(
                db=self.db,
                workspace_id=ticket.workspace_id,
                module="tickets",
                trigger_type="ticket.assigned",
                entity_id=ticket.id,
                trigger_data={
                    "ticket_id": ticket.id,
                    "ticket_number": ticket.ticket_number,
                    "assignee_id": assignee_id,
                    "old_assignee_id": old_assignee,
                    "team_id": team_id,
                    "assigned_by_id": assigned_by_id,
                    "submitter_email": ticket.submitter_email,
                    "status": ticket.status,
                    "workspace_id": ticket.workspace_id,
                },
            )
            await log_activity(
                self.db,
                workspace_id=ticket.workspace_id,
                entity_type="ticket",
                entity_id=str(ticket.id),
                activity_type="assigned",
                actor_id=assigned_by_id,
                title=f"Assigned ticket #{ticket.ticket_number}",
                changes={"assignee_id": {"old": old_assignee, "new": assignee_id}},
            )
            if assignee_id:
                await self._notify_assignee(ticket, assignee_id, assigned_by_id)

        return await self.get_ticket(ticket_id)

    async def _notify_assignee(
        self,
        ticket: Ticket,
        assignee_id: str,
        assigned_by_id: str | None,
    ) -> None:
        """Tell whoever now owns this ticket.

        This one method assigns both queues — a form ticket from the internal
        request list and a Service Desk ticket carrying an external SLA clock go
        through here — so it picks the event, the reference format and the deep
        link by which kind of ticket it actually is. Sending a desk owner to
        `/tickets/{id}` would land them on a page that cannot show pending-with
        or the clock.
        """
        from aexy.models.service_desk import ServiceDeskTicket
        from aexy.services.notification_service import (
            notify_desk_ticket_assigned,
            notify_ticket_assigned,
        )

        sd = (
            await self.db.execute(
                select(ServiceDeskTicket).where(
                    ServiceDeskTicket.ticket_id == str(ticket.id)
                )
            )
        ).scalar_one_or_none()

        actor_name = "Someone"
        if assigned_by_id:
            actor = (
                await self.db.execute(
                    select(Developer).where(Developer.id == assigned_by_id)
                )
            ).scalar_one_or_none()
            if actor:
                actor_name = actor.name or actor.github_username or "Someone"

        if sd is not None:
            from aexy.services.service_desk_config import ticket_prefix_display

            reference = await ticket_prefix_display(
                self.db, str(ticket.workspace_id), ticket.ticket_number
            )
            await notify_desk_ticket_assigned(
                db=self.db,
                recipient_id=str(assignee_id),
                actor_id=assigned_by_id,
                actor_name=actor_name,
                ticket_reference=reference,
                ticket_title=sd.request_type or "Service desk request",
                action_url=f"/service-desk/tickets/{ticket.id}",
                workspace_id=str(ticket.workspace_id),
            )
            return

        await notify_ticket_assigned(
            db=self.db,
            recipient_id=str(assignee_id),
            actor_id=assigned_by_id,
            actor_name=actor_name,
            ticket_reference=f"#{ticket.ticket_number}",
            ticket_title=ticket.submitter_name or ticket.submitter_email or "Request",
            action_url=f"/tickets/{ticket.id}",
            workspace_id=str(ticket.workspace_id),
        )

    async def delete_ticket(self, ticket_id: str) -> bool:
        """Delete a ticket."""
        ticket = await self.get_ticket(ticket_id)
        if not ticket:
            return False

        # Log before hard delete since entity won't exist after
        await log_activity(
            self.db,
            workspace_id=str(ticket.workspace_id),
            entity_type="ticket",
            entity_id=str(ticket.id),
            activity_type="deleted",
            title=f"Deleted ticket #{ticket.ticket_number}",
        )

        # Progress updates hang off (entity_type, entity_id) with no FK to
        # cascade from, so they would survive this hard delete and then attach
        # themselves to whatever next holds this id.
        from aexy.services.work_update_service import WorkUpdateService

        await WorkUpdateService(self.db).delete_for_entity(
            str(ticket.workspace_id), "ticket", str(ticket.id)
        )

        await self.db.delete(ticket)
        await self.db.flush()
        return True

    # ==================== Responses/Comments ====================

    async def add_response(
        self,
        ticket_id: str,
        author_id: str | None,
        comment_data: TicketCommentCreate,
        author_email: str | None = None,
    ) -> TicketResponseModel:
        """Add a response to a ticket.

        Args:
            ticket_id: Ticket ID.
            author_id: Developer ID (null for submitter replies).
            comment_data: Comment data.
            author_email: Email for submitter replies.

        Returns:
            Created TicketResponse.
        """
        ticket = await self.get_ticket(ticket_id)
        if not ticket:
            raise ValueError("Ticket not found")

        old_status = ticket.status

        response = TicketResponseModel(
            id=str(uuid4()),
            ticket_id=ticket_id,
            author_id=author_id,
            author_email=author_email,
            is_internal=comment_data.is_internal,
            content=comment_data.content,
            attachments=[a.model_dump() for a in comment_data.attachments] if comment_data.attachments else [],
        )

        # Handle status change
        if comment_data.new_status and comment_data.new_status != old_status:
            response.old_status = old_status
            response.new_status = comment_data.new_status
            ticket.status = comment_data.new_status

            # Track timestamps
            if comment_data.new_status == TicketStatus.RESOLVED.value:
                ticket.resolved_at = datetime.now(timezone.utc)
            elif comment_data.new_status == TicketStatus.CLOSED.value:
                ticket.closed_at = datetime.now(timezone.utc)

        # Track first response
        if author_id and not ticket.first_response_at and not comment_data.is_internal:
            ticket.first_response_at = datetime.now(timezone.utc)

        self.db.add(response)
        await self.db.flush()
        await self.db.refresh(response)

        # Log entity activity for the comment (skip internal notes to avoid leaking their existence)
        if not comment_data.is_internal:
            comment_activity_type = "comment"
            if comment_data.new_status and comment_data.new_status != old_status:
                comment_activity_type = "status_changed"
            await log_activity(
                self.db,
                workspace_id=ticket.workspace_id,
                entity_type="ticket",
                entity_id=str(ticket.id),
                activity_type=comment_activity_type,
                actor_id=author_id,
                title=f"{'Changed status' if comment_activity_type == 'status_changed' else 'Added response'} on ticket #{ticket.ticket_number}",
                content=comment_data.content,
                changes={"status": {"old": old_status, "new": comment_data.new_status}} if comment_data.new_status and comment_data.new_status != old_status else None,
            )

        # Send mention notifications
        if author_id and comment_data.content:
            mentioned_ids = extract_mentioned_user_ids(comment_data.content)
            if mentioned_ids:
                # Look up author name
                from aexy.models.developer import Developer
                author_result = await self.db.execute(
                    select(Developer).where(Developer.id == author_id)
                )
                author = author_result.scalar_one_or_none()
                author_name = author.name or "Someone" if author else "Someone"
                snippet = _get_text_snippet(comment_data.content)

                for uid in mentioned_ids:
                    if uid != author_id:
                        await notify_mention(
                            db=self.db,
                            mentioned_user_id=uid,
                            mentioner_name=author_name,
                            entity_type="ticket comment",
                            entity_id=ticket_id,
                            action_url=f"/tickets/{ticket_id}",
                            snippet=snippet,
                        )

        # Dispatch response automation events (skip internal notes)
        if not comment_data.is_internal:
            if author_id:
                # Team member replied -> response.sent
                await dispatch_automation_event(
                    db=self.db,
                    workspace_id=ticket.workspace_id,
                    module="tickets",
                    trigger_type="response.sent",
                    entity_id=response.id,
                    trigger_data={
                        "ticket_id": ticket_id,
                        "ticket_number": ticket.ticket_number,
                        "response_id": response.id,
                        "author_id": author_id,
                        "submitter_email": ticket.submitter_email,
                        "workspace_id": ticket.workspace_id,
                    },
                )
            else:
                # Submitter replied -> response.received
                await dispatch_automation_event(
                    db=self.db,
                    workspace_id=ticket.workspace_id,
                    module="tickets",
                    trigger_type="response.received",
                    entity_id=response.id,
                    trigger_data={
                        "ticket_id": ticket_id,
                        "ticket_number": ticket.ticket_number,
                        "response_id": response.id,
                        "author_email": author_email,
                        "submitter_email": ticket.submitter_email,
                        "workspace_id": ticket.workspace_id,
                    },
                )

        return response

    async def list_responses(
        self,
        ticket_id: str,
        include_internal: bool = True,
    ) -> list[TicketResponseModel]:
        """List responses for a ticket.

        Args:
            ticket_id: Ticket ID.
            include_internal: Whether to include internal notes.

        Returns:
            List of TicketResponses.
        """
        stmt = (
            select(TicketResponseModel)
            .where(TicketResponseModel.ticket_id == ticket_id)
            .options(selectinload(TicketResponseModel.author))
            .order_by(TicketResponseModel.created_at)
        )

        if not include_internal:
            stmt = stmt.where(TicketResponseModel.is_internal == False)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ==================== Share Links ====================

    async def get_share_link(self, ticket_id: str) -> TicketShareLink | None:
        """Get the (single) share link for a ticket, if any."""
        stmt = (
            select(TicketShareLink)
            .where(TicketShareLink.ticket_id == ticket_id)
            .order_by(TicketShareLink.created_at.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_or_enable_share_link(
        self,
        ticket: Ticket,
        created_by_id: str | None = None,
        expires_at: datetime | None = None,
        password: str | None = None,
        max_uses: int | None = None,
    ) -> TicketShareLink:
        """Create a share link for a ticket, or re-enable/update the existing one."""
        link = await self.get_share_link(ticket.id)
        if link is None:
            link = TicketShareLink(
                id=str(uuid4()),
                ticket_id=ticket.id,
                workspace_id=ticket.workspace_id,
                token=secrets.token_urlsafe(16),
                created_by_id=created_by_id,
            )
            self.db.add(link)

        link.is_active = True
        link.expires_at = expires_at
        link.max_uses = max_uses
        if password:
            link.password_hash = bcrypt.hashpw(
                password.encode(), bcrypt.gensalt()
            ).decode()

        await self.db.flush()
        await self.db.refresh(link)
        return link

    async def update_share_link(
        self,
        ticket_id: str,
        *,
        is_active: bool | None = None,
        expires_at: datetime | None = None,
        password: str | None = None,
        max_uses: int | None = None,
        regenerate: bool = False,
    ) -> TicketShareLink | None:
        """Update an existing share link. Returns None if none exists."""
        link = await self.get_share_link(ticket_id)
        if link is None:
            return None

        if is_active is not None:
            link.is_active = is_active
        if expires_at is not None:
            link.expires_at = expires_at
        if max_uses is not None:
            link.max_uses = max_uses
        if password is not None:
            # Empty string clears the password; any other value sets it.
            link.password_hash = (
                bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
                if password
                else None
            )
        if regenerate:
            link.token = secrets.token_urlsafe(16)
            link.use_count = 0

        await self.db.flush()
        await self.db.refresh(link)
        return link

    async def revoke_share_link(self, ticket_id: str) -> bool:
        """Delete the share link for a ticket. Returns True if one was removed."""
        link = await self.get_share_link(ticket_id)
        if link is None:
            return False
        await self.db.delete(link)
        await self.db.flush()
        return True

    async def get_shared_ticket(
        self,
        token: str,
        password: str | None = None,
        bump: bool = True,
    ) -> tuple[Ticket, TicketShareLink]:
        """Resolve a share token to its ticket, enforcing link restrictions.

        Raises ValueError with a machine-readable code:
        ``not_found`` | ``expired`` | ``exhausted`` |
        ``password_required`` | ``invalid_password``.
        Increments the use counter on successful access unless ``bump`` is
        False (e.g. secondary fetches like attachment downloads).
        """
        stmt = select(TicketShareLink).where(TicketShareLink.token == token)
        result = await self.db.execute(stmt)
        link = result.scalar_one_or_none()

        if link is None or not link.is_active:
            raise ValueError("not_found")

        if link.expires_at is not None:
            expires_at = link.expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at < datetime.now(timezone.utc):
                raise ValueError("expired")

        if link.max_uses is not None and link.use_count >= link.max_uses:
            raise ValueError("exhausted")

        if link.password_hash:
            if not password:
                raise ValueError("password_required")
            if not bcrypt.checkpw(password.encode(), link.password_hash.encode()):
                raise ValueError("invalid_password")

        ticket = await self.get_ticket(link.ticket_id)
        if ticket is None:
            raise ValueError("not_found")

        if bump:
            link.use_count += 1
            await self.db.flush()

        return ticket, link

    # ==================== Attachments ====================

    async def add_ticket_attachments(
        self,
        ticket: Ticket,
        files: list[tuple[str, str | None, object, int]],
    ) -> list[dict]:
        """Stream-upload files to storage and record them on the ticket.

        ``files`` is a list of (filename, content_type, fileobj, size). Each is
        streamed to storage (memory-safe for large files) and recorded with its
        private storage ``key`` (never a public URL). Returns the created
        metadata. Raises ValueError("storage_unconfigured") / ("upload_failed")
        / ("too_large").
        """
        storage = get_storage_service()
        if not storage.is_configured():
            raise ValueError("storage_unconfigured")

        max_bytes = settings.ticket_max_attachment_mb * 1024 * 1024

        attachments = list(ticket.attachments or [])
        created: list[dict] = []
        for filename, content_type, fileobj, size in files:
            if size is not None and size <= 0:
                continue
            if size is not None and size > max_bytes:
                raise ValueError("too_large")
            safe_name = _SAFE_FILENAME_RE.sub("_", filename or "attachment") or "attachment"
            key = f"{TICKET_ATTACHMENTS_PREFIX}/{ticket.id}/{uuid4().hex}_{safe_name}"
            ctype = content_type or "application/octet-stream"
            if not storage.upload_fileobj(key, fileobj, ctype):
                raise ValueError("upload_failed")
            meta = {
                "id": str(uuid4()),
                "filename": filename or "attachment",
                "size": size or 0,
                "type": ctype,
                "key": key,
            }
            attachments.append(meta)
            created.append(meta)

        # Reassign so SQLAlchemy detects the JSONB change.
        ticket.attachments = attachments
        await self.db.flush()
        return created

    def _iter_attachments(self, ticket: Ticket, include_internal: bool):
        """Yield attachment dicts from the ticket and its responses."""
        for a in ticket.attachments or []:
            yield a
        for response in ticket.responses:
            if response.is_internal and not include_internal:
                continue
            for a in response.attachments or []:
                yield a

    def find_ticket_attachment(
        self,
        ticket: Ticket,
        attachment_id: str,
        include_internal: bool = False,
    ) -> dict | None:
        """Locate an attachment by id on the ticket or its (public) responses."""
        for a in self._iter_attachments(ticket, include_internal):
            if a.get("id") == attachment_id:
                return a
        return None

    @staticmethod
    def attachment_key(meta: dict) -> str | None:
        """Resolve an attachment's storage key (supporting legacy url-only rows)."""
        if meta.get("key"):
            return meta["key"]
        url = meta.get("url")
        if url:
            return get_storage_service().key_from_url(url)
        return None

    async def remove_ticket_attachment(self, ticket: Ticket, attachment_id: str) -> bool:
        """Delete a ticket-level attachment from storage and the ticket."""
        attachments = list(ticket.attachments or [])
        match = next((a for a in attachments if a.get("id") == attachment_id), None)
        if match is None:
            return False

        key = self.attachment_key(match)
        if key:
            await get_storage_service().delete_object(key)

        ticket.attachments = [a for a in attachments if a.get("id") != attachment_id]
        await self.db.flush()
        return True

    # ==================== Email Verification ====================

    async def verify_email(self, token: str) -> Ticket | None:
        """Verify email for a ticket.

        Args:
            token: Verification token.

        Returns:
            Verified Ticket or None.
        """
        stmt = select(Ticket).where(Ticket.verification_token == token)
        result = await self.db.execute(stmt)
        ticket = result.scalar_one_or_none()

        if ticket:
            ticket.email_verified = True
            ticket.verification_token = None
            await self.db.flush()
            await self.db.refresh(ticket)

        return ticket

    # ==================== External Issue Tracking ====================

    async def add_external_issue(
        self,
        ticket_id: str,
        platform: str,
        issue_id: str,
        issue_url: str,
    ) -> Ticket | None:
        """Add an external issue link to a ticket.

        Args:
            ticket_id: Ticket ID.
            platform: Platform (github, jira, linear).
            issue_id: External issue ID.
            issue_url: External issue URL.

        Returns:
            Updated Ticket.
        """
        ticket = await self.get_ticket(ticket_id)
        if not ticket:
            return None

        external_issues = ticket.external_issues or []
        external_issues.append({
            "platform": platform,
            "issue_id": issue_id,
            "issue_url": issue_url,
            "synced_at": datetime.now(timezone.utc).isoformat(),
        })
        ticket.external_issues = external_issues

        await self.db.flush()
        await self.db.refresh(ticket)
        return ticket

    # ==================== SLA Tracking ====================

    async def check_sla_breaches(self, workspace_id: str) -> list[Ticket]:
        """Check for SLA breaches and update tickets.

        Args:
            workspace_id: Workspace ID.

        Returns:
            List of newly breached tickets.
        """
        now = datetime.now(timezone.utc)
        stmt = (
            select(Ticket)
            .where(
                and_(
                    Ticket.workspace_id == workspace_id,
                    Ticket.sla_due_at != None,
                    Ticket.sla_due_at < now,
                    Ticket.sla_breached == False,
                    Ticket.status.not_in([
                        TicketStatus.RESOLVED.value,
                        TicketStatus.CLOSED.value,
                    ]),
                )
            )
        )
        result = await self.db.execute(stmt)
        breached_tickets = list(result.scalars().all())

        for ticket in breached_tickets:
            ticket.sla_breached = True

        await self.db.flush()

        # Dispatch sla.breached for each breached ticket
        for ticket in breached_tickets:
            await dispatch_automation_event(
                db=self.db,
                workspace_id=workspace_id,
                module="tickets",
                trigger_type="sla.breached",
                entity_id=ticket.id,
                trigger_data={
                    "ticket_id": ticket.id,
                    "ticket_number": ticket.ticket_number,
                    "sla_due_at": ticket.sla_due_at.isoformat() if ticket.sla_due_at else None,
                    "status": ticket.status,
                    "priority": ticket.priority,
                    "submitter_email": ticket.submitter_email,
                    "assignee_id": ticket.assignee_id,
                    "workspace_id": workspace_id,
                },
            )

        return breached_tickets

    # ==================== Statistics ====================

    async def get_stats(self, workspace_id: str) -> dict:
        """Get ticket statistics for a workspace.

        Args:
            workspace_id: Workspace ID.

        Returns:
            Dictionary of statistics.
        """
        # Exclude Service Desk tickets (their own module) from generic stats.
        not_sd = or_(Ticket.source.is_(None), Ticket.source.notlike("service_desk%"))

        # Total tickets
        total_stmt = (
            select(func.count())
            .select_from(Ticket)
            .where(Ticket.workspace_id == workspace_id, not_sd)
        )
        total_result = await self.db.execute(total_stmt)
        total = total_result.scalar() or 0

        # By status
        status_stmt = (
            select(Ticket.status, func.count())
            .where(Ticket.workspace_id == workspace_id, not_sd)
            .group_by(Ticket.status)
        )
        status_result = await self.db.execute(status_stmt)
        by_status = dict(status_result.all())

        # Open tickets (not resolved/closed)
        open_count = sum(
            count
            for status, count in by_status.items()
            if status not in [TicketStatus.RESOLVED.value, TicketStatus.CLOSED.value]
        )

        # SLA breached
        breached_stmt = (
            select(func.count())
            .select_from(Ticket)
            .where(
                and_(
                    Ticket.workspace_id == workspace_id,
                    Ticket.sla_breached == True,
                    not_sd,
                )
            )
        )
        breached_result = await self.db.execute(breached_stmt)
        breached = breached_result.scalar() or 0

        return {
            "total_tickets": total,
            "open_tickets": open_count,
            "by_status": by_status,
            "sla_breached": breached,
        }

    # ==================== Escalation Matrix ====================

    async def create_escalation_matrix(
        self,
        workspace_id: str,
        data: EscalationMatrixCreate,
    ) -> EscalationMatrix:
        """Create an escalation matrix.

        Args:
            workspace_id: Workspace ID.
            data: Escalation matrix data.

        Returns:
            Created EscalationMatrix.
        """
        matrix = EscalationMatrix(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=data.name,
            description=data.description,
            severity_levels=data.severity_levels,
            rules=[rule.model_dump() for rule in data.rules],
            form_ids=data.form_ids,
            team_ids=data.team_ids,
            priority_order=data.priority_order or 0,
            is_active=True,
        )
        self.db.add(matrix)
        await self.db.flush()
        await self.db.refresh(matrix)
        return matrix

    async def get_escalation_matrix(self, matrix_id: str) -> EscalationMatrix | None:
        """Get an escalation matrix by ID."""
        stmt = select(EscalationMatrix).where(EscalationMatrix.id == matrix_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_escalation_matrices(
        self,
        workspace_id: str,
        active_only: bool = True,
    ) -> list[EscalationMatrix]:
        """List escalation matrices for a workspace.

        Args:
            workspace_id: Workspace ID.
            active_only: Only return active matrices.

        Returns:
            List of EscalationMatrices.
        """
        stmt = (
            select(EscalationMatrix)
            .where(EscalationMatrix.workspace_id == workspace_id)
            .order_by(EscalationMatrix.priority_order)
        )
        if active_only:
            stmt = stmt.where(EscalationMatrix.is_active == True)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_escalation_matrix(
        self,
        matrix_id: str,
        data: EscalationMatrixUpdate,
    ) -> EscalationMatrix | None:
        """Update an escalation matrix.

        Args:
            matrix_id: Matrix ID.
            data: Update data.

        Returns:
            Updated EscalationMatrix.
        """
        matrix = await self.get_escalation_matrix(matrix_id)
        if not matrix:
            return None

        update_data = data.model_dump(exclude_unset=True)

        # Handle rules specially since they need to be converted
        if "rules" in update_data:
            update_data["rules"] = [
                rule.model_dump() if hasattr(rule, "model_dump") else rule
                for rule in update_data["rules"]
            ]

        for field, value in update_data.items():
            setattr(matrix, field, value)

        await self.db.flush()
        await self.db.refresh(matrix)
        return matrix

    async def delete_escalation_matrix(self, matrix_id: str) -> bool:
        """Delete an escalation matrix."""
        matrix = await self.get_escalation_matrix(matrix_id)
        if not matrix:
            return False

        await self.db.delete(matrix)
        await self.db.flush()
        return True

    async def trigger_escalation(
        self,
        ticket: Ticket,
        level: str,
    ) -> TicketEscalation | None:
        """Trigger an escalation for a ticket.

        Args:
            ticket: The ticket to escalate.
            level: Escalation level (level_1, level_2, etc).

        Returns:
            Created TicketEscalation or None.
        """
        # Find matching escalation matrix
        matrices = await self.list_escalation_matrices(ticket.workspace_id)

        for matrix in matrices:
            # Check severity match
            if ticket.severity and ticket.severity not in matrix.severity_levels:
                continue

            # Check form match
            if matrix.form_ids and ticket.form_id not in matrix.form_ids:
                continue

            # Check team match
            if matrix.team_ids and ticket.team_id not in matrix.team_ids:
                continue

            # Find matching rule for level
            for rule in matrix.rules:
                if rule.get("level") == level:
                    escalation = TicketEscalation(
                        id=str(uuid4()),
                        ticket_id=ticket.id,
                        escalation_matrix_id=matrix.id,
                        level=level,
                        triggered_at=datetime.now(timezone.utc),
                        notified_users=rule.get("notify_users", []),
                        notified_channels=rule.get("channels", []),
                    )
                    self.db.add(escalation)
                    await self.db.flush()
                    await self.db.refresh(escalation)

                    # Dispatch ticket.escalated
                    await dispatch_automation_event(
                        db=self.db,
                        workspace_id=ticket.workspace_id,
                        module="tickets",
                        trigger_type="ticket.escalated",
                        entity_id=escalation.id,
                        trigger_data={
                            "ticket_id": ticket.id,
                            "ticket_number": ticket.ticket_number,
                            "escalation_id": escalation.id,
                            "escalation_level": level,
                            "notified_users": escalation.notified_users,
                            "workspace_id": ticket.workspace_id,
                        },
                    )
                    await log_activity(
                        self.db,
                        workspace_id=ticket.workspace_id,
                        entity_type="ticket",
                        entity_id=str(ticket.id),
                        activity_type="escalated",
                        title=f"Escalated ticket #{ticket.ticket_number} to {level}",
                        metadata={"escalation_level": level},
                    )
                    return escalation

        return None

    async def list_ticket_escalations(
        self,
        ticket_id: str,
    ) -> list[TicketEscalation]:
        """List escalations for a ticket.

        Args:
            ticket_id: Ticket ID.

        Returns:
            List of TicketEscalations.
        """
        stmt = (
            select(TicketEscalation)
            .where(TicketEscalation.ticket_id == ticket_id)
            .order_by(TicketEscalation.triggered_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def acknowledge_escalation(
        self,
        escalation_id: str,
        acknowledged_by_id: str,
    ) -> TicketEscalation | None:
        """Acknowledge an escalation.

        Args:
            escalation_id: Escalation ID.
            acknowledged_by_id: Developer ID acknowledging.

        Returns:
            Updated TicketEscalation.
        """
        stmt = select(TicketEscalation).where(TicketEscalation.id == escalation_id)
        result = await self.db.execute(stmt)
        escalation = result.scalar_one_or_none()

        if not escalation:
            return None

        escalation.acknowledged_at = datetime.now(timezone.utc)
        escalation.acknowledged_by_id = acknowledged_by_id

        await self.db.flush()
        await self.db.refresh(escalation)
        return escalation
