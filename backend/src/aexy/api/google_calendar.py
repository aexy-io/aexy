"""Google Calendar integration API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.core.config import get_settings
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.oncall import (
    GoogleCalendarConnectResponse,
    GoogleCalendarStatusResponse,
    GoogleCalendarListResponse,
    GoogleCalendarInfo,
    GoogleCalendarSelectRequest,
)
from aexy.services.google_calendar_service import (
    GoogleCalendarService,
    GoogleCalendarError,
    GoogleCalendarAuthError,
)
from aexy.services.workspace_service import WorkspaceService
from aexy.services.oncall_service import OnCallService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/integrations/google-calendar",
    tags=["Google Calendar Integration"],
)


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


@router.get("/connect", response_model=GoogleCalendarConnectResponse)
async def get_connect_url(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get the Google OAuth authorization URL.

    The user should be redirected to this URL to connect their Google Calendar.
    """
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Calendar integration is not configured",
        )

    service = GoogleCalendarService(db)
    auth_url = service.get_auth_url(
        workspace_id=workspace_id,
        developer_id=str(current_user.id),
    )

    return GoogleCalendarConnectResponse(auth_url=auth_url)


@router.get("/callback")
async def oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Handle Google OAuth callback.

    This endpoint is called by Google after user authorization.
    Redirects to frontend with success/error status.
    """
    settings = get_settings()
    service = GoogleCalendarService(db)

    try:
        token = await service.handle_callback(code=code, state=state)
        await db.commit()

        # Redirect to frontend settings page with success
        return RedirectResponse(
            url=f"{settings.frontend_url}/settings/integrations?google_calendar=connected",
            status_code=status.HTTP_302_FOUND,
        )
    except GoogleCalendarAuthError as e:
        # Redirect to frontend with error
        return RedirectResponse(
            url=f"{settings.frontend_url}/settings/integrations?google_calendar=error&message={str(e)}",
            status_code=status.HTTP_302_FOUND,
        )


@router.get("/status", response_model=GoogleCalendarStatusResponse)
async def get_status(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get Google Calendar connection status for the workspace."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    service = GoogleCalendarService(db)
    token = await service.get_token(workspace_id)

    if not token:
        return GoogleCalendarStatusResponse(
            is_connected=False,
            calendar_email=None,
            last_sync_at=None,
            last_error=None,
        )

    return GoogleCalendarStatusResponse(
        is_connected=token.is_active,
        calendar_email=token.calendar_email,
        last_sync_at=token.last_sync_at,
        last_error=token.last_error,
    )


@router.get("/calendars", response_model=GoogleCalendarListResponse)
async def list_calendars(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List available Google Calendars for the connected account."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = GoogleCalendarService(db)

    try:
        calendars = await service.list_calendars(workspace_id)
    except GoogleCalendarAuthError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google Calendar is not connected or authorization expired",
        )
    except GoogleCalendarError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )

    return GoogleCalendarListResponse(
        calendars=[
            GoogleCalendarInfo(
                id=cal["id"],
                summary=cal["summary"],
                description=cal.get("description"),
                primary=cal.get("primary", False),
                access_role=cal.get("access_role"),
            )
            for cal in calendars
        ]
    )


@router.post("/select-calendar/{team_id}")
async def select_calendar(
    workspace_id: str,
    team_id: str,
    data: GoogleCalendarSelectRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Select a calendar to sync on-call schedules to."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    # Update the on-call config with the selected calendar
    oncall_service = OnCallService(db)
    config = await oncall_service.get_config(team_id)

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="On-call is not enabled for this team",
        )

    config.google_calendar_enabled = True
    config.google_calendar_id = data.calendar_id
    await db.commit()

    return {"status": "ok", "calendar_id": data.calendar_id}


@router.post("/disconnect", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect Google Calendar integration."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    service = GoogleCalendarService(db)
    await service.disconnect(workspace_id)
    await db.commit()


@router.post("/sync")
async def manual_sync(
    workspace_id: str,
    team_id: str = Query(..., description="Team ID to sync schedules for"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger a sync of on-call schedules to Google Calendar."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    # Get the on-call config
    oncall_service = OnCallService(db)
    config = await oncall_service.get_config(team_id)

    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="On-call is not enabled for this team",
        )

    if not config.google_calendar_enabled or not config.google_calendar_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google Calendar is not configured for this team",
        )

    calendar_service = GoogleCalendarService(db)

    try:
        synced_count = await calendar_service.sync_all_schedules(str(config.id))
    except GoogleCalendarAuthError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google Calendar authorization expired. Please reconnect.",
        )
    except GoogleCalendarError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )

    await db.commit()

    return {"status": "ok", "synced_count": synced_count}
