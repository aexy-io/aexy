"""Calendar connections API endpoints for booking module."""

import base64
import json
import hmac
import hashlib
from urllib.parse import urlencode, quote

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.core.config import settings
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.booking import (
    CalendarConnectionResponse,
    CalendarListResponse,
    CalendarConnectRequest,
    CalendarSyncResponse,
)
from aexy.schemas.booking.calendar import CalendarSettingsUpdate
from aexy.services.booking import CalendarSyncService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/booking/calendars",
    tags=["Booking - Calendars"],
)

# Separate router for callbacks (no workspace prefix, no auth required)
callback_router = APIRouter(
    prefix="/booking/calendars",
    tags=["Booking - Calendar Callbacks"],
)


# OAuth scopes for calendar access
GOOGLE_CALENDAR_SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
]

MICROSOFT_CALENDAR_SCOPES = [
    "Calendars.ReadWrite",
    "User.Read",
]


def _create_oauth_state(user_id: str, workspace_id: str, provider: str, frontend_url: str) -> str:
    """Create a signed OAuth state parameter."""
    state_data = {
        "user_id": user_id,
        "workspace_id": workspace_id,
        "provider": provider,
        "frontend_url": frontend_url,
    }
    state_json = json.dumps(state_data)
    state_bytes = state_json.encode("utf-8")

    # Sign the state with HMAC
    secret = (settings.secret_key or "dev-secret").encode("utf-8")
    signature = hmac.new(secret, state_bytes, hashlib.sha256).hexdigest()[:16]

    # Encode state + signature
    state_with_sig = f"{base64.urlsafe_b64encode(state_bytes).decode('utf-8')}.{signature}"
    return state_with_sig


def _verify_oauth_state(state: str) -> dict:
    """Verify and decode OAuth state parameter."""
    try:
        parts = state.rsplit(".", 1)
        if len(parts) != 2:
            raise ValueError("Invalid state format")

        state_b64, signature = parts
        state_bytes = base64.urlsafe_b64decode(state_b64)

        # Verify signature
        secret = (settings.secret_key or "dev-secret").encode("utf-8")
        expected_sig = hmac.new(secret, state_bytes, hashlib.sha256).hexdigest()[:16]

        if not hmac.compare_digest(signature, expected_sig):
            raise ValueError("Invalid state signature")

        return json.loads(state_bytes.decode("utf-8"))
    except Exception as e:
        raise ValueError(f"Failed to verify OAuth state: {e}")


def connection_to_response(connection) -> CalendarConnectionResponse:
    """Convert CalendarConnection model to response schema."""
    return CalendarConnectionResponse(
        id=connection.id,
        user_id=connection.user_id,
        workspace_id=connection.workspace_id,
        provider=connection.provider,
        calendar_id=connection.calendar_id,
        calendar_name=connection.calendar_name,
        account_email=connection.account_email,
        is_primary=connection.is_primary,
        sync_enabled=connection.sync_enabled,
        check_conflicts=connection.check_conflicts,
        create_events=connection.create_events,
        last_synced_at=connection.last_synced_at,
        created_at=connection.created_at,
        updated_at=connection.updated_at,
    )


@router.get("", response_model=CalendarListResponse)
async def list_calendars(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List connected calendars."""
    service = CalendarSyncService(db)

    connections = await service.list_connections(
        user_id=str(current_user.id),
        workspace_id=workspace_id,
    )

    return CalendarListResponse(
        calendars=[connection_to_response(c) for c in connections],
        total=len(connections),
    )


@router.get("/connect/{provider}")
async def get_calendar_oauth_url(
    workspace_id: str,
    provider: str,
    request: Request,
    current_user: Developer = Depends(get_current_developer),
):
    """Get OAuth authorization URL for calendar provider.

    Redirects the user to the OAuth provider. After authorization,
    the user will be redirected back to the backend callback endpoint,
    which exchanges the code for tokens and redirects to the frontend.
    """
    if provider not in ["google", "microsoft"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported calendar provider: {provider}",
        )

    # Get frontend URL for final redirect after OAuth completes
    frontend_url = str(request.headers.get("origin", "http://localhost:3000"))

    # Build the callback URL - use the backend URL for OAuth redirect
    # The backend will then redirect to frontend after processing
    backend_url = str(request.base_url).rstrip("/")
    callback_url = f"{backend_url}/api/v1/booking/calendars/callback/{provider}"

    # Create signed state with user info
    state = _create_oauth_state(
        user_id=str(current_user.id),
        workspace_id=workspace_id,
        provider=provider,
        frontend_url=frontend_url,
    )

    if provider == "google":
        if not settings.google_client_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Google Calendar integration is not configured",
            )

        # Build Google OAuth URL
        params = {
            "client_id": settings.google_client_id,
            "redirect_uri": callback_url,
            "response_type": "code",
            "scope": " ".join(GOOGLE_CALENDAR_SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
        auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"

    elif provider == "microsoft":
        microsoft_client_id = getattr(settings, "microsoft_client_id", None)
        if not microsoft_client_id:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Microsoft Calendar integration is not configured",
            )

        # Build Microsoft OAuth URL
        params = {
            "client_id": microsoft_client_id,
            "redirect_uri": callback_url,
            "response_type": "code",
            "scope": " ".join(MICROSOFT_CALENDAR_SCOPES) + " offline_access",
            "state": state,
        }
        auth_url = f"https://login.microsoftonline.com/common/oauth2/v2.0/authorize?{urlencode(params)}"

    return {"auth_url": auth_url}


@callback_router.get("/callback/{provider}")
async def calendar_oauth_callback(
    provider: str,
    request: Request,
    code: str = None,
    state: str = None,
    error: str = None,
    error_description: str = None,
    db: AsyncSession = Depends(get_db),
):
    """OAuth callback endpoint for calendar providers.

    This endpoint receives the OAuth redirect from Google/Microsoft,
    exchanges the authorization code for tokens, creates the calendar
    connection, and redirects the user back to the frontend.
    """
    import httpx
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    # Default frontend URL for error redirects
    default_frontend = "http://localhost:3000"

    # Handle OAuth error
    if error:
        error_msg = error_description or error
        return RedirectResponse(
            url=f"{default_frontend}/booking/calendars?error={quote(error_msg)}",
            status_code=status.HTTP_302_FOUND
        )

    if not code or not state:
        return RedirectResponse(
            url=f"{default_frontend}/booking/calendars?error=Missing+authorization+code",
            status_code=status.HTTP_302_FOUND
        )

    # Verify and decode state
    try:
        state_data = _verify_oauth_state(state)
        user_id = state_data["user_id"]
        workspace_id = state_data["workspace_id"]
        frontend_url = state_data.get("frontend_url", default_frontend)
    except ValueError as e:
        return RedirectResponse(
            url=f"{default_frontend}/booking/calendars?error=Invalid+OAuth+state",
            status_code=status.HTTP_302_FOUND
        )

    # Build callback URL (must match what was used in authorization request)
    backend_url = str(request.base_url).rstrip("/")
    callback_url = f"{backend_url}/api/v1/booking/calendars/callback/{provider}"

    success_redirect = f"{frontend_url}/booking/calendars?success=true&provider={provider}"
    error_redirect = f"{frontend_url}/booking/calendars?error="

    try:
        if provider == "google":
            if not settings.google_client_id or not settings.google_client_secret:
                return RedirectResponse(
                    url=f"{error_redirect}Google+Calendar+not+configured",
                    status_code=status.HTTP_302_FOUND
                )

            # Exchange authorization code for tokens
            token_url = "https://oauth2.googleapis.com/token"
            token_data = {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": callback_url,
            }

            async with httpx.AsyncClient() as client:
                token_response = await client.post(token_url, data=token_data)

                if token_response.status_code != 200:
                    error_data = token_response.json()
                    error_msg = error_data.get("error_description", error_data.get("error", "Token exchange failed"))
                    return RedirectResponse(
                        url=f"{error_redirect}{quote(error_msg)}",
                        status_code=status.HTTP_302_FOUND
                    )

                tokens = token_response.json()
                access_token = tokens.get("access_token")
                refresh_token = tokens.get("refresh_token")
                expires_in = tokens.get("expires_in", 3600)
                token_expires_at = datetime.now(ZoneInfo("UTC")) + timedelta(seconds=expires_in)

                # Fetch user info to get email
                userinfo_response = await client.get(
                    "https://www.googleapis.com/oauth2/v2/userinfo",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if userinfo_response.status_code == 200:
                    userinfo = userinfo_response.json()
                    account_email = userinfo.get("email", "")
                else:
                    account_email = ""

                # Fetch primary calendar info
                calendar_response = await client.get(
                    "https://www.googleapis.com/calendar/v3/calendars/primary",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if calendar_response.status_code == 200:
                    calendar_info = calendar_response.json()
                    calendar_name = calendar_info.get("summary", "Primary Calendar")
                else:
                    calendar_name = "Primary Calendar"

            # Create calendar connection
            service = CalendarSyncService(db)
            await service.connect_google_calendar(
                user_id=user_id,
                workspace_id=workspace_id,
                access_token=access_token,
                refresh_token=refresh_token,
                token_expires_at=token_expires_at,
                calendar_id="primary",
                calendar_name=calendar_name,
                account_email=account_email,
            )
            await db.commit()

        elif provider == "microsoft":
            microsoft_client_id = getattr(settings, "microsoft_client_id", None)
            microsoft_client_secret = getattr(settings, "microsoft_client_secret", None)

            if not microsoft_client_id or not microsoft_client_secret:
                return RedirectResponse(
                    url=f"{error_redirect}Microsoft+Calendar+not+configured",
                    status_code=status.HTTP_302_FOUND
                )

            # Exchange authorization code for tokens
            token_url = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
            token_data = {
                "client_id": microsoft_client_id,
                "client_secret": microsoft_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": callback_url,
                "scope": " ".join(MICROSOFT_CALENDAR_SCOPES) + " offline_access",
            }

            async with httpx.AsyncClient() as client:
                token_response = await client.post(token_url, data=token_data)

                if token_response.status_code != 200:
                    error_data = token_response.json()
                    error_msg = error_data.get("error_description", error_data.get("error", "Token exchange failed"))
                    return RedirectResponse(
                        url=f"{error_redirect}{quote(error_msg)}",
                        status_code=status.HTTP_302_FOUND
                    )

                tokens = token_response.json()
                access_token = tokens.get("access_token")
                refresh_token = tokens.get("refresh_token")
                expires_in = tokens.get("expires_in", 3600)
                token_expires_at = datetime.now(ZoneInfo("UTC")) + timedelta(seconds=expires_in)

                # Fetch user info
                user_response = await client.get(
                    "https://graph.microsoft.com/v1.0/me",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if user_response.status_code == 200:
                    user_info = user_response.json()
                    account_email = user_info.get("mail") or user_info.get("userPrincipalName", "")
                else:
                    account_email = ""

                # Get default calendar
                calendar_response = await client.get(
                    "https://graph.microsoft.com/v1.0/me/calendar",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if calendar_response.status_code == 200:
                    calendar_info = calendar_response.json()
                    calendar_id = calendar_info.get("id", "primary")
                    calendar_name = calendar_info.get("name", "Outlook Calendar")
                else:
                    calendar_id = "primary"
                    calendar_name = "Outlook Calendar"

            # Create calendar connection
            service = CalendarSyncService(db)
            await service.connect_microsoft_calendar(
                user_id=user_id,
                workspace_id=workspace_id,
                access_token=access_token,
                refresh_token=refresh_token,
                token_expires_at=token_expires_at,
                calendar_id=calendar_id,
                calendar_name=calendar_name,
                account_email=account_email,
            )
            await db.commit()

        else:
            return RedirectResponse(
                url=f"{error_redirect}Unsupported+provider",
                status_code=status.HTTP_302_FOUND
            )

        # Success - redirect to frontend
        return RedirectResponse(
            url=success_redirect,
            status_code=status.HTTP_302_FOUND
        )

    except Exception as e:
        return RedirectResponse(
            url=f"{error_redirect}{quote(str(e))}",
            status_code=status.HTTP_302_FOUND
        )


@router.get("/{calendar_id}", response_model=CalendarConnectionResponse)
async def get_calendar(
    workspace_id: str,
    calendar_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific calendar connection."""
    service = CalendarSyncService(db)

    connection = await service.get_connection(calendar_id)

    if not connection or connection.user_id != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar connection not found",
        )

    return connection_to_response(connection)


@router.patch("/{calendar_id}", response_model=CalendarConnectionResponse)
async def update_calendar_settings(
    workspace_id: str,
    calendar_id: str,
    data: CalendarSettingsUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update calendar connection settings."""
    from aexy.services.booking.calendar_sync_service import CalendarConnectionNotFoundError

    service = CalendarSyncService(db)

    connection = await service.get_connection(calendar_id)

    if not connection or connection.user_id != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar connection not found",
        )

    try:
        connection = await service.update_connection_settings(
            connection_id=calendar_id,
            is_primary=data.is_primary,
            sync_enabled=data.sync_enabled,
            check_conflicts=data.check_conflicts,
            create_events=data.create_events,
        )

        await db.commit()
        await db.refresh(connection)

        return connection_to_response(connection)

    except CalendarConnectionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar connection not found",
        )


@router.delete("/{calendar_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_calendar(
    workspace_id: str,
    calendar_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect a calendar."""
    service = CalendarSyncService(db)

    connection = await service.get_connection(calendar_id)

    if not connection or connection.user_id != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar connection not found",
        )

    await service.disconnect_calendar(calendar_id)
    await db.commit()


@router.post("/{calendar_id}/sync", response_model=CalendarSyncResponse)
async def sync_calendar(
    workspace_id: str,
    calendar_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Force sync a calendar."""
    from aexy.services.booking.calendar_sync_service import CalendarConnectionNotFoundError

    service = CalendarSyncService(db)

    connection = await service.get_connection(calendar_id)

    if not connection or connection.user_id != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar connection not found",
        )

    try:
        result = await service.sync_calendar(calendar_id)

        await db.commit()

        return CalendarSyncResponse(
            calendar_id=calendar_id,
            synced=result.get("synced", False),
            events_synced=result.get("events_synced", 0),
            last_synced_at=result.get("last_synced_at"),
        )

    except CalendarConnectionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Calendar connection not found",
        )
