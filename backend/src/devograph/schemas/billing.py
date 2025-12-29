"""Pydantic schemas for billing and subscription management."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class PlanResponse(BaseModel):
    """Subscription plan details."""

    id: str
    name: str
    tier: str
    description: str | None = None
    price_monthly_cents: int
    max_repos: int
    max_commits_per_repo: int
    max_prs_per_repo: int
    sync_history_days: int
    llm_requests_per_day: int
    llm_provider_access: list[str]
    enable_real_time_sync: bool
    enable_advanced_analytics: bool
    enable_exports: bool

    class Config:
        from_attributes = True


class SubscriptionResponse(BaseModel):
    """Subscription details."""

    id: str
    status: str
    plan_id: str | None = None
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    trial_start: datetime | None = None
    trial_end: datetime | None = None
    cancel_at: datetime | None = None
    canceled_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class CustomerBillingResponse(BaseModel):
    """Customer billing details."""

    id: str
    stripe_customer_id: str | None = None
    billing_email: str | None = None
    billing_name: str | None = None
    payment_method_type: str | None = None
    payment_method_last4: str | None = None
    payment_method_brand: str | None = None
    tax_exempt: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class InvoiceResponse(BaseModel):
    """Invoice details."""

    id: str
    stripe_invoice_id: str
    stripe_invoice_number: str | None = None
    status: str
    subtotal_cents: int
    tax_cents: int
    total_cents: int
    amount_paid_cents: int
    amount_due_cents: int
    currency: str
    invoice_pdf: str | None = None
    hosted_invoice_url: str | None = None
    period_start: datetime | None = None
    period_end: datetime | None = None
    paid_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class UsageSummaryResponse(BaseModel):
    """Usage summary for a billing period."""

    total_input_tokens: int
    total_output_tokens: int
    total_tokens: int
    total_base_cost_cents: float
    total_cost_cents: float
    margin_percent: float
    by_provider: dict[str, dict[str, Any]]
    period_start: datetime | None = None
    period_end: datetime | None = None


class UsageEstimateResponse(BaseModel):
    """Monthly usage estimate."""

    current_month_cost_cents: float
    projected_month_cost_cents: float
    daily_average_cost_cents: float
    days_elapsed: int
    days_remaining: int


class BillingHistoryEntry(BaseModel):
    """Single billing history entry."""

    period_start: datetime
    period_end: datetime
    total_tokens: int
    total_cost_cents: float
    total_requests: int
    by_provider: dict[str, dict[str, int]]


class CreateCheckoutSessionRequest(BaseModel):
    """Request to create a checkout session."""

    plan_tier: str = Field(..., description="Plan tier: free, pro, or enterprise")
    success_url: str = Field(..., description="URL to redirect to on success")
    cancel_url: str = Field(..., description="URL to redirect to on cancel")


class CreateCheckoutSessionResponse(BaseModel):
    """Checkout session response."""

    checkout_url: str


class CreatePortalSessionRequest(BaseModel):
    """Request to create a billing portal session."""

    return_url: str = Field(..., description="URL to redirect to when leaving portal")


class CreatePortalSessionResponse(BaseModel):
    """Portal session response."""

    portal_url: str


class UpdatePaymentMethodRequest(BaseModel):
    """Request to update payment method."""

    payment_method_id: str = Field(..., description="Stripe payment method ID")


class ChangePlanRequest(BaseModel):
    """Request to change subscription plan."""

    plan_tier: str = Field(..., description="New plan tier: free, pro, or enterprise")


class SubscriptionStatusResponse(BaseModel):
    """Complete subscription status."""

    has_subscription: bool
    subscription: SubscriptionResponse | None = None
    plan: PlanResponse | None = None
    customer: CustomerBillingResponse | None = None
    usage_summary: UsageSummaryResponse | None = None
    usage_estimate: UsageEstimateResponse | None = None


class WebhookResponse(BaseModel):
    """Webhook processing response."""

    status: str
    event_type: str | None = None
    message: str | None = None
