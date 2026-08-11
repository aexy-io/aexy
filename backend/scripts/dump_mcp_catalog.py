"""Render the MCP operation catalogue to a fixture, and check it stays current.

The catalogue itself lives in ``aexy.services.mcp_catalog`` — the same module
the ``/mcp/tools`` endpoint resolves against, so the fixture CI checks and the
tool list a client receives cannot disagree. This script is only the CLI.

    python scripts/dump_mcp_catalog.py            # write the fixture
    python scripts/dump_mcp_catalog.py --out -    # stdout
    python scripts/dump_mcp_catalog.py --check    # CI: fail if stale or unmapped
    python scripts/dump_mcp_catalog.py --report   # coverage summary

``--check`` also fails when a tag has no capability, so a new router cannot land
outside the access model without someone deciding where it belongs.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from aexy.services.mcp_catalog import build_catalog  # noqa: E402

DEFAULT_OUT = (
    Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "mcp-catalog.generated.json"
)


def load_schema(from_file: str | None) -> dict:
    """Build the schema in-process by default, so CI needs no running server."""
    if from_file:
        return json.loads(Path(from_file).read_text())
    from aexy.main import create_app

    return create_app().openapi()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="output path, or - for stdout")
    parser.add_argument("--check", action="store_true", help="fail if stale or unmapped")
    parser.add_argument("--report", action="store_true", help="print a coverage summary")
    parser.add_argument("--from-file", help="read an openapi.json instead of building it")
    args = parser.parse_args()

    catalog = build_catalog(load_schema(args.from_file))
    serialized = json.dumps(catalog, indent=2, sort_keys=False) + "\n"

    total = sum(c["operation_count"] for c in catalog["capabilities"])
    excluded = sum(catalog["excluded"].values())

    if args.report:
        print(f"{'capability':28} {'ops':>5}")
        for cap in sorted(catalog["capabilities"], key=lambda c: -c["operation_count"]):
            flag = " (privileged)" if cap["privileged"] else ""
            print(f"{cap['capability']:28} {cap['operation_count']:5}{flag}")
        print(f"\n{total} operations across {len(catalog['capabilities'])} capabilities")
        print(f"{excluded} excluded (public/system): {catalog['excluded']}")
        if catalog["duplicate_operation_ids"]:
            print(f"\nDUPLICATE operation ids ({len(catalog['duplicate_operation_ids'])}):")
            for op_id, routes in catalog["duplicate_operation_ids"].items():
                print(f"  {op_id}")
                for route in routes:
                    print(f"      {route}")
        if catalog["unmapped_tags"]:
            print(f"\nUNMAPPED TAGS ({len(catalog['unmapped_tags'])}):")
            for tag in catalog["unmapped_tags"]:
                print(f"  {tag}")
            print(f"{catalog['unmapped_operation_count']} operations unreachable")
        return 0

    if catalog["unmapped_tags"]:
        print(
            f"✗ {len(catalog['unmapped_tags'])} tag(s) have no capability, leaving "
            f"{catalog['unmapped_operation_count']} operation(s) outside the access model:",
            file=sys.stderr,
        )
        for tag in catalog["unmapped_tags"]:
            print(f"    {tag}", file=sys.stderr)
        print(
            "  Add them to TAG_TO_CAPABILITY in src/aexy/services/mcp_catalog.py.",
            file=sys.stderr,
        )
        return 1

    if args.out == "-":
        print(serialized, end="")
        return 0

    out = Path(args.out)
    if args.check:
        current = out.read_text() if out.exists() else ""
        if current != serialized:
            print(
                f"✗ {out.name} is stale. Run: python scripts/dump_mcp_catalog.py",
                file=sys.stderr,
            )
            return 1
        print(
            f"✓ MCP catalogue current — {total} operations, "
            f"{len(catalog['capabilities'])} capabilities"
        )
        return 0

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(serialized)
    print(f"  Wrote {total} operations across {len(catalog['capabilities'])} capabilities → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
