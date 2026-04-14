"""Refresh access tokens for developer-level Google / Microsoft OAuth connections.

Both providers rotate refresh tokens — every refresh-grant response may include
a new `refresh_token` which MUST be persisted. Dropping it invalidates all
future refreshes for that "family" and forces the user to re-consent.

This module centralises:
    * expiry-aware refresh (noop when the stored token is still valid)
    * refresh-token rotation (store the new one if Google/MS returns it)
    * invalid_grant handling (null the refresh_token so the UI can prompt
      the user to reconnect instead of retrying forever)
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.developer import GoogleConnection, MicrosoftConnection

logger = logging.getLogger(__name__)

# Refresh if the stored token will expire within this buffer.
_REFRESH_SKEW = timedelta(minutes=5)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


class TokenRefreshError(Exception):
    """Generic refresh failure (network, 5xx, unexpected response shape)."""


class RefreshTokenRevokedError(TokenRefreshError):
    """The provider returned `invalid_grant` — the refresh token is dead.

    The connection's refresh_token has been cleared. The caller should
    surface a "Reconnect <provider>" prompt to the user.
    """


def _needs_refresh(expires_at: datetime | None) -> bool:
    if expires_at is None:
        # No expiry info — assume long-lived; caller can force by passing a
        # past datetime via the connection row if it has empirical evidence.
        return False
    return expires_at <= datetime.now(timezone.utc) + _REFRESH_SKEW


async def ensure_valid_google_token(
    db: AsyncSession,
    connection: GoogleConnection,
) -> str:
    """Return a valid Google access token for `connection`, refreshing if needed."""
    if not _needs_refresh(connection.token_expires_at):
        return connection.access_token
    if not connection.refresh_token:
        # No way to refresh — return what we have; the caller's API call
        # will fail with 401 and the UI should catch that separately.
        return connection.access_token

    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "grant_type": "refresh_token",
                    "refresh_token": connection.refresh_token,
                },
            )
    except httpx.RequestError as e:
        logger.error("Google token refresh network error: %s", e)
        raise TokenRefreshError(str(e)) from e

    if resp.status_code == 400 and "invalid_grant" in resp.text:
        logger.warning(
            "Google refresh_token revoked for developer %s", connection.developer_id
        )
        connection.refresh_token = None
        await db.flush()
        raise RefreshTokenRevokedError("Google refresh token is invalid or revoked")

    if resp.status_code != 200:
        logger.error(
            "Google token refresh failed: %s — %s", resp.status_code, resp.text
        )
        raise TokenRefreshError(f"Google token refresh returned {resp.status_code}")

    data = resp.json()
    connection.access_token = data["access_token"]
    expires_in = data.get("expires_in")
    if expires_in:
        connection.token_expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
        )
    # Google rarely rotates this, but when it does we MUST persist the new one.
    if data.get("refresh_token"):
        connection.refresh_token = data["refresh_token"]
    await db.flush()
    return connection.access_token


async def ensure_valid_microsoft_token(
    db: AsyncSession,
    connection: MicrosoftConnection,
) -> str:
    """Return a valid Microsoft Graph access token, refreshing if needed.

    Microsoft Entra ID rotates refresh tokens on every refresh grant — if
    we fail to persist the new `refresh_token` the family is broken and the
    next refresh fires `invalid_grant`.
    """
    if not _needs_refresh(connection.token_expires_at):
        return connection.access_token
    if not connection.refresh_token:
        return connection.access_token

    settings = get_settings()
    tenant = settings.microsoft_tenant_id or "common"
    token_url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                token_url,
                data={
                    "client_id": settings.microsoft_client_id,
                    "client_secret": settings.microsoft_client_secret,
                    "grant_type": "refresh_token",
                    "refresh_token": connection.refresh_token,
                    # Re-request the scopes we already hold so the new access
                    # token carries the same permissions.
                    "scope": " ".join(connection.scopes or []),
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.RequestError as e:
        logger.error("Microsoft token refresh network error: %s", e)
        raise TokenRefreshError(str(e)) from e

    if resp.status_code == 400 and "invalid_grant" in resp.text:
        logger.warning(
            "Microsoft refresh_token revoked for developer %s", connection.developer_id
        )
        connection.refresh_token = None
        await db.flush()
        raise RefreshTokenRevokedError(
            "Microsoft refresh token is invalid or revoked"
        )

    if resp.status_code != 200:
        logger.error(
            "Microsoft token refresh failed: %s — %s", resp.status_code, resp.text
        )
        raise TokenRefreshError(
            f"Microsoft token refresh returned {resp.status_code}"
        )

    data = resp.json()
    connection.access_token = data["access_token"]
    expires_in = data.get("expires_in")
    if expires_in:
        connection.token_expires_at = (
            datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
        )
    # Microsoft ALWAYS rotates refresh tokens — persist or the next refresh
    # fails with invalid_grant.
    if data.get("refresh_token"):
        connection.refresh_token = data["refresh_token"]
    await db.flush()
    return connection.access_token
