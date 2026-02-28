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
    PUBLIC = "public"
    PRIVATE = "private"


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
    visibility: Mapped[str] = mapped_column(String(20), default=ChannelVisibility.PUBLIC.value)
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
