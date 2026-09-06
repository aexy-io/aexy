"""MCP tool discovery — what this caller can reach, and how to call it.

An MCP client asks this endpoint at session start and registers exactly the
tools it gets back. That is what makes two things true at once:

  * **Every operation is reachable.** ``aexy_discover`` and ``aexy_call`` cover
    all 1866 operations by name; the per-capability tools cover the common path
    without a discovery round-trip. Nothing is stranded behind a tool nobody
    wrote.
  * **Only what the caller may use is offered.** Resolution runs server-side
    against the same app-access model as the web app, so the tool list matches
    the API that will serve the call. A tool the caller cannot use is absent
    rather than disabled — carrying it would still cost selection accuracy on
    every call they do make.

Filtering the list is an ergonomic optimisation, never the gate. Whatever a
client registers, the underlying endpoint still enforces its own permissions, so
a client that ignores this list gains nothing.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace
from aexy.schemas.mcp import McpToolsResponse
from aexy.schemas.mcp_oauth import ConnectorSummary
from aexy.services.mcp_access_service import McpAccessService
from aexy.services.mcp_catalog import build_catalog, build_tools
from aexy.services.mcp_oauth_service import McpOAuthService, OAuthError

router = APIRouter(
    prefix="/workspaces/{workspace_id}/mcp",
    tags=["mcp"],
)

# Connectors are not workspace-scoped the way the tool list is. A person may
# have authorised ChatGPT against two workspaces, and the question this screen
# answers — "what did I connect to my account?" — spans all of them. Hanging it
# off a workspace prefix would show one grant and hide the other, which is the
# failure mode a revocation screen exists to prevent.
connectors_router = APIRouter(prefix="/mcp/connectors", tags=["mcp"])

# The catalogue is derived from the OpenAPI schema, which is fixed for the
# lifetime of the process — but walking 1900 operations per request is not free,
# so it is built once. FastAPI already memoises `app.openapi()` itself; this
# memoises the grouping on top.
_catalog_cache: dict[int, dict] = {}


def _catalog(request: Request) -> dict:
    key = id(request.app)
    if key not in _catalog_cache:
        _catalog_cache[key] = build_catalog(request.app.openapi(), include_schemas=True)
    return _catalog_cache[key]


@router.get("/tools", response_model=McpToolsResponse)
async def list_mcp_tools(
    workspace_id: str,
    request: Request,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List the MCP tools this developer can use in this workspace."""
    catalog = _catalog(request)

    service = McpAccessService(db)
    held = await service.get_granted_capabilities(workspace_id, current_user.id)

    # An app can be granted and still have no API surface — `community` and
    # `dashboard` are apps nobody tagged a router with, so they resolve to
    # capabilities the catalogue never produces. Reporting them as granted would
    # advertise capabilities with no tool behind them, which reads to a client as
    # a broken tool list rather than an app that simply has nothing to call.
    # Intersecting here keeps the report, the tool list and the counts derived
    # from one set instead of two that can disagree.
    known = {g["capability"] for g in catalog["capabilities"]}
    granted = held & known

    tools = build_tools(catalog, granted)

    reachable = 0
    denied = []
    for group in catalog["capabilities"]:
        if group["capability"] in granted:
            reachable += group["operation_count"]
        else:
            denied.append(
                {
                    "capability": group["capability"],
                    "operation_count": group["operation_count"],
                    # Named so an admin reading this knows where to go and grant
                    # it, rather than being told only that it is missing.
                    "reason": (
                        "not_granted_app"
                        if group["app"]
                        else "not_granted_mcp_module"
                    ),
                }
            )

    return {
        "workspace_id": workspace_id,
        "catalog_version": catalog["catalog_version"],
        "granted_capabilities": sorted(granted),
        "denied_capabilities": denied,
        "reachable_operation_count": reachable,
        "total_operation_count": sum(
            g["operation_count"] for g in catalog["capabilities"]
        ),
        "tools": tools,
    }


@connectors_router.get("", response_model=list[ConnectorSummary])
async def list_connectors(
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List every MCP client this developer has authorised."""
    grants = await McpOAuthService(db).list_grants(current_user.id)
    if not grants:
        return []

    # Resolved here rather than in the service because the workspace name is a
    # display concern; the grant itself only ever needs the id.
    result = await db.execute(
        select(Workspace).where(Workspace.id.in_({g.workspace_id for g in grants}))
    )
    names = {w.id: w.name for w in result.scalars().all()}

    return [
        ConnectorSummary(
            grant_id=g.grant_id,
            client_id=g.client_id,
            client_name=g.client_name,
            client_uri=g.client_uri,
            logo_uri=g.logo_uri,
            workspace_id=g.workspace_id,
            workspace_name=names.get(g.workspace_id),
            scope=g.scope,
            authorized_at=g.authorized_at,
            last_used_at=g.last_used_at,
            expires_at=g.expires_at,
            is_active=g.is_active,
        )
        for g in grants
    ]


@connectors_router.delete("/{grant_id}", status_code=204)
async def revoke_connector(
    grant_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a connector, killing every token on the grant at once.

    The client is not notified. It discovers this on its next call, which fails
    with a 401 pointing back at the discovery document — so a client that wants
    back in has to walk the consent flow again rather than silently refreshing.
    """
    try:
        await McpOAuthService(db).revoke_grant_for_developer(current_user.id, grant_id)
    except OAuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.description)
