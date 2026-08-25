"""Reactions and accepted answers on public threads.

Both are small features with one sharp edge each: a reaction must be idempotent
(a second tap removes rather than doubles), and accepting an answer must be
limited to the person who asked and the workspace's admins — otherwise a
passer-by decides what counts as the answer on somebody else's question.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from aexy.models.chat import (
    ChatChannel,
    ChatMessage,
    ChatMessageReaction,
    ChatTopic,
    WorkspaceCommunity,
)
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.community_participation_service import (
    CommunityParticipationService,
    ParticipationError,
)
from aexy.services.public_community_service import PublicCommunityService


@pytest.fixture
async def env(db_session):
    admin = Developer(id=str(uuid4()), name="Admin", email=f"ad-{uuid4().hex[:8]}@ex.com")
    asker = Developer(id=str(uuid4()), name="Asker", email=f"as-{uuid4().hex[:8]}@ex.com")
    passerby = Developer(id=str(uuid4()), name="Passer", email=f"p-{uuid4().hex[:8]}@ex.com")
    db_session.add_all([admin, asker, passerby])
    await db_session.flush()

    ws = Workspace(
        id=str(uuid4()), name="WS", slug=f"ws-{uuid4().hex[:8]}", owner_id=admin.id
    )
    db_session.add(ws)
    await db_session.flush()
    db_session.add(
        WorkspaceMember(
            id=str(uuid4()),
            workspace_id=ws.id,
            developer_id=admin.id,
            role="admin",
            status="active",
            joined_at=datetime.now(timezone.utc),
        )
    )

    community = WorkspaceCommunity(
        workspace_id=ws.id,
        enabled=True,
        community_slug=f"c-{uuid4().hex[:8]}",
        allow_participation=True,
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
    await db_session.flush()

    topic = ChatTopic(
        id=str(uuid4()),
        channel_id=channel.id,
        name="Why is this slow?",
        slug="why-is-this-slow",
        public_short_id="abc1234567",
        message_count=2,
        created_by_id=asker.id,
        last_message_at=datetime.now(timezone.utc),
    )
    db_session.add(topic)
    await db_session.flush()

    question = ChatMessage(
        id=str(uuid4()),
        topic_id=topic.id,
        channel_id=channel.id,
        sender_id=asker.id,
        content="Every request takes two seconds.",
        created_at=datetime.now(timezone.utc),
    )
    answer = ChatMessage(
        id=str(uuid4()),
        topic_id=topic.id,
        channel_id=channel.id,
        sender_id=admin.id,
        content="You are missing an index on the join column.",
        created_at=datetime.now(timezone.utc),
    )
    db_session.add_all([question, answer])
    await db_session.commit()
    return {
        "ws": ws,
        "community": community,
        "channel": channel,
        "topic": topic,
        "question": question,
        "answer": answer,
        "admin": admin,
        "asker": asker,
        "passerby": passerby,
    }


# ── Reactions ─────────────────────────────────────────────────────────


async def test_reacting_twice_removes_the_reaction(db_session, env):
    svc = CommunityParticipationService(db_session)

    added = await svc.toggle_reaction(
        env["community"], env["channel"], env["topic"], env["answer"].id,
        env["passerby"].id, "👍",
    )
    await db_session.commit()
    assert added == {"emoji": "👍", "count": 1, "mine": True}

    removed = await svc.toggle_reaction(
        env["community"], env["channel"], env["topic"], env["answer"].id,
        env["passerby"].id, "👍",
    )
    await db_session.commit()
    assert removed == {"emoji": "👍", "count": 0, "mine": False}

    left = (await db_session.execute(
        __import__("sqlalchemy").select(ChatMessageReaction)
    )).scalars().all()
    assert left == []


async def test_reaction_counts_appear_in_the_public_thread(db_session, env):
    svc = CommunityParticipationService(db_session)
    for who in (env["passerby"].id, env["asker"].id):
        await svc.toggle_reaction(
            env["community"], env["channel"], env["topic"], env["answer"].id, who, "👍"
        )
    await db_session.commit()

    messages, _total = await PublicCommunityService(db_session).list_public_messages(
        env["channel"], env["topic"]
    )
    answer = next(m for m in messages if m["id"] == env["answer"].id)
    assert answer["reactions"] == [{"emoji": "👍", "count": 2, "mine": False}]


async def test_the_shared_thread_payload_never_carries_mine(db_session, env):
    """It is cached and served to everyone, so it cannot hold per-viewer state."""
    svc = CommunityParticipationService(db_session)
    await svc.toggle_reaction(
        env["community"], env["channel"], env["topic"], env["answer"].id,
        env["passerby"].id, "👍",
    )
    await db_session.commit()

    read = PublicCommunityService(db_session)
    messages, _total = await read.list_public_messages(env["channel"], env["topic"])
    answer = next(m for m in messages if m["id"] == env["answer"].id)
    assert answer["reactions"][0]["mine"] is False

    # The per-viewer half is a separate call.
    mine = await read.my_reactions(env["topic"].id, env["passerby"].id)
    assert mine == {env["answer"].id: ["👍"]}


async def test_only_allow_listed_emoji(db_session, env):
    svc = CommunityParticipationService(db_session)
    with pytest.raises(ParticipationError) as exc:
        await svc.toggle_reaction(
            env["community"], env["channel"], env["topic"], env["answer"].id,
            env["passerby"].id, "<script>",
        )
    assert exc.value.code == "invalid_emoji"


async def test_cannot_react_to_a_message_in_another_thread(db_session, env):
    other = ChatTopic(
        id=str(uuid4()),
        channel_id=env["channel"].id,
        name="Other",
        slug="other",
        public_short_id="oth1234567",
    )
    db_session.add(other)
    await db_session.commit()

    svc = CommunityParticipationService(db_session)
    with pytest.raises(ParticipationError) as exc:
        await svc.toggle_reaction(
            env["community"], env["channel"], other, env["answer"].id,
            env["passerby"].id, "👍",
        )
    assert exc.value.code == "not_found"


# ── Accepted answers ──────────────────────────────────────────────────


async def test_the_asker_can_accept_an_answer(db_session, env):
    svc = CommunityParticipationService(db_session)
    result = await svc.set_accepted_answer(
        env["community"], env["channel"], env["topic"], env["asker"].id,
        env["answer"].id,
    )
    await db_session.commit()
    assert result["accepted_message_id"] == env["answer"].id
    assert env["topic"].is_resolved is True

    read = PublicCommunityService(db_session)
    messages, _total = await read.list_public_messages(env["channel"], env["topic"])
    assert [m["is_accepted"] for m in messages] == [False, True]

    topics, _total = await read.list_public_topics(env["channel"])
    assert topics[0]["is_answered"] is True


async def test_an_admin_can_accept_an_answer(db_session, env):
    svc = CommunityParticipationService(db_session)
    result = await svc.set_accepted_answer(
        env["community"], env["channel"], env["topic"], env["admin"].id,
        env["answer"].id,
    )
    await db_session.commit()
    assert result["accepted_message_id"] == env["answer"].id


async def test_a_passer_by_cannot_accept_an_answer(db_session, env):
    svc = CommunityParticipationService(db_session)
    with pytest.raises(ParticipationError) as exc:
        await svc.set_accepted_answer(
            env["community"], env["channel"], env["topic"], env["passerby"].id,
            env["answer"].id,
        )
    assert exc.value.code == "forbidden"


async def test_accepting_a_message_from_another_thread_is_refused(db_session, env):
    """The column carries no foreign key, so this check is the only guard."""
    other = ChatTopic(
        id=str(uuid4()),
        channel_id=env["channel"].id,
        name="Elsewhere",
        slug="elsewhere",
        public_short_id="els1234567",
        created_by_id=env["asker"].id,
    )
    db_session.add(other)
    await db_session.flush()
    stranger = ChatMessage(
        id=str(uuid4()),
        topic_id=other.id,
        channel_id=env["channel"].id,
        sender_id=env["admin"].id,
        content="Unrelated",
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(stranger)
    await db_session.commit()

    svc = CommunityParticipationService(db_session)
    with pytest.raises(ParticipationError) as exc:
        await svc.set_accepted_answer(
            env["community"], env["channel"], env["topic"], env["asker"].id, stranger.id
        )
    assert exc.value.code == "not_found"


async def test_the_mark_can_be_cleared(db_session, env):
    svc = CommunityParticipationService(db_session)
    await svc.set_accepted_answer(
        env["community"], env["channel"], env["topic"], env["asker"].id, env["answer"].id
    )
    await db_session.commit()

    cleared = await svc.set_accepted_answer(
        env["community"], env["channel"], env["topic"], env["asker"].id, None
    )
    await db_session.commit()
    assert cleared["accepted_message_id"] is None
    assert env["topic"].is_resolved is False
