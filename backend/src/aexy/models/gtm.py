"""GTM (Go-To-Market) models: Provider configs, behavioral events, visitor sessions, identifications, ICP, and lead scores."""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, desc, func, Index
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, validates

from aexy.core.database import Base


# =============================================================================
# ENUMS
# =============================================================================

class GTMProviderSlot(str, Enum):
    """Available provider integration slots."""
    VISITOR_IDENTIFICATION = "visitor_identification"
    EMAIL_VERIFICATION = "email_verification"
    CONTACT_ENRICHMENT = "contact_enrichment"
    LINKEDIN_AUTOMATION = "linkedin_automation"
    SMS = "sms"
    INTENT_DATA = "intent_data"
    SEO_TRACKING = "seo_tracking"
    AD_PLATFORM = "ad_platform"
    ANALYTICS = "analytics"
    DATA_WAREHOUSE = "data_warehouse"


class GTMProviderStatus(str, Enum):
    """Provider configuration status."""
    PENDING_SETUP = "pending_setup"
    ACTIVE = "active"
    ERROR = "error"
    SUSPENDED = "suspended"


class IdentificationStatus(str, Enum):
    """Visitor identification status."""
    ANONYMOUS = "anonymous"
    COMPANY_IDENTIFIED = "company_identified"
    CONTACT_IDENTIFIED = "contact_identified"


class LifecycleStage(str, Enum):
    """Lead lifecycle stages."""
    ANONYMOUS = "anonymous"
    KNOWN = "known"
    LEAD = "lead"
    MQL = "mql"
    SQL = "sql"
    OPPORTUNITY = "opportunity"
    CUSTOMER = "customer"


# =============================================================================
# GTM PROVIDER CONFIGS
# =============================================================================

class GTMProviderConfig(Base):
    """Per-workspace GTM provider credentials and settings."""

    __tablename__ = "gtm_provider_configs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Provider identity
    slot: Mapped[str] = mapped_column(String(50), nullable=False)
    provider_name: Mapped[str] = mapped_column(String(100), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Credentials (encrypted JSONB)
    credentials: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Configuration
    config: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Usage tracking
    usage_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    usage_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    usage_reset_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    monthly_cost_cents: Mapped[int] = mapped_column(Integer, default=0)

    # Status
    status: Mapped[str] = mapped_column(String(20), default=GTMProviderStatus.PENDING_SETUP.value, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_gtm_provider_configs_ws_slot", "workspace_id", "slot"),
    )

    @validates("credentials")
    def validate_credentials(self, _key: str, value: dict) -> dict:
        """Ensure credentials are encrypted before persisting."""
        if not value:
            return value
        # Credentials must be wrapped via encrypt_credentials() before assignment.
        # Raw API keys / secrets should never appear as plain-text dict values.
        for v in value.values():
            if isinstance(v, str) and v.startswith("sk-"):
                raise ValueError(
                    "Credentials must be encrypted before assignment. "
                    "Use encrypt_credentials() from aexy.core.encryption."
                )
        return value


# =============================================================================
# BEHAVIORAL EVENTS
# =============================================================================

class BehavioralEvent(Base):
    """Raw event stream from tracking pixel."""

    __tablename__ = "behavioral_events"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Identity
    anonymous_id: Mapped[str] = mapped_column(String(64), nullable=False)
    record_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    session_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)

    # Event data
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    page_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    page_title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    referrer: Mapped[str | None] = mapped_column(Text, nullable=True)

    # UTM parameters
    utm_source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_medium: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_campaign: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_term: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_content: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Extended properties
    properties: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Client info
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    region: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Timestamps
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_behavioral_events_anonymous", "anonymous_id", desc("occurred_at")),
        Index("ix_behavioral_events_ws_type", "workspace_id", "event_type"),
    )


# =============================================================================
# VISITOR SESSIONS
# =============================================================================

class VisitorSession(Base):
    """Aggregated visitor sessions from behavioral events."""

    __tablename__ = "visitor_sessions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Identity
    anonymous_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    record_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)

    # Session metrics
    page_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    event_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    max_scroll_depth: Mapped[int] = mapped_column(Integer, default=0)

    # First/last touch
    first_page_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_page_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    entry_referrer: Mapped[str | None] = mapped_column(Text, nullable=True)

    # UTM (from first event)
    utm_source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_medium: Mapped[str | None] = mapped_column(String(255), nullable=True)
    utm_campaign: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Client info
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Identification
    identification_status: Mapped[str] = mapped_column(
        String(20), default=IdentificationStatus.ANONYMOUS.value, nullable=False,
    )
    identified_company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    identified_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Timestamps
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    last_activity_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_visitor_sessions_ws_started", "workspace_id", desc("started_at")),
    )


# =============================================================================
# VISITOR IDENTIFICATIONS
# =============================================================================

class VisitorIdentification(Base):
    """IP-to-company identification results from providers like Snitcher."""

    __tablename__ = "visitor_identifications"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    session_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("visitor_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Lookup input
    ip_address: Mapped[str] = mapped_column(INET, nullable=False, index=True)
    provider_name: Mapped[str] = mapped_column(String(100), default="snitcher", nullable=False)

    # Company identification
    company_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    company_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(255), nullable=True)
    employee_range: Mapped[str | None] = mapped_column(String(50), nullable=True)
    revenue_range: Mapped[str | None] = mapped_column(String(50), nullable=True)
    company_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    headquarters_location: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Confidence & metadata
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    raw_response: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # CRM linkage
    matched_record_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)

    # Timestamps
    identified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )


# =============================================================================
# ICP TEMPLATES
# =============================================================================

class ICPTemplate(Base):
    """Ideal Customer Profile definitions with scoring criteria."""

    __tablename__ = "icp_templates"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Template identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Scoring criteria (JSONB with weights)
    criteria: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Target definitions
    target_industries: Mapped[list] = mapped_column(JSONB, default=list)
    target_employee_ranges: Mapped[list] = mapped_column(JSONB, default=list)
    target_revenue_ranges: Mapped[list] = mapped_column(JSONB, default=list)
    target_locations: Mapped[list] = mapped_column(JSONB, default=list)

    # Thresholds
    mql_threshold: Mapped[int] = mapped_column(Integer, default=40, nullable=False)
    sql_threshold: Mapped[int] = mapped_column(Integer, default=70, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )
    created_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )


# =============================================================================
# LEAD SCORES
# =============================================================================

class LeadScore(Base):
    """Persisted lead scoring results."""

    __tablename__ = "lead_scores"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Scored entity
    record_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    icp_template_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("icp_templates.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Score breakdown (0-100 total)
    total_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    firmographic_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    behavioral_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    engagement_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Lifecycle stage
    lifecycle_stage: Mapped[str] = mapped_column(
        String(20), default=LifecycleStage.ANONYMOUS.value, nullable=False,
    )

    # Score history
    score_history: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    scoring_factors: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    last_scored_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )
