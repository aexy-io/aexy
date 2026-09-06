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


class TestAmbiguousActionNames:
    """An action name is unique within a capability, not across the catalogue.

    Two resolvers used to disagree about which operation an unscoped name meant:
    `mcp_tools.find_operation` walked the catalogue in order, while
    `McpToolExecutor._find_operation` put granted capabilities first. Both
    directions of that disagreement were bugs — one cleared a read and ran a
    write, the other dropped a tool the actor could reach.
    """

    @staticmethod
    def _carried_twice(mutating_split: bool) -> tuple[str, list[tuple[str, bool]]]:
        """A real action name carried by two capabilities, or skip the test."""
        from aexy.agents.tools.mcp_tools import catalog

        seen: dict[str, list[tuple[str, bool]]] = {}
        for group in catalog()["capabilities"]:
            for op in group["operations"]:
                seen.setdefault(op["action"], []).append(
                    (group["capability"], op["mutating"])
                )
        for action, carried in seen.items():
            if len({c for c, _ in carried}) < 2:
                continue
            mixed = len({m for _, m in carried}) > 1
            if mixed is mutating_split:
                return action, carried
        pytest.skip("the catalogue no longer carries such an action name")

    def test_resolution_follows_the_grant_not_catalogue_order(self):
        """`get_bus_factor` is a GET in one capability and a POST in another.

        Holding only the writing one, this used to resolve to the other
        capability's GET — so the read-only gate saw `mutating: false` and
        cleared a call the executor then ran as a write.
        """
        from aexy.agents.tools.mcp_tools import find_operation

        action, carried = self._carried_twice(mutating_split=True)
        for capability, mutating in carried:
            op, resolved = find_operation(action, granted={capability})
            assert resolved == capability
            assert op["mutating"] is mutating

    async def test_a_write_reached_by_an_ambiguous_name_is_refused(self):
        from aexy.agents.tools.mcp_tools import CALL_TOOL

        action, carried = self._carried_twice(mutating_split=True)
        writing = next(cap for cap, mutating in carried if mutating)

        context = McpToolContext(
            db=None,
            workspace_id="w",
            developer_id="d",
            granted={writing},
            allow_writes=False,
        )
        result = await context.call(CALL_TOOL, {"action": action})
        assert result.is_error is True
        assert "read-only" in result.content

    def test_a_tool_binds_to_a_capability_the_actor_holds(self):
        """`get_document` is in both compliance and docs.

        Resolving in catalogue order found compliance, saw it ungranted, and
        dropped the tool — so an agent scoped to docs alone silently lost the
        document read its own tool list named.
        """
        action, carried = self._carried_twice(mutating_split=False)
        for capability, _ in carried:
            tools = build_tools(
                McpToolContext(
                    db=None, workspace_id="w", developer_id="d", granted={capability}
                ),
                [action],
            )
            assert [t.name for t in tools] == [action], (
                f"{action!r} was dropped for an actor holding {capability}"
            )
            assert tools[0].capability_tool == f"aexy_{capability.removeprefix('mcp.')}"


class TestMigratedToolNamesResolve:
    """Every name `migrate_agent_tools_to_catalogue.sql` can leave in a stored
    tool list has to be one `build_tools` can bind.

    A mapping target the catalogue does not carry drops the tool silently, and
    so does a legacy name the mapping forgets — which is what happened to
    `search_documents`, the one name the migration's own header claimed passed
    through unchanged.
    """

    # The registry this migration exists to replace (`builder.py`'s
    # TOOL_REGISTRY, deleted in 0.37.0). Every one of these can be sitting in
    # `crm_agents.tools` in a database that predates the change.
    LEGACY_TOOL_NAMES = frozenset(
        {
            "search_contacts",
            "get_record",
            "update_record",
            "create_record",
            "get_activities",
            "send_email",
            "create_draft",
            "get_email_history",
            "get_writing_style",
            "enrich_company",
            "enrich_person",
            "web_search",
            "send_slack",
            "send_sms",
            "read_document",
            "search_documents",
            "create_document",
            "propose_docx_edit",
        }
    )

    @staticmethod
    def _mapping() -> dict[str, str | None]:
        import re
        from pathlib import Path

        sql = (
            Path(__file__).resolve().parents[2]
            / "scripts"
            / "migrate_agent_tools_to_catalogue.sql"
        )
        table = sql.read_text().split("WITH mapping", 1)[1].split("),\nrewritten", 1)[0]
        pairs = re.findall(r"\(\s*'([a-z_]+)'\s*,\s*(?:'([a-z_]+)'|NULL)\s*\)", table)
        assert pairs, "could not read the mapping table out of the migration"
        return {old: (new or None) for old, new in pairs}

    def test_every_legacy_name_survives_as_something_bindable(self):
        from aexy.agents.tools.mcp_tools import is_catalog_tool_name

        mapping = self._mapping()
        for legacy in sorted(self.LEGACY_TOOL_NAMES):
            if legacy in mapping:
                target = mapping[legacy]
                if target is None:
                    continue  # deliberately dropped (the enrichment placeholders)
                assert is_catalog_tool_name(target), (
                    f"{legacy!r} is rewritten to {target!r}, which is not a catalogue name"
                )
            else:
                assert is_catalog_tool_name(legacy), (
                    f"{legacy!r} passes through the migration untouched but is "
                    "not a catalogue name, so the tool is lost"
                )

    def test_the_placeholders_are_the_only_names_dropped(self):
        mapping = self._mapping()
        dropped = {old for old, new in mapping.items() if new is None}
        assert dropped == {"enrich_company", "enrich_person", "web_search"}


class TestPromptsNameOnlyReachableTools:
    """A prompt is filtered by its declared capabilities, so a routine it
    instructs the model to call must be inside them — `weekly_report` named
    `aexy_active_blockers` (mcp.tracking) while declaring only sprints and
    docs, and was offered to callers whose tools/list did not contain it."""

    def test_every_routine_a_prompt_names_is_within_its_capabilities(self):
        import re

        from aexy.services.mcp_catalog import WORKFLOW_TOOLS
        from aexy.services.mcp_prompts import PROMPTS

        routines = {tool["name"]: tool["capability"] for tool in WORKFLOW_TOOLS}
        for prompt in PROMPTS:
            declared = prompt["capabilities"]
            for name in set(re.findall(r"aexy_[a-z0-9_]+", prompt["text"])):
                if name in routines:
                    assert routines[name] in declared, (
                        f"prompt {prompt['name']!r} calls routine {name!r} "
                        f"({routines[name]}), which its capabilities do not include"
                    )
                elif name.startswith("aexy_"):
                    capability = f"mcp.{name.removeprefix('aexy_')}"
                    assert capability in declared, (
                        f"prompt {prompt['name']!r} calls {name!r} "
                        f"({capability}), which its capabilities do not include"
                    )
