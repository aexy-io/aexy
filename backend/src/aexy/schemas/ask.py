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
    sender_id: str | None = None
    sender_name: str | None = None
    sender_avatar_url: str | None = None
    status: str = "sent"


class AskConversationResponse(BaseModel):
    """Response schema for a conversation (without messages)."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    developer_id: str
    title: str | None = None
    is_collaborative: bool = False
    created_at: datetime
    updated_at: datetime | None = None
    message_count: int = 0
    participant_count: int = 0
    participants: list["AskParticipantResponse"] = []


class AskConversationWithMessages(AskConversationResponse):
    """Conversation with all its messages."""
    messages: list[AskMessageResponse] = []


# --- Collaboration schemas ---


class AskParticipantAdd(BaseModel):
    """Add a participant to a conversation."""
    developer_id: str
    permission: str = "write"  # "read" | "write"


class AskParticipantUpdate(BaseModel):
    """Update a participant's permission."""
    permission: str  # "read" | "write"


class AskParticipantResponse(BaseModel):
    """Response schema for a conversation participant."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    developer_id: str
    permission: str
    added_by_id: str | None = None
    joined_at: datetime
    developer_name: str | None = None
    developer_avatar_url: str | None = None


class AskShareLinkCreate(BaseModel):
    """Create a share link for a conversation."""
    permission: str = "read"  # "read" | "write"
    password: str | None = None
    expires_at: datetime | None = None
    max_uses: int | None = None


class AskShareLinkResponse(BaseModel):
    """Response schema for a share link."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    token: str
    permission: str
    has_password: bool = False
    expires_at: datetime | None = None
    max_uses: int | None = None
    use_count: int = 0
    is_active: bool = True
    created_by_id: str | None = None
    created_at: datetime


class AskShareLinkJoin(BaseModel):
    """Join a conversation via share link."""
    password: str | None = None


class AskQueueStatus(BaseModel):
    """Queue status for a conversation."""
    queue_length: int = 0
    is_ai_responding: bool = False
