"""GTM Health Scoring API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm_health import (
    HealthConfigUpdate,
    HealthConfigResponse,
    HealthDashboardResponse,
    HealthScoreResponse,
    HealthScoreListResponse,
)

from ._shared import check_workspace_permission

router = APIRouter()


@router.get("/health/dashboard", response_model=HealthDashboardResponse)
async def get_health_dashboard(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.health_scoring_service import HealthScoringService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HealthScoringService(db)
    return await service.get_dashboard(workspace_id)


@router.get("/health/scores", response_model=HealthScoreListResponse)
async def list_health_scores(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    health_status: str = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.health_scoring_service import HealthScoringService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HealthScoringService(db)
    return await service.list_scores(workspace_id, page=page, per_page=per_page, health_status=health_status)


@router.get("/health/scores/{record_id}", response_model=HealthScoreResponse)
async def get_health_score(
    workspace_id: str,
    record_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.health_scoring_service import HealthScoringService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HealthScoringService(db)
    result = await service.get_score(workspace_id, record_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/health/scores/{record_id}/rescore")
async def rescore_customer(
    workspace_id: str,
    record_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.health_scoring_service import HealthScoringService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HealthScoringService(db)
    return await service.rescore(workspace_id, record_id)


@router.post("/health/batch-score")
async def batch_score_health(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    await check_workspace_permission(workspace_id, current_user, db)
    wf_id = await dispatch(
        "batch_score_customer_health",
        {"workspace_id": workspace_id},
        task_queue=TaskQueue.ANALYSIS,
    )
    return {"workflow_id": wf_id, "message": "Batch scoring started"}


@router.get("/health/config", response_model=HealthConfigResponse)
async def get_health_config(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.health_scoring_service import HealthScoringService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HealthScoringService(db)
    return await service.get_config(workspace_id)


@router.put("/health/config", response_model=HealthConfigResponse)
async def update_health_config(
    workspace_id: str,
    data: HealthConfigUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.health_scoring_service import HealthScoringService
    await check_workspace_permission(workspace_id, current_user, db)
    service = HealthScoringService(db)
    return await service.update_config(workspace_id, data.model_dump(exclude_none=True))


@router.get("/health/providers")
async def get_provider_health(
    workspace_id: str,
    hours: int = Query(default=24, ge=1, le=168),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get provider integration health metrics."""
    from aexy.services.gtm_webhook_service import GTMProviderHealthService
    await check_workspace_permission(workspace_id, current_user, db)
    service = GTMProviderHealthService(db)
    providers = await service.get_health_summary(workspace_id, hours=hours)
    return {"providers": providers, "period_hours": hours}
