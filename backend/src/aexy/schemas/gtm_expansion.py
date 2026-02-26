"""GTM Expansion Playbook schemas."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class PlaybookCreate(BaseModel):
    name: str
    description: str | None = None
    playbook_type: str = "upsell"
    trigger_conditions: list[dict] = Field(default_factory=list)
    target_product: dict = Field(default_factory=dict)
    steps: list[dict] = Field(default_factory=list)
    status: str = "draft"


class PlaybookUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    playbook_type: str | None = None
    trigger_conditions: list[dict] | None = None
    target_product: dict | None = None
    steps: list[dict] | None = None
    status: str | None = None
    is_active: bool | None = None


class PlaybookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None
    playbook_type: str
    trigger_conditions: list
    target_product: dict
    steps: list
    status: str
    is_active: bool
    total_enrollments: int
    conversion_count: int
    total_revenue_generated: float
    created_by: str | None
    created_at: datetime
    updated_at: datetime


class EnrollmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    playbook_id: str
    record_id: str
    assigned_to: str | None
    status: str
    current_step_index: int
    trigger_data: dict
    outcome: dict
    enrolled_at: datetime
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class EnrollmentListResponse(BaseModel):
    items: list[EnrollmentResponse] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    per_page: int = 50


class EnrollRequest(BaseModel):
    assigned_to: str | None = None
    trigger_data: dict = Field(default_factory=dict)


class OutcomeRequest(BaseModel):
    status: str
    deal_id: str | None = None
    revenue: float | None = None
    notes: str | None = None


class PlaybookAnalyticsResponse(BaseModel):
    total_playbooks: int = 0
    active_playbooks: int = 0
    total_enrollments: int = 0
    active_enrollments: int = 0
    total_conversions: int = 0
    total_revenue: float = 0.0
    conversion_rate: float = 0.0
    by_type: list[dict] = Field(default_factory=list)
