"""Communication tools for AI agents (Slack, SMS)."""

from typing import Any, Type
from pydantic import BaseModel, Field
from langchain_core.tools import BaseTool


class SendSlackInput(BaseModel):
    """Input for sending a Slack message."""
    channel: str = Field(description="Slack channel ID or name (e.g., '#sales' or 'C1234567890')")
    message: str = Field(description="Message content to send")


class SendSlackTool(BaseTool):
    """Send a message to Slack."""

    name: str = "send_slack"
    description: str = "Send a message to a Slack channel. Use for internal notifications or team updates."
    args_schema: Type[BaseModel] = SendSlackInput
    workspace_id: str = ""

    def _run(self, channel: str, message: str) -> str:
        return f"Slack message sent to {channel}"

    async def _arun(self, channel: str, message: str) -> str:
        """Send Slack message."""
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue
        from aexy.temporal.activities.integrations import SendSlackMessageInput

        if not self.workspace_id:
            return "Error: Missing workspace context"

        try:
            await dispatch(
                "send_slack_message",
                SendSlackMessageInput(
                    workspace_id=self.workspace_id,
                    channel=channel,
                    message=message,
                ),
                task_queue=TaskQueue.INTEGRATIONS,
            )

            return f"Slack message queued to {channel}"
        except Exception as e:
            return f"Error sending Slack message: {str(e)}"


class SendSMSInput(BaseModel):
    """Input for sending an SMS."""
    phone_number: str = Field(description="Recipient phone number in E.164 format (e.g., '+14155551234')")
    message: str = Field(description="SMS message content (max 160 characters recommended)")


class SendSMSTool(BaseTool):
    """Send an SMS message via Twilio."""

    name: str = "send_sms"
    description: str = "Send an SMS text message to a phone number. Use for urgent communications or mobile reach."
    args_schema: Type[BaseModel] = SendSMSInput
    workspace_id: str = ""

    def _run(self, phone_number: str, message: str) -> str:
        return f"SMS sent to {phone_number}"

    async def _arun(self, phone_number: str, message: str) -> str:
        """Send SMS via Twilio."""
        from aexy.temporal.dispatch import dispatch
        from aexy.temporal.task_queues import TaskQueue
        from aexy.temporal.activities.integrations import SendSMSInput

        if not self.workspace_id:
            return "Error: Missing workspace context"

        # Validate phone number format
        if not phone_number.startswith("+"):
            return "Error: Phone number must be in E.164 format (e.g., '+14155551234')"

        try:
            await dispatch(
                "send_sms",
                SendSMSInput(
                    workspace_id=self.workspace_id,
                    to=phone_number,
                    body=message,
                ),
                task_queue=TaskQueue.INTEGRATIONS,
            )

            return f"SMS queued to {phone_number}"
        except Exception as e:
            return f"Error sending SMS: {str(e)}"
