"""Agent policy models for governance and audit."""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
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


# `AgentPendingAction` and `PendingActionStatus` lived here until held tool
# calls moved into the shared `proposed_changes` table. The table itself is
# retained for one release so a rollback is a deploy rather than a restore —
# see migrate_proposed_changes.sql — but nothing in the application reads or
# writes it any more, and leaving the model mapped meant `create_all` kept
# building a table no code could reach.
