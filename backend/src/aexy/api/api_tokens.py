"""API Token management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import AGENT_ACTOR, get_current_developer_id
from aexy.core.database import get_db
from aexy.schemas.api_token import (
    ApiTokenCreate,
    ApiTokenCreatedResponse,
    ApiTokenResponse,
)
from aexy.services.api_token_service import ApiTokenService

router = APIRouter(prefix="/developers/me/api-tokens")


@router.post("", response_model=ApiTokenCreatedResponse, status_code=201)
async def create_api_token(
    request: Request,
    data: ApiTokenCreate,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a new API token. The full token is returned only once."""
    # A principal's token, or any call made as an agent, must not be able to
    # mint a plain personal token: that token would carry no principal, so it
    # would shed the agent marker, the capability scope and the rotation that
    # the principal's own tokens are subject to.
    if getattr(request.state, "token_actor", None) == AGENT_ACTOR:
        raise HTTPException(status_code=403, detail="Agents cannot create API tokens")
    from aexy.models.developer import Developer

    developer = await db.get(Developer, developer_id)
    if developer is not None and developer.account_type == "agent":
        raise HTTPException(status_code=403, detail="Agents cannot create API tokens")
    service = ApiTokenService(db)
    token_model, raw_token = await service.create(developer_id, data)
    base = ApiTokenResponse.model_validate(token_model)
    return ApiTokenCreatedResponse(**base.model_dump(), token=raw_token)


@router.get("", response_model=list[ApiTokenResponse])
async def list_api_tokens(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
):
    """List all API tokens for the current developer (prefix only)."""
    service = ApiTokenService(db)
    tokens = await service.list(developer_id)
    return [ApiTokenResponse.model_validate(t) for t in tokens]


@router.post("/{token_id}/revoke", status_code=204)
async def revoke_api_token(
    token_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
):
    """Revoke an API token (soft-disable, keeps the row for audit)."""
    service = ApiTokenService(db)
    revoked = await service.revoke(developer_id, token_id)
    if not revoked:
        raise HTTPException(status_code=404, detail="Token not found")


@router.delete("/{token_id}", status_code=204)
async def delete_api_token(
    token_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete an API token."""
    service = ApiTokenService(db)
    deleted = await service.delete(developer_id, token_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Token not found")
