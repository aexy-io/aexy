"""Prompts and resources for the remote MCP server.

The stdio server carried six prompts — the daily routines: standup, sprint
planning, pipeline review, weekly report — and two Temporal debugging walks.
None reached the governed transport, which offered tools only. These are the
routines, rewritten around the named routine tools and the per-capability
tools the server actually exposes, and filtered to what the caller holds: a
prompt whose tools would all be refused is worse than no prompt.

Resources are the two things a client wants to read rather than call: what
this grant can reach, and what one capability's operations are.
"""

from __future__ import annotations

import json
from typing import Any

from aexy.services.mcp_catalog import build_tools

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

PROMPTS: list[dict[str, Any]] = [
    {
        "name": "sprint_standup",
        "description": "Daily standup summary for a team's active sprint: progress, blockers, risks, who has not reported.",
        "capabilities": {"mcp.sprints", "mcp.tracking"},
        "arguments": [
            {"name": "team_id", "description": "Team id. Omit to be asked which team.", "required": False},
        ],
        "text": (
            "Write today's standup summary for the team{team}. Steps:\n"
            "1. Find the active sprint with aexy_sprints (action get_active_sprint, path_params team_id).\n"
            "2. Fetch everyone's standups with aexy_sprint_standup and open blockers with aexy_active_blockers.\n"
            "3. Summarise: what moved since yesterday, what is blocked and on what (name people), "
            "what is at risk for the sprint goal, and who has not reported.\n"
            "Keep it under 200 words. Do not change any task; if something needs a decision, say who should make it."
        ),
    },
    {
        "name": "sprint_hygiene",
        "description": "Find tasks in the active sprint that are unassigned, unestimated or stale, and propose fixes.",
        "capabilities": {"mcp.sprints"},
        "arguments": [{"name": "team_id", "description": "Team id.", "required": False}],
        "text": (
            "Run a sprint hygiene pass for the team{team}. Find the active sprint (aexy_sprints, "
            "get_active_sprint), then list its tasks with aexy_sprint_tasks using fields to keep "
            "only id, title, status, assignee_id, estimate and updated_at. Report: unassigned tasks, "
            "tasks with no estimate, and in-progress tasks not updated in 3+ days. Propose an owner or "
            "next step for each. Do not reassign or change status yourself."
        ),
    },
    {
        "name": "service_desk_triage",
        "description": "Classify service desk tickets the AI was unsure about, and set owners where the evidence is clear.",
        "capabilities": {"mcp.service_desk"},
        "arguments": [],
        "text": (
            "Triage the service desk. List tickets with aexy_sd_open_tickets (needs_triage=true, "
            "fields: id, ticket_number, title, request_type, pending_with, account_id). For each, read it "
            "with aexy_service_desk (action get_ticket) and decide the request type from the workspace's "
            "taxonomy and the account it concerns. Apply with aexy_sd_triage_ticket, setting only what you "
            "have evidence for and needs_triage=false once classified. If a change is held for approval, "
            "note it and move on. End with a list of what you set and what you could not decide."
        ),
    },
    {
        "name": "tat_review",
        "description": "Turnaround-time sweep: find service desk tickets breaching or about to breach, and nudge owners.",
        "capabilities": {"mcp.service_desk"},
        "arguments": [{"name": "pending_with", "description": "Restrict to one stakeholder slug.", "required": False}],
        "text": (
            "Review turnaround times{scope}. Pull aexy_sd_tat_report (is_open=true) and find tickets over "
            "target or within 20% of it. For each, name the ticket, the stakeholder it is with, and how far "
            "over. Draft a short nudge to the owner with aexy_sd_email_stakeholder; sending is held for a "
            "person to approve, so say that. Do not park tickets onward unless the report shows the current "
            "stakeholder has already responded."
        ),
    },
    {
        "name": "weekly_report",
        "description": "Weekly engineering report from sprint analytics and insights, as a document proposal.",
        # `mcp.tracking` because the text calls `aexy_active_blockers`, which
        # lives there — same as `sprint_standup`. Without it the prompt was
        # offered to callers whose tools/list does not contain that routine.
        "capabilities": {"mcp.sprints", "mcp.docs", "mcp.tracking"},
        "arguments": [{"name": "team_id", "description": "Team id.", "required": False}],
        "text": (
            "Write the weekly engineering report for the team{team}. Gather: sprint progress and velocity "
            "(aexy_sprints: get_active_sprint, then the sprint analytics actions), completed and carried-over "
            "work, and open blockers (aexy_active_blockers). Write it as Markdown with sections: Summary, "
            "Shipped, In progress, Risks, Asks. Propose it with aexy_docs_propose against the team's report "
            "document rather than creating a new page; the proposal waits in review."
        ),
    },
    {
        "name": "crm_pipeline_review",
        "description": "Review open deals for staleness and next steps, and draft follow-ups.",
        "capabilities": {"mcp.crm"},
        "arguments": [],
        "text": (
            "Review the deal pipeline. Find the deals object with aexy_crm (action list_objects), then list "
            "open deals with aexy_crm_records sorted by last activity. Flag deals with no activity in 14+ days "
            "and deals past their expected close date. For each, propose the next step and draft a follow-up "
            "note. Do not send anything; sending is held for approval."
        ),
    },
    {
        "name": "leave_approvals",
        "description": "Review pending leave requests against balances and team calendar clashes, and recommend.",
        "capabilities": {"mcp.leave"},
        "arguments": [],
        "text": (
            "Review pending leave requests with aexy_leave_pending_approvals. For each, check the requester's "
            "balance (aexy_leave action get_developer_balance) and whether teammates are already off in the "
            "same window. Recommend approve or discuss, with one line of reasoning. Approving is a person's "
            "decision; do not call approve_leave_request unless explicitly told to."
        ),
    },
    {
        "name": "compliance_sweep",
        "description": "Overdue training and expiring certifications, by person, with who to chase.",
        "capabilities": {"mcp.compliance"},
        "arguments": [{"name": "days_ahead", "description": "Expiry window in days (default 30).", "required": False}],
        "text": (
            "Run the compliance sweep. Pull aexy_compliance_overdue and aexy_compliance_expiring"
            "{window}. Group by person, list what is overdue and what expires soon, and say who to chase. "
            "Do not waive anything; waivers are held for approval."
        ),
    },
    {
        "name": "incident_first_response",
        "description": "Acknowledge new uptime incidents and summarise what is down and for how long.",
        "capabilities": {"mcp.uptime"},
        "arguments": [],
        "text": (
            "Incident first response. List open incidents with aexy_open_incidents (status=open). "
            "Acknowledge any that nobody has acknowledged (aexy_incident_acknowledge). Summarise: which "
            "monitors are down, since when, and whether the same monitor has flapped recently. Recommend "
            "escalation if an incident is older than 15 minutes with no acknowledgement; escalating itself "
            "is held for approval."
        ),
    },
]


def prompts_for(granted: set[str]) -> list[dict[str, Any]]:
    """Prompts whose tools the caller can actually use."""
    return [
        {
            "name": p["name"],
            "description": p["description"],
            "arguments": p["arguments"],
        }
        for p in PROMPTS
        if p["capabilities"] <= granted
    ]


def render_prompt(name: str, arguments: dict[str, Any] | None, granted: set[str]) -> dict[str, Any] | None:
    """The prompt as MCP `prompts/get` returns it, or None if unknown/ungranted."""
    prompt = next((p for p in PROMPTS if p["name"] == name), None)
    if prompt is None or not prompt["capabilities"] <= granted:
        return None
    args = arguments or {}
    team = f" (team {args['team_id']})" if args.get("team_id") else ""
    scope = f" for tickets pending with {args['pending_with']}" if args.get("pending_with") else ""
    window = f" (days_ahead={args['days_ahead']})" if args.get("days_ahead") else ""
    text = prompt["text"].format(team=team, scope=scope, window=window)
    return {
        "description": prompt["description"],
        "messages": [{"role": "user", "content": {"type": "text", "text": text}}],
    }


# ---------------------------------------------------------------------------
# Resources
# ---------------------------------------------------------------------------

CAPABILITIES_URI = "aexy://capabilities"
CATALOG_URI_PREFIX = "aexy://catalog/"


def resources_for(catalog: dict[str, Any], granted: set[str]) -> list[dict[str, Any]]:
    resources = [
        {
            "uri": CAPABILITIES_URI,
            "name": "Your capabilities",
            "description": "What this grant can reach in this workspace, and what it cannot.",
            "mimeType": "application/json",
        }
    ]
    for group in catalog["capabilities"]:
        if group["capability"] not in granted:
            continue
        key = group["capability"].removeprefix("mcp.")
        resources.append(
            {
                "uri": f"{CATALOG_URI_PREFIX}{key}",
                "name": f"Operations: {key.replace('_', ' ')}",
                "description": f"{group['operation_count']} operations behind aexy_{key}, with parameters.",
                "mimeType": "application/json",
            }
        )
    return resources


def read_resource(uri: str, catalog: dict[str, Any], granted: set[str], workspace_id: str) -> dict[str, Any] | None:
    if uri == CAPABILITIES_URI:
        tools = build_tools(catalog, granted)
        payload = {
            "workspace_id": workspace_id,
            "granted": sorted(granted),
            "denied": sorted(
                g["capability"] for g in catalog["capabilities"] if g["capability"] not in granted
            ),
            "tools": [t["name"] for t in tools],
        }
        return {"uri": uri, "mimeType": "application/json", "text": json.dumps(payload, indent=2)}

    if uri.startswith(CATALOG_URI_PREFIX):
        key = uri[len(CATALOG_URI_PREFIX):]
        capability = f"mcp.{key}"
        if capability not in granted:
            return None
        group = next((g for g in catalog["capabilities"] if g["capability"] == capability), None)
        if group is None:
            return None
        payload = {
            "capability": capability,
            "tool": f"aexy_{key}",
            "operations": [
                {
                    k: v
                    for k, v in op.items()
                    if k in ("action", "method", "path", "summary", "mutating", "parameters", "request_body")
                }
                for op in group["operations"]
            ],
        }
        return {"uri": uri, "mimeType": "application/json", "text": json.dumps(payload, indent=2)}

    return None
