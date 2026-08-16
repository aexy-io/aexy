"""Product feedback: suggestions, problems, questions and requests for gated apps.

Deliberately not the same thing as an app access request. An access request asks
a workspace's own admin for something they control and can grant; this asks us
for something they cannot. Folding the two together would put items nobody in
the workspace has authority over into an admin's approval queue.

Nor is it ``AIFeedback``, which is a thumbs up or down on one AI output and is
keyed to the entity it rates.
"""

from datetime import datetime
from enum import Enum
from uuid import uuid4

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base


class FeedbackKind(str, Enum):
    """What somebody is telling us."""

    SUGGESTION = "suggestion"
    PROBLEM = "problem"
    QUESTION = "question"
    # "We would like the app you have switched off." The entry point is the
    # access grid, where apps we gate are listed but not toggleable.
    APP_REQUEST = "app_request"


class FeedbackStatus(str, Enum):
    """Where an item has got to.

    ``NEW`` until a platform admin looks at it. The rest are what we tell the
    person who wrote it — which is why "declined" exists as a visible answer
    rather than an item quietly going stale.
    """

    NEW = "new"
    TRIAGED = "triaged"
    PLANNED = "planned"
    SHIPPED = "shipped"
    DECLINED = "declined"


class Feedback(Base):
    """One piece of feedback, votable by anyone who can see the board."""

    __tablename__ = "feedback"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    kind: Mapped[str] = mapped_column(
        String(20), nullable=False, default=FeedbackKind.SUGGESTION.value, index=True
    )
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    # Where it was written from — route, app id, release, locale. Shown to the
    # author before they send, because attaching context silently is the kind of
    # thing somebody should be able to check first.
    context: Mapped[dict] = mapped_column(
        JSONB, default=dict, nullable=False, server_default=text("'{}'")
    )

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=FeedbackStatus.NEW.value, index=True
    )
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Denormalised so the board can order by popularity without counting rows
    # per item on every read. `FeedbackService` is the only writer.
    vote_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    votes: Mapped[list["FeedbackVote"]] = relationship(
        "FeedbackVote", back_populates="feedback", cascade="all, delete-orphan"
    )


class FeedbackVote(Base):
    """One person, one vote, one item.

    The uniqueness is a constraint rather than a check in the service: voting is
    the one thing on the board that is worth gaming, and two tabs are enough to
    race a read-then-write.
    """

    __tablename__ = "feedback_votes"
    __table_args__ = (
        UniqueConstraint("feedback_id", "developer_id", name="uq_feedback_vote_once"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    feedback_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("feedback.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    feedback: Mapped["Feedback"] = relationship("Feedback", back_populates="votes")
