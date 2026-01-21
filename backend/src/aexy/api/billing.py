"""Billing API endpoints for subscription and usage management."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer_id
from aexy.core.database import get_db
from aexy.models.billing import Subscription, SubscriptionStatus
from aexy.models.developer import Developer
from aexy.models.plan import Plan, PlanTier
from aexy.schemas.billing import (
    BillingHistoryEntry,
    ChangePlanRequest,
    CreateCheckoutSessionRequest,
    CreateCheckoutSessionResponse,
    CreatePortalSessionRequest,
    CreatePortalSessionResponse,
    CustomerBillingResponse,
    InvoiceResponse,
    LimitsUsageFeatures,
    LimitsUsageLLM,
    LimitsUsagePlan,
    LimitsUsageRepos,
    LimitsUsageResponse,
    LimitsUsageTokens,
    PlanResponse,
    SubscriptionResponse,
    SubscriptionStatusResponse,
    UpdatePaymentMethodRequest,
    UsageEstimateResponse,
    UsageSummaryResponse,
    WebhookResponse,
)
from aexy.services.stripe_service import StripeService
from aexy.services.stripe_webhook_handler import StripeWebhookHandler
from aexy.services.usage_service import UsageService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing")


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

    If workspace_id is provided, returns the workspace's plan.
    Otherwise returns the developer's individual plan.
    """
    from aexy.models.workspace import Workspace, WorkspaceMember

    stripe_service = StripeService(db)
    usage_service = UsageService(db)

    # Get developer
    stmt = select(Developer).where(Developer.id == developer_id)
    result = await db.execute(stmt)
    developer = result.scalar_one_or_none()

    # Get subscription
    subscription = await stripe_service.get_active_subscription(developer_id)
    customer = await stripe_service.get_customer_billing(developer_id)

    # Get plan - prefer workspace plan if workspace_id provided
    plan = None

    if workspace_id:
        # Check if developer is a member of this workspace
        member_stmt = select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.developer_id == developer_id,
            WorkspaceMember.status == "active",
        )
        member_result = await db.execute(member_stmt)
        if member_result.scalar_one_or_none():
            # Get workspace plan
            ws_stmt = select(Workspace).where(Workspace.id == workspace_id)
            ws_result = await db.execute(ws_stmt)
            workspace = ws_result.scalar_one_or_none()
            if workspace and workspace.plan_id:
                plan_stmt = select(Plan).where(Plan.id == workspace.plan_id)
                plan_result = await db.execute(plan_stmt)
                plan = plan_result.scalar_one_or_none()

    # Fallback to developer's individual plan
    if not plan and developer and developer.plan_id:
        stmt = select(Plan).where(Plan.id == developer.plan_id)
        result = await db.execute(stmt)
        plan = result.scalar_one_or_none()

    # Get usage summary
    usage_summary = await usage_service.get_usage_summary(developer_id)
    usage_estimate = await usage_service.estimate_monthly_cost(developer_id)

    return SubscriptionStatusResponse(
        has_subscription=subscription is not None or plan is not None,
        subscription=SubscriptionResponse.model_validate(subscription) if subscription else None,
        plan=PlanResponse.model_validate(plan) if plan else None,
        customer=CustomerBillingResponse.model_validate(customer) if customer else None,
        usage_summary=UsageSummaryResponse(**usage_summary),
        usage_estimate=UsageEstimateResponse(**usage_estimate),
    )


@router.post("/checkout", response_model=CreateCheckoutSessionResponse)
async def create_checkout_session(
    request: CreateCheckoutSessionRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    developer_id: Annotated[str, Depends(get_current_developer_id)],
) -> CreateCheckoutSessionResponse:
    """Create a Stripe Checkout session for subscription."""
    try:
        plan_tier = PlanTier(request.plan_tier)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan tier: {request.plan_tier}",
        )

    stripe_service = StripeService(db)

    try:
        checkout_url = await stripe_service.create_checkout_session(
            developer_id=developer_id,
            plan_tier=plan_tier,
            success_url=request.success_url,
            cancel_url=request.cancel_url,
        )
        return CreateCheckoutSessionResponse(checkout_url=checkout_url)
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
    """Change subscription to a different plan."""
    try:
        plan_tier = PlanTier(request.plan_tier)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan tier: {request.plan_tier}",
        )

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

    plan = developer.plan or await limits_service.get_or_create_free_plan()

    # Get repos count
    repos_count = await limits_service.get_enabled_repos_count(developer_id)

    # Check resets (daily and monthly)
    await limits_service._maybe_reset_llm_usage(developer)
    await limits_service._maybe_reset_monthly_tokens(developer)

    # Calculate token usage info
    free_tokens = getattr(plan, "free_llm_tokens_per_month", 100000)
    tokens_used = developer.llm_tokens_used_this_month or 0
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
            used_today=developer.llm_requests_today,
            limit_per_day=plan.llm_requests_per_day,
            unlimited=plan.llm_requests_per_day == -1,
            providers=plan.llm_provider_access or [],
            reset_at=developer.llm_requests_reset_at,
        ),
        tokens=LimitsUsageTokens(
            free_tokens_per_month=free_tokens,
            tokens_used_this_month=tokens_used,
            input_tokens_this_month=developer.llm_input_tokens_this_month or 0,
            output_tokens_this_month=developer.llm_output_tokens_this_month or 0,
            tokens_remaining_free=tokens_remaining,
            is_in_overage=is_in_overage,
            overage_tokens=overage_tokens,
            overage_cost_cents=developer.llm_overage_cost_cents or 0,
            input_cost_per_1k_cents=getattr(plan, "llm_input_cost_per_1k_cents", 30),
            output_cost_per_1k_cents=getattr(plan, "llm_output_cost_per_1k_cents", 60),
            enable_overage_billing=getattr(plan, "enable_overage_billing", True),
            reset_at=developer.llm_tokens_reset_at,
        ),
        features=LimitsUsageFeatures(
            real_time_sync=plan.enable_real_time_sync,
            webhooks=plan.enable_webhooks,
            advanced_analytics=plan.enable_advanced_analytics,
            exports=plan.enable_exports,
            team_features=plan.enable_team_features,
        ),
    )


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
