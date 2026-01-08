"""Document Space API endpoints for organizing documents within workspaces."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.models.documentation import DocumentSpaceRole
from aexy.schemas.document import (
    DocumentSpaceCreate,
    DocumentSpaceListResponse,
    DocumentSpaceMemberAdd,
    DocumentSpaceMemberResponse,
    DocumentSpaceMemberUpdate,
    DocumentSpaceResponse,
    DocumentSpaceUpdate,
)
from aexy.services.document_space_service import DocumentSpaceService
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspaces/{workspace_id}/spaces", tags=["Document Spaces"])


async def check_workspace_permission(
    workspace_id: str,
    current_user: Developer,
    db: AsyncSession,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        workspace_id, str(current_user.id), required_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this workspace",
        )


def space_to_response(space, stats: dict | None = None) -> DocumentSpaceResponse:
    """Convert DocumentSpace model to response schema."""
    return DocumentSpaceResponse(
        id=str(space.id),
        workspace_id=str(space.workspace_id),
        name=space.name,
        slug=space.slug,
        description=space.description,
        icon=space.icon,
        color=space.color,
        is_default=space.is_default,
        is_archived=space.is_archived,
        member_count=stats.get("member_count", 0) if stats else len(space.members) if space.members else 0,
        document_count=stats.get("document_count", 0) if stats else 0,
        created_by_id=str(space.created_by_id) if space.created_by_id else None,
        created_at=space.created_at,
        updated_at=space.updated_at,
    )


def space_to_list_response(space) -> DocumentSpaceListResponse:
    """Convert DocumentSpace model to list response schema."""
    return DocumentSpaceListResponse(
        id=str(space.id),
        name=space.name,
        slug=space.slug,
        icon=space.icon,
        color=space.color,
        is_default=space.is_default,
        is_archived=space.is_archived,
        member_count=len(space.members) if space.members else 0,
        document_count=0,  # Will be computed separately if needed
    )


def member_to_response(member) -> DocumentSpaceMemberResponse:
    """Convert DocumentSpaceMember model to response schema."""
    return DocumentSpaceMemberResponse(
        id=str(member.id),
        space_id=str(member.space_id),
        developer_id=str(member.developer_id),
        developer_name=member.developer.name if member.developer else None,
        developer_email=member.developer.email if member.developer else None,
        developer_avatar=member.developer.avatar_url if member.developer else None,
        role=member.role,
        invited_by_id=str(member.invited_by_id) if member.invited_by_id else None,
        invited_by_name=member.invited_by.name if member.invited_by else None,
        joined_at=member.joined_at,
        created_at=member.created_at,
    )


# ==================== Space CRUD ====================


@router.get("", response_model=list[DocumentSpaceListResponse])
async def list_spaces(
    workspace_id: str,
    include_archived: bool = Query(False, description="Include archived spaces"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all spaces accessible to the current user in the workspace.

    Workspace admins/owners see all spaces.
    Regular members only see spaces they belong to.
    """
    await check_workspace_permission(workspace_id, current_user, db)

    service = DocumentSpaceService(db)
    spaces = await service.get_user_spaces(
        workspace_id=workspace_id,
        developer_id=str(current_user.id),
        include_archived=include_archived,
    )

    return [space_to_list_response(space) for space in spaces]


@router.post("", response_model=DocumentSpaceResponse, status_code=status.HTTP_201_CREATED)
async def create_space(
    workspace_id: str,
    data: DocumentSpaceCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new document space in the workspace."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DocumentSpaceService(db)
    space = await service.create_space(
        workspace_id=workspace_id,
        name=data.name,
        created_by_id=str(current_user.id),
        description=data.description,
        icon=data.icon,
        color=data.color,
    )

    stats = await service.get_space_stats(space.id)
    return space_to_response(space, stats)


@router.get("/{space_id}", response_model=DocumentSpaceResponse)
async def get_space(
    workspace_id: str,
    space_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific space by ID."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DocumentSpaceService(db)

    # Check if user can access this space
    user_role = await service.get_user_role_in_space(space_id, str(current_user.id))
    if not user_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this space",
        )

    space = await service.get_space(space_id, workspace_id)
    if not space:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Space not found",
        )

    stats = await service.get_space_stats(space_id)
    return space_to_response(space, stats)


@router.patch("/{space_id}", response_model=DocumentSpaceResponse)
async def update_space(
    workspace_id: str,
    space_id: str,
    data: DocumentSpaceUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a space. Requires admin role in the space."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DocumentSpaceService(db)

    # Check admin permission
    if not await service.check_space_permission(
        space_id, str(current_user.id), DocumentSpaceRole.ADMIN.value
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only space admins can update the space",
        )

    space = await service.update_space(
        space_id=space_id,
        name=data.name,
        description=data.description,
        icon=data.icon,
        color=data.color,
        is_archived=data.is_archived,
    )

    if not space:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Space not found",
        )

    stats = await service.get_space_stats(space_id)
    return space_to_response(space, stats)


@router.delete("/{space_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_space(
    workspace_id: str,
    space_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a space. Cannot delete the default space.

    Documents in the deleted space will be moved to the default space.
    """
    await check_workspace_permission(workspace_id, current_user, db)

    service = DocumentSpaceService(db)

    # Check admin permission
    if not await service.check_space_permission(
        space_id, str(current_user.id), DocumentSpaceRole.ADMIN.value
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only space admins can delete the space",
        )

    space = await service.get_space(space_id, workspace_id)
    if not space:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Space not found",
        )

    if space.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the default space",
        )

    await service.delete_space(space_id)
    await db.commit()


# ==================== Member Management ====================


@router.get("/{space_id}/members", response_model=list[DocumentSpaceMemberResponse])
async def list_space_members(
    workspace_id: str,
    space_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all members of a space."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DocumentSpaceService(db)

    # Check if user can access this space
    user_role = await service.get_user_role_in_space(space_id, str(current_user.id))
    if not user_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this space",
        )

    members = await service.get_members(space_id)
    return [member_to_response(m) for m in members]


@router.post(
    "/{space_id}/members",
    response_model=DocumentSpaceMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_space_member(
    workspace_id: str,
    space_id: str,
    data: DocumentSpaceMemberAdd,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a member to a space. Requires admin role."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DocumentSpaceService(db)

    # Check admin permission
    if not await service.check_space_permission(
        space_id, str(current_user.id), DocumentSpaceRole.ADMIN.value
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only space admins can add members",
        )

    # Check if the developer is a workspace member
    workspace_service = WorkspaceService(db)
    if not await workspace_service.is_member(workspace_id, data.developer_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Developer must be a workspace member first",
        )

    member = await service.add_member(
        space_id=space_id,
        developer_id=data.developer_id,
        role=data.role,
        invited_by_id=str(current_user.id),
    )

    if not member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Developer is already a member of this space",
        )

    await db.commit()
    await db.refresh(member)

    # Re-fetch with relationships
    members = await service.get_members(space_id)
    member = next((m for m in members if str(m.developer_id) == data.developer_id), None)
    return member_to_response(member)


@router.patch("/{space_id}/members/{member_id}", response_model=DocumentSpaceMemberResponse)
async def update_space_member(
    workspace_id: str,
    space_id: str,
    member_id: str,
    data: DocumentSpaceMemberUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a member's role. Requires admin role."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DocumentSpaceService(db)

    # Check admin permission
    if not await service.check_space_permission(
        space_id, str(current_user.id), DocumentSpaceRole.ADMIN.value
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only space admins can update members",
        )

    # Get the member to find developer_id
    members = await service.get_members(space_id)
    member = next((m for m in members if str(m.id) == member_id), None)

    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    updated = await service.update_member_role(
        space_id=space_id,
        developer_id=str(member.developer_id),
        role=data.role,
    )

    await db.commit()

    # Re-fetch with relationships
    members = await service.get_members(space_id)
    member = next((m for m in members if str(m.id) == member_id), None)
    return member_to_response(member)


@router.delete("/{space_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_space_member(
    workspace_id: str,
    space_id: str,
    member_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove a member from a space. Requires admin role."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DocumentSpaceService(db)

    # Check admin permission
    if not await service.check_space_permission(
        space_id, str(current_user.id), DocumentSpaceRole.ADMIN.value
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only space admins can remove members",
        )

    # Get the member to find developer_id
    members = await service.get_members(space_id)
    member = next((m for m in members if str(m.id) == member_id), None)

    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    # Cannot remove the creator of the space
    space = await service.get_space(space_id, workspace_id)
    if space and str(space.created_by_id) == str(member.developer_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the space creator",
        )

    await service.remove_member(space_id, str(member.developer_id))
    await db.commit()


# ==================== Bulk Operations ====================


@router.post("/{space_id}/members/add-all", status_code=status.HTTP_200_OK)
async def add_all_workspace_members(
    workspace_id: str,
    space_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add all workspace members to a space. Requires admin role."""
    await check_workspace_permission(workspace_id, current_user, db)

    service = DocumentSpaceService(db)

    # Check admin permission
    if not await service.check_space_permission(
        space_id, str(current_user.id), DocumentSpaceRole.ADMIN.value
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only space admins can add members",
        )

    count = await service.add_all_workspace_members_to_space(
        space_id=space_id,
        workspace_id=workspace_id,
    )

    await db.commit()

    return {"added_count": count}
