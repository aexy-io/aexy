"""The due-date sweep must remind once, on the right day, about live work only.

Every failure mode here is silent in production. A sweep that re-sends mails the
same person the same reminder every morning until the deadline passes; one that
reminds about a finished task is noise attached to work nobody is doing; one that
reminds about an overdue task reads as a bug, because the reminder claims the
deadline is coming when it has gone.

The activity is idempotent by inspecting the notifications it has already
written, rather than by a `reminded_at` column on every table with a due date —
so the check that it *is* idempotent is the important one.
"""

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from aexy.models.notification import Notification, NotificationEventType
from aexy.models.sprint import SprintTask
from aexy.temporal.activities import work_item_deadlines
from aexy.temporal.activities.work_item_deadlines import (
    CheckWorkItemDeadlinesInput,
    check_work_item_deadlines,
)
from tests.conftest import seed_workspace

pytestmark = pytest.mark.asyncio


@pytest.fixture
def run_sweep(monkeypatch, db_session):
    """Run the activity against the test session instead of a fresh one."""

    class _Reuse:
        async def __aenter__(self):
            return db_session

        async def __aexit__(self, *exc):
            return False

    monkeypatch.setattr(work_item_deadlines, "async_session_maker", lambda: _Reuse())

    async def _run():
        return await check_work_item_deadlines(CheckWorkItemDeadlinesInput())

    return _run


async def _developer(db_session) -> str:
    developer_id = str(uuid.uuid4())
    from sqlalchemy import text as sa_text

    await db_session.execute(
        sa_text(
            "INSERT INTO developers (id, repos_synced_count, llm_requests_today, "
            "llm_tokens_used_this_month, llm_input_tokens_this_month, "
            "llm_output_tokens_this_month, llm_overage_cost_cents, "
            "has_completed_onboarding) "
            "VALUES (:i, 0, 0, 0, 0, 0, 0, false)"
        ),
        {"i": developer_id},
    )
    await db_session.flush()
    return developer_id


async def _task(db_session, workspace_id, assignee_id, *, due, status="todo",
                archived=False, title="Ship the thing") -> SprintTask:
    task = SprintTask(
        id=str(uuid.uuid4()),
        workspace_id=workspace_id,
        title=title,
        status=status,
        priority="medium",
        assignee_id=assignee_id,
        end_date=due,
        is_archived=archived,
        source_type="manual",
        source_id=str(uuid.uuid4()),
    )
    db_session.add(task)
    await db_session.flush()
    return task


async def _reminders(db_session, recipient_id) -> list[Notification]:
    rows = await db_session.execute(
        select(Notification).where(
            Notification.recipient_id == recipient_id,
            Notification.event_type.in_(
                [
                    NotificationEventType.DEADLINE_REMINDER_1_DAY.value,
                    NotificationEventType.DEADLINE_REMINDER_DAY_OF.value,
                ]
            ),
        )
    )
    return list(rows.scalars().all())


def _at(day: date) -> datetime:
    """A due date as the column stores it — midday, so timezone slop can't shift it."""
    return datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc) + timedelta(
        hours=12
    )


async def test_reminds_the_assignee_the_day_before(run_sweep, db_session):
    workspace_id = await seed_workspace(db_session)
    developer_id = await _developer(db_session)
    await _task(db_session, workspace_id, developer_id, due=_at(date.today() + timedelta(days=1)))

    result = await run_sweep()

    assert result["sent"] == 1
    sent = await _reminders(db_session, developer_id)
    assert len(sent) == 1
    assert sent[0].event_type == NotificationEventType.DEADLINE_REMINDER_1_DAY.value
    # The body has to name the item — somebody with eight assigned things needs
    # to know which one is due without opening the app.
    assert "Ship the thing" in sent[0].body


async def test_reminds_again_on_the_day_itself(run_sweep, db_session):
    workspace_id = await seed_workspace(db_session)
    developer_id = await _developer(db_session)
    await _task(db_session, workspace_id, developer_id, due=_at(date.today()))

    await run_sweep()

    sent = await _reminders(db_session, developer_id)
    assert [n.event_type for n in sent] == [
        NotificationEventType.DEADLINE_REMINDER_DAY_OF.value
    ]


async def test_running_twice_in_a_day_does_not_send_twice(run_sweep, db_session):
    workspace_id = await seed_workspace(db_session)
    developer_id = await _developer(db_session)
    await _task(db_session, workspace_id, developer_id, due=_at(date.today() + timedelta(days=1)))

    first = await run_sweep()
    second = await run_sweep()

    assert first["sent"] == 1
    assert second["sent"] == 0
    assert len(await _reminders(db_session, developer_id)) == 1


async def test_ignores_work_that_is_done_archived_or_unassigned(run_sweep, db_session):
    workspace_id = await seed_workspace(db_session)
    developer_id = await _developer(db_session)
    tomorrow = _at(date.today() + timedelta(days=1))

    await _task(db_session, workspace_id, developer_id, due=tomorrow, status="done")
    await _task(db_session, workspace_id, developer_id, due=tomorrow, archived=True)
    await _task(db_session, workspace_id, None, due=tomorrow)

    result = await run_sweep()

    assert result["sent"] == 0
    assert await _reminders(db_session, developer_id) == []


async def test_says_nothing_about_work_that_is_already_overdue(run_sweep, db_session):
    """A reminder that a deadline is coming, sent after it passed, reads as a bug."""
    workspace_id = await seed_workspace(db_session)
    developer_id = await _developer(db_session)
    await _task(db_session, workspace_id, developer_id, due=_at(date.today() - timedelta(days=3)))

    result = await run_sweep()

    assert result["sent"] == 0
    assert await _reminders(db_session, developer_id) == []


async def test_says_nothing_about_work_due_next_week(run_sweep, db_session):
    workspace_id = await seed_workspace(db_session)
    developer_id = await _developer(db_session)
    await _task(db_session, workspace_id, developer_id, due=_at(date.today() + timedelta(days=7)))

    assert (await run_sweep())["sent"] == 0
