"""Analytics dashboard API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer_id
from aexy.core.database import get_db
from aexy.schemas.analytics import (
    SkillHeatmapRequest,
    SkillHeatmapData,
    ActivityHeatmapData,
    ProductivityRequest,
    ProductivityTrends,
    WorkloadRequest,
    WorkloadDistribution,
    CollaborationRequest,
    CollaborationGraph,
    DateRange,
)
from aexy.services.analytics_dashboard import AnalyticsDashboardService

router = APIRouter(prefix="/analytics")


@router.post("/heatmap/skills", response_model=SkillHeatmapData)
async def get_skill_heatmap(
    request: SkillHeatmapRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> SkillHeatmapData:
    """Generate a team skill heatmap.

    Returns skill proficiency levels for each developer across selected skills.
    """
    if not request.developer_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one developer ID is required",
        )

    service = AnalyticsDashboardService()
    return await service.generate_skill_heatmap(
        developer_ids=request.developer_ids,
        db=db,
        skills=request.skills,
        max_skills=request.max_skills,
    )


@router.get("/heatmap/activity/{developer_id}", response_model=ActivityHeatmapData)
async def get_activity_heatmap(
    developer_id: str,
    days: int = 365,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> ActivityHeatmapData:
    """Generate an activity heatmap for a developer.

    Returns contribution data by day of week and hour for the specified period.
    """
    if days < 1 or days > 365:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Days must be between 1 and 365",
        )

    service = AnalyticsDashboardService()
    return await service.generate_activity_heatmap(
        developer_id=developer_id,
        db=db,
        days=days,
    )


@router.post("/productivity", response_model=ProductivityTrends)
async def get_productivity_trends(
    request: ProductivityRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> ProductivityTrends:
    """Get productivity trends for developers.

    Returns commit counts, PR metrics, and review activity over time.
    """
    if not request.developer_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one developer ID is required",
        )

    service = AnalyticsDashboardService()
    return await service.get_productivity_trends(
        developer_ids=request.developer_ids,
        db=db,
        date_range=request.date_range,
        group_by=request.group_by,
    )


@router.post("/workload", response_model=WorkloadDistribution)
async def get_workload_distribution(
    request: WorkloadRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> WorkloadDistribution:
    """Get workload distribution across developers.

    Returns relative workload metrics for team capacity planning.
    """
    if not request.developer_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one developer ID is required",
        )

    service = AnalyticsDashboardService()
    return await service.get_workload_distribution(
        developer_ids=request.developer_ids,
        db=db,
        days=request.days,
    )


@router.post("/collaboration", response_model=CollaborationGraph)
async def get_collaboration_network(
    request: CollaborationRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> CollaborationGraph:
    """Get collaboration network for developers.

    Returns nodes (developers) and edges (collaboration relationships).
    """
    if not request.developer_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one developer ID is required",
        )

    service = AnalyticsDashboardService()
    return await service.get_collaboration_network(
        developer_ids=request.developer_ids,
        db=db,
        days=request.days,
    )
