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
    Headphones,
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
    GitCommitHorizontal,
} from "lucide-react";

export type SidebarLayoutType = "grouped" | "flat";

export interface SidebarItemConfig {
    href: string;
    label: string;
    icon: LucideIcon;
    items?: SidebarItemConfig[];
}

export interface SidebarSectionConfig {
    id: string;
    label: string;
    items: SidebarItemConfig[];
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
    { href: "/tracking/work-stats", label: "Work Stats", icon: GitCommitHorizontal },
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
];

const automationsItems: SidebarItemConfig[] = [
    { href: "/automations", label: "All Automations", icon: Zap },
    { href: "/automations/new", label: "Create Automation", icon: UserPlus },
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
            ],
        },
        {
            id: "engineering",
            label: "Engineering",
            items: [
                {
                    href: "/tracking",
                    label: "Tracking",
                    icon: Target,
                    items: trackingItems,
                },
                {
                    href: "/sprints",
                    label: "Planning",
                    icon: Calendar,
                    items: planningItems,
                },
                { href: "/tickets", label: "Tickets", icon: Ticket },
                {
                    href: "/uptime",
                    label: "Uptime",
                    icon: MonitorCheck,
                    items: uptimeItems,
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
                },
                { href: "/learning", label: "Learning", icon: GraduationCap },
            ],
        },
        {
            id: "business",
            label: "Business",
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
            ],
        },
        {
            id: "knowledge",
            label: "Knowledge",
            items: [
                { href: "/docs", label: "Docs", icon: FileText },
                { href: "/forms", label: "Forms", icon: FormInput },
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
                {
                    href: "/tracking",
                    label: "Tracking",
                    icon: Target,
                    items: trackingItems,
                },
                {
                    href: "/sprints",
                    label: "Planning",
                    icon: Calendar,
                    items: planningItems,
                },
                { href: "/tickets", label: "Tickets", icon: Ticket },
                {
                    href: "/uptime",
                    label: "Uptime",
                    icon: MonitorCheck,
                    items: uptimeItems,
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
                },
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
                { href: "/learning", label: "Learning", icon: GraduationCap },
                { href: "/docs", label: "Docs", icon: FileText },
                { href: "/forms", label: "Forms", icon: FormInput },
            ],
        },
    ],
};

export const SIDEBAR_LAYOUTS: Record<SidebarLayoutType, SidebarLayoutConfig> = {
    grouped: GROUPED_LAYOUT,
    flat: FLAT_LAYOUT,
};

export const DEFAULT_SIDEBAR_LAYOUT: SidebarLayoutType = "grouped";
