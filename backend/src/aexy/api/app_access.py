"""App Access API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.models.plan import PlanTier
from aexy.models.app_definitions import APP_CATALOG, SYSTEM_APP_BUNDLES, get_app_list
from aexy.schemas.app_access import (
    AppAccessTemplateCreate,
    AppAccessTemplateUpdate,
    AppAccessTemplateResponse,
    AppAccessTemplateListResponse,
    AppAccessTemplatesListWrapper,
    MemberAppAccessUpdate,
    ApplyTemplateRequest,
    BulkApplyTemplateRequest,
    BulkApplyTemplateResponse,
    EffectiveAccessResponse,
    AppAccessInfo,
    AccessMatrixResponse,
    MemberAccessMatrixEntry,
    AppCatalogResponse,
    AppInfo,
    ModuleInfo,
    SystemBundlesResponse,
    SystemBundleInfo,
    AccessCheckRequest,
    AccessCheckResponse,
)
from aexy.services.workspace_service import WorkspaceService
from aexy.services.app_access_service import AppAccessService

router = APIRouter(prefix="/workspaces/{workspace_id}/app-access", tags=["App Access"])


def template_to_response(template) -> AppAccessTemplateResponse:
    """Convert AppAccessTemplate model to response schema."""
    return AppAccessTemplateResponse(
        id=str(template.id),
        workspace_id=str(template.workspace_id) if template.workspace_id else None,
        name=template.name,
        slug=template.slug,
        description=template.description,
        icon=template.icon,
        color=template.color,
        app_config=template.app_config,
        is_system=template.is_system,
        is_active=template.is_active,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def template_to_list_response(template) -> AppAccessTemplateListResponse:
    """Convert AppAccessTemplate model to list response schema."""
    return AppAccessTemplateListResponse(
        id=str(template.id),
        workspace_id=str(template.workspace_id) if template.workspace_id else None,
        name=template.name,
        slug=template.slug,
        description=template.description,
        icon=template.icon,
        color=template.color,
        app_config=template.app_config,
        is_system=template.is_system,
        is_active=template.is_active,
    )


# Reference Data Endpoints
@router.get("/catalog", response_model=AppCatalogResponse)
async def get_app_catalog(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get the app catalog with all available apps and modules."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    apps = []
    for app_id, config in APP_CATALOG.items():
        modules = [
            ModuleInfo(
                id=mod_id,
                name=mod_config["name"],
                description=mod_config["description"],
                route=mod_config["route"],
            )
            for mod_id, mod_config in config.get("modules", {}).items()
        ]
        apps.append(
            AppInfo(
                id=app_id,
                name=config["name"],
                description=config["description"],
                icon=config["icon"],
                category=config["category"].value,
                base_route=config["base_route"],
                required_permission=config.get("required_permission"),
                modules=modules,
            )
        )

    return AppCatalogResponse(apps=apps)


@router.get("/bundles", response_model=SystemBundlesResponse)
async def get_system_bundles(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get system app bundles."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    bundles = [
        SystemBundleInfo(
            id=bundle_id,
            name=config["name"],
            description=config["description"],
            icon=config["icon"],
            color=config["color"],
            app_config=config["apps"],
        )
        for bundle_id, config in SYSTEM_APP_BUNDLES.items()
    ]

    return SystemBundlesResponse(bundles=bundles)


# Template Endpoints
@router.get("/templates", response_model=AppAccessTemplatesListWrapper)
async def list_templates(
    workspace_id: str,
    include_system: bool = True,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List available app access templates."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    service = AppAccessService(db)
    templates = await service.list_templates(workspace_id, include_system)

    return AppAccessTemplatesListWrapper(
        templates=[template_to_list_response(t) for t in templates]
    )


@router.post(
    "/templates",
    response_model=AppAccessTemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_template(
    workspace_id: str,
    data: AppAccessTemplateCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a custom app access template."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    service = AppAccessService(db)
    try:
        template = await service.create_template(
            workspace_id=workspace_id,
            name=data.name,
            app_config=data.app_config,
            description=data.description,
            icon=data.icon,
            color=data.color,
        )
        return template_to_response(template)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/templates/{template_id}", response_model=AppAccessTemplateResponse)
async def get_template(
    workspace_id: str,
    template_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific app access template."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    service = AppAccessService(db)
    template = await service.get_template(template_id)

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    # Verify template belongs to this workspace or is system template
    if template.workspace_id and template.workspace_id != workspace_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    return template_to_response(template)


@router.patch("/templates/{template_id}", response_model=AppAccessTemplateResponse)
async def update_template(
    workspace_id: str,
    template_id: str,
    data: AppAccessTemplateUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a custom app access template."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    service = AppAccessService(db)
    try:
        template = await service.update_template(
            template_id=template_id,
            workspace_id=workspace_id,
            **data.model_dump(exclude_unset=True),
        )
        return template_to_response(template)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    workspace_id: str,
    template_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a custom app access template."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    service = AppAccessService(db)
    try:
        await service.delete_template(template_id, workspace_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# Member Access Endpoints
@router.get("/members/{developer_id}/effective", response_model=EffectiveAccessResponse)
async def get_member_effective_access(
    workspace_id: str,
    developer_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get effective app access for a specific member."""
    workspace_service = WorkspaceService(db)

    # Users can view their own access; admins can view anyone's
    is_self = str(current_user.id) == developer_id
    is_admin = await workspace_service.check_permission(
        workspace_id, str(current_user.id), "admin"
    )

    if not is_self and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )

    service = AppAccessService(db)
    access = await service.get_effective_access(workspace_id, developer_id)

    # Convert to response format
    apps = {
        app_id: AppAccessInfo(
            app_id=app_id,
            enabled=app_access["enabled"],
            modules=app_access["modules"],
        )
        for app_id, app_access in access["apps"].items()
    }

    return EffectiveAccessResponse(
        apps=apps,
        applied_template_id=access["applied_template_id"],
        applied_template_name=access["applied_template_name"],
        has_custom_overrides=access["has_custom_overrides"],
        is_admin=access["is_admin"],
    )


@router.patch("/members/{developer_id}")
async def update_member_access(
    workspace_id: str,
    developer_id: str,
    data: MemberAppAccessUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a member's app access configuration."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    service = AppAccessService(db)
    try:
        member = await service.update_member_access(
            workspace_id=workspace_id,
            developer_id=developer_id,
            app_config=data.app_config,
            applied_template_id=data.applied_template_id,
        )
        return {"success": True, "developer_id": developer_id}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/members/{developer_id}/apply-template")
async def apply_template_to_member(
    workspace_id: str,
    developer_id: str,
    data: ApplyTemplateRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Apply an app access template to a member."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    service = AppAccessService(db)
    try:
        member = await service.apply_template_to_member(
            workspace_id=workspace_id,
            developer_id=developer_id,
            template_id=data.template_id,
        )
        return {"success": True, "developer_id": developer_id}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/members/{developer_id}/reset")
async def reset_member_to_defaults(
    workspace_id: str,
    developer_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Reset a member's app access to their role defaults."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    service = AppAccessService(db)
    try:
        member = await service.reset_member_to_role_defaults(
            workspace_id=workspace_id,
            developer_id=developer_id,
        )
        return {"success": True, "developer_id": developer_id}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/members/bulk-apply-template", response_model=BulkApplyTemplateResponse)
async def bulk_apply_template(
    workspace_id: str,
    data: BulkApplyTemplateRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Apply an app access template to multiple members."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    service = AppAccessService(db)
    try:
        members = await service.bulk_apply_template(
            workspace_id=workspace_id,
            developer_ids=data.developer_ids,
            template_id=data.template_id,
        )
        applied_ids = [str(m.developer_id) for m in members]
        return BulkApplyTemplateResponse(
            success_count=len(applied_ids),
            failed_count=len(data.developer_ids) - len(applied_ids),
            applied_developer_ids=applied_ids,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# Access Matrix Endpoint
@router.get("/matrix", response_model=AccessMatrixResponse)
async def get_access_matrix(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get access matrix for all active members."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    service = AppAccessService(db)
    matrix_data = await service.get_access_matrix(workspace_id)

    members = [
        MemberAccessMatrixEntry(
            developer_id=entry["developer_id"],
            developer_name=entry["developer_name"],
            developer_email=entry["developer_email"],
            role_name=entry["role_name"],
            applied_template_id=entry["applied_template_id"],
            applied_template_name=entry["applied_template_name"],
            has_custom_overrides=entry["has_custom_overrides"],
            is_admin=entry["is_admin"],
            apps=entry["apps"],
        )
        for entry in matrix_data
    ]

    # Build apps list for matrix header
    apps = []
    for app_id, config in APP_CATALOG.items():
        modules = [
            ModuleInfo(
                id=mod_id,
                name=mod_config["name"],
                description=mod_config["description"],
                route=mod_config["route"],
            )
            for mod_id, mod_config in config.get("modules", {}).items()
        ]
        apps.append(
            AppInfo(
                id=app_id,
                name=config["name"],
                description=config["description"],
                icon=config["icon"],
                category=config["category"].value,
                base_route=config["base_route"],
                required_permission=config.get("required_permission"),
                modules=modules,
            )
        )

    return AccessMatrixResponse(members=members, apps=apps)


# Access Check Endpoint (for frontend route protection)
@router.post("/check", response_model=AccessCheckResponse)
async def check_access(
    workspace_id: str,
    data: AccessCheckRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Check if current user has access to an app/module."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    service = AppAccessService(db)

    if data.module_id:
        allowed = await service.check_module_access(
            workspace_id=workspace_id,
            developer_id=str(current_user.id),
            app_id=data.app_id,
            module_id=data.module_id,
        )
    else:
        allowed = await service.check_app_access(
            workspace_id=workspace_id,
            developer_id=str(current_user.id),
            app_id=data.app_id,
        )

    reason = None
    if not allowed:
        if data.app_id not in APP_CATALOG:
            reason = "App not found"
        else:
            reason = "Access denied by app access policy"

    return AccessCheckResponse(
        allowed=allowed,
        app_id=data.app_id,
        module_id=data.module_id,
        reason=reason,
    )


# =============================================================================
# Access Logs Endpoints (Enterprise Feature)
# =============================================================================


async def require_enterprise_workspace(
    workspace_id: str,
    developer_id: str,
    db: AsyncSession,
) -> None:
    """Verify workspace has Enterprise subscription and user has admin access."""
    workspace_service = WorkspaceService(db)

    # Check admin permission
    if not await workspace_service.check_permission(
        workspace_id, developer_id, "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    # Get workspace with plan
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from aexy.models.workspace import Workspace

    stmt = select(Workspace).options(selectinload(Workspace.plan)).where(Workspace.id == workspace_id)
    result = await db.execute(stmt)
    workspace = result.scalar_one_or_none()

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    # Check for Enterprise tier
    if not workspace.plan or workspace.plan.tier != PlanTier.ENTERPRISE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Enterprise subscription required for access logs",
        )


@router.get("/logs")
async def get_access_logs(
    workspace_id: str,
    request: Request,
    action: str | None = Query(None, description="Filter by action type"),
    target_type: str | None = Query(None, description="Filter by target type"),
    target_id: str | None = Query(None, description="Filter by target ID"),
    actor_id: str | None = Query(None, description="Filter by actor ID"),
    limit: int = Query(100, ge=1, le=500, description="Max results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """
    Get access logs for the workspace (Enterprise only).

    Returns audit logs of all app access control changes and events.
    """
    await require_enterprise_workspace(workspace_id, str(current_user.id), db)

    service = AppAccessService(db)
    logs, total_count = await service.get_access_logs(
        workspace_id=workspace_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        actor_id=actor_id,
        limit=limit,
        offset=offset,
    )

    return {
        "logs": [
            {
                "id": str(log.id),
                "workspace_id": str(log.workspace_id),
                "actor_id": str(log.actor_id) if log.actor_id else None,
                "action": log.action,
                "target_type": log.target_type,
                "target_id": str(log.target_id) if log.target_id else None,
                "description": log.description,
                "old_value": log.old_value,
                "new_value": log.new_value,
                "extra_data": log.extra_data,
                "ip_address": log.ip_address,
                "user_agent": log.user_agent,
                "created_at": log.created_at.isoformat(),
            }
            for log in logs
        ],
        "total": total_count,
        "limit": limit,
        "offset": offset,
    }


@router.get("/logs/summary")
async def get_access_logs_summary(
    workspace_id: str,
    days: int = Query(30, ge=1, le=365, description="Number of days to summarize"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """
    Get access logs summary statistics (Enterprise only).

    Returns aggregated statistics about access control events.
    """
    await require_enterprise_workspace(workspace_id, str(current_user.id), db)

    service = AppAccessService(db)
    summary = await service.get_access_log_summary(
        workspace_id=workspace_id,
        days=days,
    )

    return summary
