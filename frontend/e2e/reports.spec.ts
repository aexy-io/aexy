import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE, mockUser } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockReports = [
  {
    id: "report-1",
    name: "Weekly Team Summary",
    description: "Overview of weekly team metrics",
    is_public: true,
    widgets: [
      { id: "w1", title: "Commits Chart", type: "bar_chart", metric: "commits", position: { x: 0, y: 0, w: 6, h: 4 } },
      { id: "w2", title: "PR Throughput", type: "line_chart", metric: "prs_merged", position: { x: 6, y: 0, w: 6, h: 4 } },
    ],
    filters: { period: "weekly" },
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-02-10T00:00:00Z",
  },
  {
    id: "report-2",
    name: "Sprint Velocity",
    description: "Sprint-over-sprint velocity tracking",
    is_public: false,
    widgets: [
      { id: "w3", title: "Velocity Trend", type: "line_chart", metric: "velocity", position: { x: 0, y: 0, w: 12, h: 4 } },
    ],
    filters: {},
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-12T00:00:00Z",
  },
];

const mockTemplates = [
  {
    id: "tpl-1",
    name: "Team Performance",
    description: "Standard team metrics dashboard",
    category: "team",
    widget_count: 6,
  },
  {
    id: "tpl-2",
    name: "Individual Health",
    description: "Individual developer health metrics",
    category: "health",
    widget_count: 4,
  },
  {
    id: "tpl-3",
    name: "Executive Summary",
    description: "High-level executive overview",
    category: "executive",
    widget_count: 8,
  },
];

const mockSchedules = [
  {
    id: "sched-1",
    report_id: "report-1",
    schedule: "weekly",
    time_utc: "09:00",
    export_format: "pdf",
    next_run_at: "2026-02-17T09:00:00Z",
    is_active: true,
  },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupReportsMocks(page: Page) {
  await setupCommonMocks(page);

  // Reports routes: use a single handler with URL-based dispatch for correct matching.
  // Playwright routes are checked in reverse registration order.
  // Register a broad pattern that catches all /reports* URLs.
  await page.route(`${API_BASE}/reports/**`, (route) => {
    const url = route.request().url();

    // Templates: GET /reports/templates/list
    if (url.includes("/reports/templates/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockTemplates),
      });
    }

    // Schedules: GET /reports/schedules/list
    if (url.includes("/reports/schedules/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockSchedules),
      });
    }

    // Individual report fallback
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockReports[0]),
    });
  });

  // Reports list: GET /reports (with or without query params)
  // This must be registered AFTER the /reports/** route so it is checked FIRST.
  await page.route(new RegExp(`${API_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/reports(\\?.*)?$`), (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockReports),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Reports Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupReportsMocks(page);
    await page.goto("/reports");
    await page.waitForSelector("text=Custom Reports", { timeout: 45000 });
  });

  test("renders the page heading and description", async ({ page }) => {
    await expect(page.getByText("Custom Reports")).toBeVisible();
    await expect(page.getByText("Create, manage, and schedule custom analytics reports")).toBeVisible();
  });

  test("shows New Report button", async ({ page }) => {
    await expect(page.getByText("New Report")).toBeVisible();
  });

  test("shows My Reports section with report cards", async ({ page }) => {
    await expect(page.getByText("My Reports")).toBeVisible();
    await expect(page.getByText("Weekly Team Summary").first()).toBeVisible();
    await expect(page.getByText("Sprint Velocity").first()).toBeVisible();
  });

  test("shows Public badge on public reports", async ({ page }) => {
    await expect(page.getByText("Public")).toBeVisible();
  });

  test("shows widget count and update date on report cards", async ({ page }) => {
    await expect(page.getByText("2 widgets")).toBeVisible();
    await expect(page.getByText("1 widgets")).toBeVisible();
  });

  test("shows View, Clone, and Delete actions on report cards", async ({ page }) => {
    await expect(page.getByText("View").first()).toBeVisible();
  });

  test("shows Scheduled Reports section", async ({ page }) => {
    await expect(page.getByText("Scheduled Reports")).toBeVisible();
    // "Weekly Team Summary" appears in both report cards and schedule table; use role selector
    await expect(page.getByRole("cell", { name: "Weekly Team Summary" })).toBeVisible();
    await expect(page.getByText(/weekly at 09:00 UTC/i)).toBeVisible();
  });

  test("shows Available Templates section", async ({ page }) => {
    await expect(page.getByText("Available Templates")).toBeVisible();
    await expect(page.getByText("Team Performance")).toBeVisible();
    await expect(page.getByText("Individual Health")).toBeVisible();
    await expect(page.getByText("Executive Summary")).toBeVisible();
  });

  test("shows Use Template buttons on templates", async ({ page }) => {
    const useButtons = page.getByText("Use Template");
    const count = await useButtons.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("shows category badges on templates", async ({ page }) => {
    // Category badges use exact text; use { exact: true } to avoid matching substrings
    await expect(page.getByText("team", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("health", { exact: true })).toBeVisible();
    await expect(page.getByText("executive", { exact: true }).first()).toBeVisible();
  });

  test("has navigation links in header", async ({ page }) => {
    await expect(page.locator("a[href='/dashboard']").first()).toBeVisible();
    await expect(page.locator("a[href='/reports']").first()).toBeVisible();
  });
});

test.describe("Reports Page -- Empty State", () => {
  test("shows empty state when no reports exist", async ({ page }) => {
    await setupCommonMocks(page);

    await page.route(`${API_BASE}/reports/**`, (route) => {
      const url = route.request().url();
      if (url.includes("/reports/templates/")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTemplates) });
      }
      if (url.includes("/reports/schedules/")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });

    await page.route(new RegExp(`${API_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/reports(\\?.*)?$`), (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.goto("/reports");
    await page.waitForSelector("text=Custom Reports", { timeout: 45000 });

    await expect(page.getByText("No reports yet")).toBeVisible();
    await expect(page.getByText("Create your first report from a template to get started")).toBeVisible();
    await expect(page.getByText("Create Report")).toBeVisible();
  });
});

test.describe("Reports Page -- Template Modal", () => {
  test("opens template modal when clicking New Report", async ({ page }) => {
    await setupReportsMocks(page);
    await page.goto("/reports");
    await page.waitForSelector("text=Custom Reports", { timeout: 45000 });

    await page.getByText("New Report").click();
    await expect(page.getByText("Create New Report")).toBeVisible();
    await expect(page.getByText("Choose a template to get started")).toBeVisible();
  });
});
