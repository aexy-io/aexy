"""Export API endpoints."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer_id
from aexy.core.database import get_db
from aexy.schemas.analytics import (
    ExportRequest,
    ExportJobResponse,
    ExportFormat,
    ExportStatus,
)
from aexy.services.export_service import ExportService

router = APIRouter(prefix="/exports")


@router.post("", response_model=ExportJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_export(
    request: ExportRequest,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = Depends(get_current_developer_id),
) -> ExportJobResponse:
    """Create a new export job.

    The export will be processed asynchronously. Use the returned job ID
    to check status and download when complete.

    Supported formats:
    - **csv**: Comma-separated values
    - **json**: JSON with metadata
    - **pdf**: Formatted PDF document (requires reportlab)
    - **xlsx**: Excel workbook (requires openpyxl)
    """
    service = ExportService()

    try:
        job = await service.create_export_job(
            request=request,
            requester_id=current_user_id,
            db=db,
        )
        return ExportJobResponse.model_validate(job)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.get("/{job_id}", response_model=ExportJobResponse)
async def get_export_status(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = Depends(get_current_developer_id),
) -> ExportJobResponse:
    """Get the status of an export job."""
    service = ExportService()
    job = await service.get_export_job(
        job_id=job_id,
        db=db,
        requester_id=current_user_id,
    )

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export job not found",
        )

    return ExportJobResponse.model_validate(job)


@router.get("/{job_id}/download")
async def download_export(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = Depends(get_current_developer_id),
) -> FileResponse:
    """Download a completed export.

    Returns the exported file for completed jobs.
    """
    service = ExportService()
    job = await service.get_export_job(
        job_id=job_id,
        db=db,
        requester_id=current_user_id,
    )

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export job not found",
        )

    if job.status != ExportStatus.COMPLETED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Export is not ready. Status: {job.status}",
        )

    file_path = service.get_download_path(job)
    if not file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export file not found or has expired",
        )

    # Determine content type
    format_type = ExportFormat(job.format)
    content_types = {
        ExportFormat.CSV: "text/csv",
        ExportFormat.JSON: "application/json",
        ExportFormat.PDF: "application/pdf",
        ExportFormat.XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }

    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type=content_types.get(format_type, "application/octet-stream"),
    )


@router.get("", response_model=list[ExportJobResponse])
async def list_exports(
    status_filter: ExportStatus | None = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = Depends(get_current_developer_id),
) -> list[ExportJobResponse]:
    """List export jobs for the current user."""
    service = ExportService()
    jobs = await service.list_export_jobs(
        db=db,
        requester_id=current_user_id,
        status=status_filter,
        limit=limit,
    )
    return [ExportJobResponse.model_validate(j) for j in jobs]


@router.get("/formats/available")
async def get_available_formats(
    _: str = Depends(get_current_developer_id),
) -> dict:
    """Get available export formats and their requirements."""
    from aexy.services.export_service import REPORTLAB_AVAILABLE, OPENPYXL_AVAILABLE

    formats = [
        {
            "format": ExportFormat.CSV.value,
            "name": "CSV",
            "description": "Comma-separated values, compatible with spreadsheet applications",
            "available": True,
            "requirements": None,
        },
        {
            "format": ExportFormat.JSON.value,
            "name": "JSON",
            "description": "JavaScript Object Notation with export metadata",
            "available": True,
            "requirements": None,
        },
        {
            "format": ExportFormat.PDF.value,
            "name": "PDF",
            "description": "Formatted PDF document for printing and sharing",
            "available": REPORTLAB_AVAILABLE,
            "requirements": "pip install reportlab" if not REPORTLAB_AVAILABLE else None,
        },
        {
            "format": ExportFormat.XLSX.value,
            "name": "Excel",
            "description": "Microsoft Excel workbook with formatting and multiple sheets",
            "available": OPENPYXL_AVAILABLE,
            "requirements": "pip install openpyxl" if not OPENPYXL_AVAILABLE else None,
        },
    ]

    return {"formats": formats}


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_or_delete_export(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user_id: str = Depends(get_current_developer_id),
) -> None:
    """Cancel a pending export or delete a completed one."""
    service = ExportService()
    job = await service.get_export_job(
        job_id=job_id,
        db=db,
        requester_id=current_user_id,
    )

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export job not found",
        )

    # Delete the file if it exists
    if job.file_path:
        try:
            path = Path(job.file_path)
            if path.exists():
                path.unlink()
        except Exception:
            pass

    # Delete the job record
    await db.delete(job)
    await db.commit()
