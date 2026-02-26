"""GTM Content Gap Analysis models."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


class ContentAnalysis(Base):
    """Content gap analysis comparing our domain vs competitors."""

    __tablename__ = "content_analyses"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    our_domain: Mapped[str] = mapped_column(String(255), nullable=False)
    competitor_domains: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")

    our_topics: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    competitor_topics: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    gaps: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    opportunities: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    pages_analyzed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    triggered_by: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
