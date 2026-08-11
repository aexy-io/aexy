"""Whose synced mail a workspace member can read.

Synced mail was workspace-wide, which was right while a workspace held exactly
one Google account — everyone saw the one shared mailbox, which is what
connecting it meant. Multi-account made "workspace-wide" and "the shared
mailbox" different things without anything noticing, so a second person
connecting their own inbox published it to every member.

These pin the replacement: your own accounts, team addresses a Service Desk
mailbox reads, and ownerless legacy rows — and nothing else.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.google_integration import (
    get_email,
    list_emails,
    readable_integration_ids,
)
from aexy.models.developer import Developer
from aexy.models.google_integration import GoogleIntegration, SyncedEmail
from aexy.models.service_desk import ServiceDeskMailbox
from aexy.models.workspace import Workspace, WorkspaceMember


def _uniq(tag: str) -> str:
    return f"{tag}-{uuid4().hex[:8]}"


async def _developer(db: AsyncSession, tag: str) -> Developer:
    dev = Developer(name=f"Dev {tag}", email=f"{_uniq(tag)}@example.test")
    db.add(dev)
    await db.flush()
    return dev


async def _workspace(db: AsyncSession, owner: Developer) -> Workspace:
    ws = Workspace(id=str(uuid4()), name=_uniq("ws"), slug=_uniq("ws"), owner_id=owner.id)
    db.add(ws)
    await db.flush()
    db.add(
        WorkspaceMember(
            workspace_id=ws.id, developer_id=owner.id, role="owner", status="active"
        )
    )
    await db.flush()
    return ws


async def _member(db: AsyncSession, ws: Workspace, tag: str, role: str = "member") -> Developer:
    dev = await _developer(db, tag)
    db.add(
        WorkspaceMember(
            workspace_id=ws.id, developer_id=dev.id, role=role, status="active"
        )
    )
    await db.flush()
    return dev


async def _account(
    db: AsyncSession, ws: Workspace, email: str, owner: Developer | None
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
    db.add(integration)
    await db.flush()
    return integration


async def _mail(
    db: AsyncSession, integration: GoogleIntegration, subject: str
) -> SyncedEmail:
    email = SyncedEmail(
        id=str(uuid4()),
        workspace_id=integration.workspace_id,
        integration_id=integration.id,
        gmail_id=_uniq("gm"),
        gmail_thread_id=_uniq("th"),
        subject=subject,
        is_read=True,
        is_starred=False,
        has_attachments=False,
    )
    db.add(email)
    await db.flush()
    return email


# ── the leak ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_colleagues_personal_mailbox_is_not_readable(db_session: AsyncSession):
    """The bug, stated as a test.

    Two people each connect their own mailbox. Neither should be reading the
    other's mail, and before this they both read all of it.
    """
    alice = await _developer(db_session, "alice")
    ws = await _workspace(db_session, alice)
    bob = await _member(db_session, ws, "bob")

    alice_account = await _account(db_session, ws, "alice@corp.test", alice)
    bob_account = await _account(db_session, ws, "bob@corp.test", bob)

    readable_by_alice = await readable_integration_ids(str(ws.id), alice, db_session)

    assert str(alice_account.id) in readable_by_alice
    assert str(bob_account.id) not in readable_by_alice


@pytest.mark.asyncio
async def test_the_list_returns_only_your_own_mail(db_session: AsyncSession):
    alice = await _developer(db_session, "list-alice")
    ws = await _workspace(db_session, alice)
    bob = await _member(db_session, ws, "list-bob")

    await _mail(db_session, await _account(db_session, ws, "a@corp.test", alice), "Mine")
    await _mail(db_session, await _account(db_session, ws, "b@corp.test", bob), "Bob's")

    listing = await list_emails(
        workspace_id=str(ws.id),
        page=1,
        page_size=50,
        search=None,
        from_email=None,
        thread_id=None,
        unread_only=False,
        integration_id=None,
        current_user=alice,
        db=db_session,
    )

    assert [e.subject for e in listing.emails] == ["Mine"]
    assert listing.total == 1


@pytest.mark.asyncio
async def test_naming_a_colleagues_account_does_not_widen_the_list(
    db_session: AsyncSession,
):
    """`integration_id` narrows within what you may read. It never widens it."""
    alice = await _developer(db_session, "narrow-alice")
    ws = await _workspace(db_session, alice)
    bob = await _member(db_session, ws, "narrow-bob")
    await _account(db_session, ws, "a@corp.test", alice)
    bob_account = await _account(db_session, ws, "b@corp.test", bob)
    await _mail(db_session, bob_account, "Bob's")

    listing = await list_emails(
        workspace_id=str(ws.id),
        page=1,
        page_size=50,
        search=None,
        from_email=None,
        thread_id=None,
        unread_only=False,
        integration_id=str(bob_account.id),
        current_user=alice,
        db=db_session,
    )

    assert listing.emails == []
    assert listing.total == 0


@pytest.mark.asyncio
async def test_fetching_a_colleagues_email_by_id_is_404(db_session: AsyncSession):
    """The list handed these ids out, so this is the one that mattered most.

    404 rather than 403: a different answer would confirm the message exists.
    """
    alice = await _developer(db_session, "id-alice")
    ws = await _workspace(db_session, alice)
    bob = await _member(db_session, ws, "id-bob")
    await _account(db_session, ws, "a@corp.test", alice)
    bobs_mail = await _mail(
        db_session, await _account(db_session, ws, "b@corp.test", bob), "Private"
    )

    with pytest.raises(HTTPException) as exc:
        await get_email(
            workspace_id=str(ws.id),
            email_id=str(bobs_mail.id),
            current_user=alice,
            db=db_session,
        )

    assert exc.value.status_code == 404


# ── what stays shared ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_service_desk_mailbox_stays_readable_by_everyone(
    db_session: AsyncSession,
):
    """A desk address is answered by whoever is on the desk.

    Hiding it from them because somebody else's name is on the OAuth row would
    break the queue.
    """
    alice = await _developer(db_session, "desk-alice")
    ws = await _workspace(db_session, alice)
    bob = await _member(db_session, ws, "desk-bob")

    desk_account = await _account(db_session, ws, "support@corp.test", bob)
    db_session.add(
        ServiceDeskMailbox(
            id=str(uuid4()),
            workspace_id=ws.id,
            address="support@corp.test",
            channel="gmail_sync",
            integration_id=str(desk_account.id),
            is_active=True,
        )
    )
    await db_session.flush()

    readable = await readable_integration_ids(str(ws.id), alice, db_session)

    assert str(desk_account.id) in readable


@pytest.mark.asyncio
async def test_an_ownerless_legacy_account_stays_readable(db_session: AsyncSession):
    """`connected_by_id` is nullable and older rows have none.

    Those are single-account workspaces from before this was a question, where
    every member already saw that mailbox. Excluding them would empty an inbox
    that has worked for months, which reads as data loss rather than a fix.
    """
    alice = await _developer(db_session, "legacy-alice")
    ws = await _workspace(db_session, alice)
    bob = await _member(db_session, ws, "legacy-bob")
    legacy = await _account(db_session, ws, "shared@corp.test", None)

    for reader in (alice, bob):
        readable = await readable_integration_ids(str(ws.id), reader, db_session)
        assert str(legacy.id) in readable


@pytest.mark.asyncio
async def test_an_admin_gets_no_extra_reach(db_session: AsyncSession):
    """Admin is not a reason to read somebody's personal mail.

    An admin can disconnect the account, which is visible and leaves a trace.
    Reading it silently is a different act.
    """
    owner = await _developer(db_session, "adm-owner")
    ws = await _workspace(db_session, owner)
    admin = await _member(db_session, ws, "adm-admin", role="admin")
    bob = await _member(db_session, ws, "adm-bob")
    bob_account = await _account(db_session, ws, "bob@corp.test", bob)

    readable = await readable_integration_ids(str(ws.id), admin, db_session)

    assert str(bob_account.id) not in readable
