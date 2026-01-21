"""Learning management models for manager controls."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.team import Team
    from aexy.models.workspace import Workspace


class GoalStatus(str, Enum):
    """Learning goal status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    OVERDUE = "overdue"


class GoalType(str, Enum):
    """Learning goal types."""
    COURSE_COMPLETION = "course_completion"  # Complete N courses
    HOURS_SPENT = "hours_spent"  # Spend N hours learning
    SKILL_ACQUISITION = "skill_acquisition"  # Acquire specific skills
    CERTIFICATION = "certification"  # Get certified
    PATH_COMPLETION = "path_completion"  # Complete a learning path
    CUSTOM = "custom"  # Custom goal


class ApprovalStatus(str, Enum):
    """Course approval status."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class ApprovalRequestType(str, Enum):
    """Types of approval requests."""
    COURSE = "course"
    CERTIFICATION = "certification"
    CONFERENCE = "conference"
    TRAINING = "training"
    OTHER = "other"


class TransactionType(str, Enum):
    """Budget transaction types."""
    ALLOCATION = "allocation"  # Initial budget allocation
    ADJUSTMENT = "adjustment"  # Manual adjustment
    EXPENSE = "expense"  # Spending from budget
    REFUND = "refund"  # Refund back to budget
    TRANSFER_IN = "transfer_in"  # Transfer from another budget
    TRANSFER_OUT = "transfer_out"  # Transfer to another budget


class LearningGoal(Base):
    """Manager-set learning goals for developers.

    Tracks goals set by managers for their team members
    with progress tracking and due dates.
    """

    __tablename__ = "learning_goals"

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
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )
    set_by_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        index=True,
    )

    # Goal details
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    goal_type: Mapped[str] = mapped_column(
        String(50),
        default=GoalType.CUSTOM.value,
    )

    # Target configuration (flexible JSON based on goal type)
    # Examples:
    # - course_completion: {"course_ids": [...], "count": 5}
    # - hours_spent: {"hours": 40, "category": "python"}
    # - skill_acquisition: {"skills": ["kubernetes", "docker"]}
    # - certification: {"certification_id": "...", "passing_score": 80}
    # - path_completion: {"learning_path_id": "..."}
    target_config: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Progress tracking
    progress_percentage: Mapped[int] = mapped_column(Integer, default=0)
    progress_data: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # Detailed progress data
    current_value: Mapped[int] = mapped_column(Integer, default=0)
    target_value: Mapped[int] = mapped_column(Integer, default=0)

    # Timeline
    due_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Status
    status: Mapped[str] = mapped_column(
        String(50),
        default=GoalStatus.PENDING.value,
        index=True,
    )

    # Priority and visibility
    priority: Mapped[int] = mapped_column(Integer, default=0)  # 0-4, higher = more important
    is_visible_to_developer: Mapped[bool] = mapped_column(Boolean, default=True)

    # Metadata
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
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

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")
    developer: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[developer_id],
    )
    set_by: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[set_by_id],
    )


class CourseApprovalRequest(Base):
    """Course approval workflow.

    Manages requests from developers for course approvals
    with budget considerations.
    """

    __tablename__ = "course_approval_requests"

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
    requester_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )
    approver_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Request type
    request_type: Mapped[str] = mapped_column(
        String(50),
        default=ApprovalRequestType.COURSE.value,
    )

    # Course/resource details
    course_title: Mapped[str] = mapped_column(String(500))
    course_provider: Mapped[str | None] = mapped_column(String(255), nullable=True)
    course_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    course_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Cost
    estimated_cost_cents: Mapped[int] = mapped_column(Integer, default=0)
    actual_cost_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="USD")

    # Time commitment
    estimated_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Business justification
    justification: Mapped[str | None] = mapped_column(Text, nullable=True)
    skills_to_gain: Mapped[list[str]] = mapped_column(JSONB, default=list)
    linked_goal_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("learning_goals.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Status
    status: Mapped[str] = mapped_column(
        String(50),
        default=ApprovalStatus.PENDING.value,
        index=True,
    )

    # Approval details
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    rejected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Budget link
    budget_transaction_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("learning_budget_transactions.id", ondelete="SET NULL"),
        nullable=True,
    )

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

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace")
    requester: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[requester_id],
    )
    approver: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[approver_id],
    )
    decided_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[decided_by_id],
    )
    linked_goal: Mapped["LearningGoal | None"] = relationship("LearningGoal")
    budget_transaction: Mapped["LearningBudgetTransaction | None"] = relationship(
        "LearningBudgetTransaction",
    )


class LearningBudget(Base):
    """Learning budget management.

    Tracks allocated budgets for learning at developer or team level
    per fiscal period.
    """

    __tablename__ = "learning_budgets"

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

    # Budget owner (either developer or team, not both)
    developer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # Budget details
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Fiscal period
    fiscal_year: Mapped[int] = mapped_column(Integer)
    fiscal_quarter: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )  # None means full year

    # Amounts (in cents to avoid floating point issues)
    budget_cents: Mapped[int] = mapped_column(Integer, default=0)
    spent_cents: Mapped[int] = mapped_column(Integer, default=0)
    reserved_cents: Mapped[int] = mapped_column(Integer, default=0)  # For pending approvals
    currency: Mapped[str] = mapped_column(String(3), default="USD")

    # Settings
    allow_overspend: Mapped[bool] = mapped_column(Boolean, default=False)
    overspend_limit_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    auto_approve_under_cents: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )  # Auto-approve requests under this amount
    requires_manager_approval: Mapped[bool] = mapped_column(Boolean, default=True)

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
    developer: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[developer_id],
    )
    team: Mapped["Team | None"] = relationship("Team")
    created_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[created_by_id],
    )
    transactions: Mapped[list["LearningBudgetTransaction"]] = relationship(
        "LearningBudgetTransaction",
        back_populates="budget",
        cascade="all, delete-orphan",
    )

    @property
    def remaining_cents(self) -> int:
        """Calculate remaining budget."""
        return self.budget_cents - self.spent_cents - self.reserved_cents

    @property
    def utilization_percentage(self) -> float:
        """Calculate budget utilization percentage."""
        if self.budget_cents == 0:
            return 0.0
        return (self.spent_cents / self.budget_cents) * 100


class LearningBudgetTransaction(Base):
    """Budget transaction tracking.

    Records all transactions against learning budgets for audit purposes.
    """

    __tablename__ = "learning_budget_transactions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    budget_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("learning_budgets.id", ondelete="CASCADE"),
        index=True,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )

    # Transaction details
    transaction_type: Mapped[str] = mapped_column(
        String(50),
        index=True,
    )
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="USD")

    # Description
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Links to source
    approval_request_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
        index=True,
    )
    related_transaction_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
    )  # For refunds, transfers

    # Who made this transaction
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Balance snapshot at time of transaction
    balance_after_cents: Mapped[int] = mapped_column(Integer)

    # Metadata
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True,
    )

    # Relationships
    budget: Mapped["LearningBudget"] = relationship(
        "LearningBudget",
        back_populates="transactions",
    )
    workspace: Mapped["Workspace"] = relationship("Workspace")
    created_by: Mapped["Developer | None"] = relationship("Developer")
