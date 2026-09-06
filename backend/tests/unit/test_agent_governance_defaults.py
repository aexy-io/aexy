"""Governance that works over MCP, and the defaults a workspace starts with.

Three of five policy types were inert on the MCP surface: the rate limit
counted from a dict that lived for one request, field restriction looked only
at top-level keys while MCP nests everything under `body`, and token budget was
skipped outright. A workspace with no policy rows allowed every mutating call.
These assert the fixes and the pack.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from aexy.models.agent_action_log import AgentActionLog
from aexy.models.agent_policy import AgentPolicy, PolicyDecisionType, PolicyType
from aexy.models.proposed_change import ProposedChange
from aexy.services.agent_policy_defaults import (
    DEFAULT_KEY,
    DEFAULT_POLICY_PACK,
    build_default_policies,
    ensure_default_policies,
)
from aexy.services.agent_policy_engine import (
    AgentPolicyEngine,
    policy_selects,
    restricted_fields_present,
)
from aexy.services.mcp_governance import McpGovernance
from aexy.services.mcp_tool_executor import McpToolExecutor, redact

pytestmark = pytest.mark.asyncio

WORKSPACE = "11111111-1111-4111-8111-111111111111"
DEV = "22222222-2222-4222-8222-222222222222"


def _policy(policy_type, config, name="p", priority=100, pid="policy-1"):
    return SimpleNamespace(
        id=pid,
        workspace_id=WORKSPACE,
        agent_id=None,
        name=name,
        policy_type=policy_type,
        config=config,
        priority=priority,
        is_active=True,
    )


class FakeDb:
    def __init__(self, policies=None):
        self.added: list = []
        self._policies = policies or []

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        pass

    async def execute(self, _stmt):
        rows = self._policies
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: rows))

    def of_type(self, cls):
        return [r for r in self.added if isinstance(r, cls)]


# ---------------------------------------------------------------------------
# Selectors
# ---------------------------------------------------------------------------


class TestSelectors:
    def test_exact_tool_name_still_matches(self):
        assert policy_selects({"tools": ["send_email"]}, "send_email", None)

    def test_method_selector_needs_context(self):
        config = {"methods": ["DELETE"]}
        assert policy_selects(config, "delete_ticket", None) is None
        assert policy_selects(config, "delete_ticket", {"method": "delete"})

    def test_pattern_selector(self):
        config = {"action_patterns": [r"(^|_)send(_|$)"]}
        assert policy_selects(config, "send_campaign", None)
        assert policy_selects(config, "resend_invite", None) is None
        assert policy_selects(config, "campaign_send", None)

    def test_capability_selector_accepts_both_spellings(self):
        ctx = {"capability": "mcp.admin"}
        assert policy_selects({"capabilities": ["mcp.admin"]}, "x", ctx)
        assert policy_selects({"capabilities": ["admin"]}, "x", ctx)
        assert policy_selects({"capabilities": ["crm"]}, "x", ctx) is None

    def test_invalid_pattern_is_ignored_not_fatal(self):
        assert policy_selects({"action_patterns": ["("]}, "anything", None) is None

    def test_engine_uses_context_for_require_approval(self):
        engine = AgentPolicyEngine(db=None)
        result = engine.decide(
            "delete_ticket",
            {},
            policies=[_policy(PolicyType.TOOL_REQUIRE_APPROVAL.value, {"methods": ["DELETE"]})],
            context={"method": "DELETE"},
        )
        assert result is not None
        assert result.decision == PolicyDecisionType.REQUIRE_APPROVAL.value

    def test_crm_path_without_context_is_unchanged(self):
        """The CRM runtime passes no context; a methods-only policy must not
        fire there on the strength of a name."""
        engine = AgentPolicyEngine(db=None)
        result = engine.decide(
            "delete_ticket",
            {},
            policies=[_policy(PolicyType.TOOL_REQUIRE_APPROVAL.value, {"methods": ["DELETE"]})],
        )
        assert result is None


# ---------------------------------------------------------------------------
# Field restriction
# ---------------------------------------------------------------------------


class TestFieldRestriction:
    def test_nested_field_is_found(self):
        args = {"path_params": {"id": "1"}, "body": {"contact": {"email": "x"}}}
        assert restricted_fields_present(args, ["email"]) == ["body.contact.email"]

    def test_dotted_path_is_found(self):
        args = {"body": {"salary": 1}}
        assert restricted_fields_present(args, ["body.salary"]) == ["body.salary"]

    def test_field_inside_a_list_is_found(self):
        args = {"body": [{"name": "a"}, {"phone": "b"}]}
        assert restricted_fields_present(args, ["phone"]) == ["body.phone"]

    def test_engine_blocks_nested_restricted_field(self):
        engine = AgentPolicyEngine(db=None)
        result = engine.decide(
            "update_contact",
            {"body": {"email": "x@y"}},
            policies=[
                _policy(
                    PolicyType.FIELD_RESTRICTION.value,
                    {"tool": "update_contact", "blocked_fields": ["email"]},
                )
            ],
        )
        assert result is not None
        assert result.decision == PolicyDecisionType.BLOCK.value

    def test_restriction_marked_all_tools_applies_everywhere(self):
        engine = AgentPolicyEngine(db=None)
        result = engine.decide(
            "anything_at_all",
            {"body": {"ssn": "1"}},
            policies=[
                _policy(
                    PolicyType.FIELD_RESTRICTION.value,
                    {"blocked_fields": ["ssn"], "all_tools": True},
                )
            ],
        )
        assert result is not None

    def test_restriction_with_no_tool_stays_inert(self):
        """Rows saved with an empty `tool` predate the global option. They
        never matched anything, and must not start blocking every write."""
        engine = AgentPolicyEngine(db=None)
        result = engine.decide(
            "anything_at_all",
            {"body": {"ssn": "1"}},
            policies=[_policy(PolicyType.FIELD_RESTRICTION.value, {"blocked_fields": ["ssn"]})],
        )
        assert result is None


# ---------------------------------------------------------------------------
# Rate limit over MCP
# ---------------------------------------------------------------------------


class TestRateLimitOverMcp:
    OP = {
        "action": "send_campaign",
        "method": "post",
        "path": "/x",
        "mutating": True,
        "_capability": "mcp.email_marketing",
    }

    def _db(self):
        return FakeDb(
            policies=[
                _policy(
                    PolicyType.RATE_LIMIT.value,
                    {"tool": "send_campaign", "max_per_hour": 2},
                )
            ]
        )

    async def test_under_the_limit_is_allowed(self):
        gov = McpGovernance(self._db())
        gov._count_recent = AsyncMock(return_value=1)
        verdict = await gov.review(
            operation=self.OP, arguments={}, developer_id=DEV, workspace_id=WORKSPACE, tool_name="t"
        )
        assert verdict.allowed is True

    async def test_at_the_limit_is_refused_and_recorded(self):
        db = self._db()
        gov = McpGovernance(db)
        gov._count_recent = AsyncMock(return_value=2)
        verdict = await gov.review(
            operation=self.OP, arguments={}, developer_id=DEV, workspace_id=WORKSPACE, tool_name="t"
        )
        assert verdict.allowed is False
        assert "rate limit" in verdict.message.lower()
        [decision] = [r for r in db.added if getattr(r, "decision", None)]
        assert decision.decision == PolicyDecisionType.RATE_LIMITED.value

    async def test_per_execution_form_means_nothing_here(self):
        """`max_per_execution` is the CRM runtime's counter. An MCP session has
        no execution, so it must neither fire nor error."""
        db = FakeDb(
            policies=[
                _policy(PolicyType.RATE_LIMIT.value, {"tool": "send_campaign", "max_per_execution": 1})
            ]
        )
        gov = McpGovernance(db)
        verdict = await gov.review(
            operation=self.OP, arguments={}, developer_id=DEV, workspace_id=WORKSPACE, tool_name="t"
        )
        assert verdict.allowed is True

    async def test_an_unreadable_ledger_does_not_refuse(self):
        gov = McpGovernance(self._db())
        gov._count_recent = AsyncMock(side_effect=RuntimeError("ledger gone"))
        verdict = await gov.review(
            operation=self.OP, arguments={}, developer_id=DEV, workspace_id=WORKSPACE, tool_name="t"
        )
        assert verdict.allowed is True


# ---------------------------------------------------------------------------
# Default pack
# ---------------------------------------------------------------------------


class TestDefaultPack:
    def test_every_default_is_a_require_approval_marked_as_default(self):
        rows = build_default_policies(WORKSPACE)
        assert len(rows) == len(DEFAULT_POLICY_PACK) == 3
        for row in rows:
            assert row.policy_type == PolicyType.TOOL_REQUIRE_APPROVAL.value
            assert row.agent_id is None
            assert row.config[DEFAULT_KEY]

    def test_deletes_are_held(self):
        engine = AgentPolicyEngine(db=None)
        result = engine.decide(
            "delete_ticket", {}, policies=build_default_policies(WORKSPACE),
            context={"method": "DELETE", "capability": "mcp.tickets"},
        )
        assert result.decision == PolicyDecisionType.REQUIRE_APPROVAL.value

    @pytest.mark.parametrize(
        "action",
        ["send_campaign", "publish_document", "invite_member", "remove_member",
         "email_stakeholder", "send_sms",
         "update_role", "connect_jira", "disconnect_linear", "refund_charge",
         "bulk_delete_records", "resend_invite"],
    )
    def test_outward_facing_actions_are_held(self, action):
        engine = AgentPolicyEngine(db=None)
        result = engine.decide(
            action, {}, policies=build_default_policies(WORKSPACE),
            context={"method": "POST", "capability": "mcp.crm"},
        )
        assert result is not None, action

    def test_admin_and_integration_writes_are_held(self):
        engine = AgentPolicyEngine(db=None)
        for cap in ("mcp.admin", "mcp.integrations"):
            result = engine.decide(
                "update_plan", {}, policies=build_default_policies(WORKSPACE),
                context={"method": "PATCH", "capability": cap},
            )
            assert result is not None, cap

    @pytest.mark.parametrize(
        "action",
        ["update_ticket", "create_sprint_task", "assign_ticket", "add_comment",
         "set_pending_with", "update_sprint"],
    )
    def test_ordinary_writes_are_not_held(self, action):
        """The pack must hold the dangerous tail, not every write — a default
        that stops routine work gets switched off within a week."""
        engine = AgentPolicyEngine(db=None)
        result = engine.decide(
            action, {}, policies=build_default_policies(WORKSPACE),
            context={"method": "PATCH", "capability": "mcp.tickets"},
        )
        assert result is None, action

    async def test_governance_seeds_a_workspace_with_no_policies(self, db_session):
        """The gate itself seeds, so it does not depend on creation or the
        backfill having run."""
        from aexy.models.developer import Developer
        from aexy.models.workspace import Workspace

        dev = Developer(email="a@b.c", name="A")
        db_session.add(dev)
        await db_session.flush()
        ws = Workspace(name="W", slug="w", owner_id=dev.id)
        db_session.add(ws)
        await db_session.flush()

        gov = McpGovernance(db_session)
        verdict = await gov.review(
            operation={"action": "delete_ticket", "method": "delete", "path": "/x",
                       "mutating": True, "_capability": "mcp.tickets"},
            arguments={"path_params": {"ticket_id": "t1"}},
            developer_id=str(dev.id),
            workspace_id=str(ws.id),
            tool_name="aexy_tickets",
        )
        assert verdict.allowed is False
        assert verdict.pending_action_id is not None

        from sqlalchemy import select

        rows = (await db_session.execute(select(AgentPolicy))).scalars().all()
        assert len(rows) == 3
        # Idempotent.
        assert await ensure_default_policies(db_session, str(ws.id)) == []

    async def test_a_deactivated_default_is_respected(self, db_session):
        from aexy.models.developer import Developer
        from aexy.models.workspace import Workspace

        dev = Developer(email="a2@b.c", name="A")
        db_session.add(dev)
        await db_session.flush()
        ws = Workspace(name="W2", slug="w2", owner_id=dev.id)
        db_session.add(ws)
        await db_session.flush()

        rows = await ensure_default_policies(db_session, str(ws.id))
        for row in rows:
            row.is_active = False
        await db_session.flush()

        assert await ensure_default_policies(db_session, str(ws.id)) == []
        verdict = await McpGovernance(db_session).review(
            operation={"action": "delete_ticket", "method": "delete", "path": "/x",
                       "mutating": True, "_capability": "mcp.tickets"},
            arguments={},
            developer_id=str(dev.id),
            workspace_id=str(ws.id),
            tool_name="aexy_tickets",
        )
        assert verdict.allowed is True


# ---------------------------------------------------------------------------
# Ledger
# ---------------------------------------------------------------------------


class TestLedger:
    WRITE = {"action": "update_ticket", "method": "PATCH",
             "path": "/api/v1/workspaces/{workspace_id}/tickets/{ticket_id}", "mutating": True}
    READ = {**WRITE, "action": "get_ticket", "method": "GET", "mutating": False}

    def _executor(self, db, granted_ops):
        catalog = {"capabilities": [{"capability": "mcp.tickets", "operations": granted_ops}]}
        return McpToolExecutor(app=None, catalog=catalog, granted={"mcp.tickets"}, db=db)

    async def test_a_write_is_recorded_with_its_outcome(self, monkeypatch):
        db = FakeDb(policies=[])
        executor = self._executor(db, [self.WRITE])

        async def _send(operation, path, arguments, headers):
            return httpx.Response(200, json={"ok": True}, request=httpx.Request("PATCH", path))

        monkeypatch.setattr(executor, "_send", _send)
        # Governance would try to seed defaults through FakeDb and fail
        # harmlessly; keep the test about the ledger.
        executor._review_policy = False

        result = await executor.call(
            tool_name="aexy_tickets",
            arguments={"action": "update_ticket", "path_params": {"ticket_id": "t1"},
                       "body": {"status": "closed", "api_key": "hunter2"}},
            developer_id=DEV, workspace_id=WORKSPACE,
        )
        assert result.is_error is False
        [row] = db.of_type(AgentActionLog)
        assert row.action == "update_ticket"
        assert row.method == "PATCH"
        assert row.status_code == 200
        assert row.is_error is False
        assert row.resolved_path.endswith("/tickets/t1")
        assert row.arguments["body"]["status"] == "closed"
        assert row.arguments["body"]["api_key"] == "***"
        assert row.actor_developer_id == DEV

    async def test_a_failed_write_is_still_recorded(self, monkeypatch):
        db = FakeDb(policies=[])
        executor = self._executor(db, [self.WRITE])
        executor._review_policy = False

        async def _send(operation, path, arguments, headers):
            return httpx.Response(422, json={"detail": "bad"}, request=httpx.Request("PATCH", path))

        monkeypatch.setattr(executor, "_send", _send)
        result = await executor.call(
            tool_name="aexy_tickets",
            arguments={"action": "update_ticket", "path_params": {"ticket_id": "t1"}},
            developer_id=DEV, workspace_id=WORKSPACE,
        )
        assert result.is_error is True
        [row] = db.of_type(AgentActionLog)
        assert row.status_code == 422
        assert row.is_error is True

    async def test_a_read_is_never_recorded(self, monkeypatch):
        db = FakeDb(policies=[])
        executor = self._executor(db, [self.READ])

        async def _send(operation, path, arguments, headers):
            return httpx.Response(200, json=[], request=httpx.Request("GET", path))

        monkeypatch.setattr(executor, "_send", _send)
        await executor.call(
            tool_name="aexy_tickets",
            arguments={"action": "get_ticket", "path_params": {"ticket_id": "t1"}},
            developer_id=DEV, workspace_id=WORKSPACE,
        )
        assert db.of_type(AgentActionLog) == []

    async def test_a_replay_links_to_its_queue_entry(self, monkeypatch):
        db = FakeDb(policies=[])
        executor = McpToolExecutor(
            app=None,
            catalog={"capabilities": [{"capability": "mcp.tickets", "operations": [self.WRITE]}]},
            granted={"mcp.tickets"}, db=db, review_policy=False,
        )

        async def _send(operation, path, arguments, headers):
            return httpx.Response(200, json={}, request=httpx.Request("PATCH", path))

        monkeypatch.setattr(executor, "_send", _send)
        await executor.call(
            tool_name="aexy_tickets",
            arguments={"action": "update_ticket", "path_params": {"ticket_id": "t1"}},
            developer_id=DEV, workspace_id=WORKSPACE, pending_action_id="pending-9",
        )
        [row] = db.of_type(AgentActionLog)
        assert row.pending_action_id == "pending-9"
        # And no policy row or queue entry was produced by the replay.
        assert db.of_type(ProposedChange) == []

    def test_redaction_masks_secret_keys_at_any_depth(self):
        out = redact({"body": {"token": "a", "nested": [{"password": "b", "name": "c"}]}})
        assert out == {"body": {"token": "***", "nested": [{"password": "***", "name": "c"}]}}
