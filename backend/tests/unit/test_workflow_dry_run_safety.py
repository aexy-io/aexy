"""A test run must not perform real actions.

Pressing Test is what people do when they are least sure an automation is
correct. Before this guard, a test run reached the same handlers as a live run
and really did send the Slack message, send the email, create the task and edit
the record.
"""

from unittest.mock import MagicMock

import pytest

from aexy.schemas.workflow import WorkflowExecutionContext
from aexy.services.workflow_actions import WorkflowActionHandler

# One per side-effect family, rather than the whole registry.
SIDE_EFFECTING_ACTIONS = [
    "send_slack",
    "send_email",
    "create_task",
    "update_record",
    "create_record",
    "delete_record",
    "webhook_call",
    "notify_user",
]


def _context(is_dry_run: bool) -> WorkflowExecutionContext:
    return WorkflowExecutionContext(
        workspace_id="workspace-1",
        record_id="record-1",
        record_data={"values": {"email": "ada@example.com"}},
        trigger_data={},
        variables={},
        is_dry_run=is_dry_run,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("action_type", SIDE_EFFECTING_ACTIONS)
async def test_dry_run_does_not_perform_the_action(action_type):
    db = MagicMock()
    handler = WorkflowActionHandler(db)

    result = await handler.execute_action(
        action_type,
        {"channel": "C1", "message_template": "hi", "to": "ada@example.com"},
        _context(is_dry_run=True),
    )

    assert result.status == "skipped"
    assert result.output["dry_run"] is True
    # Nothing may reach the database session during a test run.
    db.execute.assert_not_called()
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_dry_run_still_reports_an_unknown_action_as_failed():
    """Config problems must still surface; only side effects are suppressed."""
    handler = WorkflowActionHandler(MagicMock())

    result = await handler.execute_action(
        "no_such_action", {}, _context(is_dry_run=True)
    )

    assert result.status == "failed"


@pytest.mark.asyncio
async def test_a_real_run_is_left_alone():
    """The guard must not touch live runs — this one should reach the handler."""
    handler = WorkflowActionHandler(MagicMock())

    result = await handler.execute_action(
        "send_slack", {}, _context(is_dry_run=False)
    )

    # Reaches the real handler, which rejects the empty config on its merits.
    assert result.status == "failed"
    assert "Missing target" in (result.error or "")
