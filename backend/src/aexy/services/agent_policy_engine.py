"""Agent Policy Engine for governance, audit, and notification."""

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.agent_policy import (
    AgentConfigAudit,
    AgentPolicy,
    AgentPolicyDecision,
    ConfigChangeType,
    PolicyDecisionType,
    PolicyType,
)

logger = logging.getLogger(__name__)


@dataclass
class PolicyEvalResult:
    """Result of evaluating policies for a tool call."""
    decision: str  # PolicyDecisionType value
    reason: str
    policy_id: str | None = None
    confidence_score: float | None = None
    confidence_threshold: float | None = None


# ---------------------------------------------------------------------------
# Selectors
# ---------------------------------------------------------------------------
#
# A block or require-approval policy names what it applies to. `tools` is the
# original form: exact action names. The other three exist because the MCP
# surface has ~1,100 mutating operations and "every delete needs approval" is
# not something anyone should express as a list.
#
#   tools:            ["update_contact", "send_email"]   exact action names
#   methods:          ["DELETE"]                          HTTP method of the operation
#   action_patterns:  ["^send_", "publish", "_member$"]  regex, searched in the action
#   capabilities:     ["mcp.admin", "mcp.integrations"]  the capability the operation belongs to
#
# A policy triggers when ANY selector matches. Methods and capabilities are
# only known at the MCP boundary; a caller that passes no context (the CRM
# agent runtime) is matched on `tools` and `action_patterns` alone.


def policy_selects(
    config: dict[str, Any],
    tool_name: str,
    context: dict[str, Any] | None,
) -> str | None:
    """Which selector, if any, picks this call. Returns a short reason or None."""
    if tool_name in (config.get("tools") or []):
        return f"tool {tool_name}"

    for pattern in config.get("action_patterns") or []:
        try:
            if re.search(pattern, tool_name):
                return f"matches /{pattern}/"
        except re.error:
            logger.warning("Ignoring invalid action_pattern %r in policy config", pattern)

    if context:
        method = (context.get("method") or "").upper()
        if method and method in {m.upper() for m in (config.get("methods") or [])}:
            return f"method {method}"

        capability = context.get("capability")
        if capability:
            wanted = set(config.get("capabilities") or [])
            # Accept either spelling: the catalogue says "mcp.admin", a person
            # typing a policy will very likely say "admin".
            if capability in wanted or capability.removeprefix("mcp.") in wanted:
                return f"capability {capability}"

    return None


def restricted_fields_present(
    tool_args: dict[str, Any], blocked_fields: list[str]
) -> list[str]:
    """The blocked fields that appear anywhere in the arguments.

    A field matches by its own name at any depth (`email` matches
    `body.email` and `body.contact.email`) or by its dotted path
    (`body.contact.email`). Lists are walked; a blocked field inside the third
    item of a bulk payload is still the blocked field.
    """
    blocked = set(blocked_fields)
    found: list[str] = []

    def walk(node: Any, prefix: str) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                path = f"{prefix}.{key}" if prefix else str(key)
                if key in blocked or path in blocked:
                    found.append(path)
                walk(value, path)
        elif isinstance(node, list):
            for item in node:
                walk(item, prefix)

    walk(tool_args, "")
    return found


class AgentPolicyEngine:
    """Service for evaluating agent policies and recording decisions."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._cached_policies: list[AgentPolicy] | None = None
        self._allow_counts: dict[str, int] = {}

    # =========================================================================
    # POLICY LOADING & EVALUATION
    # =========================================================================

    async def load_policies(
        self, workspace_id: str, agent_id: str | None = None
    ) -> list[AgentPolicy]:
        """Load active policies for a workspace/agent, sorted by priority.

        Policies are cached for the lifetime of this engine instance
        (typically one execution).
        """
        if self._cached_policies is not None:
            return self._cached_policies

        stmt = (
            select(AgentPolicy)
            .where(
                AgentPolicy.workspace_id == workspace_id,
                AgentPolicy.is_active == True,
            )
            .order_by(AgentPolicy.priority)
        )

        # Include policies for this specific agent AND global policies (agent_id IS NULL)
        if agent_id:
            stmt = stmt.where(
                (AgentPolicy.agent_id == agent_id) | (AgentPolicy.agent_id.is_(None))
            )
        else:
            stmt = stmt.where(AgentPolicy.agent_id.is_(None))

        result = await self.db.execute(stmt)
        self._cached_policies = list(result.scalars().all())
        return self._cached_policies

    def decide(
        self,
        tool_name: str,
        tool_args: dict,
        execution_id: str = "",
        policies: list[AgentPolicy] | None = None,
        context: dict[str, Any] | None = None,
    ) -> PolicyEvalResult | None:
        """Evaluate loaded policies and return the first non-allow decision.

        `context` describes the operation beyond its name — `method`,
        `capability`, `mutating` — so a policy can select on "every DELETE" or
        "anything in admin" rather than having to list 1,100 action names by
        hand. The CRM agent path passes none, so `methods` and `capabilities`
        selectors never match there — but `action_patterns` still do, against
        the tool name. That is deliberate: the default pack's "anything that
        sends" holds a CRM agent's `send_email` for approval too.

        Deciding, without writing anything down. Split out because the audit
        row's shape depends on who is calling: a CRM agent has an execution to
        hang it on, an MCP session has a workspace and a developer instead.
        Folding the write into the decision meant the only caller that could
        record was the one the columns were designed for.

        `policies` is for a caller that has already loaded them — the MCP
        boundary does, to keep one query per call. It used to assign
        `_cached_policies` from outside, which worked and would have gone on
        working right up until somebody renamed a private attribute: `decide`
        would then evaluate an empty list, return None, and the gate would allow
        everything without raising anything. Passing them in makes that a
        TypeError instead of a silent hole.

        Returns None when every policy passes.
        """
        candidates = policies if policies is not None else (self._cached_policies or [])
        for policy in candidates:
            result = self._evaluate_single_policy(
                policy, tool_name, tool_args, execution_id, context
            )
            if result is not None:
                return result
        return None

    async def evaluate_tool_call(
        self,
        execution_id: str,
        tool_name: str,
        tool_args: dict,
        agent: Any,
    ) -> PolicyEvalResult:
        """Evaluate all loaded policies against a tool call.

        Returns the first non-allow decision, or allow if all policies pass.
        """
        confidence_score = getattr(agent, "confidence_threshold", None)
        confidence_threshold = getattr(agent, "require_approval_below", None)

        result = self.decide(tool_name, tool_args, execution_id)
        if result is not None:
            result.confidence_score = confidence_score
            result.confidence_threshold = confidence_threshold
            # Record the blocking decision
            await self.record_decision(
                execution_id=execution_id,
                policy_id=result.policy_id,
                tool_name=tool_name,
                tool_args=tool_args,
                decision=result.decision,
                reason=result.reason,
                confidence_score=confidence_score,
                confidence_threshold=confidence_threshold,
            )
            return result

        # All policies passed — record allow decision
        allow_result = PolicyEvalResult(
            decision=PolicyDecisionType.ALLOW.value,
            reason="No policy restrictions apply",
            confidence_score=confidence_score,
            confidence_threshold=confidence_threshold,
        )
        await self.record_decision(
            execution_id=execution_id,
            policy_id=None,
            tool_name=tool_name,
            tool_args=tool_args,
            decision=allow_result.decision,
            reason=allow_result.reason,
            confidence_score=confidence_score,
            confidence_threshold=confidence_threshold,
        )
        return allow_result

    def _evaluate_single_policy(
        self,
        policy: AgentPolicy,
        tool_name: str,
        tool_args: dict,
        execution_id: str,
        context: dict[str, Any] | None = None,
    ) -> PolicyEvalResult | None:
        """Evaluate a single policy. Returns result if policy triggers, None otherwise."""
        config = policy.config or {}

        if policy.policy_type == PolicyType.TOOL_BLOCK.value:
            matched = policy_selects(config, tool_name, context)
            if matched:
                return PolicyEvalResult(
                    decision=PolicyDecisionType.BLOCK.value,
                    reason=f"Tool '{tool_name}' is blocked by policy '{policy.name}' ({matched})",
                    policy_id=policy.id,
                )

        elif policy.policy_type == PolicyType.TOOL_REQUIRE_APPROVAL.value:
            matched = policy_selects(config, tool_name, context)
            if matched:
                return PolicyEvalResult(
                    decision=PolicyDecisionType.REQUIRE_APPROVAL.value,
                    reason=(
                        f"Tool '{tool_name}' requires approval (policy '{policy.name}', "
                        f"{matched}). [REQUIRES APPROVAL]"
                    ),
                    policy_id=policy.id,
                )

        elif policy.policy_type == PolicyType.FIELD_RESTRICTION.value:
            restricted_tool = config.get("tool", "")
            blocked_fields = config.get("blocked_fields", [])
            # `tool` names one action; `tools` a list; `all_tools: true` (or
            # `tools: ["*"]`) means every action — a field like `salary` is
            # sensitive whoever writes it. An empty `tool` with no `tools`
            # stays inert, as it always was: rows saved that way predate the
            # global option and must not become workspace-wide blocks.
            tools_list = config.get("tools") or []
            applies = (
                bool(config.get("all_tools"))
                or "*" in tools_list
                or (bool(restricted_tool) and tool_name == restricted_tool)
                or tool_name in tools_list
            )
            if applies and blocked_fields:
                # MCP arguments arrive as {path_params, query, body}, so a
                # restricted field is nested one level down at least. Matching
                # top-level keys only — what this did — never matched anything
                # an MCP caller sent, and the policy type was inert on the
                # surface most agents write through.
                present = restricted_fields_present(tool_args, blocked_fields)
                if present:
                    return PolicyEvalResult(
                        decision=PolicyDecisionType.BLOCK.value,
                        reason=(
                            f"Field '{present[0]}' is restricted by policy '{policy.name}'"
                        ),
                        policy_id=policy.id,
                    )

        elif policy.policy_type == PolicyType.RATE_LIMIT.value:
            # Only the per-execution form is decidable here. `max_per_hour` and
            # `max_per_day` need a count that outlives one request; the MCP
            # boundary evaluates those against the action ledger (see
            # `McpGovernance._rate_limited`). This branch is reached with an
            # `execution_id` only from the CRM agent runtime.
            rate_tool = config.get("tool", "")
            max_per_execution = config.get("max_per_execution", 0)
            if execution_id and tool_name == rate_tool and max_per_execution > 0:
                # Count allow decisions for this tool in this execution
                count = self._count_allow_decisions_sync(execution_id, tool_name)
                if count >= max_per_execution:
                    return PolicyEvalResult(
                        decision=PolicyDecisionType.RATE_LIMITED.value,
                        reason=f"Rate limit reached for '{tool_name}': {count}/{max_per_execution} (policy '{policy.name}')",
                        policy_id=policy.id,
                    )

        elif policy.policy_type == PolicyType.TOKEN_BUDGET.value:
            # Token budget checking is handled asynchronously;
            # this is a sync evaluation, so we skip it here.
            # Budget enforcement is done in evaluate_token_budget().
            pass

        return None

    def _count_allow_decisions_sync(self, execution_id: str, tool_name: str) -> int:
        """Count allow decisions from cached decisions (in-memory).

        Since decisions are recorded during evaluation, we count from
        the DB records that have already been flushed.
        """
        key = f"{execution_id}:{tool_name}"
        return self._allow_counts.get(key, 0)

    async def evaluate_token_budget(
        self,
        execution_id: str,
        request_id: str | None = None,
    ) -> PolicyEvalResult | None:
        """Check token budget policies against actual usage.

        Called before each LLM call to check if budget is exhausted.
        """
        policies = self._cached_policies or []
        budget_policies = [
            p for p in policies
            if p.policy_type == PolicyType.TOKEN_BUDGET.value
        ]

        if not budget_policies or not request_id:
            return None

        try:
            from aexy.services.usage_service import UsageService
            usage_service = UsageService(self.db)

            # Query total tokens used for this execution
            from aexy.models.billing import UsageRecord
            stmt = select(func.sum(UsageRecord.total_tokens)).where(
                UsageRecord.request_id == request_id
            )
            result = await self.db.execute(stmt)
            total_used = result.scalar() or 0

            for policy in budget_policies:
                max_tokens = policy.config.get("max_tokens", 0)
                if max_tokens > 0 and total_used >= max_tokens:
                    return PolicyEvalResult(
                        decision=PolicyDecisionType.BLOCK.value,
                        reason=f"Token budget exhausted: {total_used}/{max_tokens} (policy '{policy.name}')",
                        policy_id=policy.id,
                    )
        except Exception as e:
            logger.warning("Error checking token budget: %s", e)

        return None

    async def record_decision(
        self,
        execution_id: str,
        policy_id: str | None,
        tool_name: str,
        tool_args: dict,
        decision: str,
        reason: str,
        confidence_score: float | None = None,
        confidence_threshold: float | None = None,
    ) -> AgentPolicyDecision:
        """Record a policy decision in the audit log."""
        record = AgentPolicyDecision(
            id=str(uuid4()),
            execution_id=execution_id,
            policy_id=policy_id,
            tool_name=tool_name,
            tool_args=tool_args,
            decision=decision,
            reason=reason,
            confidence_score=confidence_score,
            confidence_threshold=confidence_threshold,
        )
        self.db.add(record)
        await self.db.flush()

        # Track allow counts for rate limiting
        if decision == PolicyDecisionType.ALLOW.value:
            key = f"{execution_id}:{tool_name}"
            self._allow_counts[key] = self._allow_counts.get(key, 0) + 1

        return record

    # =========================================================================
    # POLICY CRUD
    # =========================================================================

    async def create_policy(
        self,
        workspace_id: str,
        name: str,
        policy_type: str,
        config: dict,
        description: str | None = None,
        agent_id: str | None = None,
        priority: int = 100,
        is_active: bool = True,
        created_by_id: str | None = None,
    ) -> AgentPolicy:
        """Create a new agent policy."""
        policy = AgentPolicy(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            description=description,
            agent_id=agent_id,
            policy_type=policy_type,
            config=config,
            priority=priority,
            is_active=is_active,
            created_by_id=created_by_id,
        )
        self.db.add(policy)
        await self.db.flush()
        await self.db.refresh(policy)
        return policy

    async def get_policy(self, policy_id: str) -> AgentPolicy | None:
        """Get a policy by ID."""
        stmt = select(AgentPolicy).where(AgentPolicy.id == policy_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_policies(
        self,
        workspace_id: str,
        agent_id: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[AgentPolicy]:
        """List policies for a workspace, optionally filtered by agent."""
        stmt = (
            select(AgentPolicy)
            .where(AgentPolicy.workspace_id == workspace_id)
            .order_by(AgentPolicy.priority)
            .offset(skip)
            .limit(limit)
        )
        if agent_id:
            stmt = stmt.where(
                (AgentPolicy.agent_id == agent_id) | (AgentPolicy.agent_id.is_(None))
            )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # Fields that can be explicitly set to None (cleared)
    _nullable_policy_fields = {"description", "agent_id"}

    async def update_policy(
        self, policy_id: str, **kwargs: Any
    ) -> AgentPolicy | None:
        """Update a policy.

        Fields in _nullable_policy_fields can be explicitly set to None.
        Other fields skip None values (unset in the update schema).
        """
        policy = await self.get_policy(policy_id)
        if not policy:
            return None

        for key, value in kwargs.items():
            if not hasattr(policy, key):
                continue
            if value is None and key not in self._nullable_policy_fields:
                continue
            setattr(policy, key, value)

        await self.db.flush()
        await self.db.refresh(policy)
        return policy

    async def delete_policy(self, policy_id: str) -> bool:
        """Delete a policy."""
        policy = await self.get_policy(policy_id)
        if not policy:
            return False

        await self.db.delete(policy)
        await self.db.flush()
        return True

    # =========================================================================
    # POLICY DECISIONS QUERY
    # =========================================================================

    async def list_decisions(
        self,
        agent_id: str,
        execution_id: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> list[AgentPolicyDecision]:
        """List policy decisions for an agent's executions."""
        from aexy.models.agent import CRMAgentExecution

        stmt = (
            select(AgentPolicyDecision)
            .join(
                CRMAgentExecution,
                AgentPolicyDecision.execution_id == CRMAgentExecution.id,
            )
            .where(CRMAgentExecution.agent_id == agent_id)
            .order_by(AgentPolicyDecision.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        if execution_id:
            stmt = stmt.where(AgentPolicyDecision.execution_id == execution_id)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # =========================================================================
    # CONFIG AUDIT
    # =========================================================================

    async def record_config_change(
        self,
        agent_id: str,
        changed_by_id: str,
        change_type: str,
        field_changes: dict,
    ) -> AgentConfigAudit:
        """Record a configuration change in the audit log."""
        audit = AgentConfigAudit(
            id=str(uuid4()),
            agent_id=agent_id,
            changed_by_id=changed_by_id,
            change_type=change_type,
            field_changes=field_changes,
        )
        self.db.add(audit)
        await self.db.flush()
        return audit

    async def list_config_audits(
        self,
        agent_id: str,
        skip: int = 0,
        limit: int = 50,
    ) -> list[AgentConfigAudit]:
        """List config audit entries for an agent."""
        stmt = (
            select(AgentConfigAudit)
            .where(AgentConfigAudit.agent_id == agent_id)
            .order_by(AgentConfigAudit.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # =========================================================================
    # NOTIFICATION HELPERS
    # =========================================================================

    async def _notify_policy_event(
        self,
        agent: Any,
        tool_name: str,
        reason: str,
        workspace_id: str,
        execution_id: str,
        event_type_name: str,
        title: str,
        body: str,
    ) -> None:
        """Send policy-related notifications to workspace admins/owners."""
        try:
            from aexy.services.notification_service import NotificationService
            from aexy.models.notification import NotificationEventType
            from aexy.services.workspace_service import WorkspaceService

            workspace_service = WorkspaceService(self.db)
            notification_service = NotificationService(self.db)

            admins = await workspace_service.get_members_by_role(workspace_id, "admin")
            owners = await workspace_service.get_members_by_role(workspace_id, "owner")
            recipients = {str(m.developer_id) for m in admins + owners}

            event_type = NotificationEventType(event_type_name)
            agent_name = getattr(agent, "name", "Agent")
            for dev_id in recipients:
                await notification_service.create_notification(
                    recipient_id=dev_id,
                    event_type=event_type,
                    title=title,
                    body=body,
                    context={
                        "agent_id": getattr(agent, "id", None),
                        "agent_name": agent_name,
                        "tool_name": tool_name,
                        "execution_id": execution_id,
                        "workspace_id": workspace_id,
                        "action_url": f"/agents/{getattr(agent, 'id', '')}/executions/{execution_id}",
                    },
                )
        except Exception as e:
            logger.warning("Failed to send %s notification: %s", event_type_name, e)

    async def notify_tool_blocked(
        self,
        agent: Any,
        tool_name: str,
        reason: str,
        workspace_id: str,
        execution_id: str,
    ) -> None:
        """Send notifications when a tool call is blocked."""
        agent_name = getattr(agent, "name", "Agent")
        await self._notify_policy_event(
            agent=agent,
            tool_name=tool_name,
            reason=reason,
            workspace_id=workspace_id,
            execution_id=execution_id,
            event_type_name="agent_tool_blocked",
            title=f"Agent tool blocked: {tool_name}",
            body=f"{agent_name} attempted to use '{tool_name}' but was blocked. {reason}",
        )

    async def notify_approval_required(
        self,
        agent: Any,
        tool_name: str,
        reason: str,
        workspace_id: str,
        execution_id: str,
    ) -> None:
        """Send notifications when a tool call requires approval."""
        agent_name = getattr(agent, "name", "Agent")
        await self._notify_policy_event(
            agent=agent,
            tool_name=tool_name,
            reason=reason,
            workspace_id=workspace_id,
            execution_id=execution_id,
            event_type_name="agent_approval_required",
            title=f"Agent action needs approval: {tool_name}",
            body=f"{agent_name} wants to use '{tool_name}'. {reason}",
        )

    async def notify_config_changed(
        self,
        agent: Any,
        changed_by_name: str,
        change_type: str,
        workspace_id: str,
    ) -> None:
        """Send notifications when agent config is changed."""
        try:
            from aexy.services.notification_service import NotificationService
            from aexy.models.notification import NotificationEventType
            from aexy.services.workspace_service import WorkspaceService

            workspace_service = WorkspaceService(self.db)
            notification_service = NotificationService(self.db)

            admins = await workspace_service.get_members_by_role(workspace_id, "admin")
            owners = await workspace_service.get_members_by_role(workspace_id, "owner")
            recipients = {str(m.developer_id) for m in admins + owners}

            agent_name = getattr(agent, "name", "Agent")
            for dev_id in recipients:
                await notification_service.create_notification(
                    recipient_id=dev_id,
                    event_type=NotificationEventType.AGENT_CONFIG_CHANGED,
                    title=f"Agent config {change_type}d: {agent_name}",
                    body=f"{changed_by_name} {change_type}d the configuration for {agent_name}.",
                    context={
                        "agent_id": getattr(agent, "id", None),
                        "agent_name": agent_name,
                        "change_type": change_type,
                        "workspace_id": workspace_id,
                        "action_url": f"/agents/{getattr(agent, 'id', '')}",
                    },
                )
        except Exception as e:
            logger.warning("Failed to send config changed notification: %s", e)
