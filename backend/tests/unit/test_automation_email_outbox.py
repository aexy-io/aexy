"""Regression tests for draining the automation email outbox.

All three cases below were confirmed in review after the first implementation:
two of them could send a customer a duplicate email, which is the exact thing
this work exists to prevent.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
import sqlalchemy

from aexy.models.crm import (
    CRMAutomation,
    CRMAutomationEmailOutbox,
    CRMAutomationRun,
)
from aexy.services import automation_email_outbox as outbox_service

from tests.conftest import seed_workspace

pytestmark = pytest.mark.asyncio


@pytest.fixture
def drain(db_session, monkeypatch):
    """Run the drain against the test session.

    It normally opens its own connection, which is the whole point - it has to
    see committed rows. Here that would be a different database entirely.
    """

    class _Reuse:
        async def __aenter__(self):
            return db_session

        async def __aexit__(self, *exc):
            return False

    monkeypatch.setattr(outbox_service, "async_session_maker", lambda: _Reuse())
    return outbox_service.drain_outbox


async def _seed(db_session, *, status="pending", attempts=0, claimed_at=None,
                created_at=None):
    automation = CRMAutomation(
        id=str(uuid4()), workspace_id=await seed_workspace(db_session), name="A",
        module="crm",
        object_id=None, trigger_type="record.created", trigger_config={},
        actions=[], is_active=True,
    )
    db_session.add(automation)
    # Flush between each: the ids are pre-assigned in Python, so SQLAlchemy has
    # no relationship to infer an insert order from, and on Postgres the child
    # can reach the database before its parent. SQLite lets that pass only
    # because it leaves foreign keys unenforced.
    await db_session.flush()
    run = CRMAutomationRun(
        id=str(uuid4()), automation_id=automation.id, module="crm",
        trigger_data={}, status="queued",
        steps_executed=[{"type": "send_email", "order": 0, "status": "queued"}],
        started_at=datetime.now(timezone.utc),
    )
    db_session.add(run)
    await db_session.flush()
    row = CRMAutomationEmailOutbox(
        id=str(uuid4()), automation_run_id=run.id, step_order=0,
        payload={"workspace_id": automation.workspace_id, "to_email": "a@b.com",
                 "subject": "s", "html_body": "b", "automation_run_id": run.id,
                 "automation_step_order": 0},
        status=status, attempts=attempts, claimed_at=claimed_at,
        created_at=created_at or datetime.now(timezone.utc),
    )
    db_session.add(row)
    await db_session.commit()
    return automation, run, row


async def test_a_long_pending_row_claimed_just_now_is_not_treated_as_stale(db_session, drain):
    """Found in review: stale recovery keyed off when the row was created, so a
    row that waited an hour then was claimed a second ago looked stale
    instantly and could be handed over twice - a duplicate email."""
    old = datetime.now(timezone.utc) - timedelta(hours=1)
    _, _, row = await _seed(
        db_session, status="dispatching", attempts=1,
        claimed_at=datetime.now(timezone.utc), created_at=old,
    )

    with patch("aexy.temporal.dispatch.dispatch", new_callable=AsyncMock) as dispatch:
        result = await drain()

    dispatch.assert_not_awaited()
    assert result["dispatched"] == 0


async def test_a_genuinely_stale_claim_is_recovered(db_session, drain):
    """The other half: a claim abandoned long ago must not strand the email."""
    long_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    await _seed(db_session, status="dispatching", attempts=1, claimed_at=long_ago)

    with patch("aexy.temporal.dispatch.dispatch", new_callable=AsyncMock) as dispatch:
        result = await drain()

    dispatch.assert_awaited_once()
    assert result["dispatched"] == 1


async def test_giving_up_says_so_on_the_run(db_session, drain):
    """Found in review: once attempts hit the limit the row was reset to
    pending but could never be selected again, so the run sat on "queued"
    forever with nothing anywhere saying why."""
    automation, run, _ = await _seed(
        db_session, attempts=outbox_service.MAX_ATTEMPTS - 1
    )

    with patch(
        "aexy.temporal.dispatch.dispatch",
        new=AsyncMock(side_effect=RuntimeError("worker unreachable")),
    ):
        await drain()

    status = (
        await db_session.execute(
            sqlalchemy.select(CRMAutomationEmailOutbox.status)
        )
    ).scalar_one()
    assert status == "failed"

    assert run.status == "failed"
    assert "worker unreachable" in (run.error_message or "")
    assert run.steps_executed[0]["status"] == "failed"


async def test_a_run_already_counted_is_not_counted_twice(db_session, drain):
    """Found in review: a later step failing under "stop" finalizes the run
    while an earlier email is still in flight. When that email's result
    arrived, the run was counted a second time."""
    from aexy.temporal.activities.email import (
        SendWorkflowEmailInput,
        _record_automation_email_result,
    )

    automation, run, _ = await _seed(db_session)
    automation.failed_runs = 0
    run.status = "failed"  # the executor already reached a verdict
    await db_session.commit()

    await _record_automation_email_result(
        db_session,
        SendWorkflowEmailInput(
            workspace_id=automation.workspace_id, to_email="a@b.com",
            subject="s", html_body="b",
            automation_run_id=run.id, automation_step_order=0,
        ),
        {"status": "sent", "to": "a@b.com"},
    )

    assert automation.failed_runs == 0, "counted a second time"
    assert automation.successful_runs == 0


async def test_the_immediate_drain_only_touches_its_own_run(db_session, drain):
    """Found in review: the drain fired from a request took no filter, so one
    user's request could pick up every other workspace's pending email."""
    _, mine, _ = await _seed(db_session)
    _, theirs, _ = await _seed(db_session)

    with patch("aexy.temporal.dispatch.dispatch", new_callable=AsyncMock) as dispatch:
        result = await drain(run_id=mine.id)

    assert result["dispatched"] == 1
    payload = dispatch.await_args.args[1]
    assert payload.automation_run_id == mine.id
    assert payload.automation_run_id != theirs.id
    # Without this the same workflow id can be started again once the first
    # has closed, so a send that completed but lost its bookkeeping is redone
    # by the sweep and the customer gets a second copy.
    assert dispatch.await_args.kwargs.get("reject_duplicate_id") is True


async def test_a_rejected_duplicate_handover_is_not_a_failure(db_session, drain):
    """Found in review: the workflow id is derived from the outbox row, so a
    "already started" rejection means the FIRST handover landed and its
    response was lost. Treating that as a failure would fail a run whose email
    is already on its way to the customer."""
    from temporalio.exceptions import WorkflowAlreadyStartedError

    _, run, _ = await _seed(db_session)

    error = WorkflowAlreadyStartedError("wf-1", "SingleActivityWorkflow")
    with patch("aexy.temporal.dispatch.dispatch", new=AsyncMock(side_effect=error)):
        result = await drain(run_id=run.id)

    assert result["dispatched"] == 1
    assert result["failed"] == 0

    status = (
        await db_session.execute(sqlalchemy.select(CRMAutomationEmailOutbox.status))
    ).scalar_one()
    assert status == "dispatched"
    assert run.status == "queued", "the run must not be failed"


async def test_an_unrelated_already_exists_error_is_still_a_failure(db_session, drain):
    """Found in review: the duplicate check used to match on error text, so an
    unrelated failure mentioning "already exists" would mark an email as handed
    over when it never was - stopping all retries and leaving the run looking
    healthy having sent nothing."""
    _, run, _ = await _seed(db_session)

    with patch(
        "aexy.temporal.dispatch.dispatch",
        new=AsyncMock(side_effect=RuntimeError("database row already exists")),
    ):
        result = await drain(run_id=run.id)

    assert result["dispatched"] == 0
    assert result["failed"] == 1

    status = (
        await db_session.execute(sqlalchemy.select(CRMAutomationEmailOutbox.status))
    ).scalar_one()
    assert status == "pending", "must stay retryable, not be marked delivered"


async def test_one_exhausted_email_does_not_condemn_its_siblings(db_session, drain):
    """Found in review: giving up on one email failed every queued step on the
    run, so a sibling that later delivered could no longer record itself and
    would show as failed despite reaching the customer."""
    automation, run, row_a = await _seed(db_session, attempts=outbox_service.MAX_ATTEMPTS - 1)
    run.steps_executed = [
        {"type": "send_email", "order": 0, "status": "queued"},
        {"type": "send_email", "order": 1, "status": "queued"},
    ]
    sibling = CRMAutomationEmailOutbox(
        id=str(uuid4()), automation_run_id=run.id, step_order=1,
        payload=dict(row_a.payload, automation_step_order=1),
        status="pending", attempts=0,
    )
    db_session.add(sibling)
    await db_session.commit()

    with patch(
        "aexy.temporal.dispatch.dispatch",
        new=AsyncMock(side_effect=RuntimeError("worker unreachable")),
    ):
        await drain(run_id=run.id)

    statuses = [s["status"] for s in run.steps_executed]
    assert statuses[1] == "queued", "the sibling still in flight must be left alone"
