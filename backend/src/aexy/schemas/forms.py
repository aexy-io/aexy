"""Forms-related Pydantic schemas for the standalone forms module."""

from datetime import datetime
from typing import Literal, Any
from pydantic import BaseModel, ConfigDict, Field, EmailStr


# =============================================================================
# TYPE LITERALS
# =============================================================================

FormAuthMode = Literal["anonymous", "email_verification"]
FormTemplateType = Literal["bug_report", "feature_request", "support", "contact", "lead_capture", "feedback", "custom"]
FormFieldType = Literal["text", "textarea", "email", "phone", "number", "url", "select", "multiselect", "checkbox", "radio", "file", "date", "datetime", "hidden"]
FormSubmissionStatus = Literal["pending", "processing", "completed", "partially_failed", "failed"]
TicketAssignmentMode = Literal["none", "oncall", "round_robin", "specific_user"]
TicketPriority = Literal["low", "medium", "high", "urgent"]
TicketSeverity = Literal["critical", "high", "medium", "low"]


# =============================================================================
# SHARED SCHEMAS
# =============================================================================

class FieldOption(BaseModel):
    """Option for select/multiselect/radio fields."""
    value: str = Field(..., min_length=1, max_length=100)
    label: str = Field(..., min_length=1, max_length=100)
    color: str | None = Field(default=None, max_length=20)


class ValidationRules(BaseModel):
    """Validation rules for form fields."""
    # Common validation type presets
    validation_type: str | None = None  # "email", "phone", "url", "alpha", "alphanumeric", "numeric", "custom"

    # Length constraints
    min_length: int | None = None
    max_length: int | None = None

    # Number constraints
    min: float | None = None
    max: float | None = None

    # Pattern matching
    pattern: str | None = None  # Custom regex pattern
    pattern_message: str | None = None  # Error message for pattern mismatch

    # File upload constraints
    allowed_file_types: list[str] | None = None
    max_file_size_mb: int | None = None

    # Date constraints
    min_date: str | None = None  # ISO date string
    max_date: str | None = None  # ISO date string

    # Custom error message
    custom_message: str | None = None


class ExternalMappings(BaseModel):
    """Field mapping to external platforms."""
    github: str | None = None  # "title", "body", "labels"
    jira: str | None = None  # "summary", "description", "labels"
    linear: str | None = None  # "title", "description", "labels"


class GlobalThemeSettings(BaseModel):
    """Global theme settings that apply across the form."""
    primary_color: str | None = Field(default=None, max_length=20)
    secondary_color: str | None = Field(default=None, max_length=20)
    background_color: str | None = Field(default=None, max_length=20)
    surface_color: str | None = Field(default=None, max_length=20)
    text_color: str | None = Field(default=None, max_length=20)
    text_secondary_color: str | None = Field(default=None, max_length=20)
    border_color: str | None = Field(default=None, max_length=20)
    error_color: str | None = Field(default=None, max_length=20)
    success_color: str | None = Field(default=None, max_length=20)
    font_family: str | None = Field(default=None, max_length=100)
    border_radius: str | None = Field(default=None, max_length=20)
    spacing: Literal["compact", "normal", "relaxed"] | None = None


class FormElementSettings(BaseModel):
    """Settings for form container element."""
    background_color: str | None = None
    padding: str | None = None
    max_width: str | None = None
    shadow: Literal["none", "sm", "md", "lg", "xl"] | None = None


class HeaderElementSettings(BaseModel):
    """Settings for form header."""
    text: str | None = None
    text_color: str | None = None
    font_size: str | None = None
    font_weight: str | None = None
    alignment: Literal["left", "center", "right"] | None = None
    logo_url: str | None = Field(default=None, max_length=500)
    logo_position: Literal["above", "left", "right"] | None = None


class LabelElementSettings(BaseModel):
    """Settings for form labels."""
    text_color: str | None = None
    font_size: str | None = None
    font_weight: str | None = None
    required_indicator_color: str | None = None


class InputElementSettings(BaseModel):
    """Settings for input fields."""
    background_color: str | None = None
    border_color: str | None = None
    text_color: str | None = None
    placeholder_color: str | None = None
    focus_border_color: str | None = None
    focus_ring_color: str | None = None
    border_radius: str | None = None
    padding: str | None = None
    font_size: str | None = None


class ButtonStyleSettings(BaseModel):
    """Settings for a button style."""
    background_color: str | None = None
    text_color: str | None = None
    border_color: str | None = None
    hover_background_color: str | None = None
    border_radius: str | None = None
    padding: str | None = None
    font_size: str | None = None
    font_weight: str | None = None


class ButtonElementSettings(BaseModel):
    """Settings for buttons."""
    primary: ButtonStyleSettings | None = None
    secondary: ButtonStyleSettings | None = None


class ErrorElementSettings(BaseModel):
    """Settings for error messages."""
    text_color: str | None = None
    background_color: str | None = None
    border_color: str | None = None
    icon_color: str | None = None


class HelpTextElementSettings(BaseModel):
    """Settings for help text."""
    text_color: str | None = None
    font_size: str | None = None


class ElementThemeSettings(BaseModel):
    """Element-level theme overrides."""
    form: FormElementSettings | None = None
    header: HeaderElementSettings | None = None
    labels: LabelElementSettings | None = None
    inputs: InputElementSettings | None = None
    buttons: ButtonElementSettings | None = None
    errors: ErrorElementSettings | None = None
    help_text: HelpTextElementSettings | None = None


class FormTheme(BaseModel):
    """Extended theme customization for the form."""
    preset: Literal["light", "dark", "minimal", "modern", "colorful", "corporate"] | None = None
    global_settings: GlobalThemeSettings | None = Field(default=None, alias="global")
    elements: ElementThemeSettings | None = None
    custom_css: str | None = None

    class Config:
        populate_by_name = True


# Legacy FormTheme for backwards compatibility
class LegacyFormTheme(BaseModel):
    """Legacy theme format for backwards compatibility."""
    primary_color: str | None = Field(default=None, max_length=20)
    background_color: str | None = Field(default=None, max_length=20)
    logo_url: str | None = Field(default=None, max_length=500)
    custom_css: str | None = None
    header_text: str | None = None
    font_family: str | None = Field(default=None, max_length=100)


# =============================================================================
# THANK YOU PAGE SCHEMAS
# =============================================================================

class ThankYouImage(BaseModel):
    """Image configuration for thank you page."""
    url: str | None = Field(default=None, max_length=500)
    alt: str | None = Field(default=None, max_length=255)
    position: Literal["top", "bottom", "left", "right"] | None = None
    max_width: str | None = None


class ThankYouButton(BaseModel):
    """CTA button for thank you page."""
    id: str | None = None
    text: str = Field(..., min_length=1, max_length=100)
    action: Literal["reload", "redirect", "close"]
    url: str | None = Field(default=None, max_length=500)
    style: Literal["primary", "secondary", "link"] = "primary"


class ThankYouContent(BaseModel):
    """Content configuration for thank you page."""
    message: dict | None = None  # TipTap JSON format
    show_ticket_number: bool = True
    ticket_number_label: str | None = Field(default="Your Reference Number", max_length=100)
    image: ThankYouImage | None = None
    buttons: list[ThankYouButton] | None = None


class ThankYouLayout(BaseModel):
    """Layout configuration for thank you page."""
    alignment: Literal["center", "left"] = "center"
    max_width: str | None = Field(default="480px", max_length=20)
    padding: str | None = None
    animation: Literal["fade", "slide", "none"] = "fade"


class ThankYouPageConfig(BaseModel):
    """Complete thank you page configuration."""
    use_form_theme: bool = True
    theme: FormTheme | None = None
    content: ThankYouContent | None = None
    layout: ThankYouLayout | None = None


class ConditionalRule(BaseModel):
    """Conditional logic rule for showing/hiding fields."""
    source_field: str
    condition: Literal["equals", "not_equals", "contains", "not_contains", "is_empty", "is_not_empty", "greater_than", "less_than"]
    value: str | None = None
    target_field: str
    action: Literal["show", "hide", "require"]


class ExternalDestination(BaseModel):
    """External platform destination configuration."""
    type: Literal["github", "jira", "linear"]
    enabled: bool = True
    # GitHub specific
    repository_id: str | None = None
    labels: list[str] | None = None
    # Jira specific
    project_key: str | None = None
    issue_type: str | None = None
    # Linear specific
    team_id: str | None = None
    # Field mappings for this destination
    field_mappings: dict[str, str] | None = None  # {form_field_key: platform_field}


# =============================================================================
# FORM FIELD SCHEMAS
# =============================================================================

class FormFieldCreate(BaseModel):
    """Schema for creating a form field."""
    name: str = Field(..., min_length=1, max_length=255)
    field_key: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z_][a-z0-9_]*$")
    field_type: FormFieldType = "text"
    placeholder: str | None = Field(default=None, max_length=255)
    default_value: str | None = None
    help_text: str | None = None
    is_required: bool = False
    validation_rules: ValidationRules | None = None
    options: list[FieldOption] | None = None
    position: int | None = None
    is_visible: bool = True
    width: Literal["full", "half", "third", "two-thirds"] = "full"
    crm_attribute_id: str | None = None
    external_mappings: ExternalMappings | None = None


class FormFieldUpdate(BaseModel):
    """Schema for updating a form field."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    placeholder: str | None = Field(default=None, max_length=255)
    default_value: str | None = None
    help_text: str | None = None
    is_required: bool | None = None
    validation_rules: ValidationRules | None = None
    options: list[FieldOption] | None = None
    position: int | None = None
    is_visible: bool | None = None
    width: Literal["full", "half", "third", "two-thirds"] | None = None
    crm_attribute_id: str | None = None
    external_mappings: ExternalMappings | None = None


class FormFieldResponse(BaseModel):
    """Schema for form field response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    form_id: str
    name: str
    field_key: str
    field_type: FormFieldType
    placeholder: str | None = None
    default_value: str | None = None
    help_text: str | None = None
    is_required: bool
    validation_rules: dict
    options: list[dict] | None = None
    position: int
    is_visible: bool
    width: str
    crm_attribute_id: str | None = None
    external_mappings: dict
    created_at: datetime
    updated_at: datetime


class FieldReorder(BaseModel):
    """Schema for reordering fields."""
    field_ids: list[str] = Field(..., min_length=1)


# =============================================================================
# TICKET CONFIG SCHEMAS
# =============================================================================

class TicketConfigCreate(BaseModel):
    """Schema for configuring ticket creation on form submission."""
    auto_create_ticket: bool = True
    default_team_id: str | None = None
    ticket_assignment_mode: TicketAssignmentMode = "none"
    ticket_assignee_id: str | None = None
    default_priority: TicketPriority | None = None
    default_severity: TicketSeverity | None = None
    ticket_field_mappings: dict[str, str] | None = None  # {form_field_key: ticket_field}
    ticket_config: dict | None = None  # {title_template, description_template, tags}


class TicketConfigResponse(BaseModel):
    """Schema for ticket configuration response."""
    model_config = ConfigDict(from_attributes=True)

    auto_create_ticket: bool
    default_team_id: str | None = None
    default_team_name: str | None = None
    ticket_assignment_mode: TicketAssignmentMode
    ticket_assignee_id: str | None = None
    ticket_assignee_name: str | None = None
    default_priority: TicketPriority | None = None
    default_severity: TicketSeverity | None = None
    ticket_field_mappings: dict
    ticket_config: dict


# =============================================================================
# CRM MAPPING SCHEMAS
# =============================================================================

class CRMMappingCreate(BaseModel):
    """Schema for configuring CRM record creation on form submission."""
    auto_create_record: bool = True
    crm_object_id: str
    crm_field_mappings: dict[str, str]  # {form_field_key: crm_attribute_slug}
    record_owner_id: str | None = None


class CRMMappingResponse(BaseModel):
    """Schema for CRM mapping response."""
    model_config = ConfigDict(from_attributes=True)

    auto_create_record: bool
    crm_object_id: str | None = None
    crm_object_name: str | None = None
    crm_field_mappings: dict
    record_owner_id: str | None = None
    record_owner_name: str | None = None


# =============================================================================
# DEAL CONFIG SCHEMAS
# =============================================================================

class DealConfigCreate(BaseModel):
    """Schema for configuring deal creation on form submission."""
    auto_create_deal: bool = True
    deal_pipeline_id: str
    deal_stage_id: str
    deal_field_mappings: dict[str, str] | None = None  # {form_field_key: deal_attribute_slug}
    link_deal_to_record: bool = True


class DealConfigResponse(BaseModel):
    """Schema for deal configuration response."""
    model_config = ConfigDict(from_attributes=True)

    auto_create_deal: bool
    deal_pipeline_id: str | None = None
    deal_pipeline_name: str | None = None
    deal_stage_id: str | None = None
    deal_stage_name: str | None = None
    deal_field_mappings: dict
    link_deal_to_record: bool


# =============================================================================
# AUTOMATION LINK SCHEMAS
# =============================================================================

class AutomationLinkCreate(BaseModel):
    """Schema for linking an automation to a form."""
    automation_id: str
    conditions: list[dict] | None = None  # Optional override conditions


class AutomationLinkResponse(BaseModel):
    """Schema for automation link response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    form_id: str
    automation_id: str
    automation_name: str | None = None
    is_active: bool
    conditions: list[dict]
    created_at: datetime


# =============================================================================
# FORM SCHEMAS
# =============================================================================

class FormCreate(BaseModel):
    """Schema for creating a form."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    template_type: FormTemplateType | None = None
    auth_mode: FormAuthMode = "anonymous"
    require_email: bool = True
    theme: FormTheme | None = None
    thank_you_page: ThankYouPageConfig | None = None
    success_message: str | None = None
    redirect_url: str | None = Field(default=None, max_length=500)
    conditional_rules: list[ConditionalRule] | None = None

    # Destinations (can be configured during creation or later)
    destinations: list[ExternalDestination] | None = None

    # Optional: include fields during creation
    fields: list[FormFieldCreate] | None = None


class FormUpdate(BaseModel):
    """Schema for updating a form."""
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    is_active: bool | None = None
    auth_mode: FormAuthMode | None = None
    require_email: bool | None = None
    theme: FormTheme | None = None
    thank_you_page: ThankYouPageConfig | None = None
    success_message: str | None = None
    redirect_url: str | None = Field(default=None, max_length=500)
    conditional_rules: list[ConditionalRule] | None = None
    destinations: list[ExternalDestination] | None = None
    trigger_automations: bool | None = None


class FormResponse(BaseModel):
    """Schema for form response."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None = None
    template_type: str | None = None
    public_url_token: str
    is_active: bool
    auth_mode: FormAuthMode
    require_email: bool
    theme: dict
    thank_you_page: dict
    success_message: str | None = None
    redirect_url: str | None = None

    # Ticketing config summary
    auto_create_ticket: bool
    default_team_id: str | None = None
    ticket_assignment_mode: TicketAssignmentMode

    # CRM config summary
    auto_create_record: bool
    crm_object_id: str | None = None

    # Deal config summary
    auto_create_deal: bool
    deal_pipeline_id: str | None = None

    # Automation config
    trigger_automations: bool

    # External destinations
    destinations: list[dict]
    conditional_rules: list[dict]
    submission_count: int

    created_by_id: str | None = None
    created_at: datetime
    updated_at: datetime

    # Optional expanded data
    fields: list[FormFieldResponse] | None = None
    crm_object_name: str | None = None
    default_team_name: str | None = None


class FormListResponse(BaseModel):
    """Schema for listing forms (without fields)."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None = None
    template_type: str | None = None
    public_url_token: str
    is_active: bool
    auth_mode: FormAuthMode
    auto_create_ticket: bool
    auto_create_record: bool
    auto_create_deal: bool
    submission_count: int
    created_at: datetime
    updated_at: datetime


class FormDuplicate(BaseModel):
    """Schema for duplicating a form."""
    name: str = Field(..., min_length=1, max_length=255)


# =============================================================================
# PUBLIC FORM SCHEMAS
# =============================================================================

class PublicFormResponse(BaseModel):
    """Schema for public form (no sensitive data)."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None = None
    auth_mode: FormAuthMode
    require_email: bool
    theme: dict
    thank_you_page: dict
    fields: list[FormFieldResponse]
    conditional_rules: list[dict]


class PublicFormSubmission(BaseModel):
    """Schema for submitting a form through public endpoint."""
    email: EmailStr | None = None
    name: str | None = Field(default=None, max_length=255)
    data: dict[str, Any]
    utm_params: dict[str, str] | None = None


class PublicSubmissionResponse(BaseModel):
    """Response after submitting a form."""
    submission_id: str
    success_message: str | None = None
    redirect_url: str | None = None
    requires_email_verification: bool = False

    # Created resources (IDs only for public response)
    ticket_number: int | None = None
    crm_record_id: str | None = None
    deal_id: str | None = None


class EmailVerificationRequest(BaseModel):
    """Request to verify email."""
    token: str


# =============================================================================
# FORM SUBMISSION SCHEMAS
# =============================================================================

class FormSubmissionResponse(BaseModel):
    """Schema for form submission response (admin view)."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    form_id: str
    workspace_id: str
    data: dict
    attachments: list[dict]
    email: str | None = None
    name: str | None = None
    is_verified: bool
    verified_at: datetime | None = None
    status: FormSubmissionStatus
    processing_errors: list[dict]

    # Created resources
    ticket_id: str | None = None
    crm_record_id: str | None = None
    deal_id: str | None = None
    external_issues: list[dict]
    automations_triggered: list[dict]

    # Metadata
    ip_address: str | None = None
    user_agent: str | None = None
    referrer_url: str | None = None
    utm_params: dict

    submitted_at: datetime
    processed_at: datetime | None = None

    # Expanded data (optional)
    ticket_number: int | None = None
    crm_record_display_name: str | None = None
    deal_display_name: str | None = None
    form_name: str | None = None


class FormSubmissionListResponse(BaseModel):
    """Schema for listing form submissions."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    form_id: str
    email: str | None = None
    name: str | None = None
    is_verified: bool
    status: FormSubmissionStatus
    ticket_id: str | None = None
    crm_record_id: str | None = None
    deal_id: str | None = None
    submitted_at: datetime

    # Expanded
    ticket_number: int | None = None
    form_name: str | None = None


class FormSubmissionFilters(BaseModel):
    """Filters for listing form submissions."""
    form_id: str | None = None
    email: str | None = None
    status: list[FormSubmissionStatus] | None = None
    is_verified: bool | None = None
    has_ticket: bool | None = None
    has_crm_record: bool | None = None
    has_deal: bool | None = None
    submitted_after: datetime | None = None
    submitted_before: datetime | None = None


# =============================================================================
# FORM TEMPLATES
# =============================================================================

class FormTemplateInfo(BaseModel):
    """Information about a form template."""
    type: FormTemplateType
    name: str
    description: str
    default_fields: list[FormFieldCreate]
    suggested_crm_object: str | None = None  # e.g., "person", "company"


# =============================================================================
# ANALYTICS SCHEMAS
# =============================================================================

class FormAnalyticsOverview(BaseModel):
    """Overview analytics for a form."""
    total_submissions: int
    submissions_today: int
    submissions_this_week: int
    submissions_this_month: int
    tickets_created: int
    crm_records_created: int
    deals_created: int
    conversion_rate: float | None = None  # submissions that became deals
    avg_processing_time_ms: float | None = None


class FormSubmissionsByDay(BaseModel):
    """Submission counts by day."""
    date: str
    submissions: int
    tickets: int
    crm_records: int
    deals: int
