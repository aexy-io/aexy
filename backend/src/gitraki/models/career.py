"""Career intelligence models: roles, learning paths, and hiring requirements."""

from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from gitraki.core.database import Base

if TYPE_CHECKING:
    from gitraki.models.developer import Developer


class CareerRole(Base):
    """Career role definition with skill requirements.

    Supports both predefined system roles and custom organization-specific roles.
    """

    __tablename__ = "career_roles"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    organization_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
        index=True,
    )  # None = predefined system role

    name: Mapped[str] = mapped_column(String(255))  # "Senior Backend Engineer"
    level: Mapped[int] = mapped_column(Integer)  # 1=Junior, 2=Mid, 3=Senior, 4=Staff, 5=Principal
    track: Mapped[str] = mapped_column(String(50))  # "engineering", "management", "specialist"

    # Skill requirements (JSONB)
    required_skills: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {"Python": 70, "System Design": 60, ...}
    preferred_skills: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )
    soft_skill_requirements: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {"leadership": 0.5, "mentorship": 0.6}

    # Metadata
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    responsibilities: Mapped[list[str]] = mapped_column(
        JSONB,
        default=list,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
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
    learning_paths: Mapped[list["LearningPath"]] = relationship(
        "LearningPath",
        back_populates="target_role",
    )
    hiring_requirements: Mapped[list["HiringRequirement"]] = relationship(
        "HiringRequirement",
        back_populates="target_role",
    )


class LearningPath(Base):
    """Personalized learning path for developer career progression."""

    __tablename__ = "learning_paths"

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
    target_role_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("career_roles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Generated content (JSONB)
    skill_gaps: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {"Python": {"current": 45, "target": 70, "gap": 25}}
    phases: Mapped[list[dict]] = mapped_column(
        JSONB,
        default=list,
    )  # [{name, duration, skills[], activities[]}]
    milestones_data: Mapped[list[dict]] = mapped_column(
        JSONB,
        default=list,
    )  # [{skill, target_score, deadline, status}]

    # LLM generation metadata
    estimated_success_probability: Mapped[float | None] = mapped_column(nullable=True)
    risk_factors: Mapped[list[str]] = mapped_column(JSONB, default=list)
    recommendations: Mapped[list[str]] = mapped_column(JSONB, default=list)

    # Progress tracking
    status: Mapped[str] = mapped_column(
        String(50),
        default="active",
    )  # "active", "completed", "paused", "abandoned"
    progress_percentage: Mapped[int] = mapped_column(Integer, default=0)
    trajectory_status: Mapped[str] = mapped_column(
        String(50),
        default="on_track",
    )  # "on_track", "ahead", "behind", "at_risk"

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    target_completion: Mapped[date | None] = mapped_column(Date, nullable=True)
    actual_completion: Mapped[date | None] = mapped_column(Date, nullable=True)

    # LLM generation metadata
    generated_by_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_regenerated_at: Mapped[datetime | None] = mapped_column(
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
    developer: Mapped["Developer"] = relationship(
        "Developer",
        back_populates="learning_paths",
    )
    target_role: Mapped["CareerRole | None"] = relationship(
        "CareerRole",
        back_populates="learning_paths",
    )
    milestones: Mapped[list["LearningMilestone"]] = relationship(
        "LearningMilestone",
        back_populates="learning_path",
        cascade="all, delete-orphan",
    )


class LearningMilestone(Base):
    """Individual milestone within a learning path."""

    __tablename__ = "learning_milestones"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    learning_path_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("learning_paths.id", ondelete="CASCADE"),
        index=True,
    )

    skill_name: Mapped[str] = mapped_column(String(100))
    target_score: Mapped[int] = mapped_column(Integer)  # 0-100
    current_score: Mapped[int] = mapped_column(Integer, default=0)

    # Progress
    status: Mapped[str] = mapped_column(
        String(50),
        default="not_started",
    )  # "not_started", "in_progress", "completed", "behind"
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Activities (JSONB)
    recommended_activities: Mapped[list[dict]] = mapped_column(
        JSONB,
        default=list,
    )  # [{type, description, source, url?}]
    completed_activities: Mapped[list[str]] = mapped_column(
        JSONB,
        default=list,
    )

    # Ordering
    sequence: Mapped[int] = mapped_column(Integer, default=0)

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
    learning_path: Mapped["LearningPath"] = relationship(
        "LearningPath",
        back_populates="milestones",
    )


class HiringRequirement(Base):
    """Hiring requirement generated from team skill gap analysis."""

    __tablename__ = "hiring_requirements"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    organization_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        index=True,
    )
    team_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        nullable=True,
        index=True,
    )
    target_role_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("career_roles.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Role details
    role_title: Mapped[str] = mapped_column(String(255))
    priority: Mapped[str] = mapped_column(
        String(50),
        default="medium",
    )  # "critical", "high", "medium", "low"
    timeline: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )  # "Q1 2025", "ASAP", etc.

    # Generated requirements (JSONB)
    must_have_skills: Mapped[list[dict]] = mapped_column(
        JSONB,
        default=list,
    )  # [{skill, level, reasoning}]
    nice_to_have_skills: Mapped[list[dict]] = mapped_column(
        JSONB,
        default=list,
    )
    soft_skill_requirements: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )

    # Context
    gap_analysis: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # Source analysis that generated this
    roadmap_items: Mapped[list[str]] = mapped_column(
        JSONB,
        default=list,
    )  # Related roadmap items

    # Generated content
    job_description: Mapped[str | None] = mapped_column(Text, nullable=True)  # LLM-generated JD
    interview_rubric: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {skill: {questions[], evaluation_criteria[]}}

    status: Mapped[str] = mapped_column(
        String(50),
        default="draft",
    )  # "draft", "active", "filled", "cancelled"

    # LLM generation metadata
    generated_by_model: Mapped[str | None] = mapped_column(String(100), nullable=True)

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
    target_role: Mapped["CareerRole | None"] = relationship(
        "CareerRole",
        back_populates="hiring_requirements",
    )


class OrganizationSettings(Base):
    """Organization-level settings for career features."""

    __tablename__ = "organization_settings"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    organization_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        unique=True,
        index=True,
    )

    # Learning source configuration
    enable_external_courses: Mapped[bool] = mapped_column(Boolean, default=False)
    external_sources: Mapped[list[str]] = mapped_column(
        JSONB,
        default=list,
    )  # ["coursera", "udemy", "pluralsight"]

    # Career ladder configuration
    use_custom_roles: Mapped[bool] = mapped_column(Boolean, default=False)
    custom_career_tracks: Mapped[list[str]] = mapped_column(
        JSONB,
        default=list,
    )  # ["engineering", "data", "platform"]

    # LLM preferences
    preferred_llm_provider: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )  # "claude", "ollama"

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
