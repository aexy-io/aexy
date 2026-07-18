"""Team Chat Pydantic schemas."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ChannelVisibility(str, Enum):
    PRIVATE = "private"
    WORKSPACE = "workspace"  # any workspace member (formerly "public")
    WEB_PUBLIC = "web_public"  # indexable on the internet


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
    visibility: ChannelVisibility = ChannelVisibility.WORKSPACE

    @field_validator("visibility", mode="before")
    @classmethod
    def _map_legacy_public(cls, v):
        # Older clients (and the pre-community UI) send "public"; it now maps to
        # the workspace-wide tier. web_public is never set at create time.
        if v == "public":
            return "workspace"
        return v


class ChannelUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    is_archived: bool | None = None
    # Community controls (validated further in the service: web_public requires
    # channel owner + workspace admin).
    visibility: ChannelVisibility | None = None
    web_public_since: datetime | None = None

    @field_validator("visibility", mode="before")
    @classmethod
    def _map_legacy_public(cls, v):
        if v == "public":
            return "workspace"
        return v


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
    # Whether a moderator has redacted this from the public forum view (still
    # visible internally). Lets the chat UI show a hide/unhide toggle + state.
    hidden_from_public: bool = False
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


# ── Community management schemas (authed) ────────────────────────────

class CommunitySettingsUpdate(BaseModel):
    enabled: bool | None = None
    community_slug: str | None = Field(None, min_length=1, max_length=100)
    title: str | None = Field(None, max_length=200)
    description: str | None = None
    logo_url: str | None = Field(None, max_length=500)
    theme: dict | None = None
    default_public_display: str | None = None
    noindex: bool | None = None
    listed: bool | None = None
    allow_participation: bool | None = None
    post_moderation: str | None = Field(None, pattern="^(post|pre)$")


class CommunitySettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    workspace_id: str
    enabled: bool
    community_slug: str
    title: str | None = None
    description: str | None = None
    logo_url: str | None = None
    theme: dict = Field(default_factory=dict)
    default_public_display: str
    noindex: bool
    listed: bool = False
    allow_participation: bool = False
    post_moderation: str = "post"


class PublicReplyCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=10_000)


class MemberPublicPrefUpdate(BaseModel):
    public_display: str = Field(..., pattern="^(name|alias|anonymous)$")
    public_alias: str | None = Field(None, max_length=80)


class MemberPublicPrefResponse(BaseModel):
    public_display: str
    public_alias: str | None = None


class TopicVisibilityUpdate(BaseModel):
    visibility: str = Field(..., pattern="^(inherit|private|restricted|web_public)$")
    # For 'restricted': the developer ids allowed to see the topic.
    allowed_developer_ids: list[str] | None = None


class DMCreate(BaseModel):
    developer_id: str


# ── Public (anonymous) community read schemas ────────────────────────

class PublicCommunityChannel(BaseModel):
    slug: str
    name: str
    description: str | None = None
    topic_count: int = 0
    message_count: int = 0
    last_message_at: datetime | None = None


class PublicCommunityResponse(BaseModel):
    community_slug: str
    title: str | None = None
    description: str | None = None
    logo_url: str | None = None
    theme: dict = Field(default_factory=dict)
    noindex: bool = False
    allow_participation: bool = False
    channels: list[PublicCommunityChannel] = Field(default_factory=list)


class PublicDirectoryItem(BaseModel):
    community_slug: str
    title: str | None = None
    description: str | None = None
    logo_url: str | None = None
    channel_count: int = 0
    topic_count: int = 0


class PublicDirectoryResponse(BaseModel):
    communities: list[PublicDirectoryItem] = Field(default_factory=list)


class PublicTopicSummary(BaseModel):
    slug: str | None = None
    short_id: str | None = None
    name: str
    message_count: int = 0
    last_message_at: datetime | None = None
    created_at: datetime | None = None


class PublicChannelResponse(BaseModel):
    slug: str
    name: str
    description: str | None = None
    topics: list[PublicTopicSummary] = Field(default_factory=list)
    total: int = 0


class PublicMessage(BaseModel):
    id: str
    author: str
    content: str
    is_edited: bool = False
    created_at: datetime


class PublicTopicResponse(BaseModel):
    channel_slug: str
    channel_name: str
    topic_slug: str | None = None
    short_id: str | None = None
    name: str
    messages: list[PublicMessage] = Field(default_factory=list)
    total: int = 0
    allow_participation: bool = False


# ── Authenticated member context (internal threads) ──────────────────

class CommunityMemberTopic(BaseModel):
    """A topic a signed-in member can access inside an internal channel."""

    id: str
    slug: str | None = None
    short_id: str | None = None
    name: str
    visibility: str
    # True when this topic is (also) exposed on the public web forum — lets the
    # UI badge it, since a member's internal list can include explicitly
    # web-public topics that live inside an otherwise-internal channel.
    is_web_public: bool = False
    message_count: int = 0
    unread_count: int = 0
    last_message_at: datetime | None = None


class CommunityMemberChannel(BaseModel):
    """An internal (non web-public) channel the member can access."""

    id: str
    slug: str
    name: str
    description: str | None = None
    visibility: str
    is_member: bool = False
    topic_count: int = 0
    unread_count: int = 0
    topics: list[CommunityMemberTopic] = Field(default_factory=list)


class CommunityMemberContextResponse(BaseModel):
    """What a signed-in visitor may see/do on a community beyond the public view.

    Returned for any authenticated caller: non-members get ``is_member=false``
    with an empty channel list (and no ``workspace_id``), so the client can show
    a "start your own community" CTA instead of leaking anything internal.
    """

    is_member: bool = False
    role: str | None = None
    workspace_id: str | None = None
    can_create_thread: bool = False
    # Only workspace admins/owners may publish a thread straight to the web.
    can_post_public: bool = False
    internal_channels: list[CommunityMemberChannel] = Field(default_factory=list)


# ── WebSocket event schemas ──────────────────────────────────────────

class WSMessage(BaseModel):
    """Base WebSocket message."""
    type: str
    data: dict = Field(default_factory=dict)
