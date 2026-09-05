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
