"""Project management API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListResponse,
    ProjectsListWrapper,
    ProjectMemberAdd,
    ProjectMemberUpdate,
    ProjectMemberResponse,
    ProjectMemberListResponse,
    ProjectMembersListWrapper,
    ProjectTeamAdd,
    ProjectTeamResponse,
    ProjectTeamsListWrapper,
    ProjectInviteRequest,
    ProjectInviteResult,
    MyProjectPermissionsResponse,
    AccessibleWidgetsResponse,
)
from aexy.schemas.role import RoleSummary
from aexy.services.project_service import ProjectService
from aexy.services.permission_service import PermissionService
from aexy.services.role_service import RoleService

router = APIRouter(prefix="/workspaces/{workspace_id}/projects", tags=["Projects"])


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    workspace_id: str,
    data: ProjectCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new project."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_create_projects"
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    project_service = ProjectService(db)
    project = await project_service.create_project(
        workspace_id=workspace_id,
        name=data.name,
        description=data.description,
        color=data.color,
        icon=data.icon,
        settings=data.settings,
        created_by_id=str(current_user.id),
    )
    await db.commit()
    await db.refresh(project)
    return project


@router.get("", response_model=ProjectsListWrapper)
async def list_projects(
    workspace_id: str,
    include_archived: bool = False,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all projects in workspace."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_view_projects"
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    project_service = ProjectService(db)
    projects = await project_service.list_projects(
        workspace_id, include_archived=include_archived
    )

    return ProjectsListWrapper(
        projects=[
            ProjectListResponse(
                id=p.id,
                workspace_id=p.workspace_id,
                name=p.name,
                slug=p.slug,
                description=p.description,
                color=p.color,
                icon=p.icon,
                status=p.status,
                is_active=p.is_active,
                member_count=p.member_count,
                team_count=p.team_count,
            )
            for p in projects
        ]
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    workspace_id: str,
    project_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific project."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_view_projects", project_id
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    project_service = ProjectService(db)
    project = await project_service.get_project(project_id)
    if not project or project.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    workspace_id: str,
    project_id: str,
    data: ProjectUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a project."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_edit_projects", project_id
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    project_service = ProjectService(db)
    project = await project_service.get_project(project_id)

    if not project or project.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Project not found")

    project = await project_service.update_project(
        project_id, **data.model_dump(exclude_unset=True)
    )
    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    workspace_id: str,
    project_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a project (archive)."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_delete_projects", project_id
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    project_service = ProjectService(db)
    project = await project_service.get_project(project_id)

    if not project or project.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Project not found")

    await project_service.delete_project(project_id)
    await db.commit()


# Member management endpoints
@router.get("/{project_id}/members", response_model=ProjectMembersListWrapper)
async def list_project_members(
    workspace_id: str,
    project_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all members of a project."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_view_members", project_id
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    project_service = ProjectService(db)
    project = await project_service.get_project(project_id)

    if not project or project.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Project not found")

    members = await project_service.list_members(project_id)

    return ProjectMembersListWrapper(
        members=[
            ProjectMemberListResponse(
                id=m.id,
                project_id=m.project_id,
                developer_id=m.developer_id,
                developer_name=m.developer.name if m.developer else None,
                developer_email=m.developer.email if m.developer else None,
                developer_avatar_url=m.developer.avatar_url if m.developer else None,
                role_id=str(m.role.id) if m.role else None,
                role_name=m.role.name if m.role else None,
                status=m.status,
                joined_at=m.joined_at,
            )
            for m in members
        ]
    )


@router.post("/{project_id}/members", response_model=ProjectMemberResponse)
async def add_project_member(
    workspace_id: str,
    project_id: str,
    data: ProjectMemberAdd,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a member to a project with a specific role."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_invite_members", project_id
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    project_service = ProjectService(db)
    project = await project_service.get_project(project_id)

    if not project or project.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate role if provided
    if data.role_id:
        role_service = RoleService(db)
        role = await role_service.get_role(data.role_id)
        if not role or role.workspace_id != workspace_id:
            raise HTTPException(status_code=400, detail="Invalid role")

    member = await project_service.add_member(
        project_id=project_id,
        developer_id=data.developer_id,
        role_id=data.role_id,
        permission_overrides=data.permission_overrides,
        invited_by_id=str(current_user.id),
    )
    await db.commit()
    await db.refresh(member)

    return ProjectMemberResponse(
        id=member.id,
        project_id=member.project_id,
        developer_id=member.developer_id,
        developer_name=member.developer.name if member.developer else None,
        developer_email=member.developer.email if member.developer else None,
        developer_avatar_url=member.developer.avatar_url if member.developer else None,
        role_id=member.role_id,
        role=RoleSummary(
            id=member.role.id,
            name=member.role.name,
            slug=member.role.slug,
            color=member.role.color,
            icon=member.role.icon,
            is_system=member.role.is_system,
        ) if member.role else None,
        permission_overrides=member.permission_overrides,
        status=member.status,
        invited_by_id=member.invited_by_id,
        invited_by_name=member.invited_by.name if member.invited_by else None,
        invited_at=member.invited_at,
        joined_at=member.joined_at,
        created_at=member.created_at,
        updated_at=member.updated_at,
    )


@router.post("/{project_id}/invite", response_model=ProjectInviteResult)
async def invite_to_project(
    workspace_id: str,
    project_id: str,
    data: ProjectInviteRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Invite users to a project by email. Users don't need to be workspace members."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_invite_members", project_id
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    project_service = ProjectService(db)
    project = await project_service.get_project(project_id)

    if not project or project.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate role if provided
    if data.role_id:
        role_service = RoleService(db)
        role = await role_service.get_role(data.role_id)
        if not role or role.workspace_id != workspace_id:
            raise HTTPException(status_code=400, detail="Invalid role")

    invited = []
    already_members = []
    pending_invites = []
    failed = []

    for email in data.emails:
        member, status = await project_service.invite_by_email(
            project_id=project_id,
            workspace_id=workspace_id,
            email=email.strip(),
            role_id=data.role_id,
            invited_by_id=str(current_user.id),
        )

        if status == "added":
            invited.append(email)
        elif status == "already_member":
            already_members.append(email)
        elif status == "pending":
            pending_invites.append(email)
        elif status == "user_not_found":
            failed.append({"email": email, "reason": "User not found. They need to sign up first."})

    await db.commit()

    return ProjectInviteResult(
        invited=invited,
        already_members=already_members,
        pending_invites=pending_invites,
        failed=failed,
    )


@router.patch("/{project_id}/members/{developer_id}", response_model=ProjectMemberResponse)
async def update_project_member(
    workspace_id: str,
    project_id: str,
    developer_id: str,
    data: ProjectMemberUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a project member's role or permissions."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_assign_roles", project_id
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    project_service = ProjectService(db)
    project = await project_service.get_project(project_id)

    if not project or project.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate role if provided
    if data.role_id:
        role_service = RoleService(db)
        role = await role_service.get_role(data.role_id)
        if not role or role.workspace_id != workspace_id:
            raise HTTPException(status_code=400, detail="Invalid role")

    member = await project_service.update_member(
        project_id=project_id,
        developer_id=developer_id,
        role_id=data.role_id,
        permission_overrides=data.permission_overrides,
        status=data.status,
    )

    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    await db.commit()
    await db.refresh(member)

    return ProjectMemberResponse(
        id=member.id,
        project_id=member.project_id,
        developer_id=member.developer_id,
        developer_name=member.developer.name if member.developer else None,
        developer_email=member.developer.email if member.developer else None,
        developer_avatar_url=member.developer.avatar_url if member.developer else None,
        role_id=member.role_id,
        role=RoleSummary(
            id=member.role.id,
            name=member.role.name,
            slug=member.role.slug,
            color=member.role.color,
            icon=member.role.icon,
            is_system=member.role.is_system,
        ) if member.role else None,
        permission_overrides=member.permission_overrides,
        status=member.status,
        invited_by_id=member.invited_by_id,
        invited_by_name=member.invited_by.name if member.invited_by else None,
        invited_at=member.invited_at,
        joined_at=member.joined_at,
        created_at=member.created_at,
        updated_at=member.updated_at,
    )


@router.delete("/{project_id}/members/{developer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_project_member(
    workspace_id: str,
    project_id: str,
    developer_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove a member from a project."""
    permission_service = PermissionService(db)

    # Allow removing self or must have permission
    is_self = str(current_user.id) == developer_id
    if not is_self and not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_remove_members", project_id
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    project_service = ProjectService(db)
    project = await project_service.get_project(project_id)

    if not project or project.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Project not found")

    success = await project_service.remove_member(project_id, developer_id)
    if not success:
        raise HTTPException(status_code=404, detail="Member not found")

    await db.commit()


# Team management endpoints
@router.get("/{project_id}/teams", response_model=ProjectTeamsListWrapper)
async def list_project_teams(
    workspace_id: str,
    project_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all teams in a project."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_view_projects", project_id
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    project_service = ProjectService(db)
    project = await project_service.get_project(project_id)

    if not project or project.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Project not found")

    project_teams = await project_service.list_project_teams(project_id)

    return ProjectTeamsListWrapper(
        teams=[
            ProjectTeamResponse(
                id=pt.id,
                project_id=pt.project_id,
                team_id=pt.team_id,
                team_name=pt.team.name if pt.team else "Unknown",
                team_slug=pt.team.slug if pt.team else "unknown",
                created_at=pt.created_at,
            )
            for pt in project_teams
        ]
    )


@router.post("/{project_id}/teams", response_model=ProjectTeamResponse)
async def add_team_to_project(
    workspace_id: str,
    project_id: str,
    data: ProjectTeamAdd,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a team to a project."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_edit_projects", project_id
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    project_service = ProjectService(db)
    project = await project_service.get_project(project_id)

    if not project or project.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Project not found")

    project_team = await project_service.add_team(project_id, data.team_id)
    await db.commit()
    await db.refresh(project_team)

    return ProjectTeamResponse(
        id=project_team.id,
        project_id=project_team.project_id,
        team_id=project_team.team_id,
        team_name=project_team.team.name if project_team.team else "Unknown",
        team_slug=project_team.team.slug if project_team.team else "unknown",
        created_at=project_team.created_at,
    )


@router.delete("/{project_id}/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_team_from_project(
    workspace_id: str,
    project_id: str,
    team_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove a team from a project."""
    permission_service = PermissionService(db)
    if not await permission_service.check_permission(
        workspace_id, str(current_user.id), "can_edit_projects", project_id
    ):
        raise HTTPException(status_code=403, detail="Permission denied")

    project_service = ProjectService(db)
    project = await project_service.get_project(project_id)

    if not project or project.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Project not found")

    success = await project_service.remove_team(project_id, team_id)
    if not success:
        raise HTTPException(status_code=404, detail="Team not found in project")

    await db.commit()


# Permission and widget access endpoints
@router.get("/{project_id}/my-permissions", response_model=MyProjectPermissionsResponse)
async def get_my_permissions(
    workspace_id: str,
    project_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's effective permissions for this project."""
    permission_service = PermissionService(db)
    permissions = await permission_service.get_effective_permissions(
        workspace_id, str(current_user.id), project_id
    )
    role_info = await permission_service.get_user_role_info(
        workspace_id, str(current_user.id), project_id
    )

    return MyProjectPermissionsResponse(
        permissions=list(permissions),
        workspace_id=workspace_id,
        project_id=project_id,
        role_id=role_info.get("role_id"),
        role_name=role_info.get("role_name"),
        has_project_override=role_info.get("has_project_override", False),
    )


@router.get("/{project_id}/accessible-widgets", response_model=AccessibleWidgetsResponse)
async def get_accessible_widgets(
    workspace_id: str,
    project_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get widgets the user can access based on permissions."""
    permission_service = PermissionService(db)
    widgets = await permission_service.get_accessible_widgets(
        workspace_id, str(current_user.id), project_id
    )
    return AccessibleWidgetsResponse(
        widgets=widgets,
        workspace_id=workspace_id,
        project_id=project_id,
    )
