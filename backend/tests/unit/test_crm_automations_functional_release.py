"""Functional-release contract checks for truthful CRM automation steps."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from aexy.models.developer import Developer
from aexy.models.workspace import Workspace
from aexy.schemas.automation import (
    STRUCTURAL_CAPABILITIES,
    UNAVAILABLE_ACTION_REASONS,
    UNAVAILABLE_TRIGGER_REASONS,
    get_action_ids,
)
from aexy.schemas.workflow import WorkflowExecutionContext
from aexy.services.workflow_actions import WorkflowActionHandler
from aexy.services.crm_automation_service import CRMAutomationService
from aexy.services.workflow_service import WorkflowService
from aexy.temporal.activities.workflow_actions import _as_run_steps
from aexy.temporal.workflows.crm_workflow import CRMAutomationWorkflow


def _context(**overrides):
    values = {
        "workspace_id": "ws-1",
        "record_id": "rec-1",
        "record_data": {
            "id": "rec-1",
            "values": {
                "name": "Ada",
                "phone": "+14155552671",
                "status": "qualified",
            },
        },
        "trigger_data": {
            "event": "record.updated",
            "execution_id": "run-1",
            "node_id": "node-1",
        },
        "variables": {"previous": {"output": {"score": 91}}},
        "is_dry_run": False,
    }
    values.update(overrides)
    return WorkflowExecutionContext(**values)


def _inline_run_fixture(actions, error_handling="retry"):
    automation = SimpleNamespace(
        id="automation-1",
        workspace_id="workspace-1",
        conditions=[],
        actions=actions,
        error_handling=error_handling,
        total_runs=0,
        runs_this_month=0,
        successful_runs=0,
        failed_runs=0,
        last_run_at=None,
        created_by_id=None,
    )
    run = SimpleNamespace(
        id="run-1",
        status="pending",
        steps_executed=[],
        trigger_data={},
        started_at=None,
        completed_at=None,
        duration_ms=None,
        error_message=None,
    )
    return automation, run


def test_registry_exposes_release_capabilities_and_documents_exclusions():
    visible = set(get_action_ids("crm"))
    assert {
        "send_sms",
        "webhook_call",
        "create_task",
        "run_agent",
        "wait",
        "condition",
        "branch",
    } <= visible
    assert UNAVAILABLE_ACTION_REASONS
    assert UNAVAILABLE_TRIGGER_REASONS
    assert all(reason.strip() for reason in UNAVAILABLE_ACTION_REASONS.values())
    assert all(reason.strip() for reason in UNAVAILABLE_TRIGGER_REASONS.values())


def test_every_visible_registry_action_has_a_published_executor():
    visible = set(get_action_ids("crm"))
    structural = set(STRUCTURAL_CAPABILITIES)
    ordinary_actions = visible - structural

    assert ordinary_actions <= set(WorkflowActionHandler.ACTION_HANDLER_METHODS)
    assert ordinary_actions <= set(CRMAutomationService.INLINE_ACTION_TYPES)
    assert set(STRUCTURAL_CAPABILITIES.values()) <= {
        "condition",
        "wait",
        "agent",
        "branch",
    }


def test_nested_dynamic_variable_namespaces_are_validated():
    service = WorkflowService(db=None)
    node = {
        "id": "webhook",
        "type": "action",
        "data": {
            "action_type": "webhook_call",
            "webhook_url": "https://example.com",
            "headers": {"Authorization": "Bearer {{secrets.token}}"},
        },
    }

    errors = service._validate_node(node)

    assert any(error.error_type == "unknown_variable_namespace" for error in errors)


@pytest.mark.parametrize(
    "node,error_type",
    [
        (
            {
                "id": "trigger",
                "type": "trigger",
                "data": {"trigger_type": "unknown.trigger"},
            },
            "unknown_trigger_type",
        ),
        (
            {
                "id": "action",
                "type": "action",
                "data": {"action_type": "unknown_action"},
            },
            "unknown_action_type",
        ),
        (
            {"id": "mystery", "type": "mystery", "data": {}},
            "unsupported_node_type",
        ),
    ],
)
def test_unknown_registry_values_fail_validation(node, error_type):
    service = WorkflowService(db=None)
    nodes = [
        {
            "id": "valid-trigger",
            "type": "trigger",
            "data": {"trigger_type": "record.created"},
        },
        node,
    ]
    if node["type"] == "trigger":
        nodes = [node]

    result = service.validate_workflow(nodes, [])

    assert any(error.error_type == error_type for error in result.errors)


@pytest.mark.asyncio
async def test_missing_agent_is_rejected_before_publication(db_session):
    service = WorkflowService(db_session)
    errors = await service.validate_agent_references(
        [
            {
                "id": "agent-node",
                "type": "agent",
                "data": {"agent_id": str(uuid4())},
            }
        ],
        str(uuid4()),
    )

    assert [error.error_type for error in errors] == ["missing_agent"]


def test_missing_dynamic_value_fails_instead_of_becoming_empty():
    handler = WorkflowActionHandler(MagicMock())

    with pytest.raises(ValueError, match="record.values.missing"):
        handler._render_template("Hello {{record.values.missing}}", _context())


@pytest.mark.asyncio
async def test_sms_resolves_record_field_and_reports_provider_acceptance():
    handler = WorkflowActionHandler(MagicMock())
    provider = AsyncMock(
        return_value={"sid": "SM123", "status": "queued", "to": "+14155552671"}
    )

    with patch(
        "aexy.services.twilio_service.TwilioService.send_sms",
        new=provider,
    ):
        result = await handler.execute_action(
            "send_sms",
            {
                "recipient_type": "field",
                "phone_field": "phone",
                "message_template": "Hello {{record.values.name}}",
            },
            _context(),
        )

    assert result.status == "success"
    assert result.output["provider_message_id"] == "SM123"
    assert result.output["accepted"] is True
    assert provider.await_args.kwargs["body"] == "Hello Ada"


@pytest.mark.asyncio
async def test_sms_refusal_is_a_failed_step():
    handler = WorkflowActionHandler(MagicMock())
    provider = AsyncMock(
        return_value={"error": "recipient blocked", "status": "failed"}
    )

    with patch(
        "aexy.services.twilio_service.TwilioService.send_sms",
        new=provider,
    ):
        result = await handler.execute_action(
            "send_sms",
            {
                "recipient_type": "literal",
                "phone_number": "+14155552671",
                "message_template": "Hello",
            },
            _context(),
        )

    assert result.status == "failed"
    assert "recipient blocked" in result.error


@pytest.mark.asyncio
async def test_webhook_uses_dynamic_headers_timeout_and_safe_history():
    captured = {}

    class FakeResponse:
        status_code = 202
        is_success = True
        text = '{"accepted":true}'

    class FakeClient:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def request(self, **kwargs):
            captured.update(kwargs)
            return FakeResponse()

    handler = WorkflowActionHandler(MagicMock())
    with patch("aexy.services.workflow_actions.httpx.AsyncClient", FakeClient):
        result = await handler.execute_action(
            "webhook_call",
            {
                "webhook_url": "https://hooks.example.test/aexy",
                "http_method": "POST",
                "headers": '{"Authorization":"Bearer {{trigger.token}}"}',
                "body_template": '{"name":"{{record.values.name}}"}',
                "timeout_seconds": 7,
            },
            _context(
                trigger_data={
                    "token": "secret-token",
                    "execution_id": "run-1",
                    "node_id": "node-1",
                }
            ),
        )

    assert result.status == "success"
    assert captured["timeout"] == 7
    assert captured["headers"]["Authorization"] == "Bearer secret-token"
    assert captured["headers"]["Idempotency-Key"] == "aexy-run-1-node-1"
    assert captured["json"] == {"name": "Ada"}
    assert "headers" not in result.output
    assert "secret-token" not in str(result.output)


@pytest.mark.asyncio
async def test_webhook_non_2xx_is_a_failed_step():
    class FakeResponse:
        status_code = 503
        is_success = False
        text = "unavailable"

    class FakeClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def request(self, **_kwargs):
            return FakeResponse()

    handler = WorkflowActionHandler(MagicMock())
    with patch("aexy.services.workflow_actions.httpx.AsyncClient", FakeClient):
        result = await handler.execute_action(
            "webhook_call",
            {
                "webhook_url": "https://hooks.example.test/aexy",
                "http_method": "POST",
                "body_template": "{}",
            },
            _context(),
        )

    assert result.status == "failed"
    assert result.error == "Webhook returned HTTP 503"


@pytest.mark.asyncio
async def test_task_retry_identity_deduplicates_creation(db_session):
    owner = Developer(name="Owner", email=f"{uuid4().hex}@example.com")
    db_session.add(owner)
    await db_session.flush()
    workspace = Workspace(
        id=str(uuid4()),
        name="Automation Test",
        slug=f"automation-{uuid4().hex[:8]}",
        owner_id=owner.id,
    )
    db_session.add(workspace)
    await db_session.flush()

    handler = WorkflowActionHandler(db_session)
    context = _context(
        workspace_id=workspace.id,
        record_id=None,
        record_data={},
    )
    data = {
        "task_title": "Follow up with {{trigger.company}}",
        "task_description": "Created by automation",
        "due_in_value": 2,
        "due_in_unit": "days",
    }
    context.trigger_data["company"] = "Aexy"

    first = await handler.execute_action("create_task", data, context)
    await db_session.commit()
    db_session.expire_all()
    second = await handler.execute_action("create_task", data, context)

    assert first.status == "success"
    assert first.output["created"] is True
    assert second.status == "success"
    assert second.output["task_id"] == first.output["task_id"]
    assert second.output["deduplicated"] is True


@pytest.mark.asyncio
async def test_existing_agent_executes_and_exposes_output_for_downstream_steps():
    execution = SimpleNamespace(
        id="agent-execution-1",
        status="completed",
        output_result={"summary": "Qualified lead"},
        duration_ms=42,
        error_message=None,
    )
    spawn = AsyncMock(return_value=execution)
    handler = WorkflowActionHandler(MagicMock())
    context = _context()

    with patch(
        "aexy.services.automation_agent_service.AutomationAgentService.spawn_agent",
        new=spawn,
    ):
        result = await handler.execute_action(
            "run_agent",
            {
                "agent_id": "agent-1",
                "input_mapping": {
                    "contact_name": "record.values.name",
                    "previous_score": "variables.previous.output.score",
                },
                "output_variable": "agent_result",
                "timeout_seconds": 30,
            },
            context,
        )

    assert result.status == "success"
    assert result.output["result"] == {"summary": "Qualified lead"}
    assert result.output["duration_ms"] == 42
    assert context.variables["agent_result"] == {"summary": "Qualified lead"}
    assert (
        handler._render_template(
            "{{variables.agent_result.summary}}", context
        )
        == "Qualified lead"
    )
    assert spawn.await_args.kwargs["context"]["contact_name"] == "Ada"
    assert spawn.await_args.kwargs["context"]["previous_score"] == 91


@pytest.mark.asyncio
async def test_agent_missing_input_is_a_failed_step():
    handler = WorkflowActionHandler(MagicMock())
    result = await handler.execute_action(
        "run_agent",
        {
            "agent_id": "agent-1",
            "input_mapping": {"required": "record.values.missing"},
        },
        _context(),
    )

    assert result.status == "failed"
    assert "could not resolve" in result.error


@pytest.mark.asyncio
async def test_agent_generation_failure_is_readable():
    handler = WorkflowActionHandler(MagicMock())
    with patch(
        "aexy.services.automation_agent_service.AutomationAgentService.spawn_agent",
        new=AsyncMock(side_effect=RuntimeError("model generation failed")),
    ):
        result = await handler.execute_action(
            "run_agent",
            {"agent_id": "agent-1"},
            _context(),
        )

    assert result.status == "failed"
    assert result.error == "Agent execution failed: model generation failed"


def test_agent_retry_policy_is_bounded_to_three_attempts():
    retry_policy = CRMAutomationWorkflow._step_retry_policy(True)
    no_retry_policy = CRMAutomationWorkflow._step_retry_policy(False)

    assert retry_policy.maximum_attempts == 3
    assert no_retry_policy.maximum_attempts == 1


@pytest.mark.asyncio
async def test_inline_retry_exhaustion_records_every_attempt_and_fails_run():
    service = CRMAutomationService(MagicMock())
    service.db.flush = AsyncMock()
    automation, run = _inline_run_fixture(
        [{"type": "webhook_call", "config": {"webhook_url": "https://example.com"}}]
    )

    with patch.object(
        service,
        "_execute_action",
        new=AsyncMock(return_value={"error": "receiver unavailable"}),
    ) as execute:
        await service._execute_automation(automation, run, record_id=None)

    assert execute.await_count == 3
    assert run.status == "failed"
    assert run.steps_executed[0]["attempts"] == 3
    assert [
        attempt["status"]
        for attempt in run.steps_executed[0]["attempt_history"]
    ] == ["failed", "failed", "failed"]


@pytest.mark.asyncio
async def test_retry_does_not_repeat_an_earlier_successful_side_effect():
    service = CRMAutomationService(MagicMock())
    service.db.flush = AsyncMock()
    automation, run = _inline_run_fixture(
        [
            {"type": "send_sms", "config": {"message_template": "first"}},
            {"type": "webhook_call", "config": {"webhook_url": "https://example.com"}},
        ]
    )
    calls = []

    async def execute(action_type, *_args, **_kwargs):
        calls.append(action_type)
        if action_type == "webhook_call" and calls.count("webhook_call") == 1:
            return {"error": "temporary refusal"}
        return {"accepted": True, "to": "+14155552671"}

    with patch.object(service, "_execute_action", side_effect=execute):
        await service._execute_automation(automation, run, record_id=None)

    assert calls == ["send_sms", "webhook_call", "webhook_call"]
    assert run.status == "completed"
    assert run.steps_executed[0]["attempts"] == 1
    assert run.steps_executed[1]["attempts"] == 2


def test_branch_uses_first_match_then_else_and_logs_selected_rule():
    workflow = CRMAutomationWorkflow()
    data = {
        "branches": [
            {
                "id": "qualified",
                "label": "Qualified",
                "field": "record.values.status",
                "operator": "equals",
                "value": "qualified",
            },
            {
                "id": "also-qualified",
                "label": "Second match",
                "field": "record.values.status",
                "operator": "equals",
                "value": "qualified",
            },
            {"id": "else", "label": "Else", "is_else": True},
        ]
    }
    context = {
        "record_data": {"id": "rec-1", "values": {"status": "qualified"}},
        "trigger_data": {},
        "variables": {},
    }

    selected = workflow._evaluate_branches(data, context)
    context["record_data"]["values"]["status"] = "cold"
    fallback = workflow._evaluate_branches(data, context)

    assert selected == {
        "branch_id": "qualified",
        "path_label": "Qualified",
        "rule_index": 0,
        "matched": True,
    }
    assert fallback["branch_id"] == "else"
    assert fallback["path_label"] == "Else"
    assert fallback["matched"] is False


def test_durable_run_history_preserves_attempts_and_agent_summary():
    steps = _as_run_steps(
        [
            {
                "node_id": "agent-1",
                "type": "run_agent",
                "status": "completed",
                "attempts": 2,
                "output": {
                    "execution_id": "execution-1",
                    "status": "completed",
                    "output": {"summary": "done"},
                    "duration_ms": 51,
                },
            }
        ]
    )

    assert steps[0]["attempts"] == 2
    assert steps[0]["result"]["output"]["summary"] == "done"
    assert steps[0]["result"]["duration_ms"] == 51
