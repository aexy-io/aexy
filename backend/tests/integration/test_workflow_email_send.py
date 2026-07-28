"""E2: the workflow/automation email send path validates + suppresses.

`send_workflow_email` is the shared send point for automation `send_email`
actions. Unlike the campaign path it did NOT validate the recipient address
(E2.9) or honour suppression (E2.7), so an automation could mail a malformed
or unsubscribed/bounced address. These tests lock both guards.
"""

import hashlib
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.email_marketing import EmailSubscriber, SubscriberStatus
from aexy.models.workspace import Workspace
from aexy.services.email_campaign_service import EmailCampaignService


@pytest_asyncio.fixture
async def ws(db_session: AsyncSession):
    dev = Developer(id=str(uuid4()), email=f"d-{uuid4().hex[:6]}@t.com", name="D")
    db_session.add(dev)
    await db_session.flush()
    w = Workspace(id=str(uuid4()), name="W", slug=f"w-{uuid4().hex[:6]}", owner_id=dev.id)
    db_session.add(w)
    await db_session.commit()
    return w


def _sub(ws_id, email, status):
    return EmailSubscriber(
        id=str(uuid4()), workspace_id=ws_id, email=email,
        email_hash=hashlib.sha256(email.lower().encode()).hexdigest(), status=status,
    )


async def _send(db, ws_id, to_email):
    return await EmailCampaignService(db).send_workflow_email(
        workspace_id=ws_id, to_email=to_email, subject="s", html_body="<p>b</p>",
    )


@pytest.mark.asyncio
async def test_invalid_recipient_is_skipped(db_session, ws):
    r = await _send(db_session, ws.id, "not-an-email")
    assert r["status"] == "skipped"
    assert r["reason"] == "invalid_email"


@pytest.mark.asyncio
async def test_unsubscribed_recipient_is_skipped(db_session, ws):
    db_session.add(_sub(ws.id, "gone@example.com", SubscriberStatus.UNSUBSCRIBED.value))
    await db_session.commit()
    r = await _send(db_session, ws.id, "gone@example.com")
    assert r["status"] == "skipped"
    assert r["reason"] == "unsubscribed"


@pytest.mark.asyncio
async def test_bounced_recipient_is_skipped(db_session, ws):
    db_session.add(_sub(ws.id, "bounce@example.com", SubscriberStatus.BOUNCED.value))
    await db_session.commit()
    r = await _send(db_session, ws.id, "bounce@example.com")
    assert r["status"] == "skipped"
    assert r["reason"] == "bounced"


@pytest.mark.asyncio
async def test_valid_active_recipient_proceeds_to_send(db_session, ws):
    # Valid + not suppressed → passes the guards and actually sends (provider
    # mocked so the test doesn't touch the network).
    sent_log = SimpleNamespace(status="sent", ses_message_id="msg-1", error_message=None)
    with patch(
        "aexy.services.email_service.email_service.send_templated_email",
        new_callable=AsyncMock, return_value=sent_log,
    ):
        r = await _send(db_session, ws.id, "ok@example.com")
    assert r["status"] == "sent"
    assert r["to"] == "ok@example.com"


# --- E2.8: consent basis + unsubscribe ------------------------------------

@pytest.mark.asyncio
async def test_send_registers_recipient_as_subscriber(db_session, ws):
    # E2.8: the recipient becomes a tracked subscriber (consent basis), so a
    # later unsubscribe/bounce is honoured on subsequent sends.
    sent_log = SimpleNamespace(status="sent", ses_message_id="m", error_message=None)
    with patch(
        "aexy.services.email_service.email_service.send_templated_email",
        new_callable=AsyncMock, return_value=sent_log,
    ):
        await _send(db_session, ws.id, "new-contact@example.com")

    email_hash = hashlib.sha256("new-contact@example.com".encode()).hexdigest()
    sub = (await db_session.execute(
        select(EmailSubscriber).where(EmailSubscriber.email_hash == email_hash)
    )).scalars().first()
    assert sub is not None
    assert sub.status == SubscriberStatus.ACTIVE.value
    assert sub.preference_token  # needed to build a one-click unsubscribe URL


@pytest.mark.asyncio
async def test_repeat_send_reuses_the_existing_subscriber(db_session, ws):
    sent_log = SimpleNamespace(status="sent", ses_message_id="m", error_message=None)
    with patch(
        "aexy.services.email_service.email_service.send_templated_email",
        new_callable=AsyncMock, return_value=sent_log,
    ):
        await _send(db_session, ws.id, "repeat@example.com")
        await _send(db_session, ws.id, "repeat@example.com")

    subscribers = (await db_session.execute(
        select(EmailSubscriber).where(
            EmailSubscriber.workspace_id == ws.id,
            EmailSubscriber.email_hash == hashlib.sha256(
                "repeat@example.com".encode()
            ).hexdigest(),
        )
    )).scalars().all()
    assert len(subscribers) == 1


def test_build_unsubscribe_url_contains_token():
    svc = EmailCampaignService(db=None)
    url = svc._build_unsubscribe_url(SimpleNamespace(preference_token="tok123"))
    assert "tok123" in url
