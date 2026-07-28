"""Send Slack is only offered to workspaces that have connected Slack.

The registry cannot decide this — it has no workspace — so the gate lives in
the service layer and is applied by the registry endpoint. Offering the step
without the integration produces a node that can only fail at run time.
"""

import pytest

from aexy.services import automation_service
from aexy.services.automation_service import filter_actions_by_integrations

ACTIONS = [
    {"id": "send_email", "description": "Send an email notification"},
    {"id": "send_slack", "description": "Send a Slack message"},
    {"id": "notify_user", "description": "Notify a user"},
]


@pytest.fixture
def unconnected(monkeypatch):
    async def _none(db, workspace_id):
        return None

    monkeypatch.setattr(
        "aexy.services.slack_helpers.get_slack_integration_for_workspace", _none
    )


@pytest.fixture
def connected(monkeypatch):
    async def _integration(db, workspace_id):
        return object()

    monkeypatch.setattr(
        "aexy.services.slack_helpers.get_slack_integration_for_workspace",
        _integration,
    )


@pytest.mark.asyncio
async def test_slack_hidden_when_workspace_has_no_slack(unconnected):
    result = await filter_actions_by_integrations(None, "ws-1", ACTIONS)
    assert [a["id"] for a in result] == ["send_email", "notify_user"]


@pytest.mark.asyncio
async def test_slack_offered_when_workspace_has_slack(connected):
    result = await filter_actions_by_integrations(None, "ws-1", ACTIONS)
    assert [a["id"] for a in result] == ["send_email", "send_slack", "notify_user"]


@pytest.mark.asyncio
async def test_ungated_actions_skip_the_lookup_entirely(monkeypatch):
    """No gated action in the list means no integration query is issued."""
    calls = []

    async def _tracked(db, workspace_id, integration):
        calls.append(integration)
        return True

    monkeypatch.setattr(automation_service, "_workspace_has_integration", _tracked)
    plain = [{"id": "send_email", "description": "x"}]

    assert await filter_actions_by_integrations(None, "ws-1", plain) == plain
    assert calls == []


@pytest.mark.asyncio
async def test_unknown_gate_fails_closed(monkeypatch):
    """An action gated on an integration we can't check is withheld."""
    monkeypatch.setattr(
        automation_service, "INTEGRATION_GATED_ACTIONS", {"send_email": "mystery"}
    )
    result = await filter_actions_by_integrations(None, "ws-1", ACTIONS)
    assert "send_email" not in [a["id"] for a in result]
