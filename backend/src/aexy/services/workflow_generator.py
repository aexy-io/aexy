"""LLM-backed workflow generator (UX-DEF-004).

Given a one-line description ("when a deal closes, post to slack and
create a follow-up task"), return a ReactFlow-shaped {nodes, edges}
payload that the workflow canvas can drop in as a starting point.

The generated workflow is always validated client-side via the same
validation rules as user-built workflows — the LLM is a starting
point, not the source of truth. Worst case (LLM returns bad shape):
caller falls back to TemplateGallery.
"""

from __future__ import annotations

import json
import logging
from collections import deque
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from aexy.llm.gateway import get_llm_gateway

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are a workflow designer for the Aexy automation
platform. The user describes what they want in plain English, and you
return a JSON object describing the workflow nodes + edges.

Output JSON shape:
{
  "nodes": [
    {
      "id": "string-id",
      "type": "trigger" | "action" | "condition" | "wait" | "agent" | "branch" | "join",
      "data": { ... type-specific data ... }
    }
  ],
  "edges": [
    {"id": "edge-id", "source": "node-id", "target": "node-id", "sourceHandle"?: "string"}
  ]
}

Node types + data shapes:

- trigger     {"label": "...", "trigger_type": "record.created" | "form.submitted" | "schedule.daily" | "webhook"}
- action      {"label": "...", "action_type": "send_email" | "create_record" | "update_record" | "send_slack" | "create_task" | "call_webhook"}
- condition   {"label": "...", "conditions": [{"field": "...", "operator": "eq", "value": "..."}], "conjunction": "and" | "or"}
- wait        {"label": "Wait N", "wait_type": "duration", "duration_value": 1, "duration_unit": "minutes" | "hours" | "days"}
- agent       {"label": "...", "agent_type": "support" | "sales" | "scheduling" | "onboarding"}
- branch      {"label": "Branch", "branches": [{"id": "branch-1", "label": "Path A"}, {"id": "branch-2", "label": "Path B"}]}
- join        {"label": "Join", "join_type": "all" | "any", "incoming_branches": 2}

Rules:
1. Every workflow MUST start with exactly one trigger node.
2. Every non-trigger node MUST have at least one incoming edge.
3. If you produce a `branch`, each `sourceHandle` on outgoing edges
   MUST match a `branches[].id` from the branch node's data.
4. If you produce a `condition`, outgoing edges use `sourceHandle`
   "true" and/or "false".
5. Keep ids short and human-readable (e.g. "trigger-1", "action-1",
   "condition-1"). Don't include timestamps.
6. Generate the minimum set of nodes that satisfies the request.
   Don't add aspirational "could also do" branches.

Reply with valid JSON only — no prose, no backticks, no commentary."""


def _strip_json_fence(raw: str) -> str:
    """Some models still wrap JSON in ```json fences despite the system
    prompt. Strip them. Leaves clean JSON untouched."""
    s = raw.strip()
    if s.startswith("```"):
        # Drop first fence line + trailing fence
        s = s.split("\n", 1)[1] if "\n" in s else s
        if s.endswith("```"):
            s = s[: -3]
        # Drop "json" language tag if present
        if s.lstrip().lower().startswith("json"):
            s = s.lstrip()[4:]
    return s.strip()


def _validate_workflow(payload: dict) -> tuple[bool, str | None]:
    """Quick structural validation. Returns (ok, error_message).

    Catches the most common LLM mistakes — missing trigger, dangling
    edges, malformed shape — before they reach the canvas. Doesn't
    enforce business rules (those live client-side); just shape.
    """
    if not isinstance(payload, dict):
        return False, "response was not a JSON object"
    nodes = payload.get("nodes")
    edges = payload.get("edges")
    if not isinstance(nodes, list) or not nodes:
        return False, "nodes missing or empty"
    if not isinstance(edges, list):
        return False, "edges must be an array"
    # Hard ceiling on graph size — a runaway LLM response shouldn't be
    # able to spawn thousands of canvas nodes. These caps are well
    # above any legitimate user-built workflow.
    if len(nodes) > 100:
        return False, f"too many nodes ({len(nodes)}); cap is 100"
    if len(edges) > 200:
        return False, f"too many edges ({len(edges)}); cap is 200"

    ids: set[str] = set()
    triggers = 0
    for n in nodes:
        if not isinstance(n, dict):
            return False, "node must be an object"
        nid = n.get("id")
        ntype = n.get("type")
        if not isinstance(nid, str) or not nid:
            return False, "node missing id"
        if nid in ids:
            return False, f"duplicate node id {nid}"
        ids.add(nid)
        if ntype not in {"trigger", "action", "condition", "wait", "agent", "branch", "join"}:
            return False, f"unknown node type {ntype}"
        if ntype == "trigger":
            triggers += 1
    if triggers != 1:
        return False, "workflow must have exactly one trigger"

    for e in edges:
        if not isinstance(e, dict):
            return False, "edge must be an object"
        src = e.get("source")
        tgt = e.get("target")
        if src not in ids:
            return False, f"edge source {src!r} references unknown node"
        if tgt not in ids:
            return False, f"edge target {tgt!r} references unknown node"

    return True, None


async def generate_workflow_from_prompt(
    prompt: str,
    module: str | None = None,
    *,
    workspace_id: str | None = None,
    developer_id: str | None = None,
    db: AsyncSession | None = None,
) -> dict[str, Any]:
    """Ask the LLM to draft a workflow from a plain-English prompt.

    Args:
        prompt: User description, e.g. "Notify slack when a deal closes".
        module: Optional module hint ("crm", "sprints"...) — biases the
            LLM toward module-specific triggers/actions.
        workspace_id: For rate-limit + billing scoping.
        developer_id: For rate-limit + billing scoping.
        db: For usage tracking.

    Returns:
        Dict with `nodes`, `edges`, plus a `_meta` block with the model
        name and any validation warning (in case the LLM's output was
        slightly off but salvageable). Empty `nodes`/`edges` on hard
        failure — caller falls back to TemplateGallery.

    Raises:
        ValueError: when the gateway isn't configured or the LLM
            response can't be coerced into a valid shape.
    """
    gateway = get_llm_gateway()
    if gateway is None:
        raise ValueError("LLM gateway not configured")

    user_prompt_parts = [f"Request: {prompt.strip()}"]
    if module:
        user_prompt_parts.append(f"Module hint: {module}")
    user_prompt_parts.append("Return JSON only.")
    user_prompt = "\n\n".join(user_prompt_parts)

    response, *_ = await gateway.call_llm(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        tokens_estimate=1500,
        workspace_id=workspace_id,
        developer_id=developer_id,
        db=db,
        feature="agents.workflow_generation",
    )

    stripped = _strip_json_fence(response)
    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError as e:
        logger.warning("workflow_generator: invalid JSON: %s", e)
        raise ValueError("LLM returned invalid JSON") from e

    ok, err = _validate_workflow(payload)
    if not ok:
        logger.warning("workflow_generator: invalid shape: %s", err)
        raise ValueError(f"Generated workflow is invalid: {err}")

    payload.setdefault("_meta", {})
    payload["_meta"]["source"] = "llm_generated"
    if module:
        payload["_meta"]["module"] = module

    _assign_positions(payload)
    return payload


def _assign_positions(payload: dict[str, Any]) -> None:
    """Assign `position: {x, y}` to every generated node.

    The LLM returns nodes without coordinates, but ReactFlow on the
    frontend requires `position` on every node — otherwise the
    canvas component throws and the /automations route hits its
    error boundary. We compute longest-path depth via topological
    order so triggers sit at the leftmost column and downstream
    actions cascade to the right, with sibling branches stacked
    vertically.

    Mutates `payload` in place; matches the same one-shot
    auto-layout the canvas's "Auto-layout" button would produce, so
    the user sees a sensible starting grid.
    """
    nodes = payload.get("nodes") or []
    edges = payload.get("edges") or []

    HORIZONTAL_GAP = 280
    VERTICAL_GAP = 140
    ORIGIN_X = 80
    ORIGIN_Y = 80

    node_ids: list[str] = [n["id"] for n in nodes if isinstance(n.get("id"), str)]
    in_degree: dict[str, int] = {nid: 0 for nid in node_ids}
    outgoing: dict[str, list[str]] = {nid: [] for nid in node_ids}
    for e in edges:
        src, tgt = e.get("source"), e.get("target")
        if src in outgoing and tgt in in_degree:
            outgoing[src].append(tgt)
            in_degree[tgt] += 1

    # Longest-path depth via Kahn's topological order: when a node is
    # dequeued, every predecessor has already settled its depth, so
    # `depth[child] = max(depth[child], depth[parent] + 1)` over all
    # parents converges in one pass. The earlier BFS variant was
    # wrong on diamonds (A→B→C→D plus A→D): if A→D was walked first,
    # D's descendants kept the shallower depth even after the longer
    # path arrived.
    depth: dict[str, int] = {nid: 0 for nid in node_ids}
    queue: deque[str] = deque(sorted(nid for nid, d in in_degree.items() if d == 0))
    while queue:
        nid = queue.popleft()
        for tgt in outgoing[nid]:
            if depth[nid] + 1 > depth[tgt]:
                depth[tgt] = depth[nid] + 1
            in_degree[tgt] -= 1
            if in_degree[tgt] == 0:
                queue.append(tgt)

    # Nodes still with in_degree > 0 are stuck in a cycle (Kahn never
    # drained them). Leave them at depth 0 — the cycle is a bug the
    # validator should reject upstream, but we still need to render
    # something rather than crash.

    # Group by depth → lane index for vertical stacking.
    by_depth: dict[int, list[str]] = {}
    for nid in node_ids:
        by_depth.setdefault(depth[nid], []).append(nid)

    lane: dict[str, int] = {}
    for d, ids in by_depth.items():
        for i, nid in enumerate(sorted(ids)):
            lane[nid] = i

    for n in nodes:
        nid = n.get("id")
        if not isinstance(nid, str):
            continue
        # Don't clobber an existing position — preserves
        # round-tripping if the LLM ever starts emitting them.
        if isinstance(n.get("position"), dict):
            continue
        n["position"] = {
            "x": ORIGIN_X + depth.get(nid, 0) * HORIZONTAL_GAP,
            "y": ORIGIN_Y + lane.get(nid, 0) * VERTICAL_GAP,
        }
