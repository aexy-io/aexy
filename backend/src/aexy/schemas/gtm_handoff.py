"""GTM CS-to-Sales Handoff schemas."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class HandoffCreate(BaseModel):
    record_id: str
    assigned_to: str
    handoff_type: str = "expansion"
    title: str
    context: str | None = None
    estimated_value: float | None = None
    products: list[str] = Field(default_factory=list)
    signals: list[dict] = Field(default_factory=list)
    sla_accept_minutes: int = 120


class HandoffResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    record_id: str
    created_by: str
    assigned_to: str
    handoff_type: str
    title: str
    context: str | None
    estimated_value: float | None
    products: list
    signals: list
    status: str
    accepted_at: datetime | None
    declined_reason: str | None
    deal_id: str | None
    outcome_notes: str | None
    sla_accept_minutes: int
    sla_breached: bool
    created_at: datetime
    updated_at: datetime


class HandoffListResponse(BaseModel):
    items: list[HandoffResponse] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    per_page: int = 50


class DeclineRequest(BaseModel):
    reason: str


class ConvertRequest(BaseModel):
    deal_name: str
    deal_value: float | None = None
    pipeline_id: str | None = None
    notes: str | None = None


class HandoffAnalyticsResponse(BaseModel):
    total_handoffs: int = 0
    pending_count: int = 0
    accepted_count: int = 0
    converted_count: int = 0
    declined_count: int = 0
    avg_accept_minutes: float = 0.0
    conversion_rate: float = 0.0
    total_converted_value: float = 0.0
    sla_breach_rate: float = 0.0
