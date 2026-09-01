#!/usr/bin/env python3
"""Seed a public community so the forum can actually be looked at.

The public pages need state no public API can create: an enabled community, a
web-public channel, and a thread with a permalink. Until now that state had to be
assembled by hand — which is why ``frontend/e2e/community.spec.ts`` skips itself
by default and points at a plan document that no longer exists.

This applies a starter template through the same service the settings UI calls,
switches the community on, and prints the environment the e2e spec wants.

Usage:
    # First workspace, the product-support template, live immediately
    docker exec aexy-backend python scripts/seed_community_demo.py

    # A specific workspace and template
    docker exec aexy-backend python scripts/seed_community_demo.py \\
        --workspace <uuid> --template open_source

    # Lay it out without going live
    docker exec aexy-backend python scripts/seed_community_demo.py --no-publish

    # Also open it to outside replies and new threads
    docker exec aexy-backend python scripts/seed_community_demo.py --participation
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from sqlalchemy import select

from aexy.core.database import async_session_maker
from aexy.models.chat import ChatChannel, ChatTopic
from aexy.models.workspace import Workspace, WorkspaceMember
from aexy.services.community_service import CommunityService
from aexy.services.community_templates import COMMUNITY_TEMPLATES


async def _resolve_workspace(session, workspace_id: str | None) -> Workspace:
    if workspace_id:
        workspace = await session.get(Workspace, workspace_id)
        if workspace is None:
            raise SystemExit(f"No workspace with id {workspace_id}")
        return workspace
    workspace = (
        await session.execute(select(Workspace).order_by(Workspace.created_at).limit(1))
    ).scalar_one_or_none()
    if workspace is None:
        raise SystemExit("No workspaces exist yet — create one first.")
    return workspace


async def _resolve_author(session, workspace_id: str) -> str:
    """An owner or admin to author the seeded threads."""
    for role in ("owner", "admin", "member"):
        member = (
            await session.execute(
                select(WorkspaceMember).where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.role == role,
                    WorkspaceMember.status == "active",
                )
            )
        ).scalars().first()
        if member is not None:
            return str(member.developer_id)
    raise SystemExit("That workspace has no active members to author the threads.")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", help="Workspace id (default: the oldest one)")
    parser.add_argument(
        "--template",
        default="product_support",
        choices=[t.id for t in COMMUNITY_TEMPLATES],
        help="Starter template to apply",
    )
    parser.add_argument(
        "--no-publish",
        action="store_true",
        help="Lay out the channels without switching the community on",
    )
    parser.add_argument(
        "--participation",
        action="store_true",
        help="Also allow outside replies and new threads (overrides the template)",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List the available templates and exit",
    )
    args = parser.parse_args()

    if args.list:
        for template in COMMUNITY_TEMPLATES:
            channels = ", ".join(c.name for c in template.channels)
            print(f"{template.id:20} {template.name}\n{'':20} {channels}\n")
        return

    async with async_session_maker() as session:
        workspace = await _resolve_workspace(session, args.workspace)
        author_id = await _resolve_author(session, str(workspace.id))

        service = CommunityService(session)
        result = await service.apply_template(
            str(workspace.id),
            author_id,
            args.template,
            publish=not args.no_publish,
        )
        if args.participation:
            await service.upsert_settings(
                str(workspace.id),
                allow_participation=True,
                allow_new_topics=True,
                post_moderation="post",
            )
        # Listed so it shows up in the directory at /community, which is the
        # other half of "can it actually be found".
        await service.upsert_settings(
            str(workspace.id),
            listed=not args.no_publish,
            title=workspace.name,
        )
        await session.commit()

        slug = result["community_slug"]
        print(f"Workspace : {workspace.name} ({workspace.id})")
        print(f"Template  : {args.template}")
        print(f"Created   : {', '.join(result['channels_created']) or '—'}")
        print(f"Skipped   : {', '.join(result['channels_skipped']) or '—'}")
        print(f"Threads   : {result['topics_created']}")
        print(f"Live      : {result['enabled']}")
        print(f"URL       : /community/{slug}")

        # The e2e spec needs one concrete thread path. Print the first it can use.
        row = (
            await session.execute(
                select(ChatTopic, ChatChannel)
                .join(ChatChannel, ChatTopic.channel_id == ChatChannel.id)
                .where(
                    ChatChannel.workspace_id == workspace.id,
                    ChatChannel.visibility == "web_public",
                    ChatTopic.slug.isnot(None),
                    ChatTopic.public_short_id.isnot(None),
                )
                .order_by(ChatTopic.created_at)
                .limit(1)
            )
        ).first()
        if row is None:
            print("\nNo seeded thread has a permalink yet — nothing to point e2e at.")
            return

        topic, channel = row
        print("\n# For frontend/e2e/community.spec.ts:")
        print(f"export COMMUNITY_SLUG={slug}")
        print(f"export COMMUNITY_CHANNEL_SLUG={channel.slug}")
        print(f"export COMMUNITY_TOPIC_PARAM={topic.slug}-{topic.public_short_id}")
        print("# and a JWT for any developer:")
        print("#   python scripts/generate_test_token.py --first")


if __name__ == "__main__":
    asyncio.run(main())
