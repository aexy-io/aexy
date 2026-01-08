"""Google Calendar integration service.

Provides functionality for:
- OAuth flow for Google Calendar
- Calendar CRUD operations
- Syncing on-call schedules to Google Calendar
"""

import json
import logging
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode
from uuid import uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.oncall import GoogleCalendarToken, OnCallSchedule, OnCallConfig

logger = logging.getLogger(__name__)

# Google OAuth endpoints
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

# Required scopes for calendar access
GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
]


class GoogleCalendarError(Exception):
    """Base exception for Google Calendar errors."""
    pass


class GoogleCalendarAuthError(GoogleCalendarError):
    """Authentication/authorization error."""
    pass


class GoogleCalendarService:
    """Service for Google Calendar integration."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.settings = get_settings()

    # =========================================================================
    # OAuth Flow
    # =========================================================================

    def get_auth_url(
        self,
        workspace_id: str,
        developer_id: str,
    ) -> str:
        """Generate Google OAuth authorization URL.

        Args:
            workspace_id: Workspace ID for the state parameter.
            developer_id: Developer ID for the state parameter.

        Returns:
            OAuth authorization URL.
        """
        # Create state parameter with workspace and developer info
        state = json.dumps({
            "workspace_id": workspace_id,
            "developer_id": developer_id,
        })

        params = {
            "client_id": self.settings.google_client_id,
            "redirect_uri": self.settings.google_redirect_uri,
            "response_type": "code",
            "scope": " ".join(GOOGLE_SCOPES),
            "access_type": "offline",  # Request refresh token
            "prompt": "consent",  # Always show consent screen for refresh token
            "state": state,
        }

        return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"

    async def handle_callback(
        self,
        code: str,
        state: str,
    ) -> GoogleCalendarToken:
        """Handle OAuth callback and exchange code for tokens.

        Args:
            code: Authorization code from Google.
            state: State parameter with workspace/developer info.

        Returns:
            Created GoogleCalendarToken.

        Raises:
            GoogleCalendarAuthError: If token exchange fails.
        """
        # Parse state
        try:
            state_data = json.loads(state)
            workspace_id = state_data["workspace_id"]
            developer_id = state_data["developer_id"]
        except (json.JSONDecodeError, KeyError) as e:
            raise GoogleCalendarAuthError(f"Invalid state parameter: {e}")

        # Exchange code for tokens
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": self.settings.google_client_id,
                    "client_secret": self.settings.google_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": self.settings.google_redirect_uri,
                },
            )

            if response.status_code != 200:
                logger.error(f"Token exchange failed: {response.text}")
                raise GoogleCalendarAuthError("Failed to exchange authorization code")

            token_data = response.json()

        access_token = token_data["access_token"]
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in", 3600)

        if not refresh_token:
            raise GoogleCalendarAuthError("No refresh token received. Please revoke access and try again.")

        # Get user email
        async with httpx.AsyncClient() as client:
            response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if response.status_code != 200:
                raise GoogleCalendarAuthError("Failed to get user info")
            user_info = response.json()

        calendar_email = user_info.get("email", "")

        # Check for existing token for this workspace
        existing = await self.get_token(workspace_id)
        if existing:
            # Update existing token
            existing.access_token = access_token
            existing.refresh_token = refresh_token
            existing.token_expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
            existing.calendar_email = calendar_email
            existing.connected_by_id = developer_id
            existing.is_active = True
            existing.last_error = None
            await self.db.flush()
            await self.db.refresh(existing)
            return existing

        # Create new token
        token = GoogleCalendarToken(
            id=str(uuid4()),
            workspace_id=workspace_id,
            connected_by_id=developer_id,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expiry=datetime.now(timezone.utc) + timedelta(seconds=expires_in),
            calendar_email=calendar_email,
            is_active=True,
        )
        self.db.add(token)
        await self.db.flush()
        await self.db.refresh(token)
        return token

    async def refresh_token(self, token: GoogleCalendarToken) -> GoogleCalendarToken:
        """Refresh an expired access token.

        Args:
            token: Token to refresh.

        Returns:
            Updated token with new access token.
        """
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": self.settings.google_client_id,
                    "client_secret": self.settings.google_client_secret,
                    "refresh_token": token.refresh_token,
                    "grant_type": "refresh_token",
                },
            )

            if response.status_code != 200:
                logger.error(f"Token refresh failed: {response.text}")
                token.is_active = False
                token.last_error = "Token refresh failed"
                await self.db.flush()
                raise GoogleCalendarAuthError("Failed to refresh token")

            token_data = response.json()

        token.access_token = token_data["access_token"]
        token.token_expiry = datetime.now(timezone.utc) + timedelta(
            seconds=token_data.get("expires_in", 3600)
        )
        token.last_error = None
        await self.db.flush()
        await self.db.refresh(token)
        return token

    async def get_valid_token(self, workspace_id: str) -> GoogleCalendarToken | None:
        """Get a valid (non-expired) token for a workspace.

        Automatically refreshes if expired.
        """
        token = await self.get_token(workspace_id)
        if not token or not token.is_active:
            return None

        # Check if token is expired (with 5 minute buffer)
        if token.token_expiry <= datetime.now(timezone.utc) + timedelta(minutes=5):
            try:
                token = await self.refresh_token(token)
            except GoogleCalendarAuthError:
                return None

        return token

    async def get_token(self, workspace_id: str) -> GoogleCalendarToken | None:
        """Get token for a workspace."""
        stmt = select(GoogleCalendarToken).where(
            GoogleCalendarToken.workspace_id == workspace_id
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def disconnect(self, workspace_id: str) -> bool:
        """Disconnect Google Calendar for a workspace."""
        token = await self.get_token(workspace_id)
        if not token:
            return False

        token.is_active = False
        await self.db.flush()
        return True

    # =========================================================================
    # Calendar Operations
    # =========================================================================

    async def list_calendars(self, workspace_id: str) -> list[dict]:
        """List available calendars for the connected account.

        Returns:
            List of calendar info dicts.
        """
        token = await self.get_valid_token(workspace_id)
        if not token:
            raise GoogleCalendarAuthError("No valid token available")

        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{GOOGLE_CALENDAR_API}/users/me/calendarList",
                headers={"Authorization": f"Bearer {token.access_token}"},
            )

            if response.status_code != 200:
                raise GoogleCalendarError(f"Failed to list calendars: {response.text}")

            data = response.json()

        calendars = []
        for item in data.get("items", []):
            calendars.append({
                "id": item["id"],
                "summary": item.get("summary", ""),
                "description": item.get("description"),
                "primary": item.get("primary", False),
                "access_role": item.get("accessRole"),
            })

        return calendars

    async def create_event(
        self,
        workspace_id: str,
        calendar_id: str,
        summary: str,
        description: str | None,
        start_time: datetime,
        end_time: datetime,
        attendees: list[str] | None = None,
    ) -> str:
        """Create a calendar event.

        Args:
            workspace_id: Workspace ID for token lookup.
            calendar_id: Calendar ID to create event in.
            summary: Event title.
            description: Event description.
            start_time: Event start time.
            end_time: Event end time.
            attendees: Optional list of attendee emails.

        Returns:
            Created event ID.
        """
        token = await self.get_valid_token(workspace_id)
        if not token:
            raise GoogleCalendarAuthError("No valid token available")

        event_body = {
            "summary": summary,
            "description": description,
            "start": {
                "dateTime": start_time.isoformat(),
                "timeZone": "UTC",
            },
            "end": {
                "dateTime": end_time.isoformat(),
                "timeZone": "UTC",
            },
        }

        if attendees:
            event_body["attendees"] = [{"email": email} for email in attendees]

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events",
                headers={
                    "Authorization": f"Bearer {token.access_token}",
                    "Content-Type": "application/json",
                },
                json=event_body,
            )

            if response.status_code not in (200, 201):
                logger.error(f"Failed to create event: {response.text}")
                raise GoogleCalendarError("Failed to create calendar event")

            event = response.json()

        return event["id"]

    async def update_event(
        self,
        workspace_id: str,
        calendar_id: str,
        event_id: str,
        summary: str | None = None,
        description: str | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
    ) -> None:
        """Update a calendar event."""
        token = await self.get_valid_token(workspace_id)
        if not token:
            raise GoogleCalendarAuthError("No valid token available")

        # Get existing event first
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events/{event_id}",
                headers={"Authorization": f"Bearer {token.access_token}"},
            )
            if response.status_code != 200:
                raise GoogleCalendarError("Event not found")

            event = response.json()

        # Update fields
        if summary is not None:
            event["summary"] = summary
        if description is not None:
            event["description"] = description
        if start_time is not None:
            event["start"] = {"dateTime": start_time.isoformat(), "timeZone": "UTC"}
        if end_time is not None:
            event["end"] = {"dateTime": end_time.isoformat(), "timeZone": "UTC"}

        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events/{event_id}",
                headers={
                    "Authorization": f"Bearer {token.access_token}",
                    "Content-Type": "application/json",
                },
                json=event,
            )

            if response.status_code != 200:
                logger.error(f"Failed to update event: {response.text}")
                raise GoogleCalendarError("Failed to update calendar event")

    async def delete_event(
        self,
        workspace_id: str,
        calendar_id: str,
        event_id: str,
    ) -> None:
        """Delete a calendar event."""
        token = await self.get_valid_token(workspace_id)
        if not token:
            raise GoogleCalendarAuthError("No valid token available")

        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events/{event_id}",
                headers={"Authorization": f"Bearer {token.access_token}"},
            )

            # 204 = success, 404 = already deleted (ok), 410 = gone (ok)
            if response.status_code not in (204, 404, 410):
                logger.error(f"Failed to delete event: {response.text}")
                raise GoogleCalendarError("Failed to delete calendar event")

    # =========================================================================
    # Schedule Sync
    # =========================================================================

    async def sync_schedule_to_calendar(
        self,
        schedule: OnCallSchedule,
    ) -> str | None:
        """Sync a single on-call schedule to Google Calendar.

        Args:
            schedule: The schedule to sync.

        Returns:
            Google event ID if synced, None if calendar not configured.
        """
        config = schedule.config
        if not config.google_calendar_enabled or not config.google_calendar_id:
            return None

        # Get workspace ID from team
        team = config.team
        if not team:
            return None

        workspace_id = team.workspace_id
        token = await self.get_valid_token(workspace_id)
        if not token:
            logger.warning(f"No valid token for workspace {workspace_id}")
            return None

        developer = schedule.developer
        developer_name = developer.name or developer.email if developer else "Unknown"

        summary = f"On-Call: {developer_name}"
        description = f"On-call shift for {config.team.name if config.team else 'team'}"
        if schedule.is_override and schedule.original_developer:
            orig_name = schedule.original_developer.name or schedule.original_developer.email
            description += f"\n\nOverride from: {orig_name}"
            if schedule.override_reason:
                description += f"\nReason: {schedule.override_reason}"

        try:
            if schedule.google_event_id:
                # Update existing event
                await self.update_event(
                    workspace_id=workspace_id,
                    calendar_id=config.google_calendar_id,
                    event_id=schedule.google_event_id,
                    summary=summary,
                    description=description,
                    start_time=schedule.start_time,
                    end_time=schedule.end_time,
                )
                return schedule.google_event_id
            else:
                # Create new event
                event_id = await self.create_event(
                    workspace_id=workspace_id,
                    calendar_id=config.google_calendar_id,
                    summary=summary,
                    description=description,
                    start_time=schedule.start_time,
                    end_time=schedule.end_time,
                    attendees=[developer.email] if developer and developer.email else None,
                )
                schedule.google_event_id = event_id
                await self.db.flush()
                return event_id
        except GoogleCalendarError as e:
            logger.error(f"Failed to sync schedule {schedule.id} to calendar: {e}")
            return None

    async def remove_schedule_from_calendar(
        self,
        schedule: OnCallSchedule,
    ) -> bool:
        """Remove a schedule from Google Calendar.

        Args:
            schedule: The schedule to remove.

        Returns:
            True if removed, False if not applicable.
        """
        if not schedule.google_event_id:
            return False

        config = schedule.config
        if not config.google_calendar_enabled or not config.google_calendar_id:
            return False

        team = config.team
        if not team:
            return False

        workspace_id = team.workspace_id

        try:
            await self.delete_event(
                workspace_id=workspace_id,
                calendar_id=config.google_calendar_id,
                event_id=schedule.google_event_id,
            )
            schedule.google_event_id = None
            await self.db.flush()
            return True
        except GoogleCalendarError as e:
            logger.error(f"Failed to remove schedule {schedule.id} from calendar: {e}")
            return False

    async def sync_all_schedules(self, config_id: str) -> int:
        """Sync all schedules for a config to Google Calendar.

        Args:
            config_id: On-call config ID.

        Returns:
            Number of schedules synced.
        """
        stmt = (
            select(OnCallSchedule)
            .where(
                OnCallSchedule.config_id == config_id,
                OnCallSchedule.end_time > datetime.now(timezone.utc),
            )
        )
        result = await self.db.execute(stmt)
        schedules = list(result.scalars().all())

        synced_count = 0
        for schedule in schedules:
            if await self.sync_schedule_to_calendar(schedule):
                synced_count += 1

        return synced_count
