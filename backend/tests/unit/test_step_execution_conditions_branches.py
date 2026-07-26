"""US-4.1 / 4.2 / 4.3: conditions route, branches select, waits resolve units."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from aexy.schemas.workflow import WorkflowExecutionContext
from aexy.services.crm_automation_service import CRMAutomationService
from aexy.services.workflow_service import WorkflowExecutor


def _ctx(values=None, is_dry_run=False):
    return WorkflowExecutionContext(
        workspace_id="ws-1",
        record_id="rec-1",
        record_data={"id": "rec-1", "values": values or {"stage": "won", "amount": 100}},
        trigger_data={},
        variables={},
        is_dry_run=is_dry_run,
    )


@pytest.mark.asyncio
async def test_condition_node_takes_true_path_when_field_matches():
    executor = WorkflowExecutor(MagicMock())
    result = await executor._execute_condition(
        {
            "conditions": [
                {"field": "record.values.stage", "operator": "equals", "value": "won"}
            ],
            "conjunction": "and",
        },
        _ctx(),
    )
    assert result.status == "success"
    assert result.condition_result is True


@pytest.mark.asyncio
async def test_condition_node_takes_false_path_when_field_mismatches():
    executor = WorkflowExecutor(MagicMock())
    result = await executor._execute_condition(
        {
            "conditions": [
                {"attribute": "stage", "operator": "equals", "value": "lost"}
            ]
        },
        _ctx(),
    )
    assert result.status == "success"
    assert result.condition_result is False


@pytest.mark.asyncio
async def test_condition_unknown_operator_fails_the_step():
    executor = WorkflowExecutor(MagicMock())
    result = await executor._execute_condition(
        {"conditions": [{"field": "stage", "operator": "spaceship", "value": 1}]},
        _ctx(),
    )
    assert result.status == "failed"
    assert "Unknown condition operator" in (result.error or "")


@pytest.mark.asyncio
async def test_crm_automation_conditions_true_path_allows_run():
    """Published automation-level conditions must not always evaluate false."""
    service = CRMAutomationService(MagicMock())
    record = SimpleNamespace(values={"stage": "qualified"})
    ok = await service._evaluate_conditions(
        [{"field": "stage", "operator": "equals", "value": "qualified"}],
        record,
    )
    assert ok is True
    blocked = await service._evaluate_conditions(
        [{"attribute": "stage", "operator": "equals", "value": "lost"}],
        record,
    )
    assert blocked is False


@pytest.mark.asyncio
async def test_branch_selects_path_by_selection_rule():
    executor = WorkflowExecutor(MagicMock())
    result = await executor._execute_branch(
        {
            "branches": [
                {
                    "id": "high",
                    "conditions": [
                        {"field": "amount", "operator": "gte", "value": 50}
                    ],
                },
                {"id": "low", "conditions": []},
            ]
        },
        _ctx({"amount": 100}),
    )
    assert result.status == "success"
    assert result.selected_branch == "high"
    assert result.output["mode"] == "exclusive"


@pytest.mark.asyncio
async def test_branch_falls_back_to_unnamed_default_when_no_rule_matches():
    executor = WorkflowExecutor(MagicMock())
    result = await executor._execute_branch(
        {
            "branches": [
                {
                    "id": "vip",
                    "rules": [{"field": "tier", "operator": "equals", "value": "gold"}],
                },
                {"id": "default", "name": "default"},  # no rules
            ]
        },
        _ctx({"tier": "bronze"}),
    )
    assert result.selected_branch == "default"


@pytest.mark.asyncio
async def test_branch_with_only_named_paths_selects_first_fallback():
    """Builder historically saved named paths with no rules — must not select none."""
    executor = WorkflowExecutor(MagicMock())
    result = await executor._execute_branch(
        {"paths": [{"name": "Path A"}, {"name": "Path B"}]},
        _ctx(),
    )
    assert result.selected_branch == "Path A"


@pytest.mark.asyncio
async def test_wait_reports_duration_seconds_for_days_hours_minutes_zero():
    executor = WorkflowExecutor(MagicMock())
    for unit, value, seconds in [
        ("days", 7, 7 * 86400),
        ("hours", 3, 3 * 3600),
        ("minutes", 15, 15 * 60),
        ("days", 0, 0),
    ]:
        result = await executor._execute_wait(
            {"wait_type": "duration", "duration_value": value, "duration_unit": unit},
            _ctx(is_dry_run=False),
        )
        assert result.status == "success"
        assert result.output["duration_seconds"] == seconds


@pytest.mark.asyncio
async def test_wait_accepts_legacy_duration_amount_key():
    executor = WorkflowExecutor(MagicMock())
    result = await executor._execute_wait(
        {"wait_type": "duration", "duration_amount": 7, "duration_unit": "days"},
        _ctx(),
    )
    assert result.output["duration_seconds"] == 7 * 86400


@pytest.mark.asyncio
async def test_wait_and_agent_dry_run_report_not_simulated():
    executor = WorkflowExecutor(MagicMock())
    wait = await executor._execute_wait(
        {"wait_type": "duration", "duration_value": 1, "duration_unit": "days"},
        _ctx(is_dry_run=True),
    )
    assert wait.status == "skipped"
    assert wait.output["message"] == "skipped — not simulated"

    agent = await executor._execute_agent({"agent_id": "a1"}, _ctx(is_dry_run=True))
    assert agent.status == "skipped"
    assert agent.output["message"] == "skipped — not simulated"
