"""Grouped answers about the desk's own work.

The ticket list answers "which tickets", and the export answers it in a file.
Neither answers "how are we doing" — which partner sends the most work, which
product takes longest, whose queue is breaching — and every one of those was a
question somebody was counting rows on a screen to answer.

Deliberately a **dimension x measure** vocabulary rather than a fixed set of
reports. "Volume by partner this quarter" and "average turnaround by product for
one partner" are the same query with two words changed, and a desk asks a dozen
variants nobody can predict in advance. The pair is validated against the lists
below, so a caller cannot reach a column that was never meant to be grouped on.

Aggregated in Python rather than SQL, for two reasons. Stage age is *working*
time on the workspace's own clock, which no database expression can compute; and
the tests run on SQLite, where half the date arithmetic this would need does not
exist. The row set is one workspace's tickets in a date range, which is the
same order of magnitude the export already materialises.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException
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
from aexy.services.service_desk_clock import load_clock
from aexy.services.service_desk_taxonomy import load_taxonomy

logger = logging.getLogger(__name__)

_DAY = 86400.0


@dataclass(frozen=True)
class Dimension:
    key: str
    label: str


@dataclass(frozen=True)
class Measure:
    key: str
    label: str
    # How the number should be read, so a UI does not render 0.83 days as 83%.
    unit: str


# What a desk may group by. Terminology-sensitive labels are resolved per
# workspace at read time — an insurance desk sees "Partner" where a software
# desk sees "Customer".
DIMENSIONS: tuple[Dimension, ...] = (
    Dimension("account", "accounts"),
    Dimension("product", "products"),
    Dimension("vendor", "vendors"),
    Dimension("request_type", "Request type"),
    Dimension("pending_with", "Pending with"),
    Dimension("owner", "owners"),
    Dimension("origin", "Origin"),
    Dimension("month", "Month"),
)

MEASURES: tuple[Measure, ...] = (
    Measure("tickets", "Tickets", "count"),
    Measure("open_tickets", "Still open", "count"),
    Measure("breaching", "Breaching", "count"),
    Measure("avg_days_open", "Average days open", "days"),
    Measure("avg_working_days_in_stage", "Average working days in current stage", "days"),
    Measure("triage_rate", "Share needing triage", "rate"),
    Measure("ai_agreement_rate", "Share where AI's request type was kept", "rate"),
)

_DIMENSION_KEYS = {d.key for d in DIMENSIONS}
_MEASURE_KEYS = {m.key for m in MEASURES}

# The label a row gets when the dimension has no value: a ticket with no account,
# no product, nobody assigned. Named rather than dropped, because "how much work
# has no partner against it" is usually the most actionable row in the table.
UNSET_LABEL = "(none)"


async def report_options(db: AsyncSession, workspace_id: str) -> dict:
    """The vocabulary, with this workspace's own nouns."""
    taxonomy = await load_taxonomy(db, workspace_id, seed=False)

    def label(dimension: Dimension) -> str:
        # The master-data dimensions are named by the workspace; the rest are
        # ours and read the same everywhere.
        return (
            taxonomy.term(dimension.label).title()
            if dimension.label in {"accounts", "products", "vendors", "owners"}
            else dimension.label
        )

    return {
        "dimensions": [{"key": d.key, "label": label(d)} for d in DIMENSIONS],
        "measures": [{"key": m.key, "label": m.label, "unit": m.unit} for m in MEASURES],
    }


class ServiceDeskAnalytics:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def aggregate(
        self,
        workspace_id: str,
        dimension: str,
        measure: str,
        developer_id: str | None = None,
        filters=None,
        limit: int = 50,
    ) -> dict:
        """One grouped figure per dimension value, biggest first.

        ``developer_id`` applies the same visibility clause the list and the
        export use. A report is a read like any other: a KAM scoped to their own
        assignments gets a chart of their own work, not the desk's.
        """
        if dimension not in _DIMENSION_KEYS:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown dimension {dimension!r} (known: {', '.join(sorted(_DIMENSION_KEYS))})",
            )
        if measure not in _MEASURE_KEYS:
            raise HTTPException(
                status_code=422,
                detail=f"Unknown measure {measure!r} (known: {', '.join(sorted(_MEASURE_KEYS))})",
            )

        from aexy.services.service_desk_service import ServiceDeskService

        query = await ServiceDeskService(self.db)._scoped_ticket_query(
            workspace_id,
            developer_id,
            None,
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

        open_entered = dict(
            (
                await self.db.execute(
                    select(
                        TicketPendingSegment.ticket_id, TicketPendingSegment.entered_at
                    ).where(
                        TicketPendingSegment.workspace_id == workspace_id,
                        TicketPendingSegment.exited_at.is_(None),
                    )
                )
            ).all()
        )
        clock = await load_clock(self.db, workspace_id)
        taxonomy = await load_taxonomy(self.db, workspace_id, seed=False)
        closed = taxonomy.closed_slug
        now = datetime.now(timezone.utc)

        buckets: dict[str, list[dict]] = defaultdict(list)
        for sd, ticket, account_name, product_name, vendor_name, owner_name, owner_email in rows:
            entered = open_entered.get(sd.ticket_id)
            stage_seconds = (
                clock.seconds_between(_aware(entered), now) if entered is not None else 0
            )
            buckets[
                _bucket_of(
                    dimension,
                    sd,
                    ticket,
                    account_name,
                    product_name,
                    vendor_name,
                    owner_name or owner_email,
                )
            ].append(
                {
                    "is_open": closed is None or sd.pending_with != closed,
                    "days_open": (
                        _aware(ticket.closed_at) if ticket.closed_at else now
                    ).timestamp()
                    - _aware(ticket.created_at).timestamp(),
                    "stage_days": clock.to_days(stage_seconds) if entered is not None else None,
                    "breaching": clock.is_breaching(stage_seconds, sd.pending_with),
                    "needs_triage": sd.needs_triage,
                    "ai_request_type": sd.ai_request_type,
                    "request_type": sd.request_type,
                }
            )

        results = [
            {"key": key, "value": value, "tickets": len(items)}
            for key, items in buckets.items()
            if (value := _measure_of(measure, items)) is not None
        ]
        # Biggest first, so the row worth acting on is at the top rather than
        # wherever the alphabet put it. Ties break on the label so the order is
        # stable between two identical runs.
        results.sort(key=lambda row: (-row["value"], row["key"]))
        return {
            "dimension": dimension,
            "measure": measure,
            "unit": next(m.unit for m in MEASURES if m.key == measure),
            "total_tickets": sum(len(items) for items in buckets.values()),
            # Truncation is reported rather than silent: a chart missing its tail
            # should say so, not look complete.
            "truncated": len(results) > limit,
            "rows": results[:limit],
        }


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _bucket_of(
    dimension: str,
    sd: ServiceDeskTicket,
    ticket: Ticket,
    account_name: str | None,
    product_name: str | None,
    vendor_name: str | None,
    owner_label: str | None,
) -> str:
    if dimension == "account":
        return account_name or UNSET_LABEL
    if dimension == "product":
        return product_name or UNSET_LABEL
    if dimension == "vendor":
        return vendor_name or UNSET_LABEL
    if dimension == "owner":
        return owner_label or UNSET_LABEL
    if dimension == "request_type":
        return sd.request_type
    if dimension == "pending_with":
        return sd.pending_with
    if dimension == "origin":
        return sd.origin
    # month
    return _aware(ticket.created_at).strftime("%Y-%m")


def _measure_of(measure: str, items: list[dict]) -> float | None:
    """The figure for one bucket, or None when the bucket cannot answer.

    A rate over zero eligible tickets is None rather than 0.0 — "we corrected
    none of the AI's answers here" and "the AI never ran here" are different
    facts, and showing the second as a perfect score is the mistake this avoids
    everywhere else too.
    """
    if measure == "tickets":
        return float(len(items))
    if measure == "open_tickets":
        return float(sum(1 for i in items if i["is_open"]))
    if measure == "breaching":
        return float(sum(1 for i in items if i["breaching"]))
    if measure == "avg_days_open":
        return round(sum(i["days_open"] for i in items) / len(items) / _DAY, 2)
    if measure == "avg_working_days_in_stage":
        staged = [i["stage_days"] for i in items if i["stage_days"] is not None]
        return round(sum(staged) / len(staged), 2) if staged else None
    if measure == "triage_rate":
        return round(sum(1 for i in items if i["needs_triage"]) / len(items), 3)
    # ai_agreement_rate
    classified = [i for i in items if i["ai_request_type"] is not None]
    if not classified:
        return None
    agreed = sum(1 for i in classified if i["ai_request_type"] == i["request_type"])
    return round(agreed / len(classified), 3)
