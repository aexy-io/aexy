"""Manager learning controls API endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.schemas.learning_management import (
    ApprovalQueue,
    ApprovalStatusEnum,
    BudgetTransactionFilter,
    CourseApprovalDecision,
    CourseApprovalRequestCreate,
    CourseApprovalRequestFilter,
    CourseApprovalRequestList,
    CourseApprovalRequestResponse,
    CourseApprovalRequestUpdate,
    CourseApprovalRequestWithDetails,
    DeveloperLearningProgress,
    DeveloperLearningProgressList,
    GoalStatusEnum,
    GoalTypeEnum,
    LearningBudgetAdjustment,
    LearningBudgetCreate,
    LearningBudgetFilter,
    LearningBudgetList,
    LearningBudgetResponse,
    LearningBudgetTransactionList,
    LearningBudgetTransfer,
    LearningBudgetUpdate,
    LearningBudgetWithDetails,
    LearningGoalCreate,
    LearningGoalFilter,
    LearningGoalList,
    LearningGoalProgressUpdate,
    LearningGoalResponse,
    LearningGoalUpdate,
    LearningGoalWithDetails,
    ManagerDashboardOverview,
    TeamLearningProgress,
    TeamLearningProgressList,
    TransactionTypeEnum,
)
from aexy.services.learning_management_service import LearningManagementService

router = APIRouter(prefix="/learning/manager", tags=["learning-manager"])


# ==================== Learning Goals ====================

@router.post("/goals", response_model=LearningGoalResponse, status_code=status.HTTP_201_CREATED)
async def create_learning_goal(
    data: LearningGoalCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> LearningGoalResponse:
    """Create a learning goal for a developer.

    Managers can set goals for their team members.
    """
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    goal = await service.create_learning_goal(
        workspace_id=current_user.current_workspace_id,
        data=data,
        set_by_id=current_user.id,
    )

    return LearningGoalResponse.model_validate(goal)


@router.get("/goals", response_model=LearningGoalList)
async def list_learning_goals(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    developer_id: str | None = Query(default=None, description="Filter by developer"),
    set_by_id: str | None = Query(default=None, description="Filter by goal setter"),
    goal_type: GoalTypeEnum | None = Query(default=None, description="Filter by goal type"),
    goal_status: GoalStatusEnum | None = Query(default=None, alias="status", description="Filter by status"),
    is_overdue: bool | None = Query(default=None, description="Filter overdue goals"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> LearningGoalList:
    """List learning goals with optional filters."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    filters = LearningGoalFilter(
        developer_id=developer_id,
        set_by_id=set_by_id,
        goal_type=goal_type,
        status=goal_status,
        is_overdue=is_overdue,
    )

    service = LearningManagementService(db)
    goals, total = await service.list_learning_goals(
        workspace_id=current_user.current_workspace_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return LearningGoalList(
        items=goals,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/goals/{goal_id}", response_model=LearningGoalWithDetails)
async def get_learning_goal(
    goal_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> LearningGoalWithDetails:
    """Get a specific learning goal."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    goal = await service.get_learning_goal(goal_id, current_user.current_workspace_id)

    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning goal not found",
        )

    return await service._get_goal_with_details(goal)


@router.put("/goals/{goal_id}", response_model=LearningGoalResponse)
async def update_learning_goal(
    goal_id: str,
    data: LearningGoalUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> LearningGoalResponse:
    """Update a learning goal."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    goal = await service.update_learning_goal(
        goal_id=goal_id,
        workspace_id=current_user.current_workspace_id,
        data=data,
        actor_id=current_user.id,
    )

    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning goal not found",
        )

    return LearningGoalResponse.model_validate(goal)


@router.put("/goals/{goal_id}/progress", response_model=LearningGoalResponse)
async def update_goal_progress(
    goal_id: str,
    data: LearningGoalProgressUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> LearningGoalResponse:
    """Update goal progress."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    goal = await service.update_goal_progress(
        goal_id=goal_id,
        workspace_id=current_user.current_workspace_id,
        data=data,
        actor_id=current_user.id,
    )

    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning goal not found",
        )

    return LearningGoalResponse.model_validate(goal)


@router.delete("/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_learning_goal(
    goal_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> None:
    """Delete a learning goal."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    deleted = await service.delete_learning_goal(
        goal_id=goal_id,
        workspace_id=current_user.current_workspace_id,
        actor_id=current_user.id,
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning goal not found",
        )


# ==================== Course Approval Requests ====================

@router.post("/approvals", response_model=CourseApprovalRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_approval_request(
    data: CourseApprovalRequestCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> CourseApprovalRequestResponse:
    """Create a course approval request."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    request = await service.create_approval_request(
        workspace_id=current_user.current_workspace_id,
        data=data,
        requester_id=current_user.id,
    )

    return CourseApprovalRequestResponse.model_validate(request)


@router.get("/approvals", response_model=CourseApprovalRequestList)
async def list_approval_requests(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    requester_id: str | None = Query(default=None, description="Filter by requester"),
    approver_id: str | None = Query(default=None, description="Filter by approver"),
    approval_status: ApprovalStatusEnum | None = Query(default=None, alias="status", description="Filter by status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> CourseApprovalRequestList:
    """List course approval requests."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    filters = CourseApprovalRequestFilter(
        requester_id=requester_id,
        approver_id=approver_id,
        status=approval_status,
    )

    service = LearningManagementService(db)
    requests, total = await service.list_approval_requests(
        workspace_id=current_user.current_workspace_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return CourseApprovalRequestList(
        items=requests,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/approvals/queue", response_model=ApprovalQueue)
async def get_approval_queue(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> ApprovalQueue:
    """Get the approval queue for the current manager."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    return await service.get_approval_queue(
        workspace_id=current_user.current_workspace_id,
        approver_id=current_user.id,
        page=page,
        page_size=page_size,
    )


@router.get("/approvals/{request_id}", response_model=CourseApprovalRequestWithDetails)
async def get_approval_request(
    request_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> CourseApprovalRequestWithDetails:
    """Get a specific approval request."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    request = await service.get_approval_request(request_id, current_user.current_workspace_id)

    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval request not found",
        )

    return await service._get_approval_request_with_details(request)


@router.put("/approvals/{request_id}", response_model=CourseApprovalRequestResponse)
async def update_approval_request(
    request_id: str,
    data: CourseApprovalRequestUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> CourseApprovalRequestResponse:
    """Update an approval request (only by requester, before decision)."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    request = await service.update_approval_request(
        request_id=request_id,
        workspace_id=current_user.current_workspace_id,
        data=data,
        actor_id=current_user.id,
    )

    if not request:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update request. Either not found, not pending, or not the requester.",
        )

    return CourseApprovalRequestResponse.model_validate(request)


@router.post("/approvals/{request_id}/decide", response_model=CourseApprovalRequestResponse)
async def decide_approval_request(
    request_id: str,
    data: CourseApprovalDecision,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> CourseApprovalRequestResponse:
    """Approve or reject an approval request."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    request = await service.decide_approval_request(
        request_id=request_id,
        workspace_id=current_user.current_workspace_id,
        data=data,
        decider_id=current_user.id,
    )

    if not request:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot decide on request. Either not found or not pending.",
        )

    return CourseApprovalRequestResponse.model_validate(request)


@router.post("/approvals/{request_id}/cancel", response_model=CourseApprovalRequestResponse)
async def cancel_approval_request(
    request_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> CourseApprovalRequestResponse:
    """Cancel an approval request (only by requester)."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    request = await service.cancel_approval_request(
        request_id=request_id,
        workspace_id=current_user.current_workspace_id,
        actor_id=current_user.id,
    )

    if not request:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot cancel request. Either not found, not pending, or not the requester.",
        )

    return CourseApprovalRequestResponse.model_validate(request)


# ==================== Learning Budgets ====================

@router.post("/budgets", response_model=LearningBudgetResponse, status_code=status.HTTP_201_CREATED)
async def create_learning_budget(
    data: LearningBudgetCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> LearningBudgetResponse:
    """Create a learning budget for a developer or team."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    # Must have either developer_id or team_id
    if not data.developer_id and not data.team_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must specify either developer_id or team_id",
        )

    service = LearningManagementService(db)
    budget = await service.create_learning_budget(
        workspace_id=current_user.current_workspace_id,
        data=data,
        created_by_id=current_user.id,
    )

    return LearningBudgetResponse.model_validate(budget)


@router.get("/budgets", response_model=LearningBudgetList)
async def list_learning_budgets(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    developer_id: str | None = Query(default=None, description="Filter by developer"),
    team_id: str | None = Query(default=None, description="Filter by team"),
    fiscal_year: int | None = Query(default=None, description="Filter by fiscal year"),
    is_active: bool | None = Query(default=None, description="Filter by active status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> LearningBudgetList:
    """List learning budgets."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    filters = LearningBudgetFilter(
        developer_id=developer_id,
        team_id=team_id,
        fiscal_year=fiscal_year,
        is_active=is_active,
    )

    service = LearningManagementService(db)
    budgets, total = await service.list_learning_budgets(
        workspace_id=current_user.current_workspace_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return LearningBudgetList(
        items=budgets,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/budgets/{budget_id}", response_model=LearningBudgetWithDetails)
async def get_learning_budget(
    budget_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> LearningBudgetWithDetails:
    """Get a specific learning budget."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    budget = await service.get_learning_budget(budget_id, current_user.current_workspace_id)

    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning budget not found",
        )

    return await service._get_budget_with_details(budget)


@router.put("/budgets/{budget_id}", response_model=LearningBudgetResponse)
async def update_learning_budget(
    budget_id: str,
    data: LearningBudgetUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> LearningBudgetResponse:
    """Update a learning budget."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    budget = await service.update_learning_budget(
        budget_id=budget_id,
        workspace_id=current_user.current_workspace_id,
        data=data,
        actor_id=current_user.id,
    )

    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning budget not found",
        )

    return LearningBudgetResponse.model_validate(budget)


@router.post("/budgets/{budget_id}/adjust", response_model=LearningBudgetResponse)
async def adjust_learning_budget(
    budget_id: str,
    data: LearningBudgetAdjustment,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> LearningBudgetResponse:
    """Adjust budget amount with audit trail."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    budget = await service.adjust_budget(
        budget_id=budget_id,
        workspace_id=current_user.current_workspace_id,
        data=data,
        actor_id=current_user.id,
    )

    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Learning budget not found",
        )

    return LearningBudgetResponse.model_validate(budget)


@router.post("/budgets/transfer", response_model=dict)
async def transfer_budget(
    data: LearningBudgetTransfer,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> dict:
    """Transfer budget between budgets."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    source, target = await service.transfer_budget(
        workspace_id=current_user.current_workspace_id,
        data=data,
        actor_id=current_user.id,
    )

    if not source or not target:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transfer failed. Check that both budgets exist and source has sufficient funds.",
        )

    return {
        "source": LearningBudgetResponse.model_validate(source),
        "target": LearningBudgetResponse.model_validate(target),
    }


@router.get("/budgets/{budget_id}/transactions", response_model=LearningBudgetTransactionList)
async def list_budget_transactions(
    budget_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    transaction_type: TransactionTypeEnum | None = Query(default=None, description="Filter by type"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> LearningBudgetTransactionList:
    """List transactions for a budget."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    filters = BudgetTransactionFilter(transaction_type=transaction_type)

    service = LearningManagementService(db)
    transactions, total = await service.list_budget_transactions(
        budget_id=budget_id,
        workspace_id=current_user.current_workspace_id,
        filters=filters,
        page=page,
        page_size=page_size,
    )

    return LearningBudgetTransactionList(
        items=transactions,
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


# ==================== Manager Dashboard ====================

@router.get("/dashboard", response_model=ManagerDashboardOverview)
async def get_manager_dashboard(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    team_ids: list[str] | None = Query(default=None, description="Filter by team IDs"),
) -> ManagerDashboardOverview:
    """Get manager dashboard overview."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    return await service.get_manager_dashboard(
        workspace_id=current_user.current_workspace_id,
        manager_id=current_user.id,
        team_ids=team_ids,
    )


@router.get("/team/{team_id}/progress", response_model=TeamLearningProgress)
async def get_team_progress(
    team_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> TeamLearningProgress:
    """Get learning progress for a team."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    return await service.get_team_learning_progress(
        workspace_id=current_user.current_workspace_id,
        team_id=team_id,
    )


@router.get("/developer/{developer_id}/progress", response_model=DeveloperLearningProgress)
async def get_developer_progress(
    developer_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> DeveloperLearningProgress:
    """Get learning progress for a developer."""
    if not current_user.current_workspace_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No workspace selected",
        )

    service = LearningManagementService(db)
    return await service.get_developer_learning_progress(
        workspace_id=current_user.current_workspace_id,
        developer_id=developer_id,
    )
