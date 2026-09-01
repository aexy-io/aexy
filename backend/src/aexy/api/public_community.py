"""Public Community API — no authentication required.

Anonymous, read-only, crawlable view of a workspace's opt-in community forum,
addressed by ``community_slug`` (``/public/community/{community_slug}``). Only
web-public channels/topics/messages are ever served; the
``PublicCommunityService`` enforces that with SQL predicates so nothing leaks.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.chat import ChatChannel, ChatTopic, WorkspaceCommunity
from aexy.models.developer import Developer
from aexy.schemas.chat import (
    CommunityMemberContextResponse,
    PublicChannelResponse,
    PublicCommunityChannel,
    PublicCommunityResponse,
    PublicDirectoryItem,
    PublicDirectoryResponse,
    PublicMemberProfile,
    PublicMessage,
    PublicReactionCreate,
    PublicReplyCreate,
    PublicSearchHit,
    PublicSearchResponse,
    PublicTopicCreate,
    PublicTopicResponse,
    PublicTopicSummary,
    TopicAcceptedAnswerUpdate,
)
from aexy.services.community_member_service import CommunityMemberService
from aexy.services.community_participation_service import (
    CommunityParticipationService,
    ParticipationError,
)
from aexy.services.public_community_service import PublicCommunityService

router = APIRouter(
    prefix="/public/community",
    tags=["Public Community"],
)


def _client_ip(request: Request) -> str:
    """Caller's address, for the one endpoint that rate-limits anonymous work.

    First hop of X-Forwarded-For when a proxy set it, else the socket peer —
    the same shape used by the other public routers in this codebase.
    """
    forwarded = request.headers.get("x-forwarded-for") if request.headers else None
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _split_topic_param(topic_param: str) -> tuple[str, str]:
    """Split ``{slug}-{shortId}`` into (slug, short_id).

    The slug may itself contain hyphens; the short id is the trailing hex chunk,
    so we split on the last hyphen.
    """
    slug, sep, short_id = topic_param.rpartition("-")
    if not sep or not slug or not short_id:
        raise HTTPException(status_code=404, detail="Topic not found")
    return slug, short_id


@router.get("", response_model=PublicDirectoryResponse)
async def list_directory(db: AsyncSession = Depends(get_db)) -> PublicDirectoryResponse:
    """Public directory of communities that opted in (enabled AND listed)."""
    service = PublicCommunityService(db)
    items = await service.list_directory()
    return PublicDirectoryResponse(
        communities=[PublicDirectoryItem(**i) for i in items]
    )


@router.get("/{community_slug}", response_model=PublicCommunityResponse)
async def get_community(community_slug: str, db: AsyncSession = Depends(get_db)) -> PublicCommunityResponse:
    service = PublicCommunityService(db)
    community = await service.get_community(community_slug)
    if community is None:
        raise HTTPException(status_code=404, detail="Community not found")

    channels = await service.list_public_channels(community.workspace_id)
    return PublicCommunityResponse(
        community_slug=community.community_slug,
        title=community.title,
        description=community.description,
        logo_url=community.logo_url,
        theme=community.theme or {},
        noindex=community.noindex,
        allow_participation=community.allow_participation,
        allow_new_topics=community.allow_new_topics,
        channels=[PublicCommunityChannel(**c) for c in channels],
    )


@router.get("/{community_slug}/me", response_model=CommunityMemberContextResponse)
async def get_member_context(
    community_slug: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> CommunityMemberContextResponse:
    """Signed-in view of a community: whether the caller is a workspace member,
    what they may do, and the internal (non web-public) threads they can access.

    Authenticated but membership-agnostic — a non-member gets an
    ``is_member=false`` payload with no internal data, so the client can offer a
    "start your own community" CTA without a 403 round-trip.
    """
    service = CommunityMemberService(db)
    context = await service.get_context(community_slug, str(current_user.id))
    if context is None:
        raise HTTPException(status_code=404, detail="Community not found")
    return CommunityMemberContextResponse(**context)


@router.get("/{community_slug}/channels/{channel_slug}", response_model=PublicChannelResponse)
async def get_channel(
    community_slug: str,
    channel_slug: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> PublicChannelResponse:
    service = PublicCommunityService(db)
    community = await service.get_community(community_slug)
    if community is None:
        raise HTTPException(status_code=404, detail="Community not found")

    channel = await service.get_public_channel(community.workspace_id, channel_slug)
    if channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")

    topics, total = await service.list_public_topics(channel, limit=limit, offset=offset)
    # A channel with no web-public topics is not itself public.
    if total == 0:
        raise HTTPException(status_code=404, detail="Channel not found")

    return PublicChannelResponse(
        slug=channel.slug,
        name=channel.name,
        description=channel.description,
        topics=[PublicTopicSummary(**t) for t in topics],
        total=total,
    )


@router.get(
    "/{community_slug}/channels/{channel_slug}/topics/{topic_param}",
    response_model=PublicTopicResponse,
)
async def get_topic(
    community_slug: str,
    channel_slug: str,
    topic_param: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> PublicTopicResponse:
    slug, short_id = _split_topic_param(topic_param)
    service = PublicCommunityService(db)
    community = await service.get_community(community_slug)
    if community is None:
        raise HTTPException(status_code=404, detail="Community not found")

    channel = await service.get_public_channel(community.workspace_id, channel_slug)
    if channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")

    topic = await service.get_public_topic(channel, slug, short_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")

    messages, total = await service.list_public_messages(
        channel, topic, limit=limit, offset=offset
    )
    return PublicTopicResponse(
        channel_slug=channel.slug,
        channel_name=channel.name,
        topic_slug=topic.slug,
        short_id=topic.public_short_id,
        name=topic.name,
        messages=[PublicMessage(**m) for m in messages],
        total=total,
        allow_participation=community.allow_participation,
        accepted_message_id=topic.accepted_message_id,
    )


@router.get("/{community_slug}/sitemap")
async def get_sitemap(community_slug: str, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Machine-readable index of public paths for the frontend sitemap route."""
    service = PublicCommunityService(db)
    community = await service.get_community(community_slug)
    if community is None:
        raise HTTPException(status_code=404, detail="Community not found")
    entries = await service.sitemap_entries(community.workspace_id)
    return {
        "community_slug": community.community_slug,
        "noindex": community.noindex,
        "entries": entries,
    }


_ERROR_STATUS = {
    "empty": 400,
    "too_long": 400,
    "invalid_emoji": 400,
    "disabled": 403,
    "not_public": 403,
    "forbidden": 403,
    "not_found": 404,
    "rate_limited": 429,
}


@router.post(
    "/{community_slug}/channels/{channel_slug}/topics/{topic_param}/replies",
    status_code=201,
)
async def post_reply(
    community_slug: str,
    channel_slug: str,
    topic_param: str,
    data: PublicReplyCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Post a reply to a web-public topic as an authenticated participant.

    Requires a valid Aexy login (any Developer) — this is how outside people
    join the conversation after signing in. Participation must be enabled on the
    community; posts are rate-limited and may be held for moderation.
    """
    slug, short_id = _split_topic_param(topic_param)
    read = PublicCommunityService(db)
    community = await read.get_community(community_slug)
    if community is None:
        raise HTTPException(status_code=404, detail="Community not found")
    channel = await read.get_public_channel(community.workspace_id, channel_slug)
    if channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    topic = await read.get_public_topic(channel, slug, short_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")

    participation = CommunityParticipationService(db)
    try:
        result = await participation.post_reply(
            community, channel, topic, str(current_user.id), data.content
        )
    except ParticipationError as e:
        raise HTTPException(status_code=_ERROR_STATUS.get(e.code, 400), detail=e.message)
    await db.commit()
    return result


# ── Search, feeds, and profiles (anonymous) ──────────────────────────


@router.get("/{community_slug}/search", response_model=PublicSearchResponse)
async def search_community(
    request: Request,
    community_slug: str,
    q: str = Query("", max_length=200),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> PublicSearchResponse:
    """Search this community's public threads.

    A short or empty query returns nothing rather than everything — "" would
    otherwise match every thread in the forum and read as a broken page.

    The only anonymous endpoint here that runs a query instead of serving a
    cached page, so the only one with a per-IP budget.
    """
    service = PublicCommunityService(db)
    community = await service.get_community(community_slug)
    if community is None:
        raise HTTPException(status_code=404, detail="Community not found")

    if not await CommunityParticipationService(db).search_rate_ok(
        community_slug, _client_ip(request)
    ):
        raise HTTPException(status_code=429, detail="Too many searches — slow down")

    hits, total = await service.search(
        community.workspace_id, q, limit=limit, offset=offset
    )
    return PublicSearchResponse(
        query=q.strip(), hits=[PublicSearchHit(**h) for h in hits], total=total
    )


@router.get("/{community_slug}/members/{handle}", response_model=PublicMemberProfile)
async def get_member_profile(
    community_slug: str, handle: str, db: AsyncSession = Depends(get_db)
) -> PublicMemberProfile:
    """Public profile behind an author handle.

    404 — not an empty profile — when the member posts anonymously. The absence
    of the page is what makes the anonymity hold.
    """
    service = PublicCommunityService(db)
    community = await service.get_community(community_slug)
    if community is None:
        raise HTTPException(status_code=404, detail="Community not found")

    profile = await service.get_member_profile(community.workspace_id, handle)
    if profile is None:
        raise HTTPException(status_code=404, detail="Member not found")
    return PublicMemberProfile(**profile)


@router.get("/{community_slug}/feed")
async def get_feed(
    community_slug: str,
    channel: str | None = Query(None),
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Newest public threads, for the frontend's RSS route to render."""
    service = PublicCommunityService(db)
    community = await service.get_community(community_slug)
    if community is None:
        raise HTTPException(status_code=404, detail="Community not found")
    entries = await service.feed_entries(
        community.workspace_id, channel_slug=channel, limit=limit
    )
    return {
        "community_slug": community.community_slug,
        "title": community.title,
        "description": community.description,
        "noindex": community.noindex,
        "entries": entries,
    }


# ── Participation (authenticated) ────────────────────────────────────


async def _resolve_topic(
    db: AsyncSession, community_slug: str, channel_slug: str, topic_param: str
) -> tuple[WorkspaceCommunity, ChatChannel, ChatTopic]:
    """Community + channel + topic for a public path, or the right 404."""
    slug, short_id = _split_topic_param(topic_param)
    read = PublicCommunityService(db)
    community = await read.get_community(community_slug)
    if community is None:
        raise HTTPException(status_code=404, detail="Community not found")
    channel = await read.get_public_channel(community.workspace_id, channel_slug)
    if channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    topic = await read.get_public_topic(channel, slug, short_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found")
    return community, channel, topic


@router.post("/{community_slug}/channels/{channel_slug}/topics", status_code=201)
async def create_topic(
    community_slug: str,
    channel_slug: str,
    data: PublicTopicCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Start a new thread in a public channel as a signed-in visitor.

    Gated by the community's own ``allow_new_topics`` switch on top of
    ``allow_participation`` — a forum can accept answers without accepting
    questions from outside.
    """
    read = PublicCommunityService(db)
    community = await read.get_community(community_slug)
    if community is None:
        raise HTTPException(status_code=404, detail="Community not found")
    channel = await read.get_public_channel(community.workspace_id, channel_slug)
    if channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")

    participation = CommunityParticipationService(db)
    try:
        result = await participation.create_topic(
            community, channel, str(current_user.id), data.name, data.content
        )
    except ParticipationError as e:
        raise HTTPException(status_code=_ERROR_STATUS.get(e.code, 400), detail=e.message)
    await db.commit()
    return result


@router.post(
    "/{community_slug}/channels/{channel_slug}/topics/{topic_param}"
    "/messages/{message_id}/reactions"
)
async def toggle_reaction(
    community_slug: str,
    channel_slug: str,
    topic_param: str,
    message_id: str,
    data: PublicReactionCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Add or remove one of the caller's reactions on a public message."""
    community, channel, topic = await _resolve_topic(
        db, community_slug, channel_slug, topic_param
    )
    participation = CommunityParticipationService(db)
    try:
        result = await participation.toggle_reaction(
            community, channel, topic, message_id, str(current_user.id), data.emoji
        )
    except ParticipationError as e:
        raise HTTPException(status_code=_ERROR_STATUS.get(e.code, 400), detail=e.message)
    await db.commit()
    return result


@router.get(
    "/{community_slug}/channels/{channel_slug}/topics/{topic_param}/my-reactions"
)
async def get_my_reactions(
    community_slug: str,
    channel_slug: str,
    topic_param: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Which reactions the caller has already left in this thread.

    Separate from the thread payload on purpose: that response is cached and
    served to every anonymous reader, so it cannot carry anything per-viewer.
    """
    _community, _channel, topic = await _resolve_topic(
        db, community_slug, channel_slug, topic_param
    )
    reactions = await PublicCommunityService(db).my_reactions(
        topic.id, str(current_user.id)
    )
    return {"reactions": reactions}


@router.put(
    "/{community_slug}/channels/{channel_slug}/topics/{topic_param}/accepted-answer"
)
async def set_accepted_answer(
    community_slug: str,
    channel_slug: str,
    topic_param: str,
    data: TopicAcceptedAnswerUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Mark a reply as the answer (or clear it with a null ``message_id``).

    Lives on the public router rather than the workspace one because the person
    most entitled to use it — whoever asked — may well be a community-only
    account, which the isolation middleware bars from every internal path.
    """
    community, channel, topic = await _resolve_topic(
        db, community_slug, channel_slug, topic_param
    )
    participation = CommunityParticipationService(db)
    try:
        result = await participation.set_accepted_answer(
            community, channel, topic, str(current_user.id), data.message_id
        )
    except ParticipationError as e:
        raise HTTPException(status_code=_ERROR_STATUS.get(e.code, 400), detail=e.message)
    await db.commit()
    return result
