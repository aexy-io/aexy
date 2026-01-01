"""On-call scheduling service.

Provides functionality for:
- Enabling/disabling on-call for teams
- Managing on-call schedules
- Handling swap requests
- Creating overrides
"""

from datetime import datetime, timezone, timedelta
from uuid import uuid4

from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devograph.models.oncall import (
    OnCallConfig,
    OnCallSchedule,
    OnCallSwapRequest,
    SwapRequestStatus,
)
from devograph.models.team import Team, TeamMember
from devograph.models.developer import Developer
from devograph.models.notification import NotificationEventType
from devograph.schemas.oncall import (
    OnCallConfigCreate,
    OnCallConfigUpdate,
    OnCallScheduleCreate,
    DeveloperBrief,
)


class OnCallServiceError(Exception):
    """Base exception for on-call service errors."""
    pass


class OnCallNotEnabledError(OnCallServiceError):
    """On-call is not enabled for this team."""
    pass


class ScheduleConflictError(OnCallServiceError):
    """Schedule conflicts with existing schedule."""
    pass


class SwapNotAllowedError(OnCallServiceError):
    """Swap is not allowed."""
    pass


class OnCallService:
    """Service for on-call schedule management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # Config Management
    # =========================================================================

    async def get_config(self, team_id: str) -> OnCallConfig | None:
        """Get on-call config for a team."""
        stmt = (
            select(OnCallConfig)
            .where(OnCallConfig.team_id == team_id)
            .options(selectinload(OnCallConfig.schedules))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def enable_oncall(
        self,
        team_id: str,
        config: OnCallConfigCreate,
    ) -> OnCallConfig:
        """Enable on-call for a team.

        Args:
            team_id: Team ID to enable on-call for.
            config: Configuration settings.

        Returns:
            Created OnCallConfig.
        """
        # Check if already enabled
        existing = await self.get_config(team_id)
        if existing:
            # Update existing config
            existing.is_enabled = True
            existing.timezone = config.timezone
            existing.default_shift_duration_hours = config.default_shift_duration_hours
            existing.slack_channel_id = config.slack_channel_id
            existing.notify_before_shift_minutes = config.notify_before_shift_minutes
            existing.notify_on_shift_change = config.notify_on_shift_change
            await self.db.flush()
            await self.db.refresh(existing)
            return existing

        # Create new config
        oncall_config = OnCallConfig(
            id=str(uuid4()),
            team_id=team_id,
            is_enabled=True,
            timezone=config.timezone,
            default_shift_duration_hours=config.default_shift_duration_hours,
            slack_channel_id=config.slack_channel_id,
            notify_before_shift_minutes=config.notify_before_shift_minutes,
            notify_on_shift_change=config.notify_on_shift_change,
        )
        self.db.add(oncall_config)
        await self.db.flush()
        await self.db.refresh(oncall_config)
        return oncall_config

    async def disable_oncall(self, team_id: str) -> None:
        """Disable on-call for a team."""
        config = await self.get_config(team_id)
        if config:
            config.is_enabled = False
            await self.db.flush()

    async def update_config(
        self,
        team_id: str,
        updates: OnCallConfigUpdate,
    ) -> OnCallConfig | None:
        """Update on-call config for a team."""
        config = await self.get_config(team_id)
        if not config:
            return None

        if updates.timezone is not None:
            config.timezone = updates.timezone
        if updates.default_shift_duration_hours is not None:
            config.default_shift_duration_hours = updates.default_shift_duration_hours
        if updates.google_calendar_enabled is not None:
            config.google_calendar_enabled = updates.google_calendar_enabled
        if updates.google_calendar_id is not None:
            config.google_calendar_id = updates.google_calendar_id
        if updates.slack_channel_id is not None:
            config.slack_channel_id = updates.slack_channel_id
        if updates.notify_before_shift_minutes is not None:
            config.notify_before_shift_minutes = updates.notify_before_shift_minutes
        if updates.notify_on_shift_change is not None:
            config.notify_on_shift_change = updates.notify_on_shift_change

        await self.db.flush()
        await self.db.refresh(config)
        return config

    # =========================================================================
    # Schedule Management
    # =========================================================================

    async def get_schedules(
        self,
        team_id: str,
        start_date: datetime,
        end_date: datetime,
    ) -> list[OnCallSchedule]:
        """Get schedules for a team within a date range."""
        config = await self.get_config(team_id)
        if not config:
            return []

        stmt = (
            select(OnCallSchedule)
            .where(
                OnCallSchedule.config_id == config.id,
                or_(
                    # Schedule starts within range
                    and_(
                        OnCallSchedule.start_time >= start_date,
                        OnCallSchedule.start_time < end_date,
                    ),
                    # Schedule ends within range
                    and_(
                        OnCallSchedule.end_time > start_date,
                        OnCallSchedule.end_time <= end_date,
                    ),
                    # Schedule spans entire range
                    and_(
                        OnCallSchedule.start_time < start_date,
                        OnCallSchedule.end_time > end_date,
                    ),
                ),
            )
            .options(
                selectinload(OnCallSchedule.developer),
                selectinload(OnCallSchedule.original_developer),
            )
            .order_by(OnCallSchedule.start_time)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_schedule(self, schedule_id: str) -> OnCallSchedule | None:
        """Get a schedule by ID."""
        stmt = (
            select(OnCallSchedule)
            .where(OnCallSchedule.id == schedule_id)
            .options(
                selectinload(OnCallSchedule.developer),
                selectinload(OnCallSchedule.original_developer),
                selectinload(OnCallSchedule.config),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_schedule(
        self,
        team_id: str,
        schedule: OnCallScheduleCreate,
        created_by_id: str,
    ) -> OnCallSchedule:
        """Create a single on-call schedule.

        Args:
            team_id: Team ID.
            schedule: Schedule details.
            created_by_id: Who is creating this schedule.

        Returns:
            Created OnCallSchedule.

        Raises:
            OnCallNotEnabledError: If on-call is not enabled.
            ScheduleConflictError: If schedule overlaps with existing.
        """
        config = await self.get_config(team_id)
        if not config or not config.is_enabled:
            raise OnCallNotEnabledError("On-call is not enabled for this team")

        # Check for overlapping schedules
        await self._check_schedule_conflict(
            config.id,
            schedule.developer_id,
            schedule.start_time,
            schedule.end_time,
        )

        new_schedule = OnCallSchedule(
            id=str(uuid4()),
            config_id=config.id,
            developer_id=schedule.developer_id,
            start_time=schedule.start_time,
            end_time=schedule.end_time,
            is_override=False,
            created_by_id=created_by_id,
        )
        self.db.add(new_schedule)
        await self.db.flush()
        await self.db.refresh(new_schedule)
        return new_schedule

    async def create_bulk_schedules(
        self,
        team_id: str,
        schedules: list[OnCallScheduleCreate],
        created_by_id: str,
    ) -> list[OnCallSchedule]:
        """Create multiple schedules at once.

        Args:
            team_id: Team ID.
            schedules: List of schedule details.
            created_by_id: Who is creating these schedules.

        Returns:
            List of created OnCallSchedule objects.
        """
        config = await self.get_config(team_id)
        if not config or not config.is_enabled:
            raise OnCallNotEnabledError("On-call is not enabled for this team")

        created = []
        for schedule in schedules:
            new_schedule = OnCallSchedule(
                id=str(uuid4()),
                config_id=config.id,
                developer_id=schedule.developer_id,
                start_time=schedule.start_time,
                end_time=schedule.end_time,
                is_override=False,
                created_by_id=created_by_id,
            )
            self.db.add(new_schedule)
            created.append(new_schedule)

        await self.db.flush()
        for s in created:
            await self.db.refresh(s)
        return created

    async def update_schedule(
        self,
        schedule_id: str,
        developer_id: str | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
    ) -> OnCallSchedule | None:
        """Update a schedule."""
        schedule = await self.get_schedule(schedule_id)
        if not schedule:
            return None

        if developer_id is not None:
            schedule.developer_id = developer_id
        if start_time is not None:
            schedule.start_time = start_time
        if end_time is not None:
            schedule.end_time = end_time

        await self.db.flush()
        await self.db.refresh(schedule)
        return schedule

    async def delete_schedule(self, schedule_id: str) -> bool:
        """Delete a schedule."""
        schedule = await self.get_schedule(schedule_id)
        if not schedule:
            return False

        await self.db.delete(schedule)
        await self.db.flush()
        return True

    async def _check_schedule_conflict(
        self,
        config_id: str,
        developer_id: str,
        start_time: datetime,
        end_time: datetime,
        exclude_schedule_id: str | None = None,
    ) -> None:
        """Check if a schedule conflicts with existing schedules."""
        stmt = select(OnCallSchedule).where(
            OnCallSchedule.config_id == config_id,
            OnCallSchedule.developer_id == developer_id,
            or_(
                # New schedule starts during existing
                and_(
                    OnCallSchedule.start_time <= start_time,
                    OnCallSchedule.end_time > start_time,
                ),
                # New schedule ends during existing
                and_(
                    OnCallSchedule.start_time < end_time,
                    OnCallSchedule.end_time >= end_time,
                ),
                # New schedule completely contains existing
                and_(
                    OnCallSchedule.start_time >= start_time,
                    OnCallSchedule.end_time <= end_time,
                ),
            ),
        )

        if exclude_schedule_id:
            stmt = stmt.where(OnCallSchedule.id != exclude_schedule_id)

        result = await self.db.execute(stmt)
        if result.scalar_one_or_none():
            raise ScheduleConflictError(
                "Schedule conflicts with existing schedule for this developer"
            )

    # =========================================================================
    # Current On-Call
    # =========================================================================

    async def get_current_oncall(self, team_id: str) -> OnCallSchedule | None:
        """Get the current on-call schedule for a team."""
        config = await self.get_config(team_id)
        if not config or not config.is_enabled:
            return None

        now = datetime.now(timezone.utc)
        stmt = (
            select(OnCallSchedule)
            .where(
                OnCallSchedule.config_id == config.id,
                OnCallSchedule.start_time <= now,
                OnCallSchedule.end_time > now,
            )
            .options(
                selectinload(OnCallSchedule.developer),
                selectinload(OnCallSchedule.original_developer),
            )
            .order_by(OnCallSchedule.start_time.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_next_oncall(self, team_id: str) -> OnCallSchedule | None:
        """Get the next upcoming on-call schedule."""
        config = await self.get_config(team_id)
        if not config or not config.is_enabled:
            return None

        now = datetime.now(timezone.utc)
        stmt = (
            select(OnCallSchedule)
            .where(
                OnCallSchedule.config_id == config.id,
                OnCallSchedule.start_time > now,
            )
            .options(
                selectinload(OnCallSchedule.developer),
            )
            .order_by(OnCallSchedule.start_time)
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_oncall_at(
        self,
        team_id: str,
        timestamp: datetime,
    ) -> OnCallSchedule | None:
        """Get who is on-call at a specific time."""
        config = await self.get_config(team_id)
        if not config or not config.is_enabled:
            return None

        stmt = (
            select(OnCallSchedule)
            .where(
                OnCallSchedule.config_id == config.id,
                OnCallSchedule.start_time <= timestamp,
                OnCallSchedule.end_time > timestamp,
            )
            .options(
                selectinload(OnCallSchedule.developer),
            )
            .order_by(OnCallSchedule.start_time.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    # =========================================================================
    # Swap Management
    # =========================================================================

    async def request_swap(
        self,
        schedule_id: str,
        requester_id: str,
        target_id: str,
        message: str | None = None,
    ) -> OnCallSwapRequest:
        """Request to swap a shift with another team member.

        Args:
            schedule_id: The schedule to swap.
            requester_id: Who is requesting the swap.
            target_id: Who to swap with.
            message: Optional message.

        Returns:
            Created swap request.

        Raises:
            SwapNotAllowedError: If swap is not allowed.
        """
        schedule = await self.get_schedule(schedule_id)
        if not schedule:
            raise SwapNotAllowedError("Schedule not found")

        # Verify requester owns this shift
        if schedule.developer_id != requester_id:
            raise SwapNotAllowedError("You can only request swaps for your own shifts")

        # Check if target is a team member
        config = schedule.config
        stmt = select(TeamMember).where(
            TeamMember.team_id == config.team_id,
            TeamMember.developer_id == target_id,
        )
        result = await self.db.execute(stmt)
        if not result.scalar_one_or_none():
            raise SwapNotAllowedError("Target is not a member of this team")

        # Check for existing pending request
        stmt = select(OnCallSwapRequest).where(
            OnCallSwapRequest.schedule_id == schedule_id,
            OnCallSwapRequest.requester_id == requester_id,
            OnCallSwapRequest.status == SwapRequestStatus.PENDING.value,
        )
        result = await self.db.execute(stmt)
        if result.scalar_one_or_none():
            raise SwapNotAllowedError("You already have a pending swap request for this shift")

        swap_request = OnCallSwapRequest(
            id=str(uuid4()),
            schedule_id=schedule_id,
            requester_id=requester_id,
            target_id=target_id,
            status=SwapRequestStatus.PENDING.value,
            message=message,
        )
        self.db.add(swap_request)
        await self.db.flush()
        await self.db.refresh(swap_request)
        return swap_request

    async def get_swap_request(self, swap_id: str) -> OnCallSwapRequest | None:
        """Get a swap request by ID."""
        stmt = (
            select(OnCallSwapRequest)
            .where(OnCallSwapRequest.id == swap_id)
            .options(
                selectinload(OnCallSwapRequest.schedule),
                selectinload(OnCallSwapRequest.requester),
                selectinload(OnCallSwapRequest.target),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_pending_swaps_for_developer(
        self,
        developer_id: str,
        team_id: str,
    ) -> list[OnCallSwapRequest]:
        """Get pending swap requests targeting a developer."""
        config = await self.get_config(team_id)
        if not config:
            return []

        # Get schedules for this config
        schedule_ids_stmt = select(OnCallSchedule.id).where(
            OnCallSchedule.config_id == config.id
        )

        stmt = (
            select(OnCallSwapRequest)
            .where(
                OnCallSwapRequest.schedule_id.in_(schedule_ids_stmt),
                OnCallSwapRequest.target_id == developer_id,
                OnCallSwapRequest.status == SwapRequestStatus.PENDING.value,
            )
            .options(
                selectinload(OnCallSwapRequest.schedule).selectinload(OnCallSchedule.developer),
                selectinload(OnCallSwapRequest.requester),
                selectinload(OnCallSwapRequest.target),
            )
            .order_by(OnCallSwapRequest.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def accept_swap(
        self,
        swap_id: str,
        responder_id: str,
    ) -> OnCallSwapRequest:
        """Accept a swap request.

        This transfers the schedule to the target developer.
        """
        swap = await self.get_swap_request(swap_id)
        if not swap:
            raise SwapNotAllowedError("Swap request not found")

        if swap.target_id != responder_id:
            raise SwapNotAllowedError("Only the target can accept this swap")

        if swap.status != SwapRequestStatus.PENDING.value:
            raise SwapNotAllowedError("This swap request is no longer pending")

        # Update the schedule
        schedule = swap.schedule
        original_developer_id = schedule.developer_id
        schedule.developer_id = swap.target_id
        schedule.is_override = True
        schedule.original_developer_id = original_developer_id
        schedule.override_reason = f"Swapped from {swap.requester.name or swap.requester.email}"

        # Update the swap request
        swap.status = SwapRequestStatus.ACCEPTED.value
        swap.responded_at = datetime.now(timezone.utc)

        await self.db.flush()
        await self.db.refresh(swap)
        return swap

    async def decline_swap(
        self,
        swap_id: str,
        responder_id: str,
        response_message: str | None = None,
    ) -> OnCallSwapRequest:
        """Decline a swap request."""
        swap = await self.get_swap_request(swap_id)
        if not swap:
            raise SwapNotAllowedError("Swap request not found")

        if swap.target_id != responder_id:
            raise SwapNotAllowedError("Only the target can decline this swap")

        if swap.status != SwapRequestStatus.PENDING.value:
            raise SwapNotAllowedError("This swap request is no longer pending")

        swap.status = SwapRequestStatus.DECLINED.value
        swap.responded_at = datetime.now(timezone.utc)
        swap.response_message = response_message

        await self.db.flush()
        await self.db.refresh(swap)
        return swap

    # =========================================================================
    # Override
    # =========================================================================

    async def create_override(
        self,
        schedule_id: str,
        new_developer_id: str,
        reason: str | None = None,
        created_by_id: str | None = None,
    ) -> OnCallSchedule:
        """Create an override - directly assign a new developer to a shift.

        This is different from a swap in that it doesn't require approval.
        Typically used by team leads or when someone is unavailable.
        """
        schedule = await self.get_schedule(schedule_id)
        if not schedule:
            raise OnCallServiceError("Schedule not found")

        original_developer_id = schedule.developer_id
        schedule.developer_id = new_developer_id
        schedule.is_override = True
        schedule.original_developer_id = original_developer_id
        schedule.override_reason = reason

        await self.db.flush()
        await self.db.refresh(schedule)
        return schedule

    # =========================================================================
    # Helpers
    # =========================================================================

    def developer_to_brief(self, developer: Developer | None) -> DeveloperBrief | None:
        """Convert a developer to a brief response."""
        if not developer:
            return None
        return DeveloperBrief(
            id=developer.id,
            name=developer.name,
            email=developer.email,
            avatar_url=developer.avatar_url,
        )

    async def get_upcoming_shifts_to_notify(
        self,
        minutes_ahead: int = 30,
    ) -> list[OnCallSchedule]:
        """Get shifts starting soon that need notification.

        Used by the Celery task to send shift-starting notifications.
        """
        now = datetime.now(timezone.utc)
        notify_window = now + timedelta(minutes=minutes_ahead)

        stmt = (
            select(OnCallSchedule)
            .join(OnCallConfig)
            .where(
                OnCallConfig.is_enabled == True,
                OnCallConfig.notify_on_shift_change == True,
                OnCallSchedule.start_time > now,
                OnCallSchedule.start_time <= notify_window,
                OnCallSchedule.shift_start_notified == False,
            )
            .options(
                selectinload(OnCallSchedule.developer),
                selectinload(OnCallSchedule.config).selectinload(OnCallConfig.team),
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def mark_shift_start_notified(self, schedule_id: str) -> None:
        """Mark a shift as having been notified for start."""
        schedule = await self.get_schedule(schedule_id)
        if schedule:
            schedule.shift_start_notified = True
            await self.db.flush()

    async def get_ending_shifts_to_notify(
        self,
        minutes_ahead: int = 30,
    ) -> list[OnCallSchedule]:
        """Get shifts ending soon that need notification."""
        now = datetime.now(timezone.utc)
        notify_window = now + timedelta(minutes=minutes_ahead)

        stmt = (
            select(OnCallSchedule)
            .join(OnCallConfig)
            .where(
                OnCallConfig.is_enabled == True,
                OnCallSchedule.end_time > now,
                OnCallSchedule.end_time <= notify_window,
                OnCallSchedule.shift_end_notified == False,
            )
            .options(
                selectinload(OnCallSchedule.developer),
                selectinload(OnCallSchedule.config).selectinload(OnCallConfig.team),
            )
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def mark_shift_end_notified(self, schedule_id: str) -> None:
        """Mark a shift as having been notified for end."""
        schedule = await self.get_schedule(schedule_id)
        if schedule:
            schedule.shift_end_notified = True
            await self.db.flush()
