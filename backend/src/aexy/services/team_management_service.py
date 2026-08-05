"""Team management service for managing teams and team members."""

import re
from datetime import datetime, timezone, timedelta
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.team import TEAM_MEMBER_ROLES, Team, TeamMember, TeamMemberRole
from aexy.models.workspace import WorkspaceMember
from aexy.models.developer import Developer
from aexy.models.activity import Commit
from aexy.models.repository import Repository


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

    async def seed_teams_for_onboarding(
        self,
        workspace_id: str,
        owner_id: str,
        strategy: str,
        departments: list[tuple[str, str]],
    ) -> tuple[list[Team], bool]:
        """Give a new workspace its first team(s). Returns ``(teams, skipped)``.

        Onboarding seeded departments and no teams, which left every workspace one
        step short of working: a *department* decides what somebody can see, but a
        *team* decides who chases them — standup prompts, blocker escalation,
        review digests, sprint boards and leave approvals all resolve through team
        membership. So a founder finished setup with everyone navigating correctly
        and nobody enrolled in any of it, and the team field on an invite offered
        an empty dropdown.

        ``strategy`` is the founder's answer, not our guess: ``per_department``
        mirrors the org (and sets ``Team.department_id``, the rollup that already
        existed for it), ``single`` is honest for a company that is one team, and
        ``none`` opts out.

        **Skips entirely when the workspace already has teams**, returning
        ``skipped=True``. The repos step can create ``repo_based`` teams before
        this runs, and those reflect how work is actually split — seeding beside
        them would produce a plausible-looking duplicate of each.

        The founder joins as ``lead``, not as a bare member: ``review_service`` and
        ``leave_request_service`` both look for exactly ``role == "lead"`` when
        they need someone accountable, so a team with no lead sends its approvals
        to "any workspace manager".
        """
        if strategy == "none":
            return [], False

        existing = (
            await self.db.execute(
                select(Team.id).where(Team.workspace_id == workspace_id).limit(1)
            )
        ).first()
        if existing is not None:
            return [], True

        wanted: list[tuple[str, str | None]] = []
        if strategy == "per_department" and departments:
            wanted = [(name, dept_id) for dept_id, name in departments]
        else:
            # Either the founder asked for one team, or they asked for one per
            # department and no department was seeded ("AI & Agents" alone seeds
            # none). Falling through to a single team is better than none at all,
            # which would leave the invite dropdown empty — the state this exists
            # to fix.
            wanted = [("Everyone", None)]

        created: list[Team] = []
        for name, department_id in wanted:
            team = await self.create_team(workspace_id, name=name, type="manual")
            team.department_id = department_id
            # Provenance, so a later repo sync can offer to merge rather than
            # having to guess whether a team was deliberate.
            team.settings = {**(team.settings or {}), "seeded_from": "onboarding"}
            await self.db.flush()
            await self.add_team_member(
                team.id, owner_id, role=TeamMemberRole.LEAD.value, source="onboarding"
            )
            created.append(team)

        return created, False

    async def mirror_departments_as_teams(
        self, workspace_id: str, owner_id: str
    ) -> list[Team]:
        """One team per department that hasn't got one. Idempotent per department.

        The post-onboarding form of ``seed_teams_for_onboarding``: choosing "no
        teams yet" during setup, or adding a department months later, otherwise
        leaves people who can see the right things with no team to reach them
        through.

        Unlike the onboarding path this does *not* bail out when the workspace
        already has teams — that guard exists to avoid duplicating repo-based teams
        during setup, whereas here the caller has asked for this deliberately. It
        skips per department instead, which is the check that actually prevents
        duplicates.
        """
        from aexy.models.organization import Department

        departments = (
            await self.db.execute(
                select(Department)
                .where(
                    Department.workspace_id == workspace_id,
                    Department.is_active.is_(True),
                )
                .order_by(Department.depth, Department.position, Department.name)
            )
        ).scalars().all()

        taken = set(
            (
                await self.db.execute(
                    select(Team.department_id).where(
                        Team.workspace_id == workspace_id,
                        Team.department_id.isnot(None),
                    )
                )
            ).scalars().all()
        )

        created: list[Team] = []
        for department in departments:
            if department.id in taken:
                continue
            team = await self.create_team(workspace_id, name=department.name, type="manual")
            team.department_id = department.id
            team.settings = {**(team.settings or {}), "seeded_from": "mirror_departments"}
            await self.db.flush()
            # Tolerated rather than fatal: the caller may already be on the team
            # (they created it by hand and only the rollup was missing), and the
            # point of the action is the team, not the membership.
            try:
                await self.add_team_member(
                    team.id, owner_id, role=TeamMemberRole.LEAD.value, source="manual"
                )
            except ValueError:
                pass
            created.append(team)

        return created

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
        """Add a member to a team.

        Validates the role for the same reason as ``update_team_member_role``:
        this is the seam the repo sync, the settings UI and invite placement all
        go through, and an undeclared value quietly excludes the person from the
        lead lookups rather than failing.
        """
        if role not in TEAM_MEMBER_ROLES:
            raise ValueError(
                f"Unknown team role {role!r}. Expected one of: "
                + ", ".join(sorted(TEAM_MEMBER_ROLES))
            )

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

        # Notify the developer they were added to the team
        try:
            from aexy.services.notification_service import notify_team_added

            team = await self.get_team(team_id)
            team_name = team.name if team else "a team"
            workspace_id = team.workspace_id if team else ""
            # Fetch workspace name
            from aexy.models.workspace import Workspace

            ws = await self.db.get(Workspace, workspace_id) if workspace_id else None
            ws_name = ws.name if ws else ""
            await notify_team_added(
                db=self.db,
                developer_id=developer_id,
                team_name=team_name,
                workspace_name=ws_name,
                workspace_id=str(workspace_id),
            )
        except Exception:
            pass  # Non-critical

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
        """Update a team member's role.

        Rejects a role outside the declared vocabulary. The API schema already
        constrains it, but this is the seam every other caller uses too, and an
        undeclared value here is not inert: `review_service` and
        `leave_request_service` look for exactly ``"lead"``, so a typo silently
        removes someone from both lookups rather than failing.
        """
        if new_role not in TEAM_MEMBER_ROLES:
            raise ValueError(
                f"Unknown team role {new_role!r}. Expected one of: "
                + ", ".join(sorted(TEAM_MEMBER_ROLES))
            )

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
