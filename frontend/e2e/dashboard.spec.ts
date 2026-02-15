import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import {
  mockUser,
  mockPreferences,
  mockPreferencesReordered,
  mockPreferencesManagerPreset,
  mockInsights,
  mockSoftSkills,
} from "./fixtures/mock-data";

const API_BASE = "http://localhost:8000/api/v1";

/**
 * Setup route interception for all dashboard API calls.
 * Injects a fake auth token and mocks all backend endpoints.
 */
async function setupDashboardMocks(page: Page, preferencesOverride?: typeof mockPreferences) {
  const prefs = preferencesOverride || mockPreferences;

  // Set auth token and workspace before navigating
  await page.addInitScript(() => {
    localStorage.setItem("token", "fake-test-token");
    localStorage.setItem("current_workspace_id", "ws-1");
  });

  // IMPORTANT: Playwright matches routes in REVERSE registration order
  // (last registered = checked first). Register catch-all FIRST so it's checked LAST.

  // Catch-all for any other API calls to prevent network errors
  await page.route(`${API_BASE}/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  // Workspace list
  await page.route(`${API_BASE}/workspaces`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "ws-1", name: "Test Workspace", slug: "test-ws", type: "engineering", owner_id: "test-user-123", member_count: 10, team_count: 2, is_active: true }]),
    });
  });

  // Workspace sub-routes
  await page.route(`${API_BASE}/workspaces/**`, (route) => {
    const url = route.request().url();
    if (url.includes("/agents")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
    if (url.includes("/app-access/")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apps: {}, applied_template_id: null, applied_template_name: null, has_custom_overrides: false, is_admin: true }) });
    }
    if (url.includes("/documents/")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
    if (url.includes("/spaces")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
    if (url.includes("/members")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
    if (url.includes("/teams")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "ws-1", name: "Test Workspace" }),
    });
  });

  await page.route(`${API_BASE}/agents**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Mock insights endpoints (actual API path: /analysis/developers/{id}/insights)
  await page.route(`${API_BASE}/analysis/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockInsights),
    });
  });

  await page.route(`${API_BASE}/analysis/developers/*/insights`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockInsights),
    });
  });

  await page.route(`${API_BASE}/analysis/developers/*/soft-skills`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockSoftSkills),
    });
  });

  // Mock reset preferences
  await page.route(`${API_BASE}/dashboard/preferences/reset**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockPreferences),
    });
  });

  // Mock GET /dashboard/widgets
  await page.route(`${API_BASE}/dashboard/widgets`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Mock GET /dashboard/presets
  await page.route(`${API_BASE}/dashboard/presets`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Billing/subscription
  await page.route(`${API_BASE}/billing/subscription/status**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: { tier: "pro" }, status: "active" }),
    });
  });

  // Repositories
  await page.route(`${API_BASE}/repositories/**`, (route) => {
    const url = route.request().url();
    if (url.includes("/onboarding/status")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ completed: true, current_step: "complete" }) });
    }
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  // Mock GET /dashboard/preferences
  await page.route(`${API_BASE}/dashboard/preferences`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(prefs),
      });
    } else {
      // PUT/PATCH — return the request body back as confirmation
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...prefs, ...JSON.parse(route.request().postData() || "{}") }),
      });
    }
  });

  // Mock GET /developers/me (registered LAST = checked FIRST by Playwright)
  await page.route(`${API_BASE}/developers/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockUser),
    });
  });
}

/** Navigate to dashboard and wait for it to fully render. */
async function gotoDashboard(page: Page) {
  await page.goto("/dashboard");
  await page.waitForSelector("text=Welcome back", { timeout: 45000 });
}

// ---------------------------------------------------------------------------
// Test Suite: Dashboard Widget Rendering
// ---------------------------------------------------------------------------

test.describe("Dashboard — Widget Rendering", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await gotoDashboard(page);
  });

  test("renders the welcome widget with user name", async ({ page }) => {
    await expect(page.getByText("Welcome back, Test")).toBeVisible();
    await expect(page.getByText("@testdev")).toBeVisible();
  });

  test("renders quick stats widget with correct data", async ({ page }) => {
    // Language count
    await expect(page.getByText("Languages").first()).toBeVisible();
    await expect(page.getByText("4", { exact: true }).first()).toBeVisible();

    // Frameworks count
    await expect(page.getByText("Frameworks").first()).toBeVisible();
    await expect(page.getByText("3", { exact: true }).first()).toBeVisible();

    // Avg PR Size
    await expect(page.getByText("Avg PR Size")).toBeVisible();
    await expect(page.getByText("120", { exact: true })).toBeVisible();
  });

  test("renders language proficiency widget", async ({ page }) => {
    await expect(page.getByText("Language Proficiency")).toBeVisible();
    await expect(page.getByText("TypeScript", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("92%").first()).toBeVisible();
    await expect(page.getByText("Python", { exact: true }).first()).toBeVisible();
  });

  test("renders work patterns widget", async ({ page }) => {
    await expect(page.getByText("Work Patterns")).toBeVisible();
    await expect(page.getByText("Complexity Preference")).toBeVisible();
    await expect(page.getByText("high", { exact: false })).toBeVisible();
  });

  test("renders domain expertise widget", async ({ page }) => {
    await expect(page.getByText("Domain Expertise")).toBeVisible();
    await expect(page.getByText("web development", { exact: false })).toBeVisible();
  });

  test("renders frameworks & tools widget", async ({ page }) => {
    await expect(page.getByText("Frameworks & Tools")).toBeVisible();
    await expect(page.getByText("React")).toBeVisible();
    await expect(page.getByText("Next.js")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Coming Soon Widget (separate to avoid double navigation)
// ---------------------------------------------------------------------------

test.describe("Dashboard — Coming Soon Widget", () => {
  test("shows Coming Soon for unimplemented widgets", async ({ page }) => {
    // Setup mocks with an extra unimplemented widget
    await setupDashboardMocks(page, {
      ...mockPreferences,
      visible_widgets: [...mockPreferences.visible_widgets, "systemHealth"],
      widget_order: [...mockPreferences.widget_order, "systemHealth"],
    });
    await gotoDashboard(page);
    await expect(page.getByText("This widget is coming soon")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Widget Order from Preferences
// ---------------------------------------------------------------------------

test.describe("Dashboard — Widget Ordering", () => {
  test("renders widgets in the order specified by widget_order", async ({ page }) => {
    // Use a specific order: workPatterns before languageProficiency
    await setupDashboardMocks(page, mockPreferencesReordered);
    await gotoDashboard(page);

    // Get all rendered widget headings in DOM order
    const widgetHeadings = await page.locator("h3").allTextContents();
    const workPatternsIdx = widgetHeadings.indexOf("Work Patterns");
    const langProfIdx = widgetHeadings.indexOf("Language Proficiency");

    // In the reordered prefs, workPatterns comes before languageProficiency
    expect(workPatternsIdx).toBeGreaterThan(-1);
    expect(langProfIdx).toBeGreaterThan(-1);
    expect(workPatternsIdx).toBeLessThan(langProfIdx);
  });

  test("only renders visible widgets", async ({ page }) => {
    // Set preferences with limited visible widgets
    await setupDashboardMocks(page, {
      ...mockPreferences,
      visible_widgets: ["welcome", "quickStats"],
      widget_order: ["welcome", "quickStats"],
    });
    await gotoDashboard(page);

    // Quick Stats should be visible
    await expect(page.getByText("Languages").first()).toBeVisible();

    // Language Proficiency should NOT be visible
    await expect(page.getByText("Language Proficiency")).not.toBeVisible();
    await expect(page.getByText("Domain Expertise")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Edit Layout Mode
// ---------------------------------------------------------------------------

test.describe("Dashboard — Edit Layout Toggle", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await gotoDashboard(page);
  });

  test("shows Edit Layout button and toggles to Done", async ({ page }) => {
    const editBtn = page.getByRole("button", { name: /Edit Layout/i });
    await expect(editBtn).toBeVisible();

    // Click to enter edit mode
    await editBtn.click();

    // Button should now say "Done"
    const doneBtn = page.getByRole("button", { name: /Done/i });
    await expect(doneBtn).toBeVisible();

    // Click Done to exit edit mode
    await doneBtn.click();

    // Back to Edit Layout
    await expect(page.getByRole("button", { name: /Edit Layout/i })).toBeVisible();
  });

  test("shows drag handles when in edit mode", async ({ page }) => {
    // Before edit mode, drag handles should be hidden (opacity-0)
    const editBtn = page.getByRole("button", { name: /Edit Layout/i });
    await editBtn.click();

    // In edit mode, drag handle buttons should exist in the DOM
    const gripButtons = page.locator("button.cursor-grab, div.cursor-grab");
    const count = await gripButtons.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Customize Modal
// ---------------------------------------------------------------------------

test.describe("Dashboard — Customize Modal", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await gotoDashboard(page);
  });

  test("opens customize modal with three tabs", async ({ page }) => {
    // Click the Customize button
    const customizeBtn = page.getByRole("button", { name: /Customize/i });
    await customizeBtn.click();

    // Modal should appear
    await expect(page.getByText("Customize Dashboard")).toBeVisible();

    // All three tabs should be visible
    await expect(page.getByRole("button", { name: "Choose Preset" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Customize Widgets" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reorder" })).toBeVisible();
  });

  test("switches between modal tabs", async ({ page }) => {
    const customizeBtn = page.getByRole("button", { name: /Customize/i });
    await customizeBtn.click();
    await expect(page.getByText("Customize Dashboard")).toBeVisible();

    // Default tab is Presets — info box should be visible
    await expect(page.getByText("Select a preset based on your role")).toBeVisible();

    // Switch to Widgets tab
    await page.getByRole("button", { name: "Customize Widgets" }).click();
    await expect(page.getByText("widgets visible", { exact: false })).toBeVisible();

    // Switch to Reorder tab
    await page.getByRole("button", { name: "Reorder" }).click();
    await expect(page.getByText("Drag and drop to reorder")).toBeVisible();
  });

  test("reorder tab shows the current visible widgets", async ({ page }) => {
    const customizeBtn = page.getByRole("button", { name: /Customize/i });
    await customizeBtn.click();

    // Go to Reorder tab
    await page.getByRole("button", { name: "Reorder" }).click();

    // Should show widget names from the visible list (scope to the modal)
    const modal = page.getByLabel("Customize Dashboard");
    await expect(modal.getByText("Quick Stats")).toBeVisible();
    await expect(modal.getByText("Language Proficiency")).toBeVisible();
  });

  test("closes modal with Done button", async ({ page }) => {
    const customizeBtn = page.getByRole("button", { name: /Customize/i });
    await customizeBtn.click();
    await expect(page.getByText("Customize Dashboard")).toBeVisible();

    // Click Done
    await page.getByRole("button", { name: "Done" }).click();

    // Modal should be closed
    await expect(page.getByText("Customize Dashboard")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Persona Presets
// ---------------------------------------------------------------------------

test.describe("Dashboard — Manager Preset", () => {
  test("manager preset includes cross-cutting widgets", async ({ page }) => {
    await setupDashboardMocks(page, mockPreferencesManagerPreset);
    await gotoDashboard(page);

    // Manager preset should show AI Agents widget (cross-cutting widget added in Phase 7)
    await expect(page.locator("main").getByRole("heading", { name: "AI Agents" })).toBeVisible();

    // Should show "Coming Soon" for unimplemented widgets like teamOverview
    const comingSoonWidgets = page.getByText("This widget is coming soon");
    const count = await comingSoonWidgets.count();
    expect(count).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: CSS Grid Layout
// ---------------------------------------------------------------------------

test.describe("Dashboard — Grid Layout", () => {
  test.beforeEach(async ({ page }) => {
    await setupDashboardMocks(page);
    await gotoDashboard(page);
  });

  test("dashboard uses CSS grid for widget layout", async ({ page }) => {
    // The SortableWidgetGrid should render a grid container
    const gridContainer = page.locator(".grid.grid-cols-1");
    await expect(gridContainer.first()).toBeVisible();
  });

  test("full-size widgets span the full grid width", async ({ page }) => {
    // Welcome and QuickStats are "full" size widgets
    const fullWidgets = page.locator(".col-span-full");
    const count = await fullWidgets.count();
    expect(count).toBeGreaterThan(0);
  });
});
