"""AI Feedback model — unified feedback across Ask AI, Agents, and Automations."""

from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, SmallInteger, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from aexy.core.database import Base


class AIFeedback(Base):
    """Feedback on AI outputs (Ask AI messages, agent executions, automation runs)."""

    __tablename__ = "ai_feedback"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "developer_id", name="uq_ai_feedback_entity_developer"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    entity_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # 'ask_message' | 'agent_execution' | 'automation_run'
    entity_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), nullable=False
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
    )
    rating: Mapped[int] = mapped_column(
        SmallInteger, nullable=False
    )  # -1 (thumbs down) or 1 (thumbs up)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )  # comma-separated tags
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[str | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now()
    )
