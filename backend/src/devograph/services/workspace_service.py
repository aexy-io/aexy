"""Workspace service for managing workspaces and members."""

import re
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.workspace import Workspace, WorkspaceMember, WorkspaceSubscription, WorkspacePendingInvite
import secrets
from aexy.models.developer import Developer
from aexy.models.repository import Organization, DeveloperOrganization
from aexy.services.task_config_service import TaskConfigService
from aexy.services.document_space_service import DocumentSpaceService


def generate_slug(name: str) -> str:
    """Generate a URL-safe slug from a name."""
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug[:100]


class WorkspaceService:
    """Service for workspace CRUD and membership management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_workspace(
        self,
        name: str,
        owner_id: str,
        type: str = "internal",
        github_org_id: str | None = None,
        description: str | None = None,
    ) -> Workspace:
        """Create a new workspace.

        Args:
            name: Workspace display name.
            owner_id: Developer ID of the owner.
            type: "internal" or "github_linked".
            github_org_id: GitHub org ID if linking.
            description: Optional description.

        Returns:
            Created Workspace.
        """
        # Generate unique slug
        base_slug = generate_slug(name)
        slug = base_slug
        counter = 1

        while True:
            existing = await self.db.execute(
                select(Workspace).where(Workspace.slug == slug)
            )
            if not existing.scalar_one_or_none():
                break
            slug = f"{base_slug}-{counter}"
            counter += 1

        workspace = Workspace(
            id=str(uuid4()),
            name=name,
            slug=slug,
            type=type,
            description=description,
            github_org_id=github_org_id,
            owner_id=owner_id,
            settings={},
            is_active=True,
        )
        self.db.add(workspace)

        # Add owner as first member
        owner_member = WorkspaceMember(
            id=str(uuid4()),
            workspace_id=workspace.id,
            developer_id=owner_id,
            role="owner",
            status="active",
            is_billable=True,
            joined_at=datetime.now(timezone.utc),
            billing_start_date=datetime.now(timezone.utc),
        )
        self.db.add(owner_member)

        await self.db.flush()
        await self.db.refresh(workspace)

        # Seed default task statuses for the workspace
        task_config_service = TaskConfigService(self.db)
        await task_config_service.seed_default_statuses(workspace.id)

        # Create default document space for the workspace
        space_service = DocumentSpaceService(self.db)
        await space_service.create_default_space(
            workspace_id=workspace.id,
            created_by_id=owner_id,
        )

        return workspace

    async def get_workspace(self, workspace_id: str) -> Workspace | None:
        """Get a workspace by ID."""
        stmt = (
            select(Workspace)
            .where(Workspace.id == workspace_id)
            .options(selectinload(Workspace.members))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_workspace_by_slug(self, slug: str) -> Workspace | None:
        """Get a workspace by slug."""
        stmt = select(Workspace).where(Workspace.slug == slug)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_user_workspaces(self, developer_id: str) -> list[Workspace]:
        """List all workspaces a developer is a member of."""
        stmt = (
            select(Workspace)
            .join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
            .where(
                WorkspaceMember.developer_id == developer_id,
                WorkspaceMember.status == "active",
                Workspace.is_active == True,
            )
            .order_by(Workspace.name)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_workspace(
        self,
        workspace_id: str,
        name: str | None = None,
        description: str | None = None,
        avatar_url: str | None = None,
        settings: dict | None = None,
    ) -> Workspace | None:
        """Update a workspace."""
        workspace = await self.get_workspace(workspace_id)
        if not workspace:
            return None

        if name is not None:
            workspace.name = name
        if description is not None:
            workspace.description = description
        if avatar_url is not None:
            workspace.avatar_url = avatar_url
        if settings is not None:
            workspace.settings = settings

        await self.db.flush()
        await self.db.refresh(workspace)
        return workspace

    async def delete_workspace(self, workspace_id: str) -> bool:
        """Delete a workspace (soft delete by setting is_active=False)."""
        workspace = await self.get_workspace(workspace_id)
        if not workspace:
            return False

        workspace.is_active = False
        await self.db.flush()
        return True

    # Member management
    async def add_member(
        self,
        workspace_id: str,
        developer_id: str,
        role: str = "member",
        invited_by_id: str | None = None,
        status: str = "active",
    ) -> WorkspaceMember:
        """Add a member to a workspace."""
        # Check if already a member
        existing = await self.get_member(workspace_id, developer_id)
        if existing:
            if existing.status == "removed":
                # Reactivate
                existing.status = status
                existing.role = role
                existing.joined_at = datetime.now(timezone.utc) if status == "active" else None
                await self.db.flush()
                await self.db.refresh(existing)
                return existing
            raise ValueError("Developer is already a member of this workspace")

        member = WorkspaceMember(
            id=str(uuid4()),
            workspace_id=workspace_id,
            developer_id=developer_id,
            role=role,
            status=status,
            invited_by_id=invited_by_id,
            invited_at=datetime.now(timezone.utc) if status == "pending" else None,
            joined_at=datetime.now(timezone.utc) if status == "active" else None,
            is_billable=True,
            billing_start_date=datetime.now(timezone.utc) if status == "active" else None,
        )
        self.db.add(member)
        await self.db.flush()
        await self.db.refresh(member)
        return member

    async def get_member(
        self, workspace_id: str, developer_id: str
    ) -> WorkspaceMember | None:
        """Get a specific member."""
        stmt = select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.developer_id == developer_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def remove_member(self, workspace_id: str, developer_id: str) -> bool:
        """Remove a member from a workspace."""
        member = await self.get_member(workspace_id, developer_id)
        if not member:
            return False

        if member.role == "owner":
            raise ValueError("Cannot remove the workspace owner")

        member.status = "removed"
        await self.db.flush()
        return True

    async def update_member_role(
        self,
        workspace_id: str,
        developer_id: str,
        new_role: str,
    ) -> WorkspaceMember | None:
        """Update a member's role."""
        member = await self.get_member(workspace_id, developer_id)
        if not member:
            return None

        if member.role == "owner" and new_role != "owner":
            raise ValueError("Cannot change the owner's role")

        member.role = new_role
        await self.db.flush()
        await self.db.refresh(member)
        return member

    async def get_members(
        self,
        workspace_id: str,
        include_pending: bool = False,
        include_removed: bool = False,
    ) -> list[WorkspaceMember]:
        """Get all members of a workspace."""
        stmt = (
            select(WorkspaceMember)
            .where(WorkspaceMember.workspace_id == workspace_id)
            .options(selectinload(WorkspaceMember.developer))
        )

        if not include_removed:
            if include_pending:
                stmt = stmt.where(WorkspaceMember.status.in_(["active", "pending"]))
            else:
                stmt = stmt.where(WorkspaceMember.status == "active")

        stmt = stmt.order_by(WorkspaceMember.role, WorkspaceMember.joined_at)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_member_count(self, workspace_id: str) -> int:
        """Get count of active members."""
        stmt = (
            select(func.count(WorkspaceMember.id))
            .where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.status == "active",
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def get_billable_seat_count(self, workspace_id: str) -> int:
        """Get count of billable seats."""
        stmt = (
            select(func.count(WorkspaceMember.id))
            .where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.status == "active",
                WorkspaceMember.is_billable == True,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    # GitHub integration
    async def link_github_org(
        self, workspace_id: str, github_org_id: str
    ) -> Workspace | None:
        """Link a GitHub organization to a workspace."""
        workspace = await self.get_workspace(workspace_id)
        if not workspace:
            return None

        # Verify the GitHub org exists
        stmt = select(Organization).where(Organization.id == github_org_id)
        result = await self.db.execute(stmt)
        github_org = result.scalar_one_or_none()
        if not github_org:
            raise ValueError("GitHub organization not found")

        workspace.github_org_id = github_org_id
        workspace.type = "github_linked"
        if github_org.avatar_url:
            workspace.avatar_url = github_org.avatar_url

        await self.db.flush()
        await self.db.refresh(workspace)
        return workspace

    async def sync_github_org_members(self, workspace_id: str) -> int:
        """Sync members from linked GitHub organization.

        Returns:
            Number of members added.
        """
        workspace = await self.get_workspace(workspace_id)
        if not workspace or not workspace.github_org_id:
            return 0

        # Get developers who are part of the GitHub org
        stmt = (
            select(DeveloperOrganization)
            .where(
                DeveloperOrganization.organization_id == workspace.github_org_id,
                DeveloperOrganization.is_enabled == True,
            )
        )
        result = await self.db.execute(stmt)
        dev_orgs = result.scalars().all()

        added_count = 0
        for dev_org in dev_orgs:
            try:
                # Add as member if not already in workspace
                existing = await self.get_member(workspace_id, dev_org.developer_id)
                if not existing or existing.status == "removed":
                    role = "admin" if dev_org.role == "admin" else "member"
                    await self.add_member(
                        workspace_id=workspace_id,
                        developer_id=dev_org.developer_id,
                        role=role,
                        status="active",
                    )
                    added_count += 1
            except ValueError:
                # Already a member
                pass

        return added_count

    # Check permissions
    async def check_permission(
        self,
        workspace_id: str,
        developer_id: str,
        required_role: str = "member",
    ) -> bool:
        """Check if a developer has the required role in a workspace."""
        member = await self.get_member(workspace_id, developer_id)
        if not member or member.status != "active":
            return False

        role_hierarchy = {"owner": 4, "admin": 3, "member": 2, "viewer": 1}
        member_level = role_hierarchy.get(member.role, 0)
        required_level = role_hierarchy.get(required_role, 0)

        return member_level >= required_level

    async def is_owner(self, workspace_id: str, developer_id: str) -> bool:
        """Check if a developer is the workspace owner."""
        member = await self.get_member(workspace_id, developer_id)
        return member is not None and member.role == "owner"

    # Pending Invites
    async def create_pending_invite(
        self,
        workspace_id: str,
        email: str,
        role: str = "member",
        invited_by_id: str | None = None,
        app_permissions: dict | None = None,
        expires_days: int = 7,
    ) -> WorkspacePendingInvite:
        """Create a pending invite for a non-existing user."""
        from datetime import timedelta

        # Check if already invited
        existing = await self.get_pending_invite_by_email(workspace_id, email)
        if existing and existing.status == "pending":
            raise ValueError("An invitation has already been sent to this email")

        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(days=expires_days)

        invite = WorkspacePendingInvite(
            id=str(uuid4()),
            workspace_id=workspace_id,
            email=email.lower(),
            role=role,
            token=token,
            invited_by_id=invited_by_id,
            app_permissions=app_permissions,
            status="pending",
            expires_at=expires_at,
        )
        self.db.add(invite)
        await self.db.flush()
        await self.db.refresh(invite)
        return invite

    async def get_pending_invite_by_email(
        self, workspace_id: str, email: str
    ) -> WorkspacePendingInvite | None:
        """Get a pending invite by email."""
        stmt = select(WorkspacePendingInvite).where(
            WorkspacePendingInvite.workspace_id == workspace_id,
            WorkspacePendingInvite.email == email.lower(),
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_pending_invite_by_token(
        self, token: str
    ) -> WorkspacePendingInvite | None:
        """Get a pending invite by token."""
        stmt = (
            select(WorkspacePendingInvite)
            .where(
                WorkspacePendingInvite.token == token,
                WorkspacePendingInvite.status == "pending",
            )
            .options(selectinload(WorkspacePendingInvite.workspace))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_pending_invites(
        self, workspace_id: str
    ) -> list[WorkspacePendingInvite]:
        """Get all pending invites for a workspace."""
        stmt = (
            select(WorkspacePendingInvite)
            .where(
                WorkspacePendingInvite.workspace_id == workspace_id,
                WorkspacePendingInvite.status == "pending",
            )
            .options(selectinload(WorkspacePendingInvite.invited_by))
            .order_by(WorkspacePendingInvite.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def accept_pending_invite(
        self, token: str, developer_id: str
    ) -> WorkspaceMember | None:
        """Accept a pending invite and create a member."""
        invite = await self.get_pending_invite_by_token(token)
        if not invite:
            return None

        # Check if invite has expired
        if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
            invite.status = "expired"
            await self.db.flush()
            return None

        # Create member with the role and permissions from invite
        member = await self.add_member(
            workspace_id=invite.workspace_id,
            developer_id=developer_id,
            role=invite.role,
            invited_by_id=invite.invited_by_id,
            status="active",
        )

        # Apply app permissions if set
        if invite.app_permissions:
            member.app_permissions = invite.app_permissions
            await self.db.flush()
            await self.db.refresh(member)

        # Mark invite as accepted
        invite.status = "accepted"
        await self.db.flush()

        return member

    async def revoke_pending_invite(self, workspace_id: str, invite_id: str) -> bool:
        """Revoke a pending invite."""
        stmt = select(WorkspacePendingInvite).where(
            WorkspacePendingInvite.id == invite_id,
            WorkspacePendingInvite.workspace_id == workspace_id,
            WorkspacePendingInvite.status == "pending",
        )
        result = await self.db.execute(stmt)
        invite = result.scalar_one_or_none()
        if not invite:
            return False

        invite.status = "revoked"
        await self.db.flush()
        return True

    # App Permissions
    async def update_member_app_permissions(
        self,
        workspace_id: str,
        developer_id: str,
        app_permissions: dict,
    ) -> WorkspaceMember | None:
        """Update a member's app permissions."""
        member = await self.get_member(workspace_id, developer_id)
        if not member:
            return None

        member.app_permissions = app_permissions
        await self.db.flush()
        await self.db.refresh(member)
        return member

    async def get_workspace_app_settings(self, workspace_id: str) -> dict:
        """Get workspace-level app settings."""
        workspace = await self.get_workspace(workspace_id)
        if not workspace:
            return {}

        return workspace.settings.get("app_settings", {
            "hiring": True,
            "tracking": True,
            "oncall": True,
            "sprints": True,
            "documents": True,
            "ticketing": True,
        })

    async def update_workspace_app_settings(
        self, workspace_id: str, app_settings: dict
    ) -> Workspace | None:
        """Update workspace-level app settings."""
        workspace = await self.get_workspace(workspace_id)
        if not workspace:
            return None

        settings = workspace.settings or {}
        settings["app_settings"] = app_settings
        workspace.settings = settings

        await self.db.flush()
        await self.db.refresh(workspace)
        return workspace

    def get_effective_app_permissions(
        self, workspace_settings: dict, member_permissions: dict | None
    ) -> dict:
        """Get effective app permissions for a member (member overrides workspace)."""
        # Start with workspace defaults
        effective = workspace_settings.copy()

        # Override with member-specific permissions
        if member_permissions:
            effective.update(member_permissions)

        return effective
