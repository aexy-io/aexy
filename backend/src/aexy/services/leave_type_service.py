"""Leave type service for managing configurable leave categories."""

from uuid import uuid4

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.leave import LeaveType, DEFAULT_LEAVE_TYPES


class LeaveTypeService:
    """Service for managing leave types within a workspace."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        workspace_id: str,
        name: str,
        slug: str,
        description: str | None = None,
        color: str = "#3b82f6",
        icon: str | None = None,
        is_paid: bool = True,
        requires_approval: bool = True,
        min_notice_days: int = 0,
        allows_half_day: bool = True,
        is_active: bool = True,
        sort_order: int = 0,
    ) -> LeaveType:
        """Create a new leave type."""
        existing = await self.get_by_slug(workspace_id, slug)
        if existing:
            raise ValueError(f"Leave type with slug '{slug}' already exists")

        leave_type = LeaveType(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            slug=slug,
            description=description,
            color=color,
            icon=icon,
            is_paid=is_paid,
            requires_approval=requires_approval,
            min_notice_days=min_notice_days,
            allows_half_day=allows_half_day,
            is_active=is_active,
            sort_order=sort_order,
        )

        self.db.add(leave_type)
        await self.db.flush()
        await self.db.refresh(leave_type)
        return leave_type

    async def get_all(
        self, workspace_id: str, include_inactive: bool = False
    ) -> list[LeaveType]:
        """Get all leave types for a workspace."""
        conditions = [LeaveType.workspace_id == workspace_id]
        if not include_inactive:
            conditions.append(LeaveType.is_active == True)  # noqa: E712

        stmt = (
            select(LeaveType)
            .where(and_(*conditions))
            .order_by(LeaveType.sort_order.asc(), LeaveType.name.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, leave_type_id: str) -> LeaveType | None:
        """Get a leave type by ID."""
        stmt = select(LeaveType).where(LeaveType.id == leave_type_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_slug(self, workspace_id: str, slug: str) -> LeaveType | None:
        """Get a leave type by workspace and slug."""
        stmt = select(LeaveType).where(
            and_(
                LeaveType.workspace_id == workspace_id,
                LeaveType.slug == slug,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update(self, leave_type_id: str, **kwargs) -> LeaveType | None:
        """Update a leave type."""
        leave_type = await self.get_by_id(leave_type_id)
        if not leave_type:
            return None

        allowed = {
            "name", "slug", "description", "color", "icon", "is_paid",
            "requires_approval", "min_notice_days", "allows_half_day",
            "is_active", "sort_order",
        }
        for key, value in kwargs.items():
            if key in allowed:
                setattr(leave_type, key, value)

        await self.db.flush()
        await self.db.refresh(leave_type)
        return leave_type

    async def delete(self, leave_type_id: str) -> bool:
        """Delete a leave type."""
        leave_type = await self.get_by_id(leave_type_id)
        if not leave_type:
            return False
        await self.db.delete(leave_type)
        await self.db.flush()
        return True

    async def seed_default_leave_types(self, workspace_id: str) -> list[LeaveType]:
        """Seed default leave types for a new workspace."""
        created = []
        for defaults in DEFAULT_LEAVE_TYPES:
            existing = await self.get_by_slug(workspace_id, defaults["slug"])
            if existing:
                continue

            leave_type = LeaveType(
                id=str(uuid4()),
                workspace_id=workspace_id,
                name=defaults["name"],
                slug=defaults["slug"],
                color=defaults.get("color", "#3b82f6"),
                icon=defaults.get("icon"),
                is_paid=defaults.get("is_paid", True),
                requires_approval=defaults.get("requires_approval", True),
                min_notice_days=defaults.get("min_notice_days", 0),
                allows_half_day=defaults.get("allows_half_day", True),
                sort_order=defaults.get("sort_order", 0),
            )
            self.db.add(leave_type)
            created.append(leave_type)

        if created:
            await self.db.flush()
            for lt in created:
                await self.db.refresh(lt)
        return created
