"""Unit tests for Service Desk Phase 2 — Pending-With transitions + TAT."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.service_desk import ServiceDeskTicket, TicketPendingSegment
from aexy.models.ticketing import Ticket, TicketForm, TicketResponse
from aexy.models.workspace import Workspace
from aexy.services.service_desk_ticket_service import ServiceDeskTicketService
from tests.conftest import seed_service_desk_taxonomy


async def _ws(db: AsyncSession, slug: str) -> Workspace:
    owner = Developer(email=f"o-{slug}@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(name=slug, slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.commit()
    await db.refresh(ws)
    # Stakeholders/request types are per-workspace rows now, not an enum, so a
    # bare workspace has no taxonomy and the service layer refuses to file a
    # ticket into one. Seeds the legacy insurance slugs these tests assert on.
    await seed_service_desk_taxonomy(db, ws.id)

    return ws


async def _ticket(db: AsyncSession, ws: Workspace, *, created_at: datetime | None = None) -> Ticket:
    form = TicketForm(
        id=str(uuid4()), workspace_id=ws.id, name="SD", slug="service-desk", created_by_id=ws.owner_id
    )
    db.add(form)
    await db.flush()
    ticket = Ticket(
        id=str(uuid4()),
        form_id=form.id,
        workspace_id=ws.id,
        ticket_number=1,
        submitter_email="rahul@abcfinance.com",
        submitter_name="Rahul",
        field_values={"subject": "Policy status", "body": "..."},
        status="new",
        source="service_desk_webhook",
    )
    db.add(ticket)
    await db.flush()
    if created_at is not None:
        ticket.created_at = created_at
    db.add(
        ServiceDeskTicket(
            id=str(uuid4()), ticket_id=ticket.id, workspace_id=ws.id, request_type="query", pending_with="kam"
        )
    )
    db.add(
        TicketPendingSegment(
            id=str(uuid4()),
            workspace_id=ws.id,
            ticket_id=ticket.id,
            pending_with="kam",
            entered_at=created_at or datetime.now(timezone.utc),
        )
    )
    await db.commit()
    return ticket


@pytest.mark.asyncio
async def test_transition_closes_and_opens_segment(db_session: AsyncSession):
    ws = await _ws(db_session, "tat-a")
    ticket = await _ticket(db_session, ws)
    svc = ServiceDeskTicketService(db_session)

    detail = await svc.change_pending_with(ws.id, ticket.id, "insurer", note="sent to insurer")
    await db_session.commit()

    assert detail.pending_with == "insurer"
    segs = (
        await db_session.execute(
            select(TicketPendingSegment).where(TicketPendingSegment.ticket_id == ticket.id).order_by(TicketPendingSegment.entered_at)
        )
    ).scalars().all()
    assert len(segs) == 2
    kam, insurer = segs
    assert kam.pending_with == "kam" and kam.exited_at is not None and kam.duration_seconds is not None
    assert insurer.pending_with == "insurer" and insurer.exited_at is None  # new open segment
    # a human-readable internal note was written
    responses = (
        await db_session.execute(select(TicketResponse).where(TicketResponse.ticket_id == ticket.id))
    ).scalars().all()
    assert any("Pending With changed" in r.content for r in responses)


@pytest.mark.asyncio
async def test_close_and_reopen(db_session: AsyncSession):
    ws = await _ws(db_session, "tat-b")
    ticket = await _ticket(db_session, ws)
    svc = ServiceDeskTicketService(db_session)

    await svc.change_pending_with(ws.id, ticket.id, "closed", note="done")
    await db_session.commit()
    t = await db_session.get(Ticket, ticket.id)
    assert t.status == "closed" and t.closed_at is not None
    assert await svc._open_segment(ticket.id) is None  # terminal — no open segment

    # reopen
    await svc.change_pending_with(ws.id, ticket.id, "kam")
    await db_session.commit()
    t = await db_session.get(Ticket, ticket.id)
    assert t.status == "in_progress" and t.closed_at is None
    assert (await svc._open_segment(ticket.id)).pending_with == "kam"


@pytest.mark.asyncio
async def test_compute_tat_numbers(db_session: AsyncSession):
    ws = await _ws(db_session, "tat-c")
    # 10:30 IST on a Wednesday — inside the 09:30–18:30 shift, so the segment
    # arithmetic below is about the arithmetic and not about shift clipping.
    t0 = datetime(2026, 7, 1, 5, 0, tzinfo=timezone.utc)
    ticket = await _ticket(db_session, ws, created_at=t0)

    # replace the auto-created open segment with a deterministic closed ledger
    await db_session.execute(
        TicketPendingSegment.__table__.delete().where(TicketPendingSegment.ticket_id == ticket.id)
    )

    def seg(pw, start, end):
        return TicketPendingSegment(
            id=str(uuid4()), workspace_id=ws.id, ticket_id=ticket.id, pending_with=pw,
            entered_at=start, exited_at=end,
            duration_seconds=int((end - start).total_seconds()),
        )

    db_session.add(seg("kam", t0, t0 + timedelta(hours=4)))
    db_session.add(seg("insurer", t0 + timedelta(hours=4), t0 + timedelta(hours=4, days=2)))
    db_session.add(seg("kam", t0 + timedelta(hours=4, days=2), t0 + timedelta(hours=5, days=2)))
    ticket.closed_at = t0 + timedelta(hours=5, days=2)
    await db_session.commit()

    # NOTE: the ledger above runs Wed→Fri on purpose. Stage/stakeholder time is
    # measured in WORKING hours (IST), so moving these fixture dates across a
    # weekend, or outside 09:30–18:30, changes the expected numbers — see
    # test_service_desk_clock.py.
    tat = await ServiceDeskTicketService(db_session).compute_tat(ticket.id, ticket)
    assert tat.stakeholder_seconds["kam"] == 4 * 3600 + 3600  # 5h across two segments
    # Wed 14:30→18:30 (4h) + Thu shift (9h) + Fri 09:30→14:30 (5h) = 18h,
    # i.e. exactly two working days rather than the 48 wall-clock hours.
    assert tat.stakeholder_seconds["insurer"] == 18 * 3600
    assert tat.overall_seconds == 5 * 3600 + 2 * 86400
    assert tat.overall_days == round((5 * 3600 + 2 * 86400) / 86400, 2)
    assert tat.current_pending_with is None  # all segments closed


@pytest.mark.asyncio
async def test_stakeholder_time_counts_only_working_hours(db_session: AsyncSession):
    """A hand-off held over a weekend must not accrue against the SLA.

    The stored ``duration_seconds`` stays wall clock — it is the audit record of
    the hand-off — so this also pins that TAT recomputes from the boundaries
    rather than trusting that column.
    """
    ws = await _ws(db_session, "tat-weekend")
    friday = datetime(2026, 7, 3, 8, 30, tzinfo=timezone.utc)  # 14:00 IST, a Friday
    ticket = await _ticket(db_session, ws, created_at=friday)

    await db_session.execute(
        TicketPendingSegment.__table__.delete().where(TicketPendingSegment.ticket_id == ticket.id)
    )
    monday = friday + timedelta(days=3)  # 14:00 IST Monday
    db_session.add(
        TicketPendingSegment(
            id=str(uuid4()), workspace_id=ws.id, ticket_id=ticket.id, pending_with="insurer",
            entered_at=friday, exited_at=monday,
            duration_seconds=int((monday - friday).total_seconds()),  # 3 days, wall clock
        )
    )
    ticket.closed_at = monday
    await db_session.commit()

    tat = await ServiceDeskTicketService(db_session).compute_tat(ticket.id, ticket)
    # Fri 14:00→18:30 (4.5h) + Mon 09:30→14:00 (4.5h) = one 9h working day,
    # not the three calendar days the ledger records.
    assert tat.stakeholder_seconds["insurer"] == 9 * 3600
    # Overall stays wall clock — the requester really did wait three days.
    assert tat.overall_seconds == 3 * 86400


@pytest.mark.asyncio
async def test_breach_level_red_when_over_two_days(db_session: AsyncSession):
    ws = await _ws(db_session, "tat-d")
    ticket = await _ticket(db_session, ws)
    # Seven calendar days back is exactly five working days whatever weekday and
    # time of day the suite runs at: the partial shifts at the two ends are the
    # same weekday and sum to one whole shift. So this stays red without
    # depending on today's date. Three days back would not — Friday evening to
    # Monday is barely one working day.
    seg = await ServiceDeskTicketService(db_session)._open_segment(ticket.id)
    seg.entered_at = datetime.now(timezone.utc) - timedelta(days=7)
    await db_session.commit()

    tat = await ServiceDeskTicketService(db_session).compute_tat(ticket.id, ticket)
    assert tat.current_pending_with == "kam"
    assert tat.breach_level == "red"
    assert 4.5 <= tat.current_stage_days <= 5.0
