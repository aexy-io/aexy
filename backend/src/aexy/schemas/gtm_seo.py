"""GTM SEO Audit schemas."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class SEOAuditCreate(BaseModel):
    target_url: str
    record_id: str | None = None
    max_pages: int = Field(default=20, ge=1, le=100)


class SEOAuditResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    target_url: str
    domain: str
    record_id: str | None
    overall_score: int
    meta_score: int
    headings_score: int
    links_score: int
    images_score: int
    performance_score: int
    findings: dict
    recommendations: list
    pages_crawled: int
    status: str
    error_message: str | None
    duration_seconds: float | None
    triggered_by: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime


class SEOAuditListResponse(BaseModel):
    items: list[SEOAuditResponse] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    per_page: int = 50


class SEOAuditPageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    audit_id: str
    url: str
    status_code: int
    page_score: int
    title: str | None
    meta_description: str | None
    h1_text: str | None
    word_count: int
    page_size_kb: float
    load_time_ms: float
    issues: list
    created_at: datetime


class SEOScoreHistoryResponse(BaseModel):
    domain: str
    audits: list[dict] = Field(default_factory=list)
