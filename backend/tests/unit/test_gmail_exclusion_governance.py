"""Who can see a mailbox's exclusions, and who gets told.

The policy is unusual enough to be worth pinning: exclusions are deliberately
*not* private. Admins see them, heads are told about standing rules, and reading
somebody's list is itself recorded. These tests exist because each of those has
an obvious-looking wrong version — notify on everything, record nothing, or tell
the owner they were looked at — and the difference between them is the whole
design.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.developer import Developer
from aexy.models.google_integration import GoogleSyncExclusionAudit
from aexy.models.organization import Department, DepartmentMember
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.gmail_exclusion_governance import (
    ACTION_MESSAGE_HIDDEN,
    ACTION_RULE_CREATED,
    ACTION_RULE_DELETED,
    ACTION_VIEWED,
    GmailExclusionGovernance,
)


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


async def _department(
    db: AsyncSession,
    ws: Workspace,
    member: Developer,
    head: Developer | None,
    *,
    is_primary: bool = True,
    name: str | None = None,
) -> Department:
    dept = Department(
        id=str(uuid4()),
        workspace_id=ws.id,
        name=name or _uniq("Dept"),
        slug=_uniq("dept"),
        head_id=str(head.id) if head else None,
    )
    db.add(dept)
    await db.flush()
    db.add(
        DepartmentMember(
            id=str(uuid4()),
            workspace_id=ws.id,
            department_id=dept.id,
            developer_id=str(member.id),
            is_primary=is_primary,
        )
    )
    await db.flush()
    return dept


async def _audit(db: AsyncSession, ws: Workspace) -> list[GoogleSyncExclusionAudit]:
    return list(
        (
            await db.execute(
                select(GoogleSyncExclusionAudit).where(
                    GoogleSyncExclusionAudit.workspace_id == ws.id
                )
            )
        )
        .scalars()
        .all()
    )


# ── the audit trail ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_every_action_is_recorded_including_a_read(db_session: AsyncSession):
    """Reading somebody's exclusions is an action, not a non-event.

    A list of hidden domains reads as a list of things somebody would rather
    their manager not see, so the symmetry for admins being able to see it is
    that seeing it is written down.
    """
    owner = await _developer(db_session, "gov-owner")
    ws = await _workspace(db_session, owner)
    governance = GmailExclusionGovernance(db_session)

    for action in (ACTION_RULE_CREATED, ACTION_MESSAGE_HIDDEN, ACTION_VIEWED):
        await governance.record(
            workspace_id=str(ws.id), action=action, actor_id=str(owner.id)
        )

    assert {e.action for e in await _audit(db_session, ws)} == {
        ACTION_RULE_CREATED,
        ACTION_MESSAGE_HIDDEN,
        ACTION_VIEWED,
    }


@pytest.mark.asyncio
async def test_the_audit_survives_the_integration_it_describes(
    db_session: AsyncSession,
):
    """No FK on `integration_id`, on purpose.

    Disconnecting Google would otherwise erase the record of what had been
    excluded — which is the one moment somebody covering their tracks would
    most want it erased.
    """
    owner = await _developer(db_session, "gov-detach")
    ws = await _workspace(db_session, owner)

    entry = await GmailExclusionGovernance(db_session).record(
        workspace_id=str(ws.id),
        action=ACTION_RULE_CREATED,
        actor_id=str(owner.id),
        integration_id=str(uuid4()),  # never existed, or no longer does
        target="acme.com",
    )
    assert entry.integration_id is not None
    assert len(await _audit(db_session, ws)) == 1


# ── who gets told ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_standing_rule_notifies_the_head(db_session: AsyncSession):
    actor = await _developer(db_session, "gov-actor")
    head = await _developer(db_session, "gov-head")
    ws = await _workspace(db_session, head)
    await _department(db_session, ws, actor, head)

    notified = await GmailExclusionGovernance(db_session).notify_head(
        str(ws.id), str(actor.id), ACTION_RULE_CREATED, "acme.com"
    )
    assert notified is True


@pytest.mark.asyncio
async def test_a_one_off_hide_notifies_nobody(db_session: AsyncSession):
    """Deliberate, and the reason the two mechanisms are told apart at all.

    A head buried in "not this thread" stops reading the standing rules the
    policy actually exists to surface.
    """
    actor = await _developer(db_session, "gov-quiet")
    head = await _developer(db_session, "gov-quiet-head")
    ws = await _workspace(db_session, head)
    await _department(db_session, ws, actor, head)

    notified = await GmailExclusionGovernance(db_session).notify_head(
        str(ws.id), str(actor.id), ACTION_MESSAGE_HIDDEN, "one-message"
    )
    assert notified is False


@pytest.mark.asyncio
async def test_removing_a_rule_is_announced_as_well_as_adding_one(
    db_session: AsyncSession,
):
    """Otherwise the trail shows exclusions only ever accumulating."""
    actor = await _developer(db_session, "gov-undo")
    head = await _developer(db_session, "gov-undo-head")
    ws = await _workspace(db_session, head)
    await _department(db_session, ws, actor, head)

    assert (
        await GmailExclusionGovernance(db_session).notify_head(
            str(ws.id), str(actor.id), ACTION_RULE_DELETED, "acme.com"
        )
        is True
    )


@pytest.mark.asyncio
async def test_nobody_is_told_about_their_own_rule(db_session: AsyncSession):
    """A head who excludes a domain does not need a message about it."""
    head = await _developer(db_session, "gov-self")
    ws = await _workspace(db_session, head)
    await _department(db_session, ws, head, head)

    notified = await GmailExclusionGovernance(db_session).notify_head(
        str(ws.id), str(head.id), ACTION_RULE_CREATED, "acme.com"
    )
    assert notified is False


@pytest.mark.asyncio
async def test_the_primary_department_decides_which_head_hears(
    db_session: AsyncSession,
):
    """One manager, not both.

    Somebody in two departments has one manager for this purpose; telling both
    would spread a private-feeling fact wider than the policy asks for.
    """
    actor = await _developer(db_session, "gov-two")
    primary_head = await _developer(db_session, "gov-primary-head")
    other_head = await _developer(db_session, "gov-other-head")
    ws = await _workspace(db_session, primary_head)
    await _department(db_session, ws, actor, other_head, is_primary=False)
    await _department(db_session, ws, actor, primary_head, is_primary=True)

    resolved = await GmailExclusionGovernance(db_session)._head_of(
        str(ws.id), str(actor.id)
    )
    assert resolved == str(primary_head.id)


@pytest.mark.asyncio
async def test_no_department_means_no_notification_not_a_failure(
    db_session: AsyncSession,
):
    """A workspace that has not filled in its org chart still gets the audit
    trail — the record must not depend on somebody having set up departments."""
    actor = await _developer(db_session, "gov-orphan")
    ws = await _workspace(db_session, actor)
    governance = GmailExclusionGovernance(db_session)

    assert (
        await governance.notify_head(
            str(ws.id), str(actor.id), ACTION_RULE_CREATED, "acme.com"
        )
        is False
    )

    await governance.record(
        workspace_id=str(ws.id),
        action=ACTION_RULE_CREATED,
        actor_id=str(actor.id),
        target="acme.com",
    )
    assert len(await _audit(db_session, ws)) == 1


@pytest.mark.asyncio
async def test_a_department_without_a_head_is_not_an_error(db_session: AsyncSession):
    actor = await _developer(db_session, "gov-headless")
    ws = await _workspace(db_session, actor)
    await _department(db_session, ws, actor, None)

    assert (
        await GmailExclusionGovernance(db_session).notify_head(
            str(ws.id), str(actor.id), ACTION_RULE_CREATED, "acme.com"
        )
        is False
    )


@pytest.mark.asyncio
async def test_a_failed_notification_does_not_fail_the_exclusion(
    db_session: AsyncSession, monkeypatch
):
    """The person asked for mail to stay out of Aexy. Refusing that because a
    message could not be delivered would protect the wrong thing."""
    actor = await _developer(db_session, "gov-boom")
    head = await _developer(db_session, "gov-boom-head")
    ws = await _workspace(db_session, head)
    await _department(db_session, ws, actor, head)

    import aexy.services.notification_service as notifications

    async def _explode(*_args, **_kwargs):
        raise RuntimeError("notification backend down")

    monkeypatch.setattr(
        notifications.NotificationService, "create_notification", _explode
    )

    notified = await GmailExclusionGovernance(db_session).notify_head(
        str(ws.id), str(actor.id), ACTION_RULE_CREATED, "acme.com"
    )
    assert notified is False
