"""Keeping everyone on a ticket's email thread.

Reported from a live desk: "when replying from the portal it should work as
reply-all — everybody marked on the mail should be marked on the reply, and the
user should be able to add or remove anyone."

The ticket knew who wrote in and nothing about who they had copied, because
intake read the `To:` and `Cc:` headers only to decide which mailbox the message
belonged to and then dropped them. So a reply from the desk reached one address
out of five, and the partner's colleague — often the person actually chasing it —
never saw the answer.

The addresses are captured as each message arrives, from every direction a
message can arrive from, and turned into the two fields a compose box needs.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import Department, DepartmentMember
from aexy.models.service_desk import ServiceDeskMailbox, ServiceDeskTicket
from aexy.models.ticketing import Ticket
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.service_desk import InboundEmail
from aexy.services.service_desk_config import message_recipients
from aexy.services.service_desk_intake_service import ServiceDeskIntakeService
from aexy.services.service_desk_ticket_service import ServiceDeskTicketService
from tests.conftest import seed_service_desk_taxonomy

DESK = "ops@desk.example"
REQUESTER = "asha@partner.example"
COLLEAGUE = "ravi@partner.example"
BROKER = "broker@intermediary.example"


class _Desk:
    ws: Workspace
    mailbox: ServiceDeskMailbox
    member: Developer


async def _desk(db: AsyncSession, slug: str) -> _Desk:
    d = _Desk()
    owner = Developer(id=str(uuid4()), email=f"wsowner-{slug}@desk.example", name="WS Owner")
    d.member = Developer(id=str(uuid4()), email=f"desk-{slug}@desk.example", name="Desk Member")
    db.add_all([owner, d.member])
    await db.flush()

    d.ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(d.ws)
    await db.flush()
    db.add(
        WorkspaceMember(
            id=str(uuid4()), workspace_id=d.ws.id, developer_id=d.member.id, role="member"
        )
    )

    department = Department(
        id=str(uuid4()), workspace_id=d.ws.id, name="Operations", slug=f"ops-{slug}",
        function_key="operations",
    )
    db.add(department)
    await db.flush()
    db.add(
        DepartmentMember(
            id=str(uuid4()), workspace_id=d.ws.id, department_id=department.id,
            developer_id=d.member.id,
        )
    )

    d.mailbox = ServiceDeskMailbox(
        id=str(uuid4()), workspace_id=d.ws.id, address=DESK, channel="webhook"
    )
    db.add(d.mailbox)
    await db.commit()

    settings = dict(d.ws.settings or {})
    settings["service_desk"] = {"desk_department_id": department.id}
    d.ws.settings = settings
    await db.commit()

    await seed_service_desk_taxonomy(db, d.ws.id)
    return d


def _mail(
    *, sender: str, to: str, cc: str | None = None, subject: str, thread: str, body: str = "…"
) -> InboundEmail:
    headers = {"to": to, **({"cc": cc} if cc else {})}
    return InboundEmail(
        to=DESK,
        from_email=sender,
        subject=subject,
        body_text=body,
        message_id=f"<{uuid4().hex}@mail>",
        thread_id=thread,
        headers=headers,
    )


async def _reply_all(db: AsyncSession, d: _Desk, ticket: Ticket):
    sd = (
        await db.execute(
            select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == ticket.id)
        )
    ).scalar_one()
    detail = await ServiceDeskTicketService(db).get_detail(d.ws.id, sd.ticket_id)
    return detail.reply_all


# ── the header reader ────────────────────────────────────────────────────


def test_a_display_name_containing_a_comma_is_still_one_recipient() -> None:
    """Splitting on commas turns `"Doe, Jane" <jane@…>` into two malformed
    addresses, one of which would be sent to."""
    found = message_recipients(
        {"to": '"Doe, Jane" <jane@partner.example>, ops@desk.example'}
    )
    assert found == ["jane@partner.example", "ops@desk.example"]


def test_bcc_is_never_read() -> None:
    """It does not survive delivery, and an address that reached the desk
    invisibly must not be re-exposed by a reply-all."""
    assert message_recipients({"bcc": "hidden@partner.example"}) == []


# ── what a ticket knows about its own thread ─────────────────────────────


@pytest.mark.asyncio
async def test_the_request_carries_everyone_it_was_addressed_to(
    db_session: AsyncSession,
) -> None:
    d = await _desk(db_session, "ra-first")

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _mail(
            sender=REQUESTER,
            to=f"{DESK}, {COLLEAGUE}",
            cc=BROKER,
            subject="Renewal",
            thread="t-1",
        ),
        d.mailbox,
        source="test",
    )
    await db_session.commit()
    assert ticket is not None

    reply_all = await _reply_all(db_session, d, ticket)
    assert reply_all.to == REQUESTER
    assert reply_all.cc == [COLLEAGUE, BROKER]
    assert DESK not in reply_all.cc, (
        "the desk in its own Cc would receive its own reply back through the "
        "sync as fresh correspondence"
    )


@pytest.mark.asyncio
async def test_a_reply_answers_whoever_wrote_in_last(db_session: AsyncSession) -> None:
    """A thread that has moved on to somebody else must not answer the person
    who opened it three weeks ago."""
    d = await _desk(db_session, "ra-latest")
    intake = ServiceDeskIntakeService(db_session)

    ticket = await intake.ingest(
        _mail(sender=REQUESTER, to=DESK, subject="Renewal", thread="t-2"),
        d.mailbox,
        source="test",
    )
    await db_session.commit()
    assert ticket is not None

    # The colleague picks the thread up, copying a broker who was not on the
    # first message at all.
    await intake.ingest(
        _mail(
            sender=COLLEAGUE,
            to=DESK,
            cc=BROKER,
            subject=f"Re: Renewal [{ticket.ticket_number}]",
            thread="t-2",
        ),
        d.mailbox,
        source="test",
    )
    await db_session.commit()

    reply_all = await _reply_all(db_session, d, ticket)
    assert reply_all.to == COLLEAGUE
    assert set(reply_all.cc) == {REQUESTER, BROKER}


@pytest.mark.asyncio
async def test_somebody_added_in_the_mail_client_joins_the_thread(
    db_session: AsyncSession,
) -> None:
    """Adding a person to a chain most often happens in Gmail, not in the ticket.

    A desk reply typed there updates who is on the conversation without changing
    who a reply goes back to — the desk does not reply to itself.
    """
    d = await _desk(db_session, "ra-desk-reply")
    intake = ServiceDeskIntakeService(db_session)

    ticket = await intake.ingest(
        _mail(sender=REQUESTER, to=DESK, subject="Renewal", thread="t-3"),
        d.mailbox,
        source="test",
    )
    await db_session.commit()
    assert ticket is not None

    await intake.ingest(
        _mail(
            sender=DESK,
            to=REQUESTER,
            cc=BROKER,
            subject=f"Re: Renewal [{ticket.ticket_number}]",
            thread="t-3",
        ),
        d.mailbox,
        source="test",
    )
    await db_session.commit()

    reply_all = await _reply_all(db_session, d, ticket)
    assert reply_all.to == REQUESTER, "the desk's own address is never replied to"
    assert BROKER in reply_all.cc


@pytest.mark.asyncio
async def test_a_ticket_logged_by_phone_offers_no_recipient_at_all(
    db_session: AsyncSession,
) -> None:
    """A logged call has no requester address, only the sentinel standing in for
    one. Prefilling that reads as a real recipient right up until the send fails,
    which is worse than the empty box it replaced."""
    from aexy.schemas.service_desk import ManualTicketCreate
    from aexy.services.service_desk_intake_service import MANUAL_SENDER_ADDRESS
    from aexy.services.service_desk_service import ServiceDeskService

    d = await _desk(db_session, "ra-phone")

    ticket_id = await ServiceDeskService(db_session).create_manual_ticket(
        d.ws.id, ManualTicketCreate(subject="Partner rang about a renewal")
    )
    ticket = await db_session.get(Ticket, ticket_id)

    reply_all = await _reply_all(db_session, d, ticket)
    assert reply_all.to is None
    assert MANUAL_SENDER_ADDRESS not in reply_all.cc
    assert reply_all.cc == []


@pytest.mark.asyncio
async def test_a_ticket_from_before_the_addresses_were_kept_still_answers_its_requester(
    db_session: AsyncSession,
) -> None:
    """Every existing ticket has no participants recorded. The compose box has to
    behave as it did — addressed to the requester — rather than to nobody."""
    d = await _desk(db_session, "ra-legacy")

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _mail(sender=REQUESTER, to=DESK, subject="Renewal", thread="t-4"),
        d.mailbox,
        source="test",
    )
    await db_session.commit()
    assert ticket is not None

    values = dict(ticket.field_values or {})
    values.pop("thread_participants", None)
    values.pop("thread_reply_to", None)
    ticket.field_values = values
    await db_session.commit()

    reply_all = await _reply_all(db_session, d, ticket)
    assert reply_all.to == REQUESTER
    assert reply_all.cc == []
