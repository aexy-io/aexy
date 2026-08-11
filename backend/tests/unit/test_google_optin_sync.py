"""Opt-in sync: a mailbox that stores nothing until a thread is asked for.

`all` syncs the whole inbox and subtracts the exclusion rules, which asks
somebody to predict everything worth keeping out of a shared workspace — and
whatever they fail to predict is already in it. `opt_in` inverts the default.

These pin the parts where getting it wrong is silent: a desk mailbox that stops
creating tickets, a mode switch that deletes history nobody asked it to, and an
unmark that leaves the mail it claims to have removed.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.google_integration import (
    _own_integration,
    list_threads,
    mark_thread,
    unmark_thread,
    update_sync_mode,
)
from aexy.models.developer import Developer
from aexy.models.google_integration import (
    GoogleIntegration,
    GoogleThreadIndex,
    GoogleThreadOptIn,
    SyncedEmail,
)
from aexy.models.service_desk import ServiceDeskMailbox
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.google_integration import SyncModeUpdate


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


async def _member(db: AsyncSession, ws: Workspace, tag: str, role: str) -> Developer:
    dev = await _developer(db, tag)
    db.add(
        WorkspaceMember(
            workspace_id=ws.id, developer_id=dev.id, role=role, status="active"
        )
    )
    await db.flush()
    return dev


async def _account(
    db: AsyncSession, ws: Workspace, email: str, owner: Developer | None = None
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


async def _synced(
    db: AsyncSession, integration: GoogleIntegration, thread_id: str, gmail_id: str
) -> SyncedEmail:
    email = SyncedEmail(
        id=str(uuid4()),
        workspace_id=integration.workspace_id,
        integration_id=integration.id,
        gmail_id=gmail_id,
        gmail_thread_id=thread_id,
        subject="Renewal terms",
        is_read=True,
        is_starred=False,
        has_attachments=False,
    )
    db.add(email)
    await db.flush()
    return email


# ── defaults ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_an_account_syncs_everything_by_default(db_session: AsyncSession):
    """Opt-in is a choice, never inherited.

    A migration that quietly switched live mailboxes to opt-in would look
    exactly like an outage: mail stops arriving and nothing reports why.
    """
    owner = await _developer(db_session, "default-owner")
    ws = await _workspace(db_session, owner)
    account = await _account(db_session, ws, "ops@acme.test", owner)

    assert account.sync_mode == "all"
    assert account.opt_in_label == "Aexy"


# ── the Service Desk conflict ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_desk_mailbox_cannot_be_opt_in(db_session: AsyncSession):
    """The desk turns every incoming mail into a ticket.

    Opt-in on a desk-backed account stops tickets being created and reports
    nothing — the symptom is silence, which is the worst possible failure for a
    customer queue.
    """
    owner = await _developer(db_session, "desk-owner")
    ws = await _workspace(db_session, owner)
    account = await _account(db_session, ws, "support@acme.test", owner)
    db_session.add(
        ServiceDeskMailbox(
            id=str(uuid4()),
            workspace_id=ws.id,
            address="support@acme.test",
            channel="gmail_sync",
            integration_id=str(account.id),
            is_active=True,
        )
    )
    await db_session.flush()

    with pytest.raises(HTTPException) as exc:
        await update_sync_mode(
            workspace_id=str(ws.id),
            data=SyncModeUpdate(sync_mode="opt_in"),
            integration_id=str(account.id),
            current_user=owner,
            db=db_session,
        )

    assert exc.value.status_code == 409
    # Names the mailbox, so the reader knows which queue would have stopped.
    assert "support@acme.test" in exc.value.detail


@pytest.mark.asyncio
async def test_a_desk_mailbox_may_still_return_to_all(db_session: AsyncSession):
    """The guard is on becoming opt-in, not on touching the setting.

    Refusing both directions would strand an account that somehow reached
    opt_in with no way back.
    """
    owner = await _developer(db_session, "desk-back")
    ws = await _workspace(db_session, owner)
    account = await _account(db_session, ws, "help@acme.test", owner)
    account.sync_mode = "opt_in"
    db_session.add(
        ServiceDeskMailbox(
            id=str(uuid4()),
            workspace_id=ws.id,
            address="help@acme.test",
            channel="gmail_sync",
            integration_id=str(account.id),
            is_active=True,
        )
    )
    await db_session.flush()

    await update_sync_mode(
        workspace_id=str(ws.id),
        data=SyncModeUpdate(sync_mode="all"),
        integration_id=str(account.id),
        current_user=owner,
        db=db_session,
    )

    assert account.sync_mode == "all"


# ── whose decision it is ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_an_admin_cannot_change_somebody_elses_scope(db_session: AsyncSession):
    """An admin can disconnect an account, which is visible.

    Quietly widening what a colleague's mailbox contributes to the workspace is
    not the same act and is not theirs to make.
    """
    owner = await _developer(db_session, "scope-owner")
    ws = await _workspace(db_session, owner)
    admin = await _member(db_session, ws, "scope-admin", "admin")
    account = await _account(db_session, ws, "mine@acme.test", owner)

    with pytest.raises(HTTPException) as exc:
        await _own_integration(str(ws.id), str(account.id), admin, db_session)

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_the_owner_may_change_their_own_scope(db_session: AsyncSession):
    owner = await _developer(db_session, "own-scope")
    ws = await _workspace(db_session, owner)
    account = await _account(db_session, ws, "mine@acme.test", owner)

    resolved = await _own_integration(str(ws.id), str(account.id), owner, db_session)

    assert str(resolved.id) == str(account.id)


# ── forward-only, and the one place that is not ──────────────────────────


@pytest.mark.asyncio
async def test_switching_to_opt_in_keeps_what_is_already_synced(
    db_session: AsyncSession,
):
    """The switch changes what happens next, not what already happened.

    Deleting a shared workspace's history as a side effect of a toggle is not
    something anyone should have to infer from flipping it.
    """
    owner = await _developer(db_session, "keep-owner")
    ws = await _workspace(db_session, owner)
    account = await _account(db_session, ws, "keep@acme.test", owner)
    await _synced(db_session, account, "thread-1", "msg-1")

    await update_sync_mode(
        workspace_id=str(ws.id),
        data=SyncModeUpdate(sync_mode="opt_in"),
        integration_id=str(account.id),
        current_user=owner,
        db=db_session,
    )

    remaining = (
        await db_session.execute(
            select(SyncedEmail).where(SyncedEmail.integration_id == str(account.id))
        )
    ).scalars().all()
    assert len(remaining) == 1
    assert account.sync_mode == "opt_in"


@pytest.mark.asyncio
async def test_unmarking_a_thread_removes_its_mail(db_session: AsyncSession):
    """This one does purge, unlike the mode switch.

    "Stop syncing this thread" that leaves the thread's mail in the CRM is the
    same broken promise the exclusion rules refuse to make.
    """
    owner = await _developer(db_session, "unmark-owner")
    ws = await _workspace(db_session, owner)
    account = await _account(db_session, ws, "unmark@acme.test", owner)
    account.sync_mode = "opt_in"
    db_session.add(
        GoogleThreadOptIn(
            id=str(uuid4()),
            integration_id=str(account.id),
            workspace_id=str(ws.id),
            gmail_thread_id="thread-1",
            marked_by_id=str(owner.id),
        )
    )
    await _synced(db_session, account, "thread-1", "msg-1")
    await _synced(db_session, account, "thread-1", "msg-2")
    # A different thread's mail must survive.
    await _synced(db_session, account, "thread-2", "msg-3")
    await db_session.flush()

    result = await unmark_thread(
        workspace_id=str(ws.id),
        gmail_thread_id="thread-1",
        integration_id=str(account.id),
        current_user=owner,
        db=db_session,
    )

    assert result.is_marked is False
    assert result.messages_changed == 2

    remaining = (
        await db_session.execute(
            select(SyncedEmail.gmail_thread_id).where(
                SyncedEmail.integration_id == str(account.id)
            )
        )
    ).scalars().all()
    assert remaining == ["thread-2"]

    # The mark is gone too, or the next sync would pull the thread straight back.
    marks = (
        await db_session.execute(
            select(GoogleThreadOptIn).where(
                GoogleThreadOptIn.integration_id == str(account.id)
            )
        )
    ).scalars().all()
    assert marks == []


# ── the index, which is what makes opt-in usable ─────────────────────────


@pytest.mark.asyncio
async def test_the_thread_list_reports_which_are_marked(db_session: AsyncSession):
    """Opt-in cannot bootstrap itself without something to point at."""
    owner = await _developer(db_session, "index-owner")
    ws = await _workspace(db_session, owner)
    account = await _account(db_session, ws, "index@acme.test", owner)
    account.sync_mode = "opt_in"

    for thread_id, subject in (("t-1", "Renewal"), ("t-2", "Dentist")):
        db_session.add(
            GoogleThreadIndex(
                id=str(uuid4()),
                integration_id=str(account.id),
                workspace_id=str(ws.id),
                gmail_thread_id=thread_id,
                subject=subject,
                participants=["someone@acme.test"],
                message_count=1,
                last_message_at=datetime.now(timezone.utc),
            )
        )
    db_session.add(
        GoogleThreadOptIn(
            id=str(uuid4()),
            integration_id=str(account.id),
            workspace_id=str(ws.id),
            gmail_thread_id="t-1",
            marked_by_id=str(owner.id),
        )
    )
    await db_session.flush()

    listing = await list_threads(
        workspace_id=str(ws.id),
        integration_id=str(account.id),
        page=1,
        page_size=50,
        unmarked_only=False,
        current_user=owner,
        db=db_session,
    )

    assert listing.total == 2
    marked = {t.gmail_thread_id: t.is_marked for t in listing.threads}
    assert marked == {"t-1": True, "t-2": False}

    only_unmarked = await list_threads(
        workspace_id=str(ws.id),
        integration_id=str(account.id),
        page=1,
        page_size=50,
        unmarked_only=True,
        current_user=owner,
        db=db_session,
    )
    assert [t.gmail_thread_id for t in only_unmarked.threads] == ["t-2"]


@pytest.mark.asyncio
async def test_a_thread_cannot_be_marked_twice(db_session: AsyncSession):
    """The mark is a permission, so it is one row or none.

    Without the constraint a double click would leave two, and unmarking would
    delete one and silently leave the thread still opted in.
    """
    owner = await _developer(db_session, "dupe-owner")
    ws = await _workspace(db_session, owner)
    account = await _account(db_session, ws, "dupe@acme.test", owner)

    for _ in range(2):
        db_session.add(
            GoogleThreadOptIn(
                id=str(uuid4()),
                integration_id=str(account.id),
                workspace_id=str(ws.id),
                gmail_thread_id="same-thread",
                marked_by_id=str(owner.id),
            )
        )

    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_marking_is_idempotent(db_session: AsyncSession):
    """Marking an already-marked thread is not an error.

    The mark is the point and it is already true; failing here would turn a
    double click into a red toast about nothing.
    """
    owner = await _developer(db_session, "idem-owner")
    ws = await _workspace(db_session, owner)
    account = await _account(db_session, ws, "idem@acme.test", owner)
    account.sync_mode = "opt_in"
    db_session.add(
        GoogleThreadOptIn(
            id=str(uuid4()),
            integration_id=str(account.id),
            workspace_id=str(ws.id),
            gmail_thread_id="already",
            marked_by_id=str(owner.id),
        )
    )
    await db_session.flush()

    result = await mark_thread(
        workspace_id=str(ws.id),
        gmail_thread_id="already",
        integration_id=str(account.id),
        current_user=owner,
        db=db_session,
    )

    assert result.is_marked is True
    marks = (
        await db_session.execute(
            select(GoogleThreadOptIn).where(
                GoogleThreadOptIn.integration_id == str(account.id)
            )
        )
    ).scalars().all()
    assert len(marks) == 1
