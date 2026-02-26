"""GTM (Go-To-Market) Pydantic schemas."""

from datetime import datetime
from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field

from aexy.models.gtm import (
    GTMProviderSlot as _GTMProviderSlot,
    GTMProviderStatus as _GTMProviderStatus,
    IdentificationStatus as _IdentificationStatus,
    LifecycleStage as _LifecycleStage,
)


# =============================================================================
# TYPE LITERALS — derived from model enums (single source of truth)
# =============================================================================

GTMProviderSlot = Literal[tuple(e.value for e in _GTMProviderSlot)]  # type: ignore[valid-type]
GTMProviderStatus = Literal[tuple(e.value for e in _GTMProviderStatus)]  # type: ignore[valid-type]
IdentificationStatus = Literal[tuple(e.value for e in _IdentificationStatus)]  # type: ignore[valid-type]
LifecycleStage = Literal[tuple(e.value for e in _LifecycleStage)]  # type: ignore[valid-type]


# =============================================================================
# PROVIDER CONFIG SCHEMAS
# =============================================================================

class GTMProviderConfigCreate(BaseModel):
    """Create a new GTM provider configuration."""
    slot: GTMProviderSlot
    provider_name: str = Field(..., min_length=1, max_length=100)
    display_name: str | None = None
    credentials: dict[str, Any] = Field(default_factory=dict)
    config: dict[str, Any] = Field(default_factory=dict)
    is_default: bool = False


class GTMProviderConfigUpdate(BaseModel):
    """Update a GTM provider configuration."""
    display_name: str | None = None
    credentials: dict[str, Any] | None = None
    config: dict[str, Any] | None = None
    is_default: bool | None = None
    is_active: bool | None = None


class GTMProviderConfigResponse(BaseModel):
    """GTM provider configuration response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    slot: str
    provider_name: str
    display_name: str | None
    config: dict[str, Any]
    is_default: bool
    is_active: bool
    usage_count: int
    usage_limit: int | None
    monthly_cost_cents: int
    status: str
    last_error: str | None
    last_tested_at: datetime | None
    created_at: datetime
    updated_at: datetime
    # credentials intentionally excluded from response


class GTMProviderTestResult(BaseModel):
    """Result of testing a provider connection."""
    success: bool
    message: str


class GTMAvailableProvider(BaseModel):
    """An available (registered) provider."""
    slot: str
    name: str
    display_name: str
    monthly_cost_cents: int
    required_credentials: list[str]


class SetDefaultRequest(BaseModel):
    """Set a provider as default for a slot."""
    provider_name: str


# =============================================================================
# BEHAVIORAL EVENT SCHEMAS
# =============================================================================

class BehavioralEventCreate(BaseModel):
    """A single behavioral event from the tracking pixel."""
    anonymous_id: str = Field(..., min_length=1, max_length=64)
    event_type: str = Field(..., min_length=1, max_length=50)
    page_url: str | None = None
    page_title: str | None = None
    referrer: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    utm_term: str | None = None
    utm_content: str | None = None
    properties: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime | None = None


class EventBatchRequest(BaseModel):
    """Batch of events from tracking pixel."""
    events: list[BehavioralEventCreate] = Field(..., max_length=100)


class BehavioralEventResponse(BaseModel):
    """Behavioral event response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    anonymous_id: str
    record_id: str | None
    session_id: str | None
    event_type: str
    page_url: str | None
    page_title: str | None
    referrer: str | None
    utm_source: str | None
    utm_medium: str | None
    utm_campaign: str | None
    properties: dict[str, Any]
    ip_address: str | None
    country_code: str | None
    city: str | None
    occurred_at: datetime
    received_at: datetime


# =============================================================================
# VISITOR SESSION SCHEMAS
# =============================================================================

class VisitorSessionResponse(BaseModel):
    """Visitor session response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    anonymous_id: str
    record_id: str | None
    page_count: int
    event_count: int
    duration_seconds: int
    max_scroll_depth: int
    first_page_url: str | None
    last_page_url: str | None
    entry_referrer: str | None
    utm_source: str | None
    utm_medium: str | None
    utm_campaign: str | None
    ip_address: str | None
    country_code: str | None
    city: str | None
    identification_status: str
    identified_company: str | None
    identified_domain: str | None
    started_at: datetime
    last_activity_at: datetime


class VisitorSessionListResponse(BaseModel):
    """Paginated visitor session list."""
    sessions: list[VisitorSessionResponse]
    total: int
    page: int
    per_page: int


class VisitorSessionDetailResponse(VisitorSessionResponse):
    """Session detail with events."""
    events: list[BehavioralEventResponse] = []
    identification: "VisitorIdentificationResponse | None" = None


# =============================================================================
# VISITOR IDENTIFICATION SCHEMAS
# =============================================================================

class VisitorIdentificationResponse(BaseModel):
    """Visitor identification result."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    session_id: str | None
    ip_address: str
    provider_name: str
    company_name: str | None
    company_domain: str | None
    industry: str | None
    employee_range: str | None
    revenue_range: str | None
    company_type: str | None
    headquarters_location: str | None
    confidence: float
    matched_record_id: str | None
    identified_at: datetime


class ManualIdentifyRequest(BaseModel):
    """Manual identification trigger."""
    ip_address: str | None = None  # If null, use session's IP


class LinkToRecordRequest(BaseModel):
    """Link a visitor session to a CRM record."""
    record_id: str


# =============================================================================
# ICP TEMPLATE SCHEMAS
# =============================================================================

class ICPCriteria(BaseModel):
    """ICP scoring criteria structure."""
    firmographic: dict[str, Any] = Field(
        default_factory=lambda: {"weight": 40, "criteria": []},
    )
    behavioral: dict[str, Any] = Field(
        default_factory=lambda: {"weight": 35, "criteria": []},
    )
    engagement: dict[str, Any] = Field(
        default_factory=lambda: {"weight": 25, "criteria": []},
    )


class ICPTemplateCreate(BaseModel):
    """Create an ICP template."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    is_default: bool = False
    criteria: ICPCriteria = Field(default_factory=ICPCriteria)
    target_industries: list[str] = Field(default_factory=list)
    target_employee_ranges: list[str] = Field(default_factory=list)
    target_revenue_ranges: list[str] = Field(default_factory=list)
    target_locations: list[str] = Field(default_factory=list)
    mql_threshold: int = Field(default=40, ge=0, le=100)
    sql_threshold: int = Field(default=70, ge=0, le=100)


class ICPTemplateUpdate(BaseModel):
    """Update an ICP template."""
    name: str | None = None
    description: str | None = None
    is_default: bool | None = None
    is_active: bool | None = None
    criteria: ICPCriteria | None = None
    target_industries: list[str] | None = None
    target_employee_ranges: list[str] | None = None
    target_revenue_ranges: list[str] | None = None
    target_locations: list[str] | None = None
    mql_threshold: int | None = None
    sql_threshold: int | None = None


class ICPTemplateResponse(BaseModel):
    """ICP template response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None
    is_default: bool
    is_active: bool
    criteria: dict[str, Any]
    target_industries: list
    target_employee_ranges: list
    target_revenue_ranges: list
    target_locations: list
    mql_threshold: int
    sql_threshold: int
    created_at: datetime
    updated_at: datetime
    created_by: str | None


# =============================================================================
# LEAD SCORE SCHEMAS
# =============================================================================

class LeadScoreResponse(BaseModel):
    """Lead score response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    record_id: str
    icp_template_id: str | None
    total_score: int
    firmographic_score: int
    behavioral_score: int
    engagement_score: int
    lifecycle_stage: str
    score_history: list
    scoring_factors: dict[str, Any]
    last_scored_at: datetime
    created_at: datetime
    updated_at: datetime


# =============================================================================
# DASHBOARD SCHEMAS
# =============================================================================

class GTMDashboardOverview(BaseModel):
    """GTM dashboard overview KPIs."""
    total_visitors: int = 0
    identified_companies: int = 0
    new_leads: int = 0
    active_sequences: int = 0
    visitors_change_pct: float = 0.0  # % change vs previous period
    companies_change_pct: float = 0.0
    leads_change_pct: float = 0.0
    sequences_change_pct: float = 0.0


class FunnelStageData(BaseModel):
    """Single funnel stage."""
    stage: str
    count: int
    conversion_rate: float = 0.0  # % from previous stage


class GTMFunnelResponse(BaseModel):
    """Funnel data for dashboard."""
    stages: list[FunnelStageData]


class RecentVisitorRow(BaseModel):
    """Recent visitor for dashboard table."""
    session_id: str
    company_name: str | None
    company_domain: str | None
    page_count: int
    duration_seconds: int
    identification_status: str
    utm_source: str | None
    country_code: str | None
    started_at: datetime


class RecentVisitorsResponse(BaseModel):
    """Recent visitors list."""
    visitors: list[RecentVisitorRow]


# Forward reference update
VisitorSessionDetailResponse.model_rebuild()


# =============================================================================
# COMPLIANCE SCHEMAS
# =============================================================================

class ConsentType(str, Enum):
    EXPLICIT_OPT_IN = "explicit_opt_in"
    LEGITIMATE_INTEREST = "legitimate_interest"
    IMPLIED = "implied"


class Jurisdiction(str, Enum):
    GDPR = "gdpr"
    CAN_SPAM = "can_spam"
    CASL = "casl"
    OTHER = "other"


class SuppressionReason(str, Enum):
    UNSUBSCRIBE = "unsubscribe"
    BOUNCE = "bounce"
    COMPLAINT = "complaint"
    MANUAL = "manual"
    LEGAL = "legal"


class RecordConsentRequest(BaseModel):
    """Request to record consent for a contact."""
    email: str
    consent_type: ConsentType
    consent_source: str
    jurisdiction: Jurisdiction
    record_id: str | None = None


class ConsentStatusResponse(BaseModel):
    """Consent status for an email address."""
    email: str
    has_consent: bool
    consent_type: str | None = None
    jurisdiction: str | None = None
    consent_date: datetime | None = None
    is_active: bool = False


class SendPermissionCheck(BaseModel):
    """Result of a pre-send compliance check."""
    allowed: bool
    reason: str
    checks: list[dict]


class AddSuppressionRequest(BaseModel):
    """Request to add an email to the suppression list."""
    email: str
    reason: SuppressionReason
    source: str = "manual"


class SuppressionEntryResponse(BaseModel):
    """A suppression list entry."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    domain: str | None
    reason: str
    source: str
    added_at: datetime


class SuppressionListResponse(BaseModel):
    """Paginated suppression list."""
    entries: list[SuppressionEntryResponse]
    total: int
    page: int
    per_page: int


class ComplianceAuditResponse(BaseModel):
    """A compliance audit log entry."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    action: str
    reason: str | None
    jurisdiction: str | None
    created_at: datetime


class ComplianceAuditListResponse(BaseModel):
    """Paginated audit log."""
    entries: list[ComplianceAuditResponse]
    total: int
    page: int
    per_page: int


class ErasureRequest(BaseModel):
    """GDPR right-to-erasure request. Must set confirm=True to proceed."""
    email: str
    confirm: bool = False


class UnsubscribeRequest(BaseModel):
    """Unsubscribe request."""
    email: str


# =============================================================================
# SCORING AGGREGATION SCHEMAS
# =============================================================================

class ScoreDistributionBucket(BaseModel):
    """A single bucket in the score distribution histogram."""
    range: str  # "0-20", "21-40", etc.
    count: int


class LifecycleBreakdown(BaseModel):
    """Count of leads in a lifecycle stage."""
    stage: str
    count: int


class TopLeadRow(BaseModel):
    """A lead row used in scoring tables and top-leads lists."""
    record_id: str
    total_score: int
    firmographic_score: int
    behavioral_score: int
    engagement_score: int
    lifecycle_stage: str
    last_scored_at: datetime | None


class ScoringOverviewResponse(BaseModel):
    """Dashboard scoring overview."""
    total_scored: int
    avg_score: float
    score_distribution: list[ScoreDistributionBucket]
    lifecycle_breakdown: list[LifecycleBreakdown]
    top_leads: list[TopLeadRow]


class ScoredLeadListResponse(BaseModel):
    """Paginated list of scored leads."""
    leads: list[TopLeadRow]
    total: int
    page: int
    per_page: int


class ScoreDetailResponse(BaseModel):
    """Detailed score for a single record."""
    record_id: str
    icp_template_id: str | None
    total_score: int
    firmographic_score: int
    behavioral_score: int
    engagement_score: int
    lifecycle_stage: str
    scoring_factors: dict[str, Any]
    score_history: list[Any]
    last_scored_at: datetime | None
    created_at: datetime | None
    updated_at: datetime | None


# =============================================================================
# DEDUP SCHEMAS
# =============================================================================

class DuplicateMatch(BaseModel):
    """A single duplicate match pair."""
    record_id: str
    duplicate_id: str
    confidence: float
    match_type: str  # "email", "domain_name", "phone"
    match_details: dict[str, Any]


class MergeRequest(BaseModel):
    """Request body for merging two records."""
    primary_id: str
    duplicate_id: str
    strategy: str = "primary_wins"


class MergeResult(BaseModel):
    """Result of merging two records."""
    merged_record_id: str
    fields_merged: int
    events_relinked: int
    sessions_relinked: int


class DedupStatsResponse(BaseModel):
    """Workspace dedup statistics."""
    total_records: int
    potential_duplicates: int
    merged_count: int


# =============================================================================
# OUTREACH SEQUENCES
# =============================================================================

from aexy.models.gtm_outreach import (
    SequenceStatus as _SequenceStatus,
    SequenceChannel as _SequenceChannel,
    EnrollmentStatus as _EnrollmentStatus,
)

SequenceStatusLiteral = Literal[tuple(e.value for e in _SequenceStatus)]  # type: ignore[valid-type]
SequenceChannelLiteral = Literal[tuple(e.value for e in _SequenceChannel)]  # type: ignore[valid-type]
EnrollmentStatusLiteral = Literal[tuple(e.value for e in _EnrollmentStatus)]  # type: ignore[valid-type]


class SequenceStepConfig(BaseModel):
    """Configuration for a single sequence step."""
    step_index: int
    channel: SequenceChannelLiteral
    action: str  # send_email, linkedin_view, linkedin_connect, linkedin_message, send_sms, wait
    delay_days: int = 0
    delay_hours: int = 0
    config: dict = Field(default_factory=dict)
    conditions: dict = Field(default_factory=dict)


class SequenceSettings(BaseModel):
    """Sequence-level settings."""
    send_window_start_hour: int = 9
    send_window_end_hour: int = 17
    timezone: str = "America/New_York"
    exit_on_reply: bool = True
    exit_on_bounce: bool = True
    exit_on_unsubscribe: bool = True
    max_enrollments: int | None = None
    compliance_check: bool = True


class CreateSequenceRequest(BaseModel):
    """Create a new outreach sequence."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    steps: list[SequenceStepConfig] = Field(default_factory=list)
    settings: SequenceSettings = Field(default_factory=SequenceSettings)
    channels: list[SequenceChannelLiteral] = Field(default_factory=list)


class UpdateSequenceRequest(BaseModel):
    """Update an existing sequence."""
    name: str | None = None
    description: str | None = None
    steps: list[SequenceStepConfig] | None = None
    settings: SequenceSettings | None = None
    channels: list[SequenceChannelLiteral] | None = None


class SequenceResponse(BaseModel):
    """Outreach sequence response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None = None
    status: SequenceStatusLiteral
    steps: list[dict] = []
    settings: dict = {}
    channels: list[str] = []
    enrolled_count: int = 0
    active_count: int = 0
    completed_count: int = 0
    replied_count: int = 0
    bounced_count: int = 0
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime


class SequenceListResponse(BaseModel):
    """Paginated list of sequences."""
    items: list[SequenceResponse]
    total: int
    page: int
    per_page: int


class EnrollContactRequest(BaseModel):
    """Enroll a contact in a sequence."""
    record_id: str
    email: str
    contact_name: str | None = None


class BulkEnrollRequest(BaseModel):
    """Bulk enroll contacts in a sequence."""
    contacts: list[EnrollContactRequest]


class EnrollmentResponse(BaseModel):
    """Enrollment response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    sequence_id: str
    record_id: str
    email: str
    contact_name: str | None = None
    recipient_timezone: str | None = None
    status: EnrollmentStatusLiteral
    current_step_index: int = 0
    next_step_at: datetime | None = None
    temporal_workflow_id: str | None = None
    exit_reason: str | None = None
    enrolled_at: datetime
    completed_at: datetime | None = None
    created_at: datetime


class EnrollmentListResponse(BaseModel):
    """Paginated list of enrollments."""
    items: list[EnrollmentResponse]
    total: int
    page: int
    per_page: int


class BulkEnrollResponse(BaseModel):
    """Result of bulk enrollment."""
    enrolled: int
    skipped: int
    failed: int
    errors: list[str] = []


class StepExecutionResponse(BaseModel):
    """Step execution response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    enrollment_id: str
    step_index: int
    channel: str
    action: str
    status: str
    variant_index: int | None = None
    thread_id: str | None = None
    provider_message_id: str | None = None
    error_message: str | None = None
    sent_at: datetime | None = None
    delivered_at: datetime | None = None
    opened_at: datetime | None = None
    clicked_at: datetime | None = None
    replied_at: datetime | None = None
    created_at: datetime


class SequenceAnalyticsResponse(BaseModel):
    """Per-sequence analytics."""
    sequence_id: str
    total_enrolled: int
    active: int
    completed: int
    replied: int
    bounced: int
    reply_rate: float
    completion_rate: float
    steps: list[dict] = []  # per-step metrics


# =============================================================================
# GTM ANALYTICS SCHEMAS
# =============================================================================

class PipelineStageResponse(BaseModel):
    """Single pipeline stage."""
    stage: str
    count: int
    conversion_rate: float = 0.0


class PipelineAnalyticsResponse(BaseModel):
    """Full pipeline analytics."""
    stages: list[PipelineStageResponse]
    total_leads: int = 0
    period_new: int = 0


class ChannelMetricsResponse(BaseModel):
    """Channel-level outreach metrics."""
    channel: str
    total_sent: int = 0
    delivered: int = 0
    opened: int = 0
    clicked: int = 0
    replied: int = 0
    bounced: int = 0
    open_rate: float = 0.0
    click_rate: float = 0.0
    reply_rate: float = 0.0
    bounce_rate: float = 0.0


class ChannelAnalyticsResponse(BaseModel):
    """Channel comparison analytics."""
    channels: list[ChannelMetricsResponse]


class AttributionChannelResponse(BaseModel):
    """Attribution credit per channel."""
    channel: str
    attributed_conversions: float = 0.0
    percentage: float = 0.0


class AttributionAnalyticsResponse(BaseModel):
    """Multi-touch attribution analytics."""
    model: str = "linear"
    channels: list[AttributionChannelResponse]


class SequenceComparisonResponse(BaseModel):
    """Sequence comparison row."""
    id: str
    name: str
    status: str
    enrolled_count: int = 0
    active_count: int = 0
    completed_count: int = 0
    replied_count: int = 0
    bounced_count: int = 0
    reply_rate: float = 0.0
    completion_rate: float = 0.0


class SequenceComparisonAnalyticsResponse(BaseModel):
    """Sequence comparison analytics."""
    sequences: list[SequenceComparisonResponse]


class TrendPointResponse(BaseModel):
    """Single trend data point."""
    date: str
    count: int = 0


class TrendAnalyticsResponse(BaseModel):
    """Time-series trend analytics."""
    visitors: list[TrendPointResponse] = []
    leads: list[TrendPointResponse] = []
    emails_sent: list[TrendPointResponse] = []
    replies: list[TrendPointResponse] = []


class WeeklyReportResponse(BaseModel):
    """Weekly report summary data."""
    pipeline: PipelineAnalyticsResponse
    channels: ChannelAnalyticsResponse
    sequences: SequenceComparisonAnalyticsResponse
    trends: TrendAnalyticsResponse
    summary: dict = {}


# =============================================================================
# REPLY CLASSIFICATION SCHEMAS
# =============================================================================

class ClassifyReplyRequest(BaseModel):
    """Request body for classifying a reply."""
    enrollment_id: str
    reply_text: str
    reply_from: str | None = None


class ReplyClassificationResponse(BaseModel):
    """Reply classification result."""
    category: str
    confidence: float
    reasoning: str
    action_taken: str | None = None
    auto_actioned: bool = False


class ReplyClassificationStatsResponse(BaseModel):
    """Reply classification statistics."""
    period_days: int
    total_classified: int
    category_counts: dict[str, int]
    auto_actioned: int
    auto_action_rate: float


# =============================================================================
# BULK IMPORT SCHEMAS
# =============================================================================

class BulkImportRequest(BaseModel):
    """Request body for bulk CSV import."""
    csv_content: str = Field(..., max_length=10_000_000, description="Raw CSV content")
    verify_emails: bool = True
    skip_duplicates: bool = True
    sequence_id: str | None = None
    object_slug: str = "person"


class ImportRowResult(BaseModel):
    """Result for a single imported row."""
    row: int
    email: str
    status: str
    record_id: str | None = None
    duplicate_of: str | None = None
    error: str | None = None


class BulkImportResponse(BaseModel):
    """Bulk import result summary."""
    job_id: str
    status: str
    total_rows: int = 0
    processed: int = 0
    created: int = 0
    duplicates: int = 0
    invalid_emails: int = 0
    skipped: int = 0
    errors: int = 0
    enrolled: int = 0
    rows: list[ImportRowResult] = []


class BulkImportAsyncResponse(BaseModel):
    """Response for async bulk import dispatch."""
    workflow_id: str
    message: str = "Import job started"
