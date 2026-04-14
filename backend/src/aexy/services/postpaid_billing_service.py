"""Postpaid billing service for end-of-period billing."""

import logging
from datetime import datetime, timezone
from typing import Any

import stripe
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import settings
from aexy.models.billing import UsageRecord
from aexy.models.workspace import WorkspaceMember, WorkspaceSubscription

logger = logging.getLogger(__name__)


class PostpaidBillingService:
    """Handles postpaid billing: accrual, period finalization, and invoicing."""

    def __init__(self, db: AsyncSession):
        self.db = db
        stripe.api_key = settings.stripe_secret_key

    async def accrue_usage(self, workspace_id: str, cost_cents: int) -> int:
        """Add to the running postpaid usage accrual for a workspace.

        Returns the new total accrued amount.
        """
        stmt = select(WorkspaceSubscription).where(
            WorkspaceSubscription.workspace_id == workspace_id,
            WorkspaceSubscription.billing_model == "postpaid",
            WorkspaceSubscription.status == "active",
        )
        result = await self.db.execute(stmt)
        sub = result.scalar_one_or_none()
        if not sub:
            return 0

        sub.postpaid_usage_accrued_cents = (sub.postpaid_usage_accrued_cents or 0) + cost_cents
        await self.db.flush()
        return sub.postpaid_usage_accrued_cents

    async def calculate_period_charges(
        self,
        workspace_id: str,
        period_start: datetime,
        period_end: datetime,
    ) -> dict[str, Any]:
        """Calculate total charges for a billing period.

        Returns breakdown of seat charges + usage charges.
        """
        # Get subscription
        stmt = select(WorkspaceSubscription).where(
            WorkspaceSubscription.workspace_id == workspace_id
        )
        result = await self.db.execute(stmt)
        sub = result.scalar_one_or_none()
        if not sub:
            return {"error": "No subscription found"}

        # Count active billable seats
        seat_stmt = (
            select(func.count(WorkspaceMember.id))
            .where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.status == "active",
                WorkspaceMember.is_billable == True,
            )
        )
        seat_result = await self.db.execute(seat_stmt)
        seat_count = seat_result.scalar() or 0

        # Seat charges
        seat_price = sub.price_per_additional_seat_cents or 0
        seat_charges_cents = seat_count * seat_price

        # Usage charges (sum from usage_records for this workspace and period)
        usage_stmt = (
            select(func.coalesce(func.sum(UsageRecord.total_cost_cents), 0))
            .where(
                UsageRecord.workspace_id == workspace_id,
                UsageRecord.created_at >= period_start,
                UsageRecord.created_at < period_end,
            )
        )
        usage_result = await self.db.execute(usage_stmt)
        usage_charges_cents = int(usage_result.scalar() or 0)

        total = seat_charges_cents + usage_charges_cents

        return {
            "seat_count": seat_count,
            "seat_charges_cents": seat_charges_cents,
            "usage_charges_cents": usage_charges_cents,
            "total_cents": total,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
        }

    async def finalize_period(self, workspace_id: str) -> dict[str, Any]:
        """Finalize a postpaid billing period.

        Reports usage to Stripe so the invoice can be generated.
        """
        stmt = select(WorkspaceSubscription).where(
            WorkspaceSubscription.workspace_id == workspace_id,
            WorkspaceSubscription.billing_model == "postpaid",
        )
        result = await self.db.execute(stmt)
        sub = result.scalar_one_or_none()
        if not sub or not sub.usage_subscription_item_id:
            return {"error": "No postpaid subscription or usage item found"}

        accrued = sub.postpaid_usage_accrued_cents or 0
        if accrued > 0:
            # Report usage to Stripe
            stripe.SubscriptionItem.create_usage_record(
                sub.usage_subscription_item_id,
                quantity=accrued,
                timestamp=int(datetime.now(timezone.utc).timestamp()),
                action="set",
            )

        # Reset accrual
        sub.postpaid_usage_accrued_cents = 0
        sub.postpaid_last_settled_at = datetime.now(timezone.utc)
        await self.db.flush()

        logger.info(f"Finalized postpaid period for workspace {workspace_id}: {accrued} cents")

        return {
            "workspace_id": workspace_id,
            "reported_cents": accrued,
            "settled_at": sub.postpaid_last_settled_at.isoformat(),
        }

    async def get_accrued_summary(self, workspace_id: str) -> dict[str, Any]:
        """Get current accrued usage for a postpaid workspace."""
        stmt = select(WorkspaceSubscription).where(
            WorkspaceSubscription.workspace_id == workspace_id,
        )
        result = await self.db.execute(stmt)
        sub = result.scalar_one_or_none()
        if not sub:
            return {"accrued_cents": 0}

        return {
            "accrued_cents": sub.postpaid_usage_accrued_cents or 0,
            "last_settled_at": sub.postpaid_last_settled_at.isoformat() if sub.postpaid_last_settled_at else None,
            "billing_model": sub.billing_model,
            "period_start": sub.current_period_start.isoformat() if sub.current_period_start else None,
            "period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        }
