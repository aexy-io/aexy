"""The feedback board: who can see what, and who can act on it.

Three rules carry the design and each is easy to break by accident. The board is
shared across workspaces — that is what makes voting mean anything — so it must
never carry an author or a workspace on a row. Voting is once per person, and is
the one thing here worth gaming. And triage belongs to platform admins, not to
the workspace admin who happens to be looking.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import AsyncClient
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
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)
    return {"Authorization": f"Bearer {token}"}


async def _member(db: AsyncSession, workspace_id: str, label: str, email: str | None = None):
    dev = Developer(
        id=str(uuid4()),
        email=email or f"{label}-{uuid4().hex[:6]}@example.com",
        name=label,
    )
    db.add(dev)
    await db.flush()
    db.add(
        WorkspaceMember(
            id=str(uuid4()),
            workspace_id=workspace_id,
            developer_id=dev.id,
            role="member",
            status="active",
        )
    )
    await db.flush()
    return dev


@pytest_asyncio.fixture
async def two_workspaces(db_session: AsyncSession, monkeypatch):
    """Two unrelated workspaces, and one platform admin by email."""
    owner = Developer(id=str(uuid4()), email=f"o-{uuid4().hex[:6]}@example.com", name="Owner")
    db_session.add(owner)
    await db_session.flush()

    acme = Workspace(id=str(uuid4()), name="Acme", slug=f"acme-{uuid4().hex[:6]}", owner_id=owner.id)
    globex = Workspace(
        id=str(uuid4()), name="Globex", slug=f"globex-{uuid4().hex[:6]}", owner_id=owner.id
    )
    db_session.add_all([acme, globex])
    await db_session.flush()

    ada = await _member(db_session, acme.id, "Ada")
    bob = await _member(db_session, globex.id, "Bob")
    admin = await _member(db_session, acme.id, "Platform admin", email="admin@aexy.io")
    await db_session.commit()

    # Platform admin is granted by email, so the test grants it the same way.
    monkeypatch.setattr(settings, "admin_emails", "admin@aexy.io")

    return {
        "acme": acme.id,
        "globex": globex.id,
        "ada": ada.id,
        "bob": bob.id,
        "ada_auth": _auth(ada.id),
        "bob_auth": _auth(bob.id),
        "admin_auth": _auth(admin.id),
    }


def _url(workspace_id: str) -> str:
    return f"/api/v1/workspaces/{workspace_id}/feedback"


@pytest.mark.asyncio
async def test_submitting_counts_as_your_own_first_vote(client: AsyncClient, two_workspaces):
    """A brand new item at zero votes looks unwanted next to a week-old one."""
    resp = await client.post(
        _url(two_workspaces["acme"]),
        headers=two_workspaces["ada_auth"],
        json={"kind": "suggestion", "subject": "Dark mode for reports", "body": "Please."},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["vote_count"] == 1
    assert body["voted"] is True
    assert body["mine"] is True
    assert body["status"] == "new"


@pytest.mark.asyncio
async def test_the_board_crosses_workspaces_but_names_nobody(client: AsyncClient, two_workspaces):
    """Ten teams asking for one thing should read as one item with a count.

    That only works if the board spans workspaces — and is only acceptable if a
    row carries no author and no workspace.
    """
    await client.post(
        _url(two_workspaces["acme"]),
        headers=two_workspaces["ada_auth"],
        json={"kind": "app_request", "subject": "Please enable Learning", "body": "We want it."},
    )

    seen = await client.get(_url(two_workspaces["globex"]), headers=two_workspaces["bob_auth"])
    assert seen.status_code == 200, seen.text
    items = seen.json()["items"]
    assert [i["subject"] for i in items] == ["Please enable Learning"]

    row = items[0]
    assert "developer_id" not in row and "workspace_id" not in row
    assert row["mine"] is False
    assert row["voted"] is False


@pytest.mark.asyncio
async def test_voting_is_once_per_person_and_reversible(client: AsyncClient, two_workspaces):
    created = await client.post(
        _url(two_workspaces["acme"]),
        headers=two_workspaces["ada_auth"],
        json={"kind": "suggestion", "subject": "Bulk edit tasks", "body": "One at a time is slow."},
    )
    feedback_id = created.json()["id"]
    globex = _url(two_workspaces["globex"])

    first = await client.post(f"{globex}/{feedback_id}/vote", headers=two_workspaces["bob_auth"])
    assert first.status_code == 200, first.text
    assert first.json()["vote_count"] == 2

    # Twice is still once.
    again = await client.post(f"{globex}/{feedback_id}/vote", headers=two_workspaces["bob_auth"])
    assert again.json()["vote_count"] == 2

    withdrawn = await client.delete(
        f"{globex}/{feedback_id}/vote", headers=two_workspaces["bob_auth"]
    )
    assert withdrawn.json() == {"feedback_id": feedback_id, "voted": False, "vote_count": 1}


@pytest.mark.asyncio
async def test_only_platform_admins_can_triage(client: AsyncClient, two_workspaces):
    created = await client.post(
        _url(two_workspaces["acme"]),
        headers=two_workspaces["ada_auth"],
        json={"kind": "problem", "subject": "Export times out", "body": "Every time."},
    )
    feedback_id = created.json()["id"]

    refused = await client.get("/api/v1/platform-admin/feedback", headers=two_workspaces["ada_auth"])
    assert refused.status_code == 403, refused.text

    listed = await client.get(
        "/api/v1/platform-admin/feedback", headers=two_workspaces["admin_auth"]
    )
    assert listed.status_code == 200, listed.text
    row = next(i for i in listed.json()["items"] if i["id"] == feedback_id)
    # The admin side is the one that knows who asked.
    assert row["workspace_name"] == "Acme"
    assert row["developer_name"] == "Ada"

    reviewed = await client.patch(
        f"/api/v1/platform-admin/feedback/{feedback_id}",
        headers=two_workspaces["admin_auth"],
        json={"status": "planned", "admin_note": "Next release"},
    )
    assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["status"] == "planned"
    assert reviewed.json()["admin_note"] == "Next release"


@pytest.mark.asyncio
async def test_declined_items_are_off_the_board_but_still_findable(
    client: AsyncClient, two_workspaces
):
    """An answer of no should be reachable without cluttering what is open."""
    created = await client.post(
        _url(two_workspaces["acme"]),
        headers=two_workspaces["ada_auth"],
        json={"kind": "suggestion", "subject": "Comic Sans theme", "body": "Trust me."},
    )
    feedback_id = created.json()["id"]
    await client.patch(
        f"/api/v1/platform-admin/feedback/{feedback_id}",
        headers=two_workspaces["admin_auth"],
        json={"status": "declined"},
    )

    board = await client.get(_url(two_workspaces["acme"]), headers=two_workspaces["ada_auth"])
    assert feedback_id not in [i["id"] for i in board.json()["items"]]

    asked_for = await client.get(
        f"{_url(two_workspaces['acme'])}?status=declined", headers=two_workspaces["ada_auth"]
    )
    assert feedback_id in [i["id"] for i in asked_for.json()["items"]]

    # And the author can always see their own, whatever became of it.
    mine = await client.get(f"{_url(two_workspaces['acme'])}/mine", headers=two_workspaces["ada_auth"])
    assert feedback_id in [i["id"] for i in mine.json()["items"]]


@pytest.mark.asyncio
async def test_a_non_member_cannot_reach_a_workspace_board(client: AsyncClient, two_workspaces):
    """The board is shared, but it is not public: the path still has to be yours."""
    resp = await client.get(_url(two_workspaces["globex"]), headers=two_workspaces["ada_auth"])
    assert resp.status_code == 404, resp.text
