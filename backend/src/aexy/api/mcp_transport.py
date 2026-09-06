"""The remote MCP endpoint: JSON-RPC 2.0 over Streamable HTTP.

This is what makes ChatGPT possible. It consumes remote MCP servers only — it
cannot launch a local process the way Claude Code and Codex do — so no amount
of stdio configuration was ever going to reach it. A single POST endpoint
speaking JSON-RPC, fronted by OAuth, is the whole gap.

Two properties worth stating because they are easy to erode:

  * **The tool list is filtered, the call is enforced.** `tools/list` returns
    only what this grant can reach, which is ergonomics. `tools/call` re-enters
    the application over ASGI so the endpoint's own permission checks run. A
    client that ignores the list gains nothing.
  * **A session is one workspace.** The grant names it; nothing in the request
    can widen it.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select

from aexy.core.config import settings
from aexy.core.database import get_db
from aexy.models.workspace import WorkspaceMember
from aexy.services.mcp_access_service import McpAccessService
from aexy.services.mcp_catalog import build_catalog, build_tools
from aexy.services.mcp_oauth_service import McpOAuthService, ResolvedGrant
from aexy.services.mcp_prompts import prompts_for, read_resource, render_prompt, resources_for
from aexy.services.mcp_tool_executor import McpToolExecutor

# A personal API token is not bound to a workspace the way an OAuth grant is.
# The bridge (and any direct caller) names one with this header; a developer in
# exactly one workspace may omit it.
WORKSPACE_HEADER = "X-Aexy-Workspace-Id"

router = APIRouter(prefix="/mcp", tags=["mcp"])

# The revision of the MCP spec this speaks. Clients negotiate against it; saying
# nothing, or saying something we do not implement, ends the session.
PROTOCOL_VERSION = "2025-06-18"

# JSON-RPC 2.0 error codes.
PARSE_ERROR = -32700
INVALID_REQUEST = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS = -32602
INTERNAL_ERROR = -32603

_catalog_cache: dict[int, dict] = {}


def _catalog(request: Request) -> dict:
    key = id(request.app)
    if key not in _catalog_cache:
        _catalog_cache[key] = build_catalog(request.app.openapi(), include_schemas=True)
    return _catalog_cache[key]


def _unauthorized() -> JSONResponse:
    """401 that tells the client where to go and get a token.

    RFC 9728: without the `resource_metadata` hint a client has no way to
    discover the authorization server, and simply fails. This header is what
    starts the OAuth dance rather than ending the session.
    """
    resource_metadata = (
        f"{settings.backend_url.rstrip('/')}/.well-known/oauth-protected-resource"
    )
    return JSONResponse(
        status_code=401,
        content={"error": "invalid_token", "error_description": "A valid OAuth access token is required"},
        headers={
            "WWW-Authenticate": (
                f'Bearer realm="mcp", resource_metadata="{resource_metadata}"'
            )
        },
    )


class GrantProblem(Exception):
    """The bearer is valid but the request cannot be served as sent."""

    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


async def _resolve_grant(request: Request, db: AsyncSession) -> ResolvedGrant | None:
    """Who is calling, and for which workspace.

    Three bearers are accepted:

      * an OAuth access token — a remote client that walked the consent flow;
        the grant names the workspace;
      * an agent principal's API token — the principal *is* a workspace
        identity, and its declared capabilities travel with the grant;
      * a person's API token — what the stdio bridge sends. Not bound to a
        workspace, so one is taken from the header, or inferred when the
        person belongs to exactly one.

    Routing a person's token through here rather than at the REST API is the
    whole point: the stdio server used to call endpoints directly with such a
    token, which made every call look like the person at a keyboard and
    skipped governance, the review gate and the ledger.
    """
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()

    if not token.startswith("aexy_"):
        return await McpOAuthService(db).resolve_access_token(token)

    from aexy.services.api_token_service import ApiTokenService

    api_token = await ApiTokenService(db).validate(token)
    if api_token is None:
        return None

    if api_token.principal_id:
        from aexy.services.agent_principal_service import AgentPrincipalService

        principals = AgentPrincipalService(db)
        principal = await principals.get_by_id(api_token.principal_id)
        if principal is None or not principal.is_active:
            return None
        await principals.touch(principal)
        return ResolvedGrant(
            developer_id=principal.developer_id,
            workspace_id=principal.workspace_id,
            client_id="agent-principal",
            scope="mcp",
            grant_id=api_token.id,
            principal_id=principal.id,
            capabilities=frozenset(principal.capabilities or []),
        )

    workspace_id = (request.headers.get(WORKSPACE_HEADER) or "").strip()
    memberships = [
        str(row)
        for row in (
            await db.execute(
                select(WorkspaceMember.workspace_id)
                .where(WorkspaceMember.developer_id == api_token.developer_id)
                .where(WorkspaceMember.status == "active")
            )
        ).scalars().all()
    ]
    if workspace_id:
        if workspace_id not in memberships:
            raise GrantProblem(403, f"You are not a member of workspace {workspace_id}.")
    elif len(memberships) == 1:
        workspace_id = memberships[0]
    else:
        raise GrantProblem(
            400,
            f"This token belongs to a person in {len(memberships)} workspaces. Send the "
            f"{WORKSPACE_HEADER} header (the bridge reads AEXY_WORKSPACE_ID) to say which.",
        )

    return ResolvedGrant(
        developer_id=api_token.developer_id,
        workspace_id=workspace_id,
        client_id="api-token",
        scope="mcp",
        grant_id=api_token.id,
    )


def _result(request_id: Any, payload: dict) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "result": payload}


def _error(request_id: Any, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


@router.post("")
async def mcp_endpoint(request: Request, db: AsyncSession = Depends(get_db)):
    """Single JSON-RPC entry point for the whole protocol."""
    try:
        grant = await _resolve_grant(request, db)
    except GrantProblem as problem:
        return JSONResponse(
            status_code=problem.status_code,
            content={"error": "invalid_request", "error_description": problem.message},
        )
    if grant is None:
        return _unauthorized()

    try:
        message = await request.json()
    except ValueError:
        return JSONResponse(content=_error(None, PARSE_ERROR, "Malformed JSON"))

    # A batch is a list. Notifications inside it produce no reply, so a batch of
    # only notifications correctly yields no response body at all.
    if isinstance(message, list):
        # An empty batch is malformed rather than "nothing to do" — answering 202
        # would tell the client its work was accepted.
        if not message:
            return JSONResponse(content=_error(None, INVALID_REQUEST, "Empty batch"))
        replies = [r for r in [await _dispatch(m, request, db, grant) for m in message] if r]
        return JSONResponse(content=replies) if replies else JSONResponse(status_code=202, content=None)

    reply = await _dispatch(message, request, db, grant)
    if reply is None:
        return JSONResponse(status_code=202, content=None)
    return JSONResponse(content=reply)


async def _dispatch(
    message: Any, request: Request, db: AsyncSession, grant: ResolvedGrant
) -> dict | None:
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
        return _error(None, INVALID_REQUEST, "Expected a JSON-RPC 2.0 message")

    method = message.get("method")
    request_id = message.get("id")
    params = message.get("params") or {}

    # No `id` means a notification: the spec forbids replying at all.
    is_notification = "id" not in message

    if method == "initialize":
        # Honours `is_notification` like every other method: a message with no
        # `id` gets no reply, and answering one with `"id": null` is a response
        # the client never asked for and cannot match to anything.
        if is_notification:
            return None
        return _result(
            request_id,
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {
                    "tools": {"listChanged": False},
                    "prompts": {"listChanged": False},
                    "resources": {"subscribe": False, "listChanged": False},
                },
                "serverInfo": {"name": "aexy", "version": "1.0.0"},
            },
        )

    if method in ("notifications/initialized", "notifications/cancelled"):
        return None

    if method == "ping":
        return None if is_notification else _result(request_id, {})

    if method == "tools/list":
        catalog = _catalog(request)
        granted = await _granted(db, grant, catalog)
        tools = build_tools(catalog, granted)
        return _result(
            request_id,
            {
                "tools": [
                    {
                        "name": tool["name"],
                        "description": tool["description"],
                        "inputSchema": tool["input_schema"],
                    }
                    for tool in tools
                ]
            },
        )

    if method == "prompts/list":
        catalog = _catalog(request)
        granted = await _granted(db, grant, catalog)
        return _result(request_id, {"prompts": prompts_for(granted)})

    if method == "prompts/get":
        name = params.get("name")
        if not name:
            return _error(request_id, INVALID_PARAMS, "params.name is required")
        catalog = _catalog(request)
        granted = await _granted(db, grant, catalog)
        rendered = render_prompt(name, params.get("arguments"), granted)
        if rendered is None:
            return _error(request_id, INVALID_PARAMS, f"Unknown prompt: {name}")
        return _result(request_id, rendered)

    if method == "resources/list":
        catalog = _catalog(request)
        granted = await _granted(db, grant, catalog)
        return _result(request_id, {"resources": resources_for(catalog, granted)})

    if method == "resources/read":
        uri = params.get("uri")
        if not uri:
            return _error(request_id, INVALID_PARAMS, "params.uri is required")
        catalog = _catalog(request)
        granted = await _granted(db, grant, catalog)
        content = read_resource(uri, catalog, granted, grant.workspace_id)
        if content is None:
            return _error(request_id, INVALID_PARAMS, f"Unknown resource: {uri}")
        return _result(request_id, {"contents": [content]})

    if method == "tools/call":
        name = params.get("name")
        if not name:
            return _error(request_id, INVALID_PARAMS, "params.name is required")

        catalog = _catalog(request)
        granted = await _granted(db, grant, catalog)
        executor = McpToolExecutor(
            request.app,
            catalog,
            granted,
            db=db,
            principal_id=grant.principal_id,
            actor_kind="principal" if grant.principal_id else "mcp",
        )
        outcome = await executor.call(
            tool_name=name,
            arguments=params.get("arguments") or {},
            developer_id=grant.developer_id,
            workspace_id=grant.workspace_id,
        )
        # A failed tool call is a *result* with isError, not a JSON-RPC error.
        # JSON-RPC errors mean the protocol broke; a 403 from an endpoint is a
        # perfectly well-formed answer the model needs to read and act on.
        return _result(
            request_id,
            {
                "content": [{"type": "text", "text": outcome.content}],
                "isError": outcome.is_error,
            },
        )

    if is_notification:
        return None
    return _error(request_id, METHOD_NOT_FOUND, f"Unknown method: {method}")


async def _granted(db: AsyncSession, grant: ResolvedGrant, catalog: dict) -> set[str]:
    """Resolve capabilities live, per request, rather than freezing them into the token.

    Access changes — an admin revokes an app, someone moves department — and a
    grant issued last week must not still open doors that were closed since.
    """
    held = await McpAccessService(db).get_granted_capabilities(
        grant.workspace_id, grant.developer_id
    )
    known = {group["capability"] for group in catalog["capabilities"]}
    granted = held & known
    if grant.capabilities is not None:
        # A principal's declared scope. Its member row already mirrors this
        # into app access, so `held` should agree — intersecting anyway means
        # the scope holds even if the mirror is ever stale.
        granted &= set(grant.capabilities)
    return granted
