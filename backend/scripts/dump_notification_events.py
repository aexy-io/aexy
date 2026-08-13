"""Dump the notification event catalogue to a JSON fixture.

The backend declares every notification event, its category and its channel
defaults; the frontend settings screen holds a *hand-written* label and
description per event. Nothing connected the two, and they drifted — three
backend events (``campaign_send_blocked``, ``review_cycle_activated``,
``review_deadline_reminder``) had no frontend entry at all, so their rows in
notification settings rendered as a de-underscored slug.

The failure is quiet by construction: a missing label degrades to
``eventType.replace(/_/g, " ")``, which looks deliberate enough that nobody
files it. Meanwhile a *category* missing from ``CATEGORY_LABELS`` drops the
master toggle's heading entirely.

This is the backend's answer, written out;
``frontend/src/test/notificationEventParity.test.ts`` asserts the TypeScript
covers it. The backend is the authority because it is the side that decides
what can ever be delivered — a frontend row for an event the backend does not
have is a toggle that controls nothing.

When run via ``docker exec`` the frontend tree isn't mounted in the container, so
pipe stdout to the host path:

    docker exec aexy-backend python scripts/dump_notification_events.py \\
        --out - > frontend/src/test/fixtures/notification-events.generated.json

Run on the host with the backend venv active, the default ``--out`` is already
correct. Use ``--check`` in CI to verify the committed fixture is current.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from aexy.models.notification import (
    DEFAULT_NOTIFICATION_PREFERENCES,
    EVENT_TYPE_TO_CATEGORY,
    NOTIFICATION_CATEGORIES,
    NotificationEventType,
)

DEFAULT_OUT = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "src"
    / "test"
    / "fixtures"
    / "notification-events.generated.json"
)


def build_payload() -> dict:
    """Event ids, their category, and their channel defaults.

    Labels and descriptions are deliberately excluded — they are copy, they only
    exist on the frontend, and pinning them here would turn a wording tweak into
    a cross-language failure that teaches people to regenerate without reading.
    What matters is that every event the backend can emit has *somewhere* to be
    switched off.
    """
    return {
        "_meta": {
            "source": "backend/src/aexy/models/notification.py",
            "generator": "backend/scripts/dump_notification_events.py",
            "mirror": "frontend/src/app/(app)/settings/notifications/page.tsx",
        },
        "categories": sorted(NOTIFICATION_CATEGORIES.keys()),
        "events": {
            event.value: {
                "category": EVENT_TYPE_TO_CATEGORY.get(event.value),
                "defaults": DEFAULT_NOTIFICATION_PREFERENCES.get(event, {}),
            }
            for event in sorted(NotificationEventType, key=lambda e: e.value)
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        default=str(DEFAULT_OUT),
        help=f"Output JSON path, or '-' for stdout (default: {DEFAULT_OUT})",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero if the on-disk file differs from what would be written.",
    )
    args = parser.parse_args()

    payload = build_payload()
    encoded = json.dumps(payload, indent=2) + "\n"
    summary = f"{len(payload['events'])} events, {len(payload['categories'])} categories"

    if args.check:
        out_path = Path(args.out)
        if not out_path.exists():
            print(f"check: {out_path} does not exist", file=sys.stderr)
            return 1
        if out_path.read_text() != encoded:
            print(
                f"check: {out_path} is stale — re-run "
                f"`python scripts/dump_notification_events.py`",
                file=sys.stderr,
            )
            return 1
        print(f"check: fixture is current ({summary})")
        return 0

    if args.out == "-":
        sys.stdout.write(encoded)
        return 0

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(encoded)
    print(f"wrote {out_path} ({summary})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
