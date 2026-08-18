"""Turning a tool call into an API call.

The executor deliberately does not talk to services directly. It re-enters the
application over ASGI, carrying a short-lived token for the person whose grant
this is, so every endpoint runs its own dependencies: auth, workspace
membership, app access, the per-router permission checks. That is the difference
between a tool layer and a second access model — and a second access model is a
thing that drifts, quietly, in the permissive direction.

The tool list is an ergonomic filter. This is the gate, and it is the same gate
the web app goes through.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx

from aexy.services.mcp_catalog import CALL_TOOL, DISCOVER_TOOL, workflow_tool

# An operation is normally answered well under this. The ceiling exists so a
# slow endpoint cannot pin an MCP session open indefinitely.
REQUEST_TIMEOUT_SECONDS = 60.0

# Set on every re-entry so the application can recognise its own agent traffic.
AGENT_ACTOR_HEADER = "X-Aexy-Agent-Actor"

# Discovery returns matches, not the whole catalogue: a client that asked to
# search is trying to narrow, and 1866 operations is not narrowing.
MAX_DISCOVER_RESULTS = 25


def _spread(flat: dict[str, Any], mapping: dict[str, str]) -> dict[str, Any]:
    """Turn a named tool's flat arguments into the generic call shape.

    `{"workspace_id": …, "markdown": …}` becomes
    `{"path_params": {...}, "body": {...}}`. Unmapped keys are dropped rather
    than guessed into the body: silently forwarding an unknown field would
    make a typo look like it worked.
    """
    out: dict[str, Any] = {"path_params": {}, "query": {}, "body": {}}
    for key, value in flat.items():
        target = mapping.get(key)
        if target is None or value is None:
            continue
        out["path_params" if target == "path" else target][key] = value
    return {section: values for section, values in out.items() if values}


@dataclass(frozen=True)
class ToolResult:
    content: str
    is_error: bool = False


class McpToolExecutor:
    def __init__(self, app, catalog: dict[str, Any], granted: set[str], db=None):
        self._app = app
        self._catalog = catalog
        self._granted = granted
        # Optional so the executor stays constructible in tests and scripts.
        # Without a session there is no policy evaluation — which is the
        # pre-governance behaviour, and is why the transport always passes one.
        self._db = db

    async def call(
        self,
        *,
        tool_name: str,
        arguments: dict[str, Any],
        developer_id: str,
        workspace_id: str,
    ) -> ToolResult:
        if tool_name == DISCOVER_TOOL:
            return self._discover(arguments.get("query", ""), arguments.get("capability"))

        workflow = workflow_tool(tool_name)
        if workflow is not None:
            # A named workflow binds one action and takes flat arguments, so
            # the caller does not have to know which of path_params / query /
            # body each value belongs in. That split is an artefact of HTTP,
            # not something an agent should have to reason about.
            action = workflow["action"]
            arguments = _spread(arguments, workflow["argument_map"])
        elif tool_name == CALL_TOOL:
            action = arguments.get("action")
        else:
            capability = self._capability_for_tool(tool_name)
            if capability is None:
                return ToolResult(f"Unknown tool: {tool_name}", is_error=True)
            if capability not in self._granted:
                # Should be unreachable — an ungranted tool is never listed — but
                # a client may call a name it cached from an earlier, wider grant.
                return ToolResult(
                    f"You do not have access to {capability} in this workspace.",
                    is_error=True,
                )
            action = arguments.get("action")

        if not action:
            return ToolResult("`action` is required.", is_error=True)

        operation = self._find_operation(action)
        if operation is None:
            return ToolResult(
                f"Unknown action: {action}. Use {DISCOVER_TOOL} to find one.",
                is_error=True,
            )

        capability = operation["_capability"]
        if capability not in self._granted:
            return ToolResult(
                f"`{action}` belongs to {capability}, which you do not have in this "
                "workspace.",
                is_error=True,
            )

        # Permissions are enforced by the endpoint itself, on re-entry below.
        # This is the other question: should an agent do this unattended? A
        # refusal here never reaches the API at all, which is the point — the
        # call must not happen, not happen and be undone.
        if self._db is not None:
            from aexy.services.mcp_governance import McpGovernance

            verdict = await McpGovernance(self._db).review(
                operation=operation,
                arguments=arguments,
                developer_id=developer_id,
                workspace_id=workspace_id,
                tool_name=tool_name,
                granted=self._granted,
            )
            if not verdict.allowed:
                return ToolResult(verdict.message or "Not permitted.", is_error=True)

        return await self._perform(
            operation=operation,
            arguments=arguments,
            developer_id=developer_id,
            workspace_id=workspace_id,
        )

    # ------------------------------------------------------------------

    def _capability_for_tool(self, tool_name: str) -> str | None:
        for group in self._catalog["capabilities"]:
            if tool_name == f"aexy_{group['capability'].removeprefix('mcp.')}":
                return group["capability"]
        return None

    def _find_operation(self, action: str) -> dict[str, Any] | None:
        for group in self._catalog["capabilities"]:
            for op in group["operations"]:
                if op["action"] == action:
                    return {**op, "_capability": group["capability"]}
        return None

    def _discover(self, query: str, capability: str | None) -> ToolResult:
        terms = [t for t in query.lower().split() if t]
        matches: list[dict[str, Any]] = []

        for group in self._catalog["capabilities"]:
            if group["capability"] not in self._granted:
                continue
            if capability and group["capability"] != capability:
                continue
            for op in group["operations"]:
                haystack = f"{op['action']} {op['summary']} {op['path']}".lower()
                if all(term in haystack for term in terms):
                    matches.append(
                        {
                            "action": op["action"],
                            "capability": group["capability"],
                            "method": op["method"],
                            "path": op["path"],
                            "summary": op["summary"],
                            "mutating": op["mutating"],
                        }
                    )

        truncated = len(matches) > MAX_DISCOVER_RESULTS
        payload = {
            "matches": matches[:MAX_DISCOVER_RESULTS],
            "total_matches": len(matches),
        }
        if truncated:
            # Say so rather than silently cutting: a client that thinks it saw
            # everything will conclude the operation it wants does not exist.
            payload["note"] = (
                f"Showing {MAX_DISCOVER_RESULTS} of {len(matches)}. Narrow the query "
                "or pass `capability` to see the rest."
            )
        return ToolResult(json.dumps(payload, indent=2))

    async def _perform(
        self,
        *,
        operation: dict[str, Any],
        arguments: dict[str, Any],
        developer_id: str,
        workspace_id: str,
    ) -> ToolResult:
        path = operation["path"]
        path_params = dict(arguments.get("path_params") or {})

        # `workspace_id` comes from the grant and overwrites anything the caller
        # sent. This was `setdefault`, which does the opposite — a caller-supplied
        # value won, so a connector consented to one workspace could name another
        # in `path_params` and be served. The developer's own membership still
        # gated it, so it was never cross-tenant, but it defeated the per-workspace
        # consent this whole flow is built on: the consent screen, Connected Apps
        # and the docs all promise one workspace.
        path_params["workspace_id"] = workspace_id

        try:
            path = path.format(**path_params)
        except KeyError as exc:
            missing = str(exc).strip("'")
            return ToolResult(
                f"`{operation['action']}` needs path_params.{missing} — its path is "
                f"{operation['path']}.",
                is_error=True,
            )

        from aexy.api.auth import create_access_token
        from aexy.api.developers import AGENT_ACTOR

        # The `actor` claim is what lets an endpoint behave differently for an
        # agent than for the person at a keyboard — routing a rewrite into review
        # rather than applying it. It lives in the signed token rather than a
        # header because a header is the caller's to set: an agent holding an
        # ordinary token and calling the REST API directly used to write straight
        # through, which made the review gate opt-in by the agent.
        headers = {
            "Authorization": (
                f"Bearer {create_access_token(developer_id, actor=AGENT_ACTOR)}"
            ),
            "Content-Type": "application/json",
            # Kept for logs and for anything reading request metadata. Nothing
            # routes on it.
            AGENT_ACTOR_HEADER: "mcp",
        }

        transport = httpx.ASGITransport(app=self._app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://mcp.internal",
            timeout=REQUEST_TIMEOUT_SECONDS,
        ) as client:
            try:
                response = await client.request(
                    operation["method"],
                    path,
                    params=arguments.get("query") or None,
                    json=arguments.get("body") if arguments.get("body") else None,
                    headers=headers,
                )
            except httpx.TimeoutException:
                return ToolResult(
                    f"`{operation['action']}` did not respond within "
                    f"{int(REQUEST_TIMEOUT_SECONDS)}s.",
                    is_error=True,
                )

        return _render(response, operation)


def _render(response: httpx.Response, operation: dict[str, Any]) -> ToolResult:
    try:
        body = response.json()
        rendered = json.dumps(body, indent=2, default=str)
    except ValueError:
        rendered = response.text

    if response.is_success:
        return ToolResult(rendered or f"{response.status_code} (no content)")

    # Report the API's own refusal verbatim. Rewriting it would hide the real
    # reason — "you do not have the CRM app" reads very differently from a
    # generic failure, and the model relays it to a person who can act on it.
    return ToolResult(
        f"{operation['method']} {operation['path']} failed with "
        f"{response.status_code}:\n{rendered}",
        is_error=True,
    )
