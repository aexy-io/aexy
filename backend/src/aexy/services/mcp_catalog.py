"""The MCP operation catalogue: every API operation, grouped by capability.

This is the single source for three things that used to disagree, or did not
exist at all:

  * which operations MCP can reach (all of them, derived from the app's own
    OpenAPI schema rather than hand-typed paths),
  * which capability governs each one,
  * what the tool surface looks like for a given caller.

Why generated. The MCP server reached ~218 of ~1900 operations through 27 tools
whose URL paths were written by hand in a separate repo, and four of those tools
were dead: ``aexy_developer_insights`` called ``/developer-insights`` when the
router mounts at ``/insights``, ``aexy_tables`` called ``/rows`` when the routes
are ``/records``, ``aexy_gtm_leads`` called a module that does not exist, and
``aexy_agents`` called ``/execute`` when the route is ``/run``. Nothing caught
it because nothing tied the tools to the routes. A generated catalogue cannot
name a path that is not there.

Why capabilities. Filtering the tool list by what a caller can reach is a
security property, but it is also what makes full coverage usable: 1900
operations cannot be 1900 tools, and a model chooses badly past a few dozen.
Ten granted capabilities is a dozen tools covering everything reachable,
instead of a catalogue that mostly 403s.

``scripts/dump_mcp_catalog.py`` renders this to a fixture and CI checks it, so a
new router cannot land outside the access model unnoticed.
"""

from __future__ import annotations

import re
from typing import Any, TypedDict

# ---------------------------------------------------------------------------
# Capabilities
# ---------------------------------------------------------------------------
#
# Most capabilities ARE an app in APP_CATALOG, so an MCP grant is the app grant
# a workspace already makes and there is no second access model to keep in sync.
#
# These three surfaces are not apps and never were, so they have nowhere else to
# live. They exist as modules on the `mcp` app instead — see APP_CATALOG["mcp"].
PLATFORM_CAPABILITIES = {"platform", "admin", "integrations"}

# Excluded from MCP entirely.
#
# `public` routers answer to unauthenticated visitors by design, so running them
# on a developer's token misrepresents who is asking. `system` is liveness and
# machine ingest, which no agent needs.
EXCLUDED_CAPABILITIES = {"public", "system"}

# Capabilities a wrongly-granted tool does lasting damage through. Defaulted off
# rather than inherited.
PRIVILEGED_CAPABILITIES = {"admin"}

# Tags too vague to decide an operation's capability alone.
#
# Normalisation folds the duplicate title-case tags FastAPI emits when a router
# declares tags and is also mounted with them — but it collides genuinely
# different tags too: api/webhooks.py tags its GitHub receiver "webhooks", while
# api/integrations.py mounts its Jira and Linear receivers as both
# "integration-webhooks" and "Webhooks". A generic tag yields to any specific
# tag on the same operation, and is consulted only when it is all there is.
GENERIC_TAGS = {"webhooks", "templates", "analytics"}

MUTATING_METHODS = {"post", "put", "patch", "delete"}
_HTTP_METHODS = {"get", *MUTATING_METHODS}

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
    "mcp": "platform",
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
}


class Operation(TypedDict):
    """One API operation, as an agent addresses it."""

    operation_id: str
    action: str  # short, stable name unique within its capability
    method: str
    path: str
    summary: str
    mutating: bool


class CapabilityGroup(TypedDict):
    capability: str  # "mcp.sprints"
    app: str | None  # None for platform capabilities
    privileged: bool
    operation_count: int
    operations: list[Operation]


class TagConflictError(ValueError):
    """Two tags on one operation claim different capabilities."""


def normalise(tag: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", tag.lower()).strip("_")


def capability_for(tags: list[str]) -> tuple[str | None, list[str]]:
    """Resolve an operation's capability from its tags.

    Returns ``(capability, unmapped_tags)``. ``capability`` is None when nothing
    matched, which callers must treat as "outside the access model" rather than
    defaulting it either way.
    """
    normalised = sorted({normalise(t) for t in tags})
    unmapped = [t for t in normalised if t not in TAG_TO_CAPABILITY]

    specific = [t for t in normalised if t in TAG_TO_CAPABILITY and t not in GENERIC_TAGS]
    considered = specific or [t for t in normalised if t in TAG_TO_CAPABILITY]
    resolved = {TAG_TO_CAPABILITY[t] for t in considered}

    if len(resolved) > 1:
        # A public router mounted under an app tag is expected: the narrower
        # "this is anonymous" fact wins.
        if "public" in resolved:
            return "public", unmapped
        raise TagConflictError(
            f"tags {normalised} map to conflicting capabilities {sorted(resolved)} — "
            "fix TAG_TO_CAPABILITY in aexy.services.mcp_catalog"
        )
    return (resolved.pop() if resolved else None), unmapped


def _short_action(operation_id: str) -> str:
    """Strip FastAPI's auto-generated ``_api_v1_<path>_<method>`` suffix.

    ``list_calendars_api_v1_workspaces__workspace_id__integrations_..._get``
    becomes ``list_calendars``. Roughly 96% of these are already unique within
    their capability; :func:`_assign_actions` disambiguates the rest.
    """
    return re.sub(r"_api_v1_.*$", "", operation_id) or operation_id


def _path_hints(path: str) -> list[str]:
    """Literal path segments, most specific last. Parameters carry no meaning here."""
    return [seg for seg in path.strip("/").split("/") if seg and not seg.startswith("{")]


def _assign_actions(entries: list[dict[str, Any]]) -> None:
    """Give every operation in a capability a short, unique, stable ``action``.

    Collisions are real — ten short names cover twenty-one operations in
    ``sprints`` alone — so they are broken by appending distinguishing path
    segments from the end. Deterministic, so the enum a client caches stays
    valid across restarts, and derived only from the route, so it cannot drift
    from what the operation actually is.
    """
    by_short: dict[str, list[dict[str, Any]]] = {}
    for entry in entries:
        by_short.setdefault(_short_action(entry["operation_id"]), []).append(entry)

    for short, group in by_short.items():
        if len(group) == 1:
            group[0]["action"] = short
            continue

        taken: set[str] = set()
        for entry in group:
            hints = [h for h in _path_hints(entry["path"]) if h not in short]
            candidate = short
            # Walk in from the most specific segment until unique.
            for depth in range(1, len(hints) + 1):
                candidate = "_".join([short, *hints[-depth:]]).replace("-", "_")
                if candidate not in taken:
                    break
            if candidate in taken:
                # Same path, different method: the method is the difference.
                candidate = f"{candidate}_{entry['method'].lower()}"
            taken.add(candidate)
            entry["action"] = candidate


def build_catalog(schema: dict) -> dict[str, Any]:
    """Group every operation in an OpenAPI schema by the capability governing it."""
    by_capability: dict[str, list[dict[str, Any]]] = {}
    unmapped_tags: set[str] = set()
    unmapped_ops = 0

    for path, methods in sorted(schema.get("paths", {}).items()):
        for method, op in sorted(methods.items()):
            if method.lower() not in _HTTP_METHODS:
                continue  # OPTIONS preflight is not an API operation
            capability, unmapped = capability_for(op.get("tags", []))
            unmapped_tags.update(unmapped)
            if capability is None:
                unmapped_ops += 1
                continue
            description = (op.get("description") or "").strip().split("\n")[0]
            by_capability.setdefault(capability, []).append(
                {
                    "operation_id": op["operationId"],
                    "method": method.upper(),
                    "path": path,
                    "summary": op.get("summary") or description,
                    "mutating": method.lower() in MUTATING_METHODS,
                }
            )

    groups: list[CapabilityGroup] = []
    for capability in sorted(by_capability):
        if capability in EXCLUDED_CAPABILITIES:
            continue
        entries = sorted(by_capability[capability], key=lambda o: o["operation_id"])
        _assign_actions(entries)
        groups.append(
            {
                "capability": f"mcp.{capability}",
                "app": None if capability in PLATFORM_CAPABILITIES else capability,
                "privileged": capability in PRIVILEGED_CAPABILITIES,
                "operation_count": len(entries),
                "operations": [
                    {
                        "operation_id": e["operation_id"],
                        "action": e["action"],
                        "method": e["method"],
                        "path": e["path"],
                        "summary": e["summary"],
                        "mutating": e["mutating"],
                    }
                    for e in entries
                ],
            }
        )

    # An agent addresses an operation by id, so a collision makes one of two
    # distinct handlers unreachable. FastAPI only warns; recording them turns
    # the next one into a fixture diff in review.
    seen: dict[str, list[str]] = {}
    for group in groups:
        for op in group["operations"]:
            seen.setdefault(op["operation_id"], []).append(f"{op['method']} {op['path']}")

    return {
        "catalog_version": 1,
        "capabilities": groups,
        "duplicate_operation_ids": {k: v for k, v in sorted(seen.items()) if len(v) > 1},
        "excluded": {
            cap: len(by_capability.get(cap, []))
            for cap in sorted(EXCLUDED_CAPABILITIES)
            if cap in by_capability
        },
        "unmapped_tags": sorted(unmapped_tags),
        "unmapped_operation_count": unmapped_ops,
    }


# ---------------------------------------------------------------------------
# Tool surface
# ---------------------------------------------------------------------------
#
# Two tools are always offered and reach everything the caller may reach;
# one more is offered per granted capability, so the common path needs no
# discovery round-trip. That combination is what lets full coverage coexist
# with a tool list a model can actually choose from — roughly a dozen tools
# for a typical caller, against 1866 operations.

DISCOVER_TOOL = "aexy_discover"
CALL_TOOL = "aexy_call"


def _tool_name(capability: str) -> str:
    return f"aexy_{capability.removeprefix('mcp.')}"


def _generic_tools(granted: list[CapabilityGroup]) -> list[dict[str, Any]]:
    capabilities = [g["capability"] for g in granted]
    reachable = sum(g["operation_count"] for g in granted)
    return [
        {
            "name": DISCOVER_TOOL,
            "capability": None,
            "description": (
                f"Search the {reachable} Aexy API operations you can reach. Returns "
                "each match's action name, HTTP method, path, summary and parameter "
                "schema. Use this when no dedicated tool covers what you need, or "
                "before calling an operation you have not used before."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Free text matched against action names, paths and summaries.",
                    },
                    "capability": {
                        "type": "string",
                        "enum": capabilities,
                        "description": "Restrict the search to one capability.",
                    },
                    "limit": {"type": "integer", "default": 20, "maximum": 100},
                },
                "required": ["query"],
            },
        },
        {
            "name": CALL_TOOL,
            "capability": None,
            "description": (
                "Call any Aexy API operation by its action name or operation id. "
                "Every operation you can reach is callable here, including those "
                "with no dedicated tool. Find names with "
                f"`{DISCOVER_TOOL}`. Access is enforced server-side, so an "
                "operation outside your grants is refused whatever you pass."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "description": "Action name or operation id to invoke.",
                    },
                    "path_params": {
                        "type": "object",
                        "description": "Values for {braced} segments of the path, e.g. workspace_id.",
                    },
                    "query": {"type": "object", "description": "Query string parameters."},
                    "body": {"type": "object", "description": "JSON request body, for writes."},
                },
                "required": ["action"],
            },
        },
    ]


def build_tools(catalog: dict[str, Any], granted_capabilities: set[str]) -> list[dict[str, Any]]:
    """Build the tool list for a caller holding ``granted_capabilities``.

    ``granted_capabilities`` holds full names like ``"mcp.sprints"``. Anything
    not granted is absent from the result — not merely marked unavailable —
    because a tool a caller cannot use still costs them selection accuracy on
    every call they do make.
    """
    granted = [g for g in catalog["capabilities"] if g["capability"] in granted_capabilities]
    if not granted:
        return []

    tools = _generic_tools(granted)

    for group in sorted(granted, key=lambda g: g["capability"]):
        operations = group["operations"]
        writes = sum(1 for op in operations if op["mutating"])
        tools.append(
            {
                "name": _tool_name(group["capability"]),
                "capability": group["capability"],
                "description": (
                    f"{len(operations)} Aexy operations for "
                    f"{group['capability'].removeprefix('mcp.').replace('_', ' ')} "
                    f"({writes} of them write). Pick an action; pass path segments "
                    "in path_params, filters in query, and payloads in body."
                ),
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            # The enum IS the coverage guarantee: every operation
                            # in the capability is nameable without a round-trip.
                            "enum": [op["action"] for op in operations],
                        },
                        "path_params": {"type": "object"},
                        "query": {"type": "object"},
                        "body": {"type": "object"},
                    },
                    "required": ["action"],
                },
                "actions": [
                    {
                        "action": op["action"],
                        "method": op["method"],
                        "path": op["path"],
                        "summary": op["summary"],
                        "mutating": op["mutating"],
                    }
                    for op in operations
                ],
            }
        )

    return tools
