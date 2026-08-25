"""Service Desk ticket lifecycle — Pending-With transitions + TAT.

Every ``pending_with`` change closes the open ledger segment (recording its
duration) and opens a new one, so stakeholder-wise TAT is computable from the
ledger. Closing sets the ticket closed + fires the closure email.

"""

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from aexy.models.developer import Developer
from aexy.models.google_integration import GoogleIntegration
from aexy.models.service_desk import (
    ServiceDeskAccount,
    ServiceDeskProduct,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket, TicketResponse, TicketStatus
from aexy.schemas.service_desk import (
    DetectedIssue,
    SegmentResponse,
    ServiceDeskCorrespondence,
    ServiceDeskTicketDetail,
    TicketAttachment,
    TicketCommunityTopic,
    TicketEmailRecipient,
    TicketFieldsUpdate,
    TicketReplyAll,
    TicketTAT,
)

logger = logging.getLogger(__name__)

_DAY = 86400.0

# How a routing note written at intake begins. Only needed to read the notes of
# tickets created before the note was also kept on the ticket itself — see
# ``_assignment_note``. New tickets never take this path.
_ROUTING_NOTE_PREFIXES = ("Assigned by fallback", "Attributed to")


def _aware(dt: datetime) -> datetime:
    """Treat naive datetimes (SQLite) as UTC so arithmetic is safe."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _split_done_indexes(field_values: dict, issue_count: int) -> list[int]:
    """Return one-based candidate indexes already represented by child tickets."""
    raw = field_values.get("split_done_indexes")
    raw_indexes = raw if isinstance(raw, list) else []
    done = {
        value
        for value in raw_indexes
        if isinstance(value, int) and not isinstance(value, bool) and 2 <= value <= issue_count
    }
    # A1 predates split_done_indexes and can only auto-create candidate two.
    if not done and field_values.get("split_children") and issue_count >= 2:
        done.add(2)
    return sorted(done)


from aexy.models.organization import Department  # noqa: E402
from aexy.services.desk_board_routing import (  # noqa: E402
    explain,
    resolve_board_routing,
)
from aexy.services.org_functions import function_key_spellings  # noqa: E402
from aexy.services.service_desk_clock import load_clock  # noqa: E402
from aexy.services.service_desk_config import (  # noqa: E402
    display_id as render_display_id,
    force_ticket_id_into_subject,
    ticket_prefix,
    ticket_prefix_display,
)
from aexy.services.service_desk_taxonomy import external_slug_for, load_taxonomy  # noqa: E402


async def reassign_service_desk_ticket_family(
    db: AsyncSession,
    workspace_id: str,
    ticket_id: str,
    assignee_id: str | None,
) -> list[Ticket]:
    """Assign one Service Desk split family under deterministic row locks.

    Non-Service-Desk tickets remain single-row assignments. For a split child,
    the canonical parent link selects the same family as assigning the primary.
    JSON metadata is deliberately ignored because it is not constrained.
    """
    sd = (
        await db.execute(
            select(ServiceDeskTicket).where(
                ServiceDeskTicket.ticket_id == ticket_id,
                ServiceDeskTicket.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()

    if sd is None:
        ticket = (
            await db.execute(
                select(Ticket)
                .where(Ticket.id == ticket_id, Ticket.workspace_id == workspace_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if ticket is None:
            raise HTTPException(status_code=404, detail="Ticket not found")
        ticket.assignee_id = assignee_id
        return [ticket]

    root_id = sd.split_parent_ticket_id or ticket_id
    family = list(
        (
            await db.execute(
                select(Ticket)
                .join(ServiceDeskTicket, ServiceDeskTicket.ticket_id == Ticket.id)
                .where(
                    Ticket.workspace_id == workspace_id,
                    ServiceDeskTicket.workspace_id == workspace_id,
                    or_(
                        ServiceDeskTicket.ticket_id == root_id,
                        ServiceDeskTicket.split_parent_ticket_id == root_id,
                    ),
                )
                .order_by(Ticket.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars().all()
    )
    family_ids = {str(ticket.id) for ticket in family}
    if root_id not in family_ids or ticket_id not in family_ids:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Split ticket relationship is inconsistent; assignment was not changed",
        )

    for member in family:
        member.assignee_id = assignee_id
    return family


def reassign_service_desk_ticket_family_sync(
    db: Session,
    workspace_id: str,
    ticket_id: str,
    assignee_id: str | None,
) -> list[Ticket]:
    """Synchronous counterpart for the legacy workflow action executor."""
    sd = db.execute(
        select(ServiceDeskTicket).where(
            ServiceDeskTicket.ticket_id == ticket_id,
            ServiceDeskTicket.workspace_id == workspace_id,
        )
    ).scalar_one_or_none()

    if sd is None:
        ticket = db.execute(
            select(Ticket)
            .where(Ticket.id == ticket_id, Ticket.workspace_id == workspace_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        ).scalar_one_or_none()
        if ticket is None:
            raise ValueError("Ticket not found")
        ticket.assignee_id = assignee_id
        return [ticket]

    root_id = sd.split_parent_ticket_id or ticket_id
    family = list(
        db.execute(
            select(Ticket)
            .join(ServiceDeskTicket, ServiceDeskTicket.ticket_id == Ticket.id)
            .where(
                Ticket.workspace_id == workspace_id,
                ServiceDeskTicket.workspace_id == workspace_id,
                or_(
                    ServiceDeskTicket.ticket_id == root_id,
                    ServiceDeskTicket.split_parent_ticket_id == root_id,
                ),
            )
            .order_by(Ticket.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        ).scalars().all()
    )
    family_ids = {str(ticket.id) for ticket in family}
    if root_id not in family_ids or ticket_id not in family_ids:
        raise ValueError("Split ticket relationship is inconsistent; assignment was not changed")

    for member in family:
        member.assignee_id = assignee_id
    return family


class ServiceDeskTicketService:
    """Pending-With transitions and TAT.

    Outbound mail is queued, not sent inline: ``flush_notifications()`` sends it
    and callers invoke that *after* committing. Telling a requester their ticket
    is resolved and then rolling the closure back is the same mistake the intake
    service documents avoiding — the API layer's ``get_db`` commits after the
    handler returns, so anything sent inside a handler is sent before the outcome
    is durable.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self._pending_notifications: list[dict] = []
        self._pending_alerts: list[dict] = []

    def _queue_alert(self, kind: str, **payload: object) -> None:
        """Queue an in-app/email notification for after the commit.

        Deferred for the same reason the closure mail is: this class mutates a
        ticket and the API layer's ``get_db`` commits only once the handler
        returns, so anything sent inline is sent before the outcome is durable.
        A notification is worse than the closure mail here, not better —
        "this ticket is yours now" that then rolls back sends somebody to a
        ticket they do not own.
        """
        self._pending_alerts.append({"kind": kind, **payload})

    async def flush_notifications(self) -> None:
        """Send queued closure mail and alerts. Call AFTER committing; never raises."""
        pending, self._pending_notifications = self._pending_notifications, []
        alerts, self._pending_alerts = self._pending_alerts, []

        from aexy.models.service_desk import ServiceDeskMailbox
        from aexy.services.service_desk_mailer import send_service_desk_email

        for item in pending:
            try:
                mailbox = (
                    await self.db.get(ServiceDeskMailbox, item["mailbox_id"])
                    if item["mailbox_id"]
                    else None
                )
                await send_service_desk_email(
                    self.db,
                    mailbox,
                    item["to"],
                    item["subject"],
                    item["body"],
                    thread_id=item["thread_id"],
                )
            except Exception as exc:  # noqa: BLE001 — closure mail is best-effort
                logger.warning("Service desk: closure mail to %s skipped (%s)", item["to"], exc)

        for alert in alerts:
            try:
                await self._send_alert(alert)
            except Exception as exc:  # noqa: BLE001 — best-effort, same as above
                logger.warning("Service desk: alert %s skipped (%s)", alert.get("kind"), exc)

    async def _send_alert(self, alert: dict) -> None:
        """Deliver one queued alert."""
        from aexy.services.notification_service import (
            notify_desk_ticket_assigned,
            notify_desk_ticket_pending_with,
        )

        if alert["kind"] == "assigned":
            await notify_desk_ticket_assigned(
                db=self.db,
                recipient_id=alert["recipient_id"],
                actor_id=alert["actor_id"],
                actor_name=alert["actor_name"],
                ticket_reference=alert["reference"],
                ticket_title=alert["title"],
                action_url=alert["action_url"],
                workspace_id=alert["workspace_id"],
            )
        elif alert["kind"] == "pending_with":
            await notify_desk_ticket_pending_with(
                db=self.db,
                recipient_ids=alert["recipient_ids"],
                actor_id=alert["actor_id"],
                pending_with=alert["pending_with"],
                ticket_reference=alert["reference"],
                ticket_title=alert["title"],
                action_url=alert["action_url"],
                workspace_id=alert["workspace_id"],
            )

    async def _alert_identity(
        self, workspace_id: str, ticket: Ticket, sd: ServiceDeskTicket, actor_id: str | None
    ) -> dict:
        """The reference, title, link and actor name every desk alert needs."""
        from aexy.models.developer import Developer

        reference = await ticket_prefix_display(
            self.db, workspace_id, ticket.ticket_number
        )
        actor_name = "Someone"
        if actor_id:
            actor = (
                await self.db.execute(select(Developer).where(Developer.id == actor_id))
            ).scalar_one_or_none()
            if actor:
                actor_name = actor.name or actor.github_username or "Someone"
        return {
            "reference": reference,
            # Desk tickets carry no subject column; the request type is what the
            # dashboard and the digest identify them by.
            "title": sd.request_type or "Service desk request",
            "action_url": f"/service-desk/tickets/{ticket.id}",
            "actor_name": actor_name,
            "workspace_id": workspace_id,
        }

    # ------------------------------------------------------------------ loads

    async def _sd(
        self,
        workspace_id: str,
        ticket_id: str,
        developer_id: str | None = None,
        for_edit: bool = False,
    ) -> ServiceDeskTicket:
        """Load a ticket's SD extension, enforcing row-level visibility.

        ``developer_id`` applies the same scope clause the list and dashboard use.
        Without it, a KAM restricted to their own queue could still read or mutate
        any ticket in the workspace by id — the list was scoped but the by-id
        paths were not. 404 (not 403) so ids outside scope stay unenumerable.

        ``for_edit`` additionally requires write authority (see ``_require_edit``).
        Visibility is not authority: an Ops Lead holds ``can_view_all_service_desk``
        so the scope clause admits every row, and without this second check that
        read-only role could reclassify or hand off anyone's ticket.
        """
        query = select(ServiceDeskTicket).where(
            ServiceDeskTicket.ticket_id == ticket_id,
            ServiceDeskTicket.workspace_id == workspace_id,
        )
        if developer_id is not None:
            from aexy.services.service_desk_service import resolve_scope_clause

            clause = await resolve_scope_clause(self.db, workspace_id, developer_id)
            if clause is not None:
                query = query.join(Ticket, Ticket.id == ServiceDeskTicket.ticket_id).where(clause)
        sd = (await self.db.execute(query)).scalar_one_or_none()
        if sd is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service desk ticket not found")
        if for_edit and developer_id is not None:
            await self._require_edit(workspace_id, sd, developer_id)
        return sd

    async def _require_edit(
        self, workspace_id: str, sd: ServiceDeskTicket, developer_id: str
    ) -> None:
        """403 unless ``can_edit_ticket`` grants this caller write authority."""
        from aexy.services.service_desk_service import can_edit_ticket

        assignee_id = (
            await self.db.execute(select(Ticket.assignee_id).where(Ticket.id == sd.ticket_id))
        ).scalar_one_or_none()
        if await can_edit_ticket(
            self.db,
            workspace_id,
            str(developer_id),
            assignee_id=assignee_id,
            pending_with=sd.pending_with,
        ):
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You can view this Service Desk ticket but not change it. Only the "
                "assigned owner, the team whose queue it is currently with, or a "
                "Service Desk manager can."
            ),
        )

    async def _open_segment(self, ticket_id: str) -> TicketPendingSegment | None:
        # Defensive ordering: the partial unique index guarantees one open segment
        # in Postgres, but scalar_one_or_none() would raise on drifted data (and
        # SQLite in tests has no such guarantee) — prefer the newest.
        return (
            await self.db.execute(
                select(TicketPendingSegment)
                .where(
                    TicketPendingSegment.ticket_id == ticket_id,
                    TicketPendingSegment.exited_at.is_(None),
                )
                .order_by(TicketPendingSegment.entered_at.desc())
            )
        ).scalars().first()

    async def stop_clock_for_resolution(
        self,
        workspace_id: str,
        ticket_id: str,
        *,
        reason: str,
        actor_id: str | None = None,
    ) -> str | None:
        """Park a resolved ticket in the terminal bucket without closing it.

        A ticket resolved by its task being completed used to keep the
        ``pending_with`` it had all along, so it sat in Tech's queue for good —
        the work was done, the status said Resolved, and the bucket still said
        somebody owed an action. The breach clock kept running against them too.

        This deliberately does **not** go through ``change_pending_with``, which
        couples the terminal bucket to ``status = CLOSED`` and sends the closure
        email. Both are right when a person closes a ticket and wrong here: the
        decision on this path is Resolved-not-Closed, because a developer
        finishing a card has not spoken to the requester, and the resolution
        notice has already gone out. So the ledger is written directly and the
        status is left exactly as ``resolve_for_completed_task`` set it.

        Returns the bucket moved to, or None if there was nothing to do.
        """
        sd = (
            await self.db.execute(
                select(ServiceDeskTicket).where(
                    ServiceDeskTicket.ticket_id == ticket_id,
                    ServiceDeskTicket.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if sd is None:
            return None

        taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
        terminal = next(
            (st.slug for st in taxonomy.stakeholders if st.semantics == "closed"), None
        )
        if terminal is None or sd.pending_with == terminal:
            # A workspace with no terminal bucket cannot express "the clock has
            # stopped". Leaving the ticket where it is beats inventing a bucket.
            return None

        now = datetime.now(timezone.utc)
        open_seg = await self._open_segment(ticket_id)
        if open_seg is not None:
            open_seg.exited_at = now
            open_seg.duration_seconds = int(
                (now - _aware(open_seg.entered_at)).total_seconds()
            )

        old_label = (
            st.label if (st := taxonomy.stakeholder(sd.pending_with)) else sd.pending_with
        )
        sd.pending_with = terminal
        # No new segment: the terminal bucket has no clock, which is what makes it
        # terminal.

        new_label = st.label if (st := taxonomy.stakeholder(terminal)) else terminal
        self.db.add(
            TicketResponse(
                id=str(uuid4()),
                ticket_id=ticket_id,
                author_id=actor_id,
                is_internal=True,
                content=f"Pending With changed from {old_label} to {new_label} — {reason}",
            )
        )
        await self.db.flush()
        return terminal

    # ------------------------------------------------------------ transitions

    async def change_pending_with(
        self,
        workspace_id: str,
        ticket_id: str,
        new_value: str,
        changed_by_id: str | None = None,
        note: str | None = None,
        scope_developer_id: str | None = None,
    ) -> ServiceDeskTicketDetail:
        sd = await self._sd(
            workspace_id, ticket_id, developer_id=scope_developer_id, for_edit=True
        )
        ticket = await self.db.get(Ticket, ticket_id)
        if ticket is None:
            raise HTTPException(status_code=404, detail="Ticket not found")

        # The schema used to be a `Literal[...]` of one company's stakeholders,
        # which meant the wire type did this check. Now that the set is per
        # workspace, this is the only thing standing between a request body and
        # an arbitrary string in `pending_with` — which would put the ticket in a
        # bucket no queue, dashboard column or visibility rule can ever match.
        taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
        if not taxonomy.has_stakeholder(new_value):
            known = ", ".join(s.slug for s in taxonomy.stakeholders) or "none configured"
            raise HTTPException(
                status_code=422,
                detail=f"Unknown stakeholder {new_value!r} for this workspace (known: {known})",
            )

        old_value = sd.pending_with
        now = datetime.now(timezone.utc)

        if new_value == old_value:
            return await self.get_detail(workspace_id, ticket_id)

        # close the currently-open segment (record its duration)
        open_seg = await self._open_segment(ticket_id)
        if open_seg is not None:
            open_seg.exited_at = now
            open_seg.duration_seconds = int((now - _aware(open_seg.entered_at)).total_seconds())

        sd.pending_with = new_value

        # open a fresh segment unless we are closing (terminal = no clock)
        if not taxonomy.is_closed(new_value):
            self.db.add(
                TicketPendingSegment(
                    id=str(uuid4()),
                    workspace_id=workspace_id,
                    ticket_id=ticket_id,
                    pending_with=new_value,
                    entered_at=now,
                    changed_by_id=changed_by_id,
                    note=note,
                )
            )

        # ticket status side-effects
        if taxonomy.is_closed(new_value):
            ticket.status = TicketStatus.CLOSED.value
            ticket.closed_at = now
            if ticket.resolved_at is None:
                ticket.resolved_at = now
        elif taxonomy.is_closed(old_value):
            # Reopen. `resolved_at` has to go too: leaving it set means the
            # ticket reads as resolved-but-open, and any resolution-time report
            # would count it as closed at the old timestamp.
            ticket.status = TicketStatus.IN_PROGRESS.value
            ticket.closed_at = None
            ticket.resolved_at = None
        else:
            if ticket.status == TicketStatus.NEW.value:
                ticket.status = TicketStatus.IN_PROGRESS.value
            if ticket.first_response_at is None:
                ticket.first_response_at = now

        # Human-readable timeline entry — labels, not slugs, since this is read
        # by people and a slug like `third_party` is not what they see elsewhere.
        old_label = (s.label if (s := taxonomy.stakeholder(old_value)) else old_value)
        new_label = (s.label if (s := taxonomy.stakeholder(new_value)) else new_value)
        line = f"Pending With changed from {old_label} to {new_label}"
        if note:
            line += f" — {note}"
        self.db.add(
            TicketResponse(
                id=str(uuid4()),
                ticket_id=ticket_id,
                author_id=changed_by_id,
                content=line,
                is_internal=True,
            )
        )
        await self.db.flush()

        if taxonomy.is_closed(new_value):
            await self._send_closure(workspace_id, ticket, note)
        else:
            # Tell the queue it has just been handed. Skipped on close: a closed
            # ticket has no clock and needs nobody to pick it up. `new_label` is
            # the human stakeholder name, matching the timeline line above rather
            # than leaking the slug.
            from aexy.services.service_desk_service import developers_in_queue

            recipients = await developers_in_queue(self.db, workspace_id, new_value)
            if recipients:
                identity = await self._alert_identity(
                    workspace_id, ticket, sd, changed_by_id
                )
                self._queue_alert(
                    "pending_with",
                    recipient_ids=recipients,
                    actor_id=changed_by_id,
                    pending_with=new_label,
                    **{k: identity[k] for k in ("reference", "title", "action_url", "workspace_id")},
                )

        return await self.get_detail(workspace_id, ticket_id)

    async def update_fields(
        self,
        workspace_id: str,
        ticket_id: str,
        data: TicketFieldsUpdate,
        scope_developer_id: str | None = None,
    ) -> ServiceDeskTicketDetail:
        sd = await self._sd(
            workspace_id, ticket_id, developer_id=scope_developer_id, for_edit=True
        )
        payload = data.model_dump(exclude_unset=True)
        assigned = payload.pop("assigned_owner_id", None)

        # Referenced master data must live in THIS workspace — these ids come
        # straight from the request body.
        await self._validate_refs(workspace_id, payload)
        if assigned is not None:
            await self._validate_member(workspace_id, assigned)

        # `request_type` was a `Literal[...]`, so the wire type used to reject an
        # unknown value. It is a per-workspace slug now, and nothing else here
        # would stop an arbitrary string reaching the column — where it would
        # break every filter and label that reads it.
        if (rt := payload.get("request_type")) is not None:
            taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
            if not taxonomy.has_request_type(rt):
                known = ", ".join(r.slug for r in taxonomy.request_types) or "none configured"
                raise HTTPException(
                    status_code=422,
                    detail=f"Unknown request type {rt!r} for this workspace (known: {known})",
                )

        prior_assignee_id = (
            await self.db.execute(select(Ticket.assignee_id).where(Ticket.id == ticket_id))
        ).scalar_one_or_none()

        for k, v in payload.items():
            setattr(sd, k, v)
        if assigned is not None:
            await reassign_service_desk_ticket_family(
                self.db, workspace_id, ticket_id, assigned
            )
        await self.db.flush()

        # A handover through the edit form is the same event as one through the
        # dedicated assign endpoint, and this path had no notification at all —
        # the new owner's only signal was the next daily digest.
        if assigned and str(assigned) != str(prior_assignee_id or ""):
            ticket = await self.db.get(Ticket, ticket_id)
            if ticket is not None:
                identity = await self._alert_identity(
                    workspace_id, ticket, sd, scope_developer_id
                )
                self._queue_alert(
                    "assigned",
                    recipient_id=str(assigned),
                    actor_id=scope_developer_id,
                    **identity,
                )

        return await self.get_detail(workspace_id, ticket_id)

    async def split_detected_issues(
        self,
        workspace_id: str,
        ticket_id: str,
        issue_indexes: list[int],
        split_by_id: str,
        scope_developer_id: str | None = None,
    ) -> dict[str, list[str]]:
        """Create selected detected issues as children without replacing the primary."""
        sd = await self._sd(
            workspace_id, ticket_id, developer_id=scope_developer_id, for_edit=True
        )
        primary = (
            await self.db.execute(
                select(Ticket)
                .where(Ticket.id == ticket_id, Ticket.workspace_id == workspace_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
        if primary is None:
            raise HTTPException(status_code=404, detail="Ticket not found")

        field_values = dict(primary.field_values or {})
        raw_issues = field_values.get("detected_issues")
        if not isinstance(raw_issues, list) or len(raw_issues) < 2:
            raise HTTPException(status_code=400, detail="Ticket has no detected issues to split")
        if not issue_indexes:
            raise HTTPException(status_code=400, detail="Select at least one issue to split")
        if len(issue_indexes) != len(set(issue_indexes)):
            raise HTTPException(status_code=400, detail="Issue indexes must be unique")
        if any(index < 2 or index > len(raw_issues) for index in issue_indexes):
            raise HTTPException(
                status_code=400,
                detail=f"Issue indexes must be between 2 and {len(raw_issues)}",
            )

        done_indexes = _split_done_indexes(field_values, len(raw_issues))
        reused = sorted(set(issue_indexes).intersection(done_indexes))
        if reused:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Issue indexes already split: {reused}",
            )

        try:
            selected = [
                (index, DetectedIssue.model_validate(raw_issues[index - 1]).model_dump())
                for index in sorted(issue_indexes)
            ]
        except ValidationError as exc:
            raise HTTPException(status_code=400, detail="Selected detected issue is invalid") from exc

        from aexy.models.service_desk import ServiceDeskMailbox
        from aexy.schemas.service_desk import InboundEmail
        from aexy.services.service_desk_intake_service import ServiceDeskIntakeService

        mailbox = await self.db.get(ServiceDeskMailbox, sd.mailbox_id) if sd.mailbox_id else None
        source_email = InboundEmail(
            to=mailbox.address if mailbox else "",
            from_email=primary.submitter_email or "",
            from_name=primary.submitter_name,
            subject=str(primary.title or field_values.get("subject") or ""),
            body_text=str(field_values.get("body") or ""),
            message_id=sd.source_message_id,
        )
        actor = await self.db.get(Developer, split_by_id)
        actor_label = (actor.name or actor.email or split_by_id) if actor else split_by_id
        prefix = await ticket_prefix(self.db, workspace_id)
        primary_display_id = render_display_id(prefix, primary.ticket_number)
        intake = ServiceDeskIntakeService(self.db)

        try:
            async with self.db.begin_nested():
                children: list[Ticket] = []
                for _, issue in selected:
                    child = await intake.create_child_ticket(
                        workspace_id,
                        primary,
                        sd,
                        source_email,
                        issue,
                        mailbox,
                        human_split=True,
                    )
                    child_segment = (
                        await self.db.execute(
                            select(TicketPendingSegment).where(
                                TicketPendingSegment.ticket_id == child.id,
                                TicketPendingSegment.exited_at.is_(None),
                            )
                        )
                    ).scalar_one()
                    child_segment.changed_by_id = split_by_id
                    child_segment.note = f"Split by {actor_label} from {primary_display_id}"
                    children.append(child)

                created = [
                    {"ticket_id": child.id, "display_id": render_display_id(prefix, child.ticket_number)}
                    for child in children
                ]
                updated_values = dict(primary.field_values or {})
                existing_children = updated_values.get("split_children")
                updated_values["split_children"] = (
                    list(existing_children) if isinstance(existing_children, list) else []
                ) + created
                updated_values["split_done_indexes"] = sorted(
                    set(done_indexes).union(issue_indexes)
                )
                primary.field_values = updated_values
                self.db.add(
                    TicketResponse(
                        id=str(uuid4()),
                        ticket_id=primary.id,
                        author_id=split_by_id,
                        content=(
                            f"Split issues {', '.join(str(index) for index, _ in selected)} into "
                            f"{', '.join(item['display_id'] for item in created)} by {actor_label}"
                        ),
                        is_internal=True,
                    )
                )
                await self.db.flush()
        except Exception as exc:  # noqa: BLE001 — the savepoint guarantees no partial split
            logger.warning("Service desk: human split rolled back (%s)", exc)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Ticket split failed; no child tickets were created",
            ) from exc

        return {
            "created_ticket_ids": [child.id for child in children],
            "created_ticket_display_ids": [
                render_display_id(prefix, child.ticket_number) for child in children
            ],
        }

    # ------------------------------------------------- outbound stakeholder mail

    async def _email_recipients(
        self, workspace_id: str, sd: ServiceDeskTicket, ticket: Ticket
    ) -> list[TicketEmailRecipient]:
        """The closed set of addresses this ticket may be emailed.

        Master data holds exact addresses as well as bare domains; only exact
        addresses can be written to, so domain rows are skipped. The ticket's own
        partner is offered (not every partner — a KAM has no business seeing
        another partner's contacts), every configured insurer is offered because
        a claim usually has to go to an insurer that intake never linked, and the
        requester is offered so the original thread can be answered.

        This is an allowlist, not a convenience: the send goes out of the
        workspace's real Gmail account, so a free-text recipient would turn a
        ticket action into an open relay for whoever holds a KAM login.
        """
        from aexy.models.service_desk import (
            ServiceDeskVendor,
            ServiceDeskVendorDomain,
            ServiceDeskAccountDomain,
        )

        # Which external bucket an address belongs to comes from the workspace's
        # own taxonomy, not the fixed partner/insurer slugs this used to assume.
        taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
        account_slug = external_slug_for(taxonomy, "account")
        vendor_slug = external_slug_for(taxonomy, "vendor")

        out: list[TicketEmailRecipient] = []
        seen: set[str] = set()

        def add(address: str | None, label: str, stage: str | None = None) -> None:
            key = (address or "").strip().lower()
            if "@" not in key or key in seen:
                return
            seen.add(key)
            out.append(TicketEmailRecipient(email=key, label=label, stage=stage))

        if sd.account_id:
            rows = (
                await self.db.execute(
                    select(ServiceDeskAccount.name, ServiceDeskAccountDomain.domain)
                    .join(
                        ServiceDeskAccountDomain,
                        ServiceDeskAccountDomain.account_id == ServiceDeskAccount.id,
                    )
                    .where(
                        ServiceDeskAccount.id == sd.account_id,
                        ServiceDeskAccount.workspace_id == workspace_id,
                    )
                    .order_by(ServiceDeskAccountDomain.domain)
                )
            ).all()
            for name, domain in rows:
                add(domain, f"{name} ({taxonomy.term('account')})", account_slug)

        rows = (
            await self.db.execute(
                select(ServiceDeskVendor.name, ServiceDeskVendorDomain.domain)
                .join(
                    ServiceDeskVendorDomain,
                    ServiceDeskVendorDomain.vendor_id == ServiceDeskVendor.id,
                )
                .where(
                    ServiceDeskVendor.workspace_id == workspace_id,
                    ServiceDeskVendor.is_active.is_(True),
                )
                .order_by(ServiceDeskVendor.name, ServiceDeskVendorDomain.domain)
            )
        ).all()
        for name, domain in rows:
            add(domain, f"{name} ({taxonomy.term('vendor')})", vendor_slug)

        add(ticket.submitter_email, ticket.submitter_name or "Requester")

        return out

    @staticmethod
    def _reply_all(ticket: Ticket, desk_address: str | None) -> TicketReplyAll:
        """Who a reply from this ticket goes to, and who else stays on it.

        Answering a thread from the desk used to drop everybody the requester had
        copied — their colleague, their broker, the person actually handling it —
        so the reply reached one address out of five and the rest of the chain
        never saw it. Intake keeps the addresses now; this turns them into the
        two fields a compose box needs.

        The desk's own address is excluded twice over (intake never records it,
        and it is dropped again here) because a desk in its own Cc receives its
        own reply back through the sync as new correspondence.
        """
        values = ticket.field_values or {}
        stored = values.get("thread_participants")
        participants = [
            item.strip().lower()
            for item in (stored if isinstance(stored, list) else [])
            if isinstance(item, str) and "@" in item
        ]
        # Falls back to the requester: a ticket that predates participant capture
        # can still answer the person who opened it, which is what it did before.
        from aexy.services.service_desk_intake_service import MANUAL_SENDER_ADDRESS

        raw_to = values.get("thread_reply_to") or ticket.submitter_email or ""
        to = str(raw_to).strip().lower() or None
        # A ticket logged by phone has no requester address, only the sentinel
        # standing in for one. Prefilling it would put an undeliverable address
        # in the To box, which reads as a real recipient until the send fails.
        if to == MANUAL_SENDER_ADDRESS:
            to = None
        desk = (desk_address or "").strip().lower()
        return TicketReplyAll(
            to=to,
            cc=[address for address in participants if address != to and address != desk],
        )

    @staticmethod
    def _absorb_outbound_participants(
        ticket: Ticket,
        recipient: str,
        cc: list[str],
        mailbox: object | None,
    ) -> None:
        """Keep everyone this reply went to on the ticket's thread.

        The mirror of what intake does for mail arriving: a surveyor the KAM
        looped in by hand is on the conversation from that moment, and the next
        reply from the ticket has to offer them without being told again.

        Who a reply goes *to* is untouched — that is still the last person who
        wrote in, not the last person the desk wrote to.
        """
        from aexy.services.service_desk_intake_service import THREAD_PARTICIPANT_LIMIT

        desk = ""
        address = getattr(mailbox, "address", None)
        if isinstance(address, str):
            desk = address.strip().lower()

        values = dict(ticket.field_values or {})
        stored = values.get("thread_participants")
        participants = [
            item.strip().lower()
            for item in (stored if isinstance(stored, list) else [])
            if isinstance(item, str) and "@" in item
        ]

        changed = False
        for candidate in [recipient, *cc]:
            value = (candidate or "").strip().lower()
            if not value or value == desk or value in participants:
                continue
            if len(participants) >= THREAD_PARTICIPANT_LIMIT:
                break
            participants.append(value)
            changed = True

        if changed:
            values["thread_participants"] = participants
            ticket.field_values = values

    @staticmethod
    def _uploaded_attachments(ticket: Ticket) -> list[dict]:
        """Files uploaded to this ticket to be sent out, not files that arrived.

        Stored on ``Ticket.attachments`` — the storage-backed list the rest of
        ticketing uses — rather than in ``field_values``, which holds handles
        into the mailbox and no bytes of its own.
        """
        raw = ticket.attachments or []
        return [item for item in raw if isinstance(item, dict) and item.get("id")]

    @classmethod
    def _detail_attachments(cls, ticket: Ticket) -> list[TicketAttachment]:
        """Both kinds of file on the ticket, each saying which kind it is."""
        out = [
            TicketAttachment(
                index=index,
                filename=str(item.get("filename") or "attachment"),
                content_type=item.get("content_type"),
                size_bytes=item.get("size_bytes"),
                can_forward=bool(item.get("attachment_id")),
                source="email",
            )
            for index, item in enumerate(cls._ticket_attachments(ticket))
        ]
        out.extend(
            TicketAttachment(
                # No index: positions address the emailed list, and uploads must
                # not be able to shift what a download URL points at.
                index=None,
                id=str(item.get("id")),
                filename=str(item.get("filename") or "attachment"),
                content_type=item.get("type"),
                size_bytes=item.get("size"),
                # Held in the desk's own storage, so there is no mailbox to be
                # unreachable and nothing that can make one unforwardable.
                can_forward=True,
                source="upload",
            )
            for item in cls._uploaded_attachments(ticket)
        )
        return out

    @staticmethod
    def _community_topic(ticket: Ticket) -> TicketCommunityTopic | None:
        """The public thread this ticket's answer became, if it has one.

        Stored on the ticket rather than derived, because the thread is in
        another module's tables and the useful question here — "has this already
        been answered in public?" — should not need a join to answer.
        """
        raw = (ticket.field_values or {}).get("community_topic")
        if not isinstance(raw, dict):
            return None
        try:
            return TicketCommunityTopic(**raw)
        except ValidationError:
            # A hand-edited or half-written value should not take down the whole
            # ticket detail; the pointer is a convenience, not the record.
            logger.warning("Ticket %s has an unreadable community_topic", ticket.id)
            return None

    async def publish_to_community(
        self,
        workspace_id: str,
        ticket_id: str,
        *,
        channel_id: str,
        title: str,
        content: str,
        developer_id: str,
        scope_developer_id: str | None = None,
    ) -> TicketCommunityTopic:
        """Publish a reviewed answer from this ticket as a public thread.

        The body is what the operator edited and looked at, not the ticket's
        correspondence — see ``CommunityPublishingService`` for why nothing here
        auto-publishes what a customer wrote.
        """
        from aexy.services.community_publishing_service import (
            CommunityPublishingService,
            PublishingError,
        )

        # for_edit: publishing an answer from a ticket is a write on that ticket,
        # so it takes the same authority as editing one. A read-only role that can
        # see every queue must not be able to put any of it on the internet.
        await self._sd(
            workspace_id, ticket_id, developer_id=scope_developer_id, for_edit=True
        )
        ticket = await self.db.get(Ticket, ticket_id)
        if ticket is None:
            raise HTTPException(status_code=404, detail="Ticket not found")

        try:
            published = await CommunityPublishingService(self.db).publish(
                workspace_id,
                source="service_desk",
                channel_id=channel_id,
                title=title,
                content=content,
                developer_id=developer_id,
            )
        except PublishingError as exc:
            raise ValueError(exc.message) from exc

        pointer = TicketCommunityTopic(
            topic_id=published["topic_id"],
            channel_slug=published["channel_slug"],
            channel_name=published["channel_name"],
            community_slug=published["community_slug"],
            path=published["path"],
            published_at=published["published_at"],
            live=published["live"],
        )
        values = dict(ticket.field_values or {})
        values["community_topic"] = pointer.model_dump(mode="json")
        ticket.field_values = values
        await self.db.flush()
        return pointer

    async def _assignment_note(self, ticket: Ticket) -> str | None:
        """Why this ticket has the owner it has, when that needed explaining.

        Read from the ticket, where intake now writes it. Tickets created before
        that fall back to their earliest internal note, which is where the same
        sentence has always been recorded — recognised by how a routing note
        opens, so an AI-match note or an operator's comment is not mistaken for
        one. That fallback is what lets an existing desk answer "why did this go
        to the wrong person?" about tickets it already has.
        """
        stored = (ticket.field_values or {}).get("assignment_note")
        if isinstance(stored, str) and stored.strip():
            return stored.strip()

        earliest = (
            await self.db.execute(
                select(TicketResponse.content)
                .where(
                    TicketResponse.ticket_id == ticket.id,
                    TicketResponse.is_internal.is_(True),
                )
                .order_by(TicketResponse.created_at)
                .limit(1)
            )
        ).scalar_one_or_none()
        if isinstance(earliest, str) and earliest.startswith(_ROUTING_NOTE_PREFIXES):
            return earliest
        return None

    @staticmethod
    def _ticket_attachments(ticket: Ticket) -> list[dict]:
        raw = (ticket.field_values or {}).get("attachments")
        return [item for item in raw if isinstance(item, dict)] if isinstance(raw, list) else []

    async def _attachment_source(self, sd: ServiceDeskTicket, action: str) -> GoogleIntegration:
        """The connected account this ticket's files are re-fetched from.

        Bytes are never stored on the ticket, so forwarding a file and handing it
        to the person reading the ticket both go back to the mailbox the mail
        arrived in — and both become impossible in the same two ways.
        """
        from aexy.models.service_desk import ServiceDeskMailbox

        mailbox = await self.db.get(ServiceDeskMailbox, sd.mailbox_id) if sd.mailbox_id else None
        integration_id = mailbox.integration_id if mailbox else None
        if not integration_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "This ticket's original email is not available, so its files "
                    f"cannot be {action}"
                ),
            )

        integration = await self.db.get(GoogleIntegration, integration_id)
        if integration is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The mailbox is no longer connected, so files cannot be {action}",
            )
        return integration

    async def _attachment_bytes(
        self,
        integration: GoogleIntegration,
        sd: ServiceDeskTicket,
        item: dict,
        filename: str,
        action: str,
        failure: str,
    ) -> bytes:
        """One file, pulled fresh from the message it arrived on."""
        from aexy.services.gmail_sync_service import (
            SERVICE_DESK_ATTACHMENT_FORWARD_BYTE_LIMIT,
            GmailSyncService,
        )

        # A handle is only valid against the message the file arrived on, and a
        # ticket collects files from replies as well as the first email.
        owning_message_id = item.get("message_id") or sd.source_message_id
        if not owning_message_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"'{filename}' has no source message, so it cannot be {action}",
            )
        try:
            return await GmailSyncService(self.db).gmail_attachment_bytes(
                integration,
                owning_message_id,
                {"attachmentId": item["attachment_id"], "size": item.get("size_bytes")},
                max_bytes=SERVICE_DESK_ATTACHMENT_FORWARD_BYTE_LIMIT,
                filename=filename,
                content_type=item.get("content_type"),
            )
        except Exception as exc:  # noqa: BLE001 — surfaced, never silently dropped
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"'{filename}' could not be retrieved, {failure}: {exc}",
            ) from exc

    async def load_attachment(
        self,
        workspace_id: str,
        ticket_id: str,
        index: int,
        scope_developer_id: str | None = None,
    ) -> tuple[str, str, bytes]:
        """One of the ticket's own files, for the person reading the ticket.

        Anyone who may see the ticket may take its files: the request card lists
        them by name already, and a claim register a KAM cannot open is a ticket
        they cannot work. Write authority is deliberately *not* required — that
        gate is for changing the ticket, not for reading what arrived on it.

        Addressed by position rather than by name because two replies can attach
        files called the same thing, and the list only ever grows.
        """
        sd = await self._sd(workspace_id, ticket_id, developer_id=scope_developer_id)
        ticket = await self.db.get(Ticket, sd.ticket_id)
        if ticket is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

        items = self._ticket_attachments(ticket)
        if index < 0 or index >= len(items):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="This ticket has no such attachment",
            )
        item = items[index]
        filename = str(item.get("filename") or "attachment")
        if not item.get("attachment_id"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"'{filename}' arrived before the desk started keeping a handle "
                    "on attachments, so its contents are only in the original email"
                ),
            )

        integration = await self._attachment_source(sd, "downloaded")
        raw = await self._attachment_bytes(
            integration, sd, item, filename, "downloaded", "so there is nothing to download"
        )
        return filename, str(item.get("content_type") or "application/octet-stream"), raw

    async def _load_forward_bytes(
        self,
        sd: ServiceDeskTicket,
        ticket: Ticket,
        filenames: list[str],
    ) -> list[tuple[str, str | None, bytes]]:
        """Re-fetch chosen attachments from the ticket's original email.

        Bytes are never stored on the ticket and never accepted from the client:
        the caller names a file that actually arrived, and it is pulled fresh
        from the mailbox. That way the desk cannot be used to send a file that
        was never part of the conversation.
        """
        if not filenames:
            return []
        from aexy.services.gmail_sync_service import (
            SERVICE_DESK_ATTACHMENT_FORWARD_BYTE_LIMIT,
        )

        by_name = {str(item.get("filename")): item for item in self._ticket_attachments(ticket)}
        integration = await self._attachment_source(sd, "attached")

        loaded: list[tuple[str, str | None, bytes]] = []
        total = 0
        for filename in filenames:
            item = by_name.get(filename)
            if item is None or not item.get("attachment_id"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"'{filename}' is not a forwardable file on this ticket",
                )
            # Sending "please find attached" with nothing attached is worse than
            # not sending: the insurer waits, and the desk shows a sent message
            # that was useless.
            raw = await self._attachment_bytes(
                integration, sd, item, filename, "attached", "so nothing was sent"
            )
            total += len(raw)
            if total > SERVICE_DESK_ATTACHMENT_FORWARD_BYTE_LIMIT:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The chosen files are too large to send together",
                )
            loaded.append((filename, item.get("content_type"), raw))
        return loaded

    # ------------------------------------------------- files uploaded to send

    async def add_outbound_attachments(
        self,
        workspace_id: str,
        ticket_id: str,
        files: list[tuple[str, str | None, object, int]],
        scope_developer_id: str | None = None,
    ) -> list[TicketAttachment]:
        """Take files from the person answering the ticket, ready to be attached.

        Until now the only file the desk could send was one that had arrived on
        the ticket, so answering "please find the completed form attached" meant
        leaving Aexy for a personal mailbox — and the reply, with the file,
        stopped being part of the record.

        Streamed to the desk's own storage rather than held in the browser, so a
        large file does not have to survive until the KAM finishes writing, and
        so the ticket holds what was sent even if the send fails.
        """
        from aexy.services.ticket_service import TicketService

        await self._sd(workspace_id, ticket_id, developer_id=scope_developer_id, for_edit=True)
        ticket = await self.db.get(Ticket, ticket_id)
        if ticket is None:
            raise HTTPException(status_code=404, detail="Ticket not found")

        try:
            created = await TicketService(self.db).add_ticket_attachments(ticket, files)
        except ValueError as exc:
            code = str(exc)
            if code == "too_large":
                from aexy.core.config import settings

                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds the {settings.ticket_max_attachment_mb} MB limit",
                ) from exc
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "File storage is not configured on this deployment, so files cannot "
                    "be attached"
                    if code == "storage_unconfigured"
                    else "The file could not be uploaded"
                ),
            ) from exc

        return [
            TicketAttachment(
                index=None,
                id=str(item.get("id")),
                filename=str(item.get("filename") or "attachment"),
                content_type=item.get("type"),
                size_bytes=item.get("size"),
                can_forward=True,
                source="upload",
            )
            for item in created
        ]

    async def remove_outbound_attachment(
        self,
        workspace_id: str,
        ticket_id: str,
        attachment_id: str,
        scope_developer_id: str | None = None,
    ) -> None:
        """Drop a file uploaded to this ticket but not yet sent.

        Only ever an unsent one: sending moves the file onto the message it went
        out with, and what the desk has already emailed is a fact about the
        ticket that nobody gets to delete from it afterwards.
        """
        from aexy.services.ticket_service import TicketService

        await self._sd(workspace_id, ticket_id, developer_id=scope_developer_id, for_edit=True)
        ticket = await self.db.get(Ticket, ticket_id)
        if ticket is None:
            raise HTTPException(status_code=404, detail="Ticket not found")

        if not await TicketService(self.db).remove_ticket_attachment(ticket, attachment_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="This ticket has no such uploaded file",
            )

    async def load_uploaded_attachment(
        self,
        workspace_id: str,
        ticket_id: str,
        attachment_id: str,
        scope_developer_id: str | None = None,
    ) -> tuple[str, str, bytes]:
        """One uploaded file, whether it is still staged or has been sent.

        Same read rule as the emailed files: anyone who may see the ticket may
        open what is on it. ``find_ticket_attachment`` looks at the ticket and at
        its outgoing messages, so a file stays downloadable after the send that
        moved it there.
        """
        from aexy.services.ticket_service import TicketService

        await self._sd(workspace_id, ticket_id, developer_id=scope_developer_id)
        ticket = await self.db.get(Ticket, ticket_id)
        if ticket is None:
            raise HTTPException(status_code=404, detail="Ticket not found")

        service = TicketService(self.db)
        await self.db.refresh(ticket, ["responses"])
        meta = service.find_ticket_attachment(ticket, attachment_id, include_internal=True)
        if meta is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="This ticket has no such uploaded file",
            )
        filename = str(meta.get("filename") or "attachment")
        raw = self._upload_bytes(meta, filename)
        return filename, str(meta.get("type") or "application/octet-stream"), raw

    @staticmethod
    def _upload_bytes(meta: dict, filename: str) -> bytes:
        """The stored bytes of one uploaded file."""
        from aexy.services.storage_service import get_storage_service
        from aexy.services.ticket_service import TicketService as _TicketService

        key = _TicketService.attachment_key(meta)
        stored = get_storage_service().get_object(key) if key else None
        if stored is None:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"'{filename}' could not be read back from storage",
            )
        return stored[0]

    def _load_upload_bytes(
        self, ticket: Ticket, attachment_ids: list[str], already_loaded: int = 0
    ) -> tuple[list[tuple[str, str | None, bytes]], list[dict], int]:
        """Read chosen uploads for sending, and say which rows they were.

        The caller names ids, never bytes — the same rule the emailed files
        follow. An id is looked up in this ticket's own uploads, so a caller
        cannot use a send to attach a file belonging to another ticket, and a
        file that has already gone out (it lives on that message now, not on the
        ticket) cannot be silently attached again.

        The rows come back with the bytes because the send has to move them onto
        the message it wrote, and re-finding them afterwards by id would be a
        second chance to get the match wrong.
        """
        if not attachment_ids:
            return [], [], already_loaded
        from aexy.services.gmail_sync_service import (
            SERVICE_DESK_ATTACHMENT_FORWARD_BYTE_LIMIT,
        )

        by_id = {str(item.get("id")): item for item in self._uploaded_attachments(ticket)}
        loaded: list[tuple[str, str | None, bytes]] = []
        rows: list[dict] = []
        total = already_loaded
        for attachment_id in attachment_ids:
            item = by_id.get(attachment_id)
            if item is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="One of the chosen files is not an upload on this ticket",
                )
            filename = str(item.get("filename") or "attachment")
            raw = self._upload_bytes(item, filename)
            total += len(raw)
            if total > SERVICE_DESK_ATTACHMENT_FORWARD_BYTE_LIMIT:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The chosen files are too large to send together",
                )
            loaded.append((filename, item.get("type"), raw))
            rows.append(item)
        return loaded, rows, total

    async def email_stakeholder(
        self,
        workspace_id: str,
        ticket_id: str,
        to_email: str,
        subject: str,
        body: str,
        sender_id: str,
        attachment_filenames: list[str] | None = None,
        attachment_ids: list[str] | None = None,
        move_ticket: bool = True,
        scope_developer_id: str | None = None,
        cc_emails: list[str] | None = None,
    ) -> ServiceDeskTicketDetail:
        """Send a ticket email as the watched mailbox and log it on the ticket.

        The BSD number is always forced into the subject, because it is what the
        deterministic inbound matcher reads. Threading is deliberately narrower:
        the ticket's existing conversation is reused only when answering the
        person who opened it. Writing to an insurer starts its own conversation,
        so a partner's thread and an insurer's thread never merge into one in the
        watched mailbox, where a later reply-all would expose one to the other.
        Its replies match back by the ticket number in the subject, which is the
        matcher's second and deliberate path.

        The recipient does not have to be one of the configured addresses. A desk
        routinely has to loop in a surveyor, a broker or a colleague that Master
        Data has never heard of, and refusing meant leaving the ticket to answer
        that person from a personal inbox — outside the thread, outside the
        record. What an unconfigured address cannot do is imply a hand-off: with
        no stakeholder behind it there is no stage to move to, so the ticket
        stays where it is.
        """
        from aexy.models.service_desk import ServiceDeskMailbox
        from aexy.services.service_desk_mailer import send_stakeholder_email
        from aexy.services.service_desk_templates import strip_merge_tags

        sd = await self._sd(
            workspace_id, ticket_id, developer_id=scope_developer_id, for_edit=True
        )
        ticket = await self.db.get(Ticket, ticket_id)
        if ticket is None:
            raise HTTPException(status_code=404, detail="Ticket not found")

        recipient = to_email.strip().lower()
        options = {
            option.email: option
            for option in await self._email_recipients(workspace_id, sd, ticket)
        }
        taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
        chosen = options.get(recipient)

        vendor_slug = external_slug_for(taxonomy, "vendor")
        if chosen is not None and vendor_slug is not None and chosen.stage == vendor_slug:
            from aexy.models.service_desk import ServiceDeskVendorDomain

            sd.vendor_id = (
                await self.db.execute(
                    select(ServiceDeskVendorDomain.vendor_id).where(
                        ServiceDeskVendorDomain.workspace_id == workspace_id,
                        func.lower(ServiceDeskVendorDomain.domain) == recipient,
                    )
                )
            ).scalar_one_or_none()

        display_id = render_display_id(
            await ticket_prefix(self.db, workspace_id), ticket.ticket_number
        )
        # The compose box is prefilled from the ticket's own subject, which is
        # whatever arrived — including an unresolved merge tag from a badly sent
        # marketing mail. Same rule as the templated sends: the desk never emits
        # a placeholder, wherever the text came from.
        subject = strip_merge_tags(subject)
        subject = await force_ticket_id_into_subject(
            self.db, workspace_id, subject, ticket.ticket_number
        )

        requester = (ticket.submitter_email or "").strip().lower()
        thread_id = sd.thread_ref if requester and recipient == requester else None

        # Fetched before the send, so a missing file fails the whole action
        # rather than delivering a message that promises an attachment. Both
        # kinds share one size budget: what matters to the recipient's mail
        # server is the size of the message, not where the desk got the parts.
        files = await self._load_forward_bytes(sd, ticket, attachment_filenames or [])
        uploads, upload_rows, _ = self._load_upload_bytes(
            ticket, attachment_ids or [], already_loaded=sum(len(raw) for _, _, raw in files)
        )
        files.extend(uploads)

        mailbox = await self.db.get(ServiceDeskMailbox, sd.mailbox_id) if sd.mailbox_id else None
        # Copying the To address twice, or the desk itself, makes the reply read
        # as a mistake — and a desk address in Cc would come back through the
        # sync as correspondence the desk never received.
        skip = {recipient, (mailbox.address or "").strip().lower() if mailbox else ""}
        cc = [address for address in (cc_emails or []) if address and address not in skip]
        try:
            await send_stakeholder_email(
                self.db,
                mailbox,
                recipient,
                subject,
                body,
                thread_id=thread_id,
                attachments=files,
                cc=cc,
            )
        except Exception as exc:  # noqa: BLE001 — the user is waiting on this send
            logger.warning("Service desk: stakeholder email failed for %s (%s)", display_id, exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"The email could not be sent: {exc}",
            ) from exc

        # Only now that a message has actually left: whoever the sender kept or
        # added is on this conversation from here on, so the next reply from the
        # ticket offers them without being told again. A failed send rolls this
        # back with everything else, which is the point of doing it after.
        self._absorb_outbound_participants(ticket, recipient, cc, mailbox)

        attached_line = (
            "\nAttached: " + ", ".join(name for name, _, _ in files) if files else ""
        )
        # Logged on the ticket, not just in the headers: who else saw a reply is
        # part of the record a later reader needs.
        cc_line = "\nCc: " + ", ".join(cc) if cc else ""
        # author_id is what marks this correspondence outgoing; inbound replies
        # are stored with only an author_email.
        self.db.add(
            TicketResponse(
                id=str(uuid4()),
                ticket_id=ticket_id,
                author_id=sender_id,
                author_email=mailbox.address if mailbox else None,
                content=f"To: {recipient}{cc_line}\nSubject: {subject}{attached_line}\n\n{body}",
                is_internal=False,
                # The uploads move from the ticket onto the message they left
                # with. A file the desk sent belongs to that message — leaving it
                # staged on the ticket would offer it again on the next reply and
                # lose which mail it actually went out on.
                attachments=upload_rows,
            )
        )
        if upload_rows:
            sent_ids = {str(item.get("id")) for item in upload_rows}
            ticket.attachments = [
                item
                for item in (ticket.attachments or [])
                if not (isinstance(item, dict) and str(item.get("id")) in sent_ids)
            ]
        await self.db.flush()

        # Reuse the one transition path rather than writing the ledger by hand,
        # so an emailed hand-off is indistinguishable from a Move to click: same
        # segment, same timeline entry, same clock. The KAM can still move the
        # ticket by hand, and can untick the move when the mail is only an update.
        # A custom recipient has no stage behind it, so there is nothing to move.
        if move_ticket and chosen is not None and chosen.stage and chosen.stage != sd.pending_with:
            return await self.change_pending_with(
                workspace_id,
                ticket_id,
                chosen.stage,
                changed_by_id=sender_id,
                note=f"Emailed {chosen.label}",
                scope_developer_id=scope_developer_id,
            )
        return await self.get_detail(workspace_id, ticket_id)


    # ------------------------------------------------------- reference checks

    async def _validate_refs(self, workspace_id: str, payload: dict) -> None:
        """404 on product/account/vendor ids that belong to another workspace."""
        from aexy.models.service_desk import ServiceDeskVendor, ServiceDeskProduct

        for key, model, label in (
            ("product_id", ServiceDeskProduct, "Product"),
            ("account_id", ServiceDeskAccount, "Account"),
            ("vendor_id", ServiceDeskVendor, "Vendor"),
        ):
            value = payload.get(key)
            if not value:
                continue
            found = (
                await self.db.execute(
                    select(model.id).where(model.id == value, model.workspace_id == workspace_id)
                )
            ).scalar_one_or_none()
            if found is None:
                raise HTTPException(status_code=404, detail=f"{label} not found in this workspace")

    async def _validate_member(self, workspace_id: str, developer_id: str) -> None:
        """403 when assigning a ticket to someone outside the workspace."""
        from aexy.models.workspace import WorkspaceMember

        found = (
            await self.db.execute(
                select(WorkspaceMember.id).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.developer_id == developer_id,
                    WorkspaceMember.status == "active",
                )
            )
        ).scalar_one_or_none()
        if found is None:
            raise HTTPException(status_code=400, detail="Assignee is not an active member of this workspace")

    # -------------------------------------------------------------------- TAT

    async def compute_tat(self, ticket_id: str, ticket: Ticket) -> TicketTAT:
        """Stage and stakeholder time in *working* seconds; overall in wall clock.

        The split is deliberate. Stage and stakeholder figures answer "are we
        late?", which the BRD measures in 2 business days, so they accrue only
        during working hours. ``overall`` answers "how long has the requester
        been waiting?", and the requester waited overnight and through the
        weekend too.

        Note the stored ``duration_seconds`` on each segment is *not* reused
        here: it is the wall-clock audit record of the hand-off, so working
        time is recomputed from the segment's boundaries.
        """
        segments = (
            await self.db.execute(
                select(TicketPendingSegment)
                .where(TicketPendingSegment.ticket_id == ticket_id)
                .order_by(TicketPendingSegment.entered_at)
            )
        ).scalars().all()

        now = datetime.now(timezone.utc)
        clock = await load_clock(self.db, ticket.workspace_id)
        taxonomy = await load_taxonomy(self.db, ticket.workspace_id, seed=False)
        stakeholder: dict[str, int] = defaultdict(int)
        current_pending: str | None = None
        current_seconds = 0

        for seg in segments:
            entered = _aware(seg.entered_at)
            ends = _aware(seg.exited_at) if seg.exited_at is not None else now
            dur = clock.seconds_between(entered, ends)
            if seg.exited_at is None:
                current_pending = seg.pending_with
                current_seconds = dur
            if not taxonomy.is_closed(seg.pending_with):
                stakeholder[seg.pending_with] += dur

        end = _aware(ticket.closed_at) if ticket.closed_at else now
        overall = int((end - _aware(ticket.created_at)).total_seconds())

        return TicketTAT(
            overall_seconds=overall,
            overall_days=round(overall / _DAY, 2),
            current_pending_with=current_pending,
            current_stage_seconds=current_seconds,
            current_stage_days=clock.to_days(current_seconds),
            breach_level=(
                clock.breach_level(
                    current_seconds,
                    current_pending,
                    cumulative_working_seconds=stakeholder.get(current_pending, 0),
                )
                if current_pending
                else "green"
            ),
            stakeholder_seconds=dict(stakeholder),
        )

    # ------------------------------------------------------------------ detail

    async def get_detail(
        self, workspace_id: str, ticket_id: str, scope_developer_id: str | None = None
    ) -> ServiceDeskTicketDetail:
        sd = await self._sd(workspace_id, ticket_id, developer_id=scope_developer_id)
        ticket = await self.db.get(Ticket, ticket_id)
        if ticket is None:
            raise HTTPException(status_code=404, detail="Ticket not found")

        can_edit = False
        if scope_developer_id is not None:
            from aexy.services.service_desk_service import can_edit_ticket

            can_edit = await can_edit_ticket(
                self.db,
                workspace_id,
                str(scope_developer_id),
                assignee_id=ticket.assignee_id,
                pending_with=sd.pending_with,
            )

        account_name = None
        if sd.account_id:
            account_name = (
                await self.db.execute(
                    select(ServiceDeskAccount.name).where(ServiceDeskAccount.id == sd.account_id)
                )
            ).scalar_one_or_none()

        # Resolved here because the list endpoint has always resolved them, and a
        # detail page that shows the owner as blank where the list beside it shows
        # a name reads as an unassigned ticket.
        product_name = None
        if sd.product_id:
            product_name = (
                await self.db.execute(
                    select(ServiceDeskProduct.name).where(ServiceDeskProduct.id == sd.product_id)
                )
            ).scalar_one_or_none()

        vendor_name = None
        if sd.vendor_id:
            from aexy.models.service_desk import ServiceDeskVendor

            vendor_name = (
                await self.db.execute(
                    select(ServiceDeskVendor.name).where(ServiceDeskVendor.id == sd.vendor_id)
                )
            ).scalar_one_or_none()

        owner_name = None
        if ticket.assignee_id:
            owner_row = (
                await self.db.execute(
                    select(Developer.name, Developer.email).where(
                        Developer.id == ticket.assignee_id
                    )
                )
            ).first()
            # Falls back to the address, as the list does: a developer row synced
            # from GitHub may have no name.
            owner_name = (owner_row[0] or owner_row[1]) if owner_row else None

        segments = (
            await self.db.execute(
                select(TicketPendingSegment)
                .where(TicketPendingSegment.ticket_id == ticket_id)
                .order_by(TicketPendingSegment.entered_at)
            )
        ).scalars().all()

        tat = await self.compute_tat(ticket_id, ticket)
        fv = ticket.field_values or {}
        raw_detected_issues = fv.get("detected_issues")
        detected_issues = (
            [DetectedIssue.model_validate(issue) for issue in raw_detected_issues]
            if isinstance(raw_detected_issues, list)
            else []
        )
        # A reply typed in Gmail from the desk address has no Aexy author to
        # name, but it is still the desk writing out — so the address it was sent
        # from decides direction when the author does not.
        from aexy.models.service_desk import MailboxChannel, ServiceDeskMailbox

        desk_address = None
        # Same condition ``send_stakeholder_email`` raises on, answered once here
        # so the compose form can say so before anybody types a message.
        can_send_email = False
        if sd.mailbox_id:
            desk_mailbox = await self.db.get(ServiceDeskMailbox, sd.mailbox_id)
            if desk_mailbox is not None:
                desk_address = (desk_mailbox.address or "").strip().lower()
                can_send_email = bool(
                    desk_mailbox.channel == MailboxChannel.GMAIL_SYNC.value
                    and desk_mailbox.integration_id
                )

        # Outer join the author so an outgoing message can name the person who
        # sent it. Inbound replies have no Aexy author and stay unattributed.
        correspondence = (
            await self.db.execute(
                select(TicketResponse, Developer.name, Developer.email)
                .outerjoin(Developer, Developer.id == TicketResponse.author_id)
                .where(
                    TicketResponse.ticket_id == ticket_id,
                    TicketResponse.is_internal.is_(False),
                )
                .order_by(TicketResponse.created_at)
            )
        ).all()

        return ServiceDeskTicketDetail(
            id=sd.id,
            ticket_id=sd.ticket_id,
            workspace_id=sd.workspace_id,
            ticket_number=ticket.ticket_number,
            display_id=await ticket_prefix_display(self.db, workspace_id, ticket.ticket_number),
            subject=fv.get("subject"),
            body=fv.get("body"),
            requester_email=ticket.submitter_email,
            requester_name=ticket.submitter_name,
            status=ticket.status,
            product_id=sd.product_id,
            product_name=product_name,
            account_id=sd.account_id,
            account_name=account_name,
            vendor_id=sd.vendor_id,
            vendor_name=vendor_name,
            assigned_owner_id=ticket.assignee_id,
            assigned_owner_name=owner_name,
            request_type=sd.request_type,
            pending_with=sd.pending_with,
            origin=sd.origin,
            needs_triage=sd.needs_triage,
            ai_confidence=sd.ai_confidence,
            created_at=sd.created_at,
            linked_task_id=ticket.linked_task_id,
            detected_issues=detected_issues,
            split_done_indexes=_split_done_indexes(fv, len(detected_issues)),
            segments=[SegmentResponse.model_validate(s) for s in segments],
            correspondence=[
                ServiceDeskCorrespondence(
                    id=response.id,
                    author_email=response.author_email,
                    author_name=(author_name or author_email) if response.author_id else None,
                    content=response.content,
                    created_at=response.created_at,
                    direction=(
                        "outgoing"
                        if response.author_id
                        or (
                            desk_address
                            and (response.author_email or "").strip().lower() == desk_address
                        )
                        else "incoming"
                    ),
                )
                for response, author_name, author_email in correspondence
            ],
            email_recipients=await self._email_recipients(workspace_id, sd, ticket),
            reply_all=self._reply_all(ticket, desk_address),
            attachments=self._detail_attachments(ticket),
            assignment_note=await self._assignment_note(ticket),
            community_topic=self._community_topic(ticket),
            tat=tat,
            can_edit=can_edit,
            can_send_email=can_send_email,
        )

    # ------------------------------------------------------- convert to task

    async def convert_to_task(
        self,
        workspace_id: str,
        ticket_id: str,
        project_id: str,
        sprint_id: str | None = None,
        title: str | None = None,
        priority: str = "medium",
        assignee_id: str | None = None,
        pending_with: str | None = None,
        scope_developer_id: str | None = None,
    ) -> dict:
        """Create a SprintTask from a Service Desk ticket and link them.

        Mirrors the generic tickets → task conversion (SprintTask.team_id is the
        target project/team; the ticket is linked via linked_task_id).
        """
        from uuid import uuid4 as _uuid4

        from aexy.models.sprint import SprintTask
        from aexy.models.team import Team

        ticket = await self.db.get(Ticket, ticket_id)
        sd = await self._sd(
            workspace_id, ticket_id, developer_id=scope_developer_id, for_edit=True
        )
        if ticket is None or ticket.workspace_id != workspace_id:
            raise HTTPException(status_code=404, detail="Ticket not found")
        if ticket.linked_task_id:
            raise HTTPException(status_code=400, detail="Ticket already has a linked task")

        # project_id lands on SprintTask.team_id unvalidated otherwise, so a
        # caller could plant a task on another workspace's project.
        target = (
            await self.db.execute(
                select(Team.id).where(Team.id == project_id, Team.workspace_id == workspace_id)
            )
        ).scalar_one_or_none()
        if target is None:
            raise HTTPException(status_code=404, detail="Project not found in this workspace")
        if sprint_id is not None:
            from aexy.models.sprint import Sprint

            sprint_ok = (
                await self.db.execute(
                    select(Sprint.id).where(Sprint.id == sprint_id, Sprint.workspace_id == workspace_id)
                )
            ).scalar_one_or_none()
            if sprint_ok is None:
                raise HTTPException(status_code=404, detail="Sprint not found in this workspace")

        fv = ticket.field_values or {}
        task_title = (
            title or ticket.title or fv.get("subject") or f"Ticket #{ticket.ticket_number}"
        )
        lines: list[str] = []
        if ticket.submitter_email:
            lines.append(f"From: {ticket.submitter_name or ticket.submitter_email}")
        prefix = await ticket_prefix(self.db, workspace_id)
        lines.append(
            f"Ticket: {render_display_id(prefix, ticket.ticket_number)} ({sd.request_type})"
        )
        if fv.get("body"):
            lines.append("")
            lines.extend(str(fv["body"]).split("\n"))
        description = "\n".join(lines)
        content = [
            {"type": "paragraph", "content": [{"type": "text", "text": ln}]} if ln else {"type": "paragraph"}
            for ln in lines
        ] or [{"type": "paragraph"}]

        # An assignee arrives from the request body, so confirm they are in this
        # workspace before putting work on them — otherwise an id from anywhere
        # lands a task on somebody with no access to it.
        if assignee_id is not None:
            from aexy.models.workspace import WorkspaceMember

            member = (
                await self.db.execute(
                    select(WorkspaceMember.developer_id).where(
                        WorkspaceMember.workspace_id == workspace_id,
                        WorkspaceMember.developer_id == assignee_id,
                    )
                )
            ).scalar_one_or_none()
            if member is None:
                raise HTTPException(
                    status_code=400,
                    detail="That assignee is not a member of this workspace",
                )

        task = SprintTask(
            id=str(_uuid4()),
            sprint_id=sprint_id,
            team_id=project_id,
            workspace_id=workspace_id,
            source_type="ticket",
            source_id=str(ticket.id),
            title=task_title,
            description=description,
            description_json={"type": "doc", "content": content},
            priority=priority,
            labels=[],
            status="backlog",
            assignee_id=assignee_id,
        )
        self.db.add(task)
        await self.db.flush()

        # Mirror the primary assignee into `task_assignees`, the same as every
        # other creation path — a task created here with an assignee would
        # otherwise show the column set and an empty assignee list.
        if assignee_id:
            from aexy.services.sprint_task_service import SprintTaskService

            await SprintTaskService(self.db).sync_assignee_rows_from_column(
                task, actor_id=scope_developer_id
            )

        # The files the requester sent are the evidence the work needs. Leaving
        # them on the ticket meant whoever picked up the task had to find the
        # ticket to see them, which is exactly the hop converting to a task is
        # supposed to remove.
        await self._copy_attachments_to_task(ticket, task)

        ticket.linked_task_id = task.id
        await self.db.flush()

        # The hand-off, after the link — so the timeline reads "converted to a
        # task", then "handed to Tech", which is the order it happened in.
        #
        # Moved through `change_pending_with` rather than by assigning the column:
        # that is what closes the open TAT segment and opens the next one, and a
        # direct write would leave the clock still running against whoever had the
        # ticket before, silently corrupting every stage-duration report.
        #
        # `pending_with` is passed by the caller rather than resolved here, because
        # the operator is shown the board's bucket in the dialog and may change it.
        # The board is still resolved, for the sentence explaining *why*.
        moved_to: str | None = None
        if pending_with:
            routing = await resolve_board_routing(self.db, workspace_id, project_id)
            board_name = (
                await self.db.execute(select(Team.name).where(Team.id == project_id))
            ).scalar_one_or_none()
            if routing.stakeholder_slug == pending_with:
                reason = explain(routing, board_name)
            else:
                # Overridden in the dialog. Recorded as a choice, not dressed up
                # as the board's own routing.
                reason = (
                    f'Moved by hand when converting to a task on "{board_name}".'
                    if board_name
                    else "Moved by hand when converting to a task."
                )
            await self.change_pending_with(
                workspace_id,
                ticket_id,
                pending_with,
                changed_by_id=scope_developer_id,
                note=reason,
                scope_developer_id=scope_developer_id,
            )
            moved_to = pending_with

        return {
            "task_id": task.id,
            "task_title": task_title,
            "linked": True,
            "pending_with": moved_to,
        }

    async def follow_linked_task_to_board(
        self,
        *,
        workspace_id: str,
        old_task_id: str,
        new_task_id: str,
        board_id: str,
        actor_id: str | None = None,
    ) -> str | None:
        """Re-point a ticket at a task that moved, and hand it to the new board.

        Moving a task to another project is a *fork*: the clone lands on the new
        board and the source is archived or marked done. So a ticket raised from
        the source was left pointing at a dead task — and because
        ``convert_to_task`` refuses a ticket that already has one, it could not be
        converted again either. Re-pointing the link is the correctness half of
        this; the hand-off is the half that was asked for.

        Returns the bucket the ticket moved to, or None if it stayed put.
        Silent when the task has no ticket, which is the overwhelmingly common
        case.
        """
        from aexy.models.team import Team

        ticket = (
            await self.db.execute(
                select(Ticket).where(
                    Ticket.linked_task_id == old_task_id,
                    Ticket.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if ticket is None:
            return None

        board_name = (
            await self.db.execute(select(Team.name).where(Team.id == board_id))
        ).scalar_one_or_none()

        ticket.linked_task_id = new_task_id
        await self.db.flush()

        routing = await resolve_board_routing(self.db, workspace_id, board_id)
        if routing.stakeholder_slug is None:
            # Nothing to hand it to. Written into the ticket rather than only
            # logged, because the person wondering why it did not move is reading
            # the ticket, not the server log.
            self.db.add(
                TicketResponse(
                    id=str(uuid4()),
                    ticket_id=ticket.id,
                    author_id=actor_id,
                    content=explain(routing, board_name),
                    is_internal=True,
                )
            )
            await self.db.flush()
            return None

        sd = (
            await self.db.execute(
                select(ServiceDeskTicket).where(
                    ServiceDeskTicket.ticket_id == ticket.id,
                    ServiceDeskTicket.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if sd is None or sd.pending_with == routing.stakeholder_slug:
            return None

        await self.change_pending_with(
            workspace_id,
            str(ticket.id),
            routing.stakeholder_slug,
            changed_by_id=actor_id,
            note=explain(routing, board_name),
            # No scope: the mover is acting on the *task*, and their authority over
            # it was already checked. Scoping here would make the hand-off depend
            # on whether the developer also happens to have desk visibility.
            scope_developer_id=None,
        )
        return routing.stakeholder_slug

    async def _copy_attachments_to_task(self, ticket: Ticket, task) -> None:
        """Put the ticket's files on the task as well.

        The rows *reference* the same stored objects — the storage key is copied,
        not the bytes. Re-uploading would double the storage for every conversion
        and give the two copies different keys, so deleting one would look like it
        had worked while the other still resolved.

        Best-effort: a malformed entry is skipped rather than failing the
        conversion. The task and its link are the point; a missing file
        attachment is visible and fixable, a conversion that 500s is not.
        """
        from aexy.models.sprint import TaskAttachment

        entries = ticket.attachments or []
        if not entries:
            return

        from aexy.services.task_attachment_service import attachment_download_url

        for entry in entries:
            if not isinstance(entry, dict):
                continue
            key = entry.get("key")
            name = entry.get("filename") or entry.get("file_name") or "attachment"
            if not key:
                # An intake attachment that was never streamed to storage — it
                # carries a provider message handle instead, valid only against
                # the message it arrived on. Nothing durable to point a task row
                # at, so it stays on the ticket.
                continue
            attachment_id = str(uuid4())
            self.db.add(
                TaskAttachment(
                    id=attachment_id,
                    task_id=task.id,
                    file_name=str(name)[:500],
                    # Reads go through the backend, so the URL is derived from
                    # the row id rather than presigned; see
                    # task_attachment_service.attachment_download_url.
                    file_url=attachment_download_url(attachment_id)[:2000],
                    # The same stored object as the ticket's copy. Deliberately
                    # not re-uploaded: that would double storage per conversion
                    # and give the two rows different keys, so deleting one would
                    # look like it worked while the other still resolved.
                    storage_key=str(key)[:1024],
                    file_size=entry.get("size") or None,
                    content_type=entry.get("type") or None,
                )
            )
        await self.db.flush()

    # ------------------------------------------------------------- dashboard

    async def get_dashboard(
        self,
        workspace_id: str,
        developer_id: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ):
        """Open tickets bucketed by stakeholder × current-stage age.

        `limit`/`offset` page the **ticket list** only. The stakeholder matrix,
        `total_open` and `breaching` are counts over everything open and stay
        whole-set: a queue board that reported "3 waiting" because that is all
        that fitted on the page would be worse than a long page. So the query
        and the single pass over segments are unchanged, and only the rows
        handed back are sliced.
        """
        from aexy.models.service_desk import ServiceDeskProduct
        from aexy.schemas.service_desk import (
            DashboardTicket,
            ServiceDeskDashboard,
            StakeholderBucket,
        )
        from aexy.services.service_desk_service import resolve_scope_clause

        # seed=False: the dashboard is a read. Seeding here silently gave every
        # workspace the neutral template the first time anyone opened the desk,
        # which pre-empted the first-run template picker and left a taxonomy that
        # was a mix of the default and whatever was chosen afterwards.
        taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
        # "Open" is defined by the workspace's own terminal bucket. A workspace
        # with no taxonomy at all has no terminal bucket, so every ticket counts
        # as open — which is right: none of them have been closed.
        closed_slug = taxonomy.closed_slug

        query = (
            select(ServiceDeskTicket, Ticket, ServiceDeskAccount.name, ServiceDeskProduct.name)
            .join(Ticket, Ticket.id == ServiceDeskTicket.ticket_id)
            .outerjoin(ServiceDeskAccount, ServiceDeskAccount.id == ServiceDeskTicket.account_id)
            .outerjoin(ServiceDeskProduct, ServiceDeskProduct.id == ServiceDeskTicket.product_id)
            .where(ServiceDeskTicket.workspace_id == workspace_id)
            .order_by(Ticket.created_at.desc())
        )
        if closed_slug is not None:
            query = query.where(ServiceDeskTicket.pending_with != closed_slug)
        if developer_id is not None:
            clause = await resolve_scope_clause(self.db, workspace_id, developer_id)
            if clause is not None:
                query = query.where(clause)
        rows = (await self.db.execute(query)).all()

        # Every segment, not just the open one: the breach level now also
        # considers how long a stakeholder has held the ticket in total, so a
        # holding reply that restarts the stage clock cannot hide a chronic delay.
        # ponytail: one pass over the workspace's segments; if a desk ever grows
        # past tens of thousands of open tickets, aggregate this in SQL instead.
        all_segs = (
            await self.db.execute(
                select(
                    TicketPendingSegment.ticket_id,
                    TicketPendingSegment.pending_with,
                    TicketPendingSegment.entered_at,
                    TicketPendingSegment.exited_at,
                ).where(TicketPendingSegment.workspace_id == workspace_id)
            )
        ).all()
        entered_by_ticket = {
            tid: entered for tid, _, entered, exited in all_segs if exited is None
        }

        now = datetime.now(timezone.utc)
        # One read each for the whole dashboard rather than per ticket.
        clock = await load_clock(self.db, workspace_id)
        prefix = await ticket_prefix(self.db, workspace_id)
        cumulative: dict[tuple[str, str], int] = defaultdict(int)
        for tid, stage, entered, exited in all_segs:
            if entered is None:
                continue
            ends = _aware(exited) if exited is not None else now
            cumulative[(tid, stage)] += clock.seconds_between(_aware(entered), ends)
        buckets: dict[str, StakeholderBucket] = {}
        tickets: list[DashboardTicket] = []
        breaching = 0

        for sd, ticket, account_name, product_name in rows:
            # An open ticket should always have an open segment. If the ledger
            # drifted, age from creation rather than reporting 0 days / green —
            # a breach must surface, not be hidden by missing data.
            entered = entered_by_ticket.get(sd.ticket_id) or ticket.created_at
            # Working hours (IST) — the clock the 2-day target is measured on.
            stage_seconds = clock.seconds_between(_aware(entered), now) if entered else 0
            stage_days = clock.to_days(stage_seconds)
            # Overall stays wall clock: that is how long the requester waited.
            overall_days = round(int((now - _aware(ticket.created_at)).total_seconds()) / _DAY, 2)
            level = clock.breach_level(
                stage_seconds,
                sd.pending_with,
                cumulative_working_seconds=cumulative.get((sd.ticket_id, sd.pending_with), 0),
            )

            bucket = buckets.setdefault(sd.pending_with, StakeholderBucket(pending_with=sd.pending_with))
            setattr(bucket, level, getattr(bucket, level) + 1)
            bucket.total += 1
            if level == "red":
                breaching += 1

            fv = ticket.field_values or {}
            tickets.append(
                DashboardTicket(
                    ticket_id=sd.ticket_id,
                    display_id=render_display_id(prefix, ticket.ticket_number),
                    subject=fv.get("subject"),
                    product_name=product_name,
                    account_name=account_name,
                    request_type=sd.request_type,
                    pending_with=sd.pending_with,
                    assigned_owner_id=ticket.assignee_id,
                    days_in_stage=stage_days,
                    overall_days=overall_days,
                    breach_level=level,
                    needs_triage=sd.needs_triage,
                    status=ticket.status,
                )
            )

        # Every open stakeholder gets a column in the workspace's own order, even
        # at zero — the dashboard is a queue board, and a column that vanishes
        # when it empties makes the board reshuffle itself as work moves. The
        # frontend used to impose a hardcoded insurance ordering for this reason.
        ordered = [
            buckets.get(slug) or StakeholderBucket(pending_with=slug)
            for slug in taxonomy.open_slugs
        ]
        # Anything holding a retired slug still has to be visible somewhere.
        ordered += [b for slug, b in buckets.items() if slug not in set(taxonomy.open_slugs)]

        # `total_open` is the count of everything open, so it stays the total
        # even when one page is returned — it is what the pager divides by.
        total_open = len(tickets)
        if limit is not None:
            start = offset or 0
            tickets = tickets[start : start + limit]

        return ServiceDeskDashboard(
            stakeholders=ordered,
            departments=await self._roll_up_by_department(workspace_id, ordered, taxonomy),
            tickets=tickets,
            total_open=total_open,
            breaching=breaching,
        )

    async def _roll_up_by_department(
        self, workspace_id: str, buckets: list, taxonomy
    ) -> list:
        """Fold the bucket board into one row per owning department.

        Three internal buckets owned by two departments is a board that answers
        "which queue" but not "who is behind", which is the question actually
        being asked. Folded from the buckets already computed rather than by
        re-querying, so the two views cannot report different numbers for the same
        tickets.

        External and terminal buckets are kept, grouped under no department:
        nobody internal owes the action on a ticket waiting for a partner, and
        dropping them would make this view quietly sum to less than the other.
        """
        from aexy.schemas.service_desk import DepartmentBucket
        from aexy.services.org_functions import canonical_function_key

        # Only the functions actually in play, so a workspace with thirty
        # departments does not get thirty empty rows.
        wanted: dict[str, str] = {}
        for bucket in buckets:
            st = taxonomy.stakeholder(bucket.pending_with)
            if st is None or st.semantics != "internal" or not st.function_key:
                continue
            canonical = canonical_function_key(st.function_key)
            if canonical:
                wanted[bucket.pending_with] = canonical

        names: dict[str, tuple[str, str]] = {}
        if wanted:
            spellings: set[str] = set()
            for key in set(wanted.values()):
                spellings.update(function_key_spellings(key) or (key,))
            rows = (
                await self.db.execute(
                    select(Department.id, Department.name, Department.function_key).where(
                        Department.workspace_id == workspace_id,
                        Department.is_active.is_(True),
                        Department.function_key.in_(spellings),
                    )
                )
            ).all()
            for dept_id, name, function_key in rows:
                canonical = canonical_function_key(function_key)
                if canonical:
                    names[canonical] = (dept_id, name)

        # Insertion order follows `buckets`, which is already the workspace's own
        # column order — so the two views read down the page the same way.
        out: dict[str | None, DepartmentBucket] = {}
        for bucket in buckets:
            canonical = wanted.get(bucket.pending_with)
            dept_id, dept_name = names.get(canonical, (None, None)) if canonical else (None, None)
            # A function no department claims still groups by that function, so
            # "Engineering has 4 breaching" is visible before anyone has drawn
            # Engineering on the org chart.
            key = dept_id or canonical
            row = out.get(key)
            if row is None:
                row = DepartmentBucket(
                    department_id=dept_id,
                    department_name=dept_name,
                    function_key=canonical,
                )
                out[key] = row
            row.pending_with.append(bucket.pending_with)
            row.green += bucket.green
            row.amber += bucket.amber
            row.red += bucket.red
            row.total += bucket.total
        return list(out.values())

    # --------------------------------------------------------------- closure

    async def _send_closure(self, workspace_id: str, ticket: Ticket, note: str | None) -> None:
        """Queue the closure email to the requester (BRD 9.2), channel-aware.

        Rendered now (it needs the TAT that is only computable here) but *sent* by
        ``flush_notifications()`` after the caller commits.
        """
        if not ticket.submitter_email:
            return
        from aexy.services.service_desk_links import ensure_requester_url
        from aexy.services.service_desk_templates import render_sd, template_references

        display_id = await ticket_prefix_display(self.db, workspace_id, ticket.ticket_number)
        tat = await self.compute_tat(ticket.id, ticket)
        subject, body = await render_sd(
            self.db,
            workspace_id,
            "closure",
            {
                "display_id": display_id,
                "requester_name": ticket.submitter_name or "there",
                "closure_note": note or "Resolved.",
                "overall_days": tat.overall_days,
                # The same link the acknowledgement carried, so a requester who
                # kept the first mail is not handed a second, different address
                # for one ticket. Skipped entirely when this desk's closure copy
                # does not use it — see ``template_references``.
                "ticket_url": (
                    await ensure_requester_url(self.db, ticket)
                    if await template_references(
                        self.db, workspace_id, "closure", "ticket_url"
                    )
                    else ""
                ),
            },
        )
        # The template is editable, so the id cannot be left to the copy: an Ops
        # edit that drops {{display_id}} would send the desk's own mail out with
        # no id in the subject, and every Gmail reply on that thread would inherit
        # a subject the inbound matcher cannot read.
        subject = await force_ticket_id_into_subject(
            self.db, workspace_id, subject, ticket.ticket_number
        )

        # Reply from the mailbox the ticket actually arrived on. This used to pick
        # an arbitrary active Gmail mailbox, so a workspace with more than one
        # would answer from the wrong sender.
        sd = await self._sd(workspace_id, ticket.id)

        self._pending_notifications.append(
            {
                "mailbox_id": sd.mailbox_id,
                "to": ticket.submitter_email,
                "subject": subject,
                "body": body,
                "thread_id": sd.thread_ref,
            }
        )

    # ---------------------------------------------------------- AI accuracy

    async def ai_accuracy(self, workspace_id: str, days: int = 90) -> dict:
        """How often this desk's people agreed with the classifier.

        Measured against ``ai_request_type`` — what the model actually said —
        rather than against the ticket's current value, because a correction
        overwrites that and leaves nothing to compare. Tickets the model never
        read are excluded rather than counted as agreements: a desk that ran
        without AI for a year should not appear to have a perfect classifier.

        "Agreed" is a floor, not a measurement of correctness. A ticket nobody
        looked at counts as agreement, so the real figure is no better than this
        one — which is the honest direction for a number somebody is deciding
        whether to trust.
        """
        since = datetime.now(timezone.utc) - timedelta(days=days)
        rows = (
            await self.db.execute(
                select(
                    ServiceDeskTicket.ai_request_type,
                    ServiceDeskTicket.request_type,
                    func.count().label("n"),
                )
                .where(
                    ServiceDeskTicket.workspace_id == workspace_id,
                    ServiceDeskTicket.ai_request_type.is_not(None),
                    ServiceDeskTicket.created_at >= since,
                )
                .group_by(ServiceDeskTicket.ai_request_type, ServiceDeskTicket.request_type)
            )
        ).all()

        per_type: dict[str, dict[str, int]] = {}
        classified = agreed = 0
        for ai_type, current, count in rows:
            bucket = per_type.setdefault(ai_type, {"classified": 0, "agreed": 0})
            bucket["classified"] += count
            classified += count
            if ai_type == current:
                bucket["agreed"] += count
                agreed += count

        taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
        labels = {r.slug: r.label for r in taxonomy.request_types}
        return {
            "days": days,
            "classified": classified,
            "agreed": agreed,
            # None rather than 100%: a desk with nothing to measure has no
            # accuracy, and showing a perfect score for zero tickets is the
            # single most misleading thing this endpoint could do.
            "agreement_rate": round(agreed / classified, 3) if classified else None,
            "by_request_type": sorted(
                (
                    {
                        "request_type": slug,
                        # Falls back to the slug: a retired request type still
                        # has tickets, and blanking its name loses the row.
                        "label": labels.get(slug, slug),
                        "classified": counts["classified"],
                        "agreed": counts["agreed"],
                        "agreement_rate": round(counts["agreed"] / counts["classified"], 3),
                    }
                    for slug, counts in per_type.items()
                ),
                key=lambda row: row["classified"],
                reverse=True,
            ),
        }

    # ------------------------------------------------------------------ export

    # The header row, and the order the columns come out in. A named tuple of
    # (column, accessor) rather than two parallel lists, because a report whose
    # headings and values drift apart is worse than one that will not generate.
    _EXPORT_COLUMNS: tuple[str, ...] = (
        "Ticket",
        "Created",
        "Status",
        "Request type",
        "Pending with",
        "Origin",
        "Account",
        "Product",
        "Vendor",
        "Owner",
        "Requester name",
        "Requester email",
        "Subject",
        "Needs triage",
        "AI confidence",
        "Working days in stage",
        "Days open",
        "Breaching",
    )

    async def export_csv(
        self,
        workspace_id: str,
        developer_id: str | None = None,
        assigned_to: str | None = None,
        filters=None,
    ) -> tuple[str, str]:
        """The filtered ticket list as CSV text, plus a filename.

        Turnaround is computed the way the digest computes it — one query for the
        open segments and one clock for the whole export, rather than
        ``compute_tat`` per row, which is a query per ticket and would turn a
        month's export into thousands of round trips.

        Stage age is *working* time in the workspace's own hours, because that is
        what the desk is measured against; days open is wall clock, because that
        is what the requester waited.
        """
        import csv
        import io

        from aexy.services.service_desk_service import ServiceDeskService

        rows = await ServiceDeskService(self.db).list_tickets(
            workspace_id,
            developer_id=developer_id,
            assigned_to=assigned_to,
            filters=filters,
        )
        open_entered = dict(
            (
                await self.db.execute(
                    select(
                        TicketPendingSegment.ticket_id,
                        TicketPendingSegment.entered_at,
                    ).where(
                        TicketPendingSegment.workspace_id == workspace_id,
                        TicketPendingSegment.exited_at.is_(None),
                    )
                )
            ).all()
        )
        created_at = {
            ticket_id: created
            for ticket_id, created in (
                await self.db.execute(
                    select(Ticket.id, Ticket.created_at).where(
                        Ticket.id.in_([r.ticket_id for r in rows])
                    )
                )
            ).all()
        } if rows else {}

        clock = await load_clock(self.db, workspace_id)
        now = datetime.now(timezone.utc)

        buffer = io.StringIO()
        # QUOTE_ALL so a subject containing a comma, a quote or a newline cannot
        # shift every later column of that row — a desk's subjects are whatever
        # its requesters typed.
        writer = csv.writer(buffer, quoting=csv.QUOTE_ALL, lineterminator="\r\n")
        writer.writerow(self._EXPORT_COLUMNS)

        for row in rows:
            entered = open_entered.get(row.ticket_id)
            stage_seconds = (
                clock.seconds_between(_aware(entered), now) if entered is not None else 0
            )
            created = created_at.get(row.ticket_id)
            days_open = (
                round((now - _aware(created)).total_seconds() / 86400, 2)
                if created is not None
                else ""
            )
            writer.writerow(
                [
                    row.display_id or "",
                    _aware(created).isoformat() if created is not None else "",
                    row.status or "",
                    row.request_type,
                    row.pending_with,
                    row.origin,
                    row.account_name or "",
                    row.product_name or "",
                    row.vendor_name or "",
                    row.assigned_owner_name or "",
                    row.requester_name or "",
                    row.requester_email or "",
                    row.subject or "",
                    "yes" if row.needs_triage else "no",
                    "" if row.ai_confidence is None else round(row.ai_confidence, 2),
                    clock.to_days(stage_seconds) if entered is not None else "",
                    days_open,
                    "yes" if clock.is_breaching(stage_seconds, row.pending_with) else "no",
                ]
            )

        prefix = await ticket_prefix(self.db, workspace_id)
        filename = f"{prefix.lower()}-tickets-{now.date().isoformat()}.csv"
        # A BOM so Excel opens a UTF-8 file as UTF-8. Without it, a requester
        # named in any non-Latin script arrives as mojibake in the one tool most
        # of these exports are opened in.
        return "﻿" + buffer.getvalue(), filename
