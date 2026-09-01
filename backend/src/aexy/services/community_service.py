"""Community settings + per-member public-display preferences.

Phase 1 covers the write/read side of the opt-in surface (the master switch,
branding, and how each member appears publicly). The anonymous public read API
(Phase 2) builds on top of this and on ``chat_visibility``.
"""

from __future__ import annotations

import re
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.chat import (
    ChannelVisibility,
    ChatChannel,
    ChatPublicMemberPref,
    PublicDisplayMode,
    WorkspaceCommunity,
)
from aexy.models.workspace import Workspace
from aexy.services.community_templates import get_template

_VALID_DISPLAY = {m.value for m in PublicDisplayMode}


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9\s-]", "", value.lower().strip())
    slug = re.sub(r"[\s-]+", "-", slug).strip("-")
    return slug or "community"


class CommunityService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Master switch + branding ──────────────────────────────────────

    async def get_settings(self, workspace_id: str) -> WorkspaceCommunity | None:
        result = await self.db.execute(
            select(WorkspaceCommunity).where(
                WorkspaceCommunity.workspace_id == workspace_id
            )
        )
        return result.scalar_one_or_none()

    async def get_by_slug(self, community_slug: str) -> WorkspaceCommunity | None:
        result = await self.db.execute(
            select(WorkspaceCommunity).where(
                WorkspaceCommunity.community_slug == community_slug
            )
        )
        return result.scalar_one_or_none()

    async def upsert_settings(
        self, workspace_id: str, **fields: Any
    ) -> WorkspaceCommunity:
        """Create or update a workspace's community settings.

        On first creation the ``community_slug`` defaults to the workspace slug
        (falling back to a random suffix on collision, since the slug is globally
        unique across communities).
        """
        settings = await self.get_settings(workspace_id)
        if settings is None:
            slug = fields.get("community_slug") or await self._default_slug(workspace_id)
            settings = WorkspaceCommunity(
                workspace_id=workspace_id,
                community_slug=await self._ensure_unique_slug(slug),
            )
            self.db.add(settings)

        allowed = {
            "enabled", "title", "description", "logo_url", "theme",
            "default_public_display", "noindex", "listed", "community_slug",
            "allow_participation", "post_moderation", "allow_new_topics",
            "link_service_desk", "link_docs",
        }
        for key, value in fields.items():
            if key not in allowed or value is None:
                continue
            if key == "default_public_display" and value not in _VALID_DISPLAY:
                raise ValueError(f"Invalid public_display: {value}")
            if key == "community_slug":
                value = await self._ensure_unique_slug(_slugify(value), exclude=workspace_id)
            setattr(settings, key, value)

        try:
            await self.db.flush()
        except IntegrityError:
            await self.db.rollback()
            raise
        await self.db.refresh(settings)
        return settings

    async def _default_slug(self, workspace_id: str) -> str:
        result = await self.db.execute(
            select(Workspace.slug).where(Workspace.id == workspace_id)
        )
        ws_slug = result.scalar_one_or_none()
        return _slugify(ws_slug) if ws_slug else "community"

    async def _ensure_unique_slug(self, slug: str, exclude: str | None = None) -> str:
        q = select(WorkspaceCommunity.workspace_id).where(
            WorkspaceCommunity.community_slug == slug
        )
        owner = (await self.db.execute(q)).scalar_one_or_none()
        if owner is None or str(owner) == str(exclude):
            return slug
        return f"{slug}-{uuid4().hex[:6]}"

    # ── Starter templates ─────────────────────────────────────────────

    async def apply_template(
        self, workspace_id: str, developer_id: str, template_id: str, publish: bool = False
    ) -> dict[str, Any]:
        """Lay out a community from a starter template.

        Idempotent by channel slug: a channel that already exists is left
        untouched and reported as skipped, so clicking twice does not produce
        "help" and "help-a1b2c3". That mirrors
        :meth:`ChatService.setup_default_channel`, and it is what makes the
        picker safe to re-open.

        ``publish`` is the only thing here that makes anything visible, and it
        defaults to false. Laying out channels and going live are separate
        decisions; conflating them is how a half-written forum ends up indexed.
        """
        template = get_template(template_id)
        if template is None:
            raise ValueError(f"Unknown community template: {template_id}")

        # A template's participation settings are *defaults*, so they are only
        # written when there is nothing to overwrite. Re-applying one to add a
        # channel must not quietly re-open replies on a forum whose owner
        # deliberately closed them — the second click is meant to be safe, and
        # "safe" cannot mean "resets your moderation policy".
        first_time = await self.get_settings(workspace_id) is None

        from aexy.services.chat_service import ChatService

        chat = ChatService(self.db)
        created: list[str] = []
        skipped: list[str] = []
        topics_created = 0

        for spec in template.channels:
            existing = (
                await self.db.execute(
                    select(ChatChannel).where(
                        ChatChannel.workspace_id == workspace_id,
                        ChatChannel.slug == spec.slug,
                    )
                )
            ).scalar_one_or_none()
            if existing is not None:
                skipped.append(spec.name)
                continue

            channel = await chat.create_channel(
                workspace_id,
                developer_id,
                spec.name,
                description=spec.description,
                # Web-public from the start: a template's whole purpose is a
                # forum with something on it, and the community master switch
                # (``enabled``) is what still gates whether any of it is served.
                visibility=ChannelVisibility.WEB_PUBLIC.value,
            )
            created.append(spec.name)

            for topic in spec.topics:
                await chat.create_topic_with_message(
                    channel.id, developer_id, topic.name, topic.first_message
                )
                topics_created += 1

        defaults = (
            {
                "allow_participation": template.allow_participation,
                "allow_new_topics": template.allow_new_topics,
                "post_moderation": template.post_moderation,
            }
            if first_time
            else {}
        )
        settings = await self.upsert_settings(
            workspace_id,
            enabled=True if publish else None,
            **defaults,
        )

        return {
            "template_id": template.id,
            "channels_created": created,
            "channels_skipped": skipped,
            "topics_created": topics_created,
            "enabled": settings.enabled,
            "community_slug": settings.community_slug,
            # So the UI can say "channels added, your existing participation
            # settings kept" rather than implying the template's defaults won.
            "settings_applied": first_time,
        }

    # ── Per-member public display prefs ───────────────────────────────

    async def get_member_pref(
        self, workspace_id: str, developer_id: str
    ) -> ChatPublicMemberPref | None:
        result = await self.db.execute(
            select(ChatPublicMemberPref).where(
                ChatPublicMemberPref.workspace_id == workspace_id,
                ChatPublicMemberPref.developer_id == developer_id,
            )
        )
        return result.scalar_one_or_none()

    async def set_member_pref(
        self,
        workspace_id: str,
        developer_id: str,
        public_display: str,
        public_alias: str | None = None,
    ) -> ChatPublicMemberPref:
        if public_display not in _VALID_DISPLAY:
            raise ValueError(f"Invalid public_display: {public_display}")

        pref = await self.get_member_pref(workspace_id, developer_id)
        if pref is None:
            pref = ChatPublicMemberPref(
                id=str(uuid4()),
                workspace_id=workspace_id,
                developer_id=developer_id,
            )
            self.db.add(pref)
        pref.public_display = public_display
        pref.public_alias = public_alias
        await self.db.flush()
        await self.db.refresh(pref)
        return pref

    def public_name_for(
        self,
        *,
        developer_name: str | None,
        pref: ChatPublicMemberPref | None,
        default_display: str = PublicDisplayMode.NAME.value,
    ) -> str:
        """Resolve the name to show publicly for a member, honouring their pref
        (falling back to the workspace default when the member has none)."""
        mode = pref.public_display if pref is not None else default_display
        if mode == PublicDisplayMode.ANONYMOUS.value:
            return "Community member"
        if mode == PublicDisplayMode.ALIAS.value:
            alias = pref.public_alias if pref is not None else None
            return alias or "Community member"
        return developer_name or "Community member"
