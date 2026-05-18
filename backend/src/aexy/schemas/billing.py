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
    billing_model: str = "free"
    price_monthly_cents: int
    max_repos: int
    max_commits_per_repo: int
    max_prs_per_repo: int
    sync_history_days: int
    llm_requests_per_day: int
    llm_provider_access: list[str]
    # Token allocation and pricing
    free_llm_tokens_per_month: int = 100000
    llm_input_cost_per_1k_cents: int = 30
    llm_output_cost_per_1k_cents: int = 60
    enable_overage_billing: bool = True
    # Feature flags
    enable_real_time_sync: bool
    enable_advanced_analytics: bool
    enable_exports: bool
    enable_webhooks: bool = False
    enable_team_features: bool = False
    # Billing model pricing
    base_fee_monthly_cents: int = 0
    per_seat_price_monthly_cents: int = 0
    min_seats: int = 1
    included_seats: int = 0
    requires_payment_method: bool = False
    payment_timing: str = "prepaid"

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
    stripe_invoice_id: str | None = None
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
    payment_method: str = "stripe"
    bank_transfer_reference: str | None = None
    manual_payment_note: str | None = None
    marked_paid_by: str | None = None
    description: str | None = None
    due_date: datetime | None = None
    workspace_id: str | None = None
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
    billing_model: str | None = Field(default=None, description="Billing model: per_seat, flat_plus_usage, postpaid")
    success_url: str = Field(..., description="URL to redirect to on success")
    cancel_url: str = Field(..., description="URL to redirect to on cancel")
    workspace_id: str | None = Field(default=None, description="Workspace to upgrade (if applicable)")
    seat_count: int | None = Field(default=None, description="Number of seats for per-seat plans")


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
    workspace_id: str | None = Field(default=None, description="Workspace to change plan for (if applicable)")


class SeatSummaryResponse(BaseModel):
    """Seat information for per-seat plans."""

    total_seats: int
    base_seats: int
    additional_seats: int
    per_seat_price_cents: int
    included_seats: int


class PostpaidSummaryResponse(BaseModel):
    """Postpaid billing summary."""

    accrued_cents: int
    estimated_total_cents: int
    last_settled_at: datetime | None = None
    billing_period_start: datetime | None = None
    billing_period_end: datetime | None = None


class SubscriptionStatusResponse(BaseModel):
    """Complete subscription status."""

    has_subscription: bool
    billing_model: str = "free"
    subscription: SubscriptionResponse | None = None
    plan: PlanResponse | None = None
    customer: CustomerBillingResponse | None = None
    usage_summary: UsageSummaryResponse | None = None
    usage_estimate: UsageEstimateResponse | None = None
    seat_summary: SeatSummaryResponse | None = None
    postpaid_summary: PostpaidSummaryResponse | None = None


class WebhookResponse(BaseModel):
    """Webhook processing response."""

    status: str
    event_type: str | None = None
    message: str | None = None


class LimitsUsagePlan(BaseModel):
    """Plan information for limits."""

    id: str
    name: str
    tier: str
    billing_model: str = "free"


class LimitsUsageRepos(BaseModel):
    """Repository usage details."""

    used: int
    limit: int
    unlimited: bool


class LimitsUsageLLM(BaseModel):
    """LLM usage details."""

    used_today: int
    limit_per_day: int
    unlimited: bool
    providers: list[str]
    reset_at: datetime | None = None


class LimitsUsageFeatures(BaseModel):
    """Feature availability."""

    real_time_sync: bool
    webhooks: bool
    advanced_analytics: bool
    exports: bool
    team_features: bool


class LimitsUsageTokens(BaseModel):
    """Token usage for pay-per-use billing."""

    free_tokens_per_month: int
    tokens_used_this_month: int
    input_tokens_this_month: int
    output_tokens_this_month: int
    tokens_remaining_free: int
    is_in_overage: bool
    overage_tokens: int
    overage_cost_cents: int
    input_cost_per_1k_cents: int
    output_cost_per_1k_cents: int
    enable_overage_billing: bool
    reset_at: datetime | None = None
    # Where this block's numbers came from. "workspace" means the caller
    # is a member of a workspace whose counters are aggregated by sync
    # activities; "developer" is the legacy per-developer counter (always
    # 0 today since no caller writes it). Lets the UI render a tooltip.
    source: str = "developer"
    source_workspace_id: str | None = None


class LimitsUsageResponse(BaseModel):
    """Complete limits and usage information."""

    plan: LimitsUsagePlan
    repos: LimitsUsageRepos
    llm: LimitsUsageLLM
    tokens: LimitsUsageTokens
    features: LimitsUsageFeatures


# --- Effective Plan (with overrides applied) ---


class EffectivePlanResponse(BaseModel):
    """Plan with workspace overrides applied."""

    plan_id: str
    plan_name: str
    tier: str
    billing_model: str
    has_overrides: bool = False
    discount_percent: int = 0
    # Limits
    max_repos: int
    max_commits_per_repo: int
    max_prs_per_repo: int
    sync_history_days: int
    llm_requests_per_day: int
    llm_requests_per_minute: int
    llm_tokens_per_minute: int
    llm_provider_access: list[str]
    free_llm_tokens_per_month: int
    llm_input_cost_per_1k_cents: int
    llm_output_cost_per_1k_cents: int
    enable_overage_billing: bool
    # Features
    enable_real_time_sync: bool
    enable_advanced_analytics: bool
    enable_exports: bool
    enable_webhooks: bool
    enable_team_features: bool
    # Pricing
    price_monthly_cents: int
    base_fee_monthly_cents: int
    per_seat_price_monthly_cents: int
    min_seats: int
    included_seats: int
    payment_timing: str
    requires_payment_method: bool


# --- Workspace Plan Override ---


class WorkspacePlanOverrideCreate(BaseModel):
    """Request to create/update a workspace plan override. All fields optional."""

    billing_model: str | None = None
    price_monthly_cents: int | None = None
    base_fee_monthly_cents: int | None = None
    per_seat_price_monthly_cents: int | None = None
    min_seats: int | None = None
    included_seats: int | None = None
    max_repos: int | None = None
    max_commits_per_repo: int | None = None
    max_prs_per_repo: int | None = None
    sync_history_days: int | None = None
    llm_requests_per_day: int | None = None
    llm_requests_per_minute: int | None = None
    llm_tokens_per_minute: int | None = None
    llm_provider_access: list[str] | None = None
    free_llm_tokens_per_month: int | None = None
    llm_input_cost_per_1k_cents: int | None = None
    llm_output_cost_per_1k_cents: int | None = None
    enable_overage_billing: bool | None = None
    enable_real_time_sync: bool | None = None
    enable_advanced_analytics: bool | None = None
    enable_exports: bool | None = None
    enable_webhooks: bool | None = None
    enable_team_features: bool | None = None
    payment_timing: str | None = None
    requires_payment_method: bool | None = None
    stripe_product_id: str | None = None
    stripe_price_id: str | None = None
    days_until_due: int | None = None
    preferred_payment_method: str | None = None
    discount_percent: int | None = None
    discount_description: str | None = None
    notes: str | None = None


class WorkspacePlanOverrideResponse(BaseModel):
    """Workspace plan override details."""

    id: str
    workspace_id: str
    billing_model: str | None = None
    price_monthly_cents: int | None = None
    base_fee_monthly_cents: int | None = None
    per_seat_price_monthly_cents: int | None = None
    min_seats: int | None = None
    included_seats: int | None = None
    max_repos: int | None = None
    max_commits_per_repo: int | None = None
    max_prs_per_repo: int | None = None
    sync_history_days: int | None = None
    llm_requests_per_day: int | None = None
    llm_requests_per_minute: int | None = None
    llm_tokens_per_minute: int | None = None
    llm_provider_access: list[str] | None = None
    free_llm_tokens_per_month: int | None = None
    llm_input_cost_per_1k_cents: int | None = None
    llm_output_cost_per_1k_cents: int | None = None
    enable_overage_billing: bool | None = None
    enable_real_time_sync: bool | None = None
    enable_advanced_analytics: bool | None = None
    enable_exports: bool | None = None
    enable_webhooks: bool | None = None
    enable_team_features: bool | None = None
    payment_timing: str | None = None
    requires_payment_method: bool | None = None
    discount_percent: int | None = None
    days_until_due: int | None = None
    preferred_payment_method: str | None = None
    discount_description: str | None = None
    notes: str | None = None
    configured_by: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UpdateSeatsRequest(BaseModel):
    """Request to update seat count."""

    seat_count: int = Field(..., ge=1, description="New total seat count")
    workspace_id: str = Field(..., description="Workspace ID")


# --- Admin Invoice Management ---


class CreateManualInvoiceRequest(BaseModel):
    """Request to create a manual invoice (bank transfer / offline)."""

    workspace_id: str
    amount_cents: int = Field(..., ge=1, description="Total amount in cents")
    description: str = Field(..., description="Invoice description / line items")
    due_date: datetime | None = None
    payment_method: str = Field(default="bank_transfer", description="stripe | bank_transfer | manual")
    currency: str = "usd"


class MarkInvoicePaidRequest(BaseModel):
    """Request to mark an invoice as paid (manual reconciliation)."""

    bank_transfer_reference: str | None = Field(default=None, description="Wire ref / ACH trace number")
    payment_note: str | None = Field(default=None, description="Admin notes about the payment")
    payment_date: datetime | None = Field(default=None, description="When the payment was received")


# --- Billing Breakdown (line-item view) ---


class BillingLineItem(BaseModel):
    """A single line item in the billing breakdown."""

    category: str  # base_fee | seats | llm_usage | storage | free_credit | overage | other
    label: str
    description: str | None = None
    quantity: float = 0.0
    unit: str = ""  # tokens | seats | GB | month | ""
    rate_cents: float | None = None
    rate_display: str | None = None
    included_quantity: float | None = None
    billable_quantity: float = 0.0
    subtotal_cents: float = 0.0
    metadata: dict[str, Any] | None = None


class BillingBreakdownResponse(BaseModel):
    """Billing breakdown for a single workspace and period."""

    workspace_id: str
    workspace_name: str | None = None
    period_start: datetime
    period_end: datetime
    plan_id: str
    plan_name: str
    plan_tier: str
    billing_model: str
    line_items: list[BillingLineItem]
    subtotal_cents: float = 0.0
    credit_cents: float = 0.0
    total_cents: float = 0.0
    previous_period_total_cents: float | None = None
    delta_cents: float | None = None
    delta_pct: float | None = None
    invoices: list[InvoiceResponse] = Field(default_factory=list)
    info_counters: dict[str, Any] = Field(default_factory=dict)
    computation_notes: list[str] = Field(default_factory=list)
    margin: dict[str, float] | None = None  # platform-admin only
    generated_at: datetime


class BillingBreakdownHistoryResponse(BaseModel):
    """Current period breakdown plus history for prior periods."""

    current: BillingBreakdownResponse
    history: list[BillingBreakdownResponse] = Field(default_factory=list)


class PlatformBillingSummaryRow(BaseModel):
    """A row in the cross-workspace platform billing summary."""

    workspace_id: str
    workspace_name: str
    plan_tier: str
    billing_model: str
    period_start: datetime
    period_end: datetime
    total_cents: float
    base_cost_cents: float
    margin_cents: float
    seat_count: int


class PlatformBillingSummaryResponse(BaseModel):
    """Paginated cross-workspace billing summary."""

    rows: list[PlatformBillingSummaryRow]
    page: int
    per_page: int
    total: int


class PlatformBillingTotals(BaseModel):
    """Aggregate platform-wide billing totals."""

    period_start: datetime
    period_end: datetime
    total_revenue_cents: float
    total_base_cost_cents: float
    total_margin_cents: float
    workspace_count: int
    by_plan_tier: dict[str, float]
    by_billing_model: dict[str, float]
    top_workspaces: list[PlatformBillingSummaryRow]
