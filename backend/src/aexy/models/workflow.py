"""Workflow models for visual automation builder."""

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4
import enum

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Boolean, Enum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base


class WorkflowExecutionStatus(str, enum.Enum):
    """Status of a workflow execution."""
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"  # Waiting for wait node to complete
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class WorkflowStepStatus(str, enum.Enum):
    """Status of a single workflow step."""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"
    WAITING = "waiting"  # For wait nodes
    RETRYING = "retrying"  # Scheduled for retry


# Retry configuration defaults
DEFAULT_RETRY_CONFIG = {
    "max_retries": 3,
    "initial_delay_seconds": 60,
    "backoff_multiplier": 2.0,
    "max_delay_seconds": 3600,
    "retryable_errors": ["timeout", "rate_limit", "server_error", "connection_error"],
}


# Retryable error types
RETRYABLE_ERROR_TYPES = {
    "timeout": ["timeout", "timed out", "deadline exceeded"],
    "rate_limit": ["rate limit", "too many requests", "429"],
    "server_error": ["500", "502", "503", "504", "internal server error", "service unavailable"],
    "connection_error": ["connection refused", "connection reset", "network unreachable"],
}


class WorkflowExecution(Base):
    """Tracks individual workflow executions for persistence and resumption."""

    __tablename__ = "crm_workflow_executions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workflow_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_workflow_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    automation_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_automations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    record_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_records.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Execution status
    status: Mapped[str] = mapped_column(
        String(20),
        default=WorkflowExecutionStatus.PENDING.value,
        nullable=False,
        index=True,
    )

    # Current position in workflow (for resumption)
    current_node_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    next_node_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Execution context (preserved between pauses)
    context: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )  # WorkflowExecutionContext as dict

    # Trigger information
    trigger_data: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )

    # For wait node scheduling
    resume_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )
    wait_event_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    wait_timeout_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Execution metrics
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    paused_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Error tracking
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_node_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Dry run flag
    is_dry_run: Mapped[bool] = mapped_column(Boolean, default=False)

    # Who triggered this execution
    triggered_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    workflow = relationship("WorkflowDefinition", back_populates="executions")
    automation = relationship("CRMAutomation", back_populates="workflow_executions")
    steps = relationship(
        "WorkflowExecutionStep",
        back_populates="execution",
        cascade="all, delete-orphan",
        order_by="WorkflowExecutionStep.executed_at",
    )
    event_subscriptions = relationship(
        "WorkflowEventSubscription",
        back_populates="execution",
        cascade="all, delete-orphan",
    )


class WorkflowEventSubscription(Base):
    """Tracks event subscriptions for workflows waiting for external events."""

    __tablename__ = "crm_workflow_event_subscriptions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    execution_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_workflow_executions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Event matching
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    # Filter criteria (e.g., {"record_id": "...", "email_id": "..."})
    event_filter: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Timeout
    timeout_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    matched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    matched_event_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationship
    execution = relationship("WorkflowExecution", back_populates="event_subscriptions")


class WorkflowExecutionStep(Base):
    """Tracks individual node executions within a workflow execution."""

    __tablename__ = "crm_workflow_execution_steps"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    execution_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_workflow_executions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    node_id: Mapped[str] = mapped_column(String(100), nullable=False)
    node_type: Mapped[str] = mapped_column(String(50), nullable=False)
    node_label: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Step status
    status: Mapped[str] = mapped_column(
        String(20),
        default=WorkflowStepStatus.PENDING.value,
        nullable=False,
    )

    # Step data
    input_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    output_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # For condition/branch nodes
    condition_result: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    selected_branch: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Error tracking
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # timeout, rate_limit, etc.

    # Retry tracking
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, default=3)
    next_retry_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )

    # Timing
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    executed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationship
    execution = relationship("WorkflowExecution", back_populates="steps")


class WorkflowDefinition(Base):
    """Stores React Flow workflow definitions for automations."""

    __tablename__ = "crm_workflow_definitions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    automation_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_automations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # React Flow state
    nodes: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{id, type, position: {x, y}, data: {...}}]

    edges: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{id, source, target, sourceHandle, targetHandle, label}]

    viewport: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )  # {x, y, zoom}

    # Precomputed execution order (topological sort) - updated on save
    execution_order: Mapped[list | None] = mapped_column(
        JSONB,
        nullable=True,
    )  # [node_id, node_id, ...] in execution order

    # Version tracking
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Retry configuration for failed actions
    retry_config: Mapped[dict] = mapped_column(
        JSONB,
        default=lambda: DEFAULT_RETRY_CONFIG.copy(),
        nullable=False,
    )

    # Failure notification
    notify_on_failure: Mapped[bool] = mapped_column(Boolean, default=False)
    failure_notification_emails: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    automation = relationship("CRMAutomation", back_populates="workflow_definition")
    executions = relationship(
        "WorkflowExecution",
        back_populates="workflow",
        cascade="all, delete-orphan",
        lazy="noload",
    )
    versions = relationship(
        "WorkflowVersion",
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="desc(WorkflowVersion.version)",
        lazy="noload",
    )


class WorkflowDeadLetter(Base):
    """Dead letter queue for permanently failed workflow executions."""

    __tablename__ = "crm_workflow_dead_letter"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    execution_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_workflow_executions.id", ondelete="CASCADE"),
        nullable=False,
    )
    step_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_workflow_execution_steps.id", ondelete="SET NULL"),
        nullable=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    automation_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_automations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Error details
    error_type: Mapped[str] = mapped_column(String(50), nullable=False)
    error_message: Mapped[str] = mapped_column(Text, nullable=False)
    node_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    node_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Context for manual retry
    input_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    execution_context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Resolution tracking
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending, resolved, ignored
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    execution = relationship("WorkflowExecution")


class WorkflowTemplate(Base):
    """Pre-built workflow templates for common automation patterns."""

    __tablename__ = "crm_workflow_templates"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=True,  # NULL means system-wide template
        index=True,
    )

    # Template info
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)  # lucide icon name

    # React Flow state (same format as WorkflowDefinition)
    nodes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    edges: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    viewport: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Template metadata
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, index=True)  # Built-in vs user-created
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    use_count: Mapped[int] = mapped_column(Integer, default=0)

    # Created by
    created_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class WorkflowVersion(Base):
    """Stores historical snapshots of workflow definitions for version history."""

    __tablename__ = "crm_workflow_versions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workflow_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_workflow_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Version number (1, 2, 3, etc.)
    version: Mapped[int] = mapped_column(Integer, nullable=False)

    # Snapshot of the workflow at this version
    nodes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    edges: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    viewport: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Change summary (auto-generated or user-provided)
    change_summary: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Stats for quick display
    node_count: Mapped[int] = mapped_column(Integer, default=0)
    edge_count: Mapped[int] = mapped_column(Integer, default=0)

    # Who created this version
    created_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timestamp
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationship
    workflow = relationship("WorkflowDefinition", back_populates="versions")
    creator = relationship("Developer", foreign_keys=[created_by])

    # Unique constraint on workflow_id + version
    __table_args__ = (
        {"extend_existing": True},
    )


# Maximum versions to keep per workflow
MAX_WORKFLOW_VERSIONS = 20


# Node type definitions for reference
NODE_TYPES = {
    "trigger": {
        "label": "Trigger",
        "description": "Entry point for the workflow",
        "color": "#10B981",  # green
        "subtypes": [
            "record_created",
            "record_updated",
            "record_deleted",
            "field_changed",
            "stage_changed",
            "scheduled",
            "webhook_received",
            "form_submitted",
            "email_received",
            "manual",
        ],
    },
    "action": {
        "label": "Action",
        "description": "Perform an action",
        "color": "#3B82F6",  # blue
        "subtypes": [
            "update_record",
            "create_record",
            "delete_record",
            "send_email",
            "send_slack",
            "send_sms",
            "create_task",
            "add_to_list",
            "remove_from_list",
            "enroll_sequence",
            "unenroll_sequence",
            "webhook_call",
            "assign_owner",
        ],
    },
    "condition": {
        "label": "Condition",
        "description": "Check a condition (if/else)",
        "color": "#F59E0B",  # amber
    },
    "wait": {
        "label": "Wait",
        "description": "Delay execution",
        "color": "#8B5CF6",  # purple
        "subtypes": [
            "duration",  # wait X hours/days
            "datetime",  # wait until specific date/time
            "event",     # wait for event (email opened, etc.)
        ],
    },
    "agent": {
        "label": "AI Agent",
        "description": "Run an AI agent",
        "color": "#EC4899",  # pink
        "subtypes": [
            "sales_outreach",
            "lead_scoring",
            "email_drafter",
            "data_enrichment",
            "custom",
        ],
    },
    "branch": {
        "label": "Branch",
        "description": "Split into multiple paths",
        "color": "#6366F1",  # indigo
    },
    "join": {
        "label": "Join",
        "description": "Wait for parallel branches to complete",
        "color": "#14B8A6",  # teal
        "subtypes": [
            "all",      # Wait for all incoming branches
            "any",      # Continue when any branch completes
            "count",    # Continue when N branches complete
        ],
    },
}

# Condition operators
CONDITION_OPERATORS = [
    {"value": "equals", "label": "equals"},
    {"value": "not_equals", "label": "does not equal"},
    {"value": "contains", "label": "contains"},
    {"value": "not_contains", "label": "does not contain"},
    {"value": "starts_with", "label": "starts with"},
    {"value": "ends_with", "label": "ends with"},
    {"value": "is_empty", "label": "is empty"},
    {"value": "is_not_empty", "label": "is not empty"},
    {"value": "gt", "label": "greater than"},
    {"value": "gte", "label": "greater than or equal"},
    {"value": "lt", "label": "less than"},
    {"value": "lte", "label": "less than or equal"},
    {"value": "in", "label": "is in list"},
    {"value": "not_in", "label": "is not in list"},
]
