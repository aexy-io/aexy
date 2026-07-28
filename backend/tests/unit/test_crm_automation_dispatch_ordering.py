"""Regression tests for how an automation hands an email to the worker.

Production bug: the send workflow was started inline, inside the still-open
request transaction. The worker reads the run on its own connection, so it
could reach the run before the commit and find nothing - or find the run but
not the step list, which is only written after the action returns. Either way
it logged a warning and returned, leaving the run on "queued" forever with no
CRM activity for the email.

Observed live: six consecutive runs stranded on "queued", every one logging
"No queued email step found" - the second variant, which is what actually
fires in practice.

The fix records the intent to send in the same transaction as the run, so the
row cannot exist unless the run does, and nothing is committed early.
"""

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
import sqlalchemy

from aexy.models.crm import (
    CRMAutomation,
    CRMAutomationEmailOutbox,
)
from aexy.services.crm_automation_service import CRMAutomationService

from tests.conftest import seed_workspace

pytestmark = pytest.mark.asyncio


async def _make_automation(db_session, actions, error_handling=None):
    automation = CRMAutomation(
        id=str(uuid4()),
        workspace_id=await seed_workspace(db_session),
        name="Email Automation",
        module="crm",
        object_id=None,
        trigger_type="record.created",
        trigger_config={},
        actions=actions,
        is_active=True,
    )
    if error_handling:
        automation.error_handling = error_handling
    db_session.add(automation)
    await db_session.flush()
    return automation


async def _outbox(db_session):
    return (
        (await db_session.execute(sqlalchemy.select(CRMAutomationEmailOutbox)))
        .scalars()
        .all()
    )


async def test_nothing_is_dispatched_while_the_run_is_uncommitted(db_session):
    """The core fix: the worker is not told anything during the transaction.

    Fails on the pre-fix code, which started the workflow inline.
    """
    automation = await _make_automation(
        db_session, [{"type": "send_email", "config": {"to": "a@example.com"}}]
    )
    service = CRMAutomationService(db_session)

    with patch("aexy.temporal.dispatch.dispatch", new_callable=AsyncMock) as dispatch:
        run = await service.trigger_automation(automation.id)

    dispatch.assert_not_awaited()
    assert run.status == "queued"

    # The intent is recorded instead, in this same uncommitted transaction.
    rows = await _outbox(db_session)
    assert len(rows) == 1
    assert rows[0].automation_run_id == run.id
    assert rows[0].status == "pending"
    assert rows[0].payload["to_email"] == "a@example.com"
    assert rows[0].payload["automation_step_order"] == 0
    # The variant that actually bit: the worker matches a result to a step by
    # order, so that step must already be written when the worker looks.
    assert run.steps_executed[0]["order"] == rows[0].step_order
    assert run.steps_executed[0]["status"] == "queued"


async def test_the_transaction_is_not_committed_early(db_session):
    """The whole reason for a queue table rather than committing the run early:
    the caller's transaction must stay intact."""
    automation = await _make_automation(
        db_session, [{"type": "send_email", "config": {"to": "a@example.com"}}]
    )
    service = CRMAutomationService(db_session)

    with patch("aexy.temporal.dispatch.dispatch", new_callable=AsyncMock):
        await service.trigger_automation(automation.id)

    assert db_session.in_transaction() is True


async def test_a_rolled_back_run_leaves_no_email_to_send(db_session):
    """Atomicity in the direction that matters: if the record change is undone,
    the email it would have triggered is undone with it."""
    automation = await _make_automation(
        db_session, [{"type": "send_email", "config": {"to": "a@example.com"}}]
    )
    service = CRMAutomationService(db_session)

    # Scoped to a savepoint so undoing it does not tear down the shared
    # session the rest of the suite is using.
    savepoint = await db_session.begin_nested()
    with patch("aexy.temporal.dispatch.dispatch", new_callable=AsyncMock):
        await service.trigger_automation(automation.id)
    assert await _outbox(db_session), "precondition: an email was queued"
    await savepoint.rollback()

    assert await _outbox(db_session) == []


async def test_a_failed_step_fails_the_run_even_when_configured_to_continue(db_session):
    """error_handling="continue" keeps later steps running, but the run must
    still report the truth: a failed step means a failed run."""
    automation = await _make_automation(
        db_session,
        [
            {"type": "update_record", "config": {}},
            {"type": "create_task", "config": {}},
        ],
        error_handling="continue",
    )
    service = CRMAutomationService(db_session)
    service._execute_action = AsyncMock(
        side_effect=[ValueError("step blew up"), {"success": True}]
    )

    run = await service.trigger_automation(automation.id)

    assert [step["status"] for step in run.steps_executed] == ["failed", "success"]
    assert run.status == "failed", "run reported success while its own steps say otherwise"
    assert "step blew up" in (run.error_message or "")
