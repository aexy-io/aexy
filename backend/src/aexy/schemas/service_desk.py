"""Service Desk Pydantic schemas (taxonomy, master data, intake, ticket views)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


# Stakeholder and request-type slugs used to be `Literal[...]` unions listing one
# company's insurance vocabulary, which meant a workspace could not add a bucket
# without a schema change and a release. They are per-workspace rows now
# (`service_desk_stakeholders` / `service_desk_request_types`), so the wire type
# is a bounded string and *membership* is validated in the service layer against
# that workspace's own taxonomy — the only place that knows the answer.
TaxonomySlug = str
_SLUG_FIELD = Field(..., min_length=1, max_length=64)

TicketOrigin = Literal["email", "manual", "internal"]
MailboxChannel = Literal["webhook", "gmail_sync"]
StakeholderSemantics = Literal["internal", "external", "closed"]


# ==================== Taxonomy: stakeholders ====================

class StakeholderCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")
    label: str = Field(..., min_length=1, max_length=100)
    semantics: StakeholderSemantics = "internal"
    function_key: str | None = Field(None, max_length=64)
    position: int = 0
    is_active: bool = True


class StakeholderUpdate(BaseModel):
    """The slug is immutable: tickets and closed ledger segments store it."""

    label: str | None = Field(None, min_length=1, max_length=100)
    semantics: StakeholderSemantics | None = None
    function_key: str | None = Field(None, max_length=64)
    position: int | None = None
    is_active: bool | None = None


class StakeholderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    slug: str
    label: str
    semantics: StakeholderSemantics
    function_key: str | None = None
    position: int = 0
    is_active: bool = True


# ==================== Taxonomy: request types ====================

class RequestTypeCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")
    label: str = Field(..., min_length=1, max_length=100)
    is_default: bool = False
    position: int = 0
    is_active: bool = True


class RequestTypeUpdate(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=100)
    is_default: bool | None = None
    position: int | None = None
    is_active: bool | None = None


class RequestTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    slug: str
    label: str
    is_default: bool = False
    position: int = 0
    is_active: bool = True


# ==================== Industry templates ====================

class IndustryTemplateStakeholder(BaseModel):
    slug: str
    label: str
    semantics: StakeholderSemantics
    function_key: str | None = None


class IndustryTemplateRequestType(BaseModel):
    slug: str
    label: str
    is_default: bool = False


class IndustryTemplateResponse(BaseModel):
    """A starting point for a new desk. Contains no company-specific data."""

    slug: str
    name: str
    description: str
    terminology: dict[str, str]
    stakeholders: list[IndustryTemplateStakeholder] = Field(default_factory=list)
    request_types: list[IndustryTemplateRequestType] = Field(default_factory=list)
    departments: list[str] = Field(default_factory=list)


class ApplyIndustryTemplateRequest(BaseModel):
    template_slug: str = Field(..., min_length=1, max_length=64)
    # Whether to adopt the template's labels for accounts/vendors/products. Off
    # by default so re-applying a template to add a missing stakeholder can't
    # silently rename vocabulary the workspace has already customised.
    apply_terminology: bool = False
    # Create any department the template's internal stakeholders route to.
    # Without them, row-level visibility resolves to nobody and the tickets
    # simply don't appear, with nothing on screen to explain why.
    create_departments: bool = True


class ApplyIndustryTemplateResponse(BaseModel):
    template_slug: str
    stakeholders_added: int = 0
    request_types_added: int = 0
    departments_created: list[str] = Field(default_factory=list)
    terminology_applied: bool = False


# ==================== Accounts ====================

class AccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    assigned_owner_id: str | None = None
    domains: list[str] = Field(default_factory=list)
    is_active: bool = True


class AccountUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    assigned_owner_id: str | None = None
    domains: list[str] | None = None
    is_active: bool | None = None


class AccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    assigned_owner_id: str | None = None
    is_active: bool = True
    domains: list[str] = Field(default_factory=list)
    created_at: datetime


# ==================== Vendors ====================

class VendorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    domains: list[str] = Field(default_factory=list)
    is_active: bool = True


class VendorUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    domains: list[str] | None = None
    is_active: bool | None = None


class VendorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    is_active: bool = True
    domains: list[str] = Field(default_factory=list)
    created_at: datetime


# ==================== Products ====================

class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    is_active: bool = True


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    is_active: bool = True
    created_at: datetime


# ==================== Mailboxes ====================

class MailboxCreate(BaseModel):
    address: str = Field(..., min_length=3, max_length=255)
    channel: MailboxChannel = "webhook"
    integration_id: str | None = None
    is_active: bool = True


class MailboxUpdate(BaseModel):
    channel: MailboxChannel | None = None
    integration_id: str | None = None
    is_active: bool | None = None


class MailboxResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    address: str
    channel: MailboxChannel
    integration_id: str | None = None
    is_active: bool = True
    created_at: datetime


# ==================== Intake (internal, normalized email) ====================

class InboundEmail(BaseModel):
    """A provider/channel-agnostic inbound email handed to the intake service."""

    to: str
    from_email: str
    from_name: str | None = None
    subject: str = ""
    body_text: str = ""
    body_html: str | None = None
    message_id: str | None = None
    thread_id: str | None = None
    in_reply_to: str | None = None


# ==================== Manual ticket logging ====================

class ManualTicketCreate(BaseModel):
    requester_email: str | None = None
    requester_name: str | None = None
    subject: str = Field(..., min_length=1)
    body: str = ""
    # None means "the workspace's default request type" — resolved server-side,
    # because there is no universal default to hardcode here any more.
    request_type: TaxonomySlug | None = Field(None, max_length=64)
    product_id: str | None = None
    account_id: str | None = None


# ==================== Ticket views ====================

class ServiceDeskTicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    ticket_id: str
    workspace_id: str
    ticket_number: int | None = None
    display_id: str | None = None
    subject: str | None = None
    requester_email: str | None = None
    requester_name: str | None = None
    status: str | None = None
    product_id: str | None = None
    account_id: str | None = None
    account_name: str | None = None
    vendor_id: str | None = None
    assigned_owner_id: str | None = None
    request_type: TaxonomySlug
    pending_with: TaxonomySlug
    origin: TicketOrigin
    needs_triage: bool
    ai_confidence: float | None = None
    created_at: datetime


# ==================== Pending-With transitions & TAT ====================

BreachLevel = Literal["green", "amber", "red"]


class PendingWithUpdate(BaseModel):
    pending_with: TaxonomySlug = _SLUG_FIELD
    note: str | None = None


class ConvertToTaskRequest(BaseModel):
    project_id: str
    sprint_id: str | None = None
    title: str | None = None
    priority: str = "medium"


class ConvertToTaskResponse(BaseModel):
    task_id: str
    task_title: str
    linked: bool


class TicketFieldsUpdate(BaseModel):
    """Manual corrections to AI-set / auto-assigned fields."""

    request_type: TaxonomySlug | None = Field(None, max_length=64)
    product_id: str | None = None
    account_id: str | None = None
    vendor_id: str | None = None
    needs_triage: bool | None = None
    assigned_owner_id: str | None = None


class SegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    pending_with: TaxonomySlug
    entered_at: datetime
    exited_at: datetime | None = None
    duration_seconds: int | None = None
    changed_by_id: str | None = None
    note: str | None = None


class TicketTAT(BaseModel):
    overall_seconds: int
    overall_days: float
    current_pending_with: TaxonomySlug | None = None
    current_stage_seconds: int = 0
    current_stage_days: float = 0.0
    breach_level: BreachLevel = "green"
    # seconds spent with each stakeholder (excludes the terminal bucket)
    stakeholder_seconds: dict[str, int] = Field(default_factory=dict)


class ServiceDeskTicketDetail(ServiceDeskTicketResponse):
    body: str | None = None
    linked_task_id: str | None = None
    segments: list[SegmentResponse] = Field(default_factory=list)
    tat: TicketTAT


# ==================== Dashboard (stakeholder × age) ====================

class StakeholderBucket(BaseModel):
    pending_with: TaxonomySlug
    # Thresholds are per workspace (breach_amber_days / breach_red_days), so
    # these are "under amber", "amber to red" and "past red" rather than fixed
    # day counts.
    green: int = 0
    amber: int = 0
    red: int = 0
    total: int = 0


class DashboardTicket(BaseModel):
    ticket_id: str
    display_id: str
    subject: str | None = None
    product_name: str | None = None
    account_name: str | None = None
    request_type: TaxonomySlug
    pending_with: TaxonomySlug
    assigned_owner_id: str | None = None
    days_in_stage: float = 0.0
    overall_days: float = 0.0
    breach_level: BreachLevel = "green"
    needs_triage: bool = False
    status: str | None = None


class ServiceDeskDashboard(BaseModel):
    stakeholders: list[StakeholderBucket] = Field(default_factory=list)
    tickets: list[DashboardTicket] = Field(default_factory=list)
    total_open: int = 0
    breaching: int = 0


# ==================== Org-level settings ====================

class ServiceDeskSettings(BaseModel):
    """Workspace-level Service Desk settings."""

    ai_classification_enabled: bool = False
    # Whether the CALLER may edit master data / settings / templates, i.e. holds
    # can_manage_service_desk. Returned here so the Master Data page can hide
    # controls it would only get a 403 from; the server-side gate is still the
    # authority (api/service_desk.py::require_manage).
    can_manage: bool = False
    # How wide the caller's ticket view is: "all" (manager), "function" (scoped
    # to their department's queue) or "none" (in no department, so no ticket can
    # ever match). Lets the tickets page distinguish "nothing to do" from
    # "nobody has placed you in a department yet". Defaults to "all" so a
    # response from an older server can never raise a false alarm.
    scope: Literal["all", "function", "none"] = "all"
    # The working window the breach clock runs on, as "HH:MM" in `timezone`.
    # Returned so the Master Data page can show and edit it — the clock reads the
    # same values (services/service_desk_clock.py::load_clock).
    working_hours_start: str = "09:30"
    working_hours_end: str = "18:30"
    # Everything below used to be a code constant fixed to one customer's
    # operation. Defaults preserve exactly that behaviour for existing
    # workspaces; new ones set their own.
    ticket_prefix: str = "BSD"
    timezone: str = "Asia/Kolkata"
    breach_red_days: float = 2.0
    breach_amber_days: float = 1.0
    # Local hours at which the digest goes out, in `timezone`. Was a global cron
    # fixed at 09:00/13:00/17:00 Asia/Kolkata for every workspace on the
    # deployment, which paged a US desk in the middle of the night.
    digest_hours: list[int] = Field(default_factory=lambda: [9, 13, 17])
    # The industry template this desk started from, and the nouns it uses for the
    # three master-data tables.
    industry_template: str | None = None
    terminology: dict[str, str] = Field(default_factory=dict)
    # The desk's own name, used in outbound email copy. Defaults to the
    # workspace name rather than a hardcoded company.
    desk_name: str | None = None


_HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"


class ServiceDeskSettingsUpdate(BaseModel):
    """All fields optional so the page can PATCH any one on its own."""

    ai_classification_enabled: bool | None = None
    working_hours_start: str | None = Field(None, pattern=_HHMM)
    working_hours_end: str | None = Field(None, pattern=_HHMM)
    # Everything below was a module constant baked to one customer's operation:
    # "BSD" ticket ids, Asia/Kolkata day boundaries, a 2-business-day target.
    ticket_prefix: str | None = Field(None, pattern=r"^[A-Za-z][A-Za-z0-9]{0,9}$")
    timezone: str | None = Field(None, max_length=64)
    breach_red_days: float | None = Field(None, gt=0, le=60)
    breach_amber_days: float | None = Field(None, gt=0, le=60)
    digest_hours: list[int] | None = None
    terminology: dict[str, str] | None = None
    desk_name: str | None = Field(None, max_length=120)

    @model_validator(mode="after")
    def _window_must_be_forward(self):
        """Reject an inverted window at the door.

        ``Clock`` falls back to a 9h day if it ever meets one, but that guard is
        for data written before this validation existed — it should not double as
        permission to save nonsense, which would silently change what every
        breach figure means.
        """
        if self.working_hours_start and self.working_hours_end:
            if self.working_hours_end <= self.working_hours_start:  # "HH:MM" sorts correctly
                raise ValueError("working_hours_end must be later than working_hours_start")
        # Amber is the warning *before* red; inverted, the dashboard would show
        # red tickets that had never been amber and the colours would mean
        # nothing.
        if self.breach_red_days is not None and self.breach_amber_days is not None:
            if self.breach_amber_days >= self.breach_red_days:
                raise ValueError("breach_amber_days must be less than breach_red_days")
        if self.timezone is not None:
            from zoneinfo import ZoneInfo

            try:
                ZoneInfo(self.timezone)
            except Exception:
                raise ValueError(
                    f"Unknown timezone {self.timezone!r} — use an IANA name like Asia/Kolkata"
                ) from None
        if self.digest_hours is not None:
            if not self.digest_hours:
                raise ValueError("digest_hours must contain at least one hour")
            if any(not isinstance(h, int) or h < 0 or h > 23 for h in self.digest_hours):
                raise ValueError("digest_hours must be integers between 0 and 23")
            if len(set(self.digest_hours)) != len(self.digest_hours):
                raise ValueError("digest_hours must not repeat an hour")
        if self.terminology is not None:
            from aexy.services.service_desk_industry_templates import TERMINOLOGY_KEYS

            if unknown := set(self.terminology) - set(TERMINOLOGY_KEYS):
                raise ValueError(
                    f"Unknown terminology keys {sorted(unknown)} — expected any of {list(TERMINOLOGY_KEYS)}"
                )
            if any(not v.strip() for v in self.terminology.values()):
                raise ValueError("terminology labels must not be blank")
        return self


class ServiceDeskTemplate(BaseModel):
    key: str
    name: str
    subject: str
    body: str
    variables: list[str] = Field(default_factory=list)
    customised: bool = False


class ServiceDeskTemplateUpdate(BaseModel):
    subject: str = Field(..., min_length=1)
    body: str = Field(..., min_length=1)
