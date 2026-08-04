"""The committed app-catalogue fixture must match the live definitions.

``frontend/src/test/appCatalogParity.test.ts`` asserts the TypeScript catalogue
matches ``frontend/src/test/fixtures/app-catalog.generated.json``. That only means
anything if the fixture itself still matches the Python it was generated from —
otherwise adding an app on the backend and forgetting to regenerate would leave
both sides passing while the two files disagree, which is exactly the failure the
fixture exists to catch.

So: this test is the other half. The frontend test compares TS against the
fixture; this compares the fixture against ``app_definitions.py``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from dump_app_catalog import DEFAULT_OUT, build_payload  # noqa: E402


def test_the_committed_fixture_is_current():
    if not DEFAULT_OUT.exists():
        pytest.skip(f"{DEFAULT_OUT} is not present (frontend tree not checked out)")

    on_disk = json.loads(DEFAULT_OUT.read_text())
    expected = build_payload()

    assert on_disk == expected, (
        "frontend/src/test/fixtures/app-catalog.generated.json is stale — run "
        "`python scripts/dump_app_catalog.py` and commit the result."
    )


def test_every_bundle_grants_only_catalogued_apps():
    """Checked on this side too, not only in the frontend test.

    A bundle granting an app the catalogue doesn't describe is what
    ``get_default_app_access_for_role`` hands to the resolver, so the bad value
    reaches access decisions whether or not any frontend runs.
    """
    from aexy.models.app_definitions import APP_CATALOG, SYSTEM_APP_BUNDLES

    for bundle_id, bundle in SYSTEM_APP_BUNDLES.items():
        for app_id, config in (bundle.get("apps") or {}).items():
            assert app_id in APP_CATALOG, f"{bundle_id} grants unknown app {app_id!r}"
            known = set((APP_CATALOG[app_id].get("modules") or {}).keys())
            unknown = set((config.get("modules") or {}).keys()) - known
            assert not unknown, f"{bundle_id}.{app_id} toggles unknown modules {sorted(unknown)}"
