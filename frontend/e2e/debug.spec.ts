import { test, expect } from "@playwright/test";
import { mockUser, mockPreferences, mockInsights, mockSoftSkills } from "./fixtures/mock-data";

test("debug dashboard page load", async ({ page }) => {
  // Collect console messages
  const consoleMsgs: string[] = [];
  page.on("console", (msg) => {
    consoleMsgs.push(`[${msg.type()}] ${msg.text()}`);
  });

  // Collect page errors
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => {
    pageErrors.push(`${err.name}: ${err.message}`);
  });

  // Set auth token
  await page.addInitScript(() => {
    localStorage.setItem("token", "fake-test-token");
  });

  // Intercept ALL requests to the API
  await page.route("**/api/v1/**", (route) => {
    const url = route.request().url();

    if (url.includes("/developers/me")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockUser),
      });
    }
    if (url.includes("/dashboard/preferences")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockPreferences),
      });
    }
    if (url.includes("/analysis/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockInsights),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  // Navigate and wait for network idle
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  // Take screenshots
  await page.screenshot({ path: "e2e/debug-screenshot3.png", fullPage: true });

  // Check for critical elements
  const editLayoutCount = await page.getByText("Edit Layout").count();
  const doneCount = await page.getByText("Done", { exact: true }).count();
  const welcomeCount = await page.getByText("Welcome back").count();

  console.log("=== ELEMENT COUNTS ===");
  console.log("Edit Layout:", editLayoutCount);
  console.log("Done:", doneCount);
  console.log("Welcome back:", welcomeCount);

  // Get all button texts
  const buttons = await page.locator("button").allTextContents();
  console.log("All buttons:", buttons.filter(b => b.trim()));

  // Get all h1, h2, h3 text
  const headings = await page.locator("h1, h2, h3").allTextContents();
  console.log("All headings:", headings);

  // Get page errors
  console.log("PAGE ERRORS:", pageErrors.length, pageErrors.join(" | "));

  // Check console for relevant errors
  const errors = consoleMsgs.filter(m => m.includes("error") || m.includes("Error") || m.includes("Unhandled"));
  console.log("CONSOLE ERRORS:", errors.length, errors.join(" | "));

  // Check if specific widgets exist
  const quickStatsEl = await page.getByText("Avg PR Size").count();
  const langProfEl = await page.getByText("Language Proficiency").count();
  console.log("Quick Stats present:", quickStatsEl);
  console.log("Language Proficiency present:", langProfEl);

  // Check full visible text for debugging
  const bodyText = await page.locator("main, [class*='max-w-7xl']").first().textContent().catch(() => "NOT FOUND");
  console.log("Main content:", bodyText?.substring(0, 500));
});
