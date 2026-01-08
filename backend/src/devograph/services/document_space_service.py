"""Document Space service for organizing documents within workspaces."""

import re
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import and_, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.documentation import (
    Document,
    DocumentSpace,
    DocumentSpaceMember,
    DocumentSpaceRole,
)
from aexy.models.workspace import Workspace, WorkspaceMember


def generate_slug(name: str) -> str:
    """Generate a URL-safe slug from a name."""
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug[:100]


class DocumentSpaceService:
    """Service for document space CRUD and membership management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ==================== Space CRUD ====================

    async def create_space(
        self,
        workspace_id: str,
        name: str,
        created_by_id: str,
        description: str | None = None,
        icon: str | None = None,
        color: str | None = None,
        is_default: bool = False,
    ) -> DocumentSpace:
        """Create a new document space.

        Args:
            workspace_id: The workspace to create the space in.
            name: Space display name.
            created_by_id: Developer creating the space.
            description: Optional description.
            icon: Emoji or icon name.
            color: Hex color for the space.
            is_default: Whether this is the default space.

        Returns:
            Created DocumentSpace.
        """
        # Generate unique slug within workspace
        base_slug = generate_slug(name)
        slug = base_slug
        counter = 1

        while True:
            existing = await self.db.execute(
                select(DocumentSpace).where(
                    and_(
                        DocumentSpace.workspace_id == workspace_id,
                        DocumentSpace.slug == slug,
                    )
                )
            )
            if not existing.scalar_one_or_none():
                break
            slug = f"{base_slug}-{counter}"
            counter += 1

        space = DocumentSpace(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            slug=slug,
            description=description,
            icon=icon or "📁",
            color=color or "#6366F1",
            is_default=is_default,
            is_archived=False,
            settings={},
            created_by_id=created_by_id,
        )
        self.db.add(space)

        # Add creator as admin member
        member = DocumentSpaceMember(
            id=str(uuid4()),
            space_id=space.id,
            developer_id=created_by_id,
            role=DocumentSpaceRole.ADMIN.value,
            joined_at=datetime.now(timezone.utc),
        )
        self.db.add(member)

        await self.db.flush()
        await self.db.refresh(space)
        return space

    async def create_default_space(
        self,
        workspace_id: str,
        created_by_id: str,
    ) -> DocumentSpace:
        """Create the default 'General' space for a workspace.

        Also adds all existing workspace members to the space.
        """
        space = await self.create_space(
            workspace_id=workspace_id,
            name="General",
            created_by_id=created_by_id,
            description="Default space for all workspace documents",
            icon="📄",
            color="#6366F1",
            is_default=True,
        )

        # Add all workspace members to the default space
        workspace_members = await self.db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.status == "active",
            )
        )

        for member in workspace_members.scalars().all():
            # Skip the creator (already added)
            if member.developer_id == created_by_id:
                continue

            # Map workspace role to space role
            space_role = DocumentSpaceRole.EDITOR.value
            if member.role in ("owner", "admin"):
                space_role = DocumentSpaceRole.ADMIN.value
            elif member.role == "viewer":
                space_role = DocumentSpaceRole.VIEWER.value

            space_member = DocumentSpaceMember(
                id=str(uuid4()),
                space_id=space.id,
                developer_id=member.developer_id,
                role=space_role,
                joined_at=datetime.now(timezone.utc),
            )
            self.db.add(space_member)

        await self.db.flush()
        return space

    async def get_space(
        self,
        space_id: str,
        workspace_id: str | None = None,
    ) -> DocumentSpace | None:
        """Get a space by ID with members."""
        stmt = (
            select(DocumentSpace)
            .where(DocumentSpace.id == space_id)
            .options(
                selectinload(DocumentSpace.members),
                selectinload(DocumentSpace.created_by),
            )
        )

        if workspace_id:
            stmt = stmt.where(DocumentSpace.workspace_id == workspace_id)

        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_default_space(
        self,
        workspace_id: str,
    ) -> DocumentSpace | None:
        """Get the default space for a workspace."""
        stmt = select(DocumentSpace).where(
            and_(
                DocumentSpace.workspace_id == workspace_id,
                DocumentSpace.is_default == True,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update_space(
        self,
        space_id: str,
        name: str | None = None,
        description: str | None = None,
        icon: str | None = None,
        color: str | None = None,
        is_archived: bool | None = None,
    ) -> DocumentSpace | None:
        """Update a space's details."""
        space = await self.get_space(space_id)
        if not space:
            return None

        if name is not None:
            space.name = name
            # Update slug if name changed
            space.slug = generate_slug(name)
        if description is not None:
            space.description = description
        if icon is not None:
            space.icon = icon
        if color is not None:
            space.color = color
        if is_archived is not None:
            space.is_archived = is_archived

        space.updated_at = datetime.now(timezone.utc)

        await self.db.flush()
        await self.db.refresh(space)
        return space

    async def delete_space(self, space_id: str) -> bool:
        """Delete a space. Cannot delete default space."""
        space = await self.get_space(space_id)
        if not space or space.is_default:
            return False

        # Move documents to default space before deleting
        default_space = await self.get_default_space(space.workspace_id)
        if default_space:
            await self.db.execute(
                update(Document)
                .where(Document.space_id == space_id)
                .values(space_id=default_space.id)
            )

        await self.db.execute(
            delete(DocumentSpace).where(DocumentSpace.id == space_id)
        )
        await self.db.flush()
        return True

    # ==================== Space Listing ====================

    async def get_user_spaces(
        self,
        workspace_id: str,
        developer_id: str,
        include_archived: bool = False,
    ) -> list[DocumentSpace]:
        """Get spaces accessible to a user.

        Workspace admins/owners see ALL spaces.
        Regular members see only spaces they belong to.
        """
        # Check if user is workspace admin/owner
        ws_member = await self.db.execute(
            select(WorkspaceMember).where(
                and_(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.developer_id == developer_id,
                    WorkspaceMember.status == "active",
                )
            )
        )
        ws_member = ws_member.scalar_one_or_none()

        if not ws_member:
            return []

        is_workspace_admin = ws_member.role in ("owner", "admin")

        # Build query
        if is_workspace_admin:
            # Admins see all spaces
            stmt = select(DocumentSpace).where(
                DocumentSpace.workspace_id == workspace_id
            )
        else:
            # Regular members only see spaces they belong to
            stmt = (
                select(DocumentSpace)
                .join(DocumentSpaceMember)
                .where(
                    and_(
                        DocumentSpace.workspace_id == workspace_id,
                        DocumentSpaceMember.developer_id == developer_id,
                    )
                )
            )

        if not include_archived:
            stmt = stmt.where(DocumentSpace.is_archived == False)

        stmt = stmt.options(selectinload(DocumentSpace.members))
        stmt = stmt.order_by(DocumentSpace.is_default.desc(), DocumentSpace.name)

        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())

    async def get_space_stats(
        self,
        space_id: str,
    ) -> dict:
        """Get statistics for a space."""
        # Count members
        member_count = await self.db.execute(
            select(func.count(DocumentSpaceMember.id)).where(
                DocumentSpaceMember.space_id == space_id
            )
        )
        member_count = member_count.scalar() or 0

        # Count documents
        doc_count = await self.db.execute(
            select(func.count(Document.id)).where(
                Document.space_id == space_id
            )
        )
        doc_count = doc_count.scalar() or 0

        return {
            "member_count": member_count,
            "document_count": doc_count,
        }

    # ==================== Permission Checking ====================

    async def check_space_permission(
        self,
        space_id: str,
        developer_id: str,
        required_role: str = DocumentSpaceRole.VIEWER.value,
    ) -> bool:
        """Check if user has required permission in space.

        Role hierarchy: admin > editor > viewer
        """
        # Get space to check workspace
        space = await self.get_space(space_id)
        if not space:
            return False

        # Check if workspace admin (they have access to all spaces)
        ws_member = await self.db.execute(
            select(WorkspaceMember).where(
                and_(
                    WorkspaceMember.workspace_id == space.workspace_id,
                    WorkspaceMember.developer_id == developer_id,
                    WorkspaceMember.status == "active",
                )
            )
        )
        ws_member = ws_member.scalar_one_or_none()

        if ws_member and ws_member.role in ("owner", "admin"):
            return True

        # Check space membership
        space_member = await self.db.execute(
            select(DocumentSpaceMember).where(
                and_(
                    DocumentSpaceMember.space_id == space_id,
                    DocumentSpaceMember.developer_id == developer_id,
                )
            )
        )
        space_member = space_member.scalar_one_or_none()

        if not space_member:
            return False

        # Check role hierarchy
        role_order = {
            DocumentSpaceRole.VIEWER.value: 1,
            DocumentSpaceRole.EDITOR.value: 2,
            DocumentSpaceRole.ADMIN.value: 3,
        }

        user_level = role_order.get(space_member.role, 0)
        required_level = role_order.get(required_role, 0)

        return user_level >= required_level

    async def get_user_role_in_space(
        self,
        space_id: str,
        developer_id: str,
    ) -> str | None:
        """Get user's role in a space."""
        # Check workspace-level role first
        space = await self.get_space(space_id)
        if not space:
            return None

        ws_member = await self.db.execute(
            select(WorkspaceMember).where(
                and_(
                    WorkspaceMember.workspace_id == space.workspace_id,
                    WorkspaceMember.developer_id == developer_id,
                    WorkspaceMember.status == "active",
                )
            )
        )
        ws_member = ws_member.scalar_one_or_none()

        if ws_member and ws_member.role in ("owner", "admin"):
            return DocumentSpaceRole.ADMIN.value

        # Check space membership
        space_member = await self.db.execute(
            select(DocumentSpaceMember).where(
                and_(
                    DocumentSpaceMember.space_id == space_id,
                    DocumentSpaceMember.developer_id == developer_id,
                )
            )
        )
        space_member = space_member.scalar_one_or_none()

        return space_member.role if space_member else None

    # ==================== Member Management ====================

    async def add_member(
        self,
        space_id: str,
        developer_id: str,
        role: str = DocumentSpaceRole.EDITOR.value,
        invited_by_id: str | None = None,
    ) -> DocumentSpaceMember | None:
        """Add a member to a space."""
        # Check if already a member
        existing = await self.db.execute(
            select(DocumentSpaceMember).where(
                and_(
                    DocumentSpaceMember.space_id == space_id,
                    DocumentSpaceMember.developer_id == developer_id,
                )
            )
        )
        if existing.scalar_one_or_none():
            return None  # Already a member

        member = DocumentSpaceMember(
            id=str(uuid4()),
            space_id=space_id,
            developer_id=developer_id,
            role=role,
            invited_by_id=invited_by_id,
            invited_at=datetime.now(timezone.utc),
            joined_at=datetime.now(timezone.utc),
        )
        self.db.add(member)
        await self.db.flush()
        await self.db.refresh(member)
        return member

    async def update_member_role(
        self,
        space_id: str,
        developer_id: str,
        role: str,
    ) -> DocumentSpaceMember | None:
        """Update a member's role in a space."""
        result = await self.db.execute(
            select(DocumentSpaceMember).where(
                and_(
                    DocumentSpaceMember.space_id == space_id,
                    DocumentSpaceMember.developer_id == developer_id,
                )
            )
        )
        member = result.scalar_one_or_none()

        if not member:
            return None

        member.role = role
        member.updated_at = datetime.now(timezone.utc)

        await self.db.flush()
        await self.db.refresh(member)
        return member

    async def remove_member(
        self,
        space_id: str,
        developer_id: str,
    ) -> bool:
        """Remove a member from a space."""
        result = await self.db.execute(
            delete(DocumentSpaceMember).where(
                and_(
                    DocumentSpaceMember.space_id == space_id,
                    DocumentSpaceMember.developer_id == developer_id,
                )
            )
        )
        await self.db.flush()
        return result.rowcount > 0

    async def get_members(
        self,
        space_id: str,
    ) -> list[DocumentSpaceMember]:
        """Get all members of a space."""
        result = await self.db.execute(
            select(DocumentSpaceMember)
            .where(DocumentSpaceMember.space_id == space_id)
            .options(
                selectinload(DocumentSpaceMember.developer),
                selectinload(DocumentSpaceMember.invited_by),
            )
            .order_by(DocumentSpaceMember.joined_at)
        )
        return list(result.scalars().all())

    async def is_member(
        self,
        space_id: str,
        developer_id: str,
    ) -> bool:
        """Check if a user is a member of a space."""
        result = await self.db.execute(
            select(DocumentSpaceMember.id).where(
                and_(
                    DocumentSpaceMember.space_id == space_id,
                    DocumentSpaceMember.developer_id == developer_id,
                )
            )
        )
        return result.scalar_one_or_none() is not None

    # ==================== Bulk Operations ====================

    async def add_all_workspace_members_to_space(
        self,
        space_id: str,
        workspace_id: str,
        default_role: str = DocumentSpaceRole.EDITOR.value,
    ) -> int:
        """Add all workspace members to a space. Returns count added."""
        # Get existing space members
        existing_members = await self.db.execute(
            select(DocumentSpaceMember.developer_id).where(
                DocumentSpaceMember.space_id == space_id
            )
        )
        existing_ids = {row[0] for row in existing_members.fetchall()}

        # Get workspace members not yet in space
        workspace_members = await self.db.execute(
            select(WorkspaceMember).where(
                and_(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.status == "active",
                    ~WorkspaceMember.developer_id.in_(existing_ids),
                )
            )
        )

        count = 0
        for ws_member in workspace_members.scalars().all():
            # Map workspace role to space role
            space_role = default_role
            if ws_member.role in ("owner", "admin"):
                space_role = DocumentSpaceRole.ADMIN.value
            elif ws_member.role == "viewer":
                space_role = DocumentSpaceRole.VIEWER.value

            member = DocumentSpaceMember(
                id=str(uuid4()),
                space_id=space_id,
                developer_id=ws_member.developer_id,
                role=space_role,
                joined_at=datetime.now(timezone.utc),
            )
            self.db.add(member)
            count += 1

        await self.db.flush()
        return count
