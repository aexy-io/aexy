import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockFormDetail = {
  id: "form-1",
  title: "Employee Feedback Survey",
  description: "Quarterly employee feedback collection",
  status: "published",
  response_count: 42,
  fields: [
    { id: "f1", type: "text", label: "What went well this quarter?", required: true },
    { id: "f2", type: "rating", label: "Rate your team collaboration", required: true, min: 1, max: 5 },
    { id: "f3", type: "textarea", label: "Any suggestions for improvement?", required: false },
  ],
  settings: {
    is_anonymous: true,
    allow_multiple_responses: false,
    closes_at: "2026-03-01T00:00:00Z",
  },
  created_at: "2026-01-15T00:00:00Z",
  updated_at: "2026-02-10T00:00:00Z",
  workspace_id: "ws-1",
};

const mockForms = [
  {
    id: "form-1",
    title: "Employee Feedback Survey",
    description: "Quarterly feedback",
    status: "published",
    response_count: 42,
  },
  {
    id: "form-2",
    title: "Event RSVP",
    description: "Company event registration",
    status: "draft",
    response_count: 0,
  },
];

const mockResponses = [
  {
    id: "resp-1",
    form_id: "form-1",
    submitted_at: "2026-02-12T10:00:00Z",
    answers: { f1: "Great team dynamics", f2: 4, f3: "More team events" },
  },
  {
    id: "resp-2",
    form_id: "form-1",
    submitted_at: "2026-02-13T14:00:00Z",
    answers: { f1: "Good project management", f2: 5, f3: null },
  },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupFormsSubpageMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/forms`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockForms) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/forms/form-1`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockFormDetail) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/forms/form-1/responses**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ responses: mockResponses, total: mockResponses.length }) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/forms/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockFormDetail) });
  });
}

// ---------------------------------------------------------------------------
// Tests: Form Detail
// ---------------------------------------------------------------------------

test.describe("Forms -- Form Detail Page", () => {
  test("renders the form detail page", async ({ page }) => {
    await setupFormsSubpageMocks(page);
    await page.goto("/forms/form-1");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasForm = await page.getByText(/Employee Feedback|form/i).isVisible().catch(() => false);
    expect(hasForm).toBeTruthy();
  });
});
