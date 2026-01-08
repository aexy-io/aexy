"""Sprint Analytics API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.sprint import (
    BurndownDataResponse,
    VelocityTrendResponse,
    VelocityDataPoint,
    SprintMetricsResponse,
)
from aexy.services.sprint_service import SprintService
from aexy.services.sprint_analytics_service import SprintAnalyticsService
from aexy.services.workspace_service import WorkspaceService

router = APIRouter(tags=["Sprint Analytics"])


# Sprint-level analytics
@router.get("/sprints/{sprint_id}/burndown", response_model=BurndownDataResponse)
async def get_burndown_data(
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get burndown chart data for a sprint."""
    sprint_service = SprintService(db)
    workspace_service = WorkspaceService(db)
    analytics_service = SprintAnalyticsService(db)

    sprint = await sprint_service.get_sprint(sprint_id)
    if not sprint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sprint not found",
        )

    if not await workspace_service.check_permission(
        sprint.workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    data = await analytics_service.get_burndown_data(sprint_id)
    return BurndownDataResponse(**data)


@router.get("/sprints/{sprint_id}/metrics", response_model=list[SprintMetricsResponse])
async def get_sprint_metrics(
    sprint_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get all metrics snapshots for a sprint."""
    sprint_service = SprintService(db)
    workspace_service = WorkspaceService(db)

    sprint = await sprint_service.get_sprint(sprint_id)
    if not sprint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sprint not found",
        )

    if not await workspace_service.check_permission(
        sprint.workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    return [
        SprintMetricsResponse(
            id=str(m.id),
            sprint_id=str(m.sprint_id),
            snapshot_date=m.snapshot_date,
            total_points=m.total_points,
            completed_points=m.completed_points,
            remaining_points=m.remaining_points,
            total_tasks=m.total_tasks,
            completed_tasks=m.completed_tasks,
            in_progress_tasks=m.in_progress_tasks,
            blocked_tasks=m.blocked_tasks,
            ideal_burndown=m.ideal_burndown,
            actual_burndown=m.actual_burndown,
        )
        for m in (sprint.metrics or [])
    ]


# Team-level analytics
@router.get("/teams/{team_id}/velocity", response_model=VelocityTrendResponse)
async def get_team_velocity(
    team_id: str,
    num_sprints: int = 6,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get velocity trend for a team."""
    # Get team to verify workspace access
    from aexy.models.team import Team
    from sqlalchemy import select

    stmt = select(Team).where(Team.id == team_id)
    result = await db.execute(stmt)
    team = result.scalar_one_or_none()

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        team.workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    analytics_service = SprintAnalyticsService(db)
    data = await analytics_service.get_team_velocity(team_id, num_sprints)

    return VelocityTrendResponse(
        sprints=[
            VelocityDataPoint(
                sprint_id=s["sprint_id"],
                sprint_name=s["sprint_name"],
                committed=s["committed"],
                completed=s["completed"],
                carry_over=s["carry_over"],
                completion_rate=s["completion_rate"],
            )
            for s in data["sprints"]
        ],
        average_velocity=data["average_velocity"],
        trend=data["trend"],
    )


@router.get("/teams/{team_id}/velocity/predict")
async def predict_team_velocity(
    team_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Predict next sprint velocity for a team."""
    from aexy.models.team import Team
    from sqlalchemy import select

    stmt = select(Team).where(Team.id == team_id)
    result = await db.execute(stmt)
    team = result.scalar_one_or_none()

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        team.workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    analytics_service = SprintAnalyticsService(db)
    return await analytics_service.predict_velocity(team_id)


@router.get("/teams/{team_id}/carry-over")
async def get_carry_over_analysis(
    team_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get carry-over analysis for a team."""
    from aexy.models.team import Team
    from sqlalchemy import select

    stmt = select(Team).where(Team.id == team_id)
    result = await db.execute(stmt)
    team = result.scalar_one_or_none()

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        team.workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    analytics_service = SprintAnalyticsService(db)
    return await analytics_service.get_carry_over_analysis(team_id)


@router.get("/teams/{team_id}/carry-over/chronic")
async def get_chronic_carry_over(
    team_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Identify tasks that frequently get carried over."""
    from aexy.models.team import Team
    from sqlalchemy import select

    stmt = select(Team).where(Team.id == team_id)
    result = await db.execute(stmt)
    team = result.scalar_one_or_none()

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        team.workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    analytics_service = SprintAnalyticsService(db)
    return await analytics_service.identify_chronic_carry_over(team_id)


@router.get("/teams/{team_id}/health")
async def get_team_health(
    team_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get team health metrics."""
    from aexy.models.team import Team
    from sqlalchemy import select

    stmt = select(Team).where(Team.id == team_id)
    result = await db.execute(stmt)
    team = result.scalar_one_or_none()

    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team not found",
        )

    workspace_service = WorkspaceService(db)
    if not await workspace_service.check_permission(
        team.workspace_id, str(current_user.id), "viewer"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    analytics_service = SprintAnalyticsService(db)
    return await analytics_service.get_team_health_metrics(team_id)
