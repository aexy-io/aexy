"""A routine an agent runs on a clock.

The day-to-day operations — standup summary, triage pass, TAT sweep — are the
same instruction to the same agent every morning. Nobody types it; a schedule
does. Each run is an ordinary `CRMAgentExecution` with `triggered_by =
"schedule"` and `trigger_id` pointing here, so the run history, steps and cost
are where they always were.

The agent's catalogue tools act as its principal (`CRMAgent.principal_id`).
A schedule has nobody at the keyboard, so an agent without a principal is
refused at creation: its tools would have nobody to act as.
"""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base

MIN_INTERVAL_MINUTES = 15


class AgentSchedule(Base):
    __tablename__ = "agent_schedules"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
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

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # The instruction handed to the agent each run, e.g. the text of a routine
    # prompt. Becomes the `routine` key of the run context.
    routine: Mapped[str] = mapped_column(Text, nullable=False)

    interval_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=1440)
    # IANA zone the interval is anchored in, for display and for the day
    # boundary of a daily routine.
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    last_execution_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_agent_executions.id", ondelete="SET NULL"),
        nullable=True,
    )
    run_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
