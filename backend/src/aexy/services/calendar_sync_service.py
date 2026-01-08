"""Calendar Sync Service for syncing events from Google Calendar."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.core.config import get_settings
from aexy.models.google_integration import (
    GoogleIntegration,
    SyncedCalendarEvent,
    SyncedCalendarEventRecordLink,
)
from aexy.models.crm import CRMActivity, CRMRecord, CRMActivityType

logger = logging.getLogger(__name__)
settings = get_settings()

# Google Calendar API URLs
CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"

# Calendar API scopes required
CALENDAR_SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
]


class CalendarSyncError(Exception):
    """Calendar sync error."""

    pass


class CalendarAuthError(CalendarSyncError):
    """Calendar authentication error."""

    pass


class CalendarSyncService:
    """Service for syncing Google Calendar events."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _refresh_token_if_needed(
        self, integration: GoogleIntegration
    ) -> str:
        """Refresh the access token if it's about to expire.

        Returns the current or refreshed access token.
        """
        # Check if token expires within 5 minutes
        if integration.token_expiry and integration.token_expiry > datetime.now(
            timezone.utc
        ) + timedelta(minutes=5):
            return integration.access_token

        # Refresh the token
        if not integration.refresh_token:
            raise CalendarAuthError("No refresh token available")

        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "refresh_token": integration.refresh_token,
                    "grant_type": "refresh_token",
                },
            )

            if response.status_code != 200:
                logger.error(f"Failed to refresh token: {response.text}")
                raise CalendarAuthError("Failed to refresh Google token")

            token_data = response.json()
            integration.access_token = token_data["access_token"]
            integration.token_expiry = datetime.now(timezone.utc) + timedelta(
                seconds=token_data.get("expires_in", 3600)
            )
            await self.db.flush()

            return integration.access_token

    async def _make_calendar_request(
        self,
        integration: GoogleIntegration,
        method: str,
        endpoint: str,
        **kwargs,
    ) -> dict:
        """Make an authenticated request to the Calendar API."""
        access_token = await self._refresh_token_if_needed(integration)

        async with httpx.AsyncClient() as client:
            response = await client.request(
                method,
                f"{CALENDAR_API_BASE}{endpoint}",
                headers={"Authorization": f"Bearer {access_token}"},
                **kwargs,
            )

            if response.status_code == 401:
                raise CalendarAuthError("Calendar authentication failed")

            if response.status_code >= 400:
                logger.error(f"Calendar API error: {response.status_code} - {response.text}")
                raise CalendarSyncError(f"Calendar API error: {response.status_code}")

            return response.json()

    async def list_calendars(self, integration: GoogleIntegration) -> list[dict]:
        """List all calendars accessible by the user."""
        response = await self._make_calendar_request(
            integration,
            "GET",
            "/users/me/calendarList",
        )

        calendars = []
        for item in response.get("items", []):
            calendars.append({
                "id": item["id"],
                "summary": item.get("summary", ""),
                "description": item.get("description", ""),
                "primary": item.get("primary", False),
                "access_role": item.get("accessRole", ""),
                "background_color": item.get("backgroundColor", ""),
                "foreground_color": item.get("foregroundColor", ""),
            })

        return calendars

    async def start_calendar_sync(
        self,
        integration: GoogleIntegration,
        calendar_ids: list[str] | None = None,
        days_back: int = 30,
        days_forward: int = 90,
    ) -> dict:
        """Sync events from specified calendars.

        Args:
            integration: The Google integration
            calendar_ids: List of calendar IDs to sync. If None, syncs primary calendar.
            days_back: Number of days in the past to sync
            days_forward: Number of days in the future to sync

        Returns:
            Sync statistics
        """
        if not integration.calendar_sync_enabled:
            return {"error": "Calendar sync not enabled"}

        # Default to primary calendar
        if not calendar_ids:
            calendar_ids = ["primary"]

        # Calculate time range
        time_min = datetime.now(timezone.utc) - timedelta(days=days_back)
        time_max = datetime.now(timezone.utc) + timedelta(days=days_forward)

        total_events_synced = 0
        synced_calendar_ids = []
        errors = []

        for calendar_id in calendar_ids:
            try:
                result = await self._sync_calendar(
                    integration,
                    calendar_id,
                    time_min,
                    time_max,
                )
                total_events_synced += result["events_synced"]
                synced_calendar_ids.append(calendar_id)
            except Exception as e:
                logger.error(f"Failed to sync calendar {calendar_id}: {e}")
                errors.append({"calendar_id": calendar_id, "error": str(e)})

        # Update last sync time
        integration.calendar_last_sync_at = datetime.now(timezone.utc)
        await self.db.flush()

        return {
            "events_synced": total_events_synced,
            "calendars_synced": synced_calendar_ids,
            "errors": errors if errors else None,
            "error": errors[0]["error"] if errors else None,
        }

    async def _sync_calendar(
        self,
        integration: GoogleIntegration,
        calendar_id: str,
        time_min: datetime,
        time_max: datetime,
    ) -> dict:
        """Sync events from a single calendar."""
        events_synced = 0
        page_token = None

        while True:
            params: dict[str, Any] = {
                "timeMin": time_min.isoformat(),
                "timeMax": time_max.isoformat(),
                "singleEvents": True,  # Expand recurring events
                "orderBy": "startTime",
                "maxResults": 100,
            }
            if page_token:
                params["pageToken"] = page_token

            response = await self._make_calendar_request(
                integration,
                "GET",
                f"/calendars/{calendar_id}/events",
                params=params,
            )

            events = response.get("items", [])
            for event in events:
                try:
                    await self._sync_event(integration, calendar_id, event)
                    events_synced += 1
                except Exception as e:
                    logger.error(f"Failed to sync event {event.get('id')}: {e}")

            # Check for more pages
            page_token = response.get("nextPageToken")
            if not page_token:
                break

            # Store sync token for incremental sync
            if response.get("nextSyncToken"):
                integration.calendar_sync_token = response["nextSyncToken"]
                await self.db.flush()

        return {"events_synced": events_synced}

    async def sync_events_incremental(
        self, integration: GoogleIntegration, calendar_id: str = "primary"
    ) -> dict:
        """Sync events incrementally using sync token."""
        if not integration.calendar_sync_token:
            # No sync token - do full sync
            return await self.start_calendar_sync(integration, [calendar_id])

        events_synced = 0
        events_deleted = 0

        try:
            response = await self._make_calendar_request(
                integration,
                "GET",
                f"/calendars/{calendar_id}/events",
                params={"syncToken": integration.calendar_sync_token},
            )

            for event in response.get("items", []):
                if event.get("status") == "cancelled":
                    # Delete the event
                    await self._delete_event(integration.workspace_id, event["id"])
                    events_deleted += 1
                else:
                    await self._sync_event(integration, calendar_id, event)
                    events_synced += 1

            # Update sync token
            if response.get("nextSyncToken"):
                integration.calendar_sync_token = response["nextSyncToken"]
                await self.db.flush()

            return {
                "events_synced": events_synced,
                "events_deleted": events_deleted,
            }

        except CalendarSyncError as e:
            if "syncToken" in str(e).lower() or "410" in str(e):
                # Sync token expired - do full sync
                integration.calendar_sync_token = None
                await self.db.flush()
                return await self.start_calendar_sync(integration, [calendar_id])
            raise

    async def _sync_event(
        self,
        integration: GoogleIntegration,
        calendar_id: str,
        event: dict,
    ) -> SyncedCalendarEvent:
        """Sync a single event."""
        event_id = event["id"]

        # Check if already exists
        result = await self.db.execute(
            select(SyncedCalendarEvent).where(
                SyncedCalendarEvent.google_event_id == event_id
            )
        )
        existing = result.scalar_one_or_none()

        # Parse event data
        event_data = self._parse_event(event)

        if existing:
            # Update existing event
            for key, value in event_data.items():
                setattr(existing, key, value)
            existing.google_calendar_id = calendar_id
            await self.db.flush()
            return existing

        # Create new event
        synced_event = SyncedCalendarEvent(
            workspace_id=integration.workspace_id,
            integration_id=integration.id,
            google_event_id=event_id,
            google_calendar_id=calendar_id,
            **event_data,
        )
        self.db.add(synced_event)
        await self.db.flush()

        return synced_event

    def _parse_event(self, event: dict) -> dict:
        """Parse Google Calendar event into structured data."""
        # Parse start time
        start = event.get("start", {})
        start_time = None
        is_all_day = False
        timezone_str = None

        if "dateTime" in start:
            start_time = datetime.fromisoformat(start["dateTime"].replace("Z", "+00:00"))
            timezone_str = start.get("timeZone")
        elif "date" in start:
            start_time = datetime.strptime(start["date"], "%Y-%m-%d").replace(
                tzinfo=timezone.utc
            )
            is_all_day = True

        # Parse end time
        end = event.get("end", {})
        end_time = None
        if "dateTime" in end:
            end_time = datetime.fromisoformat(end["dateTime"].replace("Z", "+00:00"))
        elif "date" in end:
            end_time = datetime.strptime(end["date"], "%Y-%m-%d").replace(
                tzinfo=timezone.utc
            )

        # Parse attendees
        attendees = []
        for attendee in event.get("attendees", []):
            attendees.append({
                "email": attendee.get("email"),
                "display_name": attendee.get("displayName"),
                "response_status": attendee.get("responseStatus"),
                "organizer": attendee.get("organizer", False),
                "self": attendee.get("self", False),
            })

        # Get organizer
        organizer = event.get("organizer", {})
        organizer_email = organizer.get("email")

        # Parse recurrence
        recurrence = event.get("recurrence")
        recurrence_rule = recurrence[0] if recurrence else None

        return {
            "title": event.get("summary"),
            "description": event.get("description"),
            "location": event.get("location"),
            "start_time": start_time,
            "end_time": end_time,
            "is_all_day": is_all_day,
            "timezone": timezone_str,
            "attendees": attendees if attendees else None,
            "organizer_email": organizer_email,
            "status": event.get("status"),
            "visibility": event.get("visibility"),
            "recurrence_rule": recurrence_rule,
            "recurring_event_id": event.get("recurringEventId"),
            "etag": event.get("etag"),
            "html_link": event.get("htmlLink"),
            "conference_data": event.get("conferenceData"),
        }

    async def _delete_event(self, workspace_id: str, google_event_id: str) -> bool:
        """Delete a synced event."""
        result = await self.db.execute(
            select(SyncedCalendarEvent).where(
                SyncedCalendarEvent.workspace_id == workspace_id,
                SyncedCalendarEvent.google_event_id == google_event_id,
            )
        )
        event = result.scalar_one_or_none()
        if event:
            await self.db.delete(event)
            return True
        return False

    async def create_event(
        self,
        integration: GoogleIntegration,
        calendar_id: str,
        title: str,
        start_time: datetime,
        end_time: datetime,
        description: str | None = None,
        location: str | None = None,
        attendees: list[str] | None = None,
        timezone_str: str | None = None,
    ) -> dict:
        """Create an event in Google Calendar."""
        event_body: dict[str, Any] = {
            "summary": title,
            "start": {
                "dateTime": start_time.isoformat(),
                "timeZone": timezone_str or "UTC",
            },
            "end": {
                "dateTime": end_time.isoformat(),
                "timeZone": timezone_str or "UTC",
            },
        }

        if description:
            event_body["description"] = description
        if location:
            event_body["location"] = location
        if attendees:
            event_body["attendees"] = [{"email": email} for email in attendees]

        response = await self._make_calendar_request(
            integration,
            "POST",
            f"/calendars/{calendar_id}/events",
            json=event_body,
        )

        # Sync the created event
        await self._sync_event(integration, calendar_id, response)

        return {
            "event_id": response.get("id"),
            "html_link": response.get("htmlLink"),
        }

    async def update_event(
        self,
        integration: GoogleIntegration,
        calendar_id: str,
        event_id: str,
        updates: dict,
    ) -> dict:
        """Update an event in Google Calendar."""
        # Get existing event first
        existing = await self._make_calendar_request(
            integration,
            "GET",
            f"/calendars/{calendar_id}/events/{event_id}",
        )

        # Merge updates
        if "title" in updates:
            existing["summary"] = updates["title"]
        if "description" in updates:
            existing["description"] = updates["description"]
        if "location" in updates:
            existing["location"] = updates["location"]
        if "start_time" in updates:
            existing["start"] = {
                "dateTime": updates["start_time"].isoformat(),
                "timeZone": updates.get("timezone", "UTC"),
            }
        if "end_time" in updates:
            existing["end"] = {
                "dateTime": updates["end_time"].isoformat(),
                "timeZone": updates.get("timezone", "UTC"),
            }

        response = await self._make_calendar_request(
            integration,
            "PUT",
            f"/calendars/{calendar_id}/events/{event_id}",
            json=existing,
        )

        # Sync the updated event
        await self._sync_event(integration, calendar_id, response)

        return {
            "event_id": response.get("id"),
            "html_link": response.get("htmlLink"),
        }

    async def link_events_to_records(
        self,
        workspace_id: str,
        event_ids: list[str] | None = None,
    ) -> dict:
        """Link synced events to CRM records by attendee email matching."""
        # Get events to process
        query = select(SyncedCalendarEvent).where(
            SyncedCalendarEvent.workspace_id == workspace_id
        )
        if event_ids:
            query = query.where(SyncedCalendarEvent.id.in_(event_ids))

        result = await self.db.execute(query)
        events = result.scalars().all()

        # Get all records with email attributes
        records_result = await self.db.execute(
            select(CRMRecord)
            .where(CRMRecord.workspace_id == workspace_id)
            .options(selectinload(CRMRecord.object))
        )
        records = records_result.scalars().all()

        # Build email -> record mapping
        email_to_records: dict[str, list[CRMRecord]] = {}
        for record in records:
            if not record.values:
                continue
            for key, value in record.values.items():
                if isinstance(value, str) and "@" in value:
                    email_lower = value.lower()
                    if email_lower not in email_to_records:
                        email_to_records[email_lower] = []
                    email_to_records[email_lower].append(record)

        links_created = 0
        for event in events:
            # Check organizer
            if event.organizer_email:
                for record in email_to_records.get(event.organizer_email.lower(), []):
                    if await self._create_event_link(event, record, "organizer"):
                        links_created += 1

            # Check attendees
            for attendee in event.attendees or []:
                attendee_email = attendee.get("email", "").lower()
                for record in email_to_records.get(attendee_email, []):
                    if await self._create_event_link(event, record, "attendee"):
                        links_created += 1

        await self.db.flush()
        return {"links_created": links_created}

    async def _create_event_link(
        self,
        event: SyncedCalendarEvent,
        record: CRMRecord,
        link_type: str,
    ) -> bool:
        """Create a link between an event and a record if it doesn't exist."""
        # Check if link already exists
        result = await self.db.execute(
            select(SyncedCalendarEventRecordLink).where(
                SyncedCalendarEventRecordLink.event_id == event.id,
                SyncedCalendarEventRecordLink.record_id == record.id,
            )
        )
        if result.scalar_one_or_none():
            return False

        link = SyncedCalendarEventRecordLink(
            event_id=event.id,
            record_id=record.id,
            link_type=link_type,
            confidence=1.0,
        )
        self.db.add(link)
        return True

    async def create_crm_activity_for_event(
        self,
        workspace_id: str,
        event: SyncedCalendarEvent,
        record_id: str,
    ) -> CRMActivity:
        """Create a CRM activity record for a calendar event."""
        activity = CRMActivity(
            workspace_id=workspace_id,
            record_id=record_id,
            activity_type=CRMActivityType.MEETING,
            title=event.title or "Meeting",
            description=event.description,
            scheduled_at=event.start_time,
            completed_at=event.end_time if event.end_time and event.end_time < datetime.now(timezone.utc) else None,
            is_completed=event.end_time and event.end_time < datetime.now(timezone.utc),
            metadata={
                "google_event_id": event.google_event_id,
                "location": event.location,
                "attendees": event.attendees,
                "html_link": event.html_link,
            },
        )
        self.db.add(activity)
        await self.db.flush()

        # Link activity to event
        event.crm_activity_id = activity.id
        await self.db.flush()

        return activity
