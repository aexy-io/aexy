"""Outsider-opened threads — the switch, the guards, and the moderation hold.

Service-level, on SQLite. Rate limiting goes through Redis and fails open when
Redis is absent, so it does not interfere here.

The test that matters most is the pre-moderation one: holding only the first
*message* of a new thread would still publish the thread's *title*, which is the
part a spammer wants published.
"""

from uuid import uuid4

import pytest
from sqlalchemy import select

from aexy.models.chat import ChatChannel, ChatTopic, WorkspaceCommunity
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace
from aexy.services.community_participation_service import (
    CommunityParticipationService,
    ParticipationError,
)
from aexy.services.public_community_service import PublicCommunityService


@pytest.fixture
async def env(db_session):
    owner = Developer(id=str(uuid4()), name="Owner", email=f"o-{uuid4().hex[:8]}@ex.com")
    outsider = Developer(
        id=str(uuid4()), name="Outsider", email=f"x-{uuid4().hex[:8]}@ex.com"
    )
    db_session.add_all([owner, outsider])
    await db_session.flush()

    ws = Workspace(
        id=str(uuid4()), name="WS", slug=f"ws-{uuid4().hex[:8]}", owner_id=owner.id
    )
    db_session.add(ws)
    await db_session.flush()

    community = WorkspaceCommunity(
        workspace_id=ws.id,
        enabled=True,
        community_slug=f"c-{uuid4().hex[:8]}",
        allow_participation=True,
        allow_new_topics=True,
        post_moderation="post",
    )
    channel = ChatChannel(
        id=str(uuid4()),
        workspace_id=ws.id,
        name="help",
        slug="help",
        visibility="web_public",
        kind="channel",
    )
    db_session.add_all([community, channel])
    await db_session.commit()
    return {
        "ws": ws,
        "community": community,
        "channel": channel,
        "owner": owner,
        "outsider": outsider,
    }


async def test_new_thread_is_public_and_readable(db_session, env):
    svc = CommunityParticipationService(db_session)
    result = await svc.create_topic(
        env["community"],
        env["channel"],
        env["outsider"].id,
        "How do I rotate an API key?",
        "The docs mention rotation but not where the button is.",
    )
    await db_session.commit()

    assert result["pending_review"] is False
    assert result["path"] and result["path"].startswith("/help/")

    read = PublicCommunityService(db_session)
    topics, total = await read.list_public_topics(env["channel"])
    assert total == 1
    assert topics[0]["name"] == "How do I rotate an API key?"

    topic = await db_session.get(ChatTopic, result["topic_id"])
    messages, count = await read.list_public_messages(env["channel"], topic)
    assert count == 1
    assert "rotation" in messages[0]["content"]


async def test_new_threads_off_by_default(db_session, env):
    """``allow_new_topics`` is its own switch, not implied by participation."""
    env["community"].allow_new_topics = False
    await db_session.commit()

    svc = CommunityParticipationService(db_session)
    with pytest.raises(ParticipationError) as exc:
        await svc.create_topic(
            env["community"], env["channel"], env["outsider"].id, "Hello", "Anyone?"
        )
    assert exc.value.code == "disabled"


async def test_new_thread_needs_participation_too(db_session, env):
    env["community"].allow_participation = False
    await db_session.commit()

    svc = CommunityParticipationService(db_session)
    with pytest.raises(ParticipationError) as exc:
        await svc.create_topic(
            env["community"], env["channel"], env["outsider"].id, "Hello", "Anyone?"
        )
    assert exc.value.code == "disabled"


async def test_cannot_open_a_thread_in_an_unpublished_channel(db_session, env):
    """A workspace-only channel is not a place an outsider may start anything."""
    internal = ChatChannel(
        id=str(uuid4()),
        workspace_id=env["ws"].id,
        name="internal",
        slug="internal",
        visibility="workspace",
        kind="channel",
    )
    db_session.add(internal)
    await db_session.commit()

    svc = CommunityParticipationService(db_session)
    with pytest.raises(ParticipationError) as exc:
        await svc.create_topic(
            env["community"], internal, env["outsider"].id, "Sneaking in", "Hello?"
        )
    assert exc.value.code == "not_public"


async def test_pre_moderation_hides_the_whole_thread(db_session, env):
    """Held means held: the title must not be public before approval either."""
    env["community"].post_moderation = "pre"
    await db_session.commit()

    svc = CommunityParticipationService(db_session)
    result = await svc.create_topic(
        env["community"],
        env["channel"],
        env["outsider"].id,
        "Buy cheap watches",
        "Follow this link.",
    )
    await db_session.commit()

    assert result["pending_review"] is True
    # No public URL is offered for something that has no public page yet.
    assert result["path"] is None

    read = PublicCommunityService(db_session)
    topics, total = await read.list_public_topics(env["channel"])
    assert total == 0, "a held thread's title leaked into the public listing"

    hits, hit_total = await read.search(env["ws"].id, "watches")
    assert hit_total == 0, "a held thread was searchable before approval"


async def test_approving_the_opener_publishes_the_thread(db_session, env):
    env["community"].post_moderation = "pre"
    await db_session.commit()

    svc = CommunityParticipationService(db_session)
    result = await svc.create_topic(
        env["community"],
        env["channel"],
        env["outsider"].id,
        "Is there a webhook for this?",
        "I want to react to new tickets.",
    )
    await db_session.commit()

    assert await svc.approve(env["ws"].id, result["id"]) is True
    await db_session.commit()

    read = PublicCommunityService(db_session)
    topics, total = await read.list_public_topics(env["channel"])
    assert total == 1
    assert topics[0]["name"] == "Is there a webhook for this?"
    assert topics[0]["message_count"] == 1


async def test_rejecting_the_opener_removes_the_thread(db_session, env):
    env["community"].post_moderation = "pre"
    await db_session.commit()

    svc = CommunityParticipationService(db_session)
    result = await svc.create_topic(
        env["community"], env["channel"], env["outsider"].id, "Spam title", "Spam body"
    )
    await db_session.commit()

    assert await svc.reject(env["ws"].id, result["id"]) is True
    await db_session.commit()

    remaining = (
        await db_session.execute(
            select(ChatTopic).where(ChatTopic.id == result["topic_id"])
        )
    ).scalar_one_or_none()
    assert remaining is None, "rejecting a thread's only post left the thread behind"


async def test_rejecting_an_opener_keeps_a_thread_that_has_answers(db_session, env):
    """A week-late rejection must not take the answers down with the question."""
    env["community"].post_moderation = "pre"
    await db_session.commit()

    svc = CommunityParticipationService(db_session)
    result = await svc.create_topic(
        env["community"], env["channel"], env["outsider"].id, "Borderline", "Hmm"
    )
    await db_session.commit()

    topic = await db_session.get(ChatTopic, result["topic_id"])
    # Somebody answers before the moderator gets round to the opener.
    topic.visibility = "web_public"
    env["community"].post_moderation = "post"
    await db_session.commit()
    await svc.post_reply(
        env["community"], env["channel"], topic, env["owner"].id, "Here's the answer."
    )
    await db_session.commit()

    assert await svc.reject(env["ws"].id, result["id"]) is True
    await db_session.commit()

    still_there = await db_session.get(ChatTopic, result["topic_id"])
    assert still_there is not None, "rejecting one post deleted a thread with answers"


async def test_opening_a_thread_does_not_grant_channel_membership(db_session, env):
    """Asking a question must not make somebody a member of an internal channel."""
    from aexy.models.chat import ChatChannelMember

    svc = CommunityParticipationService(db_session)
    await svc.create_topic(
        env["community"], env["channel"], env["outsider"].id, "A question", "Body"
    )
    await db_session.commit()

    memberships = (
        await db_session.execute(
            select(ChatChannelMember).where(
                ChatChannelMember.developer_id == env["outsider"].id
            )
        )
    ).scalars().all()
    assert memberships == []


async def test_the_team_hears_about_a_new_public_thread(db_session, env):
    """A forum nobody is notified about is a room nobody is listening in."""
    from aexy.models.chat import ChatChannelMember
    from aexy.models.notification import Notification

    db_session.add(
        ChatChannelMember(
            id=str(uuid4()),
            channel_id=env["channel"].id,
            developer_id=env["owner"].id,
            role="owner",
        )
    )
    await db_session.commit()

    svc = CommunityParticipationService(db_session)
    await svc.create_topic(
        env["community"],
        env["channel"],
        env["outsider"].id,
        "Is anybody there?",
        "Asking a question.",
    )
    await db_session.commit()

    notifications = (
        await db_session.execute(select(Notification))
    ).scalars().all()
    assert [n.recipient_id for n in notifications] == [env["owner"].id]
    assert notifications[0].event_type == "community_topic"
    # The link goes to the public thread, not to an internal chat URL.
    assert notifications[0].context["action_url"].startswith(
        f"/community/{env['community'].community_slug}/help/"
    )


async def test_the_poster_is_not_notified_about_their_own_post(db_session, env):
    from aexy.models.chat import ChatChannelMember
    from aexy.models.notification import Notification

    db_session.add(
        ChatChannelMember(
            id=str(uuid4()),
            channel_id=env["channel"].id,
            developer_id=env["outsider"].id,
            role="member",
        )
    )
    await db_session.commit()

    svc = CommunityParticipationService(db_session)
    await svc.create_topic(
        env["community"], env["channel"], env["outsider"].id, "Only me here", "Hello"
    )
    await db_session.commit()

    notifications = (await db_session.execute(select(Notification))).scalars().all()
    assert notifications == []


async def test_a_held_post_notifies_about_the_review_queue(db_session, env):
    from aexy.models.chat import ChatChannelMember
    from aexy.models.notification import Notification

    env["community"].post_moderation = "pre"
    db_session.add(
        ChatChannelMember(
            id=str(uuid4()),
            channel_id=env["channel"].id,
            developer_id=env["owner"].id,
            role="owner",
        )
    )
    await db_session.commit()

    svc = CommunityParticipationService(db_session)
    await svc.create_topic(
        env["community"], env["channel"], env["outsider"].id, "Held thread", "Body"
    )
    await db_session.commit()

    notification = (await db_session.execute(select(Notification))).scalars().one()
    assert notification.event_type == "community_pending_review"
    # Pointing at a thread that has no public page yet would be a 404.
    assert notification.context["action_url"] == "/settings/community"


async def test_the_queue_says_which_pending_posts_open_a_thread(db_session, env):
    """A moderator rejecting an opener removes a thread, so they must be told."""
    env["community"].post_moderation = "pre"
    await db_session.commit()

    svc = CommunityParticipationService(db_session)
    opener = await svc.create_topic(
        env["community"], env["channel"], env["outsider"].id, "A held thread", "Body"
    )
    await db_session.commit()

    # A held reply on an already-public thread, for contrast.
    public = ChatTopic(
        id=str(uuid4()),
        channel_id=env["channel"].id,
        name="Already public",
        slug="already-public",
        public_short_id="pub7654321",
    )
    db_session.add(public)
    await db_session.commit()
    reply = await svc.post_reply(
        env["community"], env["channel"], public, env["outsider"].id, "A held reply"
    )
    await db_session.commit()

    queue = {row["id"]: row for row in await svc.list_pending(env["ws"].id)}
    assert queue[opener["id"]]["is_thread_opener"] is True
    assert queue[reply["id"]]["is_thread_opener"] is False
