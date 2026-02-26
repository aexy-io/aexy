"""GTM Competitors API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm_competitor import (
    CompetitorCreate,
    CompetitorUpdate,
    CompetitorResponse,
    CompetitorChangeListResponse,
    BattleCardResponse,
    BattleCardUpdate,
)

from ._shared import check_workspace_permission

router = APIRouter()


@router.get("/competitors", response_model=list[CompetitorResponse])
async def list_competitors(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db)
    service = CompetitorIntelService(db)
    return await service.list_competitors(workspace_id)


@router.post("/competitors", response_model=CompetitorResponse)
async def create_competitor(
    workspace_id: str,
    data: CompetitorCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = CompetitorIntelService(db)
    return await service.create_competitor(workspace_id, data.model_dump())


@router.get("/competitors/changes", response_model=CompetitorChangeListResponse)
async def list_competitor_changes(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    competitor_id: str = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db)
    service = CompetitorIntelService(db)
    items, total = await service.list_changes(workspace_id, page=page, per_page=per_page, competitor_id=competitor_id)
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.post("/competitors/changes/{change_id}/acknowledge")
async def acknowledge_competitor_change(
    workspace_id: str,
    change_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = CompetitorIntelService(db)
    result = await service.acknowledge_change(workspace_id, change_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.get("/competitors/{competitor_id}", response_model=CompetitorResponse)
async def get_competitor(
    workspace_id: str,
    competitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db)
    service = CompetitorIntelService(db)
    result = await service.get_competitor(workspace_id, competitor_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.put("/competitors/{competitor_id}", response_model=CompetitorResponse)
async def update_competitor(
    workspace_id: str,
    competitor_id: str,
    data: CompetitorUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = CompetitorIntelService(db)
    result = await service.update_competitor(workspace_id, competitor_id, data.model_dump(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.delete("/competitors/{competitor_id}", status_code=204)
async def delete_competitor(
    workspace_id: str,
    competitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = CompetitorIntelService(db)
    deleted = await service.delete_competitor(workspace_id, competitor_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/competitors/{competitor_id}/check")
async def manual_competitor_check(
    workspace_id: str,
    competitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    wf_id = await dispatch(
        "check_competitor_changes",
        {"workspace_id": workspace_id, "competitor_id": competitor_id},
        task_queue=TaskQueue.ANALYSIS,
    )
    return {"workflow_id": wf_id, "message": "Competitor check started"}


@router.get("/competitors/{competitor_id}/battle-card", response_model=BattleCardResponse)
async def get_battle_card(
    workspace_id: str,
    competitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db)
    service = CompetitorIntelService(db)
    result = await service.get_battle_card(workspace_id, competitor_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/competitors/{competitor_id}/battle-card/generate")
async def generate_battle_card(
    workspace_id: str,
    competitor_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    wf_id = await dispatch(
        "generate_battle_card",
        {"workspace_id": workspace_id, "competitor_id": competitor_id},
        task_queue=TaskQueue.ANALYSIS,
    )
    return {"workflow_id": wf_id, "message": "Battle card generation started"}


@router.put("/competitors/{competitor_id}/battle-card/{card_id}", response_model=BattleCardResponse)
async def update_battle_card(
    workspace_id: str,
    competitor_id: str,
    card_id: str,
    data: BattleCardUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = CompetitorIntelService(db)
    result = await service.update_battle_card(workspace_id, competitor_id, card_id, data.model_dump(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/competitors/{competitor_id}/battle-card/{card_id}/publish")
async def publish_battle_card(
    workspace_id: str,
    competitor_id: str,
    card_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.competitor_intel_service import CompetitorIntelService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = CompetitorIntelService(db)
    result = await service.publish_battle_card(workspace_id, competitor_id, card_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result
