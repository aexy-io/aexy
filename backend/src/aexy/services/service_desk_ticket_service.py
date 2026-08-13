"""Service Desk ticket lifecycle — Pending-With transitions + TAT.

Every ``pending_with`` change closes the open ledger segment (recording its
duration) and opens a new one, so stakeholder-wise TAT is computable from the
ledger. Closing sets the ticket closed + fires the closure email.

"""

import logging
from collections import defaultdict
from datetime import datetime, timezone
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
    TicketEmailRecipient,
    TicketFieldsUpdate,
    TicketTAT,
)

logger = logging.getLogger(__name__)

_DAY = 86400.0


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
            subject=str(field_values.get("subject") or ""),
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

    async def email_stakeholder(
        self,
        workspace_id: str,
        ticket_id: str,
        to_email: str,
        subject: str,
        body: str,
        sender_id: str,
        attachment_filenames: list[str] | None = None,
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
        subject = await force_ticket_id_into_subject(
            self.db, workspace_id, subject, ticket.ticket_number
        )

        requester = (ticket.submitter_email or "").strip().lower()
        thread_id = sd.thread_ref if requester and recipient == requester else None

        # Fetched before the send, so a missing file fails the whole action
        # rather than delivering a message that promises an attachment.
        files = await self._load_forward_bytes(sd, ticket, attachment_filenames or [])

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
            )
        )
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
            account_id=sd.account_id,
            account_name=account_name,
            vendor_id=sd.vendor_id,
            assigned_owner_id=ticket.assignee_id,
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
            attachments=[
                TicketAttachment(
                    index=index,
                    filename=str(item.get("filename") or "attachment"),
                    content_type=item.get("content_type"),
                    size_bytes=item.get("size_bytes"),
                    can_forward=bool(item.get("attachment_id")),
                )
                for index, item in enumerate(self._ticket_attachments(ticket))
            ],
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
        task_title = title or fv.get("subject") or f"Ticket #{ticket.ticket_number}"
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
        )
        self.db.add(task)
        await self.db.flush()

        ticket.linked_task_id = task.id
        await self.db.flush()
        return {"task_id": task.id, "task_title": task_title, "linked": True}

    # ------------------------------------------------------------- dashboard

    async def get_dashboard(self, workspace_id: str, developer_id: str | None = None):
        """Open tickets bucketed by stakeholder × current-stage age."""
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

        return ServiceDeskDashboard(
            stakeholders=ordered,
            tickets=tickets,
            total_open=len(tickets),
            breaching=breaching,
        )

    # --------------------------------------------------------------- closure

    async def _send_closure(self, workspace_id: str, ticket: Ticket, note: str | None) -> None:
        """Queue the closure email to the requester (BRD 9.2), channel-aware.

        Rendered now (it needs the TAT that is only computable here) but *sent* by
        ``flush_notifications()`` after the caller commits.
        """
        if not ticket.submitter_email:
            return
        from aexy.services.service_desk_templates import render_sd

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
