"""Platform Admin API endpoints for global system monitoring.

This module provides platform-level admin endpoints accessible only to users
whose email is in the ADMIN_EMAILS environment variable.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.api.developers import get_current_developer_id
from aexy.core.config import get_settings
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.models.notification import EmailNotificationLog, Notification
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.developer_service import DeveloperService

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/platform-admin", tags=["platform-admin"])


# =============================================================================
# RESPONSE MODELS
# =============================================================================


class AdminCheckResponse(BaseModel):
    """Response for admin check endpoint."""

    is_admin: bool


class AdminDashboardStats(BaseModel):
    """Platform-wide statistics for admin dashboard."""

    total_workspaces: int
    total_users: int
    total_emails_sent: int
    total_notifications: int
    active_workspaces_30d: int
    email_delivery_rate: float
    emails_sent_today: int
    emails_sent_this_week: int
    emails_failed_today: int


class EmailLogDetailResponse(BaseModel):
    """Detailed email log response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    notification_id: str | None
    recipient_email: str
    subject: str
    template_name: str | None
    body_preview: str | None
    ses_message_id: str | None
    status: str
    error_message: str | None
    sent_at: datetime | None
    created_at: datetime
    # Additional metadata from notification
    workspace_id: str | None = None
    workspace_name: str | None = None
    notification_type: str | None = None


class PaginatedEmailLogs(BaseModel):
    """Paginated email log response."""

    items: list[EmailLogDetailResponse]
    total: int
    page: int
    per_page: int
    has_next: bool


class NotificationLogResponse(BaseModel):
    """Notification log response for admin."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    recipient_id: str
    recipient_email: str | None = None
    recipient_name: str | None = None
    event_type: str
    title: str
    body: str
    context: dict
    is_read: bool
    email_sent: bool
    created_at: datetime


class PaginatedNotifications(BaseModel):
    """Paginated notification response."""

    items: list[NotificationLogResponse]
    total: int
    page: int
    per_page: int
    has_next: bool


class WorkspaceAdminResponse(BaseModel):
    """Workspace response for admin view."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    slug: str
    type: str
    description: str | None
    owner_id: str
    owner_email: str | None = None
    owner_name: str | None = None
    plan_tier: str | None = None
    member_count: int = 0
    is_active: bool
    created_at: datetime


class PaginatedWorkspaces(BaseModel):
    """Paginated workspace response."""

    items: list[WorkspaceAdminResponse]
    total: int
    page: int
    per_page: int
    has_next: bool


class UserAdminResponse(BaseModel):
    """User response for admin view."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str | None
    avatar_url: str | None
    has_github: bool = False
    has_google: bool = False
    workspace_count: int = 0
    created_at: datetime


class PaginatedUsers(BaseModel):
    """Paginated user response."""

    items: list[UserAdminResponse]
    total: int
    page: int
    per_page: int
    has_next: bool


class ResendEmailResponse(BaseModel):
    """Response for email resend action."""

    success: bool
    message: str
    new_email_log_id: str | None = None


# =============================================================================
# DEPENDENCIES
# =============================================================================


async def get_current_developer(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> Developer:
    """Get the current developer model."""
    service = DeveloperService(db)
    developer = await service.get_by_id(developer_id)
    if not developer:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Developer not found",
        )
    return developer


async def get_platform_admin(
    current_user: Developer = Depends(get_current_developer),
) -> Developer:
    """Verify user is a platform admin (email in ADMIN_EMAILS).

    Platform admins have access to global system monitoring and management.
    """
    if current_user.email.lower() not in settings.admin_email_list:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required",
        )
    return current_user


# =============================================================================
# ENDPOINTS
# =============================================================================


@router.get("/check", response_model=AdminCheckResponse)
async def check_admin_status(
    current_user: Developer = Depends(get_current_developer),
) -> AdminCheckResponse:
    """Check if the current user is a platform admin."""
    is_admin = current_user.email.lower() in settings.admin_email_list
    return AdminCheckResponse(is_admin=is_admin)


@router.get("/dashboard/stats", response_model=AdminDashboardStats)
async def get_dashboard_stats(
    admin: Developer = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminDashboardStats:
    """Get global platform statistics for admin dashboard."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)
    month_start = today_start - timedelta(days=30)

    # Total workspaces
    workspace_count = await db.scalar(select(func.count(Workspace.id)))

    # Total users
    user_count = await db.scalar(select(func.count(Developer.id)))

    # Active workspaces in last 30 days (has members who logged in)
    active_workspace_count = await db.scalar(
        select(func.count(func.distinct(WorkspaceMember.workspace_id))).where(
            WorkspaceMember.updated_at >= month_start
        )
    )

    # Total emails sent
    total_emails = await db.scalar(select(func.count(EmailNotificationLog.id)))

    # Emails sent today
    emails_today = await db.scalar(
        select(func.count(EmailNotificationLog.id)).where(
            EmailNotificationLog.created_at >= today_start
        )
    )

    # Emails sent this week
    emails_week = await db.scalar(
        select(func.count(EmailNotificationLog.id)).where(
            EmailNotificationLog.created_at >= week_start
        )
    )

    # Failed emails today
    failed_today = await db.scalar(
        select(func.count(EmailNotificationLog.id)).where(
            EmailNotificationLog.created_at >= today_start,
            EmailNotificationLog.status.in_(["failed", "bounced"]),
        )
    )

    # Total notifications
    total_notifications = await db.scalar(select(func.count(Notification.id)))

    # Email delivery rate (delivered / (delivered + failed + bounced))
    delivered_count = await db.scalar(
        select(func.count(EmailNotificationLog.id)).where(
            EmailNotificationLog.status.in_(["sent", "delivered"])
        )
    )
    failed_count = await db.scalar(
        select(func.count(EmailNotificationLog.id)).where(
            EmailNotificationLog.status.in_(["failed", "bounced"])
        )
    )
    total_processed = (delivered_count or 0) + (failed_count or 0)
    delivery_rate = (delivered_count or 0) / total_processed if total_processed > 0 else 1.0

    return AdminDashboardStats(
        total_workspaces=workspace_count or 0,
        total_users=user_count or 0,
        total_emails_sent=total_emails or 0,
        total_notifications=total_notifications or 0,
        active_workspaces_30d=active_workspace_count or 0,
        email_delivery_rate=delivery_rate,
        emails_sent_today=emails_today or 0,
        emails_sent_this_week=emails_week or 0,
        emails_failed_today=failed_today or 0,
    )


@router.get("/emails", response_model=PaginatedEmailLogs)
async def list_email_logs(
    admin: Developer = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    status_filter: str | None = Query(None, description="Filter by status"),
    search: str | None = Query(None, description="Search by recipient email"),
    date_from: datetime | None = Query(None, description="Filter from date"),
    date_to: datetime | None = Query(None, description="Filter to date"),
) -> PaginatedEmailLogs:
    """Get paginated list of all email logs."""
    query = select(EmailNotificationLog).options(
        selectinload(EmailNotificationLog.notification)
    )

    # Apply filters
    if status_filter:
        query = query.where(EmailNotificationLog.status == status_filter)
    if search:
        query = query.where(EmailNotificationLog.recipient_email.ilike(f"%{search}%"))
    if date_from:
        query = query.where(EmailNotificationLog.created_at >= date_from)
    if date_to:
        query = query.where(EmailNotificationLog.created_at <= date_to)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query) or 0

    # Apply pagination and ordering
    offset = (page - 1) * per_page
    query = query.order_by(EmailNotificationLog.created_at.desc())
    query = query.offset(offset).limit(per_page)

    result = await db.execute(query)
    logs = result.scalars().all()

    items = []
    for log in logs:
        notification = log.notification
        workspace_id = None
        workspace_name = None
        notification_type = None

        if notification:
            notification_type = notification.event_type
            context = notification.context or {}
            workspace_id = context.get("workspace_id")
            workspace_name = context.get("workspace_name")

        items.append(
            EmailLogDetailResponse(
                id=log.id,
                notification_id=log.notification_id,
                recipient_email=log.recipient_email,
                subject=log.subject,
                template_name=log.template_name,
                body_preview=None,  # Don't expose full body for security
                ses_message_id=log.ses_message_id,
                status=log.status,
                error_message=log.error_message,
                sent_at=log.sent_at,
                created_at=log.created_at,
                workspace_id=workspace_id,
                workspace_name=workspace_name,
                notification_type=notification_type,
            )
        )

    return PaginatedEmailLogs(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        has_next=(page * per_page) < total,
    )


@router.get("/emails/{email_id}", response_model=EmailLogDetailResponse)
async def get_email_log(
    email_id: str,
    admin: Developer = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> EmailLogDetailResponse:
    """Get detailed email log by ID."""
    query = (
        select(EmailNotificationLog)
        .options(selectinload(EmailNotificationLog.notification))
        .where(EmailNotificationLog.id == email_id)
    )
    result = await db.execute(query)
    log = result.scalar_one_or_none()

    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email log not found",
        )

    notification = log.notification
    workspace_id = None
    workspace_name = None
    notification_type = None

    if notification:
        notification_type = notification.event_type
        context = notification.context or {}
        workspace_id = context.get("workspace_id")
        workspace_name = context.get("workspace_name")

    return EmailLogDetailResponse(
        id=log.id,
        notification_id=log.notification_id,
        recipient_email=log.recipient_email,
        subject=log.subject,
        template_name=log.template_name,
        body_preview=None,
        ses_message_id=log.ses_message_id,
        status=log.status,
        error_message=log.error_message,
        sent_at=log.sent_at,
        created_at=log.created_at,
        workspace_id=workspace_id,
        workspace_name=workspace_name,
        notification_type=notification_type,
    )


@router.post("/emails/{email_id}/resend", response_model=ResendEmailResponse)
async def resend_email(
    email_id: str,
    admin: Developer = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
) -> ResendEmailResponse:
    """Resend a failed email."""
    query = (
        select(EmailNotificationLog)
        .options(selectinload(EmailNotificationLog.notification))
        .where(EmailNotificationLog.id == email_id)
    )
    result = await db.execute(query)
    log = result.scalar_one_or_none()

    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Email log not found",
        )

    if log.status not in ["failed", "bounced"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only resend failed or bounced emails",
        )

    # Try to resend the email
    try:
        from aexy.services.email_service import EmailService

        email_service = EmailService()

        # Create new email log for the retry
        new_log = EmailNotificationLog(
            notification_id=log.notification_id,
            recipient_email=log.recipient_email,
            subject=log.subject,
            template_name=log.template_name,
            status="pending",
        )
        db.add(new_log)
        await db.flush()

        # Send the email
        success = await email_service.send_raw_email(
            to_email=log.recipient_email,
            subject=log.subject,
            html_body=f"<p>This is a resent email. Original subject: {log.subject}</p>",
        )

        if success:
            new_log.status = "sent"
            new_log.sent_at = datetime.now(timezone.utc)
            await db.commit()
            return ResendEmailResponse(
                success=True,
                message="Email resent successfully",
                new_email_log_id=new_log.id,
            )
        else:
            new_log.status = "failed"
            new_log.error_message = "Failed to send email"
            await db.commit()
            return ResendEmailResponse(
                success=False,
                message="Failed to resend email",
                new_email_log_id=new_log.id,
            )

    except Exception as e:
        logger.error(f"Failed to resend email {email_id}: {e}")
        await db.rollback()
        return ResendEmailResponse(
            success=False,
            message=f"Error resending email: {str(e)}",
        )


@router.get("/notifications", response_model=PaginatedNotifications)
async def list_notifications(
    admin: Developer = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    event_type: str | None = Query(None, description="Filter by event type"),
    search: str | None = Query(None, description="Search in title or body"),
) -> PaginatedNotifications:
    """Get paginated list of all notifications."""
    query = select(Notification).options(selectinload(Notification.recipient))

    # Apply filters
    if event_type:
        query = query.where(Notification.event_type == event_type)
    if search:
        query = query.where(
            Notification.title.ilike(f"%{search}%")
            | Notification.body.ilike(f"%{search}%")
        )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query) or 0

    # Apply pagination and ordering
    offset = (page - 1) * per_page
    query = query.order_by(Notification.created_at.desc())
    query = query.offset(offset).limit(per_page)

    result = await db.execute(query)
    notifications = result.scalars().all()

    items = []
    for notification in notifications:
        recipient = notification.recipient
        items.append(
            NotificationLogResponse(
                id=notification.id,
                recipient_id=notification.recipient_id,
                recipient_email=recipient.email if recipient else None,
                recipient_name=recipient.name if recipient else None,
                event_type=notification.event_type,
                title=notification.title,
                body=notification.body,
                context=notification.context or {},
                is_read=notification.is_read,
                email_sent=notification.email_sent,
                created_at=notification.created_at,
            )
        )

    return PaginatedNotifications(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        has_next=(page * per_page) < total,
    )


@router.get("/workspaces", response_model=PaginatedWorkspaces)
async def list_workspaces(
    admin: Developer = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    search: str | None = Query(None, description="Search by name or slug"),
    plan_tier: str | None = Query(None, description="Filter by plan tier"),
) -> PaginatedWorkspaces:
    """Get paginated list of all workspaces."""
    query = select(Workspace).options(
        selectinload(Workspace.owner),
        selectinload(Workspace.plan),
        selectinload(Workspace.members),
    )

    # Apply filters
    if search:
        query = query.where(
            Workspace.name.ilike(f"%{search}%") | Workspace.slug.ilike(f"%{search}%")
        )
    if plan_tier:
        from aexy.models.plan import Plan

        query = query.join(Workspace.plan).where(Plan.tier == plan_tier)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query) or 0

    # Apply pagination and ordering
    offset = (page - 1) * per_page
    query = query.order_by(Workspace.created_at.desc())
    query = query.offset(offset).limit(per_page)

    result = await db.execute(query)
    workspaces = result.scalars().unique().all()

    items = []
    for workspace in workspaces:
        owner = workspace.owner
        plan = workspace.plan
        items.append(
            WorkspaceAdminResponse(
                id=workspace.id,
                name=workspace.name,
                slug=workspace.slug,
                type=workspace.type,
                description=workspace.description,
                owner_id=workspace.owner_id,
                owner_email=owner.email if owner else None,
                owner_name=owner.name if owner else None,
                plan_tier=plan.tier if plan else None,
                member_count=len(workspace.members) if workspace.members else 0,
                is_active=workspace.is_active,
                created_at=workspace.created_at,
            )
        )

    return PaginatedWorkspaces(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        has_next=(page * per_page) < total,
    )


@router.get("/users", response_model=PaginatedUsers)
async def list_users(
    admin: Developer = Depends(get_platform_admin),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    search: str | None = Query(None, description="Search by email or name"),
) -> PaginatedUsers:
    """Get paginated list of all users."""
    query = select(Developer).options(
        selectinload(Developer.github_connection),
        selectinload(Developer.google_connection),
    )

    # Apply filters
    if search:
        query = query.where(
            Developer.email.ilike(f"%{search}%") | Developer.name.ilike(f"%{search}%")
        )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query) or 0

    # Apply pagination and ordering
    offset = (page - 1) * per_page
    query = query.order_by(Developer.created_at.desc())
    query = query.offset(offset).limit(per_page)

    result = await db.execute(query)
    users = result.scalars().all()

    # Get workspace counts for users
    workspace_counts: dict[str, int] = {}
    if users:
        user_ids = [u.id for u in users]
        counts_query = (
            select(
                WorkspaceMember.developer_id,
                func.count(WorkspaceMember.workspace_id).label("count"),
            )
            .where(WorkspaceMember.developer_id.in_(user_ids))
            .group_by(WorkspaceMember.developer_id)
        )
        counts_result = await db.execute(counts_query)
        for row in counts_result:
            workspace_counts[row.developer_id] = row.count

    items = []
    for user in users:
        items.append(
            UserAdminResponse(
                id=user.id,
                email=user.email,
                name=user.name,
                avatar_url=user.avatar_url,
                has_github=user.github_connection is not None,
                has_google=user.google_connection is not None,
                workspace_count=workspace_counts.get(user.id, 0),
                created_at=user.created_at,
            )
        )

    return PaginatedUsers(
        items=items,
        total=total,
        page=page,
        per_page=per_page,
        has_next=(page * per_page) < total,
    )
