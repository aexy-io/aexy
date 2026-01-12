"""Dashboard preferences API router."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.models.dashboard import DashboardPreferences
from aexy.schemas.dashboard import (
    DashboardPreferencesCreate,
    DashboardPreferencesUpdate,
    DashboardPreferencesResponse,
    DashboardPresetInfo,
    DashboardPresetsResponse,
    WidgetInfo,
    WidgetCategoryInfo,
    WidgetRegistryResponse,
)
from aexy.services.permission_service import PermissionService
from aexy.models.permissions import WIDGET_PERMISSIONS


router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


# ========== PRESET DEFINITIONS ==========

DASHBOARD_PRESETS = {
    "developer": {
        "name": "Developer",
        "description": "Personal skills, insights, and growth tracking",
        "icon": "Code",
        "color": "from-blue-500 to-blue-600",
        "widgets": [
            "welcome", "quickStats", "languageProficiency", "workPatterns",
            "domainExpertise", "frameworksTools", "aiInsights", "softSkills",
            "growthTrajectory", "peerBenchmark", "myGoals", "performanceReviews",
            "learningPath"
        ],
    },
    "manager": {
        "name": "Engineering Manager",
        "description": "Team insights, sprint planning, and performance reviews",
        "icon": "Users",
        "color": "from-green-500 to-green-600",
        "widgets": [
            "welcome", "quickStats", "teamOverview", "sprintOverview",
            "trackingSummary", "taskMatcher", "peerBenchmark", "aiInsights",
            "performanceReviews", "myGoals"
        ],
    },
    "product": {
        "name": "Product Manager",
        "description": "Sprint planning, tracking, and documentation",
        "icon": "Target",
        "color": "from-purple-500 to-purple-600",
        "widgets": [
            "welcome", "sprintOverview", "trackingSummary", "recentDocs",
            "teamOverview", "myGoals", "upcomingDeadlines"
        ],
    },
    "hr": {
        "name": "HR / People Ops",
        "description": "Hiring pipeline, reviews, and organizational health",
        "icon": "Heart",
        "color": "from-rose-500 to-rose-600",
        "widgets": [
            "welcome", "hiringPipeline", "candidateStats", "softSkills",
            "performanceReviews", "teamOverview", "pendingReviews"
        ],
    },
    "support": {
        "name": "Support / Customer Success",
        "description": "Tickets, SLAs, and customer forms",
        "icon": "Ticket",
        "color": "from-pink-500 to-pink-600",
        "widgets": [
            "welcome", "ticketStats", "slaOverview", "recentTickets",
            "formSubmissions", "crmQuickView"
        ],
    },
    "sales": {
        "name": "Sales",
        "description": "CRM pipeline, deals, and customer interactions",
        "icon": "Building2",
        "color": "from-cyan-500 to-cyan-600",
        "widgets": [
            "welcome", "crmPipeline", "dealStats", "recentDeals",
            "formSubmissions", "myGoals"
        ],
    },
    "admin": {
        "name": "Admin",
        "description": "Organization-wide metrics and system overview",
        "icon": "Settings",
        "color": "from-slate-500 to-slate-600",
        "widgets": [
            "welcome", "orgMetrics", "teamOverview", "hiringPipeline",
            "ticketStats", "systemHealth"
        ],
    },
}


# ========== WIDGET REGISTRY ==========

DASHBOARD_WIDGETS = {
    # Core / Profile
    "welcome": {"name": "Welcome", "category": "profile", "personas": ["all"], "default_size": "full", "icon": "User"},
    "quickStats": {"name": "Quick Stats", "category": "stats", "personas": ["all"], "default_size": "full", "icon": "BarChart3"},
    "myGoals": {"name": "My Goals", "category": "goals", "personas": ["all"], "default_size": "medium", "icon": "Target"},

    # Developer Skills
    "languageProficiency": {"name": "Language Proficiency", "category": "skills", "personas": ["developer", "manager"], "default_size": "large", "icon": "Code"},
    "workPatterns": {"name": "Work Patterns", "category": "analytics", "personas": ["developer", "manager"], "default_size": "small", "icon": "Activity"},
    "domainExpertise": {"name": "Domain Expertise", "category": "skills", "personas": ["developer", "manager", "hr"], "default_size": "medium", "icon": "Layers"},
    "frameworksTools": {"name": "Frameworks & Tools", "category": "skills", "personas": ["developer"], "default_size": "medium", "icon": "Wrench"},

    # AI Insights
    "aiInsights": {"name": "AI Insights", "category": "ai", "personas": ["all"], "default_size": "medium", "icon": "Sparkles"},
    "softSkills": {"name": "Soft Skills", "category": "ai", "personas": ["developer", "manager", "hr"], "default_size": "medium", "icon": "Heart"},
    "growthTrajectory": {"name": "Growth Trajectory", "category": "ai", "personas": ["developer", "manager"], "default_size": "medium", "icon": "TrendingUp"},
    "peerBenchmark": {"name": "Peer Benchmark", "category": "analytics", "personas": ["developer", "manager"], "default_size": "medium", "icon": "Users"},
    "taskMatcher": {"name": "Task Matcher", "category": "tools", "personas": ["manager", "hr"], "default_size": "medium", "icon": "Shuffle"},

    # Tracking
    "trackingSummary": {"name": "Tracking Summary", "category": "tracking", "personas": ["developer", "manager", "product"], "default_size": "medium", "icon": "Target"},
    "standupStatus": {"name": "Standup Status", "category": "tracking", "personas": ["developer", "manager"], "default_size": "small", "icon": "CheckCircle"},
    "blockersOverview": {"name": "Blockers Overview", "category": "tracking", "personas": ["manager", "product"], "default_size": "medium", "icon": "AlertTriangle"},
    "timeTracking": {"name": "Time Tracking", "category": "tracking", "personas": ["developer", "manager"], "default_size": "small", "icon": "Clock"},

    # Planning / Sprints
    "sprintOverview": {"name": "Sprint Overview", "category": "planning", "personas": ["manager", "product", "developer"], "default_size": "large", "icon": "Calendar"},
    "sprintBurndown": {"name": "Sprint Burndown", "category": "planning", "personas": ["manager", "product"], "default_size": "medium", "icon": "TrendingDown"},
    "upcomingDeadlines": {"name": "Upcoming Deadlines", "category": "planning", "personas": ["all"], "default_size": "small", "icon": "Clock"},

    # Tickets
    "ticketStats": {"name": "Ticket Stats", "category": "tickets", "personas": ["support", "admin"], "default_size": "medium", "icon": "Ticket"},
    "slaOverview": {"name": "SLA Overview", "category": "tickets", "personas": ["support", "admin"], "default_size": "medium", "icon": "AlertCircle"},
    "recentTickets": {"name": "Recent Tickets", "category": "tickets", "personas": ["support"], "default_size": "large", "icon": "List"},
    "ticketsByPriority": {"name": "Tickets by Priority", "category": "tickets", "personas": ["support", "admin"], "default_size": "medium", "icon": "Flag"},

    # Forms
    "formSubmissions": {"name": "Form Submissions", "category": "forms", "personas": ["support", "sales"], "default_size": "medium", "icon": "FormInput"},
    "recentForms": {"name": "Recent Forms", "category": "forms", "personas": ["support", "sales"], "default_size": "medium", "icon": "FileText"},

    # Docs
    "recentDocs": {"name": "Recent Docs", "category": "docs", "personas": ["all"], "default_size": "medium", "icon": "FileText"},
    "docActivity": {"name": "Doc Activity", "category": "docs", "personas": ["manager", "product"], "default_size": "small", "icon": "Activity"},

    # Reviews
    "performanceReviews": {"name": "Performance Reviews", "category": "reviews", "personas": ["all"], "default_size": "medium", "icon": "ClipboardCheck"},
    "pendingReviews": {"name": "Pending Reviews", "category": "reviews", "personas": ["manager", "hr"], "default_size": "medium", "icon": "Clock"},
    "reviewCycle": {"name": "Review Cycle Progress", "category": "reviews", "personas": ["hr", "admin"], "default_size": "medium", "icon": "RefreshCw"},

    # Learning
    "learningPath": {"name": "Learning Path", "category": "learning", "personas": ["developer"], "default_size": "medium", "icon": "GraduationCap"},
    "skillGaps": {"name": "Skill Gaps", "category": "learning", "personas": ["developer", "manager"], "default_size": "medium", "icon": "AlertCircle"},

    # Hiring
    "hiringPipeline": {"name": "Hiring Pipeline", "category": "hiring", "personas": ["hr", "manager"], "default_size": "large", "icon": "Users"},
    "candidateStats": {"name": "Candidate Stats", "category": "hiring", "personas": ["hr"], "default_size": "medium", "icon": "BarChart3"},
    "openPositions": {"name": "Open Positions", "category": "hiring", "personas": ["hr", "manager"], "default_size": "medium", "icon": "Briefcase"},
    "interviewSchedule": {"name": "Interview Schedule", "category": "hiring", "personas": ["hr", "manager"], "default_size": "medium", "icon": "Calendar"},

    # CRM
    "crmPipeline": {"name": "CRM Pipeline", "category": "crm", "personas": ["sales"], "default_size": "large", "icon": "Building2"},
    "dealStats": {"name": "Deal Stats", "category": "crm", "personas": ["sales", "admin"], "default_size": "medium", "icon": "DollarSign"},
    "recentDeals": {"name": "Recent Deals", "category": "crm", "personas": ["sales"], "default_size": "medium", "icon": "TrendingUp"},
    "crmQuickView": {"name": "CRM Quick View", "category": "crm", "personas": ["support", "sales"], "default_size": "small", "icon": "Eye"},

    # Team / Org
    "teamOverview": {"name": "Team Overview", "category": "team", "personas": ["manager", "hr", "admin"], "default_size": "large", "icon": "Users"},
    "teamActivity": {"name": "Team Activity", "category": "team", "personas": ["manager"], "default_size": "medium", "icon": "Activity"},

    # Admin
    "orgMetrics": {"name": "Organization Metrics", "category": "admin", "personas": ["admin"], "default_size": "full", "icon": "BarChart3"},
    "systemHealth": {"name": "System Health", "category": "admin", "personas": ["admin"], "default_size": "medium", "icon": "Activity"},
}


WIDGET_CATEGORIES = {
    "profile": {"name": "Profile & Goals", "icon": "User"},
    "stats": {"name": "Statistics", "icon": "BarChart3"},
    "goals": {"name": "Goals", "icon": "Target"},
    "skills": {"name": "Developer Skills", "icon": "Code"},
    "analytics": {"name": "Analytics", "icon": "Activity"},
    "ai": {"name": "AI Insights", "icon": "Sparkles"},
    "tools": {"name": "Tools", "icon": "Wrench"},
    "tracking": {"name": "Tracking", "icon": "Target"},
    "planning": {"name": "Planning & Sprints", "icon": "Calendar"},
    "tickets": {"name": "Tickets", "icon": "Ticket"},
    "forms": {"name": "Forms", "icon": "FormInput"},
    "docs": {"name": "Documentation", "icon": "FileText"},
    "reviews": {"name": "Reviews", "icon": "ClipboardCheck"},
    "learning": {"name": "Learning", "icon": "GraduationCap"},
    "hiring": {"name": "Hiring", "icon": "Users"},
    "crm": {"name": "CRM", "icon": "Building2"},
    "team": {"name": "Team", "icon": "Users"},
    "admin": {"name": "Admin", "icon": "Settings"},
}


# ========== HELPER FUNCTIONS ==========

def get_default_preferences_for_preset(preset_type: str) -> dict:
    """Get default widget configuration for a preset type."""
    preset = DASHBOARD_PRESETS.get(preset_type, DASHBOARD_PRESETS["developer"])
    widgets = preset["widgets"]
    return {
        "preset_type": preset_type,
        "visible_widgets": widgets,
        "widget_order": widgets,
        "widget_sizes": {},
        "layout": {},
    }


# ========== API ENDPOINTS ==========

@router.get("/preferences", response_model=DashboardPreferencesResponse)
async def get_preferences(
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get dashboard preferences for the current user."""
    result = await db.execute(
        select(DashboardPreferences).where(
            DashboardPreferences.developer_id == str(current_developer.id)
        )
    )
    preferences = result.scalar_one_or_none()

    if not preferences:
        # Return default developer preset if no preferences exist
        defaults = get_default_preferences_for_preset("developer")
        # Create default preferences in database
        preferences = DashboardPreferences(
            developer_id=str(current_developer.id),
            **defaults,
        )
        db.add(preferences)
        await db.commit()
        await db.refresh(preferences)

    return preferences


@router.put("/preferences", response_model=DashboardPreferencesResponse)
async def update_preferences(
    data: DashboardPreferencesUpdate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Update dashboard preferences for the current user."""
    result = await db.execute(
        select(DashboardPreferences).where(
            DashboardPreferences.developer_id == str(current_developer.id)
        )
    )
    preferences = result.scalar_one_or_none()

    if not preferences:
        # Create new preferences with defaults
        defaults = get_default_preferences_for_preset(data.preset_type or "developer")
        preferences = DashboardPreferences(
            developer_id=str(current_developer.id),
            **defaults,
        )
        db.add(preferences)

    # Update fields that are provided
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(preferences, field, value)

    # If preset_type changed and widgets weren't explicitly set, apply preset defaults
    if data.preset_type and data.visible_widgets is None:
        defaults = get_default_preferences_for_preset(data.preset_type)
        preferences.visible_widgets = defaults["visible_widgets"]
        preferences.widget_order = defaults["widget_order"]
        preferences.widget_sizes = {}

    await db.commit()
    await db.refresh(preferences)
    return preferences


@router.post("/preferences/reset", response_model=DashboardPreferencesResponse)
async def reset_preferences(
    preset_type: str = "developer",
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Reset dashboard preferences to a preset default."""
    if preset_type not in DASHBOARD_PRESETS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid preset type. Valid options: {list(DASHBOARD_PRESETS.keys())}",
        )

    result = await db.execute(
        select(DashboardPreferences).where(
            DashboardPreferences.developer_id == str(current_developer.id)
        )
    )
    preferences = result.scalar_one_or_none()

    defaults = get_default_preferences_for_preset(preset_type)

    if not preferences:
        preferences = DashboardPreferences(
            developer_id=str(current_developer.id),
            **defaults,
        )
        db.add(preferences)
    else:
        for field, value in defaults.items():
            setattr(preferences, field, value)

    await db.commit()
    await db.refresh(preferences)
    return preferences


@router.get("/presets", response_model=DashboardPresetsResponse)
async def get_presets(
    current_developer: Developer = Depends(get_current_developer),
):
    """Get available dashboard presets."""
    presets = [
        DashboardPresetInfo(
            id=preset_id,
            name=preset["name"],
            description=preset["description"],
            icon=preset["icon"],
            color=preset["color"],
            widgets=preset["widgets"],
        )
        for preset_id, preset in DASHBOARD_PRESETS.items()
    ]
    return DashboardPresetsResponse(presets=presets)


@router.get("/widgets", response_model=WidgetRegistryResponse)
async def get_widgets(
    current_developer: Developer = Depends(get_current_developer),
):
    """Get available widgets and categories."""
    widgets = [
        WidgetInfo(
            id=widget_id,
            name=widget["name"],
            category=widget["category"],
            personas=widget["personas"],
            default_size=widget["default_size"],
            icon=widget["icon"],
        )
        for widget_id, widget in DASHBOARD_WIDGETS.items()
    ]

    categories = [
        WidgetCategoryInfo(
            id=cat_id,
            name=cat["name"],
            icon=cat["icon"],
        )
        for cat_id, cat in WIDGET_CATEGORIES.items()
    ]

    return WidgetRegistryResponse(widgets=widgets, categories=categories)


@router.get("/accessible-widgets")
async def get_accessible_widgets(
    workspace_id: str | None = None,
    project_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """
    Get widgets the user can access based on their role permissions.

    If workspace_id is provided, filters widgets based on user's permissions in that workspace.
    If project_id is also provided, uses project-level permissions (which supersede workspace).

    Returns all widgets if no workspace_id is provided (for users without workspace context).
    """
    if not workspace_id:
        # Return all widgets if no workspace context
        return {
            "widgets": list(DASHBOARD_WIDGETS.keys()),
            "filtered": False,
            "workspace_id": None,
            "project_id": None,
        }

    permission_service = PermissionService(db)
    accessible_widget_ids = await permission_service.get_accessible_widgets(
        workspace_id, str(current_developer.id), project_id
    )

    return {
        "widgets": accessible_widget_ids,
        "filtered": True,
        "workspace_id": workspace_id,
        "project_id": project_id,
    }


@router.get("/widgets-with-permissions", response_model=WidgetRegistryResponse)
async def get_widgets_with_permission_info(
    workspace_id: str | None = None,
    project_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """
    Get available widgets with information about which ones the user can access.

    Each widget includes an 'accessible' field indicating if the user has permission.
    """
    accessible_widgets = set()

    if workspace_id:
        permission_service = PermissionService(db)
        accessible_widgets = set(await permission_service.get_accessible_widgets(
            workspace_id, str(current_developer.id), project_id
        ))
    else:
        # All widgets accessible without workspace context
        accessible_widgets = set(DASHBOARD_WIDGETS.keys())

    widgets = [
        WidgetInfo(
            id=widget_id,
            name=widget["name"],
            category=widget["category"],
            personas=widget["personas"],
            default_size=widget["default_size"],
            icon=widget["icon"],
            accessible=widget_id in accessible_widgets,
            required_permissions=WIDGET_PERMISSIONS.get(widget_id, []),
        )
        for widget_id, widget in DASHBOARD_WIDGETS.items()
    ]

    categories = [
        WidgetCategoryInfo(
            id=cat_id,
            name=cat["name"],
            icon=cat["icon"],
        )
        for cat_id, cat in WIDGET_CATEGORIES.items()
    ]

    return WidgetRegistryResponse(widgets=widgets, categories=categories)
