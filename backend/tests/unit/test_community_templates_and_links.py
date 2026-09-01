"""Starter templates, and the opt-in links from other modules.

Two properties are load-bearing:

* applying a template twice must not produce ``help`` and ``help-a1b2c3``; and
* every cross-module link must refuse while its switch is off, which is the
  state every workspace starts in.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from aexy.models.chat import ChatChannel, ChatTopic
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.community_publishing_service import (
    CommunityPublishingService,
    PublishingError,
)
from aexy.services.community_service import CommunityService
from aexy.services.community_templates import COMMUNITY_TEMPLATES, template_summaries
from aexy.services.public_community_service import PublicCommunityService


@pytest.fixture
async def env(db_session):
    admin = Developer(id=str(uuid4()), name="Admin", email=f"ad-{uuid4().hex[:8]}@ex.com")
    db_session.add(admin)
    await db_session.flush()

    ws = Workspace(
        id=str(uuid4()), name="Acme", slug=f"acme-{uuid4().hex[:8]}", owner_id=admin.id
    )
    db_session.add(ws)
    await db_session.flush()
    db_session.add(
        WorkspaceMember(
            id=str(uuid4()),
            workspace_id=ws.id,
            developer_id=admin.id,
            role="owner",
            status="active",
            joined_at=datetime.now(timezone.utc),
        )
    )
    await db_session.commit()
    return {"ws": ws, "admin": admin}


# ── Templates ─────────────────────────────────────────────────────────


async def test_every_template_previews_cleanly(db_session):
    summaries = template_summaries()
    assert len(summaries) == len(COMMUNITY_TEMPLATES)
    for summary in summaries:
        assert summary["id"] and summary["name"] and summary["description"]
        assert summary["channels"], f"{summary['id']} has no channels to preview"
        assert summary["post_moderation"] in ("post", "pre")


async def test_applying_a_template_lays_out_channels_and_threads(db_session, env):
    svc = CommunityService(db_session)
    result = await svc.apply_template(
        env["ws"].id, env["admin"].id, "product_support"
    )
    await db_session.commit()

    assert result["channels_created"] == ["Announcements", "Help", "Feature requests"]
    assert result["channels_skipped"] == []
    assert result["topics_created"] == 3
    # Laying out a forum is not publishing one.
    assert result["enabled"] is False

    channels = (
        await db_session.execute(
            select(ChatChannel).where(ChatChannel.workspace_id == env["ws"].id)
        )
    ).scalars().all()
    assert {c.slug for c in channels} == {"announcements", "help", "feature-requests"}
    assert all(c.visibility == "web_public" for c in channels)

    topics = (
        await db_session.execute(
            select(ChatTopic).where(
                ChatTopic.channel_id.in_([c.id for c in channels])
            )
        )
    ).scalars().all()
    assert len(topics) == 3
    assert all(t.slug and t.public_short_id for t in topics), "seeded threads need permalinks"


async def test_applying_twice_skips_rather_than_duplicates(db_session, env):
    svc = CommunityService(db_session)
    await svc.apply_template(env["ws"].id, env["admin"].id, "product_support")
    await db_session.commit()

    again = await svc.apply_template(env["ws"].id, env["admin"].id, "product_support")
    await db_session.commit()

    assert again["channels_created"] == []
    assert again["channels_skipped"] == ["Announcements", "Help", "Feature requests"]
    assert again["topics_created"] == 0

    channels = (
        await db_session.execute(
            select(ChatChannel).where(ChatChannel.workspace_id == env["ws"].id)
        )
    ).scalars().all()
    assert len(channels) == 3, "re-applying created duplicate channels"


async def test_an_existing_general_channel_is_left_alone(db_session, env):
    """The open-source template wants #general; a workspace already has one."""
    existing = ChatChannel(
        id=str(uuid4()),
        workspace_id=env["ws"].id,
        name="General",
        slug="general",
        visibility="workspace",
        kind="channel",
    )
    db_session.add(existing)
    await db_session.commit()

    result = await CommunityService(db_session).apply_template(
        env["ws"].id, env["admin"].id, "open_source"
    )
    await db_session.commit()

    assert "General" in result["channels_skipped"]
    await db_session.refresh(existing)
    assert existing.visibility == "workspace", "an existing channel was published"


async def test_publish_true_is_what_takes_a_community_live(db_session, env):
    result = await CommunityService(db_session).apply_template(
        env["ws"].id, env["admin"].id, "product_support", publish=True
    )
    await db_session.commit()
    assert result["enabled"] is True

    served = await PublicCommunityService(db_session).get_community(
        result["community_slug"]
    )
    assert served is not None


async def test_a_template_carries_its_participation_defaults(db_session, env):
    svc = CommunityService(db_session)
    await svc.apply_template(env["ws"].id, env["admin"].id, "knowledge_base")
    await db_session.commit()

    settings = await svc.get_settings(env["ws"].id)
    # The read-only shape: publish answers now, open replies later.
    assert settings.allow_participation is False
    assert settings.allow_new_topics is False


async def test_an_unknown_template_is_refused(db_session, env):
    with pytest.raises(ValueError):
        await CommunityService(db_session).apply_template(
            env["ws"].id, env["admin"].id, "does_not_exist"
        )


# ── Cross-module links ────────────────────────────────────────────────


async def test_publishing_is_refused_while_the_link_is_off(db_session, env):
    """The default state of every workspace, and the whole point of the flag."""
    await CommunityService(db_session).apply_template(
        env["ws"].id, env["admin"].id, "product_support", publish=True
    )
    await db_session.commit()

    svc = CommunityPublishingService(db_session)
    assert await svc.linked_community(env["ws"].id, "service_desk") is None
    assert await svc.target_channels(env["ws"].id, "service_desk") == []

    channel = (
        await db_session.execute(
            select(ChatChannel).where(ChatChannel.slug == "help")
        )
    ).scalar_one()
    with pytest.raises(PublishingError) as exc:
        await svc.publish(
            env["ws"].id,
            source="service_desk",
            channel_id=channel.id,
            title="How to rotate a key",
            content="From Settings → API tokens.",
            developer_id=env["admin"].id,
        )
    assert exc.value.code == "not_linked"


async def test_publishing_works_once_the_link_is_switched_on(db_session, env):
    community_svc = CommunityService(db_session)
    await community_svc.apply_template(
        env["ws"].id, env["admin"].id, "product_support", publish=True
    )
    await community_svc.upsert_settings(env["ws"].id, link_service_desk=True)
    await db_session.commit()

    svc = CommunityPublishingService(db_session)
    targets = await svc.target_channels(env["ws"].id, "service_desk")
    assert {t["slug"] for t in targets} == {"announcements", "help", "feature-requests"}

    published = await svc.publish(
        env["ws"].id,
        source="service_desk",
        channel_id=next(t["id"] for t in targets if t["slug"] == "help"),
        title="How to rotate a key",
        content="From Settings → API tokens.",
        developer_id=env["admin"].id,
    )
    await db_session.commit()

    assert published["live"] is True
    assert published["path"].startswith(f"/community/{published['community_slug']}/help/")

    topic = await db_session.get(ChatTopic, published["topic_id"])
    assert topic.visibility == "web_public", "published threads must be explicit, not inherited"


async def test_the_two_links_are_independent(db_session, env):
    """Publishing docs must not imply publishing customer ticket traffic."""
    community_svc = CommunityService(db_session)
    await community_svc.upsert_settings(env["ws"].id, link_docs=True)
    await db_session.commit()

    svc = CommunityPublishingService(db_session)
    assert await svc.linked_community(env["ws"].id, "docs") is not None
    assert await svc.linked_community(env["ws"].id, "service_desk") is None


async def test_cannot_publish_into_an_unpublished_channel(db_session, env):
    community_svc = CommunityService(db_session)
    await community_svc.upsert_settings(
        env["ws"].id, enabled=True, link_service_desk=True
    )
    internal = ChatChannel(
        id=str(uuid4()),
        workspace_id=env["ws"].id,
        name="Internal",
        slug="internal",
        visibility="workspace",
        kind="channel",
    )
    db_session.add(internal)
    await db_session.commit()

    with pytest.raises(PublishingError) as exc:
        await CommunityPublishingService(db_session).publish(
            env["ws"].id,
            source="service_desk",
            channel_id=internal.id,
            title="Not for here",
            content="Body",
            developer_id=env["admin"].id,
        )
    assert exc.value.code == "not_public"


async def test_a_community_that_is_not_live_still_accepts_published_threads(
    db_session, env
):
    """"Publish the answers, go live on Monday" is an ordinary way to launch."""
    community_svc = CommunityService(db_session)
    await community_svc.apply_template(
        env["ws"].id, env["admin"].id, "product_support", publish=False
    )
    await community_svc.upsert_settings(env["ws"].id, link_service_desk=True)
    await db_session.commit()

    channel = (
        await db_session.execute(select(ChatChannel).where(ChatChannel.slug == "help"))
    ).scalar_one()
    published = await CommunityPublishingService(db_session).publish(
        env["ws"].id,
        source="service_desk",
        channel_id=channel.id,
        title="An early answer",
        content="Written before launch.",
        developer_id=env["admin"].id,
    )
    await db_session.commit()

    assert published["live"] is False
    # And it genuinely is not served yet.
    assert (
        await PublicCommunityService(db_session).get_community(
            published["community_slug"]
        )
        is None
    )


async def test_reapplying_a_template_keeps_your_participation_choices(db_session, env):
    """The second click adds channels. It must not reset moderation policy."""
    svc = CommunityService(db_session)
    await svc.apply_template(env["ws"].id, env["admin"].id, "product_support")
    await db_session.commit()

    # The operator decides the forum should be read-only after all.
    await svc.upsert_settings(
        env["ws"].id,
        allow_participation=False,
        allow_new_topics=False,
        post_moderation="pre",
    )
    await db_session.commit()

    # …then re-applies a template whose defaults are wide open.
    result = await svc.apply_template(
        env["ws"].id, env["admin"].id, "open_source"
    )
    await db_session.commit()

    assert result["settings_applied"] is False
    settings = await svc.get_settings(env["ws"].id)
    assert settings.allow_participation is False, "re-applying re-opened replies"
    assert settings.allow_new_topics is False
    assert settings.post_moderation == "pre"
    # It still did the thing it was asked to do.
    assert "General" in result["channels_created"]


async def test_the_first_template_does_set_the_defaults(db_session, env):
    svc = CommunityService(db_session)
    result = await svc.apply_template(
        env["ws"].id, env["admin"].id, "product_support"
    )
    await db_session.commit()

    assert result["settings_applied"] is True
    settings = await svc.get_settings(env["ws"].id)
    assert settings.allow_participation is True
    assert settings.allow_new_topics is True


async def test_reserved_channel_slugs_stay_publicly_reachable(db_session, env):
    """A channel called "Members" must not be shadowed by the members route.

    /community/{slug}/search and /community/{slug}/members/… are static segments
    in the frontend router and always beat the dynamic [channelSlug]. A channel
    slugged exactly "search" or "members" would be addressable internally and
    404 publicly, so the slug is nudged at the point it is minted.
    """
    from aexy.services.chat_service import RESERVED_CHANNEL_SLUGS, ChatService

    chat = ChatService(db_session)
    for name in ("Members", "Search"):
        channel = await chat.create_channel(env["ws"].id, env["admin"].id, name)
        await db_session.commit()
        assert channel.slug not in RESERVED_CHANNEL_SLUGS
        # Still recognisably itself — suffixed, not renamed.
        assert channel.slug.startswith(name.lower())
        assert channel.name == name


async def test_ordinary_channel_names_keep_their_plain_slug(db_session, env):
    """The nudge must not fire on names that were never a problem."""
    from aexy.services.chat_service import ChatService

    channel = await ChatService(db_session).create_channel(
        env["ws"].id, env["admin"].id, "Feature requests"
    )
    await db_session.commit()
    assert channel.slug == "feature-requests"
