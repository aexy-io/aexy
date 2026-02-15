import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

const mockMonitors = {
  monitors: [
    {
      id: "mon-1",
      name: "API Server",
      url: "https://api.example.com/health",
      check_type: "http",
      current_status: "up",
      is_active: true,
      uptime_percentage_24h: 99.9,
      last_response_time_ms: 120,
      host: null,
      port: null,
    },
    {
      id: "mon-2",
      name: "Database",
      host: "db.example.com",
      port: 5432,
      check_type: "tcp",
      current_status: "up",
      is_active: true,
      uptime_percentage_24h: 100.0,
      last_response_time_ms: 5,
      url: null,
    },
    {
      id: "mon-3",
      name: "Staging API",
      url: "https://staging-api.example.com/health",
      check_type: "http",
      current_status: "down",
      is_active: true,
      uptime_percentage_24h: 95.2,
      last_response_time_ms: null,
      host: null,
      port: null,
    },
  ],
};

const mockIncidents = {
  incidents: [
    {
      id: "inc-1",
      monitor: { id: "mon-3", name: "Staging API" },
      status: "ongoing",
      started_at: "2026-02-14T08:00:00Z",
      first_error_message: "Connection refused",
      last_error_message: "Connection refused",
    },
  ],
};

const mockStats = {
  monitors_up: 2,
  monitors_down: 1,
  ongoing_incidents: 1,
  incidents_24h: 3,
  avg_uptime_24h: 98.4,
};

async function setupUptimeMocks(page: Page) {
  await setupCommonMocks(page);

  // Monitors
  await page.route(`${API_BASE}/workspaces/ws-1/uptime/monitors`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockMonitors),
    });
  });

  // Incidents
  await page.route(`${API_BASE}/workspaces/ws-1/uptime/incidents**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockIncidents),
    });
  });

  // Stats
  await page.route(`${API_BASE}/workspaces/ws-1/uptime/stats**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockStats),
    });
  });
}

test.describe("Uptime Monitoring Page — Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await setupUptimeMocks(page);
    await page.goto("/uptime");
    await page.waitForSelector("text=Uptime Monitoring", { timeout: 45000 });
  });

  test("renders the uptime page with heading", async ({ page }) => {
    await expect(page.getByText("Uptime Monitoring")).toBeVisible();
    await expect(page.getByText("Monitor your endpoints and track incidents")).toBeVisible();
  });

  test("shows stats cards", async ({ page }) => {
    await expect(page.getByText("Monitors Up")).toBeVisible();
    await expect(page.getByText("Monitors Down")).toBeVisible();
    await expect(page.getByText("Active Incidents")).toBeVisible();
    await expect(page.getByText("Avg Uptime (24h)")).toBeVisible();
  });

  test("stats show correct values", async ({ page }) => {
    // Monitors up = 2
    const monitorsUpCard = page.locator("text=Monitors Up").locator("..");
    await expect(monitorsUpCard).toContainText("2");
    // Monitors down = 1
    const monitorsDownCard = page.locator("text=Monitors Down").locator("..");
    await expect(monitorsDownCard).toContainText("1");
  });

  test("shows monitor list with status indicators", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Monitors" })).toBeVisible();
    await expect(page.getByText("API Server")).toBeVisible();
    await expect(page.getByText("Database")).toBeVisible();
    await expect(page.getByText("Staging API")).toBeVisible();
  });

  test("shows active incidents section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Active Incidents" })).toBeVisible();
    await expect(page.getByText("Connection refused")).toBeVisible();
  });

  test("shows quick links", async ({ page }) => {
    await expect(page.getByText("Quick Links")).toBeVisible();
    await expect(page.getByText("All Monitors")).toBeVisible();
    await expect(page.getByText("Incident History")).toBeVisible();
    await expect(page.getByText("Check History")).toBeVisible();
  });

  test("has New Monitor button", async ({ page }) => {
    const newMonitorLink = page.locator('a', { hasText: "New Monitor" });
    await expect(newMonitorLink).toBeVisible();
  });
});
