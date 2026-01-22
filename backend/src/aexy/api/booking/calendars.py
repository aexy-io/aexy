"""Calendar connections API endpoints for booking module."""

from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, status, Request
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


# OAuth scopes for calendar access
GOOGLE_CALENDAR_SCOPES = [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
]

MICROSOFT_CALENDAR_SCOPES = [
    "Calendars.ReadWrite",
    "User.Read",
]


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

    Returns the URL to redirect the user to for OAuth authorization.
    After authorization, the user will be redirected back to the callback URL
    with an authorization code that should be sent to POST /connect/{provider}.
    """
    if provider not in ["google", "microsoft"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported calendar provider: {provider}",
        )

    # Build the callback URL - use the frontend URL for the redirect
    # The frontend will capture the code and POST it to the backend
    frontend_url = str(request.headers.get("origin", "http://localhost:3000"))
    callback_url = f"{frontend_url}/booking/calendars/callback"

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
            "state": f"{workspace_id}:google",  # Pass workspace ID and provider in state
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
            "state": f"{workspace_id}:microsoft",
        }
        auth_url = f"https://login.microsoftonline.com/common/oauth2/v2.0/authorize?{urlencode(params)}"

    return {"auth_url": auth_url}


@router.post("/connect/google", response_model=CalendarConnectionResponse, status_code=status.HTTP_201_CREATED)
async def connect_google_calendar(
    workspace_id: str,
    data: CalendarConnectRequest,
    request: Request,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Connect a Google Calendar.

    This endpoint receives the OAuth authorization code and exchanges it
    for access tokens.
    """
    import httpx
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Calendar integration is not configured",
        )

    # Build callback URL (same as in GET endpoint)
    frontend_url = str(request.headers.get("origin", "http://localhost:3000"))
    callback_url = f"{frontend_url}/booking/calendars/callback"

    # Exchange authorization code for tokens
    token_url = "https://oauth2.googleapis.com/token"
    token_data = {
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "code": data.auth_code,
        "grant_type": "authorization_code",
        "redirect_uri": callback_url,
    }

    try:
        async with httpx.AsyncClient() as client:
            token_response = await client.post(token_url, data=token_data)
            token_response.raise_for_status()
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
            userinfo_response.raise_for_status()
            userinfo = userinfo_response.json()
            account_email = userinfo.get("email", current_user.email)

            # Fetch primary calendar info
            calendar_response = await client.get(
                "https://www.googleapis.com/calendar/v3/calendars/primary",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            calendar_response.raise_for_status()
            calendar_info = calendar_response.json()
            calendar_name = calendar_info.get("summary", "Primary Calendar")

    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to exchange authorization code: {e.response.text}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to connect Google Calendar: {str(e)}",
        )

    service = CalendarSyncService(db)

    connection = await service.connect_google_calendar(
        user_id=str(current_user.id),
        workspace_id=workspace_id,
        access_token=access_token,
        refresh_token=refresh_token,
        token_expires_at=token_expires_at,
        calendar_id="primary",
        calendar_name=calendar_name,
        account_email=account_email,
    )

    await db.commit()
    await db.refresh(connection)

    return connection_to_response(connection)


@router.post("/connect/microsoft", response_model=CalendarConnectionResponse, status_code=status.HTTP_201_CREATED)
async def connect_microsoft_calendar(
    workspace_id: str,
    data: CalendarConnectRequest,
    request: Request,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Connect a Microsoft Calendar.

    This endpoint receives the OAuth authorization code and exchanges it
    for access tokens.
    """
    import httpx
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    microsoft_client_id = getattr(settings, "microsoft_client_id", None)
    microsoft_client_secret = getattr(settings, "microsoft_client_secret", None)

    if not microsoft_client_id or not microsoft_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Microsoft Calendar integration is not configured",
        )

    # Build callback URL
    frontend_url = str(request.headers.get("origin", "http://localhost:3000"))
    callback_url = f"{frontend_url}/booking/calendars/callback"

    # Exchange authorization code for tokens
    token_url = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    token_data = {
        "client_id": microsoft_client_id,
        "client_secret": microsoft_client_secret,
        "code": data.auth_code,
        "grant_type": "authorization_code",
        "redirect_uri": callback_url,
        "scope": " ".join(MICROSOFT_CALENDAR_SCOPES) + " offline_access",
    }

    try:
        async with httpx.AsyncClient() as client:
            token_response = await client.post(token_url, data=token_data)
            token_response.raise_for_status()
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
            user_response.raise_for_status()
            user_info = user_response.json()
            account_email = user_info.get("mail") or user_info.get("userPrincipalName", current_user.email)

            # Get default calendar
            calendar_response = await client.get(
                "https://graph.microsoft.com/v1.0/me/calendar",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            calendar_response.raise_for_status()
            calendar_info = calendar_response.json()
            calendar_id = calendar_info.get("id", "primary")
            calendar_name = calendar_info.get("name", "Outlook Calendar")

    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to exchange authorization code: {e.response.text}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to connect Microsoft Calendar: {str(e)}",
        )

    service = CalendarSyncService(db)

    connection = await service.connect_microsoft_calendar(
        user_id=str(current_user.id),
        workspace_id=workspace_id,
        access_token=access_token,
        refresh_token=refresh_token,
        token_expires_at=token_expires_at,
        calendar_id=calendar_id,
        calendar_name=calendar_name,
        account_email=account_email,
    )

    await db.commit()
    await db.refresh(connection)

    return connection_to_response(connection)


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
