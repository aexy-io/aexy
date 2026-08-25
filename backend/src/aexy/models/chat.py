"""Team Chat models — Zulip-inspired channels, topics, and messages."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base

if TYPE_CHECKING:
    from aexy.models.developer import Developer


class ChannelVisibility(str, Enum):
    PRIVATE = "private"
    WORKSPACE = "workspace"  # any workspace member (formerly "public")
    WEB_PUBLIC = "web_public"  # indexable on the internet


class ChannelKind(str, Enum):
    CHANNEL = "channel"
    DM = "dm"


class TopicVisibility(str, Enum):
    INHERIT = "inherit"  # follow the channel
    PRIVATE = "private"  # channel members only, even in a web_public channel
    RESTRICTED = "restricted"  # explicit allow-list (chat_topic_access_grants)
    WEB_PUBLIC = "web_public"


class PublicDisplayMode(str, Enum):
    NAME = "name"
    ALIAS = "alias"
    ANONYMOUS = "anonymous"


class ChannelMemberRole(str, Enum):
    OWNER = "owner"
    MEMBER = "member"


class PresenceStatus(str, Enum):
    ONLINE = "online"
    AWAY = "away"
    OFFLINE = "offline"


class ChatChannel(Base):
    __tablename__ = "chat_channels"
    __table_args__ = (
        UniqueConstraint("workspace_id", "slug", name="uq_chat_channel_workspace_slug"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    visibility: Mapped[str] = mapped_column(String(20), default=ChannelVisibility.WORKSPACE.value)
    # channel | dm. DMs are 2-person private channels, deduped by dm_key, and are
    # structurally excluded from every public query.
    kind: Mapped[str] = mapped_column(String(20), default=ChannelKind.CHANNEL.value)
    # When a channel is flipped web_public, only messages at/after this cutoff are
    # exposed publicly (null once full history is opted in).
    web_public_since: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Sorted ":"-joined member-id pair, set only for DM channels; NULL for regular
    # channels. Backed by a partial unique index (uq_chat_dm_key).
    dm_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"), nullable=True
    )
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    created_by: Mapped["Developer | None"] = relationship("Developer", foreign_keys=[created_by_id])
    members: Mapped[list["ChatChannelMember"]] = relationship(
        "ChatChannelMember", back_populates="channel", cascade="all, delete-orphan"
    )
    topics: Mapped[list["ChatTopic"]] = relationship(
        "ChatTopic", back_populates="channel", cascade="all, delete-orphan"
    )


class ChatChannelMember(Base):
    __tablename__ = "chat_channel_members"
    __table_args__ = (
        UniqueConstraint("channel_id", "developer_id", name="uq_chat_channel_member"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    channel_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("chat_channels.id", ondelete="CASCADE"), index=True
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(20), default=ChannelMemberRole.MEMBER.value)
    is_muted: Mapped[bool] = mapped_column(Boolean, default=False)
    notification_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    channel: Mapped["ChatChannel"] = relationship("ChatChannel", back_populates="members")
    developer: Mapped["Developer"] = relationship("Developer", foreign_keys=[developer_id])


class ChatTopic(Base):
    __tablename__ = "chat_topics"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    channel_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("chat_channels.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    # Per-topic override of the channel's reach; can only narrow, never widen.
    visibility: Mapped[str] = mapped_column(String(20), default=TopicVisibility.INHERIT.value)
    # URL slug + immutable short id so public permalinks survive topic renames.
    slug: Mapped[str | None] = mapped_column(String(255), nullable=True)
    public_short_id: Mapped[str | None] = mapped_column(String(12), nullable=True)
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    last_message_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_message_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), nullable=True
    )
    created_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"), nullable=True
    )
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    # The message that answered the question. Set by the topic's author or a
    # workspace admin; the public view badges it and hoists it under the
    # question, and the thread's JSON-LD becomes a QAPage with an acceptedAnswer.
    #
    # No ForeignKey, for the same reason as ``last_message_id`` above: topics
    # and messages already point at each other, and a real constraint in this
    # direction closes the cycle. SQLAlchemy resolves such a cycle by emitting a
    # post-hoc ALTER TABLE, which SQLite — what the test suite runs on — cannot
    # execute. The id is always validated against the topic before being stored.
    accepted_message_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    channel: Mapped["ChatChannel"] = relationship("ChatChannel", back_populates="topics")
    created_by: Mapped["Developer | None"] = relationship("Developer", foreign_keys=[created_by_id])
    messages: Mapped[list["ChatMessage"]] = relationship(
        "ChatMessage", back_populates="topic", cascade="all, delete-orphan",
        foreign_keys="ChatMessage.topic_id"
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    topic_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("chat_topics.id", ondelete="CASCADE"), index=True
    )
    channel_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("chat_channels.id", ondelete="CASCADE"), index=True
    )
    sender_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="CASCADE"), index=True
    )
    content: Mapped[str] = mapped_column(Text)
    reply_to_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True
    )
    is_edited: Mapped[bool] = mapped_column(Boolean, default=False)
    edited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Moderator redaction from the *public* view only — still visible internally.
    # Distinct from is_deleted (which removes it everywhere).
    hidden_from_public: Mapped[bool] = mapped_column(Boolean, default=False)
    # Community post awaiting admin approval (pre-moderation). Held posts are also
    # hidden_from_public; this flag marks them for the moderation queue.
    pending_review: Mapped[bool] = mapped_column(Boolean, default=False)
    mentions: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    topic: Mapped["ChatTopic"] = relationship(
        "ChatTopic", back_populates="messages", foreign_keys=[topic_id]
    )
    sender: Mapped["Developer"] = relationship("Developer", foreign_keys=[sender_id])
    reply_to: Mapped["ChatMessage | None"] = relationship(
        "ChatMessage", remote_side=[id], foreign_keys=[reply_to_id]
    )


class ChatMessageReaction(Base):
    """One emoji reaction by one person on one message.

    Shared by the internal chat UI and the public forum — a reaction is the
    cheapest way for a reader who has nothing to add to say "this helped", and
    the counts are what let a long thread surface its useful replies. The unique
    constraint makes double-tapping idempotent rather than additive.
    """

    __tablename__ = "chat_message_reactions"
    __table_args__ = (
        UniqueConstraint(
            "message_id", "developer_id", "emoji", name="uq_chat_message_reaction"
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    message_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("chat_messages.id", ondelete="CASCADE"), index=True
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="CASCADE"), index=True
    )
    emoji: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ChatTopicReadState(Base):
    __tablename__ = "chat_topic_read_state"
    __table_args__ = (
        UniqueConstraint("topic_id", "developer_id", name="uq_chat_topic_read_state"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    topic_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("chat_topics.id", ondelete="CASCADE"), index=True
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="CASCADE"), index=True
    )
    last_read_message_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True
    )
    last_read_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ChatUserPresence(Base):
    __tablename__ = "chat_user_presence"
    __table_args__ = (
        UniqueConstraint("workspace_id", "developer_id", name="uq_chat_user_presence"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(20), default=PresenceStatus.OFFLINE.value)
    last_active_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    status_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status_emoji: Mapped[str | None] = mapped_column(String(50), nullable=True)


class ChatTopicAccessGrant(Base):
    """Allow-list entry for a ``restricted`` topic — one row per granted developer."""

    __tablename__ = "chat_topic_access_grants"
    __table_args__ = (
        UniqueConstraint("topic_id", "developer_id", name="uq_chat_topic_access"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    topic_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("chat_topics.id", ondelete="CASCADE"), index=True
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="CASCADE"), index=True
    )
    granted_by_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ChatPublicMemberPref(Base):
    """How a member appears on the public forum (name / alias / anonymous)."""

    __tablename__ = "chat_public_member_prefs"
    __table_args__ = (
        UniqueConstraint("workspace_id", "developer_id", name="uq_chat_public_member_prefs"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid4())
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    developer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("developers.id", ondelete="CASCADE"), index=True
    )
    public_display: Mapped[str] = mapped_column(
        String(20), default=PublicDisplayMode.NAME.value
    )
    public_alias: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class WorkspaceCommunity(Base):
    """Master switch + public branding for a workspace's community forum.

    One row per workspace; an absent row means the community is disabled. Nothing
    in chat is exposed publicly unless ``enabled`` is true here.
    """

    __tablename__ = "workspace_community"

    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        primary_key=True,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # Public URL segment: /community/{community_slug}. Defaults to the workspace
    # slug but is independently unique so it can diverge.
    community_slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    theme: Mapped[dict] = mapped_column(JSONB, default=dict)
    default_public_display: Mapped[str] = mapped_column(
        String(20), default=PublicDisplayMode.NAME.value
    )
    noindex: Mapped[bool] = mapped_column(Boolean, default=False)
    # Opt-in to the global public directory at /community. Separate from
    # `enabled`: a community can be live (addressable by its slug) without
    # advertising itself in the directory.
    listed: Mapped[bool] = mapped_column(Boolean, default=False)
    # Whether outsiders may post at all, and how their posts are handled.
    allow_participation: Mapped[bool] = mapped_column(Boolean, default=False)
    post_moderation: Mapped[str] = mapped_column(String(10), default="post")  # post | pre
    # Whether an outsider may start a *new* thread, not merely reply to one.
    # Deliberately separate from allow_participation: answering in a thread the
    # host opened and opening one yourself are different amounts of trust, and a
    # workspace that wants the first without the second had no way to say so.
    allow_new_topics: Mapped[bool] = mapped_column(Boolean, default=False)

    # ── Connections to other modules (all opt-in, all default off) ────
    # Publishing moves text somebody else wrote — a customer on a ticket, an
    # author in a doc — onto a page anyone can read. That is never a default, so
    # each link is its own switch and every one of them ships off.
    link_service_desk: Mapped[bool] = mapped_column(Boolean, default=False)
    link_docs: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
