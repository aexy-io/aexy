"""SMS providers — wraps existing TwilioService for GTM provider registry."""

import logging
from typing import Any

from aexy.integrations.registry import BaseProvider, ProviderRegistry
from aexy.integrations.providers.base import SMSSendResult

logger = logging.getLogger(__name__)


class SMSProvider(BaseProvider):
    """ABC for SMS providers."""

    SLOT = "sms"

    async def send_sms(self, to_number: str, body: str, from_number: str | None = None) -> SMSSendResult:
        """Send an SMS message."""
        raise NotImplementedError


class TwilioSMSProvider(SMSProvider):
    """Twilio SMS — wraps existing TwilioService integration."""

    NAME = "twilio"
    DISPLAY_NAME = "Twilio"
    MONTHLY_COST_CENTS = 0  # pay-per-use
    REQUIRED_CREDENTIALS = ["account_sid", "auth_token", "from_number"]

    async def send_sms(self, to_number: str, body: str, from_number: str | None = None) -> SMSSendResult:
        """Send SMS via Twilio."""
        account_sid = self.credentials.get("account_sid", "")
        auth_token = self.credentials.get("auth_token", "")
        sender = from_number or self.credentials.get("from_number", "")

        if not all([account_sid, auth_token, sender]):
            return SMSSendResult(to_number=to_number, error="Twilio credentials incomplete")

        try:
            import httpx

            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
                    auth=(account_sid, auth_token),
                    data={
                        "To": to_number,
                        "From": sender,
                        "Body": body,
                    },
                )

                if resp.status_code in (200, 201):
                    data = resp.json()
                    return SMSSendResult(
                        success=True,
                        message_sid=data.get("sid"),
                        to_number=to_number,
                        status=data.get("status", "queued"),
                        raw_response=data,
                    )

                return SMSSendResult(
                    to_number=to_number,
                    error=f"Twilio error: {resp.status_code} - {resp.text[:200]}",
                    raw_response={"status": resp.status_code},
                )

        except Exception as e:
            logger.exception(f"Twilio SMS error to {to_number}")
            return SMSSendResult(to_number=to_number, error=str(e))

    async def test_connection(self) -> dict[str, Any]:
        """Test Twilio credentials."""
        account_sid = self.credentials.get("account_sid", "")
        auth_token = self.credentials.get("auth_token", "")

        if not all([account_sid, auth_token]):
            return {"success": False, "message": "Account SID and Auth Token required"}

        try:
            import httpx

            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}.json",
                    auth=(account_sid, auth_token),
                )

                if resp.status_code == 200:
                    return {"success": True, "message": "Connection successful"}
                if resp.status_code == 401:
                    return {"success": False, "message": "Invalid credentials"}

                return {"success": False, "message": f"Unexpected status: {resp.status_code}"}

        except Exception as e:
            return {"success": False, "message": str(e)}


# Register the provider
ProviderRegistry.register("sms", "twilio", TwilioSMSProvider)
