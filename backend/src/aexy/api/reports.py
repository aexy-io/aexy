"""Report builder API endpoints."""

import logging
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
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
from aexy.temporal.task_queues import TaskQueue

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces/{workspace_id}/reports")


# -------------------------------------------------------------------------
# Report CRUD
# -------------------------------------------------------------------------


@router.get("", response_model=list[CustomReportResponse])
async def list_reports(
    workspace_id: str,
    include_public: bool = Query(True, description="Include public reports"),
    include_templates: bool = Query(False, description="Include template reports"),
    db: AsyncSession = Depends(get_db),
    current_user_id: str = Depends(get_current_developer_id),
) -> list[CustomReportResponse]:
    """List reports accessible to the current user."""
    service = ReportBuilderService()
    reports = await service.list_reports(
        db=db,
        workspace_id=workspace_id,
        creator_id=current_user_id,
        include_public=include_public,
        include_templates=include_templates,
    )
    return [CustomReportResponse.model_validate(r) for r in reports]


@router.post("", response_model=CustomReportResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    workspace_id: str,
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
        workspace_id=workspace_id,
        data=data,
        db=db,
    )
    return CustomReportResponse.model_validate(report)


@router.get("/{report_id}", response_model=CustomReportResponse)
async def get_report(
    workspace_id: str,
    report_id: str,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = Depends(get_current_developer_id),
) -> CustomReportResponse:
    """Get a report by ID."""
    service = ReportBuilderService()
    report = await service.get_report(report_id, db, current_user_id, workspace_id)

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found or access denied",
        )

    return CustomReportResponse.model_validate(report)


@router.put("/{report_id}", response_model=CustomReportResponse)
async def update_report(
    workspace_id: str,
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
        workspace_id=workspace_id,
    )

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found or not authorized to update",
        )

    return CustomReportResponse.model_validate(report)


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(
    workspace_id: str,
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
        workspace_id=workspace_id,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found or not authorized to delete",
        )


@router.post("/{report_id}/clone", response_model=CustomReportResponse)
async def clone_report(
    workspace_id: str,
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
        workspace_id=workspace_id,
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
    workspace_id: str,
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
        workspace_id=workspace_id,
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
    workspace_id: str,
    category: str | None = Query(None, description="Filter by category"),
    _: str = Depends(get_current_developer_id),
) -> list[ReportTemplateResponse]:
    """Get available report templates."""
    service = ReportBuilderService()
    return service.get_templates(category=category)


@router.post("/templates/{template_id}/create", response_model=CustomReportResponse)
async def create_from_template(
    workspace_id: str,
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
        workspace_id=workspace_id,
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
    workspace_id: str,
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
        workspace_id=workspace_id,
    )
    return [ScheduledReportResponse.model_validate(s) for s in schedules]


@router.post("/{report_id}/schedules", response_model=ScheduledReportResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    workspace_id: str,
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
        workspace_id=workspace_id,
    )

    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found or access denied",
        )

    return ScheduledReportResponse.model_validate(schedule)


@router.put("/schedules/{schedule_id}", response_model=ScheduledReportResponse)
async def update_schedule(
    workspace_id: str,
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
        workspace_id=workspace_id,
    )

    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found",
        )

    return ScheduledReportResponse.model_validate(schedule)


@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    workspace_id: str,
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_developer_id),
) -> None:
    """Delete a scheduled report."""
    service = ReportBuilderService()
    success = await service.delete_schedule(schedule_id, db,
        workspace_id=workspace_id,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found",
        )


# -------------------------------------------------------------------------
# Monthly engineering contribution report
# -------------------------------------------------------------------------


@router.get("/engineering/monthly")
async def monthly_engineering_report(
    workspace_id: str,
    month: str = Query(..., description="Month as YYYY-MM", pattern=r"^\d{4}-\d{2}$"),
    timezone_name: str = Query(
        "UTC",
        alias="timezone",
        description="IANA timezone the month is measured in, e.g. Asia/Kolkata",
    ),
    fmt: str = Query("json", alias="format", pattern="^(json|markdown)$"),
    db: AsyncSession = Depends(get_db),
    developer_id: str = Depends(get_current_developer_id),
) -> Any:
    """Contribution report for one workspace and one month, from synced data.

    Owners, admins and department heads only — see `can_read_report`.
    """
    from aexy.services.engineering_report import (
        EngineeringReportService,
        resolve_report_scope,
    )
    from aexy.services.engineering_report_markdown import render_markdown

    # The scope *is* the permission: an admin gets the workspace, a department
    # head gets their department, anyone else gets nothing.
    scope = await resolve_report_scope(db, workspace_id, developer_id)
    if scope is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This report is available to workspace admins and department "
                "heads. Ask an admin if you need access to it."
            ),
        )

    try:
        report = await EngineeringReportService(db).build_monthly(
            workspace_id=workspace_id,
            month=month,
            timezone_name=timezone_name,
            scope=scope,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    if fmt == "markdown":
        return PlainTextResponse(
            render_markdown(report), media_type="text/markdown; charset=utf-8"
        )
    return asdict(report)


@router.post("/engineering/monthly/refresh")
async def refresh_engineering_report_data(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    developer_id: str = Depends(get_current_developer_id),
) -> dict[str, Any]:
    """Sync every adopted repository so the report is built on current data.

    Admin-only: it spends the workspace's GitHub rate limit, unlike reading a
    report. Each repository syncs under its own adopter's token, the same way
    the scheduler does it — and under the same Temporal id, so asking twice
    while a sync is running does nothing rather than starting a second one.
    """
    from temporalio.exceptions import WorkflowAlreadyStartedError

    from aexy.models.repository import Repository, WorkspaceRepository
    from aexy.services.workspace_service import WorkspaceService
    from aexy.temporal.activities.sync import (
        SyncRepositoryInput,
        repo_sync_workflow_id,
    )
    from aexy.temporal.dispatch import dispatch

    if not await WorkspaceService(db).check_permission(workspace_id, developer_id, "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Workspace admin role required to trigger a sync",
        )

    rows = (
        await db.execute(
            select(Repository.id, Repository.full_name, WorkspaceRepository.adopted_by_developer_id)
            .join(
                WorkspaceRepository,
                WorkspaceRepository.repository_id == Repository.id,
            )
            .where(
                WorkspaceRepository.workspace_id == workspace_id,
                WorkspaceRepository.is_active.is_(True),
            )
        )
    ).all()

    queued: list[str] = []
    already_running: list[str] = []
    # A repository whose adopter was removed has no token to sync with. It is
    # not an error — the catalog page offers a reclaim — but the report would
    # otherwise look stale for no visible reason.
    no_adopter: list[str] = []
    failed: list[str] = []

    for repository_id, full_name, adopter_id in rows:
        if not adopter_id:
            no_adopter.append(full_name)
            continue
        try:
            await dispatch(
                "sync_repository",
                SyncRepositoryInput(
                    repository_id=str(repository_id),
                    developer_id=str(adopter_id),
                ),
                task_queue=TaskQueue.SYNC,
                workflow_id=repo_sync_workflow_id(str(repository_id), str(adopter_id)),
            )
            queued.append(full_name)
        except WorkflowAlreadyStartedError:
            already_running.append(full_name)
        except Exception:
            logger.exception(f"Failed to dispatch sync for {full_name}")
            failed.append(full_name)

    return {
        "queued": queued,
        "already_running": already_running,
        "no_adopter": no_adopter,
        "failed": failed,
    }
