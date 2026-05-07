"""Compose existing billing services into a typed line-item breakdown.

Reads workspace usage, seats, plan, storage, and invoices for a billing period
and returns one canonical shape consumable by both the workspace-admin
breakdown page and the platform-admin cross-tenant view.

Design notes:
- LLM cost in `usage_records.total_cost_cents` is already snapshotted with
  margin at write time (see UsageService.calculate_cost), so historical totals
  remain correct even if plan rates change later.
- Seat and base-fee rates are read from the live WorkspaceSubscription —
  prior-period breakdowns will reflect the *current* rate. A note is added to
  `computation_notes` to flag this.
- `include_margin=True` exposes provider-cost vs charged-cost. Workspace
  admins must never see this; only the platform-admin endpoints flip it on.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.billing import Invoice, UsageAggregate, UsageRecord
from aexy.models.workspace import (
    Workspace,
    WorkspaceMember,
    WorkspaceSubscription,
)
from aexy.services.limits_service import LimitsService
from aexy.services.storage_quota_service import StorageQuotaService

logger = logging.getLogger(__name__)


def _calendar_month_bounds(now: datetime) -> tuple[datetime, datetime]:
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


def _previous_month_bounds(period_start: datetime) -> tuple[datetime, datetime]:
    if period_start.month == 1:
        prev_start = period_start.replace(year=period_start.year - 1, month=12)
    else:
        prev_start = period_start.replace(month=period_start.month - 1)
    return prev_start, period_start


class BillingBreakdownService:
    """Builds a structured billing breakdown for a workspace + period."""

    def __init__(self, db: AsyncSession, *, include_margin: bool = False):
        self.db = db
        self.include_margin = include_margin

    async def _resolve_workspace(self, workspace_id: str) -> Workspace | None:
        result = await self.db.execute(
            select(Workspace).where(Workspace.id == workspace_id)
        )
        return result.scalar_one_or_none()

    async def _resolve_subscription(
        self, workspace_id: str
    ) -> WorkspaceSubscription | None:
        result = await self.db.execute(
            select(WorkspaceSubscription).where(
                WorkspaceSubscription.workspace_id == workspace_id
            )
        )
        return result.scalar_one_or_none()

    async def _resolve_period(
        self,
        workspace_id: str,
        period_start: datetime | None,
        period_end: datetime | None,
    ) -> tuple[datetime, datetime, list[str]]:
        notes: list[str] = []
        if period_start and period_end:
            return period_start, period_end, notes

        sub = await self._resolve_subscription(workspace_id)
        if sub and sub.current_period_start and sub.current_period_end:
            return sub.current_period_start, sub.current_period_end, notes

        notes.append(
            "No active subscription period found; falling back to calendar month."
        )
        start, end = _calendar_month_bounds(datetime.now(timezone.utc))
        return start, end, notes

    async def _seat_count(self, workspace_id: str) -> int:
        result = await self.db.execute(
            select(func.count(WorkspaceMember.id)).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.status == "active",
                WorkspaceMember.is_billable == True,  # noqa: E712
            )
        )
        return int(result.scalar() or 0)

    async def _llm_usage_by_provider(
        self,
        workspace_id: str,
        period_start: datetime,
        period_end: datetime,
    ) -> list[dict[str, Any]]:
        stmt = (
            select(
                UsageRecord.provider,
                func.coalesce(func.sum(UsageRecord.input_tokens), 0).label("input_tokens"),
                func.coalesce(func.sum(UsageRecord.output_tokens), 0).label("output_tokens"),
                func.coalesce(func.sum(UsageRecord.base_cost_cents), 0.0).label("base_cost"),
                func.coalesce(func.sum(UsageRecord.total_cost_cents), 0.0).label("total_cost"),
                func.coalesce(func.avg(UsageRecord.margin_percent), 0.0).label("margin_percent"),
                func.count().label("request_count"),
            )
            .where(
                UsageRecord.workspace_id == workspace_id,
                UsageRecord.created_at >= period_start,
                UsageRecord.created_at < period_end,
            )
            .group_by(UsageRecord.provider)
        )
        result = await self.db.execute(stmt)
        return [
            {
                "provider": row.provider or "unknown",
                "input_tokens": int(row.input_tokens or 0),
                "output_tokens": int(row.output_tokens or 0),
                "base_cost_cents": float(row.base_cost or 0.0),
                "total_cost_cents": float(row.total_cost or 0.0),
                "margin_percent": float(row.margin_percent or 0.0),
                "request_count": int(row.request_count or 0),
            }
            for row in result.all()
        ]

    async def _invoices_in_period(
        self,
        workspace_id: str,
        period_start: datetime,
        period_end: datetime,
    ) -> list[Invoice]:
        stmt = (
            select(Invoice)
            .where(
                Invoice.workspace_id == workspace_id,
                Invoice.created_at >= period_start,
                Invoice.created_at < period_end,
            )
            .order_by(Invoice.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def _previous_period_total(
        self,
        workspace_id: str,
        period_start: datetime,
    ) -> float | None:
        prev_start, prev_end = _previous_month_bounds(period_start)
        # Try aggregate first (cheap), else fall back to raw records.
        sub = await self._resolve_subscription(workspace_id)
        if sub:
            agg_stmt = select(UsageAggregate).where(
                UsageAggregate.workspace_id == workspace_id,
                UsageAggregate.period_start == prev_start,
            )
            result = await self.db.execute(agg_stmt)
            agg = result.scalar_one_or_none()
            if agg:
                return float(agg.total_cost_cents or 0.0)

        stmt = select(
            func.coalesce(func.sum(UsageRecord.total_cost_cents), 0.0)
        ).where(
            UsageRecord.workspace_id == workspace_id,
            UsageRecord.created_at >= prev_start,
            UsageRecord.created_at < prev_end,
        )
        result = await self.db.execute(stmt)
        prev_total = float(result.scalar() or 0.0)
        if prev_total == 0.0:
            return None
        return prev_total

    async def get_breakdown(
        self,
        workspace_id: str,
        *,
        period_start: datetime | None = None,
        period_end: datetime | None = None,
    ) -> dict[str, Any]:
        workspace = await self._resolve_workspace(workspace_id)
        if not workspace:
            raise ValueError(f"Workspace {workspace_id} not found")

        period_start, period_end, notes = await self._resolve_period(
            workspace_id, period_start, period_end
        )

        sub = await self._resolve_subscription(workspace_id)
        limits = LimitsService(self.db)
        effective = await limits.get_effective_plan(
            str(workspace.owner_id), workspace_id
        )

        line_items: list[dict[str, Any]] = []
        info_counters: dict[str, Any] = {}

        # 1. Base fee (flat_plus_usage / postpaid)
        billing_model = sub.billing_model if sub else effective.billing_model
        base_fee_cents = (
            sub.base_fee_monthly_cents if sub else effective.base_fee_monthly_cents
        ) or 0
        if base_fee_cents > 0:
            line_items.append(
                {
                    "category": "base_fee",
                    "label": "Base subscription fee",
                    "description": f"Monthly base fee for {effective.plan_name}",
                    "quantity": 1.0,
                    "unit": "month",
                    "rate_cents": float(base_fee_cents),
                    "rate_display": f"${base_fee_cents / 100:.2f}/month",
                    "included_quantity": None,
                    "billable_quantity": 1.0,
                    "subtotal_cents": float(base_fee_cents),
                    "metadata": None,
                }
            )

        # 2. Seats
        seat_count = await self._seat_count(workspace_id)
        info_counters["seat_count"] = seat_count
        if sub and billing_model in ("per_seat", "postpaid"):
            included_seats = sub.base_seats or 0
            seat_rate = sub.price_per_additional_seat_cents or 0
            billable_seats = max(0, seat_count - included_seats)
            seat_subtotal = billable_seats * seat_rate
            line_items.append(
                {
                    "category": "seats",
                    "label": "Active seats",
                    "description": (
                        f"{seat_count} active billable members "
                        f"({included_seats} included, {billable_seats} additional)"
                    ),
                    "quantity": float(seat_count),
                    "unit": "seats",
                    "rate_cents": float(seat_rate),
                    "rate_display": f"${seat_rate / 100:.2f}/seat/month",
                    "included_quantity": float(included_seats),
                    "billable_quantity": float(billable_seats),
                    "subtotal_cents": float(seat_subtotal),
                    "metadata": {"included_seats": included_seats},
                }
            )

        # 3. LLM usage by provider
        provider_rows = await self._llm_usage_by_provider(
            workspace_id, period_start, period_end
        )
        total_input_tokens = 0
        total_output_tokens = 0
        total_request_count = 0
        total_base_cost_cents = 0.0
        total_llm_cost_cents = 0.0
        for row in provider_rows:
            total_input_tokens += row["input_tokens"]
            total_output_tokens += row["output_tokens"]
            total_request_count += row["request_count"]
            total_base_cost_cents += row["base_cost_cents"]
            total_llm_cost_cents += row["total_cost_cents"]
            input_rate = effective.llm_input_cost_per_1k_cents
            output_rate = effective.llm_output_cost_per_1k_cents
            metadata: dict[str, Any] = {
                "provider": row["provider"],
                "input_tokens": row["input_tokens"],
                "output_tokens": row["output_tokens"],
                "request_count": row["request_count"],
            }
            if self.include_margin:
                metadata["base_cost_cents"] = row["base_cost_cents"]
                metadata["margin_percent"] = row["margin_percent"]
                metadata["margin_cents"] = (
                    row["total_cost_cents"] - row["base_cost_cents"]
                )
            line_items.append(
                {
                    "category": "llm_usage",
                    "label": f"{row['provider'].title()} usage",
                    "description": (
                        f"{row['input_tokens']:,} input + "
                        f"{row['output_tokens']:,} output tokens "
                        f"across {row['request_count']:,} requests"
                    ),
                    "quantity": float(
                        row["input_tokens"] + row["output_tokens"]
                    ),
                    "unit": "tokens",
                    "rate_cents": None,
                    "rate_display": (
                        f"${input_rate / 100:.2f}/1K input · "
                        f"${output_rate / 100:.2f}/1K output"
                    ),
                    "included_quantity": None,
                    "billable_quantity": float(
                        row["input_tokens"] + row["output_tokens"]
                    ),
                    "subtotal_cents": row["total_cost_cents"],
                    "metadata": metadata,
                }
            )

        # 4. Free LLM allowance — INFORMATIONAL ONLY.
        #
        # The Stripe billing pipeline (`UsageService.report_workspace_usage_to_stripe`)
        # reports the raw sum of `UsageRecord.total_cost_cents` with no free-tier
        # deduction; per-member free quotas are tracked separately on
        # `Developer.llm_overage_cost_cents` and never affect the workspace
        # invoice. So the breakdown must NOT subtract a credit from `total_cents`,
        # or the UI will underreport vs what Stripe charges. We surface the
        # allowance as an info counter for context only.
        free_tokens = effective.free_llm_tokens_per_month or 0
        total_tokens_used = total_input_tokens + total_output_tokens
        if free_tokens > 0:
            info_counters["free_tokens_per_member_per_month"] = free_tokens
            info_counters["llm_tokens_used"] = total_tokens_used
            notes.append(
                f"Plan includes {free_tokens:,} free LLM tokens/month per "
                "member. The allowance is per-developer and does not reduce "
                "the workspace billed total above; charged usage matches what "
                "Stripe receives."
            )

        # 5. Storage (info-only line; no charge)
        try:
            storage_service = StorageQuotaService(self.db)
            storage_used_bytes = await storage_service.get_workspace_storage_used(
                workspace_id
            )
            await storage_service.close()
            storage_used_gb = storage_used_bytes / (1024**3)
            storage_limit_gb = effective.max_storage_gb
            info_counters["storage_used_bytes"] = storage_used_bytes
            info_counters["storage_used_gb"] = round(storage_used_gb, 3)
            info_counters["storage_limit_gb"] = storage_limit_gb
            line_items.append(
                {
                    "category": "storage",
                    "label": "Storage",
                    "description": (
                        f"{storage_used_gb:.2f} GB used "
                        + (
                            "(unlimited)"
                            if storage_limit_gb == -1
                            else f"of {storage_limit_gb} GB included"
                        )
                    ),
                    "quantity": round(storage_used_gb, 3),
                    "unit": "GB",
                    "rate_cents": 0.0,
                    "rate_display": "Included in plan",
                    "included_quantity": (
                        None if storage_limit_gb == -1 else float(storage_limit_gb)
                    ),
                    "billable_quantity": 0.0,
                    "subtotal_cents": 0.0,
                    "metadata": {"informational": True},
                }
            )
        except Exception as exc:  # pragma: no cover — non-fatal
            logger.warning("Storage usage lookup failed: %s", exc)

        # 6. Postpaid accrual reminder (if applicable)
        if sub and billing_model == "postpaid":
            accrued = sub.postpaid_usage_accrued_cents or 0
            info_counters["postpaid_accrued_cents"] = accrued
            info_counters["postpaid_last_settled_at"] = (
                sub.postpaid_last_settled_at.isoformat()
                if sub.postpaid_last_settled_at
                else None
            )

        # Totals — `total` must equal what the billing pipeline will charge
        # via Stripe (sum of UsageRecord.total_cost_cents + seat + base fees).
        # Any future "credit" must be applied in the billing pipeline before
        # being subtracted here, otherwise UI vs invoice will diverge.
        subtotal = sum(
            i["subtotal_cents"] for i in line_items if i["subtotal_cents"] > 0
        )
        credits = sum(
            -i["subtotal_cents"] for i in line_items if i["subtotal_cents"] < 0
        )
        total = subtotal - credits

        # Period-over-period delta
        previous_total = await self._previous_period_total(workspace_id, period_start)
        delta_cents = None
        delta_pct = None
        if previous_total is not None:
            delta_cents = total - previous_total
            if previous_total > 0:
                delta_pct = (delta_cents / previous_total) * 100.0

        invoices = await self._invoices_in_period(
            workspace_id, period_start, period_end
        )

        margin_block = None
        if self.include_margin:
            margin_cents = total_llm_cost_cents - total_base_cost_cents
            margin_pct = (
                (margin_cents / total_llm_cost_cents) * 100.0
                if total_llm_cost_cents > 0
                else 0.0
            )
            margin_block = {
                "base_cost_cents": total_base_cost_cents,
                "charged_cents": total_llm_cost_cents,
                "margin_cents": margin_cents,
                "margin_pct": margin_pct,
            }

        # Computation notes
        if base_fee_cents > 0 or (sub and billing_model in ("per_seat", "postpaid")):
            notes.append(
                "Seat and base-fee rates reflect the current subscription; rate "
                "changes mid-period are not retroactively snapshotted."
            )

        return {
            "workspace_id": workspace_id,
            "workspace_name": workspace.name,
            "period_start": period_start,
            "period_end": period_end,
            "plan_id": effective.plan_id,
            "plan_name": effective.plan_name,
            "plan_tier": effective.tier,
            "billing_model": billing_model,
            "line_items": line_items,
            "subtotal_cents": subtotal,
            "credit_cents": credits,
            "total_cents": total,
            "previous_period_total_cents": previous_total,
            "delta_cents": delta_cents,
            "delta_pct": delta_pct,
            "invoices": invoices,
            "info_counters": info_counters,
            "computation_notes": notes,
            "margin": margin_block,
            "generated_at": datetime.now(timezone.utc),
        }

    async def get_history(
        self, workspace_id: str, months: int = 6
    ) -> dict[str, Any]:
        """Return current breakdown plus prior periods.

        Prior-period entries primarily read from `usage_aggregates` (populated
        nightly by the Temporal `aggregate_workspace_usage_daily` schedule);
        when an aggregate is missing the service falls back to live SQL over
        usage_records, which is correct but slower.
        """
        current = await self.get_breakdown(workspace_id)
        history: list[dict[str, Any]] = []

        period_start = current["period_start"]
        for i in range(1, months + 1):
            # Walk back N calendar months from the current period start.
            year = period_start.year
            month = period_start.month - i
            while month <= 0:
                month += 12
                year -= 1
            prev_start = period_start.replace(year=year, month=month, day=1)
            if prev_start.month == 12:
                prev_end = prev_start.replace(year=prev_start.year + 1, month=1)
            else:
                prev_end = prev_start.replace(month=prev_start.month + 1)
            try:
                entry = await self.get_breakdown(
                    workspace_id, period_start=prev_start, period_end=prev_end
                )
                history.append(entry)
            except Exception as exc:
                logger.warning(
                    "History entry %s..%s failed: %s", prev_start, prev_end, exc
                )

        return {"current": current, "history": history}


async def aggregate_all_workspaces_usage(
    db: AsyncSession,
) -> dict[str, Any]:
    """Refresh `usage_aggregates` for every active workspace's current period.

    Wired to the Temporal `aggregate_workspace_usage_daily` schedule so the
    historical billing-breakdown view has data to read from.
    """
    from aexy.models.billing import CustomerBilling, Subscription, SubscriptionStatus
    from aexy.services.usage_service import UsageService

    usage_service = UsageService(db)
    refreshed = 0
    skipped = 0
    errors = 0

    # Walk active customer subscriptions to get a (customer_id, period) tuple.
    stmt = select(Subscription, CustomerBilling).join(
        CustomerBilling, Subscription.customer_id == CustomerBilling.id
    ).where(
        Subscription.status.in_(
            [
                SubscriptionStatus.ACTIVE.value,
                SubscriptionStatus.TRIALING.value,
            ]
        )
    )
    result = await db.execute(stmt)
    rows = result.all()

    for subscription, customer in rows:
        if not subscription.current_period_start or not subscription.current_period_end:
            skipped += 1
            continue
        try:
            await usage_service.update_usage_aggregate(
                customer_id=customer.id,
                period_start=subscription.current_period_start,
                period_end=subscription.current_period_end,
            )
            refreshed += 1
        except Exception:
            logger.exception(
                "Failed to refresh aggregate for customer %s", customer.id
            )
            errors += 1

    # Also refresh calendar-month aggregate for every workspace with usage —
    # this covers free-tier and trial workspaces that have no Subscription row.
    now = datetime.now(timezone.utc)
    period_start, period_end = _calendar_month_bounds(now)
    # Previous month too, in case it just rolled over.
    prev_start, prev_end = _previous_month_bounds(period_start)

    workspace_stmt = (
        select(UsageRecord.workspace_id)
        .where(
            UsageRecord.workspace_id.is_not(None),
            UsageRecord.created_at >= prev_start,
        )
        .group_by(UsageRecord.workspace_id)
    )
    ws_result = await db.execute(workspace_stmt)
    workspace_ids = [row[0] for row in ws_result.all() if row[0]]

    for ws_id in workspace_ids:
        # Find the customer for this workspace via the workspace owner.
        owner_stmt = select(Workspace).where(Workspace.id == ws_id)
        ow_result = await db.execute(owner_stmt)
        ws = ow_result.scalar_one_or_none()
        if not ws:
            continue
        cust_stmt = select(CustomerBilling).where(
            CustomerBilling.developer_id == ws.owner_id
        )
        cust_result = await db.execute(cust_stmt)
        cust = cust_result.scalar_one_or_none()
        if not cust:
            continue
        for ps, pe in ((period_start, period_end), (prev_start, prev_end)):
            try:
                await usage_service.update_usage_aggregate(
                    customer_id=cust.id, period_start=ps, period_end=pe
                )
                refreshed += 1
            except Exception:
                errors += 1

    return {
        "refreshed": refreshed,
        "skipped": skipped,
        "errors": errors,
    }
