import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

async function setupDocsMocks(page: Page) {
  await setupCommonMocks(page);

  // Document templates
  await page.route(`${API_BASE}/workspaces/ws-1/documents/templates**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Documents tree
  await page.route(`${API_BASE}/workspaces/ws-1/documents/tree**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Documents favorites
  await page.route(`${API_BASE}/workspaces/ws-1/documents/favorites**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

test.describe("Documentation Page — Overview", () => {
  test.beforeEach(async ({ page }) => {
    await setupDocsMocks(page);
    await page.goto("/docs");
    await page.waitForSelector("text=Documentation", { timeout: 45000 });
  });

  test("renders the documentation page with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Documentation" })).toBeVisible();
    await expect(page.getByText("Create, organize, and auto-generate documentation from your code")).toBeVisible();
  });

  test("shows quick action cards", async ({ page }) => {
    await expect(page.getByText("Blank Document")).toBeVisible();
    await expect(page.getByText("API Documentation")).toBeVisible();
    await expect(page.getByText("README")).toBeVisible();
    await expect(page.getByText("Generate from Code")).toBeVisible();
  });

  test("quick action cards show descriptions", async ({ page }) => {
    await expect(page.getByText("Start with an empty page")).toBeVisible();
    await expect(page.getByText("Document your API endpoints")).toBeVisible();
    await expect(page.getByText("Project overview and setup")).toBeVisible();
    await expect(page.getByText("AI-powered documentation")).toBeVisible();
  });

  test("Generate from Code opens modal", async ({ page }) => {
    await page.locator("button", { hasText: "Generate from Code" }).click();
    await expect(page.getByText("Generate Documentation").first()).toBeVisible();
    // Modal shows Documentation Type selector and Source Code input
    await expect(page.getByText("Documentation Type")).toBeVisible();
    await expect(page.getByText("Source Code")).toBeVisible();
  });

  test("Generate modal has documentation type and language selectors", async ({ page }) => {
    await page.getByText("Generate from Code").click();
    await expect(page.getByText("Documentation Type")).toBeVisible();
    await expect(page.getByText("Language")).toBeVisible();
    await expect(page.getByText("Source Code")).toBeVisible();
  });

  test("Generate modal can be closed with Cancel", async ({ page }) => {
    await page.locator("button", { hasText: "Generate from Code" }).click();
    await expect(page.getByText("Generate Documentation").first()).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Paste code or select from repository")).not.toBeVisible();
  });

  test("shows help text at bottom", async ({ page }) => {
    await expect(page.getByText("Select a document from the sidebar")).toBeVisible();
  });
});
