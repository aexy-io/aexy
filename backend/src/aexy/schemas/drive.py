"""Pydantic schemas for the Drive API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ─── Drive files ───────────────────────────────────────────────────────────
class DriveFileResponse(BaseModel):
    """Bare drive row. AI fields (summary/tags/categories) are served by
    `GET /workspaces/{ws}/files/{source_type}/{source_id}/metadata`."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    parent_id: str | None
    space_id: str | None
    file_name: str
    file_url: str | None
    file_size_bytes: int
    content_type: str | None
    kind: str
    uploaded_by_id: str | None
    uploaded_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class DriveFileListResponse(BaseModel):
    files: list[DriveFileResponse]
    total: int


class FolderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    parent_id: str | None = None


class FileUpdate(BaseModel):
    """PATCH payload for renaming or moving a file/folder."""

    file_name: str | None = Field(default=None, min_length=1, max_length=500)
    parent_id: str | None = Field(default=None, description="Pass null to move to root")


# ─── Smart Views ───────────────────────────────────────────────────────────
class SmartViewFilter(BaseModel):
    """Filter document used to resolve a smart view to a file list."""

    all_tags: list[str] | None = None
    any_tags: list[str] | None = None
    any_categories: list[str] | None = None
    kind: str | None = None


class SmartViewCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    icon: str | None = None
    color: str | None = None
    filter_query: SmartViewFilter
    is_shared: bool = False


class SmartViewUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    icon: str | None = None
    color: str | None = None
    filter_query: SmartViewFilter | None = None
    is_shared: bool | None = None


class SmartViewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    icon: str | None
    color: str | None
    filter_query: dict
    is_shared: bool
    created_by_id: str | None
    created_at: datetime
    updated_at: datetime


class SmartViewListResponse(BaseModel):
    smart_views: list[SmartViewResponse]


# ─── Video Annotations ─────────────────────────────────────────────────────
class VideoAnnotationCreate(BaseModel):
    t_start_ms: int = Field(..., ge=0)
    t_end_ms: int = Field(..., ge=0)
    label: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    bbox: dict | None = None


class VideoAnnotationUpdate(BaseModel):
    t_start_ms: int | None = Field(default=None, ge=0)
    t_end_ms: int | None = Field(default=None, ge=0)
    label: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    tags: list[str] | None = None
    bbox: dict | None = None


class VideoAnnotationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    file_id: str
    t_start_ms: int
    t_end_ms: int
    label: str
    description: str | None
    tags: list[str]
    confidence: float | None
    source: str
    bbox: dict | None
    created_by_id: str | None
    created_at: datetime


class VideoAnnotationListResponse(BaseModel):
    annotations: list[VideoAnnotationResponse]


# ─── Usage ─────────────────────────────────────────────────────────────────
class DriveUsageResponse(BaseModel):
    used_bytes: int
    limit_bytes: int
    unlimited: bool
    percent_used: float
    files_count: int
