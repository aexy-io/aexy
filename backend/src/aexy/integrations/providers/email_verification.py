"""Email verification providers — validate email addresses."""

import logging
from typing import Any

import httpx

from aexy.integrations.registry import BaseProvider, ProviderRegistry
from aexy.integrations.providers.base import EmailVerificationResult

logger = logging.getLogger(__name__)


class EmailVerificationProvider(BaseProvider):
    """ABC for email verification providers."""

    SLOT = "email_verification"

    async def verify(self, email: str) -> EmailVerificationResult:
        """Verify a single email address."""
        raise NotImplementedError

    async def verify_bulk(self, emails: list[str]) -> list[EmailVerificationResult]:
        """Verify multiple email addresses. Default: sequential."""
        return [await self.verify(e) for e in emails]


class MillionVerifierProvider(EmailVerificationProvider):
    """MillionVerifier — email verification ($16/mo base).

    API: https://api.millionverifier.com/api/v3/?api=API_KEY&email=EMAIL
    """

    NAME = "millionverifier"
    DISPLAY_NAME = "MillionVerifier"
    MONTHLY_COST_CENTS = 1600
    REQUIRED_CREDENTIALS = ["api_key"]

    API_BASE = "https://api.millionverifier.com/api/v3"

    # MillionVerifier result codes
    VALID_CODES = {"ok", "catch_all"}
    INVALID_CODES = {"invalid", "disposable", "unknown"}

    async def verify(self, email: str) -> EmailVerificationResult:
        """Verify a single email via MillionVerifier API."""
        api_key = self.credentials.get("api_key", "")
        if not api_key:
            return EmailVerificationResult(email=email, error="API key not configured")

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    self.API_BASE,
                    params={"api": api_key, "email": email},
                )

                if resp.status_code != 200:
                    return EmailVerificationResult(
                        email=email,
                        error=f"MillionVerifier API error: {resp.status_code}",
                        raw_response={"status": resp.status_code},
                    )

                data = resp.json()
                return self._parse_response(email, data)

        except httpx.TimeoutException:
            return EmailVerificationResult(email=email, error="MillionVerifier API timeout")
        except Exception as e:
            logger.exception(f"MillionVerifier error for {email}")
            return EmailVerificationResult(email=email, error=str(e))

    def _parse_response(self, email: str, data: dict) -> EmailVerificationResult:
        """Parse MillionVerifier response."""
        result_code = data.get("result", "unknown").lower()
        quality_score = data.get("quality_score", 0)
        if isinstance(quality_score, str):
            try:
                quality_score = float(quality_score) / 100
            except (ValueError, TypeError):
                quality_score = 0.0

        return EmailVerificationResult(
            email=email,
            is_valid=result_code in self.VALID_CODES,
            result_code=result_code,
            quality_score=quality_score,
            is_disposable=result_code == "disposable",
            is_role_based=data.get("role", False),
            is_free_provider=data.get("free", False),
            did_you_mean=data.get("did_you_mean"),
            raw_response=data,
        )

    async def test_connection(self) -> dict[str, Any]:
        """Test MillionVerifier API connection."""
        api_key = self.credentials.get("api_key", "")
        if not api_key:
            return {"success": False, "message": "API key not configured"}

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    self.API_BASE,
                    params={"api": api_key, "email": "test@example.com"},
                )

                if resp.status_code == 401:
                    return {"success": False, "message": "Invalid API key"}
                if resp.status_code == 200:
                    return {"success": True, "message": "Connection successful"}

                return {"success": False, "message": f"Unexpected status: {resp.status_code}"}

        except httpx.TimeoutException:
            return {"success": False, "message": "Connection timed out"}
        except Exception as e:
            return {"success": False, "message": str(e)}


# Register the provider
ProviderRegistry.register("email_verification", "millionverifier", MillionVerifierProvider)
