import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockCampaigns = [
  {
    id: "camp-1",
    name: "February Newsletter",
    subject: "Monthly Product Updates",
    status: "sent",
    sent_count: 1250,
    open_rate: 45.2,
    click_rate: 12.8,
    sent_at: "2026-02-01T09:00:00Z",
    workspace_id: "ws-1",
  },
  {
    id: "camp-2",
    name: "Product Launch",
    subject: "Introducing New Features",
    status: "draft",
    sent_count: 0,
    open_rate: 0,
    click_rate: 0,
    sent_at: null,
    workspace_id: "ws-1",
  },
];

const mockCampaignDetail = {
  ...mockCampaigns[0],
  html_content: "<h1>February Newsletter</h1><p>Here are our latest updates...</p>",
  recipients: {
    total: 1250,
    lists: ["all-subscribers"],
  },
  analytics: {
    opens: 565,
    clicks: 160,
    bounces: 12,
    unsubscribes: 3,
  },
};

const mockTemplates = [
  {
    id: "tpl-em-1",
    name: "Newsletter Template",
    description: "Standard monthly newsletter",
    category: "newsletter",
    preview_url: null,
    workspace_id: "ws-1",
  },
  {
    id: "tpl-em-2",
    name: "Product Update",
    description: "Product feature announcement",
    category: "product",
    preview_url: null,
    workspace_id: "ws-1",
  },
];

const mockTemplateDetail = {
  ...mockTemplates[0],
  html_content: "<h1>{{title}}</h1><p>{{body}}</p>",
  variables: ["title", "body", "footer"],
};

const mockSettings = {
  sender_name: "Aexy Team",
  sender_email: "team@aexy.io",
  reply_to: "support@aexy.io",
  unsubscribe_url: "https://aexy.io/unsubscribe",
  footer_text: "You are receiving this because you subscribed.",
  tracking_enabled: true,
  double_opt_in: true,
};

const mockLists = [
  { id: "list-1", name: "All Subscribers", subscriber_count: 1250, created_at: "2025-06-01T00:00:00Z" },
  { id: "list-2", name: "Enterprise Leads", subscriber_count: 85, created_at: "2026-01-15T00:00:00Z" },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupEmailMarketingSubpageMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/email-marketing/campaigns`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCampaigns) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/email-marketing/campaigns/camp-1`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCampaignDetail) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/email-marketing/campaigns/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCampaignDetail) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/email-marketing/templates`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTemplates) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/email-marketing/templates/tpl-em-1`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTemplateDetail) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/email-marketing/templates/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTemplateDetail) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/email-marketing/settings**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockSettings) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/email-marketing/lists**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLists) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/email-marketing/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });
}

// ---------------------------------------------------------------------------
// Tests: Campaigns List
// ---------------------------------------------------------------------------

test.describe("Email Marketing -- Campaigns Page", () => {
  test("renders the campaigns list page", async ({ page }) => {
    await setupEmailMarketingSubpageMocks(page);
    await page.goto("/email-marketing/campaigns");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasCampaigns = await page.getByText(/campaign/i).isVisible().catch(() => false);
    expect(hasCampaigns).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Campaign Detail
// ---------------------------------------------------------------------------

test.describe("Email Marketing -- Campaign Detail Page", () => {
  test("renders the campaign detail page", async ({ page }) => {
    await setupEmailMarketingSubpageMocks(page);
    await page.goto("/email-marketing/campaigns/camp-1");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasCampaign = await page.getByText(/February Newsletter|campaign/i).isVisible().catch(() => false);
    expect(hasCampaign).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: New Campaign
// ---------------------------------------------------------------------------

test.describe("Email Marketing -- New Campaign Page", () => {
  test("renders the new campaign page", async ({ page }) => {
    await setupEmailMarketingSubpageMocks(page);
    await page.goto("/email-marketing/campaigns/new");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasNew = await page.getByText(/create|new|campaign/i).isVisible().catch(() => false);
    expect(hasNew).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Templates List
// ---------------------------------------------------------------------------

test.describe("Email Marketing -- Templates Page", () => {
  test("renders the templates list page", async ({ page }) => {
    await setupEmailMarketingSubpageMocks(page);
    await page.goto("/email-marketing/templates");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasTemplates = await page.getByText(/template/i).isVisible().catch(() => false);
    expect(hasTemplates).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Template Detail
// ---------------------------------------------------------------------------

test.describe("Email Marketing -- Template Detail Page", () => {
  test("renders the template detail page", async ({ page }) => {
    await setupEmailMarketingSubpageMocks(page);
    await page.goto("/email-marketing/templates/tpl-em-1");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: Settings
// ---------------------------------------------------------------------------

test.describe("Email Marketing -- Settings Page", () => {
  test("renders the email marketing settings page", async ({ page }) => {
    await setupEmailMarketingSubpageMocks(page);
    await page.goto("/email-marketing/settings");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasSettings = await page.getByText(/setting/i).isVisible().catch(() => false);
    expect(hasSettings).toBeTruthy();
  });
});
