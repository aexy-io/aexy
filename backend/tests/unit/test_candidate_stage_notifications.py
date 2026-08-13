"""A candidate's owner hears when somebody else moves them along the pipeline.

`candidate_stage_changed` was a declared event with a settings toggle and no
emitter for one reason: `hiring_candidates` had no owner column, so the only
choices were notifying every hiring-app member on every Kanban drag or notifying
nobody. With an owner there is exactly one right recipient.

The cases worth pinning are the quiet ones. A recruiter dragging their *own*
candidate must hear nothing — that is the most common action on the board, and
mailing somebody about their own click is how a notification channel gets muted.
An unowned candidate must notify nobody rather than erroring. And an owner from
another workspace must be rejected, or stage notifications get addressed to
somebody with no access to the candidate.
"""

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import select, text as sa_text

from aexy.api.hiring import _assert_owner_is_member, _notify_stage_change
from aexy.models.career import HiringCandidate
from aexy.models.notification import Notification, NotificationEventType
from tests.conftest import seed_workspace

pytestmark = pytest.mark.asyncio


async def _developer(db, name="Ada") -> str:
    developer_id = str(uuid.uuid4())
    await db.execute(
        sa_text(
            "INSERT INTO developers (id, name, repos_synced_count, llm_requests_today, "
            "llm_tokens_used_this_month, llm_input_tokens_this_month, "
            "llm_output_tokens_this_month, llm_overage_cost_cents, "
            "has_completed_onboarding) "
            "VALUES (:i, :n, 0, 0, 0, 0, 0, 0, false)"
        ),
        {"i": developer_id, "n": name},
    )
    await db.flush()
    return developer_id


async def _candidate(db, workspace_id, *, owner_id=None, stage="screening") -> HiringCandidate:
    candidate = HiringCandidate(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        name="Grace Hopper",
        email=f"{uuid.uuid4()}@example.com",
        role="Staff Engineer",
        stage=stage,
        owner_id=owner_id,
    )
    db.add(candidate)
    await db.flush()
    return candidate


class _Actor:
    """The minimum of a Developer that `_notify_stage_change` reads."""

    def __init__(self, developer_id: str, name: str) -> None:
        self.id = developer_id
        self.name = name


async def _stage_notifications(db, recipient_id) -> list[Notification]:
    rows = await db.execute(
        select(Notification).where(
            Notification.recipient_id == recipient_id,
            Notification.event_type
            == NotificationEventType.CANDIDATE_STAGE_CHANGED.value,
        )
    )
    return list(rows.scalars().all())


async def test_owner_is_told_when_someone_else_moves_their_candidate(db_session):
    workspace_id = await seed_workspace(db_session)
    owner_id = await _developer(db_session, "Owner")
    mover_id = await _developer(db_session, "Mover")
    candidate = await _candidate(db_session, workspace_id, owner_id=owner_id)

    candidate.stage = "interview"
    await _notify_stage_change(
        db_session, candidate, "screening", _Actor(mover_id, "Mover")
    )

    sent = await _stage_notifications(db_session, owner_id)
    assert len(sent) == 1
    # The body has to name the candidate and both stages — a recruiter with a full
    # pipeline cannot act on "a candidate moved".
    assert "Grace Hopper" in sent[0].body
    assert "screening" in sent[0].body
    assert "interview" in sent[0].body


async def test_moving_your_own_candidate_notifies_nobody(db_session):
    workspace_id = await seed_workspace(db_session)
    owner_id = await _developer(db_session, "Owner")
    candidate = await _candidate(db_session, workspace_id, owner_id=owner_id)

    candidate.stage = "offer"
    await _notify_stage_change(
        db_session, candidate, "screening", _Actor(owner_id, "Owner")
    )

    assert await _stage_notifications(db_session, owner_id) == []


async def test_an_unowned_candidate_notifies_nobody(db_session):
    """The pre-existing state of every candidate — must not error."""
    workspace_id = await seed_workspace(db_session)
    mover_id = await _developer(db_session, "Mover")
    candidate = await _candidate(db_session, workspace_id, owner_id=None)

    candidate.stage = "interview"
    await _notify_stage_change(
        db_session, candidate, "screening", _Actor(mover_id, "Mover")
    )

    rows = await db_session.execute(
        select(Notification).where(
            Notification.event_type
            == NotificationEventType.CANDIDATE_STAGE_CHANGED.value
        )
    )
    assert list(rows.scalars().all()) == []


async def test_a_no_op_stage_write_is_not_news(db_session):
    """Saving a candidate without moving them must stay silent."""
    workspace_id = await seed_workspace(db_session)
    owner_id = await _developer(db_session, "Owner")
    mover_id = await _developer(db_session, "Mover")
    candidate = await _candidate(db_session, workspace_id, owner_id=owner_id, stage="offer")

    await _notify_stage_change(
        db_session, candidate, "offer", _Actor(mover_id, "Mover")
    )

    assert await _stage_notifications(db_session, owner_id) == []


async def test_an_owner_outside_the_workspace_is_rejected(db_session):
    """Otherwise stage notifications go to somebody with no access to the candidate."""
    workspace_id = await seed_workspace(db_session)
    outsider_id = await _developer(db_session, "Outsider")

    with pytest.raises(HTTPException) as exc:
        await _assert_owner_is_member(db_session, workspace_id, outsider_id)
    assert exc.value.status_code == 400
    assert "member of this workspace" in exc.value.detail


async def test_clearing_the_owner_is_allowed(db_session):
    """Unassigning is a legitimate action, not a missing-member error."""
    workspace_id = await seed_workspace(db_session)
    await _assert_owner_is_member(db_session, workspace_id, None)
