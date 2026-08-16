"""Agent policy models for governance and audit."""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


class PolicyType(str, Enum):
    """Types of agent policies."""
    TOOL_BLOCK = "tool_block"
    TOOL_REQUIRE_APPROVAL = "tool_require_approval"
    FIELD_RESTRICTION = "field_restriction"
    RATE_LIMIT = "rate_limit"
    TOKEN_BUDGET = "token_budget"


class PolicyDecisionType(str, Enum):
    """Possible policy evaluation outcomes."""
    ALLOW = "allow"
    BLOCK = "block"
    REQUIRE_APPROVAL = "require_approval"
    RATE_LIMITED = "rate_limited"


class ConfigChangeType(str, Enum):
    """Types of agent configuration changes."""
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    TOGGLE = "toggle"


class AgentPolicy(Base):
    """Workspace-scoped governance rule for AI agents."""

    __tablename__ = "agent_policies"

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
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Optional: restrict to a specific agent (NULL = all agents)
    agent_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_agents.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    policy_type: Mapped[str] = mapped_column(String(50))
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    priority: Mapped[int] = mapped_column(Integer, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
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


class AgentPolicyDecision(Base):
    """Immutable audit log of a policy evaluation for a tool call."""

    __tablename__ = "agent_policy_decisions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    # Nullable because governance is no longer a CRM-agent-only concern. The
    # MCP tool surface is the door most agents now walk through, and it has no
    # `crm_agent_executions` row to point at — so a NOT NULL column here meant
    # a decision taken there could not be written down at all, and the audit
    # log silently covered one caller out of two.
    execution_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_agent_executions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Where the call came from: "crm_agent" or "mcp".
    actor_kind: Mapped[str] = mapped_column(
        String(20), default="crm_agent", nullable=False
    )
    # The human whose grant the call ran under. For an MCP session this is the
    # only person to hold responsible — nobody clicked, but somebody's token
    # was used.
    actor_developer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    workspace_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    policy_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("agent_policies.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    tool_name: Mapped[str] = mapped_column(String(255))
    tool_args: Mapped[dict] = mapped_column(JSONB, default=dict)

    decision: Mapped[str] = mapped_column(String(50))
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Approval workflow (Phase 2)
    approval_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    approved_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class AgentConfigAudit(Base):
    """Append-only audit log for agent configuration changes."""

    __tablename__ = "agent_config_audits"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    agent_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_agents.id", ondelete="CASCADE"),
        index=True,
    )
    changed_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    change_type: Mapped[str] = mapped_column(String(50))
    field_changes: Mapped[dict] = mapped_column(JSONB, default=dict)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


class PendingActionStatus(str, Enum):
    """Lifecycle of a tool call held for a human."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class AgentPendingAction(Base):
    """A tool call an agent asked for, waiting on someone to say yes.

    The content gate that already exists — `DocumentProposedEdit` — reviews a
    *result*: here is the prose the model wrote, approve it or don't. That
    shape does not fit the MCP boundary, because policy is evaluated before
    the call runs and there is no result to look at yet. Running it to find
    out what it would do is exactly what the gate is there to prevent.

    So what is stored is the *request*: the operation and its arguments,
    replayed verbatim on approval. Two gates, two records, one queue —
    complementary rather than a generalisation of each other.

    Deliberately not a `ProposedChange` covering both. Forcing a pre-execution
    intent and a post-generation diff into one table would mean half the
    columns are null on every row, and the document queue that works today
    would carry a migration it gains nothing from.
    """

    __tablename__ = "agent_pending_actions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    # Whose grant the agent was acting under. The approver may be someone else
    # entirely, which is the point of asking.
    requested_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Enough to replay the call exactly, and to describe it to a human without
    # replaying it.
    tool_name: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    path: Mapped[str] = mapped_column(String(1000), nullable=False)
    arguments: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    policy_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("agent_policies.id", ondelete="SET NULL"),
        nullable=True,
    )
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(20), default=PendingActionStatus.PENDING.value, nullable=False
    )
    reviewed_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # What happened when the approved call was finally replayed. Kept so the
    # queue can show an approval that then failed, rather than implying every
    # approved action succeeded.
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index(
            "ix_agent_pending_actions_workspace_pending",
            "workspace_id",
            postgresql_where=text("status = 'pending'"),
        ),
    )
