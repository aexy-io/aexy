"""Email Marketing Pydantic schemas for API validation."""

from datetime import datetime
from typing import Literal, Any
from pydantic import BaseModel, ConfigDict, Field, EmailStr


# =============================================================================
# TYPE LITERALS
# =============================================================================

EmailTemplateType = Literal["code", "visual"]
EmailTemplateCategory = Literal["general", "marketing", "onboarding", "release", "transactional", "newsletter"]
CampaignType = Literal["one_time", "recurring", "triggered"]
CampaignStatus = Literal["draft", "scheduled", "sending", "sent", "paused", "cancelled"]
RecipientStatus = Literal["pending", "sent", "delivered", "opened", "clicked", "bounced", "unsubscribed", "failed"]
BounceType = Literal["hard", "soft"]
SubscriberStatus = Literal["active", "unsubscribed", "bounced", "complained"]
UnsubscribeSource = Literal["link", "preference_center", "api", "complaint", "bounce"]
SubscriptionFrequency = Literal["immediate", "daily", "weekly", "monthly"]
FilterOperator = Literal[
    "equals", "not_equals", "contains", "not_contains",
    "starts_with", "ends_with",
    "gt", "gte", "lt", "lte", "between",
    "is_empty", "is_not_empty",
    "in", "not_in"
]


# =============================================================================
# TEMPLATE VARIABLE SCHEMAS
# =============================================================================

class TemplateVariable(BaseModel):
    """Definition of a template variable."""
    name: str = Field(..., min_length=1, max_length=50)
    type: Literal["string", "number", "boolean", "date", "url"] = "string"
    default: Any | None = None
    required: bool = False
    description: str | None = None


# =============================================================================
# FILTER SCHEMAS
# =============================================================================

class FilterCondition(BaseModel):
    """Filter condition for audience targeting."""
    attribute: str = Field(..., min_length=1)
    operator: FilterOperator
    value: Any
    conjunction: Literal["and", "or"] = "and"


# =============================================================================
# SEND WINDOW SCHEMAS
# =============================================================================

class SendWindow(BaseModel):
    """Optimal send time window configuration."""
    start: str = Field(..., pattern=r"^\d{2}:\d{2}$")  # HH:MM
    end: str = Field(..., pattern=r"^\d{2}:\d{2}$")  # HH:MM
    timezone: str = "UTC"


# =============================================================================
# EMAIL TEMPLATE SCHEMAS
# =============================================================================

class EmailTemplateCreate(BaseModel):
    """Schema for creating an email template."""
    name: str = Field(..., min_length=1, max_length=255)
    slug: str | None = Field(default=None, min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")
    description: str | None = None
    template_type: EmailTemplateType = "code"
    category: EmailTemplateCategory = "general"
    subject_template: str = Field(..., min_length=1)
    body_html: str = Field(..., min_length=1)
    body_text: str | None = None
    preview_text: str | None = Field(default=None, max_length=500)
    variables: list[TemplateVariable] = Field(default_factory=list)
    visual_definition: dict | None = None


class EmailTemplateUpdate(BaseModel):
    """Schema for updating an email template."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    category: EmailTemplateCategory | None = None
    subject_template: str | None = Field(default=None, min_length=1)
    body_html: str | None = Field(default=None, min_length=1)
    body_text: str | None = None
    preview_text: str | None = Field(default=None, max_length=500)
    variables: list[TemplateVariable] | None = None
    visual_definition: dict | None = None
    is_active: bool | None = None


class EmailTemplateResponse(BaseModel):
    """Schema for email template response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None
    template_type: str
    category: str
    subject_template: str
    body_html: str
    body_text: str | None
    preview_text: str | None
    variables: list[dict]
    visual_definition: dict | None
    is_active: bool
    version: int
    created_by_id: str | None
    created_at: datetime
    updated_at: datetime


class EmailTemplateListResponse(BaseModel):
    """Schema for listing email templates."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None
    template_type: str
    category: str
    is_active: bool
    version: int
    created_at: datetime
    updated_at: datetime


class TemplatePreviewRequest(BaseModel):
    """Schema for previewing a template with sample data."""
    context: dict = Field(default_factory=dict)


class TemplatePreviewResponse(BaseModel):
    """Schema for template preview response."""
    subject: str
    body_html: str
    body_text: str | None


# =============================================================================
# EMAIL CAMPAIGN SCHEMAS
# =============================================================================

class EmailCampaignCreate(BaseModel):
    """Schema for creating an email campaign."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    template_id: str | None = None
    list_id: str | None = None
    audience_filters: list[FilterCondition] = Field(default_factory=list)
    campaign_type: CampaignType = "one_time"
    from_name: str = Field(..., min_length=1, max_length=255)
    from_email: EmailStr
    reply_to: EmailStr | None = None
    template_context: dict = Field(default_factory=dict)
    scheduled_at: datetime | None = None
    send_window: SendWindow | None = None


class EmailCampaignUpdate(BaseModel):
    """Schema for updating an email campaign."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    template_id: str | None = None
    list_id: str | None = None
    audience_filters: list[FilterCondition] | None = None
    from_name: str | None = Field(default=None, min_length=1, max_length=255)
    from_email: EmailStr | None = None
    reply_to: EmailStr | None = None
    template_context: dict | None = None
    scheduled_at: datetime | None = None
    send_window: SendWindow | None = None


class EmailCampaignResponse(BaseModel):
    """Schema for email campaign response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    template_id: str | None
    name: str
    description: str | None
    list_id: str | None
    audience_filters: list[dict]
    campaign_type: str
    status: str
    scheduled_at: datetime | None
    send_window: dict | None
    from_name: str
    from_email: str
    reply_to: str | None
    template_context: dict
    total_recipients: int
    sent_count: int
    delivered_count: int
    open_count: int
    unique_open_count: int
    click_count: int
    unique_click_count: int
    bounce_count: int
    unsubscribe_count: int
    complaint_count: int
    started_at: datetime | None
    completed_at: datetime | None
    created_by_id: str | None
    created_at: datetime
    updated_at: datetime


class EmailCampaignListResponse(BaseModel):
    """Schema for listing email campaigns."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    campaign_type: str
    status: str
    scheduled_at: datetime | None
    total_recipients: int
    sent_count: int
    open_count: int
    click_count: int
    created_at: datetime


class CampaignScheduleRequest(BaseModel):
    """Schema for scheduling a campaign."""
    scheduled_at: datetime
    send_window: SendWindow | None = None


class CampaignTestRequest(BaseModel):
    """Schema for sending a test email."""
    to_emails: list[EmailStr] = Field(..., min_length=1, max_length=5)
    context: dict = Field(default_factory=dict)


# =============================================================================
# CAMPAIGN RECIPIENT SCHEMAS
# =============================================================================

class CampaignRecipientResponse(BaseModel):
    """Schema for campaign recipient response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    campaign_id: str
    record_id: str | None
    email: str
    recipient_name: str | None
    status: str
    sent_at: datetime | None
    delivered_at: datetime | None
    first_opened_at: datetime | None
    first_clicked_at: datetime | None
    open_count: int
    click_count: int
    error_message: str | None
    bounce_type: str | None
    created_at: datetime


class RecipientListResponse(BaseModel):
    """Schema for paginated recipient list."""
    items: list[CampaignRecipientResponse]
    total: int
    page: int
    page_size: int


# =============================================================================
# TRACKING SCHEMAS (Phase 2)
# =============================================================================

class TrackingPixelResponse(BaseModel):
    """Schema for tracking pixel response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    opened: bool
    open_count: int
    first_opened_at: datetime | None
    last_opened_at: datetime | None
    device_type: str | None
    email_client: str | None


class TrackedLinkResponse(BaseModel):
    """Schema for tracked link response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    original_url: str
    link_name: str | None
    click_count: int
    unique_click_count: int
    created_at: datetime


class LinkClickResponse(BaseModel):
    """Schema for link click event response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    link_id: str
    recipient_id: str | None
    clicked_at: datetime
    device_type: str | None


# =============================================================================
# ANALYTICS SCHEMAS (Phase 3)
# =============================================================================

class CampaignStatsResponse(BaseModel):
    """Schema for campaign statistics."""
    campaign_id: str
    total_recipients: int
    sent_count: int
    delivered_count: int
    open_count: int
    unique_open_count: int
    click_count: int
    unique_click_count: int
    bounce_count: int
    unsubscribe_count: int
    complaint_count: int
    delivery_rate: float | None
    open_rate: float | None
    click_rate: float | None
    click_to_open_rate: float | None
    bounce_rate: float | None


class TimelineDataPoint(BaseModel):
    """Single data point for timeline analytics."""
    timestamp: datetime
    sent: int = 0
    delivered: int = 0
    opened: int = 0
    clicked: int = 0


class CampaignTimelineResponse(BaseModel):
    """Schema for campaign timeline analytics."""
    campaign_id: str
    granularity: Literal["hour", "day"]
    data: list[TimelineDataPoint]


class LinkPerformance(BaseModel):
    """Schema for individual link performance."""
    link_id: str
    url: str
    link_name: str | None
    click_count: int
    unique_click_count: int
    click_rate: float | None


class CampaignLinksResponse(BaseModel):
    """Schema for campaign link analytics."""
    campaign_id: str
    links: list[LinkPerformance]


class DeviceBreakdown(BaseModel):
    """Schema for device analytics."""
    desktop: int = 0
    mobile: int = 0
    tablet: int = 0
    unknown: int = 0


class EmailClientBreakdown(BaseModel):
    """Schema for email client analytics."""
    clients: dict[str, int]  # {"gmail": 100, "outlook": 50, ...}


class CampaignDevicesResponse(BaseModel):
    """Schema for campaign device/client analytics."""
    campaign_id: str
    opens_by_device: DeviceBreakdown
    clicks_by_device: DeviceBreakdown
    opens_by_client: EmailClientBreakdown


class WorkspaceEmailOverview(BaseModel):
    """Schema for workspace email overview."""
    workspace_id: str
    period: str
    period_start: datetime
    period_end: datetime
    campaigns_sent: int
    emails_sent: int
    emails_delivered: int
    total_opens: int
    total_clicks: int
    unsubscribes: int
    avg_open_rate: float | None
    avg_click_rate: float | None
    bounce_rate: float | None


# =============================================================================
# SUBSCRIPTION SCHEMAS (Phase 4)
# =============================================================================

class SubscriptionCategoryCreate(BaseModel):
    """Schema for creating a subscription category."""
    name: str = Field(..., min_length=1, max_length=100)
    slug: str | None = Field(default=None, min_length=1, max_length=50, pattern=r"^[a-z0-9-]+$")
    description: str | None = None
    default_subscribed: bool = True
    required: bool = False
    display_order: int = 0


class SubscriptionCategoryUpdate(BaseModel):
    """Schema for updating a subscription category."""
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    default_subscribed: bool | None = None
    display_order: int | None = None
    is_active: bool | None = None


class SubscriptionCategoryResponse(BaseModel):
    """Schema for subscription category response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None
    default_subscribed: bool
    required: bool
    display_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class SubscriberResponse(BaseModel):
    """Schema for subscriber response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    record_id: str | None
    email: str
    status: str
    status_changed_at: datetime | None
    status_reason: str | None
    is_verified: bool
    verified_at: datetime | None
    created_at: datetime
    updated_at: datetime


class SubscriptionPreferenceUpdate(BaseModel):
    """Schema for updating a single subscription preference."""
    category_id: str
    is_subscribed: bool
    frequency: SubscriptionFrequency | None = None


class PreferenceCenterData(BaseModel):
    """Schema for preference center page data."""
    subscriber_id: str
    email: str
    status: str
    categories: list[SubscriptionCategoryResponse]
    preferences: dict[str, dict]  # {category_id: {is_subscribed, frequency}}


class PreferenceCenterUpdate(BaseModel):
    """Schema for updating preferences from preference center."""
    preferences: list[SubscriptionPreferenceUpdate]
    unsubscribe_all: bool = False


class SubscriberImportRequest(BaseModel):
    """Schema for importing subscribers."""
    subscribers: list[dict]  # [{email, name, ...}]
    category_ids: list[str] = Field(default_factory=list)
    skip_verification: bool = False


class SubscriberImportResponse(BaseModel):
    """Schema for import response."""
    total: int
    imported: int
    skipped: int
    errors: list[dict]


# =============================================================================
# HOSTED IMAGE SCHEMAS
# =============================================================================

class HostedImageResponse(BaseModel):
    """Schema for hosted image response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    filename: str
    content_type: str
    file_size: int
    public_url: str
    view_count: int
    created_at: datetime
