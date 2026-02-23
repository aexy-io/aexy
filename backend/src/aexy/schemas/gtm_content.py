"""GTM Content Gap Analysis schemas."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class ContentAnalysisCreate(BaseModel):
    our_domain: str
    competitor_domains: list[str] = Field(default_factory=list, max_length=5)


class ContentAnalysisResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    our_domain: str
    competitor_domains: list
    status: str
    our_topics: list
    competitor_topics: list
    gaps: list
    opportunities: list
    summary: str | None
    pages_analyzed: int
    error_message: str | None
    triggered_by: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime


class ContentAnalysisListResponse(BaseModel):
    items: list[ContentAnalysisResponse] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    per_page: int = 50
