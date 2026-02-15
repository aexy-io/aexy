import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE, mockSubscription, mockMembers } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockPlans = [
  { tier: "free", name: "Free", price_monthly_cents: 0, price_annual_cents: 0, max_repos: 5, description: "For individuals" },
  { tier: "pro", name: "Pro", price_monthly_cents: 2900, price_annual_cents: 29000, max_repos: 100, description: "For teams" },
  { tier: "enterprise", name: "Enterprise", price_monthly_cents: 0, price_annual_cents: 0, max_repos: -1, description: "Custom pricing" },
];

const mockEmailDelivery = {
  provider: "smtp",
  smtp_host: "smtp.example.com",
  smtp_port: 587,
  smtp_username: "noreply@aexy.io",
  from_name: "Aexy",
  from_email: "noreply@aexy.io",
  is_verified: true,
  daily_limit: 1000,
  sent_today: 45,
};

const mockInsightsSettings = {
  working_hours: { start_hour: 9, end_hour: 18, timezone: "America/New_York", weekend_days: [0, 6] },
  metric_weights: { velocity: 25, efficiency: 25, quality: 25, sustainability: 15, collaboration: 10 },
  late_night_threshold_hour: 22,
  bottleneck_multiplier: 2.0,
  snapshot_auto_generate: true,
  snapshot_frequency: "weekly",
};

const mockRoles = [
  { id: "role-1", name: "Developer", workspace_id: "ws-1", permissions: { insights: "read", tracking: "write", sprints: "write" } },
  { id: "role-2", name: "Lead", workspace_id: "ws-1", permissions: { insights: "admin", tracking: "admin", sprints: "admin" } },
  { id: "role-3", name: "Observer", workspace_id: "ws-1", permissions: { insights: "read", tracking: "read", sprints: "read" } },
];

const mockAccessLogs = [
  {
    id: "log-1",
    developer_id: "test-user-123",
    developer_name: "Test Developer",
    action: "access_granted",
    app: "tracking",
    access_level: "full",
    timestamp: "2026-02-14T10:00:00Z",
  },
  {
    id: "log-2",
    developer_id: "dev-2",
    developer_name: "Alice Johnson",
    action: "access_changed",
    app: "crm",
    access_level: "partial",
    timestamp: "2026-02-13T14:00:00Z",
  },
];

const mockAccessTemplates = [
  { id: "tpl-1", name: "Developer", description: "Standard dev access", apps: { tracking: true, sprints: true, crm: false } },
  { id: "tpl-2", name: "Manager", description: "Full management access", apps: { tracking: true, sprints: true, crm: true, hiring: true } },
];

const mockProjectDetail = {
  id: "proj-1",
  name: "Frontend Redesign",
  description: "Revamping the UI",
  color: "#6366f1",
  status: "active",
  is_public: true,
  member_count: 3,
  team_count: 1,
  workspace_id: "ws-1",
  members: [
    { developer_id: "test-user-123", name: "Test Developer", role: "lead" },
    { developer_id: "dev-2", name: "Alice Johnson", role: "member" },
  ],
};

const mockTicketFormDetail = {
  id: "form-1",
  name: "Bug Report",
  description: "Report a software bug",
  template_type: "bug_report",
  is_active: true,
  submission_count: 42,
  public_url_token: "abc123",
  fields: [
    { id: "f1", type: "text", label: "Bug Title", required: true },
    { id: "f2", type: "select", label: "Severity", required: true, options: ["critical", "high", "medium", "low"] },
    { id: "f3", type: "textarea", label: "Steps to Reproduce", required: true },
  ],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupSettingsSubpageMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/billing/plans**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockPlans) });
  });

  await page.route(`${API_BASE}/billing/subscription/status**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: { tier: "pro", name: "Pro" }, status: "active" }) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/email-delivery**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockEmailDelivery) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/insights/settings**`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockInsightsSettings) });
    } else {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockInsightsSettings) });
    }
  });

  await page.route(`${API_BASE}/workspaces/ws-1/roles**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRoles) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/app-access/logs**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAccessLogs) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/app-access/templates**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAccessTemplates) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/app-access/matrix**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ members: [], apps: [] }) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockProjectDetail) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/projects`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([mockProjectDetail]) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/ticket-forms/form-1`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTicketFormDetail) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/ticket-forms/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTicketFormDetail) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/ticket-forms`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([mockTicketFormDetail]) });
  });
}

// ---------------------------------------------------------------------------
// Tests: Plans Page
// ---------------------------------------------------------------------------

test.describe("Settings -- Plans Page", () => {
  test("renders the plans page", async ({ page }) => {
    await setupSettingsSubpageMocks(page);
    await page.goto("/settings/plans");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasPlans = await page.getByText(/plan|subscription|pricing/i).isVisible().catch(() => false);
    expect(hasPlans).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Email Delivery Page
// ---------------------------------------------------------------------------

test.describe("Settings -- Email Delivery Page", () => {
  test("renders the email delivery page", async ({ page }) => {
    await setupSettingsSubpageMocks(page);
    await page.goto("/settings/email-delivery");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasEmail = await page.getByText(/email|delivery|smtp/i).isVisible().catch(() => false);
    expect(hasEmail).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Insights Settings Page
// ---------------------------------------------------------------------------

test.describe("Settings -- Insights Page", () => {
  test("renders the insights settings page", async ({ page }) => {
    await setupSettingsSubpageMocks(page);
    await page.goto("/settings/insights");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasInsights = await page.getByText(/insight|metric|working hours/i).isVisible().catch(() => false);
    expect(hasInsights).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Organization Roles Page
// ---------------------------------------------------------------------------

test.describe("Settings -- Organization Roles Page", () => {
  test("renders the roles page", async ({ page }) => {
    await setupSettingsSubpageMocks(page);
    await page.goto("/settings/organization/roles");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasRoles = await page.getByText(/role|permission/i).isVisible().catch(() => false);
    expect(hasRoles).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Access Logs Page
// ---------------------------------------------------------------------------

test.describe("Settings -- Access Logs Page", () => {
  test("renders the access logs page", async ({ page }) => {
    await setupSettingsSubpageMocks(page);
    await page.goto("/settings/access/logs");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasLogs = await page.getByText(/log|access|audit/i).isVisible().catch(() => false);
    expect(hasLogs).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Access Templates Page
// ---------------------------------------------------------------------------

test.describe("Settings -- Access Templates Page", () => {
  test("renders the access templates page", async ({ page }) => {
    await setupSettingsSubpageMocks(page);
    await page.goto("/settings/access/templates");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasTemplates = await page.getByText(/template|access/i).isVisible().catch(() => false);
    expect(hasTemplates).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Ticket Form Detail Page
// ---------------------------------------------------------------------------

test.describe("Settings -- Ticket Form Detail Page", () => {
  test("renders the ticket form detail page", async ({ page }) => {
    await setupSettingsSubpageMocks(page);
    await page.goto("/settings/ticket-forms/form-1");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasForm = await page.getByText(/Bug Report|form|ticket/i).isVisible().catch(() => false);
    expect(hasForm).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Project Detail Page
// ---------------------------------------------------------------------------

test.describe("Settings -- Project Detail Page", () => {
  test("renders the project detail page", async ({ page }) => {
    await setupSettingsSubpageMocks(page);
    await page.goto("/settings/projects/proj-1");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasProject = await page.getByText(/Frontend Redesign|project/i).isVisible().catch(() => false);
    expect(hasProject).toBeTruthy();
  });
});
