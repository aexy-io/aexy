"""The stalled-run reaper must decide a run only when nothing else can.

Runs on the default SQLite test DB and against Postgres alike
(TEST_DATABASE_URL=postgresql+asyncpg://...:5432/aexy_test), both verified.

These cases turn on a run's *age*. An earlier version forced that with a raw
UPDATE, which skips the column's bind processor and wrote a value SQLite could
not compare — so the whole file had to be marked Postgres-only and never ran in
CI. Setting created_at through the mapped attribute (see _run) makes the age
filter behave the same on both, so the reaper is actually covered by default.

The Temporal-lookup cases at the bottom need no database.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import text

from aexy.models.crm import (
    CRMAutomation,
    CRMAutomationEmailOutbox,
    CRMAutomationRun,
)
from aexy.services import automation_run_reaper as reaper
from aexy.services.automation_run_reaper import STALLED_AFTER, reap_stalled_runs

pytestmark = pytest.mark.asyncio

LONG_AGO = datetime.now(timezone.utc) - STALLED_AFTER - timedelta(minutes=5)


def _answer(still_running: bool):
    """Stand in for the Temporal lookup, which needs a live server."""
    async def _stub(_run_id):
        return still_running
    return _stub


async def _automation(db) -> CRMAutomation:
    workspace_id = str(uuid4())
    owner_id = str(uuid4())
    # workspace_id is a real FK; insert the bare rows rather than build the
    # whole workspace graph this test does not care about.
    await db.execute(
        text(
            "INSERT INTO developers (id, repos_synced_count, llm_requests_today, "
            "llm_tokens_used_this_month, llm_input_tokens_this_month, "
            "llm_output_tokens_this_month, llm_overage_cost_cents, "
            "has_completed_onboarding) "
            "VALUES (:i, 0, 0, 0, 0, 0, 0, false)"
        ),
        {"i": owner_id},
    )
    await db.execute(
        text(
            "INSERT INTO workspaces (id, name, slug, type, owner_id, settings, "
            "is_active) VALUES (:i, 'reaper', :s, 'team', :o, '{}', true)"
        ),
        {"i": workspace_id, "s": f"reaper-{workspace_id[:8]}", "o": owner_id},
    )
    automation = CRMAutomation(
        id=str(uuid4()),
        workspace_id=workspace_id,
        name="reaper subject",
        trigger_type="record.created",
        actions=[],
        failed_runs=0,
    )
    db.add(automation)
    await db.flush()
    return automation


async def _run(db, automation, *, status, steps, created_at=LONG_AGO):
    run = CRMAutomationRun(
        id=str(uuid4()),
        automation_id=automation.id,
        module="crm",
        trigger_data={},
        status=status,
        steps_executed=steps,
        started_at=created_at,
        # created_at has a server_default, but the reaper filters on age, so
        # these rows have to be born old. Assigned through the ORM rather than
        # a raw UPDATE: the column is DATETIME(timezone=True), and only the
        # mapped attribute runs the type's bind processor. Forcing it with
        # text() wrote a value SQLite could not compare against the cutoff, so
        # every case there came back "reaped: 0" — the positives failing and,
        # worse, the negatives passing for the wrong reason.
        created_at=created_at,
    )
    db.add(run)
    await db.flush()
    return run


async def test_abandoned_run_is_failed_with_a_reason(db_session):
    automation = await _automation(db_session)
    run = await _run(
        db_session,
        automation,
        status="queued",
        steps=[{"type": "send_email", "order": 0, "status": "queued",
                "recipient": "nobody@example.com"}],
    )

    assert await reap_stalled_runs(db_session) == {"reaped": 1}

    await db_session.refresh(run)
    assert run.status == "failed"
    assert run.error_message and "No outcome" in run.error_message
    assert run.completed_at is not None
    # The step must not still claim the email is on its way.
    assert run.steps_executed[0]["status"] == "failed"
    assert run.steps_executed[0]["recipient"] == "nobody@example.com"
    await db_session.refresh(automation)
    assert automation.failed_runs == 1


async def test_recent_run_is_left_alone(db_session):
    automation = await _automation(db_session)
    run = await _run(
        db_session, automation, status="queued", steps=[],
        created_at=datetime.now(timezone.utc),
    )

    assert await reap_stalled_runs(db_session) == {"reaped": 0}
    await db_session.refresh(run)
    assert run.status == "queued"


async def test_durable_run_whose_workflow_died_is_decided(db_session, monkeypatch):
    """A wait node can sleep for days, so only a dead workflow frees the run."""
    monkeypatch.setattr(reaper, "_durable_workflow_still_running", _answer(False))
    automation = await _automation(db_session)
    run = await _run(
        db_session, automation, status="running",
        steps=[{"type": "handoff", "status": "dispatched"}],
    )

    assert await reap_stalled_runs(db_session) == {"reaped": 1}
    await db_session.refresh(run)
    assert run.status == "failed"
    assert run.error_message and "No outcome" in run.error_message


async def test_durable_run_is_left_alone_while_its_workflow_runs(
    db_session, monkeypatch
):
    monkeypatch.setattr(reaper, "_durable_workflow_still_running", _answer(True))
    automation = await _automation(db_session)
    run = await _run(
        db_session, automation, status="running",
        steps=[{"type": "handoff", "status": "dispatched"}],
    )

    assert await reap_stalled_runs(db_session) == {"reaped": 0}
    await db_session.refresh(run)
    assert run.status == "running"


async def test_run_with_an_email_still_in_flight_is_left_alone(db_session):
    """That email will decide the run itself; reaping would pre-empt it."""
    automation = await _automation(db_session)
    run = await _run(
        db_session, automation, status="queued",
        steps=[{"type": "send_email", "order": 0, "status": "queued"}],
    )
    db_session.add(
        CRMAutomationEmailOutbox(
            id=str(uuid4()),
            automation_run_id=run.id,
            step_order=0,
            payload={},
            status="pending",
        )
    )
    await db_session.flush()

    assert await reap_stalled_runs(db_session) == {"reaped": 0}
    await db_session.refresh(run)
    assert run.status == "queued"


async def test_already_decided_run_is_not_touched(db_session):
    automation = await _automation(db_session)
    run = await _run(db_session, automation, status="completed", steps=[])

    assert await reap_stalled_runs(db_session) == {"reaped": 0}
    await db_session.refresh(run)
    assert run.status == "completed"
    await db_session.refresh(automation)
    assert automation.failed_runs == 0


# ---------------------------------------------------------------------------
# The Temporal lookup itself. No database: these pin how each answer from the
# server is read, which is what decides whether a run can ever be freed.
# ---------------------------------------------------------------------------


def _temporal_raising(error: BaseException, monkeypatch):
    """Point the reaper's client lookup at a server that fails this way."""
    import aexy.temporal.client as temporal_client

    class _Handle:
        async def describe(self):
            raise error

    class _Client:
        def get_workflow_handle(self, _workflow_id):
            return _Handle()

    async def _get_client():
        return _Client()

    monkeypatch.setattr(temporal_client, "get_temporal_client", _get_client)


async def test_missing_workflow_frees_the_run(monkeypatch):
    """NOT_FOUND is a definitive answer: nothing is running, so decide the run.

    Reading it as "still running" is what left a handoff whose start never
    landed stuck in `running` for good.
    """
    from temporalio.service import RPCError, RPCStatusCode

    _temporal_raising(
        RPCError("workflow not found", RPCStatusCode.NOT_FOUND, b""), monkeypatch
    )

    assert await reaper._durable_workflow_still_running("run-1") is False


async def test_unreachable_temporal_leaves_the_run_alone(monkeypatch):
    """An unclear answer must never be read as "dead"; the work may be live."""
    from temporalio.service import RPCError, RPCStatusCode

    _temporal_raising(
        RPCError("unavailable", RPCStatusCode.UNAVAILABLE, b""), monkeypatch
    )

    assert await reaper._durable_workflow_still_running("run-1") is True

    _temporal_raising(OSError("connection refused"), monkeypatch)

    assert await reaper._durable_workflow_still_running("run-1") is True
