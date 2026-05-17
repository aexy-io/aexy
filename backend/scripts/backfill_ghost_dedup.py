#!/usr/bin/env python3
"""One-shot backfill: merge ghost developers into their canonical counterparts.

Up until D2, the OAuth callback didn't merge ghost developers — so any commits
that landed before a developer first signed in (or for case-variant logins)
stayed attached to a ghost row, invisible to leaderboards and analytics that
key off `Developer.id`.

This script walks every `GitHubConnection.github_username`, looks for a
matching ghost (case-insensitive on `name`, `email IS NULL`, no own
`GitHubConnection`), and physically reassigns the commits / PRs / reviews,
then deletes the ghost.

Idempotent: re-running after a successful pass does nothing.

Usage:
    docker exec aexy-backend python scripts/backfill_ghost_dedup.py
    docker exec aexy-backend python scripts/backfill_ghost_dedup.py --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from sqlalchemy import select

from aexy.core.database import async_session_maker  # noqa: E402
from aexy.models.developer import GitHubConnection  # noqa: E402
from aexy.services.developer_service import DeveloperService  # noqa: E402


async def main(dry_run: bool) -> int:
    total = {"commits": 0, "prs": 0, "reviews": 0, "ghosts_merged": 0}
    examined = 0

    async with async_session_maker() as db:
        rows = (
            await db.execute(
                select(
                    GitHubConnection.developer_id,
                    GitHubConnection.github_username,
                )
            )
        ).all()

        service = DeveloperService(db)
        for developer_id, github_username in rows:
            if not github_username:
                continue
            examined += 1
            if dry_run:
                # Re-run merge logic without committing. We rely on a savepoint:
                # SQLAlchemy's session.begin_nested() makes the changes locally,
                # and we roll back after each row.
                async with db.begin_nested():
                    result = await service.merge_ghost_into_developer(
                        canonical_developer_id=str(developer_id),
                        github_username=github_username,
                    )
                    if result["ghost_deleted"]:
                        total["commits"] += result["commits"]
                        total["prs"] += result["prs"]
                        total["reviews"] += result["reviews"]
                        total["ghosts_merged"] += 1
                        print(
                            f"[dry-run] would merge @{github_username} → "
                            f"developer {developer_id}: "
                            f"{result['commits']} commits, "
                            f"{result['prs']} PRs, "
                            f"{result['reviews']} reviews"
                        )
                    # rolling back the savepoint
                    await db.rollback()
            else:
                result = await service.merge_ghost_into_developer(
                    canonical_developer_id=str(developer_id),
                    github_username=github_username,
                )
                if result["ghost_deleted"]:
                    total["commits"] += result["commits"]
                    total["prs"] += result["prs"]
                    total["reviews"] += result["reviews"]
                    total["ghosts_merged"] += 1
                    print(
                        f"merged @{github_username} → developer {developer_id}: "
                        f"{result['commits']} commits, "
                        f"{result['prs']} PRs, "
                        f"{result['reviews']} reviews"
                    )
                    await db.commit()

    mode = "[dry-run] " if dry_run else ""
    print(
        f"\n{mode}Examined {examined} GitHub connections. "
        f"Merged {total['ghosts_merged']} ghosts. "
        f"Reassigned {total['commits']} commits, "
        f"{total['prs']} PRs, "
        f"{total['reviews']} reviews."
    )
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be merged without making changes.",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(main(dry_run=args.dry_run)))
