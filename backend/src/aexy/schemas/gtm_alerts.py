"""GTM Alert schemas."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class AlertConfigCreate(BaseModel):
    name: str
    event_type: str
    conditions: dict = Field(default_factory=dict)
    channel_type: str = "slack"
    channel_config: dict = Field(default_factory=dict)
    message_template: str | None = None
    is_active: bool = True


class AlertConfigUpdate(BaseModel):
    name: str | None = None
    event_type: str | None = None
    conditions: dict | None = None
    channel_type: str | None = None
    channel_config: dict | None = None
    message_template: str | None = None
    is_active: bool | None = None


class AlertConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    event_type: str
    conditions: dict
    channel_type: str
    channel_config: dict
    message_template: str | None
    is_active: bool
    created_by: str | None
    created_at: datetime
    updated_at: datetime


class AlertLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    alert_config_id: str
    event_type: str
    event_data: dict
    channel_type: str
    delivery_status: str
    error_message: str | None
    sent_at: datetime
    created_at: datetime


class AlertLogListResponse(BaseModel):
    items: list[AlertLogResponse] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    per_page: int = 50


class EmitEventRequest(BaseModel):
    event_type: str
    event_data: dict = Field(default_factory=dict)
