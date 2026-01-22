"""Calendar sync service for booking module."""

from datetime import date, datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.booking import CalendarConnection, CalendarProvider, Booking


class CalendarSyncServiceError(Exception):
    """Base exception for calendar sync service errors."""

    pass


class CalendarConnectionNotFoundError(CalendarSyncServiceError):
    """Calendar connection not found."""

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

        This would integrate with the actual calendar APIs.
        For now, returns an empty list as a placeholder.
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
        connections = result.scalars().all()

        busy_times = []

        for connection in connections:
            # This would call the actual calendar API
            # For Google: Google Calendar API freeBusy query
            # For Microsoft: Microsoft Graph API schedule/getSchedule

            # Placeholder - would be replaced with actual API calls
            pass

        return busy_times

    # Calendar event management

    async def create_calendar_event(
        self,
        booking: Booking,
        connection_id: str | None = None,
    ) -> dict | None:
        """Create a calendar event for a booking.

        This would integrate with the actual calendar APIs.
        """
        if not booking.host_id:
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
            return None

        # This would call the actual calendar API to create the event
        # For Google: Google Calendar API events.insert
        # For Microsoft: Microsoft Graph API events

        # Placeholder response
        return {
            "calendar_event_id": f"placeholder_{booking.id}",
            "calendar_provider": connection.provider,
            "connection_id": connection.id,
        }

    async def create_calendar_events_for_team(
        self,
        booking: Booking,
        attendee_user_ids: list[str],
    ) -> list[dict]:
        """Create calendar events for all team members (host + attendees).

        This creates events on each team member's connected calendar.
        """
        results = []

        # Create event for host
        if booking.host_id:
            host_result = await self.create_calendar_event(booking)
            if host_result:
                results.append({
                    "user_id": booking.host_id,
                    "role": "host",
                    **host_result,
                })

        # Create events for each attendee
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

            if connection:
                # This would call the actual calendar API to create the event
                # For Google: Google Calendar API events.insert
                # For Microsoft: Microsoft Graph API events

                results.append({
                    "user_id": user_id,
                    "role": "attendee",
                    "calendar_event_id": f"placeholder_{booking.id}_{user_id}",
                    "calendar_provider": connection.provider,
                    "connection_id": connection.id,
                })

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

        # This would call the actual calendar API to update the event
        return {
            "calendar_event_id": booking.calendar_event_id,
            "updated": True,
        }

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

        # This would call the actual calendar API to delete the event
        return True

    # Token management

    async def refresh_token_if_needed(
        self,
        connection_id: str,
    ) -> CalendarConnection:
        """Refresh OAuth token if expired or about to expire."""
        connection = await self.get_connection(connection_id)
        if not connection:
            raise CalendarConnectionNotFoundError(f"Connection {connection_id} not found")

        if not connection.token_expires_at:
            return connection

        # Check if token expires within 5 minutes
        now = datetime.now(ZoneInfo("UTC"))
        expires_soon = connection.token_expires_at <= now + timedelta(minutes=5)

        if expires_soon and connection.refresh_token:
            # This would call the OAuth provider to refresh the token
            # For Google: POST to https://oauth2.googleapis.com/token
            # For Microsoft: POST to https://login.microsoftonline.com/token

            # Placeholder - would be replaced with actual refresh logic
            pass

        return connection

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
