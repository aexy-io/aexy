"""Subscription plan model with feature limits."""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from aexy.core.database import Base


class PlanTier(str, Enum):
    """Available subscription tiers."""

    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


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
    max_repos: Mapped[int] = mapped_column(Integer, default=3)
    max_commits_per_repo: Mapped[int] = mapped_column(Integer, default=500)
    max_prs_per_repo: Mapped[int] = mapped_column(Integer, default=100)
    sync_history_days: Mapped[int] = mapped_column(Integer, default=90)  # How far back to sync

    # LLM limits
    llm_requests_per_day: Mapped[int] = mapped_column(Integer, default=50)
    llm_provider_access: Mapped[list[str]] = mapped_column(
        ARRAY(String),
        default=["ollama"],
    )  # Which LLM providers are allowed

    # Feature flags
    enable_real_time_sync: Mapped[bool] = mapped_column(Boolean, default=False)
    enable_advanced_analytics: Mapped[bool] = mapped_column(Boolean, default=False)
    enable_exports: Mapped[bool] = mapped_column(Boolean, default=False)
    enable_webhooks: Mapped[bool] = mapped_column(Boolean, default=False)
    enable_team_features: Mapped[bool] = mapped_column(Boolean, default=False)

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
        "description": "Perfect for trying out Aexy",
        "max_repos": 3,
        "max_commits_per_repo": 500,
        "max_prs_per_repo": 100,
        "sync_history_days": 90,
        "llm_requests_per_day": 50,
        "llm_provider_access": ["ollama"],
        "enable_real_time_sync": False,
        "enable_advanced_analytics": False,
        "enable_exports": False,
        "enable_webhooks": False,
        "enable_team_features": False,
        "price_monthly_cents": 0,
        "price_yearly_cents": 0,
    },
    {
        "name": "Pro",
        "tier": PlanTier.PRO.value,
        "description": "For professional developers and small teams",
        "max_repos": 20,
        "max_commits_per_repo": 5000,
        "max_prs_per_repo": 1000,
        "sync_history_days": 365,
        "llm_requests_per_day": 500,
        "llm_provider_access": ["claude", "gemini", "ollama"],
        "enable_real_time_sync": True,
        "enable_advanced_analytics": True,
        "enable_exports": True,
        "enable_webhooks": True,
        "enable_team_features": False,
        "price_monthly_cents": 2900,
        "price_yearly_cents": 29000,  # ~2 months free
    },
    {
        "name": "Enterprise",
        "tier": PlanTier.ENTERPRISE.value,
        "description": "For large teams and organizations",
        "max_repos": -1,  # Unlimited
        "max_commits_per_repo": -1,
        "max_prs_per_repo": -1,
        "sync_history_days": -1,  # All history
        "llm_requests_per_day": -1,
        "llm_provider_access": ["claude", "gemini", "ollama"],
        "enable_real_time_sync": True,
        "enable_advanced_analytics": True,
        "enable_exports": True,
        "enable_webhooks": True,
        "enable_team_features": True,
        "price_monthly_cents": 9900,
        "price_yearly_cents": 99000,
    },
]


# Import for type hints - avoid circular import
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from aexy.models.developer import Developer
