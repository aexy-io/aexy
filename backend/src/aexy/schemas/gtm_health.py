"""GTM Customer Health Scoring schemas."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class HealthScoreResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    record_id: str
    total_score: int
    engagement_score: int
    usage_score: int
    support_score: int
    nps_score: int
    payment_score: int
    health_status: str
    trend: str
    previous_score: int
    score_delta: int
    scoring_factors: dict
    score_history: list
    last_scored_at: datetime
    created_at: datetime
    updated_at: datetime


class HealthScoreListResponse(BaseModel):
    items: list[HealthScoreResponse] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    per_page: int = 50


class HealthConfigUpdate(BaseModel):
    weights: dict | None = None
    healthy_threshold: int | None = None
    at_risk_threshold: int | None = None
    critical_threshold: int | None = None


class HealthConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    weights: dict
    healthy_threshold: int
    at_risk_threshold: int
    critical_threshold: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class HealthDashboardResponse(BaseModel):
    total_customers: int = 0
    healthy_count: int = 0
    neutral_count: int = 0
    at_risk_count: int = 0
    critical_count: int = 0
    avg_score: float = 0.0
    improving_count: int = 0
    declining_count: int = 0
    status_distribution: list[dict] = Field(default_factory=list)
    recent_drops: list[dict] = Field(default_factory=list)
