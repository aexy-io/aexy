"""End-to-end API tests for the Service Desk.

Drives the whole journey through the HTTP layer (auth + app-access guards):
master data + settings → manual ticket intake → pending-with transitions →
TAT + dashboard → convert-to-task → editable templates → and the guarantee
that Service Desk tickets stay out of the generic /tickets module.

The email-webhook intake path runs in a separate event loop/engine
(asyncio.run) and can't be exercised in-process; it is covered by the unit
intake tests. Here we use the manual-ticket endpoint, which runs the same
intake pipeline inside the request session.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember
from tests.conftest import seed_service_desk_taxonomy

settings = get_settings()


def _auth(developer_id: str) -> dict:
    payload = {"sub": developer_id, "type": "access", "exp": datetime.now(timezone.utc).timestamp() + 1800}
    return {"Authorization": f"Bearer {jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)}"}


@pytest_asyncio.fixture
async def sd_ws(db_session: AsyncSession):
    dev = Developer(id=str(uuid4()), email=f"ops-{uuid4().hex[:6]}@example.com", name="Ops Head")
    db_session.add(dev)
    await db_session.flush()
    ws = Workspace(id=str(uuid4()), name="Acme Ops", slug=f"acme-{uuid4().hex[:6]}", owner_id=dev.id)
    db_session.add(ws)
    await db_session.flush()
    db_session.add(WorkspaceMember(workspace_id=ws.id, developer_id=dev.id, role="admin", status="active"))
    # Stakeholders and request types are per-workspace rows rather than an enum,
    # so a desk has to be set up before tickets can be filed. These tests assert
    # on the legacy insurance slugs ("kam", "claims"), which is that template.
    await seed_service_desk_taxonomy(db_session, ws.id)
    await db_session.commit()
    return {"dev": dev, "ws": ws, "headers": _auth(dev.id)}


def _base(ws_id: str) -> str:
    return f"/api/v1/workspaces/{ws_id}/service-desk"


@pytest.mark.asyncio
async def test_master_data_and_settings(client, sd_ws):
    ws, h = sd_ws["ws"].id, sd_ws["headers"]
    b = _base(ws)

    # account with a domain + assigned KAM
    r = await client.post(b + "/accounts", headers=h, json={
        "name": "ABC Finance", "assigned_owner_id": sd_ws["dev"].id, "domains": ["abcfinance.com"],
    })
    assert r.status_code == 201, r.text
    assert r.json()["domains"] == ["abcfinance.com"]

    # vendor, Product, mailbox
    assert (await client.post(b + "/vendors", headers=h, json={"name": "XYZ Life", "domains": ["xyzlife.com"]})).status_code == 201
    assert (await client.post(b + "/products", headers=h, json={"name": "Credit Life"})).status_code == 201
    assert (await client.post(b + "/mailboxes", headers=h, json={"address": "operations@example.com"})).status_code == 201

    assert len((await client.get(b + "/accounts", headers=h)).json()) == 1
    assert len((await client.get(b + "/products", headers=h)).json()) == 1

    # settings toggle. The desk follows the workspace AI switch, which is on for
    # a workspace that never configured one — so the round trip under test is
    # off (a desk veto) and back on (clearing it), not off → on.
    assert (await client.get(b + "/settings", headers=h)).json()["ai_classification_enabled"] is True
    r = await client.patch(b + "/settings", headers=h, json={"ai_classification_enabled": False})
    assert r.json()["ai_classification_enabled"] is False
    assert (await client.get(b + "/settings", headers=h)).json()["ai_classification_enabled"] is False
    r = await client.patch(b + "/settings", headers=h, json={"ai_classification_enabled": True})
    assert r.json()["ai_classification_enabled"] is True
    assert (await client.get(b + "/settings", headers=h)).json()["ai_classification_enabled"] is True


@pytest.mark.asyncio
async def test_manual_ticket_lifecycle_and_tat(client, sd_ws):
    ws, h = sd_ws["ws"].id, sd_ws["headers"]
    b = _base(ws)

    r = await client.post(b + "/tickets/manual", headers=h, json={
        "subject": "Policy status", "body": "Please check", "request_type": "claims",
        "requester_name": "Rahul", "requester_email": "rahul@abcfinance.com",
    })
    assert r.status_code == 201, r.text
    tid = r.json()["ticket_id"]

    # appears in the SD list
    listed = (await client.get(b + "/tickets", headers=h)).json()
    assert any(t["ticket_id"] == tid for t in listed)

    # detail: opened with a kam segment + TAT
    d = (await client.get(f"{b}/tickets/{tid}", headers=h)).json()
    assert d["pending_with"] == "kam" and d["request_type"] == "claims"
    assert len(d["segments"]) == 1 and d["segments"][0]["exited_at"] is None
    assert d["tat"]["current_pending_with"] == "kam"

    # move kam → insurer → closed. "insurer" is a *stakeholder* slug from the
    # insurance template, not the renamed vendors master-data table — the
    # taxonomy keeps the legacy slugs so live tickets keep resolving.
    d = (await client.patch(f"{b}/tickets/{tid}/pending-with", headers=h, json={"pending_with": "insurer", "note": "sent"})).json()
    assert d["pending_with"] == "insurer" and len(d["segments"]) == 2

    d = (await client.patch(f"{b}/tickets/{tid}/pending-with", headers=h, json={"pending_with": "closed"})).json()
    assert d["pending_with"] == "closed" and d["status"] == "closed"
    assert d["tat"]["current_pending_with"] is None  # terminal


@pytest.mark.asyncio
async def test_dashboard_and_generic_list_isolation(client, sd_ws):
    ws, h = sd_ws["ws"].id, sd_ws["headers"]
    b = _base(ws)

    ids = []
    for i in range(2):
        r = await client.post(b + "/tickets/manual", headers=h, json={"subject": f"req {i}", "request_type": "query"})
        ids.append(r.json()["ticket_id"])

    dash = (await client.get(b + "/dashboard", headers=h)).json()
    assert dash["total_open"] == 2
    assert any(s["pending_with"] == "kam" for s in dash["stakeholders"])

    # the generic /tickets module must NOT show Service Desk tickets (shared table)
    generic = await client.get(f"/api/v1/workspaces/{ws}/tickets", headers=h)
    assert generic.status_code == 200, generic.text
    body = generic.text
    assert all(tid not in body for tid in ids)


@pytest.mark.asyncio
async def test_convert_to_task(client, sd_ws):
    ws, h = sd_ws["ws"].id, sd_ws["headers"]
    b = _base(ws)

    # a project to convert into
    proj = await client.post(f"/api/v1/workspaces/{ws}/projects", headers=h, json={"name": "Ops Followups"})
    assert proj.status_code == 201, proj.text
    project_id = proj.json()["id"]

    tid = (await client.post(b + "/tickets/manual", headers=h, json={"subject": "make a task", "request_type": "payout"})).json()["ticket_id"]

    r = await client.post(f"{b}/tickets/{tid}/convert-to-task", headers=h, json={"project_id": project_id})
    assert r.status_code == 200, r.text
    assert r.json()["linked"] is True

    d = (await client.get(f"{b}/tickets/{tid}", headers=h)).json()
    assert d["linked_task_id"] == r.json()["task_id"]

    # second convert rejected
    again = await client.post(f"{b}/tickets/{tid}/convert-to-task", headers=h, json={"project_id": project_id})
    assert again.status_code == 400


@pytest.mark.asyncio
async def test_editable_templates(client, sd_ws):
    ws, h = sd_ws["ws"].id, sd_ws["headers"]
    b = _base(ws)

    tmpls = (await client.get(b + "/templates", headers=h)).json()
    assert {t["key"] for t in tmpls} == {"receipt", "closure", "digest"}
    assert all(t["customised"] is False for t in tmpls)

    r = await client.patch(b + "/templates/receipt", headers=h, json={
        "subject": "Logged {{display_id}}", "body": "Namaste {{requester_name}}",
    })
    assert r.status_code == 200 and r.json()["customised"] is True

    receipt = next(t for t in (await client.get(b + "/templates", headers=h)).json() if t["key"] == "receipt")
    assert receipt["subject"] == "Logged {{display_id}}" and receipt["customised"] is True
