"""The queue endpoints an agent and a reviewer actually hit.

`/mine` is the one part of the review gate MCP can reach: an agent that was
told "waiting for approval" reads its own requests here and carries on once
one is approved. It must show only the caller's rows. `/activity` is the
ledger, for members.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from jose import jwt

from aexy.core.config import get_settings
from aexy.models.agent_action_log import AgentActionLog
from aexy.models.developer import Developer
from aexy.models.proposed_change import ChangeKind, ChangeStatus, ProposedChange
from aexy.models.workspace import Workspace, WorkspaceMember

settings = get_settings()


def _token_for(developer_id: str) -> str:
    return jwt.encode(
        {"sub": developer_id, "exp": datetime.now(timezone.utc) + timedelta(minutes=30), "type": "access"},
        settings.secret_key,
        algorithm=settings.algorithm,
    )


@pytest.fixture
async def people(db_session):
    a = Developer(email="a@example.com", name="A")
    b = Developer(email="b@example.com", name="B")
    db_session.add_all([a, b])
    await db_session.flush()
    ws = Workspace(name="Q", slug="q", owner_id=a.id)
    db_session.add(ws)
    await db_session.flush()
    db_session.add_all(
        [
            WorkspaceMember(workspace_id=ws.id, developer_id=a.id, role="owner"),
            WorkspaceMember(workspace_id=ws.id, developer_id=b.id, role="member"),
        ]
    )
    for requester in (a, b):
        db_session.add(
            ProposedChange(
                id=str(uuid4()),
                kind=ChangeKind.ACTION.value,
                entity_type="agent_action",
                workspace_id=ws.id,
                requested_by_id=requester.id,
                payload={"tool_name": "aexy_tickets", "action": f"delete_ticket_{requester.name}",
                         "method": "DELETE", "path": "/x", "arguments": {}},
                status=ChangeStatus.PENDING.value,
            )
        )
    db_session.add(
        AgentActionLog(
            id=str(uuid4()),
            workspace_id=ws.id,
            actor_developer_id=b.id,
            tool_name="aexy_tickets",
            action="update_ticket",
            method="PATCH",
            path="/x/{ticket_id}",
            resolved_path="/x/t1",
            arguments={"body": {"status": "closed"}},
            status_code=200,
            is_error=False,
            duration_ms=12,
        )
    )
    await db_session.commit()
    return a, b, ws


@pytest.mark.asyncio
async def test_mine_shows_only_the_callers_requests(client, people):
    a, b, ws = people
    response = await client.get(
        f"/api/v1/workspaces/{ws.id}/agent-actions/mine",
        headers={"Authorization": f"Bearer {_token_for(b.id)}"},
    )
    assert response.status_code == 200, response.text
    rows = response.json()
    assert [r["action"] for r in rows] == ["delete_ticket_B"]
    assert rows[0]["status"] == "pending"


@pytest.mark.asyncio
async def test_mine_refuses_a_non_member(client, people, db_session):
    _a, _b, ws = people
    outsider = Developer(email="o@example.com", name="O")
    db_session.add(outsider)
    await db_session.commit()
    response = await client.get(
        f"/api/v1/workspaces/{ws.id}/agent-actions/mine",
        headers={"Authorization": f"Bearer {_token_for(outsider.id)}"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_activity_lists_the_ledger(client, people):
    a, _b, ws = people
    response = await client.get(
        f"/api/v1/workspaces/{ws.id}/agent-actions/activity",
        headers={"Authorization": f"Bearer {_token_for(a.id)}"},
    )
    assert response.status_code == 200, response.text
    [row] = response.json()
    assert row["action"] == "update_ticket"
    assert row["status_code"] == 200
    assert row["resolved_path"] == "/x/t1"


@pytest.mark.asyncio
async def test_mine_is_in_the_catalogue_and_the_queue_is_not():
    """The catalogue decides what an agent can reach. The queue stays out;
    the caller's own rows do not."""
    from aexy.main import app
    from aexy.services.mcp_catalog import build_catalog

    catalog = build_catalog(app.openapi())
    actions = {
        op["action"]: group["capability"]
        for group in catalog["capabilities"]
        for op in group["operations"]
    }
    assert actions.get("list_my_agent_actions") == "mcp.platform"
    assert "approve_pending_action" not in actions
    assert "list_agent_activity" not in actions
    assert "list_pending_actions" not in actions
