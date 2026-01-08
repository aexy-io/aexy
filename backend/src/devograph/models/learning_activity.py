"""Learning activity tracking models."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.career import LearningMilestone, LearningPath
    from aexy.models.developer import Developer


class LearningActivityLog(Base):
    """Individual learning activity tracking.

    Tracks completion of courses, tasks, readings, videos, and other
    learning activities associated with learning paths and milestones.
    """

    __tablename__ = "learning_activity_logs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )
    learning_path_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("learning_paths.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    milestone_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("learning_milestones.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Activity details
    activity_type: Mapped[str] = mapped_column(
        String(50),
    )  # "course", "task", "reading", "project", "pairing", "video"
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(
        String(50),
    )  # "youtube", "coursera", "udemy", "pluralsight", "internal", "manual"
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    # Completion tracking
    status: Mapped[str] = mapped_column(
        String(50),
        default="not_started",
    )  # "not_started", "in_progress", "completed", "skipped"
    progress_percentage: Mapped[int] = mapped_column(Integer, default=0)

    # Time tracking
    estimated_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actual_time_spent_minutes: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Gamification
    points_earned: Mapped[int] = mapped_column(Integer, default=0)

    # User feedback
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1-5

    # Metadata
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    skill_tags: Mapped[list[str]] = mapped_column(JSONB, default=list)  # Skills learned
    extra_data: Mapped[dict] = mapped_column(JSONB, default=dict)  # Extra provider data

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
    developer: Mapped["Developer"] = relationship(
        "Developer",
        back_populates="activity_logs",
    )
    learning_path: Mapped["LearningPath | None"] = relationship(
        "LearningPath",
    )
    milestone: Mapped["LearningMilestone | None"] = relationship(
        "LearningMilestone",
    )
    time_sessions: Mapped[list["LearningTimeSession"]] = relationship(
        "LearningTimeSession",
        back_populates="activity_log",
        cascade="all, delete-orphan",
    )


class LearningTimeSession(Base):
    """Time tracking session for a learning activity.

    Tracks individual study/work sessions with start/end times.
    """

    __tablename__ = "learning_time_sessions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    activity_log_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("learning_activity_logs.id", ondelete="CASCADE"),
        index=True,
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, default=0)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationships
    activity_log: Mapped["LearningActivityLog"] = relationship(
        "LearningActivityLog",
        back_populates="time_sessions",
    )
    developer: Mapped["Developer"] = relationship(
        "Developer",
    )
