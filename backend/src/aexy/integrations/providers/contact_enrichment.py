"""Contact enrichment providers — enrich contacts with firmographic data."""

import logging
from typing import Any

import httpx

from aexy.integrations.registry import BaseProvider, ProviderRegistry
from aexy.integrations.providers.base import ContactEnrichmentResult

logger = logging.getLogger(__name__)


class ContactEnrichmentProvider(BaseProvider):
    """ABC for contact enrichment providers."""

    SLOT = "contact_enrichment"

    async def enrich_by_email(self, email: str) -> ContactEnrichmentResult:
        """Enrich a contact by email address."""
        raise NotImplementedError

    async def enrich_by_domain(self, domain: str) -> ContactEnrichmentResult:
        """Enrich a company by domain."""
        raise NotImplementedError

    async def search_people(
        self, domain: str, titles: list[str] | None = None, limit: int = 5,
    ) -> list[ContactEnrichmentResult]:
        """Search for people at a company."""
        raise NotImplementedError


class ApolloProvider(ContactEnrichmentProvider):
    """Apollo.io — contact enrichment via Apollo v1 API.

    API: https://api.apollo.io/v1/
    Auth: x-api-key header
    """

    NAME = "apollo"
    DISPLAY_NAME = "Apollo.io"
    MONTHLY_COST_CENTS = 0  # varies by plan
    REQUIRED_CREDENTIALS = ["api_key"]

    API_BASE = "https://api.apollo.io/v1"

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    async def enrich_by_email(self, email: str) -> ContactEnrichmentResult:
        """Enrich a contact by email via Apollo people/match endpoint."""
        api_key = self.credentials.get("api_key", "")
        if not api_key:
            return ContactEnrichmentResult(error="API key not configured")

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{self.API_BASE}/people/match",
                    headers=self._headers(api_key),
                    json={"email": email},
                )

                if resp.status_code == 404:
                    return ContactEnrichmentResult(
                        success=False,
                        raw_response={"status": 404, "message": "No person found"},
                    )

                if resp.status_code == 401:
                    return ContactEnrichmentResult(
                        error="Apollo API authentication failed (invalid API key)",
                        raw_response={"status": 401, "body": resp.text[:500]},
                    )

                if resp.status_code == 429:
                    return ContactEnrichmentResult(
                        error="Apollo API rate limit exceeded",
                        raw_response={"status": 429, "body": resp.text[:500]},
                    )

                if resp.status_code != 200:
                    return ContactEnrichmentResult(
                        error=f"Apollo API error: {resp.status_code}",
                        raw_response={"status": resp.status_code, "body": resp.text[:500]},
                    )

                data = resp.json()
                person = data.get("person") or {}
                return self._parse_person(person, raw=data)

        except httpx.TimeoutException:
            return ContactEnrichmentResult(error="Apollo API timeout")
        except Exception as e:
            logger.exception("Apollo enrich_by_email error for %s", email)
            return ContactEnrichmentResult(error=str(e))

    async def enrich_by_domain(self, domain: str) -> ContactEnrichmentResult:
        """Enrich a company/org by domain via Apollo organizations/enrich endpoint."""
        api_key = self.credentials.get("api_key", "")
        if not api_key:
            return ContactEnrichmentResult(error="API key not configured")

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{self.API_BASE}/organizations/enrich",
                    headers=self._headers(api_key),
                    json={"domain": domain},
                )

                if resp.status_code == 404:
                    return ContactEnrichmentResult(
                        success=False,
                        raw_response={"status": 404, "message": "No organization found"},
                    )

                if resp.status_code == 401:
                    return ContactEnrichmentResult(
                        error="Apollo API authentication failed (invalid API key)",
                        raw_response={"status": 401, "body": resp.text[:500]},
                    )

                if resp.status_code == 429:
                    return ContactEnrichmentResult(
                        error="Apollo API rate limit exceeded",
                        raw_response={"status": 429, "body": resp.text[:500]},
                    )

                if resp.status_code != 200:
                    return ContactEnrichmentResult(
                        error=f"Apollo API error: {resp.status_code}",
                        raw_response={"status": resp.status_code, "body": resp.text[:500]},
                    )

                data = resp.json()
                org = data.get("organization") or {}
                return self._parse_organization(org, raw=data)

        except httpx.TimeoutException:
            return ContactEnrichmentResult(error="Apollo API timeout")
        except Exception as e:
            logger.exception("Apollo enrich_by_domain error for %s", domain)
            return ContactEnrichmentResult(error=str(e))

    async def search_people(
        self, domain: str, titles: list[str] | None = None, limit: int = 5,
    ) -> list[ContactEnrichmentResult]:
        """Search for people at a company by domain and optional title filters."""
        api_key = self.credentials.get("api_key", "")
        if not api_key:
            return [ContactEnrichmentResult(error="API key not configured")]

        payload: dict[str, Any] = {
            "organization_domains": [domain],
            "page": 1,
            "per_page": min(limit, 25),  # Apollo caps at 25 per page
        }
        if titles:
            payload["person_titles"] = titles

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    f"{self.API_BASE}/mixed_people/search",
                    headers=self._headers(api_key),
                    json=payload,
                )

                if resp.status_code == 401:
                    return [ContactEnrichmentResult(
                        error="Apollo API authentication failed (invalid API key)",
                        raw_response={"status": 401, "body": resp.text[:500]},
                    )]

                if resp.status_code == 429:
                    return [ContactEnrichmentResult(
                        error="Apollo API rate limit exceeded",
                        raw_response={"status": 429, "body": resp.text[:500]},
                    )]

                if resp.status_code != 200:
                    return [ContactEnrichmentResult(
                        error=f"Apollo API error: {resp.status_code}",
                        raw_response={"status": resp.status_code, "body": resp.text[:500]},
                    )]

                data = resp.json()
                people = data.get("people") or []
                return [self._parse_person(p, raw=p) for p in people]

        except httpx.TimeoutException:
            return [ContactEnrichmentResult(error="Apollo API timeout")]
        except Exception as e:
            logger.exception("Apollo search_people error for %s", domain)
            return [ContactEnrichmentResult(error=str(e))]

    async def test_connection(self) -> dict[str, Any]:
        """Test Apollo API connection with a lightweight people/match call."""
        api_key = self.credentials.get("api_key", "")
        if not api_key:
            return {"success": False, "message": "API key not configured"}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # Use a people/match call with a known test email.
                # A 200 or 404 means the key is valid; 401/403 means bad key.
                resp = await client.post(
                    f"{self.API_BASE}/people/match",
                    headers=self._headers(api_key),
                    json={"email": "test@example.com"},
                )

                if resp.status_code == 401:
                    return {"success": False, "message": "Invalid API key"}
                if resp.status_code == 403:
                    return {"success": False, "message": "API key lacks required permissions"}
                if resp.status_code in (200, 404):
                    return {"success": True, "message": "Connection successful"}

                return {"success": False, "message": f"Unexpected status: {resp.status_code}"}

        except httpx.TimeoutException:
            return {"success": False, "message": "Connection timed out"}
        except Exception as e:
            return {"success": False, "message": str(e)}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _headers(api_key: str) -> dict[str, str]:
        """Build request headers with Apollo API key authentication."""
        return {
            "Content-Type": "application/json",
            "x-api-key": api_key,
        }

    @staticmethod
    def _parse_person(person: dict, *, raw: dict) -> ContactEnrichmentResult:
        """Parse an Apollo person object into a ContactEnrichmentResult."""
        if not person:
            return ContactEnrichmentResult(
                success=False,
                raw_response=raw,
            )

        org = person.get("organization") or {}

        return ContactEnrichmentResult(
            success=True,
            first_name=person.get("first_name"),
            last_name=person.get("last_name"),
            email=person.get("email"),
            phone=_first_phone(person),
            title=person.get("title"),
            linkedin_url=person.get("linkedin_url"),
            company_name=org.get("name") or person.get("organization_name"),
            company_domain=org.get("primary_domain") or person.get("organization", {}).get("website_url"),
            company_industry=org.get("industry"),
            company_size=_employee_range(org.get("estimated_num_employees")),
            raw_response=raw,
        )

    @staticmethod
    def _parse_organization(org: dict, *, raw: dict) -> ContactEnrichmentResult:
        """Parse an Apollo organization object into a ContactEnrichmentResult."""
        if not org:
            return ContactEnrichmentResult(
                success=False,
                raw_response=raw,
            )

        return ContactEnrichmentResult(
            success=True,
            company_name=org.get("name"),
            company_domain=org.get("primary_domain") or org.get("website_url"),
            company_industry=org.get("industry"),
            company_size=_employee_range(org.get("estimated_num_employees")),
            linkedin_url=org.get("linkedin_url"),
            phone=org.get("phone"),
            raw_response=raw,
        )


# ------------------------------------------------------------------
# Module-level helpers
# ------------------------------------------------------------------

def _first_phone(person: dict) -> str | None:
    """Extract the first phone number from an Apollo person's phone_numbers list."""
    phones = person.get("phone_numbers")
    if phones and isinstance(phones, list):
        first = phones[0]
        if isinstance(first, dict):
            return first.get("sanitized_number") or first.get("raw_number")
        return str(first)
    return person.get("phone")


def _employee_range(count: int | str | None) -> str | None:
    """Convert an estimated employee count into a human-friendly range string."""
    if count is None:
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


# Register the provider
ProviderRegistry.register("contact_enrichment", "apollo", ApolloProvider)
