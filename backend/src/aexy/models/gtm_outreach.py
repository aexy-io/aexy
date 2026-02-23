"""GTM Outreach models: Multi-channel sequences, enrollments, and step executions."""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


# =============================================================================
# ENUMS
# =============================================================================

class SequenceStatus(str, Enum):
    """Outreach sequence lifecycle status."""
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class SequenceChannel(str, Enum):
    """Available outreach channels."""
    EMAIL = "email"
    LINKEDIN = "linkedin"
    SMS = "sms"
    WAIT = "wait"


class SequenceAction(str, Enum):
    """Step action types per channel."""
    SEND_EMAIL = "send_email"
    LINKEDIN_VIEW = "linkedin_view"
    LINKEDIN_CONNECT = "linkedin_connect"
    LINKEDIN_MESSAGE = "linkedin_message"
    SEND_SMS = "send_sms"
    WAIT = "wait"


class EnrollmentStatus(str, Enum):
    """Enrollment state machine status."""
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    REPLIED = "replied"
    BOUNCED = "bounced"
    UNSUBSCRIBED = "unsubscribed"
    EXITED = "exited"
    FAILED = "failed"


class StepExecutionStatus(str, Enum):
    """Step execution status."""
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    OPENED = "opened"
    CLICKED = "clicked"
    REPLIED = "replied"
    BOUNCED = "bounced"
    FAILED = "failed"
    SKIPPED = "skipped"


# =============================================================================
# OUTREACH SEQUENCE
# =============================================================================

class OutreachSequence(Base):
    """Multi-channel outreach sequence definition."""

    __tablename__ = "outreach_sequences"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Sequence identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SequenceStatus.DRAFT.value,
    )

    # Steps definition (JSONB array)
    # Each step: {step_index, channel, action, delay_days, delay_hours, config, conditions}
    steps: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # Sequence settings
    settings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    # settings schema: {
    #   send_window: {start_hour: 9, end_hour: 17, timezone: "America/New_York"},
    #   exit_on_reply: true,
    #   exit_on_bounce: true,
    #   exit_on_unsubscribe: true,
    #   max_enrollments: null,
    #   compliance_check: true,
    # }

    # Channels enabled
    channels: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    # Stats (denormalized for fast dashboard queries)
    enrolled_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    active_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    replied_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bounced_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Creator
    created_by: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_outreach_seq_ws_status", "workspace_id", "status"),
    )


# =============================================================================
# OUTREACH ENROLLMENT
# =============================================================================

class OutreachEnrollment(Base):
    """Per-contact enrollment in a sequence — tracks progression through steps."""

    __tablename__ = "outreach_enrollments"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    sequence_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("outreach_sequences.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Contact identity
    record_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # State machine
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=EnrollmentStatus.ACTIVE.value,
    )
    current_step_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    next_step_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Temporal workflow tracking
    temporal_workflow_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Exit reason
    exit_reason: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Timestamps
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Extra data
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_enrollment_seq_status", "sequence_id", "status"),
        Index("ix_enrollment_record", "workspace_id", "record_id"),
        Index("ix_enrollment_next_step", "status", "next_step_at"),
    )


# =============================================================================
# OUTREACH STEP EXECUTION
# =============================================================================

class OutreachStepExecution(Base):
    """Individual step execution within an enrollment."""

    __tablename__ = "outreach_step_executions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    enrollment_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("outreach_enrollments.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Step identity
    step_index: Mapped[int] = mapped_column(Integer, nullable=False)
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)

    # Execution status
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=StepExecutionStatus.PENDING.value,
    )

    # Tracking
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps for each stage
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    clicked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Extra data
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_step_exec_enrollment", "enrollment_id", "step_index"),
        Index("ix_step_exec_ws_channel", "workspace_id", "channel"),
    )
