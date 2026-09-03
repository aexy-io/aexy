"""Recognising the partner behind a message.

Two ways the desk failed to attribute mail it could have attributed, both of
which surfaced as "assignment is not following our master data":

* **Subdomains.** Matching was exact equality on the domain, so a partner mapped
  as ``partner.example`` writing from ``mail.partner.example`` — a regional
  office, a marketing platform, a ticketing subdomain — was not recognised as
  that partner at all.
* **Forwarded mail.** A colleague forwarding a partner's request arrives *from*
  the colleague, on the desk's own domain, so intake concluded there was no
  account to infer and handed the ticket to an arbitrary member of the desk.

Both now resolve, and both leave the ticket flagged: the attribution is inferred,
so a person confirms it. What changes is that the owner is right in the meantime.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.service_desk import (
    ServiceDeskAccount,
    ServiceDeskAccountDomain,
    ServiceDeskMailbox,
    ServiceDeskTicket,
)
from aexy.models.ticketing import TicketResponse
from aexy.models.workspace import Workspace
from aexy.schemas.service_desk import InboundEmail
from aexy.services.service_desk_config import (
    domain_candidates,
    domain_is_too_broad,
    forwarded_sender,
)
from aexy.services.service_desk_intake_service import ServiceDeskIntakeService
from tests.conftest import seed_service_desk_taxonomy

_FORWARD_BODY = """Hi team, please handle this one.

---------- Forwarded message ---------
From: Sam Sharma <priya@partner.example>
Date: Wed, 19 Aug 2026 at 11:04
Subject: Endorsement request
To: <ops@desk.example>

Please endorse policy 4471.
"""


@pytest.fixture(autouse=True)
def _no_outbound(monkeypatch):
    async def _noop(self, *a, **k):
        return None

    async def _no_candidates(self, *a, **k):
        return [], False

    monkeypatch.setattr(ServiceDeskIntakeService, "_send_receipt", _noop)
    monkeypatch.setattr(ServiceDeskIntakeService, "_classify", _no_candidates)


async def _desk(
    db: AsyncSession, slug: str, domains: list[str]
) -> tuple[Workspace, ServiceDeskMailbox, Developer]:
    owner = Developer(id=str(uuid4()), email=f"owner-{slug}@desk.example", name="Owner")
    kam = Developer(id=str(uuid4()), email=f"kam-{slug}@desk.example", name="Mapped KAM")
    db.add_all([owner, kam])
    await db.flush()
    ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.flush()
    mailbox = ServiceDeskMailbox(
        id=str(uuid4()), workspace_id=ws.id, address="ops@desk.example", channel="webhook"
    )
    db.add(mailbox)
    account = ServiceDeskAccount(
        id=str(uuid4()), workspace_id=ws.id, name="Partner Co", assigned_owner_id=kam.id
    )
    db.add(account)
    await db.flush()
    for domain in domains:
        db.add(
            ServiceDeskAccountDomain(
                id=str(uuid4()), workspace_id=ws.id, account_id=account.id, domain=domain
            )
        )
    await db.commit()
    await seed_service_desk_taxonomy(db, ws.id)
    return ws, mailbox, kam


async def _sd(db: AsyncSession, ticket_id: str) -> ServiceDeskTicket:
    return (
        await db.execute(
            select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == ticket_id)
        )
    ).scalar_one()


async def _notes(db: AsyncSession, ticket_id: str) -> str:
    rows = (
        await db.execute(
            select(TicketResponse.content).where(
                TicketResponse.ticket_id == ticket_id,
                TicketResponse.is_internal.is_(True),
            )
        )
    ).scalars().all()
    return "\n".join(rows)


# ------------------------------------------------------------- subdomains


@pytest.mark.parametrize(
    "sender",
    ["priya@partner.example", "priya@mail.partner.example", "noc@eu.mail.partner.example"],
    ids=["apex", "one-level", "two-levels"],
)
@pytest.mark.asyncio
async def test_a_partner_is_recognised_from_any_subdomain(
    db_session: AsyncSession, sender: str
):
    ws, mailbox, kam = await _desk(db_session, f"sub-{abs(hash(sender)) % 9999}", ["partner.example"])

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        InboundEmail(
            to=mailbox.address, from_email=sender, subject="Endorsement",
            message_id=f"sub-{abs(hash(sender)) % 9999}",
        ),
        mailbox,
        "service_desk_webhook",
    )
    await db_session.commit()

    assert ticket.assignee_id == kam.id
    assert (await _sd(db_session, ticket.id)).account_id is not None


@pytest.mark.asyncio
async def test_a_lookalike_domain_is_not_the_partner(db_session: AsyncSession):
    """Suffix matching must stop at a label boundary, or `notpartner.example`
    would be read as mail from `partner.example`."""
    ws, mailbox, kam = await _desk(db_session, "sub-lookalike", ["partner.example"])

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        InboundEmail(
            to=mailbox.address, from_email="someone@notpartner.example",
            subject="Hello", message_id="lookalike-1",
        ),
        mailbox,
        "service_desk_webhook",
    )
    await db_session.commit()

    assert (await _sd(db_session, ticket.id)).account_id is None
    assert ticket.assignee_id != kam.id


@pytest.mark.asyncio
async def test_the_most_specific_mapping_wins(db_session: AsyncSession):
    """A desk can point `partner.example` and `claims.partner.example` at
    different owners and have both hold."""
    ws, mailbox, kam = await _desk(db_session, "sub-specific", ["partner.example"])
    claims_kam = Developer(id=str(uuid4()), email="claims-kam@desk.example", name="Claims KAM")
    db_session.add(claims_kam)
    await db_session.flush()
    claims = ServiceDeskAccount(
        id=str(uuid4()), workspace_id=ws.id, name="Partner Co — Claims",
        assigned_owner_id=claims_kam.id,
    )
    db_session.add(claims)
    await db_session.flush()
    db_session.add(
        ServiceDeskAccountDomain(
            id=str(uuid4()), workspace_id=ws.id, account_id=claims.id,
            domain="claims.partner.example",
        )
    )
    await db_session.commit()

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        InboundEmail(
            to=mailbox.address, from_email="fnol@claims.partner.example",
            subject="New claim", message_id="specific-1",
        ),
        mailbox,
        "service_desk_webhook",
    )
    await db_session.commit()

    assert ticket.assignee_id == claims_kam.id


def test_candidate_domains_never_reach_a_public_suffix():
    assert domain_candidates("mail.eu.partner.com") == [
        "mail.eu.partner.com",
        "eu.partner.com",
        "partner.com",
    ]
    # `co.in` is a registry, not an organisation — walking up to it would hand
    # one account every Indian sender.
    assert domain_candidates("partner.co.in") == ["partner.co.in"]
    assert domain_candidates("partner.com") == ["partner.com"]
    assert domain_candidates("not-a-domain") == []


def test_an_over_broad_domain_cannot_be_saved():
    assert domain_is_too_broad("com") is True
    assert domain_is_too_broad("co.in") is True
    assert domain_is_too_broad("partner.com") is False
    assert domain_is_too_broad("partner.co.in") is False


# ---------------------------------------------------------- forwarded mail


@pytest.mark.asyncio
async def test_a_forwarded_partner_request_reaches_the_mapped_owner(
    db_session: AsyncSession,
):
    """The reported case. Forwarded by a colleague, owned by the right KAM."""
    ws, mailbox, kam = await _desk(db_session, "fwd-body", ["partner.example"])

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        InboundEmail(
            to=mailbox.address,
            from_email="colleague@desk.example",
            subject="Fwd: Endorsement request",
            body_text=_FORWARD_BODY,
            message_id="fwd-1",
        ),
        mailbox,
        "service_desk_webhook",
    )
    await db_session.commit()

    assert ticket.assignee_id == kam.id
    sd = await _sd(db_session, ticket.id)
    assert sd.account_id is not None
    # Attribution is inferred, so a person still confirms it — and the timeline
    # says where it came from.
    assert sd.needs_triage is True
    assert "priya@partner.example" in await _notes(db_session, ticket.id)


@pytest.mark.asyncio
async def test_a_resent_from_header_is_preferred_over_the_body(
    db_session: AsyncSession,
):
    ws, mailbox, kam = await _desk(db_session, "fwd-header", ["partner.example"])

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        InboundEmail(
            to=mailbox.address,
            from_email="colleague@desk.example",
            subject="Fwd: Endorsement request",
            body_text="(no quoted headers here)",
            headers={"Resent-From": "Sam <priya@partner.example>"},
            message_id="fwd-2",
        ),
        mailbox,
        "service_desk_webhook",
    )
    await db_session.commit()

    assert ticket.assignee_id == kam.id


@pytest.mark.asyncio
async def test_ordinary_internal_mail_is_not_attributed_to_anybody(
    db_session: AsyncSession,
):
    """A colleague writing in is a real request from a colleague. Naming them in
    Reply-To must not make it a partner's ticket."""
    ws, mailbox, kam = await _desk(db_session, "fwd-internal", ["partner.example"])

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        InboundEmail(
            to=mailbox.address,
            from_email="colleague@desk.example",
            subject="Can someone check the printer",
            body_text="It is making a noise.",
            headers={"Reply-To": "colleague@desk.example"},
            message_id="fwd-3",
        ),
        mailbox,
        "service_desk_webhook",
    )
    await db_session.commit()

    sd = await _sd(db_session, ticket.id)
    assert sd.account_id is None
    assert sd.needs_triage is True
    assert ticket.assignee_id != kam.id


def test_the_sender_resolver_reads_headers_then_the_quoted_block():
    assert (
        forwarded_sender({"resent-from": "P <p@partner.example>"}, "", "desk.example")
        == "p@partner.example"
    )
    assert forwarded_sender({}, _FORWARD_BODY, "desk.example") == "priya@partner.example"
    # Nothing to go on, and the desk's own people do not count as an origin.
    assert forwarded_sender({"reply-to": "me@desk.example"}, "", "desk.example") is None
    assert forwarded_sender({}, "just a message", "desk.example") is None


def test_only_the_top_of_a_thread_is_read():
    """The tenth `From:` down a long thread is not who sent this message."""
    noise = "\n".join(f"line {n}" for n in range(60))
    body = f"{noise}\nFrom: Someone <someone@elsewhere.example>\n"

    assert forwarded_sender({}, body, "desk.example") is None
