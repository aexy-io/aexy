/**
 * App Definitions Configuration
 * Defines all available apps, their modules, and route mappings
 * Used for app access control and sidebar filtering
 */

import {
  LayoutDashboard,
  Activity,
  Zap,
  Ticket,
  Star,
  Users,
  GraduationCap,
  Building2,
  Mail,
  FileText,
  ClipboardList,
  Phone,
  CalendarCheck,
  MonitorCheck,
  Bot,
  TrendingUp,
  LucideIcon,
} from "lucide-react";

export type AppCategory = "engineering" | "people" | "business" | "productivity";

export interface AppModule {
  id: string;
  name: string;
  description: string;
  route: string; // Relative route within the app
}

export interface AppDefinition {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: AppCategory;
  baseRoute: string;
  requiredPermission: string | null;
  modules: AppModule[];
}

export interface AppBundleTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  isSystem: boolean;
  appConfig: Record<string, AppAccessConfig>;
}

export interface AppAccessConfig {
  enabled: boolean;
  modules?: Record<string, boolean>;
}

export interface EffectiveAppAccess {
  appId: string;
  enabled: boolean;
  modules: Record<string, boolean>;
}

export interface MemberAppAccess {
  apps: Record<string, EffectiveAppAccess>;
  appliedTemplateId: string | null;
  appliedTemplateName: string | null;
  hasCustomOverrides: boolean;
  isAdmin: boolean;
}

// Master app catalog
export const APP_CATALOG: Record<string, AppDefinition> = {
  dashboard: {
    id: "dashboard",
    name: "Dashboard",
    description: "Overview and analytics dashboard",
    icon: LayoutDashboard,
    category: "productivity",
    baseRoute: "/dashboard",
    requiredPermission: null,
    modules: [],
  },
  tracking: {
    id: "tracking",
    name: "Tracking",
    description: "Standups, blockers, and time tracking",
    icon: Activity,
    category: "engineering",
    baseRoute: "/tracking",
    requiredPermission: "can_view_tracking",
    modules: [
      { id: "standups", name: "Standups", description: "Daily standup submissions", route: "/standups" },
      { id: "blockers", name: "Blockers", description: "Track and manage blockers", route: "/blockers" },
      { id: "time", name: "Time Tracking", description: "Log and track work hours", route: "/time" },
    ],
  },
  sprints: {
    id: "sprints",
    name: "Sprints",
    description: "Sprint planning and task management",
    icon: Zap,
    category: "engineering",
    baseRoute: "/sprints",
    requiredPermission: "can_view_sprints",
    modules: [
      { id: "board", name: "Sprint Board", description: "Kanban-style sprint board", route: "/board" },
      { id: "epics", name: "Epics", description: "Manage epics and user stories", route: "/epics" },
      { id: "tasks", name: "Tasks", description: "Task management and assignment", route: "/tasks" },
      { id: "backlog", name: "Backlog", description: "Product backlog management", route: "/backlog" },
    ],
  },
  tickets: {
    id: "tickets",
    name: "Tickets",
    description: "Support ticket management",
    icon: Ticket,
    category: "business",
    baseRoute: "/tickets",
    requiredPermission: "can_view_tickets",
    modules: [],
  },
  reviews: {
    id: "reviews",
    name: "Reviews",
    description: "Performance reviews and feedback",
    icon: Star,
    category: "people",
    baseRoute: "/reviews",
    requiredPermission: "can_view_reviews",
    modules: [
      { id: "cycles", name: "Review Cycles", description: "Review cycle management", route: "/cycles" },
      { id: "goals", name: "Goals", description: "Work goals and OKRs", route: "/goals" },
      { id: "peer_requests", name: "Peer Requests", description: "Peer feedback requests", route: "/peer-requests" },
      { id: "manage", name: "Manage", description: "Admin review management", route: "/manage" },
    ],
  },
  hiring: {
    id: "hiring",
    name: "Hiring",
    description: "Recruitment and assessments",
    icon: Users,
    category: "people",
    baseRoute: "/hiring",
    requiredPermission: "can_view_hiring",
    modules: [
      { id: "dashboard", name: "Dashboard", description: "Hiring overview and metrics", route: "/dashboard" },
      { id: "candidates", name: "Candidates", description: "Manage candidates", route: "/candidates" },
      { id: "assessments", name: "Assessments", description: "Technical assessments", route: "/assessments" },
      { id: "questions", name: "Question Bank", description: "Assessment questions library", route: "/questions" },
      { id: "templates", name: "Templates", description: "Assessment templates", route: "/templates" },
      { id: "analytics", name: "Analytics", description: "Hiring analytics and reports", route: "/analytics" },
    ],
  },
  learning: {
    id: "learning",
    name: "Learning",
    description: "Learning paths and courses",
    icon: GraduationCap,
    category: "people",
    baseRoute: "/learning",
    requiredPermission: "can_view_learning",
    modules: [],
  },
  crm: {
    id: "crm",
    name: "CRM",
    description: "Customer relationship management",
    icon: Building2,
    category: "business",
    baseRoute: "/crm",
    requiredPermission: "can_view_crm",
    modules: [
      { id: "overview", name: "Overview", description: "CRM dashboard and pipeline", route: "" },
      { id: "inbox", name: "Inbox", description: "Email inbox and communications", route: "/inbox" },
      { id: "agents", name: "AI Agents", description: "Configure AI sales agents", route: "/agents" },
      { id: "activities", name: "Activities", description: "Activity tracking and logs", route: "/activities" },
      { id: "automations", name: "Automations", description: "Sales automations and sequences", route: "/automations" },
      { id: "calendar", name: "Calendar", description: "Meeting and event calendar", route: "/calendar" },
    ],
  },
  email_marketing: {
    id: "email_marketing",
    name: "Email Marketing",
    description: "Email campaigns and automation",
    icon: Mail,
    category: "business",
    baseRoute: "/email-marketing",
    requiredPermission: "can_view_crm",
    modules: [
      { id: "campaigns", name: "Campaigns", description: "Email campaign management", route: "/campaigns" },
      { id: "templates", name: "Templates", description: "Email templates library", route: "/templates" },
      { id: "settings", name: "Settings", description: "Email settings and domains", route: "/settings" },
    ],
  },
  docs: {
    id: "docs",
    name: "Docs",
    description: "Documentation and wiki",
    icon: FileText,
    category: "productivity",
    baseRoute: "/docs",
    requiredPermission: "can_view_docs",
    modules: [],
  },
  forms: {
    id: "forms",
    name: "Forms",
    description: "Form builder and submissions",
    icon: ClipboardList,
    category: "productivity",
    baseRoute: "/forms",
    requiredPermission: "can_view_forms",
    modules: [],
  },
  oncall: {
    id: "oncall",
    name: "On-Call",
    description: "On-call schedules and rotations",
    icon: Phone,
    category: "engineering",
    baseRoute: "/oncall",
    requiredPermission: "can_view_oncall",
    modules: [],
  },
  booking: {
    id: "booking",
    name: "Booking",
    description: "Calendar booking and scheduling",
    icon: CalendarCheck,
    category: "business",
    baseRoute: "/booking",
    requiredPermission: "can_view_booking",
    modules: [
      { id: "event_types", name: "Event Types", description: "Manage bookable event types", route: "/event-types" },
      { id: "availability", name: "Availability", description: "Set your availability schedule", route: "/availability" },
      { id: "calendars", name: "Calendars", description: "Connect external calendars", route: "/calendars" },
    ],
  },
  uptime: {
    id: "uptime",
    name: "Uptime",
    description: "Endpoint monitoring and incident management",
    icon: MonitorCheck,
    category: "engineering",
    baseRoute: "/uptime",
    requiredPermission: "can_view_uptime",
    modules: [
      { id: "monitors", name: "Monitors", description: "HTTP, TCP, and WebSocket endpoint monitors", route: "/monitors" },
      { id: "incidents", name: "Incidents", description: "Active and resolved incidents", route: "/incidents" },
      { id: "history", name: "History", description: "Check history and uptime reports", route: "/history" },
    ],
  },
  automations: {
    id: "automations",
    name: "Automations",
    description: "Platform-wide workflow automations",
    icon: Zap,
    category: "productivity",
    baseRoute: "/automations",
    requiredPermission: "can_view_automations",
    modules: [],
  },
  agents: {
    id: "agents",
    name: "AI Agents",
    description: "AI-powered automation agents",
    icon: Bot,
    category: "productivity",
    baseRoute: "/agents",
    requiredPermission: "can_view_agents",
    modules: [],
  },
  insights: {
    id: "insights",
    name: "Insights",
    description: "Developer productivity metrics and team analytics",
    icon: TrendingUp,
    category: "engineering",
    baseRoute: "/insights",
    requiredPermission: "can_view_insights",
    modules: [
      { id: "team_overview", name: "Team Overview", description: "Team-wide velocity, efficiency, and workload distribution", route: "" },
      { id: "leaderboard", name: "Leaderboard", description: "Ranked developer metrics", route: "/leaderboard" },
      { id: "developer_drilldown", name: "Developer Drill-down", description: "Individual developer metrics deep-dive", route: "/developers" },
    ],
  },
};

// Get app definition by ID
export function getAppById(appId: string): AppDefinition | undefined {
  return APP_CATALOG[appId];
}

// Get all apps as array
export function getAllApps(): AppDefinition[] {
  return Object.values(APP_CATALOG);
}

// Get apps by category
export function getAppsByCategory(category: AppCategory): AppDefinition[] {
  return Object.values(APP_CATALOG).filter((app) => app.category === category);
}

// Check if a route belongs to an app
export function getAppForRoute(pathname: string): AppDefinition | undefined {
  for (const app of Object.values(APP_CATALOG)) {
    if (pathname === app.baseRoute || pathname.startsWith(`${app.baseRoute}/`)) {
      return app;
    }
  }
  return undefined;
}

// Check if a route belongs to a specific module
export function getModuleForRoute(
  pathname: string
): { app: AppDefinition; module: AppModule } | undefined {
  for (const app of Object.values(APP_CATALOG)) {
    if (pathname === app.baseRoute || pathname.startsWith(`${app.baseRoute}/`)) {
      const relativePath = pathname.replace(app.baseRoute, "");
      for (const module of app.modules) {
        if (relativePath === module.route || relativePath.startsWith(`${module.route}/`)) {
          return { app, module };
        }
      }
      // If no module matched but app matched, return app without module
      return undefined;
    }
  }
  return undefined;
}

// System app bundle templates
export const SYSTEM_BUNDLES: AppBundleTemplate[] = [
  {
    id: "engineering",
    name: "Engineering",
    description: "Apps for software development teams",
    icon: "Code",
    color: "#2563eb",
    isSystem: true,
    appConfig: {
      dashboard: { enabled: true },
      tracking: { enabled: true, modules: { standups: true, blockers: true, time: true } },
      sprints: { enabled: true, modules: { board: true, epics: true, tasks: true, backlog: true } },
      tickets: { enabled: true },
      docs: { enabled: true },
      learning: { enabled: true },
      oncall: { enabled: true },
      uptime: { enabled: true, modules: { monitors: true, incidents: true, history: true } },
      reviews: { enabled: false },
      hiring: { enabled: false },
      crm: { enabled: false },
      email_marketing: { enabled: false },
      forms: { enabled: false },
      booking: { enabled: false },
      automations: { enabled: true },
      agents: { enabled: true },
      insights: { enabled: false },
    },
  },
  {
    id: "people",
    name: "People",
    description: "Apps for HR and people operations",
    icon: "Heart",
    color: "#f43f5e",
    isSystem: true,
    appConfig: {
      dashboard: { enabled: true },
      reviews: { enabled: true, modules: { cycles: true, goals: true, peer_requests: true, manage: true } },
      hiring: {
        enabled: true,
        modules: { dashboard: true, candidates: true, assessments: true, questions: true, templates: true, analytics: true },
      },
      learning: { enabled: true },
      docs: { enabled: true },
      forms: { enabled: true },
      tracking: { enabled: false },
      sprints: { enabled: false },
      tickets: { enabled: false },
      crm: { enabled: false },
      email_marketing: { enabled: false },
      oncall: { enabled: false },
      uptime: { enabled: false },
      booking: { enabled: false },
      automations: { enabled: true },
      agents: { enabled: true },
      insights: { enabled: false },
    },
  },
  {
    id: "business",
    name: "Business",
    description: "Apps for sales and customer success",
    icon: "Briefcase",
    color: "#06b6d4",
    isSystem: true,
    appConfig: {
      dashboard: { enabled: true },
      crm: {
        enabled: true,
        modules: { overview: true, inbox: true, agents: true, activities: true, automations: true, calendar: true },
      },
      email_marketing: { enabled: true, modules: { campaigns: true, templates: true, settings: true } },
      tickets: { enabled: true },
      docs: { enabled: true },
      forms: { enabled: true },
      tracking: { enabled: false },
      sprints: { enabled: false },
      reviews: { enabled: false },
      hiring: { enabled: false },
      learning: { enabled: false },
      oncall: { enabled: false },
      uptime: { enabled: false },
      booking: { enabled: true, modules: { event_types: true, availability: true, calendars: true } },
      automations: { enabled: true },
      agents: { enabled: true },
      insights: { enabled: false },
    },
  },
  {
    id: "full_access",
    name: "Full Access",
    description: "Access to all apps and modules",
    icon: "Shield",
    color: "#9333ea",
    isSystem: true,
    appConfig: {
      dashboard: { enabled: true },
      tracking: { enabled: true, modules: { standups: true, blockers: true, time: true } },
      sprints: { enabled: true, modules: { board: true, epics: true, tasks: true, backlog: true } },
      tickets: { enabled: true },
      reviews: { enabled: true, modules: { cycles: true, goals: true, peer_requests: true, manage: true } },
      hiring: {
        enabled: true,
        modules: { dashboard: true, candidates: true, assessments: true, questions: true, templates: true, analytics: true },
      },
      learning: { enabled: true },
      crm: {
        enabled: true,
        modules: { overview: true, inbox: true, agents: true, activities: true, automations: true, calendar: true },
      },
      email_marketing: { enabled: true, modules: { campaigns: true, templates: true, settings: true } },
      docs: { enabled: true },
      forms: { enabled: true },
      oncall: { enabled: true },
      uptime: { enabled: true, modules: { monitors: true, incidents: true, history: true } },
      booking: { enabled: true, modules: { event_types: true, availability: true, calendars: true } },
      automations: { enabled: true },
      agents: { enabled: true },
      insights: { enabled: true, modules: { team_overview: true, leaderboard: true, developer_drilldown: true } },
    },
  },
];

// Get bundle by ID
export function getBundleById(bundleId: string): AppBundleTemplate | undefined {
  return SYSTEM_BUNDLES.find((b) => b.id === bundleId);
}

// Map sidebar items to app IDs
export const SIDEBAR_TO_APP_MAP: Record<string, string> = {
  "/dashboard": "dashboard",
  "/tracking": "tracking",
  "/tracking/standups": "tracking",
  "/tracking/blockers": "tracking",
  "/tracking/time": "tracking",
  "/sprints": "sprints",
  "/tickets": "tickets",
  "/reviews": "reviews",
  "/reviews/cycles": "reviews",
  "/reviews/goals": "reviews",
  "/reviews/peer-requests": "reviews",
  "/reviews/manage": "reviews",
  "/hiring": "hiring",
  "/hiring/dashboard": "hiring",
  "/hiring/candidates": "hiring",
  "/hiring/assessments": "hiring",
  "/hiring/questions": "hiring",
  "/hiring/templates": "hiring",
  "/hiring/analytics": "hiring",
  "/learning": "learning",
  "/crm": "crm",
  "/crm/inbox": "crm",
  "/crm/activities": "crm",
  "/crm/calendar": "crm",
  "/automations": "automations",
  "/automations/new": "automations",
  "/agents": "agents",
  "/agents/new": "agents",
  "/email-marketing": "email_marketing",
  "/email-marketing/campaigns": "email_marketing",
  "/email-marketing/templates": "email_marketing",
  "/email-marketing/settings": "email_marketing",
  "/docs": "docs",
  "/forms": "forms",
  "/oncall": "oncall",
  "/booking": "booking",
  "/booking/event-types": "booking",
  "/booking/availability": "booking",
  "/booking/calendars": "booking",
  "/uptime": "uptime",
  "/uptime/monitors": "uptime",
  "/uptime/incidents": "uptime",
  "/uptime/history": "uptime",
  "/insights": "insights",
  "/insights/leaderboard": "insights",
  "/insights/developers": "insights",
};

// Get app ID from pathname
export function getAppIdFromPath(pathname: string): string | undefined {
  // Check exact match first
  if (SIDEBAR_TO_APP_MAP[pathname]) {
    return SIDEBAR_TO_APP_MAP[pathname];
  }

  // Check prefix matches
  for (const [route, appId] of Object.entries(SIDEBAR_TO_APP_MAP)) {
    if (pathname.startsWith(route + "/")) {
      return appId;
    }
  }

  // Fallback to getAppForRoute
  const app = getAppForRoute(pathname);
  return app?.id;
}
