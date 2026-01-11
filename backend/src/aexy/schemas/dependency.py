"""Dependency related Pydantic schemas."""

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


# Dependency Types
DependencyType = Literal["blocks", "is_blocked_by", "relates_to", "duplicates", "is_child_of", "is_parent_of"]
DependencyStatus = Literal["active", "resolved"]


# ==================== Story Dependency Schemas ====================

class StoryDependencyCreate(BaseModel):
    """Schema for creating a story dependency."""

    blocking_story_id: str
    dependency_type: DependencyType = "blocks"
    is_external: bool = False
    external_description: str | None = None
    external_url: str | None = Field(default=None, max_length=500)
    notes: str | None = None


class StoryDependencyUpdate(BaseModel):
    """Schema for updating a story dependency."""

    dependency_type: DependencyType | None = None
    notes: str | None = None
    external_description: str | None = None
    external_url: str | None = Field(default=None, max_length=500)


class StoryDependencyResponse(BaseModel):
    """Schema for story dependency response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    dependent_story_id: str
    dependent_story_key: str | None = None
    dependent_story_title: str | None = None
    blocking_story_id: str
    blocking_story_key: str | None = None
    blocking_story_title: str | None = None
    blocking_story_status: str | None = None
    dependency_type: DependencyType
    is_cross_project: bool = False
    is_external: bool = False
    external_description: str | None = None
    external_url: str | None = None
    status: DependencyStatus
    resolved_at: datetime | None = None
    resolved_by_id: str | None = None
    resolved_by_name: str | None = None
    notes: str | None = None
    created_by_id: str | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class StoryDependencyListResponse(BaseModel):
    """Schema for story dependency list item."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    blocking_story_id: str
    blocking_story_key: str | None = None
    blocking_story_title: str | None = None
    blocking_story_status: str | None = None
    dependency_type: DependencyType
    status: DependencyStatus
    is_external: bool = False


# ==================== Task Dependency Schemas ====================

class TaskDependencyCreate(BaseModel):
    """Schema for creating a task dependency."""

    blocking_task_id: str
    dependency_type: DependencyType = "blocks"
    is_external: bool = False
    external_description: str | None = None
    external_url: str | None = Field(default=None, max_length=500)
    notes: str | None = None


class TaskDependencyUpdate(BaseModel):
    """Schema for updating a task dependency."""

    dependency_type: DependencyType | None = None
    notes: str | None = None
    external_description: str | None = None
    external_url: str | None = Field(default=None, max_length=500)


class TaskDependencyResponse(BaseModel):
    """Schema for task dependency response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    dependent_task_id: str
    dependent_task_title: str | None = None
    blocking_task_id: str
    blocking_task_title: str | None = None
    blocking_task_status: str | None = None
    dependency_type: DependencyType
    is_cross_sprint: bool = False
    is_external: bool = False
    external_description: str | None = None
    external_url: str | None = None
    status: DependencyStatus
    resolved_at: datetime | None = None
    notes: str | None = None
    created_by_id: str | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class TaskDependencyListResponse(BaseModel):
    """Schema for task dependency list item."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    blocking_task_id: str
    blocking_task_title: str | None = None
    blocking_task_status: str | None = None
    dependency_type: DependencyType
    status: DependencyStatus
    is_external: bool = False


# ==================== Dependency Resolution ====================

class DependencyResolveRequest(BaseModel):
    """Schema for resolving a dependency."""

    notes: str | None = None


# ==================== Dependency Graph ====================

class DependencyGraphNode(BaseModel):
    """Schema for a node in the dependency graph."""

    id: str
    key: str
    title: str
    type: Literal["story", "task"]
    status: str
    is_blocked: bool = False
    blocking_count: int = 0
    blocked_by_count: int = 0


class DependencyGraphEdge(BaseModel):
    """Schema for an edge in the dependency graph."""

    id: str
    source_id: str
    target_id: str
    dependency_type: DependencyType
    status: DependencyStatus
    is_external: bool = False


class DependencyGraphResponse(BaseModel):
    """Schema for dependency graph visualization."""

    workspace_id: str
    nodes: list[DependencyGraphNode] = Field(default_factory=list)
    edges: list[DependencyGraphEdge] = Field(default_factory=list)
    # Metrics
    total_dependencies: int = 0
    active_dependencies: int = 0
    blocked_items: int = 0
    critical_path: list[str] = Field(default_factory=list)


# ==================== Blocked Items ====================

class BlockedItemResponse(BaseModel):
    """Schema for a blocked item."""

    id: str
    key: str
    title: str
    type: Literal["story", "task"]
    status: str
    blocked_by: list[StoryDependencyListResponse | TaskDependencyListResponse] = Field(default_factory=list)
    blocked_since: datetime | None = None
    days_blocked: int = 0


class BlockedItemsResponse(BaseModel):
    """Schema for list of blocked items."""

    workspace_id: str
    total_blocked: int = 0
    stories_blocked: int = 0
    tasks_blocked: int = 0
    items: list[BlockedItemResponse] = Field(default_factory=list)
