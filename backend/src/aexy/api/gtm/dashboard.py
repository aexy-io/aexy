"""GTM Dashboard API endpoints."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm import (
    GTMDashboardOverview,
    GTMFunnelResponse,
    RecentVisitorsResponse,
)
from aexy.services.gtm_service import GTMDashboardService

from ._shared import check_workspace_permission

router = APIRouter()


@router.get("/dashboard/overview", response_model=GTMDashboardOverview)
async def get_dashboard_overview(
    workspace_id: str,
    days: int = Query(default=30, ge=1, le=365),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get dashboard overview KPIs."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMDashboardService(db)
    return await service.get_overview(workspace_id, days=days)


@router.get("/dashboard/funnel", response_model=GTMFunnelResponse)
async def get_dashboard_funnel(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get funnel stage data."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMDashboardService(db)
    stages = await service.get_funnel(workspace_id)
    return {"stages": stages}


@router.get("/dashboard/recent-visitors", response_model=RecentVisitorsResponse)
async def get_recent_visitors(
    workspace_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get recent identified visitors."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMDashboardService(db)
    visitors = await service.get_recent_visitors(workspace_id, limit=limit)
    return {"visitors": visitors}


@router.get("/dashboard/pipeline-metrics")
async def get_pipeline_metrics(
    workspace_id: str,
    days: int = Query(default=7, ge=1, le=90),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get GTM pipeline metrics: scoring, routing, outreach, and provider health."""
    from datetime import datetime, timedelta, timezone

    from aexy.models.gtm import LeadScore, VisitorSession
    from aexy.models.gtm_outreach import OutreachEnrollment, OutreachStepExecution
    from aexy.models.gtm_webhook import GTMProviderHealthMetric, GTMWebhook

    await check_workspace_permission(workspace_id, current_user, db)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    # Scoring pipeline
    total_scored = await db.scalar(
        select(func.count(LeadScore.id)).where(and_(
            LeadScore.workspace_id == workspace_id,
            LeadScore.last_scored_at >= cutoff,
        ))
    ) or 0
    avg_score = await db.scalar(
        select(func.avg(LeadScore.total_score)).where(and_(
            LeadScore.workspace_id == workspace_id,
            LeadScore.last_scored_at >= cutoff,
        ))
    )

    # Visitor sessions
    total_sessions = await db.scalar(
        select(func.count(VisitorSession.id)).where(and_(
            VisitorSession.workspace_id == workspace_id,
            VisitorSession.started_at >= cutoff,
        ))
    ) or 0
    identified_sessions = await db.scalar(
        select(func.count(VisitorSession.id)).where(and_(
            VisitorSession.workspace_id == workspace_id,
            VisitorSession.started_at >= cutoff,
            VisitorSession.identification_status != "anonymous",
        ))
    ) or 0

    # Outreach
    total_enrollments = await db.scalar(
        select(func.count(OutreachEnrollment.id)).where(and_(
            OutreachEnrollment.workspace_id == workspace_id,
            OutreachEnrollment.enrolled_at >= cutoff,
        ))
    ) or 0
    total_steps_executed = await db.scalar(
        select(func.count(OutreachStepExecution.id)).where(and_(
            OutreachStepExecution.workspace_id == workspace_id,
            OutreachStepExecution.sent_at >= cutoff,
        ))
    ) or 0

    # Provider health (latest hourly buckets)
    health_rows = (await db.execute(
        select(
            GTMProviderHealthMetric.provider_name,
            func.sum(GTMProviderHealthMetric.total_requests).label("total"),
            func.sum(GTMProviderHealthMetric.successful_requests).label("success"),
            func.sum(GTMProviderHealthMetric.failed_requests).label("failed"),
            func.avg(GTMProviderHealthMetric.avg_latency_ms).label("avg_latency"),
        ).where(and_(
            GTMProviderHealthMetric.workspace_id == workspace_id,
            GTMProviderHealthMetric.bucket_hour >= cutoff,
        )).group_by(GTMProviderHealthMetric.provider_name)
    )).all()

    provider_health = [
        {
            "provider": row[0],
            "total_requests": row[1] or 0,
            "successful_requests": row[2] or 0,
            "failed_requests": row[3] or 0,
            "avg_latency_ms": round(row[4] or 0),
        }
        for row in health_rows
    ]

    # Webhook delivery stats
    webhook_count = await db.scalar(
        select(func.count(GTMWebhook.id)).where(and_(
            GTMWebhook.workspace_id == workspace_id,
            GTMWebhook.is_active == True,  # noqa: E712
        ))
    ) or 0

    return {
        "period_days": days,
        "scoring": {
            "leads_scored": total_scored,
            "avg_score": round(avg_score or 0, 1),
        },
        "visitors": {
            "total_sessions": total_sessions,
            "identified_sessions": identified_sessions,
            "identification_rate": round(
                identified_sessions / total_sessions * 100, 1
            ) if total_sessions > 0 else 0,
        },
        "outreach": {
            "enrollments": total_enrollments,
            "steps_executed": total_steps_executed,
        },
        "provider_health": provider_health,
        "webhooks": {
            "active_count": webhook_count,
        },
    }
