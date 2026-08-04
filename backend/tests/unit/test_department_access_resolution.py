"""Unit tests for department-centric access resolution.

Covers the resolution chain in ``AppAccessService.get_effective_access``:
workspace toggle -> department profile (union of grants) -> role fallback ->
member override deltas, plus the two distinctions the whole design rests on —
``enabled`` (navigation) vs ``can_access`` (enforcement), and "configured" vs
"defaulted".
"""

from types import SimpleNamespace

import pytest

from aexy.services.app_access_service import (
    AppAccessService,
    MEMBER_ACCESS_VERSION,
    SOURCE_DEPARTMENT,
    SOURCE_MEMBER_OVERRIDE,
    SOURCE_MEMBER_TEMPLATE,
    SOURCE_ROLE_FALLBACK,
    SOURCE_WORKSPACE_DISABLED,
    clear_app_settings_cache,
    clear_effective_access_cache,
    union_app_configs,
)


@pytest.fixture(autouse=True)
def _clear_caches():
    """Both caches are module-level state; isolate every test."""
    clear_app_settings_cache()
    clear_effective_access_cache()
    yield
    clear_app_settings_cache()
    clear_effective_access_cache()


def _department(name, app_config=None, is_primary=False, persona=None, slug=None):
    dept = SimpleNamespace(
        id=f"dept-{name.lower()}",
        name=name,
        app_config=app_config or {},
        access_profile_slug=slug,
        default_persona=persona,
    )
    dept._is_primary = is_primary
    return dept


def _member(role="member", app_permissions=None):
    return SimpleNamespace(
        role=role,
        status="active",
        custom_role=None,
        app_permissions=app_permissions,
        developer_id="dev-1",
    )


def _service(monkeypatch, *, member, departments=(), workspace_settings=None, templates=None):
    """An AppAccessService with its four database reads stubbed out.

    Stubbing rather than seeding real rows keeps these tests about the
    resolution rules; the API-level tests exercise the queries.
    """
    svc = AppAccessService(db=None)
    templates = templates or {}

    async def fake_member(_ws, _dev):
        return member

    async def fake_workspace(_ws):
        return SimpleNamespace(settings=workspace_settings or {})

    async def fake_departments(_ws, _dev):
        return list(departments)

    async def fake_template(template_id):
        return templates.get(template_id)

    monkeypatch.setattr(svc, "_get_workspace_member", fake_member)
    monkeypatch.setattr(svc, "_get_workspace", fake_workspace)
    monkeypatch.setattr(svc, "_get_member_departments", fake_departments)
    monkeypatch.setattr(svc, "_get_template", fake_template)
    return svc


SALES_PROFILE = {
    "crm": {"enabled": True, "modules": {"inbox": True, "agents": False}},
    "email_marketing": {"enabled": True, "modules": {}},
    "sprints": {"enabled": False},
}
SUPPORT_PROFILE = {
    "crm": {"enabled": True, "modules": {"agents": True}},
    "tickets": {"enabled": True, "modules": {}},
}


# ==================== union of grants ====================


def test_union_merges_module_grants_across_departments():
    merged = union_app_configs([SALES_PROFILE, SUPPORT_PROFILE])
    # Sales withholds agents, Support grants it: someone in both gets it.
    assert merged["crm"]["modules"] == {"inbox": True, "agents": True}
    assert merged["tickets"]["enabled"] is True


def test_union_all_modules_beats_a_partial_grant():
    merged = union_app_configs([
        {"crm": {"enabled": True, "modules": {"inbox": True}}},
        {"crm": {"enabled": True, "modules": {}}},
    ])
    # An empty module map means "all of them", so it has to win.
    assert merged["crm"]["modules"] == {}


def test_union_ignores_disabled_entries():
    assert union_app_configs([{"crm": {"enabled": False, "modules": {"inbox": True}}}]) == {}


def test_union_of_nothing_is_empty():
    assert union_app_configs([]) == {}
    assert union_app_configs([{}, None]) == {}


# ==================== department baseline ====================


@pytest.mark.asyncio
async def test_department_profile_decides_access(monkeypatch):
    svc = _service(
        monkeypatch,
        member=_member(),
        departments=[_department("Sales", SALES_PROFILE, is_primary=True, slug="business")],
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["baseline"] == SOURCE_DEPARTMENT
    assert access["apps"]["crm"]["enabled"] is True
    assert access["apps"]["crm"]["source"] == SOURCE_DEPARTMENT
    assert access["apps"]["crm"]["source_detail"] == "Sales"
    # The whole point: a salesperson whose legacy role reads "member" no longer
    # resolves to the Engineering bundle.
    assert access["apps"]["sprints"]["enabled"] is False
    assert access["apps"]["crm"]["modules"]["inbox"] is True
    assert access["apps"]["crm"]["modules"]["agents"] is False


@pytest.mark.asyncio
async def test_multi_department_member_gets_the_union(monkeypatch):
    svc = _service(
        monkeypatch,
        member=_member(),
        departments=[
            _department("Sales", SALES_PROFILE, is_primary=True),
            _department("Support", SUPPORT_PROFILE),
        ],
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["apps"]["crm"]["modules"]["agents"] is True  # from Support
    assert access["apps"]["tickets"]["enabled"] is True
    assert access["apps"]["email_marketing"]["enabled"] is True  # from Sales
    assert len(access["departments"]) == 2


@pytest.mark.asyncio
async def test_department_without_a_profile_does_not_contribute(monkeypatch):
    """A department nobody configured must not silently narrow anyone's access."""
    svc = _service(
        monkeypatch,
        member=_member(),
        departments=[_department("Sales", SALES_PROFILE), _department("Ops", {})],
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["baseline"] == SOURCE_DEPARTMENT
    assert access["apps"]["crm"]["enabled"] is True
    # Both are reported, so the admin UI can flag the unconfigured one.
    assert {d["name"]: d["has_profile"] for d in access["departments"]} == {
        "Sales": True,
        "Ops": False,
    }


# ==================== role fallback ====================


@pytest.mark.asyncio
async def test_no_profile_falls_back_to_role(monkeypatch):
    svc = _service(monkeypatch, member=_member(role="member"), departments=[])
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["baseline"] == SOURCE_ROLE_FALLBACK
    # The Engineering bundle, exactly as before this change.
    assert access["apps"]["tracking"]["enabled"] is True
    assert access["apps"]["crm"]["enabled"] is False


@pytest.mark.asyncio
async def test_role_fallback_stays_reachable_so_nobody_is_locked_out(monkeypatch):
    """Enforcement follows configuration.

    Before member access was enforced, a "member" was hidden from CRM in the
    sidebar while the CRM API answered them. Turning that default into a 403
    would break working setups, so an app decided by role fallback keeps
    ``can_access`` even though it is not in the navigation.
    """
    svc = _service(monkeypatch, member=_member(role="member"), departments=[])
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["apps"]["crm"]["enabled"] is False
    assert access["apps"]["crm"]["can_access"] is True


@pytest.mark.asyncio
async def test_module_override_alone_does_not_start_enforcing_the_app(monkeypatch):
    """Tweaking a sub-page must not revoke reach to the app as a side effect.

    A module-only override makes the app "overridden" for display, but nobody has
    decided whether the *app* is on — so `enabled` is still the role default and
    must stay reachable. Enforcing it here would 403 someone out of an app they
    use today because an admin adjusted one of its pages.
    """
    svc = _service(
        monkeypatch,
        member=_member(
            app_permissions={
                "version": MEMBER_ACCESS_VERSION,
                "overrides": {"crm": {"modules": {"inbox": False}}},
            }
        ),
        departments=[],  # no profile anywhere -> role fallback
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    crm = access["apps"]["crm"]
    assert crm["enabled"] is False           # engineering bundle, as before
    assert crm["can_access"] is True         # ...but not locked out
    assert crm["modules"]["inbox"] is False  # the override still applies
    assert crm["source"] == SOURCE_MEMBER_OVERRIDE


@pytest.mark.asyncio
async def test_explicit_app_override_is_enforced_even_under_role_fallback(monkeypatch):
    """An explicit revoke is a decision, so it binds even with no profile."""
    svc = _service(
        monkeypatch,
        member=_member(
            app_permissions={
                "version": MEMBER_ACCESS_VERSION,
                "overrides": {"tracking": {"enabled": False}},
            }
        ),
        departments=[],
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["baseline"] == SOURCE_ROLE_FALLBACK
    assert access["apps"]["tracking"]["enabled"] is False
    assert access["apps"]["tracking"]["can_access"] is False


@pytest.mark.asyncio
async def test_department_profile_is_enforced(monkeypatch):
    """Once a profile exists, the workspace has opted in and a revoke is real."""
    svc = _service(
        monkeypatch,
        member=_member(),
        departments=[_department("Sales", SALES_PROFILE, is_primary=True)],
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["apps"]["sprints"]["enabled"] is False
    assert access["apps"]["sprints"]["can_access"] is False


# ==================== member overrides ====================


@pytest.mark.asyncio
async def test_v2_delta_grants_on_top_of_the_department(monkeypatch):
    svc = _service(
        monkeypatch,
        member=_member(
            app_permissions={
                "version": MEMBER_ACCESS_VERSION,
                "overrides": {"sprints": {"enabled": True}},
            }
        ),
        departments=[_department("Sales", SALES_PROFILE, is_primary=True)],
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["apps"]["sprints"]["enabled"] is True
    assert access["apps"]["sprints"]["source"] == SOURCE_MEMBER_OVERRIDE
    # Everything not mentioned keeps inheriting — the property the old snapshot
    # storage destroyed.
    assert access["apps"]["crm"]["source"] == SOURCE_DEPARTMENT


@pytest.mark.asyncio
async def test_v2_delta_can_revoke(monkeypatch):
    svc = _service(
        monkeypatch,
        member=_member(
            app_permissions={
                "version": MEMBER_ACCESS_VERSION,
                "overrides": {"crm": {"enabled": False}},
            }
        ),
        departments=[_department("Sales", SALES_PROFILE, is_primary=True)],
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["apps"]["crm"]["enabled"] is False
    assert access["apps"]["crm"]["can_access"] is False


@pytest.mark.asyncio
async def test_module_level_override(monkeypatch):
    svc = _service(
        monkeypatch,
        member=_member(
            app_permissions={
                "version": MEMBER_ACCESS_VERSION,
                "overrides": {"crm": {"modules": {"agents": True}}},
            }
        ),
        departments=[_department("Sales", SALES_PROFILE, is_primary=True)],
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["apps"]["crm"]["enabled"] is True
    assert access["apps"]["crm"]["modules"]["agents"] is True
    assert access["apps"]["crm"]["modules"]["inbox"] is True


@pytest.mark.asyncio
async def test_legacy_v1_snapshot_still_resolves(monkeypatch):
    """A v1 row is an explicit decision about every app, so it stays pinned."""
    svc = _service(
        monkeypatch,
        member=_member(
            app_permissions={
                "apps": {"crm": {"enabled": False}, "sprints": {"enabled": True}},
                "applied_template_id": None,
                "custom_overrides": True,
            }
        ),
        departments=[_department("Sales", SALES_PROFILE, is_primary=True)],
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["apps"]["crm"]["enabled"] is False
    assert access["apps"]["sprints"]["enabled"] is True
    assert access["has_custom_overrides"] is True


@pytest.mark.asyncio
async def test_oldest_flat_format_still_resolves(monkeypatch):
    svc = _service(
        monkeypatch,
        member=_member(app_permissions={"crm": False, "tickets": True}),
        departments=[_department("Sales", SALES_PROFILE, is_primary=True)],
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["apps"]["crm"]["enabled"] is False
    assert access["apps"]["tickets"]["enabled"] is True


@pytest.mark.asyncio
async def test_member_template_replaces_the_department_baseline(monkeypatch):
    template = SimpleNamespace(
        id="tpl-1",
        name="Business",
        workspace_id=None,
        app_config={"crm": {"enabled": True, "modules": {}}},
    )
    svc = _service(
        monkeypatch,
        member=_member(
            app_permissions={
                "version": MEMBER_ACCESS_VERSION,
                "overrides": {},
                "applied_template_id": "tpl-1",
            }
        ),
        departments=[_department("Engineering", {"sprints": {"enabled": True}})],
        templates={"tpl-1": template},
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["baseline"] == SOURCE_MEMBER_TEMPLATE
    assert access["applied_template_name"] == "Business"
    assert access["apps"]["crm"]["enabled"] is True
    # The department's grant is replaced, not merged.
    assert access["apps"]["sprints"]["enabled"] is False


@pytest.mark.asyncio
async def test_deleted_template_falls_back_instead_of_locking_out(monkeypatch):
    svc = _service(
        monkeypatch,
        member=_member(
            app_permissions={
                "version": MEMBER_ACCESS_VERSION,
                "overrides": {},
                "applied_template_id": "gone",
            }
        ),
        departments=[_department("Sales", SALES_PROFILE, is_primary=True)],
        templates={},
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["baseline"] == SOURCE_DEPARTMENT
    assert access["applied_template_id"] is None
    assert access["apps"]["crm"]["enabled"] is True


# ==================== admins ====================


@pytest.mark.asyncio
async def test_admin_navigation_follows_their_profile(monkeypatch):
    """Admins used to be force-shown every app, so they could never see less."""
    svc = _service(
        monkeypatch,
        member=_member(role="admin"),
        departments=[_department("Sales", SALES_PROFILE, is_primary=True)],
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["is_admin"] is True
    assert access["apps"]["sprints"]["enabled"] is False
    # ...but they can still reach it, because they have to administer it.
    assert access["apps"]["sprints"]["can_access"] is True


# ==================== workspace toggle ====================


@pytest.mark.asyncio
async def test_workspace_disable_beats_everything(monkeypatch):
    svc = _service(
        monkeypatch,
        member=_member(role="owner"),
        departments=[_department("Sales", SALES_PROFILE, is_primary=True)],
        workspace_settings={"app_settings": {"crm": False}},
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["apps"]["crm"]["enabled"] is False
    # Including for the owner: "this workspace does not use CRM" has to mean it.
    assert access["apps"]["crm"]["can_access"] is False
    assert access["apps"]["crm"]["source"] == SOURCE_WORKSPACE_DISABLED
    assert all(v is False for v in access["apps"]["crm"]["modules"].values())


@pytest.mark.asyncio
async def test_workspace_disable_beats_a_member_grant(monkeypatch):
    svc = _service(
        monkeypatch,
        member=_member(
            app_permissions={
                "version": MEMBER_ACCESS_VERSION,
                "overrides": {"crm": {"enabled": True}},
            }
        ),
        departments=[_department("Engineering", {"sprints": {"enabled": True}})],
        workspace_settings={"app_settings": {"crm": False}},
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert access["apps"]["crm"]["can_access"] is False


# ==================== non-members ====================


@pytest.mark.asyncio
async def test_non_member_gets_nothing(monkeypatch):
    svc = _service(monkeypatch, member=None)
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert all(not app["enabled"] for app in access["apps"].values())
    assert all(not app["can_access"] for app in access["apps"].values())
    assert access["departments"] == []


@pytest.mark.asyncio
async def test_removed_member_gets_nothing(monkeypatch):
    member = _member()
    member.status = "removed"
    svc = _service(monkeypatch, member=member)
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    assert all(not app["can_access"] for app in access["apps"].values())


# ==================== suggested persona ====================


@pytest.mark.asyncio
async def test_primary_department_suggests_the_sidebar_view(monkeypatch):
    svc = _service(
        monkeypatch,
        member=_member(),
        departments=[
            _department("Sales", SALES_PROFILE, is_primary=True, persona="sales"),
            _department("Support", SUPPORT_PROFILE, persona="support"),
        ],
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)

    # Only the primary department gets a say: averaging two personas produces
    # neither of them.
    assert access["suggested_persona"] == "sales"


@pytest.mark.asyncio
async def test_no_persona_configured_suggests_nothing(monkeypatch):
    svc = _service(
        monkeypatch,
        member=_member(),
        departments=[_department("Sales", SALES_PROFILE, is_primary=True)],
    )
    access = await svc.get_effective_access("w1", "dev-1", use_cache=False)
    assert access["suggested_persona"] is None


# ==================== delta computation ====================


def test_diff_records_only_what_differs():
    baseline = union_app_configs([SALES_PROFILE])
    desired = {
        # Agrees with the profile — must not be stored.
        "crm": {"enabled": True, "modules": {"inbox": True, "agents": False}},
        "sprints": {"enabled": True, "modules": {}},
    }
    assert AppAccessService._diff_against_baseline(desired, baseline) == {
        "sprints": {"enabled": True}
    }


def test_diff_records_a_module_revoke():
    baseline = union_app_configs([SALES_PROFILE])
    desired = {"crm": {"enabled": True, "modules": {"inbox": False, "agents": False}}}
    assert AppAccessService._diff_against_baseline(desired, baseline) == {
        "crm": {"modules": {"inbox": False}}
    }


def test_diff_ignores_apps_not_mentioned():
    """A partial write is a partial write, not a revoke of everything else."""
    baseline = union_app_configs([SALES_PROFILE])
    assert AppAccessService._diff_against_baseline({}, baseline) == {}


def test_diff_ignores_unknown_apps_and_modules():
    baseline = {}
    desired = {
        "not_an_app": {"enabled": True},
        "crm": {"enabled": True, "modules": {"not_a_module": True}},
    }
    assert AppAccessService._diff_against_baseline(desired, baseline) == {
        "crm": {"enabled": True}
    }


def test_empty_override_set_stores_null():
    """NULL is what the resolver reads as "never overridden"."""
    assert AppAccessService._build_member_permissions({}, None, None, None) is None


def test_pinned_template_with_no_deltas_still_stores():
    payload = AppAccessService._build_member_permissions({}, "tpl-1", None, "actor-1")
    assert payload["applied_template_id"] == "tpl-1"
    assert payload["custom_overrides"] is False
    assert payload["updated_by"] == "actor-1"


def test_reasons_are_kept_only_for_apps_actually_overridden():
    payload = AppAccessService._build_member_permissions(
        {"crm": {"enabled": True}},
        None,
        {"crm": "covering for sales", "docs": "not an override"},
        None,
    )
    assert payload["reasons"] == {"crm": "covering for sales"}


# ==================== cache ====================


@pytest.mark.asyncio
async def test_cache_is_dropped_per_member(monkeypatch):
    svc = _service(
        monkeypatch,
        member=_member(),
        departments=[_department("Sales", SALES_PROFILE, is_primary=True)],
    )
    await svc.get_effective_access("w1", "dev-1")
    await svc.get_effective_access("w1", "dev-2")

    clear_effective_access_cache("w1", "dev-1")

    from aexy.services.app_access_service import _effective_access_cache

    assert ("w1", "dev-1") not in _effective_access_cache
    assert ("w1", "dev-2") in _effective_access_cache

    clear_effective_access_cache("w1")
    assert not _effective_access_cache
