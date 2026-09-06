"""Email, Slack and SMS as catalogue operations."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from jose import jwt

from aexy.core.config import get_settings
from aexy.models.crm import CRMActivity, CRMObject, CRMRecord
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember

pytestmark = pytest.mark.asyncio


def _jwt(developer_id: str) -> str:
    settings = get_settings()
    return jwt.encode(
        {"sub": developer_id, "exp": datetime.now(timezone.utc) + timedelta(hours=1), "type": "access"},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


@pytest.fixture
async def setup(db_session):
    dev = Developer(email="o@example.com", name="Owner")
    db_session.add(dev)
    await db_session.flush()
    ws = Workspace(name="W", slug="w", owner_id=dev.id)
    db_session.add(ws)
    await db_session.flush()
    db_session.add(WorkspaceMember(workspace_id=ws.id, developer_id=dev.id, role="owner"))
    await db_session.commit()
    return dev, ws


async def test_send_email_is_queued_as_the_caller(client, setup):
    dev, ws = setup
    with patch("aexy.temporal.dispatch.dispatch", new=AsyncMock(return_value="wf-1")) as d:
        r = await client.post(
            f"/api/v1/workspaces/{ws.id}/crm/outreach/email",
            json={"to": "alice@example.com", "subject": "Hi", "body": "Hello"},
            headers={"Authorization": f"Bearer {_jwt(str(dev.id))}"},
        )
    assert r.status_code == 202, r.text
    assert r.json()["status"] == "queued"
    sent = d.call_args.args[1]
    assert sent.user_id == str(dev.id) and sent.to_email == "alice@example.com"


async def test_sms_needs_e164(client, setup):
    dev, ws = setup
    r = await client.post(
        f"/api/v1/workspaces/{ws.id}/crm/outreach/sms",
        json={"phone_number": "4155551234", "message": "x"},
        headers={"Authorization": f"Bearer {_jwt(str(dev.id))}"},
    )
    assert r.status_code == 422


async def test_email_history_filters_by_address(client, db_session, setup):
    dev, ws = setup
    obj = CRMObject(workspace_id=ws.id, name="Person", slug="person", plural_name="People", object_type="person")
    db_session.add(obj)
    await db_session.flush()
    record = CRMRecord(workspace_id=ws.id, object_id=obj.id, values={"name": "Alice"})
    db_session.add(record)
    await db_session.flush()
    now = datetime.now(timezone.utc)
    for to, subject in (("alice@example.com", "Q2"), ("bob@example.com", "Other")):
        db_session.add(CRMActivity(
            workspace_id=ws.id, record_id=record.id, activity_type="email.sent", actor_type="user",
            title=subject, description="body", activity_metadata={"to": to, "subject": subject},
            occurred_at=now,
        ))
    await db_session.commit()
    r = await client.get(
        f"/api/v1/workspaces/{ws.id}/crm/outreach/email-history",
        params={"email": "alice@example.com"},
        headers={"Authorization": f"Bearer {_jwt(str(dev.id))}"},
    )
    assert r.status_code == 200, r.text
    assert [x["subject"] for x in r.json()] == ["Q2"]


async def test_non_members_are_refused(client, db_session, setup):
    _dev, ws = setup
    other = Developer(email="x@example.com", name="X")
    db_session.add(other)
    await db_session.commit()
    r = await client.get(
        f"/api/v1/workspaces/{ws.id}/crm/outreach/email-history",
        params={"email": "alice@example.com"},
        headers={"Authorization": f"Bearer {_jwt(str(other.id))}"},
    )
    assert r.status_code == 403
