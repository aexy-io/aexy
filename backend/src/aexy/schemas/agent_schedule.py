"""Schemas for agent schedules."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from aexy.models.agent_schedule import MIN_INTERVAL_MINUTES


class AgentScheduleCreate(BaseModel):
    agent_id: str
    name: str = Field(..., min_length=1, max_length=255)
    routine: str = Field(..., min_length=1, description="The instruction the agent runs each time.")
    interval_minutes: int = Field(default=1440, ge=MIN_INTERVAL_MINUTES, le=60 * 24 * 31)
    timezone: str = Field(default="UTC", max_length=64)
    enabled: bool = True


class AgentScheduleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    routine: str | None = Field(default=None, min_length=1)
    interval_minutes: int | None = Field(default=None, ge=MIN_INTERVAL_MINUTES, le=60 * 24 * 31)
    timezone: str | None = Field(default=None, max_length=64)
    enabled: bool | None = None


class AgentScheduleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    agent_id: str
    name: str
    routine: str
    interval_minutes: int
    timezone: str
    enabled: bool
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None
    last_execution_id: str | None = None
    run_count: int
    created_by_id: str | None = None
    created_at: datetime
    updated_at: datetime
