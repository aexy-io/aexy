/**
 * Smoke coverage for the marketing homepage. Runs against the dev server
 * (playwright.config.ts starts one when PLAYWRIGHT_BASE_URL is unset) and
 * needs no backend: everything asserted here is server-rendered marketing
 * HTML, structured data, or edge-middleware behavior.
 */

import { test, expect } from "@playwright/test";

test.describe("marketing homepage", () => {
  test("renders the hero and required anchor sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    for (const id of ["solutions", "platform", "agents", "mcp", "compare"]) {
      await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
    }
  });

  test("has an absolute title and homepage canonical", async ({ page }) => {
    await page.goto("/");
    const title = await page.title();
    expect(title).toContain("Aexy");
    // The layout template is "%s | Aexy"; the homepage must opt out of it.
    expect(title).not.toMatch(/\| Aexy$/);
    // Next normalizes the configured "https://aexy.io/" by dropping the
    // trailing slash.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://aexy.io"
    );
  });

  test("JSON-LD parses and the FAQPage matches the visible FAQ list", async ({ page }) => {
    await page.goto("/");
    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(blocks.length).toBeGreaterThan(0);

    let faqPage: { mainEntity: unknown[] } | undefined;
    for (const block of blocks) {
      const parsed = JSON.parse(block); // throws = test fails, which is the point
      const graph: Array<{ "@type"?: string; mainEntity?: unknown[] }> =
        parsed["@graph"] ?? [parsed];
      faqPage ??= graph.find((n) => n["@type"] === "FAQPage") as typeof faqPage;
    }
    expect(faqPage, "no FAQPage node in any JSON-LD block").toBeTruthy();

    // Every question advertised to crawlers must be visible on the page —
    // the structured data and the rendered FAQ are fed from one list, and
    // this catches the two drifting apart.
    const questions = (faqPage!.mainEntity as Array<{ name: string }>).map((q) => q.name);
    expect(questions.length).toBeGreaterThan(3);
    const headings = await page.locator("h3").allTextContents();
    const rendered = new Set(headings.map((t) => t.trim()));
    const missing = questions.filter((q) => !rendered.has(q));
    expect(missing, "FAQPage questions not rendered in the DOM").toEqual([]);
  });

  test("mobile menu opens and lists navigation", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.getByRole("button", { name: /toggle menu/i }).click();
    await expect(page.getByRole("link", { name: /get started/i })).toBeVisible();
  });

  test("authed visitors are redirected to /dashboard at the edge", async ({
    request,
    baseURL,
  }) => {
    // URL/redirect assertion only — no token, no backend. The middleware
    // redirects "/" to /dashboard purely on the aexy_authed presence cookie.
    const response = await request.get(baseURL ?? "http://localhost:3000", {
      headers: { cookie: "aexy_authed=1" },
      maxRedirects: 0,
    });
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    expect(response.headers()["location"]).toContain("/dashboard");
  });

  test("logged-out deep links bounce to the homepage with ?next=", async ({
    request,
    baseURL,
  }) => {
    const response = await request.get(`${baseURL ?? "http://localhost:3000"}/crm`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    const location = response.headers()["location"] ?? "";
    expect(location).toContain("next=");
  });
});
