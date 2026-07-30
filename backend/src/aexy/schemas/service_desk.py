"""Bimaplan Service Desk Pydantic schemas (master data, intake, ticket views)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


RequestType = Literal["query", "policy_issuance", "claims", "payout"]
PendingWith = Literal[
    "insurer", "partner", "sales", "third_party", "finance", "kam", "marketing", "closed"
]
TicketOrigin = Literal["email", "manual", "internal"]
MailboxChannel = Literal["webhook", "gmail_sync"]


# ==================== Partners ====================

class PartnerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    assigned_kam_id: str | None = None
    domains: list[str] = Field(default_factory=list)
    is_active: bool = True


class PartnerUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    assigned_kam_id: str | None = None
    domains: list[str] | None = None
    is_active: bool | None = None


class PartnerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    assigned_kam_id: str | None = None
    is_active: bool = True
    domains: list[str] = Field(default_factory=list)
    created_at: datetime


# ==================== Insurers ====================

class InsurerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    domains: list[str] = Field(default_factory=list)
    is_active: bool = True


class InsurerUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    domains: list[str] | None = None
    is_active: bool | None = None


class InsurerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    is_active: bool = True
    domains: list[str] = Field(default_factory=list)
    created_at: datetime


# ==================== LOBs ====================

class LOBCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    is_active: bool = True


class LOBResponse(BaseModel):
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
    request_type: RequestType = "query"
    lob_id: str | None = None
    partner_id: str | None = None


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
    lob_id: str | None = None
    partner_id: str | None = None
    partner_name: str | None = None
    insurer_id: str | None = None
    assigned_kam_id: str | None = None
    request_type: RequestType
    pending_with: PendingWith
    origin: TicketOrigin
    needs_triage: bool
    ai_confidence: float | None = None
    created_at: datetime


# ==================== Pending-With transitions & TAT (Phase 2) ====================

BreachLevel = Literal["green", "amber", "red"]


class PendingWithUpdate(BaseModel):
    pending_with: PendingWith
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
    """KAM corrections to AI-set / auto-assigned fields."""
    request_type: RequestType | None = None
    lob_id: str | None = None
    partner_id: str | None = None
    insurer_id: str | None = None
    needs_triage: bool | None = None
    assigned_kam_id: str | None = None


class SegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    pending_with: PendingWith
    entered_at: datetime
    exited_at: datetime | None = None
    duration_seconds: int | None = None
    changed_by_id: str | None = None
    note: str | None = None


class TicketTAT(BaseModel):
    overall_seconds: int
    overall_days: float
    current_pending_with: PendingWith | None = None
    current_stage_seconds: int = 0
    current_stage_days: float = 0.0
    breach_level: BreachLevel = "green"
    # seconds spent with each stakeholder (excludes the terminal 'closed' state)
    stakeholder_seconds: dict[str, int] = Field(default_factory=dict)


class ServiceDeskTicketDetail(ServiceDeskTicketResponse):
    body: str | None = None
    linked_task_id: str | None = None
    segments: list[SegmentResponse] = Field(default_factory=list)
    tat: TicketTAT


# ==================== Dashboard (stakeholder × age) ====================

class StakeholderBucket(BaseModel):
    pending_with: PendingWith
    green: int = 0   # 0–1 day in current stage
    amber: int = 0   # 1–2 days (watch)
    red: int = 0     # > 2 days (breach)
    total: int = 0


class DashboardTicket(BaseModel):
    ticket_id: str
    display_id: str
    subject: str | None = None
    lob_name: str | None = None
    partner_name: str | None = None
    request_type: RequestType
    pending_with: PendingWith
    assigned_kam_id: str | None = None
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
    # The working window the breach clock runs on, IST, as "HH:MM". Returned so
    # the Master Data page can show and edit it — the clock reads the same values
    # (services/service_desk_clock.py::load_clock).
    working_hours_start: str = "09:30"
    working_hours_end: str = "18:30"


_HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"


class ServiceDeskSettingsUpdate(BaseModel):
    """Both fields optional so the page can PATCH either one on its own."""

    ai_classification_enabled: bool | None = None
    working_hours_start: str | None = Field(None, pattern=_HHMM)
    working_hours_end: str | None = Field(None, pattern=_HHMM)

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
