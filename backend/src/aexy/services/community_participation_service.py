"""Outside participation in a public community forum.

Lets an authenticated Aexy user (any Developer — including people who signed in
via OAuth solely to join the forum, and who are not staff of the host
workspace) post replies to web-public topics. Guards:

  - the community must have ``allow_participation`` on;
  - the target topic must actually be web-public (checked via the same
    predicates the read API uses);
  - a per-developer, per-community rate limit;
  - moderation: ``post`` (visible immediately) or ``pre`` (held for approval).

Posters who aren't already members of the host workspace are auto-joined with
the lowest ``community`` role and marked non-billable, so they get a stable
identity + public-display prefs without ever gaining internal access.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import redis.asyncio as redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.models.chat import (
    ChatChannel,
    ChatChannelMember,
    ChatMessage,
    ChatMessageReaction,
    ChatTopic,
    TopicVisibility,
    WorkspaceCommunity,
)
from aexy.models.notification import NotificationEventType
from aexy.models.workspace import WorkspaceMember
from aexy.services.chat_visibility import channel_is_web_public, topic_is_web_public
from aexy.services.public_community_service import PUBLIC_REACTIONS

logger = logging.getLogger(__name__)

# Rate limit: max posts per developer per community within the window.
_RATE_LIMIT_MAX = 10
_RATE_LIMIT_WINDOW_SECONDS = 60

# Starting a thread is rarer and costlier than replying to one, so it gets its
# own, tighter budget in the same window.
_TOPIC_RATE_LIMIT_MAX = 3

# Searches per IP per window. Deliberately loose: an office behind one NAT is
# many readers sharing an address, and there is no identity to key on.
_SEARCH_RATE_LIMIT_MAX = 30

_ADMIN_ROLES = ("owner", "admin")


class ParticipationError(Exception):
    """Base for participation failures with a machine-readable code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class CommunityParticipationService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._redis: redis.Redis | None = None

    async def _rate_ok(
        self,
        workspace_id: str,
        developer_id: str,
        *,
        scope: str = "post",
        limit: int = _RATE_LIMIT_MAX,
    ) -> bool:
        """Sliding-ish fixed-window limiter backed by Redis INCR+EXPIRE.

        Fails open (returns True) if Redis is unreachable — a public forum
        posting shouldn't hard-fail because the cache is down; abuse is still
        bounded by moderation.
        """
        try:
            if self._redis is None:
                self._redis = redis.from_url(
                    get_settings().redis_url, decode_responses=True
                )
            key = f"community:{scope}:{workspace_id}:{developer_id}"
            count = await self._redis.incr(key)
            if count == 1:
                await self._redis.expire(key, _RATE_LIMIT_WINDOW_SECONDS)
            return bool(count <= limit)
        except Exception:
            logger.warning("Community rate-limit check failed open", exc_info=True)
            return True

    async def search_rate_ok(self, community_slug: str, client_ip: str) -> bool:
        """Budget for the one public endpoint that does real work per request.

        Search is the only new anonymous surface here that runs a query rather
        than serving a cached page, so it is the only one worth a limiter. Keyed
        on the caller's IP because there is no caller identity to key on — which
        is also why the budget is generous rather than tight: an office behind
        one NAT is many people sharing an address, and the failure mode of a
        limit that is too low is a forum that looks broken.

        Fails open, like the posting limiter — a reader should not be told the
        search is down because Redis is.
        """
        return await self._rate_ok(
            community_slug, client_ip, scope="search", limit=_SEARCH_RATE_LIMIT_MAX
        )

    async def ensure_community_member(self, workspace_id: str, developer_id: str) -> None:
        """Idempotently ensure the poster has a membership row. Existing members
        of any rank keep their role; brand-new posters join as non-billable
        'community'."""
        existing = (
            await self.db.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.developer_id == developer_id,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            if existing.status == "removed":
                existing.status = "active"
                existing.role = "community"
                existing.is_billable = False
                await self.db.flush()
            return

        self.db.add(
            WorkspaceMember(
                id=str(uuid4()),
                workspace_id=workspace_id,
                developer_id=developer_id,
                role="community",
                status="active",
                is_billable=False,
                joined_at=datetime.now(timezone.utc),
            )
        )
        await self.db.flush()

    async def post_reply(
        self,
        community: WorkspaceCommunity,
        channel: ChatChannel,
        topic: ChatTopic,
        developer_id: str,
        content: str,
    ) -> dict[str, Any]:
        """Post a community reply to a web-public topic. Returns the created
        message plus its moderation state."""
        content = (content or "").strip()
        if not content:
            raise ParticipationError("empty", "Message cannot be empty")
        if len(content) > 10_000:
            raise ParticipationError("too_long", "Message is too long")

        if not community.allow_participation:
            raise ParticipationError("disabled", "Participation is not enabled")

        # Re-check the topic is genuinely public (never trust the caller's path).
        if not topic_is_web_public(channel, topic, community_enabled=community.enabled):
            raise ParticipationError("not_public", "This topic is not open for replies")

        if not await self._rate_ok(channel.workspace_id, developer_id):
            raise ParticipationError("rate_limited", "Too many posts — slow down")

        await self.ensure_community_member(channel.workspace_id, developer_id)

        held = community.post_moderation == "pre"
        now = datetime.now(timezone.utc)
        message = ChatMessage(
            id=str(uuid4()),
            topic_id=topic.id,
            channel_id=channel.id,
            sender_id=developer_id,
            content=content,
            # Held posts are hidden from the public view until approved.
            hidden_from_public=held,
            pending_review=held,
            created_at=now,
        )
        self.db.add(message)

        # Only bump the visible topic counters when the post is live.
        if not held:
            topic.message_count = (topic.message_count or 0) + 1
            topic.last_message_at = now
            topic.last_message_id = message.id

        await self.db.flush()
        await self._notify_team(
            community,
            channel,
            topic,
            message,
            poster_id=developer_id,
            held=held,
            is_new_topic=False,
        )
        return {"id": message.id, "pending_review": held}

    async def create_topic(
        self,
        community: WorkspaceCommunity,
        channel: ChatChannel,
        developer_id: str,
        name: str,
        content: str,
    ) -> dict[str, Any]:
        """Open a new thread in a web-public channel as an outside participant.

        Same guards as :meth:`post_reply`, plus its own switch: a workspace that
        wants outsiders answering in threads it started is not necessarily one
        that wants outsiders starting them.

        Under pre-moderation the *whole thread* is held, not just its first
        message — a topic is created ``private`` and only flipped web-public on
        approval. Holding the message alone would publish the thread title, which
        is the part a spammer actually wants published.
        """
        name = (name or "").strip()
        content = (content or "").strip()
        if not name or not content:
            raise ParticipationError("empty", "A title and a message are both required")
        if len(name) > 200:
            raise ParticipationError("too_long", "Title is too long")
        if len(content) > 10_000:
            raise ParticipationError("too_long", "Message is too long")

        if not community.allow_participation:
            raise ParticipationError("disabled", "Participation is not enabled")
        if not community.allow_new_topics:
            raise ParticipationError("disabled", "Starting new threads is not enabled")

        # The *channel* must be public — a new thread has no visibility of its
        # own to inherit from yet, so this is what makes it publishable.
        if not channel_is_web_public(channel, community_enabled=community.enabled):
            raise ParticipationError("not_public", "This channel is not open for new threads")

        if not await self._rate_ok(
            channel.workspace_id,
            developer_id,
            scope="topic",
            limit=_TOPIC_RATE_LIMIT_MAX,
        ):
            raise ParticipationError("rate_limited", "Too many new threads — slow down")

        await self.ensure_community_member(channel.workspace_id, developer_id)

        # Reuse chat's slug allocator so a public permalink is unique per channel
        # and survives a later rename, exactly as an internally created topic's.
        from aexy.services.chat_service import ChatService

        slug = await ChatService(self.db)._unique_topic_slug(channel.id, name)

        held = community.post_moderation == "pre"
        now = datetime.now(timezone.utc)
        topic_id = str(uuid4())
        message_id = str(uuid4())

        topic = ChatTopic(
            id=topic_id,
            channel_id=channel.id,
            name=name,
            # Explicit rather than inherit, so approving is one field flip and a
            # later change to the channel's visibility cannot silently publish a
            # thread that is still under review.
            visibility=(
                TopicVisibility.PRIVATE.value if held else TopicVisibility.WEB_PUBLIC.value
            ),
            slug=slug,
            public_short_id=uuid4().hex[:10],
            message_count=0 if held else 1,
            last_message_at=None if held else now,
            last_message_id=None if held else message_id,
            created_by_id=developer_id,
        )
        self.db.add(topic)
        await self.db.flush()

        message = ChatMessage(
            id=message_id,
            topic_id=topic_id,
            channel_id=channel.id,
            sender_id=developer_id,
            content=content,
            hidden_from_public=held,
            pending_review=held,
            created_at=now,
        )
        self.db.add(message)
        await self.db.flush()

        # Deliberately NOT ChatService.create_topic: that auto-joins the author
        # to any non-private channel, which would hand an outside participant
        # internal channel membership as a side effect of asking a question.

        await self._notify_team(
            community,
            channel,
            topic,
            message,
            poster_id=developer_id,
            held=held,
            is_new_topic=True,
        )
        return {
            "id": message.id,
            "topic_id": topic.id,
            "pending_review": held,
            # A held thread has no public URL yet — saying otherwise would send
            # the author to a 404 they would read as "my post vanished".
            "path": (
                None
                if held
                else f"/{channel.slug}/{topic.slug}-{topic.public_short_id}"
            ),
        }

    # ── Reactions ─────────────────────────────────────────────────────

    async def toggle_reaction(
        self,
        community: WorkspaceCommunity,
        channel: ChatChannel,
        topic: ChatTopic,
        message_id: str,
        developer_id: str,
        emoji: str,
    ) -> dict[str, Any]:
        """Add or remove one reaction. Idempotent per (message, person, emoji)."""
        if emoji not in PUBLIC_REACTIONS:
            raise ParticipationError("invalid_emoji", "That reaction isn't available")
        if not community.allow_participation:
            raise ParticipationError("disabled", "Participation is not enabled")
        if not topic_is_web_public(channel, topic, community_enabled=community.enabled):
            raise ParticipationError("not_public", "This topic is not open")

        message = (
            await self.db.execute(
                select(ChatMessage).where(
                    ChatMessage.id == message_id,
                    ChatMessage.topic_id == topic.id,
                    ChatMessage.is_deleted.is_(False),
                    ChatMessage.hidden_from_public.is_(False),
                )
            )
        ).scalar_one_or_none()
        if message is None:
            raise ParticipationError("not_found", "Message not found")

        if not await self._rate_ok(
            channel.workspace_id, developer_id, scope="react", limit=60
        ):
            raise ParticipationError("rate_limited", "Too many reactions — slow down")

        await self.ensure_community_member(channel.workspace_id, developer_id)

        existing = (
            await self.db.execute(
                select(ChatMessageReaction).where(
                    ChatMessageReaction.message_id == message_id,
                    ChatMessageReaction.developer_id == developer_id,
                    ChatMessageReaction.emoji == emoji,
                )
            )
        ).scalar_one_or_none()

        if existing is not None:
            await self.db.delete(existing)
            reacted = False
        else:
            self.db.add(
                ChatMessageReaction(
                    id=str(uuid4()),
                    message_id=message_id,
                    developer_id=developer_id,
                    emoji=emoji,
                )
            )
            reacted = True
        await self.db.flush()

        count = int(
            (
                await self.db.execute(
                    select(func.count())
                    .select_from(ChatMessageReaction)
                    .where(
                        ChatMessageReaction.message_id == message_id,
                        ChatMessageReaction.emoji == emoji,
                    )
                )
            ).scalar()
            or 0
        )
        return {"emoji": emoji, "count": count, "mine": reacted}

    # ── Accepted answers ──────────────────────────────────────────────

    async def set_accepted_answer(
        self,
        community: WorkspaceCommunity,
        channel: ChatChannel,
        topic: ChatTopic,
        developer_id: str,
        message_id: str | None,
    ) -> dict[str, Any]:
        """Mark a reply as the answer, or clear the mark with ``None``.

        Allowed for the person who asked and for workspace admins — nobody else,
        or a passer-by could decide what counts as the answer on someone else's
        question.
        """
        if not topic_is_web_public(channel, topic, community_enabled=community.enabled):
            raise ParticipationError("not_public", "This topic is not public")

        is_author = str(topic.created_by_id or "") == str(developer_id)
        if not is_author and not await self._is_workspace_admin(
            channel.workspace_id, developer_id
        ):
            raise ParticipationError("forbidden", "Only the author or an admin can do that")

        if message_id is not None:
            message = (
                await self.db.execute(
                    select(ChatMessage).where(
                        ChatMessage.id == message_id,
                        ChatMessage.topic_id == topic.id,
                        ChatMessage.is_deleted.is_(False),
                        ChatMessage.hidden_from_public.is_(False),
                    )
                )
            ).scalar_one_or_none()
            if message is None:
                # Validated against the topic because the column carries no
                # foreign key (see the model comment) — nothing else would stop
                # a caller pointing it at a message in another thread.
                raise ParticipationError("not_found", "Message not found in this topic")

        topic.accepted_message_id = message_id
        topic.is_resolved = message_id is not None
        await self.db.flush()
        return {"accepted_message_id": message_id}

    async def _is_workspace_admin(self, workspace_id: str, developer_id: str) -> bool:
        member = (
            await self.db.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.developer_id == developer_id,
                    WorkspaceMember.status == "active",
                )
            )
        ).scalar_one_or_none()
        return member is not None and member.role in _ADMIN_ROLES

    # ── Notifying the host team ───────────────────────────────────────

    async def _notify_team(
        self,
        community: WorkspaceCommunity,
        channel: ChatChannel,
        topic: ChatTopic,
        message: ChatMessage,
        *,
        poster_id: str,
        held: bool,
        is_new_topic: bool,
    ) -> None:
        """Tell the host team that an outsider posted.

        Without this the forum is a room nobody is listening in: a question sits
        on a public page until an admin happens to open the moderation tab. Best
        effort — a notification failure must never lose the post that triggered
        it.
        """
        try:
            recipients = await self._recipients(channel, exclude=poster_id)
            if not recipients:
                return

            snippet = (message.content or "")[:140]
            if held:
                event = NotificationEventType.COMMUNITY_PENDING_REVIEW
                title = "A community post is waiting for review"
                action_url = "/settings/community"
            else:
                event = (
                    NotificationEventType.COMMUNITY_TOPIC
                    if is_new_topic
                    else NotificationEventType.COMMUNITY_REPLY
                )
                title = (
                    f"New community thread in #{channel.name}"
                    if is_new_topic
                    else f"New community reply in #{channel.name}"
                )
                action_url = (
                    f"/community/{community.community_slug}/{channel.slug}"
                    f"/{topic.slug}-{topic.public_short_id}"
                    if topic.slug and topic.public_short_id
                    else f"/community/{community.community_slug}"
                )

            from aexy.services.notification_service import NotificationService

            service = NotificationService(self.db)
            for recipient_id in recipients:
                await service.create_notification(
                    recipient_id=recipient_id,
                    event_type=event,
                    title=title,
                    body=f"{topic.name}: {snippet}" if snippet else topic.name,
                    context={
                        "entity_type": "community_topic",
                        "entity_id": topic.id,
                        "action_url": action_url,
                        "workspace_id": channel.workspace_id,
                        "channel_name": channel.name,
                        "topic_name": topic.name,
                        "snippet": snippet,
                    },
                )
        except Exception:
            logger.exception("Failed to notify the team about a community post")

    async def _recipients(self, channel: ChatChannel, *, exclude: str) -> list[str]:
        """Who hears about a post: the channel's members, else the workspace admins.

        Channel members first because they are the people who chose this channel.
        Admins are the fallback rather than an addition — a published channel
        with members does not need every admin told about every reply.
        """
        member_rows = (
            await self.db.execute(
                select(ChatChannelMember.developer_id).where(
                    ChatChannelMember.channel_id == channel.id,
                    ChatChannelMember.is_muted.is_(False),
                )
            )
        ).all()
        members = [str(row[0]) for row in member_rows if str(row[0]) != str(exclude)]
        if members:
            return members

        admin_rows = (
            await self.db.execute(
                select(WorkspaceMember.developer_id).where(
                    WorkspaceMember.workspace_id == channel.workspace_id,
                    WorkspaceMember.status == "active",
                    WorkspaceMember.role.in_(_ADMIN_ROLES),
                )
            )
        ).all()
        return [str(row[0]) for row in admin_rows if str(row[0]) != str(exclude)]

    # ── Moderation queue ──────────────────────────────────────────────

    async def list_pending(self, workspace_id: str) -> list[dict[str, Any]]:
        rows = (
            await self.db.execute(
                select(ChatMessage, ChatTopic, ChatChannel)
                .join(ChatTopic, ChatMessage.topic_id == ChatTopic.id)
                .join(ChatChannel, ChatMessage.channel_id == ChatChannel.id)
                .where(
                    ChatChannel.workspace_id == workspace_id,
                    ChatMessage.pending_review.is_(True),
                    ChatMessage.is_deleted.is_(False),
                )
                .order_by(ChatMessage.created_at.asc())
            )
        ).all()
        # One extra query per pending post, to say whether it opens a thread.
        # Deliberate: the queue is admin-only and short by construction (it is
        # the backlog somebody is about to clear), and the alternative is a
        # moderator not being told that "reject" here removes a whole thread.
        out: list[dict[str, Any]] = []
        for m, t, ch in rows:
            out.append(
                {
                    "id": m.id,
                    "content": m.content,
                    "created_at": m.created_at,
                    "channel_name": ch.name,
                    "topic_name": t.name,
                    "sender_id": m.sender_id,
                    # Both decisions are bigger than they look on an opener:
                    # approving publishes the thread and its title, rejecting
                    # removes the thread rather than one post.
                    "is_thread_opener": await self._is_held_thread_opener(t, m),
                }
            )
        return out

    async def _get_pending_message(
        self, workspace_id: str, message_id: str
    ) -> ChatMessage | None:
        return (
            await self.db.execute(
                select(ChatMessage)
                .join(ChatChannel, ChatMessage.channel_id == ChatChannel.id)
                .where(
                    ChatMessage.id == message_id,
                    ChatChannel.workspace_id == workspace_id,
                    ChatMessage.pending_review.is_(True),
                )
            )
        ).scalar_one_or_none()

    async def _is_held_thread_opener(
        self, topic: ChatTopic | None, message: ChatMessage
    ) -> bool:
        """Whether ``message`` is the held first post of a thread awaiting review.

        Three conditions together, because each alone is reachable innocently: a
        topic held by :meth:`create_topic` is private, was created by the poster,
        and this message is its earliest. An admin who merely marked an existing
        thread private must not have it published by approving a reply in it.
        """
        if topic is None or topic.visibility != TopicVisibility.PRIVATE.value:
            return False
        if str(topic.created_by_id or "") != str(message.sender_id):
            return False
        earliest = (
            await self.db.execute(
                select(ChatMessage.id)
                .where(ChatMessage.topic_id == topic.id, ChatMessage.is_deleted.is_(False))
                .order_by(ChatMessage.created_at.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
        return earliest == message.id

    async def approve(self, workspace_id: str, message_id: str) -> bool:
        message = await self._get_pending_message(workspace_id, message_id)
        if message is None:
            return False
        message.pending_review = False
        message.hidden_from_public = False
        # Bump counters now that it's live. A held post can be approved after
        # newer messages already landed, so only advance the "last message"
        # pointers when this post is genuinely the most recent — otherwise we'd
        # regress the topic's activity ordering.
        topic = await self.db.get(ChatTopic, message.topic_id)
        if topic is not None:
            if await self._is_held_thread_opener(topic, message):
                # Approving the opener publishes the thread itself, not just its
                # first post. Until now the whole topic was private.
                topic.visibility = TopicVisibility.WEB_PUBLIC.value
            topic.message_count = (topic.message_count or 0) + 1
            if topic.last_message_at is None or message.created_at >= topic.last_message_at:
                topic.last_message_at = message.created_at
                topic.last_message_id = message.id
        await self.db.flush()
        return True

    async def reject(self, workspace_id: str, message_id: str) -> bool:
        message = await self._get_pending_message(workspace_id, message_id)
        if message is None:
            return False
        topic = await self.db.get(ChatTopic, message.topic_id)
        opener = await self._is_held_thread_opener(topic, message)

        message.pending_review = False
        message.is_deleted = True
        message.deleted_at = datetime.now(timezone.utc)
        await self.db.flush()

        if opener and topic is not None:
            # Rejecting a thread's only post rejects the thread. Check for other
            # live messages first: a moderator who takes a week to decide may be
            # rejecting the opener of a thread that has since been answered, and
            # deleting that would take the answers with it.
            others = (
                await self.db.execute(
                    select(func.count())
                    .select_from(ChatMessage)
                    .where(
                        ChatMessage.topic_id == topic.id,
                        ChatMessage.is_deleted.is_(False),
                    )
                )
            ).scalar() or 0
            if int(others) == 0:
                await self.db.delete(topic)
                await self.db.flush()
        return True

    async def pending_count(self, workspace_id: str) -> int:
        return int(
            (
                await self.db.execute(
                    select(func.count())
                    .select_from(ChatMessage)
                    .join(ChatChannel, ChatMessage.channel_id == ChatChannel.id)
                    .where(
                        ChatChannel.workspace_id == workspace_id,
                        ChatMessage.pending_review.is_(True),
                        ChatMessage.is_deleted.is_(False),
                    )
                )
            ).scalar()
            or 0
        )
