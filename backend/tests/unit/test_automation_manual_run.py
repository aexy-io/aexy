"""Running an automation by hand must not report success it cannot know about.

Execution happens in a background task whose exceptions go nowhere, so anything
the endpoint does not check before answering is indistinguishable from success:
a paused automation, an exhausted monthly allowance, a record from another
workspace, a record of the wrong type. The button would say "triggered" and
nothing would happen, with no failed run to look at either — the run row is
only created once execution starts.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from aexy.api.automations import trigger_automation_manually

pytestmark = pytest.mark.asyncio

WORKSPACE = "ws-1"


def _automation(**overrides):
    base = dict(
        id="auto-1",
        workspace_id=WORKSPACE,
        module="crm",
        is_active=True,
        object_id=None,
        run_limit_per_month=None,
        runs_this_month=0,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


async def _call(automation, *, record_id=None, record=None):
    """Invoke the endpoint with the service and record lookup stubbed."""
    result = SimpleNamespace(scalar_one_or_none=lambda: record)
    db = SimpleNamespace(execute=AsyncMock(return_value=result))
    service = SimpleNamespace(get_automation=AsyncMock(return_value=automation))

    with patch("aexy.api.automations.AutomationService", return_value=service), patch(
        "aexy.api.automations.check_workspace_permission", AsyncMock()
    ):
        from fastapi import BackgroundTasks

        return await trigger_automation_manually(
            workspace_id=WORKSPACE,
            automation_id="auto-1",
            record_id=record_id,
            background_tasks=BackgroundTasks(),
            db=db,
            current_user=SimpleNamespace(id="dev-1"),
        )


async def test_a_valid_run_reports_started_not_succeeded():
    """The work happens after the response; only run history knows the outcome."""
    record = SimpleNamespace(id="rec-1", object_id=None)

    result = await _call(_automation(), record_id="rec-1", record=record)

    assert result["started"] is True
    assert "started" in result["message"].lower()
    assert "success" not in result["message"].lower()


async def test_a_paused_automation_is_refused():
    with pytest.raises(HTTPException) as caught:
        await _call(_automation(is_active=False), record_id="rec-1")

    assert caught.value.status_code == 409
    assert "paused" in caught.value.detail.lower()


async def test_an_exhausted_monthly_allowance_is_refused():
    with pytest.raises(HTTPException) as caught:
        await _call(
            _automation(run_limit_per_month=100, runs_this_month=100),
            record_id="rec-1",
        )

    assert caught.value.status_code == 409
    assert "monthly run limit" in caught.value.detail.lower()


async def test_a_record_from_another_workspace_is_refused():
    """The lookup is scoped to the workspace, so a foreign id simply misses."""
    with pytest.raises(HTTPException) as caught:
        await _call(_automation(), record_id=str(uuid4()), record=None)

    assert caught.value.status_code == 404


async def test_a_record_of_the_wrong_type_is_refused():
    """Otherwise every action runs against fields the record does not have."""
    record = SimpleNamespace(id="rec-1", object_id="object-companies")

    with pytest.raises(HTTPException) as caught:
        await _call(
            _automation(object_id="object-people"),
            record_id="rec-1",
            record=record,
        )

    assert caught.value.status_code == 400
    assert "type" in caught.value.detail.lower()


async def test_a_crm_automation_without_a_record_is_refused():
    """Every CRM action needs record context; without one they all fail."""
    with pytest.raises(HTTPException) as caught:
        await _call(_automation(), record_id=None)

    assert caught.value.status_code == 400
    assert "record" in caught.value.detail.lower()


async def test_a_non_crm_automation_may_run_without_a_record():
    """Other modules carry their entity in trigger_data instead."""
    result = await _call(_automation(module="uptime"), record_id=None)

    assert result["started"] is True
