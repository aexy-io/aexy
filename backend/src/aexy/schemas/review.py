"""Review and Goals Pydantic schemas."""

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


# Enums
class ReviewCycleType(str, Enum):
    """Review cycle types."""

    ANNUAL = "annual"
    SEMI_ANNUAL = "semi_annual"
    QUARTERLY = "quarterly"
    CUSTOM = "custom"


class ReviewCycleStatus(str, Enum):
    """Review cycle status."""

    DRAFT = "draft"
    ACTIVE = "active"
    SELF_REVIEW = "self_review"
    PEER_REVIEW = "peer_review"
    MANAGER_REVIEW = "manager_review"
    COMPLETED = "completed"


class IndividualReviewStatus(str, Enum):
    """Individual review status."""

    PENDING = "pending"
    SELF_REVIEW_SUBMITTED = "self_review_submitted"
    PEER_REVIEW_IN_PROGRESS = "peer_review_in_progress"
    MANAGER_REVIEW_IN_PROGRESS = "manager_review_in_progress"
    COMPLETED = "completed"
    ACKNOWLEDGED = "acknowledged"


class SubmissionType(str, Enum):
    """Review submission types."""

    SELF = "self"
    PEER = "peer"
    MANAGER = "manager"


class SubmissionStatus(str, Enum):
    """Submission status."""

    DRAFT = "draft"
    SUBMITTED = "submitted"


class ReviewRequestStatus(str, Enum):
    """Peer review request status."""

    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    COMPLETED = "completed"


class ReviewRequestSource(str, Enum):
    """Source of review request."""

    EMPLOYEE = "employee"
    MANAGER = "manager"


class ManagerSource(str, Enum):
    """How manager was assigned."""

    TEAM_LEAD = "team_lead"
    ASSIGNED = "assigned"


class GoalType(str, Enum):
    """Work goal types."""

    PERFORMANCE = "performance"
    SKILL_DEVELOPMENT = "skill_development"
    PROJECT = "project"
    LEADERSHIP = "leadership"
    TEAM_CONTRIBUTION = "team_contribution"


class GoalPriority(str, Enum):
    """Goal priority levels."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class GoalStatus(str, Enum):
    """Goal status."""

    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    DEFERRED = "deferred"


class PeerSelectionMode(str, Enum):
    """Peer reviewer selection mode."""

    EMPLOYEE_CHOICE = "employee_choice"
    MANAGER_ASSIGNED = "manager_assigned"
    BOTH = "both"


class ContributionPeriodType(str, Enum):
    """Contribution summary period types."""

    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    ANNUAL = "annual"
    CUSTOM = "custom"


# Nested schemas for COIN framework
class COINFeedback(BaseModel):
    """COIN framework feedback item."""

    context: str
    observation: str
    impact: str | None = None
    next_steps: str | None = None


class Achievement(BaseModel):
    """Achievement in review."""

    context: str
    observation: str
    impact: str
    accomplishment: str


class GrowthArea(BaseModel):
    """Area for growth in review."""

    context: str
    observation: str
    impact: str
    next_steps: str


class QuestionResponse(BaseModel):
    """Response to a review question."""

    rating: int | None = Field(default=None, ge=1, le=5)
    comment: str | None = None


class ReviewResponses(BaseModel):
    """Structured review responses."""

    achievements: list[Achievement] = []
    areas_for_growth: list[GrowthArea] = []
    question_responses: dict[str, QuestionResponse] = {}
    overall_feedback: str | None = None
    strengths: list[str] = []
    growth_areas: list[str] = []


# Key Result schema
class KeyResult(BaseModel):
    """OKR-style key result."""

    id: str
    description: str
    target: float
    current: float = 0
    unit: str = "%"


class KeyResultCreate(BaseModel):
    """Create a key result."""

    description: str
    target: float
    unit: str = "%"


class KeyResultUpdate(BaseModel):
    """Update a key result."""

    description: str | None = None
    target: float | None = None
    current: float | None = None
    unit: str | None = None


# Review Cycle Settings
class ReviewCycleSettings(BaseModel):
    """Review cycle configuration settings."""

    enable_self_review: bool = True
    enable_peer_review: bool = True
    enable_manager_review: bool = True
    anonymous_peer_reviews: bool = True
    min_peer_reviewers: int = Field(default=2, ge=0, le=10)
    max_peer_reviewers: int = Field(default=5, ge=1, le=20)
    peer_selection_mode: PeerSelectionMode = PeerSelectionMode.BOTH
    include_github_metrics: bool = True
    review_questions: list[dict] = []
    rating_scale: dict = Field(default_factory=lambda: {"min": 1, "max": 5})


# Review Cycle schemas
class ReviewCycleBase(BaseModel):
    """Base review cycle schema."""

    name: str
    cycle_type: ReviewCycleType = ReviewCycleType.ANNUAL
    period_start: date
    period_end: date
    self_review_deadline: date | None = None
    peer_review_deadline: date | None = None
    manager_review_deadline: date | None = None


class ReviewCycleCreate(ReviewCycleBase):
    """Create a review cycle."""

    settings: ReviewCycleSettings = Field(default_factory=ReviewCycleSettings)


class ReviewCycleUpdate(BaseModel):
    """Update a review cycle."""

    name: str | None = None
    cycle_type: ReviewCycleType | None = None
    period_start: date | None = None
    period_end: date | None = None
    self_review_deadline: date | None = None
    peer_review_deadline: date | None = None
    manager_review_deadline: date | None = None
    settings: ReviewCycleSettings | None = None
    status: ReviewCycleStatus | None = None


class ReviewCycleResponse(ReviewCycleBase):
    """Review cycle response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    settings: dict
    status: ReviewCycleStatus
    created_at: datetime
    updated_at: datetime


class ReviewCycleDetailResponse(ReviewCycleResponse):
    """Detailed review cycle response with stats."""

    total_reviews: int = 0
    completed_reviews: int = 0
    pending_self_reviews: int = 0
    pending_peer_reviews: int = 0
    pending_manager_reviews: int = 0


# Individual Review schemas
class IndividualReviewBase(BaseModel):
    """Base individual review schema."""

    developer_id: str
    manager_id: str | None = None


class IndividualReviewCreate(IndividualReviewBase):
    """Create an individual review."""

    manager_source: ManagerSource = ManagerSource.TEAM_LEAD


class IndividualReviewResponse(BaseModel):
    """Individual review response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    review_cycle_id: str
    developer_id: str
    developer_name: str | None = None
    manager_id: str | None = None
    manager_name: str | None = None
    manager_source: ManagerSource
    status: IndividualReviewStatus
    overall_rating: float | None = None
    ratings_breakdown: dict | None = None
    completed_at: datetime | None = None
    acknowledged_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class IndividualReviewDetailResponse(IndividualReviewResponse):
    """Detailed individual review with submissions and contributions."""

    contribution_summary: dict | None = None
    ai_summary: str | None = None
    self_review: "ReviewSubmissionResponse | None" = None
    peer_reviews: list["ReviewSubmissionResponse"] = []
    manager_review: "ReviewSubmissionResponse | None" = None
    goals: list["WorkGoalResponse"] = []


# Review Submission schemas
class ReviewSubmissionBase(BaseModel):
    """Base review submission schema."""

    responses: ReviewResponses = Field(default_factory=ReviewResponses)
    linked_goals: list[str] = []
    linked_contributions: list[str] = []


class SelfReviewSubmission(ReviewSubmissionBase):
    """Self-review submission."""

    pass


class SelfReviewUpdate(BaseModel):
    """Update self-review."""

    responses: ReviewResponses | None = None
    linked_goals: list[str] | None = None
    linked_contributions: list[str] | None = None


class PeerReviewSubmission(ReviewSubmissionBase):
    """Peer review submission."""

    is_anonymous: bool = True


class AnonymousPeerReviewSubmission(ReviewSubmissionBase):
    """Anonymous peer review submission (via token)."""

    pass


class ManagerReviewSubmission(ReviewSubmissionBase):
    """Manager review submission."""

    overall_rating: float = Field(ge=1, le=5)
    ratings_breakdown: dict[str, float] = {}


class ManagerReviewUpdate(BaseModel):
    """Update manager review."""

    responses: ReviewResponses | None = None
    overall_rating: float | None = Field(default=None, ge=1, le=5)
    ratings_breakdown: dict[str, float] | None = None
    linked_goals: list[str] | None = None
    linked_contributions: list[str] | None = None


class ReviewSubmissionResponse(BaseModel):
    """Review submission response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    individual_review_id: str
    submission_type: SubmissionType
    reviewer_id: str | None = None
    reviewer_name: str | None = None
    is_anonymous: bool
    responses: dict
    linked_goals: list[str]
    linked_contributions: list[str]
    status: SubmissionStatus
    submitted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class FinalReviewData(BaseModel):
    """Data for finalizing a review."""

    overall_rating: float = Field(ge=1, le=5)
    ratings_breakdown: dict[str, float] = {}
    ai_summary: str | None = None


# Review Request schemas
class PeerReviewRequest(BaseModel):
    """Request peer feedback."""

    reviewer_id: str
    message: str | None = None


class PeerReviewerAssignment(BaseModel):
    """Manager assigns peer reviewers."""

    reviewer_ids: list[str]
    message: str | None = None


class PeerRequestResponse(BaseModel):
    """Response to peer review request."""

    accept: bool
    decline_reason: str | None = None


class ReviewRequestResponse(BaseModel):
    """Review request response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    individual_review_id: str
    requester_id: str
    requester_name: str | None = None
    reviewer_id: str
    reviewer_name: str | None = None
    request_source: ReviewRequestSource
    assigned_by_id: str | None = None
    message: str | None = None
    status: ReviewRequestStatus
    submission_id: str | None = None
    requested_at: datetime
    responded_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


# Work Goal schemas
class WorkGoalBase(BaseModel):
    """Base work goal schema."""

    title: str
    description: str | None = None
    specific: str
    measurable: str
    achievable: str | None = None
    relevant: str | None = None
    time_bound: date
    goal_type: GoalType = GoalType.PERFORMANCE
    priority: GoalPriority = GoalPriority.MEDIUM
    is_private: bool = False


class WorkGoalCreate(WorkGoalBase):
    """Create a work goal."""

    key_results: list[KeyResultCreate] = []
    tracking_keywords: list[str] = []
    review_cycle_id: str | None = None
    learning_milestone_id: str | None = None


class WorkGoalUpdate(BaseModel):
    """Update a work goal."""

    title: str | None = None
    description: str | None = None
    specific: str | None = None
    measurable: str | None = None
    achievable: str | None = None
    relevant: str | None = None
    time_bound: date | None = None
    goal_type: GoalType | None = None
    priority: GoalPriority | None = None
    is_private: bool | None = None
    tracking_keywords: list[str] | None = None
    status: GoalStatus | None = None


class GoalProgressUpdate(BaseModel):
    """Update goal progress."""

    progress_percentage: int = Field(ge=0, le=100)
    key_result_updates: list[KeyResultUpdate] | None = None


class GoalCompletionData(BaseModel):
    """Data for completing a goal."""

    final_notes: str | None = None


class LinkActivityRequest(BaseModel):
    """Link GitHub activity to goal."""

    commit_shas: list[str] = []
    pull_request_ids: list[str] = []


class WorkGoalResponse(BaseModel):
    """Work goal response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    developer_id: str
    workspace_id: str
    title: str
    description: str | None = None
    specific: str
    measurable: str
    achievable: str | None = None
    relevant: str | None = None
    time_bound: date
    goal_type: GoalType
    priority: GoalPriority
    is_private: bool
    progress_percentage: int
    status: GoalStatus
    key_results: list[dict]
    linked_activity: dict
    tracking_keywords: list[str]
    review_cycle_id: str | None = None
    learning_milestone_id: str | None = None
    suggested_from_path: bool
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class WorkGoalDetailResponse(WorkGoalResponse):
    """Detailed work goal with linked contributions."""

    linked_commits: list[dict] = []
    linked_pull_requests: list[dict] = []


class LinkedContributionsResponse(BaseModel):
    """Linked contributions for a goal."""

    goal_id: str
    commits: list[dict]
    pull_requests: list[dict]
    total_additions: int = 0
    total_deletions: int = 0


# Contribution Summary schemas
class ContributionMetrics(BaseModel):
    """Contribution metrics."""

    commits: dict = {}
    pull_requests: dict = {}
    code_reviews: dict = {}
    lines: dict = {}
    languages: dict = {}
    skills_demonstrated: list[str] = []


class ContributionHighlight(BaseModel):
    """Notable contribution highlight."""

    type: str  # "pr", "commit", "review"
    id: str
    title: str
    impact: str | None = None
    additions: int | None = None
    deletions: int | None = None
    url: str | None = None


class ContributionSummaryCreate(BaseModel):
    """Create contribution summary."""

    period_start: date
    period_end: date
    period_type: ContributionPeriodType = ContributionPeriodType.ANNUAL


class ContributionSummaryResponse(BaseModel):
    """Contribution summary response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    developer_id: str
    period_start: date
    period_end: date
    period_type: ContributionPeriodType
    metrics: dict
    highlights: list[dict]
    ai_insights: str | None = None
    generated_at: datetime
    created_at: datetime
    updated_at: datetime


class ContributionSummaryRequest(BaseModel):
    """Request contribution summary."""

    period_start: date | None = None
    period_end: date | None = None
    period_type: ContributionPeriodType = ContributionPeriodType.ANNUAL


# Goal suggestions
class GoalSuggestion(BaseModel):
    """Goal suggestion from learning path."""

    title: str
    goal_type: GoalType
    suggested_measurable: str
    suggested_keywords: list[str]
    learning_milestone_id: str | None = None
    skill_name: str | None = None
