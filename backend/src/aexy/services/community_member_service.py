"""Authenticated member read model for a public community.

The anonymous :class:`~aexy.services.public_community_service.PublicCommunityService`
only ever exposes web-public content. This service is its authenticated
counterpart: for a signed-in workspace member it surfaces the *internal* threads
(the non web-public channels/topics they may access) so the community page can
become a member hub, not just a crawlable forum.

Access rules mirror the in-app chat exactly (never the public predicates):

  - regular, non-archived channels only (never DMs);
  - a ``private`` channel is included only if the caller is a channel member;
  - a ``restricted`` topic only if the caller holds an access grant;
  - a ``private`` topic only if the caller is a member of its channel.

Web-public channels are deliberately excluded here — those already render in the
public view. A web-public *topic* nested inside an otherwise-internal channel is
kept (the member owns that thread) and flagged ``is_web_public`` so the UI can
badge it.
"""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.chat import (
    ChannelKind,
    ChannelVisibility,
    ChatChannel,
    ChatChannelMember,
    ChatTopic,
    ChatTopicAccessGrant,
    TopicVisibility,
    WorkspaceCommunity,
)
from aexy.services.chat_service import ChatService
from aexy.services.workspace_service import WorkspaceService

_ADMIN_ROLES = {"owner", "admin"}


class CommunityMemberService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_context(
        self, community_slug: str, developer_id: str
    ) -> dict | None:
        """Resolve the member context for ``developer_id`` on a community.

        Returns ``None`` when the community slug doesn't exist (→ 404). A valid
        but non-member caller gets an ``is_member=False`` payload that leaks
        nothing internal (no workspace id, empty channels).
        """
        community = await self._get_community(community_slug)
        if community is None:
            return None

        ws = WorkspaceService(self.db)
        member = await ws.get_member(community.workspace_id, developer_id)
        if member is None or member.status != "active" or member.role == "community":
            return {
                "is_member": False,
                "role": None,
                "workspace_id": None,
                "can_create_thread": False,
                "can_post_public": False,
                "internal_channels": [],
            }

        channels = await self._list_internal_threads(
            community, developer_id
        )
        return {
            "is_member": True,
            "role": member.role,
            "workspace_id": community.workspace_id,
            "can_create_thread": True,
            "can_post_public": member.role in _ADMIN_ROLES,
            "internal_channels": channels,
        }

    async def _get_community(self, community_slug: str) -> WorkspaceCommunity | None:
        # Resolve regardless of ``enabled``: a member may still browse internal
        # threads even when the public forum is switched off.
        result = await self.db.execute(
            select(WorkspaceCommunity).where(
                WorkspaceCommunity.community_slug == community_slug
            )
        )
        return result.scalar_one_or_none()

    async def _list_internal_threads(
        self, community: WorkspaceCommunity, developer_id: str
    ) -> list[dict]:
        workspace_id = community.workspace_id

        # Channels the caller belongs to (unlocks private channels + private topics).
        member_ids_rows = await self.db.execute(
            select(ChatChannelMember.channel_id).where(
                ChatChannelMember.developer_id == developer_id
            )
        )
        member_channel_ids = {row[0] for row in member_ids_rows.all()}

        # Explicit grants unlock restricted topics.
        grant_rows = await self.db.execute(
            select(ChatTopicAccessGrant.topic_id).where(
                ChatTopicAccessGrant.developer_id == developer_id
            )
        )
        grant_topic_ids = {row[0] for row in grant_rows.all()}

        # Candidate channels: regular, non-archived, NOT web-public.
        channel_rows = await self.db.execute(
            select(ChatChannel)
            .where(
                ChatChannel.workspace_id == workspace_id,
                ChatChannel.is_archived.is_(False),
                ChatChannel.kind == ChannelKind.CHANNEL.value,
                ChatChannel.visibility != ChannelVisibility.WEB_PUBLIC.value,
            )
            .order_by(ChatChannel.name)
        )
        candidates = [
            ch
            for ch in channel_rows.scalars().all()
            # private channels require membership; workspace channels are open.
            if ch.visibility != ChannelVisibility.PRIVATE.value
            or ch.id in member_channel_ids
        ]
        if not candidates:
            return []

        channel_ids = [ch.id for ch in candidates]
        topic_rows = await self.db.execute(
            select(ChatTopic)
            .where(ChatTopic.channel_id.in_(channel_ids))
            .order_by(ChatTopic.last_message_at.desc().nullslast())
        )

        topics_by_channel: dict[str, list[ChatTopic]] = defaultdict(list)
        visible_topic_ids: list[str] = []
        for t in topic_rows.scalars().all():
            tv = t.visibility
            if tv == TopicVisibility.RESTRICTED.value and t.id not in grant_topic_ids:
                continue
            if (
                tv == TopicVisibility.PRIVATE.value
                and t.channel_id not in member_channel_ids
            ):
                continue
            topics_by_channel[t.channel_id].append(t)
            visible_topic_ids.append(t.id)

        # Reuse chat's batched unread computation (avoids N+1).
        unread = await ChatService(self.db)._get_unread_counts_batch(
            visible_topic_ids, developer_id
        )

        out: list[dict] = []
        for ch in candidates:
            ch_topics = topics_by_channel.get(ch.id, [])
            # Skip a workspace channel the member neither joined nor has any
            # visible topic in — it's noise. Keep channels they're a member of
            # even when empty, so a "new thread" affordance has somewhere to go.
            is_member = ch.id in member_channel_ids
            if not ch_topics and not is_member:
                continue

            topic_dicts = [
                {
                    "id": t.id,
                    "slug": t.slug,
                    "short_id": t.public_short_id,
                    "name": t.name,
                    "visibility": t.visibility,
                    "is_web_public": (
                        community.enabled
                        and t.visibility == TopicVisibility.WEB_PUBLIC.value
                    ),
                    "message_count": t.message_count,
                    "unread_count": int(unread.get(t.id, 0)),
                    "last_message_at": t.last_message_at,
                }
                for t in ch_topics
            ]
            out.append(
                {
                    "id": ch.id,
                    "slug": ch.slug,
                    "name": ch.name,
                    "description": ch.description,
                    "visibility": ch.visibility,
                    "is_member": is_member,
                    "topic_count": len(topic_dicts),
                    "unread_count": sum(d["unread_count"] for d in topic_dicts),
                    "topics": topic_dicts,
                }
            )
        return out
