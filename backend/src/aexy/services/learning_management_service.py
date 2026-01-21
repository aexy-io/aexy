"""Learning management service for manager controls."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.compliance import AuditActionType, LearningAuditLog
from aexy.models.developer import Developer
from aexy.models.learning_management import (
    ApprovalStatus,
    CourseApprovalRequest,
    GoalStatus,
    LearningBudget,
    LearningBudgetTransaction,
    LearningGoal,
    TransactionType,
)
from aexy.models.team import Team, TeamMember
from aexy.schemas.learning_management import (
    ApprovalQueue,
    ApprovalQueueItem,
    BudgetTransactionFilter,
    CourseApprovalDecision,
    CourseApprovalRequestCreate,
    CourseApprovalRequestFilter,
    CourseApprovalRequestUpdate,
    CourseApprovalRequestWithDetails,
    DeveloperLearningProgress,
    LearningBudgetAdjustment,
    LearningBudgetCreate,
    LearningBudgetFilter,
    LearningBudgetTransactionWithDetails,
    LearningBudgetTransfer,
    LearningBudgetUpdate,
    LearningBudgetWithDetails,
    LearningGoalCreate,
    LearningGoalFilter,
    LearningGoalProgressUpdate,
    LearningGoalUpdate,
    LearningGoalWithDetails,
    ManagerDashboardOverview,
    TeamLearningProgress,
)

logger = logging.getLogger(__name__)


class LearningManagementService:
    """Service for managing learning goals, approvals, and budgets."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialize the learning management service."""
        self.db = db

    # ==================== Audit Logging ====================

    async def _create_audit_log(
        self,
        workspace_id: str,
        actor_id: str,
        action_type: AuditActionType,
        target_type: str,
        target_id: str,
        old_value: dict | None = None,
        new_value: dict | None = None,
        description: str | None = None,
        extra_data: dict | None = None,
    ) -> LearningAuditLog:
        """Create an audit log entry."""
        log = LearningAuditLog(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action_type=action_type.value,
            target_type=target_type,
            target_id=target_id,
            old_value=old_value,
            new_value=new_value,
            description=description,
            extra_data=extra_data or {},
        )
        self.db.add(log)
        await self.db.flush()
        return log

    # ==================== Helper Methods ====================

    async def _get_developer_by_id(self, developer_id: str) -> Developer | None:
        """Get developer by ID."""
        result = await self.db.execute(
            select(Developer).where(Developer.id == developer_id)
        )
        return result.scalar_one_or_none()

    async def _get_team_by_id(self, team_id: str) -> Team | None:
        """Get team by ID."""
        result = await self.db.execute(
            select(Team).where(Team.id == team_id)
        )
        return result.scalar_one_or_none()

    # ==================== Learning Goals CRUD ====================

    async def create_learning_goal(
        self,
        workspace_id: str,
        data: LearningGoalCreate,
        set_by_id: str,
    ) -> LearningGoal:
        """Create a new learning goal for a developer."""
        goal = LearningGoal(
            workspace_id=workspace_id,
            developer_id=data.developer_id,
            set_by_id=set_by_id,
            title=data.title,
            description=data.description,
            goal_type=data.goal_type.value,
            target_config=data.target_config,
            target_value=data.target_value,
            due_date=data.due_date,
            priority=data.priority,
            is_visible_to_developer=data.is_visible_to_developer,
            notes=data.notes,
            extra_data=data.extra_data,
        )

        self.db.add(goal)
        await self.db.commit()
        await self.db.refresh(goal)

        # Create audit log
        await self._create_audit_log(
            workspace_id=workspace_id,
            actor_id=set_by_id,
            action_type=AuditActionType.GOAL_CREATED,
            target_type="goal",
            target_id=goal.id,
            new_value={"title": goal.title, "developer_id": goal.developer_id},
            description=f"Created learning goal: {goal.title}",
        )
        await self.db.commit()

        logger.info(f"Created learning goal {goal.id} for developer {data.developer_id}")
        return goal

    async def get_learning_goal(
        self,
        goal_id: str,
        workspace_id: str | None = None,
    ) -> LearningGoal | None:
        """Get a learning goal by ID."""
        query = select(LearningGoal).where(LearningGoal.id == goal_id)

        if workspace_id:
            query = query.where(LearningGoal.workspace_id == workspace_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_learning_goals(
        self,
        workspace_id: str,
        filters: LearningGoalFilter | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[LearningGoalWithDetails], int]:
        """List learning goals with filtering and pagination."""
        query = select(LearningGoal).where(LearningGoal.workspace_id == workspace_id)

        if filters:
            if filters.developer_id:
                query = query.where(LearningGoal.developer_id == filters.developer_id)
            if filters.set_by_id:
                query = query.where(LearningGoal.set_by_id == filters.set_by_id)
            if filters.goal_type:
                query = query.where(LearningGoal.goal_type == filters.goal_type.value)
            if filters.status:
                query = query.where(LearningGoal.status == filters.status.value)
            if filters.is_overdue:
                now = datetime.now(timezone.utc)
                query = query.where(
                    and_(
                        LearningGoal.due_date < now,
                        LearningGoal.status.notin_([
                            GoalStatus.COMPLETED.value,
                            GoalStatus.CANCELLED.value
                        ])
                    )
                )
            if filters.from_date:
                query = query.where(LearningGoal.created_at >= filters.from_date)
            if filters.to_date:
                query = query.where(LearningGoal.created_at <= filters.to_date)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        query = query.order_by(LearningGoal.priority.desc(), LearningGoal.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        goals = list(result.scalars().all())

        # Build response with details
        goals_with_details = []
        for goal in goals:
            details = await self._get_goal_with_details(goal)
            goals_with_details.append(details)

        return goals_with_details, total

    async def _get_goal_with_details(self, goal: LearningGoal) -> LearningGoalWithDetails:
        """Get goal with developer and manager details."""
        developer = await self._get_developer_by_id(goal.developer_id)
        set_by = await self._get_developer_by_id(goal.set_by_id)

        now = datetime.now(timezone.utc)
        days_until_due = None
        is_overdue = False

        if goal.due_date:
            due_date = goal.due_date if goal.due_date.tzinfo else goal.due_date.replace(tzinfo=timezone.utc)
            days_until_due = (due_date - now).days
            is_overdue = days_until_due < 0 and goal.status not in [
                GoalStatus.COMPLETED.value,
                GoalStatus.CANCELLED.value
            ]

        return LearningGoalWithDetails(
            id=goal.id,
            workspace_id=goal.workspace_id,
            developer_id=goal.developer_id,
            set_by_id=goal.set_by_id,
            title=goal.title,
            description=goal.description,
            goal_type=goal.goal_type,
            target_config=goal.target_config,
            progress_percentage=goal.progress_percentage,
            progress_data=goal.progress_data,
            current_value=goal.current_value,
            target_value=goal.target_value,
            due_date=goal.due_date,
            started_at=goal.started_at,
            completed_at=goal.completed_at,
            status=goal.status,
            priority=goal.priority,
            is_visible_to_developer=goal.is_visible_to_developer,
            notes=goal.notes,
            extra_data=goal.extra_data,
            created_at=goal.created_at,
            updated_at=goal.updated_at,
            developer_name=developer.name if developer else "",
            developer_email=developer.email if developer else "",
            set_by_name=set_by.name if set_by else "",
            set_by_email=set_by.email if set_by else "",
            days_until_due=days_until_due,
            is_overdue=is_overdue,
        )

    async def update_learning_goal(
        self,
        goal_id: str,
        workspace_id: str,
        data: LearningGoalUpdate,
        actor_id: str,
    ) -> LearningGoal | None:
        """Update a learning goal."""
        goal = await self.get_learning_goal(goal_id, workspace_id)
        if not goal:
            return None

        old_value = {"title": goal.title, "status": goal.status}

        # Update fields
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if field == "goal_type" and value:
                value = value.value
            elif field == "status" and value:
                value = value.value
            setattr(goal, field, value)

        # Handle status changes
        if data.status == GoalStatus.IN_PROGRESS and not goal.started_at:
            goal.started_at = datetime.now(timezone.utc)
        elif data.status == GoalStatus.COMPLETED:
            goal.completed_at = datetime.now(timezone.utc)
            goal.progress_percentage = 100

        await self.db.commit()
        await self.db.refresh(goal)

        # Create audit log
        await self._create_audit_log(
            workspace_id=workspace_id,
            actor_id=actor_id,
            action_type=AuditActionType.GOAL_UPDATED,
            target_type="goal",
            target_id=goal.id,
            old_value=old_value,
            new_value={"title": goal.title, "status": goal.status},
            description=f"Updated learning goal: {goal.title}",
        )
        await self.db.commit()

        logger.info(f"Updated learning goal {goal_id}")
        return goal

    async def update_goal_progress(
        self,
        goal_id: str,
        workspace_id: str,
        data: LearningGoalProgressUpdate,
        actor_id: str,
    ) -> LearningGoal | None:
        """Update goal progress."""
        goal = await self.get_learning_goal(goal_id, workspace_id)
        if not goal:
            return None

        goal.current_value = data.current_value
        goal.progress_data = data.progress_data

        # Calculate progress percentage
        if goal.target_value > 0:
            goal.progress_percentage = min(
                100,
                int((data.current_value / goal.target_value) * 100)
            )

        # Auto-complete if 100%
        if goal.progress_percentage >= 100 and goal.status != GoalStatus.COMPLETED.value:
            goal.status = GoalStatus.COMPLETED.value
            goal.completed_at = datetime.now(timezone.utc)

            await self._create_audit_log(
                workspace_id=workspace_id,
                actor_id=actor_id,
                action_type=AuditActionType.GOAL_COMPLETED,
                target_type="goal",
                target_id=goal.id,
                new_value={"progress_percentage": goal.progress_percentage},
                description=f"Completed learning goal: {goal.title}",
            )

        # Mark as in progress if not started
        if goal.status == GoalStatus.PENDING.value and data.current_value > 0:
            goal.status = GoalStatus.IN_PROGRESS.value
            goal.started_at = datetime.now(timezone.utc)

        if data.notes:
            goal.notes = data.notes

        await self.db.commit()
        await self.db.refresh(goal)

        logger.info(f"Updated progress for goal {goal_id}: {goal.progress_percentage}%")
        return goal

    async def delete_learning_goal(
        self,
        goal_id: str,
        workspace_id: str,
        actor_id: str,
    ) -> bool:
        """Delete a learning goal."""
        goal = await self.get_learning_goal(goal_id, workspace_id)
        if not goal:
            return False

        await self.db.delete(goal)
        await self.db.commit()

        logger.info(f"Deleted learning goal {goal_id}")
        return True

    # ==================== Course Approval Requests CRUD ====================

    async def create_approval_request(
        self,
        workspace_id: str,
        data: CourseApprovalRequestCreate,
        requester_id: str,
    ) -> CourseApprovalRequest:
        """Create a new course approval request."""
        request = CourseApprovalRequest(
            workspace_id=workspace_id,
            requester_id=requester_id,
            approver_id=data.approver_id,
            request_type=data.request_type.value,
            course_title=data.course_title,
            course_provider=data.course_provider,
            course_url=data.course_url,
            course_description=data.course_description,
            estimated_cost_cents=data.estimated_cost_cents,
            currency=data.currency,
            estimated_hours=data.estimated_hours,
            justification=data.justification,
            skills_to_gain=data.skills_to_gain,
            linked_goal_id=data.linked_goal_id,
            extra_data=data.extra_data,
        )

        self.db.add(request)
        await self.db.commit()
        await self.db.refresh(request)

        # Create audit log
        await self._create_audit_log(
            workspace_id=workspace_id,
            actor_id=requester_id,
            action_type=AuditActionType.APPROVAL_REQUESTED,
            target_type="approval",
            target_id=request.id,
            new_value={
                "course_title": request.course_title,
                "estimated_cost_cents": request.estimated_cost_cents
            },
            description=f"Requested approval for: {request.course_title}",
        )
        await self.db.commit()

        logger.info(f"Created approval request {request.id} for {data.course_title}")
        return request

    async def get_approval_request(
        self,
        request_id: str,
        workspace_id: str | None = None,
    ) -> CourseApprovalRequest | None:
        """Get an approval request by ID."""
        query = select(CourseApprovalRequest).where(CourseApprovalRequest.id == request_id)

        if workspace_id:
            query = query.where(CourseApprovalRequest.workspace_id == workspace_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_approval_requests(
        self,
        workspace_id: str,
        filters: CourseApprovalRequestFilter | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[CourseApprovalRequestWithDetails], int]:
        """List approval requests with filtering."""
        query = select(CourseApprovalRequest).where(
            CourseApprovalRequest.workspace_id == workspace_id
        )

        if filters:
            if filters.requester_id:
                query = query.where(CourseApprovalRequest.requester_id == filters.requester_id)
            if filters.approver_id:
                query = query.where(CourseApprovalRequest.approver_id == filters.approver_id)
            if filters.request_type:
                query = query.where(
                    CourseApprovalRequest.request_type == filters.request_type.value
                )
            if filters.status:
                query = query.where(CourseApprovalRequest.status == filters.status.value)
            if filters.min_cost_cents is not None:
                query = query.where(
                    CourseApprovalRequest.estimated_cost_cents >= filters.min_cost_cents
                )
            if filters.max_cost_cents is not None:
                query = query.where(
                    CourseApprovalRequest.estimated_cost_cents <= filters.max_cost_cents
                )
            if filters.from_date:
                query = query.where(CourseApprovalRequest.created_at >= filters.from_date)
            if filters.to_date:
                query = query.where(CourseApprovalRequest.created_at <= filters.to_date)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        query = query.order_by(CourseApprovalRequest.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        requests = list(result.scalars().all())

        # Build response with details
        requests_with_details = []
        for request in requests:
            details = await self._get_approval_request_with_details(request)
            requests_with_details.append(details)

        return requests_with_details, total

    async def _get_approval_request_with_details(
        self,
        request: CourseApprovalRequest,
    ) -> CourseApprovalRequestWithDetails:
        """Get approval request with user details."""
        requester = await self._get_developer_by_id(request.requester_id)
        approver = await self._get_developer_by_id(request.approver_id) if request.approver_id else None
        decided_by = await self._get_developer_by_id(request.decided_by_id) if request.decided_by_id else None

        # Get linked goal title
        linked_goal_title = None
        if request.linked_goal_id:
            goal = await self.get_learning_goal(request.linked_goal_id)
            if goal:
                linked_goal_title = goal.title

        # Calculate days pending
        days_pending = None
        if request.status == ApprovalStatus.PENDING.value:
            now = datetime.now(timezone.utc)
            created = request.created_at if request.created_at.tzinfo else request.created_at.replace(tzinfo=timezone.utc)
            days_pending = (now - created).days

        return CourseApprovalRequestWithDetails(
            id=request.id,
            workspace_id=request.workspace_id,
            requester_id=request.requester_id,
            approver_id=request.approver_id,
            request_type=request.request_type,
            course_title=request.course_title,
            course_provider=request.course_provider,
            course_url=request.course_url,
            course_description=request.course_description,
            estimated_cost_cents=request.estimated_cost_cents,
            currency=request.currency,
            estimated_hours=request.estimated_hours,
            justification=request.justification,
            skills_to_gain=request.skills_to_gain,
            status=request.status,
            approved_at=request.approved_at,
            rejected_at=request.rejected_at,
            decision_reason=request.decision_reason,
            decided_by_id=request.decided_by_id,
            actual_cost_cents=request.actual_cost_cents,
            linked_goal_id=request.linked_goal_id,
            budget_transaction_id=request.budget_transaction_id,
            extra_data=request.extra_data,
            created_at=request.created_at,
            updated_at=request.updated_at,
            requester_name=requester.name if requester else "",
            requester_email=requester.email if requester else "",
            approver_name=approver.name if approver else None,
            approver_email=approver.email if approver else None,
            decided_by_name=decided_by.name if decided_by else None,
            decided_by_email=decided_by.email if decided_by else None,
            linked_goal_title=linked_goal_title,
            days_pending=days_pending,
        )

    async def update_approval_request(
        self,
        request_id: str,
        workspace_id: str,
        data: CourseApprovalRequestUpdate,
        actor_id: str,
    ) -> CourseApprovalRequest | None:
        """Update an approval request (before decision)."""
        request = await self.get_approval_request(request_id, workspace_id)
        if not request:
            return None

        # Can only update pending requests
        if request.status != ApprovalStatus.PENDING.value:
            return None

        # Only requester can update
        if request.requester_id != actor_id:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(request, field, value)

        await self.db.commit()
        await self.db.refresh(request)

        logger.info(f"Updated approval request {request_id}")
        return request

    async def decide_approval_request(
        self,
        request_id: str,
        workspace_id: str,
        data: CourseApprovalDecision,
        decider_id: str,
    ) -> CourseApprovalRequest | None:
        """Approve or reject an approval request."""
        request = await self.get_approval_request(request_id, workspace_id)
        if not request:
            return None

        # Can only decide pending requests
        if request.status != ApprovalStatus.PENDING.value:
            return None

        now = datetime.now(timezone.utc)

        if data.approved:
            request.status = ApprovalStatus.APPROVED.value
            request.approved_at = now
            action_type = AuditActionType.APPROVAL_APPROVED

            # Deduct from budget if applicable
            if data.actual_cost_cents is not None:
                request.actual_cost_cents = data.actual_cost_cents
                # Try to find and update budget
                await self._deduct_from_budget(
                    workspace_id=workspace_id,
                    developer_id=request.requester_id,
                    amount_cents=data.actual_cost_cents or request.estimated_cost_cents,
                    approval_request_id=request.id,
                    description=f"Course approval: {request.course_title}",
                    created_by_id=decider_id,
                )
        else:
            request.status = ApprovalStatus.REJECTED.value
            request.rejected_at = now
            action_type = AuditActionType.APPROVAL_REJECTED

        request.decision_reason = data.reason
        request.decided_by_id = decider_id

        await self.db.commit()
        await self.db.refresh(request)

        # Create audit log
        await self._create_audit_log(
            workspace_id=workspace_id,
            actor_id=decider_id,
            action_type=action_type,
            target_type="approval",
            target_id=request.id,
            new_value={
                "status": request.status,
                "decision_reason": request.decision_reason
            },
            description=f"{'Approved' if data.approved else 'Rejected'}: {request.course_title}",
        )
        await self.db.commit()

        logger.info(f"Decision made on approval request {request_id}: {'approved' if data.approved else 'rejected'}")
        return request

    async def cancel_approval_request(
        self,
        request_id: str,
        workspace_id: str,
        actor_id: str,
    ) -> CourseApprovalRequest | None:
        """Cancel an approval request."""
        request = await self.get_approval_request(request_id, workspace_id)
        if not request:
            return None

        # Can only cancel pending requests and only by requester
        if request.status != ApprovalStatus.PENDING.value or request.requester_id != actor_id:
            return None

        request.status = ApprovalStatus.CANCELLED.value

        await self.db.commit()
        await self.db.refresh(request)

        logger.info(f"Cancelled approval request {request_id}")
        return request

    async def get_approval_queue(
        self,
        workspace_id: str,
        approver_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> ApprovalQueue:
        """Get the approval queue for a manager."""
        query = select(CourseApprovalRequest).where(
            and_(
                CourseApprovalRequest.workspace_id == workspace_id,
                CourseApprovalRequest.status == ApprovalStatus.PENDING.value,
                or_(
                    CourseApprovalRequest.approver_id == approver_id,
                    CourseApprovalRequest.approver_id.is_(None),
                )
            )
        ).order_by(CourseApprovalRequest.created_at.asc())

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        requests = list(result.scalars().all())

        # Build queue items
        items = []
        total_pending_cost = 0

        for request in requests:
            details = await self._get_approval_request_with_details(request)

            # Check budget availability
            budget = await self._get_developer_budget(workspace_id, request.requester_id)
            budget_available = True
            budget_remaining_cents = None
            auto_approve_eligible = False

            if budget:
                budget_remaining_cents = budget.budget_cents - budget.spent_cents - budget.reserved_cents
                budget_available = budget_remaining_cents >= request.estimated_cost_cents

                if budget.auto_approve_under_cents and request.estimated_cost_cents <= budget.auto_approve_under_cents:
                    auto_approve_eligible = True

            items.append(ApprovalQueueItem(
                request=details,
                budget_available=budget_available,
                budget_remaining_cents=budget_remaining_cents,
                auto_approve_eligible=auto_approve_eligible,
            ))
            total_pending_cost += request.estimated_cost_cents

        return ApprovalQueue(
            items=items,
            total=total,
            total_pending_cost_cents=total_pending_cost,
        )

    # ==================== Learning Budgets CRUD ====================

    async def create_learning_budget(
        self,
        workspace_id: str,
        data: LearningBudgetCreate,
        created_by_id: str,
    ) -> LearningBudget:
        """Create a new learning budget."""
        budget = LearningBudget(
            workspace_id=workspace_id,
            developer_id=data.developer_id,
            team_id=data.team_id,
            name=data.name,
            description=data.description,
            fiscal_year=data.fiscal_year,
            fiscal_quarter=data.fiscal_quarter,
            budget_cents=data.budget_cents,
            currency=data.currency,
            allow_overspend=data.allow_overspend,
            overspend_limit_cents=data.overspend_limit_cents,
            auto_approve_under_cents=data.auto_approve_under_cents,
            requires_manager_approval=data.requires_manager_approval,
            extra_data=data.extra_data,
            created_by_id=created_by_id,
        )

        self.db.add(budget)
        await self.db.commit()
        await self.db.refresh(budget)

        # Create initial allocation transaction
        transaction = LearningBudgetTransaction(
            budget_id=budget.id,
            workspace_id=workspace_id,
            transaction_type=TransactionType.ALLOCATION.value,
            amount_cents=data.budget_cents,
            currency=data.currency,
            description=f"Initial budget allocation for FY{data.fiscal_year}",
            created_by_id=created_by_id,
            balance_after_cents=data.budget_cents,
        )
        self.db.add(transaction)
        await self.db.commit()

        logger.info(f"Created learning budget {budget.id} with ${data.budget_cents/100:.2f}")
        return budget

    async def get_learning_budget(
        self,
        budget_id: str,
        workspace_id: str | None = None,
    ) -> LearningBudget | None:
        """Get a learning budget by ID."""
        query = select(LearningBudget).where(LearningBudget.id == budget_id)

        if workspace_id:
            query = query.where(LearningBudget.workspace_id == workspace_id)

        query = query.options(selectinload(LearningBudget.transactions))

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_developer_budget(
        self,
        workspace_id: str,
        developer_id: str,
        fiscal_year: int | None = None,
    ) -> LearningBudget | None:
        """Get the active budget for a developer."""
        if fiscal_year is None:
            fiscal_year = datetime.now().year

        query = select(LearningBudget).where(
            and_(
                LearningBudget.workspace_id == workspace_id,
                LearningBudget.developer_id == developer_id,
                LearningBudget.fiscal_year == fiscal_year,
                LearningBudget.is_active == True,
            )
        )

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_learning_budgets(
        self,
        workspace_id: str,
        filters: LearningBudgetFilter | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[LearningBudgetWithDetails], int]:
        """List learning budgets with filtering."""
        query = select(LearningBudget).where(LearningBudget.workspace_id == workspace_id)

        if filters:
            if filters.developer_id:
                query = query.where(LearningBudget.developer_id == filters.developer_id)
            if filters.team_id:
                query = query.where(LearningBudget.team_id == filters.team_id)
            if filters.fiscal_year:
                query = query.where(LearningBudget.fiscal_year == filters.fiscal_year)
            if filters.fiscal_quarter:
                query = query.where(LearningBudget.fiscal_quarter == filters.fiscal_quarter)
            if filters.is_active is not None:
                query = query.where(LearningBudget.is_active == filters.is_active)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        query = query.order_by(LearningBudget.fiscal_year.desc(), LearningBudget.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        query = query.options(selectinload(LearningBudget.transactions))

        result = await self.db.execute(query)
        budgets = list(result.scalars().all())

        # Build response with details
        budgets_with_details = []
        for budget in budgets:
            details = await self._get_budget_with_details(budget)
            budgets_with_details.append(details)

        return budgets_with_details, total

    async def _get_budget_with_details(self, budget: LearningBudget) -> LearningBudgetWithDetails:
        """Get budget with computed fields and details."""
        developer = await self._get_developer_by_id(budget.developer_id) if budget.developer_id else None
        team = await self._get_team_by_id(budget.team_id) if budget.team_id else None
        created_by = await self._get_developer_by_id(budget.created_by_id) if budget.created_by_id else None

        # Count pending approvals
        pending_query = select(func.count(), func.sum(CourseApprovalRequest.estimated_cost_cents)).where(
            and_(
                CourseApprovalRequest.workspace_id == budget.workspace_id,
                CourseApprovalRequest.requester_id == budget.developer_id,
                CourseApprovalRequest.status == ApprovalStatus.PENDING.value,
            )
        ) if budget.developer_id else None

        pending_count = 0
        pending_total = 0
        if pending_query is not None:
            result = await self.db.execute(pending_query)
            row = result.first()
            if row:
                pending_count = row[0] or 0
                pending_total = row[1] or 0

        return LearningBudgetWithDetails(
            id=budget.id,
            workspace_id=budget.workspace_id,
            developer_id=budget.developer_id,
            team_id=budget.team_id,
            name=budget.name,
            description=budget.description,
            fiscal_year=budget.fiscal_year,
            fiscal_quarter=budget.fiscal_quarter,
            budget_cents=budget.budget_cents,
            spent_cents=budget.spent_cents,
            reserved_cents=budget.reserved_cents,
            currency=budget.currency,
            allow_overspend=budget.allow_overspend,
            overspend_limit_cents=budget.overspend_limit_cents,
            auto_approve_under_cents=budget.auto_approve_under_cents,
            requires_manager_approval=budget.requires_manager_approval,
            is_active=budget.is_active,
            extra_data=budget.extra_data,
            created_at=budget.created_at,
            updated_at=budget.updated_at,
            created_by_id=budget.created_by_id,
            remaining_cents=budget.budget_cents - budget.spent_cents - budget.reserved_cents,
            utilization_percentage=(budget.spent_cents / budget.budget_cents * 100) if budget.budget_cents > 0 else 0.0,
            developer_name=developer.name if developer else None,
            developer_email=developer.email if developer else None,
            team_name=team.name if team else None,
            created_by_name=created_by.name if created_by else None,
            total_transactions=len(budget.transactions) if budget.transactions else 0,
            pending_approvals_count=pending_count,
            pending_approvals_total_cents=pending_total,
        )

    async def update_learning_budget(
        self,
        budget_id: str,
        workspace_id: str,
        data: LearningBudgetUpdate,
        actor_id: str,
    ) -> LearningBudget | None:
        """Update a learning budget."""
        budget = await self.get_learning_budget(budget_id, workspace_id)
        if not budget:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(budget, field, value)

        await self.db.commit()
        await self.db.refresh(budget)

        logger.info(f"Updated learning budget {budget_id}")
        return budget

    async def adjust_budget(
        self,
        budget_id: str,
        workspace_id: str,
        data: LearningBudgetAdjustment,
        actor_id: str,
    ) -> LearningBudget | None:
        """Adjust budget amount with audit trail."""
        budget = await self.get_learning_budget(budget_id, workspace_id)
        if not budget:
            return None

        old_amount = budget.budget_cents
        budget.budget_cents += data.amount_cents

        # Create adjustment transaction
        transaction = LearningBudgetTransaction(
            budget_id=budget.id,
            workspace_id=workspace_id,
            transaction_type=TransactionType.ADJUSTMENT.value,
            amount_cents=data.amount_cents,
            currency=budget.currency,
            description=data.reason,
            created_by_id=actor_id,
            balance_after_cents=budget.budget_cents - budget.spent_cents,
        )
        self.db.add(transaction)

        await self.db.commit()
        await self.db.refresh(budget)

        logger.info(f"Adjusted budget {budget_id}: ${old_amount/100:.2f} -> ${budget.budget_cents/100:.2f}")
        return budget

    async def transfer_budget(
        self,
        workspace_id: str,
        data: LearningBudgetTransfer,
        actor_id: str,
    ) -> tuple[LearningBudget | None, LearningBudget | None]:
        """Transfer budget between budgets."""
        source = await self.get_learning_budget(data.source_budget_id, workspace_id)
        target = await self.get_learning_budget(data.target_budget_id, workspace_id)

        if not source or not target:
            return None, None

        # Check source has enough
        available = source.budget_cents - source.spent_cents - source.reserved_cents
        if available < data.amount_cents:
            return None, None

        # Deduct from source
        source.budget_cents -= data.amount_cents
        source_transaction = LearningBudgetTransaction(
            budget_id=source.id,
            workspace_id=workspace_id,
            transaction_type=TransactionType.TRANSFER_OUT.value,
            amount_cents=-data.amount_cents,
            currency=source.currency,
            description=data.reason,
            created_by_id=actor_id,
            balance_after_cents=source.budget_cents - source.spent_cents,
        )
        self.db.add(source_transaction)

        # Add to target
        target.budget_cents += data.amount_cents
        target_transaction = LearningBudgetTransaction(
            budget_id=target.id,
            workspace_id=workspace_id,
            transaction_type=TransactionType.TRANSFER_IN.value,
            amount_cents=data.amount_cents,
            currency=target.currency,
            description=data.reason,
            related_transaction_id=source_transaction.id,
            created_by_id=actor_id,
            balance_after_cents=target.budget_cents - target.spent_cents,
        )
        self.db.add(target_transaction)

        # Update source transaction with related
        await self.db.flush()
        source_transaction.related_transaction_id = target_transaction.id

        await self.db.commit()
        await self.db.refresh(source)
        await self.db.refresh(target)

        logger.info(f"Transferred ${data.amount_cents/100:.2f} from {source.id} to {target.id}")
        return source, target

    async def _deduct_from_budget(
        self,
        workspace_id: str,
        developer_id: str,
        amount_cents: int,
        approval_request_id: str,
        description: str,
        created_by_id: str,
    ) -> LearningBudgetTransaction | None:
        """Deduct from developer's budget after approval."""
        budget = await self._get_developer_budget(workspace_id, developer_id)
        if not budget:
            return None

        budget.spent_cents += amount_cents

        transaction = LearningBudgetTransaction(
            budget_id=budget.id,
            workspace_id=workspace_id,
            transaction_type=TransactionType.EXPENSE.value,
            amount_cents=-amount_cents,
            currency=budget.currency,
            description=description,
            approval_request_id=approval_request_id,
            created_by_id=created_by_id,
            balance_after_cents=budget.budget_cents - budget.spent_cents,
        )
        self.db.add(transaction)
        await self.db.flush()

        return transaction

    async def list_budget_transactions(
        self,
        budget_id: str,
        workspace_id: str,
        filters: BudgetTransactionFilter | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[LearningBudgetTransactionWithDetails], int]:
        """List transactions for a budget."""
        query = select(LearningBudgetTransaction).where(
            and_(
                LearningBudgetTransaction.budget_id == budget_id,
                LearningBudgetTransaction.workspace_id == workspace_id,
            )
        )

        if filters:
            if filters.transaction_type:
                query = query.where(
                    LearningBudgetTransaction.transaction_type == filters.transaction_type.value
                )
            if filters.from_date:
                query = query.where(LearningBudgetTransaction.created_at >= filters.from_date)
            if filters.to_date:
                query = query.where(LearningBudgetTransaction.created_at <= filters.to_date)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        query = query.order_by(LearningBudgetTransaction.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        transactions = list(result.scalars().all())

        # Build response with details
        transactions_with_details = []
        for txn in transactions:
            created_by = await self._get_developer_by_id(txn.created_by_id) if txn.created_by_id else None

            # Get approval request title
            approval_title = None
            if txn.approval_request_id:
                approval = await self.get_approval_request(txn.approval_request_id)
                if approval:
                    approval_title = approval.course_title

            transactions_with_details.append(LearningBudgetTransactionWithDetails(
                id=txn.id,
                budget_id=txn.budget_id,
                workspace_id=txn.workspace_id,
                transaction_type=txn.transaction_type,
                amount_cents=txn.amount_cents,
                currency=txn.currency,
                description=txn.description,
                approval_request_id=txn.approval_request_id,
                related_transaction_id=txn.related_transaction_id,
                created_by_id=txn.created_by_id,
                balance_after_cents=txn.balance_after_cents,
                extra_data=txn.extra_data,
                created_at=txn.created_at,
                created_by_name=created_by.name if created_by else None,
                created_by_email=created_by.email if created_by else None,
                approval_request_title=approval_title,
            ))

        return transactions_with_details, total

    # ==================== Manager Dashboard ====================

    async def get_manager_dashboard(
        self,
        workspace_id: str,
        manager_id: str,
        team_ids: list[str] | None = None,
    ) -> ManagerDashboardOverview:
        """Get manager dashboard overview."""
        # Get team members managed by this manager
        if team_ids:
            member_query = select(TeamMember.developer_id).where(
                TeamMember.team_id.in_(team_ids)
            ).distinct()
        else:
            # Get all teams where manager is a lead
            team_query = select(Team.id).where(
                and_(
                    Team.workspace_id == workspace_id,
                    Team.lead_developer_id == manager_id,
                )
            )
            team_result = await self.db.execute(team_query)
            team_ids = [t for t in team_result.scalars().all()]

            member_query = select(TeamMember.developer_id).where(
                TeamMember.team_id.in_(team_ids)
            ).distinct() if team_ids else None

        team_member_ids = []
        if member_query is not None:
            member_result = await self.db.execute(member_query)
            team_member_ids = list(member_result.scalars().all())

        total_members = len(team_member_ids)

        # Goals metrics
        goals_query = select(func.count(), func.sum(
            func.cast(LearningGoal.status == GoalStatus.COMPLETED.value, Integer)
        ), func.sum(
            func.cast(
                and_(
                    LearningGoal.due_date < datetime.now(timezone.utc),
                    LearningGoal.status.notin_([GoalStatus.COMPLETED.value, GoalStatus.CANCELLED.value])
                ),
                Integer
            )
        )).where(
            and_(
                LearningGoal.workspace_id == workspace_id,
                LearningGoal.developer_id.in_(team_member_ids) if team_member_ids else False,
                LearningGoal.status.notin_([GoalStatus.CANCELLED.value]),
            )
        )

        goals_result = await self.db.execute(goals_query)
        goals_row = goals_result.first()
        total_goals = goals_row[0] or 0 if goals_row else 0
        completed_goals = goals_row[1] or 0 if goals_row else 0
        overdue_goals = goals_row[2] or 0 if goals_row else 0

        # Pending approvals
        pending_query = select(func.count()).where(
            and_(
                CourseApprovalRequest.workspace_id == workspace_id,
                CourseApprovalRequest.status == ApprovalStatus.PENDING.value,
                or_(
                    CourseApprovalRequest.approver_id == manager_id,
                    CourseApprovalRequest.approver_id.is_(None),
                )
            )
        )
        pending_result = await self.db.execute(pending_query)
        pending_approvals = pending_result.scalar() or 0

        # Budget totals
        budget_query = select(
            func.sum(LearningBudget.budget_cents),
            func.sum(LearningBudget.spent_cents),
            func.sum(LearningBudget.reserved_cents),
        ).where(
            and_(
                LearningBudget.workspace_id == workspace_id,
                LearningBudget.developer_id.in_(team_member_ids) if team_member_ids else False,
                LearningBudget.is_active == True,
                LearningBudget.fiscal_year == datetime.now().year,
            )
        )
        budget_result = await self.db.execute(budget_query)
        budget_row = budget_result.first()
        total_budget = budget_row[0] or 0 if budget_row else 0
        spent_budget = budget_row[1] or 0 if budget_row else 0
        reserved_budget = budget_row[2] or 0 if budget_row else 0

        return ManagerDashboardOverview(
            total_team_members=total_members,
            total_active_goals=total_goals - completed_goals,
            goals_completed_this_period=completed_goals,
            goals_overdue=overdue_goals,
            overall_goal_completion_rate=(completed_goals / total_goals * 100) if total_goals > 0 else 0.0,
            pending_approval_requests=pending_approvals,
            total_budget_cents=total_budget,
            spent_budget_cents=spent_budget,
            reserved_budget_cents=reserved_budget,
            budget_utilization_percentage=(spent_budget / total_budget * 100) if total_budget > 0 else 0.0,
        )

    async def get_team_learning_progress(
        self,
        workspace_id: str,
        team_id: str,
    ) -> TeamLearningProgress:
        """Get learning progress for a team."""
        team = await self._get_team_by_id(team_id)
        if not team:
            return TeamLearningProgress(
                team_id=team_id,
                team_name="Unknown",
                total_members=0,
                members_with_goals=0,
                total_goals=0,
                completed_goals=0,
                in_progress_goals=0,
                overdue_goals=0,
            )

        # Get team members
        member_query = select(TeamMember.developer_id).where(TeamMember.team_id == team_id)
        member_result = await self.db.execute(member_query)
        member_ids = list(member_result.scalars().all())

        if not member_ids:
            return TeamLearningProgress(
                team_id=team_id,
                team_name=team.name,
                total_members=0,
                members_with_goals=0,
                total_goals=0,
                completed_goals=0,
                in_progress_goals=0,
                overdue_goals=0,
            )

        # Goals stats
        goals_query = select(
            func.count(),
            func.count(func.distinct(LearningGoal.developer_id)),
            func.sum(func.cast(LearningGoal.status == GoalStatus.COMPLETED.value, Integer)),
            func.sum(func.cast(LearningGoal.status == GoalStatus.IN_PROGRESS.value, Integer)),
            func.sum(func.cast(
                and_(
                    LearningGoal.due_date < datetime.now(timezone.utc),
                    LearningGoal.status.notin_([GoalStatus.COMPLETED.value, GoalStatus.CANCELLED.value])
                ),
                Integer
            )),
        ).where(
            and_(
                LearningGoal.workspace_id == workspace_id,
                LearningGoal.developer_id.in_(member_ids),
                LearningGoal.status != GoalStatus.CANCELLED.value,
            )
        )

        result = await self.db.execute(goals_query)
        row = result.first()

        total_goals = row[0] or 0
        members_with_goals = row[1] or 0
        completed = row[2] or 0
        in_progress = row[3] or 0
        overdue = row[4] or 0

        return TeamLearningProgress(
            team_id=team_id,
            team_name=team.name,
            total_members=len(member_ids),
            members_with_goals=members_with_goals,
            total_goals=total_goals,
            completed_goals=completed,
            in_progress_goals=in_progress,
            overdue_goals=overdue,
            goal_completion_rate=(completed / total_goals * 100) if total_goals > 0 else 0.0,
        )

    async def get_developer_learning_progress(
        self,
        workspace_id: str,
        developer_id: str,
    ) -> DeveloperLearningProgress:
        """Get learning progress for a developer."""
        developer = await self._get_developer_by_id(developer_id)
        if not developer:
            return DeveloperLearningProgress(
                developer_id=developer_id,
                developer_name="Unknown",
                developer_email="",
            )

        # Goals stats
        goals_query = select(
            func.count(),
            func.sum(func.cast(LearningGoal.status == GoalStatus.COMPLETED.value, Integer)),
            func.sum(func.cast(LearningGoal.status == GoalStatus.IN_PROGRESS.value, Integer)),
            func.sum(func.cast(
                and_(
                    LearningGoal.due_date < datetime.now(timezone.utc),
                    LearningGoal.status.notin_([GoalStatus.COMPLETED.value, GoalStatus.CANCELLED.value])
                ),
                Integer
            )),
        ).where(
            and_(
                LearningGoal.workspace_id == workspace_id,
                LearningGoal.developer_id == developer_id,
                LearningGoal.status != GoalStatus.CANCELLED.value,
            )
        )

        result = await self.db.execute(goals_query)
        row = result.first()

        total_goals = row[0] or 0
        completed = row[1] or 0
        in_progress = row[2] or 0
        overdue = row[3] or 0

        # Pending approvals
        pending_query = select(func.count()).where(
            and_(
                CourseApprovalRequest.workspace_id == workspace_id,
                CourseApprovalRequest.requester_id == developer_id,
                CourseApprovalRequest.status == ApprovalStatus.PENDING.value,
            )
        )
        pending_result = await self.db.execute(pending_query)
        pending_approvals = pending_result.scalar() or 0

        # Budget utilization
        budget = await self._get_developer_budget(workspace_id, developer_id)
        budget_utilization = 0.0
        if budget and budget.budget_cents > 0:
            budget_utilization = budget.spent_cents / budget.budget_cents * 100

        return DeveloperLearningProgress(
            developer_id=developer_id,
            developer_name=developer.name,
            developer_email=developer.email,
            total_goals=total_goals,
            completed_goals=completed,
            in_progress_goals=in_progress,
            overdue_goals=overdue,
            goal_completion_rate=(completed / total_goals * 100) if total_goals > 0 else 0.0,
            pending_approval_requests=pending_approvals,
            budget_utilization_percentage=budget_utilization,
            is_compliant=overdue == 0,
        )

    # ==================== Background Tasks ====================

    async def update_overdue_goals(self) -> int:
        """Mark goals past due date as overdue."""
        now = datetime.now(timezone.utc)

        query = select(LearningGoal).where(
            and_(
                LearningGoal.due_date < now,
                LearningGoal.status.in_([
                    GoalStatus.PENDING.value,
                    GoalStatus.IN_PROGRESS.value
                ]),
            )
        )

        result = await self.db.execute(query)
        goals = list(result.scalars().all())

        count = 0
        for goal in goals:
            goal.status = GoalStatus.OVERDUE.value
            count += 1

        if count > 0:
            await self.db.commit()
            logger.info(f"Marked {count} goals as overdue")

        return count
