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
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.agent_action_log import AgentActionLog
from aexy.models.agent_policy import (
    AgentPolicy,
    AgentPolicyDecision,
    PolicyDecisionType,
    PolicyType,
)
from aexy.models.proposed_change import ChangeKind, ChangeStatus, ProposedChange
from aexy.services.mcp_tool_executor import redact

# The windows a rate-limit policy may name, and how long each one is.
RATE_WINDOWS: dict[str, timedelta] = {
    "max_per_hour": timedelta(hours=1),
    "max_per_day": timedelta(days=1),
}

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
        granted: set[str] | None = None,
        principal_id: str | None = None,
        actor_kind: str = "mcp",
    ) -> Verdict:
        """Decide whether this call may run now, later, or not at all.

        Never raises. A governance layer that can fail closed on its own bugs
        would take the whole tool surface down with it, and a governance layer
        that fails *open* silently is worse than none — so a failure is logged
        loudly, written to the decision log as `evaluation_failed`, and the call
        is allowed, matching the behaviour before this module existed. The row is
        the part that matters: it makes "what did the gate let through while it
        was broken" a query rather than a hope that somebody read the logs.
        """
        try:
            return await self._review(
                operation=operation,
                arguments=arguments,
                developer_id=developer_id,
                workspace_id=workspace_id,
                tool_name=tool_name,
                granted=granted,
                principal_id=principal_id,
                actor_kind=actor_kind,
            )
        except Exception:  # pragma: no cover - defensive
            logger.exception(
                "Policy evaluation failed for %s in workspace %s — allowing",
                operation.get("action"),
                workspace_id,
            )
            # Written down as well as logged. A gate that fails open leaves no
            # trace of what it let through, so "did anything slip past while the
            # policy loader was broken" was a question only answerable by
            # trawling logs — and only if somebody thought to look. This row is
            # queryable beside the refusals.
            await self._record_evaluation_failure(
                workspace_id=workspace_id,
                developer_id=developer_id,
                action=operation.get("action") or "",
                arguments=arguments,
                actor_kind=actor_kind,
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
        granted: set[str] | None = None,
        principal_id: str | None = None,
        actor_kind: str = "mcp",
    ) -> Verdict:
        # Reads pass untouched, and cheaply: no policy load, no audit row.
        if not operation.get("mutating"):
            return Verdict(allowed=True)

        policies = await self._active_policies(workspace_id)
        if not policies:
            return Verdict(allowed=True)

        from aexy.services.agent_policy_engine import AgentPolicyEngine

        engine = AgentPolicyEngine(self.db)
        # `decide` rather than `evaluate_tool_call`: the latter writes its own
        # audit row keyed on an execution id, and an MCP call has none — the
        # empty string it would store is a foreign key to a CRM execution that
        # does not exist. It also records an ALLOW for every call, which buries
        # the refusals in a table nobody could then read.
        #
        # The context is what lets a policy say "every DELETE" or "anything in
        # admin" instead of listing action names.
        context = {
            "method": operation.get("method"),
            "capability": operation.get("_capability"),
            "mutating": True,
        }
        result = engine.decide(
            operation["action"], arguments, policies=policies, context=context
        )

        if result is None or result.decision == PolicyDecisionType.ALLOW.value:
            # Nothing blocked or held it. The one question left is whether this
            # actor has done it too often lately, which the engine cannot
            # answer — its counter lives for one request — and the ledger can.
            result = await self._rate_limited(
                policies=policies,
                action=operation["action"],
                developer_id=developer_id,
                workspace_id=workspace_id,
                context=context,
            )
            if result is None:
                return Verdict(allowed=True)

        await self._record(
            workspace_id=workspace_id,
            developer_id=developer_id,
            action=operation["action"],
            arguments=arguments,
            result=result,
            actor_kind=actor_kind,
        )

        if result.decision == PolicyDecisionType.REQUIRE_APPROVAL.value:
            pending = await self._queue(
                workspace_id=workspace_id,
                developer_id=developer_id,
                tool_name=tool_name,
                operation=operation,
                arguments=arguments,
                result=result,
                granted=granted,
                principal_id=principal_id,
                actor_kind=actor_kind,
            )
            await self._notify_held(
                workspace_id=workspace_id,
                developer_id=developer_id,
                action=operation["action"],
                pending_id=str(pending.id),
                reason=result.reason,
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

        A workspace with no policies at all gets the default pack here, on its
        first governed call. Creation seeds it too, and a backfill exists for
        workspaces that predate the pack — but the gate is the one place that
        must not depend on either having run.
        """
        rows = await self.db.execute(
            select(AgentPolicy)
            .where(AgentPolicy.workspace_id == workspace_id)
            .where(AgentPolicy.agent_id.is_(None))
            .where(AgentPolicy.is_active.is_(True))
            .order_by(AgentPolicy.priority)
        )
        policies = list(rows.scalars().all())
        if policies:
            return policies

        try:
            from aexy.services.agent_policy_defaults import ensure_default_policies

            # Two first-ever governed calls arriving together would each see
            # an empty table and each seed the pack. A transaction-scoped
            # advisory lock serialises them where the database has one.
            if self.db.bind is not None and self.db.bind.dialect.name == "postgresql":
                await self.db.execute(
                    text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
                    {"key": f"agent-policy-seed:{workspace_id}"},
                )
            seeded = await ensure_default_policies(self.db, workspace_id)
        except Exception:  # pragma: no cover - defensive
            # Seeding is a convenience on top of the gate, not part of it.
            # Failing here must leave governance exactly where it was.
            logger.exception(
                "Could not seed default agent policies for workspace %s", workspace_id
            )
            return []
        return sorted(seeded, key=lambda p: p.priority)

    async def _rate_limited(
        self,
        *,
        policies: list[AgentPolicy],
        action: str,
        developer_id: str,
        workspace_id: str,
        context: dict[str, Any],
    ) -> Any | None:
        """The first rate-limit policy this call exceeds, as a PolicyEvalResult.

        `max_per_hour` / `max_per_day` are counted from the action ledger, per
        actor, per action, in this workspace. `max_per_execution` is the CRM
        runtime's form and means nothing here: an MCP session has no
        execution. Counting failures is best-effort; a ledger that cannot be
        read must not turn every write into a refusal.
        """
        from aexy.services.agent_policy_engine import PolicyEvalResult, policy_selects

        for policy in policies:
            if policy.policy_type != PolicyType.RATE_LIMIT.value:
                continue
            config = policy.config or {}
            selects = (
                config.get("tool") == action
                or policy_selects(config, action, context) is not None
            )
            if not selects:
                continue

            for key, window in RATE_WINDOWS.items():
                limit = config.get(key) or 0
                if limit <= 0:
                    continue
                try:
                    count = await self._count_recent(
                        workspace_id=workspace_id,
                        developer_id=developer_id,
                        action=action,
                        since=datetime.now(timezone.utc) - window,
                        config=config,
                    )
                except Exception:
                    logger.exception(
                        "Could not count recent actions for rate limit %s", policy.id
                    )
                    continue
                if count >= limit:
                    return PolicyEvalResult(
                        decision=PolicyDecisionType.RATE_LIMITED.value,
                        reason=(
                            f"Rate limit reached for '{action}': {count}/{limit} "
                            f"{key.removeprefix('max_')} (policy '{policy.name}')"
                        ),
                        policy_id=policy.id,
                    )
        return None

    async def _count_recent(
        self,
        *,
        workspace_id: str,
        developer_id: str,
        action: str,
        since: datetime,
        config: dict[str, Any] | None = None,
    ) -> int:
        """How many recent ledger rows this policy would have selected.

        A limit written as `tool: delete_record` counts that action. One
        written as `methods: [DELETE]` or `capabilities: [mcp.crm]` must count
        every row it covers, or "ten deletes an hour" quietly becomes "ten per
        distinct delete action an hour". Selection is re-evaluated per row with
        the same function the gate uses, so the two cannot disagree.
        """
        config = config or {}
        by_name_only = not any(
            config.get(k) for k in ("tools", "methods", "action_patterns", "capabilities")
        )
        if by_name_only:
            result = await self.db.execute(
                select(func.count(AgentActionLog.id))
                .where(AgentActionLog.workspace_id == workspace_id)
                .where(AgentActionLog.actor_developer_id == developer_id)
                .where(AgentActionLog.action == action)
                .where(AgentActionLog.created_at >= since)
            )
            return int(result.scalar() or 0)

        from aexy.services.agent_policy_engine import policy_selects

        rows = await self.db.execute(
            select(AgentActionLog.action, AgentActionLog.method, AgentActionLog.capability)
            .where(AgentActionLog.workspace_id == workspace_id)
            .where(AgentActionLog.actor_developer_id == developer_id)
            .where(AgentActionLog.created_at >= since)
        )
        count = 0
        for row_action, row_method, row_capability in rows.all():
            row_context = {"method": row_method, "capability": row_capability, "mutating": True}
            if config.get("tool") == row_action or policy_selects(
                config, row_action, row_context
            ) is not None:
                count += 1
        return count

    async def _notify_held(
        self,
        *,
        workspace_id: str,
        developer_id: str,
        action: str,
        pending_id: str,
        reason: str | None,
    ) -> None:
        """Tell the workspace's admins something is waiting on them.

        The CRM runtime has always done this; the MCP path queued silently, so
        an action sat in /review until somebody happened to open it. Best
        effort — a notification that cannot be sent must not fail the hold.
        """
        try:
            from aexy.models.notification import NotificationEventType
            from aexy.services.notification_service import NotificationService
            from aexy.services.workspace_service import WorkspaceService

            workspaces = WorkspaceService(self.db)
            admins = await workspaces.get_members_by_role(workspace_id, "admin")
            owners = await workspaces.get_members_by_role(workspace_id, "owner")
            recipients = {str(m.developer_id) for m in [*admins, *owners]}

            notifications = NotificationService(self.db)
            for recipient in recipients:
                await notifications.create_notification(
                    recipient_id=recipient,
                    event_type=NotificationEventType.AGENT_APPROVAL_REQUIRED,
                    title=f"Agent action needs approval: {action}",
                    body=(
                        f"An agent acting for a member wants to run `{action}`. "
                        f"{reason or ''}".strip()
                    ),
                    context={
                        "tool_name": action,
                        "pending_action_id": pending_id,
                        "requested_by_id": developer_id,
                        "workspace_id": workspace_id,
                        "action_url": "/review",
                    },
                )
        except Exception:
            logger.warning(
                "Could not notify admins about held action %s", pending_id, exc_info=True
            )

    async def _record_evaluation_failure(
        self,
        *,
        workspace_id: str,
        developer_id: str,
        action: str,
        arguments: dict[str, Any],
        actor_kind: str = "mcp",
    ) -> None:
        """Note that the gate could not decide, and allowed the call anyway.

        Its own best-effort try/except: this runs *because* something already
        failed, and a governance layer that raises while recording its own
        failure would turn a permitted call into a 500.

        `policy_id` is null — no policy decided this. `decision` reads
        `evaluation_failed` rather than `allow`, so these are countable
        separately from calls a policy actually permitted.
        """
        try:
            self.db.add(
                AgentPolicyDecision(
                    id=str(uuid4()),
                    execution_id=None,
                    actor_kind=actor_kind,
                    actor_developer_id=developer_id,
                    workspace_id=workspace_id,
                    policy_id=None,
                    tool_name=action,
                    tool_args=redact(arguments),
                    decision="evaluation_failed",
                    reason=(
                        "Policy evaluation raised; the call was allowed. See the "
                        "logged traceback for the cause."
                    ),
                )
            )
            await self.db.flush()
        except Exception:
            logger.exception("Could not record the policy evaluation failure")

    async def _record(
        self,
        *,
        workspace_id: str,
        developer_id: str,
        action: str,
        arguments: dict[str, Any],
        result: Any,
        actor_kind: str = "mcp",
    ) -> None:
        """Write the decision down.

        Only non-allow decisions are recorded. Logging every permitted read
        would bury the refusals in a table nobody could then read. Arguments
        are redacted the same way the ledger redacts them: a held
        `update_integration` carrying an API key must not land here in clear.
        """
        self.db.add(
            AgentPolicyDecision(
                id=str(uuid4()),
                execution_id=None,
                actor_kind=actor_kind,
                actor_developer_id=developer_id,
                workspace_id=workspace_id,
                policy_id=result.policy_id,
                tool_name=action,
                tool_args=redact(arguments),
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
        granted: set[str] | None = None,
        principal_id: str | None = None,
        actor_kind: str = "mcp",
    ) -> ProposedChange:
        pending = ProposedChange(
            id=str(uuid4()),
            kind=ChangeKind.ACTION.value,
            entity_type="agent_action",
            # Null on purpose: a call stopped before it ran has not told us
            # what it would have touched, and naming a target here would be a
            # guess the reviewer might believe.
            entity_id=None,
            workspace_id=workspace_id,
            requested_by_id=developer_id,
            payload={
                "tool_name": tool_name,
                "action": operation["action"],
                "method": operation["method"],
                "path": operation["path"],
                "arguments": arguments,
                # The consent this call was made under, frozen at the moment it
                # was held. Replaying with whatever the catalogue offers today
                # would let an action queued under a wide grant run after that
                # grant was narrowed or withdrawn — approval is permission to
                # proceed, not a re-grant.
                "granted": sorted(granted) if granted else None,
                # Who asked, so the replay is ledgered under the same identity
                # and the decision goes back to the right place.
                "principal_id": principal_id,
                "actor_kind": actor_kind,
            },
            source=result.policy_id,
            reason=result.reason,
            status=ChangeStatus.PENDING.value,
        )
        self.db.add(pending)
        await self.db.flush()
        return pending
