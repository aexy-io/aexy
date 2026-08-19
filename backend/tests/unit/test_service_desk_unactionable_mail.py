"""Mail that arrives at a watched desk mailbox but is not a request.

Two classes turned into tickets nobody could answer:

* **Our own.** The daily digest goes to the desk team, and a team member is often
  the shared ops mailbox itself. It went out through the transactional sender,
  which stamped no marker, so the sync read it back as a fresh request — a ticket
  whose requester was Aexy, quoting the desk's own open-ticket summary.
* **Infrastructure the desk has named.** "A new sign-in on Mac" from
  ``no-reply@accounts.google.com`` is about the mailbox, not for the desk — but
  that is a judgement only Ops can make, so it is a setting, not a heuristic. A
  counterparty's own ``no-reply@`` carries the notices a desk exists to act on,
  and inferring "no-reply means noise" would have dropped them.

The first pair of tests is the one that matters most: they pin the *sender* and
the *reader* against each other. The bug was not a missing check — intake's check
was fine — it was that one send path never stamped what the check reads.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.mail_headers import AUTO_SUBMITTED_HEADER, auto_generated_headers
from aexy.models.developer import Developer
from aexy.models.service_desk import (
    ServiceDeskAccount,
    ServiceDeskAccountDomain,
    ServiceDeskMailbox,
    ServiceDeskVendor,
    ServiceDeskVendorDomain,
)
from aexy.models.ticketing import Ticket
from aexy.models.workspace import Workspace
from aexy.schemas.service_desk import InboundEmail
from aexy.services.service_desk_config import normalise_ignored_senders
from aexy.services.service_desk_intake_service import (
    ServiceDeskIntakeService,
    is_aexy_generated,
    is_automatic_response,
)
from sqlalchemy import select
from tests.conftest import seed_service_desk_taxonomy


async def _workspace(db: AsyncSession, slug: str) -> Workspace:
    owner = Developer(id=str(uuid4()), email=f"owner-{slug}@desk.example", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.commit()
    await seed_service_desk_taxonomy(db, ws.id)
    return ws


async def _mailbox(db: AsyncSession, ws: Workspace) -> ServiceDeskMailbox:
    mailbox = ServiceDeskMailbox(
        id=str(uuid4()), workspace_id=ws.id, address="ops@desk.example", channel="webhook"
    )
    db.add(mailbox)
    await db.commit()
    return mailbox


def _email(**kw) -> InboundEmail:
    base = dict(
        to="ops@desk.example",
        from_email="someone@partner.example",
        subject="Help",
        body_text="Body",
    )
    base.update(kw)
    return InboundEmail(**base)


async def _tickets(db: AsyncSession, ws: Workspace) -> list[Ticket]:
    return list(
        (await db.execute(select(Ticket).where(Ticket.workspace_id == ws.id))).scalars().all()
    )


# ------------------------------------------- the sender and the reader agree


def test_what_the_senders_stamp_is_what_intake_reads():
    """The headers a send applies must be the ones intake keys on.

    Asserted against the real predicates rather than restating the strings,
    because the defect was exactly this pair drifting apart: the Gmail path
    stamped the marker, the transactional path stamped nothing, and no test
    compared them.
    """
    stamped = auto_generated_headers()
    arrived = _email(headers=stamped)

    assert is_aexy_generated(arrived) is True
    # Belt and braces: even somewhere the marker is stripped, RFC 3834 stands.
    assert is_automatic_response(_email(headers={AUTO_SUBMITTED_HEADER: "auto-generated"})) is True


def test_nothing_is_stamped_when_the_send_is_not_automatic():
    assert auto_generated_headers(False) == {}
    assert is_aexy_generated(_email(headers={})) is False


@pytest.mark.asyncio
async def test_our_own_digest_does_not_become_a_ticket(db_session: AsyncSession):
    """The reported case: SD-8, requester "Aexy", quoting the desk's own digest."""
    ws = await _workspace(db_session, "unactionable-digest")
    mailbox = await _mailbox(db_session, ws)

    result = await ServiceDeskIntakeService(db_session).ingest(
        _email(
            from_email="Aexy <support@aexy.io>",
            subject="Daily Open Tickets Summary — 2026-08-12",
            body_text="Hi Ops,\n\nHere is today's snapshot of open tickets assigned to you:",
            message_id="digest-1",
            headers=auto_generated_headers(),
        ),
        mailbox,
        "service_desk_gmail",
    )
    await db_session.commit()

    assert result is None
    assert await _tickets(db_session, ws) == []


@pytest.mark.asyncio
async def test_the_digest_marks_itself_on_the_way_out(db_session: AsyncSession, monkeypatch):
    """The other half of the pair above: the send has to stamp it.

    The digest is the one desk send that goes through the transactional service
    rather than the desk mailer, which is why it was the one that came back as a
    ticket.
    """
    from aexy.services import email_service as email_module
    from aexy.services.service_desk_digest_service import ServiceDeskDigestService

    ws = await _workspace(db_session, "unactionable-digest-send")
    calls: list[dict] = []

    async def _send(self, **kwargs):
        calls.append(kwargs)
        return None

    monkeypatch.setattr(email_module.EmailService, "send_templated_email", _send)

    sent = await ServiceDeskDigestService(db_session).send_workspace_digests(ws.id, "2026-08-12")

    assert sent >= 1
    assert calls and all(call["auto_generated"] is True for call in calls)


# --------------------------------------- infrastructure the desk has named


@pytest.mark.asyncio
async def test_a_google_account_alert_opens_a_ticket_until_ops_says_otherwise(
    db_session: AsyncSession,
):
    """Nothing is inferred from the address.

    The reported case (SD-6, "Security alert") is real noise, but the desk is the
    only one who can say so — the same address shape carries an insurer's policy
    notices.
    """
    ws = await _workspace(db_session, "unactionable-google")
    mailbox = await _mailbox(db_session, ws)

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(
            from_email="Google <no-reply@accounts.google.com>",
            subject="Security alert",
            body_text="A new sign-in on Mac",
            message_id="google-1",
        ),
        mailbox,
        "service_desk_gmail",
    )
    await db_session.commit()

    assert ticket is not None


@pytest.mark.parametrize(
    "entry",
    ["no-reply@accounts.google.com", "accounts.google.com", "  No-Reply@Accounts.Google.COM  "],
    ids=["address", "domain", "untidy"],
)
@pytest.mark.asyncio
async def test_an_ignored_sender_stops_opening_tickets(db_session: AsyncSession, entry: str):
    """One address, or a whole domain, however tidily it was typed."""
    ws = await _workspace(db_session, f"unactionable-ignored-{abs(hash(entry)) % 9999}")
    mailbox = await _mailbox(db_session, ws)
    ws.settings = {"service_desk": {"ignored_senders": [entry]}}
    await db_session.commit()

    result = await ServiceDeskIntakeService(db_session).ingest(
        _email(
            from_email="Google <no-reply@accounts.google.com>",
            subject="Security alert",
            message_id=f"ignored-{abs(hash(entry)) % 9999}",
        ),
        mailbox,
        "service_desk_gmail",
    )
    await db_session.commit()

    assert result is None
    assert await _tickets(db_session, ws) == []


@pytest.mark.asyncio
async def test_an_ignore_entry_does_not_silence_everybody_else(db_session: AsyncSession):
    ws = await _workspace(db_session, "unactionable-ignore-scope")
    mailbox = await _mailbox(db_session, ws)
    ws.settings = {"service_desk": {"ignored_senders": ["accounts.google.com"]}}
    await db_session.commit()

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(from_email="bhanu@gmail.com", message_id="ignore-scope-1"),
        mailbox,
        "service_desk_gmail",
    )
    await db_session.commit()

    assert ticket is not None


def test_the_ignore_list_is_cleaned_before_it_is_stored():
    assert normalise_ignored_senders(
        ["  No-Reply@Google.com ", "@Example.COM", "", "no-reply@google.com", "has space", None]
    ) == ["no-reply@google.com", "example.com"]
    # Not a list at all: an older row, or a hand-edited settings blob.
    assert normalise_ignored_senders("no-reply@google.com") == []
    assert normalise_ignored_senders(None) == []


@pytest.mark.asyncio
async def test_a_known_vendors_no_reply_still_opens_a_ticket(db_session: AsyncSession):
    """Master data outranks a broad ignore entry.

    An insurer that notifies from no-reply@ is still the insurer, and those
    notices are the desk's work — so a domain somebody ignored in passing cannot
    silence a counterparty they deliberately registered.
    """
    ws = await _workspace(db_session, "unactionable-vendor")
    mailbox = await _mailbox(db_session, ws)
    # Even with the whole domain ignored, master data outranks it.
    ws.settings = {"service_desk": {"ignored_senders": ["xyzlife.example"]}}
    vendor = ServiceDeskVendor(id=str(uuid4()), workspace_id=ws.id, name="XYZ Life")
    db_session.add(vendor)
    await db_session.flush()
    db_session.add(
        ServiceDeskVendorDomain(
            id=str(uuid4()), workspace_id=ws.id, vendor_id=vendor.id, domain="xyzlife.example"
        )
    )
    await db_session.commit()

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(
            from_email="no-reply@xyzlife.example",
            subject="Policy 4471 lapsed",
            message_id="vendor-noreply-1",
        ),
        mailbox,
        "service_desk_gmail",
    )
    await db_session.commit()

    assert ticket is not None


@pytest.mark.asyncio
async def test_a_known_accounts_no_reply_still_opens_a_ticket(db_session: AsyncSession):
    ws = await _workspace(db_session, "unactionable-account")
    mailbox = await _mailbox(db_session, ws)
    ws.settings = {"service_desk": {"ignored_senders": ["acme.example"]}}
    account = ServiceDeskAccount(id=str(uuid4()), workspace_id=ws.id, name="Acme Broking")
    db_session.add(account)
    await db_session.flush()
    db_session.add(
        ServiceDeskAccountDomain(
            id=str(uuid4()), workspace_id=ws.id, account_id=account.id, domain="acme.example"
        )
    )
    await db_session.commit()

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(
            from_email="noreply@acme.example",
            subject="Endorsement request",
            message_id="account-noreply-1",
        ),
        mailbox,
        "service_desk_gmail",
    )
    await db_session.commit()

    assert ticket is not None


@pytest.mark.asyncio
async def test_an_ordinary_sender_is_unaffected(db_session: AsyncSession):
    ws = await _workspace(db_session, "unactionable-ordinary")
    mailbox = await _mailbox(db_session, ws)

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(from_email="bhanu@partner.example", message_id="ordinary-1"),
        mailbox,
        "service_desk_gmail",
    )
    await db_session.commit()

    assert ticket is not None


@pytest.mark.asyncio
async def test_a_partners_daily_automailer_can_finally_be_excluded(db_session: AsyncSession):
    """The reported case: a whole address outranks Master Data.

    ``dailyreport@`` sits on a domain mapped to a partner, so the account match
    used to override the ignore entry — the mail opened a ticket every day and
    nothing in the product could stop it. A full address is only ever typed into
    this list by somebody who has seen that exact mail and decided it is noise.
    """
    ws = await _workspace(db_session, "unactionable-partner-automailer")
    mailbox = await _mailbox(db_session, ws)
    ws.settings = {"service_desk": {"ignored_senders": ["dailyreport@acme.example"]}}
    account = ServiceDeskAccount(id=str(uuid4()), workspace_id=ws.id, name="Acme Broking")
    db_session.add(account)
    await db_session.flush()
    db_session.add(
        ServiceDeskAccountDomain(
            id=str(uuid4()), workspace_id=ws.id, account_id=account.id, domain="acme.example"
        )
    )
    await db_session.commit()

    result = await ServiceDeskIntakeService(db_session).ingest(
        _email(
            from_email="dailyreport@acme.example",
            subject="Acme daily position 2026-08-19",
            message_id="partner-automailer-1",
        ),
        mailbox,
        "service_desk_gmail",
    )
    await db_session.commit()

    assert result is None
    assert await _tickets(db_session, ws) == []


@pytest.mark.asyncio
async def test_silencing_one_address_does_not_silence_the_partner(db_session: AsyncSession):
    """The reason the override existed. A colleague at the same partner writes
    from their own address, and that is a request like any other."""
    ws = await _workspace(db_session, "unactionable-partner-human")
    mailbox = await _mailbox(db_session, ws)
    ws.settings = {"service_desk": {"ignored_senders": ["dailyreport@acme.example"]}}
    account = ServiceDeskAccount(id=str(uuid4()), workspace_id=ws.id, name="Acme Broking")
    db_session.add(account)
    await db_session.flush()
    db_session.add(
        ServiceDeskAccountDomain(
            id=str(uuid4()), workspace_id=ws.id, account_id=account.id, domain="acme.example"
        )
    )
    await db_session.commit()

    ticket = await ServiceDeskIntakeService(db_session).ingest(
        _email(
            from_email="priya@acme.example",
            subject="Endorsement request",
            message_id="partner-human-1",
        ),
        mailbox,
        "service_desk_gmail",
    )
    await db_session.commit()

    assert ticket is not None


def test_only_a_whole_address_outranks_master_data():
    """The rule the override turns on, stated on its own."""
    from aexy.services.service_desk_config import address_is_ignored

    ignored = ["dailyreport@acme.example", "acme.example"]

    assert address_is_ignored("dailyreport@acme.example", ignored) is True
    # A domain entry covers this sender, but not as a whole address — so Master
    # Data still gets to overrule it.
    assert address_is_ignored("priya@acme.example", ignored) is False
    assert address_is_ignored(None, ignored) is False
    assert address_is_ignored("dailyreport@acme.example", []) is False
