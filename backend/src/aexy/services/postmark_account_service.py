"""Postmark Account API service for managing sender signatures and domains."""

import logging
from typing import Any

import httpx

from aexy.core.config import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://api.postmarkapp.com"


class PostmarkAccountService:
    """Manages Postmark sender signatures and domains via the Account API.

    Uses the Account API token (X-Postmark-Account-Token) for account-wide
    operations like creating sender signatures and verifying domains.
    """

    def __init__(self, account_token: str | None = None):
        self._account_token = account_token or settings.postmark_account_token

    @property
    def is_configured(self) -> bool:
        return bool(self._account_token)

    def _headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Postmark-Account-Token": self._account_token,
        }

    # =========================================================================
    # SENDER SIGNATURES
    # =========================================================================

    async def create_sender_signature(
        self,
        from_email: str,
        from_name: str,
        reply_to: str | None = None,
    ) -> dict[str, Any]:
        """Create a sender signature in Postmark for a from-address.

        Args:
            from_email: The email address to register as a sender.
            from_name: The display name for the sender.
            reply_to: Optional reply-to address.

        Returns:
            Postmark sender signature response including ID and confirmation status.
        """
        payload: dict[str, Any] = {
            "FromEmail": from_email,
            "Name": from_name,
        }
        if reply_to:
            payload["ReplyToEmail"] = reply_to

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BASE_URL}/senders",
                json=payload,
                headers=self._headers(),
                timeout=30.0,
            )

            result = response.json()

            if response.status_code == 200:
                logger.info(f"Created Postmark sender signature for {from_email} (ID: {result.get('ID')})")
                return result
            else:
                error_msg = result.get("Message", response.text)
                logger.error(f"Failed to create sender signature for {from_email}: {error_msg}")
                raise Exception(f"Postmark Account API error ({response.status_code}): {error_msg}")

    async def delete_sender_signature(self, signature_id: int) -> bool:
        """Delete a sender signature by ID.

        Args:
            signature_id: The Postmark sender signature ID.

        Returns:
            True if deletion was successful.
        """
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{BASE_URL}/senders/{signature_id}",
                headers=self._headers(),
                timeout=30.0,
            )

            if response.status_code == 200:
                logger.info(f"Deleted Postmark sender signature {signature_id}")
                return True
            else:
                result = response.json()
                error_msg = result.get("Message", response.text)
                logger.error(f"Failed to delete sender signature {signature_id}: {error_msg}")
                raise Exception(f"Postmark Account API error ({response.status_code}): {error_msg}")

    async def list_sender_signatures(self, count: int = 300, offset: int = 0) -> dict[str, Any]:
        """List all sender signatures on the account.

        Returns:
            Postmark response with TotalCount and SenderSignatures list.
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/senders",
                params={"count": count, "offset": offset},
                headers=self._headers(),
                timeout=30.0,
            )

            if response.status_code == 200:
                return response.json()
            else:
                result = response.json()
                error_msg = result.get("Message", response.text)
                raise Exception(f"Postmark Account API error ({response.status_code}): {error_msg}")

    # =========================================================================
    # DOMAIN MANAGEMENT
    # =========================================================================

    async def verify_domain(self, domain: str) -> dict[str, Any]:
        """Add and verify a sending domain in Postmark.

        Args:
            domain: The domain to verify (e.g. 'example.com').

        Returns:
            Postmark domain response with DNS records to configure.
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BASE_URL}/domains",
                json={"Name": domain},
                headers=self._headers(),
                timeout=30.0,
            )

            result = response.json()

            if response.status_code == 200:
                logger.info(f"Added domain {domain} to Postmark (ID: {result.get('ID')})")
                return result
            else:
                error_msg = result.get("Message", response.text)
                logger.error(f"Failed to add domain {domain}: {error_msg}")
                raise Exception(f"Postmark Account API error ({response.status_code}): {error_msg}")

    async def get_domain(self, domain_id: int) -> dict[str, Any]:
        """Get domain details and DNS verification status.

        Args:
            domain_id: The Postmark domain ID.

        Returns:
            Domain details including DKIM/Return-Path verification status.
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/domains/{domain_id}",
                headers=self._headers(),
                timeout=30.0,
            )

            if response.status_code == 200:
                return response.json()
            else:
                result = response.json()
                error_msg = result.get("Message", response.text)
                raise Exception(f"Postmark Account API error ({response.status_code}): {error_msg}")
