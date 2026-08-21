"""Gmail push — the desk's mail arriving in seconds rather than on a timer.

Intake polls, so a request waits up to the desk's interval before it is a
ticket. Gmail can push instead, and this covers the shape of that path rather
than Gmail itself: what the endpoint does with a notification, and what it
refuses to do.

The property that matters most is that **push is a shortcut, never the only
path**. A watch lapses after seven days, a Pub/Sub delivery can be dropped, and
a deployment may have no topic at all — in each case the mail must still arrive,
just later. Every test here is written against that: nothing about push failing
is allowed to be worse than the polling that is still underneath it.
"""

from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from aexy.api.gmail_push import router as push_router
from aexy.core.config import get_settings
from aexy.models.developer import Developer
from aexy.models.google_integration import GoogleIntegration
from aexy.models.service_desk import ServiceDeskMailbox
from aexy.models.workspace import Workspace


def _envelope(address: str, history_id: str = "42") -> dict:
    """The Pub/Sub shape: our JSON, base64'd, inside a `message`."""
    data = json.dumps({"emailAddress": address, "historyId": history_id}).encode()
    return {"message": {"data": base64.b64encode(data).decode(), "messageId": "m1"}}


@pytest.fixture
def push_token(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "gmail_push_token", "shared-secret", raising=False)
    monkeypatch.setattr(settings, "gmail_push_topic", "projects/p/topics/t", raising=False)
    return "shared-secret"


@pytest.fixture
async def client(db_session):
    from fastapi import FastAPI

    from aexy.core.database import get_db

    app = FastAPI()
    app.include_router(push_router)
    # The endpoint takes its session by dependency rather than opening its own,
    # so the test can hand it the same in-memory database the fixtures wrote to.
    app.dependency_overrides[get_db] = lambda: db_session
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as async_client:
        yield async_client


@pytest.fixture
def dispatched(monkeypatch):
    """Capture the hand-off instead of making it."""
    calls: list[dict] = []

    async def _dispatch(activity, payload, **kwargs):
        calls.append({"activity": activity, "payload": payload, **kwargs})

    monkeypatch.setattr("aexy.temporal.dispatch.dispatch", _dispatch)
    return calls


async def _watched_mailbox(db, slug: str, address: str) -> GoogleIntegration:
    owner = Developer(id=str(uuid4()), email=f"owner-{slug}@desk.example", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(id=str(uuid4()), name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.flush()
    integration = GoogleIntegration(
        id=str(uuid4()), workspace_id=ws.id, google_email=address,
        access_token="token", refresh_token="refresh",
        token_expiry=datetime.now(timezone.utc) + timedelta(hours=1),
        is_active=True, gmail_sync_enabled=True,
    )
    db.add(integration)
    await db.flush()
    db.add(
        ServiceDeskMailbox(
            id=str(uuid4()), workspace_id=ws.id, address=address,
            channel="gmail_sync", integration_id=integration.id, is_active=True,
        )
    )
    await db.commit()
    return integration


# --------------------------------------------------------------- the secret


@pytest.mark.asyncio
async def test_a_request_without_the_token_is_refused(client, push_token, dispatched):
    response = await client.post("/webhooks/gmail/push", json=_envelope("ops@desk.example"))

    assert response.status_code == 403
    assert dispatched == []


@pytest.mark.asyncio
async def test_a_deployment_with_no_token_configured_accepts_nothing(
    client, dispatched, monkeypatch
):
    """An endpoint that accepts anything because it was never set up is worse
    than one that is switched off — it would let anybody trigger syncs by
    guessing an address."""
    monkeypatch.setattr(get_settings(), "gmail_push_token", None, raising=False)

    response = await client.post(
        "/webhooks/gmail/push?token=anything", json=_envelope("ops@desk.example")
    )

    assert response.status_code == 403
    assert dispatched == []


# ------------------------------------------------------------- the hand-off


@pytest.mark.asyncio
async def test_a_watched_mailbox_triggers_one_incremental_sync(
    client, push_token, dispatched, db_session
):
    integration = await _watched_mailbox(db_session, "push-ok", "ops@desk.example")

    response = await client.post(
        f"/webhooks/gmail/push?token={push_token}", json=_envelope("ops@desk.example")
    )

    assert response.status_code == 204
    assert len(dispatched) == 1
    assert dispatched[0]["activity"] == "sync_gmail_push"
    assert dispatched[0]["payload"].integration_id == str(integration.id)


@pytest.mark.asyncio
async def test_a_burst_of_notifications_collapses_onto_one_workflow(
    client, push_token, dispatched, db_session
):
    """Gmail sends one notification per change, so five messages arrive as five
    deliveries. Run concurrently they would race the same history cursor and
    each re-ingest what the others had already claimed."""
    integration = await _watched_mailbox(db_session, "push-burst", "burst@desk.example")

    for _ in range(3):
        await client.post(
            f"/webhooks/gmail/push?token={push_token}", json=_envelope("burst@desk.example")
        )

    assert {call["workflow_id"] for call in dispatched} == {
        f"gmail-push-{integration.id}"
    }


# ------------------------------------------------------ nothing to act on


@pytest.mark.asyncio
async def test_an_unknown_mailbox_is_acknowledged_not_retried(
    client, push_token, dispatched
):
    """A watch outlives the integration it was made for whenever somebody
    disconnects an account. Answering 404 would make Pub/Sub redeliver that
    notification until it expired."""
    response = await client.post(
        f"/webhooks/gmail/push?token={push_token}", json=_envelope("nobody@elsewhere.example")
    )

    assert response.status_code == 204
    assert dispatched == []


@pytest.mark.asyncio
async def test_a_mailbox_that_is_not_service_desk_intake_is_ignored(
    client, push_token, dispatched, db_session
):
    """A personal inbox on the same deployment is not the desk's business."""
    owner = Developer(id=str(uuid4()), email="p-owner@desk.example", name="Owner")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(id=str(uuid4()), name="WS personal", slug="push-personal", owner_id=owner.id)
    db_session.add(ws)
    await db_session.flush()
    db_session.add(
        GoogleIntegration(
            id=str(uuid4()), workspace_id=ws.id, google_email="personal@desk.example",
            access_token="token", refresh_token="refresh",
            token_expiry=datetime.now(timezone.utc) + timedelta(hours=1),
            is_active=True, gmail_sync_enabled=True,
        )
    )
    await db_session.commit()

    response = await client.post(
        f"/webhooks/gmail/push?token={push_token}", json=_envelope("personal@desk.example")
    )

    assert response.status_code == 204
    assert dispatched == []


@pytest.mark.asyncio
async def test_an_undecodable_payload_is_not_an_error(client, push_token, dispatched):
    """Retrying a message that can never be parsed is a loop, not a recovery."""
    response = await client.post(
        f"/webhooks/gmail/push?token={push_token}",
        json={"message": {"data": "not-base64-at-all!!", "messageId": "m1"}},
    )

    assert response.status_code == 204
    assert dispatched == []


@pytest.mark.asyncio
async def test_an_empty_envelope_is_not_an_error(client, push_token, dispatched):
    response = await client.post(f"/webhooks/gmail/push?token={push_token}", json={})

    assert response.status_code == 204
    assert dispatched == []
