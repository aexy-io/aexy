"""Review and Goals models for performance management.

This module provides models for:
- Review cycles (annual, quarterly, etc.)
- Individual reviews with self/peer/manager submissions
- SMART work goals with key results
- Contribution summaries from GitHub activity
"""

from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer
    from aexy.models.workspace import Workspace
    from aexy.models.career import LearningMilestone


class ReviewCycle(Base):
    """Workspace-level review cycle configuration.

    Supports annual, semi-annual, quarterly, or custom review cycles
    with configurable phases and settings.
    """

    __tablename__ = "review_cycles"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255))  # "Q4 2024 Performance Review"
    cycle_type: Mapped[str] = mapped_column(
        String(50),
        default="annual",
    )  # "annual", "semi_annual", "quarterly", "custom"

    # Review period dates
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)

    # Phase deadlines
    self_review_deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    peer_review_deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    manager_review_deadline: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Configuration (JSONB)
    settings: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )
    # {
    #   "enable_self_review": true,
    #   "enable_peer_review": true,
    #   "enable_manager_review": true,
    #   "anonymous_peer_reviews": true,
    #   "min_peer_reviewers": 2,
    #   "max_peer_reviewers": 5,
    #   "peer_selection_mode": "both",  # "employee_choice", "manager_assigned", "both"
    #   "include_github_metrics": true,
    #   "review_questions": [...],
    #   "rating_scale": {"min": 1, "max": 5, "labels": {...}}
    # }

    status: Mapped[str] = mapped_column(
        String(50),
        default="draft",
    )  # "draft", "active", "self_review", "peer_review", "manager_review", "completed"

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
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        back_populates="review_cycles",
    )
    individual_reviews: Mapped[list["IndividualReview"]] = relationship(
        "IndividualReview",
        back_populates="review_cycle",
        cascade="all, delete-orphan",
    )
    goals: Mapped[list["WorkGoal"]] = relationship(
        "WorkGoal",
        back_populates="review_cycle",
    )


class IndividualReview(Base):
    """Individual performance review for a developer within a cycle.

    Tracks the complete review lifecycle from self-review through
    manager finalization and employee acknowledgment.
    """

    __tablename__ = "individual_reviews"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    review_cycle_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("review_cycles.id", ondelete="CASCADE"),
        index=True,
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )
    manager_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    manager_source: Mapped[str] = mapped_column(
        String(50),
        default="team_lead",
    )  # "team_lead", "assigned" - tracks how manager was determined

    # Review status workflow
    status: Mapped[str] = mapped_column(
        String(50),
        default="pending",
    )
    # "pending" - Review created, awaiting self-review
    # "self_review_submitted" - Self-review completed
    # "peer_review_in_progress" - Collecting peer feedback
    # "manager_review_in_progress" - Manager writing review
    # "completed" - Manager finalized review
    # "acknowledged" - Employee acknowledged review

    # Cached contribution summary (JSONB)
    contribution_summary: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )
    # {
    #   "total_commits": 245,
    #   "total_prs_merged": 42,
    #   "code_reviews_given": 78,
    #   "total_additions": 15420,
    #   "total_deletions": 8930,
    #   "skills_demonstrated": ["Python", "React", "PostgreSQL"],
    #   "repositories_contributed": ["repo1", "repo2"],
    #   "monthly_breakdown": {...},
    #   "notable_prs": [...],
    #   "review_quality_score": 0.85
    # }

    # Final ratings (filled by manager)
    overall_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    ratings_breakdown: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )  # {"technical_skills": 4.2, "collaboration": 4.5, "leadership": 3.8, ...}

    # LLM-generated summary
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(
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
    review_cycle: Mapped["ReviewCycle"] = relationship(
        "ReviewCycle",
        back_populates="individual_reviews",
    )
    developer: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[developer_id],
        back_populates="reviews_received",
    )
    manager: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[manager_id],
    )
    submissions: Mapped[list["ReviewSubmission"]] = relationship(
        "ReviewSubmission",
        back_populates="individual_review",
        cascade="all, delete-orphan",
    )
    peer_requests: Mapped[list["ReviewRequest"]] = relationship(
        "ReviewRequest",
        back_populates="individual_review",
        cascade="all, delete-orphan",
    )


class ReviewSubmission(Base):
    """Individual review submission (self, peer, or manager).

    Uses the COIN framework for structured feedback:
    - Context: Situation or setting
    - Observation: Specific behavior observed
    - Impact: Effect on team/project/organization
    - Next Steps: Actionable recommendations
    """

    __tablename__ = "review_submissions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    individual_review_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("individual_reviews.id", ondelete="CASCADE"),
        index=True,
    )

    submission_type: Mapped[str] = mapped_column(String(50))  # "self", "peer", "manager"

    # Reviewer (null for self-review since reviewee is the reviewer)
    reviewer_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Anonymous handling for peer reviews
    anonymous_token: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False)

    # COIN Framework responses (JSONB)
    responses: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )
    # {
    #   "achievements": [
    #     {"context": "...", "observation": "...", "impact": "...", "accomplishment": "..."}
    #   ],
    #   "areas_for_growth": [
    #     {"context": "...", "observation": "...", "impact": "...", "next_steps": "..."}
    #   ],
    #   "question_responses": {
    #     "q1_technical_skills": {"rating": 4, "comment": "..."},
    #     "q2_collaboration": {"rating": 5, "comment": "..."}
    #   },
    #   "overall_feedback": "...",
    #   "strengths": ["...", "..."],
    #   "growth_areas": ["...", "..."]
    # }

    # Linked evidence
    linked_goals: Mapped[list[str]] = mapped_column(
        JSONB,
        default=list,
    )  # Goal IDs
    linked_contributions: Mapped[list[str]] = mapped_column(
        JSONB,
        default=list,
    )  # PR IDs, commit SHAs

    status: Mapped[str] = mapped_column(
        String(50),
        default="draft",
    )  # "draft", "submitted"

    submitted_at: Mapped[datetime | None] = mapped_column(
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
    individual_review: Mapped["IndividualReview"] = relationship(
        "IndividualReview",
        back_populates="submissions",
    )
    reviewer: Mapped["Developer | None"] = relationship(
        "Developer",
    )


class ReviewRequest(Base):
    """Request for peer review from a team member.

    Supports both employee-initiated requests and manager-assigned reviews.
    """

    __tablename__ = "review_requests"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    individual_review_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("individual_reviews.id", ondelete="CASCADE"),
        index=True,
    )

    requester_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )
    reviewer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="CASCADE"),
        index=True,
    )

    # Request source
    request_source: Mapped[str] = mapped_column(
        String(50),
        default="employee",
    )  # "employee", "manager"
    assigned_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Request message
    message: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        String(50),
        default="pending",
    )  # "pending", "accepted", "declined", "completed"

    # Resulting submission (once completed)
    submission_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("review_submissions.id", ondelete="SET NULL"),
        nullable=True,
    )

    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    responded_at: Mapped[datetime | None] = mapped_column(
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
    individual_review: Mapped["IndividualReview"] = relationship(
        "IndividualReview",
        back_populates="peer_requests",
    )
    requester: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[requester_id],
    )
    reviewer: Mapped["Developer"] = relationship(
        "Developer",
        foreign_keys=[reviewer_id],
    )
    assigned_by: Mapped["Developer | None"] = relationship(
        "Developer",
        foreign_keys=[assigned_by_id],
    )
    submission: Mapped["ReviewSubmission | None"] = relationship(
        "ReviewSubmission",
    )


class WorkGoal(Base):
    """Work goal with SMART framework.

    SMART Goals:
    - Specific: What exactly will be accomplished
    - Measurable: How success will be measured
    - Achievable: Why this is realistic
    - Relevant: How this aligns with broader goals
    - Time-bound: Target completion date

    Integrates with LearningPath for skill development goals.
    """

    __tablename__ = "work_goals"

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
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        index=True,
    )

    # SMART Goal components
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    specific: Mapped[str] = mapped_column(Text)  # What exactly will be accomplished
    measurable: Mapped[str] = mapped_column(Text)  # How will success be measured
    achievable: Mapped[str | None] = mapped_column(Text, nullable=True)  # Why is this realistic
    relevant: Mapped[str | None] = mapped_column(Text, nullable=True)  # How does this align
    time_bound: Mapped[date] = mapped_column(Date)  # Target completion date

    # Goal type
    goal_type: Mapped[str] = mapped_column(
        String(50),
        default="performance",
    )  # "performance", "skill_development", "project", "leadership", "team_contribution"

    # Priority and visibility
    priority: Mapped[str] = mapped_column(
        String(50),
        default="medium",
    )  # "critical", "high", "medium", "low"
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)

    # Progress tracking
    progress_percentage: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(
        String(50),
        default="active",
    )  # "draft", "active", "completed", "cancelled", "deferred"

    # Key results (OKR-style) - JSONB
    key_results: Mapped[list[dict]] = mapped_column(
        JSONB,
        default=list,
    )
    # [
    #   {"id": "kr1", "description": "...", "target": 100, "current": 45, "unit": "%"},
    #   {"id": "kr2", "description": "...", "target": 5, "current": 2, "unit": "features"}
    # ]

    # Auto-linked GitHub activity (JSONB)
    linked_activity: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )
    # {
    #   "commits": ["sha1", "sha2"],
    #   "pull_requests": ["pr_id1", "pr_id2"],
    #   "auto_linked_at": "..."
    # }

    # Linking keywords for auto-matching GitHub activity
    tracking_keywords: Mapped[list[str]] = mapped_column(
        JSONB,
        default=list,
    )  # ["PROJ-123", "feature-dark-mode", "performance-optimization"]

    # Review cycle association
    review_cycle_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("review_cycles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # LearningPath integration
    learning_milestone_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("learning_milestones.id", ondelete="SET NULL"),
        nullable=True,
    )
    suggested_from_path: Mapped[bool] = mapped_column(Boolean, default=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    developer: Mapped["Developer"] = relationship(
        "Developer",
        back_populates="work_goals",
    )
    workspace: Mapped["Workspace"] = relationship(
        "Workspace",
        back_populates="work_goals",
    )
    review_cycle: Mapped["ReviewCycle | None"] = relationship(
        "ReviewCycle",
        back_populates="goals",
    )
    learning_milestone: Mapped["LearningMilestone | None"] = relationship(
        "LearningMilestone",
    )


class ContributionSummary(Base):
    """Cached GitHub contribution summary for a specific period.

    Aggregates commits, PRs, and code reviews into a structured
    summary for use in performance reviews.
    """

    __tablename__ = "contribution_summaries"

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

    # Period definition
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    period_type: Mapped[str] = mapped_column(String(50))  # "monthly", "quarterly", "annual", "custom"

    # Metrics (JSONB for flexibility)
    metrics: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )
    # {
    #   "commits": {
    #     "total": 245,
    #     "by_repo": {"repo1": 120, "repo2": 125},
    #     "by_month": {"2024-01": 40, "2024-02": 55, ...}
    #   },
    #   "pull_requests": {
    #     "created": 42,
    #     "merged": 38,
    #     "avg_time_to_merge_hours": 24.5,
    #     "avg_comments_received": 3.2
    #   },
    #   "code_reviews": {
    #     "given": 78,
    #     "approved": 45,
    #     "requested_changes": 12,
    #     "commented": 21,
    #     "avg_comments_per_review": 2.8
    #   },
    #   "lines": {
    #     "additions": 15420,
    #     "deletions": 8930,
    #     "net": 6490
    #   },
    #   "languages": {"Python": 60, "TypeScript": 30, "SQL": 10},
    #   "skills_demonstrated": ["Python", "React", "PostgreSQL", "Docker"]
    # }

    # Notable contributions (JSONB)
    highlights: Mapped[list[dict]] = mapped_column(
        JSONB,
        default=list,
    )
    # [
    #   {"type": "pr", "id": "...", "title": "Major feature X", "impact": "...", "additions": 500},
    #   {"type": "review", "id": "...", "context": "Caught critical bug in..."}
    # ]

    # LLM-generated insights
    ai_insights: Mapped[str | None] = mapped_column(Text, nullable=True)

    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
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
        back_populates="contribution_summaries",
    )
