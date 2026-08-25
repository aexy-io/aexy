"""Anonymous, read-only public community read model.

Serves the crawlable forum view. Every query here carries the public-visibility
predicates (mirroring ``chat_visibility``) as SQL so nothing leaks even if a
caller forgets to filter:

  - only regular, non-archived channels (never DMs);
  - only topics that are web-public (explicit, or inherit + web_public channel),
    never private/restricted;
  - only messages that aren't soft-deleted, aren't moderator-hidden, and are
    at/after the channel's history cutoff.

Sender identities are rendered through each member's public-display preference,
and internal fields (emails, read-state, presence, raw ids beyond what a
permalink needs) are never emitted.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

from sqlalchemy import and_, func, or_, select
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.chat import (
    ChannelKind,
    ChannelVisibility,
    ChatChannel,
    ChatMessage,
    ChatMessageReaction,
    ChatPublicMemberPref,
    ChatTopic,
    PublicDisplayMode,
    TopicVisibility,
    WorkspaceCommunity,
)
from aexy.models.developer import Developer
from aexy.models.workspace import WorkspaceMember

# Mention markup: @[Name](mention:user:id) — rendered down to a plain "@Name" so
# the public view never exposes the internal mention target id.
_MENTION_RE = re.compile(r"@\[([^\]]+)\]\(mention:(?:user|agent|all):?[0-9a-f-]*\)")

# Emoji a public reader may react with. An allow-list rather than free text:
# the value is rendered on a page anyone can read, and "any string up to 16
# chars" is an invitation to put something else there.
PUBLIC_REACTIONS = ("👍", "❤️", "🎉", "👀", "🙏")

# How much of a matching message to show under a search hit.
_SNIPPET_CHARS = 200


def render_public_content(content: str) -> str:
    """Strip internal mention markup to plain ``@Name`` for public display."""
    return _MENTION_RE.sub(lambda m: f"@{m.group(1)}", content or "")


def member_handle(workspace_id: str, developer_id: str) -> str:
    """Opaque, stable public handle for a member of one community.

    Derived rather than stored so there is no new table and no backfill, and
    salted with the workspace id so the same person carries a different handle in
    each community they post in — one forum's handle cannot be used to find them
    in another. Not reversible without knowing both ids.
    """
    digest = hashlib.sha256(f"{workspace_id}:{developer_id}".encode()).hexdigest()
    return digest[:12]


def _ilike_term(query: str) -> str:
    """Wrap a user query for ILIKE, neutralising its wildcards.

    Without this a search for ``100%`` matches every thread, and ``_`` silently
    becomes "any character" — the user's literal text has to stay literal.
    """
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


class PublicCommunityService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Predicates (shared) ───────────────────────────────────────────

    @staticmethod
    def _public_channel_pred() -> ColumnElement[bool]:
        return and_(
            ChatChannel.kind == ChannelKind.CHANNEL.value,
            ChatChannel.is_archived.is_(False),
        )

    @staticmethod
    def _message_public_pred() -> ColumnElement[bool]:
        """Per-message public filters. Requires ``ChatChannel`` in the join.

        The history cutoff belongs here and not only in the topic listing: a
        channel published today with ``web_public_since`` set must not leak
        yesterday's messages through search, feeds, or profile counts either.
        """
        return and_(
            ChatMessage.is_deleted.is_(False),
            ChatMessage.hidden_from_public.is_(False),
            or_(
                ChatChannel.web_public_since.is_(None),
                ChatMessage.created_at >= ChatChannel.web_public_since,
            ),
        )

    @staticmethod
    def _topic_public_pred() -> ColumnElement[bool]:
        """A topic row is web-public given its channel is a public-eligible one."""
        return and_(
            ChatTopic.visibility.notin_(
                [TopicVisibility.PRIVATE.value, TopicVisibility.RESTRICTED.value]
            ),
            or_(
                ChatTopic.visibility == TopicVisibility.WEB_PUBLIC.value,
                ChatChannel.visibility == ChannelVisibility.WEB_PUBLIC.value,
            ),
        )

    # ── Community meta ────────────────────────────────────────────────

    async def get_community(self, community_slug: str) -> WorkspaceCommunity | None:
        """Return the community iff it exists AND is enabled."""
        result = await self.db.execute(
            select(WorkspaceCommunity).where(
                WorkspaceCommunity.community_slug == community_slug,
                WorkspaceCommunity.enabled.is_(True),
            )
        )
        return result.scalar_one_or_none()

    async def list_directory(self) -> list[dict[str, Any]]:
        """Communities that opted into the public directory (enabled AND listed),
        each with a count of its web-public channels and topics.

        Single grouped query (no per-community fan-out): LEFT JOIN each community
        to its public-eligible channels and their web-public topics, applying the
        visibility predicates in the join ON clauses so a community with zero
        public topics still comes back with 0 counts.
        """
        rows = (
            await self.db.execute(
                select(
                    WorkspaceCommunity,
                    func.count(func.distinct(ChatTopic.channel_id)),
                    func.count(ChatTopic.id),
                )
                .select_from(WorkspaceCommunity)
                .outerjoin(
                    ChatChannel,
                    and_(
                        ChatChannel.workspace_id == WorkspaceCommunity.workspace_id,
                        self._public_channel_pred(),
                    ),
                )
                .outerjoin(
                    ChatTopic,
                    and_(
                        ChatTopic.channel_id == ChatChannel.id,
                        self._topic_public_pred(),
                    ),
                )
                .where(
                    WorkspaceCommunity.enabled.is_(True),
                    WorkspaceCommunity.listed.is_(True),
                )
                .group_by(WorkspaceCommunity.workspace_id)
            )
        ).all()

        out = [
            {
                "community_slug": c.community_slug,
                "title": c.title,
                "description": c.description,
                "logo_url": c.logo_url,
                "channel_count": int(channel_count or 0),
                "topic_count": int(topic_count or 0),
            }
            for c, channel_count, topic_count in rows
        ]
        # Most active (by topic count) first.
        out.sort(key=lambda d: d["topic_count"], reverse=True)
        return out

    async def list_public_channels(self, workspace_id: str) -> list[dict[str, Any]]:
        """Channels that have at least one web-public topic, with counts."""
        # Base: channels whose (channel-level) visibility is web_public, OR that
        # contain an explicitly web_public topic.
        topic_counts = (
            select(
                ChatTopic.channel_id.label("channel_id"),
                func.count(ChatTopic.id).label("topic_count"),
                func.coalesce(func.sum(ChatTopic.message_count), 0).label("message_count"),
                func.max(ChatTopic.last_message_at).label("last_message_at"),
            )
            .join(ChatChannel, ChatTopic.channel_id == ChatChannel.id)
            .where(
                ChatChannel.workspace_id == workspace_id,
                self._public_channel_pred(),
                self._topic_public_pred(),
            )
            .group_by(ChatTopic.channel_id)
            .subquery()
        )

        q = (
            select(ChatChannel, topic_counts.c.topic_count,
                   topic_counts.c.message_count, topic_counts.c.last_message_at)
            .join(topic_counts, ChatChannel.id == topic_counts.c.channel_id)
            .where(ChatChannel.workspace_id == workspace_id)
            .order_by(topic_counts.c.last_message_at.desc().nullslast())
        )
        rows = (await self.db.execute(q)).all()
        return [
            {
                "slug": ch.slug,
                "name": ch.name,
                "description": ch.description,
                "topic_count": int(tcount or 0),
                "message_count": int(mcount or 0),
                "last_message_at": last_at,
            }
            for ch, tcount, mcount, last_at in rows
        ]

    async def get_public_channel(
        self, workspace_id: str, channel_slug: str
    ) -> ChatChannel | None:
        result = await self.db.execute(
            select(ChatChannel).where(
                ChatChannel.workspace_id == workspace_id,
                ChatChannel.slug == channel_slug,
                self._public_channel_pred(),
            )
        )
        channel = result.scalar_one_or_none()
        return channel

    async def list_public_topics(
        self, channel: ChatChannel, *, limit: int = 50, offset: int = 0
    ) -> tuple[list[dict[str, Any]], int]:
        """Web-public topics in a channel, newest activity first, with total."""
        base = (
            select(ChatTopic)
            .join(ChatChannel, ChatTopic.channel_id == ChatChannel.id)
            .where(
                ChatTopic.channel_id == channel.id,
                self._public_channel_pred(),
                self._topic_public_pred(),
            )
        )
        total = (
            await self.db.execute(
                select(func.count()).select_from(base.subquery())
            )
        ).scalar() or 0

        rows = (
            await self.db.execute(
                base.order_by(ChatTopic.last_message_at.desc().nullslast())
                .limit(limit)
                .offset(offset)
            )
        ).scalars().all()

        topics = [
            {
                "slug": t.slug,
                "short_id": t.public_short_id,
                "name": t.name,
                "message_count": t.message_count,
                "last_message_at": t.last_message_at,
                "created_at": t.created_at,
                "is_answered": t.accepted_message_id is not None,
            }
            for t in rows
        ]
        return topics, int(total)

    async def get_public_topic(
        self, channel: ChatChannel, topic_slug: str, short_id: str
    ) -> ChatTopic | None:
        result = await self.db.execute(
            select(ChatTopic)
            .join(ChatChannel, ChatTopic.channel_id == ChatChannel.id)
            .where(
                ChatTopic.channel_id == channel.id,
                ChatTopic.slug == topic_slug,
                ChatTopic.public_short_id == short_id,
                self._public_channel_pred(),
                self._topic_public_pred(),
            )
        )
        return result.scalar_one_or_none()

    async def list_public_messages(
        self,
        channel: ChatChannel,
        topic: ChatTopic,
        *,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        """Public-safe messages in a topic, oldest first (reading order)."""
        conds = [
            ChatMessage.topic_id == topic.id,
            ChatMessage.is_deleted.is_(False),
            ChatMessage.hidden_from_public.is_(False),
        ]
        if channel.web_public_since is not None:
            conds.append(ChatMessage.created_at >= channel.web_public_since)

        base = (
            select(ChatMessage, Developer, ChatPublicMemberPref)
            # Outer join: system/agent messages (or those whose sender was later
            # deleted) have no Developer row, but must still appear publicly.
            # An inner join here would silently drop them AND desync the `total`
            # count below (which is computed without the join).
            .outerjoin(Developer, ChatMessage.sender_id == Developer.id)
            .outerjoin(
                ChatPublicMemberPref,
                and_(
                    ChatPublicMemberPref.developer_id == ChatMessage.sender_id,
                    ChatPublicMemberPref.workspace_id == channel.workspace_id,
                ),
            )
            .where(*conds)
        )
        total = (
            await self.db.execute(
                select(func.count()).select_from(
                    select(ChatMessage.id).where(*conds).subquery()
                )
            )
        ).scalar() or 0

        rows = (
            await self.db.execute(
                base.order_by(ChatMessage.created_at.asc()).limit(limit).offset(offset)
            )
        ).all()

        # Resolve default display mode from the community settings once.
        default_display = await self._default_display(channel.workspace_id)

        from aexy.services.community_service import CommunityService

        namer = CommunityService(self.db)
        reactions = await self._reactions_for([m.id for m, _dev, _pref in rows])
        messages = []
        for m, dev, pref in rows:
            # An agent-authored message carries an agent_sender marker; show that
            # name rather than the (system) developer identity.
            agent_sender = next(
                (x for x in (m.mentions or []) if x.get("type") == "agent_sender"),
                None,
            )
            if agent_sender:
                display_name = agent_sender.get("name") or "Assistant"
            else:
                display_name = namer.public_name_for(
                    developer_name=dev.name if dev is not None else None,
                    pref=pref,
                    default_display=default_display,
                )
            # A handle only exists for somebody who chose to be seen. An
            # anonymous poster gets no profile link, because a link is exactly
            # how "anonymous" would come undone: follow it once and every other
            # post by the same person is attributed.
            mode = pref.public_display if pref is not None else default_display
            named = (
                dev is not None
                and not agent_sender
                and mode != PublicDisplayMode.ANONYMOUS.value
            )
            messages.append(
                {
                    "id": m.id,
                    "author": display_name,
                    "author_handle": (
                        member_handle(channel.workspace_id, m.sender_id) if named else None
                    ),
                    "content": render_public_content(m.content),
                    "is_edited": m.is_edited,
                    "created_at": m.created_at,
                    "reactions": reactions.get(m.id, []),
                    "is_accepted": topic.accepted_message_id == m.id,
                }
            )
        return messages, int(total)

    async def _reactions_for(self, message_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        """Reaction counts per message, in one grouped query (never N+1).

        Counts only — never who reacted. The public topic response is rendered
        once and cached for every anonymous reader, so a per-viewer ``mine`` flag
        computed here would be baked into a shared page. The signed-in reader's
        own reactions come from :meth:`my_reactions`, which the client calls
        after hydration.
        """
        if not message_ids:
            return {}
        rows = (
            await self.db.execute(
                select(
                    ChatMessageReaction.message_id,
                    ChatMessageReaction.emoji,
                    func.count(ChatMessageReaction.id),
                )
                .where(ChatMessageReaction.message_id.in_(message_ids))
                .group_by(ChatMessageReaction.message_id, ChatMessageReaction.emoji)
            )
        ).all()

        out: dict[str, list[dict[str, Any]]] = {}
        for message_id, emoji, count in rows:
            out.setdefault(message_id, []).append(
                {"emoji": emoji, "count": int(count or 0), "mine": False}
            )
        # Stable order so the same thread doesn't reshuffle its chips between
        # requests: most-reacted first, then the allow-list order.
        for chips in out.values():
            chips.sort(
                key=lambda c: (
                    -c["count"],
                    PUBLIC_REACTIONS.index(c["emoji"])
                    if c["emoji"] in PUBLIC_REACTIONS
                    else len(PUBLIC_REACTIONS),
                )
            )
        return out

    async def my_reactions(self, topic_id: str, developer_id: str) -> dict[str, list[str]]:
        """Which emoji the caller has used, per message, in one topic.

        Kept out of the cached topic payload on purpose (see
        :meth:`_reactions_for`) — this is the per-viewer half, fetched separately
        so the shared page stays shared.
        """
        rows = (
            await self.db.execute(
                select(ChatMessageReaction.message_id, ChatMessageReaction.emoji)
                .join(ChatMessage, ChatMessage.id == ChatMessageReaction.message_id)
                .where(
                    ChatMessage.topic_id == topic_id,
                    ChatMessageReaction.developer_id == developer_id,
                )
            )
        ).all()
        out: dict[str, list[str]] = {}
        for message_id, emoji in rows:
            out.setdefault(message_id, []).append(emoji)
        return out

    # ── Search ────────────────────────────────────────────────────────

    async def search(
        self, workspace_id: str, query: str, *, limit: int = 20, offset: int = 0
    ) -> tuple[list[dict[str, Any]], int]:
        """Search web-public threads by title and message body.

        Returns threads, not messages: an answer taken out of its question is
        not useful to the person who searched.

        Matching is ILIKE rather than full-text on purpose. The test suite runs
        on SQLite in-memory, where ``to_tsvector`` does not exist — a query the
        tests cannot execute is a query nobody checks. Postgres still gets an
        index scan for this SQL via the trigram GIN indexes in the migration.
        """
        query = (query or "").strip()
        if len(query) < 2:
            return [], 0
        term = _ilike_term(query)

        # Public messages in this workspace whose body matches.
        body_match = (
            select(ChatMessage.topic_id)
            .join(ChatChannel, ChatMessage.channel_id == ChatChannel.id)
            .where(
                ChatChannel.workspace_id == workspace_id,
                self._message_public_pred(),
                ChatMessage.content.ilike(term, escape="\\"),
            )
        )

        base = (
            select(ChatTopic, ChatChannel)
            .join(ChatChannel, ChatTopic.channel_id == ChatChannel.id)
            .where(
                ChatChannel.workspace_id == workspace_id,
                self._public_channel_pred(),
                self._topic_public_pred(),
                or_(
                    ChatTopic.name.ilike(term, escape="\\"),
                    ChatTopic.id.in_(body_match),
                ),
            )
        )

        total = (
            await self.db.execute(select(func.count()).select_from(base.subquery()))
        ).scalar() or 0

        rows = (
            await self.db.execute(
                base.order_by(ChatTopic.last_message_at.desc().nullslast())
                .limit(limit)
                .offset(offset)
            )
        ).all()
        if not rows:
            return [], int(total)

        snippets = await self._snippets_for([t.id for t, _ch in rows], term=term)
        hits = [
            {
                "channel_slug": ch.slug,
                "channel_name": ch.name,
                "topic_slug": t.slug,
                "short_id": t.public_short_id,
                "name": t.name,
                "snippet": snippets.get(t.id),
                "message_count": t.message_count,
                "last_message_at": t.last_message_at,
                "is_answered": t.accepted_message_id is not None,
            }
            for t, ch in rows
        ]
        return hits, int(total)

    async def _snippets_for(self, topic_ids: list[str], *, term: str) -> dict[str, str]:
        """One excerpt per topic, for the page of hits only.

        Prefers a message that actually matched, and falls back to the thread's
        opening post. The fallback matters more than it looks: a thread found by
        its *title* has no matching message at all, and a search result with a
        heading and nothing under it gives the reader no way to tell whether it
        is the one they want.
        """
        if not topic_ids:
            return {}

        async def excerpts(matching_only: bool) -> dict[str, str]:
            conds = [ChatMessage.topic_id.in_(topic_ids), self._message_public_pred()]
            if matching_only:
                conds.append(ChatMessage.content.ilike(term, escape="\\"))
            rows = (
                await self.db.execute(
                    select(ChatMessage.topic_id, ChatMessage.content)
                    .join(ChatChannel, ChatMessage.channel_id == ChatChannel.id)
                    .where(*conds)
                    .order_by(ChatMessage.created_at.asc())
                )
            ).all()
            found: dict[str, str] = {}
            for topic_id, content in rows:
                if topic_id in found:
                    continue
                text = render_public_content(content or "").strip()
                found[topic_id] = (
                    text[:_SNIPPET_CHARS] + "…" if len(text) > _SNIPPET_CHARS else text
                )
            return found

        out = await excerpts(matching_only=True)
        missing = [t for t in topic_ids if t not in out]
        if missing:
            topic_ids = missing
            out.update(await excerpts(matching_only=False))
        return out

    # ── Member profiles ───────────────────────────────────────────────

    async def get_member_profile(
        self, workspace_id: str, handle: str
    ) -> dict[str, Any] | None:
        """Public profile for the member behind ``handle``, or None.

        Handles are derived, not stored, so resolving one means recomputing it
        for the candidates — deliberately only the people who have actually
        posted something publicly here, which is a far smaller set than the
        workspace's membership and the only set that could have a profile.
        """
        sender_rows = (
            await self.db.execute(
                select(ChatMessage.sender_id)
                .join(ChatChannel, ChatMessage.channel_id == ChatChannel.id)
                .join(ChatTopic, ChatMessage.topic_id == ChatTopic.id)
                .where(
                    ChatChannel.workspace_id == workspace_id,
                    self._message_public_pred(),
                    self._public_channel_pred(),
                    self._topic_public_pred(),
                )
                .distinct()
            )
        ).all()
        developer_id = next(
            (
                sid
                for (sid,) in sender_rows
                if sid and member_handle(workspace_id, sid) == handle
            ),
            None,
        )
        if developer_id is None:
            return None

        developer = await self.db.get(Developer, developer_id)
        pref = (
            await self.db.execute(
                select(ChatPublicMemberPref).where(
                    ChatPublicMemberPref.workspace_id == workspace_id,
                    ChatPublicMemberPref.developer_id == developer_id,
                )
            )
        ).scalar_one_or_none()
        default_display = await self._default_display(workspace_id)
        mode = pref.public_display if pref is not None else default_display
        if mode == PublicDisplayMode.ANONYMOUS.value:
            # Not "empty profile" — no profile. The absence is the privacy.
            return None

        from aexy.services.community_service import CommunityService

        display_name = CommunityService(self.db).public_name_for(
            developer_name=developer.name if developer is not None else None,
            pref=pref,
            default_display=default_display,
        )

        joined_at = (
            await self.db.execute(
                select(WorkspaceMember.joined_at).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.developer_id == developer_id,
                )
            )
        ).scalar_one_or_none()

        public_topics = (
            select(ChatTopic.id)
            .join(ChatChannel, ChatTopic.channel_id == ChatChannel.id)
            .where(
                ChatChannel.workspace_id == workspace_id,
                self._public_channel_pred(),
                self._topic_public_pred(),
            )
        )
        message_count = (
            await self.db.execute(
                select(func.count())
                .select_from(ChatMessage)
                .join(ChatChannel, ChatMessage.channel_id == ChatChannel.id)
                .where(
                    ChatMessage.sender_id == developer_id,
                    self._message_public_pred(),
                    ChatMessage.topic_id.in_(public_topics),
                )
            )
        ).scalar() or 0

        started = (
            await self.db.execute(
                select(ChatTopic, ChatChannel)
                .join(ChatChannel, ChatTopic.channel_id == ChatChannel.id)
                .where(
                    ChatTopic.created_by_id == developer_id,
                    ChatChannel.workspace_id == workspace_id,
                    self._public_channel_pred(),
                    self._topic_public_pred(),
                )
                .order_by(ChatTopic.last_message_at.desc().nullslast())
                .limit(20)
            )
        ).all()

        accepted = (
            await self.db.execute(
                select(func.count())
                .select_from(ChatTopic)
                .join(ChatMessage, ChatMessage.id == ChatTopic.accepted_message_id)
                .join(ChatChannel, ChatTopic.channel_id == ChatChannel.id)
                .where(
                    ChatMessage.sender_id == developer_id,
                    ChatChannel.workspace_id == workspace_id,
                    self._message_public_pred(),
                    self._public_channel_pred(),
                    self._topic_public_pred(),
                )
            )
        ).scalar() or 0

        return {
            "handle": handle,
            "display_name": display_name,
            "joined_at": joined_at,
            "topic_count": len(started),
            "message_count": int(message_count),
            "accepted_answer_count": int(accepted),
            "topics": [
                {
                    "channel_slug": ch.slug,
                    "channel_name": ch.name,
                    "topic_slug": t.slug,
                    "short_id": t.public_short_id,
                    "name": t.name,
                    "snippet": None,
                    "message_count": t.message_count,
                    "last_message_at": t.last_message_at,
                    "is_answered": t.accepted_message_id is not None,
                }
                for t, ch in started
            ],
        }

    # ── Feeds ─────────────────────────────────────────────────────────

    async def feed_entries(
        self, workspace_id: str, *, channel_slug: str | None = None, limit: int = 30
    ) -> list[dict[str, Any]]:
        """Newest public threads, for the RSS feed."""
        conds = [
            ChatChannel.workspace_id == workspace_id,
            self._public_channel_pred(),
            self._topic_public_pred(),
        ]
        if channel_slug:
            conds.append(ChatChannel.slug == channel_slug)

        rows = (
            await self.db.execute(
                select(ChatTopic, ChatChannel)
                .join(ChatChannel, ChatTopic.channel_id == ChatChannel.id)
                .where(*conds)
                .order_by(ChatTopic.last_message_at.desc().nullslast())
                .limit(limit)
            )
        ).all()
        if not rows:
            return []

        # First public message of each thread, as the feed item's description.
        first: dict[str, str] = {}
        message_rows = (
            await self.db.execute(
                select(ChatMessage.topic_id, ChatMessage.content)
                .join(ChatChannel, ChatMessage.channel_id == ChatChannel.id)
                .where(
                    ChatMessage.topic_id.in_([t.id for t, _ch in rows]),
                    self._message_public_pred(),
                )
                .order_by(ChatMessage.created_at.asc())
            )
        ).all()
        for topic_id, content in message_rows:
            if topic_id not in first:
                text = render_public_content(content or "").strip()
                first[topic_id] = (
                    text[:_SNIPPET_CHARS] + "…" if len(text) > _SNIPPET_CHARS else text
                )

        return [
            {
                "path": f"/{ch.slug}/{t.slug}-{t.public_short_id}",
                "title": t.name,
                "channel_name": ch.name,
                "description": first.get(t.id, ""),
                "published_at": t.last_message_at or t.created_at,
            }
            for t, ch in rows
            if t.slug and t.public_short_id
        ]

    async def _default_display(self, workspace_id: str) -> str:
        result = await self.db.execute(
            select(WorkspaceCommunity.default_public_display).where(
                WorkspaceCommunity.workspace_id == workspace_id
            )
        )
        return result.scalar_one_or_none() or "name"

    # ── Sitemap ───────────────────────────────────────────────────────

    async def sitemap_entries(self, workspace_id: str) -> list[dict[str, Any]]:
        """Flat list of public channel + topic paths with lastmod for the sitemap."""
        rows = (
            await self.db.execute(
                select(
                    ChatChannel.slug,
                    ChatTopic.slug,
                    ChatTopic.public_short_id,
                    ChatTopic.last_message_at,
                    ChatTopic.created_at,
                )
                .join(ChatChannel, ChatTopic.channel_id == ChatChannel.id)
                .where(
                    ChatChannel.workspace_id == workspace_id,
                    self._public_channel_pred(),
                    self._topic_public_pred(),
                )
                .order_by(ChatTopic.last_message_at.desc().nullslast())
            )
        ).all()
        entries: list[dict[str, Any]] = []
        seen_channels: set[str] = set()
        for ch_slug, t_slug, short_id, last_at, created_at in rows:
            if ch_slug not in seen_channels:
                seen_channels.add(ch_slug)
                entries.append({"path": f"/{ch_slug}", "lastmod": last_at or created_at})
            if t_slug and short_id:
                entries.append(
                    {
                        "path": f"/{ch_slug}/{t_slug}-{short_id}",
                        "lastmod": last_at or created_at,
                    }
                )
        return entries
