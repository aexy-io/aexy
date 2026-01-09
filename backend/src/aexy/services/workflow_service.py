"""Workflow service for visual automation builder."""

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.workflow import WorkflowDefinition, NODE_TYPES, CONDITION_OPERATORS
from aexy.models.crm import CRMAutomation, CRMRecord
from aexy.schemas.workflow import (
    WorkflowNode,
    WorkflowEdge,
    WorkflowExecutionContext,
    NodeExecutionResult,
    WorkflowValidationError,
    WorkflowValidationResult,
)


class WorkflowService:
    """Service for workflow CRUD operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # WORKFLOW DEFINITION CRUD
    # =========================================================================

    async def create_workflow(
        self,
        automation_id: str,
        nodes: list[dict] | None = None,
        edges: list[dict] | None = None,
        viewport: dict | None = None,
    ) -> WorkflowDefinition:
        """Create a workflow definition for an automation."""
        workflow = WorkflowDefinition(
            id=str(uuid4()),
            automation_id=automation_id,
            nodes=nodes or [],
            edges=edges or [],
            viewport=viewport,
            version=1,
        )
        self.db.add(workflow)
        await self.db.flush()
        await self.db.refresh(workflow)
        return workflow

    async def get_workflow(self, workflow_id: str) -> WorkflowDefinition | None:
        """Get a workflow by ID."""
        stmt = select(WorkflowDefinition).where(WorkflowDefinition.id == workflow_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_workflow_by_automation(
        self, automation_id: str
    ) -> WorkflowDefinition | None:
        """Get workflow by automation ID."""
        stmt = select(WorkflowDefinition).where(
            WorkflowDefinition.automation_id == automation_id
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def update_workflow(
        self,
        workflow_id: str,
        nodes: list[dict] | None = None,
        edges: list[dict] | None = None,
        viewport: dict | None = None,
    ) -> WorkflowDefinition | None:
        """Update a workflow definition."""
        workflow = await self.get_workflow(workflow_id)
        if not workflow:
            return None

        if nodes is not None:
            workflow.nodes = nodes
        if edges is not None:
            workflow.edges = edges
        if viewport is not None:
            workflow.viewport = viewport

        workflow.version += 1
        await self.db.flush()
        await self.db.refresh(workflow)
        return workflow

    async def update_workflow_by_automation(
        self,
        automation_id: str,
        nodes: list[dict] | None = None,
        edges: list[dict] | None = None,
        viewport: dict | None = None,
    ) -> WorkflowDefinition | None:
        """Update or create a workflow by automation ID."""
        workflow = await self.get_workflow_by_automation(automation_id)
        if not workflow:
            return await self.create_workflow(automation_id, nodes, edges, viewport)
        return await self.update_workflow(workflow.id, nodes, edges, viewport)

    async def delete_workflow(self, workflow_id: str) -> bool:
        """Delete a workflow definition."""
        workflow = await self.get_workflow(workflow_id)
        if not workflow:
            return False
        await self.db.delete(workflow)
        await self.db.flush()
        return True

    async def publish_workflow(self, workflow_id: str) -> WorkflowDefinition | None:
        """Publish a workflow (make it live)."""
        workflow = await self.get_workflow(workflow_id)
        if not workflow:
            return None

        workflow.is_published = True
        workflow.published_at = datetime.now(timezone.utc)
        await self.db.flush()
        await self.db.refresh(workflow)
        return workflow

    async def unpublish_workflow(self, workflow_id: str) -> WorkflowDefinition | None:
        """Unpublish a workflow."""
        workflow = await self.get_workflow(workflow_id)
        if not workflow:
            return None

        workflow.is_published = False
        await self.db.flush()
        await self.db.refresh(workflow)
        return workflow

    # =========================================================================
    # WORKFLOW VALIDATION
    # =========================================================================

    def validate_workflow(
        self, nodes: list[dict], edges: list[dict]
    ) -> WorkflowValidationResult:
        """Validate a workflow definition."""
        errors: list[WorkflowValidationError] = []
        warnings: list[WorkflowValidationError] = []

        if not nodes:
            errors.append(
                WorkflowValidationError(
                    error_type="empty_workflow",
                    message="Workflow must have at least one node",
                )
            )
            return WorkflowValidationResult(is_valid=False, errors=errors)

        node_ids = {n["id"] for n in nodes}
        node_types = {n["id"]: n["type"] for n in nodes}

        # Check for trigger node
        trigger_nodes = [n for n in nodes if n["type"] == "trigger"]
        if len(trigger_nodes) == 0:
            errors.append(
                WorkflowValidationError(
                    error_type="no_trigger",
                    message="Workflow must have exactly one trigger node",
                )
            )
        elif len(trigger_nodes) > 1:
            errors.append(
                WorkflowValidationError(
                    error_type="multiple_triggers",
                    message="Workflow can only have one trigger node",
                    node_id=trigger_nodes[1]["id"],
                )
            )

        # Validate edges
        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")

            if source not in node_ids:
                errors.append(
                    WorkflowValidationError(
                        edge_id=edge.get("id"),
                        error_type="invalid_source",
                        message=f"Edge source '{source}' does not exist",
                    )
                )
            if target not in node_ids:
                errors.append(
                    WorkflowValidationError(
                        edge_id=edge.get("id"),
                        error_type="invalid_target",
                        message=f"Edge target '{target}' does not exist",
                    )
                )

            # Trigger nodes shouldn't have incoming edges
            if target in node_types and node_types[target] == "trigger":
                errors.append(
                    WorkflowValidationError(
                        edge_id=edge.get("id"),
                        error_type="invalid_trigger_edge",
                        message="Trigger nodes cannot have incoming edges",
                    )
                )

        # Check for orphan nodes (except trigger)
        connected_nodes = set()
        for edge in edges:
            connected_nodes.add(edge.get("source"))
            connected_nodes.add(edge.get("target"))

        for node in nodes:
            if node["type"] != "trigger" and node["id"] not in connected_nodes:
                warnings.append(
                    WorkflowValidationError(
                        node_id=node["id"],
                        error_type="orphan_node",
                        message=f"Node '{node.get('data', {}).get('label', node['id'])}' is not connected",
                        severity="warning",
                    )
                )

        # Validate node configurations
        for node in nodes:
            node_errors = self._validate_node(node)
            errors.extend(node_errors)

        return WorkflowValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
        )

    def _validate_node(self, node: dict) -> list[WorkflowValidationError]:
        """Validate a single node's configuration."""
        errors = []
        node_type = node.get("type")
        data = node.get("data", {})

        if node_type == "trigger":
            if not data.get("trigger_type"):
                errors.append(
                    WorkflowValidationError(
                        node_id=node["id"],
                        error_type="missing_trigger_type",
                        message="Trigger node must specify a trigger type",
                    )
                )

        elif node_type == "action":
            if not data.get("action_type"):
                errors.append(
                    WorkflowValidationError(
                        node_id=node["id"],
                        error_type="missing_action_type",
                        message="Action node must specify an action type",
                    )
                )
            action_type = data.get("action_type")
            if action_type == "send_email":
                if not data.get("email_template_id") and not data.get("email_body"):
                    errors.append(
                        WorkflowValidationError(
                            node_id=node["id"],
                            error_type="missing_email_content",
                            message="Email action requires a template or body",
                        )
                    )

        elif node_type == "condition":
            if not data.get("conditions"):
                errors.append(
                    WorkflowValidationError(
                        node_id=node["id"],
                        error_type="missing_conditions",
                        message="Condition node must have at least one condition",
                    )
                )

        elif node_type == "wait":
            wait_type = data.get("wait_type", "duration")
            if wait_type == "duration":
                if not data.get("duration_value"):
                    errors.append(
                        WorkflowValidationError(
                            node_id=node["id"],
                            error_type="missing_wait_duration",
                            message="Wait node must specify a duration",
                        )
                    )

        elif node_type == "agent":
            if not data.get("agent_type") and not data.get("agent_id"):
                errors.append(
                    WorkflowValidationError(
                        node_id=node["id"],
                        error_type="missing_agent_type",
                        message="Agent node must specify an agent type or ID",
                    )
                )

        return errors

    # =========================================================================
    # WORKFLOW GRAPH UTILITIES
    # =========================================================================

    def build_execution_graph(
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

    def get_trigger_node(self, nodes: list[dict]) -> dict | None:
        """Get the trigger node from a workflow."""
        for node in nodes:
            if node.get("type") == "trigger":
                return node
        return None

    def topological_sort(
        self, nodes: list[dict], edges: list[dict]
    ) -> list[str]:
        """Topological sort of nodes for execution order."""
        graph = self.build_execution_graph(nodes, edges)
        in_degree: dict[str, int] = {n["id"]: 0 for n in nodes}

        for edge in edges:
            target = edge.get("target")
            if target:
                in_degree[target] = in_degree.get(target, 0) + 1

        # Start with trigger node (has no incoming edges)
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


class WorkflowExecutor:
    """Executes visual workflows."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.workflow_service = WorkflowService(db)

    async def execute_workflow(
        self,
        automation_id: str,
        context: WorkflowExecutionContext,
    ) -> list[NodeExecutionResult]:
        """Execute a workflow for an automation."""
        workflow = await self.workflow_service.get_workflow_by_automation(automation_id)
        if not workflow:
            return []

        nodes = workflow.nodes
        edges = workflow.edges

        # Build execution order
        execution_order = self.workflow_service.topological_sort(nodes, edges)
        node_map = {n["id"]: n for n in nodes}
        graph = self.workflow_service.build_execution_graph(nodes, edges)

        results: list[NodeExecutionResult] = []
        skip_nodes: set[str] = set()

        for node_id in execution_order:
            if node_id in skip_nodes:
                continue

            node = node_map.get(node_id)
            if not node:
                continue

            context.current_node_id = node_id
            result = await self._execute_node(node, context, graph)
            results.append(result)
            context.executed_nodes.append(node_id)

            # Handle branching/conditions
            if result.status == "failed":
                break

            if node["type"] == "condition" and result.condition_result is False:
                # Skip the 'true' branch, execute 'false' branch if exists
                false_targets = self._get_branch_targets(node_id, edges, "false")
                true_targets = self._get_branch_targets(node_id, edges, "true")
                skip_nodes.update(self._get_downstream_nodes(true_targets, graph))

            if node["type"] == "branch" and result.selected_branch:
                # Skip all branches except selected one
                all_branches = self._get_all_branch_targets(node_id, edges)
                for branch_id, targets in all_branches.items():
                    if branch_id != result.selected_branch:
                        skip_nodes.update(self._get_downstream_nodes(targets, graph))

        return results

    async def _execute_node(
        self,
        node: dict,
        context: WorkflowExecutionContext,
        graph: dict[str, list[str]],
    ) -> NodeExecutionResult:
        """Execute a single workflow node."""
        start_time = datetime.now(timezone.utc)
        node_type = node.get("type")
        data = node.get("data", {})

        try:
            if node_type == "trigger":
                result = await self._execute_trigger(data, context)
            elif node_type == "action":
                result = await self._execute_action(data, context)
            elif node_type == "condition":
                result = await self._execute_condition(data, context)
            elif node_type == "wait":
                result = await self._execute_wait(data, context)
            elif node_type == "agent":
                result = await self._execute_agent(data, context)
            elif node_type == "branch":
                result = await self._execute_branch(data, context)
            else:
                result = NodeExecutionResult(
                    node_id=node["id"],
                    status="failed",
                    error=f"Unknown node type: {node_type}",
                )

            result.node_id = node["id"]
            result.duration_ms = int(
                (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
            )
            return result

        except Exception as e:
            return NodeExecutionResult(
                node_id=node["id"],
                status="failed",
                error=str(e),
                duration_ms=int(
                    (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
                ),
            )

    async def _execute_trigger(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Execute a trigger node (mostly passthrough)."""
        # Triggers are entry points - they just pass through the context
        return NodeExecutionResult(
            node_id="",
            status="success",
            output={"trigger_data": context.trigger_data},
        )

    async def _execute_action(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Execute an action node."""
        action_type = data.get("action_type")

        # Import action handlers lazily to avoid circular imports
        from aexy.services.workflow_actions import WorkflowActionHandler

        handler = WorkflowActionHandler(self.db)
        return await handler.execute_action(action_type, data, context)

    async def _execute_condition(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Execute a condition node."""
        conditions = data.get("conditions", [])
        conjunction = data.get("conjunction", "and")

        if not conditions:
            return NodeExecutionResult(
                node_id="",
                status="success",
                condition_result=True,
            )

        results = []
        for cond in conditions:
            field = cond.get("field")
            operator = cond.get("operator")
            value = cond.get("value")

            # Get actual value from record or context
            actual_value = self._get_field_value(field, context)
            result = self._evaluate_condition(actual_value, operator, value)
            results.append(result)

        if conjunction == "and":
            final_result = all(results)
        else:
            final_result = any(results)

        return NodeExecutionResult(
            node_id="",
            status="success",
            condition_result=final_result,
            output={"condition_results": results},
        )

    async def _execute_wait(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Execute a wait node (schedules for later)."""
        wait_type = data.get("wait_type", "duration")

        if wait_type == "duration":
            duration_value = data.get("duration_value", 1)
            duration_unit = data.get("duration_unit", "days")
            # This would schedule the continuation via Celery
            return NodeExecutionResult(
                node_id="",
                status="success",
                output={
                    "wait_type": "duration",
                    "duration_value": duration_value,
                    "duration_unit": duration_unit,
                },
            )
        elif wait_type == "datetime":
            wait_until = data.get("wait_until")
            return NodeExecutionResult(
                node_id="",
                status="success",
                output={"wait_type": "datetime", "wait_until": wait_until},
            )
        elif wait_type == "event":
            wait_for_event = data.get("wait_for_event")
            timeout_hours = data.get("timeout_hours")
            return NodeExecutionResult(
                node_id="",
                status="success",
                output={
                    "wait_type": "event",
                    "wait_for_event": wait_for_event,
                    "timeout_hours": timeout_hours,
                },
            )

        return NodeExecutionResult(
            node_id="",
            status="failed",
            error=f"Unknown wait type: {wait_type}",
        )

    async def _execute_agent(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Execute an AI agent node."""
        agent_type = data.get("agent_type")
        agent_id = data.get("agent_id")
        input_mapping = data.get("input_mapping", {})

        # Build input context for agent
        agent_input = {}
        for agent_key, context_path in input_mapping.items():
            agent_input[agent_key] = self._get_field_value(context_path, context)

        # This would invoke the LangGraph agent
        # For now, return placeholder
        return NodeExecutionResult(
            node_id="",
            status="success",
            output={
                "agent_type": agent_type,
                "agent_id": agent_id,
                "input": agent_input,
                "message": "Agent execution scheduled",
            },
        )

    async def _execute_branch(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Execute a branch node."""
        branches = data.get("branches", [])

        for branch in branches:
            branch_id = branch.get("id")
            conditions = branch.get("conditions", [])

            # Evaluate branch conditions
            if not conditions:
                # First branch without conditions is the default
                return NodeExecutionResult(
                    node_id="",
                    status="success",
                    selected_branch=branch_id,
                )

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
                return NodeExecutionResult(
                    node_id="",
                    status="success",
                    selected_branch=branch_id,
                )

        # No branch matched
        return NodeExecutionResult(
            node_id="",
            status="success",
            selected_branch=None,
        )

    def _get_field_value(self, field_path: str, context: WorkflowExecutionContext) -> Any:
        """Get a value from context using dot notation path."""
        if not field_path:
            return None

        parts = field_path.split(".")
        current = None

        if parts[0] == "record":
            current = context.record_data
            parts = parts[1:]
        elif parts[0] == "trigger":
            current = context.trigger_data
            parts = parts[1:]
        elif parts[0] == "variables":
            current = context.variables
            parts = parts[1:]
        else:
            current = context.record_data

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
            return float(actual) > float(expected) if actual else False
        elif operator == "gte":
            return float(actual) >= float(expected) if actual else False
        elif operator == "lt":
            return float(actual) < float(expected) if actual else False
        elif operator == "lte":
            return float(actual) <= float(expected) if actual else False
        elif operator == "in":
            return actual in expected if isinstance(expected, list) else False
        elif operator == "not_in":
            return actual not in expected if isinstance(expected, list) else True
        return False

    def _get_branch_targets(
        self, node_id: str, edges: list[dict], handle: str
    ) -> list[str]:
        """Get target nodes for a specific branch handle."""
        targets = []
        for edge in edges:
            if edge.get("source") == node_id:
                source_handle = edge.get("sourceHandle", "")
                if source_handle == handle or handle in source_handle:
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
            if node not in downstream:
                downstream.add(node)
                queue.extend(graph.get(node, []))
        return downstream
