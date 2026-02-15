import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

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
      uptime_percentage_7d: 99.8,
      uptime_percentage_30d: 99.5,
      last_response_time_ms: 120,
      last_checked_at: "2026-02-15T10:00:00Z",
      check_interval_seconds: 60,
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
      uptime_percentage_7d: 100.0,
      uptime_percentage_30d: 99.99,
      last_response_time_ms: 5,
      last_checked_at: "2026-02-15T10:00:00Z",
      check_interval_seconds: 30,
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
      uptime_percentage_7d: 97.1,
      uptime_percentage_30d: 98.3,
      last_response_time_ms: null,
      last_checked_at: "2026-02-15T09:50:00Z",
      check_interval_seconds: 60,
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
      started_at: "2026-02-15T09:50:00Z",
      resolved_at: null,
      duration_minutes: null,
      cause: "Connection timeout",
      impact: "high",
    },
    {
      id: "inc-2",
      monitor: { id: "mon-1", name: "API Server" },
      status: "resolved",
      started_at: "2026-02-14T03:00:00Z",
      resolved_at: "2026-02-14T03:15:00Z",
      duration_minutes: 15,
      cause: "High CPU usage",
      impact: "medium",
    },
  ],
  total: 2,
};

const mockHistory = {
  entries: [
    {
      date: "2026-02-15",
      total_monitors: 3,
      monitors_up: 2,
      monitors_down: 1,
      avg_response_time_ms: 62.5,
      incidents_count: 1,
    },
    {
      date: "2026-02-14",
      total_monitors: 3,
      monitors_up: 3,
      monitors_down: 0,
      avg_response_time_ms: 55.0,
      incidents_count: 1,
    },
    {
      date: "2026-02-13",
      total_monitors: 3,
      monitors_up: 3,
      monitors_down: 0,
      avg_response_time_ms: 60.2,
      incidents_count: 0,
    },
  ],
};

const mockMonitorDetail = {
  ...mockMonitors.monitors[0],
  checks: [
    { id: "chk-1", status: "up", response_time_ms: 118, checked_at: "2026-02-15T10:00:00Z" },
    { id: "chk-2", status: "up", response_time_ms: 125, checked_at: "2026-02-15T09:59:00Z" },
    { id: "chk-3", status: "up", response_time_ms: 110, checked_at: "2026-02-15T09:58:00Z" },
  ],
};

const mockIncidentDetail = {
  ...mockIncidents.incidents[0],
  timeline: [
    { timestamp: "2026-02-15T09:50:00Z", event: "incident_started", description: "Monitor check failed" },
    { timestamp: "2026-02-15T09:51:00Z", event: "alert_sent", description: "Alert sent to team" },
  ],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupUptimeMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/uptime/monitors`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockMonitors),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/uptime/monitors/mon-1`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockMonitorDetail),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/uptime/monitors/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockMonitorDetail),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/uptime/incidents`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockIncidents),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/uptime/incidents/inc-1`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockIncidentDetail),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/uptime/incidents/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockIncidentDetail),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/uptime/history**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockHistory),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/uptime/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests: Monitors Page
// ---------------------------------------------------------------------------

test.describe("Uptime -- Monitors Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupUptimeMocks(page);
    await page.goto("/uptime/monitors");
    await page.waitForTimeout(5000);
  });

  test("renders monitor listing", async ({ page }) => {
    await expect(page.locator("body")).toBeVisible();
    const hasError = await page.getByText("Unhandled Runtime Error").isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Incidents Page
// ---------------------------------------------------------------------------

test.describe("Uptime -- Incidents Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupUptimeMocks(page);
    await page.goto("/uptime/incidents");
    await page.waitForTimeout(5000);
  });

  test("renders incidents page", async ({ page }) => {
    await expect(page.locator("body")).toBeVisible();
    const hasError = await page.getByText("Unhandled Runtime Error").isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Tests: History Page
// ---------------------------------------------------------------------------

test.describe("Uptime -- History Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupUptimeMocks(page);
    await page.goto("/uptime/history");
    await page.waitForTimeout(5000);
  });

  test("renders history page", async ({ page }) => {
    await expect(page.locator("body")).toBeVisible();
    const hasError = await page.getByText("Unhandled Runtime Error").isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Monitor Detail Page
// ---------------------------------------------------------------------------

test.describe("Uptime -- Monitor Detail Page", () => {
  test("renders individual monitor detail", async ({ page }) => {
    await setupUptimeMocks(page);
    const response = await page.goto("/uptime/monitors/mon-1");
    expect(response?.status()).toBeLessThan(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: Incident Detail Page
// ---------------------------------------------------------------------------

test.describe("Uptime -- Incident Detail Page", () => {
  test("renders individual incident detail", async ({ page }) => {
    await setupUptimeMocks(page);
    const response = await page.goto("/uptime/incidents/inc-1");
    expect(response?.status()).toBeLessThan(400);
  });
});
