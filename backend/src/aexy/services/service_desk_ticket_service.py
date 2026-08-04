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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.service_desk import (
    ServiceDeskAccount,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket, TicketResponse, TicketStatus
from aexy.schemas.service_desk import (
    SegmentResponse,
    ServiceDeskTicketDetail,
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


from aexy.services.service_desk_clock import load_clock  # noqa: E402
from aexy.services.service_desk_config import (  # noqa: E402
    display_id as render_display_id,
    ticket_prefix,
    ticket_prefix_display,
)
from aexy.services.service_desk_taxonomy import load_taxonomy  # noqa: E402


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

    async def flush_notifications(self) -> None:
        """Send queued closure mail. Call AFTER committing; never raises."""
        pending, self._pending_notifications = self._pending_notifications, []
        if not pending:
            return
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

    # ------------------------------------------------------------------ loads

    async def _sd(
        self, workspace_id: str, ticket_id: str, developer_id: str | None = None
    ) -> ServiceDeskTicket:
        """Load a ticket's SD extension, enforcing row-level visibility.

        ``developer_id`` applies the same scope clause the list and dashboard use.
        Without it, a KAM restricted to their own queue could still read or mutate
        any ticket in the workspace by id — the list was scoped but the by-id
        paths were not. 404 (not 403) so ids outside scope stay unenumerable.
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
        return sd

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
        sd = await self._sd(workspace_id, ticket_id, developer_id=scope_developer_id)
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

        return await self.get_detail(workspace_id, ticket_id)

    async def update_fields(
        self,
        workspace_id: str,
        ticket_id: str,
        data: TicketFieldsUpdate,
        scope_developer_id: str | None = None,
    ) -> ServiceDeskTicketDetail:
        sd = await self._sd(workspace_id, ticket_id, developer_id=scope_developer_id)
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

        for k, v in payload.items():
            setattr(sd, k, v)
        if assigned is not None:
            ticket = await self.db.get(Ticket, ticket_id)
            if ticket is not None:
                ticket.assignee_id = assigned
        await self.db.flush()
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
            breach_level=clock.breach_level(current_seconds) if current_pending else "green",
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
            segments=[SegmentResponse.model_validate(s) for s in segments],
            tat=tat,
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
        sd = await self._sd(workspace_id, ticket_id, developer_id=scope_developer_id)
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

        # open segments keyed by ticket for current-stage age
        open_segs = (
            await self.db.execute(
                select(TicketPendingSegment.ticket_id, TicketPendingSegment.entered_at).where(
                    TicketPendingSegment.workspace_id == workspace_id,
                    TicketPendingSegment.exited_at.is_(None),
                )
            )
        ).all()
        entered_by_ticket = {tid: entered for tid, entered in open_segs}

        now = datetime.now(timezone.utc)
        # One read each for the whole dashboard rather than per ticket.
        clock = await load_clock(self.db, workspace_id)
        prefix = await ticket_prefix(self.db, workspace_id)
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
            level = clock.breach_level(stage_seconds)

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
