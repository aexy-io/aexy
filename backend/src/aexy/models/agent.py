"""AI Agent models for LangGraph-based automation agents."""

from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace


class AgentType(str, Enum):
    """Types of pre-built agents."""
    SALES_OUTREACH = "sales_outreach"
    LEAD_SCORING = "lead_scoring"
    EMAIL_DRAFTER = "email_drafter"
    DATA_ENRICHMENT = "data_enrichment"
    CUSTOM = "custom"


class AgentExecutionStatus(str, Enum):
    """Status of agent execution."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CRMAgent(Base):
    """AI Agent definition for CRM automation."""

    __tablename__ = "crm_agents"

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

    # Agent identity
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_type: Mapped[str] = mapped_column(String(50), nullable=False)  # AgentType enum value

    # System agents are pre-built and cannot be deleted
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Agent configuration
    goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Available tools for this agent
    tools: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # ["crm_search", "send_email", "enrich_company", ...]

    # LangGraph configuration
    max_iterations: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=300, nullable=False)
    model: Mapped[str] = mapped_column(String(100), default="claude-3-sonnet-20240229", nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Creator
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Stats
    total_executions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    successful_executions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed_executions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_duration_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

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
    created_by: Mapped["Developer"] = relationship("Developer", lazy="selectin")
    executions: Mapped[list["CRMAgentExecution"]] = relationship(
        "CRMAgentExecution",
        back_populates="agent",
        cascade="all, delete-orphan",
        lazy="noload",
    )


class CRMAgentExecution(Base):
    """Log of agent executions."""

    __tablename__ = "crm_agent_executions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    agent_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Context
    record_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
        index=True,
    )
    triggered_by: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "automation", "workflow", "manual"
    trigger_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
    )

    # Input/Output
    input_context: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    output_result: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )

    # Execution trace
    steps: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{tool, input, output, timestamp, duration_ms}, ...]

    # Status
    status: Mapped[str] = mapped_column(
        String(50),
        default="pending",
        nullable=False,
    )  # AgentExecutionStatus enum value
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timing
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Token usage
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    agent: Mapped["CRMAgent"] = relationship("CRMAgent", back_populates="executions")


class UserWritingStyle(Base):
    """User's personal writing style profile for email personalization."""

    __tablename__ = "user_writing_styles"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Style profile extracted from analyzing user's emails
    style_profile: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
        nullable=False,
    )
    # {
    #   formality: "formal" | "neutral" | "casual",
    #   tone: "professional" | "friendly" | "direct",
    #   avg_sentence_length: int,
    #   common_greetings: ["Hi {name}", "Hello"],
    #   common_signoffs: ["Best,", "Thanks,"],
    #   common_phrases: ["I wanted to reach out", "Looking forward to"],
    #   sample_excerpts: ["..."],  # For few-shot prompting
    # }

    # Training status
    samples_analyzed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_trained: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_trained_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

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
    developer: Mapped["Developer"] = relationship("Developer", lazy="selectin")
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
