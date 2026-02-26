"""GTM Webhook models for outbound event delivery."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


# =============================================================================
# GTM WEBHOOK (outbound subscription)
# =============================================================================

class GTMWebhook(Base):
    """Outbound webhook subscription for GTM events."""

    __tablename__ = "gtm_webhooks"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Webhook identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Target URL
    url: Mapped[str] = mapped_column(String(2000), nullable=False)

    # Events to subscribe to (e.g., ["lead.scored", "sequence.completed", "*"])
    events: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # HMAC-SHA256 secret for signature verification
    secret: Mapped[str] = mapped_column(String(64), nullable=False)

    # Custom headers to include in delivery
    headers: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Delivery stats (denormalized for dashboard)
    total_deliveries: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    successful_deliveries: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_deliveries: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_gtm_webhook_ws_active", "workspace_id", "is_active"),
    )


# =============================================================================
# GTM WEBHOOK DELIVERY (delivery attempt log)
# =============================================================================

class GTMWebhookDelivery(Base):
    """Individual delivery attempt for a GTM webhook."""

    __tablename__ = "gtm_webhook_deliveries"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    webhook_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("gtm_webhooks.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Event details
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Delivery status: pending, success, failed
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)

    # Response
    response_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Retry tracking
    attempt_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    # Timing
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_gtm_webhook_delivery_status", "webhook_id", "status"),
    )


# =============================================================================
# PROVIDER HEALTH METRIC (aggregated per-provider health data)
# =============================================================================

class GTMProviderHealthMetric(Base):
    """Hourly health metrics for GTM provider integrations."""

    __tablename__ = "gtm_provider_health_metrics"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Provider identity
    provider_slot: Mapped[str] = mapped_column(String(50), nullable=False)
    provider_name: Mapped[str] = mapped_column(String(100), nullable=False)

    # Time bucket (hourly)
    bucket_hour: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # Counts
    total_requests: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    successful_requests: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_requests: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Latency (milliseconds)
    avg_latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    p95_latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Error details
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_provider_health_ws_slot_hour", "workspace_id", "provider_slot", "bucket_hour"),
    )
