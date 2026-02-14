"""Leave management API endpoints."""

from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.leave import (
    LeaveTypeCreate,
    LeaveTypeUpdate,
    LeaveTypeResponse,
    LeavePolicyCreate,
    LeavePolicyUpdate,
    LeavePolicyResponse,
    LeaveRequestCreate,
    LeaveRequestResponse,
    LeaveRequestActionRequest,
    LeaveBalanceResponse,
    HolidayCreate,
    HolidayUpdate,
    HolidayResponse,
)
from aexy.services.leave_type_service import LeaveTypeService
from aexy.services.leave_policy_service import LeavePolicyService
from aexy.services.leave_request_service import LeaveRequestService
from aexy.services.leave_balance_service import LeaveBalanceService
from aexy.services.holiday_service import HolidayService


router = APIRouter(
    prefix="/workspaces/{workspace_id}/leave",
    tags=["Leave Management"],
)


# ─── Leave Types ───────────────────────────────────────────────────────────────


@router.get("/types", response_model=list[LeaveTypeResponse])
async def list_leave_types(
    workspace_id: str,
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List all leave types for a workspace."""
    service = LeaveTypeService(db)
    types = await service.get_all(workspace_id, include_inactive=include_inactive)
    return [LeaveTypeResponse.model_validate(t) for t in types]


@router.post("/types", response_model=LeaveTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_leave_type(
    workspace_id: str,
    data: LeaveTypeCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Create a new leave type."""
    service = LeaveTypeService(db)
    try:
        leave_type = await service.create(workspace_id=workspace_id, **data.model_dump())
        return LeaveTypeResponse.model_validate(leave_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/types/{type_id}", response_model=LeaveTypeResponse)
async def update_leave_type(
    workspace_id: str,
    type_id: str,
    data: LeaveTypeUpdate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Update a leave type."""
    service = LeaveTypeService(db)
    updated = await service.update(type_id, **data.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Leave type not found")
    return LeaveTypeResponse.model_validate(updated)


@router.delete("/types/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_leave_type(
    workspace_id: str,
    type_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Delete a leave type."""
    service = LeaveTypeService(db)
    success = await service.delete(type_id)
    if not success:
        raise HTTPException(status_code=404, detail="Leave type not found")


# ─── Leave Policies ───────────────────────────────────────────────────────────


@router.get("/policies", response_model=list[LeavePolicyResponse])
async def list_leave_policies(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List all leave policies for a workspace."""
    service = LeavePolicyService(db)
    policies = await service.get_all(workspace_id)
    return [LeavePolicyResponse.model_validate(p) for p in policies]


@router.post("/policies", response_model=LeavePolicyResponse, status_code=status.HTTP_201_CREATED)
async def create_leave_policy(
    workspace_id: str,
    data: LeavePolicyCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Create a new leave policy."""
    service = LeavePolicyService(db)
    try:
        policy = await service.create(workspace_id=workspace_id, **data.model_dump())
        return LeavePolicyResponse.model_validate(policy)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/policies/{policy_id}", response_model=LeavePolicyResponse)
async def update_leave_policy(
    workspace_id: str,
    policy_id: str,
    data: LeavePolicyUpdate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Update a leave policy."""
    service = LeavePolicyService(db)
    updated = await service.update(policy_id, **data.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Leave policy not found")
    return LeavePolicyResponse.model_validate(updated)


@router.delete("/policies/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_leave_policy(
    workspace_id: str,
    policy_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Delete a leave policy."""
    service = LeavePolicyService(db)
    success = await service.delete(policy_id)
    if not success:
        raise HTTPException(status_code=404, detail="Leave policy not found")


# ─── Leave Requests ───────────────────────────────────────────────────────────


@router.post("/requests", response_model=LeaveRequestResponse, status_code=status.HTTP_201_CREATED)
async def submit_leave_request(
    workspace_id: str,
    data: LeaveRequestCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Submit a new leave request."""
    service = LeaveRequestService(db)
    try:
        request = await service.submit_request(
            workspace_id=workspace_id,
            developer_id=current_developer.id,
            leave_type_id=data.leave_type_id,
            start_date=data.start_date,
            end_date=data.end_date,
            reason=data.reason,
            is_half_day=data.is_half_day,
            half_day_period=data.half_day_period,
        )
        return LeaveRequestResponse.model_validate(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/requests", response_model=list[LeaveRequestResponse])
async def list_leave_requests(
    workspace_id: str,
    developer_id: str | None = Query(None),
    request_status: str | None = Query(None, alias="status"),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List leave requests for a workspace."""
    service = LeaveRequestService(db)
    requests = await service.get_requests(
        workspace_id=workspace_id,
        developer_id=developer_id,
        status=request_status,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )
    return [LeaveRequestResponse.model_validate(r) for r in requests]


@router.get("/requests/my", response_model=list[LeaveRequestResponse])
async def list_my_leave_requests(
    workspace_id: str,
    request_status: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List current developer's leave requests."""
    service = LeaveRequestService(db)
    requests = await service.get_requests(
        workspace_id=workspace_id,
        developer_id=current_developer.id,
        status=request_status,
    )
    return [LeaveRequestResponse.model_validate(r) for r in requests]


@router.put("/requests/{request_id}/approve", response_model=LeaveRequestResponse)
async def approve_leave_request(
    workspace_id: str,
    request_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Approve a leave request."""
    service = LeaveRequestService(db)
    try:
        request = await service.approve(request_id, current_developer.id)
        return LeaveRequestResponse.model_validate(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/requests/{request_id}/reject", response_model=LeaveRequestResponse)
async def reject_leave_request(
    workspace_id: str,
    request_id: str,
    data: LeaveRequestActionRequest,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Reject a leave request."""
    service = LeaveRequestService(db)
    try:
        request = await service.reject(request_id, current_developer.id, data.reason)
        return LeaveRequestResponse.model_validate(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/requests/{request_id}/cancel", response_model=LeaveRequestResponse)
async def cancel_leave_request(
    workspace_id: str,
    request_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Cancel an approved leave request."""
    service = LeaveRequestService(db)
    try:
        request = await service.cancel(request_id, current_developer.id)
        return LeaveRequestResponse.model_validate(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/requests/{request_id}/withdraw", response_model=LeaveRequestResponse)
async def withdraw_leave_request(
    workspace_id: str,
    request_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Withdraw a pending leave request."""
    service = LeaveRequestService(db)
    try:
        request = await service.withdraw(request_id, current_developer.id)
        return LeaveRequestResponse.model_validate(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Leave Balances ───────────────────────────────────────────────────────────


@router.get("/balance", response_model=list[LeaveBalanceResponse])
async def get_my_balance(
    workspace_id: str,
    year: int | None = Query(None, ge=2020, le=2100),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get current developer's leave balances."""
    effective_year = year or datetime.now().year
    service = LeaveBalanceService(db)
    balances = await service.get_all_balances(workspace_id, current_developer.id, effective_year)
    return [LeaveBalanceResponse.model_validate(b) for b in balances]


@router.get("/balance/{developer_id}", response_model=list[LeaveBalanceResponse])
async def get_developer_balance(
    workspace_id: str,
    developer_id: str,
    year: int | None = Query(None, ge=2020, le=2100),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get a specific developer's leave balances (managers only)."""
    effective_year = year or datetime.now().year
    service = LeaveBalanceService(db)
    balances = await service.get_all_balances(workspace_id, developer_id, effective_year)
    return [LeaveBalanceResponse.model_validate(b) for b in balances]


@router.get("/balance/team/{team_id}", response_model=list[LeaveBalanceResponse])
async def get_team_balances(
    workspace_id: str,
    team_id: str,
    year: int | None = Query(None, ge=2020, le=2100),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get leave balances for all members of a team."""
    effective_year = year or datetime.now().year
    service = LeaveBalanceService(db)
    balances = await service.get_team_balances(workspace_id, team_id, effective_year)
    return [LeaveBalanceResponse.model_validate(b) for b in balances]


# ─── Approvals ─────────────────────────────────────────────────────────────────


@router.get("/approvals/pending", response_model=list[LeaveRequestResponse])
async def list_pending_approvals(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List pending leave requests for the current approver."""
    service = LeaveRequestService(db)
    requests = await service.get_pending_approvals(workspace_id, current_developer.id)
    return [LeaveRequestResponse.model_validate(r) for r in requests]


# ─── Holidays ──────────────────────────────────────────────────────────────────


@router.get("/holidays", response_model=list[HolidayResponse])
async def list_holidays(
    workspace_id: str,
    year: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List holidays for a workspace."""
    service = HolidayService(db)
    holidays = await service.get_all(workspace_id, year=year)
    return [HolidayResponse.model_validate(h) for h in holidays]


@router.post("/holidays", response_model=HolidayResponse, status_code=status.HTTP_201_CREATED)
async def create_holiday(
    workspace_id: str,
    data: HolidayCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Create a new holiday."""
    service = HolidayService(db)
    holiday = await service.create(workspace_id=workspace_id, **data.model_dump())
    return HolidayResponse.model_validate(holiday)


@router.put("/holidays/{holiday_id}", response_model=HolidayResponse)
async def update_holiday(
    workspace_id: str,
    holiday_id: str,
    data: HolidayUpdate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Update a holiday."""
    service = HolidayService(db)
    updated = await service.update(holiday_id, **data.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Holiday not found")
    return HolidayResponse.model_validate(updated)


@router.delete("/holidays/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_holiday(
    workspace_id: str,
    holiday_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Delete a holiday."""
    service = HolidayService(db)
    success = await service.delete(holiday_id)
    if not success:
        raise HTTPException(status_code=404, detail="Holiday not found")
