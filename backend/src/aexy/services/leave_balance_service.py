"""Leave balance service for managing yearly leave balances."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import and_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.leave import LeaveBalance, LeaveType, LeavePolicy
from aexy.models.team import TeamMember


class LeaveBalanceService:
    """Service for managing denormalized yearly leave balances."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_balance(
        self, developer_id: str, leave_type_id: str, year: int
    ) -> LeaveBalance | None:
        """Get a specific leave balance."""
        stmt = select(LeaveBalance).where(
            and_(
                LeaveBalance.developer_id == developer_id,
                LeaveBalance.leave_type_id == leave_type_id,
                LeaveBalance.year == year,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all_balances(
        self, workspace_id: str, developer_id: str, year: int
    ) -> list[LeaveBalance]:
        """Get all leave balances for a developer in a year."""
        stmt = (
            select(LeaveBalance)
            .where(
                and_(
                    LeaveBalance.workspace_id == workspace_id,
                    LeaveBalance.developer_id == developer_id,
                    LeaveBalance.year == year,
                )
            )
            .order_by(LeaveBalance.created_at.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_team_balances(
        self, workspace_id: str, team_id: str, year: int
    ) -> list[LeaveBalance]:
        """Get leave balances for all members of a team."""
        # Get team member IDs
        member_stmt = select(TeamMember.developer_id).where(
            TeamMember.team_id == team_id
        )
        member_result = await self.db.execute(member_stmt)
        member_ids = [r for r in member_result.scalars().all()]

        if not member_ids:
            return []

        stmt = (
            select(LeaveBalance)
            .where(
                and_(
                    LeaveBalance.workspace_id == workspace_id,
                    LeaveBalance.developer_id.in_(member_ids),
                    LeaveBalance.year == year,
                )
            )
            .order_by(LeaveBalance.developer_id, LeaveBalance.leave_type_id)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def initialize_yearly_balances(
        self, workspace_id: str, developer_id: str, year: int
    ) -> list[LeaveBalance]:
        """Initialize yearly balances for a developer based on active policies."""
        from aexy.services.leave_policy_service import LeavePolicyService

        policy_service = LeavePolicyService(self.db)

        # Get all active leave types
        type_stmt = select(LeaveType).where(
            and_(
                LeaveType.workspace_id == workspace_id,
                LeaveType.is_active == True,  # noqa: E712
            )
        )
        type_result = await self.db.execute(type_stmt)
        leave_types = list(type_result.scalars().all())

        created = []
        for lt in leave_types:
            # Find applicable policy
            policy = await policy_service.get_applicable_policy(
                workspace_id, lt.id
            )
            allocation = (
                policy_service.calculate_allocation(policy, year=year)
                if policy
                else 0
            )

            balance_id = str(uuid4())
            # Use INSERT ... ON CONFLICT DO NOTHING to avoid race conditions
            stmt = pg_insert(LeaveBalance).values(
                id=balance_id,
                workspace_id=workspace_id,
                developer_id=developer_id,
                leave_type_id=lt.id,
                year=year,
                total_allocated=allocation,
                used=0,
                pending=0,
                carried_forward=0,
            ).on_conflict_do_nothing(
                index_elements=["developer_id", "leave_type_id", "year"]
            )
            await self.db.execute(stmt)

        await self.db.flush()

        # Re-fetch all balances for this developer/year
        all_balances = await self.get_all_balances(workspace_id, developer_id, year)
        return all_balances

    async def process_carry_forward(
        self, workspace_id: str, developer_id: str, from_year: int, to_year: int
    ) -> list[LeaveBalance]:
        """Process carry-forward from one year to the next."""
        from_balances = await self.get_all_balances(
            workspace_id, developer_id, from_year
        )

        updated = []
        for from_bal in from_balances:
            # Get the policy to check carry-forward settings
            policy_stmt = select(LeavePolicy).where(
                and_(
                    LeavePolicy.workspace_id == workspace_id,
                    LeavePolicy.leave_type_id == from_bal.leave_type_id,
                    LeavePolicy.is_active == True,  # noqa: E712
                )
            )
            policy_result = await self.db.execute(policy_stmt)
            policy = policy_result.scalar_one_or_none()

            if not policy or not policy.carry_forward_enabled:
                continue

            remaining = from_bal.total_allocated + from_bal.carried_forward - from_bal.used
            carry = min(max(remaining, 0), policy.max_carry_forward_days)

            if carry <= 0:
                continue

            # Get or create the to_year balance
            to_bal = await self.get_balance(
                developer_id, from_bal.leave_type_id, to_year
            )
            if to_bal:
                to_bal.carried_forward = carry
            else:
                to_bal = LeaveBalance(
                    id=str(uuid4()),
                    workspace_id=workspace_id,
                    developer_id=developer_id,
                    leave_type_id=from_bal.leave_type_id,
                    year=to_year,
                    total_allocated=0,
                    used=0,
                    pending=0,
                    carried_forward=carry,
                )
                self.db.add(to_bal)

            updated.append(to_bal)

        if updated:
            await self.db.flush()
            for b in updated:
                await self.db.refresh(b)

        return updated

    async def update_balance_on_request(
        self, balance_id: str, pending_delta: float = 0, used_delta: float = 0
    ) -> LeaveBalance | None:
        """Update balance when a request changes state. Uses SELECT FOR UPDATE to prevent races."""
        stmt = (
            select(LeaveBalance)
            .where(LeaveBalance.id == balance_id)
            .with_for_update()
        )
        result = await self.db.execute(stmt)
        balance = result.scalar_one_or_none()

        if not balance:
            return None

        balance.pending = max(balance.pending + pending_delta, 0)
        balance.used = max(balance.used + used_delta, 0)

        await self.db.flush()
        await self.db.refresh(balance)
        return balance
