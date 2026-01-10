"""CRM models: Objects, Records, Lists, Automations, Sequences, and Activities."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace
    from aexy.models.workflow import WorkflowDefinition, WorkflowExecution


# =============================================================================
# ENUMS
# =============================================================================

class CRMObjectType(str, Enum):
    """Standard CRM object types."""
    COMPANY = "company"
    PERSON = "person"
    DEAL = "deal"
    PROJECT = "project"
    CUSTOM = "custom"


class CRMAttributeType(str, Enum):
    """Attribute data types for CRM fields."""
    TEXT = "text"
    TEXTAREA = "textarea"
    NUMBER = "number"
    CURRENCY = "currency"
    DATE = "date"
    TIMESTAMP = "timestamp"
    CHECKBOX = "checkbox"
    SELECT = "select"
    MULTI_SELECT = "multi_select"
    STATUS = "status"
    EMAIL = "email"
    PHONE = "phone"
    URL = "url"
    LOCATION = "location"
    PERSON_NAME = "person_name"
    RATING = "rating"
    RECORD_REFERENCE = "record_reference"
    FILE = "file"
    AI_COMPUTED = "ai_computed"


class CRMListViewType(str, Enum):
    """View types for CRM lists."""
    TABLE = "table"
    KANBAN = "kanban"
    CALENDAR = "calendar"
    TIMELINE = "timeline"
    GALLERY = "gallery"


class CRMActivityType(str, Enum):
    """Types of CRM activities."""
    # Communication events
    EMAIL_SENT = "email.sent"
    EMAIL_RECEIVED = "email.received"
    EMAIL_OPENED = "email.opened"
    EMAIL_CLICKED = "email.clicked"
    EMAIL_BOUNCED = "email.bounced"
    CALL_MADE = "call.made"
    CALL_RECEIVED = "call.received"
    CALL_MISSED = "call.missed"
    MEETING_SCHEDULED = "meeting.scheduled"
    MEETING_COMPLETED = "meeting.completed"
    MEETING_CANCELLED = "meeting.cancelled"
    # Record events
    RECORD_CREATED = "record.created"
    RECORD_UPDATED = "record.updated"
    RECORD_DELETED = "record.deleted"
    RECORD_VIEWED = "record.viewed"
    NOTE_ADDED = "note.added"
    TASK_CREATED = "task.created"
    TASK_COMPLETED = "task.completed"
    STAGE_CHANGED = "stage.changed"
    # Engagement events
    PAGE_VIEWED = "page.viewed"
    FORM_SUBMITTED = "form.submitted"
    FILE_DOWNLOADED = "file.downloaded"
    LINK_CLICKED = "link.clicked"
    # System events
    AUTOMATION_TRIGGERED = "automation.triggered"
    SEQUENCE_ENROLLED = "sequence.enrolled"
    SEQUENCE_COMPLETED = "sequence.completed"
    ENRICHMENT_COMPLETED = "enrichment.completed"


class CRMAutomationTriggerType(str, Enum):
    """Types of automation triggers."""
    # Record events
    RECORD_CREATED = "record.created"
    RECORD_UPDATED = "record.updated"
    RECORD_DELETED = "record.deleted"
    FIELD_CHANGED = "field.changed"
    # List events
    LIST_ENTRY_ADDED = "list_entry.added"
    LIST_ENTRY_REMOVED = "list_entry.removed"
    STATUS_CHANGED = "status.changed"
    # Time events
    SCHEDULE_DAILY = "schedule.daily"
    SCHEDULE_WEEKLY = "schedule.weekly"
    DATE_APPROACHING = "date.approaching"
    DATE_PASSED = "date.passed"
    # External events
    WEBHOOK_RECEIVED = "webhook.received"
    FORM_SUBMITTED = "form.submitted"
    # Communication events
    EMAIL_OPENED = "email.opened"
    EMAIL_CLICKED = "email.clicked"
    EMAIL_REPLIED = "email.replied"


class CRMAutomationActionType(str, Enum):
    """Types of automation actions."""
    # Record actions
    CREATE_RECORD = "create_record"
    UPDATE_RECORD = "update_record"
    DELETE_RECORD = "delete_record"
    LINK_RECORDS = "link_records"
    # Communication
    SEND_EMAIL = "send_email"
    SEND_SLACK = "send_slack"
    SEND_SMS = "send_sms"
    # Task/notification
    CREATE_TASK = "create_task"
    NOTIFY_USER = "notify_user"
    NOTIFY_TEAM = "notify_team"
    # Sequence
    ENROLL_IN_SEQUENCE = "enroll_in_sequence"
    REMOVE_FROM_SEQUENCE = "remove_from_sequence"
    # List
    ADD_TO_LIST = "add_to_list"
    REMOVE_FROM_LIST = "remove_from_list"
    # Integration
    WEBHOOK_CALL = "webhook_call"
    API_REQUEST = "api_request"
    # AI
    ENRICH_RECORD = "enrich_record"
    CLASSIFY_RECORD = "classify_record"
    GENERATE_SUMMARY = "generate_summary"


class CRMSequenceStepType(str, Enum):
    """Types of sequence steps."""
    EMAIL = "email"
    TASK = "task"
    WAIT = "wait"
    CONDITION = "condition"
    ACTION = "action"


class CRMSequenceEnrollmentStatus(str, Enum):
    """Status of sequence enrollment."""
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    EXITED = "exited"
    FAILED = "failed"


# =============================================================================
# OBJECT & ATTRIBUTE MODELS
# =============================================================================

class CRMObject(Base):
    """CRM Object definition - defines a type like Company, Person, Deal, etc."""

    __tablename__ = "crm_objects"

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

    # Object identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    plural_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Object type (standard or custom)
    object_type: Mapped[str] = mapped_column(
        String(50),
        default=CRMObjectType.CUSTOM.value,
        nullable=False,
    )

    # Display settings
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)  # lucide icon name
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)  # hex color

    # Primary display field (attribute_id to use as title)
    primary_attribute_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
    )

    # Settings
    settings: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {enableActivities, enableNotes, enableTasks, enableFiles}

    # Stats
    record_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # System flag (can't be deleted)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
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
    attributes: Mapped[list["CRMAttribute"]] = relationship(
        "CRMAttribute",
        back_populates="object",
        cascade="all, delete-orphan",
        order_by="CRMAttribute.position",
        lazy="selectin",
    )
    records: Mapped[list["CRMRecord"]] = relationship(
        "CRMRecord",
        back_populates="object",
        cascade="all, delete-orphan",
        lazy="noload",
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_crm_object_slug"),
    )


class CRMAttribute(Base):
    """CRM Attribute definition - defines a field on an object."""

    __tablename__ = "crm_attributes"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    object_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_objects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Attribute identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Attribute type
    attribute_type: Mapped[str] = mapped_column(
        String(50),
        default=CRMAttributeType.TEXT.value,
        nullable=False,
    )

    # Type-specific configuration
    config: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    # Examples:
    # text: {maxLength, placeholder}
    # number: {min, max, precision, format}
    # currency: {currencyCode, precision}
    # date: {format, allowPast, allowFuture}
    # select/multi_select: {options: [{value, label, color}]}
    # status: {statuses: [{value, label, color}]}
    # record_reference: {targetObjectId, allowMultiple}
    # ai_computed: {prompt, inputAttributes, model, refreshTrigger}

    # Validation
    is_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_unique: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    default_value: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Display settings
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_filterable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_sortable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Width for table views (in pixels, null = auto)
    column_width: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # System attribute (can't be deleted)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

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
    object: Mapped["CRMObject"] = relationship("CRMObject", back_populates="attributes")

    __table_args__ = (
        UniqueConstraint("object_id", "slug", name="uq_crm_attribute_slug"),
    )


# =============================================================================
# RECORD MODELS
# =============================================================================

class CRMRecord(Base):
    """CRM Record - an individual entry of an object type."""

    __tablename__ = "crm_records"

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
    object_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_objects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # All attribute values stored as JSONB for flexibility
    # Format: {attribute_slug: value}
    values: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )

    # Cached primary display value (for quick sorting/searching)
    display_name: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)

    # Owner/creator
    owner_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Soft delete support
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Source tracking (manual, email_sync, api, import, etc.)
    source: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)

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
    object: Mapped["CRMObject"] = relationship("CRMObject", back_populates="records")
    owner: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[owner_id],
        lazy="selectin",
    )
    created_by: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[created_by_id],
        lazy="selectin",
    )
    activities: Mapped[list["CRMActivity"]] = relationship(
        "CRMActivity",
        back_populates="record",
        cascade="all, delete-orphan",
        lazy="noload",
    )
    notes: Mapped[list["CRMNote"]] = relationship(
        "CRMNote",
        back_populates="record",
        cascade="all, delete-orphan",
        lazy="noload",
    )

    __table_args__ = (
        Index("ix_crm_records_values_gin", "values", postgresql_using="gin"),
    )


class CRMRecordRelation(Base):
    """Links between CRM records (many-to-many relationships)."""

    __tablename__ = "crm_record_relations"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )

    # Source record
    source_record_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Target record
    target_record_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Relationship type (optional label)
    relation_type: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Relation metadata (named to avoid conflict with SQLAlchemy's reserved 'metadata')
    relation_metadata: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("source_record_id", "target_record_id", "relation_type", name="uq_crm_record_relation"),
    )


class CRMNote(Base):
    """Notes attached to CRM records."""

    __tablename__ = "crm_notes"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    record_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Note content (rich text as HTML or markdown)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Author
    author_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Pinned notes appear at top
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

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
    record: Mapped["CRMRecord"] = relationship("CRMRecord", back_populates="notes")
    author: Mapped["Developer"] = relationship("Developer", lazy="selectin")


# =============================================================================
# LIST MODELS
# =============================================================================

class CRMList(Base):
    """CRM List - a saved view/collection of records."""

    __tablename__ = "crm_lists"

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
    object_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_objects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # List identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    color: Mapped[str | None] = mapped_column(String(7), nullable=True)

    # View configuration
    view_type: Mapped[str] = mapped_column(
        String(50),
        default=CRMListViewType.TABLE.value,
        nullable=False,
    )

    # Filters (applied to records)
    filters: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{attribute, operator, value, conjunction}]

    # Sorts
    sorts: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{attribute, direction, nulls}]

    # Visible columns (attribute slugs)
    visible_attributes: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )

    # Kanban-specific settings
    group_by_attribute: Mapped[str | None] = mapped_column(String(100), nullable=True)
    kanban_settings: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {showEmptyColumns, columnOrder, wipLimits}

    # Calendar-specific settings
    date_attribute: Mapped[str | None] = mapped_column(String(100), nullable=True)
    end_date_attribute: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Privacy
    is_private: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    owner_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Stats
    entry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

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
    object: Mapped["CRMObject"] = relationship("CRMObject", lazy="selectin")
    owner: Mapped["Developer"] = relationship("Developer", lazy="selectin")
    entries: Mapped[list["CRMListEntry"]] = relationship(
        "CRMListEntry",
        back_populates="list",
        cascade="all, delete-orphan",
        lazy="noload",
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_crm_list_slug"),
    )


class CRMListEntry(Base):
    """Entry in a CRM list (record membership)."""

    __tablename__ = "crm_list_entries"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    list_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_lists.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    record_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Position for manual ordering
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # List-specific overrides (e.g., status in a kanban)
    list_values: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )

    # Added by
    added_by_id: Mapped[str | None] = mapped_column(
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

    # Relationships
    list: Mapped["CRMList"] = relationship("CRMList", back_populates="entries")

    __table_args__ = (
        UniqueConstraint("list_id", "record_id", name="uq_crm_list_entry"),
    )


# =============================================================================
# ACTIVITY MODEL
# =============================================================================

class CRMActivity(Base):
    """Activity log for CRM records."""

    __tablename__ = "crm_activities"

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
    record_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Activity type
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # Actor (who performed the action)
    actor_type: Mapped[str] = mapped_column(
        String(50),
        default="user",
        nullable=False,
    )  # user, system, contact, integration
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    actor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Activity details
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Activity metadata (type-specific data, named to avoid SQLAlchemy reserved word)
    activity_metadata: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    # Examples:
    # email: {subject, from, to, cc, opened, clicked}
    # call: {duration, recording_url, transcript}
    # record_updated: {changes: [{field, old, new}]}
    # stage_changed: {old_stage, new_stage}

    # When the activity occurred
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    record: Mapped["CRMRecord"] = relationship("CRMRecord", back_populates="activities")


# =============================================================================
# AUTOMATION MODELS
# =============================================================================

class CRMAutomation(Base):
    """Automation workflow definition."""

    __tablename__ = "crm_automations"

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

    # Automation identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Target object (optional - some automations are global)
    object_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_objects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Trigger configuration
    trigger_type: Mapped[str] = mapped_column(String(50), nullable=False)
    trigger_config: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    # Examples:
    # record.created: {objectId}
    # field.changed: {objectId, attributeSlug, fromValue, toValue}
    # schedule.daily: {time, timezone}
    # webhook.received: {endpointId}

    # Conditions (filter which records trigger the automation)
    conditions: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{attribute, operator, value, conjunction}]

    # Actions to perform
    actions: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )
    # [{type, config, order}]
    # Examples:
    # send_email: {templateId, to, subject}
    # update_record: {fields: {slug: value}}
    # create_task: {title, assigneeId, dueDate}
    # webhook_call: {url, method, headers, body}

    # Error handling
    error_handling: Mapped[str] = mapped_column(
        String(50),
        default="stop",
        nullable=False,
    )  # stop, continue, retry

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Rate limiting
    run_limit_per_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    runs_this_month: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Creator
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Stats
    total_runs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    successful_runs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_runs: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

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
    object: Mapped["CRMObject"] = relationship("CRMObject", lazy="selectin")
    created_by: Mapped["Developer"] = relationship("Developer", lazy="selectin")
    runs: Mapped[list["CRMAutomationRun"]] = relationship(
        "CRMAutomationRun",
        back_populates="automation",
        cascade="all, delete-orphan",
        lazy="noload",
    )
    workflow_definition: Mapped["WorkflowDefinition"] = relationship(
        "WorkflowDefinition",
        back_populates="automation",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="noload",
    )
    workflow_executions: Mapped[list["WorkflowExecution"]] = relationship(
        "WorkflowExecution",
        back_populates="automation",
        cascade="all, delete-orphan",
        lazy="noload",
    )


class CRMAutomationRun(Base):
    """Log of automation executions."""

    __tablename__ = "crm_automation_runs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    automation_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_automations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Triggering record (if applicable)
    record_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Trigger details
    trigger_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Execution status
    status: Mapped[str] = mapped_column(
        String(50),
        default="pending",
        nullable=False,
    )  # pending, running, completed, failed

    # Execution log
    steps_executed: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{actionType, status, result, error, executedAt}]

    # Error details
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timing
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    automation: Mapped["CRMAutomation"] = relationship("CRMAutomation", back_populates="runs")


# =============================================================================
# SEQUENCE MODELS
# =============================================================================

class CRMSequence(Base):
    """Multi-step campaign sequence."""

    __tablename__ = "crm_sequences"

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

    # Sequence identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Target object (usually Person or Company)
    object_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_objects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Exit conditions
    exit_conditions: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{type: "reply_received"|"meeting_booked"|"deal_created"|"custom", config}]

    # Scheduling settings
    settings: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    # {
    #   sendWindow: {start: "09:00", end: "17:00"},
    #   sendDays: ["mon", "tue", "wed", "thu", "fri"],
    #   timezone: "America/New_York",
    #   skipHolidays: true
    # }

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Creator
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Stats
    total_enrollments: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active_enrollments: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_enrollments: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

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
    object: Mapped["CRMObject"] = relationship("CRMObject", lazy="selectin")
    created_by: Mapped["Developer"] = relationship("Developer", lazy="selectin")
    steps: Mapped[list["CRMSequenceStep"]] = relationship(
        "CRMSequenceStep",
        back_populates="sequence",
        cascade="all, delete-orphan",
        order_by="CRMSequenceStep.position",
        lazy="selectin",
    )
    enrollments: Mapped[list["CRMSequenceEnrollment"]] = relationship(
        "CRMSequenceEnrollment",
        back_populates="sequence",
        cascade="all, delete-orphan",
        lazy="noload",
    )


class CRMSequenceStep(Base):
    """Individual step in a sequence."""

    __tablename__ = "crm_sequence_steps"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    sequence_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_sequences.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Step type
    step_type: Mapped[str] = mapped_column(
        String(50),
        default=CRMSequenceStepType.EMAIL.value,
        nullable=False,
    )

    # Position in sequence
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Step configuration
    config: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    # email: {templateId, subject, body, fromName}
    # task: {title, description, assigneeId, priority}
    # wait: {duration: {value, unit}, businessHoursOnly}
    # condition: {attribute, operator, value, trueBranch, falseBranch}
    # action: {actionType, actionConfig}

    # Delay before this step (after previous step completes)
    delay_value: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    delay_unit: Mapped[str] = mapped_column(
        String(20),
        default="days",
        nullable=False,
    )  # minutes, hours, days

    # Stats
    total_executions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    successful_executions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

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
    sequence: Mapped["CRMSequence"] = relationship("CRMSequence", back_populates="steps")


class CRMSequenceEnrollment(Base):
    """Record enrollment in a sequence."""

    __tablename__ = "crm_sequence_enrollments"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    sequence_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_sequences.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    record_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Current state
    status: Mapped[str] = mapped_column(
        String(50),
        default=CRMSequenceEnrollmentStatus.ACTIVE.value,
        nullable=False,
        index=True,
    )

    # Current position in sequence
    current_step_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_sequence_steps.id", ondelete="SET NULL"),
        nullable=True,
    )

    # When next step should execute
    next_step_scheduled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )

    # Exit reason (if exited)
    exit_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Execution history
    steps_completed: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{stepId, status, executedAt, result}]

    # Enrolled by
    enrolled_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    enrolled_by_automation_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_automations.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timestamps
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    exited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    sequence: Mapped["CRMSequence"] = relationship("CRMSequence", back_populates="enrollments")

    __table_args__ = (
        UniqueConstraint("sequence_id", "record_id", name="uq_crm_sequence_enrollment"),
    )


# =============================================================================
# WEBHOOK MODELS
# =============================================================================

class CRMWebhook(Base):
    """Outgoing webhook subscription."""

    __tablename__ = "crm_webhooks"

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

    # Webhook identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Target URL
    url: Mapped[str] = mapped_column(String(2000), nullable=False)

    # Events to subscribe to
    events: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # ["record.created", "record.updated", ...]

    # Secret for signature verification
    secret: Mapped[str] = mapped_column(String(64), nullable=False)

    # Custom headers
    headers: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Retry configuration
    retry_config: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # {maxAttempts, backoffMultiplier}

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Stats
    total_deliveries: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    successful_deliveries: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_deliveries: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

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


class CRMWebhookDelivery(Base):
    """Log of webhook delivery attempts."""

    __tablename__ = "crm_webhook_deliveries"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    webhook_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_webhooks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Event details
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Delivery status
    status: Mapped[str] = mapped_column(
        String(50),
        default="pending",
        nullable=False,
    )  # pending, success, failed

    # Response details
    response_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Retry tracking
    attempt_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Timing
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
