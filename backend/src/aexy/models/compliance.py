"""Learning compliance and certification models."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.career import LearningPath
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace


class AssignmentStatus(str, Enum):
    """Training assignment status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    OVERDUE = "overdue"
    WAIVED = "waived"


class CertificationStatus(str, Enum):
    """Developer certification status."""
    ACTIVE = "active"
    EXPIRED = "expired"
    EXPIRING_SOON = "expiring_soon"
    REVOKED = "revoked"


class AppliesTo(str, Enum):
    """Training applies to types."""
    ALL = "all"
    TEAM = "team"
    ROLE = "role"
    INDIVIDUAL = "individual"


class AuditActionType(str, Enum):
    """Audit log action types."""
    # Training actions
    TRAINING_CREATED = "training_created"
    TRAINING_UPDATED = "training_updated"
    TRAINING_DELETED = "training_deleted"
    TRAINING_ASSIGNED = "training_assigned"
    TRAINING_COMPLETED = "training_completed"
    TRAINING_WAIVED = "training_waived"
    TRAINING_ACKNOWLEDGED = "training_acknowledged"
    # Certification actions
    CERTIFICATION_ADDED = "certification_added"
    CERTIFICATION_UPDATED = "certification_updated"
    CERTIFICATION_EXPIRED = "certification_expired"
    CERTIFICATION_RENEWED = "certification_renewed"
    CERTIFICATION_REVOKED = "certification_revoked"
    # Goal actions
    GOAL_CREATED = "goal_created"
    GOAL_UPDATED = "goal_updated"
    GOAL_COMPLETED = "goal_completed"
    # Approval actions
    APPROVAL_REQUESTED = "approval_requested"
    APPROVAL_APPROVED = "approval_approved"
    APPROVAL_REJECTED = "approval_rejected"


class MandatoryTraining(Base):
    """Mandatory training definitions.

    Defines training requirements that apply to specific groups
    of developers within a workspace.
    """

    __tablename__ = "mandatory_training"

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
    learning_path_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("learning_paths.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Training details
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Who this applies to
    applies_to_type: Mapped[str] = mapped_column(
        String(50),
        default=AppliesTo.ALL.value,
    )  # "all", "team", "role", "individual"
    applies_to_ids: Mapped[list[str]] = mapped_column(
        ARRAY(UUID(as_uuid=False)),
        default=list,
    )  # Team IDs, role names, or developer IDs

    # Due date configuration
    due_days_after_assignment: Mapped[int] = mapped_column(
        Integer,
        default=30,
    )  # Days to complete after assignment
    recurring_months: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )  # If set, training recurs every N months
    fixed_due_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )  # Fixed due date for all assignees

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Metadata
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")
    learning_path: Mapped["LearningPath | None"] = relationship("LearningPath")
    created_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[created_by_id],
    )
    assignments: Mapped[list["TrainingAssignment"]] = relationship(
        "TrainingAssignment",
        back_populates="mandatory_training",
        cascade="all, delete-orphan",
    )


class TrainingAssignment(Base):
    """Individual training assignments.

    Tracks a specific developer's progress on mandatory training.
    """

    __tablename__ = "training_assignments"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    mandatory_training_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("mandatory_training.id", ondelete="CASCADE"),
        index=True,
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )

    # Due date and status
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(
        String(50),
        default=AssignmentStatus.PENDING.value,
        index=True,
    )  # "pending", "in_progress", "completed", "overdue", "waived"

    # Progress tracking
    progress_percentage: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Waiver information
    waived_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    waived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    waiver_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metadata
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    reminder_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    mandatory_training: Mapped["MandatoryTraining"] = relationship(
        "MandatoryTraining",
        back_populates="assignments",
    )
    developer: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[developer_id],
    )
    waived_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[waived_by_id],
    )
    workspace: Mapped["Workspace"] = relationship("Workspace")


class Certification(Base):
    """Certification definitions.

    Defines certifications that can be tracked for developers.
    """

    __tablename__ = "certifications"

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

    # Certification details
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    issuing_authority: Mapped[str] = mapped_column(String(255))
    validity_months: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )  # None means never expires
    renewal_required: Mapped[bool] = mapped_column(Boolean, default=False)

    # Categorization
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    skill_tags: Mapped[list[str]] = mapped_column(JSONB, default=list)

    # Requirements
    prerequisites: Mapped[list[str]] = mapped_column(
        JSONB,
        default=list,
    )  # List of certification IDs
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)

    # Metadata
    external_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")
    created_by: Mapped["Developer | None"] = relationship("Developer")
    developer_certifications: Mapped[list["DeveloperCertification"]] = relationship(
        "DeveloperCertification",
        back_populates="certification",
        cascade="all, delete-orphan",
    )


class DeveloperCertification(Base):
    """Developer certification tracking.

    Tracks individual developer certifications with expiry dates.
    """

    __tablename__ = "developer_certifications"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )
    certification_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("certifications.id", ondelete="CASCADE"),
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )

    # Certification details
    issued_date: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expiry_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(50),
        default=CertificationStatus.ACTIVE.value,
        index=True,
    )  # "active", "expired", "expiring_soon", "revoked"

    # Verification
    credential_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verification_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    verified_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Document storage
    certificate_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    # Metadata
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)  # If applicable
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    renewal_reminder_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    developer: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[developer_id],
    )
    certification: Mapped["Certification"] = relationship(
        "Certification",
        back_populates="developer_certifications",
    )
    verified_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[verified_by_id],
    )
    workspace: Mapped["Workspace"] = relationship("Workspace")


class LearningAuditLog(Base):
    """Audit trail for learning-related actions.

    Provides a comprehensive audit trail for compliance purposes.
    """

    __tablename__ = "learning_audit_logs"

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
    actor_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        index=True,
    )

    # Action details
    action_type: Mapped[str] = mapped_column(String(100), index=True)
    target_type: Mapped[str] = mapped_column(
        String(50),
    )  # "training", "assignment", "certification", "goal", "approval"
    target_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        index=True,
    )

    # Change tracking
    old_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Context
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(50), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
    )

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")
    actor: Mapped["Developer"] = relationship("Developer")
