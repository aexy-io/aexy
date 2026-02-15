import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

const mockForms = [
  {
    id: "form-1",
    name: "Bug Report Form",
    description: "Submit bug reports for our product",
    template_type: "bug_report",
    is_active: true,
    submission_count: 23,
    public_url_token: "abc123",
    auto_create_ticket: true,
    auto_create_record: false,
    auto_create_deal: false,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-02-10T00:00:00Z",
  },
  {
    id: "form-2",
    name: "Contact Us",
    description: "General contact form",
    template_type: "contact",
    is_active: true,
    submission_count: 45,
    public_url_token: "def456",
    auto_create_ticket: false,
    auto_create_record: true,
    auto_create_deal: false,
    created_at: "2026-01-20T00:00:00Z",
    updated_at: "2026-02-08T00:00:00Z",
  },
  {
    id: "form-3",
    name: "Lead Capture",
    description: "Capture leads from landing page",
    template_type: "lead_capture",
    is_active: false,
    submission_count: 0,
    public_url_token: "ghi789",
    auto_create_ticket: false,
    auto_create_record: true,
    auto_create_deal: true,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
  },
];

const mockTemplates = {
  bug_report: { name: "Bug Report", description: "Collect bug reports with severity and steps to reproduce" },
  feature_request: { name: "Feature Request", description: "Collect feature requests with priority" },
  support: { name: "Support Ticket", description: "General support request form" },
  contact: { name: "Contact Form", description: "Simple contact form" },
  lead_capture: { name: "Lead Capture", description: "Capture leads with email and company" },
  feedback: { name: "Feedback", description: "Collect user feedback" },
};

async function setupFormsMocks(page: Page) {
  await setupCommonMocks(page);

  // Forms list
  await page.route(`${API_BASE}/workspaces/ws-1/forms`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockForms),
      });
    }
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "form-new", name: "New Form" }) });
  });

  // Form templates
  await page.route(`${API_BASE}/workspaces/ws-1/forms/templates`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTemplates),
    });
  });
}

test.describe("Forms Page — Overview", () => {
  test.beforeEach(async ({ page }) => {
    await setupFormsMocks(page);
    await page.goto("/forms");
    await page.waitForSelector("text=Forms", { timeout: 45000 });
  });

  test("renders the forms page with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Forms" })).toBeVisible();
    await expect(page.getByText("Create forms that connect to Tickets, CRM, and Deals")).toBeVisible();
  });

  test("shows stats cards", async ({ page }) => {
    await expect(page.getByText("Active Forms")).toBeVisible();
    await expect(page.getByText("Total Submissions")).toBeVisible();
    await expect(page.getByText("Ticket Forms")).toBeVisible();
    await expect(page.getByText("CRM Forms")).toBeVisible();
  });

  test("shows filter section with search", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search forms...");
    await expect(searchInput).toBeVisible();
  });

  test("shows status filter buttons", async ({ page }) => {
    await expect(page.getByRole("button", { name: "All" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Active" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Inactive" })).toBeVisible();
  });

  test("shows form cards with template badges", async ({ page }) => {
    await expect(page.getByText("Bug Report Form")).toBeVisible();
    await expect(page.getByText("Contact Us")).toBeVisible();
    await expect(page.getByText("Lead Capture")).toBeVisible();
    // Template badges
    await expect(page.getByText("Bug Report", { exact: true }).first()).toBeVisible();
  });

  test("Create Form button opens modal with template selector", async ({ page }) => {
    await page.getByRole("button", { name: /Create Form/i }).first().click();
    await expect(page.getByText("Create New Form")).toBeVisible();
    await expect(page.getByText("Choose a template or start from scratch")).toBeVisible();
    await expect(page.getByText("Blank Form")).toBeVisible();
  });

  test("form cards show active/inactive status", async ({ page }) => {
    // Active forms
    const activeLabels = page.getByText("Active", { exact: true });
    const activeCount = await activeLabels.count();
    expect(activeCount).toBeGreaterThan(0);
  });
});
