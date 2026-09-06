"""Regressions for the defects found reviewing the agent-operations work.

Each test names the failure it guards against, so a future change that
reintroduces one fails with a sentence rather than a stack trace.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from aexy.agents.tools.mcp_tools import McpToolContext, McpRoutineTool, build_tools, tool_definitions
from aexy.models.agent import CRMAgent
from aexy.models.agent_action_log import AgentActionLog
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.agent_principal_service import AgentPrincipalService, PrincipalError
from aexy.services.agent_schedule_service import AgentScheduleService
from aexy.services.mcp_governance import McpGovernance
from aexy.services.mcp_tool_executor import McpToolExecutor, redact

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures" / "mcp-catalog.generated.json"
CATALOG = json.loads(FIXTURE.read_text())


def _executor(granted: set[str]) -> McpToolExecutor:
    return McpToolExecutor(app=MagicMock(), catalog=CATALOG, granted=granted, db=None)


def _context(granted: set[str], **kw) -> McpToolContext:
    return McpToolContext(
        db=None, workspace_id="ws", developer_id="dev", granted=granted, **kw
    )


class TestReplayOfHeldRoutines:
    """Approving a held `aexy_sd_park_ticket` used to run it with no arguments:
    the queue stores the spread shape, and the replay spread it again."""

    async def test_a_replay_is_not_spread_twice(self, monkeypatch):
        seen = {}

        async def fake_perform(**kwargs):
            seen.update(kwargs)
            return MagicMock(content="ok", is_error=False)

        executor = _executor({"mcp.service_desk"})
        monkeypatch.setattr(executor, "_perform", fake_perform)
        stored = {"path_params": {"ticket_id": "t1"}, "body": {"pending_with": "finance"}}
        await executor.call(
            tool_name="aexy_sd_park_ticket",
            arguments={**stored, "action": "change_pending_with"},
            developer_id="d",
            workspace_id="w",
            pending_action_id="pending-1",
        )
        assert seen["arguments"]["path_params"] == {"ticket_id": "t1"}
        assert seen["arguments"]["body"] == {"pending_with": "finance"}

    async def test_a_first_call_still_spreads_flat_arguments(self, monkeypatch):
        seen = {}

        async def fake_perform(**kwargs):
            seen.update(kwargs)
            return MagicMock(content="ok", is_error=False)

        executor = _executor({"mcp.service_desk"})
        monkeypatch.setattr(executor, "_perform", fake_perform)
        await executor.call(
            tool_name="aexy_sd_park_ticket",
            arguments={"ticket_id": "t1", "pending_with": "finance"},
            developer_id="d",
            workspace_id="w",
        )
        assert seen["arguments"]["path_params"] == {"ticket_id": "t1"}
        assert seen["arguments"]["body"] == {"pending_with": "finance"}


class TestCapabilityNames:
    def test_discover_accepts_the_short_capability_name(self):
        executor = _executor({"mcp.service_desk"})
        short = json.loads(executor._discover("ticket", "service_desk").content)
        long = json.loads(executor._discover("ticket", "mcp.service_desk").content)
        assert short["total_matches"] == long["total_matches"] > 0

    async def test_generic_call_scopes_by_short_name(self, monkeypatch):
        seen = {}

        async def fake_perform(**kwargs):
            seen.update(kwargs)
            return MagicMock(content="ok", is_error=False)

        executor = _executor({"mcp.crm", "mcp.tables"})
        monkeypatch.setattr(executor, "_perform", fake_perform)
        await executor.call(
            tool_name="aexy_call",
            arguments={"action": "list_records", "capability": "tables"},
            developer_id="d",
            workspace_id="w",
        )
        assert seen["operation"]["_capability"] == "mcp.tables"


class TestRedaction:
    def test_only_whole_secret_keys_are_masked(self):
        out = redact(
            {"page_token": "keep", "token": "hide", "api_key": "hide", "token_prefix": "keep",
             "nested": {"client_secret": "hide", "tokens": 3}}
        )
        assert out["page_token"] == "keep"
        assert out["token_prefix"] == "keep"
        assert out["nested"]["tokens"] == 3
        assert out["token"] == out["api_key"] == out["nested"]["client_secret"] == "***"


class TestReadOnlyAssistant:
    """Routine tools bind their action, so the `action`-keyed gate missed them:
    a read-only Ask could park a ticket."""

    def test_writing_routines_are_not_offered_read_only(self):
        names = {t["name"] for t in tool_definitions(_context({"mcp.service_desk"}), reads_only=True)}
        assert "aexy_sd_open_tickets" in names
        assert "aexy_sd_tat_report" in names
        assert "aexy_sd_park_ticket" not in names
        assert "aexy_sd_triage_ticket" not in names
        assert "aexy_sd_email_stakeholder" not in names

    async def test_a_writing_routine_is_refused_read_only(self):
        context = _context({"mcp.service_desk"}, allow_writes=False)
        result = await context.call("aexy_sd_park_ticket", {"ticket_id": "t", "pending_with": "x"})
        assert result.is_error
        assert "read-only" in result.content

    async def test_mutating_check_is_scoped_to_the_capability(self):
        # `list_records` is a read in both CRM and Tables; scoping must not
        # break the ordinary case.
        context = _context({"mcp.tables"}, allow_writes=False)
        context.executor = lambda: MagicMock(call=AsyncMock(return_value=MagicMock(is_error=False, content="[]")))
        result = await context.call("aexy_tables", {"action": "list_records"})
        assert not result.is_error


class TestRoutineToolsForAgents:
    """The shipped prompts name `aexy_sd_open_tickets`; an in-platform agent
    given that name used to get a warning and no tool."""

    def test_a_routine_name_resolves_to_a_tool(self):
        tools = build_tools(_context({"mcp.service_desk"}), ["aexy_sd_open_tickets"])
        assert len(tools) == 1 and isinstance(tools[0], McpRoutineTool)
        fields = tools[0].args_schema.model_fields
        assert "pending_with" in fields and "workspace_id" not in fields

    def test_an_ungranted_routine_is_skipped(self):
        assert build_tools(_context({"mcp.crm"}), ["aexy_sd_open_tickets"]) == []


@pytest.fixture
async def workspace(db_session):
    owner = Developer(email="o@example.com", name="Owner")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(name="W", slug="w", owner_id=owner.id)
    db_session.add(ws)
    await db_session.flush()
    db_session.add(WorkspaceMember(workspace_id=ws.id, developer_id=owner.id, role="owner"))
    await db_session.flush()
    return owner, ws


class TestRateLimitCounting:
    """`methods: [DELETE]` with `max_per_hour: 10` counted per distinct action,
    so it was ten of *each* delete an hour."""

    async def test_selector_limits_count_every_selected_row(self, db_session, workspace):
        owner, ws = workspace
        now = datetime.now(timezone.utc)
        for action, method, cap in (
            ("delete_record", "DELETE", "mcp.crm"),
            ("delete_task", "DELETE", "mcp.sprints"),
            ("update_task", "PATCH", "mcp.sprints"),
        ):
            db_session.add(AgentActionLog(
                workspace_id=ws.id, actor_developer_id=owner.id, tool_name="x",
                action=action, method=method, capability=cap, path="/p", arguments={},
                created_at=now,
            ))
        await db_session.flush()
        gov = McpGovernance(db_session)
        since = now - timedelta(hours=1)
        count = lambda cfg, action="delete_record": gov._count_recent(  # noqa: E731
            workspace_id=str(ws.id), developer_id=str(owner.id), action=action, since=since, config=cfg
        )
        assert await count({"tool": "delete_record"}) == 1
        assert await count({"methods": ["DELETE"]}) == 2
        assert await count({"capabilities": ["mcp.sprints"]}) == 2
        assert await count({"action_patterns": ["^delete_"]}) == 2


class TestPrincipalScope:
    async def test_capabilities_outside_the_workspace_are_refused(self, db_session, workspace):
        owner, ws = workspace
        with pytest.raises(PrincipalError, match="does not hold"):
            await AgentPrincipalService(db_session).create(
                workspace_id=str(ws.id), name="Bot", description=None,
                capabilities=["mcp.crm"], created_by_id=str(owner.id),
                grantable={"mcp.service_desk"},
            )

    async def test_a_removed_principal_stays_removed(self, db_session, workspace):
        owner, ws = workspace
        service = AgentPrincipalService(db_session)
        principal = await service.create(
            workspace_id=str(ws.id), name="Bot", description=None,
            capabilities=["mcp.crm"], created_by_id=str(owner.id),
        )
        await service.remove(principal)
        with pytest.raises(PrincipalError, match="removed"):
            await service.update(principal, is_active=True)


class TestScheduleFailures:
    async def _schedule(self, db_session, owner, ws, *, active=True):
        principal = await AgentPrincipalService(db_session).create(
            workspace_id=str(ws.id), name="Bot", description=None,
            capabilities=["mcp.service_desk"], created_by_id=str(owner.id),
        )
        agent = CRMAgent(workspace_id=ws.id, name="A", agent_type="custom", tools=[],
                         principal_id=principal.id, is_active=active)
        db_session.add(agent)
        await db_session.flush()
        row = await AgentScheduleService(db_session).create(
            workspace_id=str(ws.id), agent_id=str(agent.id), name="s", routine="r",
            interval_minutes=60, tz="UTC", enabled=True, created_by_id=str(owner.id),
        )
        row.next_run_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        await db_session.flush()
        return agent, row

    async def test_dispatch_failure_gives_the_slot_back(self, db_session, workspace):
        owner, ws = workspace
        _agent, row = await self._schedule(db_session, owner, ws)
        slot = row.next_run_at
        with patch("aexy.temporal.dispatch.dispatch", new=AsyncMock(side_effect=RuntimeError("temporal down"))):
            assert await AgentScheduleService(db_session).run_due() == 0
        assert row.next_run_at == slot
        assert row.run_count == 0
        assert row.enabled is True

    async def test_an_inactive_agent_disables_its_schedule(self, db_session, workspace):
        owner, ws = workspace
        agent, row = await self._schedule(db_session, owner, ws)
        agent.is_active = False
        await db_session.flush()
        with patch("aexy.temporal.dispatch.dispatch", new=AsyncMock(return_value="x")) as d:
            assert await AgentScheduleService(db_session).run_due() == 0
            d.assert_not_called()
        assert row.enabled is False


class TestServiceDeskEventDepth:
    async def test_events_do_not_cascade_without_end(self, monkeypatch):
        from aexy.services import service_desk_ticket_service as svc

        depth_seen = []

        async def fake_dispatch(**kwargs):
            depth_seen.append(svc._event_depth.get())
            # An automation whose action edits the ticket again.
            await svc.dispatch_service_desk_event(None, "ws", "service_desk.ticket_updated", ticket, sd)

        ticket = MagicMock(id="t1")
        sd = MagicMock()
        monkeypatch.setattr(svc, "service_desk_event_payload", lambda *a, **k: {})
        import aexy.services.automation_service as automation

        monkeypatch.setattr(automation, "dispatch_automation_event", fake_dispatch)
        await svc.dispatch_service_desk_event(None, "ws", "service_desk.ticket_updated", ticket, sd)
        assert depth_seen == [1, 2]
        assert svc._event_depth.get() == 0
