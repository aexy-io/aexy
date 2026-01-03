"""Ticketing models: Forms, Tickets, Responses, Metrics, and SLA Policies."""

from datetime import date, datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4
import secrets

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from devograph.core.database import Base

if TYPE_CHECKING:
    from devograph.models.developer import Developer
    from devograph.models.team import Team
    from devograph.models.workspace import Workspace
    from devograph.models.sprint import SprintTask


class TicketFormAuthMode(str, Enum):
    """Authentication modes for public forms."""
    ANONYMOUS = "anonymous"
    EMAIL_VERIFICATION = "email_verification"


class TicketFormTemplateType(str, Enum):
    """Pre-built form template types."""
    BUG_REPORT = "bug_report"
    FEATURE_REQUEST = "feature_request"
    SUPPORT = "support"


class TicketStatus(str, Enum):
    """Ticket lifecycle statuses."""
    NEW = "new"
    ACKNOWLEDGED = "acknowledged"
    IN_PROGRESS = "in_progress"
    WAITING_ON_SUBMITTER = "waiting_on_submitter"
    RESOLVED = "resolved"
    CLOSED = "closed"


class TicketPriority(str, Enum):
    """Ticket priority levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class TicketSeverity(str, Enum):
    """Ticket severity/impact levels."""
    CRITICAL = "critical"  # System down, major impact
    HIGH = "high"          # Significant impact, workaround available
    MEDIUM = "medium"      # Moderate impact
    LOW = "low"            # Minor impact


class TicketFieldType(str, Enum):
    """Form field types."""
    TEXT = "text"
    TEXTAREA = "textarea"
    EMAIL = "email"
    SELECT = "select"
    MULTISELECT = "multiselect"
    CHECKBOX = "checkbox"
    FILE = "file"
    DATE = "date"


def generate_public_token() -> str:
    """Generate a secure public URL token."""
    return secrets.token_urlsafe(16)


class TicketForm(Base):
    """Custom ticket form configuration."""

    __tablename__ = "ticket_forms"

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
        default=TicketFormAuthMode.ANONYMOUS.value,
        nullable=False,
    )
    require_email: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Form appearance
    theme: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {primaryColor, logoUrl, customCSS, headerText}

    success_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    redirect_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Destination settings (external platforms)
    destinations: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{type: "github"|"jira"|"linear", config: {...}}]

    # Auto-create task settings
    auto_create_task: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    default_team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Auto-assign to on-call
    auto_assign_oncall: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Default severity/priority for new tickets
    default_severity: Mapped[str | None] = mapped_column(String(50), nullable=True)
    default_priority: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Conditional logic rules
    conditional_rules: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{fieldId, condition, value, targetFieldId, action}]

    # Stats cache
    submission_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Creator
    created_by_id: Mapped[str] = mapped_column(
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
    default_team: Mapped["Team"] = relationship("Team", lazy="selectin")
    created_by: Mapped["Developer"] = relationship("Developer", lazy="selectin")
    fields: Mapped[list["TicketFormField"]] = relationship(
        "TicketFormField",
        back_populates="form",
        cascade="all, delete-orphan",
        order_by="TicketFormField.position",
        lazy="selectin",
    )
    tickets: Mapped[list["Ticket"]] = relationship(
        "Ticket",
        back_populates="form",
        cascade="all, delete-orphan",
        lazy="noload",
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_ticket_form_slug"),
    )


class TicketFormField(Base):
    """Individual field in a ticket form."""

    __tablename__ = "ticket_form_fields"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    form_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("ticket_forms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Field identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    field_key: Mapped[str] = mapped_column(String(100), nullable=False)

    # Field type
    field_type: Mapped[str] = mapped_column(
        String(50),
        default=TicketFieldType.TEXT.value,
        nullable=False,
    )

    # Configuration
    placeholder: Mapped[str | None] = mapped_column(String(255), nullable=True)
    default_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    help_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Validation
    is_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    validation_rules: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {minLength, maxLength, pattern, allowedFileTypes, maxFileSize}

    # For select/multiselect
    options: Mapped[list | None] = mapped_column(
        JSONB,
        nullable=True,
    )  # [{value, label}]

    # Ordering
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Field mapping to external platforms
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
    form: Mapped["TicketForm"] = relationship("TicketForm", back_populates="fields")

    __table_args__ = (
        UniqueConstraint("form_id", "field_key", name="uq_ticket_form_field_key"),
    )


class Ticket(Base):
    """Submitted ticket from a form."""

    __tablename__ = "tickets"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    form_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("ticket_forms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Ticket number (workspace-scoped, sequential)
    ticket_number: Mapped[int] = mapped_column(Integer, nullable=False)

    # Submitter info
    submitter_email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    submitter_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verification_token: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Submission data
    field_values: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {field_key: value}

    attachments: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{filename, url, size, type}]

    # Status lifecycle
    status: Mapped[str] = mapped_column(
        String(50),
        default=TicketStatus.NEW.value,
        nullable=False,
        index=True,
    )

    priority: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        index=True,
    )

    severity: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        index=True,
    )

    # Assignment
    assignee_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # External sync tracking
    external_issues: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{platform, issue_id, issue_url, synced_at}]

    # Linked sprint task
    linked_task_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("sprint_tasks.id", ondelete="SET NULL"),
        nullable=True,
    )

    # SLA tracking
    first_response_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    sla_due_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    sla_breached: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Metadata
    source_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    referrer_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

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
    form: Mapped["TicketForm"] = relationship("TicketForm", back_populates="tickets")
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    assignee: Mapped["Developer"] = relationship("Developer", lazy="selectin")
    team: Mapped["Team"] = relationship("Team", lazy="selectin")
    linked_task: Mapped["SprintTask"] = relationship("SprintTask", lazy="selectin")
    responses: Mapped[list["TicketResponse"]] = relationship(
        "TicketResponse",
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="TicketResponse.created_at",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "ticket_number", name="uq_ticket_number"),
    )


class TicketResponse(Base):
    """Response or comment on a ticket."""

    __tablename__ = "ticket_responses"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    ticket_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Response author
    author_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    author_email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Internal note vs public response
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Content
    content: Mapped[str] = mapped_column(Text, nullable=False)
    attachments: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )

    # Status change tracking
    old_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    new_status: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="responses")
    author: Mapped["Developer"] = relationship("Developer", lazy="selectin")


class TicketMetrics(Base):
    """Daily metrics snapshot for tickets."""

    __tablename__ = "ticket_metrics"

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
    form_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("ticket_forms.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # Volume metrics
    tickets_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tickets_resolved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tickets_closed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tickets_reopened: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Response time metrics (in minutes)
    avg_first_response_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    median_first_response_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    p90_first_response_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Resolution time metrics (in minutes)
    avg_resolution_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    median_resolution_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    p90_resolution_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)

    # SLA metrics
    sla_met_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sla_breached_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Status breakdown
    status_counts: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {status: count}

    priority_counts: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {priority: count}

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    form: Mapped["TicketForm"] = relationship("TicketForm", lazy="selectin")
    team: Mapped["Team"] = relationship("Team", lazy="selectin")

    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "form_id", "team_id", "snapshot_date",
            name="uq_ticket_metrics_snapshot"
        ),
    )


class SLAPolicy(Base):
    """SLA policy definitions for tickets."""

    __tablename__ = "sla_policies"

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

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Conditions for when this SLA applies
    conditions: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {form_ids: [], priorities: [], team_ids: []}

    # SLA targets (in minutes)
    first_response_target_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resolution_target_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Business hours (null = 24/7)
    business_hours: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )  # {timezone, days: [0-6], startHour, endHour}

    # Priority (lower = higher priority when multiple match)
    priority_order: Mapped[int] = mapped_column(Integer, default=100, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

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

    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_sla_policy_name"),
    )


class EscalationLevel(str, Enum):
    """Escalation notification levels."""
    LEVEL_1 = "level_1"  # Initial notification
    LEVEL_2 = "level_2"  # First escalation
    LEVEL_3 = "level_3"  # Second escalation
    LEVEL_4 = "level_4"  # Critical escalation


class EscalationMatrix(Base):
    """Escalation rules for ticket notifications based on severity."""

    __tablename__ = "escalation_matrices"

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

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Conditions for when this escalation applies
    severity_levels: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # ["critical", "high"]

    # Escalation rules
    rules: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{level, delay_minutes, notify_users: [id], notify_teams: [id], notify_oncall: bool, channels: ["email", "slack"]}]

    # Optional: Only apply to specific forms/teams
    form_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    team_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    priority_order: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

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

    __table_args__ = (
        UniqueConstraint("workspace_id", "name", name="uq_escalation_matrix_name"),
    )


class TicketEscalation(Base):
    """Tracks escalation history for a ticket."""

    __tablename__ = "ticket_escalations"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    ticket_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    escalation_matrix_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("escalation_matrices.id", ondelete="SET NULL"),
        nullable=True,
    )

    level: Mapped[str] = mapped_column(String(50), nullable=False)
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Who was notified
    notified_users: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    notified_channels: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # Whether escalation was acknowledged
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    acknowledged_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    ticket: Mapped["Ticket"] = relationship("Ticket", lazy="selectin")
    escalation_matrix: Mapped["EscalationMatrix"] = relationship("EscalationMatrix", lazy="selectin")
    acknowledged_by: Mapped["Developer"] = relationship("Developer", lazy="selectin")
