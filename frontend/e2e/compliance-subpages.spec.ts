import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockCalendarEvents = {
  events: [
    {
      id: "cal-1",
      title: "SOC2 Audit",
      date: "2026-03-01",
      type: "audit",
      status: "upcoming",
    },
    {
      id: "cal-2",
      title: "GDPR Training Due",
      date: "2026-02-28",
      type: "training",
      status: "due_soon",
    },
  ],
};

const mockReminders = [
  {
    id: "crem-1",
    title: "Q1 SOC2 Review",
    description: "Complete Q1 compliance review",
    due_date: "2026-03-01T00:00:00Z",
    status: "active",
    category: "compliance",
    priority: "high",
    recurrence_pattern: "quarterly",
  },
  {
    id: "crem-2",
    title: "License Renewal",
    description: "Renew software licenses",
    due_date: "2026-04-01T00:00:00Z",
    status: "active",
    category: "operations",
    priority: "medium",
    recurrence_pattern: "annual",
  },
];

const mockDocumentDetail = {
  id: "doc-c1",
  title: "Privacy Policy v3",
  type: "policy",
  status: "published",
  version: "3.0",
  last_reviewed: "2026-01-15T00:00:00Z",
  next_review: "2026-07-15T00:00:00Z",
  owner_id: "test-user-123",
  content: "This is the privacy policy content...",
  tags: ["privacy", "gdpr"],
  created_at: "2025-06-01T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
};

const mockDocuments = [
  {
    id: "doc-c1",
    title: "Privacy Policy v3",
    type: "policy",
    status: "published",
    version: "3.0",
    last_reviewed: "2026-01-15T00:00:00Z",
  },
  {
    id: "doc-c2",
    title: "Security Procedures",
    type: "procedure",
    status: "draft",
    version: "1.0",
    last_reviewed: null,
  },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupComplianceSubpageMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/compliance/calendar**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCalendarEvents) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/compliance/reminders`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reminders: mockReminders, total: mockReminders.length }) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/compliance/reminders/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockReminders[0]) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/compliance/documents`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockDocuments) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/compliance/documents/doc-c1`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockDocumentDetail) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/compliance/documents/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockDocumentDetail) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/compliance/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });
}

// ---------------------------------------------------------------------------
// Tests: Compliance Calendar
// ---------------------------------------------------------------------------

test.describe("Compliance -- Calendar Page", () => {
  test("renders the compliance calendar page", async ({ page }) => {
    await setupComplianceSubpageMocks(page);
    await page.goto("/compliance/calendar");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasCal = await page.getByText(/calendar/i).isVisible().catch(() => false);
    expect(hasCal).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Compliance Reminders
// ---------------------------------------------------------------------------

test.describe("Compliance -- Reminders Page", () => {
  test("renders the compliance reminders page", async ({ page }) => {
    await setupComplianceSubpageMocks(page);
    await page.goto("/compliance/reminders");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasReminders = await page.getByText(/reminder/i).isVisible().catch(() => false);
    expect(hasReminders).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Document Detail
// ---------------------------------------------------------------------------

test.describe("Compliance -- Document Detail Page", () => {
  test("renders the document detail page", async ({ page }) => {
    await setupComplianceSubpageMocks(page);
    await page.goto("/compliance/documents/doc-c1");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasDoc = await page.getByText(/Privacy Policy|document/i).isVisible().catch(() => false);
    expect(hasDoc).toBeTruthy();
  });
});
