"""GTM Scoring API endpoints."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm import (
    ScoringOverviewResponse,
    ScoredLeadListResponse,
    ScoreDetailResponse,
)
from aexy.services.gtm_service import GTMScoringService

from ._shared import check_workspace_permission

router = APIRouter()


@router.get("/scoring/overview", response_model=ScoringOverviewResponse)
async def get_scoring_overview(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get scoring overview for dashboard."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMScoringService(db)
    return await service.get_scoring_overview(workspace_id)


@router.get("/scoring/leads", response_model=ScoredLeadListResponse)
async def list_scored_leads(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=25, ge=1, le=100),
    min_score: int | None = Query(default=None, ge=0, le=100),
    max_score: int | None = Query(default=None, ge=0, le=100),
    lifecycle_stage: str | None = Query(default=None),
    sort_by: Literal["total_score", "firmographic_score", "behavioral_score", "intent_score", "created_at"] = Query(default="total_score"),
    sort_dir: Literal["asc", "desc"] = Query(default="desc"),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """List scored leads with filters and pagination."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMScoringService(db)
    leads, total = await service.list_scores(
        workspace_id,
        page=page,
        per_page=per_page,
        min_score=min_score,
        max_score=max_score,
        lifecycle_stage=lifecycle_stage,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    return {
        "leads": leads,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/scoring/leads/{record_id}", response_model=ScoreDetailResponse)
async def get_lead_score_detail(
    workspace_id: str,
    record_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed score for a single record."""
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMScoringService(db)
    detail = await service.get_score_detail(workspace_id, record_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Score not found for this record")
    return detail
