"""One tool registry: the MCP catalogue.

The hand-written LangGraph registry and Ask's built-in reads are gone. These
tests pin that down, and check the prebuilt agents and the tool-name migration
point at operations that exist.
"""

from __future__ import annotations

import re
from pathlib import Path

from aexy.agents import builder
from aexy.agents.prebuilt import (
    DataEnrichmentAgent,
    EmailDrafterAgent,
    LeadScoringAgent,
    SalesOutreachAgent,
)
from aexy.agents.tools.mcp_tools import capability_group, find_operation
from aexy.services import ask_tools
from aexy.services.mcp_catalog import WORKFLOW_TOOLS

ROUTINES = {t["name"] for t in WORKFLOW_TOOLS}
MIGRATION = Path(__file__).resolve().parents[2] / "scripts" / "migrate_agent_tools_to_catalogue.sql"


def _is_catalogue_name(name: str) -> bool:
    return (
        name in ROUTINES
        or name in ("aexy_discover", "aexy_call")
        or capability_group(name) is not None
        or find_operation(name) is not None
    )


class TestNoOtherRegistry:
    def test_the_builder_has_no_registry(self):
        assert not hasattr(builder, "TOOL_REGISTRY")
        assert not hasattr(builder, "LEGACY_SUPERSEDED_BY")

    def test_the_picker_lists_only_catalogue_entries(self):
        listing = builder.AgentBuilder.get_available_tools()
        names = {t["name"] for t in listing}
        assert "search_contacts" not in names and "send_slack" not in names
        assert {"aexy_discover", "aexy_call", "aexy_crm", "aexy_sd_open_tickets"} <= names
        assert {t["category"] for t in listing} == {"catalogue", "routines"}
        assert all("superseded_by" not in t for t in listing)

    def test_ask_keeps_only_the_clock(self):
        assert [t["name"] for t in ask_tools.TOOL_DEFINITIONS] == ["current_time"]
        assert set(ask_tools.TOOL_HANDLERS) == {"current_time"}

    def test_a_custom_agent_treats_every_name_as_a_catalogue_name(self):
        agent = builder.CustomAgent(
            agent_name="x", agent_goal="g", agent_prompt="p",
            tool_names=["aexy_crm_records", "send_email"], workspace_id="w",
        )
        assert agent.unresolved_tool_names == ["aexy_crm_records", "send_email"]
        assert agent.tools == []  # nothing until attach_to_agent runs


class TestPrebuiltAgentsUseTheCatalogue:
    def test_every_prebuilt_tool_name_exists(self):
        for cls in (SalesOutreachAgent, LeadScoringAgent, EmailDrafterAgent, DataEnrichmentAgent):
            assert cls.catalog_tool_names, cls.__name__
            for name in cls.catalog_tool_names:
                assert _is_catalogue_name(name), f"{cls.__name__}: {name}"

    def test_outreach_joined_the_crm_capability(self):
        for action in ("send_email", "get_email_history", "send_slack_message", "send_sms"):
            found = find_operation(action, "mcp.crm")
            assert found is not None, action
        assert find_operation("send_email", "mcp.crm")[0]["mutating"]
        assert not find_operation("get_email_history", "mcp.crm")[0]["mutating"]


class TestToolNameMigration:
    def test_every_target_in_the_migration_exists(self):
        sql = MIGRATION.read_text()
        pairs = re.findall(r"\('(\w+)',\s*('(\w+)'|NULL)\)", sql)
        assert len(pairs) >= 11
        for old, _, new in pairs:
            if new:
                assert _is_catalogue_name(new), f"{old} -> {new}"
