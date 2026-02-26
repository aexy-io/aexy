"""GTM Competitor Intelligence schemas."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class CompetitorCreate(BaseModel):
    name: str
    domain: str
    tracked_pages: list[dict] = Field(default_factory=list)


class CompetitorUpdate(BaseModel):
    name: str | None = None
    domain: str | None = None
    tracked_pages: list[dict] | None = None
    is_active: bool | None = None


class CompetitorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    domain: str
    tracked_pages: list
    current_snapshot: dict
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CompetitorChangeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    competitor_id: str
    page_url: str
    page_label: str | None
    change_type: str
    title: str
    description: str | None
    severity: str
    diff_data: dict
    is_acknowledged: bool
    detected_at: datetime
    created_at: datetime


class CompetitorChangeListResponse(BaseModel):
    items: list[CompetitorChangeResponse] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    per_page: int = 50


class BattleCardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    competitor_id: str
    title: str
    overview: str | None
    strengths: list
    weaknesses: list
    our_advantages: list
    objection_handling: list
    talk_tracks: list
    pricing_comparison: dict
    win_rate: float
    total_deals: int
    wins: int
    losses: int
    common_loss_reasons: list
    common_win_reasons: list
    status: str
    version: int
    generated_at: datetime | None
    created_at: datetime
    updated_at: datetime


class BattleCardUpdate(BaseModel):
    title: str | None = None
    overview: str | None = None
    strengths: list | None = None
    weaknesses: list | None = None
    our_advantages: list | None = None
    objection_handling: list | None = None
    talk_tracks: list | None = None
    pricing_comparison: dict | None = None
    status: str | None = None
