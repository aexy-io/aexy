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
    assert unguarded <= 282, (
        f"{unguarded} workspace-scoped routes carry no app guard, up from 282. "
        "A new router needs either `require_app_access(<app>)` or a note here "
        "saying why it must answer for a workspace that switched the module off."
    )
