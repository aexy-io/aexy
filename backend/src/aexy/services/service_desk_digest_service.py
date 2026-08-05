"""Service Desk daily digest — per-owner + desk-lead open-ticket summaries.

Each member of the desk team receives their own open tickets; the desk lead (that
department's head, else the workspace owner) receives all open tickets. Sent on
the workspace's own schedule (see temporal/activities/service_desk.py) and
reusable on demand.

"The desk team" is resolved from the workspace's taxonomy — the department behind
its first internal stakeholder — rather than from a hardcoded ``ops_kam``
function key, which only existed in one customer's org chart.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import DepartmentMember
from aexy.models.service_desk import (
    ServiceDeskProduct,
    ServiceDeskMailbox,
    ServiceDeskAccount,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.service_desk_clock import DEFAULT_DIGEST_HOURS, load_clock
from aexy.services.service_desk_config import display_id, ticket_prefix
from aexy.services.service_desk_taxonomy import load_taxonomy

logger = logging.getLogger(__name__)

_DAY = 86400.0


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@dataclass
class DigestRow:
    display_id: str
    account: str | None
    product: str | None
    request_type: str
    pending_with: str
    days_in_stage: float
    overall_days: float
    breaching: bool
    assignee_id: str | None


@dataclass
class Digest:
    recipient_email: str
    recipient_name: str
    is_desk_lead: bool
    rows: list[DigestRow] = field(default_factory=list)

    @property
    def total_open(self) -> int:
        return len(self.rows)

    @property
    def breaching(self) -> int:
        return sum(1 for r in self.rows if r.breaching)


class ServiceDeskDigestService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _open_rows(self, workspace_id: str) -> list[DigestRow]:
        # seed=False: the digest walks every workspace on a schedule, and a
        # read-only report has no business creating taxonomy rows as a side effect.
        taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
        closed_slug = taxonomy.closed_slug

        query = (
            select(ServiceDeskTicket, Ticket, ServiceDeskAccount.name, ServiceDeskProduct.name)
            .join(Ticket, Ticket.id == ServiceDeskTicket.ticket_id)
            .outerjoin(ServiceDeskAccount, ServiceDeskAccount.id == ServiceDeskTicket.account_id)
            .outerjoin(ServiceDeskProduct, ServiceDeskProduct.id == ServiceDeskTicket.product_id)
            .where(ServiceDeskTicket.workspace_id == workspace_id)
        )
        if closed_slug is not None:
            query = query.where(ServiceDeskTicket.pending_with != closed_slug)
        rows = (await self.db.execute(query)).all()
        open_segs = dict(
            (
                await self.db.execute(
                    select(TicketPendingSegment.ticket_id, TicketPendingSegment.entered_at).where(
                        TicketPendingSegment.workspace_id == workspace_id,
                        TicketPendingSegment.exited_at.is_(None),
                    )
                )
            ).all()
        )
        now = datetime.now(timezone.utc)
        clock = await load_clock(self.db, workspace_id)
        # Resolved once for the whole digest — a lookup per row would be a query
        # per open ticket.
        prefix = await ticket_prefix(self.db, workspace_id)
        out: list[DigestRow] = []
        for sd, ticket, account_name, product_name in rows:
            entered = open_segs.get(sd.ticket_id)
            # Working hours in the workspace's timezone, matching the dashboard
            # and ticket detail — a digest that counted nights and weekends would
            # flag a ticket that has had no working time yet.
            stage_seconds = clock.seconds_between(_aware(entered), now) if entered else 0
            stage_days = clock.to_days(stage_seconds)
            overall_days = round(int((now - _aware(ticket.created_at)).total_seconds()) / _DAY, 2)
            out.append(
                DigestRow(
                    display_id=display_id(prefix, ticket.ticket_number),
                    account=account_name,
                    product=product_name,
                    request_type=sd.request_type,
                    pending_with=sd.pending_with,
                    days_in_stage=stage_days,
                    overall_days=overall_days,
                    breaching=clock.is_breaching(stage_seconds),
                    assignee_id=ticket.assignee_id,
                )
            )
        return out

    async def build_digests(self, workspace_id: str) -> list[Digest]:
        all_rows = await self._open_rows(workspace_id)

        # The desk team: its members get a personal digest, its head gets the lot.
        # The department named in Service Desk settings, or — with none named — the
        # one behind the desk's first internal queue. Deliberately the same
        # resolution intake uses to pick an owner: a workspace where the digest and
        # auto-assignment disagreed about who runs the desk would be worse than
        # either answer on its own.
        #
        # Was pinned to `function_key == "ops_kam"`, so any workspace that didn't
        # happen to name a department that way got no per-person digests at all.
        from aexy.services.service_desk_service import resolve_desk_department

        dept = await resolve_desk_department(self.db, workspace_id)

        digests: list[Digest] = []
        owner_ids: list[str] = []
        if dept is not None:
            # Only people still on the team. Department rows are not removed when
            # someone leaves the workspace (which is exactly why intake's
            # `_random_owner` joins WorkspaceMember), so without this a departed
            # employee keeps receiving the desk's open-ticket list three times a
            # day — including ticket subjects and account names.
            member_ids = (
                await self.db.execute(
                    select(DepartmentMember.developer_id)
                    .join(
                        WorkspaceMember,
                        (WorkspaceMember.developer_id == DepartmentMember.developer_id)
                        & (WorkspaceMember.workspace_id == workspace_id),
                    )
                    .where(
                        DepartmentMember.department_id == dept.id,
                        WorkspaceMember.status == "active",
                    )
                    .distinct()
                )
            ).scalars().all()
            owner_ids = list(member_ids)
            for dev_id in owner_ids:
                dev = await self.db.get(Developer, dev_id)
                if not dev or not dev.email:
                    continue
                rows = [r for r in all_rows if r.assignee_id == dev_id]
                digests.append(Digest(dev.email, dev.name or dev.email, False, rows))

        # Desk lead: department head, else workspace owner
        desk_lead_id = dept.head_id if dept else None
        if not desk_lead_id:
            desk_lead_id = (
                await self.db.execute(select(Workspace.owner_id).where(Workspace.id == workspace_id))
            ).scalar_one_or_none()
        if desk_lead_id:
            head = await self.db.get(Developer, desk_lead_id)
            if head and head.email:
                digests.append(Digest(head.email, head.name or head.email, True, list(all_rows)))

        return digests

    @staticmethod
    def tickets_block(digest: Digest) -> str:
        """The per-ticket lines injected into the (editable) digest template."""
        if not digest.rows:
            return "  (no open tickets)"
        lines = []
        for r in digest.rows:
            flag = " ⚠" if r.breaching else ""
            lines.append(
                f"  {r.display_id} | {r.account or '—'} | {r.product or '—'} | {r.request_type} | "
                f"pending: {r.pending_with} | {r.days_in_stage} working days in stage | "
                f"{r.overall_days}d overall{flag}"
            )
        return "\n".join(lines)

    async def send_workspace_digests(self, workspace_id: str, date_label: str | None = None) -> int:
        from aexy.services.email_service import EmailService
        from aexy.services.service_desk_templates import render_sd

        date_label = date_label or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        digests = await self.build_digests(workspace_id)
        # The copy quotes the breach threshold, which is per workspace now.
        clock = await load_clock(self.db, workspace_id)
        sent = 0
        for d in digests:
            subject, body = await render_sd(
                self.db,
                workspace_id,
                "digest",
                {
                    "recipient_name": d.recipient_name,
                    "scope": "across the whole desk" if d.is_desk_lead else "assigned to you",
                    "total_open": d.total_open,
                    "breaching": d.breaching,
                    "breach_days": clock.breach_red_days,
                    "tickets_block": self.tickets_block(d),
                    "date": date_label,
                },
            )
            try:
                await EmailService().send_templated_email(
                    db=self.db, recipient_email=d.recipient_email, subject=subject, body_text=body
                )
                sent += 1
            except Exception as exc:  # noqa: BLE001 — digest send is best-effort
                logger.info("Service desk: digest to %s skipped (%s)", d.recipient_email, exc)
        return sent

    async def is_due(self, workspace_id: str, now: datetime | None = None) -> bool:
        """Whether this workspace's local clock has just reached a digest hour.

        The schedule fires every half hour for the whole deployment; *when* a desk
        gets its digest is the workspace's own setting, read in the workspace's own
        timezone. Previously one cron sent every digest at 09:00/13:00/17:00
        Asia/Kolkata regardless of where the desk was.

        ``minute < 30`` keeps each hour to a single window, so the 09:00 and 09:30
        firings can't both send the 9 o'clock digest.
        """
        clock = await load_clock(self.db, workspace_id)
        sd = await self._settings(workspace_id)
        hours = sd.get("digest_hours")
        if not isinstance(hours, list) or not hours:
            hours = list(DEFAULT_DIGEST_HOURS)
        local = (now or datetime.now(timezone.utc)).astimezone(clock.tz)
        return local.hour in {h for h in hours if isinstance(h, int)} and local.minute < 30

    async def _settings(self, workspace_id: str) -> dict:
        ws = await self.db.get(Workspace, workspace_id)
        return ((ws.settings or {}).get("service_desk") or {}) if ws else {}

    async def send_all(self, now: datetime | None = None, only_due: bool = True) -> int:
        """Send digests for every workspace whose local digest hour has arrived.

        Each workspace is isolated: the per-email send was already guarded, but a
        failure in `build_digests` or template rendering escaped and aborted the
        whole activity, so one workspace with (say) a malformed template silently
        cost every workspace after it in the list its digest.

        ``only_due=False`` sends for every desk regardless of the clock — used by
        the "send now" action, not by the schedule.
        """
        workspace_ids = (
            await self.db.execute(select(ServiceDeskMailbox.workspace_id).distinct())
        ).scalars().all()
        total = 0
        for ws_id in workspace_ids:
            try:
                if only_due and not await self.is_due(ws_id, now):
                    continue
                total += await self.send_workspace_digests(ws_id)
            except Exception:  # noqa: BLE001 — one bad workspace must not stop the rest
                logger.exception("Service desk: digest failed for workspace %s", ws_id)
                # The session may need a rollback before the next workspace's
                # queries can run.
                await self.db.rollback()
        return total
