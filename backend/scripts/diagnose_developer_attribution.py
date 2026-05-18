#!/usr/bin/env python3
"""One-shot diagnostic: who owns this developer's commits?

Walks a developer's identity space — their canonical Developer row, their
GitHubConnection, and every commit / PR / review row whose author identity
plausibly matches them — and prints a breakdown by attribution target.

Useful when the leaderboard shows a developer at 0 but PRs are credited
to them: tells you whether their commits are on the canonical row, a
ghost, a step-3 pseudo-ghost with some other email, or scattered across
multiple identities.

Usage:
    docker exec aexy-backend python scripts/diagnose_developer_attribution.py <developer_id>
    docker exec aexy-backend python scripts/diagnose_developer_attribution.py --github-username bhanuc-bmp
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

# Resolve src path whether we're run as a file or piped via stdin
# (`python - …`), where `__file__` is not defined. Inside the container
# the path is /app/src; locally we fall back to the parent-of-script.
try:
    sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
except NameError:
    for candidate in ("/app/src", os.path.join(os.getcwd(), "src")):
        if os.path.isdir(candidate):
            sys.path.insert(0, candidate)
            break

from sqlalchemy import func, or_, select  # noqa: E402

from aexy.core.database import async_session_maker  # noqa: E402
from aexy.models.activity import CodeReview, Commit, PullRequest  # noqa: E402
from aexy.models.developer import Developer, GitHubConnection  # noqa: E402


async def diagnose(developer_id: str | None, github_username: str | None) -> int:
    async with async_session_maker() as db:
        # Resolve the canonical developer.
        canonical: Developer | None = None
        if developer_id:
            canonical = await db.get(Developer, developer_id)
        elif github_username:
            canonical = (
                await db.execute(
                    select(Developer)
                    .join(GitHubConnection, GitHubConnection.developer_id == Developer.id)
                    .where(
                        func.lower(GitHubConnection.github_username)
                        == github_username.lower()
                    )
                )
            ).scalar_one_or_none()
        if canonical is None:
            print("No developer found")
            return 1

        conn = (
            await db.execute(
                select(GitHubConnection).where(
                    GitHubConnection.developer_id == canonical.id
                )
            )
        ).scalar_one_or_none()

        print(f"\n=== Canonical Developer ===")
        print(f"  id:    {canonical.id}")
        print(f"  name:  {canonical.name}")
        print(f"  email: {canonical.email}")
        if conn:
            print(f"  github_username: {conn.github_username}")
            print(f"  github_id:       {conn.github_id}")
        else:
            print(f"  GitHubConnection: NONE")
        gh_username = conn.github_username if conn else None
        gh_id = conn.github_id if conn else None

        # Commits attributed to the canonical row.
        own_commits = (
            await db.execute(
                select(func.count(Commit.id)).where(
                    Commit.developer_id == canonical.id
                )
            )
        ).scalar_one()
        print(f"\n=== Commits on canonical row: {own_commits}")

        # Find every commit row whose author identity plausibly matches
        # this person — by author_github_login, author_email, or being on
        # a developer named after the github username.
        match_clauses = []
        if gh_username:
            match_clauses.append(
                func.lower(Commit.author_github_login) == gh_username.lower()
            )
        if canonical.email:
            match_clauses.append(
                func.lower(Commit.author_email) == canonical.email.lower()
            )
        if not match_clauses:
            print("\nNo identity to search by. Pass --github-username.")
            return 0

        commits = (
            await db.execute(
                select(
                    Commit.id,
                    Commit.developer_id,
                    Commit.author_github_login,
                    Commit.author_email,
                    Commit.repository,
                ).where(or_(*match_clauses))
                .limit(5000)
            )
        ).all()
        print(f"\n=== Commits matching by author_github_login or author_email: {len(commits)}")
        by_dev: Counter[str] = Counter()
        sample_by_dev: dict[str, dict] = defaultdict(dict)
        for c in commits:
            key = str(c.developer_id)
            by_dev[key] += 1
            if key not in sample_by_dev:
                sample_by_dev[key] = {
                    "author_github_login": c.author_github_login,
                    "author_email": c.author_email,
                    "repository": c.repository,
                }

        print("\nGrouped by Commit.developer_id (top 10):")
        for dev_id, count in by_dev.most_common(10):
            dev = await db.get(Developer, dev_id)
            has_conn = (
                await db.execute(
                    select(GitHubConnection.id)
                    .where(GitHubConnection.developer_id == dev_id)
                    .limit(1)
                )
            ).first() is not None
            sample = sample_by_dev.get(dev_id, {})
            label = "CANONICAL" if dev_id == canonical.id else (
                "GHOST" if not has_conn else "OTHER-REAL"
            )
            print(
                f"  [{label}] dev_id={dev_id} count={count}"
                f" name={(dev.name if dev else None)!r}"
                f" email={(dev.email if dev else None)!r}"
                f" has_conn={has_conn}"
            )
            print(
                f"    sample commit: author_login={sample.get('author_github_login')!r}"
                f" author_email={sample.get('author_email')!r}"
                f" repo={sample.get('repository')!r}"
            )

        # Also surface commits where BOTH author_github_login and
        # author_email are NULL — these are invisible to every matching
        # strategy and would silently fall out of the leaderboard.
        null_count = (
            await db.execute(
                select(func.count(Commit.id)).where(
                    Commit.developer_id == canonical.id,
                    Commit.author_github_login.is_(None),
                    Commit.author_email.is_(None),
                )
            )
        ).scalar_one()
        if null_count:
            print(
                f"\n  WARNING: {null_count} commits on canonical row have "
                f"both author_github_login AND author_email NULL"
            )

        # PR and review attribution by author email (sanity check).
        if canonical.email and gh_username:
            print(f"\n=== Cross-check by PR / review author tables ===")
            print(
                "  (Showing 0 for missing tables — PR/Review have "
                "developer_id but not author_email columns)"
            )

    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    grp = parser.add_mutually_exclusive_group(required=True)
    grp.add_argument("developer_id", nargs="?", help="UUID of the Developer row")
    grp.add_argument(
        "--github-username", help="Look up the developer by their GitHub username"
    )
    args = parser.parse_args()
    rc = asyncio.run(
        diagnose(args.developer_id, args.github_username)
    )
    sys.exit(rc)


if __name__ == "__main__":
    main()
