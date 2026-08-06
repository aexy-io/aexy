"""Schemas for progress updates on tasks and tickets."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

WorkUpdateEntityType = Literal["task", "ticket"]


class WorkUpdateCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class WorkUpdateEdit(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class WorkUpdateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    entity_type: str
    entity_id: str
    author_id: str | None
    author_name: str | None = None
    author_email: str | None = None
    author_avatar_url: str | None = None
    body: str
    created_at: datetime
    edited_at: datetime | None = None


class WorkUpdateListResponse(BaseModel):
    items: list[WorkUpdateResponse]
    total: int


class LatestWorkUpdate(BaseModel):
    """Compact form for board cards — enough to render "last update 3d ago"
    and who wrote it, without shipping every update for every card."""

    entity_id: str
    author_name: str | None = None
    body: str
    created_at: datetime
