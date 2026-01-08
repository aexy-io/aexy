"""Career-related Pydantic schemas."""

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


# Enums
class CareerTrack(str, Enum):
    """Career track types."""

    ENGINEERING = "engineering"
    MANAGEMENT = "management"
    SPECIALIST = "specialist"


class CareerLevel(int, Enum):
    """Career level progression."""

    JUNIOR = 1
    MID = 2
    SENIOR = 3
    STAFF = 4
    PRINCIPAL = 5


class LearningPathStatus(str, Enum):
    """Learning path status."""

    ACTIVE = "active"
    COMPLETED = "completed"
    PAUSED = "paused"
    ABANDONED = "abandoned"


class TrajectoryStatus(str, Enum):
    """Progress trajectory status."""

    ON_TRACK = "on_track"
    AHEAD = "ahead"
    BEHIND = "behind"
    AT_RISK = "at_risk"


class MilestoneStatus(str, Enum):
    """Milestone progress status."""

    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    BEHIND = "behind"


class HiringPriority(str, Enum):
    """Hiring priority levels."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class HiringStatus(str, Enum):
    """Hiring requirement status."""

    DRAFT = "draft"
    ACTIVE = "active"
    FILLED = "filled"
    CANCELLED = "cancelled"


# Skill requirement schemas
class SkillRequirement(BaseModel):
    """Individual skill requirement."""

    skill: str
    level: int = Field(ge=0, le=100)
    reasoning: str | None = None


class SoftSkillRequirement(BaseModel):
    """Soft skill requirement."""

    skill: str
    weight: float = Field(ge=0, le=1)


# Career Role schemas
class CareerRoleBase(BaseModel):
    """Base career role schema."""

    name: str
    level: int = Field(ge=1, le=5)
    track: CareerTrack
    description: str | None = None
    responsibilities: list[str] = []


class CareerRoleCreate(CareerRoleBase):
    """Schema for creating a career role."""

    organization_id: str | None = None
    required_skills: dict[str, int] = {}  # {"Python": 70}
    preferred_skills: dict[str, int] = {}
    soft_skill_requirements: dict[str, float] = {}  # {"leadership": 0.5}


class CareerRoleUpdate(BaseModel):
    """Schema for updating a career role."""

    name: str | None = None
    level: int | None = Field(default=None, ge=1, le=5)
    track: CareerTrack | None = None
    description: str | None = None
    responsibilities: list[str] | None = None
    required_skills: dict[str, int] | None = None
    preferred_skills: dict[str, int] | None = None
    soft_skill_requirements: dict[str, float] | None = None
    is_active: bool | None = None


class CareerRoleResponse(CareerRoleBase):
    """Career role response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str | None = None
    required_skills: dict[str, int]
    preferred_skills: dict[str, int]
    soft_skill_requirements: dict[str, float]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class RoleRequirements(BaseModel):
    """Detailed role requirements."""

    role_id: str
    role_name: str
    level: int
    track: str
    required_skills: list[SkillRequirement]
    preferred_skills: list[SkillRequirement]
    soft_skills: list[SoftSkillRequirement]
    responsibilities: list[str]


# Gap Analysis schemas
class SkillGap(BaseModel):
    """Individual skill gap."""

    skill: str
    current: int = Field(ge=0, le=100)
    target: int = Field(ge=0, le=100)
    gap: int


class RoleGapAnalysis(BaseModel):
    """Gap analysis for a developer vs a role."""

    developer_id: str
    role_id: str
    role_name: str
    overall_readiness: float = Field(ge=0, le=1)  # 0-1 percentage
    skill_gaps: list[SkillGap]
    met_requirements: list[str]
    soft_skill_gaps: dict[str, float]  # {"leadership": -0.2}
    estimated_time_to_ready_months: int | None = None


class RoleSuggestion(BaseModel):
    """Role suggestion for career progression."""

    role: CareerRoleResponse
    readiness_score: float = Field(ge=0, le=1)
    progression_type: str  # "promotion", "lateral", "specialization"
    key_gaps: list[str]
    estimated_preparation_months: int


class PromotionReadiness(BaseModel):
    """Promotion readiness assessment."""

    developer_id: str
    target_role_id: str
    target_role_name: str
    overall_readiness: float = Field(ge=0, le=1)
    met_criteria: list[str]
    missing_criteria: list[str]
    recommendations: list[str]
    timeline_estimate: str | None = None


# Learning Path schemas
class LearningActivity(BaseModel):
    """Learning activity recommendation."""

    type: str  # "task", "pairing", "review", "course", "book"
    description: str
    source: str  # "internal", "coursera", "udemy", etc.
    url: str | None = None
    estimated_hours: int | None = None


class LearningPhase(BaseModel):
    """Learning path phase."""

    name: str
    duration_weeks: int
    skills: list[str]
    activities: list[LearningActivity]


class LearningMilestoneBase(BaseModel):
    """Base milestone schema."""

    skill_name: str
    target_score: int = Field(ge=0, le=100)
    target_date: date | None = None


class LearningMilestoneCreate(LearningMilestoneBase):
    """Schema for creating a milestone."""

    recommended_activities: list[LearningActivity] = []


class LearningMilestoneResponse(LearningMilestoneBase):
    """Milestone response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    learning_path_id: str
    current_score: int
    status: MilestoneStatus
    completed_date: date | None = None
    recommended_activities: list[dict]
    completed_activities: list[str]
    sequence: int
    created_at: datetime
    updated_at: datetime


class LearningPathCreate(BaseModel):
    """Schema for creating a learning path."""

    developer_id: str
    target_role_id: str
    timeline_months: int = Field(default=12, ge=1, le=36)


class LearningPathGenerate(BaseModel):
    """Schema for generating a learning path via LLM."""

    target_role_id: str
    timeline_months: int = Field(default=12, ge=1, le=36)
    include_external_resources: bool = False


class LearningPathResponse(BaseModel):
    """Learning path response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    developer_id: str
    target_role_id: str | None
    target_role_name: str | None = None
    skill_gaps: dict[str, dict]
    phases: list[dict]
    milestones: list[LearningMilestoneResponse] = []
    status: LearningPathStatus
    progress_percentage: int
    trajectory_status: TrajectoryStatus
    estimated_success_probability: float | None
    risk_factors: list[str]
    recommendations: list[str]
    started_at: datetime
    target_completion: date | None
    actual_completion: date | None
    generated_by_model: str | None
    last_regenerated_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PathProgressUpdate(BaseModel):
    """Learning path progress update."""

    path_id: str
    previous_progress: int
    new_progress: int
    milestones_completed: list[str]
    skills_improved: dict[str, int]  # {"Python": +5}
    trajectory_status: TrajectoryStatus


class StretchAssignment(BaseModel):
    """Stretch assignment recommendation."""

    task_id: str
    task_title: str
    source: str  # "jira", "linear", "github"
    skill_growth: list[str]
    alignment_score: float = Field(ge=0, le=1)
    challenge_level: str  # "moderate", "high", "stretch"


# Hiring Intelligence schemas
class TeamSkillGapDetail(BaseModel):
    """Detailed team skill gap."""

    skill: str
    current_coverage: float = Field(ge=0, le=1)  # % of team with skill
    average_proficiency: float = Field(ge=0, le=100)
    gap_severity: str  # "critical", "moderate", "low"
    developers_with_skill: list[str]


class BusFactorRisk(BaseModel):
    """Bus factor risk identification."""

    skill_or_area: str
    risk_level: str  # "critical", "high", "medium"
    single_developer: str | None = None
    developer_name: str | None = None
    impact_description: str
    mitigation_suggestion: str


class TeamGapAnalysis(BaseModel):
    """Complete team skill gap analysis."""

    team_id: str | None
    organization_id: str
    total_developers: int
    skill_gaps: list[TeamSkillGapDetail]
    bus_factor_risks: list[BusFactorRisk]
    critical_missing_skills: list[str]
    analysis_date: datetime


class RoadmapSkillRequirement(BaseModel):
    """Skill requirement extracted from roadmap."""

    skill: str
    priority: HiringPriority
    source_items: list[str]  # Epic/story IDs
    estimated_demand: int  # Number of developers needed


class RoadmapSkillAnalysis(BaseModel):
    """Roadmap skill analysis result."""

    roadmap_skills: list[RoadmapSkillRequirement]
    gaps_vs_team: list[str]
    hiring_recommendations: list[str]


class GeneratedJD(BaseModel):
    """LLM-generated job description."""

    role_title: str
    level: str
    summary: str
    must_have_skills: list[SkillRequirement]
    nice_to_have_skills: list[SkillRequirement]
    responsibilities: list[str]
    qualifications: list[str]
    cultural_indicators: list[str]
    full_text: str


class InterviewQuestion(BaseModel):
    """Interview question with evaluation criteria."""

    question: str
    skill_assessed: str
    difficulty: str  # "easy", "medium", "hard"
    evaluation_criteria: list[str]
    red_flags: list[str]
    bonus_indicators: list[str]


class InterviewRubric(BaseModel):
    """Complete interview rubric."""

    role_title: str
    technical_questions: list[InterviewQuestion]
    behavioral_questions: list[InterviewQuestion]
    system_design_prompt: str | None = None
    culture_fit_criteria: list[str]


class HiringRequirementCreate(BaseModel):
    """Schema for creating a hiring requirement."""

    organization_id: str
    team_id: str | None = None
    target_role_id: str | None = None
    role_title: str
    priority: HiringPriority = HiringPriority.MEDIUM
    timeline: str | None = None
    roadmap_items: list[str] = []


class HiringRequirementResponse(BaseModel):
    """Hiring requirement response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    team_id: str | None
    target_role_id: str | None
    role_title: str
    priority: HiringPriority
    timeline: str | None
    must_have_skills: list[dict]
    nice_to_have_skills: list[dict]
    soft_skill_requirements: dict
    gap_analysis: dict
    roadmap_items: list[str]
    job_description: str | None
    interview_rubric: dict
    status: HiringStatus
    generated_by_model: str | None
    created_at: datetime
    updated_at: datetime


class CandidateSkillAssessment(BaseModel):
    """Individual candidate skill assessment."""

    skill: str
    candidate_level: int = Field(ge=0, le=100)
    required_level: int = Field(ge=0, le=100)
    meets_requirement: bool
    gap: int


class CandidateScorecard(BaseModel):
    """Candidate comparison scorecard."""

    requirement_id: str
    role_title: str
    candidate_name: str | None = None
    overall_score: float = Field(ge=0, le=100)
    must_have_met: int
    must_have_total: int
    nice_to_have_met: int
    nice_to_have_total: int
    skill_assessments: list[CandidateSkillAssessment]
    strengths: list[str]
    concerns: list[str]
    recommendation: str  # "strong_yes", "yes", "maybe", "no"


# Organization Settings schemas
class OrganizationSettingsBase(BaseModel):
    """Base organization settings schema."""

    enable_external_courses: bool = False
    external_sources: list[str] = []
    use_custom_roles: bool = False
    custom_career_tracks: list[str] = []
    preferred_llm_provider: str | None = None


class OrganizationSettingsCreate(OrganizationSettingsBase):
    """Schema for creating organization settings."""

    organization_id: str


class OrganizationSettingsUpdate(BaseModel):
    """Schema for updating organization settings."""

    enable_external_courses: bool | None = None
    external_sources: list[str] | None = None
    use_custom_roles: bool | None = None
    custom_career_tracks: list[str] | None = None
    preferred_llm_provider: str | None = None


class OrganizationSettingsResponse(OrganizationSettingsBase):
    """Organization settings response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    created_at: datetime
    updated_at: datetime
