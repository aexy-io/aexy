"""Team-related Pydantic schemas."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


# Team Schemas
class TeamCreate(BaseModel):
    """Schema for creating a team."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    type: str = Field(default="manual")  # "manual" | "repo_based"
    source_repository_ids: list[str] | None = None


class TeamUpdate(BaseModel):
    """Schema for updating a team."""

    name: str | None = None
    description: str | None = None
    auto_sync_enabled: bool | None = None
    settings: dict | None = None


class TeamResponse(BaseModel):
    """Schema for team response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None = None
    type: str
    source_repository_ids: list[str] | None = None
    auto_sync_enabled: bool = False
    member_count: int = 0
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class TeamListResponse(BaseModel):
    """Schema for team list item."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    slug: str
    type: str
    member_count: int = 0
    is_active: bool = True


# Team Member Schemas
class TeamMemberAdd(BaseModel):
    """Schema for adding a team member."""

    developer_id: str
    role: str = Field(default="member")  # "lead" | "member"


class TeamMemberUpdate(BaseModel):
    """Schema for updating a team member."""

    role: str  # "lead" | "member"


class TeamMemberResponse(BaseModel):
    """Schema for team member response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    team_id: str
    developer_id: str
    developer_name: str | None = None
    developer_email: str | None = None
    developer_avatar_url: str | None = None
    role: str
    source: str
    joined_at: datetime
    created_at: datetime


# Team Generation Schemas
class TeamFromRepositoryRequest(BaseModel):
    """Schema for generating a team from repository contributors."""

    repository_id: str
    team_name: str | None = None
    include_contributors_since_days: int = Field(default=90, ge=1, le=365)


class TeamSyncResult(BaseModel):
    """Schema for team sync result."""

    team_id: str
    added_members: int = 0
    removed_members: int = 0
    unchanged_members: int = 0


# Team Analytics Schemas (wrappers around existing TeamService responses)
class TeamProfileResponse(BaseModel):
    """Schema for team profile/analytics."""

    team_id: str
    team_name: str
    member_count: int
    languages: list[dict] = []
    frameworks: list[dict] = []
    domains: list[dict] = []
    tools: list[str] = []
    velocity: dict | None = None
    commit_distribution: dict | None = None


class TeamBusFactorResponse(BaseModel):
    """Schema for team bus factor analysis."""

    team_id: str
    bus_factor_skills: dict[str, int] = {}  # skill -> developer count
    critical_skills: list[str] = []  # Skills with only 1 expert


class TeamSkillCoverageResponse(BaseModel):
    """Schema for team skill coverage analysis."""

    team_id: str
    coverage_percentage: float = 0.0
    covered_skills: list[str] = []
    missing_skills: list[str] = []
