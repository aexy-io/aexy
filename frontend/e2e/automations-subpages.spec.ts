import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockAutomationDetail = {
  id: "auto-1",
  name: "Auto-assign tickets",
  description: "Automatically assign incoming tickets based on category",
  trigger: {
    type: "ticket_created",
    conditions: { category: "bug" },
  },
  actions: [
    { type: "assign_member", config: { member_id: "test-user-123" } },
    { type: "add_label", config: { label: "auto-assigned" } },
  ],
  status: "active",
  runs_count: 156,
  last_run_at: "2026-02-14T16:00:00Z",
  created_at: "2026-01-10T00:00:00Z",
  updated_at: "2026-02-14T16:00:00Z",
  workspace_id: "ws-1",
};

const mockAutomations = [
  mockAutomationDetail,
  {
    id: "auto-2",
    name: "Weekly standup reminder",
    description: "Send standup reminders every weekday morning",
    trigger: { type: "schedule", conditions: { cron: "0 9 * * 1-5" } },
    actions: [{ type: "send_notification", config: { channel: "slack" } }],
    status: "active",
    runs_count: 45,
    last_run_at: "2026-02-14T09:00:00Z",
    created_at: "2026-01-05T00:00:00Z",
    updated_at: "2026-02-14T09:00:00Z",
    workspace_id: "ws-1",
  },
];

const mockTriggerTypes = [
  { type: "ticket_created", name: "Ticket Created", description: "When a new ticket is created" },
  { type: "schedule", name: "Schedule", description: "Run on a recurring schedule" },
  { type: "pr_merged", name: "PR Merged", description: "When a pull request is merged" },
];

const mockActionTypes = [
  { type: "assign_member", name: "Assign Member", description: "Assign to a team member" },
  { type: "send_notification", name: "Send Notification", description: "Send notification via channel" },
  { type: "add_label", name: "Add Label", description: "Add a label to the item" },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupAutomationsSubpageMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/automations`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAutomations) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/automations/auto-1`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAutomationDetail) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/automations/triggers**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTriggerTypes) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/automations/actions**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockActionTypes) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/automations/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAutomationDetail) });
  });
}

// ---------------------------------------------------------------------------
// Tests: Automation Detail
// ---------------------------------------------------------------------------

test.describe("Automations -- Detail Page", () => {
  test("renders the automation detail page", async ({ page }) => {
    await setupAutomationsSubpageMocks(page);
    await page.goto("/automations/auto-1");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasAuto = await page.getByText(/auto-assign|automation/i).isVisible().catch(() => false);
    expect(hasAuto).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: New Automation
// ---------------------------------------------------------------------------

test.describe("Automations -- New Page", () => {
  test("renders the new automation page", async ({ page }) => {
    await setupAutomationsSubpageMocks(page);
    await page.goto("/automations/new");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasNew = await page.getByText(/create|new|automation/i).isVisible().catch(() => false);
    expect(hasNew).toBeTruthy();
  });
});
