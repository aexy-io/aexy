"""Whether the classifier is worth trusting, and teaching it when it isn't.

`request_type` holds the current value and a correction overwrites it, so an AI
classification somebody agreed with was indistinguishable from one they silently
fixed. "Is the AI any good on our mail?" was a question a desk could only answer
by feel — and the classifier had no way to learn that this workspace files
renewal reminders somewhere its general-purpose prompt never guesses.

Keeping what the model said next to what the ticket says answers both.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.service_desk import ServiceDeskProduct, ServiceDeskTicket
from aexy.models.ticketing import Ticket, TicketForm
from aexy.models.workspace import Workspace
from aexy.services.service_desk_intake_service import ServiceDeskIntakeService
from aexy.services.service_desk_ticket_service import ServiceDeskTicketService
from tests.conftest import seed_service_desk_taxonomy


class _Desk:
    ws: Workspace
    form: TicketForm
    n: int = 0


async def _desk(db: AsyncSession, slug: str) -> _Desk:
    d = _Desk()
    owner = Developer(id=str(uuid4()), email=f"owner-{slug}@desk.example", name="Owner")
    db.add(owner)
    await db.flush()
    d.ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(d.ws)
    await db.flush()
    d.form = TicketForm(
        id=str(uuid4()), workspace_id=d.ws.id, name="SD", slug=f"sd-{slug}", created_by_id=owner.id
    )
    db.add(d.form)
    await db.commit()
    await seed_service_desk_taxonomy(db, d.ws.id)
    return d


async def _classified(
    db: AsyncSession,
    d: _Desk,
    *,
    ai: str | None,
    now: str,
    subject: str = "A request",
    created_at: datetime | None = None,
) -> Ticket:
    """A ticket the model called `ai` and that currently reads `now`."""
    d.n += 1
    ticket = Ticket(
        id=str(uuid4()), workspace_id=d.ws.id, form_id=d.form.id, ticket_number=d.n,
        field_values={"subject": subject},
    )
    db.add(ticket)
    await db.flush()
    if created_at is not None:
        ticket.created_at = created_at
    sd = ServiceDeskTicket(
        id=str(uuid4()), ticket_id=ticket.id, workspace_id=d.ws.id,
        request_type=now, ai_request_type=ai, pending_with="kam",
    )
    db.add(sd)
    await db.flush()
    if created_at is not None:
        sd.created_at = created_at
    await db.commit()
    return ticket


# ---------------------------------------------------------------- accuracy


@pytest.mark.asyncio
async def test_a_desk_with_nothing_measured_has_no_accuracy(db_session: AsyncSession):
    """Not 100%. A perfect score for zero tickets is the most misleading thing
    this could report to somebody deciding whether to switch AI on."""
    d = await _desk(db_session, "acc-empty")

    report = await ServiceDeskTicketService(db_session).ai_accuracy(d.ws.id)

    assert report["classified"] == 0
    assert report["agreement_rate"] is None


@pytest.mark.asyncio
async def test_agreements_and_corrections_are_counted_separately(
    db_session: AsyncSession,
):
    d = await _desk(db_session, "acc-mixed")
    await _classified(db_session, d, ai="claims", now="claims")
    await _classified(db_session, d, ai="claims", now="claims")
    await _classified(db_session, d, ai="claims", now="query")
    await _classified(db_session, d, ai="query", now="query")

    report = await ServiceDeskTicketService(db_session).ai_accuracy(d.ws.id)

    assert report["classified"] == 4
    assert report["agreed"] == 3
    assert report["agreement_rate"] == 0.75


@pytest.mark.asyncio
async def test_tickets_the_model_never_read_are_excluded(db_session: AsyncSession):
    """A desk that ran without AI for a year must not appear to have a perfect
    classifier — "never ran" is not the same as "agreed"."""
    d = await _desk(db_session, "acc-unread")
    await _classified(db_session, d, ai=None, now="claims")
    await _classified(db_session, d, ai=None, now="query")
    await _classified(db_session, d, ai="claims", now="query")

    report = await ServiceDeskTicketService(db_session).ai_accuracy(d.ws.id)

    assert report["classified"] == 1
    assert report["agreement_rate"] == 0.0


@pytest.mark.asyncio
async def test_the_breakdown_says_which_type_it_gets_wrong(db_session: AsyncSession):
    """One bad request type inside a good overall figure is the actionable
    finding — it is a prompt or a label problem, not a reason to switch AI off."""
    d = await _desk(db_session, "acc-bytype")
    for _ in range(4):
        await _classified(db_session, d, ai="query", now="query")
    await _classified(db_session, d, ai="claims", now="query")
    await _classified(db_session, d, ai="claims", now="query")

    report = await ServiceDeskTicketService(db_session).ai_accuracy(d.ws.id)
    by_type = {row["request_type"]: row for row in report["by_request_type"]}

    assert by_type["query"]["agreement_rate"] == 1.0
    assert by_type["claims"]["agreement_rate"] == 0.0
    # Ordered by volume, so the type worth fixing is at the top of the list.
    assert report["by_request_type"][0]["request_type"] == "query"


@pytest.mark.asyncio
async def test_the_window_is_respected(db_session: AsyncSession):
    """A classifier that was bad in March and fixed in June should read as fixed."""
    d = await _desk(db_session, "acc-window")
    long_ago = datetime.now(timezone.utc) - timedelta(days=200)
    await _classified(db_session, d, ai="claims", now="query", created_at=long_ago)
    await _classified(db_session, d, ai="claims", now="claims")

    report = await ServiceDeskTicketService(db_session).ai_accuracy(d.ws.id, days=30)

    assert report["classified"] == 1
    assert report["agreement_rate"] == 1.0


# ------------------------------------------------------------- learning


@pytest.mark.asyncio
async def test_corrections_become_examples_for_the_next_classification(
    db_session: AsyncSession,
):
    d = await _desk(db_session, "acc-learn")
    await _classified(
        db_session, d, ai="claims", now="query", subject="Renewal reminder for policy 88"
    )

    prompt = await ServiceDeskIntakeService(db_session)._recent_corrections(
        d.ws.id, {"query", "claims"}
    )

    assert "Renewal reminder for policy 88 -> query" in prompt


@pytest.mark.asyncio
async def test_classifications_nobody_corrected_are_not_examples(
    db_session: AsyncSession,
):
    """There is nothing to learn from being right, and every example is paid for
    on every later classification."""
    d = await _desk(db_session, "acc-learn-agreed")
    await _classified(db_session, d, ai="query", now="query", subject="Ordinary question")

    prompt = await ServiceDeskIntakeService(db_session)._recent_corrections(
        d.ws.id, {"query", "claims"}
    )

    assert prompt == ""


@pytest.mark.asyncio
async def test_a_retired_request_type_is_not_taught(db_session: AsyncSession):
    """It would teach the model to answer with a slug the validator rejects."""
    d = await _desk(db_session, "acc-learn-retired")
    await _classified(
        db_session, d, ai="claims", now="query", subject="Renewal reminder"
    )

    prompt = await ServiceDeskIntakeService(db_session)._recent_corrections(
        d.ws.id, {"claims"}  # `query` is no longer offered
    )

    assert prompt == ""


@pytest.mark.asyncio
async def test_the_example_list_is_bounded(db_session: AsyncSession):
    """They are prompt text: unbounded, they would eventually crowd out the mail
    being classified."""
    d = await _desk(db_session, "acc-learn-bounded")
    for n in range(20):
        await _classified(
            db_session, d, ai="claims", now="query", subject=f"Correction number {n}"
        )

    prompt = await ServiceDeskIntakeService(db_session)._recent_corrections(
        d.ws.id, {"query", "claims"}
    )

    assert prompt.count(" -> ") <= 8
