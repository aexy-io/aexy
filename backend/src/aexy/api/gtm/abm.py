"""GTM ABM (Account-Based Marketing) API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm_abm import (
    TargetListCreate,
    TargetListUpdate,
    TargetListResponse,
    ABMAccountCreate,
    ABMAccountUpdate,
    ABMAccountResponse,
    ABMAccountListResponse,
    ABMOverviewResponse,
    StageChangeRequest,
    CampaignAssignRequest,
    AccountJourneyResponse,
)

from ._shared import check_workspace_permission

router = APIRouter()


@router.get("/abm/lists", response_model=list[TargetListResponse])
async def list_abm_target_lists(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    return await service.list_target_lists(workspace_id)


@router.post("/abm/lists", response_model=TargetListResponse)
async def create_abm_target_list(
    workspace_id: str,
    data: TargetListCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    return await service.create_target_list(workspace_id, data.model_dump())


@router.get("/abm/overview", response_model=ABMOverviewResponse)
async def get_abm_overview(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    return await service.get_abm_overview(workspace_id)


@router.get("/abm/accounts", response_model=ABMAccountListResponse)
async def list_abm_accounts(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    target_list_id: str = None,
    tier: str = None,
    stage: str = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    return await service.list_accounts(workspace_id, page=page, per_page=per_page, target_list_id=target_list_id, tier=tier, stage=stage)


@router.get("/abm/lists/{list_id}", response_model=TargetListResponse)
async def get_abm_target_list(
    workspace_id: str,
    list_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    result = await service.get_target_list(workspace_id, list_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.put("/abm/lists/{list_id}", response_model=TargetListResponse)
async def update_abm_target_list(
    workspace_id: str,
    list_id: str,
    data: TargetListUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    result = await service.update_target_list(workspace_id, list_id, data.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.delete("/abm/lists/{list_id}", status_code=204)
async def delete_abm_target_list(
    workspace_id: str,
    list_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    deleted = await service.delete_target_list(workspace_id, list_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/abm/lists/{list_id}/accounts")
async def add_abm_accounts_to_list(
    workspace_id: str,
    list_id: str,
    data: list[ABMAccountCreate],
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    parsed = [item.model_dump() for item in data]
    service = ABMService(db)
    return await service.add_accounts(workspace_id, list_id, parsed)


@router.post("/abm/lists/{list_id}/refresh")
async def refresh_abm_target_list(
    workspace_id: str,
    list_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    await check_workspace_permission(workspace_id, current_user, db)
    wf_id = await dispatch(
        "refresh_dynamic_abm_lists",
        {"workspace_id": workspace_id, "list_id": list_id},
        task_queue=TaskQueue.SYNC,
    )
    return {"workflow_id": wf_id, "message": "List refresh started"}


@router.get("/abm/accounts/{account_id}", response_model=ABMAccountResponse)
async def get_abm_account(
    workspace_id: str,
    account_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    result = await service.get_account(workspace_id, account_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.put("/abm/accounts/{account_id}", response_model=ABMAccountResponse)
async def update_abm_account(
    workspace_id: str,
    account_id: str,
    data: ABMAccountUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    result = await service.update_account(workspace_id, account_id, data.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.delete("/abm/accounts/{account_id}", status_code=204)
async def delete_abm_account(
    workspace_id: str,
    account_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    deleted = await service.remove_account(workspace_id, account_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/abm/accounts/{account_id}/stage", response_model=ABMAccountResponse)
async def change_abm_account_stage(
    workspace_id: str,
    account_id: str,
    data: StageChangeRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    result = await service.change_stage(workspace_id, account_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/abm/accounts/{account_id}/campaign", response_model=ABMAccountResponse)
async def assign_abm_campaign(
    workspace_id: str,
    account_id: str,
    data: CampaignAssignRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    result = await service.assign_campaign(workspace_id, account_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.get("/abm/accounts/{account_id}/journey", response_model=AccountJourneyResponse)
async def get_abm_account_journey(
    workspace_id: str,
    account_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.abm_service import ABMService
    await check_workspace_permission(workspace_id, current_user, db)
    service = ABMService(db)
    result = await service.get_account_journey(workspace_id, account_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result
