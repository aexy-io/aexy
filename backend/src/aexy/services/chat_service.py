"""Team Chat business logic — channels, topics, messages, inbox, read state."""

import logging
import re
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from aexy.models.chat import (
    ChatChannel,
    ChatChannelMember,
    ChatMessage,
    ChatTopic,
    ChatTopicReadState,
    ChatUserPresence,
)
from aexy.models.developer import Developer

logger = logging.getLogger(__name__)

# Regex to extract @mention UUIDs from markdown content
MENTION_RE = re.compile(r"@\[([^\]]+)\]\(mention:user:([0-9a-f-]+)\)")


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"[\s-]+", "-", slug).strip("-")
    return slug or "channel"


def _extract_mentions(content: str) -> list[str]:
    """Extract developer IDs from @mention syntax in message content."""
    return [match.group(2) for match in MENTION_RE.finditer(content)]


class ChatService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Channels ──────────────────────────────────────────────────

    async def list_channels(self, workspace_id: str, developer_id: str) -> list[dict]:
        """List channels: user's joined channels + public non-archived channels."""
        # Get all public non-archived channels in workspace
        q = (
            select(ChatChannel)
            .where(
                ChatChannel.workspace_id == workspace_id,
                ChatChannel.is_archived.is_(False),
            )
            .order_by(ChatChannel.name)
        )
        result = await self.db.execute(q)
        channels = result.scalars().all()

        # Get user's memberships
        member_q = select(ChatChannelMember.channel_id).where(
            ChatChannelMember.developer_id == developer_id
        )
        member_result = await self.db.execute(member_q)
        member_channel_ids = {row[0] for row in member_result.all()}

        # Get member counts
        count_q = (
            select(
                ChatChannelMember.channel_id,
                func.count(ChatChannelMember.id).label("cnt"),
            )
            .group_by(ChatChannelMember.channel_id)
        )
        count_result = await self.db.execute(count_q)
        member_counts = {row[0]: row[1] for row in count_result.all()}

        out = []
        for ch in channels:
            # Show public channels + private channels user is a member of
            if ch.visibility == "private" and ch.id not in member_channel_ids:
                continue
            d = {
                "id": ch.id,
                "workspace_id": ch.workspace_id,
                "name": ch.name,
                "slug": ch.slug,
                "description": ch.description,
                "visibility": ch.visibility,
                "created_by_id": ch.created_by_id,
                "is_archived": ch.is_archived,
                "created_at": ch.created_at,
                "updated_at": ch.updated_at,
                "member_count": member_counts.get(ch.id, 0),
                "is_member": ch.id in member_channel_ids,
            }
            out.append(d)
        return out

    async def create_channel(
        self, workspace_id: str, developer_id: str, name: str,
        description: str | None = None, visibility: str = "public",
    ) -> ChatChannel:
        slug = _slugify(name)
        # Ensure unique slug in workspace
        existing = await self.db.execute(
            select(ChatChannel).where(
                ChatChannel.workspace_id == workspace_id,
                ChatChannel.slug == slug,
            )
        )
        if existing.scalar_one_or_none():
            slug = f"{slug}-{str(uuid4())[:8]}"

        channel = ChatChannel(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            slug=slug,
            description=description,
            visibility=visibility,
            created_by_id=developer_id,
        )
        self.db.add(channel)
        await self.db.flush()

        # Auto-add creator as owner
        member = ChatChannelMember(
            id=str(uuid4()),
            channel_id=channel.id,
            developer_id=developer_id,
            role="owner",
        )
        self.db.add(member)
        await self.db.commit()
        await self.db.refresh(channel)
        return channel

    async def get_channel(self, channel_id: str) -> ChatChannel | None:
        result = await self.db.execute(
            select(ChatChannel).where(ChatChannel.id == channel_id)
        )
        return result.scalar_one_or_none()

    async def get_channel_by_slug(self, workspace_id: str, slug: str) -> ChatChannel | None:
        result = await self.db.execute(
            select(ChatChannel).where(
                ChatChannel.workspace_id == workspace_id,
                ChatChannel.slug == slug,
            )
        )
        return result.scalar_one_or_none()

    async def update_channel(self, channel_id: str, **kwargs) -> ChatChannel | None:
        channel = await self.get_channel(channel_id)
        if not channel:
            return None
        for k, v in kwargs.items():
            if v is not None and hasattr(channel, k):
                setattr(channel, k, v)
        await self.db.commit()
        await self.db.refresh(channel)
        return channel

    async def join_channel(self, channel_id: str, developer_id: str) -> ChatChannelMember:
        # Check if already a member
        existing = await self.db.execute(
            select(ChatChannelMember).where(
                ChatChannelMember.channel_id == channel_id,
                ChatChannelMember.developer_id == developer_id,
            )
        )
        member = existing.scalar_one_or_none()
        if member:
            return member

        member = ChatChannelMember(
            id=str(uuid4()),
            channel_id=channel_id,
            developer_id=developer_id,
            role="member",
        )
        self.db.add(member)
        await self.db.commit()
        await self.db.refresh(member)
        return member

    async def leave_channel(self, channel_id: str, developer_id: str) -> bool:
        result = await self.db.execute(
            select(ChatChannelMember).where(
                ChatChannelMember.channel_id == channel_id,
                ChatChannelMember.developer_id == developer_id,
            )
        )
        member = result.scalar_one_or_none()
        if not member:
            return False
        await self.db.delete(member)
        await self.db.commit()
        return True

    async def list_members(self, channel_id: str) -> list[dict]:
        q = (
            select(ChatChannelMember, Developer)
            .join(Developer, ChatChannelMember.developer_id == Developer.id)
            .where(ChatChannelMember.channel_id == channel_id)
            .order_by(ChatChannelMember.joined_at)
        )
        result = await self.db.execute(q)
        rows = result.all()
        return [
            {
                "id": m.id,
                "channel_id": m.channel_id,
                "developer_id": m.developer_id,
                "role": m.role,
                "is_muted": m.is_muted,
                "notification_level": m.notification_level,
                "joined_at": m.joined_at,
                "developer_name": d.name,
                "developer_avatar": d.avatar_url if hasattr(d, "avatar_url") else None,
            }
            for m, d in rows
        ]

    async def is_channel_member(self, channel_id: str, developer_id: str) -> bool:
        result = await self.db.execute(
            select(ChatChannelMember.id).where(
                ChatChannelMember.channel_id == channel_id,
                ChatChannelMember.developer_id == developer_id,
            )
        )
        return result.scalar_one_or_none() is not None

    async def get_member_channel_ids(self, developer_id: str) -> list[str]:
        """Return list of channel IDs the developer is a member of."""
        result = await self.db.execute(
            select(ChatChannelMember.channel_id).where(
                ChatChannelMember.developer_id == developer_id
            )
        )
        return [row[0] for row in result.all()]

    # ── Topics ────────────────────────────────────────────────────

    async def list_topics(self, channel_id: str, developer_id: str | None = None) -> list[dict]:
        q = (
            select(ChatTopic)
            .where(ChatTopic.channel_id == channel_id)
            .order_by(ChatTopic.last_message_at.desc().nullslast())
        )
        result = await self.db.execute(q)
        topics = result.scalars().all()

        # Get unread counts if developer_id provided
        unread_map: dict[str, int] = {}
        if developer_id:
            for topic in topics:
                unread_map[topic.id] = await self._get_unread_count(topic.id, developer_id)

        # Get creator names
        creator_ids = {t.created_by_id for t in topics if t.created_by_id}
        creator_names: dict[str, str] = {}
        if creator_ids:
            dev_result = await self.db.execute(
                select(Developer.id, Developer.name).where(Developer.id.in_(creator_ids))
            )
            creator_names = {row[0]: row[1] for row in dev_result.all()}

        return [
            {
                "id": t.id,
                "channel_id": t.channel_id,
                "name": t.name,
                "message_count": t.message_count,
                "last_message_at": t.last_message_at,
                "created_by_id": t.created_by_id,
                "is_resolved": t.is_resolved,
                "created_at": t.created_at,
                "updated_at": t.updated_at,
                "unread_count": unread_map.get(t.id, 0),
                "creator_name": creator_names.get(t.created_by_id) if t.created_by_id else None,
            }
            for t in topics
        ]

    async def create_topic_with_message(
        self, channel_id: str, developer_id: str, name: str, first_message: str,
    ) -> tuple[ChatTopic, ChatMessage]:
        """Create a topic and its first message atomically."""
        now = datetime.now(timezone.utc)
        topic_id = str(uuid4())
        message_id = str(uuid4())

        # Get channel for denormalized channel_id on message
        channel = await self.get_channel(channel_id)
        if not channel:
            raise ValueError("Channel not found")

        # Auto-join public channel if not member
        if channel.visibility == "public":
            await self.join_channel(channel_id, developer_id)

        mentions = _extract_mentions(first_message)

        topic = ChatTopic(
            id=topic_id,
            channel_id=channel_id,
            name=name,
            message_count=1,
            last_message_at=now,
            last_message_id=message_id,
            created_by_id=developer_id,
        )
        self.db.add(topic)
        await self.db.flush()

        message = ChatMessage(
            id=message_id,
            topic_id=topic_id,
            channel_id=channel_id,
            sender_id=developer_id,
            content=first_message,
            mentions=mentions,
        )
        self.db.add(message)
        await self.db.commit()
        await self.db.refresh(topic)
        await self.db.refresh(message)
        return topic, message

    async def get_topic(self, topic_id: str) -> ChatTopic | None:
        result = await self.db.execute(
            select(ChatTopic).where(ChatTopic.id == topic_id)
        )
        return result.scalar_one_or_none()

    # ── Messages ──────────────────────────────────────────────────

    async def list_messages(
        self, topic_id: str, before: str | None = None, limit: int = 50,
    ) -> tuple[list[dict], bool]:
        """Return messages for a topic (oldest first) with sender info."""
        q = (
            select(ChatMessage, Developer)
            .join(Developer, ChatMessage.sender_id == Developer.id)
            .where(
                ChatMessage.topic_id == topic_id,
                ChatMessage.is_deleted.is_(False),
            )
        )
        if before:
            # Cursor-based: get messages before a given message's created_at
            before_msg = await self.db.execute(
                select(ChatMessage.created_at).where(ChatMessage.id == before)
            )
            before_ts = before_msg.scalar_one_or_none()
            if before_ts:
                q = q.where(ChatMessage.created_at < before_ts)

        q = q.order_by(ChatMessage.created_at.desc()).limit(limit + 1)
        result = await self.db.execute(q)
        rows = result.all()

        has_more = len(rows) > limit
        rows = rows[:limit]
        rows.reverse()  # Return in ascending order

        return [
            {
                "id": m.id,
                "topic_id": m.topic_id,
                "channel_id": m.channel_id,
                "sender_id": m.sender_id,
                "content": m.content,
                "reply_to_id": m.reply_to_id,
                "is_edited": m.is_edited,
                "edited_at": m.edited_at,
                "is_deleted": m.is_deleted,
                "mentions": m.mentions or [],
                "created_at": m.created_at,
                "sender": {
                    "id": d.id,
                    "name": d.name,
                    "avatar_url": getattr(d, "avatar_url", None),
                },
            }
            for m, d in rows
        ], has_more

    async def create_message(
        self, topic_id: str, channel_id: str, sender_id: str, content: str,
        reply_to_id: str | None = None,
    ) -> dict:
        """Create a message and update topic counters."""
        now = datetime.now(timezone.utc)
        mentions = _extract_mentions(content)
        message_id = str(uuid4())

        message = ChatMessage(
            id=message_id,
            topic_id=topic_id,
            channel_id=channel_id,
            sender_id=sender_id,
            content=content,
            reply_to_id=reply_to_id,
            mentions=mentions,
        )
        self.db.add(message)

        # Update topic counters
        topic = await self.get_topic(topic_id)
        if topic:
            topic.message_count = (topic.message_count or 0) + 1
            topic.last_message_at = now
            topic.last_message_id = message_id

        await self.db.commit()
        await self.db.refresh(message)

        # Fetch sender info
        sender_result = await self.db.execute(
            select(Developer).where(Developer.id == sender_id)
        )
        sender = sender_result.scalar_one_or_none()

        return {
            "id": message.id,
            "topic_id": message.topic_id,
            "channel_id": message.channel_id,
            "sender_id": message.sender_id,
            "content": message.content,
            "reply_to_id": message.reply_to_id,
            "is_edited": message.is_edited,
            "edited_at": message.edited_at,
            "is_deleted": message.is_deleted,
            "mentions": message.mentions or [],
            "created_at": message.created_at,
            "sender": {
                "id": sender.id,
                "name": sender.name,
                "avatar_url": getattr(sender, "avatar_url", None),
            } if sender else None,
        }

    async def update_message(self, message_id: str, sender_id: str, content: str) -> dict | None:
        result = await self.db.execute(
            select(ChatMessage).where(ChatMessage.id == message_id)
        )
        message = result.scalar_one_or_none()
        if not message or message.sender_id != sender_id:
            return None

        message.content = content
        message.is_edited = True
        message.edited_at = datetime.now(timezone.utc)
        message.mentions = _extract_mentions(content)
        await self.db.commit()
        await self.db.refresh(message)

        sender_result = await self.db.execute(
            select(Developer).where(Developer.id == sender_id)
        )
        sender = sender_result.scalar_one_or_none()

        return {
            "id": message.id,
            "topic_id": message.topic_id,
            "channel_id": message.channel_id,
            "sender_id": message.sender_id,
            "content": message.content,
            "reply_to_id": message.reply_to_id,
            "is_edited": message.is_edited,
            "edited_at": message.edited_at,
            "is_deleted": message.is_deleted,
            "mentions": message.mentions or [],
            "created_at": message.created_at,
            "sender": {
                "id": sender.id,
                "name": sender.name,
                "avatar_url": getattr(sender, "avatar_url", None),
            } if sender else None,
        }

    async def delete_message(self, message_id: str, sender_id: str) -> bool:
        result = await self.db.execute(
            select(ChatMessage).where(ChatMessage.id == message_id)
        )
        message = result.scalar_one_or_none()
        if not message or message.sender_id != sender_id:
            return False

        message.is_deleted = True
        message.deleted_at = datetime.now(timezone.utc)
        message.content = ""
        await self.db.commit()
        return True

    # ── Inbox ─────────────────────────────────────────────────────

    async def get_inbox(self, workspace_id: str, developer_id: str) -> list[dict]:
        """Get all topics with unread messages across user's channels."""
        channel_ids = await self.get_member_channel_ids(developer_id)
        if not channel_ids:
            return []

        # Get topics from member channels, ordered by last_message_at
        q = (
            select(ChatTopic, ChatChannel)
            .join(ChatChannel, ChatTopic.channel_id == ChatChannel.id)
            .where(
                ChatTopic.channel_id.in_(channel_ids),
                ChatTopic.last_message_at.isnot(None),
            )
            .order_by(ChatTopic.last_message_at.desc())
            .limit(100)
        )
        result = await self.db.execute(q)
        rows = result.all()

        inbox = []
        for topic, channel in rows:
            unread = await self._get_unread_count(topic.id, developer_id)
            if unread == 0:
                continue

            # Get last message preview
            last_msg_q = (
                select(ChatMessage, Developer)
                .join(Developer, ChatMessage.sender_id == Developer.id)
                .where(
                    ChatMessage.topic_id == topic.id,
                    ChatMessage.is_deleted.is_(False),
                )
                .order_by(ChatMessage.created_at.desc())
                .limit(1)
            )
            last_msg_result = await self.db.execute(last_msg_q)
            last_row = last_msg_result.first()

            inbox.append({
                "id": topic.id,
                "channel_id": channel.id,
                "channel_name": channel.name,
                "channel_slug": channel.slug,
                "name": topic.name,
                "message_count": topic.message_count,
                "last_message_at": topic.last_message_at,
                "unread_count": unread,
                "last_message_preview": last_row[0].content[:100] if last_row else None,
                "last_sender_name": last_row[1].name if last_row else None,
            })

        return inbox

    # ── Read state ────────────────────────────────────────────────

    async def mark_topic_read(self, topic_id: str, developer_id: str, message_id: str) -> None:
        result = await self.db.execute(
            select(ChatTopicReadState).where(
                ChatTopicReadState.topic_id == topic_id,
                ChatTopicReadState.developer_id == developer_id,
            )
        )
        state = result.scalar_one_or_none()
        now = datetime.now(timezone.utc)

        if state:
            state.last_read_message_id = message_id
            state.last_read_at = now
        else:
            state = ChatTopicReadState(
                id=str(uuid4()),
                topic_id=topic_id,
                developer_id=developer_id,
                last_read_message_id=message_id,
                last_read_at=now,
            )
            self.db.add(state)
        await self.db.commit()

    async def _get_unread_count(self, topic_id: str, developer_id: str) -> int:
        """Count messages in topic after user's last-read message."""
        read_q = await self.db.execute(
            select(ChatTopicReadState.last_read_message_id).where(
                ChatTopicReadState.topic_id == topic_id,
                ChatTopicReadState.developer_id == developer_id,
            )
        )
        last_read_id = read_q.scalar_one_or_none()

        q = select(func.count(ChatMessage.id)).where(
            ChatMessage.topic_id == topic_id,
            ChatMessage.is_deleted.is_(False),
        )
        if last_read_id:
            # Get the created_at of the last read message
            ts_q = await self.db.execute(
                select(ChatMessage.created_at).where(ChatMessage.id == last_read_id)
            )
            last_read_ts = ts_q.scalar_one_or_none()
            if last_read_ts:
                q = q.where(ChatMessage.created_at > last_read_ts)
            else:
                # Message was deleted, count all
                pass

        result = await self.db.execute(q)
        return result.scalar() or 0

    # ── Presence ──────────────────────────────────────────────────

    async def update_presence(
        self, workspace_id: str, developer_id: str, status: str,
    ) -> None:
        result = await self.db.execute(
            select(ChatUserPresence).where(
                ChatUserPresence.workspace_id == workspace_id,
                ChatUserPresence.developer_id == developer_id,
            )
        )
        presence = result.scalar_one_or_none()
        now = datetime.now(timezone.utc)

        if presence:
            presence.status = status
            presence.last_active_at = now
        else:
            presence = ChatUserPresence(
                id=str(uuid4()),
                workspace_id=workspace_id,
                developer_id=developer_id,
                status=status,
                last_active_at=now,
            )
            self.db.add(presence)
        await self.db.commit()

    # ── Onboarding ─────────────────────────────────────────────────

    async def setup_default_channel(
        self, workspace_id: str, developer_id: str,
    ) -> tuple[ChatChannel, ChatTopic, ChatMessage]:
        """Create 'General' channel with a 'General' welcome topic. Idempotent."""
        # Check if a channel already exists
        existing = await self.db.execute(
            select(ChatChannel).where(
                ChatChannel.workspace_id == workspace_id,
                ChatChannel.slug == "general",
            )
        )
        channel = existing.scalar_one_or_none()
        if channel:
            # Channel already exists — return it with first topic
            topics_q = await self.db.execute(
                select(ChatTopic)
                .where(ChatTopic.channel_id == channel.id)
                .order_by(ChatTopic.created_at)
                .limit(1)
            )
            topic = topics_q.scalar_one_or_none()
            if topic:
                msg_q = await self.db.execute(
                    select(ChatMessage)
                    .where(ChatMessage.topic_id == topic.id)
                    .order_by(ChatMessage.created_at)
                    .limit(1)
                )
                msg = msg_q.scalar_one_or_none()
                if msg:
                    return channel, topic, msg

        if not channel:
            channel = await self.create_channel(
                workspace_id=workspace_id,
                developer_id=developer_id,
                name="General",
                description="General discussion for the team",
                visibility="public",
            )

        topic, message = await self.create_topic_with_message(
            channel_id=channel.id,
            developer_id=developer_id,
            name="General",
            first_message="Welcome to the team chat! This is the General channel where everyone can connect.",
        )
        return channel, topic, message

    async def get_online_users(self, workspace_id: str) -> list[dict]:
        q = (
            select(ChatUserPresence, Developer)
            .join(Developer, ChatUserPresence.developer_id == Developer.id)
            .where(
                ChatUserPresence.workspace_id == workspace_id,
                ChatUserPresence.status != "offline",
            )
        )
        result = await self.db.execute(q)
        return [
            {
                "developer_id": p.developer_id,
                "status": p.status,
                "last_active_at": p.last_active_at,
                "status_text": p.status_text,
                "status_emoji": p.status_emoji,
                "developer_name": d.name,
            }
            for p, d in result.all()
        ]
