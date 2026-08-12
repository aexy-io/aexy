"""The ticket id in the subject of every mail the desk sends.

The subject does three jobs: it is the second (deliberate) path the inbound
matcher reads, it is what a requester quotes when they write again, and it is
what a colleague's Gmail reply inherits as "Re: …" — the only route by which the
id reaches a message this application never composed.

Two of the three sends render their subject from an *editable* template, so the
id cannot be left to the copy: an Ops edit dropping ``{{display_id}}`` would
send the desk's own mail out with no id and take the whole thread's id with it.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.service_desk import (
    ServiceDeskMailbox,
    ServiceDeskTicket,
    TicketPendingSegment,
)
from aexy.models.ticketing import Ticket, TicketForm
from aexy.models.workspace import Workspace
from aexy.services.service_desk_config import force_ticket_id_into_subject
from aexy.services.service_desk_templates import upsert_sd_template
from tests.conftest import seed_service_desk_taxonomy


async def _workspace(db: AsyncSession, slug: str) -> Workspace:
    owner = Developer(id=str(uuid4()), email=f"owner-{slug}@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.commit()
    await seed_service_desk_taxonomy(db, ws.id)
    return ws


# ------------------------------------------------------------------- the rule


@pytest.mark.asyncio
async def test_the_id_is_added_when_absent(db_session: AsyncSession):
    ws = await _workspace(db_session, "subject-add")

    assert (
        await force_ticket_id_into_subject(db_session, ws.id, "Login fails on SSO", 41)
        == "[SD-41] Login fails on SSO"
    )


@pytest.mark.asyncio
async def test_an_id_already_present_is_not_repeated(db_session: AsyncSession):
    ws = await _workspace(db_session, "subject-keep")

    for subject in ("Re: SD-41 Login fails", "[SD-41] Login fails", "re: sd-41 login"):
        assert (
            await force_ticket_id_into_subject(db_session, ws.id, subject, 41) == subject
        )


@pytest.mark.asyncio
async def test_somebody_elses_ticket_id_is_not_rewritten(db_session: AsyncSession):
    """Matching reads the first id in the subject.

    Overwriting the number a human typed would silently redirect their reply, so
    this ticket's id is prefixed and theirs is left where it is for a person to
    notice.
    """
    ws = await _workspace(db_session, "subject-other")

    assert (
        await force_ticket_id_into_subject(db_session, ws.id, "Re: SD-9 wrong ticket", 41)
        == "[SD-41] Re: SD-9 wrong ticket"
    )


@pytest.mark.asyncio
async def test_a_foreign_prefix_does_not_count_as_the_id(db_session: AsyncSession):
    """Only this workspace's prefix is an id — "INV-41" is somebody's invoice."""
    ws = await _workspace(db_session, "subject-foreign")

    assert (
        await force_ticket_id_into_subject(db_session, ws.id, "Re: INV-41 payment", 41)
        == "[SD-41] Re: INV-41 payment"
    )


# ----------------------------------------------------- the templated sends


async def _desk_ticket(db: AsyncSession, ws: Workspace) -> tuple[Ticket, ServiceDeskMailbox]:
    form = TicketForm(
        id=str(uuid4()), workspace_id=ws.id, name="SD", slug="service-desk", created_by_id=ws.owner_id
    )
    db.add(form)
    mailbox = ServiceDeskMailbox(
        id=str(uuid4()), workspace_id=ws.id, address="ops@example.com", channel="webhook"
    )
    db.add(mailbox)
    await db.flush()
    ticket = Ticket(
        id=str(uuid4()),
        workspace_id=ws.id,
        form_id=form.id,
        ticket_number=41,
        submitter_email="requester@partner.example",
        submitter_name="Requester",
        field_values={"subject": "Login fails on SSO", "body": "..."},
        status="new",
        source="service_desk_gmail",
    )
    db.add(ticket)
    await db.flush()
    db.add(
        ServiceDeskTicket(
            id=str(uuid4()),
            workspace_id=ws.id,
            ticket_id=ticket.id,
            request_type="query",
            pending_with="kam",
            origin="email",
            mailbox_id=mailbox.id,
            thread_ref="thread-41",
        )
    )
    db.add(
        TicketPendingSegment(
            id=str(uuid4()), workspace_id=ws.id, ticket_id=ticket.id, pending_with="kam"
        )
    )
    await db.commit()
    return ticket, mailbox


@pytest.mark.asyncio
async def test_a_customised_receipt_template_cannot_drop_the_id(
    db_session: AsyncSession, monkeypatch
):
    from aexy.services import service_desk_mailer as mailer
    from aexy.services.service_desk_intake_service import ServiceDeskIntakeService

    ws = await _workspace(db_session, "subject-receipt")
    ticket, mailbox = await _desk_ticket(db_session, ws)
    # Ops rewrites the copy and, in doing so, drops {{display_id}}.
    await upsert_sd_template(
        db_session, ws.id, "receipt", "We have your request", "Hi {{requester_name}}", None
    )
    await db_session.commit()

    sent: list[str] = []

    async def _send(db, mb, to_email, subject, body_text, thread_id=None):
        sent.append(subject)

    async def _nobody_replied(db, mb, thread_id, after=None):
        return False

    monkeypatch.setattr(mailer, "send_service_desk_email", _send)
    monkeypatch.setattr(mailer, "desk_replied_in_thread", _nobody_replied)

    service = ServiceDeskIntakeService(db_session)
    await service._send_receipt(ws.id, ticket, mailbox, thread_id="thread-41")
    await service.flush_notifications()

    assert sent == ["[SD-41] We have your request"]


@pytest.mark.asyncio
async def test_a_customised_closure_template_cannot_drop_the_id(
    db_session: AsyncSession, monkeypatch
):
    from aexy.services import service_desk_mailer as mailer
    from aexy.services.service_desk_ticket_service import ServiceDeskTicketService

    ws = await _workspace(db_session, "subject-closure")
    ticket, _ = await _desk_ticket(db_session, ws)
    await upsert_sd_template(
        db_session, ws.id, "closure", "All done", "Resolved: {{closure_note}}", None
    )
    await db_session.commit()

    sent: list[str] = []

    async def _send(db, mb, to_email, subject, body_text, thread_id=None):
        sent.append(subject)

    monkeypatch.setattr(mailer, "send_service_desk_email", _send)

    service = ServiceDeskTicketService(db_session)
    await service._send_closure(ws.id, ticket, "Password reset")
    await service.flush_notifications()

    assert sent == ["[SD-41] All done"]
