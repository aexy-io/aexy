"""AI Agent models for LangGraph-based automation agents."""

from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace
    from aexy.models.agent_inbox import AgentInboxMessage


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
    mention_handle: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True)  # @mention handle

    # System agents are pre-built and cannot be deleted
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Agent configuration
    goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)

    # The identity this agent's catalogue tools act as. Null means "the person
    # who triggered the run", which is right for a chat @mention and wrong for
    # a schedule — nobody triggered that. See models/agent_principal.py.
    principal_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("agent_principals.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Available tools for this agent
    tools: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # ["crm_search", "send_email", "enrich_company", ...]

    # LLM configuration
    llm_provider: Mapped[str] = mapped_column(String(50), default="claude", nullable=False)  # claude, gemini, ollama
    model: Mapped[str] = mapped_column(String(100), default="claude-3-sonnet-20240229", nullable=False)
    temperature: Mapped[float] = mapped_column(Float, default=0.7, nullable=False)
    max_tokens: Mapped[int] = mapped_column(Integer, default=4096, nullable=False)

    # LangGraph configuration
    max_iterations: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    timeout_seconds: Mapped[int] = mapped_column(Integer, default=300, nullable=False)

    # Behavior configuration
    confidence_threshold: Mapped[float] = mapped_column(Float, default=0.7, nullable=False)
    require_approval_below: Mapped[float] = mapped_column(Float, default=0.5, nullable=False)
    max_daily_responses: Mapped[int | None] = mapped_column(Integer, nullable=True)  # null = unlimited
    response_delay_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Working hours configuration (JSONB)
    working_hours: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # { enabled: bool, timezone: str, start: str, end: str, days: int[] }

    # Additional prompts
    custom_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Escalation settings
    escalation_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    escalation_slack_channel: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Email integration fields
    email_address: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auto_reply_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_signature: Mapped[str | None] = mapped_column(Text, nullable=True)

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
    inbox_messages: Mapped[list["AgentInboxMessage"]] = relationship(
        "AgentInboxMessage",
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
    conversation_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_agent_conversations.id", ondelete="SET NULL"),
        nullable=True,
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
    conversation: Mapped["AgentConversation | None"] = relationship(
        "AgentConversation", back_populates="executions"
    )


class AgentConversation(Base):
    """Agent chat conversation."""

    __tablename__ = "crm_agent_conversations"

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
    agent_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    record_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
        index=True,
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    conversation_metadata: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
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
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="selectin")
    agent: Mapped["CRMAgent"] = relationship("CRMAgent", lazy="selectin")
    messages: Mapped[list["AgentMessage"]] = relationship(
        "AgentMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="AgentMessage.message_index",
        lazy="selectin",
    )
    executions: Mapped[list["CRMAgentExecution"]] = relationship(
        "CRMAgentExecution",
        back_populates="conversation",
        lazy="noload",
    )


class AgentMessage(Base):
    """Message in an agent conversation."""

    __tablename__ = "crm_agent_messages"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    conversation_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_agent_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    execution_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_agent_executions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user, assistant, system, tool
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tool_calls: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    tool_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tool_output: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    message_index: Mapped[int] = mapped_column(Integer, nullable=False)

    # Citations + token meter (migrate_agent_message_streaming.sql).
    # citations: list[{title, url, snippet?}] — sources the agent
    # surfaced while producing this message.
    # input/output tokens + cost_usd: per-message usage so the chat UI
    # can render a "this message cost $0.0023, 1.2k tokens" meter
    # without recomputing from a rate card.
    citations: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    conversation: Mapped["AgentConversation"] = relationship(
        "AgentConversation", back_populates="messages"
    )
    execution: Mapped["CRMAgentExecution | None"] = relationship(
        "CRMAgentExecution", lazy="selectin"
    )


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


# CRMAgent.inbox_messages names "AgentInboxMessage" as a string, so the class
# must be in the registry before any mapper configures — otherwise the first
# flush in the process raises "failed to locate a name" and, because a failed
# configure poisons the whole registry, EVERY later query fails too. Importing
# it here means the guarantee holds for all ~15 importers of this module
# instead of only the ones that happened to remember. Bottom of the file, and
# module-only (no from-import), so the reverse import order still works:
# agent_inbox imports this module, and by the time mappers configure both
# classes are registered.
import aexy.models.agent_inbox  # noqa: E402,F401
