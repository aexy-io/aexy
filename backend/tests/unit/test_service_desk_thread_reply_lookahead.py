"""``desk_replied_in_thread`` against real Gmail ``threads.get`` payloads.

This is the one question the desk cannot answer from its own database: has a
colleague already replied by hand, in the seconds between the mail arriving and
the sync creating the ticket? Every other test stubs this function, so its
parsing — labels, ``internalDate``, the metadata headers — is only pinned here.

It decides whether a requester is acknowledged at all, and it fails closed, so a
wrong answer is silent in both directions: a receipt that never goes out, or a
canned receipt landing after a person already replied.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.google_integration import GoogleIntegration
from aexy.models.service_desk import ServiceDeskMailbox
from aexy.models.workspace import Workspace
from aexy.services import service_desk_mailer as mailer
from aexy.services.service_desk_mailer import (
    OUTBOUND_MARKER_HEADER,
    desk_replied_in_thread,
)

ARRIVED = datetime(2026, 8, 12, 14, 19, tzinfo=timezone.utc)


def _ms(when: datetime) -> str:
    """Gmail reports internalDate as a millisecond epoch *string*."""
    return str(int(when.timestamp() * 1000))


def _message(
    *,
    when: datetime,
    sent: bool = True,
    headers: dict[str, str] | None = None,
) -> dict:
    """One entry shaped like Gmail's threads.get?format=metadata response."""
    return {
        "id": uuid4().hex[:16],
        "labelIds": ["SENT"] if sent else ["INBOX", "UNREAD"],
        "internalDate": _ms(when),
        "payload": {
            "headers": [
                {"name": name, "value": value}
                for name, value in (headers or {"From": "Ops <ops@desk.example>"}).items()
            ]
        },
    }


async def _mailbox(db: AsyncSession, slug: str, channel: str = "gmail_sync") -> ServiceDeskMailbox:
    owner = Developer(id=str(uuid4()), email=f"owner-{slug}@desk.example", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.flush()
    integration = GoogleIntegration(
        id=str(uuid4()),
        workspace_id=ws.id,
        connected_by_id=owner.id,
        google_email="ops@desk.example",
        access_token="t",
        refresh_token="r",
        token_expiry=datetime.now(timezone.utc) + timedelta(hours=1),
        gmail_sync_enabled=True,
    )
    db.add(integration)
    mailbox = ServiceDeskMailbox(
        id=str(uuid4()),
        workspace_id=ws.id,
        address="ops@desk.example",
        channel=channel,
        integration_id=integration.id if channel == "gmail_sync" else None,
    )
    db.add(mailbox)
    await db.commit()
    return mailbox


def _thread(monkeypatch, messages: list[dict]) -> list[dict]:
    """Stub the Gmail call, returning the recorded request params."""
    calls: list[dict] = []

    async def _request(self, integration, method, endpoint, **kwargs):
        calls.append({"endpoint": endpoint, **kwargs})
        return {"id": "thread-1", "messages": messages}

    monkeypatch.setattr(
        "aexy.services.gmail_sync_service.GmailSyncService._make_gmail_request", _request
    )
    return calls


@pytest.mark.asyncio
async def test_a_colleagues_later_reply_is_found(db_session: AsyncSession, monkeypatch):
    mailbox = await _mailbox(db_session, "look-later")
    calls = _thread(monkeypatch, [_message(when=ARRIVED + timedelta(minutes=5))])

    assert await desk_replied_in_thread(db_session, mailbox, "thread-1", after=ARRIVED) is True
    # The headers the decision needs must actually be asked for: Gmail returns
    # only the named ones under format=metadata.
    requested = calls[0]["params"]["metadataHeaders"]
    assert OUTBOUND_MARKER_HEADER in requested
    assert "Auto-Submitted" in requested and "Precedence" in requested


@pytest.mark.asyncio
async def test_a_thread_the_desk_started_is_not_an_answer(
    db_session: AsyncSession, monkeypatch
):
    """The regression this cutoff exists for.

    An ops colleague writes to a partner by hand; the partner's reply is what
    opens the ticket. The desk's own opening message predates it, so it says
    nothing about whether *this* request has been answered — and treating it as
    an answer meant that requester was never acknowledged at all.
    """
    mailbox = await _mailbox(db_session, "look-earlier")
    _thread(
        monkeypatch,
        [
            _message(when=ARRIVED - timedelta(hours=2)),
            _message(when=ARRIVED, sent=False),
        ],
    )

    assert await desk_replied_in_thread(db_session, mailbox, "thread-1", after=ARRIVED) is False


@pytest.mark.asyncio
async def test_our_own_acknowledgement_is_not_a_colleague(
    db_session: AsyncSession, monkeypatch
):
    mailbox = await _mailbox(db_session, "look-marker")
    _thread(
        monkeypatch,
        [
            _message(
                when=ARRIVED + timedelta(minutes=1),
                headers={"From": "Ops <ops@desk.example>", OUTBOUND_MARKER_HEADER: "1"},
            )
        ],
    )

    assert await desk_replied_in_thread(db_session, mailbox, "thread-1", after=ARRIVED) is False


@pytest.mark.asyncio
async def test_the_desks_own_out_of_office_is_not_a_colleague(
    db_session: AsyncSession, monkeypatch
):
    """An auto-responder is the strongest reason to send the ticket id, not to
    withhold it: the requester has been told nobody is reading."""
    mailbox = await _mailbox(db_session, "look-ooo")
    _thread(
        monkeypatch,
        [
            _message(
                when=ARRIVED + timedelta(minutes=1),
                headers={
                    "From": "Ops <ops@desk.example>",
                    "Subject": "Out of office: SSO login",
                    "Auto-Submitted": "auto-replied",
                },
            )
        ],
    )

    assert await desk_replied_in_thread(db_session, mailbox, "thread-1", after=ARRIVED) is False


@pytest.mark.asyncio
async def test_inbound_mail_in_the_thread_is_not_the_desk_replying(
    db_session: AsyncSession, monkeypatch
):
    mailbox = await _mailbox(db_session, "look-inbound")
    _thread(monkeypatch, [_message(when=ARRIVED + timedelta(minutes=3), sent=False)])

    assert await desk_replied_in_thread(db_session, mailbox, "thread-1", after=ARRIVED) is False


@pytest.mark.asyncio
async def test_an_undatable_message_is_not_counted(db_session: AsyncSession, monkeypatch):
    mailbox = await _mailbox(db_session, "look-undated")
    message = _message(when=ARRIVED + timedelta(minutes=3))
    message["internalDate"] = "not-a-number"
    _thread(monkeypatch, [message])

    assert await desk_replied_in_thread(db_session, mailbox, "thread-1", after=ARRIVED) is False


@pytest.mark.asyncio
async def test_it_fails_towards_sending_the_receipt(db_session: AsyncSession, monkeypatch):
    """Every case it cannot establish. A receipt too many beats a requester who
    is never told their ticket number."""
    gmail_mailbox = await _mailbox(db_session, "look-fail-gmail")
    webhook_mailbox = await _mailbox(db_session, "look-fail-webhook", channel="webhook")
    _thread(monkeypatch, [_message(when=ARRIVED + timedelta(minutes=5))])

    assert await desk_replied_in_thread(db_session, None, "thread-1", after=ARRIVED) is False
    assert await desk_replied_in_thread(db_session, gmail_mailbox, None, after=ARRIVED) is False
    # No arrival time means no cutoff, so "since when?" has no answer.
    assert await desk_replied_in_thread(db_session, gmail_mailbox, "thread-1", after=None) is False
    # A webhook mailbox has no thread to read, and must not be assumed answered.
    assert (
        await desk_replied_in_thread(db_session, webhook_mailbox, "thread-1", after=ARRIVED)
        is False
    )


@pytest.mark.asyncio
async def test_a_gmail_failure_does_not_withhold_the_receipt(
    db_session: AsyncSession, monkeypatch
):
    mailbox = await _mailbox(db_session, "look-error")

    async def _boom(self, integration, method, endpoint, **kwargs):
        raise RuntimeError("Gmail API error: 503")

    monkeypatch.setattr(
        "aexy.services.gmail_sync_service.GmailSyncService._make_gmail_request", _boom
    )

    assert await desk_replied_in_thread(db_session, mailbox, "thread-1", after=ARRIVED) is False


@pytest.mark.asyncio
async def test_another_workspaces_integration_is_never_read(
    db_session: AsyncSession, monkeypatch
):
    """Same guard the send path has: a mailbox row must not reach across
    workspaces into somebody else's Google account."""
    mailbox = await _mailbox(db_session, "look-cross")
    other = await _mailbox(db_session, "look-cross-other")
    mailbox.integration_id = other.integration_id
    await db_session.commit()
    calls = _thread(monkeypatch, [_message(when=ARRIVED + timedelta(minutes=5))])

    assert await desk_replied_in_thread(db_session, mailbox, "thread-1", after=ARRIVED) is False
    assert calls == []


@pytest.mark.asyncio
async def test_the_lookahead_is_wired_into_the_receipt_flush(
    db_session: AsyncSession, monkeypatch
):
    """The arrival time has to survive the trip from intake to the flush.

    Passing None here would silently disable the whole check, and every other
    test in the suite stubs the function that would notice.
    """
    from aexy.services.service_desk_intake_service import ServiceDeskIntakeService

    seen: list[datetime | None] = []

    async def _record(db, mb, thread_id, after=None):
        seen.append(after)
        return False

    async def _send(db, mb, to_email, subject, body_text, thread_id=None):
        return None

    monkeypatch.setattr(mailer, "desk_replied_in_thread", _record)
    monkeypatch.setattr(mailer, "send_service_desk_email", _send)

    mailbox = await _mailbox(db_session, "look-wired")
    service = ServiceDeskIntakeService(db_session)
    service._pending_notifications.append(
        {
            "workspace_id": mailbox.workspace_id,
            "mailbox_id": mailbox.id,
            "ticket_id": None,
            "ticket_number": 7,
            "to": "requester@partner.example",
            "thread_id": "thread-1",
            "arrived_at": ARRIVED,
            "vars": {"display_id": "SD-7", "subject": "Hi", "requester_name": "R"},
        }
    )
    await service.flush_notifications()

    assert seen == [ARRIVED]
