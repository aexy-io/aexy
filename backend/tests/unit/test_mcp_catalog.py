"""The MCP catalogue must cover the whole API and stay inside the access model.

Two properties matter, and neither held before this existed.

**Coverage.** The MCP server exposed ~218 of ~1900 operations through 27
hand-written tools whose URL paths were typed out by hand in a separate repo.
Four of those tools were dead — `aexy_developer_insights` called
`/workspaces/{id}/developer-insights` when the router is mounted at `/insights`,
`aexy_tables` called `/rows` when the routes are `/records`, `aexy_gtm_leads`
called a module that does not exist at all, and `aexy_agents` called `/execute`
when the route is `/run`. No test could catch that, because nothing tied the
tools to the routes. The catalogue is generated from the app's own OpenAPI
schema, so a path it names is a path that exists, by construction.

**Access.** Every operation must carry the capability that governs it, so the
MCP server can offer a caller only what they can reach. An operation whose tag
has no capability is an operation outside the access model — this fails on it
rather than letting it default to reachable-by-anyone or silently vanish.

Regenerate with `python scripts/dump_mcp_catalog.py`.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from aexy.models.app_definitions import APP_CATALOG

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "mcp-catalog.generated.json"


@pytest.fixture(scope="module")
def catalog() -> dict:
    return json.loads(FIXTURE.read_text())


def _capabilities(catalog: dict) -> list[dict]:
    return catalog["capabilities"]


def test_fixture_is_a_version_this_test_understands(catalog):
    assert catalog["catalog_version"] == 1
    assert _capabilities(catalog), "catalogue is empty"


def test_every_tag_maps_to_a_capability(catalog):
    """An unmapped tag means operations nobody decided the access story for."""
    assert catalog["unmapped_tags"] == [], (
        f"{len(catalog['unmapped_tags'])} tag(s) have no capability, leaving "
        f"{catalog['unmapped_operation_count']} operation(s) outside the access "
        f"model: {catalog['unmapped_tags']}. Add them to TAG_TO_CAPABILITY in "
        "scripts/dump_mcp_catalog.py."
    )
    assert catalog["unmapped_operation_count"] == 0


def test_capabilities_are_well_formed(catalog):
    for cap in _capabilities(catalog):
        assert cap["capability"].startswith("mcp."), cap["capability"]
        assert cap["operation_count"] == len(cap["operations"]), cap["capability"]
        assert cap["operation_count"] > 0, f"{cap['capability']} has no operations"


def test_app_backed_capabilities_name_a_real_app(catalog):
    """Most capabilities ARE an app, so an MCP grant is the app grant already made.

    Keeping them identical is the point: it means there is no second access
    model to keep in sync with the first.
    """
    for cap in _capabilities(catalog):
        if cap["app"] is None:
            continue  # platform/admin/integrations — deliberately not apps
        assert cap["app"] in APP_CATALOG, (
            f"{cap['capability']} claims app {cap['app']!r}, which is not in "
            "APP_CATALOG. Either add the app or map its tags to a platform "
            "capability in scripts/dump_mcp_catalog.py."
        )
        assert cap["capability"] == f"mcp.{cap['app']}"


def test_every_capability_is_grantable(catalog):
    """A capability has to be grantable somewhere, and there are two places.

    Most ARE an app — holding `sprints` is what grants `mcp.sprints`, so the app
    grant is the MCP grant and there is no second access model to keep in sync.
    The rest were never apps, so they are modules on the `mcp` app.

    A capability in neither place is reachable by everyone or by no one
    depending on which way the resolver happens to default, which is exactly the
    failure `AEXY_ENABLE_TEMPORAL` had — a gate that gated nothing.
    """
    mcp_modules = set((APP_CATALOG["mcp"].get("modules") or {}).keys())
    for cap in _capabilities(catalog):
        cap_id = cap["capability"].removeprefix("mcp.")
        grantable = cap_id in APP_CATALOG or cap_id in mcp_modules
        assert grantable, (
            f"{cap['capability']} ({cap['operation_count']} operations) cannot be "
            "granted: it is neither an app in APP_CATALOG nor a module on the "
            "`mcp` app. Add it to one of them."
        )


def test_no_mcp_module_grants_a_capability_that_does_not_exist(catalog):
    """The other direction: a module nothing maps to grants nothing, silently."""
    known = {c["capability"].removeprefix("mcp.") for c in _capabilities(catalog)}
    for module_id in (APP_CATALOG["mcp"].get("modules") or {}):
        assert module_id in known, (
            f"`mcp` app declares module {module_id!r}, but no capability by that "
            "name exists, so granting it does nothing. Remove it or map tags to it."
        )


def test_platform_capabilities_are_the_only_appless_ones(catalog):
    appless = {c["capability"] for c in _capabilities(catalog) if c["app"] is None}
    assert appless == {"mcp.platform", "mcp.admin", "mcp.integrations"}, (
        "A capability without an app is a surface nobody can grant through the "
        f"app-access UI. Got {sorted(appless)}."
    )


def test_admin_is_flagged_privileged(catalog):
    """Billing, plans, rate limits and platform admin must not ride along.

    They are the surfaces where a wrongly-granted tool does lasting damage, so
    they are marked for the resolver to default off rather than inherit.
    """
    privileged = {c["capability"] for c in _capabilities(catalog) if c["privileged"]}
    assert privileged == {"mcp.admin"}


def test_operations_are_addressable_and_described(catalog):
    for cap in _capabilities(catalog):
        for op in cap["operations"]:
            assert op["operation_id"], f"{cap['capability']} has an operation with no id"
            assert op["path"].startswith("/"), op["path"]
            assert op["method"] in {"GET", "POST", "PUT", "PATCH", "DELETE"}, op["method"]
            assert op["summary"], f"{op['operation_id']} has no summary — a model cannot pick it"


def test_mutating_flag_matches_the_http_method(catalog):
    """Drives read-only token scopes, so it cannot be decorative."""
    for cap in _capabilities(catalog):
        for op in cap["operations"]:
            assert op["mutating"] == (op["method"] != "GET"), op["operation_id"]


def test_public_and_system_surfaces_stay_out(catalog):
    """Anonymous and machine-facing routes have no business on a user's token.

    The public routers answer to unauthenticated visitors; calling them as a
    developer misrepresents who is asking. `system` is liveness and ingest.
    """
    exposed = {c["capability"] for c in _capabilities(catalog)}
    assert "mcp.public" not in exposed
    assert "mcp.system" not in exposed
    assert catalog["excluded"], "nothing was excluded — the filter silently stopped working"


def test_no_duplicate_operation_ids(catalog):
    """An id collision makes one of two distinct handlers unaddressable.

    One pair existed: `/integrations/google-calendar/calendars` and
    `/integrations/google/calendar/calendars` are different handlers — one on
    GoogleCalendarService, one on CalendarSyncService — whose paths collide once
    "-" and "/" both normalise to "_". Both answer over HTTP, but anything
    addressing an operation by id reaches only whichever resolves first. Fixed
    by an explicit operation_id in google_integration.py; FastAPI only warns
    about this, so assert it rather than trusting build output.
    """
    duplicates = catalog["duplicate_operation_ids"]
    assert duplicates == {}, (
        "Duplicate operation ids — these routes cannot be addressed by id. Give "
        "one an explicit operation_id on its route decorator: "
        f"{json.dumps(duplicates, indent=2)}"
    )


def test_catalogue_covers_the_whole_api(catalog):
    """The headline property: everything is reachable, nothing is stranded."""
    total = sum(c["operation_count"] for c in _capabilities(catalog))
    excluded = sum(catalog["excluded"].values())
    # Guards against a mapping change that quietly strands a large surface.
    assert total > 1800, f"only {total} operations mapped — did a mapping break?"
    assert excluded < total * 0.1, "suspiciously large excluded set"
