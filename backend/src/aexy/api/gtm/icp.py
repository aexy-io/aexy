"""GTM ICP Template API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm import (
    ICPTemplateCreate,
    ICPTemplateUpdate,
    ICPTemplateResponse,
)
from aexy.services.gtm_service import ICPTemplateService

from ._shared import check_workspace_permission

router = APIRouter()


@router.get("/icp-templates", response_model=list[ICPTemplateResponse])
async def list_icp_templates(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List ICP templates."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = ICPTemplateService(db)
    return await service.list_templates(workspace_id)


@router.post("/icp-templates", response_model=ICPTemplateResponse, status_code=201)
async def create_icp_template(
    workspace_id: str,
    data: ICPTemplateCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create an ICP template."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = ICPTemplateService(db)
    template = await service.create_template(
        workspace_id, data.model_dump(), created_by=str(current_user.id),
    )
    await db.commit()
    return template


@router.get("/icp-templates/{template_id}", response_model=ICPTemplateResponse)
async def get_icp_template(
    workspace_id: str,
    template_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get an ICP template."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = ICPTemplateService(db)
    template = await service.get_template(workspace_id, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="ICP template not found")
    return template


@router.put("/icp-templates/{template_id}", response_model=ICPTemplateResponse)
async def update_icp_template(
    workspace_id: str,
    template_id: str,
    data: ICPTemplateUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update an ICP template."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = ICPTemplateService(db)
    template = await service.update_template(
        workspace_id, template_id, data.model_dump(exclude_unset=True),
    )
    if not template:
        raise HTTPException(status_code=404, detail="ICP template not found")
    await db.commit()
    return template


@router.delete("/icp-templates/{template_id}", status_code=204)
async def delete_icp_template(
    workspace_id: str,
    template_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete an ICP template."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = ICPTemplateService(db)
    deleted = await service.delete_template(workspace_id, template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="ICP template not found")
    await db.commit()
