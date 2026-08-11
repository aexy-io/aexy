"""Google Integration API endpoints for Gmail and Calendar sync."""

import logging
import urllib.parse
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.api.developers import get_current_developer
from aexy.core.config import get_settings
from aexy.core.database import get_db
from aexy.models.developer import Developer, GoogleConnection
from aexy.models.service_desk import ServiceDeskMailbox
from aexy.models.google_integration import (
    GoogleSyncExclusionRule,
    GoogleSyncHiddenMessage,
    EmailSyncCursor,
    GoogleIntegration,
    GoogleSyncJob,
    SyncedCalendarEvent,
    SyncedCalendarEventRecordLink,
    SyncedEmail,
    SyncedEmailRecordLink,
)
from aexy.schemas.google_integration import (
    CalendarInfo,
    GoogleAccountListResponse,
    GoogleAccountSummary,
    ExclusionAuditEntry,
    ExclusionRuleCreate,
    ExclusionRuleCreatedResponse,
    ExclusionRuleResponse,
    HideMessageRequest,
    HideMessageResponse,
    WorkspaceExclusionsResponse,
    CalendarListResponse,
    CalendarSyncRequest,
    CalendarSyncResponse,
    ContactEnrichRequest,
    ContactEnrichResponse,
    EmailLinkRequest,
    EmailRecipient,
    EmailSendRequest,
    EmailSendResponse,
    EventAttendee,
    EventCreateRequest,
    EventCreateResponse,
    EventLinkRequest,
    GmailSyncRequest,
    GmailSyncResponse,
    GoogleIntegrationConnectResponse,
    GoogleIntegrationSettingsUpdate,
    GoogleIntegrationStatusResponse,
    RecordEnrichResponse,
    SyncedEmailListResponse,
    SyncedEmailResponse,
    SyncedEventListResponse,
    SyncedEventResponse,
    SyncJobStatusResponse,
)
from aexy.services.oauth_token_service import (
    RefreshTokenRevokedError,
    ensure_valid_google_token,
)
from aexy.services.gmail_exclusion_governance import (
    ACTION_MESSAGE_HIDDEN,
    ACTION_RULE_CREATED,
    ACTION_RULE_DELETED,
    ACTION_VIEWED,
    GmailExclusionGovernance,
)
from aexy.services.gmail_sync_exclusions import (
    ExclusionValueError,
    GmailSyncExclusionService,
    address_of,
)
from aexy.services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/integrations/google",
    tags=["Google Integration"],
)

# Separate router for static OAuth callback (no workspace_id in path)
callback_router = APIRouter(
    prefix="/integrations/google",
    tags=["Google Integration"],
)

# Google OAuth configuration
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

# Scopes for Gmail and Calendar
GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
]


async def verify_workspace_access(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "viewer",
) -> WorkspaceService:
    """Verify the user has access to the workspace."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(workspace_id, str(current_user.id), required_role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{required_role.capitalize()} permission required",
        )

    return workspace_service


async def list_integrations(
    workspace_id: str, db: AsyncSession
) -> list[GoogleIntegration]:
    """Every Google account connected to this workspace, oldest first.

    Oldest first so "the workspace's account" means the same thing from one
    request to the next. Ordering by `created_at` alone is not enough — rows
    written in the same transaction can share a timestamp — so `id` breaks the
    tie and keeps the answer stable.
    """
    result = await db.execute(
        select(GoogleIntegration)
        .where(GoogleIntegration.workspace_id == workspace_id)
        .order_by(GoogleIntegration.created_at.asc(), GoogleIntegration.id.asc())
    )
    return list(result.scalars().all())


async def get_integration(
    workspace_id: str,
    db: AsyncSession,
    required: bool = True,
    integration_id: str | None = None,
    prefer_developer_id: str | None = None,
) -> GoogleIntegration | None:
    """The Google account a request means.

    A workspace can hold several. This used to end in `scalar_one_or_none()`,
    which raises `MultipleResultsFound` the moment a second row exists — so it
    had to be replaced before the unique constraint was dropped, not after.

    Resolution order, and the reason for each:

    * ``integration_id`` — the caller named one. Checked against the workspace,
      so an id from somewhere else is a 404 rather than another tenant's mailbox.
    * ``prefer_developer_id`` — the caller's own account, when they have one.
      Somebody who has connected their mailbox means *theirs* by default; the
      alternative is quietly acting on a colleague's inbox.
    * the oldest — the answer a single-account workspace has always given, so
      nothing changes for the workspaces that have one.
    """
    if integration_id is not None:
        integration = (
            await db.execute(
                select(GoogleIntegration).where(
                    GoogleIntegration.id == integration_id,
                    GoogleIntegration.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if required and not integration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Google account not found in this workspace",
            )
        return integration

    integrations = await list_integrations(workspace_id, db)

    integration = None
    if prefer_developer_id is not None:
        integration = next(
            (
                i
                for i in integrations
                if i.connected_by_id
                and str(i.connected_by_id) == str(prefer_developer_id)
            ),
            None,
        )
    if integration is None:
        integration = integrations[0] if integrations else None

    if required and not integration:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Google integration not connected",
        )

    return integration


# =============================================================================
# Connection Endpoints
# =============================================================================


@router.get("/connect", response_model=GoogleIntegrationConnectResponse)
async def get_connect_url(
    workspace_id: str,
    redirect_url: str = Query(None, description="Custom redirect URL after OAuth"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get Google OAuth authorization URL for Gmail and Calendar integration.

    Any member may connect, because what this connects is their own mailbox.
    The state carries `current_user.id` and the callback records the account
    under whoever signed in on Google's screen — so a member cannot reach
    anybody else's mail with it, whatever address they type there.

    Requiring admin here meant a new joiner could not put their own inbox on
    the Service Desk at all: an admin had to sit at Google's sign-in screen as
    them, which asks for a password nobody should be sharing. Removing another
    person's account is still admin-only, and that asymmetry is the point —
    connecting affects yourself, disconnecting affects somebody else.
    """
    await verify_workspace_access(workspace_id, current_user, db, "member")

    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google integration is not configured",
        )

    # Build state parameter with workspace and developer info
    state = f"{workspace_id}:{current_user.id}:{redirect_url or ''}"

    # Build OAuth URL - use static callback URL (workspace_id is in state)
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(GOOGLE_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }

    auth_url = f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"

    return GoogleIntegrationConnectResponse(auth_url=auth_url)


@router.post("/connect-from-developer", response_model=GoogleIntegrationStatusResponse)
async def connect_from_developer_google(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create workspace Google integration from developer's existing Google connection.

    This allows users who connected Google during the main onboarding to use
    those credentials for the workspace CRM integration without re-authenticating.

    Member-level for the same reason as `/connect`: every token it reads comes
    from `current_user`'s own `GoogleConnection`, so this can only ever attach
    the caller's own mailbox.
    """
    await verify_workspace_access(workspace_id, current_user, db, "member")

    # Check if developer has a Google connection
    dev_conn_result = await db.execute(
        select(GoogleConnection).where(GoogleConnection.developer_id == str(current_user.id))
    )
    dev_connection = dev_conn_result.scalar_one_or_none()

    if not dev_connection:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No Google connection found for your account. Please connect Google first.",
        )

    # Required scopes for Gmail and Calendar sync
    required_scopes = {
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/calendar",
    }

    # Check if the developer's connection has the required scopes
    granted_scopes = set(dev_connection.scopes or [])
    missing_scopes = required_scopes - granted_scopes

    if missing_scopes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your Google connection doesn't have Gmail/Calendar permissions. Please reconnect Google with full permissions.",
        )

    # Refresh the developer's token if it's expired/near-expiry so the
    # workspace integration starts with a live access_token. If the refresh
    # token has been revoked, tell the user to reconnect.
    try:
        await ensure_valid_google_token(db, dev_connection)
    except RefreshTokenRevokedError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your Google connection has expired. Please reconnect Google.",
        )

    # Match on the *address*, not the workspace. Matching on the workspace is
    # what made this overwrite: the second person to connect took over the
    # first person's row, and their mailbox stopped syncing without anyone
    # being told. Reconnecting your own account still updates it in place.
    existing_result = await db.execute(
        select(GoogleIntegration).where(
            GoogleIntegration.workspace_id == workspace_id,
            func.lower(GoogleIntegration.google_email)
            == (dev_connection.google_email or "").lower(),
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        # Update existing integration with latest tokens from developer
        # This ensures tokens are refreshed when user reconnects Google
        existing.connected_by_id = str(current_user.id)
        existing.access_token = dev_connection.access_token
        existing.refresh_token = dev_connection.refresh_token
        existing.token_expiry = dev_connection.token_expires_at
        existing.google_email = dev_connection.google_email
        existing.google_user_id = dev_connection.google_id
        existing.granted_scopes = dev_connection.scopes or []
        existing.gmail_sync_enabled = True
        existing.calendar_sync_enabled = True
        existing.is_active = True
        existing.last_error = None
    else:
        # Create new workspace integration
        integration = GoogleIntegration(
            id=str(uuid4()),
            workspace_id=workspace_id,
            connected_by_id=str(current_user.id),
            access_token=dev_connection.access_token,
            refresh_token=dev_connection.refresh_token,
            token_expiry=dev_connection.token_expires_at,
            google_email=dev_connection.google_email,
            google_user_id=dev_connection.google_id,
            granted_scopes=dev_connection.scopes or [],
            gmail_sync_enabled=True,
            calendar_sync_enabled=True,
            is_active=True,
        )
        db.add(integration)

    await db.commit()

    return await get_status(workspace_id, current_user, db)


@router.get("/callback")
async def oauth_callback(
    workspace_id: str,
    code: str = Query(...),
    state: str = Query(...),
    error: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Handle Google OAuth callback.

    This endpoint is called by Google after user authorization.
    Redirects to frontend with success/error status.
    """
    import httpx

    settings = get_settings()
    frontend_url = settings.frontend_url

    # Parse state
    state_parts = state.split(":")
    expected_workspace_id = state_parts[0] if len(state_parts) > 0 else ""
    developer_id = state_parts[1] if len(state_parts) > 1 else ""
    custom_redirect = state_parts[2] if len(state_parts) > 2 else ""

    if error:
        redirect = custom_redirect or f"{frontend_url}/settings/crm/integrations"
        return RedirectResponse(
            url=f"{redirect}?google=error&message={urllib.parse.quote(error)}",
            status_code=status.HTTP_302_FOUND,
        )

    if expected_workspace_id != workspace_id:
        redirect = custom_redirect or f"{frontend_url}/settings/crm/integrations"
        return RedirectResponse(
            url=f"{redirect}?google=error&message=Invalid+state",
            status_code=status.HTTP_302_FOUND,
        )

    try:
        # Exchange code for tokens
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": f"{settings.backend_url}/api/v1/workspaces/{workspace_id}/integrations/google/callback",
                },
            )

            if response.status_code != 200:
                logger.error(f"Token exchange failed: {response.text}")
                redirect = custom_redirect or f"{frontend_url}/settings/crm/integrations"
                return RedirectResponse(
                    url=f"{redirect}?google=error&message=Token+exchange+failed",
                    status_code=status.HTTP_302_FOUND,
                )

            token_data = response.json()

        # Get user info
        async with httpx.AsyncClient() as client:
            response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {token_data['access_token']}"},
            )
            user_info = response.json() if response.status_code == 200 else {}

        # Create or update the integration *for this address*. Keyed on the
        # workspace, a second person completing OAuth took over the first
        # person's row and silently stopped their mailbox syncing.
        result = await db.execute(
            select(GoogleIntegration).where(
                GoogleIntegration.workspace_id == workspace_id,
                func.lower(GoogleIntegration.google_email)
                == (user_info.get("email") or "").lower(),
            )
        )
        integration = result.scalar_one_or_none()

        token_expiry = datetime.now(timezone.utc)
        if "expires_in" in token_data:
            from datetime import timedelta
            token_expiry = datetime.now(timezone.utc) + timedelta(seconds=token_data["expires_in"])

        if integration:
            # Update existing
            integration.access_token = token_data["access_token"]
            integration.refresh_token = token_data.get("refresh_token", integration.refresh_token)
            integration.token_expiry = token_expiry
            integration.google_email = user_info.get("email", integration.google_email)
            integration.google_user_id = user_info.get("id")
            integration.granted_scopes = token_data.get("scope", "").split()
            integration.is_active = True
            integration.last_error = None
        else:
            # Create new
            integration = GoogleIntegration(
                id=str(uuid4()),
                workspace_id=workspace_id,
                connected_by_id=developer_id if developer_id else None,
                access_token=token_data["access_token"],
                refresh_token=token_data.get("refresh_token"),
                token_expiry=token_expiry,
                google_email=user_info.get("email"),
                google_user_id=user_info.get("id"),
                granted_scopes=token_data.get("scope", "").split(),
                gmail_sync_enabled=True,
                calendar_sync_enabled=True,
                is_active=True,
            )
            db.add(integration)

        await db.commit()

        redirect = custom_redirect or f"{frontend_url}/settings/crm/integrations"
        return RedirectResponse(
            url=f"{redirect}?google=connected",
            status_code=status.HTTP_302_FOUND,
        )

    except Exception as e:
        logger.exception(f"OAuth callback error: {e}")
        redirect = custom_redirect or f"{frontend_url}/settings/crm/integrations"
        return RedirectResponse(
            url=f"{redirect}?google=error&message={urllib.parse.quote(str(e))}",
            status_code=status.HTTP_302_FOUND,
        )


@callback_router.get("/callback")
async def google_oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    error: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Handle Google OAuth callback (static URL).

    This is the main callback endpoint for Google OAuth.
    Workspace ID is extracted from the state parameter.
    """
    import httpx

    settings = get_settings()
    frontend_url = settings.frontend_url

    # Parse state: workspace_id:developer_id:custom_redirect
    state_parts = state.split(":")
    workspace_id = state_parts[0] if len(state_parts) > 0 else ""
    developer_id = state_parts[1] if len(state_parts) > 1 else ""
    custom_redirect = ":".join(state_parts[2:]) if len(state_parts) > 2 else ""

    # Helper to build redirect URL with proper query param separator
    def build_redirect_url(base_url: str, params: str) -> str:
        separator = "&" if "?" in base_url else "?"
        return f"{base_url}{separator}{params}"

    if error:
        redirect = custom_redirect or f"{frontend_url}/settings/crm/integrations"
        return RedirectResponse(
            url=build_redirect_url(redirect, f"google=error&message={urllib.parse.quote(error)}"),
            status_code=status.HTTP_302_FOUND,
        )

    if not workspace_id:
        redirect = custom_redirect or f"{frontend_url}/settings/crm/integrations"
        return RedirectResponse(
            url=build_redirect_url(redirect, "google=error&message=Invalid+state"),
            status_code=status.HTTP_302_FOUND,
        )

    try:
        # Exchange code for tokens
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": settings.google_redirect_uri,
                },
            )

            if response.status_code != 200:
                logger.error(f"Token exchange failed: {response.text}")
                redirect = custom_redirect or f"{frontend_url}/settings/crm/integrations"
                return RedirectResponse(
                    url=build_redirect_url(redirect, "google=error&message=Token+exchange+failed"),
                    status_code=status.HTTP_302_FOUND,
                )

            token_data = response.json()

        # Get user info
        async with httpx.AsyncClient() as client:
            response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {token_data['access_token']}"},
            )
            user_info = response.json() if response.status_code == 200 else {}

        # Create or update the integration *for this address*. Keyed on the
        # workspace, a second person completing OAuth took over the first
        # person's row and silently stopped their mailbox syncing.
        result = await db.execute(
            select(GoogleIntegration).where(
                GoogleIntegration.workspace_id == workspace_id,
                func.lower(GoogleIntegration.google_email)
                == (user_info.get("email") or "").lower(),
            )
        )
        integration = result.scalar_one_or_none()

        token_expiry = datetime.now(timezone.utc)
        if "expires_in" in token_data:
            from datetime import timedelta
            token_expiry = datetime.now(timezone.utc) + timedelta(seconds=token_data["expires_in"])

        if integration:
            # Update existing
            integration.access_token = token_data["access_token"]
            integration.refresh_token = token_data.get("refresh_token", integration.refresh_token)
            integration.token_expiry = token_expiry
            integration.google_email = user_info.get("email", integration.google_email)
            integration.google_user_id = user_info.get("id")
            integration.granted_scopes = token_data.get("scope", "").split()
            integration.is_active = True
            integration.last_error = None
        else:
            # Create new
            integration = GoogleIntegration(
                id=str(uuid4()),
                workspace_id=workspace_id,
                connected_by_id=developer_id if developer_id else None,
                access_token=token_data["access_token"],
                refresh_token=token_data.get("refresh_token"),
                token_expiry=token_expiry,
                google_email=user_info.get("email"),
                google_user_id=user_info.get("id"),
                granted_scopes=token_data.get("scope", "").split(),
                gmail_sync_enabled=True,
                calendar_sync_enabled=True,
                is_active=True,
            )
            db.add(integration)

        await db.commit()

        redirect = custom_redirect or f"{frontend_url}/settings/crm/integrations"
        return RedirectResponse(
            url=build_redirect_url(redirect, "google=connected"),
            status_code=status.HTTP_302_FOUND,
        )

    except Exception as e:
        logger.exception(f"OAuth callback error: {e}")
        redirect = custom_redirect or f"{frontend_url}/settings/crm/integrations"
        return RedirectResponse(
            url=build_redirect_url(redirect, f"google=error&message={urllib.parse.quote(str(e))}"),
            status_code=status.HTTP_302_FOUND,
        )


@router.get("/status", response_model=GoogleIntegrationStatusResponse)
async def get_status(
    workspace_id: str,
    integration_id: str | None = Query(
        None, description="Which connected Google account. Defaults to your own."
    ),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get Google integration status for one connected Google account.

    Every figure below — message counts, last-sync times, the enable toggles —
    belongs to a single account, so with several connected this has to be told
    which. Omitted, it means "mine, else the oldest", which is what a
    single-account workspace has always returned.
    """
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    integration = await get_integration(
        workspace_id,
        db,
        required=False,
        integration_id=integration_id,
        prefer_developer_id=str(current_user.id),
    )

    if not integration:
        return GoogleIntegrationStatusResponse(
            is_connected=False,
            google_email=None,
        )

    # Get sync cursor for message count
    cursor_result = await db.execute(
        select(EmailSyncCursor).where(EmailSyncCursor.integration_id == integration.id)
    )
    cursor = cursor_result.scalar_one_or_none()

    # Get event count
    events_result = await db.execute(
        select(func.count(SyncedCalendarEvent.id)).where(
            SyncedCalendarEvent.integration_id == integration.id
        )
    )
    events_count = events_result.scalar() or 0

    return GoogleIntegrationStatusResponse(
        is_connected=integration.is_active,
        google_email=integration.google_email,
        gmail_sync_enabled=integration.gmail_sync_enabled,
        calendar_sync_enabled=integration.calendar_sync_enabled,
        auto_sync_interval_minutes=integration.auto_sync_interval_minutes,
        auto_sync_calendar_interval_minutes=integration.auto_sync_calendar_interval_minutes,
        gmail_last_sync_at=integration.gmail_last_sync_at,
        calendar_last_sync_at=integration.calendar_last_sync_at,
        messages_synced=cursor.messages_synced if cursor else 0,
        events_synced=events_count,
        last_error=integration.last_error,
        granted_scopes=integration.granted_scopes or [],
        sync_settings=integration.sync_settings,
    )


@router.patch("/settings", response_model=GoogleIntegrationStatusResponse)
async def update_settings(
    workspace_id: str,
    data: GoogleIntegrationSettingsUpdate,
    integration_id: str | None = Query(
        None, description="Which connected Google account. Defaults to your own."
    ),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update settings on one connected Google account.

    Your own account, or admin for anybody else's — the same rule as
    exclusions. Flat admin-only made no sense once a member could connect their
    own mailbox: they would have been unable to turn sync off on the inbox they
    had just attached, while still being able to disconnect it outright.
    """
    await verify_workspace_access(workspace_id, current_user, db, "member")

    integration = await get_integration(
        workspace_id,
        db,
        integration_id=integration_id,
        prefer_developer_id=str(current_user.id),
    )

    if str(integration.connected_by_id or "") != str(current_user.id):
        await verify_workspace_access(workspace_id, current_user, db, "admin")

    if data.gmail_sync_enabled is not None:
        integration.gmail_sync_enabled = data.gmail_sync_enabled
    if data.calendar_sync_enabled is not None:
        integration.calendar_sync_enabled = data.calendar_sync_enabled
    if data.auto_sync_interval_minutes is not None:
        # Validate: must be 0 (disabled) or >= 1 minute
        if data.auto_sync_interval_minutes < 0:
            raise HTTPException(status_code=400, detail="Auto-sync interval must be 0 or positive")
        integration.auto_sync_interval_minutes = data.auto_sync_interval_minutes
    if data.auto_sync_calendar_interval_minutes is not None:
        # Validate: must be 0 (disabled) or >= 1 minute
        if data.auto_sync_calendar_interval_minutes < 0:
            raise HTTPException(status_code=400, detail="Calendar auto-sync interval must be 0 or positive")
        integration.auto_sync_calendar_interval_minutes = data.auto_sync_calendar_interval_minutes
    if data.sync_settings is not None:
        integration.sync_settings = data.sync_settings

    await db.commit()

    return await get_status(workspace_id, current_user, db)


@router.post("/disconnect", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect the workspace's Google account.

    Unambiguous only while there is one. This used to resolve "the" integration
    through `get_integration`, which returns the caller's own account or else
    the oldest — so once a workspace held several it deleted one arbitrary
    person's connection under a name that promises something workspace-wide,
    and the owner would find out when their mailbox stopped syncing.

    Deleting all of them instead would be a different arbitrary: an admin
    clicking one button should not unplug three colleagues who are not
    mentioned anywhere in the request.

    So it refuses to guess. One account, and it goes; several, and the caller
    has to name which via `DELETE /accounts/{integration_id}` — which also
    checks ownership and refuses while a Service Desk mailbox reads it.
    """
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    integrations = await list_integrations(workspace_id, db)
    if not integrations:
        return
    if len(integrations) > 1:
        connected = ", ".join(sorted(i.google_email for i in integrations))
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This workspace has {len(integrations)} Google accounts "
                f"({connected}). Disconnect them one at a time so it is clear "
                "whose mailbox stops syncing."
            ),
        )

    await db.delete(integrations[0])
    await db.commit()


# =============================================================================
# Gmail Endpoints
# =============================================================================


@router.post("/gmail/sync", response_model=GmailSyncResponse)
async def trigger_gmail_sync(
    workspace_id: str,
    data: GmailSyncRequest,
    integration_id: str | None = Query(
        None, description="Which connected Google account to sync. Defaults to your own."
    ),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Trigger Gmail sync for one connected account (async via Temporal).

    Returns immediately with a job_id for polling progress.
    """
    await verify_workspace_access(workspace_id, current_user, db, "member")

    integration = await get_integration(
        workspace_id,
        db,
        integration_id=integration_id,
        prefer_developer_id=str(current_user.id),
    )

    if str(integration.connected_by_id or "") != str(current_user.id):
        await verify_workspace_access(workspace_id, current_user, db, "admin")

    if not integration.gmail_sync_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Gmail sync is not enabled",
        )

    # Already running *for this account*. Without the integration filter, a sync
    # on one mailbox reported another mailbox's job as its own and then returned
    # early — so the account the caller actually asked for never synced, and the
    # job id they got back belonged to somebody else's inbox.
    existing_job_result = await db.execute(
        select(GoogleSyncJob).where(
            GoogleSyncJob.workspace_id == workspace_id,
            GoogleSyncJob.integration_id == integration.id,
            GoogleSyncJob.job_type == "gmail",
            GoogleSyncJob.status.in_(["pending", "running"]),
        )
    )
    existing_job = existing_job_result.scalar_one_or_none()

    if existing_job:
        # Return the existing job status
        return GmailSyncResponse(
            status=existing_job.status,
            job_id=existing_job.id,
            messages_synced=existing_job.processed_items,
        )

    # Create a new sync job
    job = GoogleSyncJob(
        id=str(uuid4()),
        workspace_id=workspace_id,
        integration_id=integration.id,
        job_type="gmail",
        status="pending",
        progress_message="Queued for sync...",
    )
    db.add(job)
    await db.commit()

    # Dispatch to Temporal
    from aexy.temporal.client import get_temporal_client
    from aexy.temporal.workflows.sync import SyncGmailWorkflow, SyncGmailWorkflowInput

    client = await get_temporal_client()
    handle = await client.start_workflow(
        SyncGmailWorkflow.run,
        SyncGmailWorkflowInput(
            job_id=job.id,
            workspace_id=workspace_id,
            integration_id=integration.id,
            max_messages=data.max_messages,
        ),
        id=f"sync-gmail-{job.id}",
        task_queue="sync",
    )

    # Update job with Temporal workflow ID
    job.workflow_run_id = handle.id
    await db.commit()

    return GmailSyncResponse(
        status="pending",
        job_id=job.id,
        messages_synced=0,
    )


@router.get("/sync-jobs/{job_id}", response_model=SyncJobStatusResponse)
async def get_sync_job_status(
    workspace_id: str,
    job_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get the status of a sync job.

    Use this to poll for progress on async Gmail/Calendar sync operations.
    """
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    result = await db.execute(
        select(GoogleSyncJob).where(
            GoogleSyncJob.id == job_id,
            GoogleSyncJob.workspace_id == workspace_id,
        )
    )
    job = result.scalar_one_or_none()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sync job not found",
        )

    return SyncJobStatusResponse(
        job_id=job.id,
        job_type=job.job_type,
        status=job.status,
        processed_items=job.processed_items,
        total_items=job.total_items,
        progress_message=job.progress_message,
        result=job.result,
        error=job.error,
        started_at=job.started_at,
        completed_at=job.completed_at,
        created_at=job.created_at,
    )


@router.get("/gmail/emails", response_model=SyncedEmailListResponse)
async def list_emails(
    workspace_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: str = Query(None, description="Search in subject and snippet"),
    from_email: str = Query(None, description="Filter by sender email"),
    thread_id: str = Query(None, description="Filter by thread ID"),
    unread_only: bool = Query(False),
    integration_id: str = Query(None, description="Only mail from this connected account"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List synced emails with filtering and pagination.

    Workspace-wide by default, which is what it has always been — synced mail
    is shared with the workspace, and that is the bargain the exclusion rules
    exist to make acceptable. `integration_id` narrows it to one account, so a
    workspace syncing several mailboxes can show them apart rather than as one
    undifferentiated pile.
    """
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    query = select(SyncedEmail).where(SyncedEmail.workspace_id == workspace_id)

    if integration_id:
        query = query.where(SyncedEmail.integration_id == integration_id)

    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            (SyncedEmail.subject.ilike(search_pattern))
            | (SyncedEmail.snippet.ilike(search_pattern))
        )

    if from_email:
        query = query.where(SyncedEmail.from_email == from_email)

    if thread_id:
        query = query.where(SyncedEmail.gmail_thread_id == thread_id)

    if unread_only:
        query = query.where(SyncedEmail.is_read == False)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Get paginated results
    query = query.order_by(SyncedEmail.gmail_date.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query.options(selectinload(SyncedEmail.record_links)))
    emails = result.scalars().all()

    return SyncedEmailListResponse(
        emails=[
            SyncedEmailResponse(
                id=e.id,
                gmail_id=e.gmail_id,
                gmail_thread_id=e.gmail_thread_id,
                subject=e.subject,
                from_email=e.from_email,
                from_name=e.from_name,
                to_emails=[EmailRecipient(**r) for r in (e.to_emails or [])],
                cc_emails=[EmailRecipient(**r) for r in (e.cc_emails or [])],
                snippet=e.snippet,
                labels=e.labels or [],
                is_read=e.is_read,
                is_starred=e.is_starred,
                has_attachments=e.has_attachments,
                gmail_date=e.gmail_date,
                linked_records=[
                    {"record_id": link.record_id, "link_type": link.link_type}
                    for link in e.record_links
                ],
                ai_summary=e.ai_summary,
                created_at=e.created_at,
            )
            for e in emails
        ],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/gmail/emails/{email_id}", response_model=SyncedEmailResponse)
async def get_email(
    workspace_id: str,
    email_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific synced email with full body."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    result = await db.execute(
        select(SyncedEmail)
        .where(SyncedEmail.id == email_id, SyncedEmail.workspace_id == workspace_id)
        .options(selectinload(SyncedEmail.record_links))
    )
    email = result.scalar_one_or_none()

    if not email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email not found")

    return SyncedEmailResponse(
        id=email.id,
        gmail_id=email.gmail_id,
        gmail_thread_id=email.gmail_thread_id,
        subject=email.subject,
        from_email=email.from_email,
        from_name=email.from_name,
        to_emails=[EmailRecipient(**r) for r in (email.to_emails or [])],
        cc_emails=[EmailRecipient(**r) for r in (email.cc_emails or [])],
        snippet=email.snippet,
        body_text=email.body_text,
        body_html=email.body_html,
        labels=email.labels or [],
        is_read=email.is_read,
        is_starred=email.is_starred,
        has_attachments=email.has_attachments,
        gmail_date=email.gmail_date,
        linked_records=[
            {"record_id": link.record_id, "link_type": link.link_type}
            for link in email.record_links
        ],
        ai_summary=email.ai_summary,
        created_at=email.created_at,
    )


@router.post("/gmail/send", response_model=EmailSendResponse)
async def send_email(
    workspace_id: str,
    data: EmailSendRequest,
    integration_id: str | None = Query(
        None, description="Which connected Google account to send from. Defaults to your own."
    ),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Send an email via Gmail, from one connected account.

    Defaults to the caller's own account rather than the workspace's oldest,
    so somebody with a mailbox connected sends as themselves instead of
    silently sending as whoever connected first.

    Still member-level even when it resolves to somebody else's account: a
    shared desk address connected by an admin is exactly what the CRM send
    flows use, and gating that on ownership would stop members mailing
    customers at all.
    """
    await verify_workspace_access(workspace_id, current_user, db, "member")

    integration = await get_integration(
        workspace_id,
        db,
        integration_id=integration_id,
        prefer_developer_id=str(current_user.id),
    )

    from aexy.services.gmail_sync_service import GmailSyncService, GmailSyncError

    service = GmailSyncService(db)

    try:
        result = await service.send_email(
            integration=integration,
            to=data.to,
            subject=data.subject,
            body_html=data.body_html,
            reply_to_message_id=data.reply_to_message_id,
        )

        return EmailSendResponse(
            message_id=result["message_id"],
            thread_id=result.get("thread_id"),
        )

    except GmailSyncError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/gmail/emails/{email_id}/link")
async def link_email_to_record(
    workspace_id: str,
    email_id: str,
    data: EmailLinkRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Link an email to a CRM record."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    # Verify email exists
    email_result = await db.execute(
        select(SyncedEmail).where(
            SyncedEmail.id == email_id, SyncedEmail.workspace_id == workspace_id
        )
    )
    email = email_result.scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email not found")

    # The CRM record must also belong to this workspace, otherwise an A-member
    # can stitch their email to a record in workspace B.
    from aexy.models.crm import CRMRecord
    record_check = await db.execute(
        select(CRMRecord.id).where(
            CRMRecord.id == data.record_id,
            CRMRecord.workspace_id == workspace_id,
        )
    )
    if record_check.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Record not found")

    # Check if link already exists
    existing = await db.execute(
        select(SyncedEmailRecordLink).where(
            SyncedEmailRecordLink.email_id == email_id,
            SyncedEmailRecordLink.record_id == data.record_id,
        )
    )
    if existing.scalar_one_or_none():
        return {"status": "already_linked"}

    # Create link
    link = SyncedEmailRecordLink(
        id=str(uuid4()),
        email_id=email_id,
        record_id=data.record_id,
        link_type=data.link_type,
        is_manual=True,
        confidence=1.0,
    )
    db.add(link)
    await db.commit()

    return {"status": "linked", "link_id": link.id}


# =============================================================================
# Calendar Endpoints
# =============================================================================


@router.get("/calendar/calendars", response_model=CalendarListResponse)
async def list_calendars(
    workspace_id: str,
    integration_id: str | None = Query(
        None, description="Which connected Google account. Defaults to your own."
    ),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List available Google Calendars on one connected account."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    integration = await get_integration(
        workspace_id,
        db,
        integration_id=integration_id,
        prefer_developer_id=str(current_user.id),
    )

    from aexy.services.calendar_sync_service import CalendarSyncService, CalendarSyncError

    service = CalendarSyncService(db)

    try:
        calendars = await service.list_calendars(integration)

        return CalendarListResponse(
            calendars=[
                CalendarInfo(
                    id=cal["id"],
                    name=cal["summary"],
                    description=cal.get("description"),
                    is_primary=cal.get("primary", False),
                    access_role=cal.get("accessRole"),
                    color=cal.get("backgroundColor"),
                )
                for cal in calendars
            ]
        )

    except CalendarSyncError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/calendar/sync", response_model=CalendarSyncResponse)
async def trigger_calendar_sync(
    workspace_id: str,
    data: CalendarSyncRequest,
    integration_id: str | None = Query(
        None, description="Which connected Google account to sync. Defaults to your own."
    ),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Trigger calendar sync for one connected account (async via Temporal).

    Returns immediately with a job_id for polling progress.
    """
    await verify_workspace_access(workspace_id, current_user, db, "member")

    integration = await get_integration(
        workspace_id,
        db,
        integration_id=integration_id,
        prefer_developer_id=str(current_user.id),
    )

    if str(integration.connected_by_id or "") != str(current_user.id):
        await verify_workspace_access(workspace_id, current_user, db, "admin")

    if not integration.calendar_sync_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Calendar sync is not enabled",
        )

    # Scoped to this account for the same reason as the Gmail job above.
    existing_job_result = await db.execute(
        select(GoogleSyncJob).where(
            GoogleSyncJob.workspace_id == workspace_id,
            GoogleSyncJob.integration_id == integration.id,
            GoogleSyncJob.job_type == "calendar",
            GoogleSyncJob.status.in_(["pending", "running"]),
        )
    )
    existing_job = existing_job_result.scalar_one_or_none()

    if existing_job:
        # Return the existing job status
        return CalendarSyncResponse(
            status=existing_job.status,
            job_id=existing_job.id,
            events_synced=existing_job.processed_items,
        )

    # Create a new sync job
    job = GoogleSyncJob(
        id=str(uuid4()),
        workspace_id=workspace_id,
        integration_id=integration.id,
        job_type="calendar",
        status="pending",
        progress_message="Queued for sync...",
    )
    db.add(job)
    await db.commit()

    # Dispatch to Temporal
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    from aexy.temporal.activities.google_sync import SyncCalendarInput

    wf_id = await dispatch(
        "sync_calendar",
        SyncCalendarInput(
            job_id=job.id,
            workspace_id=workspace_id,
            integration_id=integration.id,
            calendar_ids=data.calendar_ids,
        ),
        task_queue=TaskQueue.SYNC,
        workflow_id=f"sync-calendar-{job.id}",
    )

    # Update job with Temporal workflow ID
    job.workflow_run_id = wf_id
    await db.commit()

    return CalendarSyncResponse(
        status="pending",
        job_id=job.id,
        events_synced=0,
    )


@router.get("/calendar/events", response_model=SyncedEventListResponse)
async def list_events(
    workspace_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    start_after: datetime = Query(None, description="Filter events starting after this time"),
    start_before: datetime = Query(None, description="Filter events starting before this time"),
    calendar_id: str = Query(None, description="Filter by calendar ID"),
    integration_id: str = Query(None, description="Only events from this connected account"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List synced calendar events with filtering and pagination.

    Workspace-wide by default; `integration_id` narrows it to one account, as
    with the mail list above.
    """
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    query = select(SyncedCalendarEvent).where(SyncedCalendarEvent.workspace_id == workspace_id)

    if integration_id:
        query = query.where(SyncedCalendarEvent.integration_id == integration_id)

    if start_after:
        query = query.where(SyncedCalendarEvent.start_time >= start_after)

    if start_before:
        query = query.where(SyncedCalendarEvent.start_time <= start_before)

    if calendar_id:
        query = query.where(SyncedCalendarEvent.google_calendar_id == calendar_id)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Get paginated results
    query = query.order_by(SyncedCalendarEvent.start_time.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query.options(selectinload(SyncedCalendarEvent.record_links)))
    events = result.scalars().all()

    return SyncedEventListResponse(
        events=[
            SyncedEventResponse(
                id=e.id,
                google_event_id=e.google_event_id,
                google_calendar_id=e.google_calendar_id,
                title=e.title,
                description=e.description,
                location=e.location,
                start_time=e.start_time,
                end_time=e.end_time,
                is_all_day=e.is_all_day,
                timezone=e.timezone,
                attendees=[EventAttendee(**a) for a in (e.attendees or [])],
                organizer_email=e.organizer_email,
                status=e.status,
                html_link=e.html_link,
                conference_data=e.conference_data,
                linked_records=[
                    {"record_id": link.record_id, "link_type": link.link_type}
                    for link in e.record_links
                ],
                crm_activity_id=e.crm_activity_id,
                created_at=e.created_at,
            )
            for e in events
        ],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/calendar/events/{event_id}", response_model=SyncedEventResponse)
async def get_event(
    workspace_id: str,
    event_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific synced calendar event."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    result = await db.execute(
        select(SyncedCalendarEvent)
        .where(SyncedCalendarEvent.id == event_id, SyncedCalendarEvent.workspace_id == workspace_id)
        .options(selectinload(SyncedCalendarEvent.record_links))
    )
    event = result.scalar_one_or_none()

    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    return SyncedEventResponse(
        id=event.id,
        google_event_id=event.google_event_id,
        google_calendar_id=event.google_calendar_id,
        title=event.title,
        description=event.description,
        location=event.location,
        start_time=event.start_time,
        end_time=event.end_time,
        is_all_day=event.is_all_day,
        timezone=event.timezone,
        attendees=[EventAttendee(**a) for a in (event.attendees or [])],
        organizer_email=event.organizer_email,
        status=event.status,
        html_link=event.html_link,
        conference_data=event.conference_data,
        linked_records=[
            {"record_id": link.record_id, "link_type": link.link_type}
            for link in event.record_links
        ],
        crm_activity_id=event.crm_activity_id,
        created_at=event.created_at,
    )


@router.post("/calendar/events", response_model=EventCreateResponse)
async def create_event(
    workspace_id: str,
    data: EventCreateRequest,
    integration_id: str | None = Query(
        None, description="Which connected Google account owns the event. Defaults to your own."
    ),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new calendar event on one connected account.

    Member-level for the same reason as `/gmail/send`.
    """
    await verify_workspace_access(workspace_id, current_user, db, "member")

    integration = await get_integration(
        workspace_id,
        db,
        integration_id=integration_id,
        prefer_developer_id=str(current_user.id),
    )

    from aexy.services.calendar_sync_service import CalendarSyncService, CalendarSyncError

    service = CalendarSyncService(db)

    try:
        result = await service.create_event(
            integration=integration,
            calendar_id=data.calendar_id,
            event_data={
                "summary": data.title,
                "description": data.description,
                "location": data.location,
                "start": {"dateTime": data.start_time.isoformat(), "timeZone": "UTC"},
                "end": {"dateTime": data.end_time.isoformat(), "timeZone": "UTC"},
                "attendees": [{"email": e} for e in data.attendee_emails],
            },
        )

        await db.commit()

        return EventCreateResponse(
            event_id=result.get("id", ""),
            google_event_id=result.get("google_event_id", ""),
            html_link=result.get("html_link"),
        )

    except CalendarSyncError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/calendar/events/{event_id}/link")
async def link_event_to_record(
    workspace_id: str,
    event_id: str,
    data: EventLinkRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Link a calendar event to a CRM record."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    # Verify event exists
    event_result = await db.execute(
        select(SyncedCalendarEvent).where(
            SyncedCalendarEvent.id == event_id, SyncedCalendarEvent.workspace_id == workspace_id
        )
    )
    event = event_result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    # Check if link already exists
    existing = await db.execute(
        select(SyncedCalendarEventRecordLink).where(
            SyncedCalendarEventRecordLink.event_id == event_id,
            SyncedCalendarEventRecordLink.record_id == data.record_id,
        )
    )
    if existing.scalar_one_or_none():
        return {"status": "already_linked"}

    # Create link
    link = SyncedCalendarEventRecordLink(
        id=str(uuid4()),
        event_id=event_id,
        record_id=data.record_id,
        link_type=data.link_type,
        is_manual=True,
        confidence=1.0,
    )
    db.add(link)
    await db.commit()

    return {"status": "linked", "link_id": link.id}


# =============================================================================
# Contact Enrichment Endpoints
# =============================================================================


@router.post("/enrich", response_model=ContactEnrichResponse)
async def enrich_contacts(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
    data: ContactEnrichRequest = Body(default=ContactEnrichRequest()),
):
    """Process emails to extract and enrich contacts."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    from aexy.services.contact_enrichment_service import ContactEnrichmentService

    service = ContactEnrichmentService(db)

    result = await service.process_new_emails(
        workspace_id=workspace_id,
        email_ids=data.email_ids,
        auto_create_contacts=data.auto_create_contacts,
        enrich_existing=data.enrich_existing,
    )

    await db.commit()

    return ContactEnrichResponse(**result)


@router.post("/records/{record_id}/enrich", response_model=RecordEnrichResponse)
async def enrich_record(
    workspace_id: str,
    record_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Enrich a specific CRM record with data from linked emails."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    from aexy.services.contact_enrichment_service import (
        ContactEnrichmentService,
        ContactEnrichmentError,
    )

    service = ContactEnrichmentService(db)

    try:
        result = await service.enrich_contact(
            record_id=record_id,
            workspace_id=workspace_id,
        )

        await db.commit()

        return RecordEnrichResponse(**result)

    except ContactEnrichmentError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# =============================================================================
# Sync exclusions
#
# What a connected mailbox keeps out of Aexy. Connecting a personal account to a
# shared workspace is only a reasonable thing to ask if some of it can stay
# private, so these endpoints belong to the person who connected it.
# =============================================================================


async def _integration_for_exclusions(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    integration_id: str | None = None,
) -> GoogleIntegration:
    """The integration whose exclusions the caller may manage.

    Exclusions belong to whoever connected the mailbox — it is their mail. An
    admin cannot manage somebody else's, which is the point: a rule an admin
    could remove is not a rule the person relied on.

    ``connected_by_id`` is nullable and older rows predate it being recorded, so
    when nobody is on the row the workspace's admins stand in. Without that,
    those workspaces could never set an exclusion at all.

    ``integration_id`` is what makes this usable once somebody connects a second
    mailbox. Rules are keyed by integration, so without it the caller's other
    accounts were unreachable: the resolver picked one and every rule silently
    landed there. Omitting it still means "mine, else the oldest", so a
    single-account workspace behaves as before.
    """
    await verify_workspace_access(workspace_id, current_user, db, "viewer")
    integration = await get_integration(
        workspace_id,
        db,
        integration_id=integration_id,
        prefer_developer_id=str(current_user.id),
    )

    if integration.connected_by_id is None:
        await verify_workspace_access(workspace_id, current_user, db, "admin")
        return integration

    if str(integration.connected_by_id) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Only the person who connected this Google account can change "
                "what it excludes."
            ),
        )
    return integration


@router.get("/exclusions", response_model=list[ExclusionRuleResponse])
async def list_exclusions(
    workspace_id: str,
    integration_id: str | None = Query(
        None, description="Which connected Google account. Defaults to your own."
    ),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Addresses and domains this account never syncs."""
    integration = await _integration_for_exclusions(
        workspace_id, current_user, db, integration_id
    )
    rules = await GmailSyncExclusionService(db).list_rules(str(integration.id))
    return [ExclusionRuleResponse.model_validate(rule) for rule in rules]


@router.post(
    "/exclusions",
    response_model=ExclusionRuleCreatedResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_exclusion(
    workspace_id: str,
    data: ExclusionRuleCreate,
    integration_id: str | None = Query(
        None, description="Which connected Google account. Defaults to your own."
    ),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Stop syncing an address or domain, and remove what is already synced.

    The purge is not optional. "Hide mail from this domain" that leaves last
    month's in the CRM is not what anyone means by hide, so the rule applies
    backwards as well as forwards and the response says how much it took.
    """
    integration = await _integration_for_exclusions(
        workspace_id, current_user, db, integration_id
    )
    service = GmailSyncExclusionService(db)

    try:
        rule = await service.create_rule(
            integration_id=str(integration.id),
            workspace_id=workspace_id,
            kind=data.kind,
            value=data.value,
            match_scope=data.match_scope,
            actor_id=str(current_user.id),
        )
    except ExclusionValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )

    purged = await service.purge_for_rule(
        integration_id=str(integration.id),
        workspace_id=workspace_id,
        rule=rule,
        actor_id=str(current_user.id),
    )

    # Recorded and announced, as the disclosure on the way in said it would be.
    governance = GmailExclusionGovernance(db)
    await governance.record(
        workspace_id=workspace_id,
        action=ACTION_RULE_CREATED,
        actor_id=str(current_user.id),
        integration_id=str(integration.id),
        target=rule.value,
        extra_data={"kind": rule.kind, "match_scope": rule.match_scope, "purged": purged},
    )
    await governance.notify_head(
        workspace_id, str(current_user.id), ACTION_RULE_CREATED, rule.value
    )

    return ExclusionRuleCreatedResponse(
        rule=ExclusionRuleResponse.model_validate(rule), purged=purged
    )


@router.delete("/exclusions/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exclusion(
    workspace_id: str,
    rule_id: str,
    integration_id: str | None = Query(
        None, description="Which connected Google account. Defaults to your own."
    ),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Resume syncing this address or domain.

    Mail an earlier purge removed stays removed — the tombstones outlive the
    rule, so deleting one does not silently pull months of mail back in.
    """
    integration = await _integration_for_exclusions(
        workspace_id, current_user, db, integration_id
    )
    service = GmailSyncExclusionService(db)

    # Read the value before deleting it — the audit entry is about which
    # exclusion went away, and afterwards there is nothing left to name it.
    doomed = next(
        (r for r in await service.list_rules(str(integration.id)) if str(r.id) == rule_id),
        None,
    )
    removed = await service.delete_rule(str(integration.id), rule_id)
    if not removed or doomed is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Exclusion rule not found"
        )

    governance = GmailExclusionGovernance(db)
    await governance.record(
        workspace_id=workspace_id,
        action=ACTION_RULE_DELETED,
        actor_id=str(current_user.id),
        integration_id=str(integration.id),
        target=doomed.value,
        extra_data={"kind": doomed.kind},
    )
    await governance.notify_head(
        workspace_id, str(current_user.id), ACTION_RULE_DELETED, doomed.value
    )


def _counterparty_of(email: SyncedEmail | None, own_address: str | None) -> str | None:
    """The other party on a message, for the "hide them in future?" follow-up.

    The sender, unless the sender is the connected account itself — hiding one
    of your own sent messages would otherwise offer to exclude your own address,
    and accepting that would exclude every thread you ever take part in. On sent
    mail the useful rule is about whoever you sent it to.
    """
    if email is None:
        return None
    own = (own_address or "").strip().lower()
    sender = address_of(email.from_email)
    if sender and sender != own:
        return sender
    for recipient in [*(email.to_emails or []), *(email.cc_emails or [])]:
        candidate = address_of(recipient)
        if candidate and candidate != own:
            return candidate
    return None


@router.post("/exclusions/hide", response_model=HideMessageResponse)
async def hide_synced_message(
    workspace_id: str,
    data: HideMessageRequest,
    integration_id: str | None = Query(
        None, description="Which connected Google account holds the message."
    ),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Hide one synced message.

    Deletes the row and keeps a tombstone. Both are needed: the row is also the
    "already synced" marker, so deleting it alone would let the next full sync
    import the message straight back.

    Returns the address and domain a follow-up rule could be built from, because
    by the time the client asks "hide future mail from them too?" the row that
    held the sender is gone.
    """
    integration = await _integration_for_exclusions(
        workspace_id, current_user, db, integration_id
    )

    existing = (
        await db.execute(
            select(SyncedEmail).where(
                SyncedEmail.integration_id == integration.id,
                SyncedEmail.gmail_id == data.gmail_id,
            )
        )
    ).scalar_one_or_none()

    sender = _counterparty_of(existing, integration.google_email)

    await GmailSyncExclusionService(db).hide_message(
        integration_id=str(integration.id),
        workspace_id=workspace_id,
        gmail_id=data.gmail_id,
        actor_id=str(current_user.id),
    )
    # Recorded so it appears in the admin list, but no notification: a head
    # buried in one-off hides stops reading the standing rules that matter.
    await GmailExclusionGovernance(db).record(
        workspace_id=workspace_id,
        action=ACTION_MESSAGE_HIDDEN,
        actor_id=str(current_user.id),
        integration_id=str(integration.id),
        target=data.gmail_id,
    )

    return HideMessageResponse(
        hidden=True,
        suggested_address=sender,
        suggested_domain=sender.rsplit("@", 1)[1] if sender and "@" in sender else None,
    )


@router.get("/exclusions/admin", response_model=WorkspaceExclusionsResponse)
async def list_workspace_exclusions(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Every exclusion in the workspace, for an admin.

    The policy side of this feature: exclusions are not private, so that nobody
    can quietly suppress business correspondence. Reading this writes an
    ``exclusions_viewed`` entry — a list of hidden domains is itself revealing,
    so whoever reads it is recorded.

    The people whose lists were read are *not* notified. Decided, not
    overlooked: the record exists so the access can be reviewed later, not so it
    can be watched live.
    """
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    rules = (
        await db.execute(
            select(GoogleSyncExclusionRule)
            .where(GoogleSyncExclusionRule.workspace_id == workspace_id)
            .order_by(GoogleSyncExclusionRule.created_at.desc())
        )
    ).scalars().all()

    hidden_count = (
        await db.execute(
            select(func.count(GoogleSyncHiddenMessage.id)).where(
                GoogleSyncHiddenMessage.workspace_id == workspace_id
            )
        )
    ).scalar() or 0

    governance = GmailExclusionGovernance(db)
    await governance.record(
        workspace_id=workspace_id,
        action=ACTION_VIEWED,
        actor_id=str(current_user.id),
        extra_data={"rules": len(rules), "hidden_messages": hidden_count},
    )

    return WorkspaceExclusionsResponse(
        rules=[ExclusionRuleResponse.model_validate(r) for r in rules],
        hidden_message_count=hidden_count,
        audit=[
            ExclusionAuditEntry.model_validate(e)
            for e in await governance.list_audit(workspace_id)
        ],
    )


# =============================================================================
# Accounts
#
# A workspace holds one Google account per address. It used to hold exactly one
# full stop, and `connect-from-developer` overwrote — so the second person to
# connect silently replaced the first and their mailbox stopped syncing.
# =============================================================================


@router.get("/accounts", response_model=GoogleAccountListResponse)
async def list_google_accounts(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Every Google account connected to this workspace.

    Readable by any member, because the Service Desk mailbox form needs to
    offer them and a member has to see which addresses the workspace already
    syncs. It carries no tokens, cursors or scopes — see
    ``GoogleAccountSummary``.
    """
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    integrations = await list_integrations(workspace_id, db)

    connected_by_names: dict[str, str] = {}
    owner_ids = [str(i.connected_by_id) for i in integrations if i.connected_by_id]
    if owner_ids:
        rows = (
            await db.execute(
                select(Developer.id, Developer.name, Developer.email).where(
                    Developer.id.in_(owner_ids)
                )
            )
        ).all()
        connected_by_names = {str(r[0]): (r[1] or r[2] or "") for r in rows}

    desk_integration_ids = set(
        str(i)
        for i in (
            await db.execute(
                select(ServiceDeskMailbox.integration_id).where(
                    ServiceDeskMailbox.workspace_id == workspace_id,
                    ServiceDeskMailbox.integration_id.isnot(None),
                )
            )
        )
        .scalars()
        .all()
    )

    # What connecting would add for *this* caller. Named up front because the
    # flow takes whichever Google account they authorise, and being told
    # afterwards which address you just attached to a shared workspace is the
    # wrong order.
    dev_connection = (
        await db.execute(
            select(GoogleConnection).where(
                GoogleConnection.developer_id == str(current_user.id)
            )
        )
    ).scalar_one_or_none()

    return GoogleAccountListResponse(
        accounts=[
            GoogleAccountSummary(
                id=str(i.id),
                google_email=i.google_email,
                gmail_sync_enabled=i.gmail_sync_enabled,
                calendar_sync_enabled=i.calendar_sync_enabled,
                is_active=i.is_active,
                connected_by_id=str(i.connected_by_id) if i.connected_by_id else None,
                connected_by_name=connected_by_names.get(str(i.connected_by_id or "")),
                is_mine=bool(
                    i.connected_by_id
                    and str(i.connected_by_id) == str(current_user.id)
                ),
                is_service_desk_mailbox=str(i.id) in desk_integration_ids,
                last_error=i.last_error,
                created_at=i.created_at,
            )
            for i in integrations
        ],
        connectable_email=dev_connection.google_email if dev_connection else None,
    )


@router.delete("/accounts/{integration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_google_account(
    workspace_id: str,
    integration_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect one account, leaving the others alone.

    Only its owner or a workspace admin. Somebody else's mailbox is not yours
    to unplug, and the old single-account `/disconnect` could not express the
    difference because there was only ever one.

    Refused while a Service Desk mailbox reads it: silently detaching that
    would stop a customer-facing queue receiving mail, and the symptom is
    nothing arriving — which nobody notices until they are asked why.
    """
    await verify_workspace_access(workspace_id, current_user, db, "viewer")
    integration = await get_integration(
        workspace_id, db, integration_id=integration_id
    )

    is_owner = integration.connected_by_id and str(
        integration.connected_by_id
    ) == str(current_user.id)
    if not is_owner:
        await verify_workspace_access(workspace_id, current_user, db, "admin")

    desk_mailbox = (
        await db.execute(
            select(ServiceDeskMailbox.address).where(
                ServiceDeskMailbox.workspace_id == workspace_id,
                ServiceDeskMailbox.integration_id == str(integration.id),
            )
        )
    ).scalars().first()
    if desk_mailbox:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{integration.google_email} is the Service Desk mailbox for "
                f"{desk_mailbox}. Remove that mailbox first, or its queue stops "
                "receiving mail with no other sign."
            ),
        )

    await db.delete(integration)
    await db.flush()
