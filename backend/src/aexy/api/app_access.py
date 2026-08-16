"""App Access API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.models.plan import PlanTier
from aexy.models.app_definitions import (
    APP_CATALOG,
    SUPPORT_CONTACT_EMAIL,
    SYSTEM_APP_BUNDLES,
    get_app_list,
)
from aexy.schemas.app_access import (
    AppAccessTemplateCreate,
    AppAccessTemplateUpdate,
    AppAccessTemplateResponse,
    AppAccessTemplateListResponse,
    AppAccessTemplatesListWrapper,
    MemberAppAccessUpdate,
    MemberAppOverridesUpdate,
    AccessDepartmentInfo,
    AccessPreviewRequest,
    AccessPreviewResponse,
    AccessPreviewApp,
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
    AppAccessRequestCreate,
    AppAccessRequestReview,
    AppAccessRequestResponse,
    AppAccessRequestListResponse,
)
from aexy.services.workspace_service import WorkspaceService
from aexy.services.app_access_service import AppAccessService, AppNotSelfServeError

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


async def _load_template_for_workspace(
    db: AsyncSession,
    template_id,
    workspace_id: str,
):
    """Load a template and 404 unless it belongs to this workspace.

    System templates (workspace_id IS NULL) are accepted from any workspace.
    Returns the loaded row so callers can use it without re-fetching.
    """
    from sqlalchemy import select
    from aexy.models.app_access import AppAccessTemplate

    result = await db.execute(
        select(AppAccessTemplate).where(AppAccessTemplate.id == template_id)
    )
    tpl = result.scalar_one_or_none()
    if not tpl or (tpl.workspace_id and str(tpl.workspace_id) != workspace_id):
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl


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
                route=mod_config.get("route"),
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
    except AppNotSelfServeError as e:
        # 403 rather than 400: the request is well formed, the answer is "not
        # from here". The app ids come back so the UI can point at the right row.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": str(e),
                "app_ids": e.app_ids,
                "contact": SUPPORT_CONTACT_EMAIL,
            },
        )
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
    except AppNotSelfServeError as e:
        # 403 rather than 400: the request is well formed, the answer is "not
        # from here". The app ids come back so the UI can point at the right row.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": str(e),
                "app_ids": e.app_ids,
                "contact": SUPPORT_CONTACT_EMAIL,
            },
        )
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
    except AppNotSelfServeError as e:
        # 403 rather than 400: the request is well formed, the answer is "not
        # from here". The app ids come back so the UI can point at the right row.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": str(e),
                "app_ids": e.app_ids,
                "contact": SUPPORT_CONTACT_EMAIL,
            },
        )
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
            can_access=app_access["can_access"],
            modules=app_access["modules"],
            source=app_access["source"],
            source_detail=app_access["source_detail"],
        )
        for app_id, app_access in access["apps"].items()
    }

    return EffectiveAccessResponse(
        apps=apps,
        applied_template_id=access["applied_template_id"],
        applied_template_name=access["applied_template_name"],
        has_custom_overrides=access["has_custom_overrides"],
        is_admin=access["is_admin"],
        baseline=access["baseline"],
        departments=[
            AccessDepartmentInfo(**department) for department in access["departments"]
        ],
        suggested_persona=access["suggested_persona"],
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

    # WS-053: target developer must be an active member of THIS workspace
    # before we write app-access overrides for them. Without this, an
    # admin of workspace A can create access-config rows pointing at a
    # developer who only exists in workspace B.
    from aexy.core.workspace_auth import assert_active_member
    await assert_active_member(db, workspace_id, developer_id)

    # When applying a template, it must also belong to this workspace
    # (or be a system template — workspace_id is None).
    if data.applied_template_id:
        await _load_template_for_workspace(db, data.applied_template_id, workspace_id)

    service = AppAccessService(db)
    try:
        member = await service.update_member_access(
            workspace_id=workspace_id,
            developer_id=developer_id,
            app_config=data.app_config,
            applied_template_id=data.applied_template_id,
            reasons=data.reasons,
            actor_id=str(current_user.id),
        )
        overrides = (member.app_permissions or {}).get("overrides") or {}
        # Report what was actually stored. A full grid can diff down to nothing
        # — the admin agreed with the department profile — and "0 overrides" is
        # a meaningful, reassuring answer rather than a failure.
        return {
            "success": True,
            "developer_id": developer_id,
            "override_count": len(overrides),
        }
    except AppNotSelfServeError as e:
        # 403 rather than 400: the request is well formed, the answer is "not
        # from here". The app ids come back so the UI can point at the right row.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": str(e),
                "app_ids": e.app_ids,
                "contact": SUPPORT_CONTACT_EMAIL,
            },
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.put("/members/{developer_id}/overrides")
async def set_member_overrides(
    workspace_id: str,
    developer_id: str,
    data: MemberAppOverridesUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Set a member's per-app overrides directly (inherit / grant / revoke).

    The intent-shaped counterpart to PATCH /members/{id}: that one takes a whole
    grid and works out the deltas, this one takes the deltas. An app absent from
    ``overrides`` inherits from the member's department profile.
    """
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    from aexy.core.workspace_auth import assert_active_member
    await assert_active_member(db, workspace_id, developer_id)

    service = AppAccessService(db)
    try:
        member = await service.set_member_overrides(
            workspace_id=workspace_id,
            developer_id=developer_id,
            overrides={
                app_id: override.model_dump(exclude_none=True)
                for app_id, override in data.overrides.items()
            },
            reasons=data.reasons,
            actor_id=str(current_user.id),
        )
    except AppNotSelfServeError as e:
        # 403 rather than 400: the request is well formed, the answer is "not
        # from here". The app ids come back so the UI can point at the right row.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": str(e),
                "app_ids": e.app_ids,
                "contact": SUPPORT_CONTACT_EMAIL,
            },
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    overrides = (member.app_permissions or {}).get("overrides") or {}
    return {
        "success": True,
        "developer_id": developer_id,
        "override_count": len(overrides),
    }


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

    # WS-053: same active-member + template-workspace guards as
    # update_member_access.
    from aexy.core.workspace_auth import assert_active_member
    await assert_active_member(db, workspace_id, developer_id)
    await _load_template_for_workspace(db, data.template_id, workspace_id)

    service = AppAccessService(db)
    try:
        member = await service.apply_template_to_member(
            workspace_id=workspace_id,
            developer_id=developer_id,
            template_id=data.template_id,
            actor_id=str(current_user.id),
        )
        return {"success": True, "developer_id": developer_id}
    except AppNotSelfServeError as e:
        # 403 rather than 400: the request is well formed, the answer is "not
        # from here". The app ids come back so the UI can point at the right row.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": str(e),
                "app_ids": e.app_ids,
                "contact": SUPPORT_CONTACT_EMAIL,
            },
        )
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
    """Drop a member's overrides so they inherit their department profile again.

    (Or their role bundle, if none of their departments carries a profile.)
    """
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
        member = await service.reset_member_to_inherited(
            workspace_id=workspace_id,
            developer_id=developer_id,
        )
        return {"success": True, "developer_id": developer_id}
    except AppNotSelfServeError as e:
        # 403 rather than 400: the request is well formed, the answer is "not
        # from here". The app ids come back so the UI can point at the right row.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": str(e),
                "app_ids": e.app_ids,
                "contact": SUPPORT_CONTACT_EMAIL,
            },
        )
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
            actor_id=str(current_user.id),
        )
        applied_ids = [str(m.developer_id) for m in members]
        return BulkApplyTemplateResponse(
            success_count=len(applied_ids),
            failed_count=len(data.developer_ids) - len(applied_ids),
            applied_developer_ids=applied_ids,
        )
    except AppNotSelfServeError as e:
        # 403 rather than 400: the request is well formed, the answer is "not
        # from here". The app ids come back so the UI can point at the right row.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": str(e),
                "app_ids": e.app_ids,
                "contact": SUPPORT_CONTACT_EMAIL,
            },
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/preview", response_model=AccessPreviewResponse)
async def preview_access(
    workspace_id: str,
    data: AccessPreviewRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """What would somebody with this department/profile/role see?

    Lets the invite screen say "Priya will see CRM, Email and Docs" before the
    invite goes out, instead of the sender finding out afterwards from the
    person who received it.
    """
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
        app_config, baseline, baseline_detail, persona = await service.preview_access(
            workspace_id=workspace_id,
            department_ids=data.department_ids,
            access_template_id=data.access_template_id,
            role=data.role,
        )
    except AppNotSelfServeError as e:
        # 403 rather than 400: the request is well formed, the answer is "not
        # from here". The app ids come back so the UI can point at the right row.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": str(e),
                "app_ids": e.app_ids,
                "contact": SUPPORT_CONTACT_EMAIL,
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Fold in the workspace toggle: previewing an app the workspace has turned
    # off would promise the invitee something they will never see.
    apps: list[AccessPreviewApp] = []
    for app_id, definition in APP_CATALOG.items():
        config = app_config.get(app_id) or {}
        enabled = bool(config.get("enabled")) and (
            await service.check_workspace_app_enabled(workspace_id, app_id)
        )
        if not enabled:
            continue
        granted = config.get("modules") or {}
        module_names = [
            module_config["name"]
            for module_id, module_config in definition.get("modules", {}).items()
            # An empty grant map means "all modules of this app".
            if not granted or granted.get(module_id, True)
        ]
        apps.append(
            AccessPreviewApp(
                app_id=app_id,
                name=definition["name"],
                enabled=True,
                module_names=module_names,
            )
        )

    apps.sort(key=lambda app: app.name)
    return AccessPreviewResponse(
        baseline=baseline,
        baseline_detail=baseline_detail,
        suggested_persona=persona,
        apps=apps,
        enabled_app_names=[app.name for app in apps],
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
            baseline=entry["baseline"],
            department_id=entry["department_id"],
            department_name=entry["department_name"],
            department_count=entry["department_count"],
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
                route=mod_config.get("route"),
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
# Access Request Endpoints
# =============================================================================


def _request_to_response(req) -> AppAccessRequestResponse:
    """Convert AppAccessRequest model to response schema."""
    app_config = APP_CATALOG.get(req.app_id, {})
    return AppAccessRequestResponse(
        id=str(req.id),
        workspace_id=str(req.workspace_id),
        requester_id=str(req.requester_id),
        requester_name=req.requester.name if req.requester else None,
        app_id=req.app_id,
        app_name=app_config.get("name", req.app_id),
        status=req.status,
        reason=req.reason,
        reviewed_by_id=str(req.reviewed_by_id) if req.reviewed_by_id else None,
        reviewer_name=req.reviewer.name if req.reviewer else None,
        reviewed_at=req.reviewed_at,
        review_notes=req.review_notes,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


@router.post(
    "/requests",
    response_model=AppAccessRequestResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_access_request(
    workspace_id: str,
    data: AppAccessRequestCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Submit a request for access to an app."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    service = AppAccessService(db)
    try:
        request = await service.create_access_request(
            workspace_id=workspace_id,
            requester_id=str(current_user.id),
            app_id=data.app_id,
            reason=data.reason,
        )
        return _request_to_response(request)
    except AppNotSelfServeError as e:
        # 403 rather than 400: the request is well formed, the answer is "not
        # from here". The app ids come back so the UI can point at the right row.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": str(e),
                "app_ids": e.app_ids,
                "contact": SUPPORT_CONTACT_EMAIL,
            },
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/requests", response_model=AppAccessRequestListResponse)
async def list_access_requests(
    workspace_id: str,
    request_status: str | None = Query(None, alias="status", description="Filter by status"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List access requests (admin only)."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "admin"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    service = AppAccessService(db)
    requests = await service.list_access_requests(workspace_id, request_status)
    return AppAccessRequestListResponse(
        requests=[_request_to_response(r) for r in requests]
    )


@router.get("/requests/mine", response_model=AppAccessRequestListResponse)
async def get_my_access_requests(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's access requests."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    service = AppAccessService(db)
    requests = await service.get_my_requests(workspace_id, str(current_user.id))
    return AppAccessRequestListResponse(
        requests=[_request_to_response(r) for r in requests]
    )


@router.patch("/requests/{request_id}/approve", response_model=AppAccessRequestResponse)
async def approve_access_request(
    workspace_id: str,
    request_id: str,
    data: AppAccessRequestReview | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Approve an access request (admin only)."""
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
        request = await service.review_request(
            request_id=request_id,
            reviewer_id=str(current_user.id),
            action="approve",
            notes=data.notes if data else None,
        )
        return _request_to_response(request)
    except AppNotSelfServeError as e:
        # 403 rather than 400: the request is well formed, the answer is "not
        # from here". The app ids come back so the UI can point at the right row.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": str(e),
                "app_ids": e.app_ids,
                "contact": SUPPORT_CONTACT_EMAIL,
            },
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.patch("/requests/{request_id}/reject", response_model=AppAccessRequestResponse)
async def reject_access_request(
    workspace_id: str,
    request_id: str,
    data: AppAccessRequestReview | None = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Reject an access request (admin only)."""
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
        request = await service.review_request(
            request_id=request_id,
            reviewer_id=str(current_user.id),
            action="reject",
            notes=data.notes if data else None,
        )
        return _request_to_response(request)
    except AppNotSelfServeError as e:
        # 403 rather than 400: the request is well formed, the answer is "not
        # from here". The app ids come back so the UI can point at the right row.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": str(e),
                "app_ids": e.app_ids,
                "contact": SUPPORT_CONTACT_EMAIL,
            },
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def withdraw_access_request(
    workspace_id: str,
    request_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Withdraw a pending access request (requester only)."""
    workspace_service = WorkspaceService(db)

    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    service = AppAccessService(db)
    try:
        await service.withdraw_request(
            request_id=request_id,
            requester_id=str(current_user.id),
        )
    except AppNotSelfServeError as e:
        # 403 rather than 400: the request is well formed, the answer is "not
        # from here". The app ids come back so the UI can point at the right row.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": str(e),
                "app_ids": e.app_ids,
                "contact": SUPPORT_CONTACT_EMAIL,
            },
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
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
