"""Forms models: Standalone forms module with Ticketing and CRM integration."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4
import secrets

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace
    from aexy.models.team import Team
    from aexy.models.crm import CRMObject, CRMRecord
    from aexy.models.ticketing import Ticket


# =============================================================================
# ENUMS
# =============================================================================

class FormAuthMode(str, Enum):
    """Authentication modes for public forms."""
    ANONYMOUS = "anonymous"
    EMAIL_VERIFICATION = "email_verification"


class FormTemplateType(str, Enum):
    """Pre-built form template types."""
    BUG_REPORT = "bug_report"
    FEATURE_REQUEST = "feature_request"
    SUPPORT = "support"
    CONTACT = "contact"
    LEAD_CAPTURE = "lead_capture"
    FEEDBACK = "feedback"
    CUSTOM = "custom"


class FormFieldType(str, Enum):
    """Form field types."""
    TEXT = "text"
    TEXTAREA = "textarea"
    EMAIL = "email"
    PHONE = "phone"
    NUMBER = "number"
    URL = "url"
    SELECT = "select"
    MULTISELECT = "multiselect"
    CHECKBOX = "checkbox"
    RADIO = "radio"
    FILE = "file"
    DATE = "date"
    DATETIME = "datetime"
    HIDDEN = "hidden"


class FormSubmissionStatus(str, Enum):
    """Status of form submission processing."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    PARTIALLY_FAILED = "partially_failed"
    FAILED = "failed"


class TicketAssignmentMode(str, Enum):
    """How tickets should be assigned."""
    NONE = "none"
    ONCALL = "oncall"
    ROUND_ROBIN = "round_robin"
    SPECIFIC_USER = "specific_user"


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def generate_public_token() -> str:
    """Generate a secure public URL token."""
    return secrets.token_urlsafe(16)


def generate_verification_token() -> str:
    """Generate a verification token for email verification."""
    return secrets.token_urlsafe(32)


# =============================================================================
# FORM MODEL
# =============================================================================

class Form(Base):
    """Standalone form configuration with multi-destination support."""

    __tablename__ = "forms"

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

    # Form identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Template base (null if fully custom)
    template_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Public access settings
    public_url_token: Mapped[str] = mapped_column(
        String(32),
        unique=True,
        nullable=False,
        default=generate_public_token,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Authentication settings
    auth_mode: Mapped[str] = mapped_column(
        String(50),
        default=FormAuthMode.ANONYMOUS.value,
        nullable=False,
    )
    require_email: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Form appearance
    theme: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {primaryColor, logoUrl, customCSS, headerText, backgroundColor, fontFamily}

    success_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    redirect_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ==========================================================================
    # TICKETING INTEGRATION
    # ==========================================================================

    # Enable/disable ticket creation
    auto_create_ticket: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Ticket configuration
    ticket_config: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {title_template, description_template, tags, custom_fields}

    # Default team for tickets
    default_team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Assignment mode
    ticket_assignment_mode: Mapped[str] = mapped_column(
        String(50),
        default=TicketAssignmentMode.NONE.value,
        nullable=False,
    )

    # Specific assignee (when assignment_mode is SPECIFIC_USER)
    ticket_assignee_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Default severity/priority for new tickets
    default_severity: Mapped[str | None] = mapped_column(String(50), nullable=True)
    default_priority: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Field mappings: form field -> ticket field
    ticket_field_mappings: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {form_field_key: "title"|"description"|"priority"|"severity"|"tags"|custom_field_key}

    # ==========================================================================
    # CRM RECORD INTEGRATION
    # ==========================================================================

    # Enable/disable CRM record creation
    auto_create_record: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Target CRM object for record creation
    crm_object_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_objects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Field mappings: form field -> CRM attribute
    crm_field_mappings: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {form_field_key: crm_attribute_slug}

    # Default record owner
    record_owner_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ==========================================================================
    # DEAL INTEGRATION
    # ==========================================================================

    # Enable/disable deal creation
    auto_create_deal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Deal pipeline and stage
    deal_pipeline_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
    )
    deal_stage_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
    )

    # Field mappings: form field -> deal attribute
    deal_field_mappings: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {form_field_key: deal_attribute_slug}

    # Link deal to created CRM record
    link_deal_to_record: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # ==========================================================================
    # AUTOMATION INTEGRATION
    # ==========================================================================

    # Enable automation triggers
    trigger_automations: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Specific automation IDs to trigger (empty = all matching automations)
    automation_ids: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )

    # ==========================================================================
    # EXTERNAL DESTINATIONS
    # ==========================================================================

    # External platform destinations (GitHub, Jira, Linear)
    destinations: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{type: "github"|"jira"|"linear", enabled: bool, config: {...}, field_mappings: {...}}]

    # ==========================================================================
    # FORM LOGIC
    # ==========================================================================

    # Conditional logic rules for field visibility
    conditional_rules: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{source_field, condition, value, target_field, action: "show"|"hide"|"require"}]

    # ==========================================================================
    # STATS & METADATA
    # ==========================================================================

    # Submission count cache
    submission_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Creator
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    default_team: Mapped["Team"] = relationship(
        "Team",
        foreign_keys=[default_team_id],
        lazy="selectin",
    )
    ticket_assignee: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[ticket_assignee_id],
        lazy="selectin",
    )
    record_owner: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[record_owner_id],
        lazy="selectin",
    )
    created_by: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[created_by_id],
        lazy="selectin",
    )
    crm_object: Mapped["CRMObject"] = relationship(
        "CRMObject",
        lazy="selectin",
    )
    fields: Mapped[list["FormField"]] = relationship(
        "FormField",
        back_populates="form",
        cascade="all, delete-orphan",
        order_by="FormField.position",
        lazy="selectin",
    )
    submissions: Mapped[list["FormSubmission"]] = relationship(
        "FormSubmission",
        back_populates="form",
        cascade="all, delete-orphan",
        lazy="noload",
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_form_slug"),
        Index("ix_forms_workspace_active", "workspace_id", "is_active"),
    )


# =============================================================================
# FORM FIELD MODEL
# =============================================================================

class FormField(Base):
    """Individual field in a form."""

    __tablename__ = "form_fields"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    form_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("forms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Field identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)  # Display label
    field_key: Mapped[str] = mapped_column(String(100), nullable=False)  # Unique key for submissions

    # Field type
    field_type: Mapped[str] = mapped_column(
        String(50),
        default=FormFieldType.TEXT.value,
        nullable=False,
    )

    # Display configuration
    placeholder: Mapped[str | None] = mapped_column(String(255), nullable=True)
    default_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    help_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Validation
    is_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    validation_rules: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {minLength, maxLength, pattern, min, max, allowedFileTypes, maxFileSize, customMessage}

    # For select/multiselect/radio
    options: Mapped[list | None] = mapped_column(
        JSONB,
        nullable=True,
    )  # [{value, label, color}]

    # Layout
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Width (for multi-column layouts)
    width: Mapped[str] = mapped_column(
        String(20),
        default="full",
        nullable=False,
    )  # "full", "half", "third", "two-thirds"

    # CRM attribute mapping (direct link)
    crm_attribute_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
    )

    # External platform mappings
    external_mappings: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {github: "title"|"body"|"labels", jira: "summary"|"description", linear: "title"|"description"}

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # Relationships
    form: Mapped["Form"] = relationship("Form", back_populates="fields")

    __table_args__ = (
        UniqueConstraint("form_id", "field_key", name="uq_form_field_key"),
        Index("ix_form_fields_form_position", "form_id", "position"),
    )


# =============================================================================
# FORM SUBMISSION MODEL
# =============================================================================

class FormSubmission(Base):
    """Record of a form submission with links to created resources."""

    __tablename__ = "form_submissions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    form_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("forms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Submission data
    data: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {field_key: value}

    # File attachments
    attachments: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{field_key, filename, url, size, mime_type}]

    # Submitter information
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Email verification
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verification_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Processing status
    status: Mapped[str] = mapped_column(
        String(50),
        default=FormSubmissionStatus.PENDING.value,
        nullable=False,
        index=True,
    )

    # Error tracking
    processing_errors: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{destination, error, timestamp}]

    # ==========================================================================
    # CREATED RESOURCES
    # ==========================================================================

    # Created ticket
    ticket_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("tickets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Created CRM record
    crm_record_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Created deal
    deal_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # External issues created
    external_issues: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{platform, issue_id, issue_url, created_at}]

    # Automations triggered
    automations_triggered: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{automation_id, automation_name, run_id, status, triggered_at}]

    # ==========================================================================
    # METADATA
    # ==========================================================================

    # Request metadata
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    referrer_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    # UTM parameters for tracking
    utm_params: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {source, medium, campaign, term, content}

    # Timestamps
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    form: Mapped["Form"] = relationship("Form", back_populates="submissions")
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    ticket: Mapped["Ticket"] = relationship("Ticket", lazy="selectin", foreign_keys=[ticket_id])
    crm_record: Mapped["CRMRecord"] = relationship(
        "CRMRecord",
        lazy="selectin",
        foreign_keys=[crm_record_id],
    )
    deal: Mapped["CRMRecord"] = relationship(
        "CRMRecord",
        lazy="selectin",
        foreign_keys=[deal_id],
    )

    __table_args__ = (
        Index("ix_form_submissions_form_submitted", "form_id", "submitted_at"),
        Index("ix_form_submissions_workspace_submitted", "workspace_id", "submitted_at"),
        Index("ix_form_submissions_email", "email"),
        Index("ix_form_submissions_data_gin", "data", postgresql_using="gin"),
    )


# =============================================================================
# FORM AUTOMATION LINK MODEL
# =============================================================================

class FormAutomationLink(Base):
    """Links a form to specific automations that should trigger on submission."""

    __tablename__ = "form_automation_links"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    form_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("forms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    automation_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_automations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Link enabled/disabled
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Optional condition overrides (run automation only if conditions met)
    conditions: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{field_key, operator, value, conjunction}]

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("form_id", "automation_id", name="uq_form_automation_link"),
    )
