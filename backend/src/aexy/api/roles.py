"""Custom Role management API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.models.permissions import PERMISSIONS, ROLE_TEMPLATES, PermissionCategory
from aexy.schemas.role import (
    RoleCreate,
    RoleUpdate,
    RoleResponse,
    RoleListResponse,
    RoleTemplateResponse,
    PermissionCatalogResponse,
    RolesListWrapper,
    RoleTemplatesListWrapper,
)
from aexy.services.role_service import RoleService
from aexy.services.permission_service import PermissionService

router = APIRouter(prefix="/workspaces/{workspace_id}/roles", tags=["Roles"])


@router.get("/templates", response_model=RoleTemplatesListWrapper)
async def list_role_templates(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List available role templates."""
    # Basic permission check - must be able to view members
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_view_members"
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    return RoleTemplatesListWrapper(
        templates=[
            RoleTemplateResponse(
                id=template_id,
                name=template["name"],
                description=template["description"],
                color=template["color"],
                icon=template["icon"],
                is_system=template.get("is_system", True),
                priority=template.get("priority", 50),
                permissions=template["permissions"],
            )
            for template_id, template in ROLE_TEMPLATES.items()
        ]
    )


@router.get("/permissions", response_model=PermissionCatalogResponse)
async def get_permission_catalog(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get the full permission catalog."""
    # Check permission - must be able to manage roles to see permission catalog
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_manage_roles"
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    # Transform PERMISSIONS dict to array format expected by frontend
    permissions_list = [
        {
            "id": perm_id,
            "category": perm_info["category"].value,
            "description": perm_info["description"],
            "default_for": perm_info.get("default_for", []),
        }
        for perm_id, perm_info in PERMISSIONS.items()
    ]

    return PermissionCatalogResponse(
        permissions=permissions_list,
        categories=[cat.value for cat in PermissionCategory],
    )


@router.post("", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    workspace_id: str,
    data: RoleCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a custom role."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_manage_roles"
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    role_service = RoleService(db)
    role = await role_service.create_role(
        workspace_id=workspace_id,
        name=data.name,
        description=data.description,
        color=data.color,
        icon=data.icon,
        permissions=data.permissions,
        based_on_template=data.based_on_template,
        priority=data.priority,
    )
    await db.commit()
    await db.refresh(role)
    return role


@router.get("", response_model=RolesListWrapper)
async def list_roles(
    workspace_id: str,
    include_system: bool = True,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all roles in workspace."""
    # Basic view permission check
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_view_members"
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    role_service = RoleService(db)
    roles = await role_service.list_roles(workspace_id, include_system=include_system)

    return RolesListWrapper(
        roles=[
            RoleListResponse(
                id=role.id,
                workspace_id=role.workspace_id,
                name=role.name,
                slug=role.slug,
                description=role.description,
                color=role.color,
                icon=role.icon,
                is_system=role.is_system,
                permissions=role.permissions,
                priority=role.priority,
                is_active=role.is_active,
            )
            for role in roles
        ]
    )


@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(
    workspace_id: str,
    role_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific role."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_view_members"
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    role_service = RoleService(db)
    role = await role_service.get_role(role_id)
    if not role or role.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.patch("/{role_id}", response_model=RoleResponse)
async def update_role(
    workspace_id: str,
    role_id: str,
    data: RoleUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a custom role."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_manage_roles"
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    role_service = RoleService(db)
    role = await role_service.get_role(role_id)

    if not role or role.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Role not found")

    if role.is_system and (data.name is not None or data.permissions is not None):
        raise HTTPException(
            status_code=400,
            detail="Cannot modify name or permissions of system roles"
        )

    role = await role_service.update_role(role_id, **data.model_dump(exclude_unset=True))
    await db.commit()
    await db.refresh(role)
    return role


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_role(
    workspace_id: str,
    role_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a custom role."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_manage_roles"
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    role_service = RoleService(db)
    role = await role_service.get_role(role_id)

    if not role or role.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Role not found")

    if role.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system roles")

    await role_service.delete_role(role_id)
    await db.commit()


@router.post("/{role_id}/duplicate", response_model=RoleResponse)
async def duplicate_role(
    workspace_id: str,
    role_id: str,
    new_name: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Duplicate an existing role with a new name."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_manage_roles"
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    role_service = RoleService(db)
    role = await role_service.get_role(role_id)

    if not role or role.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Role not found")

    new_role = await role_service.duplicate_role(role_id, new_name)
    await db.commit()
    await db.refresh(new_role)
    return new_role


@router.post("/{role_id}/reset", response_model=RoleResponse)
async def reset_role_to_template(
    workspace_id: str,
    role_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Reset a role's permissions to its template defaults."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_manage_roles"
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    role_service = RoleService(db)
    role = await role_service.get_role(role_id)

    if not role or role.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Role not found")

    if not role.based_on_template:
        raise HTTPException(
            status_code=400,
            detail="Role is not based on a template and cannot be reset"
        )

    role = await role_service.reset_role_to_template(role_id)
    await db.commit()
    await db.refresh(role)
    return role
