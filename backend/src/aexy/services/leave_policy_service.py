"""Leave policy service for managing annual quotas and accrual rules."""

from datetime import date
from uuid import uuid4

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.leave import LeavePolicy, AccrualType


class LeavePolicyService:
    """Service for managing leave policies."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        workspace_id: str,
        leave_type_id: str,
        annual_quota: float = 0,
        accrual_type: str = "upfront",
        carry_forward_enabled: bool = False,
        max_carry_forward_days: float = 0,
        applicable_roles: list[str] | None = None,
        applicable_team_ids: list[str] | None = None,
    ) -> LeavePolicy:
        """Create a new leave policy."""
        policy = LeavePolicy(
            id=str(uuid4()),
            workspace_id=workspace_id,
            leave_type_id=leave_type_id,
            annual_quota=annual_quota,
            accrual_type=accrual_type,
            carry_forward_enabled=carry_forward_enabled,
            max_carry_forward_days=max_carry_forward_days,
            applicable_roles=applicable_roles or [],
            applicable_team_ids=applicable_team_ids or [],
        )
        self.db.add(policy)
        await self.db.flush()
        await self.db.refresh(policy)
        return policy

    async def get_all(self, workspace_id: str) -> list[LeavePolicy]:
        """Get all leave policies for a workspace."""
        stmt = (
            select(LeavePolicy)
            .where(
                and_(
                    LeavePolicy.workspace_id == workspace_id,
                    LeavePolicy.is_active == True,  # noqa: E712
                )
            )
            .order_by(LeavePolicy.created_at.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, policy_id: str) -> LeavePolicy | None:
        """Get a leave policy by ID."""
        stmt = select(LeavePolicy).where(LeavePolicy.id == policy_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_applicable_policy(
        self,
        workspace_id: str,
        leave_type_id: str,
        developer_role: str | None = None,
        team_ids: list[str] | None = None,
    ) -> LeavePolicy | None:
        """Find the applicable policy for a developer and leave type."""
        stmt = select(LeavePolicy).where(
            and_(
                LeavePolicy.workspace_id == workspace_id,
                LeavePolicy.leave_type_id == leave_type_id,
                LeavePolicy.is_active == True,  # noqa: E712
            )
        )
        result = await self.db.execute(stmt)
        policies = list(result.scalars().all())

        if not policies:
            return None

        # Find the most specific matching policy
        for policy in policies:
            roles = policy.applicable_roles or []
            teams = policy.applicable_team_ids or []

            # If no restrictions, it applies to everyone
            if not roles and not teams:
                return policy

            # Check role match
            role_match = not roles or (developer_role and developer_role in roles)
            # Check team match
            team_match = not teams or (
                team_ids and any(t in teams for t in team_ids)
            )

            if role_match and team_match:
                return policy

        # Fallback to first policy with no restrictions
        for policy in policies:
            if not policy.applicable_roles and not policy.applicable_team_ids:
                return policy

        return policies[0] if policies else None

    async def update(self, policy_id: str, **kwargs) -> LeavePolicy | None:
        """Update a leave policy."""
        policy = await self.get_by_id(policy_id)
        if not policy:
            return None

        allowed = {
            "annual_quota", "accrual_type", "carry_forward_enabled",
            "max_carry_forward_days", "applicable_roles",
            "applicable_team_ids", "is_active",
        }
        for key, value in kwargs.items():
            if key in allowed:
                setattr(policy, key, value)

        await self.db.flush()
        await self.db.refresh(policy)
        return policy

    async def delete(self, policy_id: str) -> bool:
        """Delete a leave policy."""
        policy = await self.get_by_id(policy_id)
        if not policy:
            return False
        await self.db.delete(policy)
        await self.db.flush()
        return True

    def calculate_allocation(
        self,
        policy: LeavePolicy,
        join_date: date | None = None,
        year: int | None = None,
    ) -> float:
        """Calculate leave allocation based on policy and accrual type.

        Pro-rates for mid-year joins when accrual_type is upfront.
        """
        from datetime import date as dt_date

        effective_year = year or dt_date.today().year
        quota = policy.annual_quota

        if policy.accrual_type == AccrualType.UPFRONT.value:
            if join_date and join_date.year == effective_year:
                # Pro-rate: remaining months / 12
                remaining_months = 12 - join_date.month + 1
                return round(quota * remaining_months / 12, 1)
            return quota

        elif policy.accrual_type == AccrualType.MONTHLY.value:
            if join_date and join_date.year == effective_year:
                remaining_months = 12 - join_date.month + 1
                return round(quota / 12 * remaining_months, 1)
            return quota

        elif policy.accrual_type == AccrualType.QUARTERLY.value:
            if join_date and join_date.year == effective_year:
                quarter = (join_date.month - 1) // 3
                remaining_quarters = 4 - quarter
                return round(quota / 4 * remaining_quarters, 1)
            return quota

        return quota
