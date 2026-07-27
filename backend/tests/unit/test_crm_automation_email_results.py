"""Regression checks for final CRM automation email outcomes."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from aexy.temporal.activities.email import (
    SendWorkflowEmailInput,
    _record_automation_email_result,
    send_workflow_email,
)


class _FakeDatabase:
    def __init__(self, run, automation):
        self.run = run
        self.automation = automation
        self.added = []

    async def get(self, _model, item_id):
        if item_id == self.run.id:
            return self.run
        if item_id == self.automation.id:
            return self.automation
        return None

    def add(self, item):
        self.added.append(item)


class _ActivityDatabase:
    def __init__(self, run=None, automation=None):
        self.run = run
        self.automation = automation
        self.commit = AsyncMock()
        self.rollback = AsyncMock()

    async def get(self, _model, item_id):
        if self.run is not None and item_id == self.run.id:
            return self.run
        if self.automation is not None and item_id == self.automation.id:
            return self.automation
        return None

    def add(self, item):
        pass


class _ActivityDatabaseContext:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, *_args):
        return False


def _run(**step_overrides):
    step = {"type": "send_email", "order": 0, "status": "queued"}
    step.update(step_overrides)
    return SimpleNamespace(
        id=str(uuid4()),
        automation_id=str(uuid4()),
        record_id=str(uuid4()),
        started_at=datetime.now(timezone.utc),
        completed_at=None,
        duration_ms=None,
        status="queued",
        error_message=None,
        steps_executed=[step],
    )


def _automation(automation_id):
    return SimpleNamespace(
        id=automation_id,
        workspace_id=str(uuid4()),
        name="Welcome Email",
        successful_runs=0,
        failed_runs=0,
    )


def _input(run, automation, **kwargs):
    base = dict(
        workspace_id=automation.workspace_id,
        to_email="alex@example.com",
        subject="Welcome",
        html_body="Hello",
        record_id=run.record_id,
        automation_run_id=run.id,
        automation_step_order=0,
    )
    base.update(kwargs)
    return SendWorkflowEmailInput(**base)


@pytest.mark.asyncio
async def test_sent_email_finishes_the_queued_run_and_records_activity():
    run = _run()
    automation = _automation(run.automation_id)
    db = _FakeDatabase(run, automation)

    await _record_automation_email_result(
        db,
        _input(run, automation),
        {"status": "sent", "to": "alex@example.com"},
    )

    assert run.status == "completed"
    assert run.steps_executed[0]["status"] == "sent"
    assert automation.successful_runs == 1
    assert db.added[0].activity_metadata["email_status"] == "sent"


@pytest.mark.asyncio
async def test_skipped_email_marks_the_run_failed_with_the_reason():
    run = _run()
    automation = _automation(run.automation_id)
    db = _FakeDatabase(run, automation)

    await _record_automation_email_result(
        db,
        _input(run, automation, to_email="not-an-email"),
        {"status": "skipped", "reason": "invalid_email", "to": "not-an-email"},
    )

    assert run.status == "failed"
    assert run.error_message == "invalid_email"
    assert run.steps_executed[0]["status"] == "failed"
    assert run.steps_executed[0]["error"] == "invalid_email"
    assert automation.failed_runs == 1
    assert db.added[0].activity_metadata["email_status"] == "not_sent"


@pytest.mark.asyncio
async def test_retried_failed_email_does_not_create_a_second_activity_entry():
    run = _run()
    automation = _automation(run.automation_id)
    db = _FakeDatabase(run, automation)
    input = _input(run, automation)
    result = {"status": "failed", "error": "provider unavailable", "to": "alex@example.com"}

    await _record_automation_email_result(db, input, result)
    await _record_automation_email_result(db, input, result)

    assert run.status == "failed"
    assert automation.failed_runs == 1
    assert len(db.added) == 1


@pytest.mark.asyncio
async def test_success_after_failed_step_recovers_the_run():
    """A delivered retry must not leave the run permanently failed.

    A send that fails and then succeeds on retry previously left the run
    stuck at failed, because the later success never cleared the earlier
    step outcome. The run must reflect the final state of each step.
    """
    run = _run(status="failed")
    run.steps_executed = [
        {
            "type": "send_email",
            "order": 0,
            "status": "failed",
            "error": "provider unavailable",
        }
    ]
    run.status = "failed"
    run.error_message = "provider unavailable"
    automation = _automation(run.automation_id)
    automation.failed_runs = 1
    db = _FakeDatabase(run, automation)

    await _record_automation_email_result(
        db,
        _input(run, automation),
        {"status": "sent", "to": "alex@example.com"},
    )

    assert run.steps_executed[0]["status"] == "sent"
    assert run.status == "completed"
    assert run.error_message is None
    assert automation.failed_runs == 0
    assert automation.successful_runs == 1


@pytest.mark.asyncio
async def test_sent_step_is_never_regressed_to_failed():
    run = _run(status="sent")
    run.steps_executed = [{"type": "send_email", "order": 0, "status": "sent"}]
    run.status = "completed"
    automation = _automation(run.automation_id)
    automation.successful_runs = 1
    db = _FakeDatabase(run, automation)

    await _record_automation_email_result(
        db,
        _input(run, automation),
        {"status": "failed", "error": "late error", "to": "alex@example.com"},
    )

    assert run.steps_executed[0]["status"] == "sent"
    assert run.status == "completed"
    assert automation.failed_runs == 0
    assert len(db.added) == 0


@pytest.mark.asyncio
async def test_sending_step_can_finalize_as_sent():
    run = _run(status="sending")
    run.steps_executed = [{"type": "send_email", "order": 0, "status": "sending"}]
    automation = _automation(run.automation_id)
    db = _FakeDatabase(run, automation)

    await _record_automation_email_result(
        db,
        _input(run, automation),
        {"status": "sent", "to": "alex@example.com"},
    )

    assert run.steps_executed[0]["status"] == "sent"
    assert run.status == "completed"


@pytest.mark.asyncio
async def test_final_send_exception_records_failure_before_raising(monkeypatch):
    activity_db = _ActivityDatabase()
    input = SendWorkflowEmailInput(
        workspace_id=str(uuid4()),
        to_email="alex@example.com",
        subject="Welcome",
        html_body="Hello",
        automation_run_id=str(uuid4()),
        automation_step_order=0,
    )
    record_result = AsyncMock()

    monkeypatch.setattr(
        "aexy.temporal.activities.email.async_session_maker",
        lambda: _ActivityDatabaseContext(activity_db),
    )
    monkeypatch.setattr(
        "aexy.temporal.activities.email._record_automation_email_result",
        record_result,
    )
    # No activity context → treated as final attempt.
    with patch(
        "aexy.services.email_campaign_service.EmailCampaignService.send_workflow_email",
        new_callable=AsyncMock,
        side_effect=ValueError("subscriber already exists"),
    ):
        with pytest.raises(ValueError, match="subscriber already exists"):
            await send_workflow_email(input)

    assert record_result.await_count == 1
    assert record_result.await_args.args[2] == {
        "status": "failed",
        "error": "subscriber already exists",
        "to": "alex@example.com",
    }
    activity_db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_intermediate_send_exception_does_not_record_failure(monkeypatch):
    run = _run()
    automation = _automation(run.automation_id)
    activity_db = _ActivityDatabase(run=run, automation=automation)
    input = _input(run, automation)
    record_result = AsyncMock()

    monkeypatch.setattr(
        "aexy.temporal.activities.email.async_session_maker",
        lambda: _ActivityDatabaseContext(activity_db),
    )
    monkeypatch.setattr(
        "aexy.temporal.activities.email._record_automation_email_result",
        record_result,
    )
    monkeypatch.setattr(
        "aexy.temporal.activities.email.activity.info",
        lambda: SimpleNamespace(
            attempt=1,
            retry_policy=SimpleNamespace(maximum_attempts=4),
        ),
    )
    with patch(
        "aexy.services.email_campaign_service.EmailCampaignService.send_workflow_email",
        new_callable=AsyncMock,
        side_effect=ValueError("provider unavailable"),
    ):
        with pytest.raises(ValueError, match="provider unavailable"):
            await send_workflow_email(input)

    record_result.assert_not_awaited()
    assert run.steps_executed[0]["status"] == "queued"


@pytest.mark.asyncio
async def test_refuse_resend_when_step_already_sending(monkeypatch):
    run = _run()
    run.steps_executed = [{"type": "send_email", "order": 0, "status": "sending"}]
    automation = _automation(run.automation_id)
    activity_db = _ActivityDatabase(run=run, automation=automation)
    input = _input(run, automation)
    send_provider = AsyncMock()

    monkeypatch.setattr(
        "aexy.temporal.activities.email.async_session_maker",
        lambda: _ActivityDatabaseContext(activity_db),
    )
    with patch(
        "aexy.services.email_campaign_service.EmailCampaignService.send_workflow_email",
        new=send_provider,
    ):
        result = await send_workflow_email(input)

    send_provider.assert_not_awaited()
    assert result["status"] == "needs_review"
    assert run.steps_executed[0]["status"] == "needs_review"
    assert run.status == "failed"
