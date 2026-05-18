#!/usr/bin/env python3
"""Find ghost Developer rows that look like name variations of a real
workspace member and merge their activity into the canonical row.

Companion to `backfill_ghost_dedup.py`, which keys off github_username.
This script handles the case that script misses: ghosts whose
github_username is empty/different but whose `Developer.name` matches a
workspace member's name once you strip honorifics, punctuation, and case.

The screenshot motivating this script showed one person rendered as
"a", "b", "c" — three Developer
rows none of which shared an email or github_username. Email aliases
can't catch them; github-username dedup can't catch them. Only name
similarity can.

Safety:
    * Only merges into Developer rows that ARE workspace members (have
      a WorkspaceMember row) AND have a GitHubConnection — i.e. the
      canonical row is a known human, not another ghost.
    * Skips ambiguous matches (more than one canonical candidate for
      the same normalized name) — those need a human eyeball.
    * Dry-run by default unless `--apply` is passed.

Usage:
    docker exec aexy-backend python scripts/dedupe_developer_ghosts.py
    docker exec aexy-backend python scripts/dedupe_developer_ghosts.py --workspace <ws_id>
    docker exec aexy-backend python scripts/dedupe_developer_ghosts.py --apply
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from sqlalchemy import distinct, select, update  # noqa: E402

from aexy.core.database import async_session_maker  # noqa: E402
from aexy.models.activity import CodeReview, Commit, PullRequest  # noqa: E402
from aexy.models.developer import Developer, GitHubConnection  # noqa: E402
from aexy.models.workspace import Workspace, WorkspaceMember  # noqa: E402


# Common name prefixes/suffixes/honorifics that vary between commit
# author metadata and member profiles. Stripped before comparison.
_HONORIFICS = {
    "md",
    "mr",
    "mrs",
    "ms",
    "dr",
    "mohd",
    "mohammed",
    "muhammad",
    "smt",
    "sri",
    "prof",
}


def normalize_name(name: str | None) -> str | None:
    """Lower, strip honorifics, drop non-alnum. Empty → None."""
    if not name:
        return None
    # Replace punctuation with space, lower the result.
    cleaned = re.sub(r"[^A-Za-z0-9]+", " ", name).lower().strip()
    if not cleaned:
        return None
    tokens = [t for t in cleaned.split() if t and t not in _HONORIFICS]
    if not tokens:
        return None
    return "".join(tokens)


async def _activity_counts(db, ghost_id: str) -> tuple[int, int, int]:
    """Counts of commits/PRs/reviews owned by a ghost — for the report."""
    c = (
        await db.execute(
            select(distinct(Commit.id)).where(Commit.developer_id == ghost_id)
        )
    ).all()
    p = (
        await db.execute(
            select(distinct(PullRequest.id)).where(
                PullRequest.developer_id == ghost_id
            )
        )
    ).all()
    r = (
        await db.execute(
            select(distinct(CodeReview.id)).where(
                CodeReview.developer_id == ghost_id
            )
        )
    ).all()
    return len(c), len(p), len(r)


async def _has_connection(db, developer_id: str) -> bool:
    row = (
        await db.execute(
            select(GitHubConnection.id).where(
                GitHubConnection.developer_id == developer_id
            ).limit(1)
        )
    ).first()
    return row is not None


async def _scan_workspace(
    db,
    workspace_id: str,
    workspace_name: str,
    apply_changes: bool,
) -> dict[str, int]:
    """Scan one workspace, merge unambiguous name-twin ghosts into
    their canonical workspace-member row."""
    stats = {
        "scanned": 0,
        "merged": 0,
        "skipped_ambiguous": 0,
        "skipped_no_anchor": 0,
        "commits_moved": 0,
        "prs_moved": 0,
        "reviews_moved": 0,
    }

    # Workspace members with their Developer + GitHubConnection.
    members_stmt = (
        select(
            Developer.id,
            Developer.name,
            Developer.email,
            GitHubConnection.github_username,
        )
        .join(WorkspaceMember, WorkspaceMember.developer_id == Developer.id)
        .outerjoin(
            GitHubConnection, GitHubConnection.developer_id == Developer.id
        )
        .where(WorkspaceMember.workspace_id == workspace_id)
    )
    member_rows = (await db.execute(members_stmt)).all()

    # Build canonical lookup keyed by normalized name; require a
    # GitHubConnection (real human) to be considered canonical.
    canonical_by_norm: dict[str, list[tuple[str, str | None, str | None]]] = (
        defaultdict(list)
    )
    member_dev_ids: set[str] = set()
    for dev_id, dev_name, dev_email, gh_login in member_rows:
        member_dev_ids.add(dev_id)
        if gh_login is None:
            continue  # Can't be canonical without a real connection.
        for source in (dev_name, gh_login):
            key = normalize_name(source)
            if key:
                canonical_by_norm[key].append((dev_id, dev_name, gh_login))

    if not canonical_by_norm:
        return stats

    # Candidate ghosts: developers contributing to this workspace's
    # repos but NOT in workspace_members AND without a github_connection.
    ghost_stmt = (
        select(
            distinct(Developer.id),
            Developer.name,
            Developer.email,
        )
        .where(Developer.id.notin_(member_dev_ids))
        .where(
            ~select(GitHubConnection.id)
            .where(GitHubConnection.developer_id == Developer.id)
            .exists()
        )
        .where(
            select(Commit.id)
            .join(
                WorkspaceMember,
                WorkspaceMember.developer_id == Commit.developer_id,
            )
            .where(WorkspaceMember.workspace_id == workspace_id)
            .exists()
            | select(Commit.id)
            .where(Commit.developer_id == Developer.id)
            .exists()
        )
    )
    ghost_rows = (await db.execute(ghost_stmt)).all()

    for ghost_id, ghost_name, ghost_email in ghost_rows:
        stats["scanned"] += 1
        key = normalize_name(ghost_name)
        if not key:
            stats["skipped_no_anchor"] += 1
            continue

        candidates = canonical_by_norm.get(key, [])
        if not candidates:
            continue
        # De-dup canonical candidates by developer_id.
        unique = {c[0]: c for c in candidates}
        if len(unique) > 1:
            print(
                f"  [ambiguous] ghost name={ghost_name!r} id={ghost_id} "
                f"matches {len(unique)} canonicals: "
                f"{[c[1] for c in unique.values()]} — skipped"
            )
            stats["skipped_ambiguous"] += 1
            continue

        canonical_id, canonical_name, _gh = next(iter(unique.values()))

        # Belt-and-braces: never merge into another ghost. Re-check that
        # the canonical has a GitHubConnection at apply time.
        if not await _has_connection(db, canonical_id):
            stats["skipped_no_anchor"] += 1
            continue

        commits, prs, reviews = await _activity_counts(db, ghost_id)
        print(
            f"  [match] {ghost_name!r} ({ghost_id[:8]}) "
            f"→ {canonical_name!r} ({canonical_id[:8]}): "
            f"{commits}c {prs}p {reviews}r"
        )
        stats["merged"] += 1
        stats["commits_moved"] += commits
        stats["prs_moved"] += prs
        stats["reviews_moved"] += reviews

        if apply_changes:
            await db.execute(
                update(Commit)
                .where(Commit.developer_id == ghost_id)
                .values(developer_id=canonical_id)
            )
            await db.execute(
                update(PullRequest)
                .where(PullRequest.developer_id == ghost_id)
                .values(developer_id=canonical_id)
            )
            await db.execute(
                update(CodeReview)
                .where(CodeReview.developer_id == ghost_id)
                .values(developer_id=canonical_id)
            )
            # Delete the ghost — ON DELETE CASCADE for any incidental FK rows.
            await db.execute(
                Developer.__table__.delete().where(Developer.id == ghost_id)
            )

    return stats


async def main(workspace_id: str | None, apply_changes: bool) -> int:
    async with async_session_maker() as db:
        if workspace_id:
            ws_stmt = select(Workspace.id, Workspace.name).where(
                Workspace.id == workspace_id
            )
        else:
            ws_stmt = select(Workspace.id, Workspace.name)
        workspaces = (await db.execute(ws_stmt)).all()
        if not workspaces:
            print("No workspaces matched.")
            return 0

        grand = {
            "scanned": 0,
            "merged": 0,
            "skipped_ambiguous": 0,
            "skipped_no_anchor": 0,
            "commits_moved": 0,
            "prs_moved": 0,
            "reviews_moved": 0,
        }
        for ws_id, ws_name in workspaces:
            print(f"\nWorkspace: {ws_name} ({ws_id})")
            stats = await _scan_workspace(db, ws_id, ws_name, apply_changes)
            for k, v in stats.items():
                grand[k] += v
            if stats["scanned"] == 0:
                print("  (no ghost candidates)")

        if apply_changes:
            await db.commit()

        print("\n──── Summary ────")
        prefix = "" if apply_changes else "(dry-run) "
        print(f"{prefix}Ghosts examined:   {grand['scanned']}")
        print(f"{prefix}Merged:            {grand['merged']}")
        print(f"{prefix}Skipped ambiguous: {grand['skipped_ambiguous']}")
        print(f"{prefix}Skipped no anchor: {grand['skipped_no_anchor']}")
        print(f"{prefix}Commits moved:     {grand['commits_moved']}")
        print(f"{prefix}PRs moved:         {grand['prs_moved']}")
        print(f"{prefix}Reviews moved:     {grand['reviews_moved']}")
        if not apply_changes:
            print("\nDry-run only. Re-run with --apply to commit changes.")

    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--workspace",
        help="Limit to a single workspace ID (default: all workspaces).",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually commit changes (default: dry-run).",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.workspace, args.apply)))
