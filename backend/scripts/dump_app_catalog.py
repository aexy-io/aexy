"""Dump the app catalogue and the system bundles to a JSON file.

``models/app_definitions.py`` and ``frontend/src/config/appDefinitions.ts`` are
two hand-written copies of one decision, and CLAUDE.md says they must stay in
sync. They didn't. Every bundle disagreed about five apps:

* ``service_desk`` was granted by all four frontend bundles and none of the
  backend's, so a department put on the Engineering profile could not reach the
  Service Desk while the editor's own "Start from Engineering" grid said it could;
* ``chat``, ``community``, ``gtm`` and ``leave`` were granted by all four backend
  bundles and none of the frontend's, so filling that same grid from a bundle
  silently revoked four apps from everyone in the department.

Neither side raised anything. Which apps a role or department profile granted
simply depended on which file the code path happened to read.

This is the backend's answer, written out; ``frontend/src/test/appCatalogParity.test.ts``
asserts the TypeScript matches it. The backend is the authority because it is the
side that is enforced — the resolver and the role fallback read
``SYSTEM_APP_BUNDLES``, and a frontend that disagrees is a frontend that lies.

When run via ``docker exec`` the frontend tree isn't mounted in the container, so
pipe stdout to the host path:

    docker exec aexy-backend python scripts/dump_app_catalog.py \\
        --out - > frontend/src/test/fixtures/app-catalog.generated.json

Run on the host with the backend venv active, the default ``--out`` is already
correct. Use ``--check`` in CI to verify the committed fixture is current.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from aexy.models.app_definitions import APP_CATALOG, SYSTEM_APP_BUNDLES


DEFAULT_OUT = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "src"
    / "test"
    / "fixtures"
    / "app-catalog.generated.json"
)


def build_payload() -> dict:
    """Only the fields both sides are expected to agree on.

    Descriptions, icons and colours are deliberately excluded: they are copy, they
    differ harmlessly today, and pinning them would turn a wording tweak into a
    cross-language failure that teaches people to regenerate without reading.

    Module *ids* are compared but not their labels, for the same reason. An app or
    module existing on one side and not the other is the thing that breaks access
    resolution.
    """
    return {
        "_meta": {
            "source": "backend/src/aexy/models/app_definitions.py",
            "generator": "backend/scripts/dump_app_catalog.py",
            "mirror": "frontend/src/config/appDefinitions.ts",
        },
        "apps": {
            app_id: {
                "name": app["name"],
                "category": getattr(app["category"], "value", app["category"]),
                "base_route": app.get("base_route"),
                "required_permission": app.get("required_permission"),
                "modules": sorted((app.get("modules") or {}).keys()),
            }
            for app_id, app in sorted(APP_CATALOG.items())
        },
        "bundles": {
            bundle_id: {
                "name": bundle["name"],
                # Absent and `enabled: false` mean the same thing to every reader,
                # so only the granted apps are listed — otherwise the fixture would
                # fail on a stylistic difference in how each side spells "no".
                "apps": {
                    app_id: {"modules": sorted((config.get("modules") or {}).keys())}
                    for app_id, config in sorted((bundle.get("apps") or {}).items())
                    if config.get("enabled")
                },
            }
            for bundle_id, bundle in sorted(SYSTEM_APP_BUNDLES.items())
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
    summary = (
        f"{len(payload['apps'])} apps, {len(payload['bundles'])} bundles, "
        f"{sum(len(b['apps']) for b in payload['bundles'].values())} bundle grants"
    )

    if args.check:
        out_path = Path(args.out)
        if not out_path.exists():
            print(f"check: {out_path} does not exist", file=sys.stderr)
            return 1
        if out_path.read_text() != encoded:
            print(
                f"check: {out_path} is stale — re-run "
                "`python scripts/dump_app_catalog.py` and commit.",
                file=sys.stderr,
            )
            return 1
        print(f"check: {out_path} up to date ({summary}).", file=sys.stderr)
        return 0

    if args.out == "-":
        # Progress to stderr so stdout stays pure JSON for the docker-pipe usage.
        sys.stdout.write(encoded)
        print(f"wrote {summary} → stdout", file=sys.stderr)
        return 0

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(encoded)
    print(f"wrote {summary} → {out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
