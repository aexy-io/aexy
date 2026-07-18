"""Public Community API — no authentication required.

Anonymous, read-only, crawlable view of a workspace's opt-in community forum,
addressed by ``community_slug`` (``/public/community/{community_slug}``). Only
web-public channels/topics/messages are ever served; the
``PublicCommunityService`` enforces that with SQL predicates so nothing leaks.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.schemas.chat import (
    CommunityMemberContextResponse,
    PublicChannelResponse,
    PublicCommunityChannel,
    PublicCommunityResponse,
    PublicDirectoryItem,
    PublicDirectoryResponse,
    PublicMessage,
    PublicReplyCreate,
    PublicTopicResponse,
    PublicTopicSummary,
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
async def list_directory(db: AsyncSession = Depends(get_db)):
    """Public directory of communities that opted in (enabled AND listed)."""
    service = PublicCommunityService(db)
    items = await service.list_directory()
    return PublicDirectoryResponse(
        communities=[PublicDirectoryItem(**i) for i in items]
    )


@router.get("/{community_slug}", response_model=PublicCommunityResponse)
async def get_community(community_slug: str, db: AsyncSession = Depends(get_db)):
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
        channels=[PublicCommunityChannel(**c) for c in channels],
    )


@router.get("/{community_slug}/me", response_model=CommunityMemberContextResponse)
async def get_member_context(
    community_slug: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
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
):
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
):
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
    )


@router.get("/{community_slug}/sitemap")
async def get_sitemap(community_slug: str, db: AsyncSession = Depends(get_db)):
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
    "disabled": 403,
    "not_public": 403,
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
):
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
