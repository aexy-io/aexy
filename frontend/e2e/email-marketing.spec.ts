import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

const mockCampaigns = [
  {
    id: "camp-1",
    name: "Welcome Series",
    status: "sending",
    sent_count: 1200,
    open_count: 480,
    click_count: 96,
    bounce_count: 12,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-10T00:00:00Z",
  },
  {
    id: "camp-2",
    name: "Product Launch",
    status: "completed",
    sent_count: 5000,
    open_count: 2000,
    click_count: 500,
    bounce_count: 50,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-01-20T00:00:00Z",
  },
];

const mockTemplates = [
  {
    id: "tmpl-1",
    name: "Welcome Email",
    template_type: "transactional",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-02-01T00:00:00Z",
  },
  {
    id: "tmpl-2",
    name: "Newsletter",
    template_type: "newsletter",
    created_at: "2026-01-05T00:00:00Z",
    updated_at: "2026-02-05T00:00:00Z",
  },
];

const mockAnalytics = {
  total_sent: 6200,
  total_opens: 2480,
  total_clicks: 596,
  total_bounces: 62,
  avg_open_rate: 40.0,
  avg_click_rate: 9.6,
  campaigns_sent: 2,
  active_subscribers: 3500,
  total_unsubscribes: 12,
  avg_bounce_rate: 1.0,
};

async function setupEmailMocks(page: Page) {
  await setupCommonMocks(page);

  // Campaigns
  await page.route(`${API_BASE}/workspaces/ws-1/email-marketing/campaigns**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ campaigns: mockCampaigns, total: 2 }),
    });
  });

  // Templates
  await page.route(`${API_BASE}/workspaces/ws-1/email-marketing/templates**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTemplates),
    });
  });

  // Analytics overview
  await page.route(`${API_BASE}/workspaces/ws-1/email-marketing/analytics/overview**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockAnalytics),
    });
  });

  // Best send times
  await page.route(`${API_BASE}/workspaces/ws-1/email-marketing/analytics/best-send-times**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ send_times: [] }),
    });
  });

  // Top campaigns
  await page.route(`${API_BASE}/workspaces/ws-1/email-marketing/analytics/top-campaigns**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ campaigns: [] }),
    });
  });

  // Sending domains
  await page.route(`${API_BASE}/workspaces/ws-1/email-marketing/domains**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Email providers
  await page.route(`${API_BASE}/workspaces/ws-1/email-marketing/providers**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

test.describe("Email Marketing Page — Overview", () => {
  test.beforeEach(async ({ page }) => {
    await setupEmailMocks(page);
    await page.goto("/email-marketing");
    await page.waitForSelector("text=Email Marketing", { timeout: 45000 });
  });

  test("renders the email marketing page with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Email Marketing" })).toBeVisible();
    await expect(page.getByText("Campaigns, templates, and analytics")).toBeVisible();
  });

  test("shows stats cards with data", async ({ page }) => {
    await expect(page.getByText("Total Sent")).toBeVisible();
    await expect(page.getByText("6,200")).toBeVisible();
    await expect(page.getByText("Avg Open Rate")).toBeVisible();
    await expect(page.getByText("40.0%")).toBeVisible();
    await expect(page.getByText("Avg Click Rate")).toBeVisible();
    await expect(page.getByText("9.6%")).toBeVisible();
    await expect(page.getByText("Active Campaigns")).toBeVisible();
  });

  test("shows tab navigation", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Campaigns" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Templates" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Analytics" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Infrastructure" })).toBeVisible();
  });

  test("campaigns tab shows campaign list with status badges", async ({ page }) => {
    await expect(page.getByText("Recent Campaigns")).toBeVisible();
    await expect(page.getByText("Welcome Series")).toBeVisible();
    await expect(page.getByText("Product Launch")).toBeVisible();
    await expect(page.getByText("sending")).toBeVisible();
    await expect(page.getByText("completed")).toBeVisible();
  });

  test("templates tab shows template cards", async ({ page }) => {
    await page.getByRole("button", { name: "Templates" }).click();
    await expect(page.getByText("Email Templates")).toBeVisible();
    await expect(page.getByText("Welcome Email")).toBeVisible();
    await expect(page.getByText("Newsletter")).toBeVisible();
  });

  test("has New Campaign button", async ({ page }) => {
    const newCampaignLink = page.locator('a', { hasText: "New Campaign" });
    await expect(newCampaignLink).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tab Switching
// ---------------------------------------------------------------------------

test.describe("Email Marketing — Tab Switching", () => {
  test.beforeEach(async ({ page }) => {
    await setupEmailMocks(page);
    await page.goto("/email-marketing");
    await page.waitForSelector("text=Email Marketing", { timeout: 45000 });
  });

  test("clicking Templates tab shows template list", async ({ page }) => {
    await page.getByRole("button", { name: "Templates" }).click();
    await expect(page.getByText("Email Templates")).toBeVisible();
    await expect(page.getByText("Welcome Email")).toBeVisible();
    await expect(page.getByText("Newsletter")).toBeVisible();
  });

  test("clicking Analytics tab shows performance overview", async ({ page }) => {
    await page.getByRole("button", { name: "Analytics" }).click();
    await expect(page.getByText("Performance Overview (Last 30 Days)")).toBeVisible();
  });

  test("clicking Infrastructure tab shows domains section", async ({ page }) => {
    await page.getByRole("button", { name: "Infrastructure" }).click();
    await expect(page.getByText("Sending Domains")).toBeVisible();
  });

  test("clicking Campaigns tab returns to campaign view", async ({ page }) => {
    // Navigate away first
    await page.getByRole("button", { name: "Templates" }).click();
    await expect(page.getByText("Email Templates")).toBeVisible();
    // Navigate back
    await page.getByRole("button", { name: "Campaigns" }).click();
    await expect(page.getByText("Recent Campaigns")).toBeVisible();
    await expect(page.getByText("Welcome Series")).toBeVisible();
  });

  test("active tab has visual indication via class", async ({ page }) => {
    // Campaigns is the default active tab
    const campaignsTab = page.getByRole("button", { name: "Campaigns" });
    await expect(campaignsTab).toHaveClass(/bg-slate-800/);
    await expect(campaignsTab).toHaveClass(/text-white/);

    // Templates tab should not have active styling initially
    const templatesTab = page.getByRole("button", { name: "Templates" });
    await expect(templatesTab).toHaveClass(/text-slate-400/);

    // After clicking Templates, it becomes active
    await templatesTab.click();
    await expect(templatesTab).toHaveClass(/bg-slate-800/);
    await expect(templatesTab).toHaveClass(/text-white/);
    // Campaigns should lose active styling
    await expect(campaignsTab).toHaveClass(/text-slate-400/);
  });
});

// ---------------------------------------------------------------------------
// Campaign Details
// ---------------------------------------------------------------------------

test.describe("Email Marketing — Campaign Details", () => {
  test.beforeEach(async ({ page }) => {
    await setupEmailMocks(page);
    await page.goto("/email-marketing");
    await page.waitForSelector("text=Email Marketing", { timeout: 45000 });
  });

  test('campaign "Welcome Series" shows "sending" badge', async ({ page }) => {
    const row = page.locator("tr", { hasText: "Welcome Series" });
    await expect(row).toBeVisible();
    await expect(row.getByText("sending")).toBeVisible();
  });

  test('campaign "Product Launch" shows "completed" badge', async ({ page }) => {
    const row = page.locator("tr", { hasText: "Product Launch" });
    await expect(row).toBeVisible();
    await expect(row.getByText("completed")).toBeVisible();
  });

  test("campaign cards show sent count", async ({ page }) => {
    // Welcome Series: 1,200 sent
    const welcomeRow = page.locator("tr", { hasText: "Welcome Series" });
    await expect(welcomeRow.getByText("1,200")).toBeVisible();
    // Product Launch: 5,000 sent
    const productRow = page.locator("tr", { hasText: "Product Launch" });
    await expect(productRow.getByText("5,000")).toBeVisible();
  });

  test("campaign cards show open rate", async ({ page }) => {
    // Welcome Series: 480/1200 = 40.0%
    const welcomeRow = page.locator("tr", { hasText: "Welcome Series" });
    await expect(welcomeRow.getByText("40.0%")).toBeVisible();
    // Product Launch: 2000/5000 = 40.0%
    const productRow = page.locator("tr", { hasText: "Product Launch" });
    await expect(productRow.getByText("40.0%")).toBeVisible();
  });

  test("campaign cards show click rate", async ({ page }) => {
    // Welcome Series: 96/1200 = 8.0%
    const welcomeRow = page.locator("tr", { hasText: "Welcome Series" });
    await expect(welcomeRow.getByText("8.0%")).toBeVisible();
    // Product Launch: 500/5000 = 10.0%
    const productRow = page.locator("tr", { hasText: "Product Launch" });
    await expect(productRow.getByText("10.0%")).toBeVisible();
  });

  test("New Campaign button links to /email-marketing/campaigns/new", async ({ page }) => {
    const newCampaignLink = page.locator("a", { hasText: "New Campaign" });
    await expect(newCampaignLink).toBeVisible();
    await expect(newCampaignLink).toHaveAttribute("href", "/email-marketing/campaigns/new");
  });
});

// ---------------------------------------------------------------------------
// Templates Tab
// ---------------------------------------------------------------------------

test.describe("Email Marketing — Templates Tab", () => {
  test.beforeEach(async ({ page }) => {
    await setupEmailMocks(page);
    await page.goto("/email-marketing");
    await page.waitForSelector("text=Email Marketing", { timeout: 45000 });
    await page.getByRole("button", { name: "Templates" }).click();
    await page.waitForSelector("text=Email Templates", { timeout: 30000 });
  });

  test('template "Welcome Email" shows transactional type', async ({ page }) => {
    const card = page.locator("a", { hasText: "Welcome Email" });
    await expect(card).toBeVisible();
    await expect(card.getByText("transactional")).toBeVisible();
  });

  test('template "Newsletter" shows newsletter type', async ({ page }) => {
    const card = page.locator("a", { hasText: "Newsletter" });
    await expect(card).toBeVisible();
    await expect(card.getByText("newsletter")).toBeVisible();
  });

  test("New Template button exists", async ({ page }) => {
    const newTemplateLink = page.locator("a", { hasText: "New Template" });
    await expect(newTemplateLink).toBeVisible();
    await expect(newTemplateLink).toHaveAttribute("href", "/email-marketing/templates/new");
  });

  test("templates show last edited date info", async ({ page }) => {
    // Templates display "Last edited <date>" from updated_at
    await expect(page.getByText("Last edited", { exact: false }).first()).toBeVisible();
  });

  test("template cards are clickable links", async ({ page }) => {
    const welcomeCard = page.locator("a", { hasText: "Welcome Email" });
    await expect(welcomeCard).toHaveAttribute("href", "/email-marketing/templates/tmpl-1");
    const newsletterCard = page.locator("a", { hasText: "Newsletter" });
    await expect(newsletterCard).toHaveAttribute("href", "/email-marketing/templates/tmpl-2");
  });
});

// ---------------------------------------------------------------------------
// Analytics Tab
// ---------------------------------------------------------------------------

test.describe("Email Marketing — Analytics Tab", () => {
  test.beforeEach(async ({ page }) => {
    await setupEmailMocks(page);
    await page.goto("/email-marketing");
    await page.waitForSelector("text=Email Marketing", { timeout: 45000 });
    await page.getByRole("button", { name: "Analytics" }).click();
    await page.waitForSelector("text=Performance Overview", { timeout: 30000 });
  });

  test('shows "Performance Overview" heading', async ({ page }) => {
    await expect(page.getByText("Performance Overview (Last 30 Days)")).toBeVisible();
  });

  test("shows total sent count (6,200)", async ({ page }) => {
    // Inside the analytics performance grid
    const sentSection = page.locator("text=Emails Sent").locator("..");
    await expect(sentSection.getByText("6,200")).toBeVisible();
  });

  test("shows total opens count (2,480)", async ({ page }) => {
    const opensSection = page.locator("text=Opens").locator("..");
    await expect(opensSection.getByText("2,480")).toBeVisible();
  });

  test("shows total clicks count (596)", async ({ page }) => {
    const clicksSection = page.locator("text=Clicks").locator("..");
    await expect(clicksSection.getByText("596")).toBeVisible();
  });

  test("shows total bounces count (62)", async ({ page }) => {
    const bouncesSection = page.locator("text=Bounces").locator("..");
    await expect(bouncesSection.getByText("62")).toBeVisible();
  });

  test("shows campaigns sent count (2)", async ({ page }) => {
    const campaignsSection = page.locator("text=Campaigns").locator("..");
    await expect(campaignsSection.getByText("2")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Infrastructure Tab
// ---------------------------------------------------------------------------

test.describe("Email Marketing — Infrastructure Tab", () => {
  test.beforeEach(async ({ page }) => {
    await setupEmailMocks(page);
    await page.goto("/email-marketing");
    await page.waitForSelector("text=Email Marketing", { timeout: 45000 });
    await page.getByRole("button", { name: "Infrastructure" }).click();
    await page.waitForSelector("text=Sending Domains", { timeout: 30000 });
  });

  test('shows "Sending Domains" section', async ({ page }) => {
    await expect(page.getByText("Sending Domains")).toBeVisible();
  });

  test('shows "Email Providers" section', async ({ page }) => {
    await expect(page.getByText("Email Providers")).toBeVisible();
  });

  test("shows subscriber overview section", async ({ page }) => {
    await expect(page.getByText("Subscriber Overview")).toBeVisible();
  });

  test("shows active subscribers count (3,500)", async ({ page }) => {
    await expect(page.getByText("3,500")).toBeVisible();
    await expect(page.getByText("Active subscribers")).toBeVisible();
  });

  test("shows unsubscribe count (12)", async ({ page }) => {
    const unsubSection = page.locator("text=Unsubscribed (30d)").locator("..");
    await expect(unsubSection.getByText("12")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Empty States & Stats
// ---------------------------------------------------------------------------

test.describe("Email Marketing — Empty States & Stats", () => {
  test.beforeEach(async ({ page }) => {
    await setupEmailMocks(page);
    await page.goto("/email-marketing");
    await page.waitForSelector("text=Email Marketing", { timeout: 45000 });
  });

  test("avg bounce rate displays correctly (1.00%)", async ({ page }) => {
    await page.getByRole("button", { name: "Infrastructure" }).click();
    await page.waitForSelector("text=Subscriber Overview", { timeout: 30000 });
    await expect(page.getByText("1.00%")).toBeVisible();
    await expect(page.getByText("Bounce rate")).toBeVisible();
  });

  test("total unsubscribes shown (12)", async ({ page }) => {
    await page.getByRole("button", { name: "Infrastructure" }).click();
    await page.waitForSelector("text=Subscriber Overview", { timeout: 30000 });
    const unsubSection = page.locator("text=Unsubscribed (30d)").locator("..");
    await expect(unsubSection.getByText("12")).toBeVisible();
  });

  test("active subscribers count shows correctly (3,500)", async ({ page }) => {
    await page.getByRole("button", { name: "Infrastructure" }).click();
    await page.waitForSelector("text=Subscriber Overview", { timeout: 30000 });
    await expect(page.getByText("3,500")).toBeVisible();
    await expect(page.getByText("Active subscribers")).toBeVisible();
  });
});
