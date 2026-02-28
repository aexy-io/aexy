"""Pydantic schemas for API tokens."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ApiTokenCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    expires_in_days: int | None = Field(default=90, ge=1, le=365)


class ApiTokenResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    token_prefix: str
    expires_at: datetime | None
    last_used_at: datetime | None
    is_active: bool
    created_at: datetime


class ApiTokenCreatedResponse(ApiTokenResponse):
    token: str
