"""Pydantic schemas for Agent Workspaces and Blocks."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# ── Workspace schemas ──────────────────────────────────────────────

class WorkspaceCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = None
    source_module: str | None = None
    source_record_id: str | None = None
    config: dict = Field(default_factory=dict)


class WorkspaceUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str | None = Field(None, min_length=1, max_length=500)
    description: str | None = None
    status: Literal["active", "archived", "completed", "failed", "paused"] | None = None
    config: dict | None = None
    temporal_workflow_id: str | None = None


class WorkspaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    title: str
    description: str | None = None
    status: str
    source_module: str | None = None
    source_record_id: str | None = None
    created_by_id: str | None = None
    temporal_workflow_id: str | None = None
    config: dict
    created_at: datetime
    updated_at: datetime
    blocks: list["BlockResponse"] = []


class WorkspaceListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    title: str
    description: str | None = None
    status: str
    source_module: str | None = None
    created_by_id: str | None = None
    temporal_workflow_id: str | None = None
    created_at: datetime
    updated_at: datetime
    block_count: int = 0
    completed_blocks: int = 0


# ── Block schemas ──────────────────────────────────────────────────

class BlockCreate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    parent_id: str | None = None
    block_type: Literal[
        "markdown", "json", "table", "image", "pdf",
        "text", "code", "handoff", "human_input", "web_page"
    ]
    title: str | None = Field(None, max_length=500)
    status: str = "pending"
    agent_id: str | None = None
    content: dict = Field(default_factory=dict)
    dependencies: list[str] = Field(default_factory=list)
    sort_order: int = 0


class BlockUpdate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str | None = Field(None, max_length=500)
    status: Literal[
        "pending", "running", "completed", "failed", "waiting_human"
    ] | None = None
    content: dict | None = None
    handoff_data: dict | None = None
    token_usage: dict | None = None
    error_message: str | None = None
    file_key: str | None = None
    file_url: str | None = None
    file_mime_type: str | None = None


class BlockResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    parent_id: str | None = None
    block_type: str
    title: str | None = None
    status: str
    agent_id: str | None = None
    execution_id: str | None = None
    content: dict
    file_key: str | None = None
    file_url: str | None = None
    file_mime_type: str | None = None
    dependencies: list[str]
    handoff_data: dict | None = None
    sort_order: int
    token_usage: dict
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class BlockTreeResponse(BaseModel):
    """Block with nested children for tree rendering."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    parent_id: str | None = None
    block_type: str
    title: str | None = None
    status: str
    agent_id: str | None = None
    execution_id: str | None = None
    content: dict
    file_key: str | None = None
    file_url: str | None = None
    file_mime_type: str | None = None
    dependencies: list[str]
    handoff_data: dict | None = None
    sort_order: int
    token_usage: dict
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    children: list["BlockTreeResponse"] = []


# ── Run / Action schemas ───────────────────────────────────────────

class RunTaskRequest(BaseModel):
    """Request to run orchestration on a workspace."""
    task: str = Field(..., min_length=1, max_length=5000, description="Task description for the orchestrator")
    model: str | None = None
    config: dict = Field(default_factory=dict)


class RunTaskResponse(BaseModel):
    temporal_workflow_id: str
    status: str = "started"


class HumanResponseRequest(BaseModel):
    """Human response to a waiting_human block."""
    response: str = Field(..., min_length=1)


class RetryBlockRequest(BaseModel):
    """Retry a failed block."""
    model: str | None = None
