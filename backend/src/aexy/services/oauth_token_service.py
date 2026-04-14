"""Refresh access tokens for Google / Microsoft OAuth connections.

Both providers rotate refresh tokens — every refresh-grant response may include
a new `refresh_token` which MUST be persisted. Dropping it invalidates the
token family and forces the user to re-consent.

This module centralises:
    * expiry-aware refresh (noop when the stored token is still valid)
    * refresh-token rotation (store the new one if Google/MS returns it)
    * invalid_grant handling (null the refresh_token so the UI can prompt
      the user to reconnect instead of retrying forever)

Two row types hold Google OAuth state and they spell the expiry column
differently (`GoogleConnection.token_expires_at` vs
`GoogleIntegration.token_expiry`), so the helpers accept the field name.
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


def _default_revoke_handler(connection: object) -> None:
    """Null out the refresh_token — the standard strategy for connection rows
    where the column is nullable."""
    connection.refresh_token = None


async def _refresh_google(
    db: AsyncSession,
    connection: object,
    expiry_attr: str,
    owner_ref: str,
    revoke_handler=_default_revoke_handler,
) -> str:
    """Shared refresh flow for any row with Google access/refresh tokens.

    `expiry_attr` is the attribute name that stores the expiry datetime
    (GoogleConnection uses `token_expires_at`; GoogleIntegration uses
    `token_expiry`). `revoke_handler` mutates the row when the refresh
    token is revoked — different models flag revocation differently.
    `owner_ref` is used for logging only.
    """
    if not _needs_refresh(getattr(connection, expiry_attr, None)):
        return connection.access_token
    if not connection.refresh_token:
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
        logger.warning("Google refresh_token revoked for %s", owner_ref)
        revoke_handler(connection)
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
        setattr(
            connection,
            expiry_attr,
            datetime.now(timezone.utc) + timedelta(seconds=int(expires_in)),
        )
    if data.get("refresh_token"):
        connection.refresh_token = data["refresh_token"]
    await db.flush()
    return connection.access_token


async def ensure_valid_google_token(
    db: AsyncSession,
    connection: GoogleConnection,
) -> str:
    """Return a valid Google access token for a developer's GoogleConnection."""
    return await _refresh_google(
        db,
        connection,
        expiry_attr="token_expires_at",
        owner_ref=f"developer={connection.developer_id}",
    )


def _mark_integration_revoked(integration: object) -> None:
    """GoogleIntegration.refresh_token is NOT NULL. Mark the integration
    inactive with a diagnostic error instead of nulling the column."""
    integration.is_active = False
    integration.last_error = "refresh_token_revoked"


async def ensure_valid_google_integration_token(
    db: AsyncSession,
    integration: object,  # GoogleIntegration (avoid circular import)
) -> str:
    """Return a valid Google access token for a workspace's GoogleIntegration."""
    return await _refresh_google(
        db,
        integration,
        expiry_attr="token_expiry",
        owner_ref=f"workspace={getattr(integration, 'workspace_id', '?')}",
        revoke_handler=_mark_integration_revoked,
    )


async def _refresh_microsoft(
    db: AsyncSession,
    connection: object,
    expiry_attr: str,
    scopes: list[str],
    owner_ref: str,
    revoke_handler=_default_revoke_handler,
) -> str:
    """Shared Microsoft refresh flow. `scopes` is sent with the grant so
    the new access token carries matching permissions."""
    if not _needs_refresh(getattr(connection, expiry_attr, None)):
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
                    "scope": " ".join(scopes),
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.RequestError as e:
        logger.error("Microsoft token refresh network error: %s", e)
        raise TokenRefreshError(str(e)) from e

    if resp.status_code == 400 and "invalid_grant" in resp.text:
        logger.warning("Microsoft refresh_token revoked for %s", owner_ref)
        revoke_handler(connection)
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
        setattr(
            connection,
            expiry_attr,
            datetime.now(timezone.utc) + timedelta(seconds=int(expires_in)),
        )
    # Microsoft ALWAYS rotates refresh tokens — persist or the next refresh
    # fails with invalid_grant.
    if data.get("refresh_token"):
        connection.refresh_token = data["refresh_token"]
    await db.flush()
    return connection.access_token


async def ensure_valid_microsoft_token(
    db: AsyncSession,
    connection: MicrosoftConnection,
) -> str:
    """Return a valid Microsoft Graph access token for a developer's
    MicrosoftConnection, refreshing if needed."""
    return await _refresh_microsoft(
        db,
        connection,
        expiry_attr="token_expires_at",
        scopes=connection.scopes or [],
        owner_ref=f"developer={connection.developer_id}",
    )


# --------------------- Booking CalendarConnection ---------------------

# Scopes to re-request when refreshing a Microsoft booking calendar. Kept
# narrow on purpose — booking only needs Calendar read/write.
_MS_CALENDAR_REFRESH_SCOPES = [
    "https://graph.microsoft.com/Calendars.ReadWrite",
    "offline_access",
]


async def ensure_valid_calendar_connection_token(
    db: AsyncSession,
    connection: object,  # booking.CalendarConnection
) -> str:
    """Return a valid access token for a booking CalendarConnection.

    Dispatches to the Google or Microsoft refresh primitive based on the
    connection's `provider` column. Refresh-token rotation, invalid_grant
    handling, and revoke signalling are shared with the developer- and
    workspace-level helpers.
    """
    provider = (getattr(connection, "provider", "") or "").lower()
    owner_ref = f"calendar-connection={getattr(connection, 'id', '?')}"

    if provider == "google":
        return await _refresh_google(
            db,
            connection,
            expiry_attr="token_expires_at",
            owner_ref=owner_ref,
        )
    if provider == "microsoft":
        return await _refresh_microsoft(
            db,
            connection,
            expiry_attr="token_expires_at",
            scopes=_MS_CALENDAR_REFRESH_SCOPES,
            owner_ref=owner_ref,
        )
    raise TokenRefreshError(
        f"Unsupported calendar connection provider: {provider!r}"
    )
