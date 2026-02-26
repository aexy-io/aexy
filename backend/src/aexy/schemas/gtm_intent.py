"""GTM Intent Signal schemas."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class IntentSignalCreate(BaseModel):
    company_name: str | None = None
    company_domain: str | None = None
    record_id: str | None = None
    signal_type: str
    title: str
    description: str | None = None
    source_url: str | None = None
    source_name: str | None = None
    confidence_score: float = 0.5
    intent_strength: str = "medium"
    signal_data: dict = Field(default_factory=dict)


class IntentSignalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    record_id: str | None
    company_name: str | None
    company_domain: str | None
    signal_type: str
    title: str
    description: str | None
    source_url: str | None
    source_name: str | None
    confidence_score: float
    intent_strength: str
    signal_data: dict
    is_processed: bool
    is_dismissed: bool
    detected_at: datetime
    expires_at: datetime | None
    created_at: datetime


class IntentSignalListResponse(BaseModel):
    items: list[IntentSignalResponse] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    per_page: int = 50


class IntentConfigUpdate(BaseModel):
    monitored_domains: list[str] | None = None
    job_title_keywords: list[str] | None = None
    tech_keywords: list[str] | None = None
    competitor_names: list[str] | None = None
    signal_weights: dict | None = None


class IntentConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    monitored_domains: list
    job_title_keywords: list
    tech_keywords: list
    competitor_names: list
    signal_weights: dict
    is_active: bool
    created_at: datetime
    updated_at: datetime


class IntentSummaryResponse(BaseModel):
    total_signals: int = 0
    unprocessed_count: int = 0
    by_type: list[dict] = Field(default_factory=list)
    by_strength: list[dict] = Field(default_factory=list)
    top_companies: list[dict] = Field(default_factory=list)
