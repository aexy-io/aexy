"""API Token management endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer_id
from aexy.core.database import get_db
from aexy.schemas.api_token import (
    ApiTokenCreate,
    ApiTokenCreatedResponse,
    ApiTokenResponse,
)
from aexy.services.api_token_service import ApiTokenService

router = APIRouter(prefix="/developers/me/api-tokens")


@router.post("/", response_model=ApiTokenCreatedResponse, status_code=201)
async def create_api_token(
    data: ApiTokenCreate,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
):
    """Create a new API token. The full token is returned only once."""
    service = ApiTokenService(db)
    token_model, raw_token = await service.create(developer_id, data)
    base = ApiTokenResponse.model_validate(token_model)
    return ApiTokenCreatedResponse(**base.model_dump(), token=raw_token)


@router.get("/", response_model=list[ApiTokenResponse])
async def list_api_tokens(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
):
    """List all API tokens for the current developer (prefix only)."""
    service = ApiTokenService(db)
    tokens = await service.list(developer_id)
    return [ApiTokenResponse.model_validate(t) for t in tokens]


@router.delete("/{token_id}", status_code=204)
async def delete_api_token(
    token_id: str,
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
):
    """Revoke and delete an API token."""
    service = ApiTokenService(db)
    deleted = await service.delete(developer_id, token_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Token not found")
