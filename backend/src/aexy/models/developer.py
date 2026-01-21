"""Developer, GitHub connection, and Google connection models."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.activity import CodeReview, Commit, PullRequest
    from aexy.models.analytics import CustomReport, ExportJob, PredictiveInsight
    from aexy.models.billing import CustomerBilling
    from aexy.models.career import LearningPath
    from aexy.models.gamification import DeveloperGamification
    from aexy.models.learning_activity import LearningActivityLog
    from aexy.models.notification import Notification, NotificationPreference
    from aexy.models.plan import Plan
    from aexy.models.repository import DeveloperOrganization, DeveloperRepository
    from aexy.models.review import ContributionSummary, IndividualReview, WorkGoal


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

    # Subscription plan
    plan_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("plans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Usage tracking for rate limiting
    repos_synced_count: Mapped[int] = mapped_column(Integer, default=0)
    llm_requests_today: Mapped[int] = mapped_column(Integer, default=0)
    llm_requests_reset_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Monthly token usage tracking for pay-per-use billing
    llm_tokens_used_this_month: Mapped[int] = mapped_column(BigInteger, default=0)
    llm_input_tokens_this_month: Mapped[int] = mapped_column(BigInteger, default=0)
    llm_output_tokens_this_month: Mapped[int] = mapped_column(BigInteger, default=0)
    llm_tokens_reset_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    # Overage cost accumulated this billing period (in cents)
    llm_overage_cost_cents: Mapped[int] = mapped_column(Integer, default=0)

    # Skill fingerprint stored as JSON
    skill_fingerprint: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Work patterns stored as JSON
    work_patterns: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Growth trajectory stored as JSON
    growth_trajectory: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Onboarding state
    has_completed_onboarding: Mapped[bool] = mapped_column(Boolean, default=False)

    # LLM analysis tracking
    last_llm_analysis_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

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
    plan: Mapped["Plan | None"] = relationship(
        "Plan",
        back_populates="developers",
    )
    github_connection: Mapped["GitHubConnection | None"] = relationship(
        "GitHubConnection",
        back_populates="developer",
        uselist=False,
    )
    google_connection: Mapped["GoogleConnection | None"] = relationship(
        "GoogleConnection",
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
    activity_logs: Mapped[list["LearningActivityLog"]] = relationship(
        "LearningActivityLog",
        back_populates="developer",
        cascade="all, delete-orphan",
    )
    gamification: Mapped["DeveloperGamification | None"] = relationship(
        "DeveloperGamification",
        back_populates="developer",
        uselist=False,
        cascade="all, delete-orphan",
    )
    custom_reports: Mapped[list["CustomReport"]] = relationship(
        "CustomReport",
        back_populates="creator",
    )
    export_jobs: Mapped[list["ExportJob"]] = relationship(
        "ExportJob",
        back_populates="requester",
    )
    predictive_insights: Mapped[list["PredictiveInsight"]] = relationship(
        "PredictiveInsight",
        back_populates="developer",
    )
    developer_repositories: Mapped[list["DeveloperRepository"]] = relationship(
        "DeveloperRepository",
        back_populates="developer",
        cascade="all, delete-orphan",
    )
    developer_organizations: Mapped[list["DeveloperOrganization"]] = relationship(
        "DeveloperOrganization",
        back_populates="developer",
        cascade="all, delete-orphan",
    )
    customer_billing: Mapped["CustomerBilling | None"] = relationship(
        "CustomerBilling",
        back_populates="developer",
        uselist=False,
    )
    reviews_received: Mapped[list["IndividualReview"]] = relationship(
        "IndividualReview",
        back_populates="developer",
        foreign_keys="IndividualReview.developer_id",
    )
    work_goals: Mapped[list["WorkGoal"]] = relationship(
        "WorkGoal",
        back_populates="developer",
    )
    contribution_summaries: Mapped[list["ContributionSummary"]] = relationship(
        "ContributionSummary",
        back_populates="developer",
    )
    notifications: Mapped[list["Notification"]] = relationship(
        "Notification",
        back_populates="recipient",
        cascade="all, delete-orphan",
    )
    notification_preferences: Mapped[list["NotificationPreference"]] = relationship(
        "NotificationPreference",
        back_populates="developer",
        cascade="all, delete-orphan",
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

    github_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
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

    # Relationships
    developer: Mapped["Developer"] = relationship(
        "Developer",
        back_populates="github_connection",
    )
    installations: Mapped[list["GitHubInstallation"]] = relationship(
        "GitHubInstallation",
        back_populates="github_connection",
        cascade="all, delete-orphan",
    )


class GitHubInstallation(Base):
    """GitHub App installation for accessing repositories."""

    __tablename__ = "github_installations"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    github_connection_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("github_connections.id", ondelete="CASCADE"),
        index=True,
    )

    # GitHub App installation data
    installation_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    account_id: Mapped[int] = mapped_column(BigInteger, index=True)  # User or Org ID
    account_login: Mapped[str] = mapped_column(String(255), index=True)
    account_type: Mapped[str] = mapped_column(String(50))  # "User" or "Organization"

    # Repository selection
    repository_selection: Mapped[str] = mapped_column(
        String(50),
        default="selected",
    )  # "all" or "selected"

    # Permissions granted (stored as JSON)
    permissions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Installation status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    suspended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

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
    github_connection: Mapped["GitHubConnection"] = relationship(
        "GitHubConnection",
        back_populates="installations",
    )


class GoogleConnection(Base):
    """Google OAuth connection for a developer (for sign-in/sign-up and integrations)."""

    __tablename__ = "google_connections"

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

    # Google user info
    google_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    google_email: Mapped[str] = mapped_column(String(255), index=True)
    google_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # OAuth tokens
    access_token: Mapped[str] = mapped_column(Text)  # Encrypted in production
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Scopes granted by user (e.g., profile, email, gmail.readonly, calendar)
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
        back_populates="google_connection",
    )
