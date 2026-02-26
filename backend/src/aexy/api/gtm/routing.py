"""GTM Routing & SLA API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.gtm_routing import (
    RoutingRuleCreate,
    RoutingRuleUpdate,
    RoutingRuleResponse,
    LeadAssignmentListResponse,
    ReassignRequest,
    SLADashboardResponse,
)

from ._shared import check_workspace_permission

router = APIRouter()


@router.get("/routing/rules", response_model=list[RoutingRuleResponse])
async def list_routing_rules(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db)
    service = LeadRoutingService(db)
    return await service.list_rules(workspace_id)


@router.post("/routing/rules", response_model=RoutingRuleResponse)
async def create_routing_rule(
    workspace_id: str,
    data: RoutingRuleCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = LeadRoutingService(db)
    return await service.create_rule(workspace_id, data.model_dump())


@router.put("/routing/rules/{rule_id}", response_model=RoutingRuleResponse)
async def update_routing_rule(
    workspace_id: str,
    rule_id: str,
    data: RoutingRuleUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = LeadRoutingService(db)
    result = await service.update_rule(workspace_id, rule_id, data.model_dump(exclude_unset=True))
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.delete("/routing/rules/{rule_id}", status_code=204)
async def delete_routing_rule(
    workspace_id: str,
    rule_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = LeadRoutingService(db)
    deleted = await service.delete_rule(workspace_id, rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/routing/route/{record_id}")
async def manual_route_record(
    workspace_id: str,
    record_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = LeadRoutingService(db)
    return await service.route_record(workspace_id, record_id)


@router.get("/routing/assignments", response_model=LeadAssignmentListResponse)
async def list_routing_assignments(
    workspace_id: str,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=100),
    status: str = None,
    assignee_id: str = None,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db)
    service = LeadRoutingService(db)
    return await service.list_assignments(workspace_id, page=page, per_page=per_page, status=status, assignee_id=assignee_id)


@router.post("/routing/assignments/{assignment_id}/respond")
async def record_first_response(
    workspace_id: str,
    assignment_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = LeadRoutingService(db)
    result = await service.record_first_response(workspace_id, assignment_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.post("/routing/assignments/{assignment_id}/reassign")
async def reassign_assignment(
    workspace_id: str,
    assignment_id: str,
    data: ReassignRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db, required_role="admin")
    service = LeadRoutingService(db)
    result = await service.reassign(workspace_id, assignment_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return result


@router.get("/routing/sla-dashboard", response_model=SLADashboardResponse)
async def get_sla_dashboard(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    from aexy.services.lead_routing_service import LeadRoutingService
    await check_workspace_permission(workspace_id, current_user, db)
    service = LeadRoutingService(db)
    return await service.get_sla_dashboard(workspace_id)
