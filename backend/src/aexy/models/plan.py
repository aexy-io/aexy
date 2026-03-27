"""Subscription plan model with feature limits."""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from aexy.core.database import Base


class BillingModel(str, Enum):
    """Available billing models."""

    FREE = "free"
    PER_SEAT = "per_seat"
    FLAT_PLUS_USAGE = "flat_plus_usage"
    POSTPAID = "postpaid"


class PlanTier(str, Enum):
    """Available subscription tiers."""

    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"
    FLAT_PLUS_USAGE = "flat_plus_usage"
    POSTPAID = "postpaid"
    CUSTOM = "custom"


class Plan(Base):
    """Subscription plan with feature limits."""

    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    name: Mapped[str] = mapped_column(String(100), unique=True)
    tier: Mapped[str] = mapped_column(String(50), index=True)  # PlanTier value
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Sync limits (-1 means unlimited)
    max_repos: Mapped[int] = mapped_column(Integer, default=5)
    max_commits_per_repo: Mapped[int] = mapped_column(Integer, default=500)
    max_prs_per_repo: Mapped[int] = mapped_column(Integer, default=100)
    sync_history_days: Mapped[int] = mapped_column(Integer, default=90)  # How far back to sync

    # LLM limits
    llm_requests_per_day: Mapped[int] = mapped_column(Integer, default=50)
    llm_requests_per_minute: Mapped[int] = mapped_column(Integer, default=10)
    llm_tokens_per_minute: Mapped[int] = mapped_column(Integer, default=50000)
    llm_provider_access: Mapped[list[str]] = mapped_column(
        ARRAY(String),
        default=["ollama"],
    )  # Which LLM providers are allowed

    # Free token allocation per billing period (monthly)
    # -1 means unlimited free tokens (no overage charges)
    free_llm_tokens_per_month: Mapped[int] = mapped_column(Integer, default=100000)

    # Pay-per-use pricing after free tier (in cents per 1K tokens)
    llm_input_cost_per_1k_cents: Mapped[int] = mapped_column(Integer, default=30)  # $0.30 per 1K
    llm_output_cost_per_1k_cents: Mapped[int] = mapped_column(Integer, default=60)  # $0.60 per 1K

    # Whether overage billing is enabled (if False, usage stops at free tier limit)
    enable_overage_billing: Mapped[bool] = mapped_column(Boolean, default=True)

    # Feature flags
    enable_real_time_sync: Mapped[bool] = mapped_column(Boolean, default=False)
    enable_advanced_analytics: Mapped[bool] = mapped_column(Boolean, default=False)
    enable_exports: Mapped[bool] = mapped_column(Boolean, default=False)
    enable_webhooks: Mapped[bool] = mapped_column(Boolean, default=False)
    enable_team_features: Mapped[bool] = mapped_column(Boolean, default=False)

    # Billing model
    billing_model: Mapped[str] = mapped_column(
        String(50), default=BillingModel.FREE.value
    )  # BillingModel value
    base_fee_monthly_cents: Mapped[int] = mapped_column(Integer, default=0)
    per_seat_price_monthly_cents: Mapped[int] = mapped_column(Integer, default=0)
    min_seats: Mapped[int] = mapped_column(Integer, default=1)
    included_seats: Mapped[int] = mapped_column(Integer, default=0)
    requires_payment_method: Mapped[bool] = mapped_column(Boolean, default=False)
    payment_timing: Mapped[str] = mapped_column(
        String(50), default="prepaid"
    )  # "prepaid" | "postpaid"

    # Pricing (for display - actual billing via Stripe later)
    price_monthly_cents: Mapped[int] = mapped_column(Integer, default=0)
    price_yearly_cents: Mapped[int] = mapped_column(Integer, default=0)

    # Stripe integration
    stripe_product_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stripe_price_id: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Monthly price
    stripe_yearly_price_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships - will be set up via back_populates in developer.py
    developers: Mapped[list["Developer"]] = relationship(
        "Developer",
        back_populates="plan",
    )

    def is_limit_unlimited(self, limit_value: int) -> bool:
        """Check if a limit value represents unlimited."""
        return limit_value == -1

    def can_use_provider(self, provider: str) -> bool:
        """Check if this plan can use the specified LLM provider."""
        return provider in self.llm_provider_access

    def __repr__(self) -> str:
        return f"<Plan {self.name} ({self.tier})>"


# Default plans to seed
DEFAULT_PLANS = [
    {
        "name": "Free",
        "tier": PlanTier.FREE.value,
        "billing_model": BillingModel.FREE.value,
        "description": "All modules free with fair limits — only AI is limited",
        "max_repos": 10,
        "max_commits_per_repo": 1000,
        "max_prs_per_repo": 200,
        "sync_history_days": 90,
        "llm_requests_per_day": 50,
        "llm_requests_per_minute": 5,
        "llm_tokens_per_minute": 20000,
        "llm_provider_access": ["ollama"],
        # Free tier: 50K tokens/month, no overage (stops at limit)
        "free_llm_tokens_per_month": 50000,
        "llm_input_cost_per_1k_cents": 0,
        "llm_output_cost_per_1k_cents": 0,
        "enable_overage_billing": False,
        # All module features enabled — only AI is gated
        "enable_real_time_sync": True,
        "enable_advanced_analytics": True,
        "enable_exports": True,
        "enable_webhooks": True,
        "enable_team_features": True,
        "price_monthly_cents": 0,
        "price_yearly_cents": 0,
        "per_seat_price_monthly_cents": 0,
        "base_fee_monthly_cents": 0,
        "min_seats": 1,
        "included_seats": 10,
        "requires_payment_method": False,
        "payment_timing": "prepaid",
    },
    {
        "name": "Pro",
        "tier": PlanTier.PRO.value,
        "billing_model": BillingModel.PER_SEAT.value,
        "description": "Per-seat plan for professional developers and teams",
        "max_repos": 20,
        "max_commits_per_repo": 5000,
        "max_prs_per_repo": 1000,
        "sync_history_days": 365,
        "llm_requests_per_day": 500,
        "llm_requests_per_minute": 20,
        "llm_tokens_per_minute": 100000,
        "llm_provider_access": ["claude", "gemini", "ollama", "openrouter"],
        # Pro tier: 500K tokens/month included, then pay-per-use
        "free_llm_tokens_per_month": 500000,
        "llm_input_cost_per_1k_cents": 25,   # $0.25 per 1K input tokens
        "llm_output_cost_per_1k_cents": 50,  # $0.50 per 1K output tokens
        "enable_overage_billing": True,
        "enable_real_time_sync": True,
        "enable_advanced_analytics": True,
        "enable_exports": True,
        "enable_webhooks": True,
        "enable_team_features": True,
        "price_monthly_cents": 2900,
        "price_yearly_cents": 29000,  # ~2 months free
        "per_seat_price_monthly_cents": 2900,
        "base_fee_monthly_cents": 0,
        "min_seats": 1,
        "included_seats": 1,
        "requires_payment_method": True,
        "payment_timing": "prepaid",
    },
    {
        "name": "Enterprise",
        "tier": PlanTier.ENTERPRISE.value,
        "billing_model": BillingModel.PER_SEAT.value,
        "description": "Per-seat plan for large teams and organizations",
        "max_repos": -1,  # Unlimited
        "max_commits_per_repo": -1,
        "max_prs_per_repo": -1,
        "sync_history_days": -1,  # All history
        "llm_requests_per_day": -1,
        "llm_requests_per_minute": 60,
        "llm_tokens_per_minute": -1,  # Unlimited
        "llm_provider_access": ["claude", "gemini", "ollama", "openrouter"],
        # Enterprise tier: 2M tokens/month included, discounted overage
        "free_llm_tokens_per_month": 2000000,
        "llm_input_cost_per_1k_cents": 15,   # $0.15 per 1K input tokens (40% discount)
        "llm_output_cost_per_1k_cents": 30,  # $0.30 per 1K output tokens (40% discount)
        "enable_overage_billing": True,
        "enable_real_time_sync": True,
        "enable_advanced_analytics": True,
        "enable_exports": True,
        "enable_webhooks": True,
        "enable_team_features": True,
        "price_monthly_cents": 9900,
        "price_yearly_cents": 99000,
        "per_seat_price_monthly_cents": 9900,
        "base_fee_monthly_cents": 0,
        "min_seats": 5,
        "included_seats": 5,
        "requires_payment_method": True,
        "payment_timing": "prepaid",
    },
    {
        "name": "Flat + Usage",
        "tier": PlanTier.FLAT_PLUS_USAGE.value,
        "billing_model": BillingModel.FLAT_PLUS_USAGE.value,
        "description": "Flat monthly fee plus pay-per-use AI",
        "max_repos": -1,
        "max_commits_per_repo": -1,
        "max_prs_per_repo": -1,
        "sync_history_days": -1,
        "llm_requests_per_day": -1,
        "llm_requests_per_minute": 30,
        "llm_tokens_per_minute": 200000,
        "llm_provider_access": ["claude", "gemini", "ollama", "openrouter"],
        "free_llm_tokens_per_month": 0,  # No free tokens — all metered
        "llm_input_cost_per_1k_cents": 20,
        "llm_output_cost_per_1k_cents": 40,
        "enable_overage_billing": True,
        "enable_real_time_sync": True,
        "enable_advanced_analytics": True,
        "enable_exports": True,
        "enable_webhooks": True,
        "enable_team_features": True,
        "price_monthly_cents": 4900,
        "price_yearly_cents": 49000,
        "per_seat_price_monthly_cents": 0,
        "base_fee_monthly_cents": 4900,  # $49/mo flat base
        "min_seats": 1,
        "included_seats": -1,  # Unlimited seats included
        "requires_payment_method": True,
        "payment_timing": "prepaid",
    },
    {
        "name": "Postpaid",
        "tier": PlanTier.POSTPAID.value,
        "billing_model": BillingModel.POSTPAID.value,
        "description": "Pay after use — billed at end of billing period",
        "max_repos": -1,
        "max_commits_per_repo": -1,
        "max_prs_per_repo": -1,
        "sync_history_days": -1,
        "llm_requests_per_day": -1,
        "llm_requests_per_minute": 30,
        "llm_tokens_per_minute": 200000,
        "llm_provider_access": ["claude", "gemini", "ollama", "openrouter"],
        "free_llm_tokens_per_month": 0,
        "llm_input_cost_per_1k_cents": 20,
        "llm_output_cost_per_1k_cents": 40,
        "enable_overage_billing": True,
        "enable_real_time_sync": True,
        "enable_advanced_analytics": True,
        "enable_exports": True,
        "enable_webhooks": True,
        "enable_team_features": True,
        "price_monthly_cents": 0,  # No upfront cost
        "price_yearly_cents": 0,
        "per_seat_price_monthly_cents": 1900,  # $19/seat/mo billed at end
        "base_fee_monthly_cents": 0,
        "min_seats": 1,
        "included_seats": 0,
        "requires_payment_method": True,
        "payment_timing": "postpaid",
    },
]


# Import for type hints - avoid circular import
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from aexy.models.developer import Developer
