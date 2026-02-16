import {
  Palette,
  Building2,
  Shield,
  FolderGit2,
  FolderKanban,
  ListChecks,
  TrendingUp,
  AlertTriangle,
  Ticket,
  Contact,
  Mail,
  Send,
  Link2,
  Sparkles,
  CreditCard,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface SettingsNavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  adminOnly?: boolean;
  enterpriseBadge?: boolean;
  keywords: string[];
  external?: boolean;
}

export interface SettingsNavCategory {
  id: string;
  label: string;
  items: SettingsNavItem[];
}

export const settingsNavigation: SettingsNavCategory[] = [
  {
    id: "general",
    label: "General",
    items: [
      {
        id: "appearance",
        label: "Appearance",
        href: "/settings/appearance",
        icon: Palette,
        description: "Customize sidebar layout and visual preferences",
        keywords: ["theme", "dark", "light", "layout", "sidebar", "visual"],
      },
      {
        id: "organization",
        label: "Organization",
        href: "/settings/organization",
        icon: Building2,
        description: "Manage your organization settings and preferences",
        keywords: ["workspace", "team", "members", "invite"],
      },
      {
        id: "roles",
        label: "Organization Roles",
        href: "/settings/organization/roles",
        icon: Users,
        description: "Configure custom roles and permissions",
        keywords: ["permissions", "role", "custom", "rbac"],
      },
    ],
  },
  {
    id: "development",
    label: "Development",
    items: [
      {
        id: "repositories",
        label: "Repositories",
        href: "/settings/repositories",
        icon: FolderGit2,
        description: "Manage GitHub repositories for analysis and sync",
        keywords: ["github", "repo", "sync", "git", "code"],
      },
      {
        id: "projects",
        label: "Projects",
        href: "/settings/projects",
        icon: FolderKanban,
        description: "Manage projects, members, and permissions",
        keywords: ["project", "team", "kanban", "sprint"],
      },
      {
        id: "task-config",
        label: "Task Configuration",
        href: "/settings/task-config",
        icon: ListChecks,
        description: "Configure custom statuses and fields for sprint tasks",
        keywords: ["status", "field", "custom", "task", "sprint", "workflow"],
      },
      {
        id: "insights",
        label: "Insights",
        href: "/settings/insights",
        icon: TrendingUp,
        description: "Configure developer insights, team metrics, and working hours",
        adminOnly: true,
        keywords: ["metrics", "analytics", "developer", "performance", "hours"],
      },
    ],
  },
  {
    id: "automation",
    label: "Automation",
    items: [
      {
        id: "escalation",
        label: "Escalation Matrix",
        href: "/settings/escalation",
        icon: AlertTriangle,
        description: "Configure automatic escalation rules based on ticket severity",
        keywords: ["escalation", "severity", "rules", "notification", "sla"],
      },
      {
        id: "ticket-forms",
        label: "Ticket Forms",
        href: "/settings/ticket-forms",
        icon: Ticket,
        description: "Create and manage public forms for collecting tickets",
        keywords: ["form", "ticket", "public", "submission", "template"],
      },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    items: [
      {
        id: "crm-settings",
        label: "CRM Settings",
        href: "/crm/settings",
        icon: Contact,
        description: "Configure CRM objects, integrations, and deal automation",
        keywords: ["crm", "contacts", "deals", "pipeline", "sales"],
        external: true,
      },
      {
        id: "email-marketing",
        label: "Email Marketing",
        href: "/email-marketing/settings",
        icon: Mail,
        description: "Configure sending domains, providers, and email infrastructure",
        keywords: ["email", "marketing", "campaign", "domain", "sending"],
        external: true,
      },
      {
        id: "email-delivery",
        label: "Email Delivery",
        href: "/settings/email-delivery",
        icon: Send,
        description: "Monitor email delivery status and logs",
        adminOnly: true,
        enterpriseBadge: true,
        keywords: ["email", "delivery", "logs", "status", "bounce"],
      },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    items: [
      {
        id: "integrations",
        label: "Integrations",
        href: "/settings/integrations",
        icon: Link2,
        description: "Connect Jira, Linear, Slack, and other external tools",
        keywords: ["jira", "linear", "slack", "github", "connect", "external"],
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    items: [
      {
        id: "plans",
        label: "Subscription Plans",
        href: "/settings/plans",
        icon: Sparkles,
        description: "Compare plans and upgrade or downgrade your subscription",
        keywords: ["plan", "pricing", "upgrade", "downgrade", "subscription", "pro", "enterprise"],
      },
      {
        id: "billing",
        label: "Billing & Subscription",
        href: "/settings/billing",
        icon: CreditCard,
        description: "Manage your subscription, billing, and payment methods",
        keywords: ["billing", "payment", "invoice", "stripe", "credit card"],
      },
      {
        id: "access",
        label: "Access Control",
        href: "/settings/access",
        icon: Shield,
        description: "Manage which apps and modules each member can access",
        adminOnly: true,
        keywords: ["access", "control", "permission", "app", "module", "matrix"],
      },
    ],
  },
];

export function getAllSettingsNavItems(): SettingsNavItem[] {
  return settingsNavigation.flatMap((category) => category.items);
}
