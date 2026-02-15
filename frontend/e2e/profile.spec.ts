import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE, mockUser } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Profile Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupCommonMocks(page);
    await page.goto("/profile");
    await page.waitForSelector("text=My Profile", { timeout: 45000 });
  });

  test("renders the page heading", async ({ page }) => {
    await expect(page.locator("h1").getByText("My Profile")).toBeVisible();
  });

  test("shows user name and email in profile card", async ({ page }) => {
    // Scope to main content to avoid sidebar duplicates
    const main = page.locator("main");
    await expect(main.getByText("Test Developer")).toBeVisible();
    await expect(main.getByText("test@example.com")).toBeVisible();
  });

  test("shows GitHub username link", async ({ page }) => {
    const main = page.locator("main");
    await expect(main.getByText("@testdev")).toBeVisible();
  });

  test("shows Work Patterns section", async ({ page }) => {
    await expect(page.getByText("Work Patterns")).toBeVisible();
    await expect(page.getByText("Peak Productivity Hours")).toBeVisible();
    await expect(page.getByText("Collaboration Style")).toBeVisible();
    await expect(page.getByText("Avg PR Size")).toBeVisible();
    await expect(page.getByText("Review Turnaround")).toBeVisible();
  });

  test("shows correct work pattern values", async ({ page }) => {
    await expect(page.getByText("collaborative")).toBeVisible();
    await expect(page.getByText("120 lines")).toBeVisible();
    await expect(page.getByText("4.5h")).toBeVisible();
  });

  test("shows Skill Fingerprint section with languages", async ({ page }) => {
    await expect(page.getByText("Skill Fingerprint")).toBeVisible();
    await expect(page.getByText("Languages")).toBeVisible();
    await expect(page.getByText("TypeScript")).toBeVisible();
    await expect(page.getByText("Python")).toBeVisible();
  });

  test("shows frameworks in skill fingerprint", async ({ page }) => {
    await expect(page.getByText("Frameworks")).toBeVisible();
    await expect(page.getByText("React")).toBeVisible();
    await expect(page.getByText("Next.js")).toBeVisible();
  });

  test("shows Quick Links section", async ({ page }) => {
    await expect(page.getByText("Quick Links")).toBeVisible();
    await expect(page.getByText("View Dashboard")).toBeVisible();
    await expect(page.getByText("Learning Path")).toBeVisible();
    await expect(page.locator("main").getByText("Settings")).toBeVisible();
  });

  test("quick links navigate to correct pages", async ({ page }) => {
    await expect(page.locator("a[href='/dashboard']").first()).toBeVisible();
    await expect(page.locator("a[href='/learning']").first()).toBeVisible();
    await expect(page.locator("a[href='/settings']").first()).toBeVisible();
  });
});
