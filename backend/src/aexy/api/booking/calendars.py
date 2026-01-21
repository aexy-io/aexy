"""Calendar connections API endpoints for booking module."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
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


@router.post("/connect/google", response_model=CalendarConnectionResponse, status_code=status.HTTP_201_CREATED)
async def connect_google_calendar(
    workspace_id: str,
    data: CalendarConnectRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Connect a Google Calendar.

    This endpoint receives the OAuth authorization code and exchanges it
    for access tokens. The actual OAuth flow is handled by the frontend.
    """
    # In a real implementation, you would:
    # 1. Exchange auth_code for access_token and refresh_token via Google OAuth
    # 2. Fetch calendar list from Google Calendar API
    # 3. Store the connection

    # For now, we'll create a placeholder connection
    # This should be integrated with your existing Google OAuth flow

    service = CalendarSyncService(db)

    # Placeholder - in production, exchange auth_code for tokens
    connection = await service.connect_google_calendar(
        user_id=str(current_user.id),
        workspace_id=workspace_id,
        access_token=data.auth_code,  # Placeholder
        refresh_token=None,
        token_expires_at=None,
        calendar_id="primary",
        calendar_name="Primary Calendar",
        account_email=current_user.email,
    )

    await db.commit()
    await db.refresh(connection)

    return connection_to_response(connection)


@router.post("/connect/microsoft", response_model=CalendarConnectionResponse, status_code=status.HTTP_201_CREATED)
async def connect_microsoft_calendar(
    workspace_id: str,
    data: CalendarConnectRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Connect a Microsoft Calendar.

    This endpoint receives the OAuth authorization code and exchanges it
    for access tokens. The actual OAuth flow is handled by the frontend.
    """
    service = CalendarSyncService(db)

    # Placeholder - in production, exchange auth_code for tokens via MS Graph
    connection = await service.connect_microsoft_calendar(
        user_id=str(current_user.id),
        workspace_id=workspace_id,
        access_token=data.auth_code,  # Placeholder
        refresh_token=None,
        token_expires_at=None,
        calendar_id="primary",
        calendar_name="Outlook Calendar",
        account_email=current_user.email,
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
