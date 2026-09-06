"""The workspace app toggle is enforced on the API, not only in the sidebar.

`require_app_access` has done both halves of the check for a while — the
workspace-wide toggle and the caller's own access — but a router that never
mounts it is not checked at all, and four modules did not mount it: leave,
chat, GTM and booking. Their APIs answered for a workspace that had switched
the module off, which made "disabled" a navigation preference.

What this file pins is the property, not the plumbing: **turning a module off
makes its API say no** — to an ordinary member and to the owner alike, because
"this workspace does not use this module" has to beat administrator reach.

The public halves are deliberately absent from these tests. A booking page or
an RSVP link is reached by somebody with no account and no workspace to check a
toggle against; gating those would break the feature rather than protect it.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from jose import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember

settings = get_settings()


def _auth(developer_id: str) -> dict:
    payload = {
        "sub": developer_id,
        "type": "access",
        "exp": datetime.now(timezone.utc).timestamp() + 1800,
    }
    return {
        "Authorization": (
            f"Bearer {jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)}"
        )
    }


async def _developer(db: AsyncSession, label: str) -> Developer:
    dev = Developer(
        id=str(uuid4()), email=f"{label}-{uuid4().hex[:6]}@example.com", name=label
    )
    db.add(dev)
    await db.flush()
    return dev


#: (app id, a GET under that app's router that exists on a bare workspace).
#: One per module that gained a guard, because the guard is mounted per router
#: and a fifth module added later gets no protection from a test of the first
#: four.
GUARDED = [
    ("leave", "leave/types"),
    ("chat", "chat/channels"),
    ("gtm", "gtm/abm/lists"),
    ("booking", "booking/event-types"),
    ("email_marketing", "email-infrastructure/providers"),
    ("compliance", "reminders/dashboard/stats"),
    ("forms", "visual-builder/blocks"),
    ("reports", "reports"),
    # Not knowledge-graph: it is plan-gated as well as app-gated, and answers
    # 403 "Enterprise feature" on a bare workspace — so the enabled half of
    # this test cannot tell the two refusals apart. The router carries the docs
    # guard; the ledger test below is what keeps it that way.
]


@pytest_asyncio.fixture
async def workspace(db_session: AsyncSession):
    owner = await _developer(db_session, "owner")
    member = await _developer(db_session, "member")

    ws = Workspace(
        id=str(uuid4()), name="Guarded", slug=f"guarded-{uuid4().hex[:6]}", owner_id=owner.id
    )
    db_session.add(ws)
    await db_session.flush()

    for dev, role in ((owner, "owner"), (member, "member")):
        db_session.add(
            WorkspaceMember(
                workspace_id=ws.id, developer_id=dev.id, role=role, status="active"
            )
        )
    await db_session.commit()
    return {"id": ws.id, "owner": owner, "member": member}


@pytest.mark.asyncio
@pytest.mark.parametrize("app_id,path", GUARDED)
async def test_disabling_a_module_closes_its_api(client, workspace, app_id, path):
    """The property this exists for: off means off, for everybody."""
    ws_id = workspace["id"]
    url = f"/api/v1/workspaces/{ws_id}/{path}"

    # Enabled (the default is "no setting", which means enabled) — the guard
    # must not be denying anybody yet, or a later 403 proves nothing.
    for who in ("owner", "member"):
        before = await client.get(url, headers=_auth(workspace[who].id))
        assert before.status_code != 403, (
            f"{app_id} refused {who} while enabled: {before.status_code} {before.text[:200]}"
        )
        # A path that does not exist answers 404 before any dependency runs, so
        # a typo here would sail through the check above and fail below for a
        # reason that has nothing to do with gating. Which is how the first
        # version of this test was written.
        assert before.status_code != 404, f"{app_id}: {url} is not a route"

    off = await client.patch(
        f"/api/v1/workspaces/{ws_id}/apps",
        headers=_auth(workspace["owner"].id),
        json={"apps": {app_id: False}},
    )
    assert off.status_code == 200, off.text

    # The owner too. Administrator reach is deliberate for an app somebody's
    # own profile hides, and deliberately does not extend to one the workspace
    # has switched off.
    for who in ("owner", "member"):
        after = await client.get(url, headers=_auth(workspace[who].id))
        assert after.status_code == 403, (
            f"{app_id} still answered {who} while disabled: {after.status_code}"
        )
        assert "disabled" in after.json()["detail"].lower()


@pytest.mark.asyncio
async def test_a_disabled_module_does_not_close_its_neighbour(client, workspace):
    """Scoped to the app that was switched off, and no wider.

    A guard mounted on the wrong router is invisible until somebody disables an
    unrelated module and loses a working one.
    """
    ws_id = workspace["id"]
    headers = _auth(workspace["owner"].id)

    off = await client.patch(
        f"/api/v1/workspaces/{ws_id}/apps", headers=headers, json={"apps": {"leave": False}}
    )
    assert off.status_code == 200, off.text

    assert (
        await client.get(f"/api/v1/workspaces/{ws_id}/leave/types", headers=headers)
    ).status_code == 403
    assert (
        await client.get(f"/api/v1/workspaces/{ws_id}/chat/channels", headers=headers)
    ).status_code != 403


def test_the_chat_socket_is_not_behind_an_http_dependency():
    """The websocket must not carry `require_app_access`.

    Router-level dependencies apply to websocket routes as well as HTTP ones,
    and the first thing this one does is read an `Authorization` header. A
    browser cannot set headers on a WebSocket handshake — the chat socket
    authenticates with a `token` query parameter — so mounting the guard across
    the whole router did not deny connections, it crashed them:
    `HTTPBearer.__call__() missing 1 required positional argument`, a 500 at
    handshake, for every user whether or not chat was enabled.

    Asserted against the built app rather than the source, because the mistake
    is made at mount time and looks perfectly reasonable in the file.
    """
    from aexy.main import app

    sockets = [
        r for r in app.routes if r.path.endswith("/chat/ws")
    ]
    assert sockets, "the chat websocket route is missing"
    for route in sockets:
        names = [d.dependency.__name__ for d in getattr(route, "dependencies", [])]
        assert not any("guard" in n or "app_access" in n for n in names), (
            f"{route.path} carries an HTTP auth dependency: {names}"
        )


def test_the_unguarded_surface_is_declared_rather_than_discovered():
    """A ledger of workspace-scoped routes that no app guard covers.

    Most of them should not be covered: workspace administration has to keep
    working whatever modules are switched off — members, invites, roles,
    billing, the app toggles themselves — and a person locked out of
    `/app-access` cannot ask for access back.

    The number is here so the *rest* stays visible. It went down as routers
    were mounted behind their module's guard, and a new workspace-scoped router
    added without one pushes it back up, which fails this test and asks the
    author to decide rather than to drift.
    """
    from aexy.main import app

    unguarded = 0
    for route in app.routes:
        path = getattr(route, "path", "")
        if "{workspace_id}/" not in path:
            continue
        names = [
            getattr(d.dependency, "__name__", "")
            for d in getattr(route, "dependencies", [])
        ]
        if not any(n == "_guard" for n in names):
            unguarded += 1

    # Raise this only with a reason, and lower it whenever a router moves
    # behind its module.
    #
    # 282 -> 290 (0.37.0, agent operations over MCP). Eight routes, each one a
    # deliberate answer rather than an oversight:
    #
    #   * six on `agent-principals`. A principal is an identity holding a live
    #     token; switching the agents app off must not strand one with no admin
    #     screen to revoke it from. Ungated for the same reason members and
    #     roles are — and admin-checked per endpoint, and absent from the MCP
    #     catalogue entirely.
    #   * `agent-actions/activity` and `agent-actions/mine`, which join the
    #     already-ungated approval queue: a workspace has to be able to read
    #     and decide what an agent asked to do in it whatever it has switched
    #     on, and an agent told "this is waiting" has to be able to learn the
    #     outcome.
    #
    # The same change added nine routes that ARE gated: agent schedules behind
    # `agents`, and `crm/outreach/*` behind `crm`.
    assert unguarded <= 290, (
        f"{unguarded} workspace-scoped routes carry no app guard, up from 290. "
        "A new router needs either `require_app_access(<app>)` or a note here "
        "saying why it must answer for a workspace that switched the module off."
    )


@pytest.mark.asyncio
async def test_a_report_belongs_to_one_workspace(client, workspace, db_session):
    """Reports were the module with no tenant at all.

    They scoped by creator, and a report marked public was readable by anybody
    holding its id — in any workspace — because the field that check would have
    used (`organization_id`) was never written by a single caller. Now the
    workspace is in the path and in every query.
    """
    owner = workspace["owner"]
    other = Workspace(
        id=str(uuid4()), name="Elsewhere", slug=f"elsewhere-{uuid4().hex[:6]}", owner_id=owner.id
    )
    db_session.add(other)
    await db_session.flush()
    db_session.add(
        WorkspaceMember(
            workspace_id=other.id, developer_id=owner.id, role="owner", status="active"
        )
    )
    await db_session.commit()

    created = await client.post(
        f"/api/v1/workspaces/{workspace['id']}/reports",
        headers=_auth(owner.id),
        json={
            "name": "Quarterly",
            "widgets": [
                {
                    "id": "w1",
                    "type": "bar_chart",
                    "title": "Commits",
                    "metric": "commits",
                }
            ],
            "is_public": True,
        },
    )
    assert created.status_code == 201, created.text
    report_id = created.json()["id"]

    # The same person, the same report id, a workspace it does not belong to.
    # `is_public` is set precisely because that was the flag that used to make
    # this readable.
    from_elsewhere = await client.get(
        f"/api/v1/workspaces/{other.id}/reports/{report_id}", headers=_auth(owner.id)
    )
    assert from_elsewhere.status_code == 404, from_elsewhere.text

    listed = await client.get(
        f"/api/v1/workspaces/{other.id}/reports", headers=_auth(owner.id)
    )
    assert listed.status_code == 200
    assert all(r["id"] != report_id for r in listed.json())


@pytest.mark.asyncio
async def test_a_shared_report_is_shared_with_its_workspace(
    client, workspace, db_session
):
    """`is_public` means public *to the workspace*, and the listing says so.

    It used to mean nothing at all: the branch that surfaced a shared report
    keyed on `organization_id`, which no caller ever wrote, so a colleague's
    shared report was invisible in the list while `get_report` returned it
    quite happily by id. Two answers to the same question.
    """
    owner, member = workspace["owner"], workspace["member"]

    created = await client.post(
        f"/api/v1/workspaces/{workspace['id']}/reports",
        headers=_auth(owner.id),
        json={
            "name": "Shared with the team",
            "widgets": [
                {"id": "w1", "type": "bar_chart", "title": "Commits", "metric": "commits"}
            ],
            "is_public": True,
        },
    )
    assert created.status_code == 201, created.text
    report_id = created.json()["id"]

    listed = await client.get(
        f"/api/v1/workspaces/{workspace['id']}/reports", headers=_auth(member.id)
    )
    assert listed.status_code == 200
    assert any(r["id"] == report_id for r in listed.json()), (
        "a shared report did not appear in a colleague's listing"
    )

    # And the two paths agree: what the list shows, the detail returns.
    detail = await client.get(
        f"/api/v1/workspaces/{workspace['id']}/reports/{report_id}",
        headers=_auth(member.id),
    )
    assert detail.status_code == 200


@pytest.mark.asyncio
async def test_schedules_do_not_leak_across_workspaces(client, workspace, db_session):
    """A schedule carries its recipients, and had no tenant of its own.

    Listing them was unfiltered — every workspace's delivery lists, to anybody
    authenticated — and update/delete resolved a schedule by id with no
    ownership check at all, so somebody could point another workspace's
    scheduled report at their own address. A schedule borrows its report's
    workspace; these paths now join through it.
    """
    owner = workspace["owner"]
    other = Workspace(
        id=str(uuid4()), name="Nextdoor", slug=f"nextdoor-{uuid4().hex[:6]}", owner_id=owner.id
    )
    db_session.add(other)
    await db_session.flush()
    db_session.add(
        WorkspaceMember(
            workspace_id=other.id, developer_id=owner.id, role="owner", status="active"
        )
    )
    await db_session.commit()

    report = await client.post(
        f"/api/v1/workspaces/{workspace['id']}/reports",
        headers=_auth(owner.id),
        json={
            "name": "Weekly numbers",
            "widgets": [
                {"id": "w1", "type": "bar_chart", "title": "Commits", "metric": "commits"}
            ],
        },
    )
    assert report.status_code == 201, report.text
    report_id = report.json()["id"]

    made = await client.post(
        f"/api/v1/workspaces/{workspace['id']}/reports/{report_id}/schedules",
        headers=_auth(owner.id),
        json={
            # The body carries the report id as well as the path: the schema
            # requires it, and the endpoint uses the path one.
            "report_id": report_id,
            "schedule": "weekly",
            "time_utc": "09:00",
            "day_of_week": 1,
            "recipients": ["board@example.com"],
            "delivery_method": "email",
            "export_format": "pdf",
        },
    )
    assert made.status_code == 201, made.text
    schedule_id = made.json()["id"]

    from_here = await client.get(
        f"/api/v1/workspaces/{workspace['id']}/reports/schedules/list",
        headers=_auth(owner.id),
    )
    assert from_here.status_code == 200
    assert any(s["id"] == schedule_id for s in from_here.json())

    # The same person, a workspace the schedule's report does not belong to.
    from_elsewhere = await client.get(
        f"/api/v1/workspaces/{other.id}/reports/schedules/list", headers=_auth(owner.id)
    )
    assert from_elsewhere.status_code == 200
    assert all(s["id"] != schedule_id for s in from_elsewhere.json()), (
        "another workspace's delivery list is readable, recipients included"
    )

    # And it cannot be redirected from there either.
    hijack = await client.put(
        f"/api/v1/workspaces/{other.id}/reports/schedules/{schedule_id}",
        headers=_auth(owner.id),
        json={"recipients": ["attacker@example.com"]},
    )
    assert hijack.status_code == 404, hijack.text


@pytest.mark.asyncio
async def test_a_cloned_report_stays_in_its_workspace(client, workspace):
    """A clone with no workspace is a report that vanishes as it is made.

    `clone_report` copied the original's fields and not its workspace, so the
    copy landed with `workspace_id` null: absent from the listing, 404 by id,
    reachable by nobody. The button reported success either way.
    """
    owner = workspace["owner"]
    made = await client.post(
        f"/api/v1/workspaces/{workspace['id']}/reports",
        headers=_auth(owner.id),
        json={
            "name": "Original",
            "widgets": [
                {"id": "w1", "type": "bar_chart", "title": "Commits", "metric": "commits"}
            ],
        },
    )
    assert made.status_code == 201, made.text

    cloned = await client.post(
        f"/api/v1/workspaces/{workspace['id']}/reports/{made.json()['id']}/clone",
        headers=_auth(owner.id),
        params={"new_name": "Copy"},
    )
    assert cloned.status_code == 200, cloned.text
    clone_id = cloned.json()["id"]

    listed = await client.get(
        f"/api/v1/workspaces/{workspace['id']}/reports", headers=_auth(owner.id)
    )
    assert any(r["id"] == clone_id for r in listed.json()), (
        "the clone is not in the workspace it was cloned from"
    )
    fetched = await client.get(
        f"/api/v1/workspaces/{workspace['id']}/reports/{clone_id}",
        headers=_auth(owner.id),
    )
    assert fetched.status_code == 200
