"""Giving a new workspace its first team(s).

Onboarding seeded departments and no teams, which left every new workspace one
step short of working. A *department* decides what somebody can see; a *team*
decides who chases them — standup prompts, blocker escalation, review digests,
sprint boards and leave approvals all resolve through team membership. So a
founder finished setup with everyone navigating correctly and nobody enrolled in
any of it, and the team field on an invite opened onto an empty dropdown.

The strategy is the founder's answer rather than our guess, because a team
boundary is a real decision and a wrong team silently routes approvals.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.organization import Department
from aexy.models.team import Team, TeamMember, TeamMemberRole
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.organization import DepartmentCreate
from aexy.services.organization_service import OrganizationService
from aexy.services.team_management_service import TeamManagementService


async def _workspace(db: AsyncSession, slug: str) -> tuple[Workspace, Developer]:
    owner = Developer(email=f"owner-{slug}@example.com", name="Owner")
    db.add(owner)
    await db.flush()
    ws = Workspace(name=f"WS {slug}", slug=slug, owner_id=owner.id)
    db.add(ws)
    await db.flush()
    db.add(
        WorkspaceMember(
            workspace_id=ws.id, developer_id=owner.id, role="owner", status="active"
        )
    )
    await db.commit()
    return ws, owner


async def _departments(db: AsyncSession, ws: Workspace, *names: str) -> list[tuple[str, str]]:
    svc = OrganizationService(db)
    out = []
    for name in names:
        dept = await svc.create_department(ws.id, DepartmentCreate(name=name))
        out.append((dept.id, dept.name))
    await db.commit()
    return out


async def _teams(db: AsyncSession, ws: Workspace) -> list[Team]:
    return list(
        (
            await db.execute(
                select(Team).where(Team.workspace_id == ws.id).order_by(Team.name)
            )
        ).scalars().all()
    )


# ==================== the three strategies ====================


@pytest.mark.asyncio
async def test_per_department_mirrors_the_org(db_session: AsyncSession):
    ws, owner = await _workspace(db_session, "seed-per-dept")
    departments = await _departments(db_session, ws, "Engineering", "Sales")

    created, skipped = await TeamManagementService(db_session).seed_teams_for_onboarding(
        ws.id, owner_id=owner.id, strategy="per_department", departments=departments
    )
    await db_session.commit()

    assert skipped is False
    assert {team.name for team in created} == {"Engineering", "Sales"}
    # The rollup that already existed for exactly this, and was never written.
    assert all(team.department_id is not None for team in created)


@pytest.mark.asyncio
async def test_single_makes_one_team_for_everyone(db_session: AsyncSession):
    ws, owner = await _workspace(db_session, "seed-single")
    departments = await _departments(db_session, ws, "Engineering", "Sales")

    created, _ = await TeamManagementService(db_session).seed_teams_for_onboarding(
        ws.id, owner_id=owner.id, strategy="single", departments=departments
    )
    await db_session.commit()

    assert len(created) == 1
    assert created[0].department_id is None


@pytest.mark.asyncio
async def test_none_creates_nothing(db_session: AsyncSession):
    ws, owner = await _workspace(db_session, "seed-none")
    departments = await _departments(db_session, ws, "Engineering")

    created, skipped = await TeamManagementService(db_session).seed_teams_for_onboarding(
        ws.id, owner_id=owner.id, strategy="none", departments=departments
    )
    await db_session.commit()

    assert created == [] and skipped is False
    assert await _teams(db_session, ws) == []


@pytest.mark.asyncio
async def test_per_department_with_no_departments_still_makes_one_team(
    db_session: AsyncSession,
):
    """Picking only "AI & Agents" seeds no department, and falling through to zero
    teams would leave the invite dropdown empty — the state this exists to fix."""
    ws, owner = await _workspace(db_session, "seed-no-depts")

    created, _ = await TeamManagementService(db_session).seed_teams_for_onboarding(
        ws.id, owner_id=owner.id, strategy="per_department", departments=[]
    )
    await db_session.commit()

    assert len(created) == 1
    assert created[0].department_id is None


# ==================== the guards ====================


@pytest.mark.asyncio
async def test_existing_teams_win(db_session: AsyncSession):
    """The repos step can create repo-based teams before this runs, and those
    reflect how work is actually split. Seeding beside them would produce a
    plausible-looking duplicate of each."""
    ws, owner = await _workspace(db_session, "seed-existing")
    departments = await _departments(db_session, ws, "Engineering")
    service = TeamManagementService(db_session)
    await service.create_team(ws.id, name="backend", type="repo_based")
    await db_session.commit()

    created, skipped = await service.seed_teams_for_onboarding(
        ws.id, owner_id=owner.id, strategy="per_department", departments=departments
    )
    await db_session.commit()

    assert created == []
    # Reported, not silent: "we made you none" and "you already had teams" look
    # identical in an empty list, and only one is worth acting on.
    assert skipped is True
    assert [team.name for team in await _teams(db_session, ws)] == ["backend"]


@pytest.mark.asyncio
async def test_the_founder_is_recorded_as_lead(db_session: AsyncSession):
    """`review_service` and `leave_request_service` both look for exactly
    ``role == "lead"``, so a team with no lead sends its approvals to "any
    workspace manager"."""
    ws, owner = await _workspace(db_session, "seed-lead")
    departments = await _departments(db_session, ws, "Engineering")

    created, _ = await TeamManagementService(db_session).seed_teams_for_onboarding(
        ws.id, owner_id=owner.id, strategy="per_department", departments=departments
    )
    await db_session.commit()

    members = (
        await db_session.execute(
            select(TeamMember).where(TeamMember.team_id == created[0].id)
        )
    ).scalars().all()
    assert [(m.developer_id, m.role) for m in members] == [
        (owner.id, TeamMemberRole.LEAD.value)
    ]


@pytest.mark.asyncio
async def test_seeded_teams_carry_their_provenance(db_session: AsyncSession):
    """So a later repo sync can offer to merge rather than guess whether a team
    was deliberate."""
    ws, owner = await _workspace(db_session, "seed-provenance")
    departments = await _departments(db_session, ws, "Engineering")

    created, _ = await TeamManagementService(db_session).seed_teams_for_onboarding(
        ws.id, owner_id=owner.id, strategy="per_department", departments=departments
    )
    await db_session.commit()

    assert created[0].settings.get("seeded_from") == "onboarding"


@pytest.mark.asyncio
async def test_re_running_onboarding_adds_nothing(db_session: AsyncSession):
    """Onboarding is re-runnable, so this has to be too."""
    ws, owner = await _workspace(db_session, "seed-idempotent")
    departments = await _departments(db_session, ws, "Engineering", "Sales")
    service = TeamManagementService(db_session)

    await service.seed_teams_for_onboarding(
        ws.id, owner_id=owner.id, strategy="per_department", departments=departments
    )
    await db_session.commit()
    created, skipped = await service.seed_teams_for_onboarding(
        ws.id, owner_id=owner.id, strategy="per_department", departments=departments
    )
    await db_session.commit()

    assert created == [] and skipped is True
    assert len(await _teams(db_session, ws)) == 2


# ==================== mirroring afterwards ====================


@pytest.mark.asyncio
async def test_mirroring_covers_departments_added_later(db_session: AsyncSession):
    """Choosing "no teams yet", or adding a department months on, must not be a
    one-way door."""
    ws, owner = await _workspace(db_session, "mirror-later")
    await _departments(db_session, ws, "Engineering", "Sales")
    service = TeamManagementService(db_session)

    created = await service.mirror_departments_as_teams(ws.id, owner.id)
    await db_session.commit()

    assert {team.name for team in created} == {"Engineering", "Sales"}


@pytest.mark.asyncio
async def test_mirroring_skips_departments_that_already_have_a_team(
    db_session: AsyncSession,
):
    ws, owner = await _workspace(db_session, "mirror-partial")
    departments = await _departments(db_session, ws, "Engineering", "Sales")
    service = TeamManagementService(db_session)
    await service.seed_teams_for_onboarding(
        ws.id, owner_id=owner.id, strategy="per_department", departments=departments[:1]
    )
    await db_session.commit()

    created = await service.mirror_departments_as_teams(ws.id, owner.id)
    await db_session.commit()

    # Only the department that had none — and not a second Engineering team.
    assert [team.name for team in created] == ["Sales"]
    assert len(await _teams(db_session, ws)) == 2


@pytest.mark.asyncio
async def test_mirroring_is_idempotent(db_session: AsyncSession):
    ws, owner = await _workspace(db_session, "mirror-twice")
    await _departments(db_session, ws, "Engineering")
    service = TeamManagementService(db_session)

    await service.mirror_departments_as_teams(ws.id, owner.id)
    await db_session.commit()
    second = await service.mirror_departments_as_teams(ws.id, owner.id)
    await db_session.commit()

    assert second == []
    assert len(await _teams(db_session, ws)) == 1


@pytest.mark.asyncio
async def test_mirroring_runs_even_when_repo_teams_exist(db_session: AsyncSession):
    """Unlike the onboarding path: that guard avoids duplicating repo teams during
    setup, whereas here the admin has asked for this deliberately. The
    per-department check is what actually prevents duplicates."""
    ws, owner = await _workspace(db_session, "mirror-with-repo")
    await _departments(db_session, ws, "Engineering")
    service = TeamManagementService(db_session)
    await service.create_team(ws.id, name="backend", type="repo_based")
    await db_session.commit()

    created = await service.mirror_departments_as_teams(ws.id, owner.id)
    await db_session.commit()

    assert [team.name for team in created] == ["Engineering"]


@pytest.mark.asyncio
async def test_mirroring_ignores_inactive_departments(db_session: AsyncSession):
    ws, owner = await _workspace(db_session, "mirror-inactive")
    departments = await _departments(db_session, ws, "Engineering", "Retired")
    row = await db_session.get(Department, departments[1][0])
    row.is_active = False
    await db_session.commit()

    created = await TeamManagementService(db_session).mirror_departments_as_teams(
        ws.id, owner.id
    )
    await db_session.commit()

    assert [team.name for team in created] == ["Engineering"]
