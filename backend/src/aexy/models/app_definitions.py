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


class AppAvailability(str, Enum):
    """Whether a workspace can turn an app on for itself.

    Everything is ``SELF_SERVE`` unless stated otherwise. ``CONTACT_SUPPORT``
    means the app exists in the catalog — an admin can see it and ask for it —
    but no access path may switch it on: it is off in every bundle, refused by
    the API, and an attempt raises a note to support rather than a pending
    request nobody in the workspace has the authority to approve.
    """

    SELF_SERVE = "self_serve"
    CONTACT_SUPPORT = "contact_support"


# Where "ask about this app" goes. Deliberately a single address rather than the
# workspace's own admins: these apps are gated by us, not by them.
SUPPORT_CONTACT_EMAIL = "support@aexy.io"


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
    # Absent means AppAvailability.SELF_SERVE.
    availability: AppAvailability


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
    "service_desk": {
        "name": "Service Desk",
        "description": "Email-intake ticketing with stakeholder TAT tracking",
        "icon": "Headset",
        "category": AppCategory.BUSINESS,
        "base_route": "/service-desk",
        "required_permission": "can_view_service_desk",
        "modules": {
            "dashboard": {
                "name": "Dashboard",
                "description": "Open tickets by stakeholder and age",
                "route": "",
            },
            "tickets": {
                "name": "Tickets",
                "description": "All service desk tickets",
                "route": "/tickets",
            },
            "settings": {
                "name": "Master Data",
                "description": "Partners, insurers, LOBs, and mailboxes",
                "route": "/settings",
            },
        },
    },
    "organization": {
        "name": "Organization",
        "description": "Departments, org chart, reporting lines, and headcount",
        "icon": "Network",
        "category": AppCategory.PEOPLE,
        "base_route": "/organization",
        "required_permission": "can_view_org",
        "modules": {
            "chart": {
                "name": "Org Chart",
                "description": "Visual department hierarchy and reporting lines",
                "route": "",
            },
            "departments": {
                "name": "Departments",
                "description": "Manage departments, functions, and membership",
                "route": "/departments",
            },
            "directory": {
                "name": "Directory",
                "description": "People directory with department and manager",
                "route": "/directory",
            },
        },
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
        "availability": AppAvailability.CONTACT_SUPPORT,
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
    "drive": {
        "name": "Drive",
        "description": "Collaborative file storage with AI tagging, smart views, and semantic search",
        "icon": "HardDrive",
        "category": AppCategory.PRODUCTIVITY,
        "base_route": "/docs/drive",
        "required_permission": "can_view_drive",
        "modules": {
            "files": {
                "name": "Files",
                "description": "Browse, upload, and organise files in folders",
                "route": "/",
            },
            "smart_views": {
                "name": "Smart Views",
                "description": "Filter overlays grouping files by AI tags or category",
                "route": "/smart-views",
            },
            "search": {
                "name": "Search",
                "description": "Hybrid semantic + keyword search across the workspace",
                "route": "/search",
            },
        },
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
    "booking": {
        "name": "Booking",
        "description": "Calendar booking and scheduling",
        "icon": "CalendarCheck",
        "category": AppCategory.BUSINESS,
        "base_route": "/booking",
        "required_permission": "can_view_booking",
        "modules": {
            "event_types": {
                "name": "Event Types",
                "description": "Manage bookable event types",
                "route": "/event-types",
            },
            "availability": {
                "name": "Availability",
                "description": "Set your availability schedule",
                "route": "/availability",
            },
            "calendars": {
                "name": "Calendars",
                "description": "Connect external calendars",
                "route": "/calendars",
            },
        },
    },
    "uptime": {
        "name": "Uptime",
        "description": "Endpoint monitoring and incident management",
        "icon": "MonitorCheck",
        "category": AppCategory.ENGINEERING,
        "base_route": "/uptime",
        "required_permission": "can_view_uptime",
        "modules": {
            "monitors": {
                "name": "Monitors",
                "description": "HTTP, TCP, and WebSocket endpoint monitors",
                "route": "/monitors",
            },
            "incidents": {
                "name": "Incidents",
                "description": "Active and resolved incidents",
                "route": "/incidents",
            },
            "history": {
                "name": "History",
                "description": "Check history and uptime reports",
                "route": "/history",
            },
        },
    },
    "automations": {
        "name": "Automations",
        "description": "Platform-wide workflow automations",
        "icon": "Zap",
        "category": AppCategory.PRODUCTIVITY,
        "base_route": "/automations",
        "required_permission": "can_view_automations",
        "modules": {},
    },
    "agents": {
        "name": "AI Agents",
        "description": "AI-powered automation agents",
        "icon": "Bot",
        "category": AppCategory.PRODUCTIVITY,
        "base_route": "/agents",
        "required_permission": "can_view_agents",
        "modules": {},
    },
    "mcp": {
        "name": "MCP",
        "description": "Connect AI clients to Aexy via Model Context Protocol",
        "icon": "Plug",
        "category": AppCategory.PRODUCTIVITY,
        "base_route": "/mcp",
        "required_permission": "can_view_agents",
        # An MCP tool is governed by the capability its operations carry, and
        # most capabilities ARE an app — holding `sprints` is what grants
        # `mcp.sprints`. Those need nothing here; the app grant is the MCP
        # grant, so there is no second access model to keep in sync.
        #
        # These three are the surfaces that are not apps and never were, so
        # they have nowhere else to be granted. See
        # scripts/dump_mcp_catalog.py, which fails if a tag maps to neither.
        "modules": {
            # Named for what they reach, because they sit next to each other in
            # the access editor and "Platform administration" beside "Billing &
            # platform admin" gave an admin no way to tell which was which.
            "platform": {
                "name": "Workspace & members",
                "description": (
                    "Workspaces, teams, members, roles, invites and API tokens "
                    "over MCP"
                ),
            },
            "integrations": {
                "name": "Integrations",
                "description": "Slack, Google and provider webhooks over MCP",
            },
            "admin": {
                "name": "Billing & system admin",
                "description": (
                    "Billing, plans, rate limits and platform administration "
                    "over MCP. Privileged — granted deliberately, never inherited."
                ),
            },
        },
    },
    "chat": {
        "name": "Chat",
        "description": "Team messaging with channels and topics",
        "icon": "MessageCircle",
        "category": AppCategory.PRODUCTIVITY,
        "base_route": "/chat",
        "required_permission": None,
        "modules": {},
    },
    "insights": {
        "name": "Insights",
        "description": "Developer productivity metrics and team analytics",
        "icon": "TrendingUp",
        "category": AppCategory.ENGINEERING,
        "base_route": "/insights",
        "required_permission": "can_view_insights",
        "modules": {
            "team_overview": {
                "name": "Team Overview",
                "description": "Team-wide velocity, efficiency, and workload distribution",
                "route": "",
            },
            "leaderboard": {
                "name": "Leaderboard",
                "description": "Ranked developer metrics",
                "route": "/leaderboard",
            },
            "developer_drilldown": {
                "name": "Developer Drill-down",
                "description": "Individual developer metrics deep-dive",
                "route": "/developers",
            },
        },
    },
    "reports": {
        "name": "Reports",
        "description": "Custom analytics reports, scheduling, and exports",
        "icon": "FileText",
        "category": AppCategory.ENGINEERING,
        "base_route": "/reports",
        "required_permission": None,  # Accessible to all authenticated users
        "modules": {
            "custom_reports": {
                "name": "Custom Reports",
                "description": "Build, schedule, and view custom reports",
                "route": "",
            },
            "monthly_engineering": {
                "name": "Monthly Engineering Report",
                "description": "Month-by-month contribution report built from synced GitHub activity",
                "route": "/monthly",
            },
            "exports": {
                "name": "Exports",
                "description": "Generate and download report exports",
                "route": "/exports",
            },
        },
    },
    "tables": {
        "name": "Tables",
        "description": "Standalone data tables and databases",
        "icon": "Table2",
        "category": AppCategory.PRODUCTIVITY,
        "base_route": "/tables",
        "required_permission": "can_view_tables",
        "modules": {},
    },
    "compliance": {
        "name": "Compliance",
        "description": "Compliance management, documents, and reminders",
        "icon": "ShieldCheck",
        "category": AppCategory.PEOPLE,
        "base_route": "/compliance",
        "required_permission": "can_view_compliance",
        "modules": {
            "reminders": {
                "name": "Reminders",
                "description": "Recurring compliance reminders",
                "route": "/reminders",
            },
            "document_center": {
                "name": "Document Center",
                "description": "Upload and manage compliance documents",
                "route": "/documents",
            },
            "training": {
                "name": "Training",
                "description": "Mandatory training management",
                "route": "/training",
            },
            "certifications": {
                "name": "Certifications",
                "description": "Certification tracking",
                "route": "/certifications",
            },
        },
    },
    # The three below were reachable from the sidebar but absent from this
    # catalogue, which meant nothing could hide or enforce them: access
    # resolution keys off app ids, and a route belonging to no app is treated as
    # "not access-controlled" and shown to everybody. Between them they accounted
    # for 22 of the 89 sidebar entries — the whole /gtm tree, Leave, and
    # Community — so a workspace that doesn't sell anything still showed its
    # engineers ABM, Intent and Competitors.
    #
    # They are enabled in every system bundle, so adding them changes nobody's
    # navigation today; it only makes them configurable, which they were not.
    "gtm": {
        "name": "GTM Intelligence",
        "description": "Visitor tracking, lead scoring, routing, and go-to-market ops",
        "icon": "Crosshair",
        "category": AppCategory.BUSINESS,
        "base_route": "/gtm",
        "required_permission": "can_view_crm",
        "modules": {
            "visitors": {
                "name": "Visitors",
                "description": "Website visitor identification and activity",
                "route": "/visitors",
            },
            "scoring": {
                "name": "Scoring & ICP",
                "description": "Lead scoring and ideal-customer profiles",
                "route": "/scoring",
            },
            "routing": {
                "name": "Routing",
                "description": "Assign inbound leads to owners",
                "route": "/routing",
            },
            "sequences": {
                "name": "Sequences",
                "description": "Outbound sequences and cadences",
                "route": "/sequences",
            },
            "analytics": {
                "name": "Analytics",
                "description": "Funnel and campaign analytics",
                "route": "/analytics",
            },
            "abm": {
                "name": "ABM",
                "description": "Account-based marketing programmes",
                "route": "/abm",
            },
            "competitors": {
                "name": "Competitors",
                "description": "Competitive intelligence tracking",
                "route": "/competitors",
            },
            "intent": {
                "name": "Intent",
                "description": "Buying-intent signals",
                "route": "/intent",
            },
            "health": {
                "name": "Health",
                "description": "Account health scoring",
                "route": "/health",
            },
        },
    },
    "leave": {
        "name": "Leave",
        "description": "Leave requests, approvals, and balances",
        "icon": "Palmtree",
        "category": AppCategory.PEOPLE,
        "base_route": "/leave",
        "required_permission": None,
        # Approvals and settings are tab query params on one page rather than
        # sub-routes, so there is nothing here for module-level access to gate.
        "modules": {},
    },
    "community": {
        "name": "Community",
        "description": "Public community spaces, channels, and topics",
        "icon": "Globe",
        "category": AppCategory.PRODUCTIVITY,
        # Deliberately outside the (app) route group — it is a public surface, so
        # the base route has no shared shell. Still catalogued, because the
        # sidebar links to it and admins should be able to switch it off.
        "base_route": "/community",
        "required_permission": None,
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


# The `mcp` app's modules gate the surfaces that were never apps: workspace,
# team, member, role, invite and API-token administration, and the provider
# integrations. Every bundle below states them explicitly, and must keep doing
# so, because the resolver treats an *absent* module as on — see
# AppAccessService._resolve, where "a new module quietly disappearing for
# everyone is worse than it quietly appearing". That default is right for an
# ordinary sub-page and wrong here: left unlisted, the engineering bundle would
# hand every developer and viewer 133 platform operations and 58 admin
# operations over MCP, which is the opposite of why these modules exist.
_MCP_ADMIN_MODULES = ("platform", "integrations", "admin")
_MCP_MODULES_OFF: dict[str, bool] = dict.fromkeys(_MCP_ADMIN_MODULES, False)
_MCP_MODULES_ON: dict[str, bool] = dict.fromkeys(_MCP_ADMIN_MODULES, True)


# System app bundle templates
SYSTEM_APP_BUNDLES: dict[str, BundleConfig] = {
    "engineering": {
        "name": "Engineering",
        "description": "Apps for software development teams",
        "icon": "Code",
        "color": "#2563eb",  # blue
        "apps": {
            "dashboard": {"enabled": True, "modules": {}},
            "organization": {
                "enabled": True,
                "modules": {"chart": True, "departments": True, "directory": True},
            },
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
            "learning": {"enabled": False},  # AppAvailability.CONTACT_SUPPORT
            "oncall": {"enabled": True, "modules": {}},
            "uptime": {
                "enabled": True,
                "modules": {"monitors": True, "incidents": True, "history": True},
            },
            "automations": {"enabled": True, "modules": {}},
            "agents": {"enabled": True, "modules": {}},
            "mcp": {"enabled": True, "modules": dict(_MCP_MODULES_OFF)},
            "chat": {"enabled": True, "modules": {}},
            # In every bundle because the frontend's copy of these bundles has
            # always granted it, and the two are one decision: a department put on
            # this profile could not reach the desk while its own "Start from
            # Engineering" grid said it could. `can_view_service_desk` and the
            # workspace toggle are the real gates.
            "service_desk": {
                "enabled": True,
                "modules": {"dashboard": True, "tickets": True, "settings": True},
            },
            "tables": {"enabled": True, "modules": {}},
            # Catalogued late (see APP_CATALOG): enabled everywhere so that
            # making them configurable doesn't remove them from anyone.
            "gtm": {"enabled": True, "modules": {}},
            "leave": {"enabled": True, "modules": {}},
            "community": {"enabled": True, "modules": {}},
            # Disabled for engineering
            "reviews": {"enabled": False},
            "hiring": {"enabled": False},
            "crm": {"enabled": False},
            "email_marketing": {"enabled": False},
            "forms": {"enabled": False},
            "booking": {"enabled": False},
            "insights": {"enabled": False},
            "compliance": {"enabled": False},
        },
    },
    "people": {
        "name": "People",
        "description": "Apps for HR and people operations",
        "icon": "Heart",
        "color": "#f43f5e",  # rose
        "apps": {
            "dashboard": {"enabled": True, "modules": {}},
            "organization": {
                "enabled": True,
                "modules": {"chart": True, "departments": True, "directory": True},
            },
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
            "learning": {"enabled": False},  # AppAvailability.CONTACT_SUPPORT
            "compliance": {
                "enabled": True,
                "modules": {
                    "reminders": True,
                    "document_center": True,
                    "training": True,
                    "certifications": True,
                },
            },
            "docs": {"enabled": True, "modules": {}},
            "forms": {"enabled": True, "modules": {}},
            "automations": {"enabled": True, "modules": {}},
            "agents": {"enabled": True, "modules": {}},
            "mcp": {"enabled": True, "modules": dict(_MCP_MODULES_OFF)},
            "chat": {"enabled": True, "modules": {}},
            # In every bundle because the frontend's copy of these bundles has
            # always granted it, and the two are one decision: a department put on
            # this profile could not reach the desk while its own "Start from
            # Engineering" grid said it could. `can_view_service_desk` and the
            # workspace toggle are the real gates.
            "service_desk": {
                "enabled": True,
                "modules": {"dashboard": True, "tickets": True, "settings": True},
            },
            "tables": {"enabled": False},
            # Catalogued late (see APP_CATALOG): enabled everywhere so that
            # making them configurable doesn't remove them from anyone.
            "gtm": {"enabled": True, "modules": {}},
            "leave": {"enabled": True, "modules": {}},
            "community": {"enabled": True, "modules": {}},
            # Disabled for people ops
            "tracking": {"enabled": False},
            "sprints": {"enabled": False},
            "tickets": {"enabled": False},
            "crm": {"enabled": False},
            "email_marketing": {"enabled": False},
            "oncall": {"enabled": False},
            "booking": {"enabled": False},
            "uptime": {"enabled": False},
            "insights": {"enabled": False},
        },
    },
    "business": {
        "name": "Business",
        "description": "Apps for sales and customer success",
        "icon": "Briefcase",
        "color": "#06b6d4",  # cyan
        "apps": {
            "dashboard": {"enabled": True, "modules": {}},
            "organization": {
                "enabled": True,
                "modules": {"chart": True, "departments": True, "directory": True},
            },
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
            "booking": {
                "enabled": True,
                "modules": {"event_types": True, "availability": True, "calendars": True},
            },
            "automations": {"enabled": True, "modules": {}},
            "agents": {"enabled": True, "modules": {}},
            "mcp": {"enabled": True, "modules": dict(_MCP_MODULES_OFF)},
            "chat": {"enabled": True, "modules": {}},
            # In every bundle because the frontend's copy of these bundles has
            # always granted it, and the two are one decision: a department put on
            # this profile could not reach the desk while its own "Start from
            # Engineering" grid said it could. `can_view_service_desk` and the
            # workspace toggle are the real gates.
            "service_desk": {
                "enabled": True,
                "modules": {"dashboard": True, "tickets": True, "settings": True},
            },
            "tables": {"enabled": True, "modules": {}},
            # Catalogued late (see APP_CATALOG): enabled everywhere so that
            # making them configurable doesn't remove them from anyone.
            "gtm": {"enabled": True, "modules": {}},
            "leave": {"enabled": True, "modules": {}},
            "community": {"enabled": True, "modules": {}},
            # Disabled for business
            "tracking": {"enabled": False},
            "sprints": {"enabled": False},
            "reviews": {"enabled": False},
            "hiring": {"enabled": False},
            "learning": {"enabled": False},
            "oncall": {"enabled": False},
            "uptime": {"enabled": False},
            "insights": {"enabled": False},
            "compliance": {"enabled": False},
        },
    },
    "full_access": {
        "name": "Full Access",
        "description": "Access to all apps and modules",
        "icon": "Shield",
        "color": "#9333ea",  # purple
        "apps": {
            "dashboard": {"enabled": True, "modules": {}},
            "organization": {
                "enabled": True,
                "modules": {"chart": True, "departments": True, "directory": True},
            },
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
            "learning": {"enabled": False},  # AppAvailability.CONTACT_SUPPORT
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
            "booking": {
                "enabled": True,
                "modules": {"event_types": True, "availability": True, "calendars": True},
            },
            "uptime": {
                "enabled": True,
                "modules": {"monitors": True, "incidents": True, "history": True},
            },
            "automations": {"enabled": True, "modules": {}},
            "agents": {"enabled": True, "modules": {}},
            "mcp": {"enabled": True, "modules": dict(_MCP_MODULES_ON)},
            "chat": {"enabled": True, "modules": {}},
            # In every bundle because the frontend's copy of these bundles has
            # always granted it, and the two are one decision: a department put on
            # this profile could not reach the desk while its own "Start from
            # Engineering" grid said it could. `can_view_service_desk` and the
            # workspace toggle are the real gates.
            "service_desk": {
                "enabled": True,
                "modules": {"dashboard": True, "tickets": True, "settings": True},
            },
            "tables": {"enabled": True, "modules": {}},
            # Catalogued late (see APP_CATALOG): enabled everywhere so that
            # making them configurable doesn't remove them from anyone.
            "gtm": {"enabled": True, "modules": {}},
            "leave": {"enabled": True, "modules": {}},
            "community": {"enabled": True, "modules": {}},
            "insights": {
                "enabled": True,
                "modules": {
                    "team_overview": True,
                    "leaderboard": True,
                    "developer_drilldown": True,
                },
            },
            "compliance": {
                "enabled": True,
                "modules": {
                    "reminders": True,
                    "document_center": True,
                    "training": True,
                    "certifications": True,
                },
            },
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
            # Sent so the admin UI can render the toggle it is actually allowed
            # to offer, rather than one the API will refuse on save.
            "availability": config.get(
                "availability", AppAvailability.SELF_SERVE
            ).value,
            "support_contact": (
                SUPPORT_CONTACT_EMAIL
                if config.get("availability") == AppAvailability.CONTACT_SUPPORT
                else None
            ),
            "modules": [
                {
                    "id": mod_id,
                    "name": mod_config["name"],
                    "description": mod_config["description"],
                    # Not every module is a page: the MCP modules gate groups of
                    # API capabilities and have nothing to navigate to. Reading
                    # the key directly raised KeyError for those, which took the
                    # whole catalog endpoint down rather than one module with it.
                    "route": mod_config.get("route", ""),
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
