"""Permission definitions, role templates, and widget-permission mapping."""

from enum import Enum


class PermissionCategory(str, Enum):
    """Permission categories for grouping in UI."""

    MEMBERS = "members"
    ROLES = "roles"
    PROJECTS = "projects"
    TEAMS = "teams"
    TICKETS = "tickets"
    CRM = "crm"
    DOCS = "docs"
    SPRINTS = "sprints"
    HIRING = "hiring"
    TRACKING = "tracking"
    BILLING = "billing"
    SETTINGS = "settings"
    REVIEWS = "reviews"
    LEARNING = "learning"
    FORMS = "forms"
    ONCALL = "oncall"
    INSIGHTS = "insights"
    COMPLIANCE = "compliance"


# Master permission catalog
# Each permission has: category, description, and which role templates include it by default
PERMISSIONS: dict[str, dict] = {
    # Member Management
    "can_invite_members": {
        "category": PermissionCategory.MEMBERS,
        "description": "Invite new members to workspace or project",
        "default_for": ["admin", "manager"],
    },
    "can_remove_members": {
        "category": PermissionCategory.MEMBERS,
        "description": "Remove members from workspace or project",
        "default_for": ["admin"],
    },
    "can_view_members": {
        "category": PermissionCategory.MEMBERS,
        "description": "View member list and profiles",
        "default_for": ["admin", "manager", "developer", "hr", "support", "sales", "viewer"],
    },
    # Role Management
    "can_manage_roles": {
        "category": PermissionCategory.ROLES,
        "description": "Create, edit, and delete custom roles",
        "default_for": ["admin"],
    },
    "can_assign_roles": {
        "category": PermissionCategory.ROLES,
        "description": "Assign roles to members",
        "default_for": ["admin", "manager"],
    },
    # Project Management
    "can_create_projects": {
        "category": PermissionCategory.PROJECTS,
        "description": "Create new projects",
        "default_for": ["admin", "manager"],
    },
    "can_edit_projects": {
        "category": PermissionCategory.PROJECTS,
        "description": "Edit project settings and details",
        "default_for": ["admin", "manager"],
    },
    "can_delete_projects": {
        "category": PermissionCategory.PROJECTS,
        "description": "Delete projects",
        "default_for": ["admin"],
    },
    "can_view_projects": {
        "category": PermissionCategory.PROJECTS,
        "description": "View projects and their details",
        "default_for": ["admin", "manager", "developer", "hr", "support", "sales", "viewer"],
    },
    # Team Management
    "can_create_teams": {
        "category": PermissionCategory.TEAMS,
        "description": "Create new teams within projects",
        "default_for": ["admin", "manager"],
    },
    "can_edit_teams": {
        "category": PermissionCategory.TEAMS,
        "description": "Edit team settings",
        "default_for": ["admin", "manager"],
    },
    "can_delete_teams": {
        "category": PermissionCategory.TEAMS,
        "description": "Delete teams",
        "default_for": ["admin"],
    },
    "can_manage_team_members": {
        "category": PermissionCategory.TEAMS,
        "description": "Add and remove team members",
        "default_for": ["admin", "manager"],
    },
    # Tickets
    "can_view_tickets": {
        "category": PermissionCategory.TICKETS,
        "description": "View support tickets",
        "default_for": ["admin", "support", "manager"],
    },
    "can_create_tickets": {
        "category": PermissionCategory.TICKETS,
        "description": "Create new tickets",
        "default_for": ["admin", "support", "manager", "developer"],
    },
    "can_manage_tickets": {
        "category": PermissionCategory.TICKETS,
        "description": "Edit, assign, and resolve tickets",
        "default_for": ["admin", "support"],
    },
    "can_delete_tickets": {
        "category": PermissionCategory.TICKETS,
        "description": "Delete tickets",
        "default_for": ["admin"],
    },
    # CRM
    "can_view_crm": {
        "category": PermissionCategory.CRM,
        "description": "View CRM deals and contacts",
        "default_for": ["admin", "sales", "manager"],
    },
    "can_manage_crm": {
        "category": PermissionCategory.CRM,
        "description": "Create and manage deals and contacts",
        "default_for": ["admin", "sales"],
    },
    # Documents
    "can_view_docs": {
        "category": PermissionCategory.DOCS,
        "description": "View documents",
        "default_for": ["admin", "manager", "developer", "hr", "support", "sales", "viewer"],
    },
    "can_create_docs": {
        "category": PermissionCategory.DOCS,
        "description": "Create new documents",
        "default_for": ["admin", "manager", "developer"],
    },
    "can_edit_docs": {
        "category": PermissionCategory.DOCS,
        "description": "Edit existing documents",
        "default_for": ["admin", "manager", "developer"],
    },
    "can_delete_docs": {
        "category": PermissionCategory.DOCS,
        "description": "Delete documents",
        "default_for": ["admin"],
    },
    # Sprints
    "can_view_sprints": {
        "category": PermissionCategory.SPRINTS,
        "description": "View sprint planning and tasks",
        "default_for": ["admin", "manager", "developer"],
    },
    "can_manage_sprints": {
        "category": PermissionCategory.SPRINTS,
        "description": "Create and manage sprints",
        "default_for": ["admin", "manager"],
    },
    "can_manage_tasks": {
        "category": PermissionCategory.SPRINTS,
        "description": "Create and manage sprint tasks",
        "default_for": ["admin", "manager", "developer"],
    },
    # Hiring
    "can_view_hiring": {
        "category": PermissionCategory.HIRING,
        "description": "View hiring pipeline and candidates",
        "default_for": ["admin", "hr", "manager"],
    },
    "can_manage_hiring": {
        "category": PermissionCategory.HIRING,
        "description": "Manage candidates and assessments",
        "default_for": ["admin", "hr"],
    },
    "can_schedule_interviews": {
        "category": PermissionCategory.HIRING,
        "description": "Schedule interviews with candidates",
        "default_for": ["admin", "hr", "manager"],
    },
    # Tracking
    "can_view_tracking": {
        "category": PermissionCategory.TRACKING,
        "description": "View time tracking and standups",
        "default_for": ["admin", "manager", "developer"],
    },
    "can_manage_tracking": {
        "category": PermissionCategory.TRACKING,
        "description": "Manage tracking settings",
        "default_for": ["admin", "manager"],
    },
    "can_submit_standups": {
        "category": PermissionCategory.TRACKING,
        "description": "Submit daily standups",
        "default_for": ["admin", "manager", "developer"],
    },
    # Reviews
    "can_view_reviews": {
        "category": PermissionCategory.REVIEWS,
        "description": "View performance reviews",
        "default_for": ["admin", "hr", "manager"],
    },
    "can_manage_reviews": {
        "category": PermissionCategory.REVIEWS,
        "description": "Create and manage review cycles",
        "default_for": ["admin", "hr"],
    },
    "can_submit_feedback": {
        "category": PermissionCategory.REVIEWS,
        "description": "Submit peer feedback",
        "default_for": ["admin", "hr", "manager", "developer"],
    },
    # Learning
    "can_view_learning": {
        "category": PermissionCategory.LEARNING,
        "description": "View learning paths and courses",
        "default_for": ["admin", "hr", "manager", "developer"],
    },
    "can_manage_learning": {
        "category": PermissionCategory.LEARNING,
        "description": "Create and manage learning content",
        "default_for": ["admin", "hr"],
    },
    # Forms
    "can_view_forms": {
        "category": PermissionCategory.FORMS,
        "description": "View form submissions",
        "default_for": ["admin", "support", "manager"],
    },
    "can_manage_forms": {
        "category": PermissionCategory.FORMS,
        "description": "Create and manage forms",
        "default_for": ["admin", "support"],
    },
    # On-call
    "can_view_oncall": {
        "category": PermissionCategory.ONCALL,
        "description": "View on-call schedules",
        "default_for": ["admin", "manager", "developer", "support"],
    },
    "can_manage_oncall": {
        "category": PermissionCategory.ONCALL,
        "description": "Manage on-call schedules and rotations",
        "default_for": ["admin", "manager"],
    },
    # Insights
    "can_view_insights": {
        "category": PermissionCategory.INSIGHTS,
        "description": "View developer insights and team metrics",
        "default_for": ["admin", "manager"],
    },
    "can_manage_insights": {
        "category": PermissionCategory.INSIGHTS,
        "description": "Configure insights settings and generate snapshots",
        "default_for": ["admin", "manager"],
    },
    # Compliance
    "can_view_compliance": {
        "category": PermissionCategory.COMPLIANCE,
        "description": "View compliance documents, reminders, and reports",
        "default_for": ["admin", "manager", "hr"],
    },
    "can_manage_compliance": {
        "category": PermissionCategory.COMPLIANCE,
        "description": "Upload documents, manage folders, and configure compliance",
        "default_for": ["admin", "hr"],
    },
    # Billing
    "can_view_billing": {
        "category": PermissionCategory.BILLING,
        "description": "View billing information",
        "default_for": ["admin"],
    },
    "can_manage_billing": {
        "category": PermissionCategory.BILLING,
        "description": "Manage billing and subscriptions",
        "default_for": ["admin"],
    },
    # Settings
    "can_manage_workspace_settings": {
        "category": PermissionCategory.SETTINGS,
        "description": "Manage workspace settings",
        "default_for": ["admin"],
    },
    "can_manage_integrations": {
        "category": PermissionCategory.SETTINGS,
        "description": "Manage integrations (GitHub, Slack, etc.)",
        "default_for": ["admin"],
    },
}


def get_permissions_for_template(template_id: str) -> list[str]:
    """Get list of permissions for a role template."""
    return [
        perm_id
        for perm_id, perm_data in PERMISSIONS.items()
        if template_id in perm_data.get("default_for", [])
    ]


# Role templates with default permissions
ROLE_TEMPLATES: dict[str, dict] = {
    "owner": {
        "name": "Owner",
        "description": "Workspace owner with full access",
        "color": "#f59e0b",  # amber
        "icon": "Crown",
        "is_system": True,
        "priority": 999,
        "permissions": list(PERMISSIONS.keys()),  # All permissions
    },
    "admin": {
        "name": "Admin",
        "description": "Full access to all features and settings",
        "color": "#9333ea",  # purple
        "icon": "Shield",
        "is_system": True,
        "priority": 100,
        "permissions": list(PERMISSIONS.keys()),  # All permissions
    },
    "manager": {
        "name": "Manager",
        "description": "Team and project management capabilities",
        "color": "#16a34a",  # green
        "icon": "Users",
        "is_system": True,
        "priority": 80,
        "permissions": get_permissions_for_template("manager"),
    },
    "developer": {
        "name": "Developer",
        "description": "Software development and code contributions",
        "color": "#2563eb",  # blue
        "icon": "Code",
        "is_system": True,
        "priority": 60,
        "permissions": get_permissions_for_template("developer"),
    },
    "hr": {
        "name": "HR",
        "description": "Human resources and hiring management",
        "color": "#f43f5e",  # rose
        "icon": "Heart",
        "is_system": True,
        "priority": 70,
        "permissions": get_permissions_for_template("hr"),
    },
    "support": {
        "name": "Support",
        "description": "Customer support and ticketing",
        "color": "#ec4899",  # pink
        "icon": "Ticket",
        "is_system": True,
        "priority": 60,
        "permissions": get_permissions_for_template("support"),
    },
    "sales": {
        "name": "Sales",
        "description": "Sales and CRM management",
        "color": "#06b6d4",  # cyan
        "icon": "Building2",
        "is_system": True,
        "priority": 60,
        "permissions": get_permissions_for_template("sales"),
    },
    "viewer": {
        "name": "Viewer",
        "description": "Read-only access to workspace",
        "color": "#64748b",  # slate
        "icon": "Eye",
        "is_system": True,
        "priority": 10,
        "permissions": get_permissions_for_template("viewer"),
    },
    "member": {
        "name": "Member",
        "description": "Standard workspace member",
        "color": "#3b82f6",  # blue
        "icon": "User",
        "is_system": True,
        "priority": 50,
        "permissions": get_permissions_for_template("developer"),  # Same as developer by default
    },
}


# Widget to permission mapping
# Each widget requires certain permissions to be visible
# Empty list means visible to all authenticated users
WIDGET_PERMISSIONS: dict[str, list[str]] = {
    # Universal widgets (no specific permissions required)
    "welcome": [],
    "quickStats": [],
    "myGoals": [],
    "upcomingDeadlines": [],
    "notifications": [],
    # Developer-focused widgets
    "languageProficiency": [],
    "workPatterns": ["can_view_tracking"],
    "domainExpertise": [],
    "frameworksTools": [],
    "growthTrajectory": [],
    "learningPath": ["can_view_learning"],
    "skillGaps": [],
    "codeActivity": [],
    "prStats": [],
    # AI Insights
    "aiInsights": [],
    "softSkills": [],
    "peerBenchmark": [],
    "taskMatcher": ["can_view_members"],
    # Tracking widgets
    "trackingSummary": ["can_view_tracking"],
    "standupStatus": ["can_view_tracking"],
    "blockersOverview": ["can_view_tracking"],
    "timeTracking": ["can_view_tracking"],
    "teamTimeTracking": ["can_view_tracking", "can_view_members"],
    # Sprint/Planning widgets
    "sprintOverview": ["can_view_sprints"],
    "sprintBurndown": ["can_view_sprints"],
    "sprintVelocity": ["can_view_sprints"],
    "taskBoard": ["can_view_sprints"],
    "epicProgress": ["can_view_sprints"],
    # Ticket widgets
    "ticketStats": ["can_view_tickets"],
    "slaOverview": ["can_view_tickets"],
    "recentTickets": ["can_view_tickets"],
    "ticketsByPriority": ["can_view_tickets"],
    "ticketTrends": ["can_view_tickets"],
    # Forms widgets
    "formSubmissions": ["can_view_forms"],
    "recentForms": ["can_view_forms"],
    # Document widgets
    "recentDocs": ["can_view_docs"],
    "docActivity": ["can_view_docs"],
    "wikiPages": ["can_view_docs"],
    # Review widgets
    "pendingReviews": ["can_view_reviews"],
    "reviewCycle": ["can_view_reviews"],
    "feedbackOverview": ["can_view_reviews"],
    "performanceReviews": ["can_view_reviews"],
    # Hiring widgets
    "hiringPipeline": ["can_view_hiring"],
    "candidateStats": ["can_view_hiring"],
    "openPositions": ["can_view_hiring"],
    "interviewSchedule": ["can_view_hiring"],
    "assessmentOverview": ["can_view_hiring"],
    # CRM widgets
    "crmPipeline": ["can_view_crm"],
    "dealStats": ["can_view_crm"],
    "recentDeals": ["can_view_crm"],
    "crmQuickView": ["can_view_crm"],
    "contactActivity": ["can_view_crm"],
    # Team widgets
    "teamOverview": ["can_view_members"],
    "teamActivity": ["can_view_members"],
    "teamHealth": ["can_view_members"],
    "teamCapacity": ["can_view_members", "can_view_tracking"],
    # On-call widgets
    "oncallSchedule": ["can_view_oncall"],
    "oncallStatus": ["can_view_oncall"],
    # Insights widgets
    "teamInsights": ["can_view_insights"],
    "developerInsights": ["can_view_insights"],
    "insightsLeaderboard": ["can_view_insights"],
    "workloadDistribution": ["can_view_insights"],
    # Admin widgets
    "orgMetrics": ["can_manage_workspace_settings"],
    "systemHealth": ["can_manage_workspace_settings"],
    "auditLog": ["can_manage_workspace_settings"],
    "integrationStatus": ["can_manage_integrations"],
    # Compliance widgets
    "complianceOverview": ["can_view_compliance"],
    "complianceDocuments": ["can_view_compliance"],
    # Billing widgets
    "billingOverview": ["can_view_billing"],
    "seatUsage": ["can_view_billing"],
}


def get_accessible_widgets(user_permissions: set[str]) -> list[str]:
    """
    Get list of widget IDs accessible to a user based on their permissions.

    Args:
        user_permissions: Set of permission strings the user has

    Returns:
        List of widget IDs the user can access
    """
    accessible = []
    for widget_id, required_perms in WIDGET_PERMISSIONS.items():
        if not required_perms:
            # No permissions required, everyone can access
            accessible.append(widget_id)
        elif any(perm in user_permissions for perm in required_perms):
            # User has at least one of the required permissions
            accessible.append(widget_id)
    return accessible


def get_permissions_by_category() -> dict[str, list[dict]]:
    """
    Get permissions grouped by category for UI display.

    Returns:
        Dict mapping category name to list of permission info dicts
    """
    by_category: dict[str, list[dict]] = {}
    for perm_id, perm_data in PERMISSIONS.items():
        category = perm_data["category"].value
        if category not in by_category:
            by_category[category] = []
        by_category[category].append({
            "id": perm_id,
            "description": perm_data["description"],
            "default_for": perm_data.get("default_for", []),
        })
    return by_category
