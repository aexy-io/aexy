"""Twilio SMS service for sending text messages."""

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import settings


class TwilioService:
    """Service for sending SMS via Twilio."""

    def __init__(self, db: AsyncSession | None = None):
        self.db = db
        self._client = None

    @property
    def client(self):
        """Get or create Twilio client."""
        if self._client is None:
            from twilio.rest import Client

            if not settings.twilio_account_sid or not settings.twilio_auth_token:
                raise ValueError("Twilio credentials not configured")

            self._client = Client(
                settings.twilio_account_sid,
                settings.twilio_auth_token,
            )
        return self._client

    async def send_sms(
        self,
        to: str,
        body: str,
        from_number: str | None = None,
        record_id: str | None = None,
        workspace_id: str | None = None,
    ) -> dict[str, Any]:
        """Send an SMS message.

        Args:
            to: Recipient phone number in E.164 format
            body: Message content
            from_number: Sender phone number (uses default if not provided)
            record_id: Optional CRM record ID to log the activity
            workspace_id: Optional workspace ID for logging

        Returns:
            Dict with message SID and status
        """
        # Validate phone number format
        if not to.startswith("+"):
            raise ValueError("Phone number must be in E.164 format (e.g., '+14155551234')")

        # Use default phone number if not specified
        sender = from_number or settings.twilio_phone_number
        if not sender:
            raise ValueError("No sender phone number configured")

        try:
            message = self.client.messages.create(
                to=to,
                from_=sender,
                body=body,
            )

            result = {
                "sid": message.sid,
                "status": message.status,
                "to": to,
                "from": sender,
                "body": body[:50] + "..." if len(body) > 50 else body,
                "sent_at": datetime.now(timezone.utc).isoformat(),
            }

            # Log to CRM activity if record_id provided
            if record_id and workspace_id and self.db:
                await self._log_sms_activity(
                    workspace_id=workspace_id,
                    record_id=record_id,
                    to=to,
                    body=body,
                    message_sid=message.sid,
                )

            return result

        except Exception as e:
            return {
                "error": str(e),
                "to": to,
                "status": "failed",
            }

    async def _log_sms_activity(
        self,
        workspace_id: str,
        record_id: str,
        to: str,
        body: str,
        message_sid: str,
    ) -> None:
        """Log SMS as a CRM activity."""
        from aexy.models.crm import CRMActivity

        activity = CRMActivity(
            id=str(uuid4()),
            workspace_id=workspace_id,
            record_id=record_id,
            activity_type="sms.sent",
            description=f"SMS sent to {to}: {body[:100]}",
            metadata={
                "to": to,
                "body": body,
                "twilio_sid": message_sid,
                "channel": "sms",
            },
            occurred_at=datetime.now(timezone.utc),
        )
        self.db.add(activity)
        await self.db.flush()

    async def get_message_status(self, message_sid: str) -> dict[str, Any]:
        """Get the status of a sent message."""
        try:
            message = self.client.messages(message_sid).fetch()
            return {
                "sid": message.sid,
                "status": message.status,
                "to": message.to,
                "from": message.from_,
                "error_code": message.error_code,
                "error_message": message.error_message,
            }
        except Exception as e:
            return {
                "sid": message_sid,
                "error": str(e),
            }

    def validate_phone_number(self, phone_number: str) -> dict[str, Any]:
        """Validate a phone number using Twilio Lookup API."""
        try:
            lookup = self.client.lookups.v2.phone_numbers(phone_number).fetch()
            return {
                "valid": lookup.valid,
                "phone_number": lookup.phone_number,
                "country_code": lookup.country_code,
                "caller_name": getattr(lookup, "caller_name", None),
                "carrier": getattr(lookup, "carrier", None),
            }
        except Exception as e:
            return {
                "valid": False,
                "phone_number": phone_number,
                "error": str(e),
            }


class SlackIntegrationService:
    """Enhanced Slack integration for workflow actions."""

    def __init__(self, db: AsyncSession | None = None):
        self.db = db

    async def send_channel_message(
        self,
        workspace_id: str,
        channel: str,
        message: str,
        blocks: list[dict] | None = None,
        thread_ts: str | None = None,
    ) -> dict[str, Any]:
        """Send a message to a Slack channel.

        Args:
            workspace_id: Workspace ID to get Slack token
            channel: Channel ID or name (e.g., '#general' or 'C1234567890')
            message: Message text (used as fallback if blocks provided)
            blocks: Optional Slack Block Kit blocks for rich formatting
            thread_ts: Optional thread timestamp for threaded replies

        Returns:
            Dict with message timestamp and channel
        """
        from aexy.models.integration import Integration
        from slack_sdk import WebClient
        from slack_sdk.errors import SlackApiError

        # Get Slack token from workspace integration
        if not self.db:
            raise ValueError("Database session required")

        stmt = select(Integration).where(
            Integration.workspace_id == workspace_id,
            Integration.integration_type == "slack",
            Integration.is_active == True,
        )
        result = await self.db.execute(stmt)
        integration = result.scalar_one_or_none()

        if not integration or not integration.access_token:
            raise ValueError("Slack integration not configured for workspace")

        try:
            client = WebClient(token=integration.access_token)

            kwargs = {
                "channel": channel,
                "text": message,
            }

            if blocks:
                kwargs["blocks"] = blocks
            if thread_ts:
                kwargs["thread_ts"] = thread_ts

            response = client.chat_postMessage(**kwargs)

            return {
                "ok": True,
                "channel": response["channel"],
                "ts": response["ts"],
                "message": message[:50] + "..." if len(message) > 50 else message,
            }

        except SlackApiError as e:
            return {
                "ok": False,
                "error": e.response["error"],
                "channel": channel,
            }
        except Exception as e:
            return {
                "ok": False,
                "error": str(e),
                "channel": channel,
            }

    async def send_dm(
        self,
        workspace_id: str,
        user_id: str,
        message: str,
        blocks: list[dict] | None = None,
    ) -> dict[str, Any]:
        """Send a direct message to a Slack user.

        Args:
            workspace_id: Workspace ID to get Slack token
            user_id: Slack user ID
            message: Message text
            blocks: Optional Slack Block Kit blocks

        Returns:
            Dict with message timestamp and channel
        """
        from aexy.models.integration import Integration
        from slack_sdk import WebClient
        from slack_sdk.errors import SlackApiError

        if not self.db:
            raise ValueError("Database session required")

        stmt = select(Integration).where(
            Integration.workspace_id == workspace_id,
            Integration.integration_type == "slack",
            Integration.is_active == True,
        )
        result = await self.db.execute(stmt)
        integration = result.scalar_one_or_none()

        if not integration or not integration.access_token:
            raise ValueError("Slack integration not configured for workspace")

        try:
            client = WebClient(token=integration.access_token)

            # Open a DM channel with the user
            dm_response = client.conversations_open(users=[user_id])
            dm_channel = dm_response["channel"]["id"]

            kwargs = {
                "channel": dm_channel,
                "text": message,
            }

            if blocks:
                kwargs["blocks"] = blocks

            response = client.chat_postMessage(**kwargs)

            return {
                "ok": True,
                "channel": dm_channel,
                "ts": response["ts"],
                "user_id": user_id,
            }

        except SlackApiError as e:
            return {
                "ok": False,
                "error": e.response["error"],
                "user_id": user_id,
            }
        except Exception as e:
            return {
                "ok": False,
                "error": str(e),
                "user_id": user_id,
            }

    def build_record_notification_blocks(
        self,
        title: str,
        record_name: str,
        record_type: str,
        fields: dict[str, Any],
        action_url: str | None = None,
    ) -> list[dict]:
        """Build Slack blocks for a CRM record notification.

        Args:
            title: Notification title
            record_name: Name of the CRM record
            record_type: Type of record (contact, company, deal, etc.)
            fields: Key-value pairs to display
            action_url: Optional URL for "View Record" button

        Returns:
            List of Slack Block Kit blocks
        """
        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": title,
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*{record_type.title()}:* {record_name}",
                },
            },
        ]

        # Add fields
        if fields:
            field_blocks = []
            for key, value in list(fields.items())[:10]:  # Max 10 fields
                field_blocks.append({
                    "type": "mrkdwn",
                    "text": f"*{key}:*\n{value}",
                })

            # Slack requires pairs of fields
            while len(field_blocks) > 0:
                batch = field_blocks[:2]
                field_blocks = field_blocks[2:]
                blocks.append({
                    "type": "section",
                    "fields": batch,
                })

        # Add action button
        if action_url:
            blocks.append({
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {
                            "type": "plain_text",
                            "text": "View Record",
                            "emoji": True,
                        },
                        "url": action_url,
                        "action_id": "view_record",
                    },
                ],
            })

        return blocks
