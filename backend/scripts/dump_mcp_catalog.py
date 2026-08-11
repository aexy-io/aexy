"""Emit the MCP operation catalogue — every API operation, grouped by capability.

This is what makes two things possible at once:

  * **100% coverage.** Every one of the ~1900 operations is reachable through
    MCP, because the catalogue is derived from the app's own OpenAPI schema
    rather than from hand-written path strings. Four MCP tools were dead for
    exactly that reason — `aexy_developer_insights` called
    `/workspaces/{id}/developer-insights` when the router is mounted at
    `/insights`, `aexy_tables` called `/rows` when the routes are `/records`,
    `aexy_gtm_leads` called a module that does not exist, and `aexy_agents`
    called `/execute` when the route is `/run`. Nothing caught any of it. A
    generated catalogue cannot drift from the routes it is generated from.

  * **Access-shaped tool lists.** Every operation carries the capability that
    governs it, so the MCP server can offer a caller only the tools they can
    actually use. That is not just a security property: it is what keeps the
    tool surface small enough for a model to choose well. A developer with ten
    apps sees ten tools covering everything they can reach, not 1900 operations
    they mostly cannot.

Usage:

    python scripts/dump_mcp_catalog.py                 # write the fixture
    python scripts/dump_mcp_catalog.py --out -         # stdout
    python scripts/dump_mcp_catalog.py --check         # CI: fail if stale
    python scripts/dump_mcp_catalog.py --report        # coverage summary

`--check` also fails when a tag has no capability mapping, so a new router
cannot land outside the access model without someone deciding where it belongs.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

DEFAULT_OUT = (
    Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "mcp-catalog.generated.json"
)

# ---------------------------------------------------------------------------
# Capabilities
# ---------------------------------------------------------------------------
#
# Most capabilities are an app in APP_CATALOG, so an MCP grant is the same
# decision as the app grant a workspace already makes — no parallel access model.
#
# A handful of surfaces are not apps and never were: workspace and member
# administration, billing, provider integrations, and the unauthenticated public
# routers. Those get their own capabilities rather than being forced into an
# app that does not describe them. They are prefixed the same way so the
# resolver treats them uniformly.

PLATFORM_CAPABILITIES = {
    # Workspace, team, member, role and token administration.
    "platform",
    # Billing, plans, rate limits, platform-admin surfaces. Privileged.
    "admin",
    # Third-party providers: Slack, Google, generic integration webhooks.
    "integrations",
}

# Surfaces deliberately excluded from the MCP catalogue entirely.
#
# `public` routers are unauthenticated by design and answer to anonymous
# visitors, so routing them through a caller's token misrepresents who is
# asking. `system` is liveness and machine ingest — no agent use.
EXCLUDED_CAPABILITIES = {"public", "system"}

# ---------------------------------------------------------------------------
# tag -> capability
# ---------------------------------------------------------------------------
#
# Tags are normalised (lowercased, non-alphanumerics collapsed to "_") before
# lookup, which folds the duplicate title-case tags FastAPI produces when a
# router declares its own tags AND is mounted with tags= in api/__init__.py.
# That is why "Sprint Tasks" and "sprint-tasks" both arrive here as
# "sprint_tasks".

TAG_TO_CAPABILITY: dict[str, str] = {
    # -- Agile planning ------------------------------------------------------
    "sprints": "sprints",
    "sprint_tasks": "sprints",
    "sprint_analytics": "sprints",
    "epics": "sprints",
    "stories": "sprints",
    "user_stories": "sprints",
    "releases": "sprints",
    "goals": "sprints",
    "bugs": "sprints",
    "planning_poker": "sprints",
    "retrospective": "sprints",
    "retrospectives": "sprints",
    "projects": "sprints",
    "project_tasks": "sprints",
    "workspace_tasks": "sprints",
    "task_config": "sprints",
    "task_configuration": "sprints",
    "task_templates": "sprints",
    "task_links": "sprints",
    "dependencies": "sprints",
    "saved_views": "sprints",
    "work_updates": "sprints",
    "entity_activities": "sprints",
    "public_projects": "public",
    # -- Service desk & ops --------------------------------------------------
    "tickets": "tickets",
    "ticket_forms": "tickets",
    "public_tickets": "public",
    "service_desk": "service_desk",
    "escalation": "service_desk",
    "alert_integrations": "service_desk",
    "alert_webhooks": "service_desk",
    "oncall": "oncall",
    "on_call": "oncall",
    "uptime": "uptime",
    "uptime_monitoring": "uptime",
    # -- CRM & GTM -----------------------------------------------------------
    "crm": "crm",
    "crm_automation": "crm",
    "crm_pipelines": "crm",
    "gtm": "gtm",
    # -- Email marketing -----------------------------------------------------
    "email_marketing": "email_marketing",
    "email_infrastructure": "email_marketing",
    "email_webhooks": "email_marketing",
    "visual_builder": "email_marketing",
    "subscriptions": "email_marketing",
    "preferences_public": "public",
    "templates": "email_marketing",
    # -- Agents & automation -------------------------------------------------
    "agents": "agents",
    "agent_policies": "agents",
    "agent_audit": "agents",
    "automation_agents": "agents",
    "writing_style": "agents",
    "workflows": "automations",
    "workflow_events": "automations",
    "workflow_templates": "automations",
    "automations": "automations",
    "secrets": "automations",
    "ai_settings": "automations",
    "webhooks": "automations",
    # -- Docs, drive & knowledge --------------------------------------------
    "documents": "docs",
    "document_spaces": "docs",
    "knowledge_graph": "docs",
    "collaboration": "docs",
    "file_search": "docs",
    "drive": "drive",
    # -- People --------------------------------------------------------------
    "organization": "organization",
    "team_calendar": "organization",
    "reviews": "reviews",
    "career": "reviews",
    "hiring": "hiring",
    "assessments": "hiring",
    "assessment_take": "hiring",
    "questions": "hiring",
    "question_bank": "hiring",
    "questionnaires": "hiring",
    "leave": "leave",
    "leave_management": "leave",
    # -- Learning ------------------------------------------------------------
    "learning": "learning",
    "learning_activities": "learning",
    "learning_analytics": "learning",
    "learning_integrations": "learning",
    "learning_manager": "learning",
    "gamification": "learning",
    # -- Compliance ----------------------------------------------------------
    "compliance": "compliance",
    "compliance_documents": "compliance",
    "compliance_folders": "compliance",
    "reminders": "compliance",
    # -- Engineering intelligence -------------------------------------------
    "insights": "insights",
    "developer_insights": "insights",
    "intelligence": "insights",
    "analysis": "insights",
    "code_insights": "insights",
    "predictions": "insights",
    "repositories": "insights",
    "analytics": "insights",
    # -- Reporting -----------------------------------------------------------
    "reports": "reports",
    "dashboard": "reports",
    "exports": "reports",
    # -- Tables --------------------------------------------------------------
    "tables": "tables",
    "custom_field_types": "tables",
    "tables_public": "public",
    # -- Forms ---------------------------------------------------------------
    "forms": "forms",
    "public_forms": "public",
    "forms_public": "public",
    # -- Booking -------------------------------------------------------------
    "booking": "booking",
    "booking_availability": "booking",
    "booking_bookings": "booking",
    "booking_calendars": "booking",
    "booking_calendar_callback": "booking",
    "booking_calendar_callbacks": "booking",
    "booking_event_types": "booking",
    "booking_public": "public",
    "booking_rsvp": "booking",
    "booking_webhooks_enterprise": "booking",
    # -- Chat & Ask ----------------------------------------------------------
    "chat": "chat",
    "ask": "chat",
    "ai_feedback": "chat",
    "public_community": "public",
    # -- Time tracking -------------------------------------------------------
    "tracking": "tracking",
    "tracker_ingest": "tracking",
    "tracker_qa": "tracking",
    "tracker_admin": "tracking",
    "tracker_target_hours": "tracking",
    # -- Platform ------------------------------------------------------------
    "workspaces": "platform",
    "workspace_teams": "platform",
    "teams": "platform",
    "developers": "platform",
    "roles": "platform",
    "invites": "platform",
    "app_access": "platform",
    "api_tokens": "platform",
    "auth": "platform",
    "notifications": "platform",
    "preferences": "platform",
    # -- Admin (privileged) --------------------------------------------------
    "admin": "admin",
    "platform_admin": "admin",
    "platform_admin_plans": "admin",
    "admin_rate_limits": "admin",
    "billing": "admin",
    # -- Integrations --------------------------------------------------------
    "integrations": "integrations",
    "integration_webhooks": "integrations",
    "slack": "integrations",
    "google_integration": "integrations",
    "google_calendar": "integrations",
    "google_calendar_integration": "integrations",
    # -- System (excluded) ---------------------------------------------------
    "health": "system",
    "event_ingestion": "system",
    "mcp": "platform",
}

# Tags too vague to decide an operation's capability on their own.
#
# Normalisation folds case and separators, which is what makes the duplicate
# title-case tags collapse — but it also collides genuinely different tags.
# `api/webhooks.py` tags its routes "webhooks" (GitHub receiver, automation
# triggers) while `api/integrations.py` mounts its Jira/Linear receivers with
# both "integration-webhooks" and "Webhooks". Both normalise to "webhooks".
#
# A generic tag yields to any specific tag on the same operation, and is only
# consulted when it is the only thing an operation carries.
GENERIC_TAGS = {"webhooks", "templates", "analytics"}

MUTATING_METHODS = {"post", "put", "patch", "delete"}


def normalise(tag: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", tag.lower()).strip("_")


def load_schema(from_file: str | None) -> dict:
    """Prefer building the schema in-process so this runs in CI without a server."""
    if from_file:
        return json.loads(Path(from_file).read_text())
    from aexy.main import create_app

    return create_app().openapi()


def capability_for(tags: list[str]) -> tuple[str | None, list[str]]:
    """Resolve an operation's capability from its tags.

    An operation carries several tags when a router declares its own and is
    mounted with more. They must not disagree about which capability governs the
    operation; if they do, that is a mapping bug worth failing on rather than
    silently picking one.
    """
    normalised = sorted({normalise(t) for t in tags})
    unmapped = [t for t in normalised if t not in TAG_TO_CAPABILITY]

    specific = [t for t in normalised if t in TAG_TO_CAPABILITY and t not in GENERIC_TAGS]
    considered = specific or [t for t in normalised if t in TAG_TO_CAPABILITY]
    resolved = {TAG_TO_CAPABILITY[t] for t in considered}

    if len(resolved) > 1:
        # A public router mounted under an app tag is the expected case: the
        # narrower "this is anonymous" fact wins.
        if "public" in resolved:
            return "public", unmapped
        raise SystemExit(
            f"tags {normalised} map to conflicting capabilities {sorted(resolved)} — "
            "fix TAG_TO_CAPABILITY"
        )
    return (resolved.pop() if resolved else None), unmapped


def build_catalog(schema: dict) -> dict:
    by_capability: dict[str, list[dict]] = {}
    unmapped_tags: set[str] = set()
    unmapped_ops = 0

    for path, methods in sorted(schema.get("paths", {}).items()):
        for method, op in sorted(methods.items()):
            if method.lower() not in {"get", *MUTATING_METHODS}:
                continue
            capability, unmapped = capability_for(op.get("tags", []))
            unmapped_tags.update(unmapped)
            if capability is None:
                unmapped_ops += 1
                continue
            summary = op.get("summary") or ""
            description = (op.get("description") or "").strip().split("\n")[0]
            by_capability.setdefault(capability, []).append(
                {
                    "operation_id": op["operationId"],
                    "method": method.upper(),
                    "path": path,
                    "summary": summary or description,
                    "mutating": method.lower() in MUTATING_METHODS,
                }
            )

    capabilities = []
    for capability in sorted(by_capability):
        if capability in EXCLUDED_CAPABILITIES:
            continue
        operations = sorted(by_capability[capability], key=lambda o: o["operation_id"])
        capabilities.append(
            {
                "capability": f"mcp.{capability}",
                "app": None if capability in PLATFORM_CAPABILITIES else capability,
                "privileged": capability == "admin",
                "operation_count": len(operations),
                "operations": operations,
            }
        )

    # An agent addresses an operation by id, so a duplicate id makes one of the
    # two routes unreachable — whichever the lookup does not win. FastAPI only
    # warns. Recording them here means a new collision shows up in review as a
    # fixture diff instead of scrolling past in build output.
    seen: dict[str, list[str]] = {}
    for cap in capabilities:
        for op in cap["operations"]:
            seen.setdefault(op["operation_id"], []).append(f"{op['method']} {op['path']}")
    duplicates = {k: v for k, v in sorted(seen.items()) if len(v) > 1}

    return {
        "catalog_version": 1,
        "capabilities": capabilities,
        "duplicate_operation_ids": duplicates,
        "excluded": {
            cap: len(by_capability.get(cap, []))
            for cap in sorted(EXCLUDED_CAPABILITIES)
            if cap in by_capability
        },
        "unmapped_tags": sorted(unmapped_tags),
        "unmapped_operation_count": unmapped_ops,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="output path, or - for stdout")
    parser.add_argument("--check", action="store_true", help="fail if stale or unmapped")
    parser.add_argument("--report", action="store_true", help="print a coverage summary")
    parser.add_argument("--from-file", help="read an openapi.json instead of building it")
    args = parser.parse_args()

    catalog = build_catalog(load_schema(args.from_file))
    serialized = json.dumps(catalog, indent=2, sort_keys=False) + "\n"

    total = sum(c["operation_count"] for c in catalog["capabilities"])
    excluded = sum(catalog["excluded"].values())

    if args.report:
        print(f"{'capability':28} {'ops':>5}")
        for cap in sorted(catalog["capabilities"], key=lambda c: -c["operation_count"]):
            flag = " (privileged)" if cap["privileged"] else ""
            print(f"{cap['capability']:28} {cap['operation_count']:5}{flag}")
        print(f"\n{total} operations across {len(catalog['capabilities'])} capabilities")
        print(f"{excluded} excluded (public/system): {catalog['excluded']}")
        if catalog["duplicate_operation_ids"]:
            print(f"\nDUPLICATE operation ids ({len(catalog['duplicate_operation_ids'])}):")
            for op_id, routes in catalog["duplicate_operation_ids"].items():
                print(f"  {op_id}")
                for route in routes:
                    print(f"      {route}")
        if catalog["unmapped_tags"]:
            print(f"\nUNMAPPED TAGS ({len(catalog['unmapped_tags'])}):")
            for tag in catalog["unmapped_tags"]:
                print(f"  {tag}")
            print(f"{catalog['unmapped_operation_count']} operations unreachable")
        return 0

    if catalog["unmapped_tags"]:
        print(
            f"✗ {len(catalog['unmapped_tags'])} tag(s) have no capability, leaving "
            f"{catalog['unmapped_operation_count']} operation(s) outside the access model:",
            file=sys.stderr,
        )
        for tag in catalog["unmapped_tags"]:
            print(f"    {tag}", file=sys.stderr)
        print("  Add them to TAG_TO_CAPABILITY in this script.", file=sys.stderr)
        return 1

    if args.out == "-":
        print(serialized, end="")
        return 0

    out = Path(args.out)
    if args.check:
        current = out.read_text() if out.exists() else ""
        if current != serialized:
            print(f"✗ {out.name} is stale. Run: python scripts/dump_mcp_catalog.py", file=sys.stderr)
            return 1
        print(f"✓ MCP catalogue current — {total} operations, {len(catalog['capabilities'])} capabilities")
        return 0

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(serialized)
    print(f"  Wrote {total} operations across {len(catalog['capabilities'])} capabilities → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
