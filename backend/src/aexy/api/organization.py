"""Organization structure API — departments, membership, org chart, reporting lines.

Mounted with ``require_app_access("organization")`` (auth + workspace + app-enabled).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.schemas.organization import (
    DepartmentAccessProfileResponse,
    DepartmentAccessProfileUpdate,
    DepartmentCreate,
    DepartmentDetail,
    DepartmentNode,
    DepartmentReparent,
    DepartmentResponse,
    DepartmentUpdate,
    ManagerAssign,
    MembershipCreate,
    MembershipUpdate,
    MemberSummary,
    OrganizationPermissions,
    PersonSummary,
    PositionCreate,
    PositionResponse,
)
from aexy.services.organization_service import OrganizationService

router = APIRouter(
    prefix="/workspaces/{workspace_id}/organization",
    tags=["Organization"],
)


async def require_manage_org(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
) -> Developer:
    """Gate mutations on ``can_manage_org``.

    The router-level guards establish app-enablement and workspace membership
    only; without this any member could restructure departments, reassign
    reporting lines, or change headcount.
    """
    from aexy.services.permission_service import PermissionService

    if not await PermissionService(db).check_permission(
        workspace_id, str(current.id), "can_manage_org"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to manage the organization structure",
        )
    return current


@router.get("/my-permissions", response_model=OrganizationPermissions)
async def get_my_permissions(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current: Developer = Depends(get_current_developer),
):
    """What the caller may do here, so the UI can hide controls that would 403."""
    from aexy.services.permission_service import PermissionService

    return OrganizationPermissions(
        can_manage=await PermissionService(db).check_permission(
            workspace_id, str(current.id), "can_manage_org"
        )
    )


@router.get("/people", response_model=list[PersonSummary])
async def list_people(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(get_current_developer),
):
    """Workspace members with their departments and manager.

    Powers the picker when adding someone to a department, the "Unassigned"
    group in the directory, and the reporting-line column — all of which need
    people who are in no department yet.
    """
    return await OrganizationService(db).list_people(workspace_id)


# ---------------------------------------------------------------- departments

@router.get("/departments", response_model=list[DepartmentResponse])
async def list_departments(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(get_current_developer),
):
    return await OrganizationService(db).list_departments(workspace_id)


@router.get("/org-chart", response_model=list[DepartmentNode])
async def get_org_chart(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(get_current_developer),
):
    return await OrganizationService(db).get_org_chart(workspace_id)


@router.post("/departments", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    workspace_id: str,
    data: DepartmentCreate,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(require_manage_org),
):
    return await OrganizationService(db).create_department(workspace_id, data)


@router.get("/departments/{department_id}", response_model=DepartmentDetail)
async def get_department(
    workspace_id: str,
    department_id: str,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(get_current_developer),
):
    return await OrganizationService(db).get_department(workspace_id, department_id)


@router.patch("/departments/{department_id}", response_model=DepartmentResponse)
async def update_department(
    workspace_id: str,
    department_id: str,
    data: DepartmentUpdate,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(require_manage_org),
):
    return await OrganizationService(db).update_department(workspace_id, department_id, data)


@router.get("/access-profiles", response_model=list[DepartmentAccessProfileResponse])
async def list_department_access_profiles(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(require_manage_org),
):
    """Every department's access profile.

    Deliberately not ``/departments/access-profiles``: FastAPI matches routes in
    declaration order, and ``/departments/{department_id}`` — declared above —
    would happily treat "access-profiles" as a department id. A sibling path
    can't be shadowed by accident later.

    Manage-gated: this is the workspace's access configuration, not org trivia.
    """
    return await OrganizationService(db).list_access_profiles(workspace_id)


@router.get(
    "/departments/{department_id}/access-profile",
    response_model=DepartmentAccessProfileResponse,
)
async def get_department_access_profile(
    workspace_id: str,
    department_id: str,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(require_manage_org),
):
    return await OrganizationService(db).get_access_profile(workspace_id, department_id)


@router.put(
    "/departments/{department_id}/access-profile",
    response_model=DepartmentAccessProfileResponse,
)
async def set_department_access_profile(
    workspace_id: str,
    department_id: str,
    data: DepartmentAccessProfileUpdate,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(require_manage_org),
):
    """Set what this department's members can see.

    This decides access for everyone in the department at once, and — unlike the
    role defaults it replaces — it is enforced on the API, so it is gated on
    ``can_manage_org`` like every other structural change.
    """
    return await OrganizationService(db).set_access_profile(
        workspace_id, department_id, data
    )


@router.post("/departments/{department_id}/reparent", response_model=DepartmentResponse)
async def reparent_department(
    workspace_id: str,
    department_id: str,
    data: DepartmentReparent,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(require_manage_org),
):
    return await OrganizationService(db).reparent_department(workspace_id, department_id, data.parent_id)


@router.delete("/departments/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_department(
    workspace_id: str,
    department_id: str,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(require_manage_org),
):
    await OrganizationService(db).delete_department(workspace_id, department_id)


# ---------------------------------------------------------------- membership

@router.post(
    "/departments/{department_id}/members",
    response_model=MemberSummary,
    status_code=status.HTTP_201_CREATED,
)
async def add_member(
    workspace_id: str,
    department_id: str,
    data: MembershipCreate,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(require_manage_org),
):
    return await OrganizationService(db).add_member(workspace_id, department_id, data)


@router.patch("/departments/{department_id}/members/{member_id}", response_model=MemberSummary)
async def update_member(
    workspace_id: str,
    department_id: str,
    member_id: str,
    data: MembershipUpdate,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(require_manage_org),
):
    return await OrganizationService(db).update_member(workspace_id, department_id, member_id, data)


@router.delete(
    "/departments/{department_id}/members/{member_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_member(
    workspace_id: str,
    department_id: str,
    member_id: str,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(require_manage_org),
):
    await OrganizationService(db).remove_member(workspace_id, department_id, member_id)


# ---------------------------------------------------------------- positions

@router.post(
    "/departments/{department_id}/positions",
    response_model=PositionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_position(
    workspace_id: str,
    department_id: str,
    data: PositionCreate,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(require_manage_org),
):
    return await OrganizationService(db).add_position(workspace_id, department_id, data)


# ---------------------------------------------------------------- reporting

@router.get("/developers/{developer_id}/departments", response_model=list[DepartmentResponse])
async def developer_departments(
    workspace_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(get_current_developer),
):
    return await OrganizationService(db).list_departments_for_developer(workspace_id, developer_id)


@router.put("/developers/{developer_id}/manager", status_code=status.HTTP_204_NO_CONTENT)
async def set_manager(
    workspace_id: str,
    developer_id: str,
    data: ManagerAssign,
    db: AsyncSession = Depends(get_db),
    _: Developer = Depends(require_manage_org),
):
    await OrganizationService(db).set_manager(workspace_id, developer_id, data.manager_id)
