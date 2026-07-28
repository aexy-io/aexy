"""US-7.3 settings + action-layer honesty (required fields, email, dry-run)."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from aexy.models.crm import CRMAutomation
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace
from aexy.schemas.workflow import WorkflowExecutionContext
from aexy.services.crm_automation_service import CRMAutomationService
from aexy.services.workflow_actions import WorkflowActionHandler
from aexy.services.workflow_service import validate_action_configs


# ---------------------------------------------------------------------------
# Settings persistence + semantics
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_settings_round_trip_error_handling_and_run_cap(db_session):
    owner = Developer(name="Owner", email=f"o-{uuid4().hex[:8]}@ex.com")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(
        id=str(uuid4()),
        name="W",
        slug=f"w-{uuid4().hex[:6]}",
        owner_id=owner.id,
    )
    db_session.add(ws)
    await db_session.flush()

    service = CRMAutomationService(db_session)
    created = await service.create_automation(
        workspace_id=ws.id,
        name="capped",
        trigger_type="record.created",
        trigger_config={},
        actions=[{"type": "update_record", "config": {"update_field": "stage", "update_value": "x"}}],
        error_handling="retry",
        run_limit_per_month=5,
        is_active=True,
        created_by_id=owner.id,
    )
    await db_session.flush()

    loaded = await service.get_automation(created.id)
    assert loaded.error_handling == "retry"
    assert loaded.run_limit_per_month == 5

    updated = await service.update_automation(
        created.id, error_handling="continue", run_limit_per_month=12
    )
    assert updated.error_handling == "continue"
    assert updated.run_limit_per_month == 12


@pytest.mark.asyncio
async def test_run_cap_blocks_when_exceeded(db_session):
    owner = Developer(name="Owner", email=f"o-{uuid4().hex[:8]}@ex.com")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(
        id=str(uuid4()), name="W", slug=f"w-{uuid4().hex[:6]}", owner_id=owner.id
    )
    db_session.add(ws)
    await db_session.flush()

    service = CRMAutomationService(db_session)
    auto = await service.create_automation(
        workspace_id=ws.id,
        name="limited",
        trigger_type="record.created",
        trigger_config={},
        actions=[{"type": "update_record", "config": {"update_field": "n", "update_value": "1"}}],
        error_handling="stop",
        run_limit_per_month=1,
        is_active=True,
    )
    auto.runs_this_month = 1
    await db_session.flush()

    with pytest.raises(ValueError, match="run limit"):
        await service.trigger_automation(auto.id, record_id=None, trigger_data={})


@pytest.mark.asyncio
async def test_error_handling_stop_halts_after_failed_step():
    service = CRMAutomationService(MagicMock())
    service.db.flush = AsyncMock()
    auto = SimpleNamespace(
        id="a1",
        workspace_id="ws",
        conditions=[],
        actions=[
            {"type": "update_record", "config": {}},  # will error: no field
            {"type": "create_task", "config": {"title": "never"}},
        ],
        error_handling="stop",
        total_runs=0,
        runs_this_month=0,
        successful_runs=0,
        failed_runs=0,
        last_run_at=None,
        created_by_id=None,
    )
    run = SimpleNamespace(
        id="r1",
        status="pending",
        steps_executed=[],
        trigger_data={},
        started_at=None,
        completed_at=None,
        duration_ms=None,
        error_message=None,
    )

    with patch.object(
        service,
        "_execute_action",
        new=AsyncMock(side_effect=[{"error": "boom"}, {"task_id": "t1"}]),
    ):
        await service._execute_automation(auto, run, record_id=None)

    assert run.status == "failed"
    assert len(run.steps_executed) == 1
    assert run.steps_executed[0]["status"] == "failed"


@pytest.mark.asyncio
async def test_error_handling_continue_runs_remaining_steps():
    service = CRMAutomationService(MagicMock())
    service.db.flush = AsyncMock()
    auto = SimpleNamespace(
        id="a1",
        workspace_id="ws",
        conditions=[],
        actions=[
            {"type": "update_record", "config": {}},
            {"type": "create_task", "config": {"title": "ok"}},
        ],
        error_handling="continue",
        total_runs=0,
        runs_this_month=0,
        successful_runs=0,
        failed_runs=0,
        last_run_at=None,
        created_by_id=None,
    )
    run = SimpleNamespace(
        id="r1",
        status="pending",
        steps_executed=[],
        trigger_data={},
        started_at=None,
        completed_at=None,
        duration_ms=None,
        error_message=None,
    )

    async def fake_action(action_type, config, record, workspace_id, **kwargs):
        if action_type == "update_record":
            return {"error": "no field"}
        return {"task_id": "t1"}

    with patch.object(service, "_execute_action", side_effect=fake_action):
        await service._execute_automation(auto, run, record_id=None)

    assert len(run.steps_executed) == 2
    assert run.steps_executed[0]["status"] == "failed"
    assert run.steps_executed[1]["status"] == "success"
    assert run.status == "failed"  # overall failed but both ran


@pytest.mark.asyncio
async def test_error_handling_retry_retries_once_then_succeeds():
    service = CRMAutomationService(MagicMock())
    service.db.flush = AsyncMock()
    auto = SimpleNamespace(
        id="a1",
        workspace_id="ws",
        conditions=[],
        actions=[{"type": "create_task", "config": {"title": "x"}}],
        error_handling="retry",
        total_runs=0,
        runs_this_month=0,
        successful_runs=0,
        failed_runs=0,
        last_run_at=None,
        created_by_id=None,
    )
    run = SimpleNamespace(
        id="r1",
        status="pending",
        steps_executed=[],
        trigger_data={},
        started_at=None,
        completed_at=None,
        duration_ms=None,
        error_message=None,
    )
    calls = {"n": 0}

    async def flaky(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            return {"error": "transient"}
        return {"task_id": "t1"}

    with patch.object(service, "_execute_action", side_effect=flaky):
        await service._execute_automation(auto, run, record_id=None)

    assert calls["n"] == 2
    assert run.steps_executed[0]["status"] == "success"
    assert run.steps_executed[0].get("retried") is True


# ---------------------------------------------------------------------------
# Action required-field + email honesty
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "action_type,good_config",
    [
        ("send_email", {"to": "ada@example.com", "email_body": "hi"}),
        ("create_task", {"task_title": "Do thing"}),
        ("create_record", {"target_object_id": "obj-1"}),
        ("update_record", {"update_field": "stage", "update_value": "won"}),
        ("delete_record", {"confirm_delete": True}),
        ("assign_owner", {"owner_email": "boss@example.com"}),
        ("link_records", {"link_record_id": "rec-2", "relation_type": "related"}),
        ("send_slack", {"channel": "C1", "message_template": "hi"}),
        ("enroll_in_sequence", {"sequence_id": "seq-1"}),
        ("remove_from_sequence", {"sequence_id": "seq-1"}),
        ("notify_user", {"notify_email": "ada@example.com"}),
        ("add_to_list", {"list_id": "list-1"}),
        ("webhook_call", {"webhook_url": "https://example.com/hook"}),
    ],
)
def test_action_config_accepted_when_panel_fields_present(action_type, good_config):
    errors = validate_action_configs([{"type": action_type, "config": good_config}])
    assert errors == [], errors


@pytest.mark.parametrize(
    "action_type,bad_config",
    [
        ("send_email", {}),
        ("create_task", {}),
        ("create_record", {}),
        ("update_record", {}),
        ("delete_record", {}),
        ("assign_owner", {}),
        ("link_records", {}),
        ("send_slack", {}),
        ("enroll_in_sequence", {}),
        ("notify_user", {}),
        ("webhook_call", {}),
    ],
)
def test_action_config_rejected_when_required_panel_fields_missing(action_type, bad_config):
    errors = validate_action_configs([{"type": action_type, "config": bad_config}])
    assert errors, f"expected validation errors for {action_type}"


def test_malformed_email_rejected_on_direct_api_config_path():
    errors = validate_action_configs(
        [{"type": "send_email", "config": {"to": "not-an-email", "email_body": "x"}}]
    )
    assert any("not a valid email" in e for e in errors)


@pytest.mark.asyncio
async def test_run_agent_dry_run_message_is_not_simulated():
    handler = WorkflowActionHandler(MagicMock())
    ctx = WorkflowExecutionContext(
        workspace_id="ws",
        record_id=None,
        record_data={},
        trigger_data={},
        variables={},
        is_dry_run=True,
    )
    result = await handler.execute_action("run_agent", {"agent_id": "a"}, ctx)
    assert result.status == "skipped"
    assert result.output["message"] == "skipped — not simulated"


@pytest.mark.asyncio
async def test_delete_result_says_archived():
    service = CRMAutomationService(MagicMock())
    record_service = MagicMock()
    record_service.delete_record = AsyncMock(return_value=True)
    with patch(
        "aexy.services.crm_automation_service.CRMRecordService",
        return_value=record_service,
    ):
        result = await service._action_delete_record(
            {"confirm_delete": True}, SimpleNamespace(id="r1")
        )
    assert result["archived"] is True
    assert result["message"] == "archived"
