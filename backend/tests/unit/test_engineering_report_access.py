"""Who may read the monthly contribution report.

It is a per-person table of how much each colleague wrote, merged and reviewed.
For the people who run the team that is a management tool; for everyone it is a
leaderboard, and the numbers are too easy to misread for that.

Headship is recorded in two places that do not always agree — `Department.head_id`
and a `DepartmentMember` row of role `head` — so both routes are tested. Reading
only one would quietly lock out whichever half of the org chart was written the
other way.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from aexy.models.developer import Developer
from aexy.models.organization import Department, DepartmentMember, DepartmentMemberRole
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.engineering_report import can_read_report, resolve_report_scope


async def _developer(db, name: str) -> Developer:
    dev = Developer(email=f"{name}@example.com", name=name)
    db.add(dev)
    await db.flush()
    return dev


async def _member(db, workspace, developer, role: str) -> None:
    db.add(
        WorkspaceMember(
            workspace_id=workspace.id,
            developer_id=developer.id,
            role=role,
            status="active",
        )
    )
    await db.flush()


@pytest.fixture
async def workspace(db_session):
    owner = await _developer(db_session, "owner")
    ws = Workspace(name="WS", slug="ws", owner_id=owner.id)
    db_session.add(ws)
    await db_session.flush()
    await _member(db_session, ws, owner, "owner")
    ws.owner = owner
    return ws


async def _department(db, workspace, *, head: Developer | None = None) -> Department:
    dept = Department(
        id=str(uuid4()),
        workspace_id=workspace.id,
        name="Engineering",
        slug=f"eng-{uuid4().hex[:6]}",
        head_id=head.id if head else None,
    )
    db.add(dept)
    await db.flush()
    return dept


class TestAccess:
    async def test_an_owner_may_read_it(self, db_session, workspace):
        assert await can_read_report(db_session, workspace.id, workspace.owner.id)

    async def test_an_admin_may_read_it(self, db_session, workspace):
        admin = await _developer(db_session, "admin")
        await _member(db_session, workspace, admin, "admin")

        assert await can_read_report(db_session, workspace.id, admin.id)

    async def test_a_plain_member_may_not(self, db_session, workspace):
        member = await _developer(db_session, "member")
        await _member(db_session, workspace, member, "member")

        assert await can_read_report(db_session, workspace.id, member.id) is False

    async def test_a_head_recorded_on_the_department_may(self, db_session, workspace):
        head = await _developer(db_session, "head-by-column")
        await _member(db_session, workspace, head, "member")
        await _department(db_session, workspace, head=head)

        assert await can_read_report(db_session, workspace.id, head.id)

    async def test_a_head_recorded_on_the_membership_row_may(
        self, db_session, workspace
    ):
        head = await _developer(db_session, "head-by-membership")
        await _member(db_session, workspace, head, "member")
        dept = await _department(db_session, workspace)
        db_session.add(
            DepartmentMember(
                id=str(uuid4()),
                workspace_id=workspace.id,
                department_id=dept.id,
                developer_id=head.id,
                role_in_department=DepartmentMemberRole.HEAD.value,
            )
        )
        await db_session.flush()

        assert await can_read_report(db_session, workspace.id, head.id)

    async def test_belonging_to_a_department_is_not_heading_it(
        self, db_session, workspace
    ):
        member = await _developer(db_session, "dept-member")
        await _member(db_session, workspace, member, "member")
        dept = await _department(db_session, workspace)
        db_session.add(
            DepartmentMember(
                id=str(uuid4()),
                workspace_id=workspace.id,
                department_id=dept.id,
                developer_id=member.id,
                role_in_department=DepartmentMemberRole.MEMBER.value,
            )
        )
        await db_session.flush()

        assert await can_read_report(db_session, workspace.id, member.id) is False

    async def test_a_head_who_left_the_workspace_may_not(self, db_session, workspace):
        """A stale Department row is not a way back into a workspace."""
        head = await _developer(db_session, "departed-head")
        db_session.add(
            WorkspaceMember(
                workspace_id=workspace.id,
                developer_id=head.id,
                role="member",
                status="removed",
            )
        )
        await _department(db_session, workspace, head=head)
        await db_session.flush()

        assert await can_read_report(db_session, workspace.id, head.id) is False

    async def test_a_stranger_may_not(self, db_session, workspace):
        outsider = await _developer(db_session, "outsider")

        assert await can_read_report(db_session, workspace.id, outsider.id) is False

    async def test_an_admin_gets_the_whole_workspace(self, db_session, workspace):
        scope = await resolve_report_scope(
            db_session, workspace.id, workspace.owner.id
        )
        assert scope is not None
        assert scope.is_workspace_wide
        assert scope.developer_ids is None

    async def test_a_head_gets_their_department_and_themselves(
        self, db_session, workspace
    ):
        head = await _developer(db_session, "head")
        await _member(db_session, workspace, head, "member")
        reports_to_them = await _developer(db_session, "reports-to-them")
        await _member(db_session, workspace, reports_to_them, "member")
        elsewhere = await _developer(db_session, "elsewhere")
        await _member(db_session, workspace, elsewhere, "member")

        dept = await _department(db_session, workspace, head=head)
        db_session.add(
            DepartmentMember(
                id=str(uuid4()),
                workspace_id=workspace.id,
                department_id=dept.id,
                developer_id=reports_to_them.id,
                role_in_department=DepartmentMemberRole.MEMBER.value,
            )
        )
        await db_session.flush()

        scope = await resolve_report_scope(db_session, workspace.id, head.id)

        assert scope is not None
        assert scope.is_workspace_wide is False
        assert scope.developer_ids == {str(head.id), str(reports_to_them.id)}, (
            "a head sees their department and themselves, and nobody else"
        )
        assert scope.departments == ["Engineering"]

    async def test_a_head_of_an_empty_department_sees_only_themselves(
        self, db_session, workspace
    ):
        """Not the whole workspace — an empty set is not 'no filter'."""
        head = await _developer(db_session, "lonely-head")
        await _member(db_session, workspace, head, "member")
        await _department(db_session, workspace, head=head)

        scope = await resolve_report_scope(db_session, workspace.id, head.id)

        assert scope is not None
        assert scope.developer_ids == {str(head.id)}

    async def test_heading_a_department_elsewhere_grants_nothing_here(
        self, db_session, workspace
    ):
        other_owner = await _developer(db_session, "other-owner")
        other = Workspace(name="Other", slug="other", owner_id=other_owner.id)
        db_session.add(other)
        await db_session.flush()

        head = await _developer(db_session, "foreign-head")
        await _member(db_session, workspace, head, "member")
        await _department(db_session, other, head=head)

        assert await can_read_report(db_session, workspace.id, head.id) is False
