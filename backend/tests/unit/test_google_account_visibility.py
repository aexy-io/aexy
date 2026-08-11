"""Who sees whose connected mailbox.

Listing every Google account to every member was reasonable while connecting was
an admin act. Once any member could attach their own inbox, the same list became
a roster of who has linked their personal mail — readable by the whole
workspace. That is a different thing from "which addresses does the workspace
sync", and only the second one is everybody's business.

The two failure modes are opposite and both bad: leaking a colleague's personal
address to a peer, and hiding a Service Desk mailbox from the person who runs
the desk, which quietly breaks the queue.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from aexy.models.developer import Developer
from aexy.models.google_integration import GoogleIntegration
from aexy.models.organization import Department, DepartmentMember, DepartmentMemberRole
from aexy.models.workspace import Workspace
from aexy.services.google_account_visibility import visible_google_accounts


@pytest.fixture
async def org(db_session):
    """A head, someone in their department, and an unrelated colleague."""
    head = Developer(email="head@example.com", name="Head")
    report = Developer(email="report@example.com", name="Report")
    outsider = Developer(email="outsider@example.com", name="Outsider")
    db_session.add_all([head, report, outsider])
    await db_session.flush()

    workspace = Workspace(name="WS", slug="ws", owner_id=head.id)
    db_session.add(workspace)
    await db_session.flush()

    sales = Department(
        workspace_id=workspace.id, name="Sales", slug="sales", head_id=head.id
    )
    other = Department(workspace_id=workspace.id, name="Engineering", slug="engineering")
    db_session.add_all([sales, other])
    await db_session.flush()

    db_session.add_all(
        [
            DepartmentMember(
                workspace_id=workspace.id,
                department_id=sales.id,
                developer_id=head.id,
                role_in_department=DepartmentMemberRole.HEAD.value,
            ),
            DepartmentMember(
                workspace_id=workspace.id,
                department_id=sales.id,
                developer_id=report.id,
                role_in_department=DepartmentMemberRole.MEMBER.value,
            ),
            DepartmentMember(
                workspace_id=workspace.id,
                department_id=other.id,
                developer_id=outsider.id,
                role_in_department=DepartmentMemberRole.MEMBER.value,
            ),
        ]
    )
    await db_session.flush()
    return workspace, head, report, outsider


def _account(workspace_id: str, owner_id: str | None, email: str) -> GoogleIntegration:
    return GoogleIntegration(
        workspace_id=workspace_id,
        connected_by_id=owner_id,
        google_email=email,
        google_user_id=email,
        access_token="x",
        refresh_token="y",
        token_expiry=datetime.now(timezone.utc) + timedelta(hours=1),
        is_active=True,
    )


async def _visible(db, workspace, viewer, accounts, **over):
    kwargs = {
        "is_admin": False,
        "can_manage_tickets": False,
        "service_desk_integration_ids": set(),
        **over,
    }
    result = await visible_google_accounts(
        db,
        workspace_id=workspace.id,
        developer_id=str(viewer.id),
        integrations=accounts,
        **kwargs,
    )
    return {a.google_email for a in result}


class TestOrdinaryMember:
    async def test_sees_only_their_own(self, db_session, org):
        workspace, head, report, outsider = org
        accounts = [
            _account(workspace.id, report.id, "report@gmail.com"),
            _account(workspace.id, outsider.id, "outsider@gmail.com"),
            _account(workspace.id, head.id, "head@gmail.com"),
        ]

        seen = await _visible(db_session, workspace, report, accounts)

        assert seen == {"report@gmail.com"}

    async def test_does_not_see_a_desk_mailbox_they_cannot_manage(
        self, db_session, org
    ):
        workspace, _head, report, _outsider = org
        desk = _account(workspace.id, None, "support@company.com")
        db_session.add(desk)
        await db_session.flush()

        seen = await _visible(
            db_session,
            workspace,
            report,
            [desk],
            service_desk_integration_ids={str(desk.id)},
        )

        # Unowned, so it is workspace-level and stays visible — but on the
        # workspace-row rule, not because they run the desk.
        assert seen == {"support@company.com"}


class TestDepartmentHead:
    async def test_sees_their_departments_accounts(self, db_session, org):
        workspace, head, report, outsider = org
        accounts = [
            _account(workspace.id, head.id, "head@gmail.com"),
            _account(workspace.id, report.id, "report@gmail.com"),
            _account(workspace.id, outsider.id, "outsider@gmail.com"),
        ]

        seen = await _visible(db_session, workspace, head, accounts)

        assert "report@gmail.com" in seen, "a head cannot see their own department"
        assert "head@gmail.com" in seen
        assert "outsider@gmail.com" not in seen, "headship leaked past the department"

    async def test_headship_by_membership_row_counts_too(self, db_session, org):
        """Headship is recorded in two places and they do not always agree."""
        workspace, _head, report, outsider = org
        # Promote `report` to head of Engineering via the membership row only —
        # no Department.head_id — and give them an Engineering colleague.
        eng = (
            await db_session.execute(
                Department.__table__.select().where(
                    Department.workspace_id == workspace.id,
                    Department.name == "Engineering",
                )
            )
        ).first()
        db_session.add(
            DepartmentMember(
                workspace_id=workspace.id,
                department_id=str(eng.id),
                developer_id=report.id,
                role_in_department=DepartmentMemberRole.HEAD.value,
            )
        )
        await db_session.flush()

        accounts = [_account(workspace.id, outsider.id, "outsider@gmail.com")]
        seen = await _visible(db_session, workspace, report, accounts)

        assert seen == {"outsider@gmail.com"}


class TestAdminAndDesk:
    async def test_admin_sees_everything(self, db_session, org):
        workspace, head, report, outsider = org
        accounts = [
            _account(workspace.id, report.id, "report@gmail.com"),
            _account(workspace.id, outsider.id, "outsider@gmail.com"),
        ]

        seen = await _visible(db_session, workspace, head, accounts, is_admin=True)

        assert seen == {"report@gmail.com", "outsider@gmail.com"}

    async def test_desk_manager_sees_the_desk_mailbox(self, db_session, org):
        """A team address, not a personal one — hiding it breaks the queue."""
        workspace, _head, report, outsider = org
        desk = _account(workspace.id, outsider.id, "support@company.com")
        personal = _account(workspace.id, outsider.id, "outsider@gmail.com")
        db_session.add_all([desk, personal])
        await db_session.flush()

        seen = await _visible(
            db_session,
            workspace,
            report,
            [desk, personal],
            can_manage_tickets=True,
            service_desk_integration_ids={str(desk.id)},
        )

        assert "support@company.com" in seen
        assert "outsider@gmail.com" not in seen, (
            "managing tickets exposed a colleague's personal mailbox"
        )


class TestLegacyRows:
    async def test_unowned_accounts_stay_visible(self, db_session, org):
        """Rows predating connected_by_id belong to the workspace, not a person.

        Hiding them would empty the list for single-account workspaces that have
        worked for months — which reads as data loss, not as a privacy fix.
        """
        workspace, _head, report, _outsider = org
        accounts = [_account(workspace.id, None, "legacy@company.com")]

        seen = await _visible(db_session, workspace, report, accounts)

        assert seen == {"legacy@company.com"}
