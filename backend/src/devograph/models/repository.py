"""Repository and Organization models for tracking GitHub repositories."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from devograph.core.database import Base

if TYPE_CHECKING:
    from devograph.models.developer import Developer


class Organization(Base):
    """GitHub organization that a developer belongs to."""

    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    github_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    login: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

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
    repositories: Mapped[list["Repository"]] = relationship(
        "Repository",
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    developer_organizations: Mapped[list["DeveloperOrganization"]] = relationship(
        "DeveloperOrganization",
        back_populates="organization",
        cascade="all, delete-orphan",
    )


class Repository(Base):
    """GitHub repository that can be enabled for processing."""

    __tablename__ = "repositories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    github_id: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    organization_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # GitHub data
    full_name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    owner_login: Mapped[str] = mapped_column(String(255), index=True)
    owner_type: Mapped[str] = mapped_column(String(50))  # "User" or "Organization"
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metadata
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    is_fork: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    default_branch: Mapped[str] = mapped_column(String(255), default="main")
    language: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # GitHub timestamps
    github_created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    github_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    github_pushed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Local timestamps
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
    organization: Mapped["Organization | None"] = relationship(
        "Organization",
        back_populates="repositories",
    )
    developer_repositories: Mapped[list["DeveloperRepository"]] = relationship(
        "DeveloperRepository",
        back_populates="repository",
        cascade="all, delete-orphan",
    )


class DeveloperRepository(Base):
    """Junction table tracking which repositories a developer has enabled."""

    __tablename__ = "developer_repositories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )
    repository_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("repositories.id", ondelete="CASCADE"),
        index=True,
    )

    # Selection state
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # Sync state
    sync_status: Mapped[str] = mapped_column(
        String(50),
        default="pending",
    )  # pending, syncing, synced, failed
    last_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Sync progress
    commits_synced: Mapped[int] = mapped_column(Integer, default=0)
    prs_synced: Mapped[int] = mapped_column(Integer, default=0)
    reviews_synced: Mapped[int] = mapped_column(Integer, default=0)

    # Incremental sync tracking
    last_commit_sha: Mapped[str | None] = mapped_column(String(40), nullable=True)
    last_commit_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_pr_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_pr_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    incremental_sync_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Webhook state
    webhook_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    webhook_status: Mapped[str] = mapped_column(
        String(50),
        default="none",
    )  # none, pending, active, failed

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("developer_id", "repository_id", name="uq_developer_repository"),
    )

    # Relationships
    developer: Mapped["Developer"] = relationship(
        "Developer",
        back_populates="developer_repositories",
    )
    repository: Mapped["Repository"] = relationship(
        "Repository",
        back_populates="developer_repositories",
    )


class DeveloperOrganization(Base):
    """Junction table tracking org-level toggles for a developer."""

    __tablename__ = "developer_organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )
    organization_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
    )

    # Selection state
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    # GitHub role in org
    role: Mapped[str | None] = mapped_column(String(50), nullable=True)  # admin, member

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("developer_id", "organization_id", name="uq_developer_organization"),
    )

    # Relationships
    developer: Mapped["Developer"] = relationship(
        "Developer",
        back_populates="developer_organizations",
    )
    organization: Mapped["Organization"] = relationship(
        "Organization",
        back_populates="developer_organizations",
    )
