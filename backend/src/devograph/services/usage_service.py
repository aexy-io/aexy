"""Usage tracking service for LLM token billing with margin calculation."""

import logging
from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

import stripe
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import settings
from aexy.models.billing import (
    CustomerBilling,
    Subscription,
    SubscriptionStatus,
    UsageAggregate,
    UsageRecord,
    UsageType,
)
from aexy.models.developer import Developer

logger = logging.getLogger(__name__)


# Token pricing per million tokens (in cents)
PROVIDER_PRICING = {
    "claude": {
        "input": settings.claude_input_price_per_million,
        "output": settings.claude_output_price_per_million,
    },
    "gemini": {
        "input": settings.gemini_input_price_per_million,
        "output": settings.gemini_output_price_per_million,
    },
    "ollama": {
        # Ollama is self-hosted, minimal cost
        "input": 0.0,
        "output": 0.0,
    },
}


class UsageService:
    """Service for tracking and billing LLM token usage with margin."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.margin_percent = settings.token_margin_percent
        stripe.api_key = settings.stripe_secret_key

    def calculate_cost(
        self,
        provider: str,
        input_tokens: int,
        output_tokens: int,
    ) -> tuple[float, float]:
        """
        Calculate base cost and total cost with margin.

        Returns:
            Tuple of (base_cost_cents, total_cost_cents)
        """
        pricing = PROVIDER_PRICING.get(provider.lower(), {"input": 0.0, "output": 0.0})

        # Calculate base cost (price per million tokens)
        input_cost = (input_tokens / 1_000_000) * pricing["input"]
        output_cost = (output_tokens / 1_000_000) * pricing["output"]
        base_cost = input_cost + output_cost

        # Apply margin
        total_cost = base_cost * (1 + self.margin_percent / 100)

        return base_cost, total_cost

    async def record_usage(
        self,
        developer_id: str,
        provider: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        analysis_type: str | None = None,
        request_id: str | None = None,
    ) -> UsageRecord | None:
        """Record LLM usage for a developer."""
        # Get customer billing
        stmt = select(CustomerBilling).where(
            CustomerBilling.developer_id == developer_id
        )
        result = await self.db.execute(stmt)
        customer_billing = result.scalar_one_or_none()

        # If no customer billing, just skip recording (free tier without billing setup)
        if not customer_billing:
            logger.debug(
                f"No billing setup for developer {developer_id}, skipping usage record"
            )
            return None

        # Get active subscription
        stmt = select(Subscription).where(
            Subscription.customer_id == customer_billing.id,
            Subscription.status.in_([
                SubscriptionStatus.ACTIVE.value,
                SubscriptionStatus.TRIALING.value,
            ]),
        )
        result = await self.db.execute(stmt)
        subscription = result.scalar_one_or_none()

        # Calculate costs
        base_cost, total_cost = self.calculate_cost(
            provider, input_tokens, output_tokens
        )

        # Get billing period from subscription
        billing_period_start = None
        billing_period_end = None
        if subscription:
            billing_period_start = subscription.current_period_start
            billing_period_end = subscription.current_period_end

        # Create usage record
        usage_record = UsageRecord(
            customer_id=customer_billing.id,
            usage_type=UsageType.LLM_INPUT_TOKENS.value,
            provider=provider.lower(),
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
            base_cost_cents=base_cost,
            margin_percent=self.margin_percent,
            total_cost_cents=total_cost,
            billing_period_start=billing_period_start,
            billing_period_end=billing_period_end,
            analysis_type=analysis_type,
            request_id=request_id or str(uuid4()),
        )

        self.db.add(usage_record)
        await self.db.commit()
        await self.db.refresh(usage_record)

        logger.info(
            f"Recorded usage for developer {developer_id}: "
            f"{input_tokens} input + {output_tokens} output tokens = ${total_cost/100:.4f}"
        )

        return usage_record

    async def get_usage_summary(
        self,
        developer_id: str,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> dict[str, Any]:
        """Get usage summary for a developer."""
        # Get customer billing
        stmt = select(CustomerBilling).where(
            CustomerBilling.developer_id == developer_id
        )
        result = await self.db.execute(stmt)
        customer_billing = result.scalar_one_or_none()

        if not customer_billing:
            return {
                "total_input_tokens": 0,
                "total_output_tokens": 0,
                "total_tokens": 0,
                "total_base_cost_cents": 0.0,
                "total_cost_cents": 0.0,
                "margin_percent": self.margin_percent,
                "by_provider": {},
                "period_start": start_date,
                "period_end": end_date,
            }

        # Default to current month
        if not start_date:
            now = datetime.utcnow()
            start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if not end_date:
            end_date = datetime.utcnow()

        # Query usage records
        stmt = select(
            func.sum(UsageRecord.input_tokens).label("total_input"),
            func.sum(UsageRecord.output_tokens).label("total_output"),
            func.sum(UsageRecord.total_tokens).label("total_tokens"),
            func.sum(UsageRecord.base_cost_cents).label("total_base_cost"),
            func.sum(UsageRecord.total_cost_cents).label("total_cost"),
        ).where(
            UsageRecord.customer_id == customer_billing.id,
            UsageRecord.created_at >= start_date,
            UsageRecord.created_at <= end_date,
        )
        result = await self.db.execute(stmt)
        row = result.one()

        # Get usage by provider
        stmt = select(
            UsageRecord.provider,
            func.sum(UsageRecord.input_tokens).label("input_tokens"),
            func.sum(UsageRecord.output_tokens).label("output_tokens"),
            func.sum(UsageRecord.total_cost_cents).label("cost"),
        ).where(
            UsageRecord.customer_id == customer_billing.id,
            UsageRecord.created_at >= start_date,
            UsageRecord.created_at <= end_date,
        ).group_by(UsageRecord.provider)
        result = await self.db.execute(stmt)
        by_provider = {
            r.provider: {
                "input_tokens": r.input_tokens or 0,
                "output_tokens": r.output_tokens or 0,
                "cost_cents": r.cost or 0.0,
            }
            for r in result.all()
        }

        return {
            "total_input_tokens": row.total_input or 0,
            "total_output_tokens": row.total_output or 0,
            "total_tokens": row.total_tokens or 0,
            "total_base_cost_cents": row.total_base_cost or 0.0,
            "total_cost_cents": row.total_cost or 0.0,
            "margin_percent": self.margin_percent,
            "by_provider": by_provider,
            "period_start": start_date,
            "period_end": end_date,
        }

    async def get_unreported_usage(
        self,
        customer_id: str,
    ) -> list[UsageRecord]:
        """Get usage records not yet reported to Stripe."""
        stmt = (
            select(UsageRecord)
            .where(
                UsageRecord.customer_id == customer_id,
                UsageRecord.reported_to_stripe == False,
            )
            .order_by(UsageRecord.created_at)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def report_usage_to_stripe(
        self,
        developer_id: str,
    ) -> dict[str, Any]:
        """
        Report unreported usage to Stripe as metered billing.

        This aggregates all unreported usage records and reports them
        to Stripe via the usage record API for the subscription item.
        """
        # Get customer billing and active subscription
        stmt = select(CustomerBilling).where(
            CustomerBilling.developer_id == developer_id
        )
        result = await self.db.execute(stmt)
        customer_billing = result.scalar_one_or_none()

        if not customer_billing:
            return {"reported": 0, "total_cost_cents": 0.0}

        # Get active subscription
        stmt = select(Subscription).where(
            Subscription.customer_id == customer_billing.id,
            Subscription.status.in_([
                SubscriptionStatus.ACTIVE.value,
                SubscriptionStatus.TRIALING.value,
            ]),
        )
        result = await self.db.execute(stmt)
        subscription = result.scalar_one_or_none()

        if not subscription or not subscription.stripe_subscription_item_id:
            logger.warning(
                f"No active subscription with metered billing for developer {developer_id}"
            )
            return {"reported": 0, "total_cost_cents": 0.0}

        # Get unreported usage
        unreported = await self.get_unreported_usage(customer_billing.id)

        if not unreported:
            return {"reported": 0, "total_cost_cents": 0.0}

        # Calculate total usage in cents (Stripe expects integer cents)
        total_cost_cents = sum(int(r.total_cost_cents) for r in unreported)

        if total_cost_cents == 0:
            # Mark as reported even if zero cost
            for record in unreported:
                record.reported_to_stripe = True
                record.reported_at = datetime.utcnow()
            await self.db.commit()
            return {"reported": len(unreported), "total_cost_cents": 0.0}

        try:
            # Report to Stripe
            # Using quantity as cents for metered billing
            stripe.SubscriptionItem.create_usage_record(
                subscription.stripe_subscription_item_id,
                quantity=total_cost_cents,
                timestamp=int(datetime.utcnow().timestamp()),
                action="increment",
            )

            # Mark records as reported
            for record in unreported:
                record.reported_to_stripe = True
                record.reported_at = datetime.utcnow()

            await self.db.commit()

            logger.info(
                f"Reported {len(unreported)} usage records to Stripe for developer {developer_id}: "
                f"${total_cost_cents/100:.2f}"
            )

            return {
                "reported": len(unreported),
                "total_cost_cents": float(total_cost_cents),
            }

        except stripe.error.StripeError as e:
            logger.error(f"Failed to report usage to Stripe: {e}")
            raise

    async def update_usage_aggregate(
        self,
        customer_id: str,
        period_start: datetime,
        period_end: datetime,
    ) -> UsageAggregate:
        """Update or create usage aggregate for a billing period."""
        # Check for existing aggregate
        stmt = select(UsageAggregate).where(
            UsageAggregate.customer_id == customer_id,
            UsageAggregate.period_start == period_start,
            UsageAggregate.period_end == period_end,
        )
        result = await self.db.execute(stmt)
        aggregate = result.scalar_one_or_none()

        if not aggregate:
            aggregate = UsageAggregate(
                customer_id=customer_id,
                period_start=period_start,
                period_end=period_end,
            )
            self.db.add(aggregate)

        # Calculate aggregates from usage records
        stmt = select(
            UsageRecord.provider,
            func.sum(UsageRecord.input_tokens).label("input_tokens"),
            func.sum(UsageRecord.output_tokens).label("output_tokens"),
            func.sum(UsageRecord.base_cost_cents).label("base_cost"),
            func.sum(UsageRecord.total_cost_cents).label("total_cost"),
            func.count().label("request_count"),
        ).where(
            UsageRecord.customer_id == customer_id,
            UsageRecord.created_at >= period_start,
            UsageRecord.created_at < period_end,
        ).group_by(UsageRecord.provider)

        result = await self.db.execute(stmt)
        rows = result.all()

        # Reset aggregates
        aggregate.claude_input_tokens = 0
        aggregate.claude_output_tokens = 0
        aggregate.gemini_input_tokens = 0
        aggregate.gemini_output_tokens = 0
        aggregate.ollama_input_tokens = 0
        aggregate.ollama_output_tokens = 0
        aggregate.total_base_cost_cents = 0.0
        aggregate.total_cost_cents = 0.0
        aggregate.total_requests = 0

        for row in rows:
            if row.provider == "claude":
                aggregate.claude_input_tokens = row.input_tokens or 0
                aggregate.claude_output_tokens = row.output_tokens or 0
            elif row.provider == "gemini":
                aggregate.gemini_input_tokens = row.input_tokens or 0
                aggregate.gemini_output_tokens = row.output_tokens or 0
            elif row.provider == "ollama":
                aggregate.ollama_input_tokens = row.input_tokens or 0
                aggregate.ollama_output_tokens = row.output_tokens or 0

            aggregate.total_base_cost_cents += row.base_cost or 0.0
            aggregate.total_cost_cents += row.total_cost or 0.0
            aggregate.total_requests += row.request_count or 0

        await self.db.commit()
        await self.db.refresh(aggregate)

        return aggregate

    async def get_billing_history(
        self,
        developer_id: str,
        months: int = 6,
    ) -> list[dict[str, Any]]:
        """Get billing history for the last N months."""
        # Get customer billing
        stmt = select(CustomerBilling).where(
            CustomerBilling.developer_id == developer_id
        )
        result = await self.db.execute(stmt)
        customer_billing = result.scalar_one_or_none()

        if not customer_billing:
            return []

        # Get aggregates for the last N months
        now = datetime.utcnow()
        history = []

        for i in range(months):
            # Calculate month boundaries
            month_end = now.replace(day=1) - timedelta(days=1) if i == 0 else (
                now.replace(day=1) - timedelta(days=30*i)
            ).replace(day=1) - timedelta(days=1)
            month_start = month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            month_end = (month_start.replace(month=month_start.month % 12 + 1, day=1)
                        if month_start.month < 12
                        else month_start.replace(year=month_start.year + 1, month=1, day=1))

            stmt = select(UsageAggregate).where(
                UsageAggregate.customer_id == customer_billing.id,
                UsageAggregate.period_start >= month_start,
                UsageAggregate.period_start < month_end,
            )
            result = await self.db.execute(stmt)
            aggregate = result.scalar_one_or_none()

            if aggregate:
                history.append({
                    "period_start": aggregate.period_start,
                    "period_end": aggregate.period_end,
                    "total_tokens": (
                        aggregate.claude_input_tokens + aggregate.claude_output_tokens +
                        aggregate.gemini_input_tokens + aggregate.gemini_output_tokens +
                        aggregate.ollama_input_tokens + aggregate.ollama_output_tokens
                    ),
                    "total_cost_cents": aggregate.total_cost_cents,
                    "total_requests": aggregate.total_requests,
                    "by_provider": {
                        "claude": {
                            "input_tokens": aggregate.claude_input_tokens,
                            "output_tokens": aggregate.claude_output_tokens,
                        },
                        "gemini": {
                            "input_tokens": aggregate.gemini_input_tokens,
                            "output_tokens": aggregate.gemini_output_tokens,
                        },
                        "ollama": {
                            "input_tokens": aggregate.ollama_input_tokens,
                            "output_tokens": aggregate.ollama_output_tokens,
                        },
                    },
                })
            else:
                history.append({
                    "period_start": month_start,
                    "period_end": month_end,
                    "total_tokens": 0,
                    "total_cost_cents": 0.0,
                    "total_requests": 0,
                    "by_provider": {},
                })

        return history

    async def estimate_monthly_cost(
        self,
        developer_id: str,
    ) -> dict[str, Any]:
        """Estimate monthly cost based on current usage rate."""
        now = datetime.utcnow()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        summary = await self.get_usage_summary(developer_id, month_start, now)

        # Calculate days elapsed and remaining
        days_elapsed = (now - month_start).days + 1
        days_in_month = 30  # Approximation
        days_remaining = max(0, days_in_month - days_elapsed)

        # Project based on current rate
        if days_elapsed > 0:
            daily_rate = summary["total_cost_cents"] / days_elapsed
            projected_remaining = daily_rate * days_remaining
            projected_total = summary["total_cost_cents"] + projected_remaining
        else:
            projected_total = 0.0

        return {
            "current_month_cost_cents": summary["total_cost_cents"],
            "projected_month_cost_cents": projected_total,
            "daily_average_cost_cents": summary["total_cost_cents"] / max(days_elapsed, 1),
            "days_elapsed": days_elapsed,
            "days_remaining": days_remaining,
        }
