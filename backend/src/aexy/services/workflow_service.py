"""Workflow service for visual automation builder."""

import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from email_validator import EmailNotValidError, validate_email

from sqlalchemy import select, desc, delete
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.workflow import (
    WorkflowDefinition,
    WorkflowVersion,
    MAX_WORKFLOW_VERSIONS,
    NODE_TYPES,
    CONDITION_OPERATORS,
)
from aexy.models.crm import CRMAutomation, CRMRecord
from aexy.schemas.workflow import (
    WorkflowNode,
    WorkflowEdge,
    WorkflowExecutionContext,
    NodeExecutionResult,
    WorkflowValidationError,
    WorkflowValidationResult,
)
from aexy.schemas.automation import (
    ACTION_REGISTRY,
    get_action_ids,
    get_trigger_ids,
)


# Required fields per action type. Value is (field-alternatives, error_type, message).
# An action is valid if at least one of the listed fields is present and truthy.
_ACTION_REQUIRED_FIELDS: dict[str, tuple[tuple[str, ...], str, str]] = {
    "send_email": (("to", "email_field", "email"), "missing_email_recipient",
                   "Email action requires a recipient (to or email_field)"),
    "send_tracked_email": (("to", "email_field", "email"), "missing_email_recipient",
                           "Email action requires a recipient (to or email_field)"),
    "webhook_call": (("url", "webhook_url"), "missing_webhook_url",
                     "Webhook action requires a URL"),
    "send_sms": (("to", "phone_number", "phone_field"), "missing_sms_recipient",
                 "SMS action requires a literal number or phone field"),
    # Both spellings are accepted because the config panel saves task_title
    # while the executor reads either. Checking only "title" made every
    # builder-configured task step impossible to save.
    "create_task": (("task_title", "title"), "missing_task_title",
                    "Create-task action requires a title"),
    "add_to_list": (("list_id",), "missing_list",
                    "List action requires a list"),
    "remove_from_list": (("list_id",), "missing_list",
                          "List action requires a list"),
    "create_record": (("target_object_id", "object_id"), "missing_target_object",
                      "Create-record action requires a target object"),
    "update_record": (("update_field", "fields", "field_mappings"), "missing_update_field",
                      "Update-record action requires a field to update"),
    "delete_record": (("confirm_delete",), "missing_delete_confirmation",
                      "Delete-record action requires confirmation"),
    "assign_owner": (("owner_id", "owner_email", "owner_field"), "missing_owner",
                     "Assign-owner action requires an owner"),
    "link_records": (
        ("link_record_id", "link_field", "target_record_id", "target_field"),
        "missing_link_target",
        "Link-records action requires a target record or field",
    ),
    "send_slack": (("channel", "channel_id", "user_email", "user_email_field"), "missing_slack_target",
                   "Slack action requires a channel or user"),
    "enroll_in_sequence": (("sequence_id",), "missing_sequence",
                           "Sequence action requires a sequence"),
    "remove_from_sequence": (("sequence_id",), "missing_sequence",
                             "Sequence action requires a sequence"),
    "notify_user": (("notify_email", "user_email", "user_id"), "missing_notification_recipient",
                    "Notify-user action requires a recipient"),
}

# Fields whose literal values should be validated as email addresses.
_EMAIL_LITERAL_FIELDS = ("to", "email_to", "email", "notify_email")

# Node types allowed in a published automation. trigger/action run on the
# inline executor; any canvas holding a timing, logic or AI node is routed to
# the durable Temporal executor instead.
#
# Every entry here MUST also be routable: either the inline executor has a case
# for it, or CRMAutomationService._DURABLE_NODE_TYPES lists it so the canvas is
# handed to Temporal. Allowing a type here that is in neither is the silent
# failure this constant exists to prevent — sync_workflow_to_automation keeps
# only `action` nodes, so an unroutable structural node is dropped on publish
# and the automation runs every action unconditionally with nothing reported.
# test_every_publishable_node_type_has_somewhere_to_run holds the two in step;
# the frontend's EXECUTABLE_NODE_TYPES (hooks/useWorkflowValidation.ts) mirrors
# this list and has to move with it.
_EXECUTABLE_NODE_TYPES = ("trigger", "action", "wait", "condition", "branch", "agent")

# Namespaces a {{variable}} reference may resolve against at execution time.
_VARIABLE_NAMESPACES = {"record", "trigger", "variables"}

# Condition operators that require a numeric comparison value.
_NUMERIC_OPERATORS = {"gt", "gte", "lt", "lte"}

_VARIABLE_RE = re.compile(r"\{\{\s*(.*?)\s*\}\}")


def _is_variable(value: str) -> bool:
    """A value is a template reference (not a literal) if it contains ``{{``."""
    return "{{" in value or "}}" in value


def _is_valid_email(addr: str) -> bool:
    try:
        validate_email(addr, check_deliverability=False)
        return True
    except EmailNotValidError:
        return False


def validate_action_configs(actions: list[dict], module: str = "crm") -> list[str]:
    """Validate action dicts from the automations API (non-canvas path).

    Enforces the same required-field and literal-email rules the builder
    enforces at publish, so a direct API create cannot bypass them.
    Returns a list of human-readable error strings (empty = ok).
    """
    errors: list[str] = []
    registered_action_ids = {
        entry["id"]
        for scope in ("common", module)
        for entry in ACTION_REGISTRY.get(scope, [])
    }
    for i, action in enumerate(actions or []):
        action_type = action.get("type") or action.get("action_type") or ""
        config = action.get("config") if isinstance(action.get("config"), dict) else action
        label = f"action[{i}] ({action_type})"

        if action_type not in registered_action_ids:
            errors.append(
                f"{label}: action is unavailable; choose a capability from the server registry"
            )
            continue

        required = _ACTION_REQUIRED_FIELDS.get(action_type)
        if required:
            fields, _error_type, message = required
            if not any(config.get(f) for f in fields):
                errors.append(f"{label}: {message}")

        for field in _EMAIL_LITERAL_FIELDS:
            value = config.get(field)
            if (
                isinstance(value, str)
                and value
                and not _is_variable(value)
                and not _is_valid_email(value)
            ):
                errors.append(f"{label}: '{value}' is not a valid email address")

        if action_type == "send_sms" and not config.get("message_template"):
            errors.append(f"{label}: SMS action requires a message")
        if action_type == "send_sms" and config.get("phone_number"):
            phone_number = str(config["phone_number"]).strip()
            if not re.fullmatch(r"\+[1-9]\d{7,14}", phone_number):
                errors.append(
                    f"{label}: SMS recipient must use E.164 format"
                )
        if action_type == "webhook_call":
            timeout = config.get("timeout_seconds", 30)
            try:
                timeout_value = float(timeout)
            except (TypeError, ValueError):
                timeout_value = 0
            if timeout_value < 1 or timeout_value > 60:
                errors.append(
                    f"{label}: webhook timeout must be between 1 and 60 seconds"
                )
    return errors


def _variable_root(expr: str) -> str:
    """First path segment of a variable expression, e.g. ``record.values.x`` -> ``record``."""
    return re.split(r"[.\[]", expr.strip(), maxsplit=1)[0].strip()


def _is_numeric_literal(value: Any) -> bool:
    """True if the value is (or parses as) a number. Variables defer to runtime."""
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return True
    if isinstance(value, str):
        if _is_variable(value):
            return True
        try:
            float(value)
            return True
        except ValueError:
            return False
    return False


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
        created_by: str | None = None,
        change_summary: str | None = None,
    ) -> WorkflowDefinition | None:
        """Update a workflow definition and create a version snapshot."""
        workflow = await self.get_workflow(workflow_id)
        if not workflow:
            return None

        # Create version snapshot before updating (if there are changes)
        has_changes = (
            (nodes is not None and nodes != workflow.nodes)
            or (edges is not None and edges != workflow.edges)
        )

        if has_changes:
            # Auto-generate change summary if not provided
            if not change_summary:
                change_summary = self._generate_change_summary(
                    old_nodes=workflow.nodes,
                    old_edges=workflow.edges,
                    new_nodes=nodes or workflow.nodes,
                    new_edges=edges or workflow.edges,
                )

            # Create version snapshot of current state
            version_snapshot = WorkflowVersion(
                id=str(uuid4()),
                workflow_id=workflow_id,
                version=workflow.version,
                nodes=workflow.nodes,
                edges=workflow.edges,
                viewport=workflow.viewport,
                change_summary=change_summary,
                node_count=len(workflow.nodes),
                edge_count=len(workflow.edges),
                created_by=created_by,
            )
            self.db.add(version_snapshot)

            # Clean up old versions if over limit
            await self._cleanup_old_versions(workflow_id)

        # Update workflow
        if nodes is not None:
            workflow.nodes = nodes
        if edges is not None:
            workflow.edges = edges
        if viewport is not None:
            workflow.viewport = viewport

        if has_changes:
            workflow.version += 1

        # Precompute execution order (topological sort) for performance
        try:
            workflow.execution_order = self.topological_sort(
                workflow.nodes, workflow.edges
            )
        except ValueError:
            # Workflow has a cycle - store None and let runtime handle it
            workflow.execution_order = None

        await self.db.flush()
        await self.db.refresh(workflow)
        return workflow

    def _generate_change_summary(
        self,
        old_nodes: list[dict],
        old_edges: list[dict],
        new_nodes: list[dict],
        new_edges: list[dict],
    ) -> str:
        """Auto-generate a change summary based on differences."""
        changes = []

        old_node_ids = {n.get("id") for n in old_nodes}
        new_node_ids = {n.get("id") for n in new_nodes}

        added_nodes = new_node_ids - old_node_ids
        removed_nodes = old_node_ids - new_node_ids

        if added_nodes:
            # Get node types for added nodes
            added_types = []
            for node in new_nodes:
                if node.get("id") in added_nodes:
                    node_type = node.get("type", "node")
                    label = node.get("data", {}).get("label", node_type)
                    added_types.append(label)
            changes.append(f"Added: {', '.join(added_types[:3])}" + ("..." if len(added_types) > 3 else ""))

        if removed_nodes:
            changes.append(f"Removed {len(removed_nodes)} node(s)")

        # Check for modified nodes
        modified_count = 0
        for old_node in old_nodes:
            node_id = old_node.get("id")
            if node_id in new_node_ids and node_id not in added_nodes:
                new_node = next((n for n in new_nodes if n.get("id") == node_id), None)
                if new_node and new_node != old_node:
                    modified_count += 1
        if modified_count > 0:
            changes.append(f"Modified {modified_count} node(s)")

        # Check edges
        old_edge_count = len(old_edges)
        new_edge_count = len(new_edges)
        if new_edge_count > old_edge_count:
            changes.append(f"Added {new_edge_count - old_edge_count} connection(s)")
        elif new_edge_count < old_edge_count:
            changes.append(f"Removed {old_edge_count - new_edge_count} connection(s)")

        if not changes:
            changes.append("Minor changes")

        return "; ".join(changes)

    async def _cleanup_old_versions(self, workflow_id: str) -> None:
        """Remove old versions keeping only the most recent MAX_WORKFLOW_VERSIONS."""
        # Get count of versions
        count_stmt = select(WorkflowVersion).where(WorkflowVersion.workflow_id == workflow_id)
        result = await self.db.execute(count_stmt)
        versions = list(result.scalars().all())

        if len(versions) >= MAX_WORKFLOW_VERSIONS:
            # Get IDs of versions to keep (most recent)
            versions.sort(key=lambda v: v.version, reverse=True)
            versions_to_delete = versions[MAX_WORKFLOW_VERSIONS - 1:]  # Keep MAX-1 since we're adding one

            for version in versions_to_delete:
                await self.db.delete(version)

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
    # VERSION HISTORY
    # =========================================================================

    async def list_versions(
        self,
        workflow_id: str,
        limit: int = 20,
        offset: int = 0,
    ) -> list[WorkflowVersion]:
        """List version history for a workflow."""
        stmt = (
            select(WorkflowVersion)
            .where(WorkflowVersion.workflow_id == workflow_id)
            .order_by(desc(WorkflowVersion.version))
            .offset(offset)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_version(
        self,
        workflow_id: str,
        version: int,
    ) -> WorkflowVersion | None:
        """Get a specific version of a workflow."""
        stmt = select(WorkflowVersion).where(
            WorkflowVersion.workflow_id == workflow_id,
            WorkflowVersion.version == version,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def restore_version(
        self,
        workflow_id: str,
        version: int,
        created_by: str | None = None,
    ) -> WorkflowDefinition | None:
        """Restore a workflow to a specific version."""
        # Get the version to restore
        version_snapshot = await self.get_version(workflow_id, version)
        if not version_snapshot:
            return None

        # Update the workflow with the restored version
        return await self.update_workflow(
            workflow_id=workflow_id,
            nodes=version_snapshot.nodes,
            edges=version_snapshot.edges,
            viewport=version_snapshot.viewport,
            created_by=created_by,
            change_summary=f"Restored from version {version}",
        )

    def compare_versions(
        self,
        version_a: WorkflowVersion,
        version_b: WorkflowVersion,
    ) -> dict:
        """Compare two versions and return a diff summary."""
        diff = {
            "version_a": version_a.version,
            "version_b": version_b.version,
            "nodes": {
                "added": [],
                "removed": [],
                "modified": [],
            },
            "edges": {
                "added": [],
                "removed": [],
            },
            "summary": [],
        }

        # Build node maps
        nodes_a = {n.get("id"): n for n in version_a.nodes}
        nodes_b = {n.get("id"): n for n in version_b.nodes}

        # Find added and removed nodes
        for node_id in nodes_b:
            if node_id not in nodes_a:
                node = nodes_b[node_id]
                diff["nodes"]["added"].append({
                    "id": node_id,
                    "type": node.get("type"),
                    "label": node.get("data", {}).get("label"),
                })

        for node_id in nodes_a:
            if node_id not in nodes_b:
                node = nodes_a[node_id]
                diff["nodes"]["removed"].append({
                    "id": node_id,
                    "type": node.get("type"),
                    "label": node.get("data", {}).get("label"),
                })

        # Find modified nodes
        for node_id in nodes_a:
            if node_id in nodes_b:
                node_a = nodes_a[node_id]
                node_b = nodes_b[node_id]
                if node_a != node_b:
                    # Find what changed
                    changes = []
                    if node_a.get("position") != node_b.get("position"):
                        changes.append("position")
                    if node_a.get("data") != node_b.get("data"):
                        changes.append("configuration")
                    diff["nodes"]["modified"].append({
                        "id": node_id,
                        "type": node_a.get("type"),
                        "label": node_a.get("data", {}).get("label"),
                        "changes": changes,
                    })

        # Compare edges
        edges_a = {(e.get("source"), e.get("target")) for e in version_a.edges}
        edges_b = {(e.get("source"), e.get("target")) for e in version_b.edges}

        for edge in edges_b - edges_a:
            diff["edges"]["added"].append({"source": edge[0], "target": edge[1]})

        for edge in edges_a - edges_b:
            diff["edges"]["removed"].append({"source": edge[0], "target": edge[1]})

        # Generate summary
        if diff["nodes"]["added"]:
            diff["summary"].append(f"Added {len(diff['nodes']['added'])} node(s)")
        if diff["nodes"]["removed"]:
            diff["summary"].append(f"Removed {len(diff['nodes']['removed'])} node(s)")
        if diff["nodes"]["modified"]:
            diff["summary"].append(f"Modified {len(diff['nodes']['modified'])} node(s)")
        if diff["edges"]["added"]:
            diff["summary"].append(f"Added {len(diff['edges']['added'])} connection(s)")
        if diff["edges"]["removed"]:
            diff["summary"].append(f"Removed {len(diff['edges']['removed'])} connection(s)")

        if not diff["summary"]:
            diff["summary"].append("No changes")

        return diff

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

        # The release contract is explicit: only these node types have a
        # published executor. Unknown structural nodes must still fail before
        # save rather than disappear from the graph.
        for node in nodes:
            if node["type"] not in _EXECUTABLE_NODE_TYPES:
                errors.append(
                    WorkflowValidationError(
                        error_type="unsupported_node_type",
                        message=(
                            f"'{node['type']}' steps can't run in a published "
                            "automation yet — remove it to publish"
                        ),
                        node_id=node["id"],
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

    async def validate_agent_references(
        self, nodes: list[dict], workspace_id: str
    ) -> list[WorkflowValidationError]:
        """Reject missing, cross-workspace, or inactive agents before save/publish."""
        from aexy.models.agent import CRMAgent

        errors: list[WorkflowValidationError] = []
        agent_nodes = [node for node in nodes if node.get("type") == "agent"]
        agent_ids = {
            str(node.get("data", {}).get("agent_id"))
            for node in agent_nodes
            if node.get("data", {}).get("agent_id")
        }
        if not agent_ids:
            return errors

        result = await self.db.execute(
            select(CRMAgent).where(
                CRMAgent.id.in_(agent_ids),
                CRMAgent.workspace_id == workspace_id,
            )
        )
        agents = {str(agent.id): agent for agent in result.scalars().all()}
        for node in agent_nodes:
            agent_id = str(node.get("data", {}).get("agent_id") or "")
            if not agent_id:
                continue
            agent = agents.get(agent_id)
            if not agent:
                errors.append(
                    WorkflowValidationError(
                        node_id=node["id"],
                        error_type="missing_agent",
                        message="The selected AI agent no longer exists in this workspace",
                    )
                )
            elif not agent.is_active:
                errors.append(
                    WorkflowValidationError(
                        node_id=node["id"],
                        error_type="inactive_agent",
                        message=f"AI agent '{agent.name}' is inactive",
                    )
                )
        return errors

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
            elif data.get("trigger_type") not in get_trigger_ids("crm"):
                errors.append(
                    WorkflowValidationError(
                        node_id=node["id"],
                        error_type="unknown_trigger_type",
                        message=(
                            f"Trigger '{data.get('trigger_type')}' is unavailable; "
                            "choose one from the server registry"
                        ),
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
            if action_type and action_type not in get_action_ids("crm"):
                errors.append(
                    WorkflowValidationError(
                        node_id=node["id"],
                        error_type="unknown_action_type",
                        message=(
                            f"Action '{action_type}' is unavailable; choose one "
                            "from the server registry"
                        ),
                    )
                )
            if action_type == "send_email":
                if not data.get("email_template_id") and not data.get("email_body"):
                    errors.append(
                        WorkflowValidationError(
                            node_id=node["id"],
                            error_type="missing_email_content",
                            message="Email action requires a template or body",
                        )
                    )

            if action_type == "notify_user" and data.get("notify_type", "email") == "email":
                if not data.get("notify_email") and not data.get("user_email"):
                    errors.append(
                        WorkflowValidationError(
                            node_id=node["id"],
                            error_type="missing_notification_recipient",
                            message="Notify-user action requires an email address",
                        )
                    )

            # US-6.1: required fields per action type.
            required = _ACTION_REQUIRED_FIELDS.get(action_type)
            if required:
                fields, error_type, message = required
                if not any(data.get(f) for f in fields):
                    errors.append(
                        WorkflowValidationError(
                            node_id=node["id"],
                            error_type=error_type,
                            message=message,
                        )
                    )

            # US-6.2: literal email addresses must be well-formed.
            for field in _EMAIL_LITERAL_FIELDS:
                value = data.get(field)
                if (
                    isinstance(value, str)
                    and value
                    and not _is_variable(value)
                    and not _is_valid_email(value)
                ):
                    errors.append(
                        WorkflowValidationError(
                            node_id=node["id"],
                            error_type="invalid_email",
                            message=f"'{value}' is not a valid email address",
                        )
                    )
            if action_type == "send_sms" and not data.get("message_template"):
                errors.append(
                    WorkflowValidationError(
                        node_id=node["id"],
                        error_type="missing_sms_message",
                        message="SMS action requires a message",
                    )
                )
            if action_type == "send_sms" and data.get("phone_number"):
                phone_number = str(data["phone_number"]).strip()
                if not re.fullmatch(r"\+[1-9]\d{7,14}", phone_number):
                    errors.append(
                        WorkflowValidationError(
                            node_id=node["id"],
                            error_type="invalid_sms_recipient",
                            message="SMS recipient must use E.164 format",
                        )
                    )
            if action_type == "webhook_call":
                try:
                    timeout = float(data.get("timeout_seconds", 30))
                except (TypeError, ValueError):
                    timeout = 0
                if timeout < 1 or timeout > 60:
                    errors.append(
                        WorkflowValidationError(
                            node_id=node["id"],
                            error_type="invalid_webhook_timeout",
                            message="Webhook timeout must be between 1 and 60 seconds",
                        )
                    )

        elif node_type == "condition":
            conditions = data.get("conditions")
            if not conditions:
                errors.append(
                    WorkflowValidationError(
                        node_id=node["id"],
                        error_type="missing_conditions",
                        message="Condition node must have at least one condition",
                    )
                )
            else:
                # US-6.3: numeric operators require a numeric comparison value.
                for cond in conditions:
                    if (
                        cond.get("operator") in _NUMERIC_OPERATORS
                        and cond.get("value") is not None
                        and not _is_numeric_literal(cond.get("value"))
                    ):
                        errors.append(
                            WorkflowValidationError(
                                node_id=node["id"],
                                error_type="invalid_condition_value",
                                message=(
                                    f"Operator '{cond.get('operator')}' on field "
                                    f"'{cond.get('field')}' requires a numeric value"
                                ),
                            )
                        )

        elif node_type == "wait":
            wait_type = data.get("wait_type", "duration")
            if wait_type == "duration":
                duration = data.get("duration_value")
                if duration is None or duration == "":
                    errors.append(
                        WorkflowValidationError(
                            node_id=node["id"],
                            error_type="missing_wait_duration",
                            message="Wait node must specify a duration",
                        )
                    )
                elif not _is_numeric_literal(duration):
                    # US-6.3: a literal duration must be a number.
                    errors.append(
                        WorkflowValidationError(
                            node_id=node["id"],
                            error_type="invalid_duration",
                            message=f"Wait duration '{duration}' must be a number",
                        )
                    )
            elif wait_type in {"datetime", "date", "until_date"}:
                if not (data.get("wait_until") or data.get("until_date")):
                    errors.append(
                        WorkflowValidationError(
                            node_id=node["id"],
                            error_type="missing_wait_until",
                            message="Wait-until-date requires a date and time",
                        )
                    )
            else:
                errors.append(
                    WorkflowValidationError(
                        node_id=node["id"],
                        error_type="unknown_wait_type",
                        message=(
                            f"Wait type '{wait_type}' is unavailable; event waits "
                            "remain hidden until their signal path is proven"
                        ),
                    )
                )

        elif node_type == "agent":
            if not data.get("agent_id"):
                errors.append(
                    WorkflowValidationError(
                        node_id=node["id"],
                        error_type="missing_agent_id",
                        message="AI Agent node must select an existing agent",
                    )
                )

        elif node_type == "branch":
            branches = data.get("branches") or []
            if len(branches) < 2:
                errors.append(
                    WorkflowValidationError(
                        node_id=node["id"],
                        error_type="missing_branch_paths",
                        message="Branch node requires at least one rule and an Else path",
                    )
                )
            else:
                else_indexes = [
                    index
                    for index, branch in enumerate(branches)
                    if branch.get("is_else")
                    or str(branch.get("label", "")).strip().lower() == "else"
                ]
                if not else_indexes:
                    errors.append(
                        WorkflowValidationError(
                            node_id=node["id"],
                            error_type="missing_else_path",
                            message="Branch node requires an Else path",
                        )
                    )
                elif else_indexes[-1] != len(branches) - 1:
                    errors.append(
                        WorkflowValidationError(
                            node_id=node["id"],
                            error_type="invalid_else_position",
                            message="Else must be the final branch",
                        )
                    )
                for index, branch in enumerate(branches):
                    if index in else_indexes:
                        continue
                    conditions = (
                        branch.get("conditions")
                        or branch.get("rules")
                        or (
                            [branch.get("condition")]
                            if isinstance(branch.get("condition"), dict)
                            else []
                        )
                    )
                    if not conditions and not (
                        branch.get("field") and branch.get("operator")
                    ):
                        errors.append(
                            WorkflowValidationError(
                                node_id=node["id"],
                                error_type="missing_branch_rule",
                                message=(
                                    f"Branch path {index + 1} requires a field "
                                    "and operator"
                                ),
                            )
                        )

        # US-6.4: {{variable}} references must be well-formed and resolvable.
        errors.extend(self._validate_variable_references(node))

        return errors

    def _validate_variable_references(self, node: dict) -> list[WorkflowValidationError]:
        """Flag malformed braces and unknown namespaces in any string config value."""
        errors = []
        node_id = node["id"]

        def strings(value: Any):
            if isinstance(value, str):
                yield value
            elif isinstance(value, dict):
                for nested in value.values():
                    yield from strings(nested)
            elif isinstance(value, (list, tuple)):
                for nested in value:
                    yield from strings(nested)

        for value in strings(node.get("data") or {}):
            if not isinstance(value, str) or ("{{" not in value and "}}" not in value):
                continue
            if value.count("{{") != value.count("}}"):
                errors.append(
                    WorkflowValidationError(
                        node_id=node_id,
                        error_type="malformed_variable",
                        message=f"Unbalanced '{{{{ }}}}' in: {value}",
                    )
                )
                continue
            for expr in _VARIABLE_RE.findall(value):
                if _variable_root(expr) not in _VARIABLE_NAMESPACES:
                    allowed = ", ".join(sorted(_VARIABLE_NAMESPACES))
                    errors.append(
                        WorkflowValidationError(
                            node_id=node_id,
                            error_type="unknown_variable_namespace",
                            message=(
                                f"'{{{{{expr}}}}}' must start with one of: {allowed}"
                            ),
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
        """Execute a workflow for an automation with parallel branch support."""
        workflow = await self.workflow_service.get_workflow_by_automation(automation_id)
        if not workflow:
            return []

        nodes = workflow.nodes
        edges = workflow.edges

        # Build execution structures
        execution_order = self.workflow_service.topological_sort(nodes, edges)
        node_map = {n["id"]: n for n in nodes}
        graph = self.workflow_service.build_execution_graph(nodes, edges)
        reverse_graph = self._build_reverse_graph(edges)

        results: list[NodeExecutionResult] = []
        skip_nodes: set[str] = set()
        parallel_branch_results: dict[str, dict] = {}  # Track results for join nodes
        executed_in_parallel: set[str] = set()  # Track nodes already executed in parallel

        i = 0
        while i < len(execution_order):
            node_id = execution_order[i]

            if node_id in skip_nodes or node_id in executed_in_parallel:
                i += 1
                continue

            node = node_map.get(node_id)
            if not node:
                i += 1
                continue

            node_type = node.get("type")

            # Check for parallel branches (node with multiple targets)
            targets = graph.get(node_id, [])
            if len(targets) > 1 and node_type not in ("condition", "branch"):
                # Find parallel branches
                parallel_branches = self._find_parallel_branches(node_id, graph, node_map, edges)

                if parallel_branches and len(parallel_branches) > 1:
                    # Execute branches in parallel
                    context.current_node_id = node_id
                    result = await self._execute_node(node, context, graph)
                    results.append(result)
                    context.executed_nodes.append(node_id)

                    if result.status == "failed":
                        break

                    # Execute parallel branches
                    branch_results = await self._execute_parallel_branches(
                        parallel_branches, node_map, context, graph, edges
                    )

                    # Collect all results
                    for branch_id, branch_result_list in branch_results.items():
                        results.extend(branch_result_list)
                        for br in branch_result_list:
                            context.executed_nodes.append(br.node_id)
                            executed_in_parallel.add(br.node_id)

                    # Find the join node (if any) that these branches converge to
                    join_node_id = self._find_join_node(parallel_branches, graph, node_map)
                    if join_node_id:
                        # Store branch results for join node
                        parallel_branch_results[join_node_id] = {
                            branch_id: {
                                "status": "success" if all(r.status == "success" for r in branch_result_list) else "failed",
                                "output": branch_result_list[-1].output if branch_result_list else None,
                            }
                            for branch_id, branch_result_list in branch_results.items()
                        }

                    i += 1
                    continue

            # Handle join nodes
            if node_type == "join":
                data = node.get("data", {})
                branch_results = parallel_branch_results.get(node_id, {})

                # If no branches recorded, this join might have single incoming edge
                if not branch_results:
                    incoming_count = self._get_incoming_edges_count(node_id, edges)
                    if incoming_count <= 1:
                        # Single incoming edge, just pass through
                        result = NodeExecutionResult(
                            node_id=node_id,
                            status="success",
                            output={"single_branch": True},
                        )
                    else:
                        result = await self._execute_join(data, context, branch_results)
                else:
                    result = await self._execute_join(data, context, branch_results)

                result.node_id = node_id
                results.append(result)
                context.executed_nodes.append(node_id)

                if result.status == "failed":
                    break

                i += 1
                continue

            # Standard sequential execution
            context.current_node_id = node_id
            result = await self._execute_node(node, context, graph)
            results.append(result)
            context.executed_nodes.append(node_id)

            # Handle branching/conditions
            if result.status == "failed":
                break

            if node_type == "condition" and result.condition_result is False:
                # Skip the 'true' branch, execute 'false' branch if exists
                false_targets = self._get_branch_targets(node_id, edges, "false")
                true_targets = self._get_branch_targets(node_id, edges, "true")
                skip_nodes.update(self._get_downstream_nodes(true_targets, graph))

            if node_type == "branch" and result.selected_branch:
                # Skip all branches except selected one
                all_branches = self._get_all_branch_targets(node_id, edges)
                for branch_id, targets in all_branches.items():
                    if branch_id != result.selected_branch:
                        skip_nodes.update(self._get_downstream_nodes(targets, graph))

            i += 1

        return results

    def _find_join_node(
        self,
        branches: list[list[str]],
        graph: dict[str, list[str]],
        node_map: dict[str, dict],
    ) -> str | None:
        """Find the join node where parallel branches converge."""
        # Look for a join node that all branches lead to
        all_endpoints = set()
        for branch in branches:
            if branch:
                last_node = branch[-1]
                node = node_map.get(last_node)
                if node and node.get("type") == "join":
                    all_endpoints.add(last_node)
                else:
                    # Check what the last node leads to
                    targets = graph.get(last_node, [])
                    for target in targets:
                        target_node = node_map.get(target)
                        if target_node and target_node.get("type") == "join":
                            all_endpoints.add(target)

        # If all branches converge to the same join node
        if len(all_endpoints) == 1:
            return all_endpoints.pop()
        return None

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
            elif node_type == "join":
                # Join nodes are handled specially in the main execution loop
                # This is a placeholder for when join is executed directly
                result = NodeExecutionResult(
                    node_id=node["id"],
                    status="success",
                    output={"join_type": data.get("join_type", "all")},
                )
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
        """Execute a condition node.

        Supports both a list of conditions (builder) and a single
        field/operator/value triple (older Temporal-shaped config).
        """
        from aexy.services.condition_eval import (
            UnknownOperatorError,
            condition_field_key,
        )

        conditions = data.get("conditions") or []
        if not conditions and (data.get("field") or data.get("attribute") or data.get("operator")):
            conditions = [data]

        conjunction = data.get("conjunction", "and")

        if not conditions:
            return NodeExecutionResult(
                node_id="",
                status="success",
                condition_result=True,
            )

        results = []
        try:
            for cond in conditions:
                field = condition_field_key(cond) or cond.get("field")
                operator = cond.get("operator")
                value = cond.get("value")
                actual_value = self._get_field_value(field, context)
                result = self._evaluate_condition(actual_value, operator, value)
                results.append(result)
        except UnknownOperatorError as e:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error=str(e),
                condition_result=False,
            )

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
        """Execute a wait node.

        Dry-run: never pretends a wait succeeded — report skipped. Live path
        reports the resolved duration so the durable engine can sleep the
        correct unit (days/hours/minutes/zero).
        """
        from aexy.services.condition_eval import wait_duration_seconds

        if context.is_dry_run:
            return NodeExecutionResult(
                node_id="",
                status="skipped",
                output={
                    "dry_run": True,
                    "message": "skipped — not simulated",
                    "action_type": "wait",
                },
            )

        wait_type = data.get("wait_type", "duration")

        if wait_type == "duration":
            seconds = wait_duration_seconds(data)
            duration_value = data.get("duration_value", data.get("duration_amount", 1))
            duration_unit = data.get("duration_unit", data.get("wait_unit", "days"))
            return NodeExecutionResult(
                node_id="",
                status="success",
                output={
                    "wait_type": "duration",
                    "duration_value": duration_value,
                    "duration_unit": duration_unit,
                    "duration_seconds": seconds,
                },
            )
        elif wait_type in ("datetime", "date", "until_date"):
            wait_until = data.get("wait_until") or data.get("until_date") or data.get("date")
            if not wait_until:
                return NodeExecutionResult(
                    node_id="",
                    status="failed",
                    error="Wait-until-date requires wait_until / until_date",
                )
            return NodeExecutionResult(
                node_id="",
                status="success",
                output={"wait_type": "datetime", "wait_until": wait_until},
            )
        elif wait_type == "event":
            wait_for_event = (
                data.get("wait_for_event") or data.get("event_type") or data.get("event")
            )
            if not wait_for_event:
                return NodeExecutionResult(
                    node_id="",
                    status="failed",
                    error="Wait-for-event requires wait_for_event / event_type",
                )
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
        """Execute an AI agent node through the existing agent service."""
        if context.is_dry_run:
            return NodeExecutionResult(
                node_id="",
                status="skipped",
                output={
                    "dry_run": True,
                    "message": "skipped — not simulated",
                    "action_type": "run_agent",
                },
            )

        from aexy.services.workflow_actions import WorkflowActionHandler

        return await WorkflowActionHandler(self.db).execute_action(
            "run_agent", data, context
        )

    async def _execute_branch(
        self, data: dict, context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        """Execute a branch node.

        Each path may carry selection rules under `conditions`, `rules`, or a
        single `condition`. Paths without rules are the default fallback after
        rule-bearing paths are checked — so a builder that only names paths
        still selects the first path rather than none.

        Behaviour: branches are exclusive (one selected path). Parallel fan-out
        of multiple edges from a non-branch node is handled separately in the
        main executor; a branch node always picks exactly one path.
        """
        from aexy.services.condition_eval import (
            UnknownOperatorError,
            condition_field_key,
        )

        branches = data.get("branches") or data.get("paths") or []
        default_id = data.get("default_branch")
        fallback_id = None

        try:
            for branch in branches:
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

                if not conditions:
                    # Default / fallback path — remember the first one.
                    if fallback_id is None:
                        fallback_id = branch_id
                    continue

                all_match = True
                for cond in conditions:
                    field = condition_field_key(cond) or cond.get("field")
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
                        output={"selected_branch": branch_id, "mode": "exclusive"},
                    )
        except UnknownOperatorError as e:
            return NodeExecutionResult(
                node_id="",
                status="failed",
                error=str(e),
                selected_branch=None,
            )

        selected = default_id or fallback_id
        return NodeExecutionResult(
            node_id="",
            status="success",
            selected_branch=selected,
            output={"selected_branch": selected, "mode": "exclusive"},
        )

    def _get_field_value(self, field_path: str, context: WorkflowExecutionContext) -> Any:
        """Get a value from context using dot notation path.

        Bare slugs resolve against ``record_data.values`` so a condition that
        says ``stage`` (or ``record.values.stage``) actually sees the CRM field.
        """
        if not field_path:
            return None

        path = str(field_path).strip()
        if path.startswith("{{") and path.endswith("}}"):
            path = path[2:-2].strip()

        parts = path.split(".")
        current = None

        if parts[0] == "record":
            current = context.record_data or {}
            parts = parts[1:]
        elif parts[0] == "trigger":
            current = context.trigger_data or {}
            parts = parts[1:]
        elif parts[0] == "variables":
            current = context.variables or {}
            parts = parts[1:]
        else:
            # Bare slug / values.X — prefer the values map
            values = (context.record_data or {}).get("values")
            if isinstance(values, dict) and path in values:
                return values.get(path)
            current = context.record_data or {}

        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None

        return current

    def _evaluate_condition(self, actual: Any, operator: str, expected: Any) -> bool:
        """Evaluate a condition via the shared operator table.

        Unknown operators raise so a step fails loudly instead of silently
        taking the true or false path.
        """
        from aexy.services.condition_eval import evaluate_condition

        return evaluate_condition(actual, operator, expected)

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

    def _build_reverse_graph(self, edges: list[dict]) -> dict[str, list[str]]:
        """Build reverse adjacency list (target -> sources) for finding incoming edges."""
        reverse_graph: dict[str, list[str]] = defaultdict(list)
        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")
            if source and target:
                reverse_graph[target].append(source)
        return dict(reverse_graph)

    def _get_incoming_edges_count(self, node_id: str, edges: list[dict]) -> int:
        """Get the number of incoming edges to a node."""
        count = 0
        for edge in edges:
            if edge.get("target") == node_id:
                count += 1
        return count

    def _find_parallel_branches(
        self,
        node_id: str,
        graph: dict[str, list[str]],
        node_map: dict[str, dict],
        edges: list[dict],
    ) -> list[list[str]]:
        """
        Find parallel branches starting from a node.
        Returns list of branch paths, where each path is a list of node IDs.
        Branches are considered parallel if they don't share nodes until a join node.
        """
        targets = graph.get(node_id, [])
        if len(targets) <= 1:
            return []  # No parallel branches

        branches: list[list[str]] = []
        for target in targets:
            branch_path = self._trace_branch_to_join(target, graph, node_map, edges, set())
            branches.append(branch_path)

        return branches

    def _trace_branch_to_join(
        self,
        start_node: str,
        graph: dict[str, list[str]],
        node_map: dict[str, dict],
        edges: list[dict],
        visited: set[str],
    ) -> list[str]:
        """
        Trace a branch from start_node until we hit a join node or end of branch.
        Returns list of node IDs in this branch.
        """
        path = []
        current = start_node
        visited = visited.copy()

        while current and current not in visited:
            visited.add(current)
            path.append(current)

            node = node_map.get(current)
            if not node:
                break

            # Stop at join nodes
            if node.get("type") == "join":
                break

            # Get next nodes
            next_nodes = graph.get(current, [])
            if len(next_nodes) == 0:
                break  # End of branch
            elif len(next_nodes) == 1:
                current = next_nodes[0]
            else:
                # Another split - don't follow further in this trace
                break

        return path

    async def _execute_join(
        self, data: dict, context: WorkflowExecutionContext, branch_results: dict[str, Any]
    ) -> NodeExecutionResult:
        """Execute a join node that waits for parallel branches."""
        join_type = data.get("join_type", "all")
        expected_count = data.get("expected_count", 1)
        on_failure = data.get("on_failure", "fail")  # "fail", "continue", "skip"

        completed_branches = list(branch_results.keys())
        failed_branches = [b for b, r in branch_results.items() if r.get("status") == "failed"]
        success_branches = [b for b, r in branch_results.items() if r.get("status") == "success"]

        # Check join conditions
        if join_type == "all":
            # All branches must complete successfully
            if failed_branches and on_failure == "fail":
                return NodeExecutionResult(
                    node_id="",
                    status="failed",
                    error=f"Parallel branches failed: {', '.join(failed_branches)}",
                    output={"branch_results": branch_results},
                )
            # Wait for all branches to complete
            all_completed = True  # Assuming we're called when all branches are done
        elif join_type == "any":
            # At least one branch must complete
            all_completed = len(success_branches) > 0
        elif join_type == "count":
            # Specified number of branches must complete
            all_completed = len(success_branches) >= expected_count
        else:
            all_completed = True

        if all_completed:
            # Merge branch outputs into context
            merged_output = {}
            for branch_id, result in branch_results.items():
                if result.get("output"):
                    merged_output[branch_id] = result["output"]

            return NodeExecutionResult(
                node_id="",
                status="success",
                output={
                    "joined_branches": completed_branches,
                    "failed_branches": failed_branches,
                    "merged_outputs": merged_output,
                },
            )
        else:
            return NodeExecutionResult(
                node_id="",
                status="waiting",
                output={"waiting_for_branches": True},
            )

    async def _execute_parallel_branches(
        self,
        branches: list[list[str]],
        node_map: dict[str, dict],
        context: WorkflowExecutionContext,
        graph: dict[str, list[str]],
        edges: list[dict],
    ) -> dict[str, list[NodeExecutionResult]]:
        """
        Execute multiple branches in parallel.
        Returns dict mapping branch ID to list of execution results.
        """
        import asyncio

        async def execute_branch(branch_path: list[str], branch_id: str) -> tuple[str, list[NodeExecutionResult]]:
            """Execute a single branch sequentially."""
            results = []
            branch_context = WorkflowExecutionContext(
                workspace_id=context.workspace_id,
                record_id=context.record_id,
                record_data=context.record_data.copy(),
                trigger_data=context.trigger_data.copy(),
                variables=context.variables.copy(),
                executed_nodes=context.executed_nodes.copy(),
                current_node_id=None,
                branch_path=branch_id,
            )

            for node_id in branch_path:
                node = node_map.get(node_id)
                if not node:
                    continue

                # Skip join nodes in branch execution (they're handled separately)
                if node.get("type") == "join":
                    break

                branch_context.current_node_id = node_id
                result = await self._execute_node(node, branch_context, graph)
                results.append(result)
                branch_context.executed_nodes.append(node_id)

                if result.status == "failed":
                    break

            return branch_id, results

        # Execute all branches concurrently
        tasks = [
            execute_branch(branch, f"branch_{i}")
            for i, branch in enumerate(branches)
        ]

        branch_results_list = await asyncio.gather(*tasks, return_exceptions=True)

        # Convert to dict
        branch_results: dict[str, list[NodeExecutionResult]] = {}
        for result in branch_results_list:
            if isinstance(result, Exception):
                # Handle exceptions from branches
                continue
            branch_id, results = result
            branch_results[branch_id] = results

        return branch_results
