"""Compliance document Pydantic schemas."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


# Enums

class DocumentStatusEnum(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"
    DELETED = "deleted"


class EntityTypeEnum(str, Enum):
    REMINDER = "reminder"
    REMINDER_INSTANCE = "reminder_instance"
    CERTIFICATION = "certification"
    TRAINING = "training"
    CONTROL = "control"


class LinkTypeEnum(str, Enum):
    EVIDENCE = "evidence"
    REFERENCE = "reference"
    ATTACHMENT = "attachment"


# --- Folder Schemas ---

class FolderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    parent_id: str | None = None


class FolderUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    sort_order: int | None = None


class FolderMove(BaseModel):
    parent_id: str | None = None


class FolderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    parent_id: str | None = None
    name: str
    description: str | None = None
    path: str
    depth: int
    sort_order: int
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime


class FolderTreeNode(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str | None = None
    parent_id: str | None = None
    depth: int
    sort_order: int
    children: list["FolderTreeNode"] = []
    document_count: int = 0


# --- Document Schemas ---

class DocumentCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    folder_id: str | None = None
    file_key: str = Field(..., min_length=1)
    file_size: int = Field(..., ge=0)
    mime_type: str = Field(..., min_length=1)
    tags: list[str] = []


class DocumentUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    folder_id: str | None = None


class DocumentMoveRequest(BaseModel):
    folder_id: str | None = None


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    folder_id: str | None = None
    name: str
    description: str | None = None
    file_key: str
    file_size: int
    mime_type: str
    status: str
    version: int
    uploaded_by: str | None = None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None
    tags: list[str] = []
    download_url: str | None = None


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int
    page: int
    page_size: int


# --- Upload Schemas ---

class UploadUrlRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=500)
    content_type: str = Field(..., min_length=1)
    file_size: int = Field(..., gt=0)


class UploadUrlResponse(BaseModel):
    presigned_url: str
    file_key: str
    expires_in: int = 3600


# --- Tag Schemas ---

class TagAddRequest(BaseModel):
    tags: list[str] = Field(..., min_items=1, max_items=20)


class TagRemoveRequest(BaseModel):
    tag: str


class TagListResponse(BaseModel):
    tags: list[str]


# --- Link Schemas ---

class LinkCreateRequest(BaseModel):
    entity_type: EntityTypeEnum
    entity_id: str
    link_type: LinkTypeEnum = LinkTypeEnum.EVIDENCE
    notes: str | None = None


class LinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    entity_type: str
    entity_id: str
    link_type: str
    notes: str | None = None
    linked_by: str | None = None
    created_at: datetime


class EntityDocumentsResponse(BaseModel):
    documents: list[DocumentResponse]
    links: list[LinkResponse]


# --- Filter Schemas ---

class DocumentFilters(BaseModel):
    folder_id: str | None = None
    status: DocumentStatusEnum | None = None
    mime_type: str | None = None
    tags: list[str] | None = None
    search: str | None = None
    uploaded_by: str | None = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    sort_by: str = "created_at"
    sort_order: str = "desc"
