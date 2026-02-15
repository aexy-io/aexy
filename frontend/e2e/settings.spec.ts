import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE, mockWorkspace, mockMembers, mockTeams, mockSubscription } from "./fixtures/shared-helpers";

// ──────────────────────────────────────────────────────────────────
// Mock data
// ──────────────────────────────────────────────────────────────────

const mockInstallationStatus = {
  has_installation: true,
  install_url: "https://github.com/apps/aexy/installations/new",
};

const mockInstallationStatusNoInstall = {
  has_installation: false,
  install_url: "https://github.com/apps/aexy/installations/new",
};

const mockRepositories = [
  {
    id: "repo-1",
    name: "frontend",
    owner_login: "testorg",
    owner_type: "Organization",
    organization_id: "org-1",
    is_enabled: true,
    is_private: false,
    language: "TypeScript",
    description: "Main frontend app",
    sync_status: "synced",
    webhook_status: "active",
  },
  {
    id: "repo-2",
    name: "backend",
    owner_login: "testorg",
    owner_type: "Organization",
    organization_id: "org-1",
    is_enabled: false,
    is_private: true,
    language: "Python",
    description: "API server",
    sync_status: "pending",
    webhook_status: "none",
  },
  {
    id: "repo-3",
    name: "my-side-project",
    owner_login: "testdev",
    owner_type: "User",
    organization_id: null,
    is_enabled: false,
    is_private: false,
    language: "JavaScript",
    description: "Personal project",
    sync_status: "pending",
    webhook_status: "none",
  },
];

const mockOrganizations = [
  {
    id: "org-1",
    name: "TestOrg",
    login: "testorg",
    avatar_url: null,
    is_enabled: true,
  },
];

const mockProjects = [
  {
    id: "proj-1",
    name: "Frontend Redesign",
    description: "Revamping the UI",
    color: "#6366f1",
    status: "active",
    is_public: true,
    member_count: 3,
    team_count: 1,
    workspace_id: "ws-1",
  },
  {
    id: "proj-2",
    name: "API Refactor",
    description: "Refactoring the API layer",
    color: "#22c55e",
    status: "on_hold",
    is_public: false,
    member_count: 2,
    team_count: 0,
    workspace_id: "ws-1",
  },
];

const mockJiraIntegration = {
  id: "jira-int-1",
  site_url: "https://testcompany.atlassian.net",
  user_email: "admin@testcompany.com",
  sync_enabled: true,
  last_sync_at: "2026-02-14T12:00:00Z",
  status_mappings: {},
};

const mockLinearIntegration = null;

const mockSlackIntegration = null;

const mockTaskStatuses = [
  { id: "status-1", name: "To Do", slug: "todo", category: "todo", color: "#3B82F6", is_default: true, position: 0 },
  { id: "status-2", name: "In Progress", slug: "in_progress", category: "in_progress", color: "#F59E0B", is_default: false, position: 1 },
  { id: "status-3", name: "Done", slug: "done", category: "done", color: "#10B981", is_default: false, position: 2 },
];

const mockCustomFields = [
  { id: "field-1", name: "Sprint Goal", slug: "sprint_goal", field_type: "text", is_required: false, default_value: "", options: [], position: 0 },
  { id: "field-2", name: "Story Points", slug: "story_points", field_type: "number", is_required: true, default_value: "0", options: [], position: 1 },
];

const mockTicketForms = [
  {
    id: "form-1",
    name: "Bug Report",
    description: "Report a software bug",
    template_type: "bug_report",
    is_active: true,
    submission_count: 42,
    public_url_token: "abc123",
    created_at: "2026-01-15T00:00:00Z",
  },
  {
    id: "form-2",
    name: "Feature Request",
    description: "Suggest a new feature",
    template_type: "feature_request",
    is_active: false,
    submission_count: 8,
    public_url_token: "def456",
    created_at: "2026-01-20T00:00:00Z",
  },
];

const mockEscalationMatrices = [
  {
    id: "esc-1",
    name: "Critical Issue Escalation",
    description: "Escalation for critical production issues",
    severity_levels: ["critical", "high"],
    is_active: true,
    form_ids: [],
    team_ids: [],
    rules: [
      { level: "level_1", delay_minutes: 0, channels: ["email", "in_app"], notify_users: [], notify_teams: [], notify_oncall: true },
      { level: "level_2", delay_minutes: 30, channels: ["email", "slack"], notify_users: [], notify_teams: [], notify_oncall: false },
    ],
  },
];

const mockAccessMatrix = {
  members: [
    {
      developer_id: "test-user-123",
      developer_name: "Test Developer",
      role_name: "admin",
      is_admin: true,
      apps: { tracking: "full", sprints: "full", tickets: "full", crm: "partial", hiring: "none" },
    },
    {
      developer_id: "dev-2",
      developer_name: "Alice Johnson",
      role_name: "member",
      is_admin: false,
      apps: { tracking: "full", sprints: "full", tickets: "full", crm: "none", hiring: "none" },
    },
  ],
  apps: ["tracking", "sprints", "tickets", "crm", "hiring"],
};

const mockAccessTemplates = [
  { id: "tpl-1", name: "Developer", description: "Standard dev access", apps: { tracking: true, sprints: true } },
  { id: "tpl-2", name: "Manager", description: "Full management access", apps: { tracking: true, sprints: true, crm: true } },
];

const mockBillingSubscription = {
  plan: {
    name: "Pro",
    tier: "pro",
    max_repos: 100,
    max_commits_per_repo: 100000,
    max_prs_per_repo: 10000,
    llm_requests_per_day: 1000,
    sync_history_days: -1,
    price_monthly_cents: 2900,
    enable_team_features: true,
    enable_advanced_analytics: true,
    enable_exports: true,
    enable_webhooks: true,
    enable_real_time_sync: true,
  },
  status: "active",
  subscription: {
    status: "active",
    current_period_start: "2026-01-15T00:00:00Z",
    current_period_end: "2026-02-15T00:00:00Z",
  },
  customer: {
    stripe_customer_id: "cus_test123",
  },
};

const mockBillingFree = {
  plan: {
    name: "Free",
    tier: "free",
    max_repos: 5,
    max_commits_per_repo: 1000,
    max_prs_per_repo: 100,
    llm_requests_per_day: 10,
    sync_history_days: 30,
    price_monthly_cents: 0,
    enable_team_features: false,
    enable_advanced_analytics: false,
    enable_exports: false,
    enable_webhooks: false,
    enable_real_time_sync: false,
  },
  status: "active",
  subscription: null,
  customer: null,
};

const mockUsageStats = {
  repos_used: 12,
  repos_limit: 100,
  llm_requests_today: 45,
  llm_requests_limit: 1000,
  members_count: 10,
};

const mockUsageTrend = {
  months: [
    { month: "2026-01", llm_requests: 800, repos_synced: 10 },
    { month: "2026-02", llm_requests: 650, repos_synced: 12 },
  ],
};

const mockPlans = [
  { tier: "free", name: "Free", price_monthly_cents: 0, price_annual_cents: 0, max_repos: 5 },
  { tier: "pro", name: "Pro", price_monthly_cents: 2900, price_annual_cents: 29000, max_repos: 100 },
  { tier: "enterprise", name: "Enterprise", price_monthly_cents: 0, price_annual_cents: 0, max_repos: -1 },
];

const mockRoles = [
  { id: "role-1", name: "Developer", workspace_id: "ws-1", permissions: {} },
  { id: "role-2", name: "Lead", workspace_id: "ws-1", permissions: {} },
];

const mockInsightsSettings = {
  working_hours: { start_hour: 9, end_hour: 18, timezone: "America/New_York", weekend_days: [0, 6] },
  metric_weights: { velocity: 25, efficiency: 25, quality: 25, sustainability: 15, collaboration: 10 },
  late_night_threshold_hour: 22,
  bottleneck_multiplier: 2.0,
  snapshot_auto_generate: true,
  snapshot_frequency: "weekly",
};

// ──────────────────────────────────────────────────────────────────
// Setup helpers
// ──────────────────────────────────────────────────────────────────

async function setupSettingsMocks(page: Page) {
  await setupCommonMocks(page);
}

async function setupAppearanceMocks(page: Page) {
  await setupCommonMocks(page);
}

async function setupBillingMocks(page: Page, variant: "pro" | "free" = "pro") {
  await setupCommonMocks(page);

  const billingData = variant === "pro" ? mockBillingSubscription : mockBillingFree;

  await page.route(`${API_BASE}/billing/subscription/status**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(billingData),
    });
  });

  await page.route(`**/workspaces/ws-1/billing**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(billingData),
    });
  });

  await page.route(`${API_BASE}/billing/usage/stats**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockUsageStats),
    });
  });

  await page.route(`${API_BASE}/billing/usage/trend**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockUsageTrend),
    });
  });

  await page.route(`${API_BASE}/billing/invoices**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route(`${API_BASE}/billing/usage/alerts**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

async function setupRepositoryMocks(page: Page, hasInstallation = true) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/repositories/installation-status**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(hasInstallation ? mockInstallationStatus : mockInstallationStatusNoInstall),
    });
  });

  await page.route(`${API_BASE}/repositories/organizations**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(hasInstallation ? mockOrganizations : []),
    });
  });

  await page.route(`${API_BASE}/repositories`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(hasInstallation ? mockRepositories : []),
    });
  });

  await page.route(`${API_BASE}/repositories/refresh**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ refreshed: true }),
    });
  });
}

async function setupOrganizationMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`**/workspaces/ws-1/billing-status**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ current_plan: "Pro" }),
    });
  });

  await page.route(`**/workspaces/ws-1/seat-usage**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ billable_seats: 3, base_seats: 5, additional_seats: 0 }),
    });
  });

  await page.route(`**/workspaces/ws-1/app-settings**`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          hiring: true,
          tracking: true,
          oncall: false,
          sprints: true,
          documents: true,
          ticketing: true,
        }),
      });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    }
  });
}

async function setupProjectsMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/projects`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockProjects),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/roles**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockRoles),
    });
  });
}

async function setupIntegrationsMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/integrations/jira**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockJiraIntegration),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/integrations/linear**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockLinearIntegration),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/integrations/slack**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockSlackIntegration),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/integrations/jira/statuses**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/integrations/linear/states**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

async function setupTaskConfigMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/task-statuses`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTaskStatuses),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/custom-fields`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockCustomFields),
    });
  });
}

async function setupTicketFormsMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/ticket-forms`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTicketForms),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/ticket-forms/templates**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        bug_report: { name: "Bug Report", description: "Report a software bug" },
        feature_request: { name: "Feature Request", description: "Suggest a new feature" },
        support: { name: "Support Request", description: "Get help from the team" },
      }),
    });
  });
}

async function setupEscalationMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/escalation-matrices**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockEscalationMatrices),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/ticket-forms`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTicketForms),
    });
  });
}

async function setupAccessControlMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/app-access/matrix**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAccessMatrix),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/app-access/templates**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAccessTemplates),
    });
  });
}

async function setupPlansMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/billing/plans**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockPlans),
    });
  });
}

async function setupInsightsMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/insights/settings**`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockInsightsSettings),
      });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockInsightsSettings) });
    }
  });
}

// ──────────────────────────────────────────────────────────────────
// 1. SETTINGS HUB (existing tests preserved + new ones)
// ──────────────────────────────────────────────────────────────────

test.describe("Settings Page — Navigation Sections", () => {
  test.beforeEach(async ({ page }) => {
    await setupSettingsMocks(page);
    await page.goto("/settings");
    await page.waitForSelector("text=Settings", { timeout: 45000 });
  });

  test("renders the settings page with heading and description", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("Manage your workspace configuration")).toBeVisible();
  });

  test("shows core settings sections", async ({ page }) => {
    await expect(page.getByText("Appearance")).toBeVisible();
    await expect(page.getByText("Repositories")).toBeVisible();
    await expect(page.getByText("Organization")).toBeVisible();
    await expect(page.getByText("Projects")).toBeVisible();
    await expect(page.getByText("Integrations")).toBeVisible();
    await expect(page.getByText("Billing & Subscription")).toBeVisible();
  });

  test("shows module-specific settings sections", async ({ page }) => {
    await expect(page.getByText("CRM Settings")).toBeVisible();
    await expect(page.getByText("Email Marketing")).toBeVisible();
    await expect(page.getByText("AI Agents")).toBeVisible();
    await expect(page.getByText("Task Configuration")).toBeVisible();
    await expect(page.getByText("Ticket Forms")).toBeVisible();
    await expect(page.getByText("Escalation Matrix")).toBeVisible();
  });

  test("settings sections have descriptions", async ({ page }) => {
    await expect(page.getByText("Customize sidebar layout and visual preferences")).toBeVisible();
    await expect(page.getByText("Manage GitHub repositories for analysis and sync")).toBeVisible();
    await expect(page.getByText("Manage your subscription, billing, and payment methods")).toBeVisible();
  });

  test("Appearance section links to correct page", async ({ page }) => {
    const appearanceLink = page.locator('a[href="/settings/appearance"]');
    await expect(appearanceLink).toBeVisible();
  });

  test("Billing section links to correct page", async ({ page }) => {
    const billingLink = page.locator('a[href="/settings/billing"]');
    await expect(billingLink).toBeVisible();
  });

  test("back button links to dashboard", async ({ page }) => {
    const backLink = page.locator('a[href="/dashboard"]');
    await expect(backLink).toBeVisible();
  });

  test("shows Subscription Plans link", async ({ page }) => {
    const plansLink = page.locator('a[href="/settings/plans"]');
    await expect(plansLink).toBeVisible();
    await expect(page.getByText("Compare plans and upgrade or downgrade your subscription")).toBeVisible();
  });

  test("shows Integrations description", async ({ page }) => {
    await expect(page.getByText("Connect Jira, Linear, and other external tools")).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────────────
// 2. APPEARANCE SETTINGS
// ──────────────────────────────────────────────────────────────────

test.describe("Settings — Appearance Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupAppearanceMocks(page);
    await page.goto("/settings/appearance");
    await page.waitForSelector("text=Appearance", { timeout: 45000 });
  });

  test("renders appearance heading and description", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
    await expect(page.getByText("Customize how the application looks")).toBeVisible();
  });

  test("displays theme section with three options", async ({ page }) => {
    await expect(page.getByText("Theme")).toBeVisible();
    await expect(page.getByText("Choose your preferred color scheme")).toBeVisible();
    await expect(page.getByText("Dark")).toBeVisible();
    await expect(page.getByText("Light")).toBeVisible();
    await expect(page.getByText("System")).toBeVisible();
  });

  test("displays theme descriptions", async ({ page }) => {
    await expect(page.getByText("Dark background with light text")).toBeVisible();
    await expect(page.getByText("Light background with dark text")).toBeVisible();
    await expect(page.getByText("Automatically match your system settings")).toBeVisible();
  });

  test("displays sidebar layout section with grouped and flat options", async ({ page }) => {
    await expect(page.getByText("Sidebar Layout")).toBeVisible();
    await expect(page.getByText("Choose how navigation items are organized in the sidebar")).toBeVisible();
    await expect(page.getByText("Grouped")).toBeVisible();
    await expect(page.getByText("Flat")).toBeVisible();
  });

  test("grouped layout shows preview items", async ({ page }) => {
    await expect(page.getByText("Items organized by functional areas")).toBeVisible();
    await expect(page.getByText("All features at the top level for quick access")).toBeVisible();
  });

  test("has back link to settings page", async ({ page }) => {
    const backLink = page.locator('a[href="/settings"]');
    await expect(backLink).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────────────
// 3. BILLING PAGE
// ──────────────────────────────────────────────────────────────────

test.describe("Settings — Billing Page (Pro Plan)", () => {
  test.beforeEach(async ({ page }) => {
    await setupBillingMocks(page, "pro");
    await page.goto("/settings/billing");
    await page.waitForSelector("text=Billing", { timeout: 45000 });
  });

  test("renders billing heading", async ({ page }) => {
    await expect(page.getByText("Billing & Usage")).toBeVisible();
    await expect(page.getByText("Manage your subscription, track usage, and view invoices")).toBeVisible();
  });

  test("displays current plan info", async ({ page }) => {
    await expect(page.getByText(/Plan/)).toBeVisible();
  });

  test("has back link to settings", async ({ page }) => {
    const backLink = page.locator('a[href="/settings"]');
    await expect(backLink).toBeVisible();
  });

  test("shows current usage section", async ({ page }) => {
    await expect(page.getByText("Current Usage")).toBeVisible();
  });

  test("shows billing help text", async ({ page }) => {
    await expect(page.getByText(/Need help with billing/)).toBeVisible();
    await expect(page.getByText("Contact our billing support")).toBeVisible();
  });
});

test.describe("Settings — Billing Page (Free Plan)", () => {
  test.beforeEach(async ({ page }) => {
    await setupBillingMocks(page, "free");
    await page.goto("/settings/billing");
    await page.waitForSelector("text=Billing", { timeout: 45000 });
  });

  test("shows upgrade prompt on free plan", async ({ page }) => {
    await expect(page.getByText(/free plan|Upgrade/i)).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────────────
// 4. REPOSITORY SETTINGS
// ──────────────────────────────────────────────────────────────────

test.describe("Settings — Repository Page (with installation)", () => {
  test.beforeEach(async ({ page }) => {
    await setupRepositoryMocks(page, true);
    await page.goto("/settings/repositories");
    await page.waitForSelector("text=Repository Settings", { timeout: 45000 });
  });

  test("renders repository settings heading", async ({ page }) => {
    await expect(page.getByText("Repository Settings")).toBeVisible();
    await expect(page.getByText("Manage which repositories are synced and analyzed")).toBeVisible();
  });

  test("shows enabled repository count", async ({ page }) => {
    // 1 enabled out of 3 total
    await expect(page.getByText("repositories enabled")).toBeVisible();
  });

  test("shows refresh from GitHub button", async ({ page }) => {
    await expect(page.getByText("Refresh from GitHub")).toBeVisible();
  });

  test("displays connected repositories section with enabled repo", async ({ page }) => {
    await expect(page.getByText("Connected Repositories")).toBeVisible();
    await expect(page.getByText("frontend")).toBeVisible();
  });

  test("shows sync status badge for enabled repo", async ({ page }) => {
    await expect(page.getByText("Synced")).toBeVisible();
  });

  test("shows personal repositories section", async ({ page }) => {
    await expect(page.getByText("Personal Repositories")).toBeVisible();
    await expect(page.getByText("my-side-project")).toBeVisible();
  });

  test("shows organizations section", async ({ page }) => {
    await expect(page.getByText("Organizations")).toBeVisible();
    await expect(page.getByText("TestOrg")).toBeVisible();
  });
});

test.describe("Settings — Repository Page (no installation)", () => {
  test.beforeEach(async ({ page }) => {
    await setupRepositoryMocks(page, false);
    await page.goto("/settings/repositories");
    await page.waitForSelector("text=Repository Settings", { timeout: 45000 });
  });

  test("shows GitHub App not installed message", async ({ page }) => {
    await expect(page.getByText("GitHub App Not Installed")).toBeVisible();
    await expect(page.getByText("Install the Aexy GitHub App to grant access to your repositories")).toBeVisible();
  });

  test("shows install button", async ({ page }) => {
    await expect(page.getByText("Install GitHub App")).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────────────
// 5. ORGANIZATION SETTINGS
// ──────────────────────────────────────────────────────────────────

test.describe("Settings — Organization Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupOrganizationMocks(page);
    await page.goto("/settings/organization");
    await page.waitForSelector("text=Organization Settings", { timeout: 45000 });
  });

  test("renders organization settings heading", async ({ page }) => {
    await expect(page.getByText("Organization Settings")).toBeVisible();
    await expect(page.getByText("Manage your workspace and team members")).toBeVisible();
  });

  test("shows workspaces section with create button", async ({ page }) => {
    await expect(page.getByText("Workspaces")).toBeVisible();
    await expect(page.getByText("New Workspace")).toBeVisible();
  });

  test("displays current workspace info", async ({ page }) => {
    await expect(page.getByText("Test Workspace")).toBeVisible();
  });

  test("shows team members section", async ({ page }) => {
    await expect(page.getByText("Team Members")).toBeVisible();
  });

  test("lists workspace members", async ({ page }) => {
    await expect(page.getByText("Test Developer")).toBeVisible();
    await expect(page.getByText("Alice Johnson")).toBeVisible();
    await expect(page.getByText("Bob Smith")).toBeVisible();
  });

  test("shows member roles", async ({ page }) => {
    await expect(page.getByText("admin")).toBeVisible();
    await expect(page.getByText("member").first()).toBeVisible();
  });

  test("shows app settings section", async ({ page }) => {
    await expect(page.getByText("App Settings")).toBeVisible();
    await expect(page.getByText("Enable or disable apps for your workspace")).toBeVisible();
  });

  test("shows quick links to related settings", async ({ page }) => {
    const projectsLink = page.locator('a[href="/settings/projects"]');
    await expect(projectsLink).toBeVisible();
    const reposLink = page.locator('a[href="/settings/repositories"]');
    await expect(reposLink).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────────────
// 6. PROJECTS SETTINGS
// ──────────────────────────────────────────────────────────────────

test.describe("Settings — Projects Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupProjectsMocks(page);
    await page.goto("/settings/projects");
    await page.waitForSelector("text=Project Settings", { timeout: 45000 });
  });

  test("renders projects heading", async ({ page }) => {
    await expect(page.getByText("Project Settings")).toBeVisible();
    await expect(page.getByText("Manage projects and team access within your workspace")).toBeVisible();
  });

  test("shows project count", async ({ page }) => {
    await expect(page.getByText("2 projects")).toBeVisible();
  });

  test("lists projects with names and statuses", async ({ page }) => {
    await expect(page.getByText("Frontend Redesign")).toBeVisible();
    await expect(page.getByText("API Refactor")).toBeVisible();
    await expect(page.getByText("active")).toBeVisible();
    await expect(page.getByText("on hold")).toBeVisible();
  });

  test("shows project member counts", async ({ page }) => {
    await expect(page.getByText("3 members")).toBeVisible();
    await expect(page.getByText("2 members")).toBeVisible();
  });

  test("shows create project button", async ({ page }) => {
    await expect(page.getByText("Create Project")).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────────────
// 7. INTEGRATIONS SETTINGS
// ──────────────────────────────────────────────────────────────────

test.describe("Settings — Integrations Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupIntegrationsMocks(page);
    await page.goto("/settings/integrations");
    await page.waitForSelector("text=Integrations", { timeout: 45000 });
  });

  test("renders integrations heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible();
    await expect(page.getByText("Connect external tools to sync issues and tasks")).toBeVisible();
  });

  test("shows integration tabs for GitHub, Jira, Linear, and Slack", async ({ page }) => {
    await expect(page.getByRole("button", { name: /GitHub/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Jira/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Linear/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Slack/i })).toBeVisible();
  });

  test("Jira tab shows connected state when integration exists", async ({ page }) => {
    await page.getByRole("button", { name: /Jira/i }).click();
    await expect(page.getByText("Connected")).toBeVisible();
    await expect(page.getByText("testcompany.atlassian.net")).toBeVisible();
  });

  test("GitHub tab shows connected status with user info", async ({ page }) => {
    await page.getByRole("button", { name: /GitHub/i }).click();
    await expect(page.getByText(/Connected/)).toBeVisible();
    await expect(page.getByText("Manage Repositories")).toBeVisible();
  });

  test("Linear tab shows connect form when not connected", async ({ page }) => {
    await page.getByRole("button", { name: /Linear/i }).click();
    await expect(page.getByText("Not Connected")).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────────────
// 8. TASK CONFIGURATION
// ──────────────────────────────────────────────────────────────────

test.describe("Settings — Task Configuration Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupTaskConfigMocks(page);
    await page.goto("/settings/task-config");
    await page.waitForSelector("text=Task Configuration", { timeout: 45000 });
  });

  test("renders task configuration heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Task Configuration" })).toBeVisible();
    await expect(page.getByText("Manage custom statuses and fields for tasks")).toBeVisible();
  });

  test("shows statuses and fields tabs", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Statuses/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Custom Fields/i })).toBeVisible();
  });

  test("displays task statuses list", async ({ page }) => {
    await expect(page.getByText("Task Statuses")).toBeVisible();
    await expect(page.getByText("To Do")).toBeVisible();
    await expect(page.getByText("In Progress")).toBeVisible();
    await expect(page.getByText("Done")).toBeVisible();
  });

  test("shows status categories in statuses", async ({ page }) => {
    await expect(page.getByText("todo").first()).toBeVisible();
    await expect(page.getByText("in progress").first()).toBeVisible();
    await expect(page.getByText("done").first()).toBeVisible();
  });

  test("shows default badge on default status", async ({ page }) => {
    await expect(page.getByText("Default")).toBeVisible();
  });

  test("shows Add Status button", async ({ page }) => {
    await expect(page.getByText("Add Status")).toBeVisible();
  });

  test("shows status categories legend", async ({ page }) => {
    await expect(page.getByText("Status Categories")).toBeVisible();
    await expect(page.getByText("Not started tasks")).toBeVisible();
    await expect(page.getByText("Active work in progress")).toBeVisible();
    await expect(page.getByText("Completed tasks")).toBeVisible();
  });

  test("switching to Custom Fields tab shows fields", async ({ page }) => {
    await page.getByRole("button", { name: /Custom Fields/i }).click();
    await expect(page.getByText("Sprint Goal")).toBeVisible();
    await expect(page.getByText("Story Points")).toBeVisible();
  });

  test("Custom Fields tab shows Required badge on required field", async ({ page }) => {
    await page.getByRole("button", { name: /Custom Fields/i }).click();
    await expect(page.getByText("Required")).toBeVisible();
  });

  test("Custom Fields tab shows Add Field button", async ({ page }) => {
    await page.getByRole("button", { name: /Custom Fields/i }).click();
    await expect(page.getByText("Add Field")).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────────────
// 9. TICKET FORMS
// ──────────────────────────────────────────────────────────────────

test.describe("Settings — Ticket Forms Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupTicketFormsMocks(page);
    await page.goto("/settings/ticket-forms");
    await page.waitForSelector("text=Ticket Forms", { timeout: 45000 });
  });

  test("renders ticket forms heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Ticket Forms" })).toBeVisible();
    await expect(page.getByText("Create and manage public forms for collecting tickets")).toBeVisible();
  });

  test("shows create form button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Create Form/i })).toBeVisible();
  });

  test("lists existing forms with names", async ({ page }) => {
    await expect(page.getByText("Bug Report")).toBeVisible();
    await expect(page.getByText("Feature Request")).toBeVisible();
  });

  test("shows active/inactive status on forms", async ({ page }) => {
    await expect(page.getByText("Active")).toBeVisible();
    await expect(page.getByText("Inactive")).toBeVisible();
  });

  test("shows submission count on forms", async ({ page }) => {
    await expect(page.getByText("42 submissions")).toBeVisible();
    await expect(page.getByText("8 submissions")).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────────────
// 10. ESCALATION MATRIX
// ──────────────────────────────────────────────────────────────────

test.describe("Settings — Escalation Matrix Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupEscalationMocks(page);
    await page.goto("/settings/escalation");
    await page.waitForSelector("text=Escalation Matrix", { timeout: 45000 });
  });

  test("renders escalation matrix heading", async ({ page }) => {
    await expect(page.getByText("Escalation Matrix")).toBeVisible();
    await expect(page.getByText("Configure automatic escalation rules based on ticket severity")).toBeVisible();
  });

  test("shows Add Escalation Matrix button", async ({ page }) => {
    await expect(page.getByText("Add Escalation Matrix")).toBeVisible();
  });

  test("lists existing matrices", async ({ page }) => {
    await expect(page.getByText("Critical Issue Escalation")).toBeVisible();
    await expect(page.getByText("Escalation for critical production issues")).toBeVisible();
  });

  test("shows severity level badges on matrix", async ({ page }) => {
    await expect(page.getByText("Critical")).toBeVisible();
    await expect(page.getByText("High")).toBeVisible();
  });

  test("shows escalation rules with levels and delay", async ({ page }) => {
    await expect(page.getByText("Level 1")).toBeVisible();
    await expect(page.getByText("Level 2")).toBeVisible();
    await expect(page.getByText("after 0 min")).toBeVisible();
    await expect(page.getByText("after 30 min")).toBeVisible();
  });

  test("shows back to settings button", async ({ page }) => {
    await expect(page.getByText("Back to Settings")).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────────────
// 11. ACCESS CONTROL
// ──────────────────────────────────────────────────────────────────

test.describe("Settings — Access Control Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupAccessControlMocks(page);
    await page.goto("/settings/access");
    await page.waitForSelector("text=Access Control", { timeout: 45000 });
  });

  test("renders access control heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Access Control" })).toBeVisible();
    await expect(page.getByText("Manage app access for workspace members")).toBeVisible();
  });

  test("shows access matrix table with member names", async ({ page }) => {
    await expect(page.getByText("Test Developer")).toBeVisible();
    await expect(page.getByText("Alice Johnson")).toBeVisible();
  });

  test("shows Access Logs button", async ({ page }) => {
    await expect(page.getByText("Access Logs")).toBeVisible();
  });

  test("shows Manage Templates button", async ({ page }) => {
    await expect(page.getByText("Manage Templates")).toBeVisible();
  });

  test("shows access legend with Full, Partial, No Access", async ({ page }) => {
    await expect(page.getByText("Full Access")).toBeVisible();
    await expect(page.getByText("Partial Access")).toBeVisible();
    await expect(page.getByText("No Access")).toBeVisible();
  });

  test("shows Member column header", async ({ page }) => {
    await expect(page.getByText("Member")).toBeVisible();
  });

  test("shows back link to settings", async ({ page }) => {
    const backLink = page.locator('a[href="/settings"]');
    await expect(backLink).toBeVisible();
  });
});
