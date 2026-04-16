"""Team Chat Pydantic schemas."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class ChannelVisibility(str, Enum):
    PUBLIC = "public"
    PRIVATE = "private"


class ChannelMemberRole(str, Enum):
    OWNER = "owner"
    MEMBER = "member"


class PresenceStatus(str, Enum):
    ONLINE = "online"
    AWAY = "away"
    OFFLINE = "offline"


# ── Channel schemas ──────────────────────────────────────────────────

class ChannelCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    visibility: ChannelVisibility = ChannelVisibility.PUBLIC


class ChannelUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    is_archived: bool | None = None


class ChannelResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    name: str
    slug: str
    description: str | None = None
    visibility: str
    created_by_id: str | None = None
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    member_count: int | None = None
    is_member: bool | None = None


class ChannelListResponse(BaseModel):
    channels: list[ChannelResponse]


class ChannelMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    channel_id: str
    developer_id: str
    role: str
    is_muted: bool
    notification_level: str | None = None
    joined_at: datetime
    developer_name: str | None = None
    developer_avatar: str | None = None


# ── Topic schemas ────────────────────────────────────────────────────

class TopicCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    first_message: str = Field(..., min_length=1, max_length=10000)


class TopicResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    channel_id: str
    name: str
    message_count: int
    last_message_at: datetime | None = None
    created_by_id: str | None = None
    is_resolved: bool
    created_at: datetime
    updated_at: datetime
    unread_count: int | None = None
    creator_name: str | None = None


class TopicListResponse(BaseModel):
    topics: list[TopicResponse]


# ── Message schemas ──────────────────────────────────────────────────

class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)
    reply_to_id: str | None = None


class MessageUpdate(BaseModel):
    content: str = Field(..., min_length=1, max_length=10000)


class SenderInfo(BaseModel):
    id: str
    name: str | None = None
    avatar_url: str | None = None
    is_agent: bool = False


class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    topic_id: str
    channel_id: str
    sender_id: str
    content: str
    reply_to_id: str | None = None
    is_edited: bool
    edited_at: datetime | None = None
    is_deleted: bool
    mentions: list = Field(default_factory=list)
    created_at: datetime
    sender: SenderInfo | None = None


class MessageListResponse(BaseModel):
    messages: list[MessageResponse]
    has_more: bool = False


# ── Inbox schemas ────────────────────────────────────────────────────

class InboxTopicResponse(BaseModel):
    id: str
    channel_id: str
    channel_name: str
    channel_slug: str
    name: str
    message_count: int
    last_message_at: datetime | None = None
    unread_count: int
    last_message_preview: str | None = None
    last_sender_name: str | None = None


class InboxResponse(BaseModel):
    topics: list[InboxTopicResponse]


# ── Read state schemas ───────────────────────────────────────────────

class MarkReadRequest(BaseModel):
    message_id: str


# ── Presence schemas ─────────────────────────────────────────────────

class PresenceResponse(BaseModel):
    developer_id: str
    status: str
    last_active_at: datetime
    status_text: str | None = None
    status_emoji: str | None = None
    developer_name: str | None = None


class PresenceListResponse(BaseModel):
    users: list[PresenceResponse]


# ── Meet link schemas ────────────────────────────────────────────────

class MeetLinkResponse(BaseModel):
    meet_link: str


# ── WebSocket event schemas ──────────────────────────────────────────

class WSMessage(BaseModel):
    """Base WebSocket message."""
    type: str
    data: dict = Field(default_factory=dict)
