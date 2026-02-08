"""CRM Automation Workflow - replaces SyncWorkflowExecutor.

This Temporal workflow replaces:
- SyncWorkflowExecutor (652 lines)
- SyncWorkflowEventService (153 lines)
- SyncWorkflowRetryService (246 lines)
- WorkflowEventSubscription polling
- check_paused_workflows polling task
- check_event_subscription_timeouts polling
- process_workflow_retries polling

Key improvements:
- Instant resume via signals (replaces 60s polling)
- Durable timers (no DB-based state machine)
- Automatic retry (no custom retry service)
- Single-writer guarantee (no race conditions)
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from aexy.temporal.dispatch import STANDARD_RETRY, LLM_RETRY

logger = logging.getLogger(__name__)


@dataclass
class CRMWorkflowInput:
    execution_id: str
    workflow_id: str
    workspace_id: str
    trigger_data: dict[str, Any] = field(default_factory=dict)
    record_id: str | None = None
    record_data: dict[str, Any] = field(default_factory=dict)
    nodes: list[dict[str, Any]] = field(default_factory=list)
    edges: list[dict[str, Any]] = field(default_factory=list)
    execution_order: list[str] = field(default_factory=list)


@dataclass
class CRMWorkflowResult:
    status: str
    results: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    error_node_id: str | None = None


@workflow.defn
class CRMAutomationWorkflow:
    """Temporal workflow replacing the custom SyncWorkflowExecutor state machine."""

    def __init__(self):
        self._event_received = False
        self._event_data: dict[str, Any] = {}
        self._status: dict[str, Any] = {"status": "running"}

    @workflow.signal
    async def on_event(self, event_type: str, event_data: dict):
        """Signal handler - replaces WorkflowEventSubscription + polling."""
        self._event_data = {"type": event_type, "data": event_data}
        self._event_received = True

    @workflow.query
    def get_status(self) -> dict:
        """Query current execution state - replaces DB polling."""
        return self._status

    @workflow.run
    async def run(self, input: CRMWorkflowInput) -> CRMWorkflowResult:
        node_map = {n["id"]: n for n in input.nodes}
        execution_order = input.execution_order or [n["id"] for n in input.nodes]

        context: dict[str, Any] = {
            "record_data": input.record_data,
            "variables": {},
            "executed_nodes": [],
            "workspace_id": input.workspace_id,
            "execution_id": input.execution_id,
        }
        skip_nodes: set[str] = set()
        results: list[dict[str, Any]] = []

        for node_id in execution_order:
            if node_id in skip_nodes:
                continue

            node = node_map.get(node_id)
            if not node:
                continue

            node_type = node.get("type")
            data = node.get("data", {})

            self._status = {
                "status": "running",
                "current_node": node_id,
                "node_type": node_type,
            }

            try:
                if node_type == "trigger":
                    context["variables"][node_id] = input.trigger_data
                    results.append({"node_id": node_id, "status": "completed", "type": "trigger"})

                elif node_type == "action":
                    result = await workflow.execute_activity(
                        "execute_workflow_action",
                        {
                            "node_type": node_type,
                            "node_data": data,
                            "context": context,
                            "execution_id": input.execution_id,
                            "workspace_id": input.workspace_id,
                            "record_id": input.record_id,
                        },
                        start_to_close_timeout=timedelta(minutes=5),
                        retry_policy=STANDARD_RETRY,
                    )
                    context["variables"][node_id] = result
                    results.append({"node_id": node_id, "status": "completed", "output": result})

                elif node_type == "condition":
                    condition_result = self._evaluate_condition(data, context)
                    results.append({
                        "node_id": node_id, "status": "completed",
                        "condition_result": condition_result,
                    })

                    if not condition_result:
                        true_targets = self._get_branch_targets(node_id, input.edges, "true")
                        downstream = self._get_downstream_nodes(true_targets, input.edges, node_map)
                        skip_nodes.update(downstream)
                    else:
                        false_targets = self._get_branch_targets(node_id, input.edges, "false")
                        downstream = self._get_downstream_nodes(false_targets, input.edges, node_map)
                        skip_nodes.update(downstream)

                elif node_type == "wait":
                    wait_type = data.get("wait_type", "duration")

                    if wait_type == "duration":
                        duration = self._calculate_duration(data)
                        self._status = {"status": "waiting", "wait_type": "duration", "seconds": duration}
                        await workflow.sleep(duration)

                    elif wait_type == "event":
                        event_type = data.get("event_type", "")
                        timeout_hours = data.get("timeout_hours", 24)
                        self._event_received = False
                        self._status = {"status": "waiting", "wait_type": "event", "event_type": event_type}

                        try:
                            await workflow.wait_condition(
                                lambda: self._event_received,
                                timeout=timedelta(hours=timeout_hours),
                            )
                            context["variables"][node_id] = self._event_data
                            results.append({"node_id": node_id, "status": "completed", "event_data": self._event_data})
                        except asyncio.TimeoutError:
                            results.append({"node_id": node_id, "status": "timed_out"})
                            return CRMWorkflowResult(
                                status="failed",
                                results=results,
                                error=f"Timeout waiting for event: {event_type}",
                                error_node_id=node_id,
                            )
                    else:
                        results.append({"node_id": node_id, "status": "completed"})

                elif node_type == "branch":
                    selected = self._evaluate_branches(data, context)
                    results.append({"node_id": node_id, "status": "completed", "selected_branch": selected})

                    all_branches = self._get_all_branch_targets(node_id, input.edges)
                    for branch_id, targets in all_branches.items():
                        if branch_id != selected:
                            downstream = self._get_downstream_nodes(targets, input.edges, node_map)
                            skip_nodes.update(downstream)

                elif node_type == "agent":
                    result = await workflow.execute_activity(
                        "execute_agent",
                        {
                            "agent_id": data.get("agent_id", ""),
                            "record_id": input.record_id,
                            "context": context,
                            "triggered_by": "workflow",
                            "trigger_id": input.execution_id,
                        },
                        start_to_close_timeout=timedelta(minutes=10),
                        retry_policy=LLM_RETRY,
                    )
                    context["variables"][node_id] = result
                    results.append({"node_id": node_id, "status": "completed", "output": result})

                else:
                    results.append({"node_id": node_id, "status": "completed", "type": node_type})

                context["executed_nodes"].append(node_id)

            except Exception as e:
                logger.error(f"Workflow node {node_id} failed: {e}")
                return CRMWorkflowResult(
                    status="failed",
                    results=results,
                    error=str(e),
                    error_node_id=node_id,
                )

        self._status = {"status": "completed"}
        return CRMWorkflowResult(status="completed", results=results)

    def _evaluate_condition(self, data: dict, context: dict) -> bool:
        """Evaluate a condition node."""
        field_path = data.get("field", "")
        operator = data.get("operator", "equals")
        value = data.get("value", "")

        actual_value = self._resolve_field(field_path, context)

        if operator == "equals":
            return str(actual_value) == str(value)
        elif operator == "not_equals":
            return str(actual_value) != str(value)
        elif operator == "contains":
            return str(value) in str(actual_value)
        elif operator == "is_empty":
            return not actual_value
        elif operator == "is_not_empty":
            return bool(actual_value)
        elif operator == "greater_than":
            try:
                return float(actual_value or 0) > float(value or 0)
            except (ValueError, TypeError):
                return False
        elif operator == "less_than":
            try:
                return float(actual_value or 0) < float(value or 0)
            except (ValueError, TypeError):
                return False

        return True

    def _resolve_field(self, field_path: str, context: dict) -> Any:
        """Resolve a field path from context."""
        if not field_path:
            return None

        parts = field_path.split(".")
        current = context

        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None
            if current is None:
                return None

        return current

    def _evaluate_branches(self, data: dict, context: dict) -> str | None:
        """Evaluate branch conditions and return selected branch ID."""
        branches = data.get("branches", [])
        for branch in branches:
            branch_id = branch.get("id")
            condition = branch.get("condition", {})
            if self._evaluate_condition(condition, context):
                return branch_id

        default = data.get("default_branch")
        return default

    def _calculate_duration(self, data: dict) -> int:
        """Calculate wait duration in seconds."""
        amount = data.get("duration_amount", 1)
        unit = data.get("duration_unit", "hours")
        multipliers = {"seconds": 1, "minutes": 60, "hours": 3600, "days": 86400}
        return amount * multipliers.get(unit, 3600)

    def _get_branch_targets(self, node_id: str, edges: list, label: str) -> list[str]:
        """Get target nodes for a specific branch label."""
        return [
            e["target"] for e in edges
            if e.get("source") == node_id and e.get("sourceHandle", "") == label
        ]

    def _get_all_branch_targets(self, node_id: str, edges: list) -> dict[str, list[str]]:
        """Get all branch targets grouped by handle."""
        branches: dict[str, list[str]] = {}
        for e in edges:
            if e.get("source") == node_id:
                handle = e.get("sourceHandle", "default")
                branches.setdefault(handle, []).append(e["target"])
        return branches

    def _get_downstream_nodes(self, start_nodes: list[str], edges: list, node_map: dict) -> set[str]:
        """Get all downstream nodes from start nodes."""
        downstream: set[str] = set()
        queue = list(start_nodes)

        while queue:
            current = queue.pop(0)
            if current in downstream:
                continue
            downstream.add(current)
            for e in edges:
                if e.get("source") == current and e["target"] not in downstream:
                    queue.append(e["target"])

        return downstream
