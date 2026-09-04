"""The Ticket TAT report: one row per ticket, with the hand-off ledger folded in.

The ticket list answers "which tickets" and the analytics service answers "how
much, grouped by what". Neither answers the question a desk review actually
opens with — *where did this ticket's time go* — because that needs the pending
ledger unfolded per stakeholder, alongside the measures that describe the shape
of a ticket's life: how many times it changed hands, whether it came back after
being closed, and how long its worst single stage ran.

Two properties matter more than the columns:

* **The stakeholder columns are not a fixed list.** A fixed set would be right
  for one desk and wrong for every other. Here there is one column per row in
  ``service_desk_stakeholders``, in the workspace's own order and wording, so
  adding a Legal bucket adds a column and no code changes. That is why the report
  returns column *descriptors* alongside its rows.

* **The fold is shared with the scorecard.** Every KPI on the owner scorecard is
  an aggregation of these same per-ticket figures, so both reports read one
  implementation of "what is a handshake". Defining that twice is how the digest
  service, the ticket service and an email template ended up holding three
  different breach thresholds before ``Clock`` existed.

Working time versus wall clock, carried in the units rather than assumed: stage
and stakeholder figures accrue only during the workspace's working hours,
because that is what the desk is measured against; overall TAT is elapsed time,
because the requester waited through the night and the weekend too. The same
split ``compute_tat`` already draws for a single ticket.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.service_desk import (
    ServiceDeskAccount,
    ServiceDeskProduct,
    ServiceDeskTicket,
    ServiceDeskVendor,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket
from aexy.services.service_desk_clock import Clock, load_clock
from aexy.services.service_desk_config import display_id, ticket_prefix
from aexy.services.service_desk_taxonomy import Taxonomy, load_taxonomy

logger = logging.getLogger(__name__)

_HOUR = 3600.0
_DAY = 86400.0


@dataclass
class TicketReportRow:
    """One ticket, with its ledger folded down.

    Seconds throughout, converted at the edge. A field called ``hours`` holding
    seconds is how a later measure silently comes out 3600x wrong.
    """

    ticket_id: str
    display_id: str
    subject: str
    product: str | None
    account: str | None
    vendor: str | None
    request_type: str
    owner_id: str | None
    owner: str | None
    pending_with: str | None
    created_at: datetime
    closed_at: datetime | None
    is_closed: bool

    # Working seconds per stakeholder slug. Closed segments are excluded — time
    # "in" the terminal bucket is not time anyone owed an action.
    stakeholder_seconds: dict[str, int] = field(default_factory=dict)

    # Wall clock: what the requester actually waited.
    overall_seconds: int = 0
    # Working time in the bucket the ticket sits in now, and its breach level.
    current_stage_seconds: int = 0
    breach_level: str = "green"

    # The shape of the ticket's life.
    handshakes: int = 0
    reopened: bool = False
    max_stage_seconds: int = 0
    zero_breach: bool = True
    # Working seconds of the very first segment — the desk's first move on the
    # request. None when the ticket has no ledger at all, which should not
    # happen but must not crash a report if it does.
    first_response_seconds: int | None = None

    @property
    def status(self) -> str:
        return "Closed" if self.is_closed else "Open"


def _aware(value: datetime) -> datetime:
    """Treat naive datetimes (SQLite) as UTC so arithmetic is safe."""
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def fold_ticket(
    sd: ServiceDeskTicket,
    ticket: Ticket,
    segments: list[TicketPendingSegment],
    clock: Clock,
    taxonomy: Taxonomy,
    now: datetime,
    *,
    prefix: str,
    account: str | None = None,
    product: str | None = None,
    vendor: str | None = None,
    owner: str | None = None,
) -> TicketReportRow:
    """Fold one ticket's segments into every derived measure, in one pass.

    Pure, and takes its clock and taxonomy rather than loading them, so a caller
    with a thousand tickets loads each once. ``segments`` must be this ticket's
    own, ordered by ``entered_at``.
    """
    stakeholder: dict[str, int] = defaultdict(int)
    current_seconds = 0
    max_stage = 0
    closed_visits = 0
    first_response: int | None = None

    for index, seg in enumerate(segments):
        entered = _aware(seg.entered_at)
        ends = _aware(seg.exited_at) if seg.exited_at is not None else now
        duration = clock.seconds_between(entered, ends)
        is_closed_bucket = taxonomy.is_closed(seg.pending_with)

        if is_closed_bucket:
            # Counting *visits* to the terminal bucket, not segments after it:
            # a ticket closed, reopened and closed again has been here twice.
            closed_visits += 1
        else:
            stakeholder[seg.pending_with] += duration
            # The longest single stage anyone was ever waiting on. Time in the
            # closed bucket is excluded or every closed ticket would breach on
            # the strength of having stayed closed.
            max_stage = max(max_stage, duration)

        if index == 0:
            first_response = duration
        if seg.exited_at is None:
            current_seconds = duration

    # Total hand-offs is the event count minus one: the creation of the
    # ticket is not a hand-off. Floored at zero so a ticket with no ledger reads
    # as never handed over rather than as -1.
    handshakes = max(0, len(segments) - 1)

    end = _aware(ticket.closed_at) if ticket.closed_at else now
    overall = int((end - _aware(ticket.created_at)).total_seconds())

    # Zero-breach asks whether the worst single stage stayed inside the desk's
    # own target. That target is `clock.breach_red_days` — the same setting the
    # dashboard, the digest and the ticket detail read. A literal 48 hours here
    # would reintroduce exactly the constant this module exists without, and
    # would also silently mean a different thing, since the clock counts working
    # hours rather than elapsed ones.
    working_day = clock.working_day_seconds
    zero_breach = (max_stage / working_day) <= clock.breach_red_days if working_day else True

    return TicketReportRow(
        ticket_id=sd.ticket_id,
        display_id=display_id(prefix, ticket.ticket_number),
        subject=ticket.title or "",
        product=product,
        account=account,
        vendor=vendor,
        request_type=sd.request_type,
        owner_id=ticket.assignee_id,
        owner=owner,
        pending_with=sd.pending_with,
        created_at=_aware(ticket.created_at),
        closed_at=_aware(ticket.closed_at) if ticket.closed_at else None,
        is_closed=taxonomy.is_closed(sd.pending_with),
        stakeholder_seconds=dict(stakeholder),
        overall_seconds=overall,
        current_stage_seconds=current_seconds,
        breach_level=clock.breach_level(
            current_seconds,
            sd.pending_with,
            cumulative_working_seconds=stakeholder.get(sd.pending_with, 0),
        )
        if not taxonomy.is_closed(sd.pending_with)
        else "green",
        handshakes=handshakes,
        reopened=closed_visits > 1,
        max_stage_seconds=max_stage,
        zero_breach=zero_breach,
        first_response_seconds=first_response,
    )


class ServiceDeskReporting:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def collect(
        self,
        workspace_id: str,
        developer_id: str | None = None,
        filters=None,
        assigned_to: str | None = None,
    ) -> tuple[list[TicketReportRow], Clock, Taxonomy]:
        """The folded rows for one scoped, filtered set of tickets.

        Two queries regardless of how many tickets come back: one for the
        tickets, one for every segment belonging to them. ``compute_tat`` per row
        would be a round trip each, which turns a quarter's report into thousands
        of them — the same reason ``export_csv`` does not call it either.
        """
        from aexy.services.service_desk_service import ServiceDeskService

        query = await ServiceDeskService(self.db).scoped_ticket_query(
            workspace_id,
            developer_id,
            assigned_to,
            filters,
            select(
                ServiceDeskTicket,
                Ticket,
                ServiceDeskAccount.name,
                ServiceDeskProduct.name,
                ServiceDeskVendor.name,
                Developer.name,
                Developer.email,
            ),
        )
        rows = (await self.db.execute(query)).all()
        if not rows:
            return (
                [],
                await load_clock(self.db, workspace_id),
                await load_taxonomy(self.db, workspace_id, seed=False),
            )

        ticket_ids = [sd.ticket_id for sd, *_ in rows]
        segments: dict[str, list[TicketPendingSegment]] = defaultdict(list)
        for seg in (
            (
                await self.db.execute(
                    select(TicketPendingSegment)
                    .where(TicketPendingSegment.ticket_id.in_(ticket_ids))
                    .order_by(TicketPendingSegment.ticket_id, TicketPendingSegment.entered_at)
                )
            )
            .scalars()
            .all()
        ):
            segments[seg.ticket_id].append(seg)

        clock = await load_clock(self.db, workspace_id)
        taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
        prefix = await ticket_prefix(self.db, workspace_id)
        now = datetime.now(timezone.utc)

        folded = [
            fold_ticket(
                sd,
                ticket,
                segments.get(sd.ticket_id, []),
                clock,
                taxonomy,
                now,
                prefix=prefix,
                account=account_name,
                product=product_name,
                vendor=vendor_name,
                owner=owner_name or owner_email,
            )
            for sd, ticket, account_name, product_name, vendor_name, owner_name, owner_email in rows
        ]
        return folded, clock, taxonomy

    async def tat_report(
        self,
        workspace_id: str,
        developer_id: str | None = None,
        filters=None,
    ) -> dict:
        """Column descriptors plus one row per ticket.

        The descriptors are the point of returning a dict rather than a list of
        models: the stakeholder columns depend on the workspace's taxonomy, so a
        client that hard-coded a column list would be wrong for every desk but
        the one it was written against.
        """
        rows, clock, taxonomy = await self.collect(workspace_id, developer_id, filters)
        columns = _columns(taxonomy)
        return {
            "columns": columns,
            "rows": [_serialise(row, taxonomy, clock) for row in rows],
            "total": len(rows),
            # So a reader can tell what "1.5 days in stage" was measured against
            # without opening the settings page.
            "working_day_hours": round(clock.working_day_seconds / _HOUR, 2),
            "breach_red_days": clock.breach_red_days,
        }

    async def export_tat_csv(
        self,
        workspace_id: str,
        developer_id: str | None = None,
        filters=None,
    ) -> tuple[str, str]:
        """The TAT report as CSV, built from the same descriptors as the screen."""
        import csv
        import io

        report = await self.tat_report(workspace_id, developer_id, filters)
        columns = report["columns"]

        buffer = io.StringIO()
        # QUOTE_ALL so a subject containing a comma, a quote or a newline cannot
        # shift every later column of that row.
        writer = csv.writer(buffer, quoting=csv.QUOTE_ALL, lineterminator="\r\n")
        writer.writerow([c["label"] for c in columns])
        for row in report["rows"]:
            writer.writerow([_csv_cell(row.get(c["key"])) for c in columns])

        prefix = await ticket_prefix(self.db, workspace_id)
        stamp = datetime.now(timezone.utc).date().isoformat()
        # A BOM so Excel opens a UTF-8 file as UTF-8, matching the ticket export.
        return "﻿" + buffer.getvalue(), f"{prefix.lower()}-tat-report-{stamp}.csv"


def _csv_cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "yes" if value else "no"
    return str(value)


def _columns(taxonomy: Taxonomy) -> list[dict]:
    """The report's shape, in the workspace's own vocabulary.

    ``unit`` is carried so a client can render 18.5 hours and 18.5 working days
    differently, and so a CSV heading can say which clock a figure came from
    without the reader having to know.
    """
    term = taxonomy.term

    columns: list[dict] = [
        {"key": "display_id", "label": "Ticket ID", "unit": "text"},
        {"key": "subject", "label": "Subject", "unit": "text"},
        {"key": "product", "label": term("product"), "unit": "text"},
        {"key": "account", "label": term("account"), "unit": "text"},
        {"key": "vendor", "label": term("vendor"), "unit": "text"},
        {"key": "request_type", "label": "Request Type", "unit": "text"},
        {"key": "owner", "label": term("owner"), "unit": "text"},
        {"key": "pending_with", "label": "Current Pending With", "unit": "text"},
        {"key": "created_at", "label": "Created At", "unit": "datetime"},
        {"key": "closed_at", "label": "Closed At", "unit": "datetime"},
        {"key": "status", "label": "Status", "unit": "text"},
    ]

    # One column per stakeholder, in the workspace's order and wording. The
    # terminal bucket is skipped: time spent closed is not time owed.
    for s in taxonomy.stakeholders:
        if taxonomy.is_closed(s.slug):
            continue
        columns.append(
            {
                "key": f"stakeholder.{s.slug}",
                "label": f"{s.label} (hrs)",
                "unit": "working_hours",
                "stakeholder": s.slug,
            }
        )

    columns += [
        {"key": "overall_hours", "label": "Overall TAT (hrs)", "unit": "elapsed_hours"},
        {"key": "overall_days", "label": "Overall TAT (days)", "unit": "elapsed_days"},
        {"key": "stage_days", "label": "Days in Current Stage", "unit": "working_days"},
        {"key": "breach_level", "label": "Breach Flag", "unit": "text"},
        {"key": "handshakes", "label": "Total Handshakes", "unit": "count"},
        {"key": "reopened", "label": "Reopened?", "unit": "boolean"},
        {"key": "max_stage_hours", "label": "Max Single-Stage Duration (hrs)", "unit": "working_hours"},
        {"key": "zero_breach", "label": "Zero-Breach?", "unit": "boolean"},
    ]
    return columns


def _serialise(row: TicketReportRow, taxonomy: Taxonomy, clock: Clock) -> dict:
    out: dict = {
        "ticket_id": row.ticket_id,
        "display_id": row.display_id,
        "subject": row.subject,
        "product": row.product,
        "account": row.account,
        "vendor": row.vendor,
        "request_type": row.request_type,
        "owner": row.owner,
        "owner_id": row.owner_id,
        "pending_with": row.pending_with,
        "created_at": row.created_at.isoformat(),
        "closed_at": row.closed_at.isoformat() if row.closed_at else None,
        "status": row.status,
        "overall_hours": round(row.overall_seconds / _HOUR, 2),
        "overall_days": round(row.overall_seconds / _DAY, 2),
        # Working days on the desk's own clock, via `to_days` — NOT seconds/86400.
        # One day is one shift, so a 9h day makes the 2-day target 18 hours; dividing
        # by 86400 instead reports every ticket as 2.7x younger than it is.
        "stage_days": None if row.is_closed else clock.to_days(row.current_stage_seconds),
        "breach_level": row.breach_level,
        "handshakes": row.handshakes,
        "reopened": row.reopened,
        "max_stage_hours": round(row.max_stage_seconds / _HOUR, 2),
        "zero_breach": row.zero_breach,
    }
    # Zero rather than blank for a stakeholder this ticket never reached: the
    # column means "hours spent here", and this ticket spent none.
    for s in taxonomy.stakeholders:
        if taxonomy.is_closed(s.slug):
            continue
        out[f"stakeholder.{s.slug}"] = round(row.stakeholder_seconds.get(s.slug, 0) / _HOUR, 2)
    return out
