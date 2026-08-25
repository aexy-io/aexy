"""Public search, RSS entries, and member profiles — and what they must not leak.

The interesting assertions here are all negative: a private topic, a redacted
message, and a member who chose to be anonymous each have to stay invisible in
every one of these new surfaces, not just in the thread view they were written
for.
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from aexy.models.chat import (
    ChatChannel,
    ChatMessage,
    ChatPublicMemberPref,
    ChatTopic,
    WorkspaceCommunity,
)
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.public_community_service import PublicCommunityService, member_handle


def _msg(topic, channel, sender_id, content, **kw):
    return ChatMessage(
        id=str(uuid4()),
        topic_id=topic.id,
        channel_id=channel.id,
        sender_id=sender_id,
        content=content,
        created_at=kw.pop("created_at", datetime.now(timezone.utc)),
        **kw,
    )


@pytest.fixture
async def env(db_session):
    author = Developer(id=str(uuid4()), name="Ada Byron", email=f"a-{uuid4().hex[:8]}@ex.com")
    shy = Developer(id=str(uuid4()), name="Shy Person", email=f"s-{uuid4().hex[:8]}@ex.com")
    db_session.add_all([author, shy])
    await db_session.flush()

    ws = Workspace(
        id=str(uuid4()), name="WS", slug=f"ws-{uuid4().hex[:8]}", owner_id=author.id
    )
    db_session.add(ws)
    await db_session.flush()
    db_session.add_all(
        [
            WorkspaceMember(
                id=str(uuid4()),
                workspace_id=ws.id,
                developer_id=author.id,
                role="owner",
                status="active",
                joined_at=datetime.now(timezone.utc),
            ),
            WorkspaceMember(
                id=str(uuid4()),
                workspace_id=ws.id,
                developer_id=shy.id,
                role="community",
                status="active",
                joined_at=datetime.now(timezone.utc),
            ),
        ]
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

    public = ChatTopic(
        id=str(uuid4()),
        channel_id=channel.id,
        name="Rotating an API key",
        slug="rotating-an-api-key",
        public_short_id="pub1234567",
        message_count=2,
        last_message_at=datetime.now(timezone.utc),
        created_by_id=author.id,
    )
    private = ChatTopic(
        id=str(uuid4()),
        channel_id=channel.id,
        name="Internal API key incident",
        slug="internal-api-key-incident",
        public_short_id="prv1234567",
        visibility="private",
        message_count=1,
        created_by_id=author.id,
    )
    db_session.add_all([public, private])
    await db_session.flush()

    db_session.add_all(
        [
            _msg(public, channel, author.id, "You rotate it from Settings → API tokens."),
            _msg(public, channel, shy.id, "That worked, thank you."),
            _msg(private, channel, author.id, "The leaked key was in a paste bin."),
            _msg(
                public,
                channel,
                author.id,
                "Redacted content about pastebin",
                hidden_from_public=True,
            ),
        ]
    )
    await db_session.commit()
    return {
        "ws": ws,
        "community": community,
        "channel": channel,
        "public": public,
        "private": private,
        "author": author,
        "shy": shy,
    }


# ── Search ────────────────────────────────────────────────────────────


async def test_search_matches_titles_and_bodies(db_session, env):
    svc = PublicCommunityService(db_session)

    by_title, total_title = await svc.search(env["ws"].id, "rotating")
    assert total_title == 1 and by_title[0]["name"] == "Rotating an API key"

    by_body, total_body = await svc.search(env["ws"].id, "API tokens")
    assert total_body == 1
    assert "Settings" in (by_body[0]["snippet"] or "")


async def test_search_never_returns_private_or_redacted(db_session, env):
    svc = PublicCommunityService(db_session)

    hits, total = await svc.search(env["ws"].id, "pastebin")
    assert total == 0, "search reached a private topic or a redacted message"

    hits, total = await svc.search(env["ws"].id, "incident")
    assert total == 0, "a private topic's title was searchable"


async def test_search_respects_the_history_cutoff(db_session, env):
    """A channel published today must not become searchable back to its start."""
    env["channel"].web_public_since = datetime.now(timezone.utc) + timedelta(days=1)
    await db_session.commit()

    svc = PublicCommunityService(db_session)
    _hits, total = await svc.search(env["ws"].id, "API tokens")
    assert total == 0


async def test_search_treats_wildcards_as_literal_text(db_session, env):
    """``%`` is a character somebody typed, not "match everything"."""
    svc = PublicCommunityService(db_session)
    _hits, total = await svc.search(env["ws"].id, "%")
    assert total == 0


async def test_short_queries_return_nothing_rather_than_everything(db_session, env):
    svc = PublicCommunityService(db_session)
    assert await svc.search(env["ws"].id, "") == ([], 0)
    assert await svc.search(env["ws"].id, "a") == ([], 0)


# ── Feeds ─────────────────────────────────────────────────────────────


async def test_feed_lists_public_threads_only(db_session, env):
    entries = await PublicCommunityService(db_session).feed_entries(env["ws"].id)
    titles = [e["title"] for e in entries]
    assert "Rotating an API key" in titles
    assert "Internal API key incident" not in titles


# ── Member profiles ───────────────────────────────────────────────────


async def test_profile_resolves_from_the_author_handle(db_session, env):
    svc = PublicCommunityService(db_session)
    messages, _total = await svc.list_public_messages(env["channel"], env["public"])
    handle = messages[0]["author_handle"]
    assert handle

    profile = await svc.get_member_profile(env["ws"].id, handle)
    assert profile is not None
    assert profile["display_name"] == "Ada Byron"
    assert profile["topic_count"] == 1
    # Two public posts by Ada; the redacted third must not be counted.
    assert profile["message_count"] == 1
    assert [t["name"] for t in profile["topics"]] == ["Rotating an API key"]


async def test_anonymous_members_have_no_handle_and_no_profile(db_session, env):
    db_session.add(
        ChatPublicMemberPref(
            id=str(uuid4()),
            workspace_id=env["ws"].id,
            developer_id=env["shy"].id,
            public_display="anonymous",
        )
    )
    await db_session.commit()

    svc = PublicCommunityService(db_session)
    messages, _total = await svc.list_public_messages(env["channel"], env["public"])
    anon = next(m for m in messages if m["author"] == "Community member")
    assert anon["author_handle"] is None, "an anonymous post linked to a profile"

    # And the handle they *would* have had resolves to nothing.
    assert (
        await svc.get_member_profile(
            env["ws"].id, member_handle(env["ws"].id, env["shy"].id)
        )
        is None
    )


async def test_handles_differ_between_communities(db_session, env):
    """One forum's handle must not identify the same person in another."""
    other_workspace = str(uuid4())
    assert member_handle(env["ws"].id, env["author"].id) != member_handle(
        other_workspace, env["author"].id
    )


async def test_unknown_handle_is_not_a_profile(db_session, env):
    svc = PublicCommunityService(db_session)
    assert await svc.get_member_profile(env["ws"].id, "deadbeefcafe") is None
