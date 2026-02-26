"""GTM Provider API endpoints."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.integrations.registry import ProviderRegistry
from aexy.models.developer import Developer
from aexy.schemas.gtm import (
    GTMProviderConfigCreate,
    GTMProviderConfigUpdate,
    GTMProviderConfigResponse,
    GTMProviderTestResult,
    GTMAvailableProvider,
    SetDefaultRequest,
)
from aexy.services.gtm_service import GTMProviderService

from ._shared import check_workspace_permission, _ensure_providers_registered

router = APIRouter()


@router.get("/providers/available", response_model=list[GTMAvailableProvider])
async def list_available_providers(
    workspace_id: str,
    slot: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all available (registered) providers."""
    await check_workspace_permission(workspace_id, current_user, db)

    # Ensure providers are registered
    _ensure_providers_registered()

    providers = ProviderRegistry.list_available(slot=slot)
    return providers


@router.get("/providers", response_model=list[GTMProviderConfigResponse])
async def list_providers(
    workspace_id: str,
    slot: str | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List configured providers for this workspace."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMProviderService(db)
    configs = await service.list_providers(workspace_id, slot=slot)
    return configs


@router.post("/providers", response_model=GTMProviderConfigResponse, status_code=201)
async def create_provider(
    workspace_id: str,
    data: GTMProviderConfigCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Configure a new provider."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")

    _ensure_providers_registered()

    # Normalize provider_name to lowercase for registry lookup
    normalized_name = data.provider_name.lower().replace(" ", "_")

    # Check if provider class exists
    if not ProviderRegistry.get_class(data.slot, normalized_name):
        available = ProviderRegistry.list_available(data.slot)
        names = [p["name"] for p in available]
        hint = f" Available: {', '.join(names)}" if names else ""
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown provider: {data.slot}/{data.provider_name}.{hint}",
        )

    service = GTMProviderService(db)

    # Use the normalized name for storage
    payload = data.model_dump()
    payload["provider_name"] = normalized_name

    # Check for duplicate
    existing = await service.get_provider(workspace_id, data.slot, normalized_name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Provider {normalized_name} already configured for slot {data.slot}",
        )

    config = await service.create_provider(workspace_id, payload)
    await db.commit()
    await db.refresh(config)
    return config


@router.put("/providers/{slot}/{provider_name}", response_model=GTMProviderConfigResponse)
async def update_provider(
    workspace_id: str,
    slot: str,
    provider_name: str,
    data: GTMProviderConfigUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a provider configuration."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = GTMProviderService(db)
    config = await service.update_provider(
        workspace_id, slot, provider_name, data.model_dump(exclude_unset=True),
    )
    if not config:
        raise HTTPException(status_code=404, detail="Provider not found")
    await db.commit()
    return config


@router.delete("/providers/{slot}/{provider_name}", status_code=204)
async def delete_provider(
    workspace_id: str,
    slot: str,
    provider_name: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove a provider configuration."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = GTMProviderService(db)
    deleted = await service.delete_provider(workspace_id, slot, provider_name)
    if not deleted:
        raise HTTPException(status_code=404, detail="Provider not found")
    await db.commit()


@router.post("/providers/{slot}/{provider_name}/test", response_model=GTMProviderTestResult)
async def test_provider(
    workspace_id: str,
    slot: str,
    provider_name: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Test a provider's connection using stored credentials."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")

    _ensure_providers_registered()

    service = GTMProviderService(db)
    result = await service.test_provider(workspace_id, slot, provider_name)
    await db.commit()
    return result


class TestCredentialsRequest(BaseModel):
    provider_name: str
    credentials: dict[str, Any]


@router.post("/providers/{slot}/test-credentials", response_model=GTMProviderTestResult)
async def test_credentials(
    workspace_id: str,
    slot: str,
    data: TestCredentialsRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Test provider credentials without saving them."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")

    _ensure_providers_registered()

    provider_name = data.provider_name.lower().strip()
    klass = ProviderRegistry.get_class(slot, provider_name)
    if not klass:
        available = ProviderRegistry.list_available(slot)
        names = [p["name"] for p in available]
        hint = f" Available: {', '.join(names)}" if names else ""
        return GTMProviderTestResult(
            success=False,
            message=f"Unknown provider '{data.provider_name}' for slot '{slot}'.{hint}",
        )

    missing = klass.validate_credentials(data.credentials)
    if missing:
        return GTMProviderTestResult(
            success=False,
            message=f"Missing required credentials: {', '.join(missing)}",
        )

    provider = klass(credentials=data.credentials)
    result = await provider.test_connection()
    return GTMProviderTestResult(**result)


@router.post("/providers/{slot}/set-default")
async def set_default_provider(
    workspace_id: str,
    slot: str,
    data: SetDefaultRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Set a provider as the default for a slot."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = GTMProviderService(db)
    success = await service.set_default(workspace_id, slot, data.provider_name)
    if not success:
        raise HTTPException(status_code=404, detail="Provider not found")
    await db.commit()
    return {"success": True}
