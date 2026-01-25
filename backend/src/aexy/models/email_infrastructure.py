"""Email Infrastructure models for multi-domain sending, warming, and reputation management."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.workspace import Workspace


# =============================================================================
# ENUMS
# =============================================================================

class EmailProviderType(str, Enum):
    """Supported email provider types."""
    SES = "ses"  # Amazon SES
    SENDGRID = "sendgrid"
    MAILGUN = "mailgun"
    POSTMARK = "postmark"
    SMTP = "smtp"  # Generic SMTP


class ProviderStatus(str, Enum):
    """Status of an email provider."""
    ACTIVE = "active"
    PAUSED = "paused"
    ERROR = "error"
    SETUP = "setup"


class DomainStatus(str, Enum):
    """Status of a sending domain."""
    PENDING = "pending"  # DNS not verified
    VERIFYING = "verifying"  # Checking DNS
    VERIFIED = "verified"  # DNS records confirmed
    FAILED = "failed"  # Verification failed
    PAUSED = "paused"  # Manually paused
    WARMING = "warming"  # In warming phase
    ACTIVE = "active"  # Ready for full sending


class WarmingStatus(str, Enum):
    """Warming status for domain/IP."""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


class WarmingScheduleType(str, Enum):
    """Pre-defined warming schedule types."""
    CONSERVATIVE = "conservative"  # 21 days
    MODERATE = "moderate"  # 14 days
    AGGRESSIVE = "aggressive"  # 7 days
    CUSTOM = "custom"


class DomainHealthStatus(str, Enum):
    """Domain health status."""
    EXCELLENT = "excellent"  # 90-100 score
    GOOD = "good"  # 70-89 score
    FAIR = "fair"  # 50-69 score
    POOR = "poor"  # 30-49 score
    CRITICAL = "critical"  # 0-29 score


class EventType(str, Enum):
    """Email event types from providers."""
    SEND = "send"
    DELIVERY = "delivery"
    BOUNCE = "bounce"
    COMPLAINT = "complaint"
    REJECT = "reject"
    OPEN = "open"
    CLICK = "click"
    UNSUBSCRIBE = "unsubscribe"
    RENDERING_FAILURE = "rendering_failure"
    DELIVERY_DELAY = "delivery_delay"


# =============================================================================
# EMAIL PROVIDERS
# =============================================================================

class EmailProvider(Base):
    """Email service provider configuration."""

    __tablename__ = "email_providers"
    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_email_provider_name"),
        Index("ix_email_provider_status", "workspace_id", "status"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Provider identity
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    provider_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Status
    status: Mapped[str] = mapped_column(
        String(20),
        default=ProviderStatus.SETUP.value,
        nullable=False,
    )

    # Credentials (encrypted JSONB)
    # SES: {region, access_key_id, secret_access_key, configuration_set}
    # SendGrid: {api_key}
    # Mailgun: {api_key, domain, region}
    # Postmark: {server_token}
    # SMTP: {host, port, username, password, use_tls}
    credentials: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )

    # Settings
    # {webhook_signing_key, sandbox_mode, tracking_enabled}
    settings: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )

    # Rate limits
    max_sends_per_second: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_sends_per_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    current_daily_sends: Mapped[int] = mapped_column(Integer, default=0)
    daily_sends_reset_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Priority for routing (lower = higher priority)
    priority: Mapped[int] = mapped_column(Integer, default=100)

    # Is this the default provider?
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    # Last health check
    last_check_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_check_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Audit
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
    workspace: Mapped["Workspace"] = relationship("Workspace")
    domains: Mapped[list["SendingDomain"]] = relationship(
        "SendingDomain",
        back_populates="provider",
        cascade="all, delete-orphan",
    )


# =============================================================================
# SENDING DOMAINS
# =============================================================================

class SendingDomain(Base):
    """Verified sending domain with DNS records."""

    __tablename__ = "sending_domains"
    __table_args__ = (
        UniqueConstraint("workspace_id", "domain", name="uq_sending_domain"),
        Index("ix_sending_domain_status", "workspace_id", "status"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_providers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Domain identity
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    subdomain: Mapped[str | None] = mapped_column(String(100), nullable=True)  # e.g., "mail" for mail.example.com

    # Status
    status: Mapped[str] = mapped_column(
        String(20),
        default=DomainStatus.PENDING.value,
        nullable=False,
    )

    # DNS records (JSONB)
    # {
    #   spf: {record: "v=spf1 include:amazonses.com ~all", verified: true},
    #   dkim: [{selector: "s1", record: "...", verified: true}],
    #   dmarc: {record: "v=DMARC1; p=quarantine;", verified: true},
    #   return_path: {record: "...", verified: true}
    # }
    dns_records: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    dns_last_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Verification
    verification_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Warming
    warming_status: Mapped[str] = mapped_column(
        String(20),
        default=WarmingStatus.NOT_STARTED.value,
        nullable=False,
    )
    warming_schedule_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("warming_schedules.id", ondelete="SET NULL"),
        nullable=True,
    )
    warming_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    warming_day: Mapped[int] = mapped_column(Integer, default=0)  # Current warming day

    # Daily sending limits (from warming or manual)
    daily_limit: Mapped[int] = mapped_column(Integer, default=50)  # Current daily limit
    daily_sent: Mapped[int] = mapped_column(Integer, default=0)  # Sent today
    daily_reset_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Default from address settings
    default_from_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    default_reply_to: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Health
    health_score: Mapped[int] = mapped_column(Integer, default=100)  # 0-100
    health_status: Mapped[str] = mapped_column(
        String(20),
        default=DomainHealthStatus.EXCELLENT.value,
        nullable=False,
    )

    # Is this the default domain for the workspace?
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    # Audit
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
    workspace: Mapped["Workspace"] = relationship("Workspace")
    provider: Mapped["EmailProvider | None"] = relationship(
        "EmailProvider",
        back_populates="domains",
    )
    warming_schedule: Mapped["WarmingSchedule | None"] = relationship("WarmingSchedule")
    identities: Mapped[list["SendingIdentity"]] = relationship(
        "SendingIdentity",
        back_populates="domain",
        cascade="all, delete-orphan",
    )
    health_history: Mapped[list["DomainHealth"]] = relationship(
        "DomainHealth",
        back_populates="domain",
        cascade="all, delete-orphan",
    )
    warming_progress: Mapped[list["WarmingProgress"]] = relationship(
        "WarmingProgress",
        back_populates="domain",
        cascade="all, delete-orphan",
    )
    isp_metrics: Mapped[list["ISPMetrics"]] = relationship(
        "ISPMetrics",
        back_populates="domain",
        cascade="all, delete-orphan",
    )


# =============================================================================
# SENDING IDENTITIES
# =============================================================================

class SendingIdentity(Base):
    """From addresses within a domain."""

    __tablename__ = "sending_identities"
    __table_args__ = (
        UniqueConstraint("domain_id", "email", name="uq_sending_identity_email"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    domain_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sending_domains.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Identity info
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    reply_to: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Usage
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    # Stats
    total_sent: Mapped[int] = mapped_column(Integer, default=0)
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Audit
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
    workspace: Mapped["Workspace"] = relationship("Workspace")
    domain: Mapped["SendingDomain"] = relationship(
        "SendingDomain",
        back_populates="identities",
    )


# =============================================================================
# DEDICATED IPs
# =============================================================================

class DedicatedIP(Base):
    """Dedicated IP address for sending."""

    __tablename__ = "dedicated_ips"
    __table_args__ = (
        UniqueConstraint("workspace_id", "ip_address", name="uq_dedicated_ip"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_providers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # IP info
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False)  # IPv4 or IPv6
    hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)  # PTR record

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Warming
    warming_status: Mapped[str] = mapped_column(
        String(20),
        default=WarmingStatus.NOT_STARTED.value,
        nullable=False,
    )
    warming_schedule_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("warming_schedules.id", ondelete="SET NULL"),
        nullable=True,
    )
    warming_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    warming_day: Mapped[int] = mapped_column(Integer, default=0)

    # Daily limits
    daily_limit: Mapped[int] = mapped_column(Integer, default=50)
    daily_sent: Mapped[int] = mapped_column(Integer, default=0)
    daily_reset_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Health
    health_score: Mapped[int] = mapped_column(Integer, default=100)
    health_status: Mapped[str] = mapped_column(
        String(20),
        default=DomainHealthStatus.EXCELLENT.value,
        nullable=False,
    )

    # Blacklist status (JSONB)
    # [{list_name: "spamhaus", listed: false, last_checked: "..."}]
    blacklist_status: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )
    last_blacklist_check_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Audit
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
    workspace: Mapped["Workspace"] = relationship("Workspace")
    provider: Mapped["EmailProvider"] = relationship("EmailProvider")
    warming_schedule: Mapped["WarmingSchedule | None"] = relationship("WarmingSchedule")


# =============================================================================
# WARMING SCHEDULES
# =============================================================================

# Default warming schedules
CONSERVATIVE_SCHEDULE = [
    {"day": 1, "volume": 50},
    {"day": 2, "volume": 100},
    {"day": 3, "volume": 200},
    {"day": 4, "volume": 350},
    {"day": 5, "volume": 500},
    {"day": 6, "volume": 750},
    {"day": 7, "volume": 1000},
    {"day": 8, "volume": 1500},
    {"day": 9, "volume": 2500},
    {"day": 10, "volume": 4000},
    {"day": 11, "volume": 6000},
    {"day": 12, "volume": 8500},
    {"day": 13, "volume": 12000},
    {"day": 14, "volume": 15000},
    {"day": 15, "volume": 20000},
    {"day": 16, "volume": 30000},
    {"day": 17, "volume": 45000},
    {"day": 18, "volume": 60000},
    {"day": 19, "volume": 75000},
    {"day": 20, "volume": 90000},
    {"day": 21, "volume": 100000},
]

MODERATE_SCHEDULE = [
    {"day": 1, "volume": 100},
    {"day": 2, "volume": 250},
    {"day": 3, "volume": 500},
    {"day": 4, "volume": 1000},
    {"day": 5, "volume": 2000},
    {"day": 6, "volume": 4000},
    {"day": 7, "volume": 7500},
    {"day": 8, "volume": 12000},
    {"day": 9, "volume": 20000},
    {"day": 10, "volume": 35000},
    {"day": 11, "volume": 55000},
    {"day": 12, "volume": 75000},
    {"day": 13, "volume": 90000},
    {"day": 14, "volume": 100000},
]

AGGRESSIVE_SCHEDULE = [
    {"day": 1, "volume": 200},
    {"day": 2, "volume": 500},
    {"day": 3, "volume": 2000},
    {"day": 4, "volume": 7500},
    {"day": 5, "volume": 25000},
    {"day": 6, "volume": 60000},
    {"day": 7, "volume": 100000},
]


class WarmingSchedule(Base):
    """Warming schedule definitions."""

    __tablename__ = "warming_schedules"
    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_warming_schedule_name"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=True,  # NULL for system schedules
        index=True,
    )

    # Schedule identity
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    schedule_type: Mapped[str] = mapped_column(
        String(20),
        default=WarmingScheduleType.CUSTOM.value,
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Is this a system default schedule?
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)

    # Schedule steps (JSONB)
    # [{"day": 1, "volume": 50}, {"day": 2, "volume": 100}, ...]
    steps: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )

    # Safety thresholds
    max_bounce_rate: Mapped[float] = mapped_column(Float, default=0.05)  # 5%
    max_complaint_rate: Mapped[float] = mapped_column(Float, default=0.001)  # 0.1%
    min_delivery_rate: Mapped[float] = mapped_column(Float, default=0.90)  # 90%

    # Auto-adjust settings
    auto_pause_on_threshold: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_adjust_volume: Mapped[bool] = mapped_column(Boolean, default=True)  # AI-driven adjustments

    # Audit
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


# =============================================================================
# WARMING PROGRESS
# =============================================================================

class WarmingProgress(Base):
    """Daily warming progress and metrics."""

    __tablename__ = "warming_progress"
    __table_args__ = (
        UniqueConstraint("domain_id", "day_number", name="uq_warming_progress_day"),
        Index("ix_warming_progress_date", "date"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    domain_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sending_domains.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dedicated_ip_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("dedicated_ips.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Progress tracking
    day_number: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    # Target vs actual
    target_volume: Mapped[int] = mapped_column(Integer, nullable=False)
    actual_volume: Mapped[int] = mapped_column(Integer, default=0)

    # Metrics
    sent: Mapped[int] = mapped_column(Integer, default=0)
    delivered: Mapped[int] = mapped_column(Integer, default=0)
    bounced: Mapped[int] = mapped_column(Integer, default=0)
    complaints: Mapped[int] = mapped_column(Integer, default=0)

    # Rates
    delivery_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    bounce_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    complaint_rate: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Status
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    threshold_exceeded: Mapped[bool] = mapped_column(Boolean, default=False)

    # AI recommendations (JSONB)
    # {action: "pause|continue|reduce", reason: "...", suggested_volume: 500}
    ai_recommendation: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

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
    domain: Mapped["SendingDomain"] = relationship(
        "SendingDomain",
        back_populates="warming_progress",
    )
    dedicated_ip: Mapped["DedicatedIP | None"] = relationship("DedicatedIP")


# =============================================================================
# DOMAIN HEALTH
# =============================================================================

class DomainHealth(Base):
    """Daily domain health metrics."""

    __tablename__ = "domain_health"
    __table_args__ = (
        UniqueConstraint("domain_id", "date", name="uq_domain_health_date"),
        Index("ix_domain_health_date", "date"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    domain_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sending_domains.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    # Volume
    total_sent: Mapped[int] = mapped_column(Integer, default=0)
    total_delivered: Mapped[int] = mapped_column(Integer, default=0)
    total_bounced: Mapped[int] = mapped_column(Integer, default=0)
    hard_bounces: Mapped[int] = mapped_column(Integer, default=0)
    soft_bounces: Mapped[int] = mapped_column(Integer, default=0)
    complaints: Mapped[int] = mapped_column(Integer, default=0)
    rejects: Mapped[int] = mapped_column(Integer, default=0)

    # Engagement (from tracking)
    opens: Mapped[int] = mapped_column(Integer, default=0)
    unique_opens: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    unique_clicks: Mapped[int] = mapped_column(Integer, default=0)
    unsubscribes: Mapped[int] = mapped_column(Integer, default=0)

    # Rates
    delivery_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    bounce_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    complaint_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    open_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    click_rate: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Health score (0-100)
    health_score: Mapped[int] = mapped_column(Integer, default=100)
    health_status: Mapped[str] = mapped_column(
        String(20),
        default=DomainHealthStatus.EXCELLENT.value,
        nullable=False,
    )

    # Factors breakdown (JSONB)
    # {bounce_factor: 95, complaint_factor: 100, engagement_factor: 85}
    score_factors: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    domain: Mapped["SendingDomain"] = relationship(
        "SendingDomain",
        back_populates="health_history",
    )


# =============================================================================
# ISP METRICS
# =============================================================================

# ISP domain mappings
ISP_DOMAINS = {
    "gmail": ["gmail.com", "googlemail.com"],
    "outlook": ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    "yahoo": ["yahoo.com", "ymail.com", "yahoo.co.uk", "yahoo.ca"],
    "icloud": ["icloud.com", "me.com", "mac.com"],
    "aol": ["aol.com"],
    "protonmail": ["protonmail.com", "proton.me"],
}


class ISPMetrics(Base):
    """Per-ISP deliverability metrics."""

    __tablename__ = "isp_metrics"
    __table_args__ = (
        UniqueConstraint("domain_id", "isp", "date", name="uq_isp_metrics_date"),
        Index("ix_isp_metrics_isp", "domain_id", "isp"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    domain_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sending_domains.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    isp: Mapped[str] = mapped_column(String(50), nullable=False)  # gmail, outlook, yahoo, etc.
    date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    # Volume
    sent: Mapped[int] = mapped_column(Integer, default=0)
    delivered: Mapped[int] = mapped_column(Integer, default=0)
    bounced: Mapped[int] = mapped_column(Integer, default=0)
    complaints: Mapped[int] = mapped_column(Integer, default=0)

    # Engagement
    opens: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)

    # Rates
    delivery_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    bounce_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    complaint_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    open_rate: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Health score for this ISP (0-100)
    health_score: Mapped[int] = mapped_column(Integer, default=100)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    domain: Mapped["SendingDomain"] = relationship(
        "SendingDomain",
        back_populates="isp_metrics",
    )


# =============================================================================
# SENDING POOLS
# =============================================================================

class SendingPool(Base):
    """Pool of domains for routing and load balancing."""

    __tablename__ = "sending_pools"
    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_sending_pool_name"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Pool identity
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    # Routing strategy
    # round_robin: Rotate through domains equally
    # weighted: Use weights from pool members
    # health_based: Prefer healthier domains
    # failover: Use primary, failover to others on limit
    routing_strategy: Mapped[str] = mapped_column(String(20), default="health_based")

    # Settings (JSONB)
    # {prefer_warming_complete: true, min_health_score: 50}
    settings: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )

    # Audit
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
    workspace: Mapped["Workspace"] = relationship("Workspace")
    members: Mapped[list["SendingPoolMember"]] = relationship(
        "SendingPoolMember",
        back_populates="pool",
        cascade="all, delete-orphan",
    )


class SendingPoolMember(Base):
    """Domain membership in a sending pool."""

    __tablename__ = "sending_pool_members"
    __table_args__ = (
        UniqueConstraint("pool_id", "domain_id", name="uq_pool_member"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    pool_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sending_pools.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    domain_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sending_domains.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Weighting (for weighted routing)
    weight: Mapped[int] = mapped_column(Integer, default=100)

    # Priority (lower = higher priority for failover)
    priority: Mapped[int] = mapped_column(Integer, default=100)

    # Is this domain active in the pool?
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    pool: Mapped["SendingPool"] = relationship(
        "SendingPool",
        back_populates="members",
    )
    domain: Mapped["SendingDomain"] = relationship("SendingDomain")


# =============================================================================
# PROVIDER EVENT LOG
# =============================================================================

class ProviderEventLog(Base):
    """Log of webhook events from email providers."""

    __tablename__ = "provider_event_logs"
    __table_args__ = (
        Index("ix_provider_event_message", "message_id"),
        Index("ix_provider_event_type", "event_type"),
        Index("ix_provider_event_domain", "domain_id"),
        Index("ix_provider_event_created", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_providers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    domain_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sending_domains.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Event info
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)  # delivery, bounce, complaint, etc.
    message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Provider message ID
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Bounce/complaint details
    bounce_type: Mapped[str | None] = mapped_column(String(10), nullable=True)  # hard, soft
    bounce_subtype: Mapped[str | None] = mapped_column(String(50), nullable=True)  # undetermined, general, suppressed
    diagnostic_code: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Raw event payload (JSONB)
    raw_payload: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )

    # Processing
    processed: Mapped[bool] = mapped_column(Boolean, default=False)
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Timestamp from provider
    event_timestamp: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")
    provider: Mapped["EmailProvider | None"] = relationship("EmailProvider")
    domain: Mapped["SendingDomain | None"] = relationship("SendingDomain")
