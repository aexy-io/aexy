"""Ensure the visual workflow tester never enrolls a real contact."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aexy.schemas.workflow import WorkflowExecutionContext
from aexy.services.workflow_actions import WorkflowActionHandler


@pytest.mark.asyncio
async def test_sequence_dry_run_validates_a_person_without_enrolling_them():
    db = MagicMock()
    record_result = MagicMock()
    record_result.scalar_one_or_none.return_value = SimpleNamespace(
        values={"email": "test@example.com"}, display_name="Test Person"
    )
    db.execute = AsyncMock(return_value=record_result)
    sequence_service = MagicMock()
    sequence_service.get_sequence = AsyncMock(return_value=SimpleNamespace(status="active"))

    with patch(
        "aexy.services.outreach_sequence_service.OutreachSequenceService",
        return_value=sequence_service,
    ):
        result = await WorkflowActionHandler(db).execute_action(
            "enroll_in_sequence",
            {"sequence_id": "sequence-1"},
            WorkflowExecutionContext(
                workspace_id="workspace-1", record_id="record-1", is_dry_run=True
            ),
        )

    assert result.status == "success"
    assert result.output == {"sequence_id": "sequence-1", "would_enroll": True}
    sequence_service.enroll_contact.assert_not_called()
