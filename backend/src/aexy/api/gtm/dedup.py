"""GTM Dedup API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm import (
    DuplicateMatch,
    MergeRequest,
    MergeResult,
    DedupStatsResponse,
)
from aexy.services.dedup_service import DedupService

from ._shared import check_workspace_permission

router = APIRouter()


@router.get("/dedup/scan", response_model=list[DuplicateMatch])
async def scan_duplicates(
    workspace_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    record_id: str | None = Query(default=None),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Scan for duplicate records in the workspace."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = DedupService(db)
    if record_id:
        return await service.find_duplicates(workspace_id, record_id=record_id)
    return await service.bulk_find_duplicates(workspace_id, limit=limit)


@router.post("/dedup/merge", response_model=MergeResult)
async def merge_records(
    workspace_id: str,
    data: MergeRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Merge two duplicate records."""
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = DedupService(db)
    result = await service.merge_records(
        workspace_id,
        primary_id=data.primary_id,
        duplicate_id=data.duplicate_id,
        merge_strategy=data.strategy,
    )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    await db.commit()
    return result


@router.get("/dedup/stats", response_model=DedupStatsResponse)
async def get_dedup_stats(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get dedup statistics for the workspace."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = DedupService(db)
    return await service.get_dedup_stats(workspace_id)
