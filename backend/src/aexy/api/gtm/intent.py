"""GTM Intent Signals API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm_intent import (
    IntentSignalCreate,
    IntentSignalResponse,
    IntentSignalListResponse,
    IntentConfigUpdate,
    IntentConfigResponse,
    IntentSummaryResponse,
)

from ._shared import check_workspace_permission

router = APIRouter()


@router.get("/intent/signals", response_model=IntentSignalListResponse)
async def list_intent_signals(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    signal_type: str = None,
    intent_strength: str = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.intent_signal_service import IntentSignalService
    await check_workspace_permission(workspace_id, current_user, db)
    service = IntentSignalService(db)
    items, total = await service.list_signals(workspace_id, page=page, per_page=per_page, signal_type=signal_type, intent_strength=intent_strength)
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/intent/signals/{signal_id}", response_model=IntentSignalResponse)
async def get_intent_signal(
    workspace_id: str,
    signal_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.intent_signal_service import IntentSignalService
    await check_workspace_permission(workspace_id, current_user, db)
    service = IntentSignalService(db)
    result = await service.get_signal(workspace_id, signal_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/intent/signals", response_model=IntentSignalResponse)
async def create_intent_signal(
    workspace_id: str,
    data: IntentSignalCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.intent_signal_service import IntentSignalService
    await check_workspace_permission(workspace_id, current_user, db)
    service = IntentSignalService(db)
    return await service.create_signal(workspace_id, data)


@router.post("/intent/signals/{signal_id}/dismiss")
async def dismiss_intent_signal(
    workspace_id: str,
    signal_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.intent_signal_service import IntentSignalService
    await check_workspace_permission(workspace_id, current_user, db)
    service = IntentSignalService(db)
    result = await service.dismiss_signal(workspace_id, signal_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.get("/intent/records/{record_id}/signals", response_model=list[IntentSignalResponse])
async def get_record_intent_signals(
    workspace_id: str,
    record_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.intent_signal_service import IntentSignalService
    await check_workspace_permission(workspace_id, current_user, db)
    service = IntentSignalService(db)
    return await service.get_signals_for_record(workspace_id, record_id)


@router.get("/intent/config", response_model=IntentConfigResponse)
async def get_intent_config(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.intent_signal_service import IntentSignalService
    await check_workspace_permission(workspace_id, current_user, db)
    service = IntentSignalService(db)
    return await service.get_config(workspace_id)


@router.put("/intent/config", response_model=IntentConfigResponse)
async def update_intent_config(
    workspace_id: str,
    data: IntentConfigUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.intent_signal_service import IntentSignalService
    await check_workspace_permission(workspace_id, current_user, db)
    service = IntentSignalService(db)
    return await service.update_config(workspace_id, data.model_dump(exclude_none=True))


@router.get("/intent/summary", response_model=IntentSummaryResponse)
async def get_intent_summary(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.intent_signal_service import IntentSignalService
    await check_workspace_permission(workspace_id, current_user, db)
    service = IntentSignalService(db)
    return await service.get_summary(workspace_id)


@router.post("/intent/collect")
async def trigger_intent_collection(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    await check_workspace_permission(workspace_id, current_user, db)
    wf_id = await dispatch(
        "collect_intent_signals",
        {"workspace_id": workspace_id},
        task_queue=TaskQueue.ANALYSIS,
    )
    return {"workflow_id": wf_id, "message": "Intent collection started"}
