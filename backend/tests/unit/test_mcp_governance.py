"""Governance on the surface agents actually write through.

`McpToolExecutor` re-enters the app with a scoped token, so permissions were
always enforced. Governance — may an agent do this *unattended*? — was modelled
in full by `AgentPolicyEngine` and evaluated in exactly one place, for CRM
agents, while the MCP tool surface consulted none of it.

These assert on what does and does not reach the application: a refusal that
still performed the call and undid it afterwards would pass any test that only
checked the returned message.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from aexy.models.agent_policy import (
    AgentPendingAction,
    AgentPolicyDecision,
    PolicyDecisionType,
    PolicyType,
)
from aexy.services.mcp_governance import McpGovernance
from aexy.services.mcp_tool_executor import McpToolExecutor, ToolResult

pytestmark = pytest.mark.asyncio

WORKSPACE = "11111111-1111-4111-8111-111111111111"
DEV = "22222222-2222-4222-8222-222222222222"

WRITE_OP = {
    "action": "crm.update_contact",
    "method": "patch",
    "path": "/api/v1/workspaces/{workspace_id}/crm/contacts/{id}",
    "mutating": True,
    "_capability": "crm",
}
READ_OP = {**WRITE_OP, "action": "crm.get_contact", "method": "get", "mutating": False}


class FakeDb:
    """Collects what governance wrote, without a database."""

    def __init__(self, policies=None):
        self.added: list = []
        self._policies = policies or []
        self.flushes = 0

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        self.flushes += 1

    async def execute(self, _stmt):
        rows = self._policies
        return SimpleNamespace(
            scalars=lambda: SimpleNamespace(all=lambda: rows)
        )

    def of_type(self, cls):
        return [row for row in self.added if isinstance(row, cls)]


def policy(policy_type: str, config: dict, name="test policy"):
    return SimpleNamespace(
        id="policy-1",
        workspace_id=WORKSPACE,
        agent_id=None,
        name=name,
        policy_type=policy_type,
        config=config,
        priority=100,
        is_active=True,
    )


class TestReadsAreNotGated:
    async def test_a_read_never_loads_a_policy(self):
        """A gate that made an agent ask permission to look something up
        would be switched off within a week, taking the write gate with it."""
        db = FakeDb(policies=[policy(PolicyType.TOOL_BLOCK.value, {"tools": ["*"]})])

        verdict = await McpGovernance(db).review(
            operation=READ_OP,
            arguments={},
            developer_id=DEV,
            workspace_id=WORKSPACE,
            tool_name="aexy_crm",
        )

        assert verdict.allowed is True
        assert db.added == []

    async def test_a_workspace_with_no_policies_allows_writes(self):
        db = FakeDb(policies=[])

        verdict = await McpGovernance(db).review(
            operation=WRITE_OP,
            arguments={},
            developer_id=DEV,
            workspace_id=WORKSPACE,
            tool_name="aexy_crm",
        )

        assert verdict.allowed is True
        assert db.added == []


class TestBlocking:
    async def test_a_blocked_tool_is_refused(self):
        db = FakeDb(
            policies=[
                policy(PolicyType.TOOL_BLOCK.value, {"tools": ["crm.update_contact"]})
            ]
        )

        verdict = await McpGovernance(db).review(
            operation=WRITE_OP,
            arguments={},
            developer_id=DEV,
            workspace_id=WORKSPACE,
            tool_name="aexy_crm",
        )

        assert verdict.allowed is False

    async def test_the_refusal_is_written_down(self):
        """The audit log covered CRM agents and nothing else, so a decision
        taken here could not be recorded at all — and looked complete."""
        db = FakeDb(
            policies=[
                policy(PolicyType.TOOL_BLOCK.value, {"tools": ["crm.update_contact"]})
            ]
        )

        await McpGovernance(db).review(
            operation=WRITE_OP,
            arguments={"body": {"name": "x"}},
            developer_id=DEV,
            workspace_id=WORKSPACE,
            tool_name="aexy_crm",
        )

        [decision] = db.of_type(AgentPolicyDecision)
        assert decision.actor_kind == "mcp"
        assert decision.actor_developer_id == DEV
        assert decision.workspace_id == WORKSPACE
        assert decision.execution_id is None
        assert decision.tool_name == "crm.update_contact"
        assert decision.decision == PolicyDecisionType.BLOCK.value


class TestRequireApprovalQueues:
    def _db(self):
        return FakeDb(
            policies=[
                policy(
                    PolicyType.TOOL_REQUIRE_APPROVAL.value,
                    {"tools": ["crm.update_contact"]},
                )
            ]
        )

    async def test_the_call_is_queued_rather_than_refused(self):
        """The engine could only ever say no. A refusal an agent cannot act on
        is a dead end; a queued request is work somebody can finish."""
        db = self._db()

        verdict = await McpGovernance(db).review(
            operation=WRITE_OP,
            arguments={"path_params": {"id": "c1"}, "body": {"name": "x"}},
            developer_id=DEV,
            workspace_id=WORKSPACE,
            tool_name="aexy_crm",
        )

        assert verdict.allowed is False
        assert verdict.pending_action_id is not None
        [pending] = db.of_type(AgentPendingAction)
        assert pending.action == "crm.update_contact"
        assert pending.status == "pending"

    async def test_the_queued_row_can_replay_the_call_exactly(self):
        """Policy runs before the call, so there is no result to review — only
        the request. It has to be complete enough to run later."""
        db = self._db()
        arguments = {"path_params": {"id": "c1"}, "body": {"name": "x"}}

        await McpGovernance(db).review(
            operation=WRITE_OP,
            arguments=arguments,
            developer_id=DEV,
            workspace_id=WORKSPACE,
            tool_name="aexy_crm",
        )

        [pending] = db.of_type(AgentPendingAction)
        assert pending.method == "patch"
        assert pending.path == WRITE_OP["path"]
        assert pending.arguments == arguments
        assert pending.requested_by_id == DEV
        assert pending.tool_name == "aexy_crm"

    async def test_the_agent_is_told_nothing_has_changed_yet(self):
        """Written for a model to relay to a person. "Blocked" sends an agent
        looking for a workaround."""
        db = self._db()

        verdict = await McpGovernance(db).review(
            operation=WRITE_OP,
            arguments={},
            developer_id=DEV,
            workspace_id=WORKSPACE,
            tool_name="aexy_crm",
        )

        assert "approval" in verdict.message.lower()
        assert "nothing has changed yet" in verdict.message.lower()


class TestFailureBehaviour:
    async def test_a_broken_policy_layer_does_not_take_the_tools_down(self):
        """Failing closed on our own bug would break every agent in the
        workspace; failing open *silently* would be worse than no gate — so it
        fails open and says so loudly in the log."""
        db = FakeDb()
        db.execute = AsyncMock(side_effect=RuntimeError("policy table on fire"))

        verdict = await McpGovernance(db).review(
            operation=WRITE_OP,
            arguments={},
            developer_id=DEV,
            workspace_id=WORKSPACE,
            tool_name="aexy_crm",
        )

        assert verdict.allowed is True


class TestTheExecutorConsultsGovernance:
    """The join. Governance that is never called is the state this fixes."""

    def _executor(self, db):
        catalog = {
            "capabilities": [
                {"capability": "crm", "operations": [WRITE_OP, READ_OP]}
            ]
        }
        return McpToolExecutor(app=MagicMock(), catalog=catalog, granted={"crm"}, db=db)

    async def test_a_refused_call_never_reaches_the_application(self, monkeypatch):
        """The important assertion. A gate that performed the call and undid it
        afterwards would satisfy a test that only read the returned message."""
        db = FakeDb(
            policies=[
                policy(PolicyType.TOOL_BLOCK.value, {"tools": ["crm.update_contact"]})
            ]
        )
        executor = self._executor(db)

        performed = False

        async def _perform(**_kwargs):
            nonlocal performed
            performed = True
            return ToolResult("should not happen")

        monkeypatch.setattr(executor, "_perform", _perform)

        result = await executor.call(
            tool_name="aexy_crm",
            arguments={"action": "crm.update_contact"},
            developer_id=DEV,
            workspace_id=WORKSPACE,
        )

        assert performed is False
        assert result.is_error is True

    async def test_an_allowed_call_proceeds(self, monkeypatch):
        db = FakeDb(policies=[])
        executor = self._executor(db)

        async def _perform(**_kwargs):
            return ToolResult("done")

        monkeypatch.setattr(executor, "_perform", _perform)

        result = await executor.call(
            tool_name="aexy_crm",
            arguments={"action": "crm.update_contact"},
            developer_id=DEV,
            workspace_id=WORKSPACE,
        )

        assert result.is_error is False
        assert result.content == "done"

    async def test_without_a_session_the_executor_still_works(self, monkeypatch):
        """Kept constructible without a database for tests and scripts — the
        transport always passes one, which is what makes the gate real."""
        executor = self._executor(None)

        async def _perform(**_kwargs):
            return ToolResult("done")

        monkeypatch.setattr(executor, "_perform", _perform)

        result = await executor.call(
            tool_name="aexy_crm",
            arguments={"action": "crm.update_contact"},
            developer_id=DEV,
            workspace_id=WORKSPACE,
        )

        assert result.is_error is False


class TestTheTransportPassesTheSession:
    def test_the_executor_is_constructed_with_a_database(self):
        """Without this the governance layer exists and is never consulted —
        which is precisely the defect being fixed, and no behavioural test
        would notice."""
        import inspect

        from aexy.api import mcp_transport

        source = inspect.getsource(mcp_transport)
        assert "McpToolExecutor(request.app, catalog, granted, db=db)" in source
