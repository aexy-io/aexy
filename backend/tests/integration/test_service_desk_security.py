"""Authorization tests for the Service Desk + Organization APIs.

These cover the three layers that guard the modules, each of which was missing
at one point and is easy to lose again in a refactor:

1. Workspace membership — ``require_app_access`` only checks the workspace-wide
   module toggle (and defaults to enabled), so without ``require_workspace_member``
   any authenticated developer could read and mutate any workspace's data.
2. The ``can_manage_*`` permission on mutating endpoints — otherwise a plain
   member could rewrite auto-assignment master data and the customer-facing
   email templates.
3. Row-level scoping on the by-id paths — the list and dashboard applied
   ``resolve_scope_clause`` while ticket detail/PATCH did not, so a scoped KAM
   could reach any ticket by id.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.developer import Developer
from aexy.models.organization import Department, DepartmentMember
from aexy.models.ticketing import Ticket
from aexy.models.workspace import Workspace, WorkspaceMember
from tests.conftest import seed_service_desk_taxonomy

settings = get_settings()


def _auth(developer_id: str) -> dict:
    payload = {"sub": developer_id, "type": "access", "exp": datetime.now(timezone.utc).timestamp() + 1800}
    return {"Authorization": f"Bearer {jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)}"}


def _sd(ws_id: str) -> str:
    return f"/api/v1/workspaces/{ws_id}/service-desk"


async def _developer(db: AsyncSession, label: str) -> Developer:
    dev = Developer(id=str(uuid4()), email=f"{label}-{uuid4().hex[:6]}@example.com", name=label)
    db.add(dev)
    await db.flush()
    return dev


@pytest_asyncio.fixture
async def tenants(db_session: AsyncSession):
    """Workspace A with a ticket; an outsider who belongs to a different
    workspace; a plain member of A; and a sales-scoped member of A."""
    owner_a = await _developer(db_session, "owner-a")
    outsider = await _developer(db_session, "outsider")
    plain = await _developer(db_session, "plain-member")
    sales = await _developer(db_session, "sales-member")
    viewer = await _developer(db_session, "viewer-member")

    ws_a = Workspace(id=str(uuid4()), name="Tenant A", slug=f"a-{uuid4().hex[:6]}", owner_id=owner_a.id)
    ws_b = Workspace(id=str(uuid4()), name="Tenant B", slug=f"b-{uuid4().hex[:6]}", owner_id=outsider.id)
    db_session.add_all([ws_a, ws_b])
    await db_session.flush()

    db_session.add_all([
        WorkspaceMember(workspace_id=ws_a.id, developer_id=owner_a.id, role="admin", status="active"),
        WorkspaceMember(workspace_id=ws_b.id, developer_id=outsider.id, role="admin", status="active"),
        # "member" maps to the developer role template, which does NOT include
        # can_manage_service_desk / can_manage_org.
        WorkspaceMember(workspace_id=ws_a.id, developer_id=plain.id, role="member", status="active"),
        WorkspaceMember(workspace_id=ws_a.id, developer_id=sales.id, role="member", status="active"),
        # A member whose Service Desk access has been explicitly revoked. Note
        # the role is still "member": every legacy role that clears the
        # membership guard (member and up) maps to a template holding both view
        # permissions, so a per-member override is what the view gate actually
        # makes possible — revoking one module for one person.
        WorkspaceMember(
            workspace_id=ws_a.id, developer_id=viewer.id, role="member", status="active",
            permission_overrides={"can_view_service_desk": False},
        ),
    ])

    # Sales function membership → scoped to tickets pending with sales only.
    dept = Department(
        id=str(uuid4()), workspace_id=ws_a.id, name="Sales", slug="sales",
        function_key="sales", path="/sales/", depth=0,
    )
    db_session.add(dept)
    await db_session.flush()
    db_session.add(
        DepartmentMember(id=str(uuid4()), workspace_id=ws_a.id, department_id=dept.id, developer_id=sales.id)
    )

    # A department's function key only grants visibility if some stakeholder
    # routes to it, and stakeholders are per-workspace rows now rather than an
    # enum — so a desk with no taxonomy scopes everyone to "none", correctly.
    # These tests describe an insurance desk (sales/finance/marketing queues), so
    # they set one up, which is what an admin does before anyone uses the desk.
    await seed_service_desk_taxonomy(db_session, ws_a.id)
    await seed_service_desk_taxonomy(db_session, ws_b.id)
    await db_session.commit()

    return {
        "ws_a": ws_a.id,
        "admin": _auth(owner_a.id),
        "outsider": _auth(outsider.id),
        "plain": _auth(plain.id),
        "sales": _auth(sales.id),
        "viewer": _auth(viewer.id),
    }


@pytest_asyncio.fixture
async def seeded_ticket(client, tenants):
    """A ticket in workspace A, created by its admin."""
    ws, h = tenants["ws_a"], tenants["admin"]
    r = await client.post(_sd(ws) + "/tickets/manual", headers=h, json={
        "subject": "A private ticket", "body": "confidential", "request_type": "claims",
    })
    assert r.status_code == 201, r.text
    return r.json()["ticket_id"]


@pytest.mark.asyncio
async def test_outsider_is_locked_out_of_another_workspace(client, tenants, seeded_ticket):
    """A developer who is not a member of workspace A must reach nothing in it."""
    ws, h = tenants["ws_a"], tenants["outsider"]
    b = _sd(ws)

    attempts = {
        "ticket detail": await client.get(f"{b}/tickets/{seeded_ticket}", headers=h),
        "ticket list": await client.get(f"{b}/tickets", headers=h),
        "dashboard": await client.get(f"{b}/dashboard", headers=h),
        "accounts": await client.get(f"{b}/accounts", headers=h),
        "templates": await client.get(f"{b}/templates", headers=h),
        "settings read": await client.get(f"{b}/settings", headers=h),
        "settings write": await client.patch(f"{b}/settings", headers=h, json={"ai_classification_enabled": True}),
        "template write": await client.patch(f"{b}/templates/receipt", headers=h, json={"subject": "x", "body": "y"}),
        "pending-with": await client.patch(f"{b}/tickets/{seeded_ticket}/pending-with", headers=h, json={"pending_with": "closed"}),
        "human split": await client.post(
            f"{b}/tickets/{seeded_ticket}/split", headers=h, json={"issue_indexes": [2]}
        ),
        "manual ticket": await client.post(f"{b}/tickets/manual", headers=h, json={"subject": "x", "request_type": "query"}),
        "org departments": await client.get(f"/api/v1/workspaces/{ws}/organization/departments", headers=h),
        "org create": await client.post(f"/api/v1/workspaces/{ws}/organization/departments", headers=h, json={"name": "Injected"}),
        "org my-permissions": await client.get(f"/api/v1/workspaces/{ws}/organization/my-permissions", headers=h),
    }
    for label, resp in attempts.items():
        assert resp.status_code == 403, f"outsider reached {label}: {resp.status_code} {resp.text[:120]}"
    assert len((await client.get(f"{b}/tickets", headers=tenants["admin"])).json()) == 1


@pytest.mark.asyncio
async def test_plain_member_can_read_but_not_manage(client, tenants):
    """Membership alone must not confer master-data / settings / template writes."""
    ws, h = tenants["ws_a"], tenants["plain"]
    b = _sd(ws)

    # reads are fine
    assert (await client.get(f"{b}/accounts", headers=h)).status_code == 200
    settings = await client.get(f"{b}/settings", headers=h)
    assert settings.status_code == 200
    # ...and the response tells the UI it is read-only, so it can hide controls
    # that would only 403 (the server gate below is still the authority).
    assert settings.json()["can_manage"] is False
    admin_settings = await client.get(f"{b}/settings", headers=tenants["admin"])
    assert admin_settings.json()["can_manage"] is True

    # writes are refused
    forbidden = {
        "create account": await client.post(f"{b}/accounts", headers=h, json={"name": "Rogue", "domains": ["rogue.com"]}),
        "create vendor": await client.post(f"{b}/vendors", headers=h, json={"name": "Rogue Life"}),
        "create product": await client.post(f"{b}/products", headers=h, json={"name": "Rogue Product"}),
        "create mailbox": await client.post(f"{b}/mailboxes", headers=h, json={"address": "rogue@example.com"}),
        "flip AI toggle": await client.patch(f"{b}/settings", headers=h, json={"ai_classification_enabled": True}),
        "rewrite receipt": await client.patch(f"{b}/templates/receipt", headers=h, json={"subject": "pwned", "body": "pwned"}),
        "create department": await client.post(f"/api/v1/workspaces/{ws}/organization/departments", headers=h, json={"name": "Rogue Dept"}),
    }
    for label, resp in forbidden.items():
        assert resp.status_code == 403, f"plain member could {label}: {resp.status_code}"

    # and the AI toggle really did not move
    assert (await client.get(f"{b}/settings", headers=h)).json()["ai_classification_enabled"] is False

    # Organization exposes the same capability read for its UI to gate on.
    org = f"/api/v1/workspaces/{ws}/organization/my-permissions"
    assert (await client.get(org, headers=h)).json()["can_manage"] is False
    assert (await client.get(org, headers=tenants["admin"])).json()["can_manage"] is True


@pytest.mark.asyncio
async def test_view_permission_gates_the_module(client, tenants):
    """``can_view_*`` has to be enforced somewhere to mean anything.

    Both permissions were in the catalog and advertised by ``app_definitions``
    from day one, but nothing checked them — so revoking someone's Service Desk
    access had no effect at all. The revocation is per-module: this member keeps
    Organization and loses only the desk.
    """
    ws, h = tenants["ws_a"], tenants["viewer"]

    assert (await client.get(f"/api/v1/workspaces/{ws}/organization/departments", headers=h)).status_code == 200

    for path in ("/tickets", "/dashboard", "/accounts", "/settings"):
        r = await client.get(_sd(ws) + path, headers=h)
        assert r.status_code == 403, f"revoked member reached service desk {path}: {r.status_code}"

    # an ordinary member with no override is unaffected
    assert (await client.get(_sd(ws) + "/tickets", headers=tenants["plain"])).status_code == 200


@pytest.mark.asyncio
async def test_settings_reports_how_wide_the_callers_view_is(client, tenants):
    """An empty ticket list is ambiguous; ``scope`` disambiguates it.

    Without this the UI cannot tell a quiet day apart from "you were never added
    to a department, so no ticket can ever match" — which is the state every new
    joiner is in.
    """
    ws = tenants["ws_a"]
    b = _sd(ws)

    assert (await client.get(f"{b}/settings", headers=tenants["admin"])).json()["scope"] == "all"
    # in the sales department → sees the sales queue
    assert (await client.get(f"{b}/settings", headers=tenants["sales"])).json()["scope"] == "function"
    # a member of no department → nothing can match
    assert (await client.get(f"{b}/settings", headers=tenants["plain"])).json()["scope"] == "none"
    assert (await client.get(f"{b}/tickets", headers=tenants["plain"])).json() == []


@pytest.mark.asyncio
async def test_ops_can_change_the_working_hours_the_clock_runs_on(client, tenants):
    """The breach clock's shift must be reachable from the API, not just the DB.

    It was configurable in ``load_clock`` before it was settable anywhere, which
    made "override it per workspace" true only for whoever could edit JSONB by
    hand.
    """
    ws = tenants["ws_a"]
    b = _sd(ws)
    admin, plain = tenants["admin"], tenants["plain"]

    # the defaults are reported, not blanks
    before = (await client.get(f"{b}/settings", headers=admin)).json()
    assert (before["working_hours_start"], before["working_hours_end"]) == ("09:30", "18:30")

    r = await client.patch(f"{b}/settings", headers=admin, json={
        "working_hours_start": "10:00", "working_hours_end": "19:00",
    })
    assert r.status_code == 200, r.text
    assert (r.json()["working_hours_start"], r.json()["working_hours_end"]) == ("10:00", "19:00")
    after = (await client.get(f"{b}/settings", headers=admin)).json()
    assert (after["working_hours_start"], after["working_hours_end"]) == ("10:00", "19:00")

    # patch semantics: touching the AI toggle must not wipe the hours
    assert (await client.patch(f"{b}/settings", headers=admin,
                               json={"ai_classification_enabled": True})).status_code == 200
    kept = (await client.get(f"{b}/settings", headers=admin)).json()
    assert (kept["working_hours_start"], kept["working_hours_end"]) == ("10:00", "19:00")
    assert kept["ai_classification_enabled"] is True

    # an inverted window is refused, both as a pair and one field at a time
    assert (await client.patch(f"{b}/settings", headers=admin, json={
        "working_hours_start": "19:00", "working_hours_end": "09:00",
    })).status_code == 422
    assert (await client.patch(f"{b}/settings", headers=admin,
                               json={"working_hours_start": "20:00"})).status_code == 400
    assert (await client.patch(f"{b}/settings", headers=admin,
                               json={"working_hours_end": "25:99"})).status_code == 422

    # ...and the refusals changed nothing
    unchanged = (await client.get(f"{b}/settings", headers=admin)).json()
    assert (unchanged["working_hours_start"], unchanged["working_hours_end"]) == ("10:00", "19:00")

    # a plain member cannot move the SLA clock
    assert (await client.patch(f"{b}/settings", headers=plain, json={
        "working_hours_start": "00:00", "working_hours_end": "23:59",
    })).status_code == 403


@pytest.mark.asyncio
async def test_manager_can_run_and_clear_a_short_test_sla_but_member_cannot(client, tenants):
    ws = tenants["ws_a"]
    b = _sd(ws)
    admin, plain = tenants["admin"], tenants["plain"]
    test_sla = {
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat(),
        "kam": {"amber_minutes": 5, "red_minutes": 10},
        "insurer": {"amber_minutes": 6, "red_minutes": 12},
        "partner": {"amber_minutes": 7, "red_minutes": 14},
    }

    denied = await client.patch(f"{b}/settings", headers=plain, json={"test_sla": test_sla})
    assert denied.status_code == 403

    started = await client.patch(f"{b}/settings", headers=admin, json={"test_sla": test_sla})
    assert started.status_code == 200, started.text
    assert started.json()["test_sla"]["kam"] == {"amber_minutes": 5, "red_minutes": 10}

    cleared = await client.patch(f"{b}/settings", headers=admin, json={"clear_test_sla": True})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["test_sla"] is None


@pytest.mark.asyncio
async def test_row_scope_applies_to_by_id_paths_not_just_the_list(
    client, db_session, tenants, seeded_ticket
):
    """A sales-scoped member sees only sales tickets — including by id."""
    ws = tenants["ws_a"]
    h_sales, h_admin = tenants["sales"], tenants["admin"]
    b = _sd(ws)
    primary = await db_session.get(Ticket, seeded_ticket)
    primary.field_values = {
        **primary.field_values,
        "detected_issues": [
            {
                "summary": "Keep this request on the primary",
                "request_type": "claims",
                "product": None,
                "confidence": 0.9,
                "split_reason": None,
            },
            {
                "summary": "Create a separate payout request",
                "request_type": "payout",
                "product": None,
                "confidence": 0.9,
                "split_reason": "Separate finance workflow",
            },
        ],
    }
    await db_session.commit()

    # The seeded ticket is pending with kam, so it is out of scope for sales.
    assert (await client.get(f"{b}/tickets", headers=h_sales)).json() == []
    assert (await client.get(f"{b}/tickets/{seeded_ticket}", headers=h_sales)).status_code == 404
    assert (await client.patch(f"{b}/tickets/{seeded_ticket}/pending-with", headers=h_sales,
                               json={"pending_with": "closed"})).status_code == 404
    assert (await client.patch(f"{b}/tickets/{seeded_ticket}", headers=h_sales,
                               json={"request_type": "payout"})).status_code == 404
    assert (await client.post(f"{b}/tickets/{seeded_ticket}/convert-to-task", headers=h_sales,
                              json={"project_id": str(uuid4())})).status_code == 404
    assert (await client.post(f"{b}/tickets/{seeded_ticket}/split", headers=h_sales,
                              json={"issue_indexes": [2]})).status_code == 404
    assert len((await client.get(f"{b}/tickets", headers=h_admin)).json()) == 1

    # Once the admin hands it to sales, it becomes visible to them.
    assert (await client.patch(f"{b}/tickets/{seeded_ticket}/pending-with", headers=h_admin,
                              json={"pending_with": "sales"})).status_code == 200
    assert (await client.get(f"{b}/tickets/{seeded_ticket}", headers=h_sales)).status_code == 200
    assert [t["ticket_id"] for t in (await client.get(f"{b}/tickets", headers=h_sales)).json()] == [seeded_ticket]
    split = await client.post(
        f"{b}/tickets/{seeded_ticket}/split", headers=h_sales, json={"issue_indexes": [2]}
    )
    assert split.status_code == 200, split.text
    assert len(split.json()["created_ticket_ids"]) == 1


@pytest.mark.asyncio
async def test_convert_to_task_rejects_a_project_from_another_workspace(client, tenants, seeded_ticket):
    """project_id lands on SprintTask.team_id, so it must be validated."""
    ws, h = tenants["ws_a"], tenants["admin"]
    b = _sd(ws)

    r = await client.post(f"{b}/tickets/{seeded_ticket}/convert-to-task", headers=h,
                          json={"project_id": str(uuid4())})
    assert r.status_code == 404, r.text

    # a real project in this workspace works
    proj = await client.post(f"/api/v1/workspaces/{ws}/projects", headers=h, json={"name": "Ops Followups"})
    assert proj.status_code == 201, proj.text
    ok = await client.post(f"{b}/tickets/{seeded_ticket}/convert-to-task", headers=h,
                           json={"project_id": proj.json()["id"]})
    assert ok.status_code == 200 and ok.json()["linked"] is True


@pytest.mark.asyncio
async def test_master_data_ids_must_belong_to_the_workspace(client, tenants, seeded_ticket):
    """A account/Product id from elsewhere must not be attachable to our ticket."""
    ws, h = tenants["ws_a"], tenants["admin"]
    b = _sd(ws)

    r = await client.patch(f"{b}/tickets/{seeded_ticket}", headers=h, json={"account_id": str(uuid4())})
    assert r.status_code == 404, r.text
    r = await client.patch(f"{b}/tickets/{seeded_ticket}", headers=h, json={"product_id": str(uuid4())})
    assert r.status_code == 404, r.text
    r = await client.post(f"{b}/tickets/manual", headers=h,
                          json={"subject": "x", "request_type": "query", "account_id": str(uuid4())})
    assert r.status_code == 404, r.text


@pytest.mark.asyncio
async def test_manual_logging_is_kam_or_manager_work(client, tenants, db_session):
    """Visibility is not authority on the create path either: a view-only Ops
    Lead (and a plain viewer) gets 403, while a KAM — a plain member placed in
    the Operations-KAM function — gets 201. Managers are covered by the admin
    in ``seeded_ticket``."""
    ws = tenants["ws_a"]

    kam = await _developer(db_session, "kam-member")
    db_session.add(WorkspaceMember(workspace_id=ws, developer_id=kam.id, role="member", status="active"))
    dept = Department(
        id=str(uuid4()), workspace_id=ws, name="Operations-KAM",
        slug=f"ops-kam-{uuid4().hex[:6]}", function_key="ops_kam", path="/ops_kam/", depth=0,
    )
    db_session.add(dept)
    await db_session.flush()
    db_session.add(
        DepartmentMember(id=str(uuid4()), workspace_id=ws, department_id=dept.id, developer_id=kam.id)
    )
    lead = await _developer(db_session, "lead-member")
    db_session.add(
        WorkspaceMember(
            workspace_id=ws, developer_id=lead.id, role="member", status="active",
            permission_overrides={"can_view_all_service_desk": True},
        )
    )
    await db_session.commit()

    payload = {"subject": "phoned in", "request_type": "query"}
    r = await client.post(_sd(ws) + "/tickets/manual", headers=_auth(lead.id), json=payload)
    assert r.status_code == 403, r.text
    r = await client.post(_sd(ws) + "/tickets/manual", headers=tenants["plain"], json=payload)
    assert r.status_code == 403, r.text
    r = await client.post(_sd(ws) + "/tickets/manual", headers=_auth(kam.id), json=payload)
    assert r.status_code == 201, r.text
