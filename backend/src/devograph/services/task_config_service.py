"""Task Configuration Service for managing custom statuses and fields."""

import re
from uuid import uuid4

from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.models.sprint import WorkspaceTaskStatus, WorkspaceCustomField


def slugify(text: str) -> str:
    """Convert text to a URL-friendly slug."""
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '_', text)
    return text.strip('_')


# Default statuses to seed for new workspaces
DEFAULT_STATUSES = [
    {"name": "Backlog", "slug": "backlog", "category": "todo", "color": "#9CA3AF", "position": 0, "is_default": True},
    {"name": "To Do", "slug": "todo", "category": "todo", "color": "#3B82F6", "position": 1, "is_default": False},
    {"name": "In Progress", "slug": "in_progress", "category": "in_progress", "color": "#F59E0B", "position": 2, "is_default": False},
    {"name": "In Review", "slug": "in_review", "category": "in_progress", "color": "#8B5CF6", "position": 3, "is_default": False},
    {"name": "Done", "slug": "done", "category": "done", "color": "#10B981", "position": 4, "is_default": False},
]


class TaskConfigService:
    """Service for managing custom task statuses and fields."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ==================== Status Management ====================

    async def get_statuses(
        self,
        workspace_id: str,
        include_inactive: bool = False,
    ) -> list[WorkspaceTaskStatus]:
        """Get all task statuses for a workspace."""
        stmt = (
            select(WorkspaceTaskStatus)
            .where(WorkspaceTaskStatus.workspace_id == workspace_id)
        )
        if not include_inactive:
            stmt = stmt.where(WorkspaceTaskStatus.is_active == True)
        stmt = stmt.order_by(WorkspaceTaskStatus.position)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_status(self, status_id: str) -> WorkspaceTaskStatus | None:
        """Get a status by ID."""
        stmt = select(WorkspaceTaskStatus).where(WorkspaceTaskStatus.id == status_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_status_by_slug(
        self,
        workspace_id: str,
        slug: str,
    ) -> WorkspaceTaskStatus | None:
        """Get a status by slug within a workspace."""
        stmt = (
            select(WorkspaceTaskStatus)
            .where(WorkspaceTaskStatus.workspace_id == workspace_id)
            .where(WorkspaceTaskStatus.slug == slug)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_status(
        self,
        workspace_id: str,
        name: str,
        category: str = "todo",
        color: str = "#6B7280",
        icon: str | None = None,
        is_default: bool = False,
    ) -> WorkspaceTaskStatus:
        """Create a new task status."""
        # Generate unique slug
        base_slug = slugify(name)
        slug = base_slug
        counter = 1

        while await self.get_status_by_slug(workspace_id, slug):
            slug = f"{base_slug}_{counter}"
            counter += 1

        # Get next position
        stmt = (
            select(func.coalesce(func.max(WorkspaceTaskStatus.position), -1) + 1)
            .where(WorkspaceTaskStatus.workspace_id == workspace_id)
        )
        result = await self.db.execute(stmt)
        next_position = result.scalar() or 0

        status = WorkspaceTaskStatus(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            slug=slug,
            category=category,
            color=color,
            icon=icon,
            position=next_position,
            is_default=is_default,
            is_active=True,
        )
        self.db.add(status)
        await self.db.flush()
        await self.db.refresh(status)
        return status

    async def update_status(
        self,
        status_id: str,
        name: str | None = None,
        category: str | None = None,
        color: str | None = None,
        icon: str | None = None,
        is_default: bool | None = None,
    ) -> WorkspaceTaskStatus | None:
        """Update a task status."""
        status = await self.get_status(status_id)
        if not status:
            return None

        if name is not None:
            status.name = name
            # Update slug if name changes
            status.slug = slugify(name)
        if category is not None:
            status.category = category
        if color is not None:
            status.color = color
        if icon is not None:
            status.icon = icon
        if is_default is not None:
            status.is_default = is_default

        await self.db.flush()
        await self.db.refresh(status)
        return status

    async def delete_status(self, status_id: str) -> bool:
        """Soft delete a status (mark as inactive)."""
        status = await self.get_status(status_id)
        if not status:
            return False

        status.is_active = False
        await self.db.flush()
        return True

    async def reorder_statuses(
        self,
        workspace_id: str,
        status_ids: list[str],
    ) -> list[WorkspaceTaskStatus]:
        """Reorder statuses by providing new order of IDs."""
        for position, status_id in enumerate(status_ids):
            await self.db.execute(
                update(WorkspaceTaskStatus)
                .where(WorkspaceTaskStatus.id == status_id)
                .where(WorkspaceTaskStatus.workspace_id == workspace_id)
                .values(position=position)
            )
        await self.db.flush()
        return await self.get_statuses(workspace_id)

    async def seed_default_statuses(self, workspace_id: str) -> list[WorkspaceTaskStatus]:
        """Seed default statuses for a new workspace."""
        statuses = []
        for status_data in DEFAULT_STATUSES:
            status = WorkspaceTaskStatus(
                id=str(uuid4()),
                workspace_id=workspace_id,
                **status_data,
                is_active=True,
            )
            self.db.add(status)
            statuses.append(status)

        await self.db.flush()
        return statuses

    # ==================== Custom Field Management ====================

    async def get_custom_fields(
        self,
        workspace_id: str,
        include_inactive: bool = False,
    ) -> list[WorkspaceCustomField]:
        """Get all custom fields for a workspace."""
        stmt = (
            select(WorkspaceCustomField)
            .where(WorkspaceCustomField.workspace_id == workspace_id)
        )
        if not include_inactive:
            stmt = stmt.where(WorkspaceCustomField.is_active == True)
        stmt = stmt.order_by(WorkspaceCustomField.position)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_custom_field(self, field_id: str) -> WorkspaceCustomField | None:
        """Get a custom field by ID."""
        stmt = select(WorkspaceCustomField).where(WorkspaceCustomField.id == field_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_custom_field_by_slug(
        self,
        workspace_id: str,
        slug: str,
    ) -> WorkspaceCustomField | None:
        """Get a custom field by slug within a workspace."""
        stmt = (
            select(WorkspaceCustomField)
            .where(WorkspaceCustomField.workspace_id == workspace_id)
            .where(WorkspaceCustomField.slug == slug)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_custom_field(
        self,
        workspace_id: str,
        name: str,
        field_type: str,
        options: list[dict] | None = None,
        is_required: bool = False,
        default_value: str | None = None,
    ) -> WorkspaceCustomField:
        """Create a new custom field."""
        # Generate unique slug
        base_slug = slugify(name)
        slug = base_slug
        counter = 1

        while await self.get_custom_field_by_slug(workspace_id, slug):
            slug = f"{base_slug}_{counter}"
            counter += 1

        # Get next position
        stmt = (
            select(func.coalesce(func.max(WorkspaceCustomField.position), -1) + 1)
            .where(WorkspaceCustomField.workspace_id == workspace_id)
        )
        result = await self.db.execute(stmt)
        next_position = result.scalar() or 0

        field = WorkspaceCustomField(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            slug=slug,
            field_type=field_type,
            options=options,
            is_required=is_required,
            default_value=default_value,
            position=next_position,
            is_active=True,
        )
        self.db.add(field)
        await self.db.flush()
        await self.db.refresh(field)
        return field

    async def update_custom_field(
        self,
        field_id: str,
        name: str | None = None,
        options: list[dict] | None = None,
        is_required: bool | None = None,
        default_value: str | None = None,
    ) -> WorkspaceCustomField | None:
        """Update a custom field."""
        field = await self.get_custom_field(field_id)
        if not field:
            return None

        if name is not None:
            field.name = name
            field.slug = slugify(name)
        if options is not None:
            field.options = options
        if is_required is not None:
            field.is_required = is_required
        if default_value is not None:
            field.default_value = default_value

        await self.db.flush()
        await self.db.refresh(field)
        return field

    async def delete_custom_field(self, field_id: str) -> bool:
        """Soft delete a custom field (mark as inactive)."""
        field = await self.get_custom_field(field_id)
        if not field:
            return False

        field.is_active = False
        await self.db.flush()
        return True

    async def reorder_custom_fields(
        self,
        workspace_id: str,
        field_ids: list[str],
    ) -> list[WorkspaceCustomField]:
        """Reorder custom fields by providing new order of IDs."""
        for position, field_id in enumerate(field_ids):
            await self.db.execute(
                update(WorkspaceCustomField)
                .where(WorkspaceCustomField.id == field_id)
                .where(WorkspaceCustomField.workspace_id == workspace_id)
                .values(position=position)
            )
        await self.db.flush()
        return await self.get_custom_fields(workspace_id)
