"""Team management service for managing teams and team members."""

import re
from datetime import datetime, timezone, timedelta
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from devograph.models.team import Team, TeamMember
from devograph.models.workspace import WorkspaceMember
from devograph.models.developer import Developer
from devograph.models.activity import Commit
from devograph.models.repository import Repository


def generate_slug(name: str) -> str:
    """Generate a URL-safe slug from a name."""
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug[:100]


class TeamManagementService:
    """Service for team CRUD and membership management."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_team(
        self,
        workspace_id: str,
        name: str,
        type: str = "manual",
        description: str | None = None,
        source_repository_ids: list[str] | None = None,
    ) -> Team:
        """Create a new team.

        Args:
            workspace_id: Parent workspace ID.
            name: Team display name.
            type: "manual" or "repo_based".
            description: Optional description.
            source_repository_ids: Repository IDs for repo_based teams.

        Returns:
            Created Team.
        """
        # Generate unique slug within workspace
        base_slug = generate_slug(name)
        slug = base_slug
        counter = 1

        while True:
            existing = await self.db.execute(
                select(Team).where(
                    Team.workspace_id == workspace_id,
                    Team.slug == slug,
                )
            )
            if not existing.scalar_one_or_none():
                break
            slug = f"{base_slug}-{counter}"
            counter += 1

        team = Team(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            slug=slug,
            description=description,
            type=type,
            source_repository_ids=source_repository_ids,
            auto_sync_enabled=type == "repo_based",
            settings={},
            is_active=True,
        )
        self.db.add(team)
        await self.db.flush()
        await self.db.refresh(team)

        return team

    async def get_team(self, team_id: str) -> Team | None:
        """Get a team by ID."""
        stmt = (
            select(Team)
            .where(Team.id == team_id)
            .options(selectinload(Team.members))
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_team_by_slug(
        self, workspace_id: str, slug: str
    ) -> Team | None:
        """Get a team by workspace and slug."""
        stmt = select(Team).where(
            Team.workspace_id == workspace_id,
            Team.slug == slug,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_workspace_teams(
        self, workspace_id: str, include_inactive: bool = False
    ) -> list[Team]:
        """List all teams in a workspace."""
        stmt = select(Team).where(Team.workspace_id == workspace_id)

        if not include_inactive:
            stmt = stmt.where(Team.is_active == True)

        stmt = stmt.order_by(Team.name)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_team(
        self,
        team_id: str,
        name: str | None = None,
        description: str | None = None,
        auto_sync_enabled: bool | None = None,
        settings: dict | None = None,
    ) -> Team | None:
        """Update a team."""
        team = await self.get_team(team_id)
        if not team:
            return None

        if name is not None:
            team.name = name
        if description is not None:
            team.description = description
        if auto_sync_enabled is not None:
            team.auto_sync_enabled = auto_sync_enabled
        if settings is not None:
            team.settings = settings

        await self.db.flush()
        await self.db.refresh(team)
        return team

    async def delete_team(self, team_id: str) -> bool:
        """Delete a team (soft delete by setting is_active=False)."""
        team = await self.get_team(team_id)
        if not team:
            return False

        team.is_active = False
        await self.db.flush()
        return True

    # Team membership
    async def add_team_member(
        self,
        team_id: str,
        developer_id: str,
        role: str = "member",
        source: str = "manual",
    ) -> TeamMember:
        """Add a member to a team."""
        # Check if already a member
        existing = await self.get_team_member(team_id, developer_id)
        if existing:
            raise ValueError("Developer is already a member of this team")

        member = TeamMember(
            id=str(uuid4()),
            team_id=team_id,
            developer_id=developer_id,
            role=role,
            source=source,
            joined_at=datetime.now(timezone.utc),
        )
        self.db.add(member)
        await self.db.flush()
        await self.db.refresh(member)
        return member

    async def get_team_member(
        self, team_id: str, developer_id: str
    ) -> TeamMember | None:
        """Get a specific team member."""
        stmt = select(TeamMember).where(
            TeamMember.team_id == team_id,
            TeamMember.developer_id == developer_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def remove_team_member(
        self, team_id: str, developer_id: str
    ) -> bool:
        """Remove a member from a team."""
        member = await self.get_team_member(team_id, developer_id)
        if not member:
            return False

        await self.db.delete(member)
        await self.db.flush()
        return True

    async def update_team_member_role(
        self,
        team_id: str,
        developer_id: str,
        new_role: str,
    ) -> TeamMember | None:
        """Update a team member's role."""
        member = await self.get_team_member(team_id, developer_id)
        if not member:
            return None

        member.role = new_role
        await self.db.flush()
        await self.db.refresh(member)
        return member

    async def get_team_members(self, team_id: str) -> list[TeamMember]:
        """Get all members of a team."""
        stmt = (
            select(TeamMember)
            .where(TeamMember.team_id == team_id)
            .options(selectinload(TeamMember.developer))
            .order_by(TeamMember.role, TeamMember.joined_at)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_developer_ids_for_team(self, team_id: str) -> list[str]:
        """Get list of developer IDs for a team.

        This is used to bridge to the existing TeamService analytics.
        """
        stmt = select(TeamMember.developer_id).where(
            TeamMember.team_id == team_id
        )
        result = await self.db.execute(stmt)
        return [row[0] for row in result.all()]

    async def get_member_count(self, team_id: str) -> int:
        """Get count of team members."""
        stmt = select(func.count(TeamMember.id)).where(
            TeamMember.team_id == team_id
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    # Auto-generated teams from repositories
    async def generate_team_from_repository(
        self,
        workspace_id: str,
        repository_id: str,
        team_name: str | None = None,
        include_contributors_since_days: int = 90,
    ) -> Team:
        """Generate a team from repository contributors.

        Args:
            workspace_id: Parent workspace ID.
            repository_id: Repository to get contributors from.
            team_name: Optional team name (defaults to repo name).
            include_contributors_since_days: Look back period for contributors.

        Returns:
            Created Team with members populated.
        """
        # Get repository info for team name
        repo_stmt = select(Repository).where(Repository.id == repository_id)
        repo_result = await self.db.execute(repo_stmt)
        repo = repo_result.scalar_one_or_none()

        if not repo:
            raise ValueError("Repository not found")

        name = team_name or f"{repo.name} Project"

        # Create the team
        team = await self.create_team(
            workspace_id=workspace_id,
            name=name,
            type="repo_based",
            description=f"Auto-generated project from {repo.full_name} contributors",
            source_repository_ids=[repository_id],
        )

        # Get workspace members (only add people who are in the workspace)
        workspace_member_stmt = select(WorkspaceMember.developer_id).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.status == "active",
        )
        workspace_result = await self.db.execute(workspace_member_stmt)
        workspace_member_ids = {row[0] for row in workspace_result.all()}

        # Find contributors in the last N days
        since_date = datetime.now(timezone.utc) - timedelta(
            days=include_contributors_since_days
        )

        contributors_stmt = (
            select(Commit.developer_id)
            .where(
                Commit.repository == repo.full_name,
                Commit.committed_at >= since_date,
            )
            .distinct()
        )
        contrib_result = await self.db.execute(contributors_stmt)
        contributor_ids = {row[0] for row in contrib_result.all()}

        # Add contributors who are also workspace members
        for dev_id in contributor_ids:
            if dev_id in workspace_member_ids:
                try:
                    await self.add_team_member(
                        team_id=team.id,
                        developer_id=dev_id,
                        role="member",
                        source="repo_contributor",
                    )
                except ValueError:
                    # Already a member
                    pass

        await self.db.refresh(team)
        return team

    async def sync_repo_team_members(self, team_id: str) -> dict:
        """Sync members for a repo-based team.

        Returns:
            Dict with added, removed, and unchanged counts.
        """
        team = await self.get_team(team_id)
        if not team or team.type != "repo_based" or not team.source_repository_ids:
            return {"added": 0, "removed": 0, "unchanged": 0}

        # Get workspace members
        workspace_member_stmt = select(WorkspaceMember.developer_id).where(
            WorkspaceMember.workspace_id == team.workspace_id,
            WorkspaceMember.status == "active",
        )
        workspace_result = await self.db.execute(workspace_member_stmt)
        workspace_member_ids = {row[0] for row in workspace_result.all()}

        # Get current team members
        current_members = await self.get_team_members(team_id)
        current_member_ids = {m.developer_id for m in current_members}

        # Get contributors from all source repos
        since_date = datetime.now(timezone.utc) - timedelta(days=90)
        new_contributor_ids: set[str] = set()

        for repo_id in team.source_repository_ids:
            repo_stmt = select(Repository).where(Repository.id == repo_id)
            repo_result = await self.db.execute(repo_stmt)
            repo = repo_result.scalar_one_or_none()

            if repo:
                contrib_stmt = (
                    select(Commit.developer_id)
                    .where(
                        Commit.repository == repo.full_name,
                        Commit.committed_at >= since_date,
                    )
                    .distinct()
                )
                contrib_result = await self.db.execute(contrib_stmt)
                for row in contrib_result.all():
                    if row[0] in workspace_member_ids:
                        new_contributor_ids.add(row[0])

        # Calculate changes
        to_add = new_contributor_ids - current_member_ids
        to_remove = current_member_ids - new_contributor_ids
        unchanged = current_member_ids & new_contributor_ids

        # Apply changes
        for dev_id in to_add:
            try:
                await self.add_team_member(
                    team_id=team_id,
                    developer_id=dev_id,
                    role="member",
                    source="repo_contributor",
                )
            except ValueError:
                pass

        for dev_id in to_remove:
            # Only remove auto-added members
            member = await self.get_team_member(team_id, dev_id)
            if member and member.source == "repo_contributor":
                await self.remove_team_member(team_id, dev_id)

        return {
            "added": len(to_add),
            "removed": len(to_remove),
            "unchanged": len(unchanged),
        }

    # Get teams for a developer
    async def get_developer_teams(
        self, developer_id: str, workspace_id: str | None = None
    ) -> list[Team]:
        """Get all teams a developer is a member of."""
        stmt = (
            select(Team)
            .join(TeamMember, Team.id == TeamMember.team_id)
            .where(
                TeamMember.developer_id == developer_id,
                Team.is_active == True,
            )
        )

        if workspace_id:
            stmt = stmt.where(Team.workspace_id == workspace_id)

        stmt = stmt.order_by(Team.name)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
