"""Billing and subscription models for Stripe integration."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from devograph.core.database import Base

if TYPE_CHECKING:
    from devograph.models.developer import Developer


class SubscriptionStatus(str, Enum):
    """Stripe subscription status values."""

    ACTIVE = "active"
    PAST_DUE = "past_due"
    CANCELED = "canceled"
    INCOMPLETE = "incomplete"
    INCOMPLETE_EXPIRED = "incomplete_expired"
    TRIALING = "trialing"
    UNPAID = "unpaid"
    PAUSED = "paused"


class UsageType(str, Enum):
    """Types of usage that can be tracked."""

    LLM_INPUT_TOKENS = "llm_input_tokens"
    LLM_OUTPUT_TOKENS = "llm_output_tokens"
    SYNC_OPERATIONS = "sync_operations"
    API_CALLS = "api_calls"


class CustomerBilling(Base):
    """Stripe customer and billing information for a developer."""

    __tablename__ = "customer_billing"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )

    # Stripe customer info
    stripe_customer_id: Mapped[str | None] = mapped_column(
        String(255),
        unique=True,
        nullable=True,
        index=True,
    )

    # Payment method info (for display only - actual data in Stripe)
    default_payment_method_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    payment_method_type: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )  # card, bank_account, etc.
    payment_method_last4: Mapped[str | None] = mapped_column(
        String(4),
        nullable=True,
    )
    payment_method_brand: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )  # visa, mastercard, etc.

    # Billing address
    billing_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    billing_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    billing_address: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Tax info
    tax_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tax_exempt: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    developer: Mapped["Developer"] = relationship(
        "Developer",
        back_populates="customer_billing",
    )
    subscriptions: Mapped[list["Subscription"]] = relationship(
        "Subscription",
        back_populates="customer",
        cascade="all, delete-orphan",
    )
    usage_records: Mapped[list["UsageRecord"]] = relationship(
        "UsageRecord",
        back_populates="customer",
        cascade="all, delete-orphan",
    )
    invoices: Mapped[list["Invoice"]] = relationship(
        "Invoice",
        back_populates="customer",
        cascade="all, delete-orphan",
    )


class Subscription(Base):
    """Stripe subscription for a customer."""

    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    customer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("customer_billing.id", ondelete="CASCADE"),
        index=True,
    )

    # Stripe subscription info
    stripe_subscription_id: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
    )
    stripe_price_id: Mapped[str] = mapped_column(String(255))
    stripe_product_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Subscription status
    status: Mapped[str] = mapped_column(
        String(50),
        default=SubscriptionStatus.INCOMPLETE.value,
    )

    # Plan info (denormalized for quick access)
    plan_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("plans.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Billing period
    current_period_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Trial info
    trial_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    trial_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Cancellation info
    cancel_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    canceled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Metered billing - Stripe subscription item ID for usage reporting
    stripe_subscription_item_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    customer: Mapped["CustomerBilling"] = relationship(
        "CustomerBilling",
        back_populates="subscriptions",
    )

    @property
    def is_active(self) -> bool:
        """Check if subscription is active."""
        return self.status in (
            SubscriptionStatus.ACTIVE.value,
            SubscriptionStatus.TRIALING.value,
        )


class UsageRecord(Base):
    """Token and API usage tracking for billing."""

    __tablename__ = "usage_records"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    customer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("customer_billing.id", ondelete="CASCADE"),
        index=True,
    )

    # Usage details
    usage_type: Mapped[str] = mapped_column(String(50))  # UsageType value
    provider: Mapped[str] = mapped_column(String(50))  # claude, gemini, ollama
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Token counts
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)

    # Cost calculation (in cents)
    base_cost_cents: Mapped[float] = mapped_column(Float, default=0.0)
    margin_percent: Mapped[float] = mapped_column(Float, default=30.0)
    total_cost_cents: Mapped[float] = mapped_column(Float, default=0.0)

    # Stripe reporting status
    reported_to_stripe: Mapped[bool] = mapped_column(Boolean, default=False)
    stripe_usage_record_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )
    reported_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Billing period this usage belongs to
    billing_period_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    billing_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Request metadata
    request_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    analysis_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
    )

    # Relationships
    customer: Mapped["CustomerBilling"] = relationship(
        "CustomerBilling",
        back_populates="usage_records",
    )


class UsageAggregate(Base):
    """Aggregated usage for billing periods (for faster queries)."""

    __tablename__ = "usage_aggregates"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    customer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("customer_billing.id", ondelete="CASCADE"),
        index=True,
    )

    # Billing period
    period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        index=True,
    )
    period_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        index=True,
    )

    # Aggregated usage by provider
    claude_input_tokens: Mapped[int] = mapped_column(BigInteger, default=0)
    claude_output_tokens: Mapped[int] = mapped_column(BigInteger, default=0)
    gemini_input_tokens: Mapped[int] = mapped_column(BigInteger, default=0)
    gemini_output_tokens: Mapped[int] = mapped_column(BigInteger, default=0)
    ollama_input_tokens: Mapped[int] = mapped_column(BigInteger, default=0)
    ollama_output_tokens: Mapped[int] = mapped_column(BigInteger, default=0)

    # Total cost (in cents)
    total_base_cost_cents: Mapped[float] = mapped_column(Float, default=0.0)
    total_cost_cents: Mapped[float] = mapped_column(Float, default=0.0)

    # Number of requests
    total_requests: Mapped[int] = mapped_column(Integer, default=0)

    # Last updated
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "customer_id",
            "period_start",
            "period_end",
            name="uq_usage_aggregate_period",
        ),
    )


class Invoice(Base):
    """Stripe invoice records."""

    __tablename__ = "invoices"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    customer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("customer_billing.id", ondelete="CASCADE"),
        index=True,
    )

    # Stripe invoice info
    stripe_invoice_id: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
    )
    stripe_invoice_number: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    # Invoice status
    status: Mapped[str] = mapped_column(String(50))  # draft, open, paid, void, uncollectible

    # Amounts (in cents)
    subtotal_cents: Mapped[int] = mapped_column(Integer, default=0)
    tax_cents: Mapped[int] = mapped_column(Integer, default=0)
    total_cents: Mapped[int] = mapped_column(Integer, default=0)
    amount_paid_cents: Mapped[int] = mapped_column(Integer, default=0)
    amount_due_cents: Mapped[int] = mapped_column(Integer, default=0)

    # Currency
    currency: Mapped[str] = mapped_column(String(3), default="usd")

    # Billing period
    period_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # PDF and hosted invoice URL
    invoice_pdf: Mapped[str | None] = mapped_column(Text, nullable=True)
    hosted_invoice_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Payment info
    paid_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    customer: Mapped["CustomerBilling"] = relationship(
        "CustomerBilling",
        back_populates="invoices",
    )
