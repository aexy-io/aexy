"""Project management service."""

import re
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from aexy.models.project import Project, ProjectMember, ProjectTeam
from aexy.models.workspace import WorkspaceMember
from aexy.models.developer import Developer


def generate_slug(name: str) -> str:
    """Generate a URL-safe slug from a name."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[-\s]+", "-", slug)
    return slug[:100]


class ProjectService:
    """Service for managing projects."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_project(
        self,
        workspace_id: str,
        name: str,
        description: str | None = None,
        color: str = "#3b82f6",
        icon: str = "FolderGit2",
        settings: dict | None = None,
        created_by_id: str | None = None,
    ) -> Project:
        """Create a new project."""
        # Generate slug
        slug = generate_slug(name)

        # Check for duplicate slug
        existing = await self.get_project_by_slug(workspace_id, slug)
        if existing:
            counter = 1
            while await self.get_project_by_slug(workspace_id, f"{slug}-{counter}"):
                counter += 1
            slug = f"{slug}-{counter}"

        project = Project(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            slug=slug,
            description=description,
            color=color,
            icon=icon,
            settings=settings or {},
        )

        self.db.add(project)

        # Automatically add creator as a member if provided
        if created_by_id:
            await self.db.flush()  # Get project ID
            await self.add_member(
                project_id=project.id,
                developer_id=created_by_id,
                invited_by_id=created_by_id,
            )

        return project

    async def get_project(self, project_id: str) -> Project | None:
        """Get a project by ID."""
        stmt = select(Project).where(Project.id == project_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_project_by_slug(
        self, workspace_id: str, slug: str
    ) -> Project | None:
        """Get a project by workspace and slug."""
        stmt = select(Project).where(
            and_(
                Project.workspace_id == workspace_id,
                Project.slug == slug,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_projects(
        self,
        workspace_id: str,
        include_archived: bool = False,
    ) -> list[Project]:
        """List all projects in a workspace."""
        conditions = [
            Project.workspace_id == workspace_id,
            Project.is_active == True,
        ]

        if not include_archived:
            conditions.append(Project.status != "archived")

        stmt = (
            select(Project)
            .where(and_(*conditions))
            .order_by(Project.name)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_project(
        self,
        project_id: str,
        name: str | None = None,
        description: str | None = None,
        color: str | None = None,
        icon: str | None = None,
        settings: dict | None = None,
        status: str | None = None,
    ) -> Project | None:
        """Update a project."""
        project = await self.get_project(project_id)
        if not project:
            return None

        if name is not None:
            project.name = name
            # Regenerate slug if name changed
            new_slug = generate_slug(name)
            if new_slug != project.slug:
                existing = await self.get_project_by_slug(
                    project.workspace_id, new_slug
                )
                if existing and existing.id != project_id:
                    counter = 1
                    while await self.get_project_by_slug(
                        project.workspace_id, f"{new_slug}-{counter}"
                    ):
                        counter += 1
                    new_slug = f"{new_slug}-{counter}"
                project.slug = new_slug

        if description is not None:
            project.description = description

        if color is not None:
            project.color = color

        if icon is not None:
            project.icon = icon

        if settings is not None:
            project.settings = settings

        if status is not None:
            project.status = status

        return project

    async def delete_project(self, project_id: str) -> bool:
        """Soft delete a project."""
        project = await self.get_project(project_id)
        if not project:
            return False

        project.is_active = False
        project.status = "archived"
        return True

    async def hard_delete_project(self, project_id: str) -> bool:
        """Permanently delete a project and all its data."""
        project = await self.get_project(project_id)
        if not project:
            return False

        await self.db.delete(project)
        return True

    # Member management
    async def add_member(
        self,
        project_id: str,
        developer_id: str,
        role_id: str | None = None,
        permission_overrides: dict | None = None,
        invited_by_id: str | None = None,
    ) -> ProjectMember:
        """Add a member to a project."""
        # Check if already a member
        existing = await self.get_member(project_id, developer_id)
        if existing:
            # Reactivate if removed
            if existing.status == "removed":
                existing.status = "active"
                existing.role_id = role_id
                existing.permission_overrides = permission_overrides
                existing.joined_at = datetime.now(timezone.utc)
                return existing
            return existing

        member = ProjectMember(
            id=str(uuid4()),
            project_id=project_id,
            developer_id=developer_id,
            role_id=role_id,
            permission_overrides=permission_overrides,
            status="active",
            invited_by_id=invited_by_id,
            invited_at=datetime.now(timezone.utc),
            joined_at=datetime.now(timezone.utc),
        )

        self.db.add(member)
        return member

    async def get_member(
        self, project_id: str, developer_id: str
    ) -> ProjectMember | None:
        """Get a project member."""
        stmt = select(ProjectMember).where(
            and_(
                ProjectMember.project_id == project_id,
                ProjectMember.developer_id == developer_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_members(
        self,
        project_id: str,
        include_removed: bool = False,
    ) -> list[ProjectMember]:
        """List all members of a project."""
        conditions = [ProjectMember.project_id == project_id]

        if not include_removed:
            conditions.append(ProjectMember.status != "removed")

        stmt = select(ProjectMember).where(and_(*conditions))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_member(
        self,
        project_id: str,
        developer_id: str,
        role_id: str | None = None,
        permission_overrides: dict | None = None,
        status: str | None = None,
    ) -> ProjectMember | None:
        """Update a project member."""
        member = await self.get_member(project_id, developer_id)
        if not member:
            return None

        if role_id is not None:
            member.role_id = role_id

        if permission_overrides is not None:
            member.permission_overrides = permission_overrides

        if status is not None:
            member.status = status
            if status == "active" and not member.joined_at:
                member.joined_at = datetime.now(timezone.utc)

        return member

    async def remove_member(
        self, project_id: str, developer_id: str
    ) -> bool:
        """Remove a member from a project (soft delete)."""
        member = await self.get_member(project_id, developer_id)
        if not member:
            return False

        member.status = "removed"
        return True

    # Team management
    async def add_team(
        self, project_id: str, team_id: str
    ) -> ProjectTeam:
        """Add a team to a project."""
        # Check if already added
        existing = await self.get_project_team(project_id, team_id)
        if existing:
            return existing

        project_team = ProjectTeam(
            id=str(uuid4()),
            project_id=project_id,
            team_id=team_id,
        )

        self.db.add(project_team)
        return project_team

    async def get_project_team(
        self, project_id: str, team_id: str
    ) -> ProjectTeam | None:
        """Get a project-team association."""
        stmt = select(ProjectTeam).where(
            and_(
                ProjectTeam.project_id == project_id,
                ProjectTeam.team_id == team_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_project_teams(self, project_id: str) -> list[ProjectTeam]:
        """List all teams in a project."""
        stmt = select(ProjectTeam).where(ProjectTeam.project_id == project_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def remove_team(self, project_id: str, team_id: str) -> bool:
        """Remove a team from a project."""
        project_team = await self.get_project_team(project_id, team_id)
        if not project_team:
            return False

        await self.db.delete(project_team)
        return True

    # Email invite
    async def invite_by_email(
        self,
        project_id: str,
        workspace_id: str,
        email: str,
        role_id: str | None = None,
        invited_by_id: str | None = None,
    ) -> tuple[ProjectMember | None, str]:
        """
        Invite a user to a project by email.

        Returns:
            Tuple of (ProjectMember or None, status_string)
            status can be: 'added', 'already_member', 'pending', 'user_not_found'
        """
        # Look up developer by email
        stmt = select(Developer).where(Developer.email == email.lower().strip())
        result = await self.db.execute(stmt)
        developer = result.scalar_one_or_none()

        if not developer:
            # User doesn't exist in our system yet - they need to sign up first
            # TODO: Could create a pending invite table for email invites
            return None, "user_not_found"

        # Check if already a project member
        existing_member = await self.get_member(project_id, str(developer.id))
        if existing_member and existing_member.status != "removed":
            return existing_member, "already_member"

        # Check if they're a workspace member
        ws_stmt = select(WorkspaceMember).where(
            and_(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.developer_id == str(developer.id),
            )
        )
        ws_result = await self.db.execute(ws_stmt)
        workspace_member = ws_result.scalar_one_or_none()

        # If not a workspace member, add them as a guest
        if not workspace_member:
            workspace_member = WorkspaceMember(
                id=str(uuid4()),
                workspace_id=workspace_id,
                developer_id=str(developer.id),
                role="member",  # Guest/member role
                status="active",
                is_billable=False,  # Guests might not be billable
                joined_at=datetime.now(timezone.utc),
            )
            self.db.add(workspace_member)
        elif workspace_member.status != "active":
            workspace_member.status = "active"

        # Add to project
        member = await self.add_member(
            project_id=project_id,
            developer_id=str(developer.id),
            role_id=role_id,
            invited_by_id=invited_by_id,
        )

        return member, "added"

    # Bulk operations
    async def add_workspace_members_to_project(
        self,
        project_id: str,
        workspace_id: str,
        invited_by_id: str | None = None,
    ) -> list[ProjectMember]:
        """Add all active workspace members to a project."""
        # Get all active workspace members
        stmt = select(WorkspaceMember).where(
            and_(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.status == "active",
            )
        )
        result = await self.db.execute(stmt)
        workspace_members = result.scalars().all()

        added = []
        for wm in workspace_members:
            member = await self.add_member(
                project_id=project_id,
                developer_id=wm.developer_id,
                invited_by_id=invited_by_id,
            )
            added.append(member)

        return added
