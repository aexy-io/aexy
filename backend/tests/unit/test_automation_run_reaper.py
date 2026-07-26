"""The stalled-run reaper must decide a run only when nothing else can.

Needs real JSONB, so it runs against the Postgres test DB:
    TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/aexy_test
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
    )
    db.add(run)
    await db.flush()
    # created_at is server_default now(); the reaper filters on it, so age has
    # to be forced explicitly.
    await db.execute(
        text("UPDATE crm_automation_runs SET created_at = :t WHERE id = :i"),
        {"t": created_at, "i": run.id},
    )
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
