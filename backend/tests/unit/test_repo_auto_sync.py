"""Repository auto-sync honouring the frequency the adopter chose.

The scheduler reads two columns on `workspace_repositories` — `last_sync_at`
to decide whether a repo is due, `sync_status` to skip one already running —
and no sync path ever wrote either. Every sync wrote its state to the adopter's
`DeveloperRepository` row instead, so:

  * `last_sync_at` stayed NULL for the row's whole life, the due-check behind
    it was permanently true, and every eligible repo was re-dispatched on each
    5-minute tick regardless of the 30m/1h/6h/12h/24h the adopter picked;
  * the in-flight skip matched nothing.

The catalog API had already papered over the stale row by overlaying the
adopter's values onto the response, so the page looked right while the
scheduler read columns nobody wrote.

These call the real writer and the real due-check rather than restating
either — a restatement would pass just as happily against the bug.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from aexy.models.developer import Developer, GitHubConnection
from aexy.models.repository import (
    DeveloperRepository,
    Repository,
    WorkspaceRepository,
)
from aexy.models.workspace import Workspace
from aexy.services.github_service import GitHubAuthError
from aexy.services.sync_service import (
    SyncService,
    adopted_workspace_rows,
    record_workspace_sync_state,
)
from aexy.temporal.activities.sync import repo_sync_due, repo_sync_workflow_id


@pytest.fixture
async def adopter(db_session):
    developer = Developer(email="adopter@example.com", name="Adopter")
    db_session.add(developer)
    await db_session.flush()
    db_session.add(
        GitHubConnection(
            developer_id=developer.id,
            github_id=4242,
            github_username="adopter",
            access_token="gho_test",
            auth_status="active",
        )
    )
    await db_session.flush()
    return developer


@pytest.fixture
async def workspace(db_session, adopter):
    ws = Workspace(name="WS", slug="ws", owner_id=adopter.id)
    db_session.add(ws)
    await db_session.flush()
    return ws


@pytest.fixture
async def repository(db_session):
    repo = Repository(
        id=str(uuid4()),
        github_id=99001,
        full_name="acme/codebase-v2",
        name="codebase-v2",
        owner_login="acme",
        owner_type="Organization",
    )
    db_session.add(repo)
    await db_session.flush()
    return repo


async def _adopt(db_session, workspace, repository, adopter) -> WorkspaceRepository:
    wr = WorkspaceRepository(
        id=str(uuid4()),
        workspace_id=workspace.id,
        repository_id=repository.id,
        adopted_by_developer_id=adopter.id,
        is_active=True,
        sync_status="pending",
    )
    db_session.add(wr)
    db_session.add(
        DeveloperRepository(
            id=str(uuid4()),
            developer_id=adopter.id,
            repository_id=repository.id,
            is_enabled=True,
        )
    )
    await db_session.flush()
    return wr


def _run_sync(service: SyncService, *, fail_with: Exception | None = None):
    """Drive `sync_repository` with the GitHub calls stubbed out.

    Everything between "mark syncing" and "record the result" is network; the
    state transitions on either side are what these tests are about.
    """

    class _FakeGitHub:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            if fail_with:
                raise fail_with
            return self

        async def __aexit__(self, *exc):
            return False

    async def _noop_token(connection):
        return None

    import aexy.services.sync_service as module

    module.GitHubService = _FakeGitHub
    service._ensure_valid_token = _noop_token
    service._sync_commits_with_session = lambda *a, **k: _resolved(7)
    service._sync_pull_requests_with_session = lambda *a, **k: _resolved(3)
    service._sync_reviews_with_session = lambda *a, **k: _resolved(2)
    return service


async def _resolved(value):
    return value


@pytest.fixture(autouse=True)
def restore_github_service():
    import aexy.services.sync_service as module

    original = module.GitHubService
    yield
    module.GitHubService = original


class TestWriteThrough:
    """The sync's own state, on the row the scheduler reads."""

    async def test_a_completed_sync_stamps_the_catalog_row(
        self, db_session, workspace, repository, adopter
    ):
        wr = await _adopt(db_session, workspace, repository, adopter)
        assert wr.last_sync_at is None

        service = _run_sync(SyncService(db_session))
        await service.sync_repository(adopter.id, repository.id)

        assert wr.sync_status == "synced"
        assert wr.last_sync_at is not None, (
            "nothing advanced last_sync_at, so the frequency check that reads "
            "it can never hold a repo back"
        )
        assert (wr.commits_synced, wr.prs_synced, wr.reviews_synced) == (7, 3, 2)

    async def test_the_stamped_row_is_not_due_again_immediately(
        self, db_session, workspace, repository, adopter
    ):
        wr = await _adopt(db_session, workspace, repository, adopter)
        service = _run_sync(SyncService(db_session))
        await service.sync_repository(adopter.id, repository.id)

        five_minutes_on = wr.last_sync_at + timedelta(minutes=5)
        assert repo_sync_due(wr.last_sync_at, "1h", five_minutes_on) is False, (
            "the next scheduler tick re-dispatches a repo that just synced"
        )
        assert repo_sync_due(wr.last_sync_at, "1h", wr.last_sync_at + timedelta(hours=2))

    async def test_broken_auth_asks_for_a_reclaim(
        self, db_session, workspace, repository, adopter
    ):
        wr = await _adopt(db_session, workspace, repository, adopter)
        service = _run_sync(
            SyncService(db_session), fail_with=GitHubAuthError("token revoked")
        )

        with pytest.raises(GitHubAuthError):
            await service.sync_repository(adopter.id, repository.id)

        assert wr.sync_status == "no_credentials"
        assert wr.sync_error

    async def test_a_failed_sync_does_not_count_as_a_sync(
        self, db_session, workspace, repository, adopter
    ):
        wr = await _adopt(db_session, workspace, repository, adopter)
        service = _run_sync(SyncService(db_session), fail_with=RuntimeError("boom"))

        with pytest.raises(RuntimeError):
            await service.sync_repository(adopter.id, repository.id)

        assert wr.sync_status == "failed"
        assert wr.last_sync_at is None, (
            "a failure that stamped last_sync_at would silence the repo until "
            "the interval elapsed"
        )


class TestScope:
    """Which rows one sync speaks for."""

    async def test_every_workspace_behind_the_same_adopter_advances(
        self, db_session, workspace, repository, adopter
    ):
        first = await _adopt(db_session, workspace, repository, adopter)
        other_ws = Workspace(name="Other", slug="other", owner_id=adopter.id)
        db_session.add(other_ws)
        await db_session.flush()
        second = WorkspaceRepository(
            id=str(uuid4()),
            workspace_id=other_ws.id,
            repository_id=repository.id,
            adopted_by_developer_id=adopter.id,
            is_active=True,
            sync_status="pending",
        )
        db_session.add(second)
        await db_session.flush()

        rows = await adopted_workspace_rows(db_session, adopter.id, repository.id)
        assert {r.id for r in rows} == {first.id, second.id}

    async def test_another_adopters_row_is_left_alone(
        self, db_session, workspace, repository, adopter
    ):
        await _adopt(db_session, workspace, repository, adopter)
        someone_else = Developer(email="other@example.com", name="Other")
        db_session.add(someone_else)
        await db_session.flush()
        # One row per (workspace, repo), so a second adopter means a second
        # workspace that adopted the same repo behind their own token.
        their_ws = Workspace(name="Theirs", slug="theirs", owner_id=someone_else.id)
        db_session.add(their_ws)
        await db_session.flush()
        theirs = WorkspaceRepository(
            id=str(uuid4()),
            workspace_id=their_ws.id,
            repository_id=repository.id,
            adopted_by_developer_id=someone_else.id,
            is_active=True,
            sync_status="pending",
        )
        db_session.add(theirs)
        await db_session.flush()

        rows = await adopted_workspace_rows(db_session, adopter.id, repository.id)
        assert theirs.id not in {r.id for r in rows}

    async def test_one_workflow_id_per_repo_and_adopter(self, repository, adopter):
        """Two workspaces behind one adopter must not sync the same repo twice."""
        assert repo_sync_workflow_id(
            repository.id, adopter.id
        ) == repo_sync_workflow_id(repository.id, adopter.id)
        assert repo_sync_workflow_id(repository.id, adopter.id) != (
            repo_sync_workflow_id(repository.id, str(uuid4()))
        )


class TestDueCheck:
    async def test_a_repo_that_never_synced_is_due(self):
        assert repo_sync_due(None, "24h", datetime.now(timezone.utc)) is True

    async def test_an_unknown_frequency_falls_back_to_hourly(self):
        now = datetime.now(timezone.utc)
        assert repo_sync_due(now - timedelta(minutes=30), "nonsense", now) is False
        assert repo_sync_due(now - timedelta(hours=2), "nonsense", now) is True

    def test_the_writer_leaves_the_timestamp_alone_unless_told(self):
        row = WorkspaceRepository(
            id=str(uuid4()),
            workspace_id=str(uuid4()),
            repository_id=str(uuid4()),
            sync_status="synced",
            last_sync_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
            commits_synced=5,
            prs_synced=1,
            reviews_synced=0,
        )
        record_workspace_sync_state([row], status="syncing")

        assert row.sync_status == "syncing"
        assert row.last_sync_at == datetime(2026, 8, 1, tzinfo=timezone.utc)
        assert row.commits_synced == 5
