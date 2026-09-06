"""Agent principals: an identity an agent runs as, end to end.

Walks what an admin does — create a principal with a scope, mint it a token —
and then what the agent does with that token: call the MCP transport, see only
its scoped tools, have its writes governed and written to the ledger as the
principal. Also that a person's API token now goes through the same door.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt
from sqlalchemy import select

from aexy.core.config import get_settings
from aexy.models.agent_action_log import AgentActionLog
from aexy.models.agent_principal import AGENT_ACCOUNT_TYPE
from aexy.models.api_token import ApiToken
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember

settings = get_settings()


def _jwt(developer_id: str) -> str:
    return jwt.encode(
        {"sub": developer_id, "exp": datetime.now(timezone.utc) + timedelta(minutes=30), "type": "access"},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


@pytest.fixture
async def people(db_session):
    admin = Developer(email="admin@example.com", name="Admin")
    member = Developer(email="member@example.com", name="Member")
    db_session.add_all([admin, member])
    await db_session.flush()
    ws = Workspace(name="P", slug="p", owner_id=admin.id)
    db_session.add(ws)
    await db_session.flush()
    db_session.add_all(
        [
            WorkspaceMember(workspace_id=ws.id, developer_id=admin.id, role="owner"),
            WorkspaceMember(workspace_id=ws.id, developer_id=member.id, role="member"),
        ]
    )
    await db_session.commit()
    return admin, member, ws


async def _rpc(client, token, message, **headers):
    return await client.post(
        "/api/v1/mcp",
        json=message,
        headers={"Authorization": f"Bearer {token}", **headers},
    )


@pytest.mark.asyncio
async def test_only_admins_manage_principals(client, people):
    admin, member, ws = people
    body = {"name": "Triage bot", "capabilities": ["mcp.tickets"]}
    denied = await client.post(
        f"/api/v1/workspaces/{ws.id}/agent-principals",
        json=body,
        headers={"Authorization": f"Bearer {_jwt(member.id)}"},
    )
    assert denied.status_code == 403
    created = await client.post(
        f"/api/v1/workspaces/{ws.id}/agent-principals",
        json=body,
        headers={"Authorization": f"Bearer {_jwt(admin.id)}"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["capabilities"] == ["mcp.tickets"]
    assert created.json()["active_token_count"] == 0


@pytest.mark.asyncio
async def test_unknown_capabilities_are_refused(client, people):
    admin, _member, ws = people
    response = await client.post(
        f"/api/v1/workspaces/{ws.id}/agent-principals",
        json={"name": "x", "capabilities": ["mcp.nonsense"]},
        headers={"Authorization": f"Bearer {_jwt(admin.id)}"},
    )
    assert response.status_code == 422
    assert "mcp.nonsense" in response.text


@pytest.mark.asyncio
async def test_a_principal_acts_as_itself_over_mcp(client, people, db_session):
    admin, _member, ws = people
    auth = {"Authorization": f"Bearer {_jwt(admin.id)}"}

    created = await client.post(
        f"/api/v1/workspaces/{ws.id}/agent-principals",
        json={"name": "Triage bot", "capabilities": ["mcp.tickets", "mcp.platform"]},
        headers=auth,
    )
    principal = created.json()

    # The synthetic developer is an agent and a member of exactly this workspace.
    dev = await db_session.get(Developer, principal["developer_id"])
    assert dev.account_type == AGENT_ACCOUNT_TYPE
    memberships = (
        await db_session.execute(
            select(WorkspaceMember).where(WorkspaceMember.developer_id == dev.id)
        )
    ).scalars().all()
    assert [str(m.workspace_id) for m in memberships] == [str(ws.id)]
    assert memberships[0].app_permissions["overrides"]["tickets"] == {"enabled": True}
    assert memberships[0].app_permissions["overrides"]["crm"] == {"enabled": False}
    assert memberships[0].app_permissions["overrides"]["mcp"]["modules"]["platform"] is True

    minted = await client.post(
        f"/api/v1/workspaces/{ws.id}/agent-principals/{principal['id']}/tokens",
        json={},
        headers=auth,
    )
    assert minted.status_code == 201, minted.text
    raw = minted.json()["token"]
    assert raw.startswith("aexy_")

    # tools/list is scoped to the principal, not to everything the workspace has.
    listed = await _rpc(client, raw, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    assert listed.status_code == 200, listed.text
    names = {t["name"] for t in listed.json()["result"]["tools"]}
    assert "aexy_tickets" in names
    assert "aexy_platform" in names
    assert "aexy_crm" not in names
    assert "aexy_sprints" not in names

    # A write runs as the principal and lands in the ledger under its id.
    called = await _rpc(
        client,
        raw,
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "aexy_tickets",
                "arguments": {
                    "action": "update_ticket",
                    "path_params": {"ticket_id": "00000000-0000-4000-8000-000000000000"},
                    "body": {"title": "Printer on fire"},
                },
            },
        },
    )
    assert called.status_code == 200, called.text
    rows = (
        await db_session.execute(select(AgentActionLog).where(AgentActionLog.workspace_id == ws.id))
    ).scalars().all()
    # The ticket does not exist, so the endpoint said so — and that is still
    # something the agent did, so it is still in the ledger.
    assert len(rows) == 1, called.json()
    assert rows[0].is_error is True
    assert rows[0].status_code == 404
    assert rows[0].principal_id == principal["id"]
    assert rows[0].actor_kind == "principal"
    assert rows[0].actor_developer_id == principal["developer_id"]

    # Rotating revokes the previous token.
    rotated = await client.post(
        f"/api/v1/workspaces/{ws.id}/agent-principals/{principal['id']}/tokens",
        json={},
        headers=auth,
    )
    assert rotated.status_code == 201
    stale = await _rpc(client, raw, {"jsonrpc": "2.0", "id": 3, "method": "tools/list"})
    assert stale.status_code == 401

    # Deactivating kills the new one too.
    off = await client.patch(
        f"/api/v1/workspaces/{ws.id}/agent-principals/{principal['id']}",
        json={"is_active": False},
        headers=auth,
    )
    assert off.status_code == 200
    dead = await _rpc(client, rotated.json()["token"], {"jsonrpc": "2.0", "id": 4, "method": "tools/list"})
    assert dead.status_code == 401
    active_tokens = (
        await db_session.execute(
            select(ApiToken).where(ApiToken.principal_id == principal["id"], ApiToken.is_active.is_(True))
        )
    ).scalars().all()
    assert active_tokens == []


@pytest.mark.asyncio
async def test_a_persons_api_token_goes_through_the_governed_door(client, people, db_session):
    """What the stdio bridge sends. The developer is in one workspace, so no
    header is needed; the call is governed and lands in the ledger as them."""
    admin, _member, ws = people
    auth = {"Authorization": f"Bearer {_jwt(admin.id)}"}
    minted = await client.post(
        "/api/v1/developers/me/api-tokens", json={"name": "laptop"}, headers=auth
    )
    assert minted.status_code == 201, minted.text
    raw = minted.json()["token"]

    listed = await _rpc(client, raw, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    assert listed.status_code == 200, listed.text
    assert listed.json()["result"]["tools"]

    # A delete is held by the default pack rather than performed.
    held = await _rpc(
        client,
        raw,
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "aexy_call",
                "arguments": {"action": "delete_ticket", "path_params": {"ticket_id": "00000000-0000-4000-8000-000000000000"}},
            },
        },
    )
    assert held.status_code == 200, held.text
    result = held.json()["result"]
    assert result["isError"] is True
    assert "approval" in result["content"][0]["text"].lower()


@pytest.mark.asyncio
async def test_a_person_in_two_workspaces_must_name_one(client, people, db_session):
    admin, _member, ws = people
    other = Workspace(name="P2", slug="p2", owner_id=admin.id)
    db_session.add(other)
    await db_session.flush()
    db_session.add(WorkspaceMember(workspace_id=other.id, developer_id=admin.id, role="owner"))
    await db_session.commit()

    auth = {"Authorization": f"Bearer {_jwt(admin.id)}"}
    raw = (await client.post("/api/v1/developers/me/api-tokens", json={"name": "t"}, headers=auth)).json()["token"]

    ambiguous = await _rpc(client, raw, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    assert ambiguous.status_code == 400
    assert "X-Aexy-Workspace-Id" in ambiguous.text

    named = await _rpc(
        client, raw, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
        **{"X-Aexy-Workspace-Id": str(ws.id)},
    )
    assert named.status_code == 200

    stranger = await _rpc(
        client, raw, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
        **{"X-Aexy-Workspace-Id": "00000000-0000-4000-8000-000000000000"},
    )
    assert stranger.status_code == 403


@pytest.mark.asyncio
async def test_principal_management_is_not_in_the_catalogue():
    from aexy.main import app
    from aexy.services.mcp_catalog import build_catalog

    catalog = build_catalog(app.openapi())
    actions = {op["action"] for g in catalog["capabilities"] for op in g["operations"]}
    assert not any(a.endswith("agent_principal") or "principal_token" in a for a in actions), actions
    assert "agent_identity" in catalog["excluded"]
