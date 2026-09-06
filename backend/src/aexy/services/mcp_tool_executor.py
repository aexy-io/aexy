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
import logging
import re
import time
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

import httpx

from aexy.services.mcp_catalog import CALL_TOOL, DISCOVER_TOOL, workflow_tool

logger = logging.getLogger(__name__)

# Argument keys whose values are masked in the ledger. The ledger exists to
# show what an agent asked for; a secret an agent was handed is the one thing
# it must not preserve.
# Word-bounded on purpose: `page_token`, `next_token` and `token_prefix` are
# not secrets, and a ledger that masks them stops showing what the agent asked.
_SECRET_KEY = re.compile(
    r"^(password|passwd|secret|token|access_token|refresh_token|api_key|apikey|"
    r"private_key|authorization|client_secret)$",
    re.I,
)

# An operation is normally answered well under this. The ceiling exists so a
# slow endpoint cannot pin an MCP session open indefinitely.
REQUEST_TIMEOUT_SECONDS = 60.0

# Set on every re-entry so the application can recognise its own agent traffic.
AGENT_ACTOR_HEADER = "X-Aexy-Agent-Actor"

# Discovery returns matches, not the whole catalogue: a client that asked to
# search is trying to narrow, and 1866 operations is not narrowing.
MAX_DISCOVER_RESULTS = 25

# A response longer than this is cut, with a note saying so and how to ask for
# less. An unbounded list endpoint used to land whole in the model's context —
# a sprint's tasks, every ticket — and the routine that needed it drowned.
MAX_RESPONSE_CHARS = 32_000


def _capability_name(value: Any) -> str | None:
    """`service_desk` and `mcp.service_desk` name the same capability."""
    if not value or not isinstance(value, str):
        return None
    value = value.strip()
    return value if value.startswith("mcp.") else f"mcp.{value}"


def _spread(flat: dict[str, Any], mapping: dict[str, str]) -> dict[str, Any]:
    """Turn a named tool's flat arguments into the generic call shape.

    `{"workspace_id": …, "markdown": …}` becomes
    `{"path_params": {...}, "body": {...}}`. Unmapped keys are dropped rather
    than guessed into the body: silently forwarding an unknown field would
    make a typo look like it worked.
    """
    out: dict[str, Any] = {"path_params": {}, "query": {}, "body": {}}
    fields: Any = None
    for key, value in flat.items():
        target = mapping.get(key)
        if target is None or value is None:
            continue
        if target == "fields":
            fields = value
            continue
        out["path_params" if target == "path" else target][key] = value
    spread = {section: values for section, values in out.items() if values}
    if fields:
        spread["fields"] = fields
    return spread


@dataclass(frozen=True)
class ToolResult:
    content: str
    is_error: bool = False


def redact(value: Any) -> Any:
    """A copy of `value` with secret-looking keys masked, at any depth."""
    if isinstance(value, dict):
        return {
            k: ("***" if _SECRET_KEY.search(str(k)) else redact(v))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [redact(v) for v in value]
    return value


class McpToolExecutor:
    def __init__(
        self,
        app,
        catalog: dict[str, Any],
        granted: set[str],
        db=None,
        *,
        review_policy: bool = True,
        actor_kind: str = "mcp",
        principal_id: str | None = None,
    ):
        self._app = app
        self._catalog = catalog
        self._granted = granted
        self._principal_id = principal_id
        # Optional so the executor stays constructible in tests and scripts.
        # Without a session there is no policy evaluation and no ledger — which
        # is the pre-governance behaviour, and is why the transport always
        # passes one.
        self._db = db
        # Off for the replay of an approved action: policy already ran, and a
        # second evaluation would queue the approved call behind itself
        # forever. The ledger still records the replay.
        self._review_policy = review_policy
        self._actor_kind = actor_kind

    async def call(
        self,
        *,
        tool_name: str,
        arguments: dict[str, Any],
        developer_id: str,
        workspace_id: str,
        pending_action_id: str | None = None,
    ) -> ToolResult:
        if tool_name == DISCOVER_TOOL:
            return self._discover(
                arguments.get("query", ""), _capability_name(arguments.get("capability"))
            )

        # Action names are unique within a capability, not across the whole
        # catalogue — `list_records` is both CRM and Tables. Every tool but the
        # generic call knows which capability it speaks for; the generic call
        # may say so with `capability`.
        scope: str | None = None
        workflow = workflow_tool(tool_name)
        if workflow is not None:
            # A named workflow binds one action and takes flat arguments, so
            # the caller does not have to know which of path_params / query /
            # body each value belongs in. That split is an artefact of HTTP,
            # not something an agent should have to reason about.
            action = workflow["action"]
            scope = workflow["capability"]
            if pending_action_id is None:
                arguments = _spread(arguments, workflow["argument_map"])
            # else: a replay from the approval queue. The queue stores what the
            # gate saw, which is the spread shape; spreading it again would map
            # nothing and run the action with no arguments at all.
        elif tool_name == CALL_TOOL:
            action = arguments.get("action")
            scope = _capability_name(arguments.get("capability"))
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
            scope = capability

        if not action:
            return ToolResult("`action` is required.", is_error=True)

        operation = self._find_operation(action, scope)
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
        if self._db is not None and self._review_policy:
            from aexy.services.mcp_governance import McpGovernance

            verdict = await McpGovernance(self._db).review(
                operation=operation,
                arguments=arguments,
                developer_id=developer_id,
                workspace_id=workspace_id,
                tool_name=tool_name,
                granted=self._granted,
                principal_id=self._principal_id,
                actor_kind=self._actor_kind,
            )
            if not verdict.allowed:
                return ToolResult(verdict.message or "Not permitted.", is_error=True)

        return await self._perform(
            operation=operation,
            arguments=arguments,
            developer_id=developer_id,
            workspace_id=workspace_id,
            tool_name=tool_name,
            pending_action_id=pending_action_id,
        )

    # ------------------------------------------------------------------

    def _capability_for_tool(self, tool_name: str) -> str | None:
        for group in self._catalog["capabilities"]:
            if tool_name == f"aexy_{group['capability'].removeprefix('mcp.')}":
                return group["capability"]
        return None

    def _find_operation(self, action: str, capability: str | None = None) -> dict[str, Any] | None:
        """The operation called `action`, within `capability` when given.

        Without a scope the first match wins, granted capabilities first, so
        an ambiguous name from `aexy_call` resolves to something the caller
        can actually use rather than to whichever capability sorts first.
        """
        groups = self._catalog["capabilities"]
        if capability:
            groups = [g for g in groups if g["capability"] == capability]
        else:
            groups = sorted(groups, key=lambda g: g["capability"] not in self._granted)
        for group in groups:
            for op in group["operations"]:
                if op["action"] == action:
                    return {**op, "_capability": group["capability"]}
        return None

    def _discover(self, query: str, capability: str | None) -> ToolResult:
        capability = _capability_name(capability)
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
                    match = {
                        "action": op["action"],
                        "capability": group["capability"],
                        "method": op["method"],
                        "path": op["path"],
                        "summary": op["summary"],
                        "mutating": op["mutating"],
                    }
                    # What to send, when the catalogue was built with schemas.
                    # This is the part the model used to guess at.
                    if op.get("parameters"):
                        match["parameters"] = op["parameters"]
                    if op.get("request_body"):
                        match["request_body"] = op["request_body"]
                    matches.append(match)

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
        tool_name: str = "",
        pending_action_id: str | None = None,
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
        # Some endpoints — compliance reports, for one — take the workspace as
        # a query parameter instead. The grant fills that in as well, so a
        # routine never has to ask the model for an id it should not know.
        if any(
            p.get("name") == "workspace_id" and p.get("in") == "query"
            for p in operation.get("parameters", [])
        ):
            query = dict(arguments.get("query") or {})
            query["workspace_id"] = workspace_id
            arguments = {**arguments, "query": query}

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

        started = time.monotonic()
        try:
            response = await self._send(operation, path, arguments, headers)
        except httpx.TimeoutException:
            await self._record(
                operation=operation,
                arguments=arguments,
                developer_id=developer_id,
                workspace_id=workspace_id,
                tool_name=tool_name,
                resolved_path=path,
                status_code=None,
                is_error=True,
                duration_ms=int((time.monotonic() - started) * 1000),
                pending_action_id=pending_action_id,
            )
            return ToolResult(
                f"`{operation['action']}` did not respond within "
                f"{int(REQUEST_TIMEOUT_SECONDS)}s.",
                is_error=True,
            )

        await self._record(
            operation=operation,
            arguments=arguments,
            developer_id=developer_id,
            workspace_id=workspace_id,
            tool_name=tool_name,
            resolved_path=path,
            status_code=response.status_code,
            is_error=not response.is_success,
            duration_ms=int((time.monotonic() - started) * 1000),
            pending_action_id=pending_action_id,
        )
        return _render(response, operation, fields=arguments.get("fields"))

    async def _send(
        self,
        operation: dict[str, Any],
        path: str,
        arguments: dict[str, Any],
        headers: dict[str, str],
    ) -> httpx.Response:
        """The HTTP re-entry itself, separated so tests can stand in for it."""
        transport = httpx.ASGITransport(app=self._app)
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://mcp.internal",
            timeout=REQUEST_TIMEOUT_SECONDS,
        ) as client:
            return await client.request(
                operation["method"],
                path,
                params=arguments.get("query") or None,
                json=arguments.get("body") if arguments.get("body") else None,
                headers=headers,
            )

    async def _record(
        self,
        *,
        operation: dict[str, Any],
        arguments: dict[str, Any],
        developer_id: str,
        workspace_id: str,
        tool_name: str,
        resolved_path: str,
        status_code: int | None,
        is_error: bool,
        duration_ms: int,
        pending_action_id: str | None,
    ) -> None:
        """Write the call to the agent action ledger.

        Mutating operations only — a read changes nothing and the volume would
        bury the writes. Best effort: a ledger that cannot be written must not
        turn a completed call into an error the agent then retries.
        """
        if self._db is None or not operation.get("mutating"):
            return
        try:
            from aexy.models.agent_action_log import AgentActionLog

            self._db.add(
                AgentActionLog(
                    id=str(uuid4()),
                    workspace_id=workspace_id,
                    actor_kind=self._actor_kind,
                    actor_developer_id=developer_id,
                    principal_id=self._principal_id,
                    tool_name=tool_name or operation["action"],
                    action=operation["action"],
                    capability=operation.get("_capability"),
                    method=str(operation["method"]).upper(),
                    path=operation["path"],
                    resolved_path=resolved_path[:1000],
                    arguments=redact(arguments),
                    status_code=status_code,
                    is_error=is_error,
                    duration_ms=duration_ms,
                    pending_action_id=pending_action_id,
                )
            )
            await self._db.flush()
        except Exception:
            logger.exception(
                "Could not record agent action %s in workspace %s",
                operation.get("action"),
                workspace_id,
            )


def _project(body: Any, fields: list[str]) -> Any:
    """Keep only `fields` of each object in the response.

    Lists are projected item by item. A paginated envelope (`items`,
    `results`, `data`, `records`) keeps its envelope and projects the list
    inside. Anything else is returned as it was.
    """
    keep = [f for f in fields if isinstance(f, str)]
    if not keep:
        return body

    def pick(obj: Any) -> Any:
        return {k: v for k, v in obj.items() if k in keep} if isinstance(obj, dict) else obj

    if isinstance(body, list):
        return [pick(item) for item in body]
    if isinstance(body, dict):
        for envelope in ("items", "results", "data", "records", "tickets", "tasks"):
            inner = body.get(envelope)
            if isinstance(inner, list):
                return {**body, envelope: [pick(item) for item in inner]}
        return pick(body)
    return body


def _cap(rendered: str, operation: dict[str, Any]) -> str:
    if len(rendered) <= MAX_RESPONSE_CHARS:
        return rendered
    accepts = [p["name"] for p in operation.get("parameters", []) if p.get("in") == "query"]
    hint = ""
    if accepts:
        hint = f" This operation accepts query parameters: {', '.join(accepts[:8])}."
    return (
        rendered[:MAX_RESPONSE_CHARS]
        + f"\n\n[Truncated: showing {MAX_RESPONSE_CHARS:,} of {len(rendered):,} characters. "
        f"Narrow the request (limit, offset, filters) or pass `fields` to keep only the "
        f"keys you need.{hint}]"
    )


def _render(
    response: httpx.Response, operation: dict[str, Any], fields: list[str] | None = None
) -> ToolResult:
    try:
        body = response.json()
        if fields and response.is_success:
            body = _project(body, fields)
        rendered = json.dumps(body, indent=2, default=str)
    except ValueError:
        rendered = response.text

    if response.is_success:
        return ToolResult(_cap(rendered, operation) or f"{response.status_code} (no content)")

    # Report the API's own refusal verbatim. Rewriting it would hide the real
    # reason — "you do not have the CRM app" reads very differently from a
    # generic failure, and the model relays it to a person who can act on it.
    return ToolResult(
        f"{operation['method']} {operation['path']} failed with "
        f"{response.status_code}:\n{rendered}",
        is_error=True,
    )
