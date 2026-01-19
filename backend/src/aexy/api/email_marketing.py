"""Email Marketing API routes for templates, campaigns, and analytics."""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.services.template_service import TemplateService
from aexy.services.campaign_service import CampaignService
from aexy.services.workspace_service import WorkspaceService
from aexy.schemas.email_marketing import (
    # Template schemas
    EmailTemplateCreate,
    EmailTemplateUpdate,
    EmailTemplateResponse,
    EmailTemplateListResponse,
    TemplatePreviewRequest,
    TemplatePreviewResponse,
    # Campaign schemas
    EmailCampaignCreate,
    EmailCampaignUpdate,
    EmailCampaignResponse,
    EmailCampaignListResponse,
    CampaignScheduleRequest,
    CampaignTestRequest,
    # Recipient schemas
    CampaignRecipientResponse,
    RecipientListResponse,
    # Analytics schemas
    CampaignStatsResponse,
    CampaignTimelineResponse,
    CampaignLinksResponse,
    CampaignDevicesResponse,
    WorkspaceEmailOverview,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/email-marketing")


async def check_workspace_permission(
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
    required_role: str = "member",
) -> None:
    """Check if user has permission to access workspace."""
    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        workspace_id, developer_id, required_role
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for this workspace",
        )


# =============================================================================
# TEMPLATE ROUTES
# =============================================================================

@router.post("/templates", response_model=EmailTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    workspace_id: str,
    data: EmailTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a new email template."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = TemplateService(db)
    template = await service.create_template(
        workspace_id=workspace_id,
        data=data,
        created_by_id=current_user.id,
    )
    return template


@router.get("/templates", response_model=list[EmailTemplateListResponse])
async def list_templates(
    workspace_id: str,
    category: str | None = None,
    template_type: str | None = None,
    is_active: bool | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List email templates for a workspace."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = TemplateService(db)
    templates, _ = await service.list_templates(
        workspace_id=workspace_id,
        category=category,
        template_type=template_type,
        is_active=is_active,
        limit=limit,
        offset=skip,
    )
    return templates


@router.get("/templates/{template_id}", response_model=EmailTemplateResponse)
async def get_template(
    workspace_id: str,
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get an email template by ID."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = TemplateService(db)
    template = await service.get_template(template_id, workspace_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    return template


@router.patch("/templates/{template_id}", response_model=EmailTemplateResponse)
async def update_template(
    workspace_id: str,
    template_id: str,
    data: EmailTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Update an email template."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = TemplateService(db)
    template = await service.update_template(template_id, workspace_id, data)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    return template


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    workspace_id: str,
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete an email template."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = TemplateService(db)
    deleted = await service.delete_template(template_id, workspace_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )


@router.post("/templates/{template_id}/preview", response_model=TemplatePreviewResponse)
async def preview_template(
    workspace_id: str,
    template_id: str,
    data: TemplatePreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Preview a template with sample data."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = TemplateService(db)
    template = await service.get_template(template_id, workspace_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    return service.preview_template(template, data.context)


@router.post("/templates/{template_id}/duplicate", response_model=EmailTemplateResponse)
async def duplicate_template(
    workspace_id: str,
    template_id: str,
    name: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Duplicate an email template."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = TemplateService(db)
    template = await service.duplicate_template(
        template_id=template_id,
        workspace_id=workspace_id,
        new_name=name,
        created_by_id=current_user.id,
    )
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    return template


@router.post("/templates/{template_id}/validate")
async def validate_template(
    workspace_id: str,
    template_id: str,
    data: TemplatePreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Validate a template renders without errors."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = TemplateService(db)
    template = await service.get_template(template_id, workspace_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    errors = service.validate_template(template, data.context or None)
    return {"valid": len(errors) == 0, "errors": errors}


# =============================================================================
# CAMPAIGN ROUTES
# =============================================================================

@router.post("/campaigns", response_model=EmailCampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    workspace_id: str,
    data: EmailCampaignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Create a new email campaign."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CampaignService(db)
    campaign = await service.create_campaign(
        workspace_id=workspace_id,
        data=data,
        created_by_id=current_user.id,
    )
    return campaign


@router.get("/campaigns", response_model=list[EmailCampaignListResponse])
async def list_campaigns(
    workspace_id: str,
    status: str | None = None,
    campaign_type: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List email campaigns for a workspace."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CampaignService(db)
    campaigns, _ = await service.list_campaigns(
        workspace_id=workspace_id,
        status=status,
        campaign_type=campaign_type,
        limit=limit,
        offset=skip,
    )
    return campaigns


@router.get("/campaigns/{campaign_id}", response_model=EmailCampaignResponse)
async def get_campaign(
    workspace_id: str,
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get an email campaign by ID."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CampaignService(db)
    campaign = await service.get_campaign(campaign_id, workspace_id)
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )
    return campaign


@router.patch("/campaigns/{campaign_id}", response_model=EmailCampaignResponse)
async def update_campaign(
    workspace_id: str,
    campaign_id: str,
    data: EmailCampaignUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Update an email campaign."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CampaignService(db)
    try:
        campaign = await service.update_campaign(campaign_id, workspace_id, data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )
    return campaign


@router.delete("/campaigns/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(
    workspace_id: str,
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Delete an email campaign."""
    await check_workspace_permission(db, workspace_id, current_user.id, "admin")

    service = CampaignService(db)
    try:
        deleted = await service.delete_campaign(campaign_id, workspace_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )


@router.post("/campaigns/{campaign_id}/duplicate", response_model=EmailCampaignResponse)
async def duplicate_campaign(
    workspace_id: str,
    campaign_id: str,
    name: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Duplicate an email campaign."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CampaignService(db)
    campaign = await service.duplicate_campaign(
        campaign_id=campaign_id,
        workspace_id=workspace_id,
        new_name=name,
        created_by_id=current_user.id,
    )
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )
    return campaign


@router.post("/campaigns/{campaign_id}/schedule", response_model=EmailCampaignResponse)
async def schedule_campaign(
    workspace_id: str,
    campaign_id: str,
    data: CampaignScheduleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Schedule a campaign for sending."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CampaignService(db)
    try:
        campaign = await service.schedule_campaign(
            campaign_id=campaign_id,
            workspace_id=workspace_id,
            scheduled_at=data.scheduled_at,
            send_window=data.send_window.model_dump() if data.send_window else None,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )
    return campaign


@router.post("/campaigns/{campaign_id}/send", response_model=EmailCampaignResponse)
async def send_campaign(
    workspace_id: str,
    campaign_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Start sending a campaign immediately."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CampaignService(db)
    try:
        campaign = await service.start_sending(campaign_id, workspace_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    # Queue Celery task for actual sending
    from aexy.processing.email_marketing_tasks import send_campaign_task
    background_tasks.add_task(send_campaign_task.delay, campaign_id)

    return campaign


@router.post("/campaigns/{campaign_id}/pause", response_model=EmailCampaignResponse)
async def pause_campaign(
    workspace_id: str,
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Pause a sending campaign."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CampaignService(db)
    try:
        campaign = await service.pause_campaign(campaign_id, workspace_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )
    return campaign


@router.post("/campaigns/{campaign_id}/resume", response_model=EmailCampaignResponse)
async def resume_campaign(
    workspace_id: str,
    campaign_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Resume a paused campaign."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CampaignService(db)
    try:
        campaign = await service.resume_campaign(campaign_id, workspace_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    # Resume sending if it was in sending state
    if campaign.status == "sending":
        from aexy.processing.email_marketing_tasks import send_campaign_task
        background_tasks.add_task(send_campaign_task.delay, campaign_id)

    return campaign


@router.post("/campaigns/{campaign_id}/cancel", response_model=EmailCampaignResponse)
async def cancel_campaign(
    workspace_id: str,
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Cancel a campaign."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CampaignService(db)
    try:
        campaign = await service.cancel_campaign(campaign_id, workspace_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )
    return campaign


@router.post("/campaigns/{campaign_id}/test")
async def send_test_email(
    workspace_id: str,
    campaign_id: str,
    data: CampaignTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Send a test email for a campaign."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    campaign_service = CampaignService(db)
    template_service = TemplateService(db)

    campaign = await campaign_service.get_campaign_with_template(campaign_id, workspace_id)
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    if not campaign.template:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Campaign has no template",
        )

    # Merge campaign context with test context
    context = {**campaign.template_context, **data.context}

    # Render template
    subject, html_body, text_body = template_service.render_template(
        campaign.template, context
    )

    # Send test emails
    from aexy.services.email_service import email_service

    results = []
    for email in data.to_emails:
        log = await email_service.send_templated_email(
            db=db,
            recipient_email=email,
            subject=f"[TEST] {subject}",
            body_text=text_body or "",
            body_html=html_body,
        )
        results.append({
            "email": email,
            "status": log.status,
            "error": log.error_message,
        })

    return {"results": results}


@router.get("/campaigns/{campaign_id}/audience-count")
async def get_audience_count(
    workspace_id: str,
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get the estimated audience count for a campaign."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CampaignService(db)
    campaign = await service.get_campaign(campaign_id, workspace_id)
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    count = await service.calculate_audience(campaign)
    return {"count": count}


# =============================================================================
# RECIPIENT ROUTES
# =============================================================================

@router.get("/campaigns/{campaign_id}/recipients", response_model=RecipientListResponse)
async def list_recipients(
    workspace_id: str,
    campaign_id: str,
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """List recipients for a campaign."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CampaignService(db)

    # Verify campaign exists in workspace
    campaign = await service.get_campaign(campaign_id, workspace_id)
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    offset = (page - 1) * page_size
    recipients, total = await service.list_recipients(
        campaign_id=campaign_id,
        status=status,
        limit=page_size,
        offset=offset,
    )

    return RecipientListResponse(
        items=[CampaignRecipientResponse.model_validate(r) for r in recipients],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/campaigns/{campaign_id}/recipients/{recipient_id}", response_model=CampaignRecipientResponse)
async def get_recipient(
    workspace_id: str,
    campaign_id: str,
    recipient_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get a campaign recipient by ID."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    service = CampaignService(db)

    # Verify campaign exists in workspace
    campaign = await service.get_campaign(campaign_id, workspace_id)
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    recipient = await service.get_recipient(recipient_id, campaign_id)
    if not recipient:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipient not found",
        )
    return recipient


# =============================================================================
# ANALYTICS ROUTES
# =============================================================================

@router.get("/campaigns/{campaign_id}/analytics", response_model=CampaignStatsResponse)
async def get_campaign_analytics(
    workspace_id: str,
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get campaign analytics overview."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    from aexy.services.email_analytics_service import EmailAnalyticsService

    # Verify campaign exists in workspace
    campaign_service = CampaignService(db)
    campaign = await campaign_service.get_campaign(campaign_id, workspace_id)
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    analytics_service = EmailAnalyticsService(db)
    stats = await analytics_service.get_campaign_overview(campaign_id)

    return CampaignStatsResponse(
        campaign_id=campaign_id,
        total_recipients=stats.get("total_recipients", 0),
        sent_count=stats.get("sent_count", 0),
        delivered_count=stats.get("delivered_count", 0),
        open_count=stats.get("open_count", 0),
        unique_open_count=stats.get("unique_open_count", 0),
        click_count=stats.get("click_count", 0),
        unique_click_count=stats.get("unique_click_count", 0),
        bounce_count=stats.get("bounce_count", 0),
        unsubscribe_count=stats.get("unsubscribe_count", 0),
        complaint_count=stats.get("complaint_count", 0),
        delivery_rate=stats.get("delivery_rate"),
        open_rate=stats.get("open_rate"),
        click_rate=stats.get("click_rate"),
        click_to_open_rate=stats.get("click_to_open_rate"),
        bounce_rate=stats.get("bounce_rate"),
    )


@router.get("/campaigns/{campaign_id}/analytics/timeline", response_model=CampaignTimelineResponse)
async def get_campaign_timeline(
    workspace_id: str,
    campaign_id: str,
    granularity: str = Query("hour", pattern="^(hour|day)$"),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get campaign analytics timeline (opens/clicks over time)."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    from aexy.services.email_analytics_service import EmailAnalyticsService

    # Verify campaign exists in workspace
    campaign_service = CampaignService(db)
    campaign = await campaign_service.get_campaign(campaign_id, workspace_id)
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    analytics_service = EmailAnalyticsService(db)
    timeline = await analytics_service.get_campaign_timeline(
        campaign_id=campaign_id,
        granularity=granularity,  # type: ignore
    )

    return CampaignTimelineResponse(
        campaign_id=campaign_id,
        granularity=granularity,  # type: ignore
        data=timeline,
    )


@router.get("/campaigns/{campaign_id}/analytics/links", response_model=CampaignLinksResponse)
async def get_campaign_links(
    workspace_id: str,
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get campaign link click analytics."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    from aexy.services.email_analytics_service import EmailAnalyticsService

    # Verify campaign exists in workspace
    campaign_service = CampaignService(db)
    campaign = await campaign_service.get_campaign(campaign_id, workspace_id)
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    analytics_service = EmailAnalyticsService(db)
    links = await analytics_service.get_campaign_links(campaign_id)

    return CampaignLinksResponse(
        campaign_id=campaign_id,
        links=links,
    )


@router.get("/campaigns/{campaign_id}/analytics/devices", response_model=CampaignDevicesResponse)
async def get_campaign_devices(
    workspace_id: str,
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get campaign device/client analytics."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    from aexy.services.email_analytics_service import EmailAnalyticsService

    # Verify campaign exists in workspace
    campaign_service = CampaignService(db)
    campaign = await campaign_service.get_campaign(campaign_id, workspace_id)
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        )

    analytics_service = EmailAnalyticsService(db)
    device_stats = await analytics_service.get_campaign_device_breakdown(campaign_id)

    return device_stats


@router.get("/analytics/overview", response_model=WorkspaceEmailOverview)
async def get_workspace_email_overview(
    workspace_id: str,
    period: str = Query("30d", pattern="^(7d|30d|90d)$"),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get workspace email analytics overview."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    from aexy.services.email_analytics_service import EmailAnalyticsService

    analytics_service = EmailAnalyticsService(db)
    overview = await analytics_service.get_workspace_overview(
        workspace_id=workspace_id,
        period=period,
    )

    return overview


@router.get("/analytics/trends")
async def get_workspace_email_trends(
    workspace_id: str,
    period: str = Query("30d", pattern="^(7d|30d|90d)$"),
    granularity: str = Query("day", pattern="^(day|week)$"),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get workspace email trends over time."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    from aexy.services.email_analytics_service import EmailAnalyticsService

    analytics_service = EmailAnalyticsService(db)
    trends = await analytics_service.get_workspace_trends(
        workspace_id=workspace_id,
        period=period,
        granularity=granularity,  # type: ignore
    )

    return {"trends": trends}


@router.get("/analytics/top-campaigns")
async def get_top_campaigns(
    workspace_id: str,
    period: str = Query("30d", pattern="^(7d|30d|90d)$"),
    metric: str = Query("open_rate", pattern="^(open_rate|click_rate|sent_count)$"),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get top performing campaigns."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    from aexy.services.email_analytics_service import EmailAnalyticsService

    analytics_service = EmailAnalyticsService(db)
    campaigns = await analytics_service.get_top_campaigns(
        workspace_id=workspace_id,
        period=period,
        metric=metric,  # type: ignore
        limit=limit,
    )

    return {"campaigns": campaigns}


@router.get("/analytics/best-send-times")
async def get_best_send_times(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Developer = Depends(get_current_developer),
):
    """Get best send times based on historical engagement."""
    await check_workspace_permission(db, workspace_id, current_user.id, "member")

    from aexy.services.email_analytics_service import EmailAnalyticsService

    analytics_service = EmailAnalyticsService(db)
    send_times = await analytics_service.get_best_send_times(workspace_id)

    return send_times
