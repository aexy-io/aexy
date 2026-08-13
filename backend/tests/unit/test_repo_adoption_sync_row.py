"""Adopting a repository leaves it in a state where sync can actually run.

Adoption created the workspace catalog row and nothing else, while the sync
looks its state up by (developer, repository) — so an adopter who had never
listed the repo themselves hit `Repository not found for this developer` on
every run. Nothing surfaced it: the scheduler dispatches and moves on, and the
catalog page went on saying pending.

The row is bookkeeping, not permission. Whether the adopter can read the repo
is GitHub's answer to give, and a token without access fails loudly with a
reconnect message instead of silently never syncing.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from aexy.models.developer import Developer
from aexy.models.repository import DeveloperRepository, Repository, WorkspaceRepository
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.sync_service import SyncService
from aexy.services.workspace_repository_service import WorkspaceRepositoryService
from sqlalchemy import select


async def _developer(db, name: str) -> Developer:
    dev = Developer(email=f"{name}@example.com", name=name)
    db.add(dev)
    await db.flush()
    return dev


@pytest.fixture
async def workspace(db_session):
    owner = await _developer(db_session, "owner")
    ws = Workspace(name="WS", slug="ws", owner_id=owner.id)
    db_session.add(ws)
    await db_session.flush()
    db_session.add(
        WorkspaceMember(
            workspace_id=ws.id, developer_id=owner.id, role="owner", status="active"
        )
    )
    await db_session.flush()
    ws.owner = owner  # convenience for the tests below
    return ws


@pytest.fixture
async def repository(db_session):
    repo = Repository(
        id=str(uuid4()),
        github_id=515151,
        full_name="acme/codebase-v2",
        name="codebase-v2",
        owner_login="acme",
        owner_type="Organization",
    )
    db_session.add(repo)
    await db_session.flush()
    return repo


async def _rows_for(db, developer_id: str, repository_id: str):
    return (
        (
            await db.execute(
                select(DeveloperRepository).where(
                    DeveloperRepository.developer_id == developer_id,
                    DeveloperRepository.repository_id == repository_id,
                )
            )
        )
        .scalars()
        .all()
    )


class TestAdoption:
    async def test_adopting_gives_the_adopter_the_row_the_sync_writes_to(
        self, db_session, workspace, repository
    ):
        service = WorkspaceRepositoryService(db_session)
        await service.adopt_repository(
            workspace_id=workspace.id,
            repository_id=repository.id,
            adopted_by_developer_id=workspace.owner.id,
        )

        rows = await _rows_for(db_session, workspace.owner.id, repository.id)
        assert len(rows) == 1, (
            "without this row every sync of the repo raises "
            "'Repository not found for this developer'"
        )

    async def test_adopting_twice_does_not_duplicate_it(
        self, db_session, workspace, repository
    ):
        service = WorkspaceRepositoryService(db_session)
        for _ in range(3):
            await service.adopt_repository(
                workspace_id=workspace.id,
                repository_id=repository.id,
                adopted_by_developer_id=workspace.owner.id,
            )

        assert len(await _rows_for(db_session, workspace.owner.id, repository.id)) == 1

    async def test_reclaiming_gives_the_new_adopter_one_too(
        self, db_session, workspace, repository
    ):
        service = WorkspaceRepositoryService(db_session)
        wr = await service.adopt_repository(
            workspace_id=workspace.id,
            repository_id=repository.id,
            adopted_by_developer_id=workspace.owner.id,
        )
        wr.sync_status = "no_credentials"
        successor = await _developer(db_session, "successor")

        await service.reclaim_repository(wr.id, successor.id)

        assert len(await _rows_for(db_session, successor.id, repository.id)) == 1, (
            "a reclaim that looks successful and still never syncs"
        )
        assert wr.sync_status == "pending"


class TestReachSignal:
    """Adoption's row must not be mistaken for GitHub having shown the repo."""

    async def test_reach_is_read_before_adoption_writes_a_row(
        self, db_session, workspace, repository
    ):
        service = WorkspaceRepositoryService(db_session)
        assert (
            await service.has_installation_reach(workspace.owner.id, repository.id)
            is False
        )

        await service.adopt_repository(
            workspace_id=workspace.id,
            repository_id=repository.id,
            adopted_by_developer_id=workspace.owner.id,
        )
        # True afterwards — which is exactly why the endpoint asks first.
        assert (
            await service.has_installation_reach(workspace.owner.id, repository.id)
            is True
        )

    async def test_someone_who_has_synced_outranks_a_bare_adoption_row(
        self, db_session, workspace, repository
    ):
        service = WorkspaceRepositoryService(db_session)
        proven = await _developer(db_session, "proven")
        db_session.add(
            WorkspaceMember(
                workspace_id=workspace.id,
                developer_id=proven.id,
                role="member",
                status="active",
            )
        )
        # The owner adopts, and so holds a row with no evidence behind it.
        await service.adopt_repository(
            workspace_id=workspace.id,
            repository_id=repository.id,
            adopted_by_developer_id=workspace.owner.id,
        )
        db_session.add(
            DeveloperRepository(
                id=str(uuid4()),
                developer_id=proven.id,
                repository_id=repository.id,
                is_enabled=True,
                sync_status="synced",
                last_sync_at=datetime(2026, 7, 30, tzinfo=timezone.utc),
                commits_synced=400,
                webhook_status="none",
            )
        )
        await db_session.flush()

        picked = await service.pick_installation_developer(
            workspace.id, repository.id
        )
        assert picked == str(proven.id), (
            "a repo somebody has actually synced should not be handed to "
            "somebody who merely adopted it"
        )


class TestSyncBackstop:
    async def test_a_repo_adopted_before_the_fix_still_syncs(
        self, db_session, workspace, repository
    ):
        """No backfill: the sync makes the row itself when it is missing."""
        db_session.add(
            WorkspaceRepository(
                id=str(uuid4()),
                workspace_id=workspace.id,
                repository_id=repository.id,
                adopted_by_developer_id=workspace.owner.id,
                is_active=True,
                sync_status="pending",
            )
        )
        await db_session.flush()
        assert not await _rows_for(db_session, workspace.owner.id, repository.id)

        service = SyncService(db_session)
        dev_repo = await service._create_developer_repository(
            workspace.owner.id, repository.id
        )

        assert dev_repo.repository.full_name == repository.full_name
        assert len(await _rows_for(db_session, workspace.owner.id, repository.id)) == 1

    async def test_a_repository_that_does_not_exist_is_still_an_error(
        self, db_session, workspace
    ):
        service = SyncService(db_session)
        with pytest.raises(ValueError, match="not found"):
            await service._create_developer_repository(
                workspace.owner.id, str(uuid4())
            )
