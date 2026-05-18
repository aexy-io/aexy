#!/usr/bin/env python3
"""Attach an alias email to a developer + reclaim every commit currently
attributed to a pseudo-ghost with that email. Calls
`DeveloperService.add_email_alias` so backend logic stays in one place.

Usage (single alias):
    docker exec aexy-backend python scripts/backfill_aliases.py \\
        --developer-id <developer-uuid> \\
        --email alt-commit-email@example.com

Bulk mode — read `developer_id<TAB>email` pairs from stdin:
    cat aliases.tsv | docker exec -i aexy-backend python - --bulk \\
        < scripts/backfill_aliases.py

Dry-run shows the preview count without modifying anything:
    docker exec aexy-backend python scripts/backfill_aliases.py \\
        --developer-id <uuid> --email <email> --dry-run
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

try:
    sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
except NameError:
    for candidate in ("/app/src", os.path.join(os.getcwd(), "src")):
        if os.path.isdir(candidate):
            sys.path.insert(0, candidate)
            break

from aexy.core.database import async_session_maker  # noqa: E402
from aexy.services.developer_service import (  # noqa: E402
    DeveloperAlreadyExistsError,
    DeveloperService,
    DeveloperServiceError,
)


async def attach_one(
    developer_id: str, email: str, dry_run: bool
) -> dict[str, int]:
    async with async_session_maker() as db:
        service = DeveloperService(db)
        if dry_run:
            preview = await service.preview_alias_backfill(
                developer_id, email
            )
            return {"commits": int(preview.get("commits", 0)), "applied": 0}
        try:
            _, result = await service.add_email_alias(developer_id, email)
        except DeveloperAlreadyExistsError as e:
            print(f"  CONFLICT: {e}")
            return {"commits": 0, "applied": 0}
        except DeveloperServiceError as e:
            print(f"  ERROR: {e}")
            return {"commits": 0, "applied": 0}
        await db.commit()
        return {
            "commits": int(result.get("commits", 0)),
            "ghost_deleted": int(result.get("ghost_deleted", 0)),
            "applied": 1,
        }


async def main_async(args: argparse.Namespace) -> int:
    total_commits = 0
    total_applied = 0

    if args.bulk:
        # `developer_id<TAB>email` per line on stdin.
        pairs: list[tuple[str, str]] = []
        for line in sys.stdin:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) != 2:
                # Also accept comma-separated for convenience.
                parts = [p.strip() for p in line.split(",")]
            if len(parts) != 2:
                print(f"  SKIP malformed line: {line!r}")
                continue
            pairs.append((parts[0].strip(), parts[1].strip()))
        if not pairs:
            print("No (developer_id, email) pairs on stdin.")
            return 1
        print(f"Processing {len(pairs)} alias pairs (dry_run={args.dry_run})…")
        for dev_id, email in pairs:
            print(f"  {dev_id}  ←  {email}")
            r = await attach_one(dev_id, email, args.dry_run)
            print(
                f"      commits={r['commits']} "
                f"ghost_deleted={r.get('ghost_deleted', 0)} "
                f"applied={r['applied']}"
            )
            total_commits += r["commits"]
            total_applied += r["applied"]
    else:
        if not args.developer_id or not args.email:
            print("Pass --developer-id and --email, or use --bulk on stdin.")
            return 1
        r = await attach_one(
            args.developer_id, args.email, args.dry_run
        )
        print(
            f"  commits={r['commits']} "
            f"ghost_deleted={r.get('ghost_deleted', 0)} "
            f"applied={r['applied']}"
        )
        total_commits += r["commits"]
        total_applied += r["applied"]

    mode = "[dry-run] " if args.dry_run else ""
    print(
        f"\n{mode}Reclaimed {total_commits} commits across "
        f"{total_applied} alias attachments."
    )
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--developer-id")
    parser.add_argument("--email")
    parser.add_argument(
        "--bulk",
        action="store_true",
        help="Read `developer_id<TAB>email` pairs from stdin instead.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show preview counts without writing.",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(main_async(args)))


if __name__ == "__main__":
    main()
