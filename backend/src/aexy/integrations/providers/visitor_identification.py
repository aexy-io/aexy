"""Visitor identification providers — resolve IP addresses to company info."""

import logging
from typing import Any

import httpx

from aexy.integrations.registry import BaseProvider, ProviderRegistry
from aexy.integrations.providers.base import VisitorIdentificationResult

logger = logging.getLogger(__name__)


class VisitorIdentificationProvider(BaseProvider):
    """ABC for visitor identification providers."""

    SLOT = "visitor_identification"

    async def identify(self, ip_address: str) -> VisitorIdentificationResult:
        """Identify a visitor by IP address."""
        raise NotImplementedError


class SnitcherProvider(VisitorIdentificationProvider):
    """Snitcher.com — IP-to-company identification ($39/mo base).

    API: GET https://api.snitcher.com/v2/company?ip={ip}
    Auth: Bearer token
    """

    NAME = "snitcher"
    DISPLAY_NAME = "Snitcher"
    MONTHLY_COST_CENTS = 3900
    REQUIRED_CREDENTIALS = ["api_token"]

    API_BASE = "https://api.snitcher.com/v2"

    async def identify(self, ip_address: str) -> VisitorIdentificationResult:
        """Look up company info for an IP address via Snitcher API."""
        api_token = self.credentials.get("api_token", "")
        if not api_token:
            return VisitorIdentificationResult(error="API token not configured")

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{self.API_BASE}/company",
                    params={"ip": ip_address},
                    headers={"Authorization": f"Bearer {api_token}"},
                )

                if resp.status_code == 404:
                    return VisitorIdentificationResult(
                        success=False,
                        raw_response={"status": 404, "message": "No company found"},
                    )

                if resp.status_code != 200:
                    return VisitorIdentificationResult(
                        error=f"Snitcher API error: {resp.status_code}",
                        raw_response={"status": resp.status_code, "body": resp.text[:500]},
                    )

                data = resp.json()
                return self._parse_response(data)

        except httpx.TimeoutException:
            return VisitorIdentificationResult(error="Snitcher API timeout")
        except Exception as e:
            logger.exception(f"Snitcher identification error for {ip_address}")
            return VisitorIdentificationResult(error=str(e))

    def _parse_response(self, data: dict) -> VisitorIdentificationResult:
        """Parse Snitcher API response into our result dataclass."""
        # Snitcher v2 response structure
        company = data if "name" in data else data.get("company", {})
        geo = data.get("geo", {})

        # Determine company type
        company_type = data.get("type", "Business")  # Business, ISP, Education, etc.

        # Skip ISP/bot results (low value)
        if company_type in ("ISP", "Bot"):
            return VisitorIdentificationResult(
                success=False,
                company_type=company_type,
                raw_response=data,
            )

        # Map employee count ranges
        employee_count = company.get("employee_count") or company.get("employees")
        employee_range = self._employee_range(employee_count)

        return VisitorIdentificationResult(
            success=True,
            company_name=company.get("name"),
            company_domain=company.get("domain"),
            industry=company.get("industry") or company.get("sector"),
            employee_range=employee_range,
            revenue_range=company.get("estimated_annual_revenue"),
            company_type=company_type,
            headquarters_location=self._format_location(geo),
            confidence=self._calc_confidence(company),
            raw_response=self._sanitize_raw_response(data),
        )

    @staticmethod
    def _sanitize_raw_response(data: dict) -> dict:
        """Strip PII keys from third-party API responses before storage."""
        _PII_KEYS = frozenset({
            "contacts", "people", "employees", "email", "emails",
            "phones", "phone", "personal", "person", "social_profiles",
        })

        def _strip(obj: Any) -> Any:
            if isinstance(obj, dict):
                return {k: _strip(v) for k, v in obj.items() if k not in _PII_KEYS}
            if isinstance(obj, list):
                return [_strip(item) for item in obj]
            return obj

        return _strip(data)

    @staticmethod
    def _employee_range(count: Any) -> str | None:
        """Convert employee count to range string."""
        if not count:
            return None
        if isinstance(count, str):
            return count  # already a range like "11-50"
        count = int(count)
        if count <= 10:
            return "1-10"
        elif count <= 50:
            return "11-50"
        elif count <= 200:
            return "51-200"
        elif count <= 1000:
            return "201-1000"
        elif count <= 5000:
            return "1001-5000"
        else:
            return "5000+"

    @staticmethod
    def _format_location(geo: dict) -> str | None:
        """Format location from geo data."""
        parts = [geo.get("city"), geo.get("region"), geo.get("country")]
        parts = [p for p in parts if p]
        return ", ".join(parts) if parts else None

    @staticmethod
    def _calc_confidence(company: dict) -> float:
        """Calculate confidence score based on available data."""
        score = 0.0
        if company.get("name"):
            score += 0.3
        if company.get("domain"):
            score += 0.3
        if company.get("industry") or company.get("sector"):
            score += 0.15
        if company.get("employee_count") or company.get("employees"):
            score += 0.15
        if company.get("linkedin_url"):
            score += 0.1
        return min(score, 1.0)

    async def test_connection(self) -> dict[str, Any]:
        """Test Snitcher API connection with a known IP."""
        api_token = self.credentials.get("api_token", "")
        if not api_token:
            return {"success": False, "message": "API token not configured"}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Use Google's DNS IP as a test (always resolves to Google)
                resp = await client.get(
                    f"{self.API_BASE}/company",
                    params={"ip": "8.8.8.8"},
                    headers={"Authorization": f"Bearer {api_token}"},
                )

                if resp.status_code in (401, 410):
                    return {"success": False, "message": "Invalid API token"}
                if resp.status_code == 403:
                    return {"success": False, "message": "API token lacks required permissions"}
                if resp.status_code == 429:
                    return {"success": False, "message": "Rate limited — try again later"}
                if resp.status_code in (200, 404):
                    return {"success": True, "message": "Connection successful"}

                return {"success": False, "message": f"Unexpected response (HTTP {resp.status_code})"}

        except httpx.TimeoutException:
            return {"success": False, "message": "Connection timed out"}
        except Exception as e:
            return {"success": False, "message": str(e)}


# Register the provider
ProviderRegistry.register("visitor_identification", "snitcher", SnitcherProvider)
