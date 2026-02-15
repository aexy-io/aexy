import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

const mockAutomations = [
  {
    id: "auto-1",
    name: "Auto-assign Tickets",
    description: "Automatically assign new tickets to available agents",
    module: "tickets",
    trigger_type: "ticket.created",
    actions: [
      { type: "assign", config: { strategy: "round_robin" } },
    ],
    conditions: [],
    is_active: true,
    total_runs: 156,
    last_run_at: "2026-02-14T10:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-02-14T10:00:00Z",
    workspace_id: "ws-1",
  },
  {
    id: "auto-2",
    name: "CRM Deal Stage Alert",
    description: "Send notification when deal moves to negotiation",
    module: "crm",
    trigger_type: "deal.stage_changed",
    actions: [
      { type: "notify", config: { channel: "slack" } },
      { type: "email", config: { template: "deal_alert" } },
    ],
    conditions: [],
    is_active: true,
    total_runs: 42,
    last_run_at: "2026-02-13T15:30:00Z",
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-02-13T15:30:00Z",
    workspace_id: "ws-1",
  },
  {
    id: "auto-3",
    name: "Uptime Alert",
    description: "Alert team when monitor goes down",
    module: "uptime",
    trigger_type: "monitor.down",
    actions: [
      { type: "notify", config: { channel: "slack" } },
    ],
    conditions: [],
    is_active: false,
    total_runs: 8,
    last_run_at: "2026-02-01T00:00:00Z",
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
    workspace_id: "ws-1",
  },
];

async function setupAutomationsMocks(page: Page) {
  await setupCommonMocks(page);

  // Automations list
  await page.route(`${API_BASE}/workspaces/ws-1/automations**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAutomations),
    });
  });
}

test.describe("Automations Page — Overview", () => {
  test.beforeEach(async ({ page }) => {
    await setupAutomationsMocks(page);
    await page.goto("/automations");
    await page.waitForSelector("text=Automations", { timeout: 45000 });
  });

  test("renders the automations page with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Automations" })).toBeVisible();
    await expect(page.getByText("Automate workflows across all Aexy modules")).toBeVisible();
  });

  test("shows module filter tabs", async ({ page }) => {
    await expect(page.getByRole("button", { name: "All Modules" })).toBeVisible();
    await expect(page.getByRole("button", { name: "CRM" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tickets" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Uptime" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Email" })).toBeVisible();
  });

  test("shows search bar", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search automations...");
    await expect(searchInput).toBeVisible();
  });

  test("shows Create Automation button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Create Automation/i })).toBeVisible();
  });

  test("shows automation cards with module badges", async ({ page }) => {
    await expect(page.getByText("Auto-assign Tickets")).toBeVisible();
    await expect(page.getByText("CRM Deal Stage Alert")).toBeVisible();
    await expect(page.getByText("Uptime Alert")).toBeVisible();
  });

  test("automation cards show run count and trigger info", async ({ page }) => {
    await expect(page.getByText("156 runs")).toBeVisible();
    await expect(page.getByText("42 runs")).toBeVisible();
    // Trigger type displayed
    await expect(page.getByText("ticket created", { exact: false })).toBeVisible();
  });

  test("search filters automations", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search automations...");
    await searchInput.fill("CRM");
    await expect(page.getByText("CRM Deal Stage Alert")).toBeVisible();
    await expect(page.getByText("Auto-assign Tickets")).not.toBeVisible();
  });
});
