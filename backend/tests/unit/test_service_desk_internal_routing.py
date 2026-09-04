"""Routing mail that a colleague sent, not a counterparty.

Reported from a live desk: "tickets are still not getting assigned correctly."
Three tickets arrived from the same person, about the same client, on the same
afternoon, and landed on three different owners.

All three came from the desk's own domain, which intake used to treat as a dead
end. It looked for a forwarded message and, finding none, handed the ticket to
whoever ``_random_owner`` picked. But a colleague writing *out* to a counterparty
with the desk copied names that counterparty in ``To:``, and a desk that has
mapped a colleague's own address to an account has said where their mail belongs.
Both answers were sitting in Master Data and neither was ever read.

Every case here is about which of those sources decides, and — just as
important — which addresses must never decide anything.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import Department, DepartmentMember
from aexy.models.service_desk import (
    ServiceDeskAccount,
    ServiceDeskAccountDomain,
    ServiceDeskMailbox,
    ServiceDeskTicket,
    ServiceDeskVendor,
    ServiceDeskVendorDomain,
)
from aexy.models.ticketing import Ticket
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.service_desk import InboundEmail
from aexy.services.service_desk_intake_service import ServiceDeskIntakeService
from tests.conftest import seed_service_desk_taxonomy

INTERNAL_DOMAIN = "desk.example"
DESK_ADDRESS = f"ops@{INTERNAL_DOMAIN}"


class _Desk:
    ws: Workspace
    mailbox: ServiceDeskMailbox
    partner_kam: Developer
    other_kam: Developer
    desk_member: Developer
    account: ServiceDeskAccount


async def _desk(db: AsyncSession, slug: str) -> _Desk:
    """A desk with one mapped counterparty and one arbitrary fallback owner.

    ``desk_member`` is the department's only member, so it is the only owner
    ``_random_owner`` can return — which is what lets every assertion below tell
    "the fallback fired" from "Master Data answered".
    """
    d = _Desk()
    owner = Developer(id=str(uuid4()), email=f"wsowner-{slug}@{INTERNAL_DOMAIN}", name="WS Owner")
    d.partner_kam = Developer(
        id=str(uuid4()), email=f"kam-{slug}@{INTERNAL_DOMAIN}", name="Partner KAM"
    )
    d.other_kam = Developer(
        id=str(uuid4()), email=f"other-{slug}@{INTERNAL_DOMAIN}", name="Other KAM"
    )
    d.desk_member = Developer(
        id=str(uuid4()), email=f"desk-{slug}@{INTERNAL_DOMAIN}", name="Desk Member"
    )
    db.add_all([owner, d.partner_kam, d.other_kam, d.desk_member])
    await db.flush()

    d.ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(d.ws)
    await db.flush()
    for dev in (d.partner_kam, d.other_kam, d.desk_member):
        db.add(
            WorkspaceMember(
                id=str(uuid4()), workspace_id=d.ws.id, developer_id=dev.id, role="member"
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
            developer_id=d.desk_member.id,
        )
    )

    d.mailbox = ServiceDeskMailbox(
        id=str(uuid4()), workspace_id=d.ws.id, address=DESK_ADDRESS, channel="webhook"
    )
    d.account = ServiceDeskAccount(
        id=str(uuid4()), workspace_id=d.ws.id, name="Partner Co",
        assigned_owner_id=d.partner_kam.id,
    )
    db.add_all([d.mailbox, d.account])
    await db.flush()
    db.add(
        ServiceDeskAccountDomain(
            id=str(uuid4()), workspace_id=d.ws.id, account_id=d.account.id,
            domain="partner.example",
        )
    )
    await db.commit()

    settings = dict(d.ws.settings or {})
    settings["service_desk"] = {"desk_department_id": department.id}
    d.ws.settings = settings
    await db.commit()

    await seed_service_desk_taxonomy(db, d.ws.id)
    return d


async def _map_address(
    db: AsyncSession, d: _Desk, name: str, address: str, owner: Developer | None
) -> ServiceDeskAccount:
    """A Master Data row keyed on a whole address rather than a domain."""
    account = ServiceDeskAccount(
        id=str(uuid4()), workspace_id=d.ws.id, name=name,
        assigned_owner_id=owner.id if owner else None,
    )
    db.add(account)
    await db.flush()
    db.add(
        ServiceDeskAccountDomain(
            id=str(uuid4()), workspace_id=d.ws.id, account_id=account.id, domain=address
        )
    )
    await db.commit()
    return account


async def _ingest(
    db: AsyncSession,
    d: _Desk,
    *,
    sender: str,
    to: str | None = None,
    cc: str | None = None,
    body: str = "Please help with this.",
    subject: str = "A request",
) -> Ticket:
    headers: dict[str, str] = {"to": to or DESK_ADDRESS}
    if cc:
        headers["cc"] = cc
    ticket = await ServiceDeskIntakeService(db).ingest(
        InboundEmail(
            to=DESK_ADDRESS,
            from_email=sender,
            from_name="Colleague",
            subject=subject,
            body_text=body,
            message_id=f"<{uuid4().hex}@mail>",
            thread_id=uuid4().hex,
            headers=headers,
        ),
        d.mailbox,
        source="test",
    )
    assert ticket is not None
    await db.commit()
    return ticket


async def _sd(db: AsyncSession, ticket: Ticket) -> ServiceDeskTicket:
    return (
        await db.execute(
            select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == ticket.id)
        )
    ).scalar_one()


# ── the counterparty a colleague was writing to ──────────────────────────


@pytest.mark.asyncio
async def test_mail_a_colleague_sent_to_a_mapped_counterparty_reaches_its_owner(
    db_session: AsyncSession,
) -> None:
    """The reported case, exactly.

    A KAM mails the client and copies the desk. `From:` is the KAM, so nothing
    about the sender identifies the client — but `To:` does, and Master Data has
    mapped that domain for as long as the desk has existed.
    """
    d = await _desk(db_session, "ir-recipient")

    ticket = await _ingest(
        db_session,
        d,
        sender=d.other_kam.email,
        to="rohan@partner.example",
        cc=DESK_ADDRESS,
    )

    assert str(ticket.assignee_id) == str(d.partner_kam.id), (
        "the ticket belongs to the KAM of the counterparty it was addressed to, "
        "not to whoever the fallback happened to pick"
    )
    sd = await _sd(db_session, ticket)
    assert str(sd.account_id) == str(d.account.id)
    # Master Data answered outright, so routing has nothing to explain. (The
    # ticket may still be flagged for triage — with AI off nothing has read the
    # request itself — but that is a different question from who owns it.)
    assert (ticket.field_values or {}).get("assignment_note") is None


@pytest.mark.asyncio
async def test_a_counterparty_in_cc_counts_as_much_as_one_in_to(
    db_session: AsyncSession,
) -> None:
    """A client copied rather than addressed is still the client."""
    d = await _desk(db_session, "ir-cc")

    ticket = await _ingest(
        db_session,
        d,
        sender=d.other_kam.email,
        to=DESK_ADDRESS,
        cc="ops@partner.example",
    )

    assert str(ticket.assignee_id) == str(d.partner_kam.id)


# ── a row keyed on the colleague's own address ───────────────────────────


@pytest.mark.asyncio
async def test_a_row_mapping_the_senders_own_address_decides_the_owner(
    db_session: AsyncSession,
) -> None:
    """Mapping a whole internal address is a desk saying where that person's mail
    belongs. Those rows existed and were never once consulted, because the
    internal-domain branch returned before Master Data was read at all."""
    d = await _desk(db_session, "ir-own")
    await _map_address(db_session, d, "Desk Colleague", d.other_kam.email, d.partner_kam)

    # Addressed to a colleague, so there is no counterparty to route by.
    ticket = await _ingest(
        db_session, d, sender=d.other_kam.email, to=f"someone@{INTERNAL_DOMAIN}"
    )

    assert str(ticket.assignee_id) == str(d.partner_kam.id)


@pytest.mark.asyncio
async def test_the_counterparty_written_to_beats_a_standing_row_for_the_sender(
    db_session: AsyncSession,
) -> None:
    """One is about this message, the other is a default for everything that
    person sends. The specific answer wins."""
    d = await _desk(db_session, "ir-order")
    await _map_address(db_session, d, "Desk Colleague", d.other_kam.email, d.other_kam)

    ticket = await _ingest(
        db_session, d, sender=d.other_kam.email, to="rohan@partner.example"
    )

    assert str(ticket.assignee_id) == str(d.partner_kam.id)
    assert str((await _sd(db_session, ticket)).account_id) == str(d.account.id)


# ── what must never decide the routing ───────────────────────────────────


@pytest.mark.asyncio
async def test_a_colleague_in_the_recipients_never_routes_the_ticket(
    db_session: AsyncSession,
) -> None:
    """Two colleagues on a thread are two colleagues, not a counterparty.

    Without this, a row mapping one colleague's address would capture every
    message anybody else copied them on.
    """
    d = await _desk(db_session, "ir-internal-recipient")
    colleague = f"colleague@{INTERNAL_DOMAIN}"
    await _map_address(db_session, d, "Colleague Row", colleague, d.other_kam)

    ticket = await _ingest(db_session, d, sender=f"alias@{INTERNAL_DOMAIN}", to=colleague)

    assert str(ticket.assignee_id) == str(d.desk_member.id), (
        "nothing identified a counterparty, so this is the fallback — the "
        "colleague in To must not have been read as one"
    )


@pytest.mark.asyncio
async def test_a_row_keyed_on_the_desks_own_domain_cannot_swallow_internal_mail(
    db_session: AsyncSession,
) -> None:
    """The reason the sender lookup is exact-address only.

    One row keyed on the desk's own domain — a plausible thing to type once by
    mistake — would otherwise own every message anybody there ever sends.
    """
    d = await _desk(db_session, "ir-own-domain")
    await _map_address(db_session, d, "Whole Company", INTERNAL_DOMAIN, d.other_kam)

    ticket = await _ingest(db_session, d, sender=f"alias@{INTERNAL_DOMAIN}")

    assert str(ticket.assignee_id) == str(d.desk_member.id)
    assert (await _sd(db_session, ticket)).account_id is None


@pytest.mark.asyncio
async def test_an_insurer_on_the_thread_is_linked_without_deciding_the_owner(
    db_session: AsyncSession,
) -> None:
    """A vendor has no owner behind it, so it files the ticket without routing it
    — and must not stop a later recipient from being read as the account."""
    d = await _desk(db_session, "ir-vendor")
    vendor = ServiceDeskVendor(id=str(uuid4()), workspace_id=d.ws.id, name="Insurer Co")
    db_session.add(vendor)
    await db_session.flush()
    db_session.add(
        ServiceDeskVendorDomain(
            id=str(uuid4()), workspace_id=d.ws.id, vendor_id=vendor.id,
            domain="insurer.example",
        )
    )
    await db_session.commit()

    ticket = await _ingest(
        db_session,
        d,
        sender=d.other_kam.email,
        to="claims@insurer.example",
        cc="ops@partner.example",
    )

    sd = await _sd(db_session, ticket)
    assert str(sd.vendor_id) == str(vendor.id)
    assert str(sd.account_id) == str(d.account.id)
    assert str(ticket.assignee_id) == str(d.partner_kam.id)


# ── the colleague who raised it ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_request_a_colleague_raised_is_theirs(db_session: AsyncSession) -> None:
    """The ops head's own words: "Dana requested this ticket so it should be
    assigned to Dana."

    Nothing here is configured — no account maps this person, and the message
    names no counterparty. The one person it is known to concern is the one who
    wrote it, and handing it to a third person instead was the reported bug.
    """
    d = await _desk(db_session, "ir-sender")

    ticket = await _ingest(
        db_session,
        d,
        sender=d.other_kam.email,
        to=f"colleague@{INTERNAL_DOMAIN}",
        body="Hi — please share the renewal quotes for my client.",
    )

    assert str(ticket.assignee_id) == str(d.other_kam.id)
    note = (ticket.field_values or {}).get("assignment_note") or ""
    assert "who raised it" in note


@pytest.mark.asyncio
async def test_a_counterparty_still_outranks_the_colleague_who_wrote_in(
    db_session: AsyncSession,
) -> None:
    """Whose client it is beats who typed the message. A KAM chasing another
    KAM's partner must not take the ticket off them by writing about it."""
    d = await _desk(db_session, "ir-sender-order")

    ticket = await _ingest(
        db_session, d, sender=d.other_kam.email, to="rohan@partner.example"
    )

    assert str(ticket.assignee_id) == str(d.partner_kam.id)


@pytest.mark.asyncio
async def test_a_former_colleague_does_not_get_the_ticket(
    db_session: AsyncSession,
) -> None:
    """Developer rows outlive people leaving. A ticket in a queue nobody watches
    is worse than one assigned at random, so membership is what is checked."""
    d = await _desk(db_session, "ir-departed")
    departed = Developer(
        id=str(uuid4()), email=f"departed-{uuid4().hex[:6]}@{INTERNAL_DOMAIN}", name="Departed"
    )
    db_session.add(departed)
    await db_session.commit()

    ticket = await _ingest(db_session, d, sender=departed.email)

    assert str(ticket.assignee_id) == str(d.desk_member.id), (
        "not a member of this workspace, so this is the fallback"
    )


@pytest.mark.asyncio
async def test_the_insurer_is_linked_whichever_order_the_headers_put_it_in(
    db_session: AsyncSession,
) -> None:
    """The account here comes first, the insurer second — the reverse of the case
    above. Which of the two a mail client happened to list first must not decide
    whether the ticket records the insurer at all."""
    d = await _desk(db_session, "ir-vendor-order")
    vendor = ServiceDeskVendor(id=str(uuid4()), workspace_id=d.ws.id, name="Insurer Co")
    db_session.add(vendor)
    await db_session.flush()
    db_session.add(
        ServiceDeskVendorDomain(
            id=str(uuid4()), workspace_id=d.ws.id, vendor_id=vendor.id,
            domain="insurer.example",
        )
    )
    await db_session.commit()

    ticket = await _ingest(
        db_session,
        d,
        sender=d.other_kam.email,
        to="rohan@partner.example",
        cc="claims@insurer.example",
    )

    sd = await _sd(db_session, ticket)
    assert str(sd.account_id) == str(d.account.id)
    assert str(sd.vendor_id) == str(vendor.id)
    assert str(ticket.assignee_id) == str(d.partner_kam.id)


# ── when nothing can answer, say so on the ticket ────────────────────────


@pytest.mark.asyncio
async def test_an_unroutable_internal_message_says_what_was_tried(
    db_session: AsyncSession,
) -> None:
    """The fallback is still the fallback. What changed is that the ticket now
    carries the reason where a person reading it can see it."""
    d = await _desk(db_session, "ir-fallback")

    # A sender with no developer row at all — an alias, a distribution list, a
    # colleague who has never signed in.
    ticket = await _ingest(
        db_session, d, sender=f"alias@{INTERNAL_DOMAIN}", to="nobody@unknown.example"
    )

    assert str(ticket.assignee_id) == str(d.desk_member.id)
    note = (ticket.field_values or {}).get("assignment_note") or ""
    assert "Assigned by fallback" in note
    assert "own domain" in note, "the note has to say why the sender was no help"


@pytest.mark.asyncio
async def test_a_mapped_account_with_no_owner_falls_back_and_names_itself(
    db_session: AsyncSession,
) -> None:
    """Matching an account that owns nobody is a Master Data gap, not a routing
    one, and the ticket has to say which."""
    d = await _desk(db_session, "ir-ownerless")
    await _map_address(db_session, d, "Ownerless Co", "solo@ownerless.example", None)

    ticket = await _ingest(
        db_session, d, sender=d.other_kam.email, to="solo@ownerless.example"
    )

    assert str(ticket.assignee_id) == str(d.desk_member.id)
    note = (ticket.field_values or {}).get("assignment_note") or ""
    assert "Ownerless Co" in note and "no assigned owner" in note
