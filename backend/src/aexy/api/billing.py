"""Billing API endpoints for subscription and usage management."""

import logging
from typing import Annotated

import stripe
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer, get_current_developer_id
from aexy.core.database import get_db
from aexy.models.billing import Subscription, SubscriptionStatus
from aexy.models.developer import Developer
from aexy.models.plan import Plan, PlanTier
from aexy.schemas.billing import (
    BillingBreakdownHistoryResponse,
    BillingBreakdownResponse,
    BillingHistoryEntry,
    ChangePlanRequest,
    CreateCheckoutSessionRequest,
    CreateCheckoutSessionResponse,
    CreatePortalSessionRequest,
    CreatePortalSessionResponse,
    CustomerBillingResponse,
    EffectivePlanResponse,
    InvoiceResponse,
    LimitsUsageFeatures,
    LimitsUsageLLM,
    LimitsUsagePlan,
    LimitsUsageRepos,
    LimitsUsageResponse,
    LimitsUsageTokens,
    PlanResponse,
    PostpaidSummaryResponse,
    SeatSummaryResponse,
    SubscriptionResponse,
    SubscriptionStatusResponse,
    UpdatePaymentMethodRequest,
    UpdateSeatsRequest,
    UsageEstimateResponse,
    UsageSummaryResponse,
    WebhookResponse,
)
from aexy.services.billing_breakdown_service import BillingBreakdownService
from aexy.services.stripe_service import StripeService
from aexy.services.stripe_webhook_handler import StripeWebhookHandler
from aexy.services.usage_service import UsageService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing")


async def verify_workspace_admin(
    db: AsyncSession,
    workspace_id: str,
    developer_id: str,
) -> None:
    """Verify the developer is an owner or admin of the workspace.

    Raises HTTPException 403 if not authorized.
    """
    from aexy.models.workspace import WorkspaceMember

    stmt = select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.developer_id == developer_id,
        WorkspaceMember.status == "active",
    )
    result = await db.execute(stmt)
    member = result.scalar_one_or_none()

    if not member or member.role not in ("owner", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace owners or admins can change the plan",
        )


async def get_developer(
    developer_id: str = Depends(get_current_developer_id),
    db: AsyncSession = Depends(get_db),
) -> Developer:
    """Get developer from ID."""
    stmt = select(Developer).where(Developer.id == developer_id)
    result = await db.execute(stmt)
    developer = result.scalar_one_or_none()
    if not developer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        )
    return developer


@router.get("/plans", response_model=list[PlanResponse])
async def get_plans(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[PlanResponse]:
    """Get all available subscription plans."""
    stmt = select(Plan).where(Plan.is_active == True).order_by(Plan.price_monthly_cents)
    result = await db.execute(stmt)
    plans = result.scalars().all()

    return [PlanResponse.model_validate(plan) for plan in plans]


@router.get("/status", response_model=SubscriptionStatusResponse)
async def get_subscription_status(
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    workspace_id: str | None = None,
) -> SubscriptionStatusResponse:
    """Get current subscription status, usage summary, and estimates.

    Returns the effective plan for the developer, including workspace plan
    inheritance (all members benefit from the workspace's upgraded plan).
    Includes billing_model, seat_summary (per-seat plans), and
    postpaid_summary (postpaid plans) when applicable.
    """

    from aexy.models.workspace import WorkspaceSubscription
    from aexy.services.limits_service import LimitsService

    stripe_service = StripeService(db)
    usage_service = UsageService(db)
    limits_service = LimitsService(db)

    # Get developer
    stmt = select(Developer).where(Developer.id == developer_id)
    result = await db.execute(stmt)
    developer = result.scalar_one_or_none()

    # Get subscription
    subscription = await stripe_service.get_active_subscription(developer_id)
    customer = await stripe_service.get_customer_billing(developer_id)

    # Get effective plan (workspace-aware: returns highest-tier plan from any workspace membership)
    effective = await limits_service.get_effective_plan(developer_id, workspace_id)
    billing_model = effective.billing_model

    # Get usage summary
    usage_summary = await usage_service.get_usage_summary(developer_id)
    usage_estimate = await usage_service.estimate_monthly_cost(developer_id)

    # Build seat summary if on a per-seat plan
    seat_summary = None
    postpaid_summary = None

    if workspace_id:
        stmt = select(WorkspaceSubscription).where(
            WorkspaceSubscription.workspace_id == workspace_id,
            WorkspaceSubscription.status == "active",
        )
        result = await db.execute(stmt)
        ws_sub = result.scalar_one_or_none()

        if ws_sub and ws_sub.billing_model == "per_seat":
            seat_summary = SeatSummaryResponse(
                total_seats=ws_sub.base_seats + ws_sub.additional_seats,
                base_seats=ws_sub.base_seats,
                additional_seats=ws_sub.additional_seats,
                per_seat_price_cents=ws_sub.price_per_additional_seat_cents,
                included_seats=ws_sub.base_seats,
            )

        if ws_sub and ws_sub.billing_model in ("postpaid", "flat_plus_usage"):
            postpaid_summary = PostpaidSummaryResponse(
                accrued_cents=ws_sub.postpaid_usage_accrued_cents,
                estimated_total_cents=ws_sub.postpaid_usage_accrued_cents + ws_sub.base_fee_monthly_cents,
                last_settled_at=ws_sub.postpaid_last_settled_at,
                billing_period_start=ws_sub.current_period_start,
                billing_period_end=ws_sub.current_period_end,
            )

    # Build PlanResponse from the effective plan data
    plan_response = PlanResponse(
        id=effective.plan_id,
        name=effective.plan_name,
        tier=effective.tier,
        billing_model=effective.billing_model,
        description=None,
        price_monthly_cents=effective.price_monthly_cents,
        max_repos=effective.max_repos,
        max_commits_per_repo=effective.max_commits_per_repo,
        max_prs_per_repo=effective.max_prs_per_repo,
        sync_history_days=effective.sync_history_days,
        llm_requests_per_day=effective.llm_requests_per_day,
        llm_provider_access=effective.llm_provider_access,
        free_llm_tokens_per_month=effective.free_llm_tokens_per_month,
        llm_input_cost_per_1k_cents=effective.llm_input_cost_per_1k_cents,
        llm_output_cost_per_1k_cents=effective.llm_output_cost_per_1k_cents,
        enable_overage_billing=effective.enable_overage_billing,
        enable_real_time_sync=effective.enable_real_time_sync,
        enable_advanced_analytics=effective.enable_advanced_analytics,
        enable_exports=effective.enable_exports,
        enable_webhooks=effective.enable_webhooks,
        enable_team_features=effective.enable_team_features,
        base_fee_monthly_cents=effective.base_fee_monthly_cents,
        per_seat_price_monthly_cents=effective.per_seat_price_monthly_cents,
        min_seats=effective.min_seats,
        included_seats=effective.included_seats,
        requires_payment_method=effective.requires_payment_method,
        payment_timing=effective.payment_timing,
    )

    return SubscriptionStatusResponse(
        has_subscription=subscription is not None or effective.plan_id is not None,
        billing_model=billing_model,
        subscription=SubscriptionResponse.model_validate(subscription) if subscription else None,
        plan=plan_response,
        customer=CustomerBillingResponse.model_validate(customer) if customer else None,
        usage_summary=UsageSummaryResponse(**usage_summary),
        usage_estimate=UsageEstimateResponse(**usage_estimate),
        seat_summary=seat_summary,
        postpaid_summary=postpaid_summary,
    )


@router.post("/checkout", response_model=CreateCheckoutSessionResponse)
async def create_checkout_session(
    request: CreateCheckoutSessionRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
) -> CreateCheckoutSessionResponse:
    """Create a Stripe Checkout session for subscription.

    Only workspace owners or admins can upgrade a workspace plan.
    Supports billing_model and seat_count for per-seat plans.
    """
    try:
        plan_tier = PlanTier(request.plan_tier)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan tier: {request.plan_tier}",
        )

    # Validate billing_model if provided
    if request.billing_model:
        from aexy.models.plan import BillingModel
        valid_models = {m.value for m in BillingModel} - {BillingModel.FREE.value}
        if request.billing_model not in valid_models:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid billing model: {request.billing_model}. Must be one of: {', '.join(sorted(valid_models))}",
            )

    # Validate seat_count
    if request.seat_count is not None and request.seat_count < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seat count must be at least 1",
        )

    # If upgrading for a workspace, verify the user is an owner or admin
    if request.workspace_id:
        await verify_workspace_admin(db, request.workspace_id, developer_id)

    stripe_service = StripeService(db)

    try:
        # Determine the quantity for the checkout (seat_count for per-seat plans)
        quantity = request.seat_count if request.seat_count else 1

        checkout_url = await stripe_service.create_checkout_session(
            developer_id=developer_id,
            plan_tier=plan_tier,
            success_url=request.success_url,
            cancel_url=request.cancel_url,
            workspace_id=request.workspace_id,
            billing_model=request.billing_model,
            seat_count=quantity,
        )
        return CreateCheckoutSessionResponse(checkout_url=checkout_url)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to create checkout session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create checkout session",
        )


@router.post("/portal", response_model=CreatePortalSessionResponse)
async def create_billing_portal_session(
    request: CreatePortalSessionRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
) -> CreatePortalSessionResponse:
    """Create a Stripe Billing Portal session."""
    stripe_service = StripeService(db)

    try:
        portal_url = await stripe_service.create_billing_portal_session(
            developer_id=developer_id,
            return_url=request.return_url,
        )
        return CreatePortalSessionResponse(portal_url=portal_url)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to create portal session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create billing portal session",
        )


@router.post("/payment-method")
async def update_payment_method(
    request: UpdatePaymentMethodRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
) -> CustomerBillingResponse:
    """Update the default payment method."""
    stripe_service = StripeService(db)

    try:
        customer = await stripe_service.update_payment_method(
            developer_id=developer_id,
            payment_method_id=request.payment_method_id,
        )
        return CustomerBillingResponse.model_validate(customer)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to update payment method: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update payment method",
        )


@router.post("/change-plan", response_model=SubscriptionResponse)
async def change_plan(
    request: ChangePlanRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
) -> SubscriptionResponse:
    """Change subscription to a different plan.

    Only workspace owners or admins can change a workspace plan.
    """
    try:
        plan_tier = PlanTier(request.plan_tier)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan tier: {request.plan_tier}",
        )

    # If changing for a workspace, verify the user is an owner or admin
    if request.workspace_id:
        await verify_workspace_admin(db, request.workspace_id, developer_id)

    stripe_service = StripeService(db)

    # Get current subscription
    subscription = await stripe_service.get_active_subscription(developer_id)
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active subscription to change",
        )

    try:
        updated_subscription = await stripe_service.change_plan(
            subscription_id=subscription.id,
            new_plan_tier=plan_tier,
            workspace_id=request.workspace_id,
        )
        return SubscriptionResponse.model_validate(updated_subscription)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Failed to change plan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to change subscription plan",
        )


@router.post("/cancel")
async def cancel_subscription(
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    immediately: bool = False,
) -> SubscriptionResponse:
    """Cancel subscription (at period end by default)."""
    stripe_service = StripeService(db)

    subscription = await stripe_service.get_active_subscription(developer_id)
    if not subscription:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active subscription to cancel",
        )

    try:
        canceled_subscription = await stripe_service.cancel_subscription(
            subscription_id=subscription.id,
            cancel_immediately=immediately,
        )
        return SubscriptionResponse.model_validate(canceled_subscription)
    except Exception as e:
        logger.error(f"Failed to cancel subscription: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel subscription",
        )


@router.get("/effective-plan", response_model=EffectivePlanResponse)
async def get_effective_plan(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
    workspace_id: str | None = None,
) -> EffectivePlanResponse:
    """Get the effective plan with workspace overrides applied."""
    from aexy.services.limits_service import LimitsService

    limits = LimitsService(db)
    effective = await limits.get_effective_plan(current_user.id, workspace_id)

    # EffectivePlan dataclass fields match EffectivePlanResponse fields;
    # filter out extra fields (stripe_product_id, stripe_price_id) not in the response schema
    response_fields = EffectivePlanResponse.model_fields.keys()
    return EffectivePlanResponse(**{k: v for k, v in vars(effective).items() if k in response_fields})


@router.post("/seats")
async def update_seats(
    data: UpdateSeatsRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Developer, Depends(get_current_developer)],
) -> dict:
    """Update seat count for per-seat plans.

    Only workspace owners or admins can update seats.
    """
    from aexy.models.workspace import WorkspaceSubscription

    # Verify workspace access (owner/admin)
    await verify_workspace_admin(db, data.workspace_id, current_user.id)

    # Get workspace subscription
    stmt = select(WorkspaceSubscription).where(
        WorkspaceSubscription.workspace_id == data.workspace_id,
        WorkspaceSubscription.status == "active",
    )
    result = await db.execute(stmt)
    ws_sub = result.scalar_one_or_none()

    if not ws_sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active workspace subscription found",
        )

    if ws_sub.billing_model != "per_seat":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seat management is only available for per-seat plans",
        )

    if data.seat_count < ws_sub.base_seats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Seat count cannot be less than the base seats ({ws_sub.base_seats})",
        )

    old_total = ws_sub.base_seats + ws_sub.additional_seats
    new_additional = data.seat_count - ws_sub.base_seats

    # Update Stripe subscription quantity if we have a Stripe subscription
    if ws_sub.stripe_subscription_id:
        try:
            stripe_sub = stripe.Subscription.retrieve(ws_sub.stripe_subscription_id)
            if stripe_sub.items.data:
                stripe.SubscriptionItem.modify(
                    stripe_sub.items.data[0].id,
                    quantity=data.seat_count,
                    proration_behavior="create_prorations",
                )
        except stripe.error.StripeError as e:
            logger.error(f"Failed to update Stripe seat count: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update seat count in Stripe",
            )

    # Update local record
    ws_sub.additional_seats = new_additional
    await db.commit()

    return {
        "workspace_id": data.workspace_id,
        "previous_total_seats": old_total,
        "new_total_seats": data.seat_count,
        "base_seats": ws_sub.base_seats,
        "additional_seats": new_additional,
        "per_seat_price_cents": ws_sub.price_per_additional_seat_cents,
    }


@router.get("/invoices", response_model=list[InvoiceResponse])
async def get_invoices(
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    limit: int = 10,
) -> list[InvoiceResponse]:
    """Get invoice history."""
    stripe_service = StripeService(db)

    invoices = await stripe_service.get_invoices(developer_id, limit=limit)
    return [InvoiceResponse.model_validate(inv) for inv in invoices]


@router.get("/usage", response_model=UsageSummaryResponse)
async def get_usage_summary(
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
) -> UsageSummaryResponse:
    """Get current billing period usage summary."""
    usage_service = UsageService(db)
    summary = await usage_service.get_usage_summary(developer_id)
    return UsageSummaryResponse(**summary)


@router.get("/usage/estimate", response_model=UsageEstimateResponse)
async def get_usage_estimate(
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
) -> UsageEstimateResponse:
    """Get estimated monthly cost based on current usage."""
    usage_service = UsageService(db)
    estimate = await usage_service.estimate_monthly_cost(developer_id)
    return UsageEstimateResponse(**estimate)


@router.get("/usage/history", response_model=list[BillingHistoryEntry])
async def get_billing_history(
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    months: int = 6,
) -> list[BillingHistoryEntry]:
    """Get billing history for the last N months."""
    usage_service = UsageService(db)
    history = await usage_service.get_billing_history(developer_id, months=months)
    return [BillingHistoryEntry(**entry) for entry in history]


@router.get("/limits", response_model=LimitsUsageResponse)
async def get_limits_usage(
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
) -> LimitsUsageResponse:
    """Get current plan limits and usage."""
    from aexy.services.limits_service import LimitsService

    limits_service = LimitsService(db)

    # Get developer with plan
    developer = await limits_service.get_developer_with_plan(developer_id)
    if not developer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Developer not found",
        )

    plan = await limits_service.get_plan(developer_id)

    # Get repos count
    repos_count = await limits_service.get_enabled_repos_count(developer_id)

    # Check resets (daily and monthly)
    await limits_service._maybe_reset_llm_usage(developer)
    await limits_service._maybe_reset_monthly_tokens(developer)

    # Calculate token usage info.
    #
    # Source of truth substitution (option B): the AI sync pipeline writes
    # tokens to the workspace counter (Workspace.llm_tokens_used_this_month)
    # rather than the developer counter (Developer.llm_tokens_used_this_month)
    # because the call is workspace-billable, not author-billable. The
    # per-developer column is dead — nobody writes it. So when the caller
    # is a member of a workspace, we substitute that workspace's counters
    # here so this legacy endpoint reflects reality.
    #
    # Preferred workspace selection: one the caller owns (most likely
    # what they're billed for); else the first workspace they're a member
    # of. If no workspace, fall back to the (zero) developer counters.
    from aexy.models.workspace import Workspace, WorkspaceMember

    workspace_row = (
        await db.execute(
            select(Workspace)
            .join(
                WorkspaceMember,
                WorkspaceMember.workspace_id == Workspace.id,
            )
            .where(WorkspaceMember.developer_id == developer_id)
            .order_by(
                # Owners first, then by recency so we pick the most
                # active workspace the user is likely paying for.
                (Workspace.owner_id == developer_id).desc(),
                Workspace.updated_at.desc(),
            )
            .limit(1)
        )
    ).scalar_one_or_none()

    free_tokens = getattr(plan, "free_llm_tokens_per_month", 100000)

    token_source = "developer"
    source_workspace_id: str | None = None
    if workspace_row is not None:
        # Make sure the workspace counters reset cleanly on month boundary
        # before we read them.
        await limits_service._maybe_reset_workspace_tokens(workspace_row)
        tokens_used = int(workspace_row.llm_tokens_used_this_month or 0)
        input_tokens = int(workspace_row.llm_input_tokens_this_month or 0)
        output_tokens = int(workspace_row.llm_output_tokens_this_month or 0)
        tokens_reset_at = workspace_row.llm_tokens_reset_at
        overage_cost_cents = int(workspace_row.llm_overage_cost_cents or 0)
        token_source = "workspace"
        source_workspace_id = workspace_row.id
    else:
        tokens_used = developer.llm_tokens_used_this_month or 0
        input_tokens = developer.llm_input_tokens_this_month or 0
        output_tokens = developer.llm_output_tokens_this_month or 0
        tokens_reset_at = developer.llm_tokens_reset_at
        overage_cost_cents = int(developer.llm_overage_cost_cents or 0)

    tokens_remaining = max(0, free_tokens - tokens_used) if free_tokens > 0 else 0
    is_in_overage = tokens_used > free_tokens if free_tokens > 0 else False
    overage_tokens = max(0, tokens_used - free_tokens) if free_tokens > 0 else 0

    return LimitsUsageResponse(
        plan=LimitsUsagePlan(
            id=plan.id,
            name=plan.name,
            tier=plan.tier.value if hasattr(plan.tier, "value") else str(plan.tier),
        ),
        repos=LimitsUsageRepos(
            used=repos_count,
            limit=plan.max_repos,
            unlimited=plan.max_repos == -1,
        ),
        llm=LimitsUsageLLM(
            # `used_today` stays on the developer counter — the workspace
            # counter is monthly and lacks daily granularity, so swapping
            # it in would produce a misleading "used vs daily limit" ratio.
            used_today=developer.llm_requests_today,
            limit_per_day=plan.llm_requests_per_day,
            unlimited=plan.llm_requests_per_day == -1,
            providers=plan.llm_provider_access or [],
            reset_at=developer.llm_requests_reset_at,
        ),
        tokens=LimitsUsageTokens(
            free_tokens_per_month=free_tokens,
            tokens_used_this_month=tokens_used,
            input_tokens_this_month=input_tokens,
            output_tokens_this_month=output_tokens,
            tokens_remaining_free=tokens_remaining,
            is_in_overage=is_in_overage,
            overage_tokens=overage_tokens,
            overage_cost_cents=overage_cost_cents,
            input_cost_per_1k_cents=getattr(plan, "llm_input_cost_per_1k_cents", 30),
            output_cost_per_1k_cents=getattr(plan, "llm_output_cost_per_1k_cents", 60),
            enable_overage_billing=getattr(plan, "enable_overage_billing", True),
            reset_at=tokens_reset_at,
            source=token_source,
            source_workspace_id=source_workspace_id,
        ),
        features=LimitsUsageFeatures(
            real_time_sync=plan.enable_real_time_sync,
            webhooks=plan.enable_webhooks,
            advanced_analytics=plan.enable_advanced_analytics,
            exports=plan.enable_exports,
            team_features=plan.enable_team_features,
        ),
    )


@router.get("/breakdown", response_model=BillingBreakdownResponse)
async def get_billing_breakdown(
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    workspace_id: str,
    period: str = "current",
) -> BillingBreakdownResponse:
    """Workspace-admin billing breakdown for a single period.

    `period` is `current` (default), `previous`, or `YYYY-MM`. Margin
    information is never exposed via this endpoint — see the
    /platform-admin/billing/* routes for that.
    """
    await verify_workspace_admin(db, workspace_id, developer_id)

    period_start: "datetime | None" = None
    period_end: "datetime | None" = None
    if period and period != "current":
        from datetime import datetime as _dt
        from datetime import timezone as _tz

        if period == "previous":
            now = _dt.now(_tz.utc)
            this_start = now.replace(
                day=1, hour=0, minute=0, second=0, microsecond=0
            )
            if this_start.month == 1:
                period_start = this_start.replace(
                    year=this_start.year - 1, month=12
                )
            else:
                period_start = this_start.replace(month=this_start.month - 1)
            period_end = this_start
        else:
            try:
                year_str, month_str = period.split("-")
                year_int = int(year_str)
                month_int = int(month_str)
                period_start = _dt(year_int, month_int, 1, tzinfo=_tz.utc)
                if month_int == 12:
                    period_end = _dt(year_int + 1, 1, 1, tzinfo=_tz.utc)
                else:
                    period_end = _dt(year_int, month_int + 1, 1, tzinfo=_tz.utc)
            except (ValueError, AttributeError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="period must be 'current', 'previous', or 'YYYY-MM'",
                )

    service = BillingBreakdownService(db, include_margin=False)
    try:
        result = await service.get_breakdown(
            workspace_id, period_start=period_start, period_end=period_end
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        )
    return BillingBreakdownResponse.model_validate(result)


@router.get(
    "/breakdown/history",
    response_model=BillingBreakdownHistoryResponse,
)
async def get_billing_breakdown_history(
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
    workspace_id: str,
    months: int = 6,
) -> BillingBreakdownHistoryResponse:
    """Current breakdown plus prior N months for a workspace."""
    await verify_workspace_admin(db, workspace_id, developer_id)

    if months < 1 or months > 24:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="months must be between 1 and 24",
        )

    service = BillingBreakdownService(db, include_margin=False)
    try:
        result = await service.get_history(workspace_id, months=months)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        )
    return BillingBreakdownHistoryResponse.model_validate(result)


@router.post("/webhook", response_model=WebhookResponse)
async def stripe_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    stripe_signature: Annotated[str, Header(alias="Stripe-Signature")],
) -> WebhookResponse:
    """Handle Stripe webhook events."""
    payload = await request.body()

    handler = StripeWebhookHandler(db)

    try:
        event = handler.verify_webhook(payload, stripe_signature)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payload",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid signature",
        )

    try:
        result = await handler.handle_event(event)
        return WebhookResponse(
            status=result.get("status", "handled"),
            event_type=result.get("event_type"),
            message=result.get("action"),
        )
    except Exception as e:
        logger.error(f"Webhook handling error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook processing failed",
        )
