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

    # Metrics — everything GitHub counted, lockfiles and vendored trees included.
    additions: Mapped[int] = mapped_column(Integer, default=0)
    deletions: Mapped[int] = mapped_column(Integer, default=0)
    files_changed: Mapped[int] = mapped_column(Integer, default=0)

    # The same three counting source files only: no lockfiles, no dist/build/
    # vendor/node_modules/coverage, no minified or generated output. A single
    # `npm install` drags six figures of lockfile churn into the raw numbers, so
    # any report quoting lines written has to read these instead. NULL means the
    # commit predates the split (or its file list never arrived) — fall back to
    # the raw columns and say so rather than reporting a silent zero.
    source_additions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_deletions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source_files_changed: Mapped[int | None] = mapped_column(Integer, nullable=True)

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

    # Hash of the change itself rather than of its place in history, so the
    # same work cherry-picked onto a release branch collides with the original.
    # A team that ports every change onto two branches otherwise looks three
    # times as productive as it is; `sha` cannot see it, since a cherry-pick
    # gets a new one. Same idea as `git patch-id --stable`.
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # Branch we first met this commit on while walking the repo. Not "the branch
    # it lives on" — a commit reachable from several branches is recorded under
    # whichever came first, default branch first.
    branch: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Truncated diff stored at sync time so re-analysis doesn't re-fetch from GitHub
    patch_sample: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Semantic analysis (LLM-derived)
    semantic_analysis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_analyzed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )

    # When it landed. A cherry-pick or a rebase rewrites this; `authored_at` is
    # when the work was actually written, which is why a monthly report counts
    # one and narrates the other.
    committed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    authored_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
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

    # Metrics. GitHub's *list* endpoint omits every one of these, so a PR that
    # arrived through a backfill sync used to store six zeros — which also made
    # `size_bucket` "xs" and had the AI pass skip the PR for good. They come from
    # the per-PR detail call now; webhooks always carried them.
    additions: Mapped[int] = mapped_column(Integer, default=0)
    deletions: Mapped[int] = mapped_column(Integer, default=0)
    files_changed: Mapped[int] = mapped_column(Integer, default=0)
    commits_count: Mapped[int] = mapped_column(Integer, default=0)
    comments_count: Mapped[int] = mapped_column(Integer, default=0)
    review_comments_count: Mapped[int] = mapped_column(Integer, default=0)

    # Who pressed merge, which is not who wrote it. Integration load lands on a
    # couple of people on most teams and is invisible without this.
    merged_by_developer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Kept beside the FK so the merger survives as a name when they were never
    # an internal developer, or their row is deleted.
    merged_by_login: Mapped[str | None] = mapped_column(String(255), nullable=True)

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

    # Relationship. `foreign_keys` is explicit because the table now points at
    # developers twice — author and merger — and SQLAlchemy will not guess.
    developer: Mapped["Developer"] = relationship(
        "Developer",
        back_populates="pull_requests",
        foreign_keys=[developer_id],
    )
    merged_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[merged_by_developer_id],
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
