"""GTM Lead Routing schemas."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class RoutingRuleCreate(BaseModel):
    name: str
    priority: int = 0
    conditions: list[dict] = Field(default_factory=list)
    strategy: str = "round_robin"
    assignee_pool: list[dict] = Field(default_factory=list)
    sla_first_response_minutes: int | None = None
    sla_follow_up_minutes: int | None = None
    fallback_assignee_id: str | None = None
    is_active: bool = True


class RoutingRuleUpdate(BaseModel):
    name: str | None = None
    priority: int | None = None
    conditions: list[dict] | None = None
    strategy: str | None = None
    assignee_pool: list[dict] | None = None
    sla_first_response_minutes: int | None = None
    sla_follow_up_minutes: int | None = None
    fallback_assignee_id: str | None = None
    is_active: bool | None = None


class RoutingRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    priority: int
    is_active: bool
    conditions: list
    strategy: str
    assignee_pool: list
    sla_first_response_minutes: int | None
    sla_follow_up_minutes: int | None
    fallback_assignee_id: str | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime


class LeadAssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    record_id: str
    routing_rule_id: str | None
    assignee_id: str
    assigned_at: datetime
    first_response_at: datetime | None
    sla_first_response_minutes: int | None
    sla_breached: bool
    sla_breach_at: datetime | None
    status: str
    notes: str | None
    created_at: datetime
    updated_at: datetime


class LeadAssignmentListResponse(BaseModel):
    items: list[LeadAssignmentResponse] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    per_page: int = 50


class ReassignRequest(BaseModel):
    new_assignee_id: str
    notes: str | None = None


class SLADashboardResponse(BaseModel):
    total_assignments: int = 0
    pending_count: int = 0
    contacted_count: int = 0
    qualified_count: int = 0
    avg_response_minutes: float = 0.0
    sla_breach_count: int = 0
    sla_breach_rate: float = 0.0
    assignments_by_rep: list[dict] = Field(default_factory=list)
