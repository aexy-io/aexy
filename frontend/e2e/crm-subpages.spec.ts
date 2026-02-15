import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockCRMAgents = [
  {
    id: "crm-agent-1",
    name: "Sales Assistant",
    description: "AI agent for sales tasks",
    type: "sales",
    status: "active",
    created_at: "2026-01-15T00:00:00Z",
  },
];

const mockCRMAutomations = [
  {
    id: "crm-auto-1",
    name: "Follow-up Email",
    description: "Send follow-up after meeting",
    trigger: "meeting_completed",
    status: "active",
    runs: 45,
    last_run_at: "2026-02-14T10:00:00Z",
  },
];

const mockCRMCalendar = {
  events: [
    {
      id: "evt-1",
      title: "Call with Acme Corp",
      start: "2026-02-15T10:00:00Z",
      end: "2026-02-15T11:00:00Z",
      type: "meeting",
      contact_id: "contact-1",
      contact_name: "John Smith",
    },
  ],
};

const mockCRMInbox = {
  messages: [
    {
      id: "msg-1",
      from: "john@acme.com",
      subject: "Re: Partnership proposal",
      preview: "Thanks for the proposal, we'd like to discuss further...",
      received_at: "2026-02-14T16:30:00Z",
      is_read: false,
    },
    {
      id: "msg-2",
      from: "sarah@example.com",
      subject: "Follow up on demo",
      preview: "Hi, just wanted to follow up on the demo we had...",
      received_at: "2026-02-13T09:00:00Z",
      is_read: true,
    },
  ],
  total: 2,
};

const mockCRMSettings = {
  pipeline_stages: ["Lead", "Qualified", "Proposal", "Negotiation", "Closed Won", "Closed Lost"],
  default_currency: "USD",
  auto_capture_emails: true,
};

const mockCRMObjects = [
  { id: "obj-1", name: "contacts", display_name: "Contacts", icon: "users", record_count: 150 },
  { id: "obj-2", name: "companies", display_name: "Companies", icon: "building", record_count: 45 },
  { id: "obj-3", name: "deals", display_name: "Deals", icon: "dollar-sign", record_count: 30 },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupCRMSubpageMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/crm/agents`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCRMAgents) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/crm/agents/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCRMAgents[0]) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/crm/automations`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCRMAutomations) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/crm/automations/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCRMAutomations[0]) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/crm/calendar**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCRMCalendar) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/crm/inbox**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCRMInbox) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/crm/settings**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCRMSettings) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/crm/objects`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCRMObjects) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/crm/onboarding**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ completed: false, step: "welcome" }) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/crm/integrations**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/crm/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });
}

// ---------------------------------------------------------------------------
// Tests: CRM Agents
// ---------------------------------------------------------------------------

test.describe("CRM -- Agents Page", () => {
  test("renders the CRM agents page", async ({ page }) => {
    await setupCRMSubpageMocks(page);
    await page.goto("/crm/agents");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasAgents = await page.getByText(/agent/i).isVisible().catch(() => false);
    expect(hasAgents).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: CRM Automations
// ---------------------------------------------------------------------------

test.describe("CRM -- Automations Page", () => {
  test("renders the CRM automations page", async ({ page }) => {
    await setupCRMSubpageMocks(page);
    await page.goto("/crm/automations");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasAuto = await page.getByText(/automation/i).isVisible().catch(() => false);
    expect(hasAuto).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: CRM Calendar
// ---------------------------------------------------------------------------

test.describe("CRM -- Calendar Page", () => {
  test("renders the CRM calendar page", async ({ page }) => {
    await setupCRMSubpageMocks(page);
    await page.goto("/crm/calendar");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasCal = await page.getByText(/calendar/i).isVisible().catch(() => false);
    expect(hasCal).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: CRM Inbox
// ---------------------------------------------------------------------------

test.describe("CRM -- Inbox Page", () => {
  test("renders the CRM inbox page", async ({ page }) => {
    await setupCRMSubpageMocks(page);
    await page.goto("/crm/inbox");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasInbox = await page.getByText(/inbox/i).isVisible().catch(() => false);
    expect(hasInbox).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: CRM Settings
// ---------------------------------------------------------------------------

test.describe("CRM -- Settings Page", () => {
  test("renders the CRM settings page", async ({ page }) => {
    await setupCRMSubpageMocks(page);
    await page.goto("/crm/settings");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasSettings = await page.getByText(/setting/i).isVisible().catch(() => false);
    expect(hasSettings).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: CRM Onboarding
// ---------------------------------------------------------------------------

test.describe("CRM -- Onboarding Page", () => {
  test("renders the CRM onboarding page", async ({ page }) => {
    await setupCRMSubpageMocks(page);
    await page.goto("/crm/onboarding");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
  });
});
