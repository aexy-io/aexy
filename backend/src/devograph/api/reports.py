"""Report builder API endpoints."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer_id
from aexy.core.database import get_db
from aexy.schemas.analytics import (
    CustomReportCreate,
    CustomReportUpdate,
    CustomReportResponse,
    ReportTemplateResponse,
    ScheduledReportCreate,
    ScheduledReportUpdate,
    ScheduledReportResponse,
    DateRange,
)
from aexy.services.report_builder import ReportBuilderService

router = APIRouter(prefix="/reports")


# -------------------------------------------------------------------------
# Report CRUD
# -------------------------------------------------------------------------


@router.get("", response_model=list[CustomReportResponse])
async def list_reports(
    include_public: bool = Query(True, description="Include public reports"),
    include_templates: bool = Query(False, description="Include template reports"),
    db: AsyncSession = Depends(get_db),
    current_user_id: str = Depends(get_current_developer_id),
) -> list[CustomReportResponse]:
    """List reports accessible to the current user."""
    service = ReportBuilderService()
    reports = await service.list_reports(
        db=db,
        creator_id=current_user_id,
        include_public=include_public,
        include_templates=include_templates,
    )
    return [CustomReportResponse.model_validate(r) for r in reports]


@router.post("", response_model=CustomReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    data: CustomReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = Depends(get_current_developer_id),
) -> CustomReportResponse:
    """Create a new custom report."""
    if not data.widgets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one widget is required",
        )

    service = ReportBuilderService()
    report = await service.create_report(
        creator_id=current_user_id,
        data=data,
        db=db,
    )
    return CustomReportResponse.model_validate(report)


@router.get("/{report_id}", response_model=CustomReportResponse)
async def get_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = Depends(get_current_developer_id),
) -> CustomReportResponse:
    """Get a report by ID."""
    service = ReportBuilderService()
    report = await service.get_report(report_id, db, current_user_id)

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found or access denied",
        )

    return CustomReportResponse.model_validate(report)


@router.put("/{report_id}", response_model=CustomReportResponse)
async def update_report(
    report_id: str,
    data: CustomReportUpdate,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = Depends(get_current_developer_id),
) -> CustomReportResponse:
    """Update an existing report."""
    service = ReportBuilderService()
    report = await service.update_report(
        report_id=report_id,
        data=data,
        db=db,
        user_id=current_user_id,
    )

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found or not authorized to update",
        )

    return CustomReportResponse.model_validate(report)


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = Depends(get_current_developer_id),
) -> None:
    """Delete a report."""
    service = ReportBuilderService()
    success = await service.delete_report(
        report_id=report_id,
        db=db,
        user_id=current_user_id,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found or not authorized to delete",
        )


@router.post("/{report_id}/clone", response_model=CustomReportResponse)
async def clone_report(
    report_id: str,
    new_name: str = Query(..., description="Name for the cloned report"),
    db: AsyncSession = Depends(get_db),
    current_user_id: str = Depends(get_current_developer_id),
) -> CustomReportResponse:
    """Clone an existing report."""
    service = ReportBuilderService()
    report = await service.clone_report(
        report_id=report_id,
        new_name=new_name,
        db=db,
        user_id=current_user_id,
    )

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found or access denied",
        )

    return CustomReportResponse.model_validate(report)


# -------------------------------------------------------------------------
# Report Data
# -------------------------------------------------------------------------


@router.post("/{report_id}/data")
async def get_report_data(
    report_id: str,
    developer_ids: list[str] | None = None,
    date_range: DateRange | None = None,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = Depends(get_current_developer_id),
) -> dict[str, Any]:
    """Fetch widget data for a report.

    Optionally override developer IDs and date range from report defaults.
    """
    service = ReportBuilderService()
    data = await service.get_report_data(
        report_id=report_id,
        db=db,
        user_id=current_user_id,
        developer_ids=developer_ids,
        date_range=date_range,
    )

    if "error" in data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=data["error"],
        )

    return data


# -------------------------------------------------------------------------
# Templates
# -------------------------------------------------------------------------


@router.get("/templates/list", response_model=list[ReportTemplateResponse])
async def list_templates(
    category: str | None = Query(None, description="Filter by category"),
    _: str = Depends(get_current_developer_id),
) -> list[ReportTemplateResponse]:
    """Get available report templates."""
    service = ReportBuilderService()
    return service.get_templates(category=category)


@router.post("/templates/{template_id}/create", response_model=CustomReportResponse)
async def create_from_template(
    template_id: str,
    name: str | None = Query(None, description="Custom name for the report"),
    db: AsyncSession = Depends(get_db),
    current_user_id: str = Depends(get_current_developer_id),
) -> CustomReportResponse:
    """Create a new report from a template."""
    service = ReportBuilderService()
    report = await service.create_from_template(
        template_id=template_id,
        creator_id=current_user_id,
        db=db,
        name=name,
    )

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template '{template_id}' not found",
        )

    return CustomReportResponse.model_validate(report)


# -------------------------------------------------------------------------
# Schedules
# -------------------------------------------------------------------------


@router.get("/schedules/list", response_model=list[ScheduledReportResponse])
async def list_schedules(
    report_id: str | None = Query(None, description="Filter by report ID"),
    active_only: bool = Query(True, description="Only show active schedules"),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> list[ScheduledReportResponse]:
    """List scheduled reports."""
    service = ReportBuilderService()
    schedules = await service.list_schedules(
        db=db,
        report_id=report_id,
        active_only=active_only,
    )
    return [ScheduledReportResponse.model_validate(s) for s in schedules]


@router.post("/{report_id}/schedules", response_model=ScheduledReportResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    report_id: str,
    data: ScheduledReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = Depends(get_current_developer_id),
) -> ScheduledReportResponse:
    """Create a new scheduled report."""
    if not data.recipients:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one recipient is required",
        )

    service = ReportBuilderService()
    schedule = await service.create_schedule(
        report_id=report_id,
        data=data,
        db=db,
        user_id=current_user_id,
    )

    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found or access denied",
        )

    return ScheduledReportResponse.model_validate(schedule)


@router.put("/schedules/{schedule_id}", response_model=ScheduledReportResponse)
async def update_schedule(
    schedule_id: str,
    data: ScheduledReportUpdate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> ScheduledReportResponse:
    """Update a scheduled report."""
    service = ReportBuilderService()
    schedule = await service.update_schedule(
        schedule_id=schedule_id,
        data=data,
        db=db,
    )

    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found",
        )

    return ScheduledReportResponse.model_validate(schedule)


@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> None:
    """Delete a scheduled report."""
    service = ReportBuilderService()
    success = await service.delete_schedule(schedule_id, db)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found",
        )
