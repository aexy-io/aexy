"""Managing the identities agents run as.

Admin-only, and deliberately **not** reachable over MCP: an agent that could
create a principal and mint it a token would be writing its own grant. The
router's tag maps to an excluded capability in `mcp_catalog.py`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.schemas.agent_principal import (
    AgentPrincipalCreate,
    AgentPrincipalResponse,
    AgentPrincipalUpdate,
    PrincipalTokenCreate,
    PrincipalTokenCreatedResponse,
    PrincipalTokenResponse,
)
from aexy.services.agent_principal_service import AgentPrincipalService, PrincipalError
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/agent-principals", tags=["Agent Principals"]
)


async def _require_admin(db: AsyncSession, workspace_id: str, developer_id: str) -> None:
    if not await WorkspaceService(db).check_permission(workspace_id, developer_id, "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace admins can manage agent principals",
        )


async def _load(db: AsyncSession, workspace_id: str, principal_id: str):
    principal = await AgentPrincipalService(db).get(workspace_id, principal_id)
    if principal is None:
        raise HTTPException(status_code=404, detail="Agent principal not found")
    return principal


def _response(principal, active_tokens: int) -> AgentPrincipalResponse:
    base = AgentPrincipalResponse.model_validate(principal)
    return base.model_copy(update={"active_token_count": active_tokens})


@router.get("", response_model=list[AgentPrincipalResponse])
async def list_agent_principals(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    await _require_admin(db, workspace_id, str(current_user.id))
    service = AgentPrincipalService(db)
    counts = await service.active_token_counts(workspace_id)
    return [_response(p, counts.get(str(p.id), 0)) for p in await service.list(workspace_id)]


async def _grantable(db: AsyncSession, workspace_id: str, admin_id: str) -> set[str]:
    """What this workspace holds, as seen by the admin doing the granting.

    An admin reaches every app the workspace has enabled, so their own MCP
    grant is the workspace's surface; a principal cannot be given more.
    """
    from aexy.services.mcp_access_service import McpAccessService

    return await McpAccessService(db).get_granted_capabilities(workspace_id, admin_id)


@router.post("", response_model=AgentPrincipalResponse, status_code=201)
async def create_agent_principal(
    workspace_id: str,
    data: AgentPrincipalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    await _require_admin(db, workspace_id, str(current_user.id))
    try:
        principal = await AgentPrincipalService(db).create(
            workspace_id=workspace_id,
            name=data.name,
            description=data.description,
            capabilities=data.capabilities,
            created_by_id=str(current_user.id),
            grantable=await _grantable(db, workspace_id, str(current_user.id)),
        )
    except PrincipalError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return _response(principal, 0)


@router.patch("/{principal_id}", response_model=AgentPrincipalResponse)
async def update_agent_principal(
    workspace_id: str,
    principal_id: str,
    data: AgentPrincipalUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    await _require_admin(db, workspace_id, str(current_user.id))
    principal = await _load(db, workspace_id, principal_id)
    service = AgentPrincipalService(db)
    try:
        principal = await service.update(
            principal,
            name=data.name,
            description=data.description,
            capabilities=data.capabilities,
            is_active=data.is_active,
            grantable=(
                await _grantable(db, workspace_id, str(current_user.id))
                if data.capabilities is not None
                else None
            ),
        )
    except PrincipalError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    counts = await service.active_token_counts(workspace_id)
    return _response(principal, counts.get(str(principal.id), 0))


@router.delete("/{principal_id}", status_code=204)
async def remove_agent_principal(
    workspace_id: str,
    principal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Deactivate, revoke every token, and detach from the workspace.

    Rows stay: the ledger and the review queue point at them, and an audit
    that cannot name the agent that acted is not an audit.
    """
    await _require_admin(db, workspace_id, str(current_user.id))
    principal = await _load(db, workspace_id, principal_id)
    await AgentPrincipalService(db).remove(principal)


@router.get("/{principal_id}/tokens", response_model=list[PrincipalTokenResponse])
async def list_principal_tokens(
    workspace_id: str,
    principal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    await _require_admin(db, workspace_id, str(current_user.id))
    principal = await _load(db, workspace_id, principal_id)
    tokens = await AgentPrincipalService(db).list_tokens(str(principal.id))
    return [PrincipalTokenResponse.model_validate(t) for t in tokens]


@router.post(
    "/{principal_id}/tokens",
    response_model=PrincipalTokenCreatedResponse,
    status_code=201,
)
async def rotate_principal_token(
    workspace_id: str,
    principal_id: str,
    data: PrincipalTokenCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Issue a new token and revoke every earlier one. Shown once."""
    await _require_admin(db, workspace_id, str(current_user.id))
    principal = await _load(db, workspace_id, principal_id)
    try:
        token, raw = await AgentPrincipalService(db).rotate_token(
            principal, name=data.name, expires_in_days=data.expires_in_days
        )
    except PrincipalError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    base = PrincipalTokenResponse.model_validate(token)
    return PrincipalTokenCreatedResponse(**base.model_dump(), token=raw)
