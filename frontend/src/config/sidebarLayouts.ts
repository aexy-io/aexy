/**
 * Sidebar Layout Configurations
 * Defines the two sidebar layout versions users can switch between
 */

import {
    LayoutDashboard,
    Target,
    Calendar,
    CalendarCheck,
    Ticket,
    FormInput,
    FileText,
    ClipboardCheck,
    GraduationCap,
    Users,
    Building2,
    Mail,
    MessageSquare,
    Ban,
    Clock,
    KanbanSquare,
    Milestone,
    Repeat,
    UserPlus,
    FileSpreadsheet,
    HelpCircle,
    FileStack,
    BarChart,
    Inbox,
    Activity,
    Zap,
    Send,
    FileCode,
    Settings,
    CalendarClock,
    Link2,
    LucideIcon,
    MonitorCheck,
    AlertTriangle,
    History,
    Bot,
    TrendingUp,
    ShieldCheck,
    FileSearch,
    Bell,
    CalendarDays,
    FolderGit2,
    RefreshCw,
    Palmtree,
    CheckSquare,
    Crosshair,
    Eye,
    BarChart2,
    Plug,
    Upload,
    ArrowRightLeft,
    Swords,
    Globe,
    LayoutTemplate,
    Download,
    Table2,
    BarChart3,
    HeartPulse,
    UserCheck,
} from "lucide-react";

export type SidebarLayoutType = "grouped" | "flat";

export interface SidebarItemConfig {
    href: string;
    label: string;
    icon: LucideIcon;
    items?: SidebarItemConfig[];
    personas?: string[]; // e.g. ["developer","manager"] — omit for all personas
}

export interface SidebarSectionConfig {
    id: string;
    label: string;
    items: SidebarItemConfig[];
    personas?: string[]; // section-level persona filter — omit for all personas
}

export interface SidebarLayoutConfig {
    id: SidebarLayoutType;
    name: string;
    description: string;
    sections: SidebarSectionConfig[];
}

// Shared item definitions
const trackingItems: SidebarItemConfig[] = [
    { href: "/tracking/standups", label: "Standups", icon: MessageSquare },
    { href: "/tracking/blockers", label: "Blockers", icon: Ban },
    { href: "/tracking/time", label: "Time", icon: Clock },
];

const planningItems: SidebarItemConfig[] = [
    { href: "/sprints", label: "Board", icon: KanbanSquare },
    { href: "/sprints?tab=epics", label: "Epics", icon: Milestone },
];

const reviewsItems: SidebarItemConfig[] = [
    { href: "/reviews/cycles", label: "Cycles", icon: Repeat },
    { href: "/reviews/goals", label: "Goals", icon: Target },
    { href: "/reviews/peer-requests", label: "Peer Requests", icon: Users },
    { href: "/reviews/manage", label: "Manage", icon: Settings },
];

const hiringItems: SidebarItemConfig[] = [
    { href: "/hiring/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/hiring/candidates", label: "Candidates", icon: UserPlus },
    { href: "/hiring/assessments", label: "Assessments", icon: FileSpreadsheet },
    { href: "/hiring/questions", label: "Questions", icon: HelpCircle },
    { href: "/hiring/templates", label: "Templates", icon: FileStack },
    { href: "/hiring/analytics", label: "Analytics", icon: BarChart },
];

const crmItems: SidebarItemConfig[] = [
    { href: "/crm", label: "Overview", icon: LayoutDashboard },
    { href: "/crm/inbox", label: "Inbox", icon: Inbox },
    { href: "/crm/activities", label: "Activities", icon: Activity },
    { href: "/crm/calendar", label: "Calendar", icon: Calendar },
];

const emailItems: SidebarItemConfig[] = [
    { href: "/email-marketing/campaigns", label: "Campaigns", icon: Send },
    { href: "/email-marketing/templates", label: "Templates", icon: FileCode },
    { href: "/email-marketing/settings", label: "Settings", icon: Settings },
];

const bookingItems: SidebarItemConfig[] = [
    { href: "/booking/event-types", label: "Event Types", icon: CalendarCheck },
    { href: "/booking/availability", label: "Availability", icon: CalendarClock },
    { href: "/booking/team-calendar", label: "Team Calendar", icon: Users },
    { href: "/booking/calendars", label: "Calendars", icon: Link2 },
];

const uptimeItems: SidebarItemConfig[] = [
    { href: "/uptime/monitors", label: "Monitors", icon: MonitorCheck },
    { href: "/uptime/incidents", label: "Incidents", icon: AlertTriangle },
    { href: "/uptime/history", label: "History", icon: History },
];

const aiAgentsItems: SidebarItemConfig[] = [
    { href: "/agents", label: "All Agents", icon: Bot },
    { href: "/agents/new", label: "Create Agent", icon: UserPlus },
    { href: "/mcp", label: "MCP", icon: Plug },
];

const automationsItems: SidebarItemConfig[] = [
    { href: "/automations", label: "All Automations", icon: Zap },
    { href: "/automations/new", label: "Create Automation", icon: UserPlus },
];

const insightsItems: SidebarItemConfig[] = [
    { href: "/insights", label: "Team Overview", icon: LayoutDashboard },
    { href: "/insights/leaderboard", label: "Leaderboard", icon: BarChart },
    { href: "/insights/repositories", label: "Repositories", icon: FolderGit2 },
    { href: "/insights/sync-status", label: "Sync Status", icon: RefreshCw },
];

const leaveItems: SidebarItemConfig[] = [
    { href: "/leave", label: "My Leaves", icon: Palmtree },
    { href: "/leave?tab=approvals", label: "Approvals", icon: CheckSquare },
    { href: "/leave?tab=settings", label: "Settings", icon: Settings },
];

const reportsItems: SidebarItemConfig[] = [
    { href: "/reports", label: "Custom Reports", icon: FileText },
    { href: "/exports", label: "Exports", icon: Download },
];

const complianceItems: SidebarItemConfig[] = [
    { href: "/compliance", label: "Dashboard", icon: LayoutDashboard },
    { href: "/compliance/reminders", label: "Reminders", icon: Bell },
    { href: "/compliance/documents", label: "Documents", icon: FileStack },
    { href: "/compliance/reminders/compliance", label: "Questionnaires", icon: FileSearch },
    { href: "/compliance/training", label: "Training", icon: GraduationCap },
    { href: "/compliance/certifications", label: "Certifications", icon: ShieldCheck },
    { href: "/compliance/calendar", label: "Calendar", icon: CalendarDays },
];

const gtmItems: SidebarItemConfig[] = [
    { href: "/gtm", label: "Dashboard", icon: LayoutDashboard },
    { href: "/gtm/visitors", label: "Visitors", icon: Eye },
    { href: "/gtm/scoring", label: "Scoring & ICP", icon: BarChart2 },
    { href: "/gtm/routing", label: "Routing", icon: UserCheck },
    { href: "/gtm/sequences", label: "Sequences", icon: Mail },
    { href: "/gtm/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/gtm/abm", label: "ABM", icon: Target },
    { href: "/gtm/competitors", label: "Competitors", icon: Swords },
    { href: "/gtm/intent", label: "Intent", icon: Zap },
    { href: "/gtm/health", label: "Health", icon: HeartPulse },
    { href: "/gtm/import", label: "Import", icon: Upload },
    { href: "/gtm/alerts", label: "Alerts", icon: Bell },
    { href: "/gtm/compliance", label: "Compliance", icon: ShieldCheck },
    { href: "/gtm/providers", label: "Providers", icon: Plug },
];

/**
 * Version 1: Grouped Layout (Role-Based)
 * Items organized by functional areas: Engineering, People, Business, Knowledge
 */
export const GROUPED_LAYOUT: SidebarLayoutConfig = {
    id: "grouped",
    name: "Grouped",
    description: "Items organized by functional areas",
    sections: [
        {
            id: "core",
            label: "", // No label for dashboard
            items: [
                { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
                { href: "/activity", label: "Activity", icon: Activity },
            ],
        },
        {
            id: "ai",
            label: "AI",
            items: [
                {
                    href: "/agents",
                    label: "AI Agents",
                    icon: Bot,
                    items: aiAgentsItems,
                },
                {
                    href: "/automations",
                    label: "Automations",
                    icon: Zap,
                    items: automationsItems,
                },
                { href: "/templates", label: "Templates", icon: LayoutTemplate },
            ],
        },
        {
            id: "engineering",
            label: "Engineering",
            personas: ["developer", "manager", "product", "admin"],
            items: [
                {
                    href: "/tracking",
                    label: "Tracking",
                    icon: Target,
                    items: trackingItems,
                    personas: ["developer", "manager", "product", "admin"],
                },
                {
                    href: "/sprints",
                    label: "Planning",
                    icon: Calendar,
                    items: planningItems,
                    personas: ["developer", "manager", "product", "admin"],
                },
                {
                    href: "/tickets",
                    label: "Tickets",
                    icon: Ticket,
                    personas: ["developer", "manager", "product", "support", "admin"],
                },
                {
                    href: "/uptime",
                    label: "Uptime",
                    icon: MonitorCheck,
                    items: uptimeItems,
                    personas: ["developer", "manager", "admin"],
                },
                {
                    href: "/insights",
                    label: "Insights",
                    icon: TrendingUp,
                    items: insightsItems,
                    personas: ["manager", "admin"],
                },
            ],
        },
        {
            id: "compliance",
            label: "Compliance",
            personas: ["hr", "manager", "admin"],
            items: [
                {
                    href: "/compliance",
                    label: "Compliance",
                    icon: ShieldCheck,
                    items: complianceItems,
                },
            ],
        },
        {
            id: "people",
            label: "People",
            items: [
                {
                    href: "/reviews",
                    label: "Reviews",
                    icon: ClipboardCheck,
                    items: reviewsItems,
                },
                {
                    href: "/hiring",
                    label: "Hiring",
                    icon: Users,
                    items: hiringItems,
                    personas: ["hr", "manager", "admin"],
                },
                {
                    href: "/leave",
                    label: "Leave",
                    icon: Palmtree,
                    items: leaveItems,
                },
                { href: "/learning", label: "Learning", icon: GraduationCap },
            ],
        },
        {
            id: "business",
            label: "Business",
            personas: ["sales", "support", "admin"],
            items: [
                {
                    href: "/crm",
                    label: "CRM",
                    icon: Building2,
                    items: crmItems,
                },
                {
                    href: "/booking",
                    label: "Booking",
                    icon: CalendarCheck,
                    items: bookingItems,
                },
                {
                    href: "/email-marketing",
                    label: "Email",
                    icon: Mail,
                    items: emailItems,
                },
                {
                    href: "/gtm",
                    label: "GTM",
                    icon: Crosshair,
                    items: gtmItems,
                },
            ],
        },
        {
            id: "knowledge",
            label: "Knowledge",
            items: [
                { href: "/docs", label: "Docs", icon: FileText },
                { href: "/tables", label: "Tables", icon: Table2 },
                { href: "/forms", label: "Forms", icon: FormInput },
                {
                    href: "/reports",
                    label: "Reports",
                    icon: BarChart,
                    items: reportsItems,
                },
            ],
        }
    ],
};

/**
 * Version 2: Flat Layout (Promoted Key Modules)
 * All major features at the top level for quick access
 */
export const FLAT_LAYOUT: SidebarLayoutConfig = {
    id: "flat",
    name: "Flat",
    description: "All features at the top level",
    sections: [
        {
            id: "main",
            label: "",
            items: [
                { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
                { href: "/activity", label: "Activity", icon: Activity },
                {
                    href: "/tracking",
                    label: "Tracking",
                    icon: Target,
                    items: trackingItems,
                    personas: ["developer", "manager", "product", "admin"],
                },
                {
                    href: "/sprints",
                    label: "Planning",
                    icon: Calendar,
                    items: planningItems,
                    personas: ["developer", "manager", "product", "admin"],
                },
                {
                    href: "/tickets",
                    label: "Tickets",
                    icon: Ticket,
                    personas: ["developer", "manager", "product", "support", "admin"],
                },
                {
                    href: "/uptime",
                    label: "Uptime",
                    icon: MonitorCheck,
                    items: uptimeItems,
                    personas: ["developer", "manager", "admin"],
                },
                {
                    href: "/compliance",
                    label: "Compliance",
                    icon: ShieldCheck,
                    items: complianceItems,
                    personas: ["hr", "manager", "admin"],
                },
                {
                    href: "/reviews",
                    label: "Reviews",
                    icon: ClipboardCheck,
                    items: reviewsItems,
                },
                {
                    href: "/hiring",
                    label: "Hiring",
                    icon: Users,
                    items: hiringItems,
                    personas: ["hr", "manager", "admin"],
                },
                {
                    href: "/crm",
                    label: "CRM",
                    icon: Building2,
                    items: crmItems,
                    personas: ["sales", "support", "admin"],
                },
                {
                    href: "/booking",
                    label: "Booking",
                    icon: CalendarCheck,
                    items: bookingItems,
                    personas: ["sales", "support", "admin"],
                },
                {
                    href: "/agents",
                    label: "AI Agents",
                    icon: Bot,
                    items: aiAgentsItems,
                },
                {
                    href: "/automations",
                    label: "Automations",
                    icon: Zap,
                    items: automationsItems,
                },
                { href: "/templates", label: "Templates", icon: LayoutTemplate },
                {
                    href: "/insights",
                    label: "Insights",
                    icon: TrendingUp,
                    items: insightsItems,
                    personas: ["manager", "admin"],
                },
                { href: "/learning", label: "Learning", icon: GraduationCap },
                {
                    href: "/leave",
                    label: "Leave",
                    icon: Palmtree,
                    items: leaveItems,
                },
                { href: "/docs", label: "Docs", icon: FileText },
                { href: "/tables", label: "Tables", icon: Table2 },
                { href: "/forms", label: "Forms", icon: FormInput },
                {
                    href: "/email-marketing",
                    label: "Email",
                    icon: Mail,
                    items: emailItems,
                    personas: ["sales", "support", "admin"],
                },
                {
                    href: "/gtm",
                    label: "GTM",
                    icon: Crosshair,
                    items: gtmItems,
                },
                { href: "/templates", label: "Templates", icon: LayoutTemplate },
                {
                    href: "/reports",
                    label: "Reports",
                    icon: BarChart,
                    items: reportsItems,
                },
            ],
        },
    ],
};

export const SIDEBAR_LAYOUTS: Record<SidebarLayoutType, SidebarLayoutConfig> = {
    grouped: GROUPED_LAYOUT,
    flat: FLAT_LAYOUT,
};

export const DEFAULT_SIDEBAR_LAYOUT: SidebarLayoutType = "grouped";
