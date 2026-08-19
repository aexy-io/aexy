"""How the desk is doing, not just which tickets it has.

The list answers "which tickets" and the export answers it in a file. Neither
answers which partner sends the most work, which product takes longest, or whose
queue is breaching — questions people were counting rows on a screen to answer.

Deliberately dimension x measure rather than a fixed set of reports: "volume by
partner this quarter" and "turnaround by product for one partner" are the same
query with two words changed, and a desk asks a dozen variants nobody can list in
advance.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.service_desk import (
    ServiceDeskAccount,
    ServiceDeskProduct,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket, TicketForm
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.service_desk import TicketFilters
from aexy.services.service_desk_analytics import ServiceDeskAnalytics, report_options
from tests.conftest import seed_service_desk_taxonomy


class _Desk:
    ws: Workspace
    form: TicketForm
    kam: Developer
    other: Developer
    acme: ServiceDeskAccount
    beta: ServiceDeskAccount
    motor: ServiceDeskProduct
    n: int = 0


async def _desk(db: AsyncSession, slug: str) -> _Desk:
    d = _Desk()
    owner = Developer(id=str(uuid4()), email=f"owner-{slug}@desk.example", name="Owner")
    d.kam = Developer(id=str(uuid4()), email=f"kam-{slug}@desk.example", name="KAM One")
    d.other = Developer(id=str(uuid4()), email=f"two-{slug}@desk.example", name="KAM Two")
    db.add_all([owner, d.kam, d.other])
    await db.flush()
    d.ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(d.ws)
    await db.flush()
    for dev in (d.kam, d.other):
        db.add(
            WorkspaceMember(
                id=str(uuid4()), workspace_id=d.ws.id, developer_id=dev.id, status="active"
            )
        )
    d.form = TicketForm(
        id=str(uuid4()), workspace_id=d.ws.id, name="SD", slug=f"sd-{slug}", created_by_id=owner.id
    )
    d.acme = ServiceDeskAccount(id=str(uuid4()), workspace_id=d.ws.id, name="Acme")
    d.beta = ServiceDeskAccount(id=str(uuid4()), workspace_id=d.ws.id, name="Beta")
    d.motor = ServiceDeskProduct(id=str(uuid4()), workspace_id=d.ws.id, name="Motor")
    db.add_all([d.form, d.acme, d.beta, d.motor])
    await db.commit()
    await seed_service_desk_taxonomy(db, d.ws.id)
    return d


async def _ticket(
    db: AsyncSession,
    d: _Desk,
    *,
    account=None,
    product=None,
    assignee: Developer | None = None,
    pending_with: str = "kam",
    request_type: str = "query",
    ai_request_type: str | None = None,
    needs_triage: bool = False,
    created_at: datetime | None = None,
    days_ago_entered: float = 0.0,
) -> Ticket:
    d.n += 1
    now = datetime.now(timezone.utc)
    ticket = Ticket(
        id=str(uuid4()), workspace_id=d.ws.id, form_id=d.form.id, ticket_number=d.n,
        assignee_id=(assignee or d.kam).id, field_values={"subject": f"T{d.n}"},
    )
    db.add(ticket)
    await db.flush()
    ticket.created_at = created_at or now
    db.add(
        ServiceDeskTicket(
            id=str(uuid4()), ticket_id=ticket.id, workspace_id=d.ws.id,
            account_id=account.id if account else None,
            product_id=product.id if product else None,
            request_type=request_type, ai_request_type=ai_request_type,
            pending_with=pending_with, needs_triage=needs_triage,
        )
    )
    db.add(
        TicketPendingSegment(
            id=str(uuid4()), workspace_id=d.ws.id, ticket_id=ticket.id,
            pending_with=pending_with,
            entered_at=now - timedelta(days=days_ago_entered),
        )
    )
    await db.commit()
    return ticket


def _rows(result: dict) -> dict[str, float]:
    return {row["key"]: row["value"] for row in result["rows"]}


# ----------------------------------------------------------------- grouping


@pytest.mark.asyncio
async def test_volume_by_account(db_session: AsyncSession):
    d = await _desk(db_session, "an-volume")
    for _ in range(3):
        await _ticket(db_session, d, account=d.acme)
    await _ticket(db_session, d, account=d.beta)

    result = await ServiceDeskAnalytics(db_session).aggregate(d.ws.id, "account", "tickets")

    assert _rows(result) == {"Acme": 3.0, "Beta": 1.0}
    # Biggest first, so the row worth acting on is at the top.
    assert result["rows"][0]["key"] == "Acme"


@pytest.mark.asyncio
async def test_tickets_with_no_value_get_a_row_of_their_own(db_session: AsyncSession):
    """"How much work has no partner against it" is usually the most actionable
    row in the table, so it is named rather than dropped."""
    d = await _desk(db_session, "an-unset")
    await _ticket(db_session, d, account=d.acme)
    await _ticket(db_session, d)

    result = await ServiceDeskAnalytics(db_session).aggregate(d.ws.id, "account", "tickets")

    assert _rows(result) == {"Acme": 1.0, "(none)": 1.0}


@pytest.mark.asyncio
async def test_grouping_by_owner_and_by_month(db_session: AsyncSession):
    d = await _desk(db_session, "an-owner-month")
    july = datetime(2026, 7, 4, tzinfo=timezone.utc)
    await _ticket(db_session, d, assignee=d.kam, created_at=july)
    await _ticket(db_session, d, assignee=d.other, created_at=july)
    await _ticket(db_session, d, assignee=d.other, created_at=datetime(2026, 8, 4, tzinfo=timezone.utc))

    svc = ServiceDeskAnalytics(db_session)

    assert _rows(await svc.aggregate(d.ws.id, "owner", "tickets")) == {
        "KAM Two": 2.0,
        "KAM One": 1.0,
    }
    assert _rows(await svc.aggregate(d.ws.id, "month", "tickets")) == {
        "2026-07": 2.0,
        "2026-08": 1.0,
    }


# ----------------------------------------------------------------- measures


@pytest.mark.asyncio
async def test_open_and_breaching_are_counted_per_group(db_session: AsyncSession):
    d = await _desk(db_session, "an-open")
    await _ticket(db_session, d, account=d.acme, pending_with="kam")
    await _ticket(db_session, d, account=d.acme, pending_with="closed")

    svc = ServiceDeskAnalytics(db_session)

    assert _rows(await svc.aggregate(d.ws.id, "account", "tickets"))["Acme"] == 2.0
    assert _rows(await svc.aggregate(d.ws.id, "account", "open_tickets"))["Acme"] == 1.0


@pytest.mark.asyncio
async def test_average_days_open_is_wall_clock(db_session: AsyncSession):
    """What the requester waited, which includes nights and weekends."""
    d = await _desk(db_session, "an-days")
    ten_days = datetime.now(timezone.utc) - timedelta(days=10)
    await _ticket(db_session, d, account=d.acme, created_at=ten_days)

    result = await ServiceDeskAnalytics(db_session).aggregate(
        d.ws.id, "account", "avg_days_open"
    )

    assert 9.5 <= _rows(result)["Acme"] <= 10.5
    assert result["unit"] == "days"


@pytest.mark.asyncio
async def test_a_rate_over_nothing_is_absent_rather_than_perfect(
    db_session: AsyncSession,
):
    """"We corrected none of the AI's answers here" and "the AI never ran here"
    are different facts, and the second must not render as a perfect score."""
    d = await _desk(db_session, "an-rate")
    await _ticket(db_session, d, account=d.acme, ai_request_type=None)
    await _ticket(db_session, d, account=d.beta, ai_request_type="query", request_type="query")

    result = await ServiceDeskAnalytics(db_session).aggregate(
        d.ws.id, "account", "ai_agreement_rate"
    )

    assert "Acme" not in _rows(result)
    assert _rows(result)["Beta"] == 1.0


@pytest.mark.asyncio
async def test_triage_rate_is_a_share_not_a_count(db_session: AsyncSession):
    d = await _desk(db_session, "an-triage")
    await _ticket(db_session, d, account=d.acme, needs_triage=True)
    await _ticket(db_session, d, account=d.acme, needs_triage=False)

    result = await ServiceDeskAnalytics(db_session).aggregate(d.ws.id, "account", "triage_rate")

    assert _rows(result)["Acme"] == 0.5
    assert result["unit"] == "rate"


# ------------------------------------------------------------------- guards


@pytest.mark.asyncio
async def test_an_unknown_dimension_or_measure_is_refused(db_session: AsyncSession):
    """The pair reaches a query, so it is validated rather than interpolated."""
    d = await _desk(db_session, "an-guard")
    svc = ServiceDeskAnalytics(db_session)

    with pytest.raises(HTTPException) as bad_dimension:
        await svc.aggregate(d.ws.id, "submitter_email", "tickets")
    with pytest.raises(HTTPException) as bad_measure:
        await svc.aggregate(d.ws.id, "account", "everything")

    assert bad_dimension.value.status_code == 422
    assert bad_measure.value.status_code == 422


@pytest.mark.asyncio
async def test_the_same_filters_as_the_ticket_list_apply(db_session: AsyncSession):
    """A chart and the rows behind it are the same question asked two ways."""
    d = await _desk(db_session, "an-filters")
    await _ticket(db_session, d, account=d.acme, request_type="claims")
    await _ticket(db_session, d, account=d.beta, request_type="query")

    result = await ServiceDeskAnalytics(db_session).aggregate(
        d.ws.id, "account", "tickets", filters=TicketFilters(request_type="claims")
    )

    assert _rows(result) == {"Acme": 1.0}


@pytest.mark.asyncio
async def test_truncation_is_reported_rather_than_silent(db_session: AsyncSession):
    """A chart missing its tail should say so, not look complete."""
    d = await _desk(db_session, "an-truncate")
    for n in range(4):
        account = ServiceDeskAccount(id=str(uuid4()), workspace_id=d.ws.id, name=f"Account {n}")
        db_session.add(account)
        await db_session.flush()
        await _ticket(db_session, d, account=account)

    result = await ServiceDeskAnalytics(db_session).aggregate(
        d.ws.id, "account", "tickets", limit=2
    )

    assert len(result["rows"]) == 2
    assert result["truncated"] is True
    assert result["total_tickets"] == 4


@pytest.mark.asyncio
async def test_the_options_speak_the_workspaces_own_language(db_session: AsyncSession):
    d = await _desk(db_session, "an-options")

    options = await report_options(db_session, d.ws.id)
    dimensions = {row["key"]: row["label"] for row in options["dimensions"]}

    # The insurance template names accounts "Partners"; the neutral default is
    # "Accounts". Either way it is the workspace's word, not ours.
    assert dimensions["account"] in {"Partners", "Accounts"}
    assert dimensions["request_type"] == "Request type"
