"""Unit tests for what onboarding's use-case picks configure.

The picks used to be written to the founder's own member row and nowhere else,
so the workspace never learned what it was for. These tests pin the three things
that must now hold: the workspace gets configured, departments get seeded with a
profile, and the two layers cannot contradict each other.
"""

import pytest

from aexy.models.app_definitions import APP_CATALOG, SYSTEM_APP_BUNDLES
from aexy.services.onboarding_use_cases import (
    ALWAYS_ENABLED_APPS,
    USE_CASES,
    apps_for_use_cases,
    departments_for_use_cases,
    workspace_app_settings_for_use_cases,
)


def test_every_use_case_names_real_apps():
    """A typo'd app id would silently turn nothing on."""
    for use_case, config in USE_CASES.items():
        unknown = [app for app in config["apps"] if app not in APP_CATALOG]
        assert not unknown, f"{use_case} names apps that don't exist: {unknown}"


def test_every_use_case_names_a_real_profile():
    for use_case, config in USE_CASES.items():
        for department in config["departments"]:
            assert department["profile_slug"] in SYSTEM_APP_BUNDLES, (
                f"{use_case} seeds {department['name']} with unknown profile "
                f"{department['profile_slug']!r}"
            )


def test_always_enabled_apps_exist():
    assert all(app in APP_CATALOG for app in ALWAYS_ENABLED_APPS)


def test_unselected_apps_are_explicitly_off():
    """Omitting a key would mean "enabled" — the toggle defaults to on."""
    settings = workspace_app_settings_for_use_cases(["sales"])
    assert set(settings) == set(APP_CATALOG)
    assert settings["sprints"] is False
    assert settings["hiring"] is False


def test_sales_workspace_gets_crm_not_standups():
    """The reported complaint, as a test."""
    settings = workspace_app_settings_for_use_cases(["sales"])
    assert settings["crm"] is True
    assert settings["email_marketing"] is True
    assert settings["tracking"] is False
    assert settings["uptime"] is False
    assert settings["oncall"] is False


def test_operations_workspace_gets_the_service_desk():
    """Before there was an Operations pick, no choice reached these apps."""
    settings = workspace_app_settings_for_use_cases(["operations"])
    assert settings["service_desk"] is True
    assert settings["drive"] is True
    assert settings["tickets"] is True
    assert settings["sprints"] is False
    assert settings["hiring"] is False


def test_knowledge_turns_on_the_reports_it_advertises():
    """The card's "Reports & Exports" pill named an app nothing enabled."""
    assert workspace_app_settings_for_use_cases(["knowledge"])["reports"] is True


def test_dashboard_and_chat_survive_every_choice():
    for use_case in USE_CASES:
        settings = workspace_app_settings_for_use_cases([use_case])
        for app in ALWAYS_ENABLED_APPS:
            assert settings[app] is True, f"{use_case} turned off {app}"


def test_no_selection_still_leaves_a_usable_workspace():
    settings = workspace_app_settings_for_use_cases([])
    assert settings["dashboard"] is True
    assert set(apps_for_use_cases([])) == set(ALWAYS_ENABLED_APPS)


def test_unknown_use_case_is_ignored_not_fatal():
    """Onboarding sends whatever the client had; an unknown id must not 500."""
    settings = workspace_app_settings_for_use_cases(["sales", "not_a_use_case"])
    assert settings["crm"] is True


def test_workspace_never_blocks_what_a_seeded_profile_grants():
    """The layers have to agree by construction.

    The workspace toggle beats every other layer, so if a pick disabled an app
    that the profile it just assigned grants, the contradiction would be resolved
    silently and in the direction nobody chose.
    """
    all_picks = list(USE_CASES)
    for picks in [[p] for p in all_picks] + [all_picks]:
        settings = workspace_app_settings_for_use_cases(picks)
        for department in departments_for_use_cases(picks):
            bundle = SYSTEM_APP_BUNDLES[department["profile_slug"]]
            for app_id, config in bundle["apps"].items():
                if config.get("enabled"):
                    assert settings.get(app_id, True) is True, (
                        f"{picks}: {department['name']}'s profile grants {app_id} "
                        f"but the workspace switches it off"
                    )


def test_departments_are_deduplicated_by_function():
    """Sales and GTM both want a business profile, not two Sales departments.

    They also could not both exist: function_key is unique per workspace.
    """
    departments = departments_for_use_cases(["sales", "gtm"])
    keys = [d["function_key"] for d in departments]
    assert len(keys) == len(set(keys))


def test_picking_the_same_use_case_twice_seeds_once():
    assert len(departments_for_use_cases(["sales", "sales"])) == 1


def test_every_seeded_department_has_a_persona():
    """Without one there is nothing to derive a new joiner's sidebar from."""
    for use_case, config in USE_CASES.items():
        for department in config["departments"]:
            assert department["persona"], f"{use_case}/{department['name']}"


def test_persona_gated_apps_come_with_a_department_to_imply_the_persona():
    """Turning an app on is half the job; the sidebar still has to show it.

    `suggested_persona` reads the primary department's `default_persona`, and
    with no department the sidebar falls back to "developer" — which filters out
    the Business section that Service Desk and CRM live in. A use case whose
    apps sit behind a persona has to seed a department carrying it, or the pick
    turns the app on somewhere the person who chose it cannot see.
    """
    persona_gated = {"service_desk", "crm", "booking", "email_marketing"}
    for use_case, config in USE_CASES.items():
        if not persona_gated.intersection(config["apps"]):
            continue
        personas = [d["persona"] for d in config["departments"]]
        assert personas, f"{use_case} turns on {persona_gated.intersection(config['apps'])} but seeds no department"
        assert all(p in {"sales", "support", "admin"} for p in personas), (
            f"{use_case} seeds {personas}, none of which can see the Business section"
        )


def test_capability_use_cases_seed_no_department():
    """"We want AI" describes something every department uses, not a group."""
    assert departments_for_use_cases(["ai"]) == []
    assert departments_for_use_cases(["knowledge"]) == []


@pytest.mark.parametrize(
    "use_case,expected_department,expected_persona",
    [
        ("engineering", "Engineering", "developer"),
        ("sales", "Sales", "sales"),
        ("people", "People", "hr"),
        ("gtm", "Marketing", "sales"),
        ("operations", "Operations", "support"),
    ],
)
def test_use_case_seeds_the_expected_department(
    use_case, expected_department, expected_persona
):
    departments = departments_for_use_cases([use_case])
    assert [d["name"] for d in departments] == [expected_department]
    assert departments[0]["persona"] == expected_persona
