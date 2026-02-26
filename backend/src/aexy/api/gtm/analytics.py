"""GTM Analytics API endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm import (
    PipelineAnalyticsResponse,
    ChannelAnalyticsResponse,
    AttributionAnalyticsResponse,
    SequenceComparisonAnalyticsResponse,
    TrendAnalyticsResponse,
    WeeklyReportResponse,
)

from ._shared import check_workspace_permission

router = APIRouter()


@router.get("/analytics/pipeline", response_model=PipelineAnalyticsResponse)
async def get_pipeline_analytics(
    workspace_id: str,
    days: int = Query(default=30, ge=1, le=365),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get pipeline analytics — lifecycle stage distribution and conversion rates."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.gtm_analytics_service import GTMAnalyticsService
    service = GTMAnalyticsService(db)
    return await service.get_pipeline_analytics(workspace_id, days=days)


@router.get("/analytics/channels", response_model=ChannelAnalyticsResponse)
async def get_channel_analytics(
    workspace_id: str,
    days: int = Query(default=30, ge=1, le=365),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get channel performance analytics — email, LinkedIn, SMS metrics."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.gtm_analytics_service import GTMAnalyticsService
    service = GTMAnalyticsService(db)
    return await service.get_channel_analytics(workspace_id, days=days)


@router.get("/analytics/attribution", response_model=AttributionAnalyticsResponse)
async def get_attribution_analytics(
    workspace_id: str,
    model: str = Query(default="linear", pattern="^(first_touch|last_touch|linear|u_shaped|time_decay)$"),
    days: int = Query(default=90, ge=1, le=365),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get multi-touch attribution analytics."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.gtm_analytics_service import GTMAnalyticsService
    service = GTMAnalyticsService(db)
    return await service.get_attribution_analytics(workspace_id, model=model, days=days)


@router.get("/analytics/sequences", response_model=SequenceComparisonAnalyticsResponse)
async def get_sequence_comparison_analytics(
    workspace_id: str,
    days: int = Query(default=30, ge=1, le=365),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get sequence comparison analytics."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.gtm_analytics_service import GTMAnalyticsService
    service = GTMAnalyticsService(db)
    return await service.get_sequence_analytics(workspace_id, days=days)


@router.get("/analytics/trends", response_model=TrendAnalyticsResponse)
async def get_trend_analytics(
    workspace_id: str,
    days: int = Query(default=30, ge=1, le=365),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get time-series trend analytics."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.gtm_analytics_service import GTMAnalyticsService
    service = GTMAnalyticsService(db)
    return await service.get_trend_analytics(workspace_id, days=days)


@router.get("/analytics/weekly-report", response_model=WeeklyReportResponse)
async def get_weekly_report(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get the latest weekly report data."""
    await check_workspace_permission(workspace_id, current_user, db)
    from aexy.services.gtm_analytics_service import GTMAnalyticsService
    service = GTMAnalyticsService(db)
    return await service.get_weekly_report_data(workspace_id)
