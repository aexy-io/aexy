"""Email Infrastructure Pydantic schemas for multi-domain sending, warming, and reputation."""

from datetime import datetime
from typing import Literal, Any
from pydantic import BaseModel, ConfigDict, Field, EmailStr


# =============================================================================
# TYPE LITERALS
# =============================================================================

EmailProviderType = Literal["ses", "sendgrid", "mailgun", "postmark", "smtp"]
ProviderStatus = Literal["active", "paused", "error", "setup"]
DomainStatus = Literal["pending", "verifying", "verified", "failed", "paused", "warming", "active"]
WarmingStatus = Literal["not_started", "in_progress", "paused", "completed", "failed"]
WarmingScheduleType = Literal["conservative", "moderate", "aggressive", "custom"]
DomainHealthStatus = Literal["excellent", "good", "fair", "poor", "critical"]
EventType = Literal[
    "send", "delivery", "bounce", "complaint", "reject",
    "open", "click", "unsubscribe", "rendering_failure", "delivery_delay"
]
RoutingStrategy = Literal["round_robin", "weighted", "health_based", "failover"]


# =============================================================================
# EMAIL PROVIDER SCHEMAS
# =============================================================================

class SESCredentials(BaseModel):
    """AWS SES credentials."""
    region: str = Field(..., min_length=1)
    access_key_id: str = Field(..., min_length=1)
    secret_access_key: str = Field(..., min_length=1)
    configuration_set: str | None = None


class SendGridCredentials(BaseModel):
    """SendGrid credentials."""
    api_key: str = Field(..., min_length=1)


class MailgunCredentials(BaseModel):
    """Mailgun credentials."""
    api_key: str = Field(..., min_length=1)
    domain: str = Field(..., min_length=1)
    region: Literal["us", "eu"] = "us"


class PostmarkCredentials(BaseModel):
    """Postmark credentials."""
    server_token: str = Field(..., min_length=1)


class SMTPCredentials(BaseModel):
    """Generic SMTP credentials."""
    host: str = Field(..., min_length=1)
    port: int = Field(..., ge=1, le=65535)
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)
    use_tls: bool = True


class EmailProviderCreate(BaseModel):
    """Schema for creating an email provider."""
    name: str = Field(..., min_length=1, max_length=100)
    provider_type: EmailProviderType
    description: str | None = None
    credentials: dict = Field(default_factory=dict)  # Can be configured later
    settings: dict = Field(default_factory=dict)
    max_sends_per_second: int | None = Field(default=None, ge=1)
    max_sends_per_day: int | None = Field(default=None, ge=1)
    priority: int = Field(default=100, ge=1)
    is_default: bool = False


class EmailProviderUpdate(BaseModel):
    """Schema for updating an email provider."""
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    credentials: dict | None = None
    settings: dict | None = None
    max_sends_per_second: int | None = Field(default=None, ge=1)
    max_sends_per_day: int | None = Field(default=None, ge=1)
    priority: int | None = Field(default=None, ge=1)
    is_default: bool | None = None
    status: ProviderStatus | None = None


class EmailProviderResponse(BaseModel):
    """Schema for email provider response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    provider_type: str
    description: str | None
    status: str
    settings: dict
    max_sends_per_second: int | None
    max_sends_per_day: int | None
    current_daily_sends: int
    daily_sends_reset_at: datetime | None
    priority: int
    is_default: bool
    last_check_at: datetime | None
    last_check_status: str | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime
    # Note: credentials are intentionally omitted for security


class EmailProviderListResponse(BaseModel):
    """Schema for listing email providers."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    provider_type: str
    status: str
    is_default: bool
    priority: int
    current_daily_sends: int
    max_sends_per_day: int | None
    last_check_status: str | None
    created_at: datetime


class ProviderTestRequest(BaseModel):
    """Schema for testing provider connection."""
    to_email: EmailStr


class ProviderTestResponse(BaseModel):
    """Schema for provider test response."""
    success: bool
    message: str
    message_id: str | None = None


# =============================================================================
# SENDING DOMAIN SCHEMAS
# =============================================================================

class DNSRecord(BaseModel):
    """DNS record verification status."""
    record_type: str  # spf, dkim, dmarc, return_path
    name: str
    value: str
    verified: bool
    last_checked_at: datetime | None = None


class DNSRecordsStatus(BaseModel):
    """Complete DNS verification status."""
    spf: DNSRecord | None = None
    dkim: list[DNSRecord] = Field(default_factory=list)
    dmarc: DNSRecord | None = None
    return_path: DNSRecord | None = None
    all_verified: bool = False


class SendingDomainCreate(BaseModel):
    """Schema for creating a sending domain."""
    domain: str = Field(..., min_length=1, max_length=255)
    subdomain: str | None = Field(default=None, max_length=100)
    provider_id: str | None = None
    default_from_name: str | None = Field(default=None, max_length=255)
    default_reply_to: EmailStr | None = None
    is_default: bool = False


class SendingDomainUpdate(BaseModel):
    """Schema for updating a sending domain."""
    provider_id: str | None = None
    default_from_name: str | None = Field(default=None, max_length=255)
    default_reply_to: EmailStr | None = None
    is_default: bool | None = None
    daily_limit: int | None = Field(default=None, ge=1)


class SendingDomainResponse(BaseModel):
    """Schema for sending domain response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    provider_id: str
    domain: str
    subdomain: str | None
    status: str
    dns_records: dict
    dns_last_checked_at: datetime | None
    verified_at: datetime | None
    warming_status: str
    warming_schedule_id: str | None
    warming_started_at: datetime | None
    warming_day: int
    daily_limit: int
    daily_sent: int
    daily_reset_at: datetime | None
    default_from_name: str | None
    default_reply_to: str | None
    health_score: int
    health_status: str
    is_default: bool
    created_at: datetime
    updated_at: datetime


class SendingDomainListResponse(BaseModel):
    """Schema for listing sending domains."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    domain: str
    subdomain: str | None
    status: str
    dns_records: dict
    verification_token: str | None
    verified_at: datetime | None
    warming_status: str
    warming_day: int
    daily_limit: int
    daily_sent: int
    health_score: int
    health_status: str
    is_default: bool
    created_at: datetime


class DomainVerifyResponse(BaseModel):
    """Schema for domain verification response."""
    domain_id: str
    status: str
    dns_records: DNSRecordsStatus
    required_records: list[dict]  # Records user needs to add


class StartWarmingRequest(BaseModel):
    """Schema for starting domain warming."""
    schedule_id: str | None = None
    schedule_type: WarmingScheduleType = "moderate"


class WarmingStatusResponse(BaseModel):
    """Schema for warming status response."""
    domain_id: str
    warming_status: str
    warming_day: int
    total_days: int
    current_daily_limit: int
    daily_sent: int
    started_at: datetime | None
    schedule_type: str | None
    progress_percentage: float
    next_day_limit: int | None
    health_score: int
    recent_metrics: dict  # Last 7 days summary


# =============================================================================
# SENDING IDENTITY SCHEMAS
# =============================================================================

class SendingIdentityCreate(BaseModel):
    """Schema for creating a sending identity."""
    domain_id: str
    email: EmailStr
    display_name: str = Field(..., min_length=1, max_length=255)
    reply_to: EmailStr | None = None
    is_default: bool = False


class SendingIdentityUpdate(BaseModel):
    """Schema for updating a sending identity."""
    display_name: str | None = Field(default=None, min_length=1, max_length=255)
    reply_to: EmailStr | None = None
    is_active: bool | None = None
    is_default: bool | None = None


class SendingIdentityResponse(BaseModel):
    """Schema for sending identity response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    domain_id: str
    email: str
    display_name: str
    reply_to: str | None
    is_active: bool
    is_default: bool
    total_sent: int
    last_used_at: datetime | None
    created_at: datetime
    updated_at: datetime


# =============================================================================
# DEDICATED IP SCHEMAS
# =============================================================================

class DedicatedIPCreate(BaseModel):
    """Schema for creating a dedicated IP."""
    provider_id: str
    ip_address: str = Field(..., min_length=7, max_length=45)
    hostname: str | None = Field(default=None, max_length=255)


class DedicatedIPUpdate(BaseModel):
    """Schema for updating a dedicated IP."""
    hostname: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    daily_limit: int | None = Field(default=None, ge=1)


class DedicatedIPResponse(BaseModel):
    """Schema for dedicated IP response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    provider_id: str
    ip_address: str
    hostname: str | None
    is_active: bool
    warming_status: str
    warming_schedule_id: str | None
    warming_started_at: datetime | None
    warming_day: int
    daily_limit: int
    daily_sent: int
    daily_reset_at: datetime | None
    health_score: int
    health_status: str
    blacklist_status: list[dict]
    last_blacklist_check_at: datetime | None
    created_at: datetime
    updated_at: datetime


# =============================================================================
# WARMING SCHEDULE SCHEMAS
# =============================================================================

class WarmingStep(BaseModel):
    """Single warming schedule step."""
    day: int = Field(..., ge=1)
    volume: int = Field(..., ge=1)


class WarmingScheduleCreate(BaseModel):
    """Schema for creating a warming schedule."""
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    schedule_type: WarmingScheduleType = "custom"
    steps: list[WarmingStep] = Field(..., min_length=1)
    max_bounce_rate: float = Field(default=0.05, ge=0, le=1)
    max_complaint_rate: float = Field(default=0.001, ge=0, le=1)
    min_delivery_rate: float = Field(default=0.90, ge=0, le=1)
    auto_pause_on_threshold: bool = True
    auto_adjust_volume: bool = True


class WarmingScheduleUpdate(BaseModel):
    """Schema for updating a warming schedule."""
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    steps: list[WarmingStep] | None = None
    max_bounce_rate: float | None = Field(default=None, ge=0, le=1)
    max_complaint_rate: float | None = Field(default=None, ge=0, le=1)
    min_delivery_rate: float | None = Field(default=None, ge=0, le=1)
    auto_pause_on_threshold: bool | None = None
    auto_adjust_volume: bool | None = None


class WarmingScheduleResponse(BaseModel):
    """Schema for warming schedule response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str | None
    name: str
    schedule_type: str
    description: str | None
    is_system: bool
    steps: list[dict]
    max_bounce_rate: float
    max_complaint_rate: float
    min_delivery_rate: float
    auto_pause_on_threshold: bool
    auto_adjust_volume: bool
    created_at: datetime
    updated_at: datetime


# =============================================================================
# WARMING PROGRESS SCHEMAS
# =============================================================================

class WarmingProgressResponse(BaseModel):
    """Schema for warming progress response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    domain_id: str
    dedicated_ip_id: str | None
    day_number: int
    date: datetime
    target_volume: int
    actual_volume: int
    sent: int
    delivered: int
    bounced: int
    complaints: int
    delivery_rate: float | None
    bounce_rate: float | None
    complaint_rate: float | None
    completed: bool
    threshold_exceeded: bool
    ai_recommendation: dict | None
    created_at: datetime


class WarmingProgressListResponse(BaseModel):
    """Schema for listing warming progress."""
    domain_id: str
    total_days: int
    current_day: int
    progress: list[WarmingProgressResponse]


# =============================================================================
# DOMAIN HEALTH SCHEMAS
# =============================================================================

class DomainHealthResponse(BaseModel):
    """Schema for domain health response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    domain_id: str
    date: datetime
    total_sent: int
    total_delivered: int
    total_bounced: int
    hard_bounces: int
    soft_bounces: int
    complaints: int
    rejects: int
    opens: int
    unique_opens: int
    clicks: int
    unique_clicks: int
    unsubscribes: int
    delivery_rate: float | None
    bounce_rate: float | None
    complaint_rate: float | None
    open_rate: float | None
    click_rate: float | None
    health_score: int
    health_status: str
    score_factors: dict | None
    created_at: datetime


class DomainHealthSummary(BaseModel):
    """Schema for domain health summary."""
    domain_id: str
    current_health_score: int
    current_health_status: str
    trend: Literal["improving", "stable", "declining"]
    last_7_days: dict  # Aggregated metrics
    last_30_days: dict
    recommendations: list[str]


# =============================================================================
# ISP METRICS SCHEMAS
# =============================================================================

class ISPMetricsResponse(BaseModel):
    """Schema for ISP metrics response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    domain_id: str
    isp: str
    date: datetime
    sent: int
    delivered: int
    bounced: int
    complaints: int
    opens: int
    clicks: int
    delivery_rate: float | None
    bounce_rate: float | None
    complaint_rate: float | None
    open_rate: float | None
    health_score: int
    created_at: datetime


class ISPMetricsSummary(BaseModel):
    """Schema for ISP metrics summary."""
    domain_id: str
    period: str
    metrics_by_isp: dict[str, dict]  # {isp: {sent, delivered, health_score, ...}}
    warnings: list[dict]  # [{isp: "gmail", issue: "high bounce rate"}]


# =============================================================================
# SENDING POOL SCHEMAS
# =============================================================================

class SendingPoolMemberCreate(BaseModel):
    """Schema for adding a pool member."""
    domain_id: str
    weight: int = Field(default=100, ge=1)
    priority: int = Field(default=100, ge=1)


class SendingPoolCreate(BaseModel):
    """Schema for creating a sending pool."""
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    routing_strategy: RoutingStrategy = "health_based"
    settings: dict = Field(default_factory=dict)
    is_default: bool = False
    members: list[SendingPoolMemberCreate] = Field(default_factory=list)


class SendingPoolUpdate(BaseModel):
    """Schema for updating a sending pool."""
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    routing_strategy: RoutingStrategy | None = None
    settings: dict | None = None
    is_active: bool | None = None
    is_default: bool | None = None


class SendingPoolMemberResponse(BaseModel):
    """Schema for pool member response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    pool_id: str
    domain_id: str
    weight: int
    priority: int
    is_active: bool
    created_at: datetime


class SendingPoolResponse(BaseModel):
    """Schema for sending pool response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None
    is_active: bool
    is_default: bool
    routing_strategy: str
    settings: dict
    created_at: datetime
    updated_at: datetime
    members: list[SendingPoolMemberResponse] = Field(default_factory=list)


class SendingPoolListResponse(BaseModel):
    """Schema for listing sending pools."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None
    is_active: bool
    is_default: bool
    routing_strategy: str
    member_count: int
    created_at: datetime


class PoolMemberUpdate(BaseModel):
    """Schema for updating a pool member."""
    weight: int | None = Field(default=None, ge=1)
    priority: int | None = Field(default=None, ge=1)
    is_active: bool | None = None


# =============================================================================
# PROVIDER EVENT LOG SCHEMAS
# =============================================================================

class ProviderEventLogResponse(BaseModel):
    """Schema for provider event log response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    provider_id: str | None
    domain_id: str | None
    event_type: str
    message_id: str | None
    recipient_email: str | None
    bounce_type: str | None
    bounce_subtype: str | None
    diagnostic_code: str | None
    processed: bool
    processed_at: datetime | None
    event_timestamp: datetime | None
    created_at: datetime


class EventLogListResponse(BaseModel):
    """Schema for paginated event log list."""
    items: list[ProviderEventLogResponse]
    total: int
    page: int
    page_size: int


# =============================================================================
# ROUTING SCHEMAS
# =============================================================================

class RoutingDecision(BaseModel):
    """Schema for routing decision response."""
    domain_id: str
    domain: str
    provider_id: str
    identity_id: str | None
    from_email: str
    reason: str
    fallback_domains: list[str]


class RoutingConfigUpdate(BaseModel):
    """Schema for updating campaign routing config."""
    sending_pool_id: str | None = None
    sending_identity_id: str | None = None
    routing_strategy: RoutingStrategy | None = None
    prefer_warming_complete: bool = True
    min_health_score: int = Field(default=50, ge=0, le=100)
