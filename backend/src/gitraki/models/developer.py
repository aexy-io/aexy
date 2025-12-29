"""Developer and GitHub connection models."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from gitraki.core.database import Base

if TYPE_CHECKING:
    from gitraki.models.activity import CodeReview, Commit, PullRequest
    from gitraki.models.career import LearningPath


class Developer(Base):
    """Developer profile model."""

    __tablename__ = "developers"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Skill fingerprint stored as JSON
    skill_fingerprint: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Work patterns stored as JSON
    work_patterns: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Growth trajectory stored as JSON
    growth_trajectory: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

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
    github_connection: Mapped["GitHubConnection | None"] = relationship(
        "GitHubConnection",
        back_populates="developer",
        uselist=False,
    )
    commits: Mapped[list["Commit"]] = relationship(
        "Commit",
        back_populates="developer",
    )
    pull_requests: Mapped[list["PullRequest"]] = relationship(
        "PullRequest",
        back_populates="developer",
    )
    code_reviews: Mapped[list["CodeReview"]] = relationship(
        "CodeReview",
        back_populates="developer",
    )
    learning_paths: Mapped[list["LearningPath"]] = relationship(
        "LearningPath",
        back_populates="developer",
    )


class GitHubConnection(Base):
    """GitHub OAuth connection for a developer."""

    __tablename__ = "github_connections"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        unique=True,
    )

    github_id: Mapped[int] = mapped_column(unique=True, index=True)
    github_username: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    github_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    github_avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    access_token: Mapped[str] = mapped_column(Text)  # Encrypted in production
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Scopes granted by user
    scopes: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationship
    developer: Mapped["Developer"] = relationship(
        "Developer",
        back_populates="github_connection",
    )
