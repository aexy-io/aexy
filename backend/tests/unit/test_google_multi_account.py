"""Several Google accounts in one workspace.

`google_integrations.workspace_id` was UNIQUE, so a workspace had exactly one
Google account and `connect-from-developer` *overwrote* — the second person to
connect silently replaced the first, and their mailbox stopped syncing with no
sign. These pin the replacement: one row per address, a lookup that resolves
rather than raises, and the two places that used to assume a singleton.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.google_integration import get_integration, list_integrations
from aexy.models.developer import Developer
from aexy.models.google_integration import GoogleIntegration
from aexy.models.workspace import Workspace, WorkspaceMember


def _uniq(tag: str) -> str:
    return f"{tag}-{uuid4().hex[:8]}"


async def _developer(db: AsyncSession, tag: str) -> Developer:
    dev = Developer(name=f"Dev {tag}", email=f"{_uniq(tag)}@example.test")
    db.add(dev)
    await db.flush()
    return dev


async def _workspace(db: AsyncSession, owner: Developer) -> Workspace:
    ws = Workspace(
        id=str(uuid4()), name=_uniq("ws"), slug=_uniq("ws"), owner_id=owner.id
    )
    db.add(ws)
    await db.flush()
    db.add(
        WorkspaceMember(
            workspace_id=ws.id, developer_id=owner.id, role="owner", status="active"
        )
    )
    await db.flush()
    return ws


async def _account(
    db: AsyncSession,
    ws: Workspace,
    email: str,
    owner: Developer | None = None,
    created_at: datetime | None = None,
) -> GoogleIntegration:
    integration = GoogleIntegration(
        id=str(uuid4()),
        workspace_id=ws.id,
        connected_by_id=str(owner.id) if owner else None,
        google_email=email,
        access_token="tok",
        refresh_token="ref",
        token_expiry=datetime.now(timezone.utc) + timedelta(hours=1),
        gmail_sync_enabled=True,
        is_active=True,
    )
    if created_at is not None:
        integration.created_at = created_at
    db.add(integration)
    await db.flush()
    return integration


# ── the constraint ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_workspace_can_hold_several_accounts(db_session: AsyncSession):
    """The whole point. This raised an IntegrityError before."""
    owner = await _developer(db_session, "multi-owner")
    ws = await _workspace(db_session, owner)

    await _account(db_session, ws, "ops@acme.test")
    await _account(db_session, ws, "sales@acme.test")

    assert len(await list_integrations(str(ws.id), db_session)) == 2


@pytest.mark.asyncio
async def test_the_same_address_cannot_be_connected_twice(db_session: AsyncSession):
    """Two rows for one inbox would mean two cursors fighting over it."""
    owner = await _developer(db_session, "dupe-owner")
    ws = await _workspace(db_session, owner)
    await _account(db_session, ws, "ops@acme.test")

    with pytest.raises(IntegrityError):
        await _account(db_session, ws, "ops@acme.test")


@pytest.mark.asyncio
async def test_two_workspaces_may_each_connect_the_same_address(
    db_session: AsyncSession,
):
    """Uniqueness is per workspace — a consultant's mailbox in two workspaces
    is a real arrangement, unlike the same one twice in one."""
    a_owner = await _developer(db_session, "wsa")
    b_owner = await _developer(db_session, "wsb")
    a = await _workspace(db_session, a_owner)
    b = await _workspace(db_session, b_owner)

    await _account(db_session, a, "shared@acme.test")
    await _account(db_session, b, "shared@acme.test")

    assert len(await list_integrations(str(a.id), db_session)) == 1
    assert len(await list_integrations(str(b.id), db_session)) == 1


# ── resolving which account a request means ──────────────────────────────


@pytest.mark.asyncio
async def test_a_second_account_no_longer_makes_the_lookup_raise(
    db_session: AsyncSession,
):
    """`get_integration` ended in `scalar_one_or_none()`, which raises
    MultipleResultsFound the moment a second row exists — so it had to be
    replaced before the constraint was dropped, not after."""
    owner = await _developer(db_session, "resolve-owner")
    ws = await _workspace(db_session, owner)
    await _account(db_session, ws, "first@acme.test")
    await _account(db_session, ws, "second@acme.test")

    resolved = await get_integration(str(ws.id), db_session)
    assert resolved is not None


@pytest.mark.asyncio
async def test_an_explicit_id_wins(db_session: AsyncSession):
    owner = await _developer(db_session, "byid-owner")
    ws = await _workspace(db_session, owner)
    await _account(db_session, ws, "first@acme.test")
    wanted = await _account(db_session, ws, "second@acme.test")

    resolved = await get_integration(
        str(ws.id), db_session, integration_id=str(wanted.id)
    )
    assert str(resolved.id) == str(wanted.id)


@pytest.mark.asyncio
async def test_another_workspaces_account_is_a_404_not_a_leak(
    db_session: AsyncSession,
):
    victim_owner = await _developer(db_session, "victim")
    other_owner = await _developer(db_session, "other")
    victim = await _workspace(db_session, victim_owner)
    other = await _workspace(db_session, other_owner)
    theirs = await _account(db_session, victim, "private@victim.test")

    with pytest.raises(HTTPException) as exc:
        await get_integration(
            str(other.id), db_session, integration_id=str(theirs.id)
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_your_own_account_is_preferred_over_a_colleagues(
    db_session: AsyncSession,
):
    """Somebody who has connected their mailbox means *theirs* by default. The
    alternative is quietly acting on a colleague's inbox."""
    colleague = await _developer(db_session, "colleague")
    me = await _developer(db_session, "me")
    ws = await _workspace(db_session, colleague)
    await _account(db_session, ws, "colleague@acme.test", owner=colleague)
    mine = await _account(db_session, ws, "mine@acme.test", owner=me)

    resolved = await get_integration(
        str(ws.id), db_session, prefer_developer_id=str(me.id)
    )
    assert str(resolved.id) == str(mine.id)


@pytest.mark.asyncio
async def test_without_an_account_of_your_own_the_oldest_answers(
    db_session: AsyncSession,
):
    """What a single-account workspace has always returned, so nothing changes
    for the workspaces that have one."""
    owner = await _developer(db_session, "oldest-owner")
    stranger = await _developer(db_session, "stranger")
    ws = await _workspace(db_session, owner)

    older = await _account(
        db_session,
        ws,
        "older@acme.test",
        owner=owner,
        created_at=datetime.now(timezone.utc) - timedelta(days=2),
    )
    await _account(
        db_session,
        ws,
        "newer@acme.test",
        owner=owner,
        created_at=datetime.now(timezone.utc),
    )

    resolved = await get_integration(
        str(ws.id), db_session, prefer_developer_id=str(stranger.id)
    )
    assert str(resolved.id) == str(older.id)


@pytest.mark.asyncio
async def test_no_accounts_still_raises_the_familiar_404(db_session: AsyncSession):
    owner = await _developer(db_session, "empty-owner")
    ws = await _workspace(db_session, owner)

    with pytest.raises(HTTPException) as exc:
        await get_integration(str(ws.id), db_session)
    assert exc.value.status_code == 404

    assert await get_integration(str(ws.id), db_session, required=False) is None


@pytest.mark.asyncio
async def test_listing_is_stable_across_calls(db_session: AsyncSession):
    """Rows written in one transaction can share a `created_at`, so id breaks
    the tie — otherwise "the workspace's account" would vary between requests.
    """
    owner = await _developer(db_session, "stable-owner")
    ws = await _workspace(db_session, owner)
    same_moment = datetime.now(timezone.utc)
    await _account(db_session, ws, "a@acme.test", created_at=same_moment)
    await _account(db_session, ws, "b@acme.test", created_at=same_moment)

    first = [str(i.id) for i in await list_integrations(str(ws.id), db_session)]
    second = [str(i.id) for i in await list_integrations(str(ws.id), db_session)]
    assert first == second


# ── disconnecting ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_the_workspace_disconnect_still_works_with_one_account(
    db_session: AsyncSession,
):
    """Nothing changes for the workspaces that have one, which is most."""
    from aexy.api.google_integration import disconnect

    owner = await _developer(db_session, "solo-owner")
    ws = await _workspace(db_session, owner)
    await _account(db_session, ws, "only@acme.test", owner=owner)

    await disconnect(str(ws.id), owner, db_session)
    assert await list_integrations(str(ws.id), db_session) == []


@pytest.mark.asyncio
async def test_the_workspace_disconnect_refuses_to_guess(db_session: AsyncSession):
    """It resolved "the" integration through a lookup that returns the caller's
    own account or the oldest, so with several it deleted one arbitrary
    person's connection. Deleting all of them instead is a different arbitrary:
    one button should not unplug colleagues the request never mentions.
    """
    from aexy.api.google_integration import disconnect

    owner = await _developer(db_session, "many-owner")
    colleague = await _developer(db_session, "many-colleague")
    ws = await _workspace(db_session, owner)
    await _account(db_session, ws, "mine@acme.test", owner=owner)
    await _account(db_session, ws, "theirs@acme.test", owner=colleague)

    with pytest.raises(HTTPException) as exc:
        await disconnect(str(ws.id), owner, db_session)

    assert exc.value.status_code == 409
    # Names them, so the caller knows what they are choosing between.
    assert "mine@acme.test" in exc.value.detail
    assert "theirs@acme.test" in exc.value.detail
    # And nothing was removed on the way to refusing.
    assert len(await list_integrations(str(ws.id), db_session)) == 2


# ── the migration ────────────────────────────────────────────────────────


def test_the_migration_discovers_the_unique_it_drops():
    """The first version of this migration was a no-op that reported success.

    It dropped the *constraint* and two invented index names. The real one was
    `ix_google_integrations_workspace_id` — a unique **index**, which SQLAlchemy
    created because the column carried both `unique=True` and `index=True`, and
    which no `DROP CONSTRAINT` touches. Migrations ran green, and inserting a
    second account still raised UniqueViolationError.

    So the SQL must look the unique up rather than name it. Guarding the shape
    here because the failure mode is a migration that says "Successful: 1".
    """
    from pathlib import Path

    sql = (
        Path(__file__).resolve().parents[2] / "scripts" / "migrate_google_multi_account.sql"
    ).read_text()

    # Constraints and standalone indexes are different objects; dropping only
    # the first is exactly the bug.
    assert "pg_constraint" in sql
    assert "pg_index" in sql
    assert "indisunique" in sql
    # Discovered, never hardcoded.
    assert "DROP INDEX IF EXISTS google_integrations_workspace_id_key" not in sql
