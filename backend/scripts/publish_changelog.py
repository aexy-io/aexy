#!/usr/bin/env python3
"""Publish a changelog entry as a post in the public community's Releases channel.

Talks to the running API over HTTP with a normal user JWT — no database access —
so the same script works against a local stack, staging, or production by
pointing ``--api-url`` at it. Get a token from the browser (localStorage key
``token``) or, locally, from ``scripts/generate_test_token.py --first``.

Each release becomes one topic in one channel, so the whole changelog reads as a
chronological list at ``/community/{community}/releases`` and every entry has its
own permalink that survives a later rename.

    # first release: also flips the channel web-public (workspace admin)
    python scripts/publish_changelog.py --title "v2.4.0" \
        --body-file notes/v2.4.0.md --publish-channel

    # every release after that
    python scripts/publish_changelog.py --title "v2.4.1" --body-file - < notes.md

Env fallbacks: AEXY_API_URL, AEXY_TOKEN, AEXY_SITE_URL, AEXY_WORKSPACE_ID.
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any

import httpx

DEFAULT_API_URL = "http://localhost:8000/api/v1"
DEFAULT_SITE_URL = "http://localhost:3000"
DEFAULT_CHANNEL = "releases"

# Mirrors TopicCreate in schemas/chat.py. Checked here so an over-long changelog
# fails with its actual length instead of an opaque 422 from Pydantic.
MAX_TITLE = 255
MAX_BODY = 10000


class Failed(Exception):
    """An expected, explainable failure — printed without a traceback."""


def _api(client: httpx.Client, method: str, path: str, **kwargs) -> Any:
    response = client.request(method, path, **kwargs)
    if response.status_code >= 400:
        try:
            detail = response.json().get("detail", response.text)
        except ValueError:
            detail = response.text
        raise Failed(f"{method} {path} -> {response.status_code}: {detail}")
    return response.json() if response.content else None


def resolve_workspace(client: httpx.Client, wanted: str | None) -> dict:
    """Pick the workspace to publish into, by id or slug."""
    workspaces = _api(client, "GET", "/workspaces")
    if not workspaces:
        raise Failed("This token's user belongs to no workspace.")

    if wanted:
        for ws in workspaces:
            if wanted in (ws["id"], ws["slug"]):
                return ws
        known = ", ".join(f'{w["slug"]} ({w["id"]})' for w in workspaces)
        raise Failed(f"No workspace matched {wanted!r}. Available: {known}")

    if len(workspaces) > 1:
        known = "\n".join(f'  {w["slug"]}  {w["id"]}  {w["name"]}' for w in workspaces)
        raise Failed(
            "This user is in several workspaces — name one with --workspace:\n" + known
        )
    return workspaces[0]


def resolve_channel(
    client: httpx.Client, workspace_id: str, wanted: str, create: bool, dry_run: bool
) -> dict | None:
    """Find the releases channel by slug or name, creating it if asked to.

    Matching on the name too, because a channel created through the UI as
    "Releases" is what an operator means by ``--channel releases`` even though
    the service may have suffixed the slug to keep it unique.

    Returns ``None`` only under ``--dry-run``, where the channel is missing and
    would have been created — creating it is a write, and --dry-run writes
    nothing.
    """
    base = f"/workspaces/{workspace_id}/chat"
    channels = _api(client, "GET", f"{base}/channels")["channels"]

    needle = wanted.strip().lower()
    for channel in channels:
        if channel["slug"].lower() == needle or channel["name"].strip().lower() == needle:
            return channel

    if not create:
        known = ", ".join(sorted(c["slug"] for c in channels)) or "(none)"
        raise Failed(
            f"No channel {wanted!r} in this workspace, and --no-create-channel was "
            f"set. Existing channels: {known}"
        )
    if dry_run:
        return None

    # Created workspace-visible; the web_public flip is a separate, admin-gated
    # step below so that publishing to the internet is never a side effect of a
    # typo'd channel name.
    return _api(
        client,
        "POST",
        f"{base}/channels",
        json={
            "name": wanted.strip().title(),
            "description": "Product release notes and changelog.",
            "visibility": "workspace",
        },
    )


def ensure_web_public(
    client: httpx.Client, workspace_id: str, channel: dict, publish: bool
) -> dict:
    """Make the channel readable on the public forum, if it isn't already."""
    if channel["visibility"] == "web_public":
        return channel

    if not publish:
        raise Failed(
            f'Channel "{channel["slug"]}" is {channel["visibility"]}, so a post there '
            "would not appear on the public community.\n"
            "Re-run with --publish-channel to make it web-public. That exposes the "
            "channel to the internet, requires a workspace admin, and posts a "
            "one-time notice topic telling members the channel is now public."
        )

    return _api(
        client,
        "PATCH",
        f"/workspaces/{workspace_id}/chat/channels/{channel['id']}",
        json={"visibility": "web_public"},
    )


def public_permalink(
    api_url: str, site_url: str, community_slug: str, channel_slug: str, title: str
) -> str | None:
    """Best-effort public URL for the topic just created.

    The internal topic response carries no slug or short id, so the permalink is
    read back from the public API. Deliberately unauthenticated — a hit is then
    also proof the post really is visible to an anonymous reader. A miss is not
    an error: the post exists either way, and the channel URL is still correct.
    """
    try:
        response = httpx.get(
            f"{api_url}/public/community/{community_slug}/channels/{channel_slug}",
            timeout=30.0,
        )
        response.raise_for_status()
        channel = response.json()
    except (httpx.HTTPError, ValueError):
        return None

    for topic in channel.get("topics", []):
        if topic["name"] == title and topic.get("slug") and topic.get("short_id"):
            path = f"{topic['slug']}-{topic['short_id']}"
            return f"{site_url}/community/{community_slug}/{channel_slug}/{path}"
    return None


def read_body(args: argparse.Namespace) -> str:
    if args.body is not None:
        body = args.body
    elif args.body_file == "-":
        body = sys.stdin.read()
    else:
        with open(args.body_file, encoding="utf-8") as handle:
            body = handle.read()

    body = body.strip()
    if not body:
        raise Failed("The changelog body is empty.")
    if len(body) > MAX_BODY:
        raise Failed(
            f"The changelog body is {len(body)} characters; the API caps a post at "
            f"{MAX_BODY}. Split the release into shorter entries, or link out to "
            "the full notes."
        )
    return body


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Publish a changelog entry to the community Releases channel.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--title", required=True, help='Release name, e.g. "v2.4.0".')
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--body-file", help='Markdown file with the notes, or "-" for stdin.')
    source.add_argument("--body", help="Notes inline, instead of a file.")
    parser.add_argument(
        "--channel",
        default=DEFAULT_CHANNEL,
        help=f"Channel slug or name to post under (default: {DEFAULT_CHANNEL}).",
    )
    parser.add_argument("--workspace", default=os.getenv("AEXY_WORKSPACE_ID"),
                        help="Workspace id or slug. Optional when the user has exactly one.")
    parser.add_argument("--token", default=os.getenv("AEXY_TOKEN"), help="JWT (env: AEXY_TOKEN).")
    parser.add_argument("--api-url", default=os.getenv("AEXY_API_URL", DEFAULT_API_URL))
    parser.add_argument("--site-url", default=os.getenv("AEXY_SITE_URL", DEFAULT_SITE_URL),
                        help="Frontend origin, used only to print the permalink.")
    parser.add_argument("--publish-channel", action="store_true",
                        help="Make the channel web-public if it isn't (workspace admin).")
    parser.add_argument("--no-create-channel", dest="create_channel", action="store_false",
                        help="Fail instead of creating the channel when it is missing.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Resolve everything and print the plan; write nothing.")
    args = parser.parse_args()

    if not args.token:
        raise Failed("No token. Pass --token or set AEXY_TOKEN.")
    title = args.title.strip()
    if not title:
        raise Failed("--title is empty.")
    if len(title) > MAX_TITLE:
        raise Failed(f"--title is {len(title)} characters; the API caps it at {MAX_TITLE}.")

    body = read_body(args)

    with httpx.Client(
        base_url=args.api_url.rstrip("/"),
        headers={"Authorization": f"Bearer {args.token}"},
        timeout=30.0,
    ) as client:
        workspace = resolve_workspace(client, args.workspace)
        workspace_id = workspace["id"]

        try:
            community = _api(client, "GET", f"/workspaces/{workspace_id}/chat/community/settings")
        except Failed:
            raise Failed(
                f'Workspace "{workspace["slug"]}" has no community configured. Set one up '
                "under Settings → Community before publishing a changelog."
            ) from None
        if not community["enabled"]:
            raise Failed(
                f'The community for "{workspace["slug"]}" is switched off, so nothing '
                "posted here would be publicly readable. Enable it under "
                "Settings → Community."
            )

        channel = resolve_channel(
            client, workspace_id, args.channel, args.create_channel, args.dry_run
        )

        if args.dry_run:
            if channel is None:
                described = f"{args.channel} [would be created, workspace-visible]"
            else:
                described = f"{channel['slug']} [{channel['visibility']}]"
            print(f"workspace : {workspace['slug']} ({workspace_id})")
            print(f"community : {community['community_slug']}")
            print(f"channel   : {described}")
            print(f"title     : {title}")
            print(f"body      : {len(body)} characters")
            print("\n--dry-run: nothing was written.")
            return 0

        assert channel is not None  # only --dry-run returns None
        channel = ensure_web_public(client, workspace_id, channel, args.publish_channel)

        topic = _api(
            client,
            "POST",
            f"/workspaces/{workspace_id}/chat/channels/{channel['id']}/topics",
            json={"name": title, "first_message": body},
        )

        community_slug = community["community_slug"]
        channel_url = f"{args.site_url.rstrip('/')}/community/{community_slug}/{channel['slug']}"
        permalink = public_permalink(
            args.api_url.rstrip("/"),
            args.site_url.rstrip("/"),
            community_slug,
            channel["slug"],
            title,
        )

        print(f'Published "{title}" (topic {topic["id"]}).')
        print(f"  channel  : {channel_url}")
        if permalink:
            print(f"  permalink: {permalink}")
        else:
            print(
                "  permalink: not resolvable yet — the public view is cached/ISR, so "
                "the entry may take a moment to appear."
            )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Failed as failure:
        print(f"error: {failure}", file=sys.stderr)
        sys.exit(1)
