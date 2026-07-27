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
from datetime import datetime, timedelta, timezone
from typing import Any

from temporalio import workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    from aexy.temporal.dispatch import STANDARD_RETRY

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
    # Set when a live CRM trigger handed off to this workflow: the run row is
    # created inline before dispatch and closed here when the workflow ends.
    crm_run_id: str | None = None
    error_handling: str = "stop"


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
            "trigger_data": input.trigger_data,
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
                    should_retry = input.error_handling == "retry"
                    result = await workflow.execute_activity(
                        "execute_workflow_action",
                        {
                            "node_type": node_type,
                            "node_id": node_id,
                            "node_data": data,
                            "context": context,
                            "execution_id": input.execution_id,
                            "workspace_id": input.workspace_id,
                            "record_id": input.record_id,
                            "retry_failures": should_retry,
                        },
                        start_to_close_timeout=timedelta(minutes=5),
                        retry_policy=self._step_retry_policy(),
                    )
                    context["variables"][node_id] = result
                    output_variable = data.get("output_variable")
                    if output_variable:
                        context["variables"][output_variable] = result
                    results.append({
                        "node_id": node_id,
                        "status": "completed",
                        "type": data.get("action_type"),
                        "attempts": result.get("attempt", 1),
                        "output": result,
                    })

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
                        event_type = data.get("wait_for_event") or data.get("event_type", "")
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
                            await self._close_crm_run(
                                input,
                                "failed",
                                f"Timeout waiting for event: {event_type}",
                                results,
                            )
                            return CRMWorkflowResult(
                                status="failed",
                                results=results,
                                error=f"Timeout waiting for event: {event_type}",
                                error_node_id=node_id,
                            )
                    elif wait_type in {"datetime", "date", "until_date"}:
                        raw_wait_until = data.get("wait_until") or data.get("until_date")
                        if not raw_wait_until:
                            raise ValueError("Wait-until-date requires a date and time")
                        wait_until = datetime.fromisoformat(
                            str(raw_wait_until).replace("Z", "+00:00")
                        )
                        if wait_until.tzinfo is None:
                            offset = int(data.get("timezone_offset_minutes", 0))
                            wait_until = wait_until.replace(
                                tzinfo=timezone(timedelta(minutes=-offset))
                            )
                        seconds = max(
                            0,
                            (wait_until - workflow.now()).total_seconds(),
                        )
                        self._status = {
                            "status": "waiting",
                            "wait_type": "datetime",
                            "wait_until": wait_until.isoformat(),
                        }
                        await workflow.sleep(seconds)
                    else:
                        raise ValueError(f"Unknown wait type: {wait_type}")

                    if wait_type != "event":
                        results.append({
                            "node_id": node_id,
                            "status": "completed",
                            "type": "wait",
                            "output": {"wait_type": wait_type},
                        })

                elif node_type == "branch":
                    decision = self._evaluate_branches(data, context)
                    selected = decision["branch_id"]
                    results.append({
                        "node_id": node_id,
                        "status": "completed",
                        "type": "branch",
                        "selected_branch": selected,
                        "output": decision,
                    })

                    all_branches = self._get_all_branch_targets(node_id, input.edges)
                    for branch_id, targets in all_branches.items():
                        if branch_id != selected:
                            downstream = self._get_downstream_nodes(targets, input.edges, node_map)
                            skip_nodes.update(downstream)

                elif node_type == "agent":
                    agent_context = self._build_agent_context(data, context)
                    should_retry = input.error_handling == "retry"
                    timeout_seconds = max(
                        1, min(600, int(data.get("timeout_seconds", 300)))
                    )
                    result = await workflow.execute_activity(
                        "execute_agent",
                        {
                            "agent_id": data.get("agent_id", ""),
                            "record_id": input.record_id,
                            "context": agent_context,
                            "triggered_by": "workflow",
                            "trigger_id": input.execution_id,
                            "retry_failures": should_retry,
                        },
                        start_to_close_timeout=timedelta(
                            seconds=timeout_seconds
                        ),
                        retry_policy=self._step_retry_policy(),
                    )
                    context["variables"][node_id] = result
                    output_variable = data.get("output_variable")
                    if output_variable:
                        context["variables"][output_variable] = result
                    results.append({
                        "node_id": node_id,
                        "status": "completed",
                        "type": "run_agent",
                        "attempts": result.get("attempt", 1),
                        "output": result,
                    })

                else:
                    results.append({"node_id": node_id, "status": "completed", "type": node_type})

                context["executed_nodes"].append(node_id)

            except Exception as e:
                # Temporal wraps an activity failure, so str(e) is the useless
                # "Activity task failed". Unwrap to the innermost cause so the
                # run names what actually went wrong ("Agent X is not active")
                # instead of something a user cannot act on.
                detail = self._failure_detail(e)
                logger.error(f"Workflow node {node_id} failed: {detail}")
                results.append({"node_id": node_id, "status": "failed", "error": detail})
                context["executed_nodes"].append(node_id)
                if input.error_handling == "continue":
                    continue
                await self._close_crm_run(input, "failed", detail, results)
                return CRMWorkflowResult(
                    status="failed",
                    results=results,
                    error=detail,
                    error_node_id=node_id,
                )

        failed_result = next(
            (result for result in results if result.get("status") == "failed"),
            None,
        )
        final_status = "failed" if failed_result else "completed"
        final_error = failed_result.get("error") if failed_result else None
        self._status = {"status": final_status}
        await self._close_crm_run(input, final_status, final_error, results)
        return CRMWorkflowResult(
            status=final_status,
            results=results,
            error=final_error,
            error_node_id=failed_result.get("node_id") if failed_result else None,
        )

    @staticmethod
    def _step_retry_policy() -> RetryPolicy:
        """Bound retries to the failed activity; Temporal retains earlier results.

        The attempt budget covers *infrastructure* failures — a dropped database
        connection, a worker restarted mid-activity — and stays in place whether
        or not the automation opted into retries. Capping it at one attempt for
        error_handling="stop" would let a momentary blip permanently fail a run,
        which is not what "stop on error" asks for; it asks the engine to stop
        when a step reaches a real verdict.

        That verdict is carried separately: execute_workflow_action raises its
        ApplicationError as non_retryable unless retries were requested, so a
        handler that decided "this failed" is never re-run and its side effects
        are never repeated. Only the raise-before-a-verdict cases come back here.
        """
        return RetryPolicy(
            initial_interval=timedelta(seconds=1),
            maximum_interval=timedelta(seconds=30),
            maximum_attempts=3,
        )

    def _build_agent_context(self, data: dict, context: dict) -> dict:
        """Build explicit, validated agent inputs from CRM and workflow context."""
        agent_context = {
            "record": context.get("record_data") or {},
            "trigger": context.get("trigger_data") or {},
            "variables": context.get("variables") or {},
        }
        for input_name, field_path in (data.get("input_mapping") or {}).items():
            value = self._resolve_field(str(field_path), context)
            if value is None:
                raise ValueError(
                    f"AI Agent input '{input_name}' could not resolve '{field_path}'"
                )
            agent_context[input_name] = value
        return agent_context

    async def _close_crm_run(
        self,
        input: "CRMWorkflowInput",
        status: str,
        error: str | None,
        steps: list | None = None,
    ) -> None:
        """Mark the inline-created CRMAutomationRun done (live-trigger path only).

        The node outcomes travel with the verdict. Without them the run's step
        log holds only the handoff entry, so a durable run can say it finished
        but not what it actually did.
        """
        if not input.crm_run_id:
            return
        await workflow.execute_activity(
            "mark_crm_automation_run",
            {
                "run_id": input.crm_run_id,
                "status": status,
                "error": error,
                "steps": steps or [],
            },
            start_to_close_timeout=timedelta(minutes=1),
            retry_policy=STANDARD_RETRY,
        )

    def _evaluate_condition(self, data: dict, context: dict) -> bool:
        """Evaluate a condition node (list or single field/operator/value).

        Uses the shared operator table so Temporal and the inline executor
        agree. Unknown operators raise — the activity/workflow surfaces a
        failed step rather than silently taking a path.
        """
        from aexy.services.condition_eval import (
            condition_field_key,
            evaluate_condition,
        )

        conditions = data.get("conditions") or []
        if not conditions and (
            data.get("field") or data.get("attribute") or data.get("operator")
        ):
            conditions = [data]

        if not conditions:
            return True

        conjunction = data.get("conjunction", "and")
        results = []
        for cond in conditions:
            field_path = condition_field_key(cond) or cond.get("field") or ""
            actual_value = self._resolve_field(str(field_path), context)
            results.append(
                evaluate_condition(actual_value, cond.get("operator"), cond.get("value"))
            )

        return all(results) if conjunction == "and" else any(results)

    def _resolve_field(self, field_path: str, context: dict) -> Any:
        """Resolve a field path from workflow context.

        Accepts bare slugs (looked up under record_data.values),
        ``record.values.X``, ``record_data.values.X``, and dotted paths.
        """
        if not field_path:
            return None

        path = field_path.strip()
        # Normalise builder paths
        if path.startswith("{{") and path.endswith("}}"):
            path = path[2:-2].strip()

        # Common aliases for the record payload
        record_blob = (
            context.get("record_data")
            or context.get("record")
            or {}
        )
        if isinstance(record_blob, dict):
            values = record_blob.get("values") if "values" in record_blob else record_blob
        else:
            values = {}

        if path in ("id", "record.id") and isinstance(record_blob, dict):
            return record_blob.get("id")

        bare = path
        for prefix in ("record.values.", "record_data.values.", "values.", "record."):
            if bare.startswith(prefix):
                bare = bare[len(prefix) :]
                break

        if isinstance(values, dict) and bare in values:
            return values.get(bare)

        # Generic dotted walk from context root
        parts = path.split(".")
        current: Any = context
        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None
            if current is None:
                return None
        return current

    def _evaluate_branches(self, data: dict, context: dict) -> dict[str, Any]:
        """Pick one exclusive branch by selection rules.

        Paths with rules are evaluated first; the first match wins. Paths
        without rules are the fallback default (first such path, or
        ``default_branch``). Documented behaviour: exclusive selection —
        never run multiple branch arms from a branch node.
        """
        branches = data.get("branches") or data.get("paths") or []
        default_id = data.get("default_branch")
        fallback_id = None

        for index, branch in enumerate(branches):
            branch_id = branch.get("id") or branch.get("name") or branch.get("label")
            conditions = (
                branch.get("conditions")
                or branch.get("rules")
                or (
                    [branch["condition"]]
                    if isinstance(branch.get("condition"), dict)
                    and (
                        branch["condition"].get("field")
                        or branch["condition"].get("attribute")
                        or branch["condition"].get("operator")
                    )
                    else []
                )
            )
            if not conditions and (
                branch.get("field")
                or branch.get("attribute")
                or branch.get("operator")
            ):
                conditions = [
                    {
                        "field": branch.get("field")
                        or branch.get("attribute"),
                        "operator": branch.get("operator"),
                        "value": branch.get("value"),
                    }
                ]
            if not conditions:
                if fallback_id is None:
                    fallback_id = branch_id
                continue
            # Reuse list evaluation by wrapping
            if self._evaluate_condition({"conditions": conditions}, context):
                return {
                    "branch_id": branch_id,
                    "path_label": branch.get("label") or branch_id,
                    "rule_index": index,
                    "matched": True,
                }

        selected = default_id or fallback_id
        selected_branch = next(
            (
                branch
                for branch in branches
                if (branch.get("id") or branch.get("name") or branch.get("label"))
                == selected
            ),
            {},
        )
        return {
            "branch_id": selected,
            "path_label": selected_branch.get("label") or selected,
            "rule_index": None,
            "matched": False,
        }

    def _calculate_duration(self, data: dict) -> int:
        """Calculate wait duration in seconds (all unit/key aliases)."""
        from aexy.services.condition_eval import wait_duration_seconds

        return wait_duration_seconds(data)

    def _get_branch_targets(self, node_id: str, edges: list, label: str) -> list[str]:
        """Get target nodes for a specific branch label."""
        return [
            e["target"] for e in edges
            if e.get("source") == node_id and e.get("sourceHandle", "") == label
        ]

    @staticmethod
    def _failure_detail(exc: BaseException) -> str:
        """Innermost meaningful message from a wrapped activity failure.

        Temporal reports an activity error as "Activity task failed" and hangs
        the real reason off ``__cause__``. Reporting the wrapper makes every
        failure look identical, so a run says nothing a user can act on. Walk
        the chain and keep the deepest message that is not just wrapper noise.
        """
        wrapper_noise = {
            "activity task failed",
            "workflow task failed",
            "child workflow task failed",
        }
        best = ""
        seen: set[int] = set()
        current: BaseException | None = exc
        while current is not None and id(current) not in seen:
            seen.add(id(current))
            message = str(current).strip()
            if message and message.lower() not in wrapper_noise:
                best = message
            current = current.__cause__
        return best or str(exc).strip() or "Step failed"

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
