"""Every sprint in a workspace, across teams.

`list_team_sprints` needs a team, which is right for a sprint board and wrong for
anything that starts somewhere else: turning a document into tasks has a
workspace and no team, and making the person pick a team first asks them about
our schema rather than about their work.

Two behaviours worth pinning. Closed sprints are excluded by default — a picker
offering a completed sprint is offering a mistake, since adding a task to it
would falsify a velocity figure somebody has already reported. And the query is
scoped by `workspace_id`, not by walking teams: the team-scoped route needs an
explicit check to stop a member of workspace A reading workspace B's sprints
through a cross-workspace `team_id`, and this one must not reintroduce that hole
from the other direction.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.sprint import Sprint
from aexy.models.team import Team
from aexy.models.workspace import Workspace
from aexy.services.sprint_service import SprintService

NOW = datetime(2026, 8, 21, tzinfo=timezone.utc)


async def _owner(db: AsyncSession, email: str) -> Developer:
    developer = Developer(name="Owner", email=email)
    db.add(developer)
    await db.flush()
    return developer


async def _workspace(db: AsyncSession, name: str) -> Workspace:
    # A workspace needs an owner, so each gets its own rather than sharing a
    # fixture — two workspaces in the isolation test must not be related by
    # anything except being in the same database.
    owner = await _owner(db, f"{name.lower().replace(' ', '-')}@example.com")
    workspace = Workspace(
        name=name, slug=name.lower().replace(" ", "-"), owner_id=owner.id
    )
    db.add(workspace)
    await db.flush()
    return workspace


async def _team(db: AsyncSession, workspace: Workspace, name: str) -> Team:
    # Slugs are unique per workspace, so the isolation test can reuse a team name
    # across two workspaces — which it does deliberately, since that is the shape
    # a cross-workspace leak would hide in.
    slug = f"{workspace.slug}-{name.lower()}"
    team = Team(workspace_id=workspace.id, name=name, slug=slug)
    db.add(team)
    await db.flush()
    return team


async def _sprint(
    db: AsyncSession,
    workspace: Workspace,
    team: Team,
    name: str,
    status: str = "active",
    starts: datetime | None = None,
) -> Sprint:
    start = starts or NOW
    sprint = Sprint(
        workspace_id=workspace.id,
        team_id=team.id,
        name=name,
        status=status,
        start_date=start,
        end_date=start + timedelta(days=14),
    )
    db.add(sprint)
    await db.flush()
    return sprint


class TestWhatItReturns:
    async def test_it_spans_teams(self, db_session: AsyncSession) -> None:
        # The whole reason this exists: a caller with no team still gets a list.
        workspace = await _workspace(db_session, "Acme")
        platform = await _team(db_session, workspace, "Platform")
        growth = await _team(db_session, workspace, "Growth")
        await _sprint(db_session, workspace, platform, "Sprint 24")
        await _sprint(db_session, workspace, growth, "Sprint 24")

        found = await SprintService(db_session).list_workspace_sprints(
            str(workspace.id)
        )
        assert len(found) == 2
        # Both called "Sprint 24", which is exactly why the picker shows the team.
        assert {str(s.team_id) for s in found} == {str(platform.id), str(growth.id)}

    async def test_the_team_is_loaded_for_the_picker(
        self, db_session: AsyncSession
    ) -> None:
        # Eager-loaded on purpose: a picker has to name the team, and doing it
        # lazily would be a query per row.
        workspace = await _workspace(db_session, "Acme")
        team = await _team(db_session, workspace, "Platform")
        await _sprint(db_session, workspace, team, "Sprint 24")

        [found] = await SprintService(db_session).list_workspace_sprints(
            str(workspace.id)
        )
        assert found.team is not None
        assert found.team.name == "Platform"

    async def test_an_empty_workspace_returns_nothing_rather_than_failing(
        self, db_session: AsyncSession
    ) -> None:
        workspace = await _workspace(db_session, "Quiet")
        assert (
            await SprintService(db_session).list_workspace_sprints(str(workspace.id))
            == []
        )


class TestWhichSprintsAreOffered:
    @pytest.mark.parametrize("status", ["planning", "active"])
    async def test_a_sprint_open_to_new_work_is_offered(
        self, db_session: AsyncSession, status: str
    ) -> None:
        workspace = await _workspace(db_session, "Acme")
        team = await _team(db_session, workspace, "Platform")
        await _sprint(db_session, workspace, team, "Sprint 24", status=status)

        found = await SprintService(db_session).list_workspace_sprints(
            str(workspace.id)
        )
        assert [s.status for s in found] == [status]

    @pytest.mark.parametrize("status", ["completed", "review", "retrospective"])
    async def test_a_sprint_being_closed_out_is_not(
        self, db_session: AsyncSession, status: str
    ) -> None:
        # `completed` would falsify a reported velocity. `review` and
        # `retrospective` are a sprint being wound up, which is the wrong home
        # for work that has just arrived.
        workspace = await _workspace(db_session, "Acme")
        team = await _team(db_session, workspace, "Platform")
        await _sprint(db_session, workspace, team, "Sprint 23", status=status)

        assert (
            await SprintService(db_session).list_workspace_sprints(str(workspace.id))
            == []
        )

    async def test_closed_sprints_can_be_asked_for_explicitly(
        self, db_session: AsyncSession
    ) -> None:
        # The default is a picker's default, not a rule about the data.
        workspace = await _workspace(db_session, "Acme")
        team = await _team(db_session, workspace, "Platform")
        await _sprint(db_session, workspace, team, "Sprint 23", status="completed")

        found = await SprintService(db_session).list_workspace_sprints(
            str(workspace.id), statuses=None
        )
        assert len(found) == 1

    async def test_the_running_sprint_comes_first(
        self, db_session: AsyncSession
    ) -> None:
        # The sprint somebody means is nearly always the one running now.
        workspace = await _workspace(db_session, "Acme")
        team = await _team(db_session, workspace, "Platform")
        await _sprint(db_session, workspace, team, "Next", status="planning")
        await _sprint(db_session, workspace, team, "Now", status="active")

        found = await SprintService(db_session).list_workspace_sprints(
            str(workspace.id)
        )
        assert [s.name for s in found] == ["Now", "Next"]


class TestWorkspaceIsolation:
    async def test_another_workspace_is_never_included(
        self, db_session: AsyncSession
    ) -> None:
        # The team-scoped route needs an explicit team-belongs-to-workspace check
        # to stop exactly this leak. Scoping by `workspace_id` closes it here by
        # construction, and this test is what keeps it closed.
        mine = await _workspace(db_session, "Mine")
        theirs = await _workspace(db_session, "Theirs")
        my_team = await _team(db_session, mine, "Platform")
        their_team = await _team(db_session, theirs, "Platform")
        await _sprint(db_session, mine, my_team, "Ours")
        await _sprint(db_session, theirs, their_team, "Not ours")

        found = await SprintService(db_session).list_workspace_sprints(str(mine.id))
        assert [s.name for s in found] == ["Ours"]

    async def test_a_limit_is_honoured(self, db_session: AsyncSession) -> None:
        # A picker is not a report. A workspace with hundreds of sprints should
        # not send them all to render a dropdown.
        workspace = await _workspace(db_session, "Acme")
        team = await _team(db_session, workspace, "Platform")
        for index in range(5):
            await _sprint(
                db_session,
                workspace,
                team,
                f"Sprint {index}",
                starts=NOW + timedelta(days=index),
            )

        found = await SprintService(db_session).list_workspace_sprints(
            str(workspace.id), limit=2
        )
        assert len(found) == 2
