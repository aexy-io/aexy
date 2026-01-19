"""Email Marketing models for campaigns, templates, tracking, and subscriptions."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.crm import CRMList, CRMRecord
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace
    from aexy.models.email_infrastructure import (
        SendingPool,
        SendingIdentity,
        SendingDomain,
        EmailProvider,
        DedicatedIP,
    )


# =============================================================================
# ENUMS
# =============================================================================

class EmailTemplateType(str, Enum):
    """Types of email templates."""
    CODE = "code"  # Jinja2/Handlebars based
    VISUAL = "visual"  # Drag-drop builder


class EmailTemplateCategory(str, Enum):
    """Categories for email templates."""
    GENERAL = "general"
    MARKETING = "marketing"
    ONBOARDING = "onboarding"
    RELEASE = "release"
    TRANSACTIONAL = "transactional"
    NEWSLETTER = "newsletter"


class CampaignType(str, Enum):
    """Types of email campaigns."""
    ONE_TIME = "one_time"  # Send once to a list
    RECURRING = "recurring"  # Send on schedule
    TRIGGERED = "triggered"  # Send based on event


class CampaignStatus(str, Enum):
    """Status of an email campaign."""
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    SENDING = "sending"
    SENT = "sent"
    PAUSED = "paused"
    CANCELLED = "cancelled"


class RecipientStatus(str, Enum):
    """Status of a campaign recipient."""
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    OPENED = "opened"
    CLICKED = "clicked"
    BOUNCED = "bounced"
    UNSUBSCRIBED = "unsubscribed"
    FAILED = "failed"


class BounceType(str, Enum):
    """Type of email bounce."""
    HARD = "hard"  # Permanent failure (invalid address)
    SOFT = "soft"  # Temporary failure (mailbox full, etc.)


class SubscriberStatus(str, Enum):
    """Global subscriber status."""
    ACTIVE = "active"
    UNSUBSCRIBED = "unsubscribed"
    BOUNCED = "bounced"
    COMPLAINED = "complained"


class UnsubscribeSource(str, Enum):
    """Source of unsubscribe action."""
    LINK = "link"  # One-click unsubscribe link
    PREFERENCE_CENTER = "preference_center"
    API = "api"
    COMPLAINT = "complaint"  # Spam complaint
    BOUNCE = "bounce"  # Hard bounce


class SubscriptionFrequency(str, Enum):
    """Email frequency preferences."""
    IMMEDIATE = "immediate"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


# =============================================================================
# EMAIL TEMPLATES
# =============================================================================

class EmailTemplate(Base):
    """User-defined email templates with variable support."""

    __tablename__ = "email_templates"
    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_email_template_workspace_slug"),
        Index("ix_email_template_workspace_category", "workspace_id", "category"),
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

    # Template identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Template type
    template_type: Mapped[str] = mapped_column(
        String(20),
        default=EmailTemplateType.CODE.value,
        nullable=False,
    )
    category: Mapped[str] = mapped_column(
        String(50),
        default=EmailTemplateCategory.GENERAL.value,
        nullable=False,
        index=True,
    )

    # Email content
    subject_template: Mapped[str] = mapped_column(Text, nullable=False)  # Subject with {{variable}} support
    body_html: Mapped[str] = mapped_column(Text, nullable=False)  # HTML body with Jinja2
    body_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # Plain text fallback
    preview_text: Mapped[str | None] = mapped_column(String(500), nullable=True)  # Email preview text

    # Template variables (JSONB)
    # [{name: "first_name", type: "string", default: "there", required: false}]
    variables: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )

    # Visual builder definition (JSONB) - for visual templates
    visual_definition: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Status and versioning
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)

    # Audit
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
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
    workspace: Mapped["Workspace"] = relationship("Workspace")
    created_by: Mapped["Developer | None"] = relationship("Developer")
    campaigns: Mapped[list["EmailCampaign"]] = relationship(
        "EmailCampaign",
        back_populates="template",
    )


# =============================================================================
# EMAIL CAMPAIGNS
# =============================================================================

class EmailCampaign(Base):
    """Campaign definitions for batch email sending."""

    __tablename__ = "email_campaigns"
    __table_args__ = (
        Index("ix_email_campaign_workspace_status", "workspace_id", "status"),
        Index("ix_email_campaign_scheduled", "scheduled_at"),
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
    template_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Campaign identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Audience targeting
    list_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_lists.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Additional filters beyond list (JSONB)
    # [{"attribute": "tags", "operator": "contains", "value": "vip", "conjunction": "and"}]
    audience_filters: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )

    # Campaign settings
    campaign_type: Mapped[str] = mapped_column(
        String(20),
        default=CampaignType.ONE_TIME.value,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default=CampaignStatus.DRAFT.value,
        nullable=False,
        index=True,
    )

    # Scheduling
    scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    # Send window for optimal timing (JSONB)
    # {"start": "09:00", "end": "17:00", "timezone": "America/New_York"}
    send_window: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Sender info
    from_name: Mapped[str] = mapped_column(String(255), nullable=False)
    from_email: Mapped[str] = mapped_column(String(255), nullable=False)
    reply_to: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Template context overrides (JSONB)
    template_context: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )

    # Multi-domain sending infrastructure
    sending_pool_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sending_pools.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sending_identity_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sending_identities.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Routing configuration (JSONB)
    # {"strategy": "health_based", "preferred_providers": ["ses", "sendgrid"], "fallback_enabled": true}
    routing_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Stats (denormalized for quick access)
    total_recipients: Mapped[int] = mapped_column(Integer, default=0)
    sent_count: Mapped[int] = mapped_column(Integer, default=0)
    delivered_count: Mapped[int] = mapped_column(Integer, default=0)
    open_count: Mapped[int] = mapped_column(Integer, default=0)
    unique_open_count: Mapped[int] = mapped_column(Integer, default=0)
    click_count: Mapped[int] = mapped_column(Integer, default=0)
    unique_click_count: Mapped[int] = mapped_column(Integer, default=0)
    bounce_count: Mapped[int] = mapped_column(Integer, default=0)
    unsubscribe_count: Mapped[int] = mapped_column(Integer, default=0)
    complaint_count: Mapped[int] = mapped_column(Integer, default=0)

    # Timestamps
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
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

    # Audit
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")
    template: Mapped["EmailTemplate | None"] = relationship(
        "EmailTemplate",
        back_populates="campaigns",
    )
    list: Mapped["CRMList | None"] = relationship("CRMList")
    created_by: Mapped["Developer | None"] = relationship("Developer")
    recipients: Mapped[list["CampaignRecipient"]] = relationship(
        "CampaignRecipient",
        back_populates="campaign",
        cascade="all, delete-orphan",
    )
    analytics: Mapped[list["CampaignAnalytics"]] = relationship(
        "CampaignAnalytics",
        back_populates="campaign",
        cascade="all, delete-orphan",
    )
    sending_pool: Mapped["SendingPool | None"] = relationship("SendingPool")
    sending_identity: Mapped["SendingIdentity | None"] = relationship("SendingIdentity")


class CampaignRecipient(Base):
    """Individual recipient status for a campaign."""

    __tablename__ = "campaign_recipients"
    __table_args__ = (
        UniqueConstraint("campaign_id", "email", name="uq_campaign_recipient_email"),
        Index("ix_campaign_recipient_status", "campaign_id", "status"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    campaign_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    record_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    subscriber_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_subscribers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Recipient info
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    recipient_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Personalization context (JSONB)
    context: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )

    # Status tracking
    status: Mapped[str] = mapped_column(
        String(20),
        default=RecipientStatus.PENDING.value,
        nullable=False,
        index=True,
    )
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    first_opened_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    first_clicked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Engagement counts
    open_count: Mapped[int] = mapped_column(Integer, default=0)
    click_count: Mapped[int] = mapped_column(Integer, default=0)

    # Error handling
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    bounce_type: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Tracking IDs
    tracking_pixel_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
    )

    # Provider message ID (SES, SMTP, etc.)
    message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Multi-domain sending tracking
    sent_via_domain_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sending_domains.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sent_via_provider_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_providers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sent_via_ip_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("dedicated_ips.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    campaign: Mapped["EmailCampaign"] = relationship(
        "EmailCampaign",
        back_populates="recipients",
    )
    record: Mapped["CRMRecord | None"] = relationship("CRMRecord")
    subscriber: Mapped["EmailSubscriber | None"] = relationship("EmailSubscriber")
    sent_via_domain: Mapped["SendingDomain | None"] = relationship("SendingDomain")
    sent_via_provider: Mapped["EmailProvider | None"] = relationship("EmailProvider")
    sent_via_ip: Mapped["DedicatedIP | None"] = relationship("DedicatedIP")


# =============================================================================
# TRACKING (Phase 2)
# =============================================================================

class EmailTrackingPixel(Base):
    """Open tracking pixel instances."""

    __tablename__ = "email_tracking_pixels"
    __table_args__ = (
        Index("ix_tracking_pixel_campaign", "campaign_id"),
        Index("ix_tracking_pixel_opened", "opened"),
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
    campaign_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_campaigns.id", ondelete="SET NULL"),
        nullable=True,
    )
    recipient_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("campaign_recipients.id", ondelete="SET NULL"),
        nullable=True,
    )
    record_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Tracking data
    opened: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    open_count: Mapped[int] = mapped_column(Integer, default=0)
    first_opened_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_opened_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # User agent/IP for analytics (first open)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)  # IPv6 max length
    device_type: Mapped[str | None] = mapped_column(String(20), nullable=True)  # desktop, mobile, tablet
    email_client: Mapped[str | None] = mapped_column(String(100), nullable=True)  # gmail, outlook, apple_mail

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class TrackedLink(Base):
    """Click tracking for links in emails."""

    __tablename__ = "tracked_links"
    __table_args__ = (
        Index("ix_tracked_link_campaign", "campaign_id"),
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
    campaign_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_campaigns.id", ondelete="SET NULL"),
        nullable=True,
    )
    template_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_templates.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Link details
    original_url: Mapped[str] = mapped_column(Text, nullable=False)
    link_name: Mapped[str | None] = mapped_column(String(255), nullable=True)  # "CTA Button", "Header Logo"

    # Stats
    click_count: Mapped[int] = mapped_column(Integer, default=0)
    unique_click_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    clicks: Mapped[list["LinkClick"]] = relationship(
        "LinkClick",
        back_populates="link",
        cascade="all, delete-orphan",
    )


class LinkClick(Base):
    """Individual link click events."""

    __tablename__ = "link_clicks"
    __table_args__ = (
        Index("ix_link_click_link", "link_id"),
        Index("ix_link_click_recipient", "recipient_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    link_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("tracked_links.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    recipient_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("campaign_recipients.id", ondelete="SET NULL"),
        nullable=True,
    )
    record_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Click context
    clicked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    device_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    referer: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    link: Mapped["TrackedLink"] = relationship(
        "TrackedLink",
        back_populates="clicks",
    )


class HostedImage(Base):
    """CDN-hosted images with analytics."""

    __tablename__ = "hosted_images"

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

    # File info
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)  # bytes

    # Storage URLs
    storage_url: Mapped[str] = mapped_column(Text, nullable=False)  # S3/CDN backend URL
    public_url: Mapped[str] = mapped_column(Text, nullable=False)  # Proxied tracking URL

    # Stats
    view_count: Mapped[int] = mapped_column(Integer, default=0)

    # Audit
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


# =============================================================================
# ANALYTICS (Phase 3)
# =============================================================================

class CampaignAnalytics(Base):
    """Aggregate metrics for campaigns (time-series)."""

    __tablename__ = "campaign_analytics"
    __table_args__ = (
        UniqueConstraint("campaign_id", "date", "hour", name="uq_campaign_analytics_time"),
        Index("ix_campaign_analytics_date", "date"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    campaign_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    hour: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0-23 for hourly breakdown

    # Counts
    sent: Mapped[int] = mapped_column(Integer, default=0)
    delivered: Mapped[int] = mapped_column(Integer, default=0)
    bounced: Mapped[int] = mapped_column(Integer, default=0)
    opened: Mapped[int] = mapped_column(Integer, default=0)
    unique_opens: Mapped[int] = mapped_column(Integer, default=0)
    clicked: Mapped[int] = mapped_column(Integer, default=0)
    unique_clicks: Mapped[int] = mapped_column(Integer, default=0)
    unsubscribed: Mapped[int] = mapped_column(Integer, default=0)
    complained: Mapped[int] = mapped_column(Integer, default=0)

    # Derived rates (computed on insert/update)
    open_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    click_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    click_to_open_rate: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    campaign: Mapped["EmailCampaign"] = relationship(
        "EmailCampaign",
        back_populates="analytics",
    )


class WorkspaceEmailStats(Base):
    """Workspace-level email statistics (aggregated)."""

    __tablename__ = "workspace_email_stats"
    __table_args__ = (
        UniqueConstraint("workspace_id", "period", "period_start", name="uq_workspace_email_stats_period"),
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
    period: Mapped[str] = mapped_column(String(10), nullable=False)  # daily, weekly, monthly
    period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    # Totals
    campaigns_sent: Mapped[int] = mapped_column(Integer, default=0)
    emails_sent: Mapped[int] = mapped_column(Integer, default=0)
    emails_delivered: Mapped[int] = mapped_column(Integer, default=0)
    total_opens: Mapped[int] = mapped_column(Integer, default=0)
    total_clicks: Mapped[int] = mapped_column(Integer, default=0)
    unsubscribes: Mapped[int] = mapped_column(Integer, default=0)

    # Averages
    avg_open_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_click_rate: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Health metrics
    bounce_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    complaint_rate: Mapped[float | None] = mapped_column(Float, nullable=True)

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
# SUBSCRIPTIONS (Phase 4)
# =============================================================================

class SubscriptionCategory(Base):
    """Email subscription categories."""

    __tablename__ = "subscription_categories"
    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_subscription_category_slug"),
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

    # Category info
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Defaults
    default_subscribed: Mapped[bool] = mapped_column(Boolean, default=True)  # New contacts auto-subscribed?
    required: Mapped[bool] = mapped_column(Boolean, default=False)  # Cannot unsubscribe (transactional)

    # Display
    display_order: Mapped[int] = mapped_column(Integer, default=0)
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

    # Relationships
    preferences: Mapped[list["SubscriptionPreference"]] = relationship(
        "SubscriptionPreference",
        back_populates="category",
        cascade="all, delete-orphan",
    )


class EmailSubscriber(Base):
    """Subscriber records with global preferences."""

    __tablename__ = "email_subscribers"
    __table_args__ = (
        UniqueConstraint("workspace_id", "email_hash", name="uq_email_subscriber_email"),
        Index("ix_email_subscriber_token", "preference_token"),
        Index("ix_email_subscriber_status", "workspace_id", "status"),
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
    record_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Email identity
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    email_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA256 for lookups

    # Global status
    status: Mapped[str] = mapped_column(
        String(20),
        default=SubscriberStatus.ACTIVE.value,
        nullable=False,
    )
    status_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    status_reason: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Verification
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Tokens
    preference_token: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
        default=lambda: str(uuid4()).replace("-", ""),
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
    record: Mapped["CRMRecord | None"] = relationship("CRMRecord")
    preferences: Mapped[list["SubscriptionPreference"]] = relationship(
        "SubscriptionPreference",
        back_populates="subscriber",
        cascade="all, delete-orphan",
    )
    unsubscribe_events: Mapped[list["UnsubscribeEvent"]] = relationship(
        "UnsubscribeEvent",
        back_populates="subscriber",
        cascade="all, delete-orphan",
    )


class SubscriptionPreference(Base):
    """Per-category subscription preferences."""

    __tablename__ = "subscription_preferences"
    __table_args__ = (
        UniqueConstraint("subscriber_id", "category_id", name="uq_subscription_preference"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    subscriber_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_subscribers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("subscription_categories.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Preference settings
    is_subscribed: Mapped[bool] = mapped_column(Boolean, default=True)
    frequency: Mapped[str | None] = mapped_column(String(20), nullable=True)  # immediate, daily, weekly

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    subscriber: Mapped["EmailSubscriber"] = relationship(
        "EmailSubscriber",
        back_populates="preferences",
    )
    category: Mapped["SubscriptionCategory"] = relationship(
        "SubscriptionCategory",
        back_populates="preferences",
    )


class UnsubscribeEvent(Base):
    """Log of unsubscribe events for compliance."""

    __tablename__ = "unsubscribe_events"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    subscriber_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_subscribers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    campaign_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_campaigns.id", ondelete="SET NULL"),
        nullable=True,
    )
    category_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("subscription_categories.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Event details
    unsubscribe_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "all" | "category"
    source: Mapped[str] = mapped_column(String(30), nullable=False)  # link, preference_center, api, complaint

    # Context
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    subscriber: Mapped["EmailSubscriber"] = relationship(
        "EmailSubscriber",
        back_populates="unsubscribe_events",
    )


# =============================================================================
# ONBOARDING MODELS
# =============================================================================

class OnboardingStatus(str, Enum):
    """Status of onboarding progress."""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    SKIPPED = "skipped"


class OnboardingFlow(Base):
    """Onboarding flow definition for a workspace."""

    __tablename__ = "onboarding_flows"
    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_onboarding_flow_slug"),
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

    # Flow info
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Configuration
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_start: Mapped[bool] = mapped_column(Boolean, default=True)  # Start on user creation
    steps: Mapped[list[dict]] = mapped_column(JSONB, default=list)  # Step definitions

    # Timing
    delay_between_steps: Mapped[int] = mapped_column(Integer, default=86400)  # Seconds (default 1 day)

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
    progress_records: Mapped[list["OnboardingProgress"]] = relationship(
        "OnboardingProgress",
        back_populates="flow",
        cascade="all, delete-orphan",
    )


class OnboardingProgress(Base):
    """Tracks a user's progress through an onboarding flow."""

    __tablename__ = "onboarding_progress"
    __table_args__ = (
        UniqueConstraint("flow_id", "user_id", name="uq_onboarding_progress_user"),
        Index("ix_onboarding_progress_status", "flow_id", "status"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    flow_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("onboarding_flows.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    record_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Progress
    status: Mapped[str] = mapped_column(
        String(20),
        default=OnboardingStatus.NOT_STARTED.value,
        nullable=False,
    )
    current_step: Mapped[int] = mapped_column(Integer, default=0)
    completed_steps: Mapped[list[str]] = mapped_column(JSONB, default=list)  # Step IDs
    step_data: Mapped[dict] = mapped_column(JSONB, default=dict)  # Per-step metadata

    # Timing
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_step_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    next_step_scheduled: Mapped[datetime | None] = mapped_column(
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
    flow: Mapped["OnboardingFlow"] = relationship(
        "OnboardingFlow",
        back_populates="progress_records",
    )


class OnboardingMilestone(Base):
    """Milestone definitions for tracking user achievements."""

    __tablename__ = "onboarding_milestones"
    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_onboarding_milestone_slug"),
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

    # Milestone info
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Trigger conditions
    trigger_event: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g., "user.first_login"
    trigger_conditions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # Additional conditions

    # Associated campaign
    campaign_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_campaigns.id", ondelete="SET NULL"),
        nullable=True,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    achievements: Mapped[list["UserMilestoneAchievement"]] = relationship(
        "UserMilestoneAchievement",
        back_populates="milestone",
        cascade="all, delete-orphan",
    )


class UserMilestoneAchievement(Base):
    """Tracks when users achieve milestones."""

    __tablename__ = "user_milestone_achievements"
    __table_args__ = (
        UniqueConstraint("milestone_id", "user_id", name="uq_milestone_achievement"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    milestone_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("onboarding_milestones.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    achieved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # Event context

    # Relationships
    milestone: Mapped["OnboardingMilestone"] = relationship(
        "OnboardingMilestone",
        back_populates="achievements",
    )


# =============================================================================
# VISUAL EMAIL BUILDER MODELS
# =============================================================================

class BlockType(str, Enum):
    """Types of visual email builder blocks."""
    # Layout blocks
    CONTAINER = "container"
    SECTION = "section"
    COLUMN = "column"
    DIVIDER = "divider"
    SPACER = "spacer"
    # Content blocks
    HEADER = "header"
    TEXT = "text"
    IMAGE = "image"
    BUTTON = "button"
    LINK = "link"
    # Rich content blocks
    HERO = "hero"
    FEATURE = "feature"
    CARD = "card"
    TESTIMONIAL = "testimonial"
    PRICING = "pricing"
    FOOTER = "footer"
    SOCIAL = "social"
    # Dynamic blocks
    VARIABLE = "variable"
    CONDITIONAL = "conditional"
    LOOP = "loop"


class VisualTemplateBlock(Base):
    """Reusable visual email builder blocks."""

    __tablename__ = "visual_template_blocks"
    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_visual_block_slug"),
        Index("ix_visual_block_type", "workspace_id", "block_type"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=True,  # Null = global/system block
        index=True,
    )

    # Block info
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    block_type: Mapped[str] = mapped_column(String(30), nullable=False)
    category: Mapped[str] = mapped_column(String(30), default="content")  # layout, content, rich, dynamic

    # Block definition
    schema: Mapped[dict] = mapped_column(JSONB, default=dict)  # JSON Schema for properties
    default_props: Mapped[dict] = mapped_column(JSONB, default=dict)  # Default property values
    html_template: Mapped[str] = mapped_column(Text, nullable=False)  # Jinja2 HTML template
    preview_html: Mapped[str | None] = mapped_column(Text, nullable=True)  # Preview rendering

    # Display
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)  # Icon identifier
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)  # System blocks can't be edited

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class SavedEmailDesign(Base):
    """Saved email designs/drafts for the visual builder."""

    __tablename__ = "saved_email_designs"

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
    template_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("email_templates.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Design info
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Design data
    design_json: Mapped[dict] = mapped_column(JSONB, nullable=False)  # Full design structure
    rendered_html: Mapped[str | None] = mapped_column(Text, nullable=True)  # Last rendered HTML
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Status
    is_draft: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1)

    # User info
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    last_edited_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
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
