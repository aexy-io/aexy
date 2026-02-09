"""Developer Insights API endpoints.

Provides developer and team performance metrics:
- Individual developer insights (velocity, efficiency, quality, sustainability, collaboration)
- Historical trend data
- Team-wide insights with workload distribution
- Side-by-side developer comparison
- Leaderboard
- Snapshot generation trigger
"""

import csv
import io
import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer_id
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.models.developer_insights import PeriodType
from aexy.models.workspace import WorkspaceMember
from aexy.models.team import TeamMember
from aexy.models.project import ProjectMember
from aexy.models.developer_insights import InsightSettings, DeveloperWorkingSchedule, InsightAlertRule, InsightAlertHistory
from aexy.schemas.developer_insights import (
    DeveloperInsightsResponse,
    DeveloperSnapshotResponse,
    LeaderboardEntry,
    LeaderboardResponse,
    PeriodTypeParam,
    SnapshotGenerateRequest,
    SnapshotGenerateResponse,
    TeamAggregate,
    TeamDistribution as TeamDistributionSchema,
    TeamInsightsResponse,
    MemberSummary as MemberSummarySchema,
    VelocityMetrics as VelocitySchema,
    EfficiencyMetrics as EfficiencySchema,
    QualityMetrics as QualitySchema,
    SustainabilityMetrics as SustainabilitySchema,
    CollaborationMetrics as CollaborationSchema,
    SprintProductivityMetrics as SprintSchema,
    InsightSettingsCreate,
    InsightSettingsUpdate,
    InsightSettingsResponse,
    DeveloperWorkingScheduleCreate,
    DeveloperWorkingScheduleResponse,
    AlertRuleCreate,
    AlertRuleUpdate,
    AlertRuleResponse,
    AlertHistoryResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/insights",
    tags=["developer-insights"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_insights_cache():
    """Return the InsightsCache singleton (or None if Redis unavailable)."""
    from aexy.cache.insights_cache import get_insights_cache
    return get_insights_cache()


def _period_type_to_enum(pt: PeriodTypeParam) -> PeriodType:
    return PeriodType(pt.value)


def _default_range(period_type: PeriodTypeParam) -> tuple[datetime, datetime]:
    """Return sensible default start/end for a period type."""
    now = datetime.now(timezone.utc)
    if period_type == PeriodTypeParam.daily:
        start = now - timedelta(days=1)
    elif period_type == PeriodTypeParam.weekly:
        start = now - timedelta(weeks=1)
    elif period_type == PeriodTypeParam.sprint:
        start = now - timedelta(weeks=2)
    else:  # monthly
        start = now - timedelta(days=30)
    return start, now


def _validate_date_range(start_date: datetime, end_date: datetime) -> None:
    """Validate that start_date < end_date and range is not excessively large."""
    if start_date >= end_date:
        raise HTTPException(status_code=400, detail="start_date must be before end_date")
    max_range = timedelta(days=365)
    if (end_date - start_date) > max_range:
        raise HTTPException(status_code=400, detail="Date range cannot exceed 365 days")


async def verify_workspace_membership(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
) -> str:
    """Verify the caller is a member of the workspace. Returns developer_id."""
    stmt = select(WorkspaceMember.developer_id).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.developer_id == developer_id,
    )
    result = await db.execute(stmt)
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this workspace")
    return developer_id


async def _get_workspace_developer_ids(
    db: AsyncSession, workspace_id: str
) -> list[str]:
    stmt = select(WorkspaceMember.developer_id).where(
        WorkspaceMember.workspace_id == workspace_id
    )
    result = await db.execute(stmt)
    return [row[0] for row in result.all()]


async def _get_team_developer_ids(
    db: AsyncSession, team_id: str
) -> list[str]:
    stmt = select(TeamMember.developer_id).where(
        TeamMember.team_id == team_id
    )
    result = await db.execute(stmt)
    return [row[0] for row in result.all()]


async def _get_project_developer_ids(
    db: AsyncSession, project_id: str
) -> list[str]:
    stmt = select(ProjectMember.developer_id).where(
        and_(
            ProjectMember.project_id == project_id,
            ProjectMember.status == "active",
        )
    )
    result = await db.execute(stmt)
    return [row[0] for row in result.all()]


# ---------------------------------------------------------------------------
# Individual Developer Insights
# ---------------------------------------------------------------------------

@router.get("/developers/{dev_id}", response_model=DeveloperInsightsResponse)
async def get_developer_insights(
    workspace_id: str,
    dev_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    compare_previous: bool = Query(default=False),
):
    """Get individual developer insights for a given period."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    service = DeveloperInsightsService(db)

    velocity = await service.compute_velocity_metrics(dev_id, start_date, end_date)
    efficiency = await service.compute_efficiency_metrics(dev_id, start_date, end_date)
    quality = await service.compute_quality_metrics(dev_id, start_date, end_date)
    sustainability = await service.compute_sustainability_metrics(dev_id, start_date, end_date, workspace_id=workspace_id)
    collaboration = await service.compute_collaboration_metrics(dev_id, start_date, end_date)
    sprint = await service.compute_sprint_metrics(dev_id, start_date, end_date)

    response = DeveloperInsightsResponse(
        developer_id=dev_id,
        workspace_id=workspace_id,
        period_start=start_date,
        period_end=end_date,
        period_type=period_type.value,
        velocity=VelocitySchema(**velocity.to_dict()),
        efficiency=EfficiencySchema(**efficiency.to_dict()),
        quality=QualitySchema(**quality.to_dict()),
        sustainability=SustainabilitySchema(**sustainability.to_dict()),
        collaboration=CollaborationSchema(**collaboration.to_dict()),
        sprint=SprintSchema(**sprint.to_dict()),
        raw_counts={
            "commits": velocity.commits_count,
            "prs_merged": velocity.prs_merged,
            "reviews_given": collaboration.review_given_count,
        },
        computed_at=datetime.now(timezone.utc),
    )

    if compare_previous:
        delta = end_date - start_date
        prev_start = start_date - delta
        prev_end = start_date

        prev_velocity = await service.compute_velocity_metrics(dev_id, prev_start, prev_end)
        prev_efficiency = await service.compute_efficiency_metrics(dev_id, prev_start, prev_end)
        prev_quality = await service.compute_quality_metrics(dev_id, prev_start, prev_end)
        prev_sustainability = await service.compute_sustainability_metrics(dev_id, prev_start, prev_end, workspace_id=workspace_id)
        prev_collaboration = await service.compute_collaboration_metrics(dev_id, prev_start, prev_end)
        prev_sprint = await service.compute_sprint_metrics(dev_id, prev_start, prev_end)

        response.previous = DeveloperInsightsResponse(
            developer_id=dev_id,
            workspace_id=workspace_id,
            period_start=prev_start,
            period_end=prev_end,
            period_type=period_type.value,
            velocity=VelocitySchema(**prev_velocity.to_dict()),
            efficiency=EfficiencySchema(**prev_efficiency.to_dict()),
            quality=QualitySchema(**prev_quality.to_dict()),
            sustainability=SustainabilitySchema(**prev_sustainability.to_dict()),
            collaboration=CollaborationSchema(**prev_collaboration.to_dict()),
            sprint=SprintSchema(**prev_sprint.to_dict()),
        )

    return response


# ---------------------------------------------------------------------------
# Historical Trends
# ---------------------------------------------------------------------------

@router.get("/developers/{dev_id}/forecast")
async def get_velocity_forecast(
    workspace_id: str,
    dev_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    periods_back: int = Query(default=6, ge=2, le=24),
):
    """Forecast next period velocity using weighted moving average on historical snapshots."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    service = DeveloperInsightsService(db)
    result = await service.forecast_velocity(
        dev_id, _period_type_to_enum(period_type), periods_back
    )

    return {
        "developer_id": dev_id,
        "workspace_id": workspace_id,
        "period_type": period_type.value,
        **result,
    }


@router.get("/developers/{dev_id}/gaming-flags")
async def get_gaming_flags(
    workspace_id: str,
    dev_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Detect potential metric gaming patterns for a developer."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    service = DeveloperInsightsService(db)
    result = await service.detect_gaming_patterns(dev_id, start_date, end_date)

    return {
        "developer_id": dev_id,
        "workspace_id": workspace_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        **result,
    }


@router.get("/developers/{dev_id}/code-churn")
async def get_developer_code_churn(
    workspace_id: str,
    dev_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    churn_window_days: int = Query(default=7, ge=1, le=30),
):
    """Get code churn/rework analysis for a developer."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    service = DeveloperInsightsService(db)
    result = await service.compute_code_churn(dev_id, start_date, end_date, churn_window_days)

    return {
        "developer_id": dev_id,
        "workspace_id": workspace_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        "churn_window_days": churn_window_days,
        **result,
    }


@router.get("/developers/{dev_id}/pr-sizes")
async def get_developer_pr_sizes(
    workspace_id: str,
    dev_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Get PR size analysis and categorization for a developer."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    service = DeveloperInsightsService(db)
    result = await service.compute_pr_size_distribution(dev_id, start_date, end_date)

    return {
        "developer_id": dev_id,
        "workspace_id": workspace_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        **result,
    }


@router.get("/developers/{dev_id}/health-score")
async def get_developer_health_score(
    workspace_id: str,
    dev_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Get composite health score for a developer."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    service = DeveloperInsightsService(db)
    result = await service.compute_health_score(dev_id, start_date, end_date, workspace_id=workspace_id)

    return {
        "developer_id": dev_id,
        "workspace_id": workspace_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        **result,
    }


@router.get("/developers/{dev_id}/percentile")
async def get_developer_percentile(
    workspace_id: str,
    dev_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    team_id: str | None = Query(default=None),
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Get percentile rankings for a developer within their peer group."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    if team_id:
        peer_ids = await _get_team_developer_ids(db, team_id)
    else:
        peer_ids = await _get_workspace_developer_ids(db, workspace_id)

    if not peer_ids:
        raise HTTPException(status_code=404, detail="No peers found")

    service = DeveloperInsightsService(db)
    rankings = await service.compute_percentile_rankings(dev_id, peer_ids, start_date, end_date)

    return {
        "developer_id": dev_id,
        "workspace_id": workspace_id,
        "team_id": team_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        "peer_count": len(peer_ids),
        "rankings": rankings,
    }


@router.get("/developers/{dev_id}/role-benchmark")
async def get_role_benchmark(
    workspace_id: str,
    dev_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Get developer metrics benchmarked against peers with the same engineering role."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    service = DeveloperInsightsService(db)
    result = await service.compute_role_benchmarks(dev_id, workspace_id, start_date, end_date)

    return {
        "developer_id": dev_id,
        "workspace_id": workspace_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        **result,
    }


@router.get("/developers/{dev_id}/trends", response_model=list[DeveloperSnapshotResponse])
async def get_developer_trends(
    workspace_id: str,
    dev_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    limit: int = Query(default=12, ge=1, le=52),
):
    """Get historical trend data from saved snapshots."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    service = DeveloperInsightsService(db)
    snapshots = await service.get_developer_snapshots(
        dev_id, _period_type_to_enum(period_type), limit
    )

    return [
        DeveloperSnapshotResponse(
            id=s.id,
            developer_id=s.developer_id,
            workspace_id=s.workspace_id,
            period_start=s.period_start,
            period_end=s.period_end,
            period_type=s.period_type.value if isinstance(s.period_type, PeriodType) else s.period_type,
            velocity_metrics=s.velocity_metrics,
            efficiency_metrics=s.efficiency_metrics,
            quality_metrics=s.quality_metrics,
            sustainability_metrics=s.sustainability_metrics,
            collaboration_metrics=s.collaboration_metrics,
            raw_counts=s.raw_counts,
            computed_at=s.computed_at,
        )
        for s in snapshots
    ]


# ---------------------------------------------------------------------------
# Team Insights
# ---------------------------------------------------------------------------

@router.get("/team", response_model=TeamInsightsResponse)
async def get_team_insights(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    team_id: str | None = Query(default=None),
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Get team-wide insights with workload distribution."""
    from aexy.services.developer_insights_service import DeveloperInsightsService
    from aexy.cache.insights_cache import InsightsCache

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    # --- cache check ---
    cache = _get_insights_cache()
    cache_key = InsightsCache.make_key(
        workspace_id, "team",
        team_id=team_id, period_type=period_type.value,
        start_date=start_date, end_date=end_date,
    )
    if cache:
        cached = await cache.get(cache_key)
        if cached is not None:
            return cached

    if team_id:
        dev_ids = await _get_team_developer_ids(db, team_id)
    else:
        dev_ids = await _get_workspace_developer_ids(db, workspace_id)

    if not dev_ids:
        raise HTTPException(status_code=404, detail="No team members found")

    service = DeveloperInsightsService(db)
    distribution = await service.compute_team_distribution(dev_ids, start_date, end_date)

    total_commits = sum(m.commits_count for m in distribution.member_metrics)
    total_prs = sum(m.prs_merged for m in distribution.member_metrics)
    total_lines = sum(m.lines_changed for m in distribution.member_metrics)
    total_reviews = sum(m.reviews_given for m in distribution.member_metrics)

    response = TeamInsightsResponse(
        workspace_id=workspace_id,
        team_id=team_id,
        period_start=start_date,
        period_end=end_date,
        period_type=period_type.value,
        member_count=len(dev_ids),
        aggregate=TeamAggregate(
            total_commits=total_commits,
            total_prs_merged=total_prs,
            total_lines_changed=total_lines,
            total_reviews=total_reviews,
            avg_commits_per_member=round(total_commits / len(dev_ids), 2) if dev_ids else 0,
            avg_prs_per_member=round(total_prs / len(dev_ids), 2) if dev_ids else 0,
        ),
        distribution=TeamDistributionSchema(
            gini_coefficient=distribution.gini_coefficient,
            top_contributor_share=distribution.top_contributor_share,
            member_metrics=[
                MemberSummarySchema(**m.to_dict()) for m in distribution.member_metrics
            ],
            bottleneck_developers=distribution.bottleneck_developers,
        ),
        computed_at=datetime.now(timezone.utc),
    )

    # --- cache store ---
    if cache:
        await cache.set(cache_key, response.model_dump(mode="json"))

    return response


# ---------------------------------------------------------------------------
# Team CSV Export
# ---------------------------------------------------------------------------

@router.get("/team/export-csv")
async def export_team_csv(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Export team velocity metrics as a CSV file."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    dev_ids = await _get_workspace_developer_ids(db, workspace_id)
    if not dev_ids:
        raise HTTPException(status_code=404, detail="No team members found")

    service = DeveloperInsightsService(db)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "developer_id",
        "commits",
        "prs_merged",
        "lines_added",
        "lines_removed",
        "commit_frequency",
        "pr_throughput",
        "avg_commit_size",
    ])

    for dev_id in dev_ids:
        velocity = await service.compute_velocity_metrics(dev_id, start_date, end_date)
        writer.writerow([
            dev_id,
            velocity.commits_count,
            velocity.prs_merged,
            velocity.lines_added,
            velocity.lines_removed,
            round(velocity.commit_frequency, 2),
            round(velocity.pr_throughput, 2),
            round(velocity.avg_commit_size, 2),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=insights-export.csv"},
    )


# ---------------------------------------------------------------------------
# Team Compare (side-by-side)
# ---------------------------------------------------------------------------

@router.get("/team/compare", response_model=list[DeveloperInsightsResponse])
async def compare_developers(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    developer_ids: str = Query(description="Comma-separated developer IDs"),
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Side-by-side comparison of multiple developers."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    ids = [d.strip() for d in developer_ids.split(",") if d.strip()]
    if not ids:
        raise HTTPException(status_code=400, detail="No developer IDs provided")
    if len(ids) > 10:
        raise HTTPException(status_code=400, detail="Max 10 developers for comparison")

    service = DeveloperInsightsService(db)
    results = []

    for dev_id in ids:
        velocity = await service.compute_velocity_metrics(dev_id, start_date, end_date)
        efficiency = await service.compute_efficiency_metrics(dev_id, start_date, end_date)
        quality = await service.compute_quality_metrics(dev_id, start_date, end_date)
        sustainability = await service.compute_sustainability_metrics(dev_id, start_date, end_date, workspace_id=workspace_id)
        collaboration = await service.compute_collaboration_metrics(dev_id, start_date, end_date)
        sprint = await service.compute_sprint_metrics(dev_id, start_date, end_date)

        results.append(DeveloperInsightsResponse(
            developer_id=dev_id,
            workspace_id=workspace_id,
            period_start=start_date,
            period_end=end_date,
            period_type=period_type.value,
            velocity=VelocitySchema(**velocity.to_dict()),
            efficiency=EfficiencySchema(**efficiency.to_dict()),
            quality=QualitySchema(**quality.to_dict()),
            sustainability=SustainabilitySchema(**sustainability.to_dict()),
            collaboration=CollaborationSchema(**collaboration.to_dict()),
            sprint=SprintSchema(**sprint.to_dict()),
        ))

    return results


# ---------------------------------------------------------------------------
# Leaderboard
# ---------------------------------------------------------------------------

@router.get("/team/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    metric: str = Query(default="commits", description="commits|prs_merged|lines_changed|reviews_given"),
    team_id: str | None = Query(default=None),
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
):
    """Ranked metrics view for team members."""
    from aexy.services.developer_insights_service import DeveloperInsightsService
    from aexy.cache.insights_cache import InsightsCache

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    # --- cache check ---
    cache = _get_insights_cache()
    cache_key = InsightsCache.make_key(
        workspace_id, "leaderboard",
        team_id=team_id, metric=metric, period_type=period_type.value,
        start_date=start_date, end_date=end_date, limit=limit,
    )
    if cache:
        cached = await cache.get(cache_key)
        if cached is not None:
            return cached

    if team_id:
        dev_ids = await _get_team_developer_ids(db, team_id)
    else:
        dev_ids = await _get_workspace_developer_ids(db, workspace_id)

    if not dev_ids:
        raise HTTPException(status_code=404, detail="No team members found")

    service = DeveloperInsightsService(db)
    distribution = await service.compute_team_distribution(dev_ids, start_date, end_date)

    # Map metric name to member field
    metric_map = {
        "commits": "commits_count",
        "prs_merged": "prs_merged",
        "lines_changed": "lines_changed",
        "reviews_given": "reviews_given",
    }

    field_name = metric_map.get(metric, "commits_count")

    # Get developer names (batch)
    dev_names_stmt = select(Developer.id, Developer.name).where(Developer.id.in_(dev_ids))
    dev_names_result = await db.execute(dev_names_stmt)
    dev_names: dict[str, str | None] = {row[0]: row[1] for row in dev_names_result.all()}

    entries = []
    for m in distribution.member_metrics:
        value = getattr(m, field_name, 0)
        entries.append(LeaderboardEntry(
            developer_id=m.developer_id,
            developer_name=dev_names.get(m.developer_id),
            value=float(value),
        ))

    entries.sort(key=lambda e: e.value, reverse=True)
    for i, e in enumerate(entries):
        e.rank = i + 1

    response = LeaderboardResponse(
        metric=metric,
        period_type=period_type.value,
        period_start=start_date,
        period_end=end_date,
        entries=entries[:limit],
    )

    # --- cache store ---
    if cache:
        await cache.set(cache_key, response.model_dump(mode="json"))

    return response


# ---------------------------------------------------------------------------
# Snapshot Generation
# ---------------------------------------------------------------------------

@router.post("/snapshots/generate", response_model=SnapshotGenerateResponse)
async def generate_snapshots(
    workspace_id: str,
    request: SnapshotGenerateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
):
    """Trigger snapshot computation for developers and optionally a team."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    service = DeveloperInsightsService(db)
    pt = _period_type_to_enum(request.period_type)

    # Determine developer IDs
    if request.developer_ids:
        dev_ids = request.developer_ids
    elif request.team_id:
        dev_ids = await _get_team_developer_ids(db, request.team_id)
    else:
        dev_ids = await _get_workspace_developer_ids(db, workspace_id)

    if not dev_ids:
        raise HTTPException(status_code=404, detail="No developers found")

    # Generate developer snapshots
    dev_count = 0
    for dev_id in dev_ids:
        await service.save_developer_snapshot(
            dev_id, workspace_id, pt, request.start_date, request.end_date
        )
        dev_count += 1

    # Generate team snapshot
    team_created = False
    if request.team_id or len(dev_ids) > 1:
        await service.save_team_snapshot(
            workspace_id, request.team_id, pt, request.start_date, request.end_date, dev_ids
        )
        team_created = True

    await db.commit()

    # --- invalidate insights cache for this workspace ---
    cache = _get_insights_cache()
    if cache:
        await cache.invalidate(f"aexy:insights:ws:{workspace_id}:*")

    return SnapshotGenerateResponse(
        developer_snapshots_created=dev_count,
        team_snapshot_created=team_created,
    )


# ---------------------------------------------------------------------------
# Rotation Impact Forecasting
# ---------------------------------------------------------------------------

@router.post("/team/rotation-impact")
async def get_rotation_impact(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    rotating_developer_ids: str = Query(description="Comma-separated developer IDs rotating off"),
    team_id: str | None = Query(default=None),
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Predict velocity impact when specific developers rotate off the team."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    if team_id:
        dev_ids = await _get_team_developer_ids(db, team_id)
    else:
        dev_ids = await _get_workspace_developer_ids(db, workspace_id)

    if not dev_ids:
        raise HTTPException(status_code=404, detail="No team members found")

    rotating_ids = [d.strip() for d in rotating_developer_ids.split(",") if d.strip()]
    if not rotating_ids:
        raise HTTPException(status_code=400, detail="No rotating developer IDs provided")

    service = DeveloperInsightsService(db)
    result = await service.compute_rotation_impact(dev_ids, rotating_ids, start_date, end_date)

    return {
        "workspace_id": workspace_id,
        "team_id": team_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        **result,
    }


# ---------------------------------------------------------------------------
# GDPR Data Export
# ---------------------------------------------------------------------------

@router.get("/developers/{dev_id}/export")
async def export_developer_data(
    workspace_id: str,
    dev_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
):
    """Export all personal insight data for a developer (GDPR compliance)."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    service = DeveloperInsightsService(db)
    result = await service.export_developer_data(dev_id, workspace_id)

    return result


# ---------------------------------------------------------------------------
# Sprint Capacity Estimation
# ---------------------------------------------------------------------------

@router.get("/team/sprint-capacity")
async def get_sprint_capacity(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    team_id: str | None = Query(default=None),
    sprint_length_days: int = Query(default=14, ge=7, le=30),
    periods_back: int = Query(default=4, ge=2, le=12),
):
    """Estimate next sprint capacity based on historical velocity."""
    from aexy.services.developer_insights_service import DeveloperInsightsService
    from aexy.cache.insights_cache import InsightsCache

    # --- cache check ---
    cache = _get_insights_cache()
    cache_key = InsightsCache.make_key(
        workspace_id, "sprint_capacity",
        team_id=team_id, sprint_length_days=sprint_length_days,
        periods_back=periods_back,
    )
    if cache:
        cached = await cache.get(cache_key)
        if cached is not None:
            return cached

    if team_id:
        dev_ids = await _get_team_developer_ids(db, team_id)
    else:
        dev_ids = await _get_workspace_developer_ids(db, workspace_id)

    if not dev_ids:
        raise HTTPException(status_code=404, detail="No team members found")

    service = DeveloperInsightsService(db)
    result = await service.estimate_sprint_capacity(
        workspace_id, team_id, dev_ids, sprint_length_days, periods_back
    )

    response = {
        "workspace_id": workspace_id,
        **result,
    }

    # --- cache store ---
    if cache:
        await cache.set(cache_key, response)

    return response


# ---------------------------------------------------------------------------
# Executive Summary
# ---------------------------------------------------------------------------

@router.get("/executive/summary")
async def get_executive_summary(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Get org-wide executive summary with health, risks, and top contributors."""
    from aexy.services.developer_insights_service import DeveloperInsightsService
    from aexy.cache.insights_cache import InsightsCache

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    # --- cache check ---
    cache = _get_insights_cache()
    cache_key = InsightsCache.make_key(
        workspace_id, "executive_summary",
        period_type=period_type.value,
        start_date=start_date, end_date=end_date,
    )
    if cache:
        cached = await cache.get(cache_key)
        if cached is not None:
            return cached

    service = DeveloperInsightsService(db)
    result = await service.compute_executive_summary(workspace_id, start_date, end_date)

    response = {
        "workspace_id": workspace_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        **result,
    }

    # --- cache store ---
    if cache:
        await cache.set(cache_key, response)

    return response


# ---------------------------------------------------------------------------
# Bus Factor
# ---------------------------------------------------------------------------

@router.get("/team/bus-factor")
async def get_bus_factor(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    team_id: str | None = Query(default=None),
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    threshold: float = Query(default=0.8, ge=0.5, le=1.0),
):
    """Get bus factor analysis per repository for team or workspace."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    if team_id:
        dev_ids = await _get_team_developer_ids(db, team_id)
    else:
        dev_ids = await _get_workspace_developer_ids(db, workspace_id)

    if not dev_ids:
        raise HTTPException(status_code=404, detail="No team members found")

    service = DeveloperInsightsService(db)
    bus_factors = await service.compute_bus_factor(dev_ids, start_date, end_date, threshold)

    return {
        "workspace_id": workspace_id,
        "team_id": team_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        "threshold": threshold,
        "repositories": bus_factors,
    }


# ---------------------------------------------------------------------------
# Project-level Insights
# ---------------------------------------------------------------------------

@router.get("/projects/{project_id}", response_model=TeamInsightsResponse)
async def get_project_insights(
    workspace_id: str,
    project_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Get project-level insights aggregated across all project members."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    dev_ids = await _get_project_developer_ids(db, project_id)
    if not dev_ids:
        raise HTTPException(status_code=404, detail="No project members found")

    service = DeveloperInsightsService(db)
    distribution = await service.compute_team_distribution(dev_ids, start_date, end_date)

    total_commits = sum(m.commits_count for m in distribution.member_metrics)
    total_prs = sum(m.prs_merged for m in distribution.member_metrics)
    total_lines = sum(m.lines_changed for m in distribution.member_metrics)
    total_reviews = sum(m.reviews_given for m in distribution.member_metrics)

    return TeamInsightsResponse(
        workspace_id=workspace_id,
        team_id=project_id,
        period_start=start_date,
        period_end=end_date,
        period_type=period_type.value,
        member_count=len(dev_ids),
        aggregate=TeamAggregate(
            total_commits=total_commits,
            total_prs_merged=total_prs,
            total_lines_changed=total_lines,
            total_reviews=total_reviews,
            avg_commits_per_member=round(total_commits / len(dev_ids), 2) if dev_ids else 0,
            avg_prs_per_member=round(total_prs / len(dev_ids), 2) if dev_ids else 0,
        ),
        distribution=TeamDistributionSchema(
            gini_coefficient=distribution.gini_coefficient,
            top_contributor_share=distribution.top_contributor_share,
            member_metrics=[
                MemberSummarySchema(**m.to_dict()) for m in distribution.member_metrics
            ],
            bottleneck_developers=distribution.bottleneck_developers,
        ),
        computed_at=datetime.now(timezone.utc),
    )


@router.get("/projects/{project_id}/leaderboard", response_model=LeaderboardResponse)
async def get_project_leaderboard(
    workspace_id: str,
    project_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    metric: str = Query(default="commits"),
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
):
    """Ranked metrics view for project members."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    dev_ids = await _get_project_developer_ids(db, project_id)
    if not dev_ids:
        raise HTTPException(status_code=404, detail="No project members found")

    service = DeveloperInsightsService(db)
    distribution = await service.compute_team_distribution(dev_ids, start_date, end_date)

    metric_map = {
        "commits": "commits_count",
        "prs_merged": "prs_merged",
        "lines_changed": "lines_changed",
        "reviews_given": "reviews_given",
    }
    field_name = metric_map.get(metric, "commits_count")

    dev_names: dict[str, str | None] = {}
    for did in dev_ids:
        dev_stmt = select(Developer.name).where(Developer.id == did)
        dev_result = await db.execute(dev_stmt)
        dev_names[did] = dev_result.scalar()

    entries = []
    for m in distribution.member_metrics:
        value = getattr(m, field_name, 0)
        entries.append(LeaderboardEntry(
            developer_id=m.developer_id,
            developer_name=dev_names.get(m.developer_id),
            value=float(value),
        ))

    entries.sort(key=lambda e: e.value, reverse=True)
    for i, e in enumerate(entries):
        e.rank = i + 1

    return LeaderboardResponse(
        metric=metric,
        period_type=period_type.value,
        period_start=start_date,
        period_end=end_date,
        entries=entries[:limit],
    )


# ---------------------------------------------------------------------------
# Insight Settings
# ---------------------------------------------------------------------------

@router.get("/settings", response_model=InsightSettingsResponse)
async def get_insight_settings(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    team_id: str | None = Query(default=None),
):
    """Get insight settings for workspace (org defaults) or a specific team override."""
    stmt = select(InsightSettings).where(
        and_(
            InsightSettings.workspace_id == workspace_id,
            InsightSettings.team_id == team_id,
        )
    )
    result = await db.execute(stmt)
    settings = result.scalar_one_or_none()

    if not settings:
        # Return defaults
        return InsightSettingsResponse(
            id="",
            workspace_id=workspace_id,
            team_id=team_id,
        )

    return InsightSettingsResponse.model_validate(settings)


@router.put("/settings", response_model=InsightSettingsResponse)
async def upsert_insight_settings(
    workspace_id: str,
    request: InsightSettingsCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
):
    """Create or update insight settings for workspace or team."""
    stmt = select(InsightSettings).where(
        and_(
            InsightSettings.workspace_id == workspace_id,
            InsightSettings.team_id == request.team_id,
        )
    )
    result = await db.execute(stmt)
    settings = result.scalar_one_or_none()

    if settings:
        if request.working_hours:
            settings.working_hours = request.working_hours.model_dump()
        if request.health_score_weights:
            settings.health_score_weights = request.health_score_weights.model_dump()
        settings.bottleneck_multiplier = request.bottleneck_multiplier
        settings.auto_generate_snapshots = request.auto_generate_snapshots
        settings.snapshot_frequency = request.snapshot_frequency
    else:
        settings = InsightSettings(
            workspace_id=workspace_id,
            team_id=request.team_id,
            working_hours=request.working_hours.model_dump() if request.working_hours else None,
            health_score_weights=request.health_score_weights.model_dump() if request.health_score_weights else None,
            bottleneck_multiplier=request.bottleneck_multiplier,
            auto_generate_snapshots=request.auto_generate_snapshots,
            snapshot_frequency=request.snapshot_frequency,
        )
        db.add(settings)

    await db.commit()
    await db.refresh(settings)
    return InsightSettingsResponse.model_validate(settings)


# ---------------------------------------------------------------------------
# Developer Working Schedules
# ---------------------------------------------------------------------------

@router.get("/working-schedule/{dev_id}", response_model=DeveloperWorkingScheduleResponse)
async def get_working_schedule(
    workspace_id: str,
    dev_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
):
    """Get a developer's working schedule."""
    stmt = select(DeveloperWorkingSchedule).where(
        and_(
            DeveloperWorkingSchedule.developer_id == dev_id,
            DeveloperWorkingSchedule.workspace_id == workspace_id,
        )
    )
    result = await db.execute(stmt)
    schedule = result.scalar_one_or_none()

    if not schedule:
        return DeveloperWorkingScheduleResponse(
            id="",
            developer_id=dev_id,
            workspace_id=workspace_id,
        )

    return DeveloperWorkingScheduleResponse.model_validate(schedule)


@router.put("/working-schedule/{dev_id}", response_model=DeveloperWorkingScheduleResponse)
async def upsert_working_schedule(
    workspace_id: str,
    dev_id: str,
    request: DeveloperWorkingScheduleCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
):
    """Create or update a developer's working schedule."""
    stmt = select(DeveloperWorkingSchedule).where(
        and_(
            DeveloperWorkingSchedule.developer_id == dev_id,
            DeveloperWorkingSchedule.workspace_id == workspace_id,
        )
    )
    result = await db.execute(stmt)
    schedule = result.scalar_one_or_none()

    if schedule:
        schedule.timezone = request.timezone
        schedule.start_hour = request.start_hour
        schedule.end_hour = request.end_hour
        schedule.working_days = request.working_days
        schedule.late_night_threshold_hour = request.late_night_threshold_hour
        schedule.engineering_role = request.engineering_role
    else:
        schedule = DeveloperWorkingSchedule(
            developer_id=dev_id,
            workspace_id=workspace_id,
            timezone=request.timezone,
            start_hour=request.start_hour,
            end_hour=request.end_hour,
            working_days=request.working_days,
            late_night_threshold_hour=request.late_night_threshold_hour,
            engineering_role=request.engineering_role,
        )
        db.add(schedule)

    await db.commit()
    await db.refresh(schedule)
    return DeveloperWorkingScheduleResponse.model_validate(schedule)


# ---------------------------------------------------------------------------
# Alert Rules
# ---------------------------------------------------------------------------

@router.get("/alerts/rules", response_model=list[AlertRuleResponse])
async def list_alert_rules(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    active_only: bool = Query(default=True),
):
    """List insight alert rules for workspace."""
    stmt = select(InsightAlertRule).where(
        InsightAlertRule.workspace_id == workspace_id
    )
    if active_only:
        stmt = stmt.where(InsightAlertRule.is_active == True)
    stmt = stmt.order_by(InsightAlertRule.created_at.desc())

    result = await db.execute(stmt)
    rules = result.scalars().all()
    return [AlertRuleResponse.model_validate(r) for r in rules]


@router.post("/alerts/rules", response_model=AlertRuleResponse)
async def create_alert_rule(
    workspace_id: str,
    request: AlertRuleCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
):
    """Create a new insight alert rule."""
    rule = InsightAlertRule(
        workspace_id=workspace_id,
        created_by_id=developer_id,
        name=request.name,
        description=request.description,
        metric_category=request.metric_category,
        metric_name=request.metric_name,
        condition_operator=request.condition_operator,
        condition_value=request.condition_value,
        scope_type=request.scope_type,
        scope_id=request.scope_id,
        severity=request.severity,
        notification_channels=request.notification_channels,
        is_active=request.is_active,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return AlertRuleResponse.model_validate(rule)


@router.patch("/alerts/rules/{rule_id}", response_model=AlertRuleResponse)
async def update_alert_rule(
    workspace_id: str,
    rule_id: str,
    request: AlertRuleUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
):
    """Update an existing alert rule."""
    stmt = select(InsightAlertRule).where(
        and_(
            InsightAlertRule.id == rule_id,
            InsightAlertRule.workspace_id == workspace_id,
        )
    )
    result = await db.execute(stmt)
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    update_data = request.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(rule, field, value)

    await db.commit()
    await db.refresh(rule)
    return AlertRuleResponse.model_validate(rule)


@router.delete("/alerts/rules/{rule_id}")
async def delete_alert_rule(
    workspace_id: str,
    rule_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
):
    """Delete an alert rule."""
    stmt = select(InsightAlertRule).where(
        and_(
            InsightAlertRule.id == rule_id,
            InsightAlertRule.workspace_id == workspace_id,
        )
    )
    result = await db.execute(stmt)
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Alert rule not found")

    await db.delete(rule)
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Alert Templates
# ---------------------------------------------------------------------------

@router.post("/alerts/templates/seed")
async def seed_alert_templates(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
):
    """Seed default alert rule templates for the workspace."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    service = DeveloperInsightsService(db)
    created = await service.seed_default_alert_templates(workspace_id, developer_id)
    await db.commit()

    return {
        "created": len(created),
        "templates": [AlertRuleResponse.model_validate(r) for r in created],
    }


# ---------------------------------------------------------------------------
# Alert Evaluation
# ---------------------------------------------------------------------------

@router.post("/alerts/evaluate")
async def evaluate_alerts(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Evaluate all active alert rules and create history entries for breaches."""
    from aexy.services.developer_insights_service import DeveloperInsightsService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    service = DeveloperInsightsService(db)
    triggered = await service.evaluate_alert_rules(workspace_id, start_date, end_date)

    return {
        "workspace_id": workspace_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        "rules_evaluated": True,
        "alerts_triggered": len(triggered),
        "triggered": triggered,
    }


# ---------------------------------------------------------------------------
# Alert History
# ---------------------------------------------------------------------------

@router.get("/alerts/history", response_model=list[AlertHistoryResponse])
async def list_alert_history(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    """List triggered alert history for workspace."""
    stmt = select(InsightAlertHistory).where(
        InsightAlertHistory.workspace_id == workspace_id
    )
    if status:
        stmt = stmt.where(InsightAlertHistory.status == status)
    stmt = stmt.order_by(InsightAlertHistory.triggered_at.desc()).limit(limit)

    result = await db.execute(stmt)
    alerts = result.scalars().all()
    return [AlertHistoryResponse.model_validate(a) for a in alerts]


@router.patch("/alerts/history/{alert_id}/acknowledge")
async def acknowledge_alert(
    workspace_id: str,
    alert_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
):
    """Acknowledge a triggered alert."""
    stmt = select(InsightAlertHistory).where(
        and_(
            InsightAlertHistory.id == alert_id,
            InsightAlertHistory.workspace_id == workspace_id,
        )
    )
    result = await db.execute(stmt)
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = "acknowledged"
    alert.acknowledged_by_id = developer_id
    alert.acknowledged_at = datetime.now(timezone.utc)

    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# AI-Powered Insights (Phase 5)
# ---------------------------------------------------------------------------

@router.get("/ai/team/narrative")
async def get_team_narrative(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    team_id: str | None = Query(default=None),
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Generate an LLM-powered narrative summary of team metrics."""
    from aexy.services.insights_ai_service import InsightsAIService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    if team_id:
        dev_ids = await _get_team_developer_ids(db, team_id)
    else:
        dev_ids = await _get_workspace_developer_ids(db, workspace_id)

    if not dev_ids:
        raise HTTPException(status_code=404, detail="No team members found")

    ai_service = InsightsAIService(db)
    result = await ai_service.generate_team_narrative(workspace_id, dev_ids, start_date, end_date)

    return {
        "workspace_id": workspace_id,
        "team_id": team_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        **result,
    }


@router.get("/ai/developers/{dev_id}/narrative")
async def get_developer_narrative(
    workspace_id: str,
    dev_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Generate an LLM-powered narrative summary for a developer."""
    from aexy.services.insights_ai_service import InsightsAIService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    ai_service = InsightsAIService(db)
    result = await ai_service.generate_developer_narrative(workspace_id, dev_id, start_date, end_date)

    return {
        "workspace_id": workspace_id,
        "developer_id": dev_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        **result,
    }


@router.get("/ai/developers/{dev_id}/anomalies")
async def get_developer_anomalies(
    workspace_id: str,
    dev_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    threshold: float = Query(default=2.0, ge=1.0, le=4.0, description="Standard deviation threshold"),
):
    """Detect statistical anomalies with LLM-generated explanations."""
    from aexy.services.insights_ai_service import InsightsAIService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    ai_service = InsightsAIService(db)
    result = await ai_service.detect_anomalies(workspace_id, dev_id, start_date, end_date, threshold)

    return {
        "workspace_id": workspace_id,
        "developer_id": dev_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        **result,
    }


@router.get("/ai/team/root-cause-analysis")
async def get_root_cause_analysis(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    team_id: str | None = Query(default=None),
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Analyze root causes for metric changes using LLM."""
    from aexy.services.insights_ai_service import InsightsAIService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    if team_id:
        dev_ids = await _get_team_developer_ids(db, team_id)
    else:
        dev_ids = await _get_workspace_developer_ids(db, workspace_id)

    if not dev_ids:
        raise HTTPException(status_code=404, detail="No team members found")

    ai_service = InsightsAIService(db)
    result = await ai_service.analyze_root_causes(workspace_id, dev_ids, start_date, end_date)

    return {
        "workspace_id": workspace_id,
        "team_id": team_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        **result,
    }


@router.get("/ai/developers/{dev_id}/one-on-one-prep")
async def get_one_on_one_prep(
    workspace_id: str,
    dev_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Generate AI-powered 1:1 preparation notes for a manager."""
    from aexy.services.insights_ai_service import InsightsAIService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    ai_service = InsightsAIService(db)
    result = await ai_service.generate_one_on_one_prep(workspace_id, dev_id, start_date, end_date)

    return {
        "workspace_id": workspace_id,
        "developer_id": dev_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        **result,
    }


@router.get("/ai/team/sprint-retro")
async def get_sprint_retro(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    team_id: str | None = Query(default=None),
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.sprint),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Generate AI-powered sprint retrospective insights."""
    from aexy.services.insights_ai_service import InsightsAIService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    if team_id:
        dev_ids = await _get_team_developer_ids(db, team_id)
    else:
        dev_ids = await _get_workspace_developer_ids(db, workspace_id)

    if not dev_ids:
        raise HTTPException(status_code=404, detail="No team members found")

    ai_service = InsightsAIService(db)
    result = await ai_service.generate_sprint_retro(workspace_id, dev_ids, start_date, end_date)

    return {
        "workspace_id": workspace_id,
        "team_id": team_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        **result,
    }


@router.get("/ai/team/trajectory")
async def get_team_trajectory(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    team_id: str | None = Query(default=None),
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Generate LLM-enhanced team trajectory forecast."""
    from aexy.services.insights_ai_service import InsightsAIService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    if team_id:
        dev_ids = await _get_team_developer_ids(db, team_id)
    else:
        dev_ids = await _get_workspace_developer_ids(db, workspace_id)

    if not dev_ids:
        raise HTTPException(status_code=404, detail="No team members found")

    ai_service = InsightsAIService(db)
    result = await ai_service.generate_team_trajectory(workspace_id, dev_ids, start_date, end_date)

    return {
        "workspace_id": workspace_id,
        "team_id": team_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        **result,
    }


@router.get("/ai/team/composition-recommendations")
async def get_composition_recommendations(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    team_id: str | None = Query(default=None),
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Get AI-powered team composition recommendations."""
    from aexy.services.insights_ai_service import InsightsAIService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    if team_id:
        dev_ids = await _get_team_developer_ids(db, team_id)
    else:
        dev_ids = await _get_workspace_developer_ids(db, workspace_id)

    if not dev_ids:
        raise HTTPException(status_code=404, detail="No team members found")

    ai_service = InsightsAIService(db)
    result = await ai_service.recommend_team_composition(workspace_id, dev_ids, start_date, end_date)

    return {
        "workspace_id": workspace_id,
        "team_id": team_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        **result,
    }


@router.get("/ai/team/hiring-forecast")
async def get_hiring_forecast(
    workspace_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(verify_workspace_membership)],
    team_id: str | None = Query(default=None),
    period_type: PeriodTypeParam = Query(default=PeriodTypeParam.weekly),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
):
    """Estimate when the team will need additional headcount."""
    from aexy.services.insights_ai_service import InsightsAIService

    if not start_date or not end_date:
        start_date, end_date = _default_range(period_type)
    _validate_date_range(start_date, end_date)

    if team_id:
        dev_ids = await _get_team_developer_ids(db, team_id)
    else:
        dev_ids = await _get_workspace_developer_ids(db, workspace_id)

    if not dev_ids:
        raise HTTPException(status_code=404, detail="No team members found")

    ai_service = InsightsAIService(db)
    result = await ai_service.estimate_hiring_timeline(workspace_id, dev_ids, start_date, end_date)

    return {
        "workspace_id": workspace_id,
        "team_id": team_id,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        **result,
    }
