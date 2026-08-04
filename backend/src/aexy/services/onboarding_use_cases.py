"""What the onboarding use-case picks actually configure.

Onboarding asks "what will you use Aexy for?" and the answer used to be applied
to exactly one thing: the founder's own ``app_permissions`` row. The workspace
itself learned nothing, so every person invited afterwards fell back to their
legacy role — which meant the Engineering bundle for anyone whose role read
"member". A founder who chose "CRM & Sales" and then invited their first
salesperson gave them standups, sprints and on-call, and no CRM.

So the picks now configure three things:

* **the workspace** — apps nobody selected are switched off, which is the only
  layer that was ever enforced and the honest meaning of "we don't use that";
* **departments** — each pick seeds one, carrying the access profile its people
  should have and the sidebar view that suits them;
* **nothing about the founder** — as owner they resolve to full access anyway,
  and writing them an override would pin them out of every later change.

The mapping lives here, in Python, because it is now the server's decision. The
frontend's copy (``onboarding/complete/page.tsx``) previously owned it and had
already drifted: it enabled ``insights`` for engineering while the Engineering
bundle in ``app_definitions`` does not, so the same choice produced different
access depending on which code path applied it.
"""

from typing import TypedDict


class UseCaseDepartment(TypedDict):
    """A department to seed for a use case."""

    name: str
    function_key: str | None
    profile_slug: str
    persona: str


class UseCaseConfig(TypedDict):
    """What one use-case pick turns on."""

    label: str
    apps: list[str]
    departments: list[UseCaseDepartment]


# Keyed by the ids the onboarding UI sends.
USE_CASES: dict[str, UseCaseConfig] = {
    "engineering": {
        "label": "Engineering",
        "apps": [
            "tracking",
            "sprints",
            "tickets",
            "oncall",
            "uptime",
            "insights",
            "docs",
        ],
        "departments": [
            {
                "name": "Engineering",
                "function_key": "engineering",
                "profile_slug": "engineering",
                "persona": "developer",
            },
        ],
    },
    "gtm": {
        "label": "GTM & Growth",
        "apps": ["crm", "email_marketing", "booking", "forms"],
        "departments": [
            {
                "name": "Marketing",
                "function_key": "marketing",
                "profile_slug": "business",
                "persona": "sales",
            },
        ],
    },
    "sales": {
        "label": "CRM & Sales",
        "apps": ["crm", "email_marketing", "booking", "tickets"],
        "departments": [
            {
                "name": "Sales",
                "function_key": "sales",
                "profile_slug": "business",
                "persona": "sales",
            },
        ],
    },
    "ai": {
        "label": "AI & Agents",
        "apps": ["agents", "automations", "mcp"],
        # No department: "we want AI" describes a capability every department
        # uses, not a group of people to put in one.
        "departments": [],
    },
    "people": {
        "label": "People & HR",
        "apps": ["reviews", "hiring", "learning", "compliance", "organization"],
        "departments": [
            {
                "name": "People",
                "function_key": "hr",
                "profile_slug": "people",
                "persona": "hr",
            },
        ],
    },
    "knowledge": {
        "label": "Knowledge & Data",
        "apps": ["docs", "tables", "forms"],
        "departments": [],
    },
}

# Always on, whatever was picked. Dashboard is the landing page; chat and
# organization are cross-cutting, and a workspace where nobody can see the org
# directory or message a colleague is not a workspace anyone wants.
ALWAYS_ENABLED_APPS = ("dashboard", "chat", "organization")


def apps_for_use_cases(use_cases: list[str]) -> set[str]:
    """Every app the selected use cases turn on, plus the always-on ones."""
    enabled: set[str] = set(ALWAYS_ENABLED_APPS)
    for use_case in use_cases:
        config = USE_CASES.get(use_case)
        if config:
            enabled.update(config["apps"])
    return enabled


def departments_for_use_cases(use_cases: list[str]) -> list[UseCaseDepartment]:
    """Departments to seed, de-duplicated by function key.

    Picking both "CRM & Sales" and "GTM & Growth" should not produce two
    departments that mean the same thing — and could not anyway, since
    ``function_key`` is unique per workspace.
    """
    seen: set[str] = set()
    departments: list[UseCaseDepartment] = []
    for use_case in use_cases:
        config = USE_CASES.get(use_case)
        if not config:
            continue
        for department in config["departments"]:
            key = department["function_key"] or department["name"].lower()
            if key in seen:
                continue
            seen.add(key)
            departments.append(department)
    return departments


def workspace_app_settings_for_use_cases(use_cases: list[str]) -> dict[str, bool]:
    """The workspace's app on/off map: everything not selected is off.

    Returns an explicit False for unselected apps rather than omitting them —
    ``check_workspace_app_enabled`` treats a missing key as enabled, so omission
    would silently mean "on" and the picks would turn nothing off at all.

    Includes everything the *seeded department profiles* grant, not just the apps
    listed against each use case. The workspace toggle beats every other layer,
    so without this a "CRM & Sales" workspace would switch off Docs while the
    Business profile it just gave the Sales department grants Docs — a
    contradiction resolved silently, and in the direction nobody chose. The two
    layers agree by construction instead.
    """
    from aexy.models.app_definitions import APP_CATALOG, SYSTEM_APP_BUNDLES

    enabled = apps_for_use_cases(use_cases)

    for department in departments_for_use_cases(use_cases):
        bundle = SYSTEM_APP_BUNDLES.get(department["profile_slug"])
        if not bundle:
            continue
        enabled.update(
            app_id
            for app_id, config in bundle["apps"].items()
            if config.get("enabled")
        )

    return {app_id: (app_id in enabled) for app_id in APP_CATALOG}
