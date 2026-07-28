"""Workspace secrets: names in, values never out.

There is no endpoint that returns a secret value. Not for members, not for
admins, not for the creator. A credential readable through the API is readable
by everyone who can reach the API, which is the whole reason webhook headers
needed fixing in the first place.

Rotation is an overwrite: POST the same name with a new value.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.services.workspace_secret_service import WorkspaceSecretService
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}/secrets", tags=["secrets"])


class SecretUpsert(BaseModel):
    name: str = Field(..., max_length=120)
    value: str = Field(..., min_length=1)
    description: str | None = None


class SecretSummary(BaseModel):
    """Everything about a secret except the one thing that matters."""

    name: str
    description: str | None
    last_used_at: str | None
    created_at: str


async def _require_admin(
    db: AsyncSession, workspace_id: str, developer_id: str
) -> None:
    if not await WorkspaceService(db).check_permission(
        workspace_id, developer_id, "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Managing workspace secrets requires an admin",
        )


@router.get("", response_model=list[SecretSummary])
async def list_secrets(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List secret names so the builder can offer them. No values."""
    await _require_admin(db, workspace_id, current_user.id)
    return [
        SecretSummary(
            name=s.name,
            description=s.description,
            last_used_at=s.last_used_at.isoformat() if s.last_used_at else None,
            created_at=s.created_at.isoformat(),
        )
        for s in await WorkspaceSecretService(db).list_names(workspace_id)
    ]


@router.post("", response_model=SecretSummary, status_code=201)
async def upsert_secret(
    workspace_id: str,
    data: SecretUpsert,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a secret, or replace the value of one that exists."""
    await _require_admin(db, workspace_id, current_user.id)
    try:
        secret = await WorkspaceSecretService(db).upsert(
            workspace_id,
            data.name,
            data.value,
            description=data.description,
            created_by_id=current_user.id,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return SecretSummary(
        name=secret.name,
        description=secret.description,
        last_used_at=(
            secret.last_used_at.isoformat() if secret.last_used_at else None
        ),
        created_at=secret.created_at.isoformat() if secret.created_at else "",
    )


@router.delete("/{name}", status_code=204)
async def delete_secret(
    workspace_id: str,
    name: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Remove a secret. Any step still referencing it fails loudly on its next run."""
    await _require_admin(db, workspace_id, current_user.id)
    if not await WorkspaceSecretService(db).delete(workspace_id, name):
        raise HTTPException(status_code=404, detail="Secret not found")
