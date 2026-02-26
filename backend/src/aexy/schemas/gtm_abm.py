"""GTM Account-Based Marketing schemas."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class TargetListCreate(BaseModel):
    name: str
    description: str | None = None
    criteria: dict = Field(default_factory=dict)
    is_dynamic: bool = False


class TargetListUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    criteria: dict | None = None
    is_dynamic: bool | None = None
    is_active: bool | None = None


class TargetListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    description: str | None
    criteria: dict
    is_dynamic: bool
    is_active: bool
    account_count: int
    created_by: str | None
    created_at: datetime
    updated_at: datetime


class ABMAccountCreate(BaseModel):
    record_id: str
    tier: str = "tier_2"
    owner_id: str | None = None
    notes: str | None = None


class ABMAccountUpdate(BaseModel):
    tier: str | None = None
    stage: str | None = None
    owner_id: str | None = None
    notes: str | None = None


class ABMAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    target_list_id: str
    record_id: str
    tier: str
    stage: str
    owner_id: str | None
    engagement_score: int
    total_contacts: int
    identified_contacts: int
    decision_makers: int
    contacts_in_sequences: int
    emails_sent: int
    emails_replied: int
    meetings_booked: int
    deals_created: int
    assigned_campaigns: list
    stage_history: list
    notes: str | None
    last_activity_at: datetime | None
    added_at: datetime
    created_at: datetime
    updated_at: datetime


class ABMAccountListResponse(BaseModel):
    items: list[ABMAccountResponse] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    per_page: int = 50


class StageChangeRequest(BaseModel):
    stage: str
    notes: str | None = None


class CampaignAssignRequest(BaseModel):
    campaign_id: str
    campaign_name: str


class ABMOverviewResponse(BaseModel):
    total_lists: int = 0
    total_accounts: int = 0
    stage_distribution: list[dict] = Field(default_factory=list)
    tier_distribution: list[dict] = Field(default_factory=list)
    avg_engagement_score: float = 0.0
    top_accounts: list[dict] = Field(default_factory=list)
    penetration_metrics: dict = Field(default_factory=dict)


class AccountJourneyResponse(BaseModel):
    account_id: str
    record_id: str
    events: list[dict] = Field(default_factory=list)
