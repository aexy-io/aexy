"""A step may only report success when the work it claims actually happened.

Both gates here are the same defect class as the reported one where a
notification target that reached nobody still produced a green run: the step
tallies its own outcome, and without a gate the tally is discarded and success
is returned regardless. A run history that says "notified" or "agent ran" when
neither occurred is worse than a failure, because nothing prompts a retry.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aexy.schemas.workflow import WorkflowExecutionContext
from aexy.services.crm_automation_service import CRMAutomationService
from aexy.services.workflow_actions import WorkflowActionHandler


def _context():
    return WorkflowExecutionContext(
        workspace_id="ws",
        record_id=None,
        record_data={},
        trigger_data={},
        variables={},
        is_dry_run=False,
    )


def _handler_resolving_to(developer):
    """A handler whose user lookup resolves, so only delivery is under test."""
    db = MagicMock()
    db.execute = AsyncMock(
        return_value=SimpleNamespace(scalar_one_or_none=lambda: developer)
    )
    return WorkflowActionHandler(db)


@pytest.mark.asyncio
async def test_notify_user_fails_when_no_channel_delivered():
    handler = _handler_resolving_to(SimpleNamespace(id="dev-1", email="u@example.com"))
    # Both channels report failure, which is what a Slack outage or a rejected
    # address looks like from here.
    handler._send_slack = AsyncMock(
        return_value=SimpleNamespace(status="failed", error="slack down")
    )
    handler._send_email = AsyncMock(
        return_value=SimpleNamespace(status="failed", error="smtp refused")
    )

    result = await handler._notify_user(
        {"user_email": "u@example.com", "message": "hi", "channel": "both"},
        _context(),
    )

    assert result.status == "failed"
    assert result.error
    assert result.output["channels_notified"] == []


@pytest.mark.asyncio
async def test_notify_user_succeeds_when_one_channel_delivered():
    """One channel through is still a delivered notification."""
    handler = _handler_resolving_to(SimpleNamespace(id="dev-1", email="u@example.com"))
    handler._send_slack = AsyncMock(
        return_value=SimpleNamespace(status="failed", error="slack down")
    )
    handler._send_email = AsyncMock(return_value=SimpleNamespace(status="success"))

    result = await handler._notify_user(
        {"user_email": "u@example.com", "message": "hi", "channel": "both"},
        _context(),
    )

    assert result.status == "success"
    assert result.output["channels_notified"] == ["email"]


def _spawning(status, error_message=None):
    execution = SimpleNamespace(
        id="exec-1", status=status, error_message=error_message
    )
    return patch(
        "aexy.services.automation_agent_service.AutomationAgentService",
        return_value=SimpleNamespace(spawn_agent=AsyncMock(return_value=execution)),
    )


@pytest.mark.asyncio
async def test_waited_agent_failure_reports_error_not_success():
    """The executor's gate reads the error key, so the verdict must land there.

    A bare "success": False would be invisible to it and the run would still
    close green.
    """
    service = CRMAutomationService(db=None)

    with _spawning("failed", "model refused"):
        result = await service._action_run_agent(
            {"agent_id": "a-1", "wait_for_completion": True}, None, "ws"
        )

    assert result["success"] is False
    assert result["error"] == "model refused"


@pytest.mark.asyncio
async def test_waited_agent_timeout_reports_error():
    service = CRMAutomationService(db=None)

    with _spawning("running", None):
        result = await service._action_run_agent(
            {"agent_id": "a-1", "wait_for_completion": True}, None, "ws"
        )

    assert result["success"] is False
    assert "running" in result["error"]


@pytest.mark.asyncio
async def test_unwaited_agent_still_succeeds_while_pending():
    """Not waiting is a deliberate mode: the step's job was only to start it."""
    service = CRMAutomationService(db=None)

    with _spawning("pending", None):
        result = await service._action_run_agent(
            {"agent_id": "a-1", "wait_for_completion": False}, None, "ws"
        )

    assert result["success"] is True
    assert "error" not in result
