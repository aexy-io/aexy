"""Policy at the MCP boundary.

`McpToolExecutor` re-enters the application over ASGI carrying a scoped token,
so every endpoint runs its own auth, workspace membership and app-access
checks. That is the right design and it is not what this module is about.

Permissions answer "may this person touch this?". Governance answers "should
this *agent*, acting for them, do this unattended?" — and the two are
different questions. `AgentPolicyEngine` has modelled the second since it was
written, with block, require-approval, field restriction, rate limit and token
budget, plus an immutable decision log. It was evaluated in exactly one place,
for CRM agents, while the surface external coding agents actually write
through consulted none of it.

Reads are never gated. A policy that made an agent ask permission to look
something up would be switched off within a week and take the write gate with
it.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.agent_policy import (
    AgentPendingAction,
    AgentPolicy,
    AgentPolicyDecision,
    PendingActionStatus,
    PolicyDecisionType,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Verdict:
    """What governance decided, and what the agent should be told."""

    allowed: bool
    message: str | None = None
    pending_action_id: str | None = None


class McpGovernance:
    """Evaluate workspace policy for one MCP tool call."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def review(
        self,
        *,
        operation: dict[str, Any],
        arguments: dict[str, Any],
        developer_id: str,
        workspace_id: str,
        tool_name: str,
    ) -> Verdict:
        """Decide whether this call may run now, later, or not at all.

        Never raises. A governance layer that can fail closed on its own bugs
        would take the whole tool surface down with it, and a governance layer
        that fails *open* silently is worse than none — so a failure is logged
        loudly and the call is allowed, matching the behaviour before this
        module existed.
        """
        try:
            return await self._review(
                operation=operation,
                arguments=arguments,
                developer_id=developer_id,
                workspace_id=workspace_id,
                tool_name=tool_name,
            )
        except Exception:  # pragma: no cover - defensive
            logger.exception(
                "Policy evaluation failed for %s in workspace %s — allowing",
                operation.get("action"),
                workspace_id,
            )
            return Verdict(allowed=True)

    async def _review(
        self,
        *,
        operation: dict[str, Any],
        arguments: dict[str, Any],
        developer_id: str,
        workspace_id: str,
        tool_name: str,
    ) -> Verdict:
        # Reads pass untouched, and cheaply: no policy load, no audit row.
        if not operation.get("mutating"):
            return Verdict(allowed=True)

        policies = await self._active_policies(workspace_id)
        if not policies:
            return Verdict(allowed=True)

        from aexy.services.agent_policy_engine import AgentPolicyEngine

        engine = AgentPolicyEngine(self.db)
        engine._cached_policies = policies
        # `decide` rather than `evaluate_tool_call`: the latter writes its own
        # audit row keyed on an execution id, and an MCP call has none — the
        # empty string it would store is a foreign key to a CRM execution that
        # does not exist. It also records an ALLOW for every call, which buries
        # the refusals in a table nobody could then read.
        result = engine.decide(operation["action"], arguments)

        if result is None or result.decision == PolicyDecisionType.ALLOW.value:
            return Verdict(allowed=True)

        await self._record(
            workspace_id=workspace_id,
            developer_id=developer_id,
            action=operation["action"],
            arguments=arguments,
            result=result,
        )

        if result.decision == PolicyDecisionType.REQUIRE_APPROVAL.value:
            pending = await self._queue(
                workspace_id=workspace_id,
                developer_id=developer_id,
                tool_name=tool_name,
                operation=operation,
                arguments=arguments,
                result=result,
            )
            return Verdict(
                allowed=False,
                pending_action_id=str(pending.id),
                # Written for the model to relay to a person. "Blocked" would
                # send an agent looking for a workaround; "waiting for someone"
                # is the truth and suggests the right next step.
                message=(
                    f"`{operation['action']}` needs approval from someone in this "
                    f"workspace before it can run. It has been queued for review "
                    f"({pending.id}). Nothing has changed yet.\n\n"
                    f"Reason: {result.reason}"
                ),
            )

        if result.decision == PolicyDecisionType.RATE_LIMITED.value:
            return Verdict(
                allowed=False,
                message=f"Rate limit reached: {result.reason}",
            )

        return Verdict(allowed=False, message=result.reason)

    async def _active_policies(self, workspace_id: str) -> list[AgentPolicy]:
        """Workspace-wide policies only.

        `AgentPolicy.agent_id` scopes a rule to one CRM agent; an MCP session
        is not one, so those rules cannot meaningfully apply here and a NULL
        agent_id — "all agents" — is what governs this surface.
        """
        rows = await self.db.execute(
            select(AgentPolicy)
            .where(AgentPolicy.workspace_id == workspace_id)
            .where(AgentPolicy.agent_id.is_(None))
            .where(AgentPolicy.is_active.is_(True))
            .order_by(AgentPolicy.priority)
        )
        return list(rows.scalars().all())

    async def _record(
        self,
        *,
        workspace_id: str,
        developer_id: str,
        action: str,
        arguments: dict[str, Any],
        result: Any,
    ) -> None:
        """Write the decision down.

        Only non-allow decisions are recorded. Logging every permitted read
        would bury the refusals in a table nobody could then read.
        """
        self.db.add(
            AgentPolicyDecision(
                id=str(uuid4()),
                execution_id=None,
                actor_kind="mcp",
                actor_developer_id=developer_id,
                workspace_id=workspace_id,
                policy_id=result.policy_id,
                tool_name=action,
                tool_args=arguments,
                decision=result.decision,
                reason=result.reason,
            )
        )
        await self.db.flush()

    async def _queue(
        self,
        *,
        workspace_id: str,
        developer_id: str,
        tool_name: str,
        operation: dict[str, Any],
        arguments: dict[str, Any],
        result: Any,
    ) -> AgentPendingAction:
        pending = AgentPendingAction(
            id=str(uuid4()),
            workspace_id=workspace_id,
            requested_by_id=developer_id,
            tool_name=tool_name,
            action=operation["action"],
            method=operation["method"],
            path=operation["path"],
            arguments=arguments,
            policy_id=result.policy_id,
            reason=result.reason,
            status=PendingActionStatus.PENDING.value,
        )
        self.db.add(pending)
        await self.db.flush()
        return pending
