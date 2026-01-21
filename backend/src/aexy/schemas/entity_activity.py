"""Entity Activity related Pydantic schemas for timeline tracking."""

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


# Entity types supported by the activity system
EntityType = Literal[
    "goal", "task", "backlog", "story", "release", "roadmap", "epic", "bug"
]

# Activity types
ActivityType = Literal[
    "created", "updated", "comment", "status_changed", "assigned",
    "progress_updated", "linked", "unlinked"
]


# ==================== Activity Create Schemas ====================

class EntityActivityCreate(BaseModel):
    """Schema for creating an entity activity (mainly for comments)."""

    entity_type: EntityType
    entity_id: str
    activity_type: ActivityType = "comment"
    title: str | None = None
    content: str | None = Field(default=None, max_length=10000)
    metadata: dict | None = None


class EntityCommentCreate(BaseModel):
    """Schema for adding a comment to an entity."""

    content: str = Field(..., min_length=1, max_length=10000)


# ==================== Activity Response Schemas ====================

class ActorInfo(BaseModel):
    """Schema for actor (user) information in activity."""

    id: str
    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None


class EntityActivityResponse(BaseModel):
    """Schema for entity activity response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    entity_type: EntityType
    entity_id: str
    activity_type: ActivityType
    actor_id: str | None = None
    actor_name: str | None = None
    actor_email: str | None = None
    actor_avatar_url: str | None = None
    title: str | None = None
    content: str | None = None
    changes: dict | None = None
    metadata: dict | None = None
    created_at: datetime


class EntityActivityListResponse(BaseModel):
    """Schema for paginated activity list."""

    items: list[EntityActivityResponse]
    total: int
    has_more: bool = False


# ==================== Timeline Response ====================

class TimelineEntry(BaseModel):
    """Schema for a timeline entry with formatted display info."""

    id: str
    activity_type: ActivityType
    actor: ActorInfo | None = None
    title: str | None = None
    content: str | None = None
    changes: dict | None = None
    metadata: dict | None = None
    created_at: datetime
    # Computed fields for display
    display_text: str | None = None
    icon: str | None = None


class TimelineResponse(BaseModel):
    """Schema for entity timeline."""

    entity_type: EntityType
    entity_id: str
    entries: list[TimelineEntry]
    total: int
