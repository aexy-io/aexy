"""Synchronous workflow execution service for Celery tasks."""

import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from aexy.models.workflow import (
    WorkflowDefinition,
    WorkflowExecution,
    WorkflowExecutionStep,
    WorkflowExecutionStatus,
    WorkflowStepStatus,
)
from aexy.models.crm import CRMRecord

logger = logging.getLogger(__name__)


class SyncWorkflowExecutor:
    """Synchronous workflow executor for Celery tasks."""

    def __init__(self, db: Session):
        self.db = db

    def execute(
        self,
        execution: WorkflowExecution,
        workflow: WorkflowDefinition,
        record_data: dict | None = None,
    ) -> dict:
        """
        Execute a workflow from its current position.

        Args:
            execution: The WorkflowExecution instance
            workflow: The WorkflowDefinition with nodes/edges
            record_data: Optional record data for context

        Returns:
            Dict with execution result
        """
        nodes = workflow.nodes
        edges = workflow.edges

        # Build execution helpers
        node_map = {n["id"]: n for n in nodes}
        graph = self._build_execution_graph(nodes, edges)

        # Use precomputed execution order if available (performance optimization)
        if workflow.execution_order:
            execution_order = workflow.execution_order
        else:
            # Fallback to computing at runtime
            execution_order = self._topological_sort(nodes, edges)

        # Determine starting position
        start_index = 0
        if execution.next_node_id:
            try:
                start_index = execution_order.index(execution.next_node_id)
            except ValueError:
                logger.warning(f"Next node {execution.next_node_id} not in execution order")

        # Build context from saved state
        context = execution.context or {}
        if record_data:
            context["record_data"] = record_data
        context.setdefault("executed_nodes", [])
        context.setdefault("variables", {})

        skip_nodes: set[str] = set(context.get("skip_nodes", []))
        results = []

        # Execute nodes starting from start_index
        for i in range(start_index, len(execution_order)):
            node_id = execution_order[i]

            if node_id in skip_nodes:
                continue

            node = node_map.get(node_id)
            if not node:
                continue

            # Update current position
            execution.current_node_id = node_id
            next_node_id = execution_order[i + 1] if i + 1 < len(execution_order) else None
            execution.next_node_id = next_node_id
            self.db.commit()

            # Execute the node
            result = self._execute_node(node, context, execution)
            results.append(result)

            # Create step record
            step = WorkflowExecutionStep(
                id=str(uuid4()),
                execution_id=execution.id,
                node_id=node_id,
                node_type=node["type"],
                node_label=node.get("data", {}).get("label"),
                status=result["status"],
                input_data=result.get("input"),
                output_data=result.get("output"),
                condition_result=result.get("condition_result"),
                selected_branch=result.get("selected_branch"),
                error=result.get("error"),
                duration_ms=result.get("duration_ms", 0),
            )
            self.db.add(step)
            self.db.commit()

            context["executed_nodes"].append(node_id)

            # Handle special results
            if result["status"] == "failed":
                execution.status = WorkflowExecutionStatus.FAILED.value
                execution.error = result.get("error")
                execution.error_node_id = node_id
                execution.completed_at = datetime.now(timezone.utc)
                execution.context = context
                self.db.commit()
                return {"status": "failed", "error": result.get("error"), "results": results}

            if result["status"] == "waiting":
                # Workflow is paused, waiting for something
                execution.status = WorkflowExecutionStatus.PAUSED.value
                execution.paused_at = datetime.now(timezone.utc)
                execution.context = context

                # Set up resumption based on wait type
                wait_info = result.get("wait_info", {})
                if wait_info.get("resume_at"):
                    execution.resume_at = wait_info["resume_at"]
                if wait_info.get("event_type"):
                    execution.wait_event_type = wait_info["event_type"]
                if wait_info.get("timeout_at"):
                    execution.wait_timeout_at = wait_info["timeout_at"]

                self.db.commit()
                return {"status": "paused", "wait_info": wait_info, "results": results}

            # Handle branching/conditions
            if node["type"] == "condition":
                condition_result = result.get("condition_result", True)
                if not condition_result:
                    # Skip the 'true' branch
                    true_targets = self._get_branch_targets(node_id, edges, "true")
                    downstream = self._get_downstream_nodes(true_targets, graph)
                    skip_nodes.update(downstream)
                else:
                    # Skip the 'false' branch
                    false_targets = self._get_branch_targets(node_id, edges, "false")
                    downstream = self._get_downstream_nodes(false_targets, graph)
                    skip_nodes.update(downstream)
                context["skip_nodes"] = list(skip_nodes)

            if node["type"] == "branch":
                selected_branch = result.get("selected_branch")
                all_branches = self._get_all_branch_targets(node_id, edges)
                for branch_id, targets in all_branches.items():
                    if branch_id != selected_branch:
                        downstream = self._get_downstream_nodes(targets, graph)
                        skip_nodes.update(downstream)
                context["skip_nodes"] = list(skip_nodes)

            # Store result in variables if needed
            if result.get("output"):
                context["variables"][node_id] = result["output"]

        # Workflow completed successfully
        execution.status = WorkflowExecutionStatus.COMPLETED.value
        execution.completed_at = datetime.now(timezone.utc)
        execution.context = context
        self.db.commit()

        return {"status": "completed", "results": results}

    def _execute_node(
        self,
        node: dict,
        context: dict,
        execution: WorkflowExecution,
    ) -> dict:
        """Execute a single workflow node."""
        start_time = datetime.now(timezone.utc)
        node_type = node.get("type")
        data = node.get("data", {})

        try:
            if node_type == "trigger":
                result = self._execute_trigger(data, context)
            elif node_type == "action":
                result = self._execute_action(data, context, execution)
            elif node_type == "condition":
                result = self._execute_condition(data, context)
            elif node_type == "wait":
                result = self._execute_wait(data, context, execution)
            elif node_type == "agent":
                result = self._execute_agent(data, context, execution)
            elif node_type == "branch":
                result = self._execute_branch(data, context)
            else:
                result = {"status": "failed", "error": f"Unknown node type: {node_type}"}

            result["duration_ms"] = int(
                (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
            )
            return result

        except Exception as e:
            logger.exception(f"Error executing node {node['id']}")
            return {
                "status": "failed",
                "error": str(e),
                "duration_ms": int(
                    (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
                ),
            }

    def _execute_trigger(self, data: dict, context: dict) -> dict:
        """Execute trigger node - passthrough."""
        return {
            "status": "success",
            "output": {"trigger_data": context.get("trigger_data", {})},
        }

    def _execute_action(
        self,
        data: dict,
        context: dict,
        execution: WorkflowExecution,
    ) -> dict:
        """Execute action node."""
        action_type = data.get("action_type")

        # Skip actual execution for dry runs
        if execution.is_dry_run:
            return {
                "status": "success",
                "output": {
                    "action_type": action_type,
                    "dry_run": True,
                    "message": f"Would execute {action_type}",
                },
            }

        # Import action handlers
        from aexy.services.workflow_actions import SyncWorkflowActionHandler

        handler = SyncWorkflowActionHandler(self.db)
        return handler.execute_action(action_type, data, context, execution)

    def _execute_condition(self, data: dict, context: dict) -> dict:
        """Execute condition node."""
        conditions = data.get("conditions", [])
        conjunction = data.get("conjunction", "and")

        if not conditions:
            return {"status": "success", "condition_result": True}

        results = []
        for cond in conditions:
            field = cond.get("field")
            operator = cond.get("operator")
            value = cond.get("value")
            actual_value = self._get_field_value(field, context)
            result = self._evaluate_condition(actual_value, operator, value)
            results.append(result)

        if conjunction == "and":
            final_result = all(results)
        else:
            final_result = any(results)

        return {
            "status": "success",
            "condition_result": final_result,
            "output": {"condition_results": results},
        }

    def _execute_wait(
        self,
        data: dict,
        context: dict,
        execution: WorkflowExecution,
    ) -> dict:
        """Execute wait node - returns waiting status."""
        wait_type = data.get("wait_type", "duration")

        # Skip waits for dry runs
        if execution.is_dry_run:
            return {
                "status": "success",
                "output": {
                    "wait_type": wait_type,
                    "dry_run": True,
                    "message": f"Would wait ({wait_type})",
                },
            }

        now = datetime.now(timezone.utc)

        if wait_type == "duration":
            duration_value = data.get("duration_value", 1)
            duration_unit = data.get("duration_unit", "days")

            # Calculate resume time
            if duration_unit == "minutes":
                resume_at = now + timedelta(minutes=duration_value)
            elif duration_unit == "hours":
                resume_at = now + timedelta(hours=duration_value)
            else:  # days
                resume_at = now + timedelta(days=duration_value)

            return {
                "status": "waiting",
                "wait_info": {
                    "type": "duration",
                    "resume_at": resume_at,
                    "duration_value": duration_value,
                    "duration_unit": duration_unit,
                },
                "output": {
                    "wait_type": "duration",
                    "resume_at": resume_at.isoformat(),
                },
            }

        elif wait_type == "datetime":
            wait_until_str = data.get("wait_until")
            if wait_until_str:
                if isinstance(wait_until_str, str):
                    wait_until = datetime.fromisoformat(wait_until_str.replace("Z", "+00:00"))
                else:
                    wait_until = wait_until_str

                return {
                    "status": "waiting",
                    "wait_info": {
                        "type": "datetime",
                        "resume_at": wait_until,
                    },
                    "output": {
                        "wait_type": "datetime",
                        "resume_at": wait_until.isoformat(),
                    },
                }
            else:
                return {"status": "failed", "error": "No wait_until datetime specified"}

        elif wait_type == "event":
            wait_for_event = data.get("wait_for_event")
            timeout_hours = data.get("timeout_hours", 24)
            event_filter = data.get("event_filter", {})

            timeout_at = now + timedelta(hours=timeout_hours)

            # Add record_id to event filter if available
            if execution.record_id and "record_id" not in event_filter:
                event_filter["record_id"] = execution.record_id

            # Create event subscription for this wait
            from aexy.services.workflow_event_service import SyncWorkflowEventService

            event_service = SyncWorkflowEventService(self.db)
            subscription = event_service.create_subscription(
                execution_id=execution.id,
                workspace_id=execution.workspace_id,
                event_type=wait_for_event,
                event_filter=event_filter,
                timeout_hours=timeout_hours,
            )

            return {
                "status": "waiting",
                "wait_info": {
                    "type": "event",
                    "event_type": wait_for_event,
                    "timeout_at": timeout_at,
                    "subscription_id": subscription.id,
                },
                "output": {
                    "wait_type": "event",
                    "event_type": wait_for_event,
                    "timeout_at": timeout_at.isoformat(),
                    "subscription_id": subscription.id,
                },
            }

        return {"status": "failed", "error": f"Unknown wait type: {wait_type}"}

    def _execute_agent(
        self,
        data: dict,
        context: dict,
        execution: WorkflowExecution,
    ) -> dict:
        """Execute agent node."""
        agent_type = data.get("agent_type")
        agent_id = data.get("agent_id")
        input_mapping = data.get("input_mapping", {})
        output_mapping = data.get("output_mapping", {})

        # Build input context for agent from input_mapping
        agent_input = {}
        for agent_key, context_path in input_mapping.items():
            agent_input[agent_key] = self._get_field_value(context_path, context)

        # Add record data to agent input
        agent_input["record_data"] = context.get("record_data", {})

        # Skip for dry runs
        if execution.is_dry_run:
            return {
                "status": "success",
                "output": {
                    "agent_type": agent_type,
                    "agent_id": agent_id,
                    "input": agent_input,
                    "dry_run": True,
                    "message": f"Would invoke agent {agent_type or agent_id}",
                },
            }

        # Execute agent using SyncAgentService
        from aexy.services.agent_service import SyncAgentService

        try:
            agent_service = SyncAgentService(self.db)
            result = agent_service.run_agent(
                agent_type=agent_type,
                agent_id=agent_id,
                input_data=agent_input,
                workspace_id=execution.workspace_id,
                record_id=execution.record_id,
            )

            # Apply output mapping if provided
            output = result.get("output", {})
            if output_mapping and isinstance(output, dict):
                mapped_output = {}
                for output_key, output_path in output_mapping.items():
                    # output_path is the key in the agent output
                    # output_key is what we want to store it as
                    if isinstance(output, dict):
                        mapped_output[output_key] = output.get(output_path)
                result["mapped_output"] = mapped_output

            agent_status = result.get("status", "completed")

            return {
                "status": "success" if agent_status == "completed" else "failed",
                "output": result,
            }

        except Exception as e:
            logger.exception(f"Agent execution failed: {e}")
            return {
                "status": "failed",
                "error": str(e),
                "output": {
                    "agent_type": agent_type,
                    "agent_id": agent_id,
                    "input": agent_input,
                    "error": str(e),
                },
            }

    def _execute_branch(self, data: dict, context: dict) -> dict:
        """Execute branch node."""
        branches = data.get("branches", [])

        for branch in branches:
            branch_id = branch.get("id")
            conditions = branch.get("conditions", [])

            if not conditions:
                # First branch without conditions is the default
                return {
                    "status": "success",
                    "selected_branch": branch_id,
                }

            all_match = True
            for cond in conditions:
                field = cond.get("field")
                operator = cond.get("operator")
                value = cond.get("value")
                actual_value = self._get_field_value(field, context)
                if not self._evaluate_condition(actual_value, operator, value):
                    all_match = False
                    break

            if all_match:
                return {
                    "status": "success",
                    "selected_branch": branch_id,
                }

        return {"status": "success", "selected_branch": None}

    def _get_field_value(self, field_path: str, context: dict) -> Any:
        """Get a value from context using dot notation path."""
        if not field_path:
            return None

        parts = field_path.split(".")
        current = None

        if parts[0] == "record":
            current = context.get("record_data", {})
            parts = parts[1:]
        elif parts[0] == "trigger":
            current = context.get("trigger_data", {})
            parts = parts[1:]
        elif parts[0] == "variables":
            current = context.get("variables", {})
            parts = parts[1:]
        else:
            current = context.get("record_data", {})

        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None

        return current

    def _evaluate_condition(self, actual: Any, operator: str, expected: Any) -> bool:
        """Evaluate a condition."""
        if operator == "equals":
            return actual == expected
        elif operator == "not_equals":
            return actual != expected
        elif operator == "contains":
            return expected in str(actual) if actual else False
        elif operator == "not_contains":
            return expected not in str(actual) if actual else True
        elif operator == "starts_with":
            return str(actual).startswith(expected) if actual else False
        elif operator == "ends_with":
            return str(actual).endswith(expected) if actual else False
        elif operator == "is_empty":
            return actual is None or actual == "" or actual == []
        elif operator == "is_not_empty":
            return actual is not None and actual != "" and actual != []
        elif operator == "gt":
            try:
                return float(actual) > float(expected) if actual else False
            except (ValueError, TypeError):
                return False
        elif operator == "gte":
            try:
                return float(actual) >= float(expected) if actual else False
            except (ValueError, TypeError):
                return False
        elif operator == "lt":
            try:
                return float(actual) < float(expected) if actual else False
            except (ValueError, TypeError):
                return False
        elif operator == "lte":
            try:
                return float(actual) <= float(expected) if actual else False
            except (ValueError, TypeError):
                return False
        elif operator == "in":
            return actual in expected if isinstance(expected, list) else False
        elif operator == "not_in":
            return actual not in expected if isinstance(expected, list) else True
        return False

    def _build_execution_graph(
        self, nodes: list[dict], edges: list[dict]
    ) -> dict[str, list[str]]:
        """Build adjacency list for workflow execution."""
        graph: dict[str, list[str]] = defaultdict(list)
        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")
            if source and target:
                graph[source].append(target)
        return dict(graph)

    def _topological_sort(
        self, nodes: list[dict], edges: list[dict]
    ) -> list[str]:
        """Topological sort of nodes for execution order."""
        graph = self._build_execution_graph(nodes, edges)
        in_degree: dict[str, int] = {n["id"]: 0 for n in nodes}

        for edge in edges:
            target = edge.get("target")
            if target:
                in_degree[target] = in_degree.get(target, 0) + 1

        queue = [node_id for node_id, degree in in_degree.items() if degree == 0]
        result = []

        while queue:
            node_id = queue.pop(0)
            result.append(node_id)
            for neighbor in graph.get(node_id, []):
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        return result

    def _get_branch_targets(
        self, node_id: str, edges: list[dict], handle: str
    ) -> list[str]:
        """Get target nodes for a specific branch handle."""
        targets = []
        for edge in edges:
            if edge.get("source") == node_id:
                source_handle = edge.get("sourceHandle", "")
                if source_handle == handle or handle in str(source_handle):
                    targets.append(edge.get("target"))
        return targets

    def _get_all_branch_targets(
        self, node_id: str, edges: list[dict]
    ) -> dict[str, list[str]]:
        """Get all branch targets grouped by handle."""
        branches: dict[str, list[str]] = defaultdict(list)
        for edge in edges:
            if edge.get("source") == node_id:
                handle = edge.get("sourceHandle", "default")
                branches[handle].append(edge.get("target"))
        return dict(branches)

    def _get_downstream_nodes(
        self, start_nodes: list[str], graph: dict[str, list[str]]
    ) -> set[str]:
        """Get all downstream nodes from a set of starting nodes."""
        downstream = set()
        queue = list(start_nodes)
        while queue:
            node = queue.pop(0)
            if node and node not in downstream:
                downstream.add(node)
                queue.extend(graph.get(node, []))
        return downstream
