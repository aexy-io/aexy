"""Learning analytics API endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.learning_analytics import (
    CompletionRateReport,
    ExecutiveDashboard,
    ReportDefinitionCreate,
    ReportDefinitionFilter,
    ReportDefinitionList,
    ReportDefinitionResponse,
    ReportDefinitionUpdate,
    ReportDefinitionWithDetails,
    ReportRunFilter,
    ReportRunList,
    ReportRunResponse,
    ReportRunStatusEnum,
    ReportTypeEnum,
)
from aexy.services.learning_analytics_service import LearningAnalyticsService

router = APIRouter(prefix="/learning/analytics", tags=["learning-analytics"])


# ==================== Executive Dashboard ====================

@router.get("/executive-dashboard", response_model=ExecutiveDashboard)
async def get_executive_dashboard(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    period_days: int = Query(default=30, ge=7, le=365, description="Period in days"),
    team_ids: list[str] | None = Query(default=None, description="Filter by team IDs"),
) -> ExecutiveDashboard:
    """Get executive dashboard with comprehensive learning metrics.

    Returns aggregated metrics, trends, skill gaps, team comparisons, and ROI data.
    """
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningAnalyticsService(db)
    return await service.get_executive_dashboard(
        workspace_id=current_user.current_workspace_id,
        period_days=period_days,
        team_ids=team_ids,
    )


@router.get("/completion-rates", response_model=CompletionRateReport)
async def get_completion_rates(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    period_type: str = Query(default="monthly", description="Period type: daily, weekly, monthly"),
    periods: int = Query(default=12, ge=1, le=52, description="Number of periods"),
) -> CompletionRateReport:
    """Get completion rates over time."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    if period_type not in ["daily", "weekly", "monthly"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid period_type. Must be 'daily', 'weekly', or 'monthly'.",
        )

    service = LearningAnalyticsService(db)
    return await service.get_completion_rates(
        workspace_id=current_user.current_workspace_id,
        period_type=period_type,
        periods=periods,
    )


# ==================== Report Definitions ====================

@router.post("/reports", response_model=ReportDefinitionResponse, status_code=status.HTTP_201_CREATED)
async def create_report_definition(
    data: ReportDefinitionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> ReportDefinitionResponse:
    """Create a new report definition.

    Report definitions can be saved for reuse and optionally scheduled
    for automatic generation.
    """
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningAnalyticsService(db)
    definition = await service.create_report_definition(
        workspace_id=current_user.current_workspace_id,
        data=data,
        created_by_id=current_user.id,
    )

    return ReportDefinitionResponse.model_validate(definition)


@router.get("/reports", response_model=ReportDefinitionList)
async def list_report_definitions(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    report_type: ReportTypeEnum | None = Query(default=None, description="Filter by report type"),
    is_scheduled: bool | None = Query(default=None, description="Filter by scheduled status"),
    is_active: bool | None = Query(default=None, description="Filter by active status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> ReportDefinitionList:
    """List report definitions with optional filters."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    filters = ReportDefinitionFilter(
        report_type=report_type,
        is_scheduled=is_scheduled,
        is_active=is_active,
    )

    service = LearningAnalyticsService(db)
    definitions, total = await service.list_report_definitions(
        workspace_id=current_user.current_workspace_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return ReportDefinitionList(
        items=definitions,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/reports/{definition_id}", response_model=ReportDefinitionWithDetails)
async def get_report_definition(
    definition_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> ReportDefinitionWithDetails:
    """Get a specific report definition."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningAnalyticsService(db)
    definitions, _ = await service.list_report_definitions(
        workspace_id=current_user.current_workspace_id,
        filters=None,
        page=1,
        page_size=1000,  # Get all to find the specific one with details
    )

    for definition in definitions:
        if definition.id == definition_id:
            return definition

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Report definition not found",
    )


@router.put("/reports/{definition_id}", response_model=ReportDefinitionResponse)
async def update_report_definition(
    definition_id: str,
    data: ReportDefinitionUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> ReportDefinitionResponse:
    """Update a report definition."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningAnalyticsService(db)
    definition = await service.update_report_definition(
        definition_id=definition_id,
        workspace_id=current_user.current_workspace_id,
        data=data,
    )

    if not definition:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report definition not found",
        )

    return ReportDefinitionResponse.model_validate(definition)


@router.delete("/reports/{definition_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report_definition(
    definition_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> None:
    """Delete a report definition."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningAnalyticsService(db)
    deleted = await service.delete_report_definition(
        definition_id=definition_id,
        workspace_id=current_user.current_workspace_id,
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report definition not found",
        )


# ==================== Report Runs ====================

@router.post("/reports/{definition_id}/run", response_model=ReportRunResponse)
async def trigger_report_run(
    definition_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> ReportRunResponse:
    """Trigger a report run for a definition.

    This will queue the report for generation. Check the run status
    to know when it's complete.
    """
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningAnalyticsService(db)
    try:
        run = await service.trigger_report_run(
            definition_id=definition_id,
            workspace_id=current_user.current_workspace_id,
            triggered_by="manual",
        )
        return ReportRunResponse.model_validate(run)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.get("/runs", response_model=ReportRunList)
async def list_report_runs(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    report_definition_id: str | None = Query(default=None, description="Filter by definition"),
    run_status: ReportRunStatusEnum | None = Query(default=None, alias="status", description="Filter by status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> ReportRunList:
    """List report runs with optional filters."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    filters = ReportRunFilter(
        report_definition_id=report_definition_id,
        status=run_status,
    )

    service = LearningAnalyticsService(db)
    runs, total = await service.list_report_runs(
        workspace_id=current_user.current_workspace_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return ReportRunList(
        items=runs,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )
