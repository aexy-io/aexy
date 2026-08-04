"""Unit tests for team placement on invite, and the team-role vocabulary.

A *department* decides what a joiner can see; a *team* decides who chases them —
standup prompts, blocker escalation, compliance reminders, review digests, sprint
boards and leave approvals all resolve through team membership. An invite could
name the first and not the second, so a joiner arrived with the right navigation
and was silently left out of all of the above: nothing errored, they just never
got asked for a standup.

These tests also pin the role vocabulary. ``team_members.role`` was documented as
``"lead" | "member"`` while ``project_service`` wrote ``"admin"``, and the value
is not inert: ``review_service`` and ``leave_request_service`` both look for
exactly ``role == "lead"``.
"""

import pytest
from sqlalchemy import select

from aexy.models.developer import Developer
from aexy.models.team import TEAM_MEMBER_ROLES, Team, TeamMember, TeamMemberRole
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.team_management_service import TeamManagementService
from aexy.services.workspace_service import WorkspaceService


# ==================== vocabulary ====================


def test_declared_roles_are_exactly_the_enum():
    assert TEAM_MEMBER_ROLES == {"lead", "manager", "member"}


def test_admin_is_not_a_writable_role():
    """It was never declared, and it excluded people from the lead lookups."""
    assert "admin" not in TEAM_MEMBER_ROLES


def test_lead_is_the_value_the_lookups_search_for():
    """`review_service` and `leave_request_service` both compare to this string,
    so it must not drift."""
    assert TeamMemberRole.LEAD.value == "lead"


# ==================== fixtures ====================


async def _workspace(db_session, *, name="WS"):
    owner = Developer(email=f"owner-{name}@example.com", name="Owner")
    db_session.add(owner)
    await db_session.flush()

    workspace = Workspace(
        name=name, slug=name.lower(), type="internal", owner_id=owner.id, settings={}
    )
    db_session.add(workspace)
    await db_session.flush()

    db_session.add(
        WorkspaceMember(
            workspace_id=workspace.id,
            developer_id=owner.id,
            role="owner",
            status="active",
        )
    )
    await db_session.flush()
    return workspace, owner


async def _team(db_session, workspace, *, name="Platform", is_active=True):
    team = Team(
        workspace_id=workspace.id,
        name=name,
        slug=name.lower(),
        type="manual",
        settings={},
        is_active=is_active,
    )
    db_session.add(team)
    await db_session.flush()
    return team


async def _joiner(db_session, email="joiner@example.com"):
    developer = Developer(email=email, name="Joiner")
    db_session.add(developer)
    await db_session.flush()
    return developer


async def _members_of(db_session, team_id):
    rows = await db_session.execute(
        select(TeamMember).where(TeamMember.team_id == team_id)
    )
    return list(rows.scalars().all())


# ==================== placement on accept ====================


@pytest.mark.asyncio
async def test_accepting_places_the_joiner_in_the_team(db_session):
    workspace, owner = await _workspace(db_session)
    team = await _team(db_session, workspace)
    joiner = await _joiner(db_session)
    service = WorkspaceService(db_session)

    invite = await service.create_pending_invite(
        workspace_id=workspace.id,
        email=joiner.email,
        invited_by_id=owner.id,
        team_id=team.id,
        role_in_team="lead",
    )
    await service.accept_pending_invite(invite.token, joiner.id)

    members = await _members_of(db_session, team.id)
    assert [(m.developer_id, m.role) for m in members] == [(joiner.id, "lead")]


@pytest.mark.asyncio
async def test_placement_defaults_to_member(db_session):
    workspace, owner = await _workspace(db_session)
    team = await _team(db_session, workspace)
    joiner = await _joiner(db_session)
    service = WorkspaceService(db_session)

    invite = await service.create_pending_invite(
        workspace_id=workspace.id,
        email=joiner.email,
        invited_by_id=owner.id,
        team_id=team.id,
    )
    await service.accept_pending_invite(invite.token, joiner.id)

    members = await _members_of(db_session, team.id)
    assert members[0].role == TeamMemberRole.MEMBER.value


@pytest.mark.asyncio
async def test_no_team_named_places_nobody(db_session):
    """The default path has to stay exactly as it was."""
    workspace, owner = await _workspace(db_session)
    team = await _team(db_session, workspace)
    joiner = await _joiner(db_session)
    service = WorkspaceService(db_session)

    invite = await service.create_pending_invite(
        workspace_id=workspace.id, email=joiner.email, invited_by_id=owner.id
    )
    member = await service.accept_pending_invite(invite.token, joiner.id)

    assert member is not None  # they still join the workspace
    assert await _members_of(db_session, team.id) == []


@pytest.mark.asyncio
async def test_stale_team_does_not_cost_the_invitation(db_session):
    """The team may be deleted between invite and accept.

    Joining the workspace is the outcome that matters, so a stale placement is
    logged and skipped rather than raised.
    """
    workspace, owner = await _workspace(db_session)
    team = await _team(db_session, workspace)
    joiner = await _joiner(db_session)
    service = WorkspaceService(db_session)

    invite = await service.create_pending_invite(
        workspace_id=workspace.id,
        email=joiner.email,
        invited_by_id=owner.id,
        team_id=team.id,
    )
    # Deactivated after the invite went out.
    team.is_active = False
    await db_session.flush()

    member = await service.accept_pending_invite(invite.token, joiner.id)

    assert member is not None
    assert member.status == "active"
    assert await _members_of(db_session, team.id) == []


@pytest.mark.asyncio
async def test_team_from_another_workspace_is_ignored(db_session):
    workspace, owner = await _workspace(db_session, name="WSA")
    other, _ = await _workspace(db_session, name="WSB")
    foreign_team = await _team(db_session, other, name="Foreign")
    joiner = await _joiner(db_session)
    service = WorkspaceService(db_session)

    invite = await service.create_pending_invite(
        workspace_id=workspace.id,
        email=joiner.email,
        invited_by_id=owner.id,
        team_id=foreign_team.id,
    )
    member = await service.accept_pending_invite(invite.token, joiner.id)

    assert member is not None
    assert await _members_of(db_session, foreign_team.id) == []


@pytest.mark.asyncio
async def test_existing_membership_is_left_alone(db_session):
    """An admin may have added them by hand while the invite was outstanding."""
    workspace, owner = await _workspace(db_session)
    team = await _team(db_session, workspace)
    joiner = await _joiner(db_session)
    service = WorkspaceService(db_session)

    invite = await service.create_pending_invite(
        workspace_id=workspace.id,
        email=joiner.email,
        invited_by_id=owner.id,
        team_id=team.id,
        role_in_team="member",
    )
    db_session.add(
        TeamMember(team_id=team.id, developer_id=joiner.id, role="lead", source="manual")
    )
    await db_session.flush()

    await service.accept_pending_invite(invite.token, joiner.id)

    members = await _members_of(db_session, team.id)
    # One row, and the hand-set "lead" is not downgraded to the invite's "member".
    assert len(members) == 1
    assert members[0].role == "lead"


@pytest.mark.asyncio
async def test_unknown_role_on_the_invite_falls_back_to_member(db_session):
    """Storing an undeclared value would exclude them from the lead lookups."""
    workspace, owner = await _workspace(db_session)
    team = await _team(db_session, workspace)
    joiner = await _joiner(db_session)
    service = WorkspaceService(db_session)

    invite = await service.create_pending_invite(
        workspace_id=workspace.id,
        email=joiner.email,
        invited_by_id=owner.id,
        team_id=team.id,
        role_in_team="admin",  # the retired value
    )
    await service.accept_pending_invite(invite.token, joiner.id)

    members = await _members_of(db_session, team.id)
    assert members[0].role == TeamMemberRole.MEMBER.value


@pytest.mark.asyncio
async def test_department_and_team_are_independent(db_session):
    """A team placement must not depend on a department being named."""
    workspace, owner = await _workspace(db_session)
    team = await _team(db_session, workspace)
    joiner = await _joiner(db_session)
    service = WorkspaceService(db_session)

    invite = await service.create_pending_invite(
        workspace_id=workspace.id,
        email=joiner.email,
        invited_by_id=owner.id,
        department_id=None,
        team_id=team.id,
    )
    await service.accept_pending_invite(invite.token, joiner.id)

    assert len(await _members_of(db_session, team.id)) == 1


# ==================== write-path validation ====================


@pytest.mark.asyncio
async def test_add_team_member_rejects_an_undeclared_role(db_session):
    workspace, _owner = await _workspace(db_session)
    team = await _team(db_session, workspace)
    joiner = await _joiner(db_session)
    service = TeamManagementService(db_session)

    with pytest.raises(ValueError, match="Unknown team role"):
        await service.add_team_member(team.id, joiner.id, role="admin")


@pytest.mark.asyncio
async def test_update_team_member_role_rejects_an_undeclared_role(db_session):
    workspace, _owner = await _workspace(db_session)
    team = await _team(db_session, workspace)
    joiner = await _joiner(db_session)
    service = TeamManagementService(db_session)
    await service.add_team_member(team.id, joiner.id, role="member")

    with pytest.raises(ValueError, match="Unknown team role"):
        await service.update_team_member_role(team.id, joiner.id, "admin")


@pytest.mark.asyncio
async def test_declared_roles_are_accepted(db_session):
    workspace, _owner = await _workspace(db_session)
    team = await _team(db_session, workspace)
    service = TeamManagementService(db_session)

    for index, role in enumerate(sorted(TEAM_MEMBER_ROLES)):
        developer = await _joiner(db_session, email=f"dev{index}@example.com")
        member = await service.add_team_member(team.id, developer.id, role=role)
        assert member.role == role
