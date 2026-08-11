"""The grant's workspace wins over anything the caller sends.

This is the property the whole consent flow rests on. The person picks one
workspace at the consent screen, Connected Apps shows one workspace, and the
docs promise the connector is "scoped to you in that workspace". If a tool call
can name a different workspace in `path_params`, none of those statements are
true.

It regressed once already: the executor used `path_params.setdefault(...)`,
which fills the value only when *absent*, so a caller-supplied `workspace_id`
won. A grant consented to one workspace served another's records. Membership
still gated it — the executor mints a token for the developer, so it was never
cross-tenant — but the per-workspace boundary was gone, which is the part
everyone was told they had.

These tests inspect the request the executor actually issues, so they fail on
the URL rather than on whatever the downstream endpoint happens to return.
"""

from __future__ import annotations

import httpx
import pytest

from aexy.services.mcp_tool_executor import McpToolExecutor

GRANTED_WS = "11111111-1111-1111-1111-111111111111"
OTHER_WS = "99999999-9999-9999-9999-999999999999"

CATALOG = {
    "catalog_version": "test",
    "capabilities": [
        {
            "capability": "mcp.crm",
            "app": "crm",
            "operation_count": 2,
            "operations": [
                {
                    "action": "list_agents",
                    "operation_id": "list_agents",
                    "method": "GET",
                    "path": "/api/v1/workspaces/{workspace_id}/crm/agents",
                    "summary": "List CRM agents",
                    "mutating": False,
                },
                {
                    "action": "get_agent",
                    "operation_id": "get_agent",
                    "method": "GET",
                    "path": "/api/v1/workspaces/{workspace_id}/crm/agents/{agent_id}",
                    "summary": "Get one CRM agent",
                    "mutating": False,
                },
            ],
        }
    ],
}


@pytest.fixture
def captured(monkeypatch):
    """Capture the request the executor issues, without running the app."""
    seen: dict[str, str] = {}

    async def fake_request(self, method, url, **kwargs):
        seen["method"] = method
        seen["url"] = str(url)
        return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr(httpx.AsyncClient, "request", fake_request)
    monkeypatch.setattr(
        "aexy.api.auth.create_access_token", lambda *a, **k: "test-token"
    )
    return seen


async def _call(arguments):
    executor = McpToolExecutor(app=object(), catalog=CATALOG, granted={"mcp.crm"})
    return await executor.call(
        tool_name="aexy_crm",
        arguments=arguments,
        developer_id="dev-1",
        workspace_id=GRANTED_WS,
    )


class TestWorkspaceScoping:
    async def test_uses_the_grants_workspace(self, captured):
        result = await _call({"action": "list_agents"})

        assert not result.is_error, result.content
        assert GRANTED_WS in captured["url"]

    async def test_caller_cannot_redirect_to_another_workspace(self, captured):
        """The regression. A caller-supplied workspace_id must be ignored."""
        result = await _call(
            {"action": "list_agents", "path_params": {"workspace_id": OTHER_WS}}
        )

        assert not result.is_error, result.content
        assert OTHER_WS not in captured["url"], (
            "the caller's workspace_id reached the URL — the grant no longer "
            "confines the session to the consented workspace"
        )
        assert GRANTED_WS in captured["url"]

    async def test_other_path_params_still_come_from_the_caller(self, captured):
        """Only workspace_id is pinned; the rest of the path is the caller's."""
        result = await _call(
            {"action": "get_agent", "path_params": {"agent_id": "agent-42"}}
        )

        assert not result.is_error, result.content
        assert "agent-42" in captured["url"]
        assert GRANTED_WS in captured["url"]

    async def test_missing_sibling_param_is_reported_not_guessed(self, captured):
        result = await _call({"action": "get_agent"})

        assert result.is_error
        assert "agent_id" in result.content
