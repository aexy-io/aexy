"""Updating an automation must not be blocked by its own stored trigger.

The registry is a moving target — triggers get retired as their emitters are
withdrawn. Re-validating the *stored* value on every PATCH means an automation
written before a retirement can no longer be renamed, disabled, or repointed at
a supported trigger: every request 422s on a field the caller never touched,
and the only remaining fix is a direct SQL edit. The gate belongs on what is
being set.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from aexy.api.automations import update_automation
from aexy.schemas.automation import get_trigger_ids

RETIRED_TRIGGER = "status.changed"


def _stored_automation():
    """An automation whose trigger the registry no longer offers."""
    assert RETIRED_TRIGGER not in get_trigger_ids("crm")
    return SimpleNamespace(
        id="auto-1",
        workspace_id="ws-1",
        module="crm",
        trigger_type=RETIRED_TRIGGER,
    )


def _service(automation):
    return SimpleNamespace(
        get_automation=AsyncMock(return_value=automation),
        update_automation=AsyncMock(return_value=automation),
    )


async def _update(payload, automation):
    service = _service(automation)
    with patch("aexy.api.automations.AutomationService", return_value=service), patch(
        "aexy.api.automations.check_workspace_permission", AsyncMock()
    ):
        await update_automation(
            workspace_id="ws-1",
            automation_id="auto-1",
            data=SimpleNamespace(model_dump=lambda **_: dict(payload)),
            db=None,
            current_user=SimpleNamespace(id="dev-1"),
        )
    return service


@pytest.mark.asyncio
async def test_an_untouched_retired_trigger_does_not_block_the_update():
    automation = _stored_automation()

    service = await _update({"is_active": False}, automation)

    service.update_automation.assert_awaited_once()
    assert service.update_automation.await_args.kwargs["is_active"] is False


@pytest.mark.asyncio
async def test_setting_an_unsupported_trigger_is_still_refused():
    automation = _stored_automation()

    with pytest.raises(HTTPException) as caught:
        await _update({"trigger_type": "not.a.real.trigger"}, automation)

    assert caught.value.status_code == 422


@pytest.mark.asyncio
async def test_a_retired_trigger_can_be_replaced_with_a_supported_one():
    """The stored value being invalid is exactly why someone is editing it."""
    automation = _stored_automation()

    service = await _update({"trigger_type": "record.updated"}, automation)

    assert (
        service.update_automation.await_args.kwargs["trigger_type"]
        == "record.updated"
    )
