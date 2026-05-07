"""Workspace + team repository adoption service.

This is the source of truth for "which repos are in scope for this
workspace / project." Replaces the per-developer
`DeveloperRepository.is_enabled` model. PR search, GitHub-issue
search/import, the auto-sync scheduler, repo-cap accounting, and
developer insights all read from here.
"""

from __future__ import annotations

import logging
from uuid import uuid4

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.repository import (
    DeveloperRepository,
    Repository,
    TeamRepository,
    WorkspaceRepository,
)
from aexy.models.team import Team
from aexy.models.workspace import WorkspaceMember

logger = logging.getLogger(__name__)


class WorkspaceRepositoryService:
    """Adopt/un-adopt repos at the workspace level + pick subsets per team."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ─── Workspace catalog ────────────────────────────────────────────
    async def list_workspace_repositories(
        self, workspace_id: str, *, include_inactive: bool = False
    ) -> list[WorkspaceRepository]:
        stmt = (
            select(WorkspaceRepository)
            .options(selectinload(WorkspaceRepository.repository))
            .where(WorkspaceRepository.workspace_id == workspace_id)
        )
        if not include_inactive:
            stmt = stmt.where(WorkspaceRepository.is_active == True)  # noqa: E712
        stmt = stmt.order_by(WorkspaceRepository.created_at.desc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def adopt_repository(
        self,
        workspace_id: str,
        repository_id: str,
        adopted_by_developer_id: str,
    ) -> WorkspaceRepository:
        """Adopt a repo into the workspace catalog.

        If the row already exists, mark it active and re-bind the adopter
        if the previous one is no longer set. Idempotent — safe to call
        from the workspace settings page or onboarding.
        """
        existing = await self.get_workspace_repository(workspace_id, repository_id)
        if existing:
            existing.is_active = True
            if not existing.adopted_by_developer_id:
                existing.adopted_by_developer_id = adopted_by_developer_id
            await self.db.flush()
            return existing

        wr = WorkspaceRepository(
            id=str(uuid4()),
            workspace_id=workspace_id,
            repository_id=repository_id,
            adopted_by_developer_id=adopted_by_developer_id,
            is_active=True,
            sync_status="pending",
        )
        self.db.add(wr)
        await self.db.flush()
        return wr

    async def get_workspace_repository(
        self, workspace_id: str, repository_id: str
    ) -> WorkspaceRepository | None:
        stmt = select(WorkspaceRepository).where(
            and_(
                WorkspaceRepository.workspace_id == workspace_id,
                WorkspaceRepository.repository_id == repository_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def unadopt_repository(
        self, workspace_id: str, repository_id: str
    ) -> bool:
        """Remove a repo from the workspace catalog. Cascades to team links."""
        wr = await self.get_workspace_repository(workspace_id, repository_id)
        if not wr:
            return False
        await self.db.delete(wr)
        await self.db.flush()
        return True

    async def reclaim_repository(
        self,
        workspace_repository_id: str,
        new_adopter_id: str,
    ) -> WorkspaceRepository | None:
        """Re-bind a workspace_repository to a different adopter.

        Used when the original adopter leaves the workspace and someone
        else needs to lend their installation token to the sync. The
        caller must verify `new_adopter_id` has reach via
        `pick_installation_developer` before calling.
        """
        wr = await self.db.get(WorkspaceRepository, workspace_repository_id)
        if not wr:
            return None
        wr.adopted_by_developer_id = new_adopter_id
        # Clear no_credentials marker if it was set; sync will pick this up.
        if wr.sync_status == "no_credentials":
            wr.sync_status = "pending"
            wr.sync_error = None
        await self.db.flush()
        return wr

    # ─── Team subset ──────────────────────────────────────────────────
    async def list_team_repositories(
        self, team_id: str
    ) -> list[WorkspaceRepository]:
        """Workspace repositories the team has selected. Returns the
        workspace_repository rows (with `repository` eager-loaded), not
        the link rows."""
        stmt = (
            select(WorkspaceRepository)
            .join(
                TeamRepository,
                TeamRepository.workspace_repository_id == WorkspaceRepository.id,
            )
            .options(selectinload(WorkspaceRepository.repository))
            .where(
                TeamRepository.team_id == team_id,
                WorkspaceRepository.is_active == True,  # noqa: E712
            )
            .order_by(WorkspaceRepository.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def link_team_repository(
        self, team_id: str, workspace_repository_id: str
    ) -> TeamRepository | None:
        """Add a workspace_repository to a team. Idempotent."""
        # Check the workspace_repository belongs to the team's workspace.
        team = await self.db.get(Team, team_id)
        wr = await self.db.get(WorkspaceRepository, workspace_repository_id)
        if not team or not wr or str(wr.workspace_id) != str(team.workspace_id):
            return None

        existing_stmt = select(TeamRepository).where(
            and_(
                TeamRepository.team_id == team_id,
                TeamRepository.workspace_repository_id == workspace_repository_id,
            )
        )
        existing = (await self.db.execute(existing_stmt)).scalar_one_or_none()
        if existing:
            return existing

        link = TeamRepository(
            id=str(uuid4()),
            team_id=team_id,
            workspace_repository_id=workspace_repository_id,
        )
        self.db.add(link)
        await self.db.flush()
        return link

    async def unlink_team_repository(
        self, team_id: str, workspace_repository_id: str
    ) -> bool:
        stmt = select(TeamRepository).where(
            and_(
                TeamRepository.team_id == team_id,
                TeamRepository.workspace_repository_id == workspace_repository_id,
            )
        )
        link = (await self.db.execute(stmt)).scalar_one_or_none()
        if not link:
            return False
        await self.db.delete(link)
        await self.db.flush()
        return True

    # ─── Adopter-coverage helpers ─────────────────────────────────────
    async def pick_installation_developer(
        self, workspace_id: str, repository_id: str
    ) -> str | None:
        """Pick an active workspace member whose installation reaches this repo.

        Used when the original adopter becomes inactive and we need to
        rebind the workspace_repository row, or when adopting a new repo
        and the caller didn't specify an adopter. Returns the
        developer_id of any active workspace member who has a
        `DeveloperRepository` row for this repo (i.e., GitHub revealed
        the repo to their installation), or None if no one in the
        workspace has reach.
        """
        stmt = (
            select(DeveloperRepository.developer_id)
            .join(
                WorkspaceMember,
                WorkspaceMember.developer_id == DeveloperRepository.developer_id,
            )
            .where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.status == "active",
                DeveloperRepository.repository_id == repository_id,
            )
            .limit(1)
        )
        result = await self.db.execute(stmt)
        row = result.scalar_one_or_none()
        return str(row) if row else None

    async def list_workspace_repositories_needing_reclaim(
        self, workspace_id: str
    ) -> list[WorkspaceRepository]:
        """Workspace repos whose adopter is no longer active.

        Drives the "Reclaim" banner on the workspace catalog page. Either
        the adopter row was nulled (developer hard-deleted) or the
        adopter's WorkspaceMember status is no longer 'active'.
        """
        stmt = (
            select(WorkspaceRepository)
            .options(selectinload(WorkspaceRepository.repository))
            .where(
                WorkspaceRepository.workspace_id == workspace_id,
                WorkspaceRepository.is_active == True,  # noqa: E712,
            )
        )
        result = await self.db.execute(stmt)
        rows = list(result.scalars().all())

        active_member_stmt = select(WorkspaceMember.developer_id).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.status == "active",
        )
        active_ids = {
            str(r) for r in (await self.db.execute(active_member_stmt)).scalars().all()
        }

        return [
            wr
            for wr in rows
            if not wr.adopted_by_developer_id
            or str(wr.adopted_by_developer_id) not in active_ids
        ]

    # ─── Repo-cap accounting (per-workspace) ──────────────────────────
    async def count_active_workspace_repositories(self, workspace_id: str) -> int:
        """Active repos in the workspace catalog. Drives the free-plan cap."""
        stmt = select(func.count(WorkspaceRepository.id)).where(
            WorkspaceRepository.workspace_id == workspace_id,
            WorkspaceRepository.is_active == True,  # noqa: E712
        )
        result = await self.db.execute(stmt)
        return int(result.scalar() or 0)
