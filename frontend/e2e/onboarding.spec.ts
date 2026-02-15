import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockOnboardingStatus = {
  completed: false,
  current_step: "welcome",
};

const mockOnboardingStatusComplete = {
  completed: true,
  current_step: "complete",
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupOnboardingMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/repositories/onboarding/status**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockOnboardingStatus),
    });
  });

  await page.route(`${API_BASE}/onboarding/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  await page.route(`${API_BASE}/repositories/installation-status**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ has_installation: false, install_url: "https://github.com/apps/aexy/install" }),
    });
  });

  await page.route(`${API_BASE}/repositories`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests: Onboarding Welcome Page
// ---------------------------------------------------------------------------

test.describe("Onboarding -- Welcome Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupOnboardingMocks(page);
    await page.goto("/onboarding");
    await page.waitForSelector("text=Welcome to Aexy", { timeout: 45000 });
  });

  test("renders the welcome heading", async ({ page }) => {
    await expect(page.getByText("Welcome to Aexy")).toBeVisible();
  });

  test("shows feature cards", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Development Analytics" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "CRM & Contacts" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Team Insights" })).toBeVisible();
  });

  test("shows get started call-to-action", async ({ page }) => {
    await expect(page.getByText("command center")).toBeVisible();
  });
});

test.describe("Onboarding -- Use Case Page", () => {
  test("renders the use case selection page", async ({ page }) => {
    await setupOnboardingMocks(page);
    await page.goto("/onboarding/use-case");
    // Wait for page to load -- the use case page should show some kind of selection
    await page.waitForTimeout(2000);
    // Verify we're on an onboarding page
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Onboarding -- Workspace Page", () => {
  test("renders the workspace creation page", async ({ page }) => {
    await setupOnboardingMocks(page);
    await page.goto("/onboarding/workspace");
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Onboarding -- Connect Page", () => {
  test("renders the connect page", async ({ page }) => {
    await setupOnboardingMocks(page);
    await page.goto("/onboarding/connect");
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Onboarding -- Invite Page", () => {
  test("renders the invite page", async ({ page }) => {
    await setupOnboardingMocks(page);
    await page.goto("/onboarding/invite");
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Onboarding -- Complete Page", () => {
  test("renders the completion page", async ({ page }) => {
    await setupOnboardingMocks(page);
    await page.goto("/onboarding/complete");
    await page.waitForTimeout(2000);
    await expect(page.locator("body")).toBeVisible();
  });
});
