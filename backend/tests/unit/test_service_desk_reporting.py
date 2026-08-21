"""Filtering and exporting the desk's own work.

The list endpoint took `assigned_to_me` and a row cap, and nothing else — no
date range, no account, no product, no request type. Answering "how did we do on
motor claims for this partner last month" meant reading the screen. There was no
export at all.

Two properties matter more than the filters themselves:

* **Scope is applied first and separately.** A filter narrows what a caller
  already sees; naming another owner or another account must never widen it.
* **The export is the screen, in a file.** List, count and export share one
  query builder, so a CSV that disagreed with the page it came from would be a
  build error rather than a support ticket.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.service_desk import (
    ServiceDeskAccount,
    ServiceDeskAccountDomain,
    ServiceDeskProduct,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket, TicketForm
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.service_desk import TicketFilters
from aexy.services.service_desk_service import ServiceDeskService
from aexy.services.service_desk_ticket_service import ServiceDeskTicketService
from tests.conftest import seed_service_desk_taxonomy


class _Desk:
    """A workspace with two partners, two products and a handful of tickets."""

    def __init__(self):
        self.ws: Workspace
        self.form: TicketForm
        self.owner: Developer
        self.other: Developer
        self.acme: ServiceDeskAccount
        self.beta: ServiceDeskAccount
        self.motor: ServiceDeskProduct
        self.health: ServiceDeskProduct
        self.n = 0


async def _desk(db: AsyncSession, slug: str) -> _Desk:
    d = _Desk()
    d.owner = Developer(id=str(uuid4()), email=f"owner-{slug}@desk.example", name="Owner")
    d.other = Developer(id=str(uuid4()), email=f"other-{slug}@desk.example", name="Other KAM")
    db.add_all([d.owner, d.other])
    await db.flush()
    d.ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=d.owner.id)
    db.add(d.ws)
    await db.flush()
    for dev in (d.owner, d.other):
        db.add(
            WorkspaceMember(
                id=str(uuid4()), workspace_id=d.ws.id, developer_id=dev.id, status="active"
            )
        )
    d.form = TicketForm(
        id=str(uuid4()), workspace_id=d.ws.id, name="Service Desk",
        slug=f"sd-{slug}", created_by_id=d.owner.id,
    )
    db.add(d.form)
    d.acme = ServiceDeskAccount(id=str(uuid4()), workspace_id=d.ws.id, name="Acme Broking")
    d.beta = ServiceDeskAccount(id=str(uuid4()), workspace_id=d.ws.id, name="Beta Partners")
    d.motor = ServiceDeskProduct(id=str(uuid4()), workspace_id=d.ws.id, name="Motor")
    d.health = ServiceDeskProduct(id=str(uuid4()), workspace_id=d.ws.id, name="Health")
    db.add_all([d.acme, d.beta, d.motor, d.health])
    await db.commit()
    await seed_service_desk_taxonomy(db, d.ws.id)
    return d


async def _ticket(
    db: AsyncSession,
    d: _Desk,
    *,
    account: ServiceDeskAccount | None = None,
    product: ServiceDeskProduct | None = None,
    request_type: str = "query",
    pending_with: str = "kam",
    assignee: Developer | None = None,
    created_at: datetime | None = None,
    needs_triage: bool = False,
    subject: str = "A request",
) -> Ticket:
    d.n += 1
    ticket = Ticket(
        id=str(uuid4()),
        workspace_id=d.ws.id,
        form_id=d.form.id,
        ticket_number=d.n,
        submitter_email="priya@acme.example",
        submitter_name="Priya",
        assignee_id=(assignee or d.owner).id,
        field_values={"subject": subject},
    )
    db.add(ticket)
    await db.flush()
    if created_at is not None:
        ticket.created_at = created_at
    db.add(
        ServiceDeskTicket(
            id=str(uuid4()),
            ticket_id=ticket.id,
            workspace_id=d.ws.id,
            account_id=account.id if account else None,
            product_id=product.id if product else None,
            request_type=request_type,
            pending_with=pending_with,
            needs_triage=needs_triage,
        )
    )
    db.add(
        TicketPendingSegment(
            id=str(uuid4()),
            workspace_id=d.ws.id,
            ticket_id=ticket.id,
            pending_with=pending_with,
            entered_at=created_at or datetime.now(timezone.utc),
        )
    )
    await db.commit()
    return ticket


def _ids(rows) -> set[str]:
    return {r.ticket_id for r in rows}


# ------------------------------------------------------------------ filters


@pytest.mark.asyncio
async def test_no_filters_returns_the_whole_desk(db_session: AsyncSession):
    d = await _desk(db_session, "rep-all")
    await _ticket(db_session, d, account=d.acme)
    await _ticket(db_session, d, account=d.beta)

    rows = await ServiceDeskService(db_session).list_tickets(d.ws.id)

    assert len(rows) == 2


@pytest.mark.asyncio
async def test_filtering_by_account_and_product(db_session: AsyncSession):
    d = await _desk(db_session, "rep-account")
    motor_acme = await _ticket(db_session, d, account=d.acme, product=d.motor)
    await _ticket(db_session, d, account=d.acme, product=d.health)
    await _ticket(db_session, d, account=d.beta, product=d.motor)

    svc = ServiceDeskService(db_session)
    rows = await svc.list_tickets(
        d.ws.id, filters=TicketFilters(account_id=d.acme.id, product_id=d.motor.id)
    )

    assert _ids(rows) == {motor_acme.id}


@pytest.mark.asyncio
async def test_filtering_by_date_range_is_inclusive(db_session: AsyncSession):
    """"Last month" has to include the first and last day of it."""
    d = await _desk(db_session, "rep-dates")
    start = datetime(2026, 7, 1, tzinfo=timezone.utc)
    end = datetime(2026, 7, 31, 23, 59, tzinfo=timezone.utc)
    on_start = await _ticket(db_session, d, created_at=start)
    on_end = await _ticket(db_session, d, created_at=end)
    await _ticket(db_session, d, created_at=start - timedelta(seconds=1))
    await _ticket(db_session, d, created_at=end + timedelta(seconds=1))

    rows = await ServiceDeskService(db_session).list_tickets(
        d.ws.id, filters=TicketFilters(created_from=start, created_to=end)
    )

    assert _ids(rows) == {on_start.id, on_end.id}


@pytest.mark.asyncio
async def test_filtering_by_request_type_pending_with_and_triage(db_session: AsyncSession):
    d = await _desk(db_session, "rep-taxonomy")
    wanted = await _ticket(
        db_session, d, request_type="claims", pending_with="insurer", needs_triage=True
    )
    await _ticket(db_session, d, request_type="claims", pending_with="kam")
    await _ticket(db_session, d, request_type="query", pending_with="insurer")

    svc = ServiceDeskService(db_session)
    assert _ids(
        await svc.list_tickets(
            d.ws.id, filters=TicketFilters(request_type="claims", pending_with="insurer")
        )
    ) == {wanted.id}
    assert _ids(await svc.list_tickets(d.ws.id, filters=TicketFilters(needs_triage=True))) == {
        wanted.id
    }


@pytest.mark.asyncio
async def test_is_open_asks_the_workspace_which_slug_is_terminal(db_session: AsyncSession):
    """A report should not have to know this desk calls it "closed"."""
    d = await _desk(db_session, "rep-open")
    live = await _ticket(db_session, d, pending_with="kam")
    done = await _ticket(db_session, d, pending_with="closed")

    svc = ServiceDeskService(db_session)
    assert _ids(await svc.list_tickets(d.ws.id, filters=TicketFilters(is_open=True))) == {live.id}
    assert _ids(await svc.list_tickets(d.ws.id, filters=TicketFilters(is_open=False))) == {done.id}


@pytest.mark.asyncio
async def test_a_backwards_range_is_refused(db_session: AsyncSession):
    with pytest.raises(ValueError):
        TicketFilters(
            created_from=datetime(2026, 8, 1, tzinfo=timezone.utc),
            created_to=datetime(2026, 7, 1, tzinfo=timezone.utc),
        )


# -------------------------------------------------------------------- count


@pytest.mark.asyncio
async def test_the_count_matches_the_filtered_list(db_session: AsyncSession):
    d = await _desk(db_session, "rep-count")
    for _ in range(3):
        await _ticket(db_session, d, account=d.acme)
    await _ticket(db_session, d, account=d.beta)

    svc = ServiceDeskService(db_session)
    filters = TicketFilters(account_id=d.acme.id)

    assert await svc.count_tickets(d.ws.id, filters=filters) == 3
    assert len(await svc.list_tickets(d.ws.id, filters=filters)) == 3


@pytest.mark.asyncio
async def test_paging_covers_every_row_exactly_once(db_session: AsyncSession):
    """Two tickets created in the same second must not swap between pages."""
    d = await _desk(db_session, "rep-paging")
    same_instant = datetime(2026, 8, 1, 9, 0, tzinfo=timezone.utc)
    for _ in range(5):
        await _ticket(db_session, d, created_at=same_instant)

    svc = ServiceDeskService(db_session)
    seen: list[str] = []
    for offset in (0, 2, 4):
        seen.extend(r.ticket_id for r in await svc.list_tickets(d.ws.id, limit=2, offset=offset))

    assert len(seen) == 5
    assert len(set(seen)) == 5


# ------------------------------------------------------------------- export


async def _export_rows(db: AsyncSession, ws_id: str, **kw) -> list[dict]:
    text, _ = await ServiceDeskTicketService(db).export_csv(ws_id, **kw)
    return list(csv.DictReader(io.StringIO(text.lstrip("﻿"))))


@pytest.mark.asyncio
async def test_the_export_names_things_a_person_can_read(db_session: AsyncSession):
    """Ids are not a report. The CSV carries names, not foreign keys."""
    d = await _desk(db_session, "rep-export")
    await _ticket(
        db_session, d, account=d.acme, product=d.motor, request_type="claims",
        subject="Windscreen claim", assignee=d.other,
    )

    rows = await _export_rows(db_session, d.ws.id)

    assert len(rows) == 1
    row = rows[0]
    assert row["Account"] == "Acme Broking"
    assert row["Product"] == "Motor"
    assert row["Owner"] == "Other KAM"
    assert row["Request type"] == "claims"
    assert row["Subject"] == "Windscreen claim"
    assert row["Ticket"].startswith("SD-")


@pytest.mark.asyncio
async def test_the_export_obeys_the_same_filters_as_the_list(db_session: AsyncSession):
    d = await _desk(db_session, "rep-export-filtered")
    await _ticket(db_session, d, account=d.acme, subject="Wanted")
    await _ticket(db_session, d, account=d.beta, subject="Not wanted")

    rows = await _export_rows(db_session, d.ws.id, filters=TicketFilters(account_id=d.acme.id))

    assert [r["Subject"] for r in rows] == ["Wanted"]


@pytest.mark.asyncio
async def test_a_subject_full_of_punctuation_cannot_shift_the_columns(
    db_session: AsyncSession,
):
    """Subjects are whatever requesters typed, including commas and quotes."""
    d = await _desk(db_session, "rep-export-quoting")
    await _ticket(
        db_session, d, account=d.acme,
        subject='Claim, "urgent"\nsecond line',
    )

    rows = await _export_rows(db_session, d.ws.id)

    assert len(rows) == 1
    assert rows[0]["Subject"] == 'Claim, "urgent"\nsecond line'
    assert rows[0]["Account"] == "Acme Broking"


@pytest.mark.asyncio
async def test_the_export_opens_as_utf8_in_excel(db_session: AsyncSession):
    d = await _desk(db_session, "rep-export-bom")
    await _ticket(db_session, d)

    text, filename = await ServiceDeskTicketService(db_session).export_csv(d.ws.id)

    assert text.startswith("﻿")
    assert filename.startswith("sd-tickets-") and filename.endswith(".csv")


@pytest.mark.asyncio
async def test_an_empty_result_still_produces_a_readable_file(db_session: AsyncSession):
    """A month with no tickets is an answer, not a broken download."""
    d = await _desk(db_session, "rep-export-empty")

    text, _ = await ServiceDeskTicketService(db_session).export_csv(
        d.ws.id, filters=TicketFilters(account_id=d.acme.id)
    )
    reader = csv.reader(io.StringIO(text.lstrip("﻿")))

    assert next(reader)[0] == "Ticket"
    assert list(reader) == []
