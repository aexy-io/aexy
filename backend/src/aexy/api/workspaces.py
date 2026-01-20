"""Workspace API endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceUpdate,
    WorkspaceResponse,
    WorkspaceListResponse,
    WorkspaceMemberAdd,
    WorkspaceMemberInvite,
    WorkspaceMemberUpdate,
    WorkspaceMemberResponse,
    WorkspaceMemberAppPermissions,
    WorkspacePendingInviteResponse,
    WorkspaceInviteResult,
    WorkspaceAppSettingsUpdate,
    WorkspaceBillingStatus,
    GitHubOrgLink,
    InviteInfoResponse,
    AcceptInviteResponse,
)
from aexy.services.workspace_service import WorkspaceService
from aexy.services.developer_service import DeveloperService

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])
invites_router = APIRouter(prefix="/invites", tags=["Invites"])


def workspace_to_response(workspace, member_count: int = 0, team_count: int = 0) -> WorkspaceResponse:
    """Convert Workspace model to response schema."""
    return WorkspaceResponse(
        id=str(workspace.id),
        name=workspace.name,
        slug=workspace.slug,
        type=workspace.type,
        description=workspace.description,
        avatar_url=workspace.avatar_url,
        github_org_id=workspace.github_org_id,
        owner_id=str(workspace.owner_id),
        member_count=member_count,
        team_count=team_count,
        is_active=workspace.is_active,
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
    )


def member_to_response(member) -> WorkspaceMemberResponse:
    """Convert WorkspaceMember model to response schema."""
    developer = member.developer
    return WorkspaceMemberResponse(
        id=str(member.id),
        workspace_id=str(member.workspace_id),
        developer_id=str(member.developer_id),
        developer_name=developer.name if developer else None,
        developer_email=developer.email if developer else None,
        developer_avatar_url=developer.avatar_url if developer else None,
        role=member.role,
        status=member.status,
        is_billable=member.is_billable,
        app_permissions=member.app_permissions,
        invited_at=member.invited_at,
        joined_at=member.joined_at,
        created_at=member.created_at,
    )


def pending_invite_to_response(invite) -> WorkspacePendingInviteResponse:
    """Convert WorkspacePendingInvite model to response schema."""
    return WorkspacePendingInviteResponse(
        id=str(invite.id),
        workspace_id=str(invite.workspace_id),
        email=invite.email,
        role=invite.role,
        status=invite.status,
        app_permissions=invite.app_permissions,
        invited_by_name=invite.invited_by.name if invite.invited_by else None,
        expires_at=invite.expires_at,
        created_at=invite.created_at,
    )


# Workspace CRUD
@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    data: WorkspaceCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create a new workspace."""
    service = WorkspaceService(db)

    workspace = await service.create_workspace(
        name=data.name,
        owner_id=str(current_user.id),
        type=data.type,
        github_org_id=data.github_org_id,
        description=data.description,
    )

    await db.commit()
    return workspace_to_response(workspace, member_count=1, team_count=0)


@router.get("", response_model=list[WorkspaceListResponse])
async def list_workspaces(
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all workspaces the current user is a member of."""
    service = WorkspaceService(db)
    workspaces = await service.list_user_workspaces(str(current_user.id))

    results = []
    for ws in workspaces:
        member_count = await service.get_member_count(str(ws.id))
        team_count = len(ws.teams) if ws.teams else 0
        results.append(
            WorkspaceListResponse(
                id=str(ws.id),
                name=ws.name,
                slug=ws.slug,
                type=ws.type,
                avatar_url=ws.avatar_url,
                owner_id=str(ws.owner_id),
                member_count=member_count,
                team_count=team_count,
                is_active=ws.is_active,
            )
        )

    return results


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a workspace by ID."""
    service = WorkspaceService(db)

    # Check if user is a member
    if not await service.check_permission(workspace_id, str(current_user.id), "viewer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    workspace = await service.get_workspace(workspace_id)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    member_count = await service.get_member_count(workspace_id)
    team_count = len(workspace.teams) if workspace.teams else 0

    return workspace_to_response(workspace, member_count, team_count)


@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: str,
    data: WorkspaceUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a workspace."""
    service = WorkspaceService(db)

    # Check if user is an admin
    if not await service.check_permission(workspace_id, str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    workspace = await service.update_workspace(
        workspace_id=workspace_id,
        name=data.name,
        description=data.description,
        avatar_url=data.avatar_url,
        settings=data.settings,
    )

    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    await db.commit()
    member_count = await service.get_member_count(workspace_id)
    team_count = len(workspace.teams) if workspace.teams else 0

    return workspace_to_response(workspace, member_count, team_count)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Delete a workspace (soft delete)."""
    service = WorkspaceService(db)

    # Only owner can delete
    if not await service.is_owner(workspace_id, str(current_user.id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the workspace owner can delete it",
        )

    if not await service.delete_workspace(workspace_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    await db.commit()


# Member management
@router.get("/{workspace_id}/members", response_model=list[WorkspaceMemberResponse])
async def list_members(
    workspace_id: str,
    include_pending: bool = False,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all members of a workspace."""
    service = WorkspaceService(db)

    if not await service.check_permission(workspace_id, str(current_user.id), "viewer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    members = await service.get_members(workspace_id, include_pending=include_pending)
    return [member_to_response(m) for m in members]


@router.post("/{workspace_id}/members", response_model=WorkspaceMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_member(
    workspace_id: str,
    data: WorkspaceMemberAdd,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Add a member to a workspace by developer ID."""
    service = WorkspaceService(db)

    if not await service.check_permission(workspace_id, str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    try:
        member = await service.add_member(
            workspace_id=workspace_id,
            developer_id=data.developer_id,
            role=data.role,
            invited_by_id=str(current_user.id),
            status="active",
        )
        await db.commit()
        await db.refresh(member)
        return member_to_response(member)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/{workspace_id}/members/invite", response_model=WorkspaceInviteResult, status_code=status.HTTP_201_CREATED)
async def invite_member(
    workspace_id: str,
    data: WorkspaceMemberInvite,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Invite a member to a workspace by email.

    If the user exists, they are added as a pending member.
    If the user doesn't exist, a pending invitation is created.
    """
    service = WorkspaceService(db)
    dev_service = DeveloperService(db)

    if not await service.check_permission(workspace_id, str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    # Find developer by email
    developer = await dev_service.get_by_email(data.email)

    if developer:
        # User exists - add as pending member
        try:
            member = await service.add_member(
                workspace_id=workspace_id,
                developer_id=str(developer.id),
                role=data.role,
                invited_by_id=str(current_user.id),
                status="pending",
            )
            await db.commit()
            await db.refresh(member)
            return WorkspaceInviteResult(
                type="member",
                member=member_to_response(member),
                message=f"Invitation sent to {data.email}",
            )
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
    else:
        # User doesn't exist - create pending invite
        try:
            pending_invite = await service.create_pending_invite(
                workspace_id=workspace_id,
                email=data.email,
                role=data.role,
                invited_by_id=str(current_user.id),
            )
            await db.commit()
            await db.refresh(pending_invite)
            return WorkspaceInviteResult(
                type="pending_invite",
                pending_invite=pending_invite_to_response(pending_invite),
                message=f"Invitation created for {data.email}. They will be added when they sign up.",
            )
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )


@router.patch("/{workspace_id}/members/{developer_id}", response_model=WorkspaceMemberResponse)
async def update_member_role(
    workspace_id: str,
    developer_id: str,
    data: WorkspaceMemberUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a member's role."""
    service = WorkspaceService(db)

    if not await service.check_permission(workspace_id, str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    try:
        member = await service.update_member_role(
            workspace_id=workspace_id,
            developer_id=developer_id,
            new_role=data.role,
        )
        if not member:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found",
            )
        await db.commit()
        await db.refresh(member)
        return member_to_response(member)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.delete("/{workspace_id}/members/{developer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    workspace_id: str,
    developer_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Remove a member from a workspace."""
    service = WorkspaceService(db)

    # Can remove self or need admin permission
    is_self = developer_id == str(current_user.id)
    if not is_self and not await service.check_permission(workspace_id, str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    try:
        if not await service.remove_member(workspace_id, developer_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Member not found",
            )
        await db.commit()
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# Join Request
@router.post("/{workspace_id}/join-request")
async def request_to_join(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Request to join a workspace.

    The user will be added as a pending member. Workspace admins will be notified
    and can approve or reject the request.
    """
    service = WorkspaceService(db)

    # Check if workspace exists
    workspace = await service.get_workspace(workspace_id)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    # Check if already a member
    existing_member = await service.get_member(workspace_id, str(current_user.id))
    if existing_member:
        if existing_member.status == "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You are already a member of this workspace",
            )
        elif existing_member.status == "pending":
            return {
                "status": "pending",
                "message": "Your join request is already pending approval",
                "workspace_id": workspace_id,
                "workspace_name": workspace.name,
            }

    try:
        # Add as pending member (join request)
        member = await service.add_member(
            workspace_id=workspace_id,
            developer_id=str(current_user.id),
            role="member",
            invited_by_id=None,  # Self-request
            status="pending",
        )
        await db.commit()

        # Send notifications and emails to workspace admins
        from aexy.services.notification_service import NotificationService
        from aexy.services.email_service import EmailService
        from aexy.schemas.notification import NotificationEventType, NOTIFICATION_TEMPLATES

        notification_service = NotificationService(db)
        email_service = EmailService()

        # Get all workspace admins
        admins = await service.get_members_by_role(workspace_id, "admin")

        requester_name = current_user.name or current_user.github_username or "A user"
        requester_email = current_user.email or ""

        for admin in admins:
            # Create in-app notification
            await notification_service.create_notification(
                recipient_id=str(admin.developer_id),
                event_type=NotificationEventType.WORKSPACE_JOIN_REQUEST,
                title="Workspace Join Request",
                body=f"{requester_name} ({requester_email}) has requested to join {workspace.name}",
                context={
                    "workspace_id": workspace_id,
                    "workspace_name": workspace.name,
                    "requester_name": requester_name,
                    "requester_email": requester_email,
                    "action_url": f"/settings/workspace/{workspace_id}/members",
                },
            )

            # Send email if configured
            if email_service.is_configured and admin.developer:
                admin_email = admin.developer.email
                if admin_email:
                    template = NOTIFICATION_TEMPLATES.get(NotificationEventType.WORKSPACE_JOIN_REQUEST, {})
                    subject = template.get("email_subject", "New Join Request").format(
                        workspace_name=workspace.name,
                    )
                    body = template.get("body_template", "").format(
                        requester_name=requester_name,
                        requester_email=requester_email,
                        workspace_name=workspace.name,
                    )
                    try:
                        await email_service.send_templated_email(
                            db=db,
                            recipient_email=admin_email,
                            subject=subject,
                            body_text=body,
                        )
                    except Exception as e:
                        # Log but don't fail the request
                        import logging
                        logging.getLogger(__name__).warning(f"Failed to send email to {admin_email}: {e}")

        await db.commit()

        return {
            "status": "pending",
            "message": "Join request sent. Workspace admins will review your request.",
            "workspace_id": workspace_id,
            "workspace_name": workspace.name,
        }
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


# GitHub integration
@router.post("/{workspace_id}/link-github", response_model=WorkspaceResponse)
async def link_github_org(
    workspace_id: str,
    data: GitHubOrgLink,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Link a GitHub organization to the workspace."""
    service = WorkspaceService(db)

    if not await service.check_permission(workspace_id, str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    try:
        workspace = await service.link_github_org(workspace_id, data.github_org_id)
        if not workspace:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found",
            )
        await db.commit()
        member_count = await service.get_member_count(workspace_id)
        team_count = len(workspace.teams) if workspace.teams else 0
        return workspace_to_response(workspace, member_count, team_count)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post("/{workspace_id}/sync-github")
async def sync_github_members(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Sync members from linked GitHub organization."""
    service = WorkspaceService(db)

    if not await service.check_permission(workspace_id, str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    added_count = await service.sync_github_org_members(workspace_id)
    await db.commit()

    return {"message": f"Synced {added_count} members from GitHub organization"}


# Billing (basic endpoints - can be extended)
@router.get("/{workspace_id}/billing", response_model=WorkspaceBillingStatus)
async def get_billing_status(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get workspace billing status."""
    service = WorkspaceService(db)

    if not await service.check_permission(workspace_id, str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    workspace = await service.get_workspace(workspace_id)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    used_seats = await service.get_billable_seat_count(workspace_id)
    subscription = workspace.subscription

    return WorkspaceBillingStatus(
        workspace_id=workspace_id,
        has_subscription=subscription is not None,
        current_plan="Pro" if subscription else "Free",
        status=subscription.status if subscription else None,
        total_seats=(subscription.base_seats + subscription.additional_seats) if subscription else 5,
        used_seats=used_seats,
        available_seats=(
            (subscription.base_seats + subscription.additional_seats) - used_seats
            if subscription
            else 5 - used_seats
        ),
        price_per_seat_cents=subscription.price_per_additional_seat_cents if subscription else 1000,
        next_billing_date=subscription.current_period_end if subscription else None,
    )


@router.get("/{workspace_id}/billing/seats")
async def get_seat_usage(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed seat usage for a workspace."""
    service = WorkspaceService(db)

    if not await service.check_permission(workspace_id, str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    workspace = await service.get_workspace(workspace_id)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    total_members = await service.get_member_count(workspace_id)
    billable_seats = await service.get_billable_seat_count(workspace_id)
    subscription = workspace.subscription

    return {
        "total_members": total_members,
        "billable_seats": billable_seats,
        "base_seats": subscription.base_seats if subscription else 5,
        "additional_seats": subscription.additional_seats if subscription else 0,
        "seats_available": (
            (subscription.base_seats + subscription.additional_seats) - billable_seats
            if subscription
            else 5 - billable_seats
        ),
    }


# Pending Invites
@router.get("/{workspace_id}/invites", response_model=list[WorkspacePendingInviteResponse])
async def list_pending_invites(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List all pending invites for a workspace."""
    service = WorkspaceService(db)

    if not await service.check_permission(workspace_id, str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    invites = await service.get_pending_invites(workspace_id)
    return [pending_invite_to_response(i) for i in invites]


@router.delete("/{workspace_id}/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_pending_invite(
    workspace_id: str,
    invite_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a pending invite."""
    service = WorkspaceService(db)

    if not await service.check_permission(workspace_id, str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    if not await service.revoke_pending_invite(workspace_id, invite_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite not found",
        )
    await db.commit()


@router.post("/{workspace_id}/invites/{invite_id}/resend", response_model=WorkspacePendingInviteResponse)
async def resend_pending_invite(
    workspace_id: str,
    invite_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Resend a pending invite by extending its expiry date and sending email."""
    import logging
    from aexy.services.email_service import EmailService
    from aexy.core.config import settings

    logger = logging.getLogger(__name__)
    service = WorkspaceService(db)

    if not await service.check_permission(workspace_id, str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    invite = await service.resend_pending_invite(workspace_id, invite_id)
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite not found",
        )

    # Get workspace name for email
    workspace = await service.get_workspace(workspace_id)
    workspace_name = workspace.name if workspace else "the workspace"

    # Send invite email
    try:
        email_service = EmailService()
        logger.info(f"Email provider: {email_service.provider}, configured: {email_service.is_configured}")
        if email_service.is_configured:
            invite_url = f"{settings.frontend_url}/invite/{invite.token}"
            subject = f"You've been invited to join {workspace_name} on Aexy"
            body_text = f"""
Hi,

{current_user.name or current_user.email} has invited you to join {workspace_name} on Aexy.

Click the link below to accept the invitation:
{invite_url}

This invitation will expire on {invite.expires_at.strftime('%B %d, %Y')}.

If you didn't expect this invitation, you can safely ignore this email.

Best,
The Aexy Team
            """.strip()

            body_html = f"""
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #1f2937;">You've been invited to join {workspace_name}</h2>
    <p style="color: #4b5563;">{current_user.name or current_user.email} has invited you to join {workspace_name} on Aexy.</p>
    <p style="margin: 24px 0;">
        <a href="{invite_url}" style="background-color: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Accept Invitation
        </a>
    </p>
    <p style="color: #6b7280; font-size: 14px;">This invitation will expire on {invite.expires_at.strftime('%B %d, %Y')}.</p>
    <p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">If you didn't expect this invitation, you can safely ignore this email.</p>
</div>
            """.strip()

            await email_service.send_templated_email(
                db=db,
                recipient_email=invite.email,
                subject=subject,
                body_text=body_text,
                body_html=body_html,
            )
            logger.info(f"Resent invite email to {invite.email} for workspace {workspace_id}")
        else:
            logger.warning(f"Email service not configured, skipping invite email to {invite.email}")
    except Exception as e:
        logger.error(f"Failed to send invite email to {invite.email}: {e}")
        # Don't fail the request if email fails

    await db.commit()
    return pending_invite_to_response(invite)


# App Settings and Permissions
@router.get("/{workspace_id}/apps")
async def get_workspace_app_settings(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get workspace-level app settings."""
    service = WorkspaceService(db)

    if not await service.check_permission(workspace_id, str(current_user.id), "viewer"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    return await service.get_workspace_app_settings(workspace_id)


@router.patch("/{workspace_id}/apps")
async def update_workspace_app_settings(
    workspace_id: str,
    data: WorkspaceAppSettingsUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update workspace-level app settings (enable/disable apps for all members)."""
    service = WorkspaceService(db)

    # Only owner can update workspace app settings
    if not await service.is_owner(workspace_id, str(current_user.id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the workspace owner can update app settings",
        )

    workspace = await service.update_workspace_app_settings(workspace_id, data.apps)
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found",
        )

    await db.commit()
    return workspace.settings.get("app_settings", {})


@router.patch("/{workspace_id}/members/{developer_id}/apps", response_model=WorkspaceMemberResponse)
async def update_member_app_permissions(
    workspace_id: str,
    developer_id: str,
    data: WorkspaceMemberAppPermissions,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Update a member's app permissions (override workspace defaults)."""
    service = WorkspaceService(db)

    if not await service.check_permission(workspace_id, str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    member = await service.update_member_app_permissions(
        workspace_id=workspace_id,
        developer_id=developer_id,
        app_permissions=data.app_permissions,
    )

    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    await db.commit()
    await db.refresh(member)
    return member_to_response(member)


@router.get("/{workspace_id}/members/{developer_id}/apps/effective")
async def get_member_effective_permissions(
    workspace_id: str,
    developer_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get a member's effective app permissions (workspace defaults + member overrides)."""
    service = WorkspaceService(db)

    # Can view own permissions or need admin permission
    is_self = developer_id == str(current_user.id)
    if not is_self and not await service.check_permission(workspace_id, str(current_user.id), "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )

    workspace_settings = await service.get_workspace_app_settings(workspace_id)
    member = await service.get_member(workspace_id, developer_id)

    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    return service.get_effective_app_permissions(
        workspace_settings, member.app_permissions
    )


# =============================================================================
# Invite Token Endpoints (Public routes for accepting invites)
# =============================================================================


@invites_router.get("/{token}", response_model=InviteInfoResponse)
async def get_invite_info(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Get invite information by token (public endpoint - no auth required)."""
    service = WorkspaceService(db)
    invite = await service.get_pending_invite_by_token(token)

    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite not found or has already been used",
        )

    # Check if expired
    is_expired = False
    if invite.expires_at and invite.expires_at < datetime.now(timezone.utc):
        is_expired = True

    # Get inviter info
    invited_by_name = None
    invited_by_email = None
    if invite.invited_by:
        invited_by_name = invite.invited_by.name
        invited_by_email = invite.invited_by.email

    return InviteInfoResponse(
        workspace_name=invite.workspace.name,
        workspace_slug=invite.workspace.slug,
        invited_by_name=invited_by_name,
        invited_by_email=invited_by_email,
        email=invite.email,
        role=invite.role,
        expires_at=invite.expires_at,
        is_expired=is_expired,
        is_valid=not is_expired,
    )


@invites_router.post("/{token}/accept", response_model=AcceptInviteResponse)
async def accept_invite(
    token: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Accept a workspace invite (requires authentication)."""
    service = WorkspaceService(db)

    # Get invite first to validate
    invite = await service.get_pending_invite_by_token(token)
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite not found or has already been used",
        )

    # Check if the invite email matches the current user
    if invite.email.lower() != current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"This invite was sent to {invite.email}. Please sign in with that email address.",
        )

    # Check if already a member
    existing_member = await service.get_member(
        str(invite.workspace_id), str(current_user.id)
    )
    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already a member of this workspace",
        )

    # Accept the invite
    member = await service.accept_pending_invite(token, str(current_user.id))
    if not member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to accept invite. The invite may have expired.",
        )

    await db.commit()

    return AcceptInviteResponse(
        success=True,
        workspace_id=str(invite.workspace_id),
        workspace_name=invite.workspace.name,
        workspace_slug=invite.workspace.slug,
        message=f"Successfully joined {invite.workspace.name}",
    )
