"""Owner/admin separation and settings access control.

Three things were true before this and are asserted false here:

1. **`owner` and `admin` were byte-identical** — both role templates were
   `list(PERMISSIONS.keys())` — so "owner" was a label with no consequences and an
   admin could delete anything, change billing, and edit roles.
2. **The workspace's own `owner_id` was ignored** by permission resolution, which
   read the membership row's `role` string instead. Creation sets that to "owner",
   but a transfer or a seed script need not, and now that admins lack the
   destructive permissions that difference locks a real owner out.
3. **Settings APIs had no permission gate.** `can_manage_workspace_settings`
   existed in the catalogue and was referenced only by dashboard widgets; every
   settings router was reachable by any member of the workspace.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.developer import Developer
from aexy.models.permissions import (
    OWNER_ONLY_PERMISSIONS,
    PERMISSIONS,
    ROLE_TEMPLATES,
    get_admin_permissions,
)
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.permission_service import PermissionService

settings = get_settings()


def _auth(developer_id: str) -> dict:
    payload = {"sub": developer_id, "type": "access", "exp": datetime.now(timezone.utc).timestamp() + 1800}
    return {"Authorization": f"Bearer {jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)}"}


async def _developer(db: AsyncSession, label: str) -> Developer:
    dev = Developer(id=str(uuid4()), email=f"{label}-{uuid4().hex[:6]}@example.com", name=label)
    db.add(dev)
    await db.flush()
    return dev


@pytest_asyncio.fixture
async def roles(db_session: AsyncSession):
    """A workspace with an owner, an admin and a plain member."""
    owner = await _developer(db_session, "owner")
    admin = await _developer(db_session, "admin")
    member = await _developer(db_session, "member")

    ws = Workspace(id=str(uuid4()), name="Acme", slug=f"acme-{uuid4().hex[:6]}", owner_id=owner.id)
    db_session.add(ws)
    await db_session.flush()
    db_session.add_all([
        WorkspaceMember(workspace_id=ws.id, developer_id=owner.id, role="owner", status="active"),
        WorkspaceMember(workspace_id=ws.id, developer_id=admin.id, role="admin", status="active"),
        WorkspaceMember(workspace_id=ws.id, developer_id=member.id, role="member", status="active"),
    ])
    await db_session.commit()
    return {
        "ws": ws.id,
        "owner": owner,
        "admin": admin,
        "member": member,
        "owner_h": _auth(owner.id),
        "admin_h": _auth(admin.id),
        "member_h": _auth(member.id),
    }


# ------------------------------------------------------------ the role templates

def test_owner_and_admin_are_no_longer_identical():
    owner = set(ROLE_TEMPLATES["owner"]["permissions"])
    admin = set(ROLE_TEMPLATES["admin"]["permissions"])
    assert owner == set(PERMISSIONS), "the owner should still hold everything"
    assert owner - admin == set(OWNER_ONLY_PERMISSIONS)
    assert not (admin & OWNER_ONLY_PERMISSIONS)
    # A guard against the set being quietly emptied, which would restore the old
    # behaviour while every other assertion here still passed.
    assert OWNER_ONLY_PERMISSIONS
    assert set(get_admin_permissions()) == admin


def test_the_destructive_and_financial_permissions_are_the_owners():
    for perm in (
        "can_delete_projects",
        "can_delete_teams",
        "can_delete_docs",
        "can_delete_tickets",
        "can_manage_billing",
        "can_manage_roles",
        "can_assign_roles",
    ):
        assert perm in OWNER_ONLY_PERMISSIONS, f"{perm} should be owner-only"


# ------------------------------------------------------- effective permissions

@pytest.mark.asyncio
async def test_admin_cannot_delete_or_bill_but_owner_can(db_session: AsyncSession, roles):
    svc = PermissionService(db_session)

    for perm in ("can_delete_projects", "can_manage_billing", "can_manage_roles"):
        assert await svc.check_permission(roles["ws"], roles["owner"].id, perm) is True
        assert await svc.check_permission(roles["ws"], roles["admin"].id, perm) is False

    # The admin keeps everything else — this is a narrow split, not a demotion.
    for perm in ("can_edit_projects", "can_manage_integrations", "can_invite_members"):
        assert await svc.check_permission(roles["ws"], roles["admin"].id, perm) is True


@pytest.mark.asyncio
async def test_owner_id_wins_over_a_membership_row_that_says_admin(db_session: AsyncSession, roles):
    """The hole that made this worth fixing.

    Resolution used to read the membership row's `role` string. A workspace whose
    owner sits on an admin row — after a transfer, a seed script, or a hand-fixed
    database — would leave the real owner unable to delete anything or touch
    billing, with no way to grant it back to themselves.
    """
    from sqlalchemy import select

    member_row = (
        await db_session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == roles["ws"],
                WorkspaceMember.developer_id == roles["owner"].id,
            )
        )
    ).scalar_one()
    member_row.role = "admin"
    await db_session.commit()

    svc = PermissionService(db_session)
    assert await svc.check_permission(roles["ws"], roles["owner"].id, "can_delete_projects") is True
    assert await svc.check_permission(roles["ws"], roles["owner"].id, "can_manage_billing") is True


@pytest.mark.asyncio
async def test_an_owner_only_permission_can_be_delegated(db_session: AsyncSession, roles):
    """Owner-only is a default, not a wall — delegation is what makes it usable."""
    from sqlalchemy import select

    admin_row = (
        await db_session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == roles["ws"],
                WorkspaceMember.developer_id == roles["admin"].id,
            )
        )
    ).scalar_one()
    admin_row.permission_overrides = {"can_delete_projects": True}
    await db_session.commit()

    svc = PermissionService(db_session)
    assert await svc.check_permission(roles["ws"], roles["admin"].id, "can_delete_projects") is True
    # Delegating one does not hand over the rest.
    assert await svc.check_permission(roles["ws"], roles["admin"].id, "can_manage_billing") is False


@pytest.mark.asyncio
async def test_an_override_cannot_strip_the_owner(db_session: AsyncSession, roles):
    """A workspace whose owner revoked their own billing access has nobody left
    who can restore it, so the owner union is applied after overrides."""
    from sqlalchemy import select

    owner_row = (
        await db_session.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == roles["ws"],
                WorkspaceMember.developer_id == roles["owner"].id,
            )
        )
    ).scalar_one()
    owner_row.permission_overrides = {"can_manage_billing": False}
    await db_session.commit()

    svc = PermissionService(db_session)
    assert await svc.check_permission(roles["ws"], roles["owner"].id, "can_manage_billing") is True


@pytest.mark.asyncio
async def test_a_plain_member_holds_no_workspace_configuration_permissions(
    db_session: AsyncSession, roles
):
    """The settings pages a member must not reach.

    Note `can_manage_tasks` is deliberately absent from this list: the member
    template does hold it, because it means "work with tasks". That is exactly why
    Task Configuration is gated on `can_manage_workspace_settings` instead — it
    edits the workspace-wide status and field schema, not a task.
    """
    svc = PermissionService(db_session)
    for perm in (
        "can_manage_org",
        "can_manage_integrations",
        "can_manage_workspace_settings",
        "can_manage_insights",
        "can_manage_billing",
        "can_manage_roles",
    ):
        assert await svc.check_permission(roles["ws"], roles["member"].id, perm) is False, perm


# -------------------------------------------------------------- the endpoint

@pytest.mark.asyncio
async def test_my_permissions_reports_role_ownership_and_overrides(client, roles):
    ws = roles["ws"]

    owner = (await client.get(f"/api/v1/workspaces/{ws}/my-permissions", headers=roles["owner_h"])).json()
    assert owner["is_owner"] is True
    assert "can_manage_billing" in owner["permissions"]

    admin = (await client.get(f"/api/v1/workspaces/{ws}/my-permissions", headers=roles["admin_h"])).json()
    assert admin["is_owner"] is False
    assert "can_manage_billing" not in admin["permissions"]
    assert "can_edit_projects" in admin["permissions"]

    member = (await client.get(f"/api/v1/workspaces/{ws}/my-permissions", headers=roles["member_h"])).json()
    assert member["is_owner"] is False
    assert "can_manage_org" not in member["permissions"]


@pytest.mark.asyncio
async def test_my_permissions_is_closed_to_non_members(client, roles, db_session: AsyncSession):
    outsider = await _developer(db_session, "outsider")
    await db_session.commit()
    r = await client.get(
        f"/api/v1/workspaces/{roles['ws']}/my-permissions", headers=_auth(outsider.id)
    )
    assert r.status_code == 403


# ------------------------------------------------------- write guard on routers

@pytest.mark.asyncio
async def test_members_can_read_settings_data_but_not_change_it(client, roles):
    """The reason the guard is method-aware.

    Teams are read by escalation routing, on-call and standups, so gating the
    whole router on `can_manage_team_members` would break ordinary members'
    reads to protect a write only the settings page makes.
    """
    ws = roles["ws"]
    base = f"/api/v1/workspaces/{ws}/teams"

    assert (await client.get(base, headers=roles["member_h"])).status_code == 200

    denied = await client.post(base, headers=roles["member_h"], json={"name": "Sneaky"})
    assert denied.status_code == 403
    assert "can_manage_team_members" in denied.text

    allowed = await client.post(base, headers=roles["admin_h"], json={"name": "Platform"})
    assert allowed.status_code == 201, allowed.text


@pytest.mark.asyncio
async def test_the_guard_names_the_permission_it_wants(client, roles):
    """An admin granting access shouldn't have to guess which of 61 keys it is."""
    r = await client.post(
        f"/api/v1/workspaces/{roles['ws']}/task-statuses",
        headers=roles["member_h"],
        json={"name": "Blocked", "category": "todo"},
    )
    assert r.status_code == 403, r.text
    assert "can_manage_workspace_settings" in r.text
