"""GitHub activity models: commits, PRs, and code reviews."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer


class Commit(Base):
    """Git commit model."""

    __tablename__ = "commits"

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

    sha: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    repository: Mapped[str] = mapped_column(String(255), index=True)
    message: Mapped[str] = mapped_column(Text)

    # Metrics
    additions: Mapped[int] = mapped_column(Integer, default=0)
    deletions: Mapped[int] = mapped_column(Integer, default=0)
    files_changed: Mapped[int] = mapped_column(Integer, default=0)

    # File types and languages detected
    languages: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    file_types: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)

    # Original author identity (preserved even if developer_id changes)
    author_github_login: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    author_email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)

    # Layer-0 deterministic enrichment (set during sync, no LLM)
    author_class: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)  # human | bot | external
    change_class: Mapped[str | None] = mapped_column(String(30), nullable=True)  # code | test_only | config_only | docs_only | formatter_only | generated
    is_merge: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_revert: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Truncated diff stored at sync time so re-analysis doesn't re-fetch from GitHub
    patch_sample: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Semantic analysis (LLM-derived)
    semantic_analysis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_analyzed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    committed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationship
    developer: Mapped["Developer"] = relationship("Developer", back_populates="commits")


class PullRequest(Base):
    """Pull request model."""

    __tablename__ = "pull_requests"

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

    github_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    number: Mapped[int] = mapped_column(Integer)
    repository: Mapped[str] = mapped_column(String(255), index=True)

    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    state: Mapped[str] = mapped_column(String(50))  # open, closed, merged

    # Metrics
    additions: Mapped[int] = mapped_column(Integer, default=0)
    deletions: Mapped[int] = mapped_column(Integer, default=0)
    files_changed: Mapped[int] = mapped_column(Integer, default=0)
    commits_count: Mapped[int] = mapped_column(Integer, default=0)
    comments_count: Mapped[int] = mapped_column(Integer, default=0)
    review_comments_count: Mapped[int] = mapped_column(Integer, default=0)

    # Detected skills/technologies
    detected_skills: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)

    # Layer-0 deterministic enrichment + Layer-1 LLM analysis
    size_bucket: Mapped[str | None] = mapped_column(String(4), nullable=True)  # xs | s | m | l | xl
    ai_analysis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_analyzed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    # Phase 3: PR-level embedding for similarity search & repo-health clustering.
    # Vector dim 1024 matches file_embeddings so the provider config is shared.
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1024), nullable=True)
    embedding_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    embedded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Timestamps
    created_at_github: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at_github: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    merged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationship
    developer: Mapped["Developer"] = relationship(
        "Developer",
        back_populates="pull_requests",
    )


class CodeReview(Base):
    """Code review model."""

    __tablename__ = "code_reviews"

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

    github_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    pull_request_github_id: Mapped[int] = mapped_column(BigInteger, index=True)
    repository: Mapped[str] = mapped_column(String(255), index=True)

    state: Mapped[str] = mapped_column(String(50))  # approved, changes_requested, commented
    body: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Review quality metrics
    comments_count: Mapped[int] = mapped_column(Integer, default=0)

    # Quality analysis (depth, thoroughness, mentoring indicators)
    quality_metrics: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_analyzed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # Relationship
    developer: Mapped["Developer"] = relationship(
        "Developer",
        back_populates="code_reviews",
    )
