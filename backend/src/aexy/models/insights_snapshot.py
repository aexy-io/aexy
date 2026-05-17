"""Periodic AI-derived insight snapshots.

Output of the Layer-2 aggregation activities (developer weekly digest,
repo health rollup). One row per (scope_type, scope_id, kind, period_start).
"""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


class InsightsSnapshot(Base):
    """A frozen AI summary covering a scope (developer/repository/workspace) over a period."""

    __tablename__ = "insights_snapshots"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    # scope_type ∈ {'developer', 'repository', 'workspace'}
    scope_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # scope_id is stringly-typed so it fits either UUID or VARCHAR(36) FKs
    # without an explicit FK constraint (would require polymorphic FKs).
    scope_id: Mapped[str] = mapped_column(String(36), nullable=False)
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )

    # kind ∈ {'weekly_digest', 'repo_health', …}
    kind: Mapped[str] = mapped_column(String(50), nullable=False)
    period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    period_end: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    token_usage: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
