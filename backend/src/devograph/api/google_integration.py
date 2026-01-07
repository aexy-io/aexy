"""Google Integration API endpoints for Gmail and Calendar sync."""

import logging
import urllib.parse
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devograph.api.developers import get_current_developer
from devograph.core.config import get_settings
from devograph.core.database import get_db
from devograph.models.developer import Developer
from devograph.models.google_integration import (
    EmailSyncCursor,
    GoogleIntegration,
    SyncedCalendarEvent,
    SyncedCalendarEventRecordLink,
    SyncedEmail,
    SyncedEmailRecordLink,
)
from devograph.schemas.google_integration import (
    CalendarInfo,
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
)
from devograph.services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/integrations/google",
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


async def get_integration(
    workspace_id: str,
    db: AsyncSession,
    required: bool = True,
) -> GoogleIntegration | None:
    """Get Google integration for workspace."""
    result = await db.execute(
        select(GoogleIntegration).where(GoogleIntegration.workspace_id == workspace_id)
    )
    integration = result.scalar_one_or_none()

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

    Requires admin permission on the workspace.
    """
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    settings = get_settings()
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google integration is not configured",
        )

    # Build state parameter with workspace and developer info
    state = f"{workspace_id}:{current_user.id}:{redirect_url or ''}"

    # Build OAuth URL
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": f"{settings.backend_url}/api/v1/workspaces/{workspace_id}/integrations/google/callback",
        "response_type": "code",
        "scope": " ".join(GOOGLE_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }

    auth_url = f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}"

    return GoogleIntegrationConnectResponse(auth_url=auth_url)


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
        redirect = custom_redirect or f"{frontend_url}/crm/settings/integrations"
        return RedirectResponse(
            url=f"{redirect}?google=error&message={urllib.parse.quote(error)}",
            status_code=status.HTTP_302_FOUND,
        )

    if expected_workspace_id != workspace_id:
        redirect = custom_redirect or f"{frontend_url}/crm/settings/integrations"
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
                redirect = custom_redirect or f"{frontend_url}/crm/settings/integrations"
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

        # Create or update integration
        result = await db.execute(
            select(GoogleIntegration).where(GoogleIntegration.workspace_id == workspace_id)
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

        redirect = custom_redirect or f"{frontend_url}/crm/settings/integrations"
        return RedirectResponse(
            url=f"{redirect}?google=connected",
            status_code=status.HTTP_302_FOUND,
        )

    except Exception as e:
        logger.exception(f"OAuth callback error: {e}")
        redirect = custom_redirect or f"{frontend_url}/crm/settings/integrations"
        return RedirectResponse(
            url=f"{redirect}?google=error&message={urllib.parse.quote(str(e))}",
            status_code=status.HTTP_302_FOUND,
        )


@router.get("/status", response_model=GoogleIntegrationStatusResponse)
async def get_status(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get Google integration status for the workspace."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    integration = await get_integration(workspace_id, db, required=False)

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
        gmail_last_sync_at=integration.gmail_last_sync_at,
        calendar_last_sync_at=integration.calendar_last_sync_at,
        messages_synced=cursor.messages_synced if cursor else 0,
        events_synced=events_count,
        last_error=integration.last_error,
        granted_scopes=integration.granted_scopes or [],
    )


@router.patch("/settings", response_model=GoogleIntegrationStatusResponse)
async def update_settings(
    workspace_id: str,
    data: GoogleIntegrationSettingsUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update Google integration settings."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    integration = await get_integration(workspace_id, db)

    if data.gmail_sync_enabled is not None:
        integration.gmail_sync_enabled = data.gmail_sync_enabled
    if data.calendar_sync_enabled is not None:
        integration.calendar_sync_enabled = data.calendar_sync_enabled
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
    """Disconnect Google integration."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    integration = await get_integration(workspace_id, db, required=False)
    if integration:
        await db.delete(integration)
        await db.commit()


# =============================================================================
# Gmail Endpoints
# =============================================================================


@router.post("/gmail/sync", response_model=GmailSyncResponse)
async def trigger_gmail_sync(
    workspace_id: str,
    data: GmailSyncRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Trigger Gmail sync (full or incremental)."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    integration = await get_integration(workspace_id, db)

    if not integration.gmail_sync_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Gmail sync is not enabled",
        )

    from devograph.services.gmail_sync_service import GmailSyncService, GmailSyncError

    service = GmailSyncService(db)

    try:
        if data.full_sync:
            result = await service.start_full_sync(integration, max_messages=data.max_messages)
        else:
            result = await service.start_incremental_sync(integration)

        await db.commit()

        return GmailSyncResponse(
            status="completed",
            messages_synced=result.get("messages_synced", 0),
            full_sync_completed=result.get("full_sync_completed", False),
            history_id=result.get("history_id"),
            error=result.get("error"),
        )

    except GmailSyncError as e:
        return GmailSyncResponse(
            status="error",
            error=str(e),
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
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List synced emails with filtering and pagination."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    query = select(SyncedEmail).where(SyncedEmail.workspace_id == workspace_id)

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
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Send an email via Gmail."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    integration = await get_integration(workspace_id, db)

    from devograph.services.gmail_sync_service import GmailSyncService, GmailSyncError

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
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List available Google Calendars."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    integration = await get_integration(workspace_id, db)

    from devograph.services.calendar_sync_service import CalendarSyncService, CalendarSyncError

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
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Trigger calendar sync."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    integration = await get_integration(workspace_id, db)

    if not integration.calendar_sync_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Calendar sync is not enabled",
        )

    from devograph.services.calendar_sync_service import CalendarSyncService, CalendarSyncError

    service = CalendarSyncService(db)

    try:
        result = await service.start_calendar_sync(
            integration,
            calendar_ids=data.calendar_ids,
        )

        await db.commit()

        return CalendarSyncResponse(
            status="completed",
            events_synced=result.get("events_synced", 0),
            calendars_synced=result.get("calendars_synced", []),
            error=result.get("error"),
        )

    except CalendarSyncError as e:
        return CalendarSyncResponse(
            status="error",
            error=str(e),
        )


@router.get("/calendar/events", response_model=SyncedEventListResponse)
async def list_events(
    workspace_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    start_after: datetime = Query(None, description="Filter events starting after this time"),
    start_before: datetime = Query(None, description="Filter events starting before this time"),
    calendar_id: str = Query(None, description="Filter by calendar ID"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List synced calendar events with filtering and pagination."""
    await verify_workspace_access(workspace_id, current_user, db, "viewer")

    query = select(SyncedCalendarEvent).where(SyncedCalendarEvent.workspace_id == workspace_id)

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
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new calendar event."""
    await verify_workspace_access(workspace_id, current_user, db, "member")

    integration = await get_integration(workspace_id, db)

    from devograph.services.calendar_sync_service import CalendarSyncService, CalendarSyncError

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
    data: ContactEnrichRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Process emails to extract and enrich contacts."""
    await verify_workspace_access(workspace_id, current_user, db, "admin")

    from devograph.services.contact_enrichment_service import ContactEnrichmentService

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

    from devograph.services.contact_enrichment_service import (
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
