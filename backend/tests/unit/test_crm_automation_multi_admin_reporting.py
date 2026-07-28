"""A multi-admin notification must not report an outcome it does not have yet.

Previously the 2nd..Nth recipient of one notification was handed over with no run
reference, so their delivery outcomes had nowhere to land, and the step was
recorded a plain success the moment the mail was queued - the run read completed
before a single admin's send outcome was known.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from aexy.services.crm_automation_service import (
    _SIBLING_STEP_ORDER_BASE,
    CRMAutomationService,
)

pytestmark = pytest.mark.asyncio

CONFIG = {
    "notify_type": "workspace_admin",
    "channel": "email",
    "notify_title": "Deal stage changed",
    "notify_message": "moved on",
}
RECORD = SimpleNamespace(id="rec-1", name="Acme", values={"name": "Acme"})


def _member(developer_id, email):
    return SimpleNamespace(
        developer_id=developer_id,
        developer=SimpleNamespace(id=developer_id, email=email),
    )


def _service(members, run):
    service = CRMAutomationService(db=None)
    service._action_send_email = AsyncMock(
        return_value={"success": True, "queued": True}
    )
    service._action_send_slack = AsyncMock(return_value={"success": True})
    # The sibling-step write is exercised separately below; here we only care
    # about what each recipient was handed over with.
    service._add_sibling_email_steps = AsyncMock(return_value=None)
    workspace_service = SimpleNamespace(
        get_workspace_admins=AsyncMock(return_value=members)
    )
    return service, workspace_service


async def _notify(service, workspace_service, run_id="run-1", step_order=0):
    with patch(
        "aexy.services.workspace_service.WorkspaceService",
        return_value=workspace_service,
    ):
        return await service._action_notify_user(
            CONFIG, RECORD, "ws-1", {"changed_by_id": "dev-9"}, run_id, step_order
        )


async def test_every_recipient_is_reconcilable_against_the_run():
    members = [_member("d1", "a@example.com"), _member("d2", "b@example.com"),
               _member("d3", "c@example.com")]
    service, workspace_service = _service(members, run=None)

    result = await _notify(service, workspace_service, step_order=2)

    calls = service._action_send_email.await_args_list
    assert len(calls) == 3
    run_ids = [c.args[4] for c in calls]
    step_orders = [c.args[5] for c in calls]

    # No recipient is handed over anonymously any more.
    assert run_ids == ["run-1", "run-1", "run-1"]
    # Recipient 0 uses the step the executor wrote; the rest get their own, so
    # one recipient's result can never close a step another still owns.
    assert step_orders[0] == 2
    assert len(set(step_orders)) == 3
    assert all(o >= _SIBLING_STEP_ORDER_BASE for o in step_orders[1:])


async def test_the_step_is_queued_not_a_success():
    members = [_member("d1", "a@example.com"), _member("d2", "b@example.com")]
    service, workspace_service = _service(members, run=None)

    result = await _notify(service, workspace_service)

    # "queued" is what makes the executor hold the run open instead of stamping
    # it completed before any delivery outcome exists.
    assert result["queued"] is True
    assert result["recipients_notified"] == 2


async def test_a_single_recipient_keeps_the_executors_own_step():
    service, workspace_service = _service([_member("d1", "a@example.com")], run=None)

    result = await _notify(service, workspace_service, step_order=7)

    assert result["queued"] is True
    call = service._action_send_email.await_args_list[0]
    assert call.args[4] == "run-1"
    assert call.args[5] == 7
    # Nothing extra to write when there is only one recipient.
    assert service._add_sibling_email_steps.await_args.args[1] == []


async def test_sibling_steps_are_appended_to_the_run_once():
    """The 2nd..Nth recipient need a step of their own to report back into."""
    run = SimpleNamespace(
        steps_executed=[{"type": "notify_user", "order": 0, "status": "queued"}]
    )
    service = CRMAutomationService(db=None)
    service.db = SimpleNamespace(
        get=AsyncMock(return_value=run), flush=AsyncMock(return_value=None)
    )

    siblings = [(1_000_001, "b@example.com"), (1_000_002, "c@example.com")]
    await service._add_sibling_email_steps("run-1", siblings)

    orders = [s["order"] for s in run.steps_executed]
    assert orders == [0, 1_000_001, 1_000_002]
    added = run.steps_executed[1:]
    assert [s["recipient"] for s in added] == ["b@example.com", "c@example.com"]
    assert all(s["status"] == "queued" for s in added)

    # Idempotent: a retry must not duplicate the steps.
    await service._add_sibling_email_steps("run-1", siblings)
    assert [s["order"] for s in run.steps_executed] == [0, 1_000_001, 1_000_002]
