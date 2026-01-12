"""Role management service."""

import re
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from aexy.models.role import CustomRole
from aexy.models.permissions import ROLE_TEMPLATES, PERMISSIONS


def generate_slug(name: str) -> str:
    """Generate a URL-safe slug from a name."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[-\s]+", "-", slug)
    return slug[:100]


class RoleService:
    """Service for managing custom roles."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_role(
        self,
        workspace_id: str,
        name: str,
        description: str | None = None,
        color: str = "#64748b",
        icon: str = "User",
        permissions: list[str] | None = None,
        based_on_template: str | None = None,
        priority: int = 50,
        is_system: bool = False,
    ) -> CustomRole:
        """
        Create a new custom role.

        If based_on_template is provided, permissions default to template permissions.
        """
        # Generate slug
        slug = generate_slug(name)

        # Check for duplicate slug
        existing = await self.get_role_by_slug(workspace_id, slug)
        if existing:
            # Append number to make unique
            counter = 1
            while await self.get_role_by_slug(workspace_id, f"{slug}-{counter}"):
                counter += 1
            slug = f"{slug}-{counter}"

        # Get permissions from template if specified
        if based_on_template and permissions is None:
            template = ROLE_TEMPLATES.get(based_on_template)
            if template:
                permissions = template.get("permissions", [])
                if not color or color == "#64748b":
                    color = template.get("color", "#64748b")
                if not icon or icon == "User":
                    icon = template.get("icon", "User")
                if priority == 50:
                    priority = template.get("priority", 50)

        # Validate permissions
        if permissions:
            permissions = [p for p in permissions if p in PERMISSIONS]
        else:
            permissions = []

        role = CustomRole(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            slug=slug,
            description=description,
            color=color,
            icon=icon,
            based_on_template=based_on_template,
            is_system=is_system,
            permissions=permissions,
            priority=priority,
        )

        self.db.add(role)
        return role

    async def create_system_roles(self, workspace_id: str) -> list[CustomRole]:
        """
        Create system roles from templates for a workspace.

        Called when a new workspace is created.
        """
        roles = []
        for template_id, template in ROLE_TEMPLATES.items():
            role = await self.create_role(
                workspace_id=workspace_id,
                name=template["name"],
                description=template["description"],
                color=template["color"],
                icon=template["icon"],
                permissions=template["permissions"],
                based_on_template=template_id,
                priority=template["priority"],
                is_system=True,
            )
            roles.append(role)
        return roles

    async def get_role(self, role_id: str) -> CustomRole | None:
        """Get a role by ID."""
        stmt = select(CustomRole).where(CustomRole.id == role_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_role_by_slug(
        self, workspace_id: str, slug: str
    ) -> CustomRole | None:
        """Get a role by workspace and slug."""
        stmt = select(CustomRole).where(
            and_(
                CustomRole.workspace_id == workspace_id,
                CustomRole.slug == slug,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_system_role_by_template(
        self, workspace_id: str, template_id: str
    ) -> CustomRole | None:
        """Get a system role by its template ID."""
        stmt = select(CustomRole).where(
            and_(
                CustomRole.workspace_id == workspace_id,
                CustomRole.based_on_template == template_id,
                CustomRole.is_system == True,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_roles(
        self,
        workspace_id: str,
        include_system: bool = True,
        include_inactive: bool = False,
    ) -> list[CustomRole]:
        """List all roles in a workspace."""
        conditions = [CustomRole.workspace_id == workspace_id]

        if not include_system:
            conditions.append(CustomRole.is_system == False)

        if not include_inactive:
            conditions.append(CustomRole.is_active == True)

        stmt = (
            select(CustomRole)
            .where(and_(*conditions))
            .order_by(CustomRole.priority.desc(), CustomRole.name)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_role(
        self,
        role_id: str,
        name: str | None = None,
        description: str | None = None,
        color: str | None = None,
        icon: str | None = None,
        permissions: list[str] | None = None,
        priority: int | None = None,
        is_active: bool | None = None,
    ) -> CustomRole | None:
        """
        Update a custom role.

        Note: System roles can have limited updates (color, icon only).
        """
        role = await self.get_role(role_id)
        if not role:
            return None

        # System roles have limited updateability
        if role.is_system:
            # Only allow color and icon changes for system roles
            if color is not None:
                role.color = color
            if icon is not None:
                role.icon = icon
            return role

        if name is not None:
            role.name = name
            # Regenerate slug if name changed
            new_slug = generate_slug(name)
            if new_slug != role.slug:
                existing = await self.get_role_by_slug(role.workspace_id, new_slug)
                if existing and existing.id != role_id:
                    counter = 1
                    while await self.get_role_by_slug(
                        role.workspace_id, f"{new_slug}-{counter}"
                    ):
                        counter += 1
                    new_slug = f"{new_slug}-{counter}"
                role.slug = new_slug

        if description is not None:
            role.description = description

        if color is not None:
            role.color = color

        if icon is not None:
            role.icon = icon

        if permissions is not None:
            # Validate permissions
            role.permissions = [p for p in permissions if p in PERMISSIONS]

        if priority is not None:
            role.priority = priority

        if is_active is not None:
            role.is_active = is_active

        return role

    async def delete_role(self, role_id: str) -> bool:
        """
        Delete a custom role.

        System roles cannot be deleted.
        """
        role = await self.get_role(role_id)
        if not role or role.is_system:
            return False

        await self.db.delete(role)
        return True

    async def reset_role_to_template(self, role_id: str) -> CustomRole | None:
        """
        Reset a role's permissions to its template defaults.

        Only works for roles that have a based_on_template value.
        """
        role = await self.get_role(role_id)
        if not role or not role.based_on_template:
            return None

        template = ROLE_TEMPLATES.get(role.based_on_template)
        if not template:
            return None

        role.permissions = template["permissions"]
        return role

    async def duplicate_role(
        self,
        role_id: str,
        new_name: str,
    ) -> CustomRole | None:
        """Duplicate an existing role with a new name."""
        source_role = await self.get_role(role_id)
        if not source_role:
            return None

        return await self.create_role(
            workspace_id=source_role.workspace_id,
            name=new_name,
            description=source_role.description,
            color=source_role.color,
            icon=source_role.icon,
            permissions=source_role.permissions.copy(),
            based_on_template=source_role.based_on_template,
            priority=source_role.priority,
            is_system=False,  # Duplicates are never system roles
        )
