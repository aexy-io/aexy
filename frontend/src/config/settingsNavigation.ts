import type { Permission } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/hooks/usePermissions";
import {
  Palette,
  Building2,
  Shield,
  FolderGit2,
  FileText,
  Cpu,
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
  UsersRound,
  Webhook,
  KeyRound,
  Lock,
  Plug,
  Activity,
  Siren,
  Bell,
  Settings2,
  Receipt,
  Fingerprint,
  Globe,
  Inbox,
  Database,
  Clock,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";

export interface SettingsNavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  /**
   * The workspace permission required to open this page. Absent means the page is
   * a personal preference — your theme, your notification channels, your own
   * commits, your own API tokens — rather than workspace configuration.
   *
   * This replaced an `adminOnly` boolean that only 10 of 30 entries set, leaving
   * the other 20 — repositories, projects, task configuration, integrations,
   * escalation, ticket forms, billing — visible to every member of the workspace.
   *
   * Always use a `PERMISSIONS` constant, never a bare string. A key the backend
   * doesn't define hides the page from everyone, permanently and silently: nobody
   * holds a permission that does not exist. `settingsNavigation.test.ts` asserts
   * every key here exists in the backend catalogue.
   */
  permission?: Permission | Permission[];
  /** Require ANY of `permission` instead of all of them. */
  anyPermission?: boolean;
  /**
   * Workspace owner only, whatever their permissions — for pages whose whole
   * purpose is destructive or financial. Mirrors `OWNER_ONLY_PERMISSIONS` on the
   * backend, which an owner can still delegate per member.
   */
  ownerOnly?: boolean;
  /** Aexy platform staff, not workspace admins — cross-tenant internal tooling. */
  platformAdminOnly?: boolean;
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
        // Personal preference: your own theme and navigation.
        keywords: ["theme", "dark", "light", "layout", "sidebar", "visual"],
      },
      {
        id: "organization",
        label: "Organization",
        href: "/settings/organization",
        icon: Building2,
        description: "Manage your organization settings and preferences",
        permission: PERMISSIONS.CAN_MANAGE_ORG,
        keywords: ["workspace", "team", "members", "invite"],
      },
      {
        id: "roles",
        label: "Organization Roles",
        href: "/settings/organization/roles",
        icon: Users,
        description: "Configure custom roles and permissions",
        // Owner-only: an admin who can edit roles can grant themselves every
        // other owner-only permission and lock the owner out.
        permission: PERMISSIONS.CAN_MANAGE_ROLES,
        ownerOnly: true,
        keywords: ["permissions", "role", "custom", "rbac"],
      },
      {
        id: "ai",
        label: "AI & Providers",
        href: "/settings/ai",
        icon: Sparkles,
        description: "Turn AI off for the whole workspace, or use your own provider keys",
        permission: PERMISSIONS.CAN_MANAGE_WORKSPACE_SETTINGS,
        enterpriseBadge: true,
        keywords: [
          "ai",
          "llm",
          "disable",
          "kill switch",
          "provider",
          "api key",
          "anthropic",
          "claude",
          "gemini",
          "openrouter",
          "deepseek",
          "ollama",
          "byok",
          "privacy",
          "data",
        ],
      },
      {
        id: "ai-models",
        label: "AI Models",
        href: "/settings/ai/models",
        icon: Cpu,
        description: "Which model each AI feature runs on, in one place",
        permission: PERMISSIONS.CAN_MANAGE_WORKSPACE_SETTINGS,
        keywords: [
          "model",
          "models",
          "claude",
          "gemini",
          "gpt",
          "sonnet",
          "haiku",
          "cost",
          "spend",
          "ai",
        ],
      },
      {
        id: "notifications",
        label: "Notifications",
        href: "/settings/notifications",
        icon: Bell,
        description: "Configure notification channels and preferences",
        // Personal preference: which of your own notifications reach you where.
        keywords: ["notification", "alert", "email", "slack", "bell", "in-app"],
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
        permission: PERMISSIONS.CAN_MANAGE_INTEGRATIONS,
        keywords: ["github", "repo", "sync", "git", "code"],
      },
      {
        id: "docs",
        label: "Documentation",
        href: "/settings/docs",
        icon: FileText,
        description: "How the AI drafts edits to Word documents, and who hears about it",
        // Workspace settings rather than a docs permission: there is no
        // `can_manage_docs` on the backend — only view/create/edit/delete — and
        // inventing one here would fail the settings-navigation test, which
        // parses models/permissions.py.
        permission: PERMISSIONS.CAN_MANAGE_WORKSPACE_SETTINGS,
        keywords: [
          "docs",
          "word",
          "docx",
          "ai",
          "tracked changes",
          "redline",
          "comments",
          "review",
        ],
      },
      {
        id: "identity",
        label: "Identity",
        href: "/settings/identity",
        icon: Fingerprint,
        description: "Reclaim commits attributed to an orphaned GitHub identity",
        // Personal: you are claiming your OWN commits. Gating this on an admin
        // permission would mean only admins could fix their own attribution.
        keywords: ["ghost", "claim", "github", "commits", "merge", "attribution"],
      },
      {
        id: "teams",
        label: "Teams",
        href: "/settings/teams",
        icon: UsersRound,
        description: "Create teams, manage their members, and sync them from repositories",
        permission: PERMISSIONS.CAN_MANAGE_TEAM_MEMBERS,
        keywords: [
          "team",
          "squad",
          "group",
          "members",
          "department",
          "repository",
          "sync",
          "oncall",
          "standup",
          "escalation",
        ],
      },
      {
        id: "projects",
        label: "Projects",
        href: "/settings/projects",
        icon: FolderKanban,
        description: "Manage projects, members, and permissions",
        permission: PERMISSIONS.CAN_EDIT_PROJECTS,
        keywords: ["project", "team", "kanban", "sprint"],
      },
      {
        id: "task-config",
        label: "Task Configuration",
        href: "/settings/task-config",
        icon: ListChecks,
        description: "Configure custom statuses and fields for sprint tasks",
        // Not CAN_MANAGE_TASKS: every member holds that (it means "work with
        // tasks"), and this page edits the workspace-wide status and field
        // schema every board then renders.
        permission: PERMISSIONS.CAN_MANAGE_WORKSPACE_SETTINGS,
        keywords: ["status", "field", "custom", "task", "sprint", "workflow"],
      },
      {
        id: "insights",
        label: "Insights",
        href: "/settings/insights",
        icon: TrendingUp,
        description: "Configure developer insights, team metrics, and working hours",
        permission: PERMISSIONS.CAN_MANAGE_INSIGHTS,
        keywords: ["metrics", "analytics", "developer", "performance", "hours"],
      },
      {
        id: "tracker",
        label: "Tracker",
        href: "/settings/tracker",
        icon: Activity,
        description: "Enable the Aexy Tracker per project and view team tracker records",
        permission: PERMISSIONS.CAN_MANAGE_TRACKING,
        keywords: ["tracker", "timesheet", "capture", "screenshots", "activity", "macos"],
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
        permission: PERMISSIONS.CAN_MANAGE_TICKETS,
        keywords: ["escalation", "severity", "rules", "notification", "sla"],
      },
      {
        id: "ticket-forms",
        label: "Ticket Forms",
        href: "/settings/ticket-forms",
        icon: Ticket,
        description: "Create and manage public forms for collecting tickets",
        permission: PERMISSIONS.CAN_MANAGE_FORMS,
        keywords: ["form", "ticket", "public", "submission", "template"],
      },
      {
        id: "alerting",
        label: "Alert Integrations",
        href: "/settings/alerting",
        icon: Siren,
        description: "Turn observability alerts (OpenObserve, etc.) into deduplicated tickets",
        permission: PERMISSIONS.CAN_MANAGE_TICKETS,
        keywords: ["alert", "openobserve", "observability", "logging", "incident", "dedup", "monitoring", "webhook"],
      },
    ],
  },
  {
    // The desk's own configuration. It used to live behind the Service Desk
    // app at /service-desk/settings, which made it the one settings surface
    // not reachable from Settings — while Escalation Matrix and Ticket Forms,
    // which configure the same desk, were already here.
    id: "service-desk",
    label: "Service Desk",
    items: [
      {
        id: "service-desk-mailboxes",
        label: "Mailboxes",
        href: "/settings/service-desk/mailboxes",
        icon: Inbox,
        description: "The addresses tickets arrive at, by webhook or Gmail sync",
        permission: PERMISSIONS.CAN_MANAGE_TICKETS,
        keywords: ["mailbox", "inbox", "email", "address", "gmail", "webhook", "intake", "support"],
      },
      {
        id: "service-desk-master-data",
        label: "Master Data",
        href: "/settings/service-desk/master-data",
        icon: Database,
        description: "Accounts, vendors, and products the desk classifies tickets against",
        permission: PERMISSIONS.CAN_MANAGE_TICKETS,
        keywords: ["master", "data", "accounts", "partners", "customers", "vendors", "insurers", "products", "taxonomy"],
      },
      {
        id: "service-desk-stakeholders",
        label: "Pending-With Buckets",
        href: "/settings/service-desk/stakeholders",
        icon: Users,
        description: "The parties a ticket can be waiting on, and which department owns each",
        permission: PERMISSIONS.CAN_MANAGE_TICKETS,
        keywords: ["stakeholder", "pending", "bucket", "queue", "handoff", "tech", "product", "department", "taxonomy"],
      },
      {
        id: "service-desk-hours",
        label: "Working Hours & SLA",
        href: "/settings/service-desk/hours",
        icon: Clock,
        description: "The shift the breach clock runs on, and the test SLA override",
        permission: PERMISSIONS.CAN_MANAGE_TICKETS,
        keywords: ["hours", "shift", "sla", "breach", "clock", "working", "timezone", "target"],
      },
      {
        id: "service-desk-scorecard",
        label: "Owner Scorecard",
        href: "/settings/service-desk/scorecard",
        icon: Clock,
        description: "KPI weights, benchmarks and rating bands the owner scorecard grades on",
        permission: PERMISSIONS.CAN_MANAGE_TICKETS,
        keywords: ["scorecard", "kpi", "weight", "benchmark", "rating", "performance", "sim", "owner", "productivity"],
      },
      {
        id: "service-desk-intake",
        label: "Ticket Intake",
        href: "/settings/service-desk/intake",
        icon: Ticket,
        description: "Which department receives incoming tickets and gets the digest",
        permission: PERMISSIONS.CAN_MANAGE_TICKETS,
        keywords: ["intake", "department", "routing", "assign", "queue", "digest"],
      },
      {
        id: "service-desk-identity",
        label: "Desk Identity",
        href: "/settings/service-desk/identity",
        icon: BadgeCheck,
        description: "Ticket prefix, timezone, breach thresholds, and customer-facing email copy",
        permission: PERMISSIONS.CAN_MANAGE_TICKETS,
        keywords: ["prefix", "identity", "timezone", "breach", "threshold", "template", "email", "copy"],
      },
      {
        id: "service-desk-digest",
        label: "Open-Ticket Digest",
        href: "/settings/service-desk/digest",
        icon: Mail,
        description: "Whether the open-ticket summary goes out, when, and to whom",
        permission: PERMISSIONS.CAN_MANAGE_TICKETS,
        keywords: ["digest", "summary", "email", "schedule", "recipients", "daily", "open tickets"],
      },
      {
        id: "service-desk-ai",
        label: "Desk AI",
        href: "/settings/service-desk/ai",
        icon: Sparkles,
        description: "AI ticket categorisation and automatic splitting of combined requests",
        permission: PERMISSIONS.CAN_MANAGE_TICKETS,
        keywords: ["ai", "categorisation", "classification", "split", "automatic", "triage"],
      },
    ],
  },
  {
    id: "communication",
    label: "Communication",
    items: [
      {
        id: "community",
        label: "Public Community",
        href: "/settings/community",
        icon: Globe,
        description: "Publish chat channels as a public, SEO-friendly forum",
        // Publishes workspace content to the open internet.
        permission: PERMISSIONS.CAN_MANAGE_WORKSPACE_SETTINGS,
        keywords: ["community", "public", "forum", "seo", "chat", "channels", "discourse", "slack"],
      },
      {
        id: "crm-settings",
        label: "CRM Objects",
        href: "/settings/crm",
        icon: Contact,
        description: "Configure CRM objects, attributes, and their appearance",
        permission: PERMISSIONS.CAN_MANAGE_CRM,
        keywords: ["crm", "contacts", "deals", "pipeline", "sales", "objects", "attributes"],
      },
      {
        id: "crm-integrations",
        label: "CRM Integrations",
        href: "/settings/crm/integrations",
        icon: Link2,
        description: "Connect Google so Gmail and Calendar populate the CRM",
        // Same gate as CRM Objects: this is CRM configuration, not the generic
        // workspace integrations page.
        permission: PERMISSIONS.CAN_MANAGE_CRM,
        keywords: ["crm", "google", "gmail", "calendar", "sync", "deals", "automation"],
      },
      {
        id: "email-marketing",
        label: "Email Infrastructure",
        href: "/settings/email-marketing",
        icon: Mail,
        description: "Configure sending domains, providers, and subscription categories",
        permission: PERMISSIONS.CAN_MANAGE_INTEGRATIONS,
        keywords: ["email", "marketing", "campaign", "domain", "sending", "ses", "provider"],
      },
      {
        id: "email-delivery",
        label: "Email Delivery",
        href: "/settings/email-delivery",
        icon: Send,
        description: "Monitor email delivery status and logs",
        permission: PERMISSIONS.CAN_MANAGE_INTEGRATIONS,
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
        permission: PERMISSIONS.CAN_MANAGE_INTEGRATIONS,
        keywords: ["jira", "linear", "slack", "github", "connect", "external"],
      },
      {
        id: "webhooks",
        label: "Webhooks",
        href: "/settings/webhooks",
        icon: Webhook,
        description: "Manage webhook endpoints for real-time event notifications",
        permission: PERMISSIONS.CAN_MANAGE_INTEGRATIONS,
        keywords: ["webhook", "event", "endpoint", "notification", "api", "callback"],
      },
    ],
  },
  {
    id: "security",
    label: "Security",
    items: [
      {
        id: "sso",
        label: "Single Sign-On",
        href: "/settings/sso",
        icon: KeyRound,
        description: "Configure SAML or OpenID Connect for centralized authentication",
        // Owner-only: whoever controls the identity provider controls every login.
        permission: PERMISSIONS.CAN_MANAGE_WORKSPACE_SETTINGS,
        ownerOnly: true,
        enterpriseBadge: true,
        keywords: ["sso", "saml", "oidc", "authentication", "identity", "okta", "azure"],
      },
      {
        id: "api-tokens",
        label: "API Tokens",
        href: "/settings/api-tokens",
        icon: KeyRound,
        description: "Create and manage API tokens for MCP and external integrations",
        // Personal: tokens are minted against the caller's own identity and carry
        // only their own permissions, so this is not an escalation path.
        keywords: ["api", "token", "key", "mcp", "integration", "authentication"],
      },
      {
        id: "connected-accounts",
        label: "Connected Accounts",
        href: "/settings/connected-accounts",
        icon: Mail,
        description: "Connect your own Google account for mail, calendar and Service Desk",
        // Personal, and deliberately ungated: the API already lets any member
        // connect their own mailbox, and gating the page meant a support agent
        // could never put their inbox on the Service Desk without an admin
        // signing in to Google as them.
        keywords: [
          "google",
          "gmail",
          "calendar",
          "connect",
          "mailbox",
          "account",
          "service desk",
          "oauth",
        ],
      },
      {
        id: "connectors",
        label: "Connected Apps",
        href: "/settings/connectors",
        icon: Plug,
        description: "Review and revoke the AI clients you have connected over MCP",
        // Personal: these are the caller's own OAuth grants, made by them at a
        // consent screen and carrying only their own access.
        keywords: [
          "connector",
          "connected",
          "mcp",
          "oauth",
          "chatgpt",
          "claude",
          "revoke",
          "authorize",
        ],
      },
      {
        id: "workflow-secrets",
        label: "Workflow Secrets",
        href: "/settings/workflow-secrets",
        icon: Lock,
        description:
          "Store credentials for automation steps so they are referenced, not pasted into workflows",
        permission: PERMISSIONS.CAN_MANAGE_INTEGRATIONS,
        keywords: [
          "secret",
          "credential",
          "automation",
          "workflow",
          "webhook",
          "header",
          "authorization",
          "bearer",
          "api key",
        ],
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
        permission: PERMISSIONS.CAN_MANAGE_BILLING,
        ownerOnly: true,
        keywords: ["plan", "pricing", "upgrade", "downgrade", "subscription", "pro", "enterprise"],
      },
      {
        id: "billing",
        label: "Billing & Subscription",
        href: "/settings/billing",
        icon: CreditCard,
        description: "Manage your subscription, billing, and payment methods",
        permission: PERMISSIONS.CAN_MANAGE_BILLING,
        ownerOnly: true,
        keywords: ["billing", "payment", "invoice", "stripe", "credit card"],
      },
      {
        id: "billing-breakdown",
        label: "Billing Breakdown",
        href: "/settings/billing/breakdown",
        icon: Receipt,
        description: "Line-item breakdown of charges, usage, rates, and prior periods",
        // Read-only reporting, so viewing is enough — an admin reconciling spend
        // shouldn't need the permission that lets them change the plan.
        permission: PERMISSIONS.CAN_VIEW_BILLING,
        keywords: ["billing", "breakdown", "line item", "usage", "rate", "invoice", "history"],
      },
      {
        id: "usage",
        label: "Usage & Limits",
        href: "/settings/usage",
        icon: Activity,
        description: "Monitor AI token consumption, plan limits, and cost projections",
        permission: PERMISSIONS.CAN_VIEW_BILLING,
        keywords: ["usage", "tokens", "limits", "consumption", "cost", "ai", "quota"],
      },
      {
        id: "access",
        label: "Access Control",
        href: "/settings/access",
        icon: Shield,
        description: "Manage which apps and modules each member can access",
        // Same reasoning as Organization Roles: this grants access to other people.
        permission: PERMISSIONS.CAN_MANAGE_ROLES,
        ownerOnly: true,
        keywords: ["access", "control", "permission", "app", "module", "matrix"],
      },
      {
        id: "plan-overrides",
        label: "Plan Overrides",
        href: "/settings/plan-overrides",
        icon: Settings2,
        description: "Configure custom pricing, limits, and billing models per workspace",
        // Aexy staff tooling: sets pricing across tenants, not a workspace setting.
        platformAdminOnly: true,
        keywords: ["plan", "override", "custom", "pricing", "discount", "admin", "billing model"],
      },
      {
        id: "admin-invoices",
        label: "Invoices",
        href: "/settings/admin-invoices",
        icon: Receipt,
        description: "Create, manage, and reconcile invoices for B2B customers",
        platformAdminOnly: true,
        keywords: ["invoice", "billing", "payment", "bank transfer", "manual", "reconcile"],
      },
    ],
  },
];

export function getAllSettingsNavItems(): SettingsNavItem[] {
  return settingsNavigation.flatMap((category) => category.items);
}

/**
 * Whether the caller may open this settings page.
 *
 * One function decides, so the sidebar, the index and the access-denied panel can
 * never disagree about who sees what. The previous split — an `adminOnly` flag in
 * the nav plus ad-hoc checks inside individual pages — is how the whole thing
 * drifted out of step in the first place.
 */
export function canAccessSettingsItem(
  item: SettingsNavItem,
  ctx: {
    permissions: string[];
    isOwner: boolean;
    isPlatformAdmin: boolean;
  }
): boolean {
  // Cross-tenant staff tooling is never reachable by workspace role.
  if (item.platformAdminOnly) return ctx.isPlatformAdmin;

  // Platform staff support customers, so they can see workspace pages.
  if (ctx.isPlatformAdmin) return true;

  // The owner holds everything, including the owner-only pages.
  if (ctx.isOwner) return true;

  if (item.ownerOnly) return false;
  if (!item.permission) return true;

  const needed = Array.isArray(item.permission) ? item.permission : [item.permission];
  return item.anyPermission
    ? needed.some((p) => ctx.permissions.includes(p))
    : needed.every((p) => ctx.permissions.includes(p));
}
