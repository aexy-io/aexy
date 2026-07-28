"""Phase-3.1: record.created reliably dispatches into the automation engine.

The dispatch chain is:
    crm_service.create_record
      -> CRMEventService.emit_record_created
        -> CRMAutomationService.process_trigger(trigger_type=...)
          -> matches CRMAutomation rows where trigger_type == <value>

The subtle failure mode this guards against: the value emitted here must equal
the trigger id the palette/registry stores on automations (`record.created`),
or UI-built automations silently never match and never fire. These tests lock
that naming contract.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aexy.models.crm import CRMAutomationTriggerType
from aexy.schemas.automation import get_trigger_ids
from aexy.services.crm_events import CRMEventService


@pytest.mark.asyncio
async def test_emit_record_created_dispatches_with_registry_trigger_type():
    svc = CRMEventService(db=MagicMock())

    with patch(
        "aexy.services.crm_automation_service.CRMAutomationService.process_trigger",
        new_callable=AsyncMock,
    ) as mock_process, patch(
        "aexy.services.crm_automation_service.CRMWebhookService.emit_event",
        new_callable=AsyncMock,
    ):
        await svc.emit_record_created(
            workspace_id="ws1",
            object_id="obj1",
            record_id="rec1",
            values={"name": "X"},
            created_by_id="dev1",
        )

    mock_process.assert_awaited_once()
    kwargs = mock_process.await_args.kwargs
    # Dispatched trigger_type must equal the enum value AND the registry id the
    # palette stores on automations — otherwise the match query finds nothing.
    assert kwargs["trigger_type"] == CRMAutomationTriggerType.RECORD_CREATED.value
    assert kwargs["trigger_type"] == "record.created"
    assert kwargs["trigger_type"] in get_trigger_ids("crm")


@pytest.mark.asyncio
async def test_emit_record_created_trigger_data_type_is_consistent():
    """The trigger_data payload recorded on the run must match the dispatched
    trigger_type (no dot/underscore drift leaking into run history)."""
    svc = CRMEventService(db=MagicMock())

    with patch(
        "aexy.services.crm_automation_service.CRMAutomationService.process_trigger",
        new_callable=AsyncMock,
    ) as mock_process, patch(
        "aexy.services.crm_automation_service.CRMWebhookService.emit_event",
        new_callable=AsyncMock,
    ):
        await svc.emit_record_created(
            workspace_id="ws1", object_id="obj1", record_id="rec1",
            values={}, created_by_id=None,
        )

    trigger_data = mock_process.await_args.kwargs["trigger_data"]
    assert trigger_data["trigger_type"] == CRMAutomationTriggerType.RECORD_CREATED.value


@pytest.mark.asyncio
async def test_emit_list_entry_added_dispatches_with_registry_trigger_type():
    svc = CRMEventService(db=MagicMock())

    with patch(
        "aexy.services.crm_automation_service.CRMAutomationService.process_trigger",
        new_callable=AsyncMock,
    ) as mock_process, patch(
        "aexy.services.crm_automation_service.CRMWebhookService.emit_event",
        new_callable=AsyncMock,
    ):
        await svc.emit_list_entry_added(
            workspace_id="ws1",
            object_id="obj1",
            record_id="rec1",
            list_id="list1",
            list_name="VIPs",
            added_by_id="dev1",
        )

    mock_process.assert_awaited_once()
    kwargs = mock_process.await_args.kwargs
    assert kwargs["trigger_type"] == CRMAutomationTriggerType.LIST_ENTRY_ADDED.value
    assert kwargs["trigger_type"] == "list_entry.added"
    assert kwargs["trigger_type"] in get_trigger_ids("crm")


def test_every_offered_trigger_has_a_backing_enum():
    """Anything the registry offers must correspond to a real trigger enum.

    Checked in this direction on purpose. The reverse — asserting every enum
    value is offered — would forbid ever withholding a trigger, and several
    are now deliberately withheld because nothing emits them (2026-07-19
    trim). This direction still catches the failure that matters: a typo or
    invented id reaching the palette, which is how "deal.stage_changed"
    shipped and silently never fired.
    """
    known = {t.value for t in CRMAutomationTriggerType}
    for trigger_id in get_trigger_ids("crm"):
        assert trigger_id in known, trigger_id


def test_offered_triggers_are_the_ones_with_emitters():
    """The offered set is exactly what something actually dispatches.

    Extend this ONLY together with a real dispatch path. It is the guard that
    keeps dead entries out of the palette — status.changed and email.replied
    sat in the builder for weeks because this test was stale, not because
    anyone chose to ship them.
    """
    assert set(get_trigger_ids("crm")) == {
        # Emitted by the shared record save path
        CRMAutomationTriggerType.RECORD_CREATED.value,
        CRMAutomationTriggerType.RECORD_UPDATED.value,
        CRMAutomationTriggerType.RECORD_DELETED.value,
        CRMAutomationTriggerType.FIELD_CHANGED.value,
        CRMAutomationTriggerType.STAGE_CHANGED.value,
        # Emitted by list membership changes
        CRMAutomationTriggerType.LIST_ENTRY_ADDED.value,
        CRMAutomationTriggerType.LIST_ENTRY_REMOVED.value,
        # Emitted by the form submission handler
        CRMAutomationTriggerType.FORM_SUBMITTED.value,
        # Emitted by the email tracking endpoints
        CRMAutomationTriggerType.EMAIL_OPENED.value,
        CRMAutomationTriggerType.EMAIL_CLICKED.value,
        # Dispatched by the per-minute schedule runner
        CRMAutomationTriggerType.SCHEDULE_DAILY.value,
        CRMAutomationTriggerType.SCHEDULE_WEEKLY.value,
        CRMAutomationTriggerType.DATE_APPROACHING.value,
        CRMAutomationTriggerType.DATE_PASSED.value,
        # webhook.received is withheld separately (see get_trigger_ids).
    }
