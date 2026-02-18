"""Developer-related Pydantic schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LanguageSkill(BaseModel):
    """Language proficiency information."""

    name: str
    proficiency_score: float = Field(ge=0, le=100)
    lines_of_code: int = 0
    commits_count: int = 0
    trend: str = "stable"  # growing, stable, declining


class FrameworkSkill(BaseModel):
    """Framework/library proficiency information."""

    name: str
    category: str  # web, data, testing, etc.
    proficiency_score: float = Field(ge=0, le=100)
    usage_count: int = 0


class DomainExpertise(BaseModel):
    """Domain knowledge information."""

    name: str  # payments, auth, ML, etc.
    confidence_score: float = Field(ge=0, le=100)


class SkillFingerprint(BaseModel):
    """Complete skill fingerprint for a developer."""

    languages: list[LanguageSkill] = []
    frameworks: list[FrameworkSkill] = []
    domains: list[DomainExpertise] = []
    tools: list[str] = []  # CI/CD, databases, cloud services


class WorkPatterns(BaseModel):
    """Developer work patterns."""

    preferred_complexity: str = "medium"  # simple, medium, complex
    collaboration_style: str = "balanced"  # solo, balanced, collaborative
    peak_productivity_hours: list[int] = []
    average_pr_size: int = 0
    average_review_turnaround_hours: float = 0


class GrowthTrajectory(BaseModel):
    """Developer growth trajectory."""

    skills_acquired_6m: list[str] = []
    skills_acquired_12m: list[str] = []
    skills_declining: list[str] = []
    learning_velocity: float = 0  # skills per month


class DeveloperBase(BaseModel):
    """Base developer schema."""

    email: EmailStr
    name: str | None = None


class DeveloperCreate(DeveloperBase):
    """Schema for creating a developer."""

    pass


class DeveloperUpdate(BaseModel):
    """Schema for updating a developer."""

    name: str | None = None
    skill_fingerprint: SkillFingerprint | None = None
    work_patterns: WorkPatterns | None = None
    growth_trajectory: GrowthTrajectory | None = None


class GitHubConnectionResponse(BaseModel):
    """GitHub connection response schema."""

    model_config = ConfigDict(from_attributes=True)

    github_username: str
    github_name: str | None = None
    github_avatar_url: str | None = None
    connected_at: datetime | None = None
    auth_status: str = "active"
    auth_error: str | None = None


class DeveloperResponse(DeveloperBase):
    """Schema for developer response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    avatar_url: str | None = None
    skill_fingerprint: SkillFingerprint | None = None
    work_patterns: WorkPatterns | None = None
    growth_trajectory: GrowthTrajectory | None = None
    github_connection: GitHubConnectionResponse | None = None
    created_at: datetime
    updated_at: datetime
