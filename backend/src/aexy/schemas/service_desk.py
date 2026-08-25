"""Service Desk Pydantic schemas (taxonomy, master data, intake, ticket views)."""

import re
from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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
# Which master-data table an external stakeholder speaks for.
MasterDataLink = Literal["account", "vendor"]
# A ticket file either arrived on the conversation or was uploaded here to be
# sent out from it.
AttachmentSource = Literal["email", "upload"]


# ==================== Taxonomy: stakeholders ====================

class StakeholderCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")
    label: str = Field(..., min_length=1, max_length=100)
    semantics: StakeholderSemantics = "internal"
    function_key: str | None = Field(None, max_length=64)
    # Which master-data table an external bucket speaks for. Only meaningful
    # when semantics == "external"; see ``ServiceDeskStakeholder.links_to``.
    links_to: MasterDataLink | None = None
    position: int = 0
    is_active: bool = True


class StakeholderUpdate(BaseModel):
    """The slug is immutable: tickets and closed ledger segments store it."""

    label: str | None = Field(None, min_length=1, max_length=100)
    semantics: StakeholderSemantics | None = None
    function_key: str | None = Field(None, max_length=64)
    links_to: MasterDataLink | None = None
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
    links_to: MasterDataLink | None = None
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
    links_to: MasterDataLink | None = None


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

class AccountProductInput(BaseModel):
    """One product an account is served for, optionally with its own owner."""

    product_id: str
    # Overrides the account's owner for tickets classified as this product.
    # Omitted by every desk that does not split a partner between people.
    assigned_owner_id: str | None = None


class AccountProductLink(AccountProductInput):
    """The same pairing, resolved for display."""

    product_name: str | None = None
    assigned_owner_name: str | None = None


class AccountCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    assigned_owner_id: str | None = None
    domains: list[str] = Field(default_factory=list)
    products: list[AccountProductInput] = Field(default_factory=list)
    is_active: bool = True


class AccountUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    assigned_owner_id: str | None = None
    domains: list[str] | None = None
    # A complete replacement of the pairings when supplied, like `domains` — the
    # editor sends the whole set, and "add one" and "remove one" as separate
    # verbs would need the client to know what it is diffing against.
    products: list[AccountProductInput] | None = None
    is_active: bool | None = None


class AccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    assigned_owner_id: str | None = None
    # Resolved for display. The list is where somebody checks that the mapping
    # they made is the mapping in force, and an id is not something a person can
    # check. Without it the row for a partner with no owner looked exactly like
    # the row for one mapped correctly — and an unmapped partner is the whole
    # reason tickets land on an arbitrary owner.
    assigned_owner_name: str | None = None
    assigned_owner_email: str | None = None
    is_active: bool = True
    domains: list[str] = Field(default_factory=list)
    # Which products this account is served for. Empty for a desk that has not
    # split anybody, which is every desk until somebody does.
    products: list[AccountProductLink] = Field(default_factory=list)
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

class InboundAttachment(BaseModel):
    """A bounded, provider-normalized attachment summary for intake AI."""

    filename: str
    content_type: str | None = None
    size_bytes: int | None = None
    preview: str | None = None
    # The provider's handle for re-fetching the bytes later. Captured whether or
    # not AI is on, because it is an identifier and not content: without it a KAM
    # can see that a claim register arrived but can never forward it, which is
    # the whole reason the file was sent to the desk.
    attachment_id: str | None = None


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
    # When the provider says this arrived, by the provider's own clock rather than
    # the sender's Date header. The outbound side compares it against other
    # messages in the same thread to tell "a colleague has since replied" from
    # "the desk started this thread", so a skewed or forged Date must not decide
    # it. None when the channel does not report one.
    sent_at: datetime | None = None
    attachments: list[InboundAttachment] = Field(default_factory=list)
    # Raw message headers, keys lower-cased. Intake reads these to recognise
    # automatic responses and our own outbound mail; providers hand them over in
    # whatever case and value type they like, hence the normalisation below.
    headers: dict[str, str] = Field(default_factory=dict)

    @field_validator("headers", mode="before")
    @classmethod
    def _normalise_headers(cls, value: object) -> dict[str, str]:
        if not isinstance(value, dict):
            return {}
        return {str(name).strip().lower(): str(item) for name, item in value.items()}


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
    product_name: str | None = None
    account_id: str | None = None
    account_name: str | None = None
    vendor_id: str | None = None
    vendor_name: str | None = None
    assigned_owner_id: str | None = None
    assigned_owner_name: str | None = None
    request_type: TaxonomySlug
    pending_with: TaxonomySlug
    origin: TicketOrigin
    needs_triage: bool
    ai_confidence: float | None = None
    created_at: datetime


class TicketFilters(BaseModel):
    """What narrows a ticket list, a count, or an export.

    One model for all three, taken as a FastAPI dependency, so the rows a report
    exports are by construction the rows its screen was showing. Three parallel
    sets of query parameters would drift, and the first symptom would be a CSV
    that disagrees with the page somebody generated it from.

    Every field is optional and every one is a *narrowing*. None of them widen
    the caller's scope: the visibility clause is applied first and separately, so
    asking for another owner's queue by id returns their tickets only if the
    caller could already see them.
    """

    # Reporting is nearly always "this month", "last quarter" — a range on
    # creation, inclusive of both ends, in UTC.
    created_from: datetime | None = None
    created_to: datetime | None = None

    # Ordering, not narrowing — but it lives here because the export takes the
    # same model, and a CSV that came back in a different order than the screen
    # it was generated from is its own small betrayal.
    sort: Literal[
        "created", "ticket", "subject", "account", "type", "pending", "status"
    ] = "created"
    direction: Literal["asc", "desc"] = "desc"

    # Free text, matched against the things a person actually remembers about a
    # ticket: what it was called, who sent it, and its number. Deliberately not a
    # body search — the desk stores whole email threads, and a query that matched
    # quoted history would return every reply in a chain for a word said once.
    q: str | None = Field(None, max_length=200)

    account_id: str | None = None
    product_id: str | None = None
    vendor_id: str | None = None
    request_type: TaxonomySlug | None = None
    pending_with: TaxonomySlug | None = None
    origin: TicketOrigin | None = None
    status: str | None = Field(None, max_length=32)
    assigned_to: str | None = None
    # Tickets nobody has finished classifying. The one filter that answers a
    # question about the desk's own hygiene rather than about its work.
    needs_triage: bool | None = None
    # Whether the ticket is in the workspace's terminal stage. Expressed as a
    # boolean rather than by naming the closed slug, because which slug that is
    # differs per workspace and a report should not have to know.
    is_open: bool | None = None

    @model_validator(mode="after")
    def _range_must_run_forwards(self):
        if (
            self.created_from is not None
            and self.created_to is not None
            and self.created_to < self.created_from
        ):
            raise ValueError("created_to must not be earlier than created_from")
        return self


class RequestTypeAccuracy(BaseModel):
    request_type: str
    label: str
    classified: int
    agreed: int
    agreement_rate: float


class AIAccuracy(BaseModel):
    """How often this desk's people agreed with the classifier.

    ``agreement_rate`` is None when nothing has been classified — a desk with no
    measurements has no accuracy, and rendering a perfect score for zero tickets
    is the most misleading thing this could report.
    """

    days: int
    classified: int
    agreed: int
    agreement_rate: float | None = None
    by_request_type: list[RequestTypeAccuracy] = Field(default_factory=list)


class DigestPreview(BaseModel):
    """What this desk's digest would say right now, and who would get it."""

    enabled: bool
    hours: list[int] = Field(default_factory=list)
    timezone: str
    recipients: list[str] = Field(default_factory=list)
    # The caller's own copy, rendered. Not somebody else's: a preview that showed
    # the desk lead's whole-desk digest to a KAM would mail around the row scope
    # every other read enforces.
    subject: str | None = None
    body: str | None = None


class TicketCount(BaseModel):
    """The size of the matching set, for a screen that shows a page of it."""

    total: int


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
    # Who picks the work up. Without it the task landed on nobody and had to be
    # assigned in a second trip to the board.
    assignee_id: str | None = None
    # Which bucket the ticket moves to now that the work sits on a board. The
    # dialog pre-fills it from what the board resolves to and the operator can
    # change it, so it is sent rather than derived here — an automatic move
    # nobody saw is how tickets end up somewhere their owner cannot explain.
    # Omitted or null leaves the ticket where it is.
    pending_with: TaxonomySlug | None = Field(None, max_length=64)


class ConvertToTaskResponse(BaseModel):
    task_id: str
    task_title: str
    linked: bool
    #: The bucket the ticket was moved to, or null if it was left alone.
    pending_with: str | None = None


class TicketFieldsUpdate(BaseModel):
    """Manual corrections to AI-set / auto-assigned fields."""

    request_type: TaxonomySlug | None = Field(None, max_length=64)
    product_id: str | None = None
    account_id: str | None = None
    vendor_id: str | None = None
    needs_triage: bool | None = None
    assigned_owner_id: str | None = None


class DetectedIssue(BaseModel):
    summary: str = Field(..., min_length=1, max_length=240)
    request_type: TaxonomySlug
    product: str | None = None
    confidence: float = Field(..., ge=0, le=1)
    split_reason: str | None = None


class HumanSplitRequest(BaseModel):
    issue_indexes: list[int] = Field(..., min_length=1)


class HumanSplitResponse(BaseModel):
    created_ticket_ids: list[str]
    created_ticket_display_ids: list[str]


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


class ServiceDeskCorrespondence(BaseModel):
    """An external email matched to this Service Desk ticket, either direction."""

    id: str
    author_email: str | None = None
    # The internal person who pressed Send. Only set on outgoing mail: an
    # inbound reply has no Aexy author. Without it the ticket shows only the
    # shared mailbox, so nobody can tell which KAM actually wrote to a partner.
    author_name: str | None = None
    content: str
    created_at: datetime
    # "outgoing" is mail a KAM or manager sent from the ticket; "incoming" is a
    # stakeholder reply the mailbox sync matched onto it. The card must say
    # which, or a thread of both reads as if the stakeholder said everything.
    direction: Literal["incoming", "outgoing"] = "incoming"


class TicketEmailRecipient(BaseModel):
    """One address the ticket may be emailed from the desk."""

    email: str
    label: str
    # The stage the ticket moves to when this recipient is written to, or None
    # when writing to them says nothing about who now has to act (the original
    # requester, if they are not also a configured account or vendor).
    stage: TaxonomySlug | None = None


class TicketAttachment(BaseModel):
    """A file on the ticket: one that arrived by email, or one uploaded to send."""

    # Position in the ticket's *emailed* attachment list — the handle the
    # download endpoint takes. A filename would be friendlier in the URL but two
    # replies can attach files with the same name, and a path segment carrying
    # arbitrary user-supplied text is a worse thing to route on. None on an
    # uploaded file, which is addressed by ``id``: positions belong to the
    # emailed list alone, so uploading a file can never shift what an existing
    # download URL points at.
    index: int | None = None
    filename: str
    content_type: str | None = None
    size_bytes: int | None = None
    # Where this file came from, which is not cosmetic: "arrived from the
    # requester" and "somebody here uploaded it to send out" are different facts
    # about a ticket, and a list that blurs them misleads whoever reads it later.
    source: AttachmentSource = "email"
    # Set on uploaded files only — the handle the compose box and the delete
    # endpoint use. Emailed files are addressed by ``index``.
    id: str | None = None
    # False when the provider gave us no handle for the bytes, e.g. mail that
    # arrived before attachment ids were captured. Without that handle the file
    # can be neither forwarded nor downloaded — both re-fetch from the original
    # message — so the UI must not offer either.
    can_forward: bool = False


_ADDRESS_RE = re.compile(r"^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]{2,}$")


class TicketReplyAll(BaseModel):
    """Everyone on this ticket's email thread, ready to be replied to.

    ``to`` is the last person who wrote in and ``cc`` is the rest of the chain,
    the desk's own address excluded. Empty on a ticket logged by hand, and on one
    whose mail arrived before the desk started keeping the addresses.
    """

    to: str | None = None
    cc: list[str] = Field(default_factory=list)


class StakeholderEmailRequest(BaseModel):
    to: str = Field(..., min_length=3, max_length=255)
    # Anyone else who needs to see this reply. Kept separate from ``to`` because
    # only the To address can imply a hand-off — copying a colleague says nothing
    # about who now has to act.
    cc: list[str] = Field(default_factory=list, max_length=10)
    subject: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1, max_length=20000)

    @field_validator("to", "subject")
    @classmethod
    def _no_header_injection(cls, value: str) -> str:
        """A CR or LF in a header field would let the sender append headers of
        their own (a Bcc, say) to the raw MIME handed to Gmail."""
        if "\r" in value or "\n" in value:
            raise ValueError("must not contain line breaks")
        return value

    @field_validator("to")
    @classmethod
    def _one_address(cls, value: str) -> str:
        """A single bare address, so a comma-separated list cannot smuggle in
        recipients the confirmation step never showed the sender."""
        address = value.strip().lower()
        if not _ADDRESS_RE.match(address):
            raise ValueError("must be a single email address")
        return address

    @field_validator("cc")
    @classmethod
    def _clean_cc(cls, value: list[str]) -> list[str]:
        """Same rule per entry, blanks dropped and duplicates collapsed."""
        cleaned: list[str] = []
        for item in value:
            address = str(item).strip().lower()
            if not address:
                continue
            if not _ADDRESS_RE.match(address):
                raise ValueError(f"{item!r} is not a valid email address")
            if address not in cleaned:
                cleaned.append(address)
        return cleaned
    # Filenames chosen from the ticket's own attachments. Never a client-supplied
    # payload: the bytes are re-fetched from the original email, so a caller
    # cannot use the desk to send a file that never arrived on the ticket.
    attachment_filenames: list[str] = Field(default_factory=list, max_length=10)
    # Ids of files uploaded to this ticket for sending. Also not a payload: the
    # id is looked up on the ticket and the bytes come from the desk's own
    # storage, so a caller cannot attach a file it did not first upload here.
    attachment_ids: list[str] = Field(default_factory=list, max_length=10)
    # Sending is usually the hand-off, so the stage follows the recipient by
    # default. A KAM sending an update rather than a request unticks it.
    move_ticket: bool = True


class ServiceDeskTicketDetail(ServiceDeskTicketResponse):
    body: str | None = None
    linked_task_id: str | None = None
    detected_issues: list[DetectedIssue] = Field(default_factory=list)
    split_done_indexes: list[int] = Field(default_factory=list)
    segments: list[SegmentResponse] = Field(default_factory=list)
    correspondence: list[ServiceDeskCorrespondence] = Field(default_factory=list)
    email_recipients: list[TicketEmailRecipient] = Field(default_factory=list)
    reply_all: TicketReplyAll = Field(default_factory=TicketReplyAll)
    attachments: list[TicketAttachment] = Field(default_factory=list)
    # Why the ticket has the owner it has, when the answer was not simply Master
    # Data. Written at intake and, until now, only ever visible in the database —
    # so "assignment is not following our master data" could not be answered from
    # the ticket that prompted it. None when nothing had to be explained.
    assignment_note: str | None = None
    tat: TicketTAT
    # Server-computed write authority for the requesting caller, so the UI never
    # re-derives (and drifts from) the ``can_edit_ticket`` rule.
    can_edit: bool = False
    # Whether outbound mail can leave this ticket at all: its mailbox has to be a
    # connected Gmail account. False for a ticket logged by phone or one on a
    # webhook mailbox, where a send raises — the compose form asks first rather
    # than letting somebody write a message that cannot be delivered.
    can_send_email: bool = False


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


class DepartmentBucket(BaseModel):
    """The same open tickets, rolled up to the department that owes the action.

    A bucket board answers "which queue is this in"; a department board answers
    "who is behind", which is the question asked when there are three internal
    buckets owned by two departments. Rolled up here rather than in the frontend
    so the two views cannot disagree about the same tickets.

    External and terminal buckets have no department — nobody internal owes the
    action on a ticket waiting for a partner — so they are reported under
    ``department_id = None`` rather than dropped, and the two views still sum to
    the same total.
    """

    department_id: str | None = None
    department_name: str | None = None
    function_key: str | None = None
    #: The buckets folded into this row, in the workspace's own order.
    pending_with: list[str] = Field(default_factory=list)
    green: int = 0
    amber: int = 0
    red: int = 0
    total: int = 0


class ServiceDeskDashboard(BaseModel):
    stakeholders: list[StakeholderBucket] = Field(default_factory=list)
    #: The same numbers grouped by owning department. See `DepartmentBucket`.
    departments: list[DepartmentBucket] = Field(default_factory=list)
    tickets: list[DashboardTicket] = Field(default_factory=list)
    total_open: int = 0
    breaching: int = 0


# ==================== Org-level settings ====================

class TestStageSLA(BaseModel):
    """A deliberately short, test-only working-time threshold for one stage."""

    amber_minutes: int = Field(..., ge=1, le=240)
    red_minutes: int = Field(..., ge=2, le=240)

    @model_validator(mode="after")
    def _red_must_follow_amber(self):
        if self.red_minutes <= self.amber_minutes:
            raise ValueError("red_minutes must be greater than amber_minutes")
        return self


class TestSLAOverride(BaseModel):
    """Temporary minute rules, keyed by the workspace's own stakeholder slugs.

    Was three fixed fields named after insurance buckets (``kam``, ``insurer``,
    ``partner``), so a desk using any other vocabulary could not run a timed test
    at all. ``stages`` takes whichever buckets the workspace actually has; an
    insurance desk sending those same three slugs behaves exactly as before.

    The short expiry is an intentional safety rail: these values exist only to
    make a controlled test observable, never to replace the workspace's own
    operating target.
    """

    expires_at: datetime
    stages: dict[TaxonomySlug, TestStageSLA] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def _accept_legacy_stage_fields(cls, data):
        """Lift pre-``stages`` payloads and stored JSON into the map.

        Settings rows written before this change carry the three slugs at the top
        level. Reading one must not raise, or an in-flight test would break the
        settings page rather than simply expiring.
        """
        if not isinstance(data, dict) or data.get("stages") is not None:
            return data
        legacy = {k: data[k] for k in ("kam", "insurer", "partner") if isinstance(data.get(k), dict)}
        if legacy:
            data = {k: v for k, v in data.items() if k not in legacy}
            data["stages"] = legacy
        return data

    @model_validator(mode="after")
    def _needs_at_least_one_stage(self):
        if not self.stages:
            raise ValueError("test_sla must name at least one stage")
        return self

    @field_validator("expires_at")
    @classmethod
    def _must_be_a_short_future_expiry(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("expires_at must include a timezone")
        now = datetime.now(timezone.utc)
        expires_at = value.astimezone(timezone.utc)
        if expires_at <= now:
            raise ValueError("expires_at must be in the future")
        if expires_at > now + timedelta(hours=24):
            raise ValueError("test SLA overrides may last at most 24 hours")
        return expires_at

class ServiceDeskSettings(BaseModel):
    """Workspace-level Service Desk settings."""

    # Resolved, not raw. AI reading of desk mail follows the workspace's own AI
    # switch (Settings -> AI); the desk holds a veto, not a second opt-in. So
    # this is what is actually in force, and `workspace_ai_enabled` says where
    # it came from — otherwise a desk showing "on" that nobody switched on here
    # has nothing to explain itself with.
    ai_classification_enabled: bool = False
    workspace_ai_enabled: bool = True
    # Reading attachment *bytes* to build classifier previews stays its own
    # explicit yes. Classifying a subject reads text the desk was sent anyway;
    # opening the customer's PDF is a different question, and a workspace-wide
    # "AI is fine" must not answer it by inheritance.
    ai_attachment_previews_enabled: bool = False
    # Whether the desk's acknowledgement and closure carry a link to a public,
    # no-account view of the ticket. Off by default: turning it on is a decision
    # to serve ticket subjects, requester names and attachments to anyone
    # holding a URL, and no default should make that decision for a workspace.
    #
    # It governs *external* requesters only. A requester who is a member of the
    # workspace is always linked to the ticket in the app, which publishes
    # nothing — see ``service_desk_links.ensure_requester_url``.
    public_ticket_links_enabled: bool = False
    # Senders whose mail must not become tickets — infrastructure noise a desk has
    # decided it does not track, e.g. "no-reply@accounts.google.com". An entry with
    # an "@" is one address; without, a whole domain. Empty by default: this is a
    # list somebody writes, never one intake infers, because a counterparty's own
    # no-reply address carries the notices the desk exists to act on.
    ignored_senders: list[str] = Field(default_factory=list)
    # Whether intake may auto-create a second ticket when one email carries two
    # clearly different, high-confidence requests. Off by default: everything
    # else stays a single ticket flagged for triage, which is the safe outcome.
    auto_split_enabled: bool = False
    # What intake does when it cannot tell which account a ticket belongs to.
    #
    # "random" is the historical behaviour and stays the default so no existing
    # desk changes on upgrade — but it is the reason "assignment is not following
    # our master data" was so hard to see: a randomly-assigned ticket looks
    # exactly like a deliberately-assigned one. "unassigned" leaves it visibly
    # waiting; "desk_head" sends every unmatched ticket to one accountable
    # person. The reason is written to the ticket either way.
    unmatched_assignment: Literal["random", "unassigned", "desk_head"] = "random"
    # Whether the CALLER may edit master data / settings / templates, i.e. holds
    # can_manage_service_desk. Returned here so the Master Data page can hide
    # controls it would only get a 403 from; the server-side gate is still the
    # authority (api/service_desk.py::require_manage).
    can_manage: bool = False
    # How wide the caller's ticket view is: "all" (full-view or manager),
    # "function" (their department's pending-with queue), "assigned" (an owner
    # who sees only their own tickets) or "none" (in no department, so no ticket
    # can ever match). Lets the tickets page distinguish "nothing to do" from
    # "you only ever see your own" and from "nobody has placed you in a
    # department yet". Defaults to "all" so a response from an older server can
    # never raise a false alarm.
    scope: Literal["all", "assigned", "function", "none"] = "all"
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
    # Whether the desk wants the open-ticket digest at all. On by default — a
    # desk that has never opened these settings is better served by being told
    # what is open than by silence — but a real switch, which it previously was
    # not: no value turned the digest off, so three emails a day was a mail
    # filter's problem to solve.
    digest_enabled: bool = True
    digest_hours: list[int] = Field(default_factory=lambda: [9, 13, 17])
    # Members of the desk department who asked not to receive it. Membership is
    # how work is routed, not a statement about wanting three emails a day, and
    # leaving the department to escape the digest changes routing.
    digest_excluded_recipients: list[str] = Field(default_factory=list)
    # Addresses added by hand — a manager or client-services lead who wants the
    # summary without being in the department. They receive the desk-wide view,
    # so this is a deliberate disclosure rather than a subscription.
    digest_extra_recipients: list[str] = Field(default_factory=list)
    # How often Gmail-backed desk mailboxes are polled for new mail. Registering
    # a mailbox as intake is a statement about latency; before this it silently
    # inherited the 15-minute default a personal inbox uses.
    intake_poll_minutes: int = 2
    # The industry template this desk started from, and the nouns it uses for the
    # three master-data tables.
    industry_template: str | None = None
    terminology: dict[str, str] = Field(default_factory=dict)
    # The desk's own name, used in outbound email copy. Defaults to the
    # workspace name rather than a hardcoded company.
    desk_name: str | None = None
    # ``None`` means the workspace's own breach target is in force. Expired
    # values are deliberately omitted by the service and ignored by the clock.
    test_sla: TestSLAOverride | None = None
    # WHICH DEPARTMENT RUNS THIS DESK — the people incoming tickets are
    # auto-assigned to, and whose head receives the digest of everything open.
    #
    # Reported as resolved rather than raw, so the page shows who is actually
    # receiving work. `is_explicit` distinguishes a deliberate choice from the
    # fallback: with no setting the desk infers the department behind its first
    # internal queue, which is a reasonable guess and was previously the only
    # behaviour available — before that it was the literal function key
    # `ops_kam`, so every workspace that had not been set up from the insurance
    # template auto-assigned nothing at all.
    desk_department_id: str | None = None
    desk_department_name: str | None = None
    desk_department_is_explicit: bool = False


_HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"


class ServiceDeskSettingsUpdate(BaseModel):
    """All fields optional so the page can PATCH any one on its own."""

    # True clears the desk's veto so it follows the workspace switch again;
    # False is the veto. There is deliberately no way to pin AI *on* for the
    # desk while the workspace has it off — the gateway refuses that call
    # anyway, and storing it would recreate the second source of truth.
    ai_classification_enabled: bool | None = None
    ai_attachment_previews_enabled: bool | None = None
    public_ticket_links_enabled: bool | None = None
    auto_split_enabled: bool | None = None
    unmatched_assignment: Literal["random", "unassigned", "desk_head"] | None = None
    working_hours_start: str | None = Field(None, pattern=_HHMM)
    working_hours_end: str | None = Field(None, pattern=_HHMM)
    # Everything below was a module constant baked to one customer's operation:
    # "BSD" ticket ids, Asia/Kolkata day boundaries, a 2-business-day target.
    ticket_prefix: str | None = Field(None, pattern=r"^[A-Za-z][A-Za-z0-9]{0,9}$")
    timezone: str | None = Field(None, max_length=64)
    breach_red_days: float | None = Field(None, gt=0, le=60)
    breach_amber_days: float | None = Field(None, gt=0, le=60)
    digest_enabled: bool | None = None
    digest_hours: list[int] | None = None
    digest_excluded_recipients: list[str] | None = None
    digest_extra_recipients: list[str] | None = None
    intake_poll_minutes: int | None = Field(None, ge=1, le=60)
    terminology: dict[str, str] | None = None
    desk_name: str | None = Field(None, max_length=120)
    # A complete replacement of the list, not an addition — the settings page
    # holds the whole set, and a per-entry API would need a delete verb to undo a
    # mistake that silences a real requester.
    ignored_senders: list[str] | None = Field(None, max_length=200)
    # Send a complete replacement when starting or changing a test. Send only
    # ``clear_test_sla`` to remove it immediately after the test is complete.
    test_sla: TestSLAOverride | None = None
    clear_test_sla: bool = False
    # The department to receive incoming tickets. An empty string clears it and
    # puts the desk back on inferring one from its first internal queue — the
    # same convention `desk_name` uses for "go back to the default", since a JSON
    # null is indistinguishable from an absent field once it reaches the service.
    desk_department_id: str | None = Field(None, max_length=64)

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
        if self.clear_test_sla and self.test_sla is not None:
            raise ValueError("send either test_sla or clear_test_sla, not both")
        return self


class ServiceDeskTemplateVariable(BaseModel):
    """One placeholder and what a send renders when its value is missing."""

    name: str
    default: str = ""


class ServiceDeskTemplate(BaseModel):
    key: str
    name: str
    subject: str
    body: str
    variables: list[ServiceDeskTemplateVariable] = Field(default_factory=list)
    customised: bool = False


class ServiceDeskTemplateUpdate(BaseModel):
    subject: str = Field(..., min_length=1)
    body: str = Field(..., min_length=1)
