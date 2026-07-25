"""Behaviour checks for CRM automation sequence membership actions."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aexy.services.crm_automation_service import CRMAutomationService


@pytest.mark.asyncio
async def test_enroll_action_records_a_sequence_enrollment():
    service = CRMAutomationService(MagicMock())
    sequence_service = MagicMock()
    sequence_service.enroll_contact = AsyncMock(
        return_value=SimpleNamespace(id="enrollment-1")
    )

    with patch(
        "aexy.services.outreach_sequence_service.OutreachSequenceService",
        return_value=sequence_service,
    ):
        result = await service._execute_action(
            "enroll_in_sequence",
            {"sequence_id": "sequence-1"},
            SimpleNamespace(
                id="record-1",
                display_name="Test Person",
                values={"email": "test@example.com"},
            ),
            "workspace-1",
        )

    assert result == {"sequence_id": "sequence-1", "enrollment_id": "enrollment-1"}
    sequence_service.enroll_contact.assert_awaited_once_with(
        workspace_id="workspace-1",
        sequence_id="sequence-1",
        record_id="record-1",
        email="test@example.com",
        contact_name="Test Person",
    )


@pytest.mark.asyncio
async def test_unenroll_action_marks_active_enrollment_as_exited():
    service = CRMAutomationService(MagicMock())
    sequence_service = MagicMock()
    sequence_service.unenroll_contact = AsyncMock(return_value=True)
    result_proxy = MagicMock()
    result_proxy.scalars.return_value.all.return_value = [SimpleNamespace(id="enrollment-1")]
    service.db.execute = AsyncMock(return_value=result_proxy)

    with patch(
        "aexy.services.outreach_sequence_service.OutreachSequenceService",
        return_value=sequence_service,
    ):
        result = await service._execute_action(
            "remove_from_sequence",
            {"sequence_id": "sequence-1"},
            SimpleNamespace(id="record-1"),
            "workspace-1",
        )

    assert result == {"sequence_id": "sequence-1", "unenrolled": True}
    sequence_service.unenroll_contact.assert_awaited_once_with(
        "workspace-1", "enrollment-1", exit_reason="automation"
    )


@pytest.mark.asyncio
async def test_unenroll_action_is_honest_when_the_record_is_not_enrolled():
    service = CRMAutomationService(MagicMock())
    sequence_service = MagicMock()
    result_proxy = MagicMock()
    result_proxy.scalars.return_value.all.return_value = []
    service.db.execute = AsyncMock(return_value=result_proxy)

    with patch(
        "aexy.services.outreach_sequence_service.OutreachSequenceService",
        return_value=sequence_service,
    ):
        result = await service._execute_action(
            "remove_from_sequence",
            {"sequence_id": "sequence-1"},
            SimpleNamespace(id="record-1"),
            "workspace-1",
        )

    assert result == {"sequence_id": "sequence-1", "unenrolled": False}
