"""End-to-end API tests for the Organization module (departments + org chart)."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember

settings = get_settings()


def _auth(developer_id: str) -> dict:
    payload = {"sub": developer_id, "type": "access", "exp": datetime.now(timezone.utc).timestamp() + 1800}
    return {"Authorization": f"Bearer {jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)}"}


@pytest_asyncio.fixture
async def org_ws(db_session: AsyncSession):
    dev = Developer(id=str(uuid4()), email=f"admin-{uuid4().hex[:6]}@bimaplan.co", name="Admin")
    member = Developer(id=str(uuid4()), email=f"m-{uuid4().hex[:6]}@bimaplan.co", name="Member")
    db_session.add_all([dev, member])
    await db_session.flush()
    ws = Workspace(id=str(uuid4()), name="Org", slug=f"org-{uuid4().hex[:6]}", owner_id=dev.id)
    db_session.add(ws)
    await db_session.flush()
    db_session.add_all([
        WorkspaceMember(workspace_id=ws.id, developer_id=dev.id, role="admin", status="active"),
        # The plain member needs workspace membership before they can be placed
        # in a department — add_member refuses developers from outside.
        WorkspaceMember(workspace_id=ws.id, developer_id=member.id, role="member", status="active"),
    ])
    await db_session.commit()
    return {"dev": dev, "member": member, "ws": ws, "headers": _auth(dev.id)}


def _base(ws_id: str) -> str:
    return f"/api/v1/workspaces/{ws_id}/organization"


@pytest.mark.asyncio
async def test_department_hierarchy_membership_and_chart(client, org_ws):
    ws, h = org_ws["ws"].id, org_ws["headers"]
    b = _base(ws)

    ops = await client.post(b + "/departments", headers=h, json={"name": "Operations", "function_key": "ops_kam"})
    assert ops.status_code == 201, ops.text
    ops_id = ops.json()["id"]
    assert ops.json()["depth"] == 0

    kam = await client.post(b + "/departments", headers=h, json={"name": "KAM Desk", "parent_id": ops_id})
    assert kam.status_code == 201
    kam_id = kam.json()["id"]
    assert kam.json()["depth"] == 1 and kam.json()["parent_id"] == ops_id

    # add a member to KAM Desk
    m = await client.post(f"{b}/departments/{kam_id}/members", headers=h, json={
        "developer_id": org_ws["member"].id, "role_in_department": "head", "is_primary": True,
    })
    assert m.status_code == 201, m.text

    detail = (await client.get(f"{b}/departments/{kam_id}", headers=h)).json()
    assert detail["member_count"] == 1 and detail["headcount_actual"] == 1

    # org-chart nests KAM Desk under Operations
    chart = (await client.get(b + "/org-chart", headers=h)).json()
    assert len(chart) == 1 and chart[0]["id"] == ops_id
    assert len(chart[0]["children"]) == 1 and chart[0]["children"][0]["id"] == kam_id


@pytest.mark.asyncio
async def test_reparent_cycle_guard_and_delete(client, org_ws):
    ws, h = org_ws["ws"].id, org_ws["headers"]
    b = _base(ws)

    a = (await client.post(b + "/departments", headers=h, json={"name": "A"})).json()
    bb = (await client.post(b + "/departments", headers=h, json={"name": "B", "parent_id": a["id"]})).json()

    # cycle guard: A cannot become a child of its descendant B
    r = await client.post(f"{b}/departments/{a['id']}/reparent", headers=h, json={"parent_id": bb["id"]})
    assert r.status_code == 400

    # valid reparent: B → root
    r = await client.post(f"{b}/departments/{bb['id']}/reparent", headers=h, json={"parent_id": None})
    assert r.status_code == 200 and r.json()["parent_id"] is None and r.json()["depth"] == 0

    # delete
    assert (await client.delete(f"{b}/departments/{bb['id']}", headers=h)).status_code == 204
    remaining = (await client.get(b + "/departments", headers=h)).json()
    assert {d["id"] for d in remaining} == {a["id"]}


@pytest.mark.asyncio
async def test_people_endpoint_surfaces_unassigned_members(client, org_ws):
    """/people is the only read that can show someone in no department."""
    ws, h = org_ws["ws"].id, org_ws["headers"]
    b = _base(ws)

    people = (await client.get(f"{b}/people", headers=h)).json()
    by_id = {p["developer_id"]: p for p in people}
    # both fixtures are workspace members and neither is in a department yet
    assert by_id[org_ws["member"].id]["departments"] == []
    assert by_id[org_ws["dev"].id]["departments"] == []

    dept = (await client.post(b + "/departments", headers=h, json={"name": "Ops", "function_key": "ops_kam"})).json()
    r = await client.post(f"{b}/departments/{dept['id']}/members", headers=h, json={
        "developer_id": org_ws["member"].id, "is_primary": True,
    })
    assert r.status_code == 201, r.text

    people = (await client.get(f"{b}/people", headers=h)).json()
    by_id = {p["developer_id"]: p for p in people}
    placed = by_id[org_ws["member"].id]["departments"]
    assert len(placed) == 1 and placed[0]["name"] == "Ops" and placed[0]["is_primary"] is True
    # the admin is still unplaced, and still visible
    assert by_id[org_ws["dev"].id]["departments"] == []


@pytest.mark.asyncio
async def test_invite_can_carry_an_optional_department(client, org_ws, db_session):
    """A named department is applied on accept; omitting it still works.

    This is the whole point of Phase C: without it a new joiner lands in no
    department and is invisible to the directory and to Service Desk scoping.
    """
    from aexy.models.workspace import WorkspacePendingInvite
    from sqlalchemy import select

    ws, h = org_ws["ws"].id, org_ws["headers"]
    b = _base(ws)
    dept = (await client.post(b + "/departments", headers=h, json={"name": "Ops", "function_key": "ops_kam"})).json()

    # a department from nowhere is refused up front, not silently ignored later
    bad = await client.post(f"/api/v1/workspaces/{ws}/members/invite", headers=h, json={
        "email": f"nope-{uuid4().hex[:6]}@bimaplan.co", "role": "member", "department_id": str(uuid4()),
    })
    assert bad.status_code == 404, bad.text

    email = f"joiner-{uuid4().hex[:6]}@bimaplan.co"
    r = await client.post(f"/api/v1/workspaces/{ws}/members/invite", headers=h, json={
        "email": email, "role": "member",
        "department_id": dept["id"], "role_in_department": "member",
    })
    assert r.status_code == 201, r.text

    invite = (
        await db_session.execute(
            select(WorkspacePendingInvite).where(WorkspacePendingInvite.email == email)
        )
    ).scalar_one()
    assert invite.department_id == dept["id"]

    # accept as a brand-new developer with that email
    joiner = Developer(id=str(uuid4()), email=email, name="Joiner")
    db_session.add(joiner)
    await db_session.commit()

    acc = await client.post(f"/api/v1/invites/{invite.token}/accept", headers=_auth(joiner.id))
    assert acc.status_code == 200, acc.text

    people = {p["developer_id"]: p for p in (await client.get(f"{b}/people", headers=h)).json()}
    placed = people[joiner.id]["departments"]
    assert len(placed) == 1 and placed[0]["id"] == dept["id"]
    assert placed[0]["is_primary"] is True

    # ...and an invite with no department still joins fine, just unplaced
    plain_email = f"plain-{uuid4().hex[:6]}@bimaplan.co"
    r = await client.post(f"/api/v1/workspaces/{ws}/members/invite", headers=h, json={
        "email": plain_email, "role": "member",
    })
    assert r.status_code == 201, r.text
    plain_invite = (
        await db_session.execute(
            select(WorkspacePendingInvite).where(WorkspacePendingInvite.email == plain_email)
        )
    ).scalar_one()
    assert plain_invite.department_id is None
