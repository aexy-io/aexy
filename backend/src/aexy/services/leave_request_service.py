"""Leave request service - core workflow for submitting, approving, and managing leave."""

from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import and_, select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.leave import (
    LeaveRequest,
    LeaveRequestStatus,
    LeaveBalance,
    LeaveType,
    Holiday,
)
from aexy.models.booking import AvailabilityOverride
from aexy.models.team import TeamMember
from aexy.models.workspace import WorkspaceMember


class LeaveRequestService:
    """Service for managing leave requests and approval workflow."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def submit_request(
        self,
        workspace_id: str,
        developer_id: str,
        leave_type_id: str,
        start_date: date,
        end_date: date,
        reason: str | None = None,
        is_half_day: bool = False,
        half_day_period: str | None = None,
    ) -> LeaveRequest:
        """Submit a new leave request.

        Validates dates, checks balance, finds approver, creates request.
        """
        # Validate dates
        if start_date > end_date:
            raise ValueError("Start date must be before or equal to end date")
        if start_date < date.today():
            raise ValueError("Cannot request leave for past dates")

        # Get leave type
        from aexy.services.leave_type_service import LeaveTypeService

        type_service = LeaveTypeService(self.db)
        leave_type = await type_service.get_by_id(leave_type_id)
        if not leave_type:
            raise ValueError("Leave type not found")

        # Check min notice
        days_until = (start_date - date.today()).days
        if days_until < leave_type.min_notice_days:
            raise ValueError(
                f"Minimum {leave_type.min_notice_days} days notice required"
            )

        # Half day validation
        if is_half_day and not leave_type.allows_half_day:
            raise ValueError("This leave type does not allow half-day requests")
        if is_half_day and start_date != end_date:
            raise ValueError("Half-day leave must be for a single day")

        # Calculate total business days
        total_days = await self._calculate_business_days(
            start_date, end_date, workspace_id
        )
        if is_half_day:
            total_days = 0.5

        if total_days <= 0:
            raise ValueError("No working days in the selected date range")

        # Check balance with row-level lock to prevent race conditions
        from aexy.services.leave_balance_service import LeaveBalanceService

        balance_service = LeaveBalanceService(self.db)

        # Try to initialize balances if they don't exist yet
        await balance_service.initialize_yearly_balances(
            workspace_id, developer_id, start_date.year
        )

        # Lock the balance row for atomic check-and-update
        balance_stmt = (
            select(LeaveBalance)
            .where(
                and_(
                    LeaveBalance.developer_id == developer_id,
                    LeaveBalance.leave_type_id == leave_type_id,
                    LeaveBalance.year == start_date.year,
                )
            )
            .with_for_update()
        )
        balance_result = await self.db.execute(balance_stmt)
        balance = balance_result.scalar_one_or_none()

        if balance:
            available = balance.available
            if total_days > available:
                raise ValueError(
                    f"Insufficient balance. Available: {available}, Requested: {total_days}"
                )

        # Find approver
        approver_id = None
        if leave_type.requires_approval:
            approver_id = await self._find_approver(workspace_id, developer_id)

        # Create request
        request = LeaveRequest(
            id=str(uuid4()),
            workspace_id=workspace_id,
            developer_id=developer_id,
            leave_type_id=leave_type_id,
            start_date=start_date,
            end_date=end_date,
            is_half_day=is_half_day,
            half_day_period=half_day_period,
            total_days=total_days,
            reason=reason,
            status=LeaveRequestStatus.PENDING.value,
            approver_id=approver_id,
        )

        # Auto-approve if no approval required
        if not leave_type.requires_approval:
            request.status = LeaveRequestStatus.APPROVED.value
            request.approved_at = datetime.now(timezone.utc)

        self.db.add(request)
        await self.db.flush()

        # Update balance
        if balance:
            if request.status == LeaveRequestStatus.APPROVED.value:
                await balance_service.update_balance_on_request(
                    balance.id, used_delta=total_days
                )
                # Create availability overrides for auto-approved
                await self._create_availability_overrides(request)
            else:
                await balance_service.update_balance_on_request(
                    balance.id, pending_delta=total_days
                )

        await self.db.refresh(request)
        return request

    async def approve(self, request_id: str, approver_id: str) -> LeaveRequest:
        """Approve a pending leave request."""
        request = await self._get_request(request_id)
        if not request:
            raise ValueError("Leave request not found")
        if request.status != LeaveRequestStatus.PENDING.value:
            raise ValueError("Only pending requests can be approved")

        request.status = LeaveRequestStatus.APPROVED.value
        request.approver_id = approver_id
        request.approved_at = datetime.utcnow()

        # Update balance: move from pending to used
        from aexy.services.leave_balance_service import LeaveBalanceService

        balance_service = LeaveBalanceService(self.db)
        balance = await balance_service.get_balance(
            request.developer_id, request.leave_type_id, request.start_date.year
        )
        if balance:
            await balance_service.update_balance_on_request(
                balance.id,
                pending_delta=-request.total_days,
                used_delta=request.total_days,
            )

        # Create availability overrides
        await self._create_availability_overrides(request)

        await self.db.flush()
        await self.db.refresh(request)
        return request

    async def reject(
        self, request_id: str, approver_id: str, reason: str | None = None
    ) -> LeaveRequest:
        """Reject a pending leave request."""
        request = await self._get_request(request_id)
        if not request:
            raise ValueError("Leave request not found")
        if request.status != LeaveRequestStatus.PENDING.value:
            raise ValueError("Only pending requests can be rejected")

        request.status = LeaveRequestStatus.REJECTED.value
        request.approver_id = approver_id
        request.rejection_reason = reason

        # Remove pending from balance
        from aexy.services.leave_balance_service import LeaveBalanceService

        balance_service = LeaveBalanceService(self.db)
        balance = await balance_service.get_balance(
            request.developer_id, request.leave_type_id, request.start_date.year
        )
        if balance:
            await balance_service.update_balance_on_request(
                balance.id, pending_delta=-request.total_days
            )

        await self.db.flush()
        await self.db.refresh(request)
        return request

    async def cancel(self, request_id: str, developer_id: str) -> LeaveRequest:
        """Cancel an approved leave request."""
        request = await self._get_request(request_id)
        if not request:
            raise ValueError("Leave request not found")
        if request.developer_id != developer_id:
            raise ValueError("You can only cancel your own leave requests")
        if request.status != LeaveRequestStatus.APPROVED.value:
            raise ValueError("Only approved requests can be cancelled")

        request.status = LeaveRequestStatus.CANCELLED.value

        # Restore used balance
        from aexy.services.leave_balance_service import LeaveBalanceService

        balance_service = LeaveBalanceService(self.db)
        balance = await balance_service.get_balance(
            request.developer_id, request.leave_type_id, request.start_date.year
        )
        if balance:
            await balance_service.update_balance_on_request(
                balance.id, used_delta=-request.total_days
            )

        # Remove availability overrides
        await self._remove_availability_overrides(request)

        await self.db.flush()
        await self.db.refresh(request)
        return request

    async def withdraw(self, request_id: str, developer_id: str) -> LeaveRequest:
        """Withdraw a pending leave request."""
        request = await self._get_request(request_id)
        if not request:
            raise ValueError("Leave request not found")
        if request.developer_id != developer_id:
            raise ValueError("You can only withdraw your own leave requests")
        if request.status != LeaveRequestStatus.PENDING.value:
            raise ValueError("Only pending requests can be withdrawn")

        request.status = LeaveRequestStatus.WITHDRAWN.value

        # Remove pending from balance
        from aexy.services.leave_balance_service import LeaveBalanceService

        balance_service = LeaveBalanceService(self.db)
        balance = await balance_service.get_balance(
            request.developer_id, request.leave_type_id, request.start_date.year
        )
        if balance:
            await balance_service.update_balance_on_request(
                balance.id, pending_delta=-request.total_days
            )

        await self.db.flush()
        await self.db.refresh(request)
        return request

    async def get_requests(
        self,
        workspace_id: str,
        developer_id: str | None = None,
        status: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[LeaveRequest]:
        """Get leave requests with optional filters and pagination."""
        conditions = [LeaveRequest.workspace_id == workspace_id]

        if developer_id:
            conditions.append(LeaveRequest.developer_id == developer_id)
        if status:
            conditions.append(LeaveRequest.status == status)
        if start_date:
            conditions.append(LeaveRequest.end_date >= start_date)
        if end_date:
            conditions.append(LeaveRequest.start_date <= end_date)

        stmt = (
            select(LeaveRequest)
            .where(and_(*conditions))
            .order_by(LeaveRequest.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_pending_approvals(
        self, workspace_id: str, approver_id: str
    ) -> list[LeaveRequest]:
        """Get pending leave requests for a specific approver."""
        stmt = (
            select(LeaveRequest)
            .where(
                and_(
                    LeaveRequest.workspace_id == workspace_id,
                    LeaveRequest.status == LeaveRequestStatus.PENDING.value,
                    or_(
                        LeaveRequest.approver_id == approver_id,
                        LeaveRequest.approver_id.is_(None),
                    ),
                )
            )
            .order_by(LeaveRequest.created_at.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def _get_request(self, request_id: str) -> LeaveRequest | None:
        """Get a leave request by ID."""
        stmt = select(LeaveRequest).where(LeaveRequest.id == request_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def _find_approver(
        self, workspace_id: str, developer_id: str
    ) -> str | None:
        """Find the approver for a developer's leave request.

        Looks for team lead first, then falls back to workspace manager.
        Uses a single query to find leads across all of the developer's teams.
        """
        # Get team IDs for this developer
        team_id_stmt = select(TeamMember.team_id).where(
            TeamMember.developer_id == developer_id
        )

        # Find any lead in those teams (single query, no N+1)
        lead_stmt = (
            select(TeamMember.developer_id)
            .where(
                and_(
                    TeamMember.team_id.in_(team_id_stmt),
                    TeamMember.role == "lead",
                    TeamMember.developer_id != developer_id,
                )
            )
            .limit(1)
        )
        lead_result = await self.db.execute(lead_stmt)
        lead_id = lead_result.scalar_one_or_none()
        if lead_id:
            return lead_id

        # Fallback to workspace manager
        manager_stmt = (
            select(WorkspaceMember.developer_id)
            .where(
                and_(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.role == "manager",
                    WorkspaceMember.developer_id != developer_id,
                )
            )
            .limit(1)
        )
        manager_result = await self.db.execute(manager_stmt)
        return manager_result.scalar_one_or_none()

    async def _calculate_business_days(
        self, start_date: date, end_date: date, workspace_id: str
    ) -> float:
        """Calculate business days between dates, excluding weekends and holidays."""
        # Get holidays in range
        holiday_stmt = select(Holiday.date).where(
            and_(
                Holiday.workspace_id == workspace_id,
                Holiday.date >= start_date,
                Holiday.date <= end_date,
            )
        )
        holiday_result = await self.db.execute(holiday_stmt)
        holiday_dates = set(holiday_result.scalars().all())

        business_days = 0
        current = start_date
        while current <= end_date:
            # Skip weekends (5=Saturday, 6=Sunday)
            if current.weekday() < 5 and current not in holiday_dates:
                business_days += 1
            current += timedelta(days=1)

        return float(business_days)

    async def _create_availability_overrides(self, request: LeaveRequest) -> None:
        """Create AvailabilityOverride records for each leave day."""
        current = request.start_date
        while current <= request.end_date:
            if current.weekday() < 5:  # Only weekdays
                override = AvailabilityOverride(
                    id=str(uuid4()),
                    user_id=request.developer_id,
                    date=current,
                    is_available=False,
                    reason=f"Leave[{request.id}]: {request.leave_type.name if request.leave_type else 'Leave'}",
                )
                self.db.add(override)
            current += timedelta(days=1)
        await self.db.flush()

    async def _remove_availability_overrides(self, request: LeaveRequest) -> None:
        """Remove AvailabilityOverride records for a specific leave request."""
        from sqlalchemy import delete

        stmt = delete(AvailabilityOverride).where(
            and_(
                AvailabilityOverride.user_id == request.developer_id,
                AvailabilityOverride.is_available == False,  # noqa: E712
                AvailabilityOverride.reason.like(f"Leave[{request.id}]:%"),
            )
        )
        await self.db.execute(stmt)
        await self.db.flush()
