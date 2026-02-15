import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockReminderStats = {
  total_reminders: 15,
  active_reminders: 10,
  overdue_count: 2,
  upcoming_7_days: 4,
  completed_this_month: 8,
  compliance_rate: 85,
};

const mockMyReminders = [
  {
    id: "rem-1",
    title: "Quarterly SOC2 Review",
    description: "Complete SOC2 compliance review for Q1",
    category: "compliance",
    priority: "high",
    status: "active",
    due_date: "2026-03-01T00:00:00Z",
    recurrence_pattern: "quarterly",
    assigned_to: "test-user-123",
    workspace_id: "ws-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-15T00:00:00Z",
  },
  {
    id: "rem-2",
    title: "Team Performance Review",
    description: "Complete team performance reviews",
    category: "review",
    priority: "medium",
    status: "active",
    due_date: "2026-02-28T00:00:00Z",
    recurrence_pattern: null,
    assigned_to: "test-user-123",
    workspace_id: "ws-1",
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
  },
];

const mockOverdueReminders = [
  {
    id: "rem-3",
    title: "Update Privacy Policy",
    description: "Annual privacy policy update required",
    category: "compliance",
    priority: "critical",
    status: "overdue",
    due_date: "2026-02-10T00:00:00Z",
    recurrence_pattern: "annual",
    assigned_to: "test-user-123",
    workspace_id: "ws-1",
    created_at: "2025-12-01T00:00:00Z",
    updated_at: "2026-02-10T00:00:00Z",
  },
];

const mockActiveReminders = [
  ...mockMyReminders,
  {
    id: "rem-4",
    title: "License Renewal",
    description: "Renew software licenses",
    category: "operations",
    priority: "low",
    status: "active",
    due_date: "2026-04-01T00:00:00Z",
    recurrence_pattern: "annual",
    assigned_to: "dev-2",
    workspace_id: "ws-1",
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-01-15T00:00:00Z",
  },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupRemindersMocks(page: Page) {
  await setupCommonMocks(page);

  // Override workspace sub-routes for reminder-specific endpoints
  await page.route(`${API_BASE}/workspaces/ws-1/reminders/dashboard**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockReminderStats),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/reminders/my**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ assigned: mockMyReminders, overdue: mockOverdueReminders }),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/reminders`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ reminders: mockActiveReminders, total: mockActiveReminders.length }),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/reminders/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockMyReminders[0]),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Reminders Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupRemindersMocks(page);
    await page.goto("/reminders");
    await page.waitForSelector("text=Reminders", { timeout: 45000 });
  });

  test("renders the page heading and description", async ({ page }) => {
    await expect(page.locator("h1").getByText("Reminders")).toBeVisible();
    await expect(page.getByText("Track compliance commitments, reviews, and recurring tasks")).toBeVisible();
  });

  test("shows action buttons in header", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Calendar", exact: true })).toBeVisible();
    await expect(page.getByText("Compliance Center")).toBeVisible();
  });
});

test.describe("Reminders Page -- Navigation Links", () => {
  test("shows calendar link", async ({ page }) => {
    await setupRemindersMocks(page);
    await page.goto("/reminders");
    await page.waitForSelector("text=Reminders", { timeout: 45000 });

    await expect(page.locator("a[href*='calendar']").first()).toBeVisible();
  });
});
