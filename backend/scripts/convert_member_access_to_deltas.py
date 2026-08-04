#!/usr/bin/env python
"""Convert v1 member access snapshots into v2 deltas.

Member app access used to be stored as a full snapshot of every app. That meant
that toggling one app for one person froze all their other apps forever: the
snapshot said something definite about all 28, so no later change to their
department's profile could ever reach them.

v2 stores only the differences from the member's baseline, so everything an admin
didn't decide keeps inheriting. The resolver still reads v1 rows — a v1 snapshot
*is* an explicit decision about every app, so leaving one alone changes nobody's
access — but such members stay pinned until the row is rewritten. This script
rewrites them: it resolves each member's baseline (their departments' profiles,
or their role bundle), diffs the snapshot against it, and keeps only what
differs.

Deliberately not a SQL migration: the diff needs the resolver, which needs the
department profiles, the system bundles and the role mapping. Expressing that in
SQL would mean duplicating the resolution rules in a second language — the exact
failure this change set spent its time undoing elsewhere.

Usage:
    docker exec aexy-backend python scripts/convert_member_access_to_deltas.py --dry-run
    docker exec aexy-backend python scripts/convert_member_access_to_deltas.py
    docker exec aexy-backend python scripts/convert_member_access_to_deltas.py --workspace <id>
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from sqlalchemy import select  # noqa: E402

from aexy.core.database import get_async_session  # noqa: E402
from aexy.models.workspace import WorkspaceMember  # noqa: E402
from aexy.services.app_access_service import (  # noqa: E402
    AppAccessService,
    MEMBER_ACCESS_VERSION,
)


def _is_v1(permissions: dict | None) -> bool:
    """A row that predates the version marker and carries a full snapshot."""
    if not permissions:
        return False
    if permissions.get("version") == MEMBER_ACCESS_VERSION:
        return False
    if "overrides" in permissions:
        return False
    # Either the {"apps": {...}} generation or the oldest {"app": bool} one.
    return bool(permissions.get("apps")) or any(
        isinstance(value, bool) for value in permissions.values()
    )


async def convert(workspace_id: str | None, dry_run: bool) -> int:
    """Rewrite every v1 row. Returns the number of members changed."""
    changed = 0

    async with get_async_session() as session:
        service = AppAccessService(session)

        stmt = select(WorkspaceMember).where(WorkspaceMember.status == "active")
        if workspace_id:
            stmt = stmt.where(WorkspaceMember.workspace_id == workspace_id)
        members = list((await session.execute(stmt)).scalars().all())

        print(f"Scanning {len(members)} active members…")

        for member in members:
            permissions = member.app_permissions
            if not _is_v1(permissions):
                continue

            snapshot, applied_template_id, _ = service._read_member_overrides(member)
            baseline = await service._resolve_baseline(
                str(member.workspace_id),
                str(member.developer_id),
                applied_template_id,
            )

            # The snapshot is a full picture, so diffing it against the baseline
            # yields exactly the decisions that actually differ.
            full_config = {
                app_id: {
                    "enabled": bool(config.get("enabled", False)),
                    "modules": config.get("modules") or {},
                }
                for app_id, config in snapshot.items()
                if isinstance(config, dict)
            }
            overrides = service._diff_against_baseline(full_config, baseline)

            new_permissions = service._build_member_permissions(
                overrides,
                applied_template_id=applied_template_id,
                reasons=None,
                # Attribution would be a lie: nobody made this decision today,
                # the script only re-expressed an old one.
                actor_id=None,
            )

            before = len(full_config)
            after = len(overrides)
            print(
                f"  {member.developer_id} in {member.workspace_id}: "
                f"{before} pinned apps -> {after} override(s)"
                + ("" if after else "  (now fully inherited)")
            )

            if not dry_run:
                member.app_permissions = new_permissions
            changed += 1

        if dry_run:
            print(f"\nDry run: {changed} member(s) would be converted. No writes made.")
            return changed

        await session.commit()

    print(f"\nConverted {changed} member(s).")
    if changed:
        # The caches are per-process and this script is its own process, so it
        # cannot clear the API workers' copies directly.
        print(
            "Resolved access is cached for a few seconds per member; restart the "
            "API workers if you want the change reflected instantly."
        )
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would change without writing",
    )
    parser.add_argument(
        "--workspace",
        help="Limit to one workspace id",
    )
    args = parser.parse_args()

    asyncio.run(convert(args.workspace, args.dry_run))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
