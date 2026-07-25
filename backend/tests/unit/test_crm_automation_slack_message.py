"""Behaviour checks for the CRM automation Slack action's message rendering."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aexy.services.crm_automation_service import CRMAutomationService


def _slack_service():
    service = MagicMock()
    service.get_integration_by_workspace = AsyncMock(
        return_value=SimpleNamespace(user_mappings={})
    )
    service.send_message = AsyncMock(
        return_value=SimpleNamespace(success=True, message_ts="1700000000.1", error=None)
    )
    return service


@pytest.mark.asyncio
async def test_slack_message_resolves_double_brace_record_placeholders():
    """Regression: {{record.name}} used to reach Slack as literal text.

    The action carried its own placeholder logic that only understood
    {{trigger.x}} and single-brace {field}, so the double-brace record forms
    every other action supports were posted verbatim into the channel.
    """
    service = CRMAutomationService(MagicMock())
    record = SimpleNamespace(
        id="record-1",
        name="Ada Lovelace",
        values={"email": "ada@example.com"},
    )
    slack = _slack_service()

    with patch(
        "aexy.services.crm_automation_service.SlackIntegrationService",
        return_value=slack,
    ):
        result = await service._action_send_slack(
            {
                "channel": "C0BKPH0SGSG",
                "message": "Update for {{record.name}} ({{record.values.email}})",
            },
            record,
            "workspace-1",
            None,
        )

    assert result["text"] == "Update for Ada Lovelace (ada@example.com)"
    assert slack.send_message.await_args.kwargs["channel_id"] == "C0BKPH0SGSG"


@pytest.mark.asyncio
async def test_slack_message_still_resolves_legacy_and_trigger_placeholders():
    """The older single-brace and trigger forms must keep working."""
    service = CRMAutomationService(MagicMock())
    record = SimpleNamespace(id="record-1", name="Ada", values={"company": "Analytical"})
    slack = _slack_service()

    with patch(
        "aexy.services.crm_automation_service.SlackIntegrationService",
        return_value=slack,
    ):
        result = await service._action_send_slack(
            {"channel": "C1", "message": "{record_name} at {company} via {{trigger.source}}"},
            record,
            "workspace-1",
            {"source": "import"},
        )

    assert result["text"] == "Ada at Analytical via import"
