"""Service Desk daily digest — per-KAM + Ops Head open-ticket summaries.

Each KAM receives their own open tickets; the Ops Head (the Ops/KAM
department head, else the workspace owner) receives all open tickets. Sent on a
fixed schedule (see temporal/activities/service_desk.py) and reusable on demand.

See ``prds/BIMAPLAN_SERVICE_DESK_PLAN.md`` §7 item 3.
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import Department, DepartmentMember
from aexy.models.service_desk import (
    PendingWith,
    ServiceDeskLOB,
    ServiceDeskMailbox,
    ServiceDeskPartner,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket
from aexy.models.workspace import Workspace
from aexy.services.service_desk_clock import load_clock

logger = logging.getLogger(__name__)

_DAY = 86400.0
TICKET_PREFIX = "BSD"


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@dataclass
class DigestRow:
    display_id: str
    partner: str | None
    lob: str | None
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
    is_ops_head: bool
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
        rows = (
            await self.db.execute(
                select(ServiceDeskTicket, Ticket, ServiceDeskPartner.name, ServiceDeskLOB.name)
                .join(Ticket, Ticket.id == ServiceDeskTicket.ticket_id)
                .outerjoin(ServiceDeskPartner, ServiceDeskPartner.id == ServiceDeskTicket.partner_id)
                .outerjoin(ServiceDeskLOB, ServiceDeskLOB.id == ServiceDeskTicket.lob_id)
                .where(
                    ServiceDeskTicket.workspace_id == workspace_id,
                    ServiceDeskTicket.pending_with != PendingWith.CLOSED.value,
                )
            )
        ).all()
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
        out: list[DigestRow] = []
        for sd, ticket, partner_name, lob_name in rows:
            entered = open_segs.get(sd.ticket_id)
            # Working hours (IST), matching the dashboard and ticket detail — a
            # digest that counted nights and weekends would page a KAM at 09:00
            # about a ticket that has had no working time yet.
            stage_seconds = clock.seconds_between(_aware(entered), now) if entered else 0
            stage_days = clock.to_days(stage_seconds)
            overall_days = round(int((now - _aware(ticket.created_at)).total_seconds()) / _DAY, 2)
            out.append(
                DigestRow(
                    display_id=f"{TICKET_PREFIX}-{ticket.ticket_number}",
                    partner=partner_name,
                    lob=lob_name,
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

        # Ops/KAM department: members are KAM recipients, head is Ops Head
        dept = (
            await self.db.execute(
                select(Department).where(
                    Department.workspace_id == workspace_id,
                    Department.function_key == "ops_kam",
                )
            )
        ).scalar_one_or_none()

        digests: list[Digest] = []
        kam_ids: list[str] = []
        if dept is not None:
            member_ids = (
                await self.db.execute(
                    select(DepartmentMember.developer_id).where(DepartmentMember.department_id == dept.id)
                )
            ).scalars().all()
            kam_ids = list(member_ids)
            for dev_id in kam_ids:
                dev = await self.db.get(Developer, dev_id)
                if not dev or not dev.email:
                    continue
                rows = [r for r in all_rows if r.assignee_id == dev_id]
                digests.append(Digest(dev.email, dev.name or dev.email, False, rows))

        # Ops Head: department head, else workspace owner
        ops_head_id = dept.head_id if dept else None
        if not ops_head_id:
            ops_head_id = (
                await self.db.execute(select(Workspace.owner_id).where(Workspace.id == workspace_id))
            ).scalar_one_or_none()
        if ops_head_id:
            head = await self.db.get(Developer, ops_head_id)
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
                f"  {r.display_id} | {r.partner or '—'} | {r.lob or '—'} | {r.request_type} | "
                f"pending: {r.pending_with} | {r.days_in_stage} working days in stage | "
                f"{r.overall_days}d overall{flag}"
            )
        return "\n".join(lines)

    async def send_workspace_digests(self, workspace_id: str, date_label: str | None = None) -> int:
        from aexy.services.email_service import EmailService
        from aexy.services.service_desk_templates import render_sd

        date_label = date_label or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        digests = await self.build_digests(workspace_id)
        sent = 0
        for d in digests:
            subject, body = await render_sd(
                self.db,
                workspace_id,
                "digest",
                {
                    "recipient_name": d.recipient_name,
                    "scope": "across all KAMs" if d.is_ops_head else "assigned to you",
                    "total_open": d.total_open,
                    "breaching": d.breaching,
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

    async def send_all(self) -> int:
        """Send digests for every workspace that has a service-desk mailbox."""
        workspace_ids = (
            await self.db.execute(select(ServiceDeskMailbox.workspace_id).distinct())
        ).scalars().all()
        total = 0
        for ws_id in workspace_ids:
            total += await self.send_workspace_digests(ws_id)
        return total
