"""What the manual-ticket receipt reports back, and why it matters.

``acknowledge_ticket`` runs inside a Temporal activity that raises on
``ACK_FAILED`` so ``STANDARD_RETRY`` tries again. That makes its return value a
retry decision rather than a log line, and both directions are expensive to get
wrong: report failure for a receipt that went out and the requester is
acknowledged twice; report success for one that did not and it is gone with a
line in the log claiming it was sent.

The two cases pinned here are the ones that were wrong:

- a Gmail-channel send that fails, in a deployment with no transactional email
  behind it — the desk's most common shape — used to report "nothing is
  configured" and retire the receipt on the one error that deserves a retry
- a receipt withheld because a colleague had already answered by hand used to
  report ``ACK_SENT``, putting "sent" in the activity log for a message nobody
  ever received
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.service_desk import ServiceDeskMailbox, ServiceDeskTicket
from aexy.models.ticketing import Ticket, TicketResponse
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.service_desk import InboundEmail
from aexy.services import service_desk_mailer as mailer
from aexy.services.service_desk_intake_service import (
    ACK_FAILED,
    ACK_NOTHING_TO_DO,
    ACK_SENT,
    ServiceDeskIntakeService,
)
from aexy.services.service_desk_mailer import (
    SEND_FAILED,
    SEND_OK,
    SEND_UNCONFIGURED,
    send_service_desk_email,
)
from tests.conftest import seed_service_desk_taxonomy

DESK_ADDRESS = "operations@example.com"
REQUESTER = "rahul@abcfinance.com"


async def _ws(db: AsyncSession, slug: str) -> Workspace:
    owner = Developer(id=str(uuid4()), email=f"owner-{slug}@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.flush()
    db.add(
        WorkspaceMember(
            workspace_id=ws.id, developer_id=owner.id, role="admin", status="active"
        )
    )
    await db.commit()
    await seed_service_desk_taxonomy(db, ws.id)
    return ws


async def _mailbox(
    db: AsyncSession, ws: Workspace, channel: str = "webhook"
) -> ServiceDeskMailbox:
    mb = ServiceDeskMailbox(
        id=str(uuid4()),
        workspace_id=ws.id,
        address=DESK_ADDRESS,
        channel=channel,
        # Only the Gmail branch reads this, and only its presence decides whether
        # that branch is taken at all.
        integration_id=str(uuid4()) if channel == "gmail_sync" else None,
    )
    db.add(mb)
    await db.commit()
    return mb


async def _ticket(db: AsyncSession, ws: Workspace, mb: ServiceDeskMailbox) -> Ticket:
    """A committed ticket with a requester to write back to."""
    intake = ServiceDeskIntakeService(db)
    ticket = await intake.ingest(
        InboundEmail(
            to=DESK_ADDRESS,
            from_email=REQUESTER,
            subject="Policy copy please",
            body_text="Body",
            message_id=f"<{uuid4().hex[:8]}@x.com>",
        ),
        mb,
        source="service_desk_webhook",
    )
    await db.commit()
    # `ingest` queued a receipt of its own; this file is about the one
    # `acknowledge_ticket` queues afterwards, so start from an empty queue.
    intake._pending_notifications.clear()
    return ticket


def _email_service(monkeypatch, *, configured: bool) -> None:
    monkeypatch.setattr(
        "aexy.services.email_service.EmailService.is_configured",
        property(lambda self: configured),
    )


def _gmail(monkeypatch, *, works: bool) -> None:
    async def _send(*args, **kwargs):
        if not works:
            raise RuntimeError("Gmail API 503")

    monkeypatch.setattr(mailer, "_send_via_gmail", _send)


# ------------------------------------------------------------------- the mailer


@pytest.mark.asyncio
async def test_a_failed_gmail_send_with_no_fallback_is_retryable(
    db_session: AsyncSession, monkeypatch
):
    """The regression. Gmail is the channel, it failed, and there is nothing to
    fall back to — so the send is worth another attempt, not a shrug."""
    ws = await _ws(db_session, f"gm-fail-{uuid4().hex[:6]}")
    mb = await _mailbox(db_session, ws, channel="gmail_sync")
    _gmail(monkeypatch, works=False)
    _email_service(monkeypatch, configured=False)

    outcome = await send_service_desk_email(db_session, mb, REQUESTER, "Subject", "Body")

    assert outcome == SEND_FAILED


@pytest.mark.asyncio
async def test_no_channel_at_all_is_not_worth_retrying(
    db_session: AsyncSession, monkeypatch
):
    """Same unconfigured deployment, but nothing was ever attempted: a webhook
    mailbox has no channel of its own. Retrying cannot help until somebody
    configures email, so this must stay distinguishable from a failed send."""
    ws = await _ws(db_session, f"unconf-{uuid4().hex[:6]}")
    mb = await _mailbox(db_session, ws)
    _email_service(monkeypatch, configured=False)

    outcome = await send_service_desk_email(db_session, mb, REQUESTER, "Subject", "Body")

    assert outcome == SEND_UNCONFIGURED


@pytest.mark.asyncio
async def test_gmail_carrying_the_message_needs_no_fallback(
    db_session: AsyncSession, monkeypatch
):
    ws = await _ws(db_session, f"gm-ok-{uuid4().hex[:6]}")
    mb = await _mailbox(db_session, ws, channel="gmail_sync")
    _gmail(monkeypatch, works=True)
    # Deliberately unconfigured: reaching EmailService at all would be the bug.
    _email_service(monkeypatch, configured=False)

    outcome = await send_service_desk_email(db_session, mb, REQUESTER, "Subject", "Body")

    assert outcome == SEND_OK


# ------------------------------------------------------- what the activity logs


def _stub_send(monkeypatch, outcome: str) -> list[str]:
    """Replace the send with one that reports `outcome`, recording recipients."""
    recipients: list[str] = []

    async def _send(db, mailbox, to_email, subject, body_text, thread_id=None):
        recipients.append(to_email)
        return outcome

    monkeypatch.setattr(mailer, "send_service_desk_email", _send)
    return recipients


@pytest.mark.asyncio
async def test_a_delivered_receipt_reports_sent(db_session: AsyncSession, monkeypatch):
    ws = await _ws(db_session, f"ack-ok-{uuid4().hex[:6]}")
    mb = await _mailbox(db_session, ws)
    ticket = await _ticket(db_session, ws, mb)
    recipients = _stub_send(monkeypatch, SEND_OK)

    outcome = await ServiceDeskIntakeService(db_session).acknowledge_ticket(ticket.id)

    assert outcome == ACK_SENT
    assert recipients == [REQUESTER]


@pytest.mark.asyncio
async def test_an_undelivered_receipt_reports_failed(
    db_session: AsyncSession, monkeypatch
):
    """What the Temporal activity turns into a raise, so the retry policy runs."""
    ws = await _ws(db_session, f"ack-fail-{uuid4().hex[:6]}")
    mb = await _mailbox(db_session, ws)
    ticket = await _ticket(db_session, ws, mb)
    _stub_send(monkeypatch, SEND_FAILED)

    outcome = await ServiceDeskIntakeService(db_session).acknowledge_ticket(ticket.id)

    assert outcome == ACK_FAILED


@pytest.mark.asyncio
async def test_a_receipt_withheld_for_a_human_reply_does_not_report_sent(
    db_session: AsyncSession, monkeypatch
):
    """A colleague answered first, so the canned receipt stands down.

    Nothing was sent and nothing failed. Reporting ACK_SENT wrote "sent" to the
    activity log for a message that never existed; ACK_NOTHING_TO_DO says what
    happened and, like ACK_SENT, costs no retry.
    """
    ws = await _ws(db_session, f"ack-held-{uuid4().hex[:6]}")
    mb = await _mailbox(db_session, ws)
    ticket = await _ticket(db_session, ws, mb)
    # The desk's own address answering the requester by hand is exactly what
    # `_already_answered_by_a_person` looks for.
    db_session.add(
        TicketResponse(
            id=str(uuid4()),
            ticket_id=ticket.id,
            author_email=DESK_ADDRESS,
            content="Sent it across just now.",
            is_internal=False,
        )
    )
    await db_session.commit()
    recipients = _stub_send(monkeypatch, SEND_OK)

    outcome = await ServiceDeskIntakeService(db_session).acknowledge_ticket(ticket.id)

    assert outcome == ACK_NOTHING_TO_DO
    assert recipients == [], "the receipt must not go out on top of a human reply"


@pytest.mark.asyncio
async def test_a_receipt_with_nowhere_to_go_reports_nothing_to_do(
    db_session: AsyncSession, monkeypatch
):
    """No channel configured: not a send, and not a failure worth retrying."""
    ws = await _ws(db_session, f"ack-unconf-{uuid4().hex[:6]}")
    mb = await _mailbox(db_session, ws)
    ticket = await _ticket(db_session, ws, mb)
    _email_service(monkeypatch, configured=False)

    outcome = await ServiceDeskIntakeService(db_session).acknowledge_ticket(ticket.id)

    assert outcome == ACK_NOTHING_TO_DO
    # and no ticket state was disturbed on the way
    sd = (
        await db_session.execute(
            select(ServiceDeskTicket).where(ServiceDeskTicket.ticket_id == ticket.id)
        )
    ).scalar_one()
    assert sd is not None
