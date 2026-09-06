"""One tool substrate: in-platform agents and Ask reach the catalogue through
the governed executor, scoped to what the actor may reach."""

from __future__ import annotations

import pytest

from aexy.agents.builder import AgentBuilder
from aexy.agents.tools.mcp_tools import (
    McpActionTool,
    McpCallTool,
    McpDiscoverTool,
    McpToolContext,
    attach_to_agent,
    build_tools,
    resolve_context,
    tool_definitions,
)
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.schemas.automation import get_action_ids, get_enabled_modules, get_trigger_ids
from aexy.services.ask_tools import build_tool_definitions
from aexy.services.automation_module_actions import MODULE_ACTION_ADAPTERS
from aexy.services.automation_trigger_schema import trigger_fields_for

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def owner_and_workspace(db_session):
    owner = Developer(email="owner@example.com", name="Owner")
    db_session.add(owner)
    await db_session.flush()
    ws = Workspace(name="S", slug="s", owner_id=owner.id)
    db_session.add(ws)
    await db_session.flush()
    db_session.add(WorkspaceMember(workspace_id=ws.id, developer_id=owner.id, role="owner"))
    await db_session.commit()
    return owner, ws


class TestBuildTools:
    def _context(self, granted):
        return McpToolContext(
            db=None, workspace_id="w", developer_id="d", granted=set(granted)
        )

    def test_generic_and_action_tools_are_built(self):
        tools = build_tools(self._context({"mcp.tickets"}), ["aexy_discover", "aexy_call", "update_ticket"])
        kinds = {type(t) for t in tools}
        assert kinds == {McpDiscoverTool, McpCallTool, McpActionTool}
        action = next(t for t in tools if isinstance(t, McpActionTool))
        assert action.name == "update_ticket"
        assert action.capability_tool == "aexy_tickets"
        assert "PATCH" in action.description

    def test_an_ungranted_action_is_not_offered(self):
        tools = build_tools(self._context({"mcp.crm"}), ["update_ticket"])
        assert tools == []

    def test_an_unknown_name_is_skipped_not_fatal(self):
        tools = build_tools(self._context({"mcp.tickets"}), ["not_a_thing", "update_ticket"])
        assert [t.name for t in tools] == ["update_ticket"]


class TestReadOnlyContext:
    async def test_a_write_is_refused_before_the_executor(self):
        context = McpToolContext(
            db=None, workspace_id="w", developer_id="d", granted={"mcp.tickets"}, allow_writes=False
        )
        result = await context.call("aexy_tickets", {"action": "update_ticket"})
        assert result.is_error is True
        assert "read-only" in result.content

    def test_definitions_offer_only_reads(self):
        context = McpToolContext(
            db=None, workspace_id="w", developer_id="d", granted={"mcp.tickets"}, allow_writes=False
        )
        defs = tool_definitions(context, reads_only=True)
        names = {d["name"] for d in defs}
        assert {"aexy_discover", "aexy_call", "aexy_tickets"} <= names
        tickets = next(d for d in defs if d["name"] == "aexy_tickets")
        assert "update_ticket" not in tickets["input_schema"]["properties"]["action"]["enum"]
        assert "get_ticket" in tickets["input_schema"]["properties"]["action"]["enum"]


class TestAttachToAgent:
    async def test_a_custom_agent_gets_catalogue_tools_for_unknown_names(
        self, db_session, owner_and_workspace
    ):
        owner, ws = owner_and_workspace
        agent = AgentBuilder(workspace_id=str(ws.id), user_id=str(owner.id), db=db_session).build_from_config(
            name="Triage",
            agent_type="custom",
            tools=["aexy_crm_records", "update_ticket", "aexy_discover"],
        )
        # There is no other registry: every configured name is a catalogue name.
        assert agent.unresolved_tool_names == ["aexy_crm_records", "update_ticket", "aexy_discover"]

        attached = await attach_to_agent(
            agent, db_session, workspace_id=str(ws.id), developer_id=str(owner.id)
        )
        assert sorted(attached) == ["aexy_crm_records", "aexy_discover", "update_ticket"]
        names = [t.name for t in agent.tools]
        assert "aexy_crm_records" in names
        assert "update_ticket" in names
        assert "aexy_discover" in names

    async def test_no_actor_means_no_catalogue_tools(self, db_session, owner_and_workspace):
        _owner, ws = owner_and_workspace
        agent = AgentBuilder(workspace_id=str(ws.id), user_id=None, db=db_session).build_from_config(
            name="Nobody", agent_type="custom", tools=["update_ticket"]
        )
        attached = await attach_to_agent(agent, db_session, workspace_id=str(ws.id), developer_id=None)
        assert attached == []
        assert agent.extra_tools == []

    async def test_a_principal_scopes_the_tools(self, db_session, owner_and_workspace):
        from aexy.services.agent_principal_service import AgentPrincipalService

        owner, ws = owner_and_workspace
        principal = await AgentPrincipalService(db_session).create(
            workspace_id=str(ws.id), name="Bot", description=None,
            capabilities=["mcp.crm"], created_by_id=str(owner.id),
        )
        await db_session.commit()
        context = await resolve_context(
            db_session, workspace_id=str(ws.id), developer_id=principal.developer_id,
            principal_id=principal.id,
        )
        assert context.granted == {"mcp.crm"}


class TestAskSurface:
    async def test_ask_offers_the_clock_plus_the_read_surface(self, db_session, owner_and_workspace):
        owner, ws = owner_and_workspace
        defs = await build_tool_definitions(db_session, str(ws.id), str(owner.id))
        names = [d["name"] for d in defs]
        # The four hand-written reads are gone; the catalogue answers those questions.
        assert names[0] == "current_time"
        assert "list_sprints" not in names
        assert "aexy_discover" in names and "aexy_call" in names
        assert "aexy_service_desk" in names
        assert len(names) == len(set(names))


class TestServiceDeskAutomation:
    def test_service_desk_is_an_automation_module(self):
        assert "service_desk" in get_enabled_modules()
        assert set(get_trigger_ids("service_desk")) == {
            "service_desk.ticket_created",
            "service_desk.ticket_updated",
            "service_desk.pending_with_changed",
        }
        assert {"set_pending_with", "set_request_type", "assign_owner"} <= set(get_action_ids("service_desk"))

    def test_actions_have_adapters_on_both_executor_paths(self):
        for action in ("set_pending_with", "set_request_type", "assign_owner"):
            assert action in MODULE_ACTION_ADAPTERS

    def test_trigger_fields_are_declared(self):
        fields = {f[0] for f in trigger_fields_for("service_desk", "service_desk.pending_with_changed")}
        assert {"trigger.ticket_id", "trigger.pending_with", "trigger.previous_pending_with"} <= fields
