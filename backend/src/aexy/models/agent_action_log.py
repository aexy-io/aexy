"""The ledger of what agents actually did.

`AgentPolicyDecision` records what governance *refused*. Nothing recorded what
it let through: an allowed write left no MCP-level trace beyond whatever the
endpoint happened to log, so "what did the triage agent change yesterday" was
not a question anyone could answer.

One row per mutating call that reached the application, whether it succeeded
or not — a 422 is as much a thing the agent did as a 200. Reads are never
written down: the volume would bury the writes, and a read changes nothing.

This table is also what makes rate limiting real over MCP. The engine's
in-memory counter lives for one request; a window over these rows lives as
long as the rows do.
"""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


class AgentActionLog(Base):
    __tablename__ = "agent_action_logs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Where the call came from. "mcp" today; an in-platform agent runtime
    # sharing the executor will name itself here.
    actor_kind: Mapped[str] = mapped_column(String(20), nullable=False, default="mcp")
    # Whose grant it ran under. Nullable so an agent principal (a later phase)
    # can be recorded without pretending to be a person.
    actor_developer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # The principal that acted, when the call ran as an agent identity rather
    # than under a person's grant.
    principal_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("agent_principals.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    tool_name: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    # Which capability the action belongs to, so a limit or report written
    # per capability can count without re-deriving it from the catalogue.
    capability: Mapped[str | None] = mapped_column(String(100), nullable=True)
    method: Mapped[str] = mapped_column(String(10), nullable=False)
    # The route template, so rows group by operation.
    path: Mapped[str] = mapped_column(String(500), nullable=False)
    # The path as called, ids filled in, so a row names what it touched.
    resolved_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    # What was sent, with obvious secrets masked. Kept whole otherwise: the
    # point of a ledger is being able to see exactly what an agent asked for.
    arguments: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_error: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Set when this row is the replay of an approved held action, so the queue
    # entry and the thing that eventually ran can be read together.
    pending_action_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("proposed_changes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        # The activity view: what happened in this workspace, newest first.
        Index("ix_agent_action_logs_workspace_created", "workspace_id", "created_at"),
        # The rate-limit window: how many times has this actor done this
        # action in this workspace recently.
        Index(
            "ix_agent_action_logs_rate_window",
            "workspace_id",
            "actor_developer_id",
            "action",
            "created_at",
        ),
    )
