"""Regression check for the configured PhantomBuster LinkedIn message shape."""

from unittest.mock import AsyncMock, patch

import pytest

from aexy.integrations.providers.linkedin_automation import PhantomBusterProvider


@pytest.mark.asyncio
async def test_message_agent_receives_its_spreadsheet_list_and_message():
    provider = PhantomBusterProvider(
        credentials={"api_key": "test", "message_agent_id": "agent-1"}
    )

    with patch.object(
        provider,
        "_launch_linkedin_list_agent",
        new_callable=AsyncMock,
        return_value="result",
    ) as launch:
        result = await provider.send_message(
            "https://www.linkedin.com/in/test-person/", "Hello from Aexy"
        )

    assert result == "result"
    launch.assert_awaited_once_with(
        agent_id="agent-1",
        action="message",
        target_url="https://www.linkedin.com/in/test-person/",
        input_field="spreadsheetUrl",
        list_name="Aexy LinkedIn message",
        argument_overrides={"message": "Hello from Aexy"},
    )
