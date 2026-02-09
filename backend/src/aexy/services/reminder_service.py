"""Recurring reminders service.

Provides functionality for:
- Managing reminder definitions
- Creating and managing reminder instances
- Assignment strategies (fixed, round-robin, on-call, domain mapping)
- Escalation processing
- Dashboard statistics
- Control owner management
"""

from datetime import datetime, timezone, timedelta
from typing import Literal
from uuid import uuid4

from croniter import croniter
from sqlalchemy import select, and_, or_, func, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.reminder import (
    Reminder,
    ReminderInstance,
    ReminderEscalation,
    ControlOwner,
    DomainTeamMapping,
    AssignmentRule,
    ReminderSuggestion,
    ReminderStatus,
    ReminderFrequency,
    InstanceStatus,
    ReminderEscalationLevel,
    AssignmentStrategy,
)
from aexy.models.team import Team, TeamMember
from aexy.models.developer import Developer
from aexy.models.oncall import OnCallSchedule, OnCallConfig
from aexy.schemas.reminder import (
    ReminderCreate,
    ReminderUpdate,
    ReminderFilters,
    InstanceFilters,
    DeveloperBrief,
    TeamBrief,
    ControlOwnerCreate,
    ControlOwnerUpdate,
    DomainTeamMappingCreate,
    DomainTeamMappingUpdate,
    AssignmentRuleCreate,
    AssignmentRuleUpdate,
    InstanceAcknowledge,
    InstanceComplete,
    InstanceSkip,
    InstanceReassign,
    SuggestionAccept,
    SuggestionReject,
    CategoryStats,
    ReminderDashboardStats,
)


class ReminderServiceError(Exception):
    """Base exception for reminder service errors."""
    pass


class ReminderNotFoundError(ReminderServiceError):
    """Reminder not found."""
    pass


class InstanceNotFoundError(ReminderServiceError):
    """Reminder instance not found."""
    pass


class InvalidStateError(ReminderServiceError):
    """Invalid state transition."""
    pass


class InvalidConfigurationError(ReminderServiceError):
    """Invalid configuration."""
    pass


class ReminderService:
    """Service for recurring reminder management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # Reminder CRUD
    # =========================================================================

    async def create_reminder(
        self,
        workspace_id: str,
        data: ReminderCreate,
        created_by_id: str,
    ) -> Reminder:
        """Create a new reminder.

        Args:
            workspace_id: Workspace ID.
            data: Reminder data.
            created_by_id: Who is creating this reminder.

        Returns:
            Created Reminder.

        Raises:
            InvalidConfigurationError: If configuration is invalid.
        """
        # Validate cron expression for custom frequency
        if data.frequency == ReminderFrequency.CUSTOM and not data.cron_expression:
            raise InvalidConfigurationError(
                "cron_expression is required for custom frequency"
            )

        if data.cron_expression:
            try:
                croniter(data.cron_expression)
            except Exception as e:
                raise InvalidConfigurationError(f"Invalid cron expression: {e}")

        # Calculate first occurrence
        next_occurrence = self._calculate_next_occurrence(
            frequency=data.frequency.value,
            start_date=data.start_date,
            cron_expression=data.cron_expression,
            timezone_str=data.timezone,
        )

        reminder = Reminder(
            id=str(uuid4()),
            workspace_id=workspace_id,
            title=data.title,
            description=data.description,
            category=data.category.value,
            priority=data.priority.value,
            status=ReminderStatus.ACTIVE.value,
            frequency=data.frequency.value,
            cron_expression=data.cron_expression,
            timezone=data.timezone,
            start_date=data.start_date,
            end_date=data.end_date,
            next_occurrence=next_occurrence,
            assignment_strategy=data.assignment_strategy.value,
            default_owner_id=data.default_owner_id,
            default_team_id=data.default_team_id,
            domain=data.domain,
            escalation_config=data.escalation_config.model_dump() if data.escalation_config else {},
            notification_config=data.notification_config.model_dump() if data.notification_config else {},
            requires_acknowledgment=data.requires_acknowledgment,
            requires_evidence=data.requires_evidence,
            source_type=data.source_type,
            source_id=data.source_id,
            source_question_id=data.source_question_id,
            extra_data=data.extra_data,
            created_by_id=created_by_id,
        )

        self.db.add(reminder)
        await self.db.flush()
        await self.db.refresh(reminder)
        return reminder

    async def get_reminder(self, reminder_id: str) -> Reminder | None:
        """Get a reminder by ID."""
        stmt = (
            select(Reminder)
            .where(Reminder.id == reminder_id)
            .options(
                selectinload(Reminder.default_owner),
                selectinload(Reminder.default_team),
                selectinload(Reminder.created_by),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_reminders(
        self,
        workspace_id: str,
        filters: ReminderFilters | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Reminder], int]:
        """List reminders with filters and pagination.

        Returns:
            Tuple of (reminders, total_count).
        """
        stmt = (
            select(Reminder)
            .where(Reminder.workspace_id == workspace_id)
            .options(
                selectinload(Reminder.default_owner),
                selectinload(Reminder.default_team),
            )
        )

        # Apply filters
        if filters:
            if filters.status:
                stmt = stmt.where(Reminder.status.in_([s.value for s in filters.status]))
            if filters.category:
                stmt = stmt.where(Reminder.category.in_([c.value for c in filters.category]))
            if filters.priority:
                stmt = stmt.where(Reminder.priority.in_([p.value for p in filters.priority]))
            if filters.assignment_strategy:
                stmt = stmt.where(
                    Reminder.assignment_strategy.in_([a.value for a in filters.assignment_strategy])
                )
            if filters.domain:
                stmt = stmt.where(Reminder.domain == filters.domain)
            if filters.owner_id:
                stmt = stmt.where(Reminder.default_owner_id == filters.owner_id)
            if filters.team_id:
                stmt = stmt.where(Reminder.default_team_id == filters.team_id)
            if filters.search:
                escaped = filters.search.replace("%", r"\%").replace("_", r"\_")
                search_pattern = f"%{escaped}%"
                stmt = stmt.where(
                    or_(
                        Reminder.title.ilike(search_pattern),
                        Reminder.description.ilike(search_pattern),
                    )
                )

        # Count total
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply pagination and ordering
        stmt = (
            stmt.order_by(
                case(
                    (Reminder.priority == "critical", 1),
                    (Reminder.priority == "high", 2),
                    (Reminder.priority == "medium", 3),
                    (Reminder.priority == "low", 4),
                    else_=5,
                ),
                Reminder.next_occurrence.asc().nulls_last(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        )

        result = await self.db.execute(stmt)
        reminders = list(result.scalars().all())

        return reminders, total

    async def update_reminder(
        self,
        reminder_id: str,
        data: ReminderUpdate,
    ) -> Reminder | None:
        """Update a reminder."""
        reminder = await self.get_reminder(reminder_id)
        if not reminder:
            return None

        # Track if schedule changed
        schedule_changed = False

        if data.title is not None:
            reminder.title = data.title
        if data.description is not None:
            reminder.description = data.description
        if data.category is not None:
            reminder.category = data.category.value
        if data.priority is not None:
            reminder.priority = data.priority.value
        if data.status is not None:
            reminder.status = data.status.value
        if data.frequency is not None:
            reminder.frequency = data.frequency.value
            schedule_changed = True
        if data.cron_expression is not None:
            if data.cron_expression:
                try:
                    croniter(data.cron_expression)
                except Exception as e:
                    raise InvalidConfigurationError(f"Invalid cron expression: {e}")
            reminder.cron_expression = data.cron_expression
            schedule_changed = True
        if data.timezone is not None:
            reminder.timezone = data.timezone
            schedule_changed = True
        if data.start_date is not None:
            reminder.start_date = data.start_date
            schedule_changed = True
        if data.end_date is not None:
            reminder.end_date = data.end_date
        if data.assignment_strategy is not None:
            reminder.assignment_strategy = data.assignment_strategy.value
        if data.default_owner_id is not None:
            reminder.default_owner_id = data.default_owner_id
        if data.default_team_id is not None:
            reminder.default_team_id = data.default_team_id
        if data.domain is not None:
            reminder.domain = data.domain
        if data.escalation_config is not None:
            reminder.escalation_config = data.escalation_config.model_dump()
        if data.notification_config is not None:
            reminder.notification_config = data.notification_config.model_dump()
        if data.requires_acknowledgment is not None:
            reminder.requires_acknowledgment = data.requires_acknowledgment
        if data.requires_evidence is not None:
            reminder.requires_evidence = data.requires_evidence
        if data.extra_data is not None:
            reminder.extra_data = data.extra_data

        # Recalculate next occurrence if schedule changed
        if schedule_changed:
            reminder.next_occurrence = self._calculate_next_occurrence(
                frequency=reminder.frequency,
                start_date=reminder.start_date,
                cron_expression=reminder.cron_expression,
                timezone_str=reminder.timezone,
            )

        await self.db.flush()
        await self.db.refresh(reminder)
        return reminder

    async def archive_reminder(self, reminder_id: str) -> bool:
        """Archive a reminder (soft delete)."""
        reminder = await self.get_reminder(reminder_id)
        if not reminder:
            return False

        reminder.status = ReminderStatus.ARCHIVED.value
        reminder.next_occurrence = None  # No more occurrences
        await self.db.flush()
        return True

    async def delete_reminder(self, reminder_id: str) -> bool:
        """Hard delete a reminder."""
        reminder = await self.get_reminder(reminder_id)
        if not reminder:
            return False

        await self.db.delete(reminder)
        await self.db.flush()
        return True

    # =========================================================================
    # Instance Management
    # =========================================================================

    async def get_instance(self, instance_id: str) -> ReminderInstance | None:
        """Get an instance by ID."""
        stmt = (
            select(ReminderInstance)
            .where(ReminderInstance.id == instance_id)
            .options(
                selectinload(ReminderInstance.reminder),
                selectinload(ReminderInstance.assigned_owner),
                selectinload(ReminderInstance.assigned_team),
                selectinload(ReminderInstance.acknowledged_by),
                selectinload(ReminderInstance.completed_by),
                selectinload(ReminderInstance.skipped_by),
                selectinload(ReminderInstance.escalations),
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_instances(
        self,
        reminder_id: str | None = None,
        workspace_id: str | None = None,
        filters: InstanceFilters | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[ReminderInstance], int]:
        """List instances with filters and pagination."""
        stmt = (
            select(ReminderInstance)
            .options(
                selectinload(ReminderInstance.reminder),
                selectinload(ReminderInstance.assigned_owner),
                selectinload(ReminderInstance.assigned_team),
            )
        )

        if reminder_id:
            stmt = stmt.where(ReminderInstance.reminder_id == reminder_id)
        elif workspace_id:
            stmt = stmt.join(Reminder).where(Reminder.workspace_id == workspace_id)

        # Apply filters
        if filters:
            if filters.status:
                stmt = stmt.where(
                    ReminderInstance.status.in_([s.value for s in filters.status])
                )
            if filters.assigned_owner_id:
                stmt = stmt.where(
                    ReminderInstance.assigned_owner_id == filters.assigned_owner_id
                )
            if filters.assigned_team_id:
                stmt = stmt.where(
                    ReminderInstance.assigned_team_id == filters.assigned_team_id
                )
            if filters.due_before:
                stmt = stmt.where(ReminderInstance.due_date < filters.due_before)
            if filters.due_after:
                stmt = stmt.where(ReminderInstance.due_date >= filters.due_after)

        # Count total
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        # Apply pagination and ordering
        stmt = (
            stmt.order_by(ReminderInstance.due_date.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )

        result = await self.db.execute(stmt)
        instances = list(result.scalars().all())

        return instances, total

    async def create_instance(
        self,
        reminder: Reminder,
        due_date: datetime,
    ) -> ReminderInstance:
        """Create a new instance for a reminder.

        Automatically resolves assignment based on strategy.
        """
        # Resolve assignment
        owner_id, team_id = await self._resolve_assignment(reminder)

        instance = ReminderInstance(
            id=str(uuid4()),
            reminder_id=reminder.id,
            due_date=due_date,
            status=InstanceStatus.PENDING.value,
            assigned_owner_id=owner_id,
            assigned_team_id=team_id,
        )

        self.db.add(instance)
        await self.db.flush()
        await self.db.refresh(instance)
        return instance

    async def acknowledge_instance(
        self,
        instance_id: str,
        acknowledged_by_id: str,
        data: InstanceAcknowledge,
    ) -> ReminderInstance:
        """Acknowledge an instance."""
        instance = await self.get_instance(instance_id)
        if not instance:
            raise InstanceNotFoundError(f"Instance {instance_id} not found")

        if instance.status not in [
            InstanceStatus.PENDING.value,
            InstanceStatus.NOTIFIED.value,
            InstanceStatus.OVERDUE.value,
            InstanceStatus.ESCALATED.value,
        ]:
            raise InvalidStateError(
                f"Cannot acknowledge instance in {instance.status} status"
            )

        instance.status = InstanceStatus.ACKNOWLEDGED.value
        instance.acknowledged_at = datetime.now(timezone.utc)
        instance.acknowledged_by_id = acknowledged_by_id
        instance.acknowledgment_notes = data.notes

        await self.db.flush()
        await self.db.refresh(instance)
        return instance

    async def complete_instance(
        self,
        instance_id: str,
        completed_by_id: str,
        data: InstanceComplete,
    ) -> ReminderInstance:
        """Complete an instance."""
        instance = await self.get_instance(instance_id)
        if not instance:
            raise InstanceNotFoundError(f"Instance {instance_id} not found")

        if instance.status == InstanceStatus.COMPLETED.value:
            raise InvalidStateError("Instance is already completed")
        if instance.status == InstanceStatus.SKIPPED.value:
            raise InvalidStateError("Cannot complete a skipped instance")

        # Check if evidence is required
        if instance.reminder.requires_evidence and not data.evidence_links:
            raise InvalidStateError("Evidence is required to complete this reminder")

        instance.status = InstanceStatus.COMPLETED.value
        instance.completed_at = datetime.now(timezone.utc)
        instance.completed_by_id = completed_by_id
        instance.completion_notes = data.notes

        if data.evidence_links:
            instance.evidence_links = [e.model_dump() for e in data.evidence_links]

        await self.db.flush()
        await self.db.refresh(instance)
        return instance

    async def skip_instance(
        self,
        instance_id: str,
        skipped_by_id: str,
        data: InstanceSkip,
    ) -> ReminderInstance:
        """Skip an instance."""
        instance = await self.get_instance(instance_id)
        if not instance:
            raise InstanceNotFoundError(f"Instance {instance_id} not found")

        if instance.status in [InstanceStatus.COMPLETED.value, InstanceStatus.SKIPPED.value]:
            raise InvalidStateError(f"Cannot skip instance in {instance.status} status")

        instance.status = InstanceStatus.SKIPPED.value
        instance.skipped_at = datetime.now(timezone.utc)
        instance.skipped_by_id = skipped_by_id
        instance.skip_reason = data.reason

        await self.db.flush()
        await self.db.refresh(instance)
        return instance

    async def reassign_instance(
        self,
        instance_id: str,
        data: InstanceReassign,
    ) -> ReminderInstance:
        """Reassign an instance to a different owner/team."""
        instance = await self.get_instance(instance_id)
        if not instance:
            raise InstanceNotFoundError(f"Instance {instance_id} not found")

        if instance.status in [InstanceStatus.COMPLETED.value, InstanceStatus.SKIPPED.value]:
            raise InvalidStateError(
                f"Cannot reassign instance in {instance.status} status"
            )

        if data.new_owner_id is not None:
            instance.assigned_owner_id = data.new_owner_id
        if data.new_team_id is not None:
            instance.assigned_team_id = data.new_team_id

        await self.db.flush()
        await self.db.refresh(instance)
        return instance

    # =========================================================================
    # Scheduling
    # =========================================================================

    def _calculate_next_occurrence(
        self,
        frequency: str,
        start_date: datetime,
        cron_expression: str | None = None,
        timezone_str: str = "UTC",
        after: datetime | None = None,
    ) -> datetime | None:
        """Calculate the next occurrence based on frequency.

        Args:
            frequency: Frequency enum value.
            start_date: Start date of the reminder.
            cron_expression: Cron expression for custom frequency.
            timezone_str: Timezone for the reminder.
            after: Calculate next occurrence after this time.

        Returns:
            Next occurrence datetime or None if no more occurrences.
        """
        now = after or datetime.now(timezone.utc)

        # Ensure start_date is timezone-aware for comparison
        if start_date.tzinfo is None:
            # If start_date is naive, localize it to the specified timezone
            try:
                from zoneinfo import ZoneInfo
                tz = ZoneInfo(timezone_str) if timezone_str else timezone.utc
                start_date = start_date.replace(tzinfo=tz)
            except Exception:
                # Fallback: assume UTC if timezone parsing fails
                start_date = start_date.replace(tzinfo=timezone.utc)

        # If start date is in the future, that's the first occurrence
        if start_date > now:
            return start_date

        if frequency == ReminderFrequency.ONCE.value:
            return start_date if start_date > now else None

        if frequency == ReminderFrequency.CUSTOM.value and cron_expression:
            try:
                cron = croniter(cron_expression, now)
                return cron.get_next(datetime)
            except Exception:
                return None

        # Standard frequencies
        base = start_date
        while base <= now:
            if frequency == ReminderFrequency.DAILY.value:
                base += timedelta(days=1)
            elif frequency == ReminderFrequency.WEEKLY.value:
                base += timedelta(weeks=1)
            elif frequency == ReminderFrequency.BIWEEKLY.value:
                base += timedelta(weeks=2)
            elif frequency == ReminderFrequency.MONTHLY.value:
                # Move to next month
                if base.month == 12:
                    base = base.replace(year=base.year + 1, month=1)
                else:
                    base = base.replace(month=base.month + 1)
            elif frequency == ReminderFrequency.QUARTERLY.value:
                # Move forward 3 months
                new_month = base.month + 3
                if new_month > 12:
                    base = base.replace(year=base.year + 1, month=new_month - 12)
                else:
                    base = base.replace(month=new_month)
            elif frequency == ReminderFrequency.SEMI_ANNUAL.value:
                # Move forward 6 months
                new_month = base.month + 6
                if new_month > 12:
                    base = base.replace(year=base.year + 1, month=new_month - 12)
                else:
                    base = base.replace(month=new_month)
            elif frequency == ReminderFrequency.YEARLY.value:
                base = base.replace(year=base.year + 1)
            else:
                break

        return base if base > now else None

    async def get_due_reminders(self) -> list[Reminder]:
        """Get reminders that are due for instance creation."""
        now = datetime.now(timezone.utc)

        stmt = (
            select(Reminder)
            .where(
                Reminder.status == ReminderStatus.ACTIVE.value,
                Reminder.next_occurrence <= now,
                or_(
                    Reminder.end_date.is_(None),
                    Reminder.end_date >= now,
                ),
            )
            .options(
                selectinload(Reminder.default_owner),
                selectinload(Reminder.default_team),
            )
        )

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def advance_reminder_schedule(self, reminder: Reminder) -> None:
        """Advance a reminder to its next occurrence."""
        next_occ = self._calculate_next_occurrence(
            frequency=reminder.frequency,
            start_date=reminder.start_date,
            cron_expression=reminder.cron_expression,
            timezone_str=reminder.timezone,
            after=reminder.next_occurrence,
        )

        # Check end date
        if reminder.end_date and next_occ and next_occ > reminder.end_date:
            next_occ = None

        reminder.next_occurrence = next_occ

        # If single occurrence, mark as archived
        if reminder.frequency == ReminderFrequency.ONCE.value:
            reminder.status = ReminderStatus.ARCHIVED.value

        await self.db.flush()

    # =========================================================================
    # Assignment
    # =========================================================================

    async def _resolve_assignment(
        self,
        reminder: Reminder,
    ) -> tuple[str | None, str | None]:
        """Resolve owner and team assignment based on strategy.

        Returns:
            Tuple of (owner_id, team_id).
        """
        strategy = reminder.assignment_strategy

        if strategy == AssignmentStrategy.FIXED.value:
            return reminder.default_owner_id, reminder.default_team_id

        elif strategy == AssignmentStrategy.ROUND_ROBIN.value:
            owner_id = await self._get_round_robin_owner(reminder)
            return owner_id, reminder.default_team_id

        elif strategy == AssignmentStrategy.ON_CALL.value:
            if reminder.default_team_id:
                owner_id = await self._get_oncall_owner(reminder.default_team_id)
                return owner_id, reminder.default_team_id
            return None, None

        elif strategy == AssignmentStrategy.DOMAIN_MAPPING.value:
            if reminder.domain:
                # First try control owner
                owner_id = await self._get_control_owner(
                    reminder.workspace_id, reminder.domain
                )
                if owner_id:
                    return owner_id, None

                # Then try domain team mapping
                team_id = await self._get_team_for_domain(
                    reminder.workspace_id, reminder.domain
                )
                if team_id:
                    return None, team_id

            return reminder.default_owner_id, reminder.default_team_id

        elif strategy == AssignmentStrategy.CUSTOM_RULE.value:
            owner_id = await self._evaluate_assignment_rules(reminder)
            if owner_id:
                return owner_id, None
            return reminder.default_owner_id, reminder.default_team_id

        return reminder.default_owner_id, reminder.default_team_id

    async def _get_oncall_owner(self, team_id: str) -> str | None:
        """Get the current on-call person for a team."""
        now = datetime.now(timezone.utc)

        stmt = (
            select(OnCallSchedule)
            .join(OnCallConfig)
            .where(
                OnCallConfig.team_id == team_id,
                OnCallConfig.is_enabled == True,
                OnCallSchedule.start_time <= now,
                OnCallSchedule.end_time > now,
            )
            .order_by(OnCallSchedule.start_time.desc())
            .limit(1)
        )

        result = await self.db.execute(stmt)
        schedule = result.scalar_one_or_none()
        return schedule.developer_id if schedule else None

    async def _get_round_robin_owner(self, reminder: Reminder) -> str | None:
        """Get the next owner in round-robin rotation."""
        if not reminder.default_team_id:
            return reminder.default_owner_id

        # Get team members
        stmt = (
            select(TeamMember)
            .where(TeamMember.team_id == reminder.default_team_id)
            .order_by(TeamMember.created_at)
        )
        result = await self.db.execute(stmt)
        members = list(result.scalars().all())

        if not members:
            return reminder.default_owner_id

        # Get next member in rotation
        index = reminder.round_robin_index % len(members)
        selected = members[index]

        # Advance index
        reminder.round_robin_index = (reminder.round_robin_index + 1) % len(members)
        await self.db.flush()

        return selected.developer_id

    async def _get_control_owner(
        self,
        workspace_id: str,
        domain: str,
    ) -> str | None:
        """Get the control owner for a domain."""
        stmt = (
            select(ControlOwner)
            .where(
                ControlOwner.workspace_id == workspace_id,
                ControlOwner.domain == domain,
            )
            .limit(1)
        )
        result = await self.db.execute(stmt)
        owner = result.scalar_one_or_none()

        if owner:
            return owner.primary_owner_id or owner.backup_owner_id
        return None

    async def _get_team_for_domain(
        self,
        workspace_id: str,
        domain: str,
    ) -> str | None:
        """Get the team responsible for a domain."""
        stmt = (
            select(DomainTeamMapping)
            .where(
                DomainTeamMapping.workspace_id == workspace_id,
                DomainTeamMapping.domain == domain,
            )
            .order_by(DomainTeamMapping.priority.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        mapping = result.scalar_one_or_none()
        return mapping.team_id if mapping else None

    async def _evaluate_assignment_rules(
        self,
        reminder: Reminder,
    ) -> str | None:
        """Evaluate custom assignment rules for a reminder."""
        stmt = (
            select(AssignmentRule)
            .where(
                AssignmentRule.workspace_id == reminder.workspace_id,
                AssignmentRule.is_active == True,
            )
            .order_by(AssignmentRule.priority.desc())
        )
        result = await self.db.execute(stmt)
        rules = list(result.scalars().all())

        for rule in rules:
            if self._matches_rule(reminder, rule.rule_config):
                assign_to = rule.rule_config.get("assign_to", {})
                if assign_to.get("type") == "developer":
                    return assign_to.get("id")
                # For team assignment, we'd need different return
        return None

    def _matches_rule(self, reminder: Reminder, rule_config: dict) -> bool:
        """Check if a reminder matches a rule's conditions."""
        conditions = rule_config.get("conditions", [])

        for condition in conditions:
            field = condition.get("field")
            operator = condition.get("operator")
            value = condition.get("value")

            reminder_value = None
            if field == "category":
                reminder_value = reminder.category
            elif field == "domain":
                reminder_value = reminder.domain
            elif field == "priority":
                reminder_value = reminder.priority
            elif field == "tags":
                reminder_value = reminder.extra_data.get("tags", [])

            if not self._evaluate_condition(reminder_value, operator, value):
                return False

        return True

    def _evaluate_condition(
        self,
        actual: str | list | None,
        operator: str,
        expected: str | list,
    ) -> bool:
        """Evaluate a single condition."""
        if actual is None:
            return False

        if operator == "equals":
            return actual == expected
        elif operator == "not_equals":
            return actual != expected
        elif operator == "contains":
            if isinstance(actual, list):
                return expected in actual
            return expected in str(actual)
        elif operator == "in":
            if isinstance(expected, list):
                return actual in expected
        return False

    # =========================================================================
    # Escalation
    # =========================================================================

    async def get_instances_for_escalation(self) -> list[ReminderInstance]:
        """Get instances that need escalation."""
        now = datetime.now(timezone.utc)

        stmt = (
            select(ReminderInstance)
            .join(Reminder)
            .where(
                ReminderInstance.status.in_([
                    InstanceStatus.PENDING.value,
                    InstanceStatus.NOTIFIED.value,
                    InstanceStatus.OVERDUE.value,
                    InstanceStatus.ESCALATED.value,
                ]),
                ReminderInstance.due_date < now,
            )
            .options(
                selectinload(ReminderInstance.reminder),
                selectinload(ReminderInstance.escalations),
            )
        )

        result = await self.db.execute(stmt)
        instances = list(result.scalars().all())

        # Filter to instances that need escalation based on config
        need_escalation = []
        for instance in instances:
            reminder = instance.reminder
            esc_config = reminder.escalation_config

            if not esc_config.get("enabled"):
                continue

            levels = esc_config.get("levels", [])
            if not levels:
                continue

            # Find next escalation level
            current_level = instance.current_escalation_level
            next_level = self._get_next_escalation_level(current_level, levels)

            if next_level:
                # Check if enough time has passed
                delay_hours = next_level.get("delay_hours", 24)
                overdue_since = now - instance.due_date
                required_delay = timedelta(hours=delay_hours)

                # Account for already elapsed time at previous levels
                if current_level:
                    # Find time since last escalation
                    last_esc = max(
                        (e for e in instance.escalations),
                        key=lambda e: e.created_at,
                        default=None,
                    )
                    if last_esc:
                        time_at_level = now - last_esc.created_at
                        if time_at_level >= required_delay:
                            need_escalation.append(instance)
                else:
                    # First escalation, measure from due date
                    if overdue_since >= required_delay:
                        need_escalation.append(instance)

        return need_escalation

    def _get_next_escalation_level(
        self,
        current_level: str | None,
        levels: list[dict],
    ) -> dict | None:
        """Get the next escalation level config."""
        level_order = ["l1", "l2", "l3", "l4"]

        if not current_level:
            # Return first level
            return levels[0] if levels else None

        try:
            current_idx = level_order.index(current_level)
            next_idx = current_idx + 1

            if next_idx < len(level_order):
                next_level_name = level_order[next_idx]
                for level in levels:
                    if level.get("level") == next_level_name:
                        return level
        except ValueError:
            pass

        return None

    async def escalate_instance(
        self,
        instance: ReminderInstance,
        level: str,
        escalated_to_id: str | None,
        escalated_to_team_id: str | None,
        notification_channels: dict,
    ) -> ReminderEscalation:
        """Create an escalation record for an instance."""
        escalation = ReminderEscalation(
            id=str(uuid4()),
            instance_id=instance.id,
            level=level,
            escalated_to_id=escalated_to_id,
            escalated_to_team_id=escalated_to_team_id,
            notified_at=datetime.now(timezone.utc),
            notification_channels=notification_channels,
        )

        instance.status = InstanceStatus.ESCALATED.value
        instance.current_escalation_level = level

        self.db.add(escalation)
        await self.db.flush()
        await self.db.refresh(escalation)
        return escalation

    # =========================================================================
    # Dashboard
    # =========================================================================

    async def get_dashboard_stats(
        self,
        workspace_id: str,
    ) -> ReminderDashboardStats:
        """Get dashboard statistics for reminders."""
        now = datetime.now(timezone.utc)
        week_start = now - timedelta(days=now.weekday())
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # Reminder counts by status
        reminder_counts = await self.db.execute(
            select(Reminder.status, func.count(Reminder.id))
            .where(Reminder.workspace_id == workspace_id)
            .group_by(Reminder.status)
        )
        reminder_status_counts = dict(reminder_counts.all())

        # Instance counts
        pending_count = await self.db.execute(
            select(func.count(ReminderInstance.id))
            .join(Reminder)
            .where(
                Reminder.workspace_id == workspace_id,
                ReminderInstance.status.in_([
                    InstanceStatus.PENDING.value,
                    InstanceStatus.NOTIFIED.value,
                    InstanceStatus.ACKNOWLEDGED.value,
                ])
            )
        )
        total_pending = pending_count.scalar() or 0

        overdue_count = await self.db.execute(
            select(func.count(ReminderInstance.id))
            .join(Reminder)
            .where(
                Reminder.workspace_id == workspace_id,
                ReminderInstance.status.in_([
                    InstanceStatus.PENDING.value,
                    InstanceStatus.NOTIFIED.value,
                    InstanceStatus.OVERDUE.value,
                    InstanceStatus.ESCALATED.value,
                ]),
                ReminderInstance.due_date < now,
            )
        )
        total_overdue = overdue_count.scalar() or 0

        # Completed this week/month
        completed_week = await self.db.execute(
            select(func.count(ReminderInstance.id))
            .join(Reminder)
            .where(
                Reminder.workspace_id == workspace_id,
                ReminderInstance.status == InstanceStatus.COMPLETED.value,
                ReminderInstance.completed_at >= week_start,
            )
        )
        completed_this_week = completed_week.scalar() or 0

        completed_month = await self.db.execute(
            select(func.count(ReminderInstance.id))
            .join(Reminder)
            .where(
                Reminder.workspace_id == workspace_id,
                ReminderInstance.status == InstanceStatus.COMPLETED.value,
                ReminderInstance.completed_at >= month_start,
            )
        )
        completed_this_month = completed_month.scalar() or 0

        # By category
        category_stats_result = await self.db.execute(
            select(
                Reminder.category,
                func.count(Reminder.id).label("total"),
                func.sum(case(
                    (ReminderInstance.status.in_([
                        InstanceStatus.PENDING.value,
                        InstanceStatus.NOTIFIED.value,
                    ]), 1),
                    else_=0
                )).label("pending"),
                func.sum(case(
                    (ReminderInstance.status == InstanceStatus.COMPLETED.value, 1),
                    else_=0
                )).label("completed"),
                func.sum(case(
                    (and_(
                        ReminderInstance.status.in_([
                            InstanceStatus.PENDING.value,
                            InstanceStatus.NOTIFIED.value,
                            InstanceStatus.OVERDUE.value,
                        ]),
                        ReminderInstance.due_date < now,
                    ), 1),
                    else_=0
                )).label("overdue"),
            )
            .outerjoin(ReminderInstance, Reminder.id == ReminderInstance.reminder_id)
            .where(Reminder.workspace_id == workspace_id)
            .group_by(Reminder.category)
        )
        category_rows = category_stats_result.all()
        by_category = [
            CategoryStats(
                category=row.category,
                total=row.total or 0,
                pending=row.pending or 0,
                completed=row.completed or 0,
                overdue=row.overdue or 0,
            )
            for row in category_rows
        ]

        # Critical/high overdue
        critical_overdue_count = await self.db.execute(
            select(func.count(ReminderInstance.id))
            .join(Reminder)
            .where(
                Reminder.workspace_id == workspace_id,
                Reminder.priority == "critical",
                ReminderInstance.status.in_([
                    InstanceStatus.PENDING.value,
                    InstanceStatus.NOTIFIED.value,
                    InstanceStatus.OVERDUE.value,
                    InstanceStatus.ESCALATED.value,
                ]),
                ReminderInstance.due_date < now,
            )
        )
        critical_overdue = critical_overdue_count.scalar() or 0

        high_overdue_count = await self.db.execute(
            select(func.count(ReminderInstance.id))
            .join(Reminder)
            .where(
                Reminder.workspace_id == workspace_id,
                Reminder.priority == "high",
                ReminderInstance.status.in_([
                    InstanceStatus.PENDING.value,
                    InstanceStatus.NOTIFIED.value,
                    InstanceStatus.OVERDUE.value,
                    InstanceStatus.ESCALATED.value,
                ]),
                ReminderInstance.due_date < now,
            )
        )
        high_overdue = high_overdue_count.scalar() or 0

        total_reminders = sum(reminder_status_counts.values())

        return ReminderDashboardStats(
            total_reminders=total_reminders,
            active_reminders=reminder_status_counts.get(ReminderStatus.ACTIVE.value, 0),
            paused_reminders=reminder_status_counts.get(ReminderStatus.PAUSED.value, 0),
            archived_reminders=reminder_status_counts.get(ReminderStatus.ARCHIVED.value, 0),
            total_pending_instances=total_pending,
            total_overdue_instances=total_overdue,
            completed_this_week=completed_this_week,
            completed_this_month=completed_this_month,
            by_category=by_category,
            critical_overdue=critical_overdue,
            high_overdue=high_overdue,
        )

    async def get_my_reminders(
        self,
        workspace_id: str,
        developer_id: str,
    ) -> dict:
        """Get reminders assigned to a developer."""
        now = datetime.now(timezone.utc)
        today_end = now.replace(hour=23, minute=59, second=59, microsecond=999999)
        week_end = now + timedelta(days=7 - now.weekday())

        # Base query for open instances
        base_stmt = (
            select(ReminderInstance)
            .join(Reminder)
            .where(
                Reminder.workspace_id == workspace_id,
                ReminderInstance.status.in_([
                    InstanceStatus.PENDING.value,
                    InstanceStatus.NOTIFIED.value,
                    InstanceStatus.ACKNOWLEDGED.value,
                    InstanceStatus.OVERDUE.value,
                    InstanceStatus.ESCALATED.value,
                ]),
            )
            .options(
                selectinload(ReminderInstance.reminder),
                selectinload(ReminderInstance.assigned_owner),
                selectinload(ReminderInstance.assigned_team),
            )
        )

        # Assigned to me
        assigned_to_me_stmt = base_stmt.where(
            ReminderInstance.assigned_owner_id == developer_id
        ).order_by(ReminderInstance.due_date)
        result = await self.db.execute(assigned_to_me_stmt)
        assigned_to_me = list(result.scalars().all())

        # Get developer's teams
        team_stmt = select(TeamMember.team_id).where(
            TeamMember.developer_id == developer_id
        )
        team_result = await self.db.execute(team_stmt)
        team_ids = [t for t in team_result.scalars().all()]

        # My team reminders (not directly assigned to me)
        my_team_stmt = base_stmt.where(
            ReminderInstance.assigned_team_id.in_(team_ids),
            or_(
                ReminderInstance.assigned_owner_id.is_(None),
                ReminderInstance.assigned_owner_id != developer_id,
            ),
        ).order_by(ReminderInstance.due_date)
        result = await self.db.execute(my_team_stmt)
        my_team_reminders = list(result.scalars().all())

        # Overdue (assigned to me)
        overdue_stmt = base_stmt.where(
            ReminderInstance.assigned_owner_id == developer_id,
            ReminderInstance.due_date < now,
        ).order_by(ReminderInstance.due_date)
        result = await self.db.execute(overdue_stmt)
        overdue = list(result.scalars().all())

        # Due today
        due_today_stmt = base_stmt.where(
            ReminderInstance.assigned_owner_id == developer_id,
            ReminderInstance.due_date >= now,
            ReminderInstance.due_date <= today_end,
        ).order_by(ReminderInstance.due_date)
        result = await self.db.execute(due_today_stmt)
        due_today = list(result.scalars().all())

        # Due this week
        due_week_stmt = base_stmt.where(
            ReminderInstance.assigned_owner_id == developer_id,
            ReminderInstance.due_date > today_end,
            ReminderInstance.due_date <= week_end,
        ).order_by(ReminderInstance.due_date)
        result = await self.db.execute(due_week_stmt)
        due_this_week = list(result.scalars().all())

        return {
            "assigned_to_me": assigned_to_me,
            "my_team_reminders": my_team_reminders,
            "overdue": overdue,
            "due_today": due_today,
            "due_this_week": due_this_week,
        }

    # =========================================================================
    # Control Owner Management
    # =========================================================================

    async def list_control_owners(
        self,
        workspace_id: str,
        domain: str | None = None,
    ) -> list[ControlOwner]:
        """List control owners for a workspace."""
        stmt = (
            select(ControlOwner)
            .where(ControlOwner.workspace_id == workspace_id)
            .options(
                selectinload(ControlOwner.primary_owner),
                selectinload(ControlOwner.backup_owner),
                selectinload(ControlOwner.team),
            )
        )

        if domain:
            stmt = stmt.where(ControlOwner.domain == domain)

        stmt = stmt.order_by(ControlOwner.domain, ControlOwner.control_name)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_control_owner(
        self,
        workspace_id: str,
        data: ControlOwnerCreate,
    ) -> ControlOwner:
        """Create a control owner mapping."""
        control_owner = ControlOwner(
            id=str(uuid4()),
            workspace_id=workspace_id,
            control_id=data.control_id,
            control_name=data.control_name,
            domain=data.domain,
            primary_owner_id=data.primary_owner_id,
            backup_owner_id=data.backup_owner_id,
            team_id=data.team_id,
        )

        self.db.add(control_owner)
        await self.db.flush()
        await self.db.refresh(control_owner)
        return control_owner

    async def update_control_owner(
        self,
        control_owner_id: str,
        data: ControlOwnerUpdate,
    ) -> ControlOwner | None:
        """Update a control owner mapping."""
        stmt = (
            select(ControlOwner)
            .where(ControlOwner.id == control_owner_id)
        )
        result = await self.db.execute(stmt)
        control_owner = result.scalar_one_or_none()

        if not control_owner:
            return None

        if data.control_id is not None:
            control_owner.control_id = data.control_id
        if data.control_name is not None:
            control_owner.control_name = data.control_name
        if data.domain is not None:
            control_owner.domain = data.domain
        if data.primary_owner_id is not None:
            control_owner.primary_owner_id = data.primary_owner_id
        if data.backup_owner_id is not None:
            control_owner.backup_owner_id = data.backup_owner_id
        if data.team_id is not None:
            control_owner.team_id = data.team_id

        await self.db.flush()
        await self.db.refresh(control_owner)
        return control_owner

    async def delete_control_owner(self, control_owner_id: str) -> bool:
        """Delete a control owner mapping."""
        stmt = select(ControlOwner).where(ControlOwner.id == control_owner_id)
        result = await self.db.execute(stmt)
        control_owner = result.scalar_one_or_none()

        if not control_owner:
            return False

        await self.db.delete(control_owner)
        await self.db.flush()
        return True

    # =========================================================================
    # Domain Team Mapping
    # =========================================================================

    async def list_domain_team_mappings(
        self,
        workspace_id: str,
    ) -> list[DomainTeamMapping]:
        """List domain team mappings for a workspace."""
        stmt = (
            select(DomainTeamMapping)
            .where(DomainTeamMapping.workspace_id == workspace_id)
            .options(selectinload(DomainTeamMapping.team))
            .order_by(DomainTeamMapping.domain, DomainTeamMapping.priority.desc())
        )

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_domain_team_mapping(
        self,
        workspace_id: str,
        data: DomainTeamMappingCreate,
    ) -> DomainTeamMapping:
        """Create a domain team mapping."""
        mapping = DomainTeamMapping(
            id=str(uuid4()),
            workspace_id=workspace_id,
            domain=data.domain,
            team_id=data.team_id,
            priority=data.priority,
        )

        self.db.add(mapping)
        await self.db.flush()
        await self.db.refresh(mapping)
        return mapping

    async def delete_domain_team_mapping(self, mapping_id: str) -> bool:
        """Delete a domain team mapping."""
        stmt = select(DomainTeamMapping).where(DomainTeamMapping.id == mapping_id)
        result = await self.db.execute(stmt)
        mapping = result.scalar_one_or_none()

        if not mapping:
            return False

        await self.db.delete(mapping)
        await self.db.flush()
        return True

    # =========================================================================
    # Assignment Rules
    # =========================================================================

    async def list_assignment_rules(
        self,
        workspace_id: str,
    ) -> list[AssignmentRule]:
        """List assignment rules for a workspace."""
        stmt = (
            select(AssignmentRule)
            .where(AssignmentRule.workspace_id == workspace_id)
            .order_by(AssignmentRule.priority.desc(), AssignmentRule.name)
        )

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_assignment_rule(
        self,
        workspace_id: str,
        data: AssignmentRuleCreate,
    ) -> AssignmentRule:
        """Create an assignment rule."""
        rule = AssignmentRule(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=data.name,
            description=data.description,
            rule_config=data.rule_config.model_dump(),
            priority=data.priority,
            is_active=data.is_active,
        )

        self.db.add(rule)
        await self.db.flush()
        await self.db.refresh(rule)
        return rule

    async def update_assignment_rule(
        self,
        rule_id: str,
        data: AssignmentRuleUpdate,
    ) -> AssignmentRule | None:
        """Update an assignment rule."""
        stmt = select(AssignmentRule).where(AssignmentRule.id == rule_id)
        result = await self.db.execute(stmt)
        rule = result.scalar_one_or_none()

        if not rule:
            return None

        if data.name is not None:
            rule.name = data.name
        if data.description is not None:
            rule.description = data.description
        if data.rule_config is not None:
            rule.rule_config = data.rule_config.model_dump()
        if data.priority is not None:
            rule.priority = data.priority
        if data.is_active is not None:
            rule.is_active = data.is_active

        await self.db.flush()
        await self.db.refresh(rule)
        return rule

    async def delete_assignment_rule(self, rule_id: str) -> bool:
        """Delete an assignment rule."""
        stmt = select(AssignmentRule).where(AssignmentRule.id == rule_id)
        result = await self.db.execute(stmt)
        rule = result.scalar_one_or_none()

        if not rule:
            return False

        await self.db.delete(rule)
        await self.db.flush()
        return True

    # =========================================================================
    # Suggestions
    # =========================================================================

    async def list_suggestions(
        self,
        workspace_id: str,
        status: str | None = None,
        questionnaire_response_id: str | None = None,
    ) -> list[ReminderSuggestion]:
        """List reminder suggestions."""
        stmt = (
            select(ReminderSuggestion)
            .where(ReminderSuggestion.workspace_id == workspace_id)
            .options(selectinload(ReminderSuggestion.reviewed_by))
        )

        if status:
            stmt = stmt.where(ReminderSuggestion.status == status)
        if questionnaire_response_id:
            stmt = stmt.where(
                ReminderSuggestion.questionnaire_response_id == questionnaire_response_id
            )

        stmt = stmt.order_by(
            ReminderSuggestion.confidence_score.desc(),
            ReminderSuggestion.created_at.desc(),
        )

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def accept_suggestion(
        self,
        suggestion_id: str,
        data: SuggestionAccept,
        accepted_by_id: str,
    ) -> tuple[ReminderSuggestion, Reminder]:
        """Accept a suggestion and create a reminder."""
        stmt = (
            select(ReminderSuggestion)
            .where(ReminderSuggestion.id == suggestion_id)
        )
        result = await self.db.execute(stmt)
        suggestion = result.scalar_one_or_none()

        if not suggestion:
            raise ReminderServiceError(f"Suggestion {suggestion_id} not found")

        if suggestion.status != "pending":
            raise InvalidStateError("Suggestion is not pending")

        # Create reminder with overrides
        reminder_data = ReminderCreate(
            title=data.title or suggestion.suggested_title,
            description=data.description or suggestion.suggested_description,
            category=data.category or suggestion.suggested_category,
            frequency=data.frequency or suggestion.suggested_frequency,
            priority=data.priority,
            start_date=data.start_date or datetime.now(timezone.utc),
            default_owner_id=data.default_owner_id,
            default_team_id=data.default_team_id,
            source_type="questionnaire",
            source_id=suggestion.questionnaire_response_id,
            source_question_id=suggestion.question_id,
        )

        reminder = await self.create_reminder(
            workspace_id=suggestion.workspace_id,
            data=reminder_data,
            created_by_id=accepted_by_id,
        )

        # Update suggestion
        suggestion.status = "accepted"
        suggestion.created_reminder_id = reminder.id
        suggestion.reviewed_at = datetime.now(timezone.utc)
        suggestion.reviewed_by_id = accepted_by_id

        await self.db.flush()
        await self.db.refresh(suggestion)

        return suggestion, reminder

    async def reject_suggestion(
        self,
        suggestion_id: str,
        data: SuggestionReject,
        rejected_by_id: str,
    ) -> ReminderSuggestion:
        """Reject a suggestion."""
        stmt = (
            select(ReminderSuggestion)
            .where(ReminderSuggestion.id == suggestion_id)
        )
        result = await self.db.execute(stmt)
        suggestion = result.scalar_one_or_none()

        if not suggestion:
            raise ReminderServiceError(f"Suggestion {suggestion_id} not found")

        if suggestion.status != "pending":
            raise InvalidStateError("Suggestion is not pending")

        suggestion.status = "rejected"
        suggestion.reviewed_at = datetime.now(timezone.utc)
        suggestion.reviewed_by_id = rejected_by_id
        suggestion.rejection_reason = data.reason

        await self.db.flush()
        await self.db.refresh(suggestion)
        return suggestion

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

    def team_to_brief(self, team: Team | None) -> TeamBrief | None:
        """Convert a team to a brief response."""
        if not team:
            return None
        return TeamBrief(
            id=team.id,
            name=team.name,
        )

    async def mark_instance_notified(self, instance_id: str) -> None:
        """Mark an instance as notified."""
        instance = await self.get_instance(instance_id)
        if instance:
            now = datetime.now(timezone.utc)
            if not instance.initial_notified_at:
                instance.initial_notified_at = now
            instance.last_notified_at = now
            instance.notification_count += 1
            if instance.status == InstanceStatus.PENDING.value:
                instance.status = InstanceStatus.NOTIFIED.value
            await self.db.flush()

    async def mark_instance_overdue(self, instance_id: str) -> None:
        """Mark an instance as overdue."""
        instance = await self.get_instance(instance_id)
        if instance and instance.status in [
            InstanceStatus.PENDING.value,
            InstanceStatus.NOTIFIED.value,
        ]:
            instance.status = InstanceStatus.OVERDUE.value
            await self.db.flush()
