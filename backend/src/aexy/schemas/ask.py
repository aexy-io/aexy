"""Pydantic schemas for Ask AI feature."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AskConversationCreate(BaseModel):
    """Create a new conversation (optionally with a first message)."""
    title: str | None = None


class AskMessageCreate(BaseModel):
    """Send a message in a conversation."""
    content: str = Field(..., min_length=1, max_length=10000)


class ToolCallInfo(BaseModel):
    """A single tool call within an assistant message."""
    id: str
    tool_name: str
    tool_input: dict = {}
    tool_result: dict | list | str | None = None
    status: str = "pending"  # "pending" | "success" | "error"


class AskMessageResponse(BaseModel):
    """Response schema for a single message."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    role: str
    content: str | None = None
    tool_calls: list[ToolCallInfo] = []
    token_usage: dict | None = None
    message_index: int
    created_at: datetime


class AskConversationResponse(BaseModel):
    """Response schema for a conversation (without messages)."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    developer_id: str
    title: str | None = None
    created_at: datetime
    updated_at: datetime | None = None
    message_count: int = 0


class AskConversationWithMessages(AskConversationResponse):
    """Conversation with all its messages."""
    messages: list[AskMessageResponse] = []
