"""GTM Dashboard API endpoints."""

from fastapi import APIRouter, Depends, Query
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
