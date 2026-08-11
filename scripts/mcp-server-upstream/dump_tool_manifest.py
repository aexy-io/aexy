"""Emit tools.json — the generated catalog of every tool this server exposes.

Consumers (the Aexy web app's /mcp page, docs/mcp.md) read this manifest instead
of hand-copying tool names, which is how the two drifted apart before.

    uv run python scripts/dump_tool_manifest.py > tools.json

Categories are derived from the module a tool is registered in, so adding a tool
to an existing module needs no change here. Adding a new *module* means adding
one row to MODULE_CATEGORIES below; the manifest test fails loudly until you do.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from mcp.server.fastmcp import FastMCP  # noqa: E402

from aexy_mcp.tools import (  # noqa: E402
    register_agent_tools,
    register_analytics_tools,
    register_api_gateway_tools,
    register_crm_tools,
    register_email_tools,
    register_platform_tools,
    register_sprint_tools,
    register_temporal_tools,
)

# module key -> (category key, human name, capability)
#
# `capability` is the grant an Aexy workspace must hold for the tool to be
# offered. It is resolved server-side; the string here is only a declaration.
MODULE_CATEGORIES: dict[str, tuple[str, str, str]] = {
    "sprints": ("sprintManagement", "Sprint Management", "mcp.sprints"),
    "crm": ("crm", "CRM", "mcp.crm"),
    "agents": ("aiAgents", "AI Agents", "mcp.agents"),
    "email": ("emailGtm", "Email & GTM", "mcp.email_gtm"),
    "analytics": ("analyticsInsights", "Analytics & Insights", "mcp.analytics"),
    "platform": ("platform", "Platform", "mcp.platform"),
    "api_gateway": ("platform", "Platform", "mcp.platform"),
    "temporal": ("temporal", "Temporal Workflows", "mcp.temporal"),
}

# Tools that change state. Drives the "read-only token" capability picker in the
# Aexy UI, and flags destructive tools in the docs.
MUTATING = {
    "aexy_sprints", "aexy_sprint_tasks", "aexy_projects", "aexy_epics", "aexy_bugs",
    "aexy_crm_objects", "aexy_crm_records", "aexy_crm_automations",
    "aexy_agents", "aexy_agent_policies", "aexy_workflows",
    "aexy_email_campaigns", "aexy_email_infrastructure",
    "aexy_gtm_leads", "aexy_gtm_sequences",
    "aexy_workspaces", "aexy_notifications", "aexy_documents",
    "aexy_tickets", "aexy_tables", "aexy_integrations", "aexy_api",
    "temporal_signal_workflow", "temporal_cancel_workflow",
}

REGISTRARS = [
    ("api_gateway", register_api_gateway_tools, True),
    ("sprints", register_sprint_tools, True),
    ("crm", register_crm_tools, True),
    ("agents", register_agent_tools, True),
    ("platform", register_platform_tools, True),
    ("email", register_email_tools, True),
    ("analytics", register_analytics_tools, True),
    ("temporal", register_temporal_tools, False),
]


class _NullClient:
    """Stand-in for AexyAPIClient — registration never calls it."""

    def __getattr__(self, _name):
        async def _noop(*_args, **_kwargs):
            raise RuntimeError("manifest dump must not perform I/O")

        return _noop


def _version() -> str:
    pyproject = (Path(__file__).resolve().parent.parent / "pyproject.toml").read_text()
    for line in pyproject.splitlines():
        if line.startswith("version"):
            return line.split("=", 1)[1].strip().strip('"')
    return "0.0.0"


def build_manifest() -> dict:
    """Register every tool group against a throwaway app and read the registry back."""
    origin: dict[str, str] = {}

    for module_key, registrar, takes_client in REGISTRARS:
        probe = FastMCP("probe")
        if takes_client:
            registrar(probe, _NullClient())
        else:
            registrar(probe)
        for tool in asyncio.run(probe.list_tools()):
            origin[tool.name] = module_key

    app = FastMCP("aexy")
    for module_key, registrar, takes_client in REGISTRARS:
        if takes_client:
            registrar(app, _NullClient())
        else:
            registrar(app)

    categories: dict[str, dict] = {}
    for tool in asyncio.run(app.list_tools()):
        module_key = origin[tool.name]
        if module_key not in MODULE_CATEGORIES:
            raise SystemExit(
                f"tool {tool.name} lives in unmapped module {module_key!r} — "
                "add it to MODULE_CATEGORIES"
            )
        cat_key, cat_name, capability = MODULE_CATEGORIES[module_key]
        cat = categories.setdefault(
            cat_key, {"key": cat_key, "name": cat_name, "capability": capability, "tools": []}
        )
        cat["tools"].append(
            {
                "name": tool.name,
                "description": inspect.cleandoc(tool.description or "").replace("\n", " ").strip(),
                "capability": capability,
                "mutating": tool.name in MUTATING,
                "input_schema": tool.inputSchema,
            }
        )

    for cat in categories.values():
        cat["tools"].sort(key=lambda t: t["name"])

    ordered = [
        categories[k]
        for k in ["sprintManagement", "crm", "aiAgents", "emailGtm",
                  "analyticsInsights", "platform", "temporal"]
        if k in categories
    ]
    return {
        "manifest_version": 1,
        "server_version": _version(),
        "server_name": "aexy",
        "categories": ordered,
    }


if __name__ == "__main__":
    print(json.dumps(build_manifest(), indent=2, sort_keys=False))
