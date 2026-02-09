"""Recurring reminder models for compliance and commitment tracking.

This module provides models for:
- Reminder (recurring task definitions)
- ReminderInstance (individual occurrences)
- ReminderEscalation (escalation tracking)
- ControlOwner (domain-specific ownership)
- DomainTeamMapping (team assignments by domain)
- AssignmentRule (custom assignment logic)
"""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.team import Team
    from aexy.models.workspace import Workspace


class ReminderStatus(str, Enum):
    """Status of a reminder definition."""
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class ReminderPriority(str, Enum):
    """Priority level of a reminder."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ReminderFrequency(str, Enum):
    """Frequency of reminder occurrences."""
    ONCE = "once"
    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMI_ANNUAL = "semi_annual"
    YEARLY = "yearly"
    CUSTOM = "custom"  # Uses cron_expression


class InstanceStatus(str, Enum):
    """Status of a reminder instance."""
    PENDING = "pending"
    NOTIFIED = "notified"
    ACKNOWLEDGED = "acknowledged"
    COMPLETED = "completed"
    SKIPPED = "skipped"
    ESCALATED = "escalated"
    OVERDUE = "overdue"


class ReminderEscalationLevel(str, Enum):
    """Escalation levels for overdue reminders."""
    L1 = "l1"  # First escalation (e.g., team lead)
    L2 = "l2"  # Second escalation (e.g., manager)
    L3 = "l3"  # Third escalation (e.g., director)
    L4 = "l4"  # Fourth escalation (e.g., VP/executive)


class AssignmentStrategy(str, Enum):
    """How owners are assigned to reminder instances."""
    FIXED = "fixed"  # Always the same owner
    ROUND_ROBIN = "round_robin"  # Rotate among team members
    ON_CALL = "on_call"  # Assign to current on-call person
    DOMAIN_MAPPING = "domain_mapping"  # Based on domain/control owner
    CUSTOM_RULE = "custom_rule"  # Uses assignment rules


class ReminderCategory(str, Enum):
    """Category of reminder for grouping and filtering."""
    COMPLIANCE = "compliance"
    SECURITY = "security"
    AUDIT = "audit"
    OPERATIONAL = "operational"
    TRAINING = "training"
    REVIEW = "review"
    CUSTOM = "custom"


class AssignmentRule(Base):
    """Custom assignment rules for reminders.

    Defines rules for automatically assigning owners based on
    conditions like category, domain, tags, etc.
    """

    __tablename__ = "reminder_assignment_rules"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Rule configuration (JSONB)
    # {
    #   "conditions": [
    #     {"field": "category", "operator": "equals", "value": "compliance"},
    #     {"field": "domain", "operator": "contains", "value": "security"}
    #   ],
    #   "assign_to": {"type": "team", "id": "..."},
    #   "priority": 10
    # }
    rule_config: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )

    # Priority for rule ordering (higher = evaluated first)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
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
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        lazy="selectin",
    )


class Reminder(Base):
    """A recurring reminder definition.

    Represents a commitment or compliance requirement that needs
    to be completed on a regular schedule.
    """

    __tablename__ = "reminders"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )

    # Basic info
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(
        String(50),
        default=ReminderCategory.CUSTOM.value,
        nullable=False,
    )
    priority: Mapped[str] = mapped_column(
        String(50),
        default=ReminderPriority.MEDIUM.value,
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(50),
        default=ReminderStatus.ACTIVE.value,
        nullable=False,
        index=True,
    )

    # Schedule configuration
    frequency: Mapped[str] = mapped_column(
        String(50),
        default=ReminderFrequency.MONTHLY.value,
        nullable=False,
    )
    cron_expression: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )  # For custom frequency
    timezone: Mapped[str] = mapped_column(
        String(100),
        default="UTC",
        nullable=False,
    )

    # Date range
    start_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    end_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )  # None = no end date

    # Next occurrence (pre-calculated for efficient querying)
    next_occurrence: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )

    # Assignment configuration
    assignment_strategy: Mapped[str] = mapped_column(
        String(50),
        default=AssignmentStrategy.FIXED.value,
        nullable=False,
    )
    default_owner_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    default_team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Domain for control owner mapping
    domain: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    # Escalation configuration (JSONB)
    # {
    #   "enabled": true,
    #   "levels": [
    #     {"level": "l1", "delay_hours": 24, "notify_owner_id": "...", "notify_team_id": "..."},
    #     {"level": "l2", "delay_hours": 48, "notify_owner_id": "...", "slack_channel": "#escalations"}
    #   ]
    # }
    escalation_config: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )

    # Notification configuration (JSONB)
    # {
    #   "channels": ["in_app", "email", "slack"],
    #   "notify_before_hours": [24, 1],
    #   "slack_channel": "#reminders"
    # }
    notification_config: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )

    # Behavior flags
    requires_acknowledgment: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    requires_evidence: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    # For round-robin tracking
    round_robin_index: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    # Source tracking (for auto-generated reminders)
    source_type: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )  # e.g., "questionnaire", "manual"
    source_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
    )  # e.g., questionnaire_response_id
    source_question_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
    )

    # Extra data (tags, custom fields, etc.)
    # Note: DB column is 'metadata' but Python attribute is 'extra_data' due to SQLAlchemy reserved name
    extra_data: Mapped[dict] = mapped_column(
        "metadata",  # Maps to the database column 'metadata'
        JSONB,
        default=dict,
        nullable=False,
    )

    # Audit
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
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        lazy="selectin",
    )
    default_owner: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[default_owner_id],
        lazy="selectin",
    )
    default_team: Mapped["Team | None"] = relationship(
        "Team",
        foreign_keys=[default_team_id],
        lazy="selectin",
    )
    created_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[created_by_id],
        lazy="selectin",
    )
    instances: Mapped[list["ReminderInstance"]] = relationship(
        "ReminderInstance",
        back_populates="reminder",
        cascade="all, delete-orphan",
        lazy="select",
    )


class ReminderInstance(Base):
    """A single occurrence of a recurring reminder.

    Created when a reminder is due, tracks the lifecycle of that
    specific occurrence through notification, acknowledgment, and completion.
    """

    __tablename__ = "reminder_instances"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    reminder_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("reminders.id", ondelete="CASCADE"),
        index=True,
    )

    # When this instance is due
    due_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    # Current status
    status: Mapped[str] = mapped_column(
        String(50),
        default=InstanceStatus.PENDING.value,
        nullable=False,
        index=True,
    )

    # Current escalation level (if escalated)
    current_escalation_level: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
    )

    # Assignment
    assigned_owner_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    assigned_team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Notification tracking
    initial_notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    notification_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    # Acknowledgment tracking
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    acknowledged_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    acknowledgment_notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Completion tracking
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    completion_notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Skip tracking
    skipped_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    skipped_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    skip_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Evidence tracking
    evidence_links: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{url: "...", title: "...", uploaded_at: "...", uploaded_by: "..."}]

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
    reminder: Mapped["Reminder"] = relationship(
        "Reminder",
        back_populates="instances",
        lazy="selectin",
    )
    assigned_owner: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[assigned_owner_id],
        lazy="selectin",
    )
    assigned_team: Mapped["Team | None"] = relationship(
        "Team",
        foreign_keys=[assigned_team_id],
        lazy="selectin",
    )
    acknowledged_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[acknowledged_by_id],
        lazy="selectin",
    )
    completed_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[completed_by_id],
        lazy="selectin",
    )
    skipped_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[skipped_by_id],
        lazy="selectin",
    )
    escalations: Mapped[list["ReminderEscalation"]] = relationship(
        "ReminderEscalation",
        back_populates="instance",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class ReminderEscalation(Base):
    """Record of an escalation for a reminder instance.

    Tracks when escalations occur and who was notified.
    """

    __tablename__ = "reminder_escalations"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    instance_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("reminder_instances.id", ondelete="CASCADE"),
        index=True,
    )

    # Escalation level
    level: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )

    # Who was notified
    escalated_to_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    escalated_to_team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
    )

    # When
    notified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # How (JSONB)
    # {"channels": ["email", "slack"], "slack_channel": "#escalations"}
    notification_channels: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )

    # Response tracking
    responded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    response_notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    instance: Mapped["ReminderInstance"] = relationship(
        "ReminderInstance",
        back_populates="escalations",
        lazy="selectin",
    )
    escalated_to: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[escalated_to_id],
        lazy="selectin",
    )
    escalated_to_team: Mapped["Team | None"] = relationship(
        "Team",
        foreign_keys=[escalated_to_team_id],
        lazy="selectin",
    )


class ControlOwner(Base):
    """Maps controls/domains to their owners.

    Used for automatic assignment of reminders based on
    the control or domain they relate to.
    """

    __tablename__ = "reminder_control_owners"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )

    # Control identification
    control_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )  # External control ID (e.g., SOC2-CC1.1)
    control_name: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )
    domain: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )  # e.g., "security", "compliance", "infrastructure"

    # Ownership
    primary_owner_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    backup_owner_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="SET NULL"),
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
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        lazy="selectin",
    )
    primary_owner: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[primary_owner_id],
        lazy="selectin",
    )
    backup_owner: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[backup_owner_id],
        lazy="selectin",
    )
    team: Mapped["Team | None"] = relationship(
        "Team",
        foreign_keys=[team_id],
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "control_id",
            name="uq_control_owner_workspace_control"
        ),
    )


class DomainTeamMapping(Base):
    """Maps domains to responsible teams.

    Used for automatic team assignment when using
    domain-based assignment strategy.
    """

    __tablename__ = "reminder_domain_team_mappings"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )

    domain: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )
    team_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Priority for handling overlapping domains
    priority: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
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
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        lazy="selectin",
    )
    team: Mapped["Team"] = relationship(
        "Team",
        lazy="selectin",
    )

    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "domain", "team_id",
            name="uq_domain_team_mapping_workspace_domain_team"
        ),
    )


class ReminderSuggestion(Base):
    """Auto-generated reminder suggestions from questionnaire analysis.

    Created when analyzing questionnaire responses to suggest
    reminders for compliance commitments.
    """

    __tablename__ = "reminder_suggestions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )

    # Source
    questionnaire_response_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
        index=True,
    )
    question_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
    )
    answer_text: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Suggested reminder details
    suggested_title: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )
    suggested_description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    suggested_category: Mapped[str] = mapped_column(
        String(50),
        default=ReminderCategory.COMPLIANCE.value,
        nullable=False,
    )
    suggested_frequency: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    suggested_domain: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    # Confidence score (0-1)
    confidence_score: Mapped[float] = mapped_column(
        Float,
        default=0.5,
        nullable=False,
    )

    # Status
    status: Mapped[str] = mapped_column(
        String(50),
        default="pending",
        nullable=False,
        index=True,
    )  # pending, accepted, rejected

    # If accepted, link to created reminder
    created_reminder_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("reminders.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Review tracking
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    reviewed_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    rejection_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        lazy="selectin",
    )
    created_reminder: Mapped["Reminder | None"] = relationship(
        "Reminder",
        lazy="selectin",
    )
    reviewed_by: Mapped["Developer | None"] = relationship(
        "Developer",
        lazy="selectin",
    )
