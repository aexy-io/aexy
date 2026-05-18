#!/usr/bin/env python3
"""Suggest email-alias candidates for every workspace member.

Walks every commit currently sitting on a pseudo-ghost Developer row
(no GitHubConnection of its own) and proposes which canonical developer
should adopt the email, based on:

  1. If the pseudo-ghost's commits also carry an `author_github_login`
     matching a workspace member's `GitHubConnection.github_username`,
     suggest that member as the owner. (Strongest signal — direct GitHub
     attribution alongside the git-config email.)

  2. Otherwise group by `author_email` and surface the top emails so
     a human can review them.

Read-only — does not move any rows. Pair with `backfill_aliases.py`
(or the `/developers/me/email-aliases` API) to actually attach them.

Usage:
    docker exec aexy-backend python scripts/discover_alias_candidates.py \\
        --workspace-id f67c7124-38e4-4a4b-8e89-da56e413ef13 \\
        [--min-commits 3]

Pipe-form (no file deploy needed):
    cat scripts/discover_alias_candidates.py | docker exec -i aexy-backend \\
        python - --workspace-id <uuid>
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

try:
    sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
except NameError:
    for candidate in ("/app/src", os.path.join(os.getcwd(), "src")):
        if os.path.isdir(candidate):
            sys.path.insert(0, candidate)
            break

from sqlalchemy import distinct, func, select  # noqa: E402

from aexy.core.database import async_session_maker  # noqa: E402
from aexy.models.activity import Commit  # noqa: E402
from aexy.models.developer import (  # noqa: E402
    Developer,
    DeveloperEmailAlias,
    GitHubConnection,
)
from aexy.models.repository import Repository, WorkspaceRepository  # noqa: E402
from aexy.models.workspace import WorkspaceMember  # noqa: E402


async def discover(workspace_id: str, min_commits: int) -> int:
    async with async_session_maker() as db:
        # Workspace repo full_names so we only look at commits this
        # workspace cares about.
        repo_names = [
            r[0]
            for r in (
                await db.execute(
                    select(Repository.full_name)
                    .join(
                        WorkspaceRepository,
                        WorkspaceRepository.repository_id == Repository.id,
                    )
                    .where(
                        WorkspaceRepository.workspace_id == workspace_id,
                        WorkspaceRepository.is_active == True,  # noqa: E712
                    )
                )
            ).all()
        ]
        if not repo_names:
            print(f"No adopted repos for workspace {workspace_id}")
            return 1

        # Workspace member github_username → developer_id, lowercased.
        member_rows = (
            await db.execute(
                select(
                    Developer.id,
                    Developer.name,
                    GitHubConnection.github_username,
                )
                .join(WorkspaceMember, WorkspaceMember.developer_id == Developer.id)
                .join(
                    GitHubConnection,
                    GitHubConnection.developer_id == Developer.id,
                )
                .where(WorkspaceMember.workspace_id == workspace_id)
            )
        ).all()
        if not member_rows:
            print(
                f"No workspace members with a GitHubConnection in {workspace_id}"
            )
            return 1
        username_to_dev = {
            r.github_username.lower(): (r.id, r.name) for r in member_rows
        }
        member_dev_ids = {r.id for r in member_rows}

        # Aliases already attached, so we don't re-suggest them.
        already_aliased = {
            r[0].lower()
            for r in (
                await db.execute(select(DeveloperEmailAlias.email))
            ).all()
        }

        # Every commit on a pseudo-ghost (Developer with no GitHubConnection)
        # in this workspace's repos. Group by (developer_id, author_email,
        # author_github_login) and count.
        rows = (
            await db.execute(
                select(
                    Commit.developer_id,
                    Commit.author_email,
                    Commit.author_github_login,
                    func.count(Commit.id),
                )
                .where(
                    Commit.repository.in_(repo_names),
                    Commit.author_email.is_not(None),
                    ~select(GitHubConnection.id)
                    .where(GitHubConnection.developer_id == Commit.developer_id)
                    .exists(),
                )
                .group_by(
                    Commit.developer_id,
                    Commit.author_email,
                    Commit.author_github_login,
                )
                .having(func.count(Commit.id) >= min_commits)
                .order_by(func.count(Commit.id).desc())
            )
        ).all()

        # ---- Bucket 1: strong matches via author_github_login ----
        suggestions: dict[tuple[str, str], int] = defaultdict(int)
        unmatched: Counter[str] = Counter()  # email -> count
        for dev_id, email, login, n in rows:
            email_lc = email.lower()
            if email_lc in already_aliased:
                continue
            if login and login.lower() in username_to_dev:
                target_dev_id, _ = username_to_dev[login.lower()]
                suggestions[(target_dev_id, email_lc)] += n
            elif dev_id in member_dev_ids:
                # Pseudo-ghost? No — it's a workspace member. Skip.
                continue
            else:
                unmatched[email_lc] += n

        print(
            f"\n=== Alias suggestions (workspace {workspace_id}, "
            f"min-commits={min_commits}) ===\n"
        )

        if suggestions:
            print("  Strong matches (author_github_login pinpoints owner):\n")
            # Group by target developer for readability.
            by_dev: dict[str, list[tuple[str, int]]] = defaultdict(list)
            for (dev_id, email), n in suggestions.items():
                by_dev[dev_id].append((email, n))
            for dev_id, items in sorted(
                by_dev.items(), key=lambda kv: -sum(n for _, n in kv[1])
            ):
                dev_name = next(
                    (
                        v[1]
                        for v in username_to_dev.values()
                        if v[0] == dev_id
                    ),
                    "<unknown>",
                )
                total = sum(n for _, n in items)
                print(
                    f"    {dev_name!r:30s} dev_id={dev_id}  "
                    f"{total:5d} commits across {len(items)} alias(es)"
                )
                for email, n in sorted(items, key=lambda x: -x[1]):
                    print(f"        {email:55s} {n:5d}")
        else:
            print("  (no strong matches surfaced)")

        if unmatched:
            print(
                "\n  Unattributed emails (no github_login on commits, "
                "review manually):\n"
            )
            for email, n in unmatched.most_common(30):
                print(f"    {email:55s} {n:5d}")

        # Summary
        strong_total = sum(suggestions.values())
        unmatched_total = sum(unmatched.values())
        print(
            f"\n  Total commits reclaimable via strong matches: "
            f"{strong_total}"
        )
        print(
            f"  Total commits in unattributed bucket (review):  "
            f"{unmatched_total}"
        )

    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-id", required=True)
    parser.add_argument(
        "--min-commits",
        type=int,
        default=3,
        help="Only suggest emails with at least this many commits "
        "(default 3; lower to find noisy one-offs)",
    )
    args = parser.parse_args()
    sys.exit(asyncio.run(discover(args.workspace_id, args.min_commits)))


if __name__ == "__main__":
    main()
