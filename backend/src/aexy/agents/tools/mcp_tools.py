"""The MCP catalogue as LangChain tools — one substrate for every agent.

Three tool registries used to exist: the MCP catalogue (every API operation),
a hand-written LangGraph registry (18 tools for CRM, email and documents), and
Ask's five built-in reads. An in-platform agent could not touch the service
desk, sprints or leave because nobody had written a tool for them, while the
MCP surface reached all of it. The other two are gone: the catalogue is the
registry, and the few tools that had no API behind them (email, Slack, SMS)
became endpoints under `crm/outreach` so they could join it.

This module lets an agent running inside the platform call any catalogue
operation through the same `McpToolExecutor` the remote transport uses. So the
same things hold for every agent, wherever it runs:

  * the endpoint enforces its own permissions on re-entry;
  * workspace policies are evaluated before a write, and a held call waits in
    /review;
  * every write lands in the ledger, under the actor that made it.

Three tools are offered. `aexy_discover` and `aexy_call` reach everything the
actor may reach. `McpActionTool` binds one named action with its own description,
for agents whose configuration names the operations they use — a model picks
better from `update_ticket` than from `aexy_call` with a 240-entry enum.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Type

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.services.mcp_catalog import CALL_TOOL, DISCOVER_TOOL, build_catalog, workflow_tool
from aexy.services.mcp_tool_executor import McpToolExecutor, ToolResult

logger = logging.getLogger(__name__)

_catalog_cache: dict[str, Any] | None = None


def _app():
    # Lazy: `aexy.main` imports every router, which imports services, some of
    # which import this package. Resolving at call time keeps the module
    # importable from anywhere, including the Temporal worker.
    from aexy.main import app

    return app


def catalog() -> dict[str, Any]:
    global _catalog_cache
    if _catalog_cache is None:
        _catalog_cache = build_catalog(_app().openapi(), include_schemas=True)
    return _catalog_cache


def find_operation(
    action: str,
    capability: str | None = None,
    granted: set[str] | None = None,
) -> tuple[dict[str, Any], str] | None:
    """The operation called `action`, within `capability` when given.

    Action names are unique within a capability, not across the catalogue —
    `list_records` is CRM and Tables, and `get_bus_factor` is a read in one
    capability and a write in another — so an unscoped lookup is a guess.

    Pass `granted` and it becomes the *same* guess `McpToolExecutor.
    _find_operation` makes: granted capabilities first, in catalogue order
    within each half. That the two agreed was already load-bearing and was
    never enforced. When they disagreed, the read-only gate below inspected
    one operation while the executor ran another — `get_bus_factor` is a GET
    in `mcp.insights` and a POST in `mcp.platform`, so an actor holding only
    `mcp.platform` was cleared on the read and ran the write. `build_tools`
    had the mirror failure: it resolved `get_document` to `mcp.compliance`,
    found that ungranted, and dropped a tool the actor could reach through
    `mcp.docs`.
    """
    if capability and not capability.startswith("mcp."):
        capability = f"mcp.{capability}"
    groups = catalog()["capabilities"]
    if capability:
        groups = [g for g in groups if g["capability"] == capability]
    elif granted is not None:
        groups = sorted(groups, key=lambda g: g["capability"] not in granted)
    for group in groups:
        for op in group["operations"]:
            if op["action"] == action:
                return op, group["capability"]
    return None


def is_catalog_tool_name(name: str) -> bool:
    """Whether `name` is something this module can build a tool for.

    The four shapes `build_tools` accepts, in the order it tries them. The
    named routines belong here as much as the rest: `aexy_crm_records` and
    `aexy_docs_propose` are what the tool migration rewrites two legacy names
    to, and this said they were unbindable.
    """
    if name in (DISCOVER_TOOL, CALL_TOOL):
        return True
    if workflow_tool(name) is not None:
        return True
    if capability_group(name) is not None:
        return True
    return find_operation(name) is not None


def catalog_tool_listing() -> list[dict[str, Any]]:
    """The catalogue as picker entries: the two generic tools, the named
    routines, and one per capability. Individual actions are not listed —
    ~1,900 checkboxes is not a picker — but any action name typed into an
    agent's tool list still works."""
    listing = [
        {
            "name": DISCOVER_TOOL,
            "description": "Search every Aexy API operation the agent may reach, by free text.",
            "category": "catalogue",
        },
        {
            "name": CALL_TOOL,
            "description": "Call any Aexy API operation by action name. Governed; writes may be held for approval.",
            "category": "catalogue",
        },
    ]
    from aexy.services.mcp_catalog import WORKFLOW_TOOLS

    for routine in WORKFLOW_TOOLS:
        listing.append(
            {
                "name": routine["name"],
                "description": routine["description"],
                "category": "routines",
                "capability": routine["capability"],
            }
        )
    for group in catalog()["capabilities"]:
        key = group["capability"].removeprefix("mcp.")
        writes = sum(1 for op in group["operations"] if op["mutating"])
        listing.append(
            {
                "name": f"aexy_{key}",
                "description": (
                    f"{group['operation_count']} {key.replace('_', ' ')} operations "
                    f"({writes} write). Requires the {group['app'] or key} grant."
                ),
                "category": "catalogue",
            }
        )
    return listing


class McpToolContext:
    """Who the tools act as, and against which workspace."""

    def __init__(
        self,
        db: AsyncSession,
        *,
        workspace_id: str,
        developer_id: str,
        granted: set[str],
        principal_id: str | None = None,
        actor_kind: str = "agent",
        allow_writes: bool = True,
    ):
        self.db = db
        self.workspace_id = workspace_id
        self.developer_id = developer_id
        self.granted = granted
        self.principal_id = principal_id
        self.actor_kind = actor_kind
        self.allow_writes = allow_writes

    def executor(self) -> McpToolExecutor:
        return McpToolExecutor(
            _app(),
            catalog(),
            self.granted,
            db=self.db,
            principal_id=self.principal_id,
            actor_kind=self.actor_kind,
        )

    async def call(self, tool_name: str, arguments: dict[str, Any]) -> ToolResult:
        if not self.allow_writes:
            # A routine binds its action; the other tools name it in
            # `arguments`. Both are resolved within their capability, because
            # `get_team_health` is a read in one and a write in another.
            routine = workflow_tool(tool_name)
            if routine is not None:
                action, scope = routine["action"], routine["capability"]
            else:
                action = arguments.get("action")
                group = capability_group(tool_name)
                scope = group["capability"] if group else arguments.get("capability")
            # `granted` so an unscoped name resolves to the operation the
            # executor will actually run, and not to a different one that
            # happens to sort earlier and happens to be a read.
            found = (
                find_operation(action, scope, self.granted) if action else None
            )
            if found is not None and found[0]["mutating"]:
                return ToolResult(
                    f"`{action}` changes data, and this assistant is read-only. "
                    "Ask a person to make the change, or use an agent that may write.",
                    is_error=True,
                )
        return await self.executor().call(
            tool_name=tool_name,
            arguments=arguments,
            developer_id=self.developer_id,
            workspace_id=self.workspace_id,
        )


async def resolve_context(
    db: AsyncSession,
    *,
    workspace_id: str,
    developer_id: str,
    principal_id: str | None = None,
    actor_kind: str = "agent",
    allow_writes: bool = True,
) -> McpToolContext:
    """Resolve what this actor may reach, the same way the transport does."""
    from aexy.services.mcp_access_service import McpAccessService

    held = await McpAccessService(db).get_granted_capabilities(workspace_id, developer_id)
    known = {g["capability"] for g in catalog()["capabilities"]}
    granted = held & known
    if principal_id:
        from aexy.services.agent_principal_service import AgentPrincipalService

        principal = await AgentPrincipalService(db).get_by_id(principal_id)
        if principal is not None:
            granted &= set(principal.capabilities or [])
    return McpToolContext(
        db,
        workspace_id=workspace_id,
        developer_id=developer_id,
        granted=granted,
        principal_id=principal_id,
        actor_kind=actor_kind,
        allow_writes=allow_writes,
    )


# ---------------------------------------------------------------------------
# LangChain tools
# ---------------------------------------------------------------------------


class _GenericArgs(BaseModel):
    action: str = Field(description="Action name to invoke (find one with aexy_discover).")
    path_params: dict[str, Any] = Field(
        default_factory=dict, description="Values for {braced} path segments. workspace_id is filled in."
    )
    query: dict[str, Any] = Field(default_factory=dict, description="Query string parameters.")
    body: dict[str, Any] = Field(default_factory=dict, description="JSON request body, for writes.")


class _DiscoverArgs(BaseModel):
    query: str = Field(description="Free text matched against action names, paths and summaries.")
    capability: str | None = Field(default=None, description="Restrict to one capability, e.g. mcp.tickets.")


class _ActionArgs(BaseModel):
    path_params: dict[str, Any] = Field(
        default_factory=dict, description="Values for {braced} path segments other than workspace_id."
    )
    query: dict[str, Any] = Field(default_factory=dict, description="Query string parameters.")
    body: dict[str, Any] = Field(default_factory=dict, description="JSON request body, for writes.")


class McpCallTool(BaseTool):
    name: str = CALL_TOOL
    description: str = (
        "Call any Aexy API operation you can reach by its action name. Find names with "
        "aexy_discover. Access is enforced server-side; writes may be held for approval."
    )
    args_schema: Type[BaseModel] = _GenericArgs
    context: Any = None

    def _run(self, **kwargs: Any) -> str:
        raise NotImplementedError("async only")

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.context.call(CALL_TOOL, kwargs)
        return result.content


class McpDiscoverTool(BaseTool):
    name: str = DISCOVER_TOOL
    description: str = (
        "Search the Aexy API operations you can reach. Returns each match's action name, "
        "method, path and summary. Use before calling an operation you have not used."
    )
    args_schema: Type[BaseModel] = _DiscoverArgs
    context: Any = None

    def _run(self, **kwargs: Any) -> str:
        raise NotImplementedError("async only")

    async def _arun(self, query: str, capability: str | None = None) -> str:
        result = await self.context.call(
            DISCOVER_TOOL, {"query": query, "capability": capability}
        )
        return result.content


class McpActionTool(BaseTool):
    """One catalogue action as a named tool."""

    name: str = ""
    description: str = ""
    args_schema: Type[BaseModel] = _ActionArgs
    context: Any = None
    action: str = ""
    capability_tool: str = ""

    def _run(self, **kwargs: Any) -> str:
        raise NotImplementedError("async only")

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.context.call(
            self.capability_tool, {"action": self.action, **kwargs}
        )
        return result.content


_JSON_TYPES: dict[str, Any] = {
    "string": str,
    "boolean": bool,
    "integer": int,
    "number": float,
    "array": list,
    "object": dict,
}


def _args_model(name: str, schema: dict[str, Any]) -> Type[BaseModel]:
    """A pydantic model for a routine's flat input schema.

    Every field is optional at this layer: the executor reports what a
    routine actually needed, in words the model can act on, which beats a
    validation error naming a pydantic type.
    """
    from pydantic import create_model

    fields: dict[str, Any] = {}
    for key, spec in (schema.get("properties") or {}).items():
        py_type = _JSON_TYPES.get(str(spec.get("type")), Any)
        fields[key] = (py_type | None, Field(default=None, description=spec.get("description")))
    return create_model(f"{name}_Args", **fields)  # type: ignore[call-overload]


class McpRoutineTool(BaseTool):
    """A named routine — `aexy_sd_open_tickets` and its kind — as a tool.

    The shipped prompts and schedules name these, so an in-platform agent
    must be able to hold them too, not only a remote MCP client.
    """

    name: str = ""
    description: str = ""
    args_schema: Type[BaseModel] = _GenericArgs
    context: Any = None

    def _run(self, **kwargs: Any) -> str:
        raise NotImplementedError("async only")

    async def _arun(self, **kwargs: Any) -> str:
        arguments = {k: v for k, v in kwargs.items() if v is not None}
        result = await self.context.call(self.name, arguments)
        return result.content


class McpCapabilityTool(BaseTool):
    """One capability's whole surface: `action` is an enum of its operations."""

    name: str = ""
    description: str = ""
    args_schema: Type[BaseModel] = _GenericArgs
    context: Any = None

    def _run(self, **kwargs: Any) -> str:
        raise NotImplementedError("async only")

    async def _arun(self, **kwargs: Any) -> str:
        result = await self.context.call(self.name, kwargs)
        return result.content


def capability_group(tool_name: str) -> dict[str, Any] | None:
    for group in catalog()["capabilities"]:
        if tool_name == f"aexy_{group['capability'].removeprefix('mcp.')}":
            return group
    return None


def build_tools(context: McpToolContext, names: list[str]) -> list[BaseTool]:
    """Tools for the given names; unknown names and ungranted actions are skipped
    with a log line rather than an error, so one stale name does not stop an
    agent from running with the rest."""
    tools: list[BaseTool] = []
    for name in names:
        if name == DISCOVER_TOOL:
            tools.append(McpDiscoverTool(context=context))
            continue
        if name == CALL_TOOL:
            tools.append(McpCallTool(context=context))
            continue
        routine = workflow_tool(name)
        if routine is not None:
            if routine["capability"] not in context.granted:
                logger.info("Skipping %r: capability %s is not granted to this actor", name, routine["capability"])
                continue
            tools.append(
                McpRoutineTool(
                    name=name,
                    description=routine["description"],
                    args_schema=_args_model(name, routine["input_schema"]),
                    context=context,
                )
            )
            continue
        group = capability_group(name)
        if group is not None:
            if group["capability"] not in context.granted:
                logger.info("Skipping %r: capability %s is not granted to this actor", name, group["capability"])
                continue
            actions = ", ".join(op["action"] for op in group["operations"][:40])
            more = "" if len(group["operations"]) <= 40 else f", … ({len(group['operations'])} in all)"
            tools.append(
                McpCapabilityTool(
                    name=name,
                    description=(
                        f"{group['operation_count']} Aexy operations for "
                        f"{group['capability'].removeprefix('mcp.').replace('_', ' ')}. "
                        f"Actions: {actions}{more}."
                    ),
                    context=context,
                )
            )
            continue
        # Granted-first, so a name carried by two capabilities binds to the
        # one this actor holds rather than to whichever sorts first.
        found = find_operation(name, granted=context.granted)
        if found is None:
            logger.warning("Agent names tool %r, which is neither a registry tool nor a catalogue action", name)
            continue
        op, capability = found
        if capability not in context.granted:
            logger.info("Skipping %r: capability %s is not granted to this actor", name, capability)
            continue
        summary = op.get("summary") or ""
        hints = []
        params = [p["name"] for p in op.get("parameters", []) if p["name"] != "workspace_id"]
        if params:
            hints.append("params: " + ", ".join(params[:10]))
        body = op.get("request_body") or {}
        if body:
            hints.append(
                "body: " + ", ".join(
                    f"{k}{'*' if v.get('required') else ''}" for k, v in list(body.items())[:12]
                )
            )
        tools.append(
            McpActionTool(
                name=name,
                description=" ".join(
                    part for part in (f"{op['method']} {op['path']}.", summary, "; ".join(hints)) if part
                ).strip(),
                context=context,
                action=name,
                capability_tool=f"aexy_{capability.removeprefix('mcp.')}",
            )
        )
    return tools


# ---------------------------------------------------------------------------
# Provider-neutral definitions (for Ask and any non-LangChain caller)
# ---------------------------------------------------------------------------


def tool_definitions(context: McpToolContext, *, reads_only: bool = False) -> list[dict[str, Any]]:
    """The surface as `{name, description, input_schema}` records.

    The same shape the MCP transport returns from `tools/list`, filtered to
    reads when asked: an assistant that must not write should not be offered a
    240-entry enum of which half would be refused.
    """
    from aexy.services.mcp_catalog import build_tools as build_surface

    surface = build_surface(catalog(), context.granted)
    if not reads_only:
        return [
            {"name": t["name"], "description": t["description"], "input_schema": t["input_schema"]}
            for t in surface
        ]

    out: list[dict[str, Any]] = []
    for tool in surface:
        if tool["capability"] is None:
            routine = workflow_tool(tool["name"])
            if routine is not None:
                found = find_operation(routine["action"], routine["capability"])
                if found is None or found[0]["mutating"]:
                    # `aexy_sd_park_ticket` takes no `action` argument, so
                    # the gate in `call` would not have caught it either.
                    continue
            out.append(
                {"name": tool["name"], "description": tool["description"], "input_schema": tool["input_schema"]}
            )
            continue
        reads = [a["action"] for a in tool.get("actions", []) if not a["mutating"]]
        if not reads:
            continue
        schema = json.loads(json.dumps(tool["input_schema"]))
        schema["properties"]["action"]["enum"] = reads
        out.append(
            {
                "name": tool["name"],
                "description": tool["description"].split(" (")[0] + f" ({len(reads)} read operations).",
                "input_schema": schema,
            }
        )
    return out


async def attach_to_agent(
    agent: Any,
    db: AsyncSession,
    *,
    workspace_id: str,
    developer_id: str | None,
    principal_id: str | None = None,
) -> list[str]:
    """Give a built agent the catalogue tools its configuration names.

    Only names the agent's own registry does not claim are looked up here, so
    a legacy tool keeps its hand-written implementation. Returns the names
    that were attached. No-op for agents without an actor to run as: a tool
    that acts for nobody cannot be authorised for anything.
    """
    names = list(getattr(agent, "unresolved_tool_names", []) or [])
    if not names:
        return []
    actor = developer_id
    if principal_id:
        from aexy.services.agent_principal_service import AgentPrincipalService

        principal = await AgentPrincipalService(db).get_by_id(principal_id)
        if principal is not None and principal.is_active:
            actor = principal.developer_id
        else:
            logger.warning("Agent names principal %s, which is missing or inactive", principal_id)
            return []
    if not actor:
        logger.info("Agent has catalogue tools %s but no actor to run them as; skipping", names)
        return []

    context = await resolve_context(
        db,
        workspace_id=workspace_id,
        developer_id=actor,
        principal_id=principal_id,
        actor_kind="principal" if principal_id else "agent",
    )
    tools = build_tools(context, names)
    agent.extra_tools = tools
    return [t.name for t in tools]
