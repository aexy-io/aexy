"""Publishing an internal answer to the public community forum.

The forum's hardest problem is not software, it is content: a team that already
answers the same question ten times a month over email has the answers, just
nowhere public to put them. This module is the bridge — a resolved Service Desk
ticket, or a published document, becomes a thread anyone can find.

Three rules hold, and each of them is here because the alternative is worse:

1. **Every link is opt-in and off by default.** ``WorkspaceCommunity`` carries a
   flag per source (``link_service_desk``, ``link_docs``). Publishing moves text
   somebody else wrote onto a page anyone can read, so it cannot be a default,
   and it cannot be a global setting either — a workspace may want its docs
   public and its ticket traffic emphatically not.

2. **Nothing is published verbatim without a human.** This service takes the
   title and body it is given; the caller is expected to have shown them to a
   person first. It deliberately does not read the ticket's messages and post
   them, because a customer's email contains the customer — their name, their
   account, the thing they were annoyed about — and no redaction heuristic is
   trustworthy enough to run unattended on that.

3. **Publishing is recorded on the source.** The ticket keeps a pointer to the
   thread it produced, so the next person looking at it can see the answer is
   already public instead of writing a second one.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.chat import (
    ChannelVisibility,
    ChatChannel,
    TopicVisibility,
    WorkspaceCommunity,
)
from aexy.services.chat_service import ChatService

logger = logging.getLogger(__name__)


class PublishingError(Exception):
    """A publish that was refused, with a machine-readable code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


# Which WorkspaceCommunity flag gates each source.
_SOURCE_FLAGS = {
    "service_desk": "link_service_desk",
    "docs": "link_docs",
}


class CommunityPublishingService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def linked_community(
        self, workspace_id: str, source: str
    ) -> WorkspaceCommunity | None:
        """The community this source may publish into, or None if it may not."""
        return await self._community_if_linked(workspace_id, source)

    async def target_channels(
        self, workspace_id: str, source: str
    ) -> list[dict[str, Any]]:
        """Channels this source may publish into, or an empty list if it may not.

        Empty covers both "the switch is off" and "there is nowhere to publish
        to", because the caller's response to either is the same: don't offer the
        action.
        """
        community = await self._community_if_linked(workspace_id, source)
        if community is None:
            return []
        rows = (
            await self.db.execute(
                select(ChatChannel)
                .where(
                    ChatChannel.workspace_id == workspace_id,
                    ChatChannel.visibility == ChannelVisibility.WEB_PUBLIC.value,
                    ChatChannel.is_archived.is_(False),
                )
                .order_by(ChatChannel.name)
            )
        ).scalars().all()
        return [{"id": ch.id, "slug": ch.slug, "name": ch.name} for ch in rows]

    async def publish(
        self,
        workspace_id: str,
        *,
        source: str,
        channel_id: str,
        title: str,
        content: str,
        developer_id: str,
    ) -> dict[str, Any]:
        """Create a web-public thread from an internally authored answer."""
        community = await self._community_if_linked(workspace_id, source)
        if community is None:
            raise PublishingError(
                "not_linked",
                "Publishing to the community is switched off for this workspace",
            )

        title = (title or "").strip()
        content = (content or "").strip()
        if len(title) < 3:
            raise PublishingError("empty", "Give the thread a title")
        if not content:
            raise PublishingError("empty", "There is nothing to publish")
        if len(title) > 200 or len(content) > 20_000:
            raise PublishingError("too_long", "That is too long to publish")

        channel = (
            await self.db.execute(
                select(ChatChannel).where(
                    ChatChannel.id == channel_id,
                    ChatChannel.workspace_id == workspace_id,
                    ChatChannel.is_archived.is_(False),
                )
            )
        ).scalar_one_or_none()
        if channel is None:
            raise PublishingError("not_found", "Channel not found")
        if channel.visibility != ChannelVisibility.WEB_PUBLIC.value:
            raise PublishingError(
                "not_public",
                "That channel isn't published, so a thread in it wouldn't be either",
            )

        chat = ChatService(self.db)
        topic, _message = await chat.create_topic_with_message(
            channel.id, developer_id, title, content
        )
        # Explicit rather than inherited: if somebody later un-publishes the
        # channel, a thread that was deliberately made public should not silently
        # change meaning — un-publishing it is then its own decision.
        topic.visibility = TopicVisibility.WEB_PUBLIC.value
        await self.db.flush()

        path = (
            f"/community/{community.community_slug}/{channel.slug}"
            f"/{topic.slug}-{topic.public_short_id}"
        )
        return {
            "topic_id": topic.id,
            "channel_id": channel.id,
            "channel_slug": channel.slug,
            "channel_name": channel.name,
            "community_slug": community.community_slug,
            "path": path,
            # A community that is switched off still accepts published threads —
            # they simply are not served yet. Saying so is more useful than
            # refusing, because "publish the answers, go live on Monday" is a
            # perfectly ordinary way to launch.
            "live": community.enabled,
            "published_at": datetime.now(timezone.utc),
        }

    async def _community_if_linked(
        self, workspace_id: str, source: str
    ) -> WorkspaceCommunity | None:
        flag = _SOURCE_FLAGS.get(source)
        if flag is None:
            raise PublishingError("unknown_source", f"Unknown publish source: {source}")
        community = (
            await self.db.execute(
                select(WorkspaceCommunity).where(
                    WorkspaceCommunity.workspace_id == workspace_id
                )
            )
        ).scalar_one_or_none()
        if community is None or not getattr(community, flag, False):
            return None
        return community
