"""The tool surface a caller receives, and the grants that shape it.

Two properties are load-bearing and neither is obvious from reading the code:

  * a caller is offered *every* operation they can reach, via the generic
    discover/call pair plus a per-capability tool whose action enum names all of
    them — so nothing is stranded behind a tool nobody wrote;
  * a caller is offered *nothing* they cannot reach, because a tool they cannot
    use still costs selection accuracy on every call they do make.

The grant rule is the part worth guarding hardest: an MCP grant is the app grant
the workspace already made. It replaces ``AEXY_ENABLE_TEMPORAL``, an environment
variable the caller set on their own machine, which meant anyone holding an API
token decided their own access.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from aexy.models.app_definitions import (
    APP_CATALOG,
    SYSTEM_APP_BUNDLES,
    get_default_app_access_for_role,
)
from aexy.schemas.mcp import McpToolsResponse
from aexy.services.mcp_access_service import McpAccessService
from aexy.services.mcp_catalog import (
    CALL_TOOL,
    DISCOVER_TOOL,
    PLATFORM_CAPABILITIES,
    WORKFLOW_TOOLS,
    build_tools,
    capability_for,
)

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "mcp-catalog.generated.json"


@pytest.fixture(scope="module")
def catalog() -> dict:
    return json.loads(FIXTURE.read_text())


def _names(tools: list[dict]) -> set[str]:
    return {t["name"] for t in tools}


# ---------------------------------------------------------------------------
# Tool surface
# ---------------------------------------------------------------------------


def test_no_grants_means_no_tools(catalog):
    """Not even the generic pair: they would reach nothing and imply otherwise."""
    assert build_tools(catalog, set()) == []


def test_generic_tools_are_always_offered_when_anything_is_granted(catalog):
    tools = build_tools(catalog, {"mcp.sprints"})
    assert {DISCOVER_TOOL, CALL_TOOL} <= _names(tools)


def test_one_tool_per_granted_capability(catalog):
    granted = {"mcp.sprints", "mcp.crm", "mcp.docs"}
    tools = build_tools(catalog, granted)
    # Plus the named docs-workflow tools, which are shortcuts into `mcp.docs`
    # rather than capabilities of their own. This assertion passed while the
    # fixture was stale — the operations they resolve against were missing, so
    # they were silently withheld, which is the failure mode a named tool has.
    # Only the routines whose capability is granted: a docs caller gets the
    # docs routines, and the service-desk routines stay absent.
    workflow = {t["name"] for t in WORKFLOW_TOOLS if t["capability"] in granted}
    assert workflow, "the granted capabilities should carry at least one routine"
    assert _names(tools) == {
        DISCOVER_TOOL,
        CALL_TOOL,
        "aexy_sprints",
        "aexy_crm",
        "aexy_docs",
    } | workflow


def test_ungranted_capabilities_are_absent_not_disabled(catalog):
    """Present-but-unusable would still be paid for on every selection."""
    tools = build_tools(catalog, {"mcp.sprints"})
    assert "aexy_admin" not in _names(tools)
    assert all(t["capability"] in (None, "mcp.sprints") for t in tools)


def test_every_reachable_operation_is_nameable_without_discovery(catalog):
    """The action enum IS the coverage guarantee, so assert it covers the group."""
    granted = {"mcp.sprints", "mcp.tickets"}
    tools = build_tools(catalog, granted)
    by_capability = {g["capability"]: g for g in catalog["capabilities"]}

    for tool in tools:
        if tool["capability"] is None:
            continue
        expected = {op["action"] for op in by_capability[tool["capability"]]["operations"]}
        assert set(tool["input_schema"]["properties"]["action"]["enum"]) == expected
        assert len(tool["actions"]) == by_capability[tool["capability"]]["operation_count"]


def test_actions_are_unique_within_every_capability(catalog):
    """A collision would make one operation unaddressable through its tool."""
    for group in catalog["capabilities"]:
        actions = [op["action"] for op in group["operations"]]
        assert len(actions) == len(set(actions)), group["capability"]


def test_actions_are_short_enough_to_enumerate(catalog):
    """The enum is only affordable because names are short; guard the assumption."""
    for group in catalog["capabilities"]:
        for op in group["operations"]:
            assert len(op["action"]) < 80, op["action"]


def test_discover_is_scoped_to_granted_capabilities(catalog):
    tools = build_tools(catalog, {"mcp.sprints", "mcp.crm"})
    discover = next(t for t in tools if t["name"] == DISCOVER_TOOL)
    assert set(discover["input_schema"]["properties"]["capability"]["enum"]) == {
        "mcp.sprints",
        "mcp.crm",
    }


def test_invoking_tools_require_an_action(catalog):
    """Every tool that calls something needs to be told what. Discovery is the
    exception — it takes a query, because not knowing the action is the reason
    to reach for it."""
    routines = {t["name"] for t in WORKFLOW_TOOLS}
    for tool in build_tools(catalog, {"mcp.sprints"}):
        if tool["name"] in routines:
            # A routine binds its action; what it requires is its own flat
            # args. The workspace comes from the grant, so it is never asked for.
            assert "workspace_id" not in tool["input_schema"]["properties"], tool["name"]
            assert "workspace_id" not in tool["input_schema"]["required"], tool["name"]
            continue
        expected = ["query"] if tool["name"] == DISCOVER_TOOL else ["action"]
        assert tool["input_schema"]["required"] == expected, tool["name"]


# ---------------------------------------------------------------------------
# Grants
# ---------------------------------------------------------------------------


class _StubAccess:
    def __init__(self, apps: dict):
        self._apps = apps

    async def get_effective_access(self, workspace_id: str, developer_id: str):
        return {"apps": self._apps}


def _service(apps: dict) -> McpAccessService:
    service = McpAccessService(db=None)  # type: ignore[arg-type]
    service._access = _StubAccess(apps)  # type: ignore[assignment]
    return service


def _app(*, can_access: bool, modules: dict | None = None) -> dict:
    return {"can_access": can_access, "enabled": can_access, "modules": modules or {}}


@pytest.mark.asyncio
async def test_app_access_is_the_mcp_grant():
    """No second permission model: holding the app is holding the capability."""
    service = _service(
        {
            "sprints": _app(can_access=True),
            "crm": _app(can_access=False),
        }
    )
    granted = await service.get_granted_capabilities("ws", "dev")
    assert "mcp.sprints" in granted
    assert "mcp.crm" not in granted


@pytest.mark.asyncio
async def test_platform_capabilities_need_the_mcp_app_and_its_module():
    """They are not apps, so they live as modules and require both to be true."""
    service = _service({"mcp": _app(can_access=True, modules={"platform": True, "admin": False})})
    granted = await service.get_granted_capabilities("ws", "dev")
    assert "mcp.platform" in granted
    assert "mcp.admin" not in granted


@pytest.mark.asyncio
async def test_platform_modules_are_dead_without_the_mcp_app():
    """A module on an app you cannot reach must not grant anything."""
    service = _service({"mcp": _app(can_access=False, modules={"platform": True, "admin": True})})
    granted = await service.get_granted_capabilities("ws", "dev")
    assert granted == set()


@pytest.mark.asyncio
async def test_the_mcp_app_itself_is_not_a_capability():
    """`mcp` is where platform modules hang, not a surface of its own.

    Emitting `mcp.mcp` would be a capability the catalogue never produces, so a
    tool for it could never be built — silently misleading rather than harmless.
    """
    service = _service({"mcp": _app(can_access=True, modules={})})
    granted = await service.get_granted_capabilities("ws", "dev")
    assert "mcp.mcp" not in granted


@pytest.mark.asyncio
async def test_grants_use_can_access_not_enabled():
    """`enabled` is sidebar placement; `can_access` is what the API will honour.

    An admin keeps a profile-shaped sidebar while still being able to administer
    an app, so a tool list built from `enabled` would hide tools whose calls
    would in fact succeed.
    """
    service = _service({"reports": {"can_access": True, "enabled": False, "modules": {}}})
    granted = await service.get_granted_capabilities("ws", "dev")
    assert granted == {"mcp.reports"}


@pytest.mark.asyncio
async def test_an_app_can_resolve_to_a_capability_that_does_not_exist(catalog):
    """`community` and `dashboard` are apps no router is tagged with.

    The resolver has no catalogue to check against, so it cannot know that. This
    pins the behaviour so the intersection below is understood as necessary
    rather than defensive.
    """
    service = _service({"community": _app(can_access=True)})
    granted = await service.get_granted_capabilities("ws", "dev")

    assert granted == {"mcp.community"}
    assert build_tools(catalog, granted) == []


@pytest.mark.asyncio
async def test_holding_every_app_offers_exactly_the_catalogue(catalog):
    """Grant every app there is; what is reported must be what can be built.

    Derived from APP_CATALOG rather than from the catalogue — deriving the apps
    from the catalogue is exactly what let a live response report `mcp.community`
    and `mcp.dashboard` as granted with no tool behind them. The test could not
    fail, because it only ever granted apps the catalogue already knew.
    """
    apps = {app_id: _app(can_access=True) for app_id in APP_CATALOG if app_id != "mcp"}
    apps["mcp"] = _app(can_access=True, modules=dict.fromkeys(PLATFORM_CAPABILITIES, True))

    held = await _service(apps).get_granted_capabilities("ws", "dev")
    known = {g["capability"] for g in catalog["capabilities"]}

    # Holding everything must reach everything...
    assert known <= held
    # ...and the reported set is the intersection the endpoint applies.
    reported = held & known
    assert reported == known
    # + discover + call + the named docs-workflow shortcuts
    assert len(build_tools(catalog, reported)) == len(known) + 2 + len(WORKFLOW_TOOLS)


# ---------------------------------------------------------------------------
# Bundle defaults
# ---------------------------------------------------------------------------


def test_every_bundle_states_every_mcp_module():
    """AppAccessService._resolve treats an *absent* module as granted.

    That default is deliberate and right for an ordinary sub-page — "a new
    module quietly disappearing for everyone is worse than it quietly
    appearing". It is wrong for these three, which exist precisely to gate
    workspace administration, and the failure is silent: adding a module to the
    `mcp` app without touching the bundles grants it to everybody.

    That is not hypothetical. It shipped, and a live call as an ordinary member
    returned `aexy_platform` and `aexy_admin` — 191 operations over workspaces,
    teams, members, roles, invites and API tokens — before this test existed.
    """
    declared = set(APP_CATALOG["mcp"].get("modules") or {})
    assert declared, "the mcp app should declare the appless capabilities"

    for bundle_id, bundle in SYSTEM_APP_BUNDLES.items():
        stated = set((bundle["apps"]["mcp"].get("modules") or {}))
        assert stated == declared, (
            f"bundle {bundle_id!r} does not state {sorted(declared - stated)} for "
            "the `mcp` app, so the resolver will grant them by default"
        )


def test_only_the_full_access_bundle_grants_workspace_administration():
    """A developer or viewer falls back to `engineering`; it must not administer."""
    for bundle_id in ("engineering", "people", "business"):
        modules = SYSTEM_APP_BUNDLES[bundle_id]["apps"]["mcp"]["modules"]
        assert not any(modules.values()), f"{bundle_id} grants {modules}"

    assert all(SYSTEM_APP_BUNDLES["full_access"]["apps"]["mcp"]["modules"].values())


def test_the_roles_that_fall_back_to_engineering_get_no_admin_surface():
    """Pins the mapping, not just the bundle: `member` must land somewhere safe."""
    for role in ("member", "developer", "viewer"):
        apps = get_default_app_access_for_role(role)
        assert not any(apps["mcp"]["modules"].values()), role


# ---------------------------------------------------------------------------
# Response shape
# ---------------------------------------------------------------------------


def _response_for(catalog: dict, granted: set[str]) -> McpToolsResponse:
    """Mirror what the endpoint assembles, minus auth and the DB."""
    groups = catalog["capabilities"]
    return McpToolsResponse(
        workspace_id="ws-1",
        catalog_version=catalog["catalog_version"],
        granted_capabilities=sorted(granted),
        denied_capabilities=[
            {
                "capability": g["capability"],
                "operation_count": g["operation_count"],
                "reason": "not_granted_app" if g["app"] else "not_granted_mcp_module",
            }
            for g in groups
            if g["capability"] not in granted
        ],
        reachable_operation_count=sum(
            g["operation_count"] for g in groups if g["capability"] in granted
        ),
        total_operation_count=sum(g["operation_count"] for g in groups),
        tools=build_tools(catalog, granted),
    )


def test_built_tools_satisfy_the_response_schema(catalog):
    """build_tools emits plain dicts, so nothing else checks they fit McpTool.

    A drifted key would surface as a 500 from the endpoint rather than a failure
    here, and only for callers whose grants happen to include the bad tool.
    """
    response = _response_for(catalog, {"mcp.sprints", "mcp.crm"})
    payload = response.model_dump()

    routines = {t["name"] for t in WORKFLOW_TOOLS if t["capability"] in {"mcp.sprints", "mcp.crm"}}
    assert {t["name"] for t in payload["tools"]} == {
        DISCOVER_TOOL,
        CALL_TOOL,
        "aexy_sprints",
        "aexy_crm",
    } | routines
    sprints = next(t for t in payload["tools"] if t["name"] == "aexy_sprints")
    assert sprints["capability"] == "mcp.sprints"
    assert sprints["actions"] and sprints["actions"][0]["method"]


def test_denied_capabilities_account_for_everything_not_granted(catalog):
    """The counts are what an admin reads to decide what to grant; they must add up."""
    granted = {"mcp.sprints"}
    response = _response_for(catalog, granted)

    assert len(response.denied_capabilities) == len(catalog["capabilities"]) - 1
    assert response.reachable_operation_count + sum(
        d.operation_count for d in response.denied_capabilities
    ) == response.total_operation_count


def test_a_caller_with_everything_is_denied_nothing(catalog):
    everything = {g["capability"] for g in catalog["capabilities"]}
    response = _response_for(catalog, everything)

    assert response.denied_capabilities == []
    assert response.reachable_operation_count == response.total_operation_count


# ---------------------------------------------------------------------------
# Tag resolution
# ---------------------------------------------------------------------------


def test_generic_tag_yields_to_a_specific_one():
    """Normalisation collides api/webhooks.py with the Jira/Linear receivers.

    Both arrive as "webhooks"; only the specific tag decides.
    """
    capability, unmapped = capability_for(["integration-webhooks", "Webhooks"])
    assert capability == "integrations"
    assert unmapped == []


def test_generic_tag_is_used_when_it_is_all_there_is():
    assert capability_for(["webhooks"])[0] == "automations"


def test_public_wins_over_an_app_tag():
    """A public router mounted under an app tag is anonymous first."""
    assert capability_for(["public-forms", "Forms"])[0] == "public"


def test_unknown_tags_are_reported_not_guessed():
    capability, unmapped = capability_for(["some-brand-new-router"])
    assert capability is None
    assert unmapped == ["some_brand_new_router"]
