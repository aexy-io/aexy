"""Event type service for booking module."""

import re
from uuid import uuid4

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.booking import EventType, TeamEventMember, AssignmentType


class EventTypeServiceError(Exception):
    """Base exception for event type service errors."""

    pass


class SlugAlreadyExistsError(EventTypeServiceError):
    """Slug already exists in workspace."""

    pass


class EventTypeService:
    """Service for managing event types."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_event_type(
        self,
        workspace_id: str,
        owner_id: str,
        name: str,
        slug: str,
        description: str | None = None,
        duration_minutes: int = 30,
        location_type: str = "google_meet",
        custom_location: str | None = None,
        color: str = "#3B82F6",
        is_team_event: bool = False,
        buffer_before: int = 0,
        buffer_after: int = 0,
        min_notice_hours: int = 24,
        max_future_days: int = 60,
        questions: list | None = None,
        payment_enabled: bool = False,
        payment_amount: int | None = None,
        payment_currency: str = "USD",
        confirmation_message: str | None = None,
    ) -> EventType:
        """Create a new event type."""
        # Check if slug already exists
        existing = await self.get_by_slug(workspace_id, slug)
        if existing:
            raise SlugAlreadyExistsError(f"Slug '{slug}' already exists in workspace")

        event_type = EventType(
            id=str(uuid4()),
            workspace_id=workspace_id,
            owner_id=owner_id,
            name=name,
            slug=slug,
            description=description,
            duration_minutes=duration_minutes,
            location_type=location_type,
            custom_location=custom_location,
            color=color,
            is_team_event=is_team_event,
            buffer_before=buffer_before,
            buffer_after=buffer_after,
            min_notice_hours=min_notice_hours,
            max_future_days=max_future_days,
            questions=questions or [],
            payment_enabled=payment_enabled,
            payment_amount=payment_amount,
            payment_currency=payment_currency,
            confirmation_message=confirmation_message,
        )

        self.db.add(event_type)
        await self.db.flush()
        return event_type

    async def get_event_type(self, event_type_id: str) -> EventType | None:
        """Get an event type by ID."""
        stmt = select(EventType).where(EventType.id == event_type_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_slug(self, workspace_id: str, slug: str) -> EventType | None:
        """Get an event type by workspace and slug."""
        stmt = select(EventType).where(
            and_(
                EventType.workspace_id == workspace_id,
                EventType.slug == slug,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_event_types(
        self,
        workspace_id: str,
        owner_id: str | None = None,
        is_active: bool | None = None,
        is_team_event: bool | None = None,
    ) -> list[EventType]:
        """List event types in a workspace."""
        conditions = [EventType.workspace_id == workspace_id]

        if owner_id is not None:
            conditions.append(EventType.owner_id == owner_id)
        if is_active is not None:
            conditions.append(EventType.is_active == is_active)
        if is_team_event is not None:
            conditions.append(EventType.is_team_event == is_team_event)

        stmt = (
            select(EventType)
            .where(and_(*conditions))
            .order_by(EventType.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_event_type(
        self,
        event_type_id: str,
        **kwargs,
    ) -> EventType | None:
        """Update an event type."""
        event_type = await self.get_event_type(event_type_id)
        if not event_type:
            return None

        # If updating slug, check for conflicts
        if "slug" in kwargs and kwargs["slug"] != event_type.slug:
            existing = await self.get_by_slug(event_type.workspace_id, kwargs["slug"])
            if existing:
                raise SlugAlreadyExistsError(f"Slug '{kwargs['slug']}' already exists")

        for key, value in kwargs.items():
            if hasattr(event_type, key) and value is not None:
                setattr(event_type, key, value)

        await self.db.flush()
        await self.db.refresh(event_type)
        return event_type

    async def delete_event_type(self, event_type_id: str) -> bool:
        """Delete an event type."""
        event_type = await self.get_event_type(event_type_id)
        if not event_type:
            return False

        await self.db.delete(event_type)
        await self.db.flush()
        return True

    async def duplicate_event_type(
        self,
        event_type_id: str,
        new_name: str | None = None,
    ) -> EventType | None:
        """Duplicate an event type."""
        original = await self.get_event_type(event_type_id)
        if not original:
            return None

        # Generate new slug
        base_slug = original.slug
        new_slug = f"{base_slug}-copy"
        counter = 1
        while await self.get_by_slug(original.workspace_id, new_slug):
            counter += 1
            new_slug = f"{base_slug}-copy-{counter}"

        duplicate = EventType(
            id=str(uuid4()),
            workspace_id=original.workspace_id,
            owner_id=original.owner_id,
            name=new_name or f"{original.name} (Copy)",
            slug=new_slug,
            description=original.description,
            duration_minutes=original.duration_minutes,
            location_type=original.location_type,
            custom_location=original.custom_location,
            color=original.color,
            is_active=False,  # Start as inactive
            is_team_event=original.is_team_event,
            buffer_before=original.buffer_before,
            buffer_after=original.buffer_after,
            min_notice_hours=original.min_notice_hours,
            max_future_days=original.max_future_days,
            questions=original.questions.copy() if original.questions else [],
            payment_enabled=original.payment_enabled,
            payment_amount=original.payment_amount,
            payment_currency=original.payment_currency,
            confirmation_message=original.confirmation_message,
        )

        self.db.add(duplicate)
        await self.db.flush()
        return duplicate

    # Team event member management

    async def add_team_member(
        self,
        event_type_id: str,
        user_id: str,
        assignment_type: str = AssignmentType.ROUND_ROBIN.value,
        priority: int = 0,
    ) -> TeamEventMember:
        """Add a team member to an event type."""
        member = TeamEventMember(
            id=str(uuid4()),
            event_type_id=event_type_id,
            user_id=user_id,
            assignment_type=assignment_type,
            priority=priority,
        )
        self.db.add(member)
        await self.db.flush()
        return member

    async def remove_team_member(
        self,
        event_type_id: str,
        user_id: str,
    ) -> bool:
        """Remove a team member from an event type."""
        stmt = select(TeamEventMember).where(
            and_(
                TeamEventMember.event_type_id == event_type_id,
                TeamEventMember.user_id == user_id,
            )
        )
        result = await self.db.execute(stmt)
        member = result.scalar_one_or_none()

        if not member:
            return False

        await self.db.delete(member)
        await self.db.flush()
        return True

    async def get_team_members(self, event_type_id: str) -> list[TeamEventMember]:
        """Get all team members for an event type."""
        stmt = (
            select(TeamEventMember)
            .where(
                and_(
                    TeamEventMember.event_type_id == event_type_id,
                    TeamEventMember.is_active == True,
                )
            )
            .order_by(TeamEventMember.priority)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_team_members(
        self,
        event_type_id: str,
        members: list[dict],
    ) -> list[TeamEventMember]:
        """Bulk update team members for an event type."""
        # Remove all existing members
        stmt = select(TeamEventMember).where(
            TeamEventMember.event_type_id == event_type_id
        )
        result = await self.db.execute(stmt)
        existing = result.scalars().all()
        for member in existing:
            await self.db.delete(member)

        # Add new members
        new_members = []
        for member_data in members:
            member = TeamEventMember(
                id=str(uuid4()),
                event_type_id=event_type_id,
                user_id=member_data["user_id"],
                assignment_type=member_data.get(
                    "assignment_type", AssignmentType.ROUND_ROBIN.value
                ),
                priority=member_data.get("priority", 0),
            )
            self.db.add(member)
            new_members.append(member)

        await self.db.flush()
        return new_members

    @staticmethod
    def generate_slug(name: str) -> str:
        """Generate a URL-friendly slug from a name."""
        slug = name.lower()
        slug = re.sub(r"[^a-z0-9\s-]", "", slug)
        slug = re.sub(r"[\s_]+", "-", slug)
        slug = re.sub(r"-+", "-", slug)
        slug = slug.strip("-")
        return slug[:100]  # Max 100 chars
