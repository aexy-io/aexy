"""App definitions catalog with modules and bundle templates.

This module defines all available apps in the system, their sub-modules,
required permissions, and pre-configured access bundle templates.
"""

from enum import Enum
from typing import TypedDict


class AppCategory(str, Enum):
    """App categories for grouping in UI."""

    ENGINEERING = "engineering"
    PEOPLE = "people"
    BUSINESS = "business"
    PRODUCTIVITY = "productivity"


class ModuleConfig(TypedDict, total=False):
    """Configuration for an app module."""

    name: str
    description: str
    route: str  # Relative route within the app


class AppConfig(TypedDict, total=False):
    """Configuration for an app."""

    name: str
    description: str
    icon: str
    category: AppCategory
    base_route: str
    required_permission: str | None  # None means accessible to all
    modules: dict[str, ModuleConfig]


# Master app catalog defining all apps and their modules
APP_CATALOG: dict[str, AppConfig] = {
    "dashboard": {
        "name": "Dashboard",
        "description": "Overview and analytics dashboard",
        "icon": "LayoutDashboard",
        "category": AppCategory.PRODUCTIVITY,
        "base_route": "/dashboard",
        "required_permission": None,  # Accessible to all authenticated users
        "modules": {},
    },
    "tracking": {
        "name": "Tracking",
        "description": "Standups, blockers, and time tracking",
        "icon": "Activity",
        "category": AppCategory.ENGINEERING,
        "base_route": "/tracking",
        "required_permission": "can_view_tracking",
        "modules": {
            "standups": {
                "name": "Standups",
                "description": "Daily standup submissions and history",
                "route": "/standups",
            },
            "blockers": {
                "name": "Blockers",
                "description": "Track and manage blockers",
                "route": "/blockers",
            },
            "time": {
                "name": "Time Tracking",
                "description": "Log and track work hours",
                "route": "/time",
            },
        },
    },
    "sprints": {
        "name": "Sprints",
        "description": "Sprint planning and task management",
        "icon": "Zap",
        "category": AppCategory.ENGINEERING,
        "base_route": "/sprints",
        "required_permission": "can_view_sprints",
        "modules": {
            "board": {
                "name": "Sprint Board",
                "description": "Kanban-style sprint board",
                "route": "/board",
            },
            "epics": {
                "name": "Epics",
                "description": "Manage epics and user stories",
                "route": "/epics",
            },
            "tasks": {
                "name": "Tasks",
                "description": "Task management and assignment",
                "route": "/tasks",
            },
            "backlog": {
                "name": "Backlog",
                "description": "Product backlog management",
                "route": "/backlog",
            },
        },
    },
    "tickets": {
        "name": "Tickets",
        "description": "Support ticket management",
        "icon": "Ticket",
        "category": AppCategory.BUSINESS,
        "base_route": "/tickets",
        "required_permission": "can_view_tickets",
        "modules": {},
    },
    "reviews": {
        "name": "Reviews",
        "description": "Performance reviews and feedback",
        "icon": "Star",
        "category": AppCategory.PEOPLE,
        "base_route": "/reviews",
        "required_permission": "can_view_reviews",
        "modules": {
            "cycles": {
                "name": "Review Cycles",
                "description": "Review cycle management",
                "route": "/cycles",
            },
            "goals": {
                "name": "Goals",
                "description": "Work goals and OKRs",
                "route": "/goals",
            },
            "peer_requests": {
                "name": "Peer Requests",
                "description": "Peer feedback requests",
                "route": "/peer-requests",
            },
            "manage": {
                "name": "Manage",
                "description": "Admin review management",
                "route": "/manage",
            },
        },
    },
    "hiring": {
        "name": "Hiring",
        "description": "Recruitment and assessments",
        "icon": "Users",
        "category": AppCategory.PEOPLE,
        "base_route": "/hiring",
        "required_permission": "can_view_hiring",
        "modules": {
            "dashboard": {
                "name": "Dashboard",
                "description": "Hiring overview and metrics",
                "route": "/dashboard",
            },
            "candidates": {
                "name": "Candidates",
                "description": "Manage candidates",
                "route": "/candidates",
            },
            "assessments": {
                "name": "Assessments",
                "description": "Technical assessments",
                "route": "/assessments",
            },
            "questions": {
                "name": "Question Bank",
                "description": "Assessment questions library",
                "route": "/questions",
            },
            "templates": {
                "name": "Templates",
                "description": "Assessment templates",
                "route": "/templates",
            },
            "analytics": {
                "name": "Analytics",
                "description": "Hiring analytics and reports",
                "route": "/analytics",
            },
        },
    },
    "learning": {
        "name": "Learning",
        "description": "Learning paths and courses",
        "icon": "GraduationCap",
        "category": AppCategory.PEOPLE,
        "base_route": "/learning",
        "required_permission": "can_view_learning",
        "modules": {},
    },
    "crm": {
        "name": "CRM",
        "description": "Customer relationship management",
        "icon": "Building2",
        "category": AppCategory.BUSINESS,
        "base_route": "/crm",
        "required_permission": "can_view_crm",
        "modules": {
            "overview": {
                "name": "Overview",
                "description": "CRM dashboard and pipeline",
                "route": "/overview",
            },
            "inbox": {
                "name": "Inbox",
                "description": "Email inbox and communications",
                "route": "/inbox",
            },
            "agents": {
                "name": "AI Agents",
                "description": "Configure AI sales agents",
                "route": "/agents",
            },
            "activities": {
                "name": "Activities",
                "description": "Activity tracking and logs",
                "route": "/activities",
            },
            "automations": {
                "name": "Automations",
                "description": "Sales automations and sequences",
                "route": "/automations",
            },
            "calendar": {
                "name": "Calendar",
                "description": "Meeting and event calendar",
                "route": "/calendar",
            },
        },
    },
    "email_marketing": {
        "name": "Email Marketing",
        "description": "Email campaigns and automation",
        "icon": "Mail",
        "category": AppCategory.BUSINESS,
        "base_route": "/email-marketing",
        "required_permission": "can_view_crm",  # Uses same permission as CRM
        "modules": {
            "campaigns": {
                "name": "Campaigns",
                "description": "Email campaign management",
                "route": "/campaigns",
            },
            "templates": {
                "name": "Templates",
                "description": "Email templates library",
                "route": "/templates",
            },
            "settings": {
                "name": "Settings",
                "description": "Email settings and domains",
                "route": "/settings",
            },
        },
    },
    "docs": {
        "name": "Docs",
        "description": "Documentation and wiki",
        "icon": "FileText",
        "category": AppCategory.PRODUCTIVITY,
        "base_route": "/docs",
        "required_permission": "can_view_docs",
        "modules": {},
    },
    "forms": {
        "name": "Forms",
        "description": "Form builder and submissions",
        "icon": "ClipboardList",
        "category": AppCategory.PRODUCTIVITY,
        "base_route": "/forms",
        "required_permission": "can_view_forms",
        "modules": {},
    },
    "oncall": {
        "name": "On-Call",
        "description": "On-call schedules and rotations",
        "icon": "Phone",
        "category": AppCategory.ENGINEERING,
        "base_route": "/oncall",
        "required_permission": "can_view_oncall",
        "modules": {},
    },
}


class BundleConfig(TypedDict, total=False):
    """Configuration for an app bundle template."""

    name: str
    description: str
    icon: str
    color: str
    apps: dict[str, dict]  # App ID -> {"enabled": bool, "modules": {module_id: bool}}


# System app bundle templates
SYSTEM_APP_BUNDLES: dict[str, BundleConfig] = {
    "engineering": {
        "name": "Engineering",
        "description": "Apps for software development teams",
        "icon": "Code",
        "color": "#2563eb",  # blue
        "apps": {
            "dashboard": {"enabled": True, "modules": {}},
            "tracking": {
                "enabled": True,
                "modules": {"standups": True, "blockers": True, "time": True},
            },
            "sprints": {
                "enabled": True,
                "modules": {
                    "board": True,
                    "epics": True,
                    "tasks": True,
                    "backlog": True,
                },
            },
            "tickets": {"enabled": True, "modules": {}},
            "docs": {"enabled": True, "modules": {}},
            "learning": {"enabled": True, "modules": {}},
            "oncall": {"enabled": True, "modules": {}},
            # Disabled for engineering
            "reviews": {"enabled": False},
            "hiring": {"enabled": False},
            "crm": {"enabled": False},
            "email_marketing": {"enabled": False},
            "forms": {"enabled": False},
        },
    },
    "people": {
        "name": "People",
        "description": "Apps for HR and people operations",
        "icon": "Heart",
        "color": "#f43f5e",  # rose
        "apps": {
            "dashboard": {"enabled": True, "modules": {}},
            "reviews": {
                "enabled": True,
                "modules": {
                    "cycles": True,
                    "goals": True,
                    "peer_requests": True,
                    "manage": True,
                },
            },
            "hiring": {
                "enabled": True,
                "modules": {
                    "dashboard": True,
                    "candidates": True,
                    "assessments": True,
                    "questions": True,
                    "templates": True,
                    "analytics": True,
                },
            },
            "learning": {"enabled": True, "modules": {}},
            "docs": {"enabled": True, "modules": {}},
            "forms": {"enabled": True, "modules": {}},
            # Disabled for people ops
            "tracking": {"enabled": False},
            "sprints": {"enabled": False},
            "tickets": {"enabled": False},
            "crm": {"enabled": False},
            "email_marketing": {"enabled": False},
            "oncall": {"enabled": False},
        },
    },
    "business": {
        "name": "Business",
        "description": "Apps for sales and customer success",
        "icon": "Briefcase",
        "color": "#06b6d4",  # cyan
        "apps": {
            "dashboard": {"enabled": True, "modules": {}},
            "crm": {
                "enabled": True,
                "modules": {
                    "overview": True,
                    "inbox": True,
                    "agents": True,
                    "activities": True,
                    "automations": True,
                    "calendar": True,
                },
            },
            "email_marketing": {
                "enabled": True,
                "modules": {"campaigns": True, "templates": True, "settings": True},
            },
            "tickets": {"enabled": True, "modules": {}},
            "docs": {"enabled": True, "modules": {}},
            "forms": {"enabled": True, "modules": {}},
            # Disabled for business
            "tracking": {"enabled": False},
            "sprints": {"enabled": False},
            "reviews": {"enabled": False},
            "hiring": {"enabled": False},
            "learning": {"enabled": False},
            "oncall": {"enabled": False},
        },
    },
    "full_access": {
        "name": "Full Access",
        "description": "Access to all apps and modules",
        "icon": "Shield",
        "color": "#9333ea",  # purple
        "apps": {
            "dashboard": {"enabled": True, "modules": {}},
            "tracking": {
                "enabled": True,
                "modules": {"standups": True, "blockers": True, "time": True},
            },
            "sprints": {
                "enabled": True,
                "modules": {
                    "board": True,
                    "epics": True,
                    "tasks": True,
                    "backlog": True,
                },
            },
            "tickets": {"enabled": True, "modules": {}},
            "reviews": {
                "enabled": True,
                "modules": {
                    "cycles": True,
                    "goals": True,
                    "peer_requests": True,
                    "manage": True,
                },
            },
            "hiring": {
                "enabled": True,
                "modules": {
                    "dashboard": True,
                    "candidates": True,
                    "assessments": True,
                    "questions": True,
                    "templates": True,
                    "analytics": True,
                },
            },
            "learning": {"enabled": True, "modules": {}},
            "crm": {
                "enabled": True,
                "modules": {
                    "overview": True,
                    "inbox": True,
                    "agents": True,
                    "activities": True,
                    "automations": True,
                    "calendar": True,
                },
            },
            "email_marketing": {
                "enabled": True,
                "modules": {"campaigns": True, "templates": True, "settings": True},
            },
            "docs": {"enabled": True, "modules": {}},
            "forms": {"enabled": True, "modules": {}},
            "oncall": {"enabled": True, "modules": {}},
        },
    },
}


# Default app access for role templates
# Maps role template ID to a bundle template ID or custom config
ROLE_DEFAULT_APP_ACCESS: dict[str, str] = {
    "owner": "full_access",
    "admin": "full_access",
    "manager": "full_access",
    "developer": "engineering",
    "hr": "people",
    "support": "business",
    "sales": "business",
    "viewer": "engineering",  # Limited view-only access
    "member": "engineering",
}


def get_app_list() -> list[dict]:
    """Get list of all apps with their metadata."""
    return [
        {
            "id": app_id,
            "name": config["name"],
            "description": config["description"],
            "icon": config["icon"],
            "category": config["category"].value,
            "base_route": config["base_route"],
            "required_permission": config.get("required_permission"),
            "modules": [
                {
                    "id": mod_id,
                    "name": mod_config["name"],
                    "description": mod_config["description"],
                    "route": mod_config["route"],
                }
                for mod_id, mod_config in config.get("modules", {}).items()
            ],
        }
        for app_id, config in APP_CATALOG.items()
    ]


def get_bundle_list() -> list[dict]:
    """Get list of all system app bundles."""
    return [
        {
            "id": bundle_id,
            "name": config["name"],
            "description": config["description"],
            "icon": config["icon"],
            "color": config["color"],
            "is_system": True,
            "app_config": config["apps"],
        }
        for bundle_id, config in SYSTEM_APP_BUNDLES.items()
    ]


def get_default_app_access_for_role(role_template_id: str) -> dict:
    """Get default app access config for a role template."""
    bundle_id = ROLE_DEFAULT_APP_ACCESS.get(role_template_id, "engineering")
    bundle = SYSTEM_APP_BUNDLES.get(bundle_id, SYSTEM_APP_BUNDLES["engineering"])
    return bundle["apps"]


def validate_app_access_config(config: dict) -> tuple[bool, str | None]:
    """
    Validate an app access configuration.

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not isinstance(config, dict):
        return False, "App access config must be a dictionary"

    apps = config.get("apps", {})
    if not isinstance(apps, dict):
        return False, "apps field must be a dictionary"

    for app_id, app_config in apps.items():
        if app_id not in APP_CATALOG:
            return False, f"Unknown app: {app_id}"

        if not isinstance(app_config, dict):
            return False, f"Config for {app_id} must be a dictionary"

        if "enabled" not in app_config:
            return False, f"Missing 'enabled' field for app: {app_id}"

        if not isinstance(app_config["enabled"], bool):
            return False, f"'enabled' must be boolean for app: {app_id}"

        # Validate modules if present
        modules = app_config.get("modules", {})
        if modules:
            valid_modules = set(APP_CATALOG[app_id].get("modules", {}).keys())
            for mod_id in modules:
                if mod_id not in valid_modules:
                    return False, f"Unknown module '{mod_id}' for app: {app_id}"

    return True, None
