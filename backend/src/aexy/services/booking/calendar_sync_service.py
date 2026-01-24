"""Calendar sync service for booking module.

Provides actual integration with Google Calendar and Microsoft Graph APIs
for busy time checking and event creation.
"""

import logging
from datetime import date, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.booking import CalendarConnection, CalendarProvider, Booking

logger = logging.getLogger(__name__)

# Google Calendar API endpoints
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

# Microsoft Graph API endpoints
MICROSOFT_GRAPH_API = "https://graph.microsoft.com/v1.0"
MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"


class CalendarSyncServiceError(Exception):
    """Base exception for calendar sync service errors."""

    pass


class CalendarConnectionNotFoundError(CalendarSyncServiceError):
    """Calendar connection not found."""

    pass


class CalendarTokenRefreshError(CalendarSyncServiceError):
    """Token refresh failed."""

    pass


class CalendarSyncService:
    """Service for syncing with external calendars."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # Calendar connection management

    async def connect_google_calendar(
        self,
        user_id: str,
        workspace_id: str,
        access_token: str,
        refresh_token: str | None,
        token_expires_at: datetime | None,
        calendar_id: str,
        calendar_name: str,
        account_email: str | None = None,
    ) -> CalendarConnection:
        """Connect a Google Calendar account."""
        # Check for existing connection
        existing = await self.get_connection_by_calendar(
            user_id, CalendarProvider.GOOGLE.value, calendar_id
        )

        if existing:
            # Update tokens
            existing.access_token = access_token
            existing.refresh_token = refresh_token or existing.refresh_token
            existing.token_expires_at = token_expires_at
            existing.account_email = account_email
            await self.db.flush()
            return existing

        connection = CalendarConnection(
            id=str(uuid4()),
            user_id=user_id,
            workspace_id=workspace_id,
            provider=CalendarProvider.GOOGLE.value,
            calendar_id=calendar_id,
            calendar_name=calendar_name,
            account_email=account_email,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=token_expires_at,
        )

        self.db.add(connection)
        await self.db.flush()
        return connection

    async def connect_microsoft_calendar(
        self,
        user_id: str,
        workspace_id: str,
        access_token: str,
        refresh_token: str | None,
        token_expires_at: datetime | None,
        calendar_id: str,
        calendar_name: str,
        account_email: str | None = None,
    ) -> CalendarConnection:
        """Connect a Microsoft Calendar account."""
        existing = await self.get_connection_by_calendar(
            user_id, CalendarProvider.MICROSOFT.value, calendar_id
        )

        if existing:
            existing.access_token = access_token
            existing.refresh_token = refresh_token or existing.refresh_token
            existing.token_expires_at = token_expires_at
            existing.account_email = account_email
            await self.db.flush()
            return existing

        connection = CalendarConnection(
            id=str(uuid4()),
            user_id=user_id,
            workspace_id=workspace_id,
            provider=CalendarProvider.MICROSOFT.value,
            calendar_id=calendar_id,
            calendar_name=calendar_name,
            account_email=account_email,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=token_expires_at,
        )

        self.db.add(connection)
        await self.db.flush()
        return connection

    async def get_connection(self, connection_id: str) -> CalendarConnection | None:
        """Get a calendar connection by ID."""
        stmt = select(CalendarConnection).where(CalendarConnection.id == connection_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_connection_by_calendar(
        self,
        user_id: str,
        provider: str,
        calendar_id: str,
    ) -> CalendarConnection | None:
        """Get a connection by user, provider, and calendar ID."""
        stmt = select(CalendarConnection).where(
            and_(
                CalendarConnection.user_id == user_id,
                CalendarConnection.provider == provider,
                CalendarConnection.calendar_id == calendar_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_connections(
        self,
        user_id: str,
        workspace_id: str | None = None,
    ) -> list[CalendarConnection]:
        """List calendar connections for a user."""
        conditions = [CalendarConnection.user_id == user_id]

        if workspace_id:
            conditions.append(CalendarConnection.workspace_id == workspace_id)

        stmt = (
            select(CalendarConnection)
            .where(and_(*conditions))
            .order_by(CalendarConnection.is_primary.desc(), CalendarConnection.created_at)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def disconnect_calendar(self, connection_id: str) -> bool:
        """Disconnect a calendar."""
        connection = await self.get_connection(connection_id)
        if not connection:
            return False

        await self.db.delete(connection)
        await self.db.flush()
        return True

    async def update_connection_settings(
        self,
        connection_id: str,
        is_primary: bool | None = None,
        sync_enabled: bool | None = None,
        check_conflicts: bool | None = None,
        create_events: bool | None = None,
    ) -> CalendarConnection:
        """Update calendar connection settings."""
        connection = await self.get_connection(connection_id)
        if not connection:
            raise CalendarConnectionNotFoundError(f"Connection {connection_id} not found")

        if is_primary is not None:
            # If setting as primary, unset other primaries
            if is_primary:
                await self._unset_primary_calendars(connection.user_id)
            connection.is_primary = is_primary

        if sync_enabled is not None:
            connection.sync_enabled = sync_enabled
        if check_conflicts is not None:
            connection.check_conflicts = check_conflicts
        if create_events is not None:
            connection.create_events = create_events

        await self.db.flush()
        await self.db.refresh(connection)
        return connection

    async def _unset_primary_calendars(self, user_id: str) -> None:
        """Unset primary flag on all user's calendars."""
        stmt = select(CalendarConnection).where(
            and_(
                CalendarConnection.user_id == user_id,
                CalendarConnection.is_primary == True,
            )
        )
        result = await self.db.execute(stmt)
        for conn in result.scalars().all():
            conn.is_primary = False
        await self.db.flush()

    # Calendar sync operations

    async def sync_calendar(self, connection_id: str) -> dict:
        """Sync events from a connected calendar."""
        connection = await self.get_connection(connection_id)
        if not connection:
            raise CalendarConnectionNotFoundError(f"Connection {connection_id} not found")

        if not connection.sync_enabled:
            return {"synced": False, "reason": "Sync disabled"}

        # This would integrate with the actual calendar API
        # For now, we'll just update the sync timestamp
        connection.last_synced_at = datetime.now(ZoneInfo("UTC"))
        await self.db.flush()

        return {
            "synced": True,
            "events_synced": 0,  # Would be actual count from API
            "last_synced_at": connection.last_synced_at,
        }

    async def get_busy_times(
        self,
        user_id: str,
        start_date: date,
        end_date: date,
    ) -> list[dict]:
        """Get busy times from connected calendars.

        Queries Google Calendar freeBusy API and Microsoft Graph schedule API
        to get actual busy times from connected calendars.

        Returns:
            List of dicts with 'start' and 'end' datetime objects for busy periods.
        """
        # Get connections that check conflicts
        stmt = select(CalendarConnection).where(
            and_(
                CalendarConnection.user_id == user_id,
                CalendarConnection.check_conflicts == True,
                CalendarConnection.sync_enabled == True,
            )
        )
        result = await self.db.execute(stmt)
        connections = list(result.scalars().all())

        busy_times = []

        # Convert dates to datetime for API calls
        start_dt = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=ZoneInfo("UTC"))
        end_dt = datetime.combine(end_date + timedelta(days=1), datetime.min.time()).replace(tzinfo=ZoneInfo("UTC"))

        for connection in connections:
            try:
                # Refresh token if needed
                connection = await self._refresh_token_if_needed(connection)

                if connection.provider == CalendarProvider.GOOGLE.value:
                    google_busy = await self._get_google_busy_times(
                        connection, start_dt, end_dt
                    )
                    busy_times.extend(google_busy)
                elif connection.provider == CalendarProvider.MICROSOFT.value:
                    microsoft_busy = await self._get_microsoft_busy_times(
                        connection, start_dt, end_dt
                    )
                    busy_times.extend(microsoft_busy)
            except Exception as e:
                logger.error(
                    f"Failed to get busy times from {connection.provider} "
                    f"calendar {connection.calendar_id}: {e}"
                )
                # Continue with other calendars
                continue

        return busy_times

    async def _get_google_busy_times(
        self,
        connection: CalendarConnection,
        start_dt: datetime,
        end_dt: datetime,
    ) -> list[dict]:
        """Get busy times from Google Calendar using freeBusy API."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{GOOGLE_CALENDAR_API}/freeBusy",
                headers={
                    "Authorization": f"Bearer {connection.access_token}",
                    "Content-Type": "application/json",
                },
                json={
                    "timeMin": start_dt.isoformat(),
                    "timeMax": end_dt.isoformat(),
                    "items": [{"id": connection.calendar_id}],
                },
                timeout=30.0,
            )

            if response.status_code != 200:
                logger.error(f"Google freeBusy API error: {response.status_code} - {response.text}")
                return []

            data = response.json()

        busy_times = []
        calendars = data.get("calendars", {})
        calendar_data = calendars.get(connection.calendar_id, {})

        for busy_period in calendar_data.get("busy", []):
            start_str = busy_period.get("start")
            end_str = busy_period.get("end")

            if start_str and end_str:
                busy_times.append({
                    "start": datetime.fromisoformat(start_str.replace("Z", "+00:00")),
                    "end": datetime.fromisoformat(end_str.replace("Z", "+00:00")),
                    "calendar_id": connection.calendar_id,
                    "provider": CalendarProvider.GOOGLE.value,
                })

        return busy_times

    async def _get_microsoft_busy_times(
        self,
        connection: CalendarConnection,
        start_dt: datetime,
        end_dt: datetime,
    ) -> list[dict]:
        """Get busy times from Microsoft Graph using calendarView API."""
        async with httpx.AsyncClient() as client:
            # Use calendarView to get events in the time range
            # This is more reliable than getSchedule for personal calendars
            params = {
                "startDateTime": start_dt.isoformat(),
                "endDateTime": end_dt.isoformat(),
                "$select": "start,end,showAs",
                "$filter": "showAs ne 'free'",  # Only get busy/tentative/oof events
            }

            # Construct URL based on calendar_id
            if connection.calendar_id == "primary":
                url = f"{MICROSOFT_GRAPH_API}/me/calendar/calendarView"
            else:
                url = f"{MICROSOFT_GRAPH_API}/me/calendars/{connection.calendar_id}/calendarView"

            response = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {connection.access_token}",
                    "Content-Type": "application/json",
                },
                params=params,
                timeout=30.0,
            )

            if response.status_code != 200:
                logger.error(f"Microsoft Graph API error: {response.status_code} - {response.text}")
                return []

            data = response.json()

        busy_times = []
        for event in data.get("value", []):
            start_info = event.get("start", {})
            end_info = event.get("end", {})

            start_str = start_info.get("dateTime")
            end_str = end_info.get("dateTime")
            timezone_str = start_info.get("timeZone", "UTC")

            if start_str and end_str:
                # Microsoft returns datetime without timezone info, need to add it
                try:
                    # Try parsing with timezone
                    if "Z" in start_str or "+" in start_str or "-" in start_str[10:]:
                        start = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
                        end = datetime.fromisoformat(end_str.replace("Z", "+00:00"))
                    else:
                        # Add timezone from the response
                        tz = ZoneInfo(timezone_str) if timezone_str else ZoneInfo("UTC")
                        start = datetime.fromisoformat(start_str).replace(tzinfo=tz)
                        end = datetime.fromisoformat(end_str).replace(tzinfo=tz)

                    busy_times.append({
                        "start": start,
                        "end": end,
                        "calendar_id": connection.calendar_id,
                        "provider": CalendarProvider.MICROSOFT.value,
                    })
                except Exception as e:
                    logger.warning(f"Failed to parse Microsoft event times: {e}")
                    continue

        return busy_times

    # Calendar event management

    async def create_calendar_event(
        self,
        booking: Booking,
        connection_id: str | None = None,
    ) -> dict | None:
        """Create a calendar event for a booking.

        Creates events on Google Calendar or Microsoft Outlook.
        Also generates a meeting link (Google Meet / Microsoft Teams) if applicable.
        """
        if not booking.host_id:
            logger.warning(f"Cannot create calendar event: booking {booking.id} has no host_id")
            return None

        # Get primary calendar or specified connection
        if connection_id:
            connection = await self.get_connection(connection_id)
        else:
            stmt = select(CalendarConnection).where(
                and_(
                    CalendarConnection.user_id == booking.host_id,
                    CalendarConnection.create_events == True,
                    CalendarConnection.is_primary == True,
                )
            )
            result = await self.db.execute(stmt)
            connection = result.scalar_one_or_none()

        if not connection:
            logger.info(
                f"No calendar connection found for host {booking.host_id}. "
                f"To generate meeting links automatically, connect a Google or Microsoft calendar "
                f"and enable 'Create events' in calendar settings."
            )
            return None

        try:
            # Refresh token if needed
            connection = await self._refresh_token_if_needed(connection)

            # Get event type details for the title
            event_type = booking.event_type
            event_title = f"{event_type.name if event_type else 'Meeting'} with {booking.invitee_name}"

            # Check if we should create a meeting link based on location type
            create_meeting_link = False
            if event_type:
                location_type = event_type.location_type
                create_meeting_link = location_type in ("google_meet", "zoom", "microsoft_teams", "video")

            event_description = self._build_event_description(booking)
            meeting_link = None

            if connection.provider == CalendarProvider.GOOGLE.value:
                event_id, meeting_link = await self._create_google_event(
                    connection, booking, event_title, event_description,
                    create_meet_link=create_meeting_link
                )
            elif connection.provider == CalendarProvider.MICROSOFT.value:
                event_id, meeting_link = await self._create_microsoft_event(
                    connection, booking, event_title, event_description,
                    create_teams_link=create_meeting_link
                )
            else:
                logger.warning(f"Unknown calendar provider: {connection.provider}")
                return None

            # Update booking with meeting link if generated
            if meeting_link and not booking.meeting_link:
                booking.meeting_link = meeting_link
                await self.db.flush()
                logger.info(f"Generated meeting link for booking {booking.id}: {meeting_link}")
            elif not meeting_link and create_meeting_link:
                logger.warning(
                    f"No meeting link generated for booking {booking.id}. "
                    f"Provider: {connection.provider}, location_type: {event_type.location_type if event_type else 'N/A'}"
                )

            return {
                "calendar_event_id": event_id,
                "calendar_provider": connection.provider,
                "connection_id": connection.id,
                "meeting_link": meeting_link,
            }

        except Exception as e:
            logger.error(f"Failed to create calendar event: {e}")
            return None

    def _build_event_description(self, booking: Booking) -> str:
        """Build event description from booking details."""
        lines = [
            f"Guest: {booking.invitee_name}",
            f"Email: {booking.invitee_email}",
        ]

        if booking.invitee_phone:
            lines.append(f"Phone: {booking.invitee_phone}")

        if booking.meeting_link:
            lines.append(f"\nMeeting URL: {booking.meeting_link}")

        lines.append("\n---")
        lines.append("Created via Aexy Booking")

        return "\n".join(lines)

    async def _create_google_event(
        self,
        connection: CalendarConnection,
        booking: Booking,
        title: str,
        description: str,
        create_meet_link: bool = True,
    ) -> tuple[str, str | None]:
        """Create event on Google Calendar.

        Returns:
            Tuple of (event_id, meeting_link)
        """
        event_body = {
            "summary": title,
            "description": description,
            "start": {
                "dateTime": booking.start_time.isoformat(),
                "timeZone": booking.timezone or "UTC",
            },
            "end": {
                "dateTime": booking.end_time.isoformat(),
                "timeZone": booking.timezone or "UTC",
            },
            "attendees": [
                {"email": booking.invitee_email, "displayName": booking.invitee_name},
            ],
        }

        # Request Google Meet link generation
        if create_meet_link and not booking.meeting_link:
            import uuid
            event_body["conferenceData"] = {
                "createRequest": {
                    "requestId": str(uuid.uuid4()),
                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                }
            }
        elif booking.meeting_link:
            event_body["conferenceData"] = {
                "entryPoints": [{"entryPointType": "video", "uri": booking.meeting_link}]
            }

        async with httpx.AsyncClient() as client:
            # Add conferenceDataVersion=1 to enable Meet link generation
            url = f"{GOOGLE_CALENDAR_API}/calendars/{connection.calendar_id}/events"
            if create_meet_link and not booking.meeting_link:
                url += "?conferenceDataVersion=1"

            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {connection.access_token}",
                    "Content-Type": "application/json",
                },
                json=event_body,
                timeout=30.0,
            )

            if response.status_code not in (200, 201):
                logger.error(f"Google Calendar event creation failed: {response.text}")
                raise CalendarSyncServiceError("Failed to create Google Calendar event")

            event = response.json()

        # Extract meeting link from response
        meeting_link = None
        conference_data = event.get("conferenceData", {})
        entry_points = conference_data.get("entryPoints", [])
        for entry in entry_points:
            if entry.get("entryPointType") == "video":
                meeting_link = entry.get("uri")
                break

        return event["id"], meeting_link

    async def _create_microsoft_event(
        self,
        connection: CalendarConnection,
        booking: Booking,
        title: str,
        description: str,
        create_teams_link: bool = True,
    ) -> tuple[str, str | None]:
        """Create event on Microsoft Outlook Calendar.

        Returns:
            Tuple of (event_id, meeting_link)
        """
        event_body = {
            "subject": title,
            "body": {
                "contentType": "text",
                "content": description,
            },
            "start": {
                "dateTime": booking.start_time.strftime("%Y-%m-%dT%H:%M:%S"),
                "timeZone": booking.timezone or "UTC",
            },
            "end": {
                "dateTime": booking.end_time.strftime("%Y-%m-%dT%H:%M:%S"),
                "timeZone": booking.timezone or "UTC",
            },
            "attendees": [
                {
                    "emailAddress": {
                        "address": booking.invitee_email,
                        "name": booking.invitee_name,
                    },
                    "type": "required",
                }
            ],
        }

        # Request Teams meeting link generation
        if create_teams_link and not booking.meeting_link:
            event_body["isOnlineMeeting"] = True
            event_body["onlineMeetingProvider"] = "teamsForBusiness"
        elif booking.meeting_link:
            event_body["onlineMeeting"] = {
                "joinUrl": booking.meeting_link,
            }

        # Construct URL based on calendar_id
        if connection.calendar_id == "primary":
            url = f"{MICROSOFT_GRAPH_API}/me/calendar/events"
        else:
            url = f"{MICROSOFT_GRAPH_API}/me/calendars/{connection.calendar_id}/events"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {connection.access_token}",
                    "Content-Type": "application/json",
                },
                json=event_body,
                timeout=30.0,
            )

            if response.status_code not in (200, 201):
                logger.error(f"Microsoft Calendar event creation failed: {response.text}")
                raise CalendarSyncServiceError("Failed to create Microsoft Calendar event")

            event = response.json()

        # Extract meeting link from response
        meeting_link = None
        online_meeting = event.get("onlineMeeting")
        if online_meeting:
            meeting_link = online_meeting.get("joinUrl")

        return event["id"], meeting_link

    async def create_calendar_events_for_team(
        self,
        booking: Booking,
        attendee_user_ids: list[str],
    ) -> list[dict]:
        """Create calendar events for all team members (host + attendees).

        This creates events on each team member's connected calendar.
        The meeting link is generated from the host's calendar event.
        """
        results = []

        # Create event for host first (this generates the meeting link)
        if booking.host_id:
            host_result = await self.create_calendar_event(booking)
            if host_result:
                results.append({
                    "user_id": booking.host_id,
                    "role": "host",
                    **host_result,
                })

        # Get event details for attendee events
        event_type = booking.event_type
        event_title = f"{event_type.name if event_type else 'Meeting'} with {booking.invitee_name}"
        event_description = self._build_event_description(booking)

        # Create events for each attendee (without generating new meeting links)
        for user_id in attendee_user_ids:
            # Skip if user is the host (already created)
            if user_id == booking.host_id:
                continue

            # Get user's primary calendar connection
            stmt = select(CalendarConnection).where(
                and_(
                    CalendarConnection.user_id == user_id,
                    CalendarConnection.create_events == True,
                    CalendarConnection.is_primary == True,
                )
            )
            result = await self.db.execute(stmt)
            connection = result.scalar_one_or_none()

            if not connection:
                continue

            try:
                connection = await self._refresh_token_if_needed(connection)

                if connection.provider == CalendarProvider.GOOGLE.value:
                    event_id, _ = await self._create_google_event(
                        connection, booking, event_title, event_description,
                        create_meet_link=False  # Use existing meeting link
                    )
                elif connection.provider == CalendarProvider.MICROSOFT.value:
                    event_id, _ = await self._create_microsoft_event(
                        connection, booking, event_title, event_description,
                        create_teams_link=False  # Use existing meeting link
                    )
                else:
                    continue

                results.append({
                    "user_id": user_id,
                    "role": "attendee",
                    "calendar_event_id": event_id,
                    "calendar_provider": connection.provider,
                    "connection_id": connection.id,
                })

            except Exception as e:
                logger.error(f"Failed to create calendar event for attendee {user_id}: {e}")
                continue

        return results

    async def update_calendar_event(
        self,
        booking: Booking,
    ) -> dict | None:
        """Update a calendar event for a booking."""
        if not booking.calendar_event_id or not booking.host_id:
            return None

        # Get the connection used for this booking
        stmt = select(CalendarConnection).where(
            and_(
                CalendarConnection.user_id == booking.host_id,
                CalendarConnection.provider == booking.calendar_provider,
                CalendarConnection.create_events == True,
            )
        )
        result = await self.db.execute(stmt)
        connection = result.scalar_one_or_none()

        if not connection:
            return None

        try:
            connection = await self._refresh_token_if_needed(connection)

            event_type = booking.event_type
            event_title = f"{event_type.name if event_type else 'Meeting'} with {booking.guest_name}"
            event_description = self._build_event_description(booking)

            if connection.provider == CalendarProvider.GOOGLE.value:
                await self._update_google_event(
                    connection, booking.calendar_event_id, booking, event_title, event_description
                )
            elif connection.provider == CalendarProvider.MICROSOFT.value:
                await self._update_microsoft_event(
                    connection, booking.calendar_event_id, booking, event_title, event_description
                )

            return {
                "calendar_event_id": booking.calendar_event_id,
                "updated": True,
            }

        except Exception as e:
            logger.error(f"Failed to update calendar event: {e}")
            return None

    async def _update_google_event(
        self,
        connection: CalendarConnection,
        event_id: str,
        booking: Booking,
        title: str,
        description: str,
    ) -> None:
        """Update event on Google Calendar."""
        event_body = {
            "summary": title,
            "description": description,
            "start": {
                "dateTime": booking.start_time.isoformat(),
                "timeZone": booking.timezone or "UTC",
            },
            "end": {
                "dateTime": booking.end_time.isoformat(),
                "timeZone": booking.timezone or "UTC",
            },
        }

        async with httpx.AsyncClient() as client:
            response = await client.patch(
                f"{GOOGLE_CALENDAR_API}/calendars/{connection.calendar_id}/events/{event_id}",
                headers={
                    "Authorization": f"Bearer {connection.access_token}",
                    "Content-Type": "application/json",
                },
                json=event_body,
                timeout=30.0,
            )

            if response.status_code != 200:
                logger.error(f"Google Calendar event update failed: {response.text}")
                raise CalendarSyncServiceError("Failed to update Google Calendar event")

    async def _update_microsoft_event(
        self,
        connection: CalendarConnection,
        event_id: str,
        booking: Booking,
        title: str,
        description: str,
    ) -> None:
        """Update event on Microsoft Outlook Calendar."""
        event_body = {
            "subject": title,
            "body": {
                "contentType": "text",
                "content": description,
            },
            "start": {
                "dateTime": booking.start_time.strftime("%Y-%m-%dT%H:%M:%S"),
                "timeZone": booking.timezone or "UTC",
            },
            "end": {
                "dateTime": booking.end_time.strftime("%Y-%m-%dT%H:%M:%S"),
                "timeZone": booking.timezone or "UTC",
            },
        }

        # Construct URL based on calendar_id
        if connection.calendar_id == "primary":
            url = f"{MICROSOFT_GRAPH_API}/me/calendar/events/{event_id}"
        else:
            url = f"{MICROSOFT_GRAPH_API}/me/calendars/{connection.calendar_id}/events/{event_id}"

        async with httpx.AsyncClient() as client:
            response = await client.patch(
                url,
                headers={
                    "Authorization": f"Bearer {connection.access_token}",
                    "Content-Type": "application/json",
                },
                json=event_body,
                timeout=30.0,
            )

            if response.status_code != 200:
                logger.error(f"Microsoft Calendar event update failed: {response.text}")
                raise CalendarSyncServiceError("Failed to update Microsoft Calendar event")

    async def delete_calendar_event(
        self,
        booking: Booking,
    ) -> bool:
        """Delete a calendar event for a cancelled booking."""
        if not booking.calendar_event_id or not booking.host_id:
            return False

        # Get the connection
        stmt = select(CalendarConnection).where(
            and_(
                CalendarConnection.user_id == booking.host_id,
                CalendarConnection.provider == booking.calendar_provider,
            )
        )
        result = await self.db.execute(stmt)
        connection = result.scalar_one_or_none()

        if not connection:
            return False

        try:
            connection = await self._refresh_token_if_needed(connection)

            if connection.provider == CalendarProvider.GOOGLE.value:
                await self._delete_google_event(connection, booking.calendar_event_id)
            elif connection.provider == CalendarProvider.MICROSOFT.value:
                await self._delete_microsoft_event(connection, booking.calendar_event_id)

            return True

        except Exception as e:
            logger.error(f"Failed to delete calendar event: {e}")
            return False

    async def _delete_google_event(
        self,
        connection: CalendarConnection,
        event_id: str,
    ) -> None:
        """Delete event from Google Calendar."""
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{GOOGLE_CALENDAR_API}/calendars/{connection.calendar_id}/events/{event_id}",
                headers={
                    "Authorization": f"Bearer {connection.access_token}",
                },
                timeout=30.0,
            )

            # 204 = success, 404 = already deleted (ok), 410 = gone (ok)
            if response.status_code not in (204, 404, 410):
                logger.error(f"Google Calendar event deletion failed: {response.text}")
                raise CalendarSyncServiceError("Failed to delete Google Calendar event")

    async def _delete_microsoft_event(
        self,
        connection: CalendarConnection,
        event_id: str,
    ) -> None:
        """Delete event from Microsoft Outlook Calendar."""
        # Construct URL based on calendar_id
        if connection.calendar_id == "primary":
            url = f"{MICROSOFT_GRAPH_API}/me/calendar/events/{event_id}"
        else:
            url = f"{MICROSOFT_GRAPH_API}/me/calendars/{connection.calendar_id}/events/{event_id}"

        async with httpx.AsyncClient() as client:
            response = await client.delete(
                url,
                headers={
                    "Authorization": f"Bearer {connection.access_token}",
                },
                timeout=30.0,
            )

            # 204 = success, 404 = already deleted (ok)
            if response.status_code not in (204, 404):
                logger.error(f"Microsoft Calendar event deletion failed: {response.text}")
                raise CalendarSyncServiceError("Failed to delete Microsoft Calendar event")

    # Token management

    async def refresh_token_if_needed(
        self,
        connection_id: str,
    ) -> CalendarConnection:
        """Refresh OAuth token if expired or about to expire (public API)."""
        connection = await self.get_connection(connection_id)
        if not connection:
            raise CalendarConnectionNotFoundError(f"Connection {connection_id} not found")

        return await self._refresh_token_if_needed(connection)

    async def _refresh_token_if_needed(
        self,
        connection: CalendarConnection,
    ) -> CalendarConnection:
        """Refresh OAuth token if expired or about to expire (internal)."""
        if not connection.token_expires_at:
            return connection

        # Check if token expires within 5 minutes
        now = datetime.now(ZoneInfo("UTC"))
        expires_soon = connection.token_expires_at <= now + timedelta(minutes=5)

        if not expires_soon:
            return connection

        if not connection.refresh_token:
            logger.warning(f"No refresh token for connection {connection.id}")
            return connection

        settings = get_settings()

        try:
            if connection.provider == CalendarProvider.GOOGLE.value:
                await self._refresh_google_token(connection, settings)
            elif connection.provider == CalendarProvider.MICROSOFT.value:
                await self._refresh_microsoft_token(connection, settings)

            await self.db.flush()
            await self.db.refresh(connection)
        except Exception as e:
            logger.error(f"Failed to refresh token for connection {connection.id}: {e}")
            raise CalendarTokenRefreshError(f"Token refresh failed: {e}")

        return connection

    async def _refresh_google_token(
        self,
        connection: CalendarConnection,
        settings,
    ) -> None:
        """Refresh Google OAuth token."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "refresh_token": connection.refresh_token,
                    "grant_type": "refresh_token",
                },
                timeout=30.0,
            )

            if response.status_code != 200:
                logger.error(f"Google token refresh failed: {response.text}")
                raise CalendarTokenRefreshError("Google token refresh failed")

            token_data = response.json()

        connection.access_token = token_data["access_token"]
        connection.token_expires_at = datetime.now(ZoneInfo("UTC")) + timedelta(
            seconds=token_data.get("expires_in", 3600)
        )
        # Google may return a new refresh token
        if "refresh_token" in token_data:
            connection.refresh_token = token_data["refresh_token"]

    async def _refresh_microsoft_token(
        self,
        connection: CalendarConnection,
        settings,
    ) -> None:
        """Refresh Microsoft OAuth token."""
        tenant = settings.microsoft_tenant_id or "common"
        token_url = MICROSOFT_TOKEN_URL.format(tenant=tenant)

        async with httpx.AsyncClient() as client:
            response = await client.post(
                token_url,
                data={
                    "client_id": settings.microsoft_client_id,
                    "client_secret": settings.microsoft_client_secret,
                    "refresh_token": connection.refresh_token,
                    "grant_type": "refresh_token",
                    "scope": "https://graph.microsoft.com/Calendars.ReadWrite offline_access",
                },
                timeout=30.0,
            )

            if response.status_code != 200:
                logger.error(f"Microsoft token refresh failed: {response.text}")
                raise CalendarTokenRefreshError("Microsoft token refresh failed")

            token_data = response.json()

        connection.access_token = token_data["access_token"]
        connection.token_expires_at = datetime.now(ZoneInfo("UTC")) + timedelta(
            seconds=token_data.get("expires_in", 3600)
        )
        # Microsoft always returns a new refresh token
        if "refresh_token" in token_data:
            connection.refresh_token = token_data["refresh_token"]

    async def get_connections_needing_sync(
        self,
        since_minutes: int = 5,
    ) -> list[CalendarConnection]:
        """Get connections that need syncing."""
        cutoff = datetime.now(ZoneInfo("UTC")) - timedelta(minutes=since_minutes)

        stmt = select(CalendarConnection).where(
            and_(
                CalendarConnection.sync_enabled == True,
                (
                    (CalendarConnection.last_synced_at == None)
                    | (CalendarConnection.last_synced_at < cutoff)
                ),
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
