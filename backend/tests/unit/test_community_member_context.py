"""Authenticated community member-context API.

Exercises ``GET /public/community/{slug}/me`` through the real ASGI stack with a
minted JWT. Proves that a signed-in workspace member sees exactly the internal
(non web-public) threads they're entitled to — and nothing more — while
non-members and anonymous callers are handled without leaking anything.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from jose import jwt

from aexy.core.config import get_settings
from aexy.models.chat import (
    ChatChannel,
    ChatChannelMember,
    ChatTopic,
    ChatTopicAccessGrant,
    WorkspaceCommunity,
)
from aexy.models.developer import Developer
from aexy.models.workspace import Workspace, WorkspaceMember


def _bearer(developer_id: str) -> dict[str, str]:
    settings = get_settings()
    token = jwt.encode(
        {"sub": developer_id}, settings.secret_key, algorithm=settings.algorithm
    )
    return {"Authorization": f"Bearer {token}"}


async def _mk_dev(db, name: str) -> Developer:
    dev = Developer(id=str(uuid4()), name=name, email=f"{name}-{uuid4().hex[:8]}@ex.com")
    db.add(dev)
    await db.flush()
    return dev


@pytest.fixture
async def seeded(db_session):
    """A community with a web-public channel plus internal channels/topics of
    every visibility flavour, and three actors: a workspace member, an admin,
    and an outsider (authenticated but not a member)."""
    member = await _mk_dev(db_session, "Member")
    admin = await _mk_dev(db_session, "Admin")
    outsider = await _mk_dev(db_session, "Outsider")

    ws = Workspace(
        id=str(uuid4()), name="Acme", slug=f"acme-{uuid4().hex[:8]}", owner_id=admin.id
    )
    db_session.add(ws)
    await db_session.flush()

    db_session.add_all([
        WorkspaceMember(
            id=str(uuid4()), workspace_id=ws.id, developer_id=member.id,
            role="member", status="active",
        ),
        WorkspaceMember(
            id=str(uuid4()), workspace_id=ws.id, developer_id=admin.id,
            role="admin", status="active",
        ),
    ])

    community = WorkspaceCommunity(
        workspace_id=ws.id, enabled=True, community_slug=f"acme-{uuid4().hex[:8]}",
        title="Acme Community",
    )
    db_session.add(community)

    now = datetime.now(timezone.utc)

    web_channel = ChatChannel(
        id=str(uuid4()), workspace_id=ws.id, name="general", slug="general",
        visibility="web_public", kind="channel",
    )
    workspace_channel = ChatChannel(
        id=str(uuid4()), workspace_id=ws.id, name="team", slug="team",
        visibility="workspace", kind="channel",
    )
    private_channel = ChatChannel(
        id=str(uuid4()), workspace_id=ws.id, name="founders", slug="founders",
        visibility="private", kind="channel",
    )
    archived_channel = ChatChannel(
        id=str(uuid4()), workspace_id=ws.id, name="old", slug="old",
        visibility="workspace", kind="channel", is_archived=True,
    )
    dm_channel = ChatChannel(
        id=str(uuid4()), workspace_id=ws.id, name="", slug="dm-x",
        visibility="private", kind="dm", dm_key="a:b",
    )
    db_session.add_all(
        [web_channel, workspace_channel, private_channel, archived_channel, dm_channel]
    )
    await db_session.flush()

    # Only `member` (and admin implicitly via ownership elsewhere) joins the
    # private channel; the workspace channel is open to all members.
    db_session.add(
        ChatChannelMember(
            id=str(uuid4()), channel_id=private_channel.id,
            developer_id=member.id, role="member",
        )
    )

    # Topics inside the open workspace channel: a normal one, a private one, a
    # restricted one, and an explicitly web-public one.
    t_open = ChatTopic(
        id=str(uuid4()), channel_id=workspace_channel.id, name="Standup",
        visibility="inherit", slug="standup", public_short_id="s000000001",
        message_count=2, last_message_at=now,
    )
    t_private = ChatTopic(
        id=str(uuid4()), channel_id=workspace_channel.id, name="HushHush",
        visibility="private", slug="hush", public_short_id="s000000002",
    )
    t_restricted = ChatTopic(
        id=str(uuid4()), channel_id=workspace_channel.id, name="Restricted",
        visibility="restricted", slug="restr", public_short_id="s000000003",
    )
    t_webpub = ChatTopic(
        id=str(uuid4()), channel_id=workspace_channel.id, name="Announce",
        visibility="web_public", slug="announce", public_short_id="s000000004",
    )
    # A topic inside the private channel.
    t_founders = ChatTopic(
        id=str(uuid4()), channel_id=private_channel.id, name="Cap table",
        visibility="inherit", slug="cap", public_short_id="s000000005",
    )
    db_session.add_all([t_open, t_private, t_restricted, t_webpub, t_founders])
    await db_session.flush()

    await db_session.commit()

    return {
        "ws": ws, "community": community,
        "member": member, "admin": admin, "outsider": outsider,
        "workspace_channel": workspace_channel, "private_channel": private_channel,
        "t_open": t_open, "t_private": t_private, "t_restricted": t_restricted,
        "t_webpub": t_webpub, "t_founders": t_founders,
    }


def _channels_by_slug(body: dict) -> dict:
    return {c["slug"]: c for c in body["internal_channels"]}


async def test_requires_authentication(client, seeded):
    resp = await client.get(f"/api/v1/public/community/{seeded['community'].community_slug}/me")
    assert resp.status_code == 401


async def test_unknown_community_is_404(client, seeded):
    resp = await client.get(
        "/api/v1/public/community/does-not-exist/me",
        headers=_bearer(seeded["member"].id),
    )
    assert resp.status_code == 404


async def test_non_member_gets_empty_context(client, seeded):
    resp = await client.get(
        f"/api/v1/public/community/{seeded['community'].community_slug}/me",
        headers=_bearer(seeded["outsider"].id),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_member"] is False
    assert body["workspace_id"] is None
    assert body["can_create_thread"] is False
    assert body["can_post_public"] is False
    assert body["internal_channels"] == []


async def test_member_sees_internal_not_webpublic_channels(client, seeded):
    resp = await client.get(
        f"/api/v1/public/community/{seeded['community'].community_slug}/me",
        headers=_bearer(seeded["member"].id),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_member"] is True
    assert body["workspace_id"] == seeded["ws"].id
    assert body["can_create_thread"] is True
    assert body["can_post_public"] is False  # plain member

    channels = _channels_by_slug(body)
    # Internal channels appear; the web-public one, the DM, and the archived one never do.
    assert "team" in channels
    assert "founders" in channels  # member joined it
    assert "general" not in channels
    assert "dm-x" not in channels
    assert "old" not in channels


async def test_topic_visibility_is_enforced(client, seeded):
    resp = await client.get(
        f"/api/v1/public/community/{seeded['community'].community_slug}/me",
        headers=_bearer(seeded["member"].id),
    )
    channels = _channels_by_slug(resp.json())
    team_topics = {t["name"]: t for t in channels["team"]["topics"]}

    # Normal + web-public topics are visible; private/restricted are filtered
    # (member is not a channel member of the open channel, holds no grant).
    assert "Standup" in team_topics
    assert "Announce" in team_topics
    assert "HushHush" not in team_topics
    assert "Restricted" not in team_topics

    # The explicitly web-public topic is flagged so the UI can badge it.
    assert team_topics["Announce"]["is_web_public"] is True
    assert team_topics["Standup"]["is_web_public"] is False


async def test_restricted_topic_visible_with_grant(client, db_session, seeded):
    db_session.add(
        ChatTopicAccessGrant(
            id=str(uuid4()), topic_id=seeded["t_restricted"].id,
            developer_id=seeded["member"].id,
        )
    )
    await db_session.commit()

    resp = await client.get(
        f"/api/v1/public/community/{seeded['community'].community_slug}/me",
        headers=_bearer(seeded["member"].id),
    )
    channels = _channels_by_slug(resp.json())
    names = {t["name"] for t in channels["team"]["topics"]}
    assert "Restricted" in names


async def test_private_channel_hidden_from_non_channel_member(client, seeded):
    # The admin is a workspace member but never joined the private `founders`
    # channel, so it must not appear for them.
    resp = await client.get(
        f"/api/v1/public/community/{seeded['community'].community_slug}/me",
        headers=_bearer(seeded["admin"].id),
    )
    assert resp.status_code == 200
    body = resp.json()
    channels = _channels_by_slug(body)
    assert "founders" not in channels
    # Admins may publish threads publicly.
    assert body["can_post_public"] is True
