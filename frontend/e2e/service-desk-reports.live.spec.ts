import { test, expect, APIRequestContext } from "@playwright/test";
import fs from "fs";

/**
 * The reporting feature against the LIVE stack — real backend, real Postgres,
 * a real seeded desk. No route mocks anywhere, which is the whole point: both
 * 422s that reached review were in requests the mocked suite never sent.
 *
 * Idempotent by construction. It resets the workspace's scorecard config before
 * each run, because the builder test genuinely writes to the database and a
 * live suite that only passes on a fresh database is not a suite.
 *
 * Run it with:
 *
 *   docker compose up -d postgres redis backend
 *   docker exec aexy-backend python scripts/run_migrations.py
 *   AEXY_TEST_TOKEN=<jwt> AEXY_TEST_WORKSPACE_ID=<uuid> \
 *     PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *     npx playwright test e2e/service-desk-reports.live.spec.ts
 *
 * The desk it points at needs tickets with a pending ledger; the TAT assertions
 * below name specific figures from the seed described in the plan doc.
 */

// Opt-in: skipped unless a live stack and a seeded desk are pointed at it, so
// the mocked suite still runs on its own. See the header comment for setup.
const TOKEN = process.env.AEXY_TEST_TOKEN ?? readTokenFile();
const WS = process.env.AEXY_TEST_WORKSPACE_ID ?? "";

function readTokenFile(): string {
  try {
    return fs.readFileSync("/tmp/e2e_token.txt", "utf8").trim();
  } catch {
    return "";
  }
}

test.skip(!TOKEN || !WS, "needs AEXY_TEST_TOKEN and AEXY_TEST_WORKSPACE_ID against a live stack");
const API = `http://localhost:8000/api/v1/workspaces/${WS}/service-desk`;
const AUTH = { Authorization: `Bearer ${TOKEN}` };

/** Drop every custom KPI and put the built-in weights back. */
async function resetScorecard(request: APIRequestContext) {
  const config = await (await request.get(`${API}/reports/scorecard/config`, { headers: AUTH })).json();
  const builtins = config.kpis
    .filter((k: { source: string }) => k.source !== "custom")
    .map(({ unit: _u, definition_version: _v, ...k }: Record<string, unknown>) => k);
  const defaults: Record<string, number> = {
    productivity: 0.2, first_response: 0.2, handshake_efficiency: 0.2,
    owner_attributable_tat: 0.15, zero_breach: 0.15, not_reopened: 0.1,
  };
  for (const k of builtins) {
    k.weight = defaults[k.metric_key as string] ?? k.weight;
    k.enabled = true;
    k.status = "published";
  }
  const r = await request.put(`${API}/reports/scorecard/config`, {
    headers: AUTH,
    data: { kpis: builtins, bands: config.bands },
  });
  expect(r.status()).toBe(200);
}

test.beforeEach(async ({ page, request }) => {
  await resetScorecard(request);
  await page.addInitScript(([t, w]) => {
    localStorage.setItem("token", t as string);
    localStorage.setItem("current_workspace_id", w as string);
  }, [TOKEN, WS]);
});

test("TAT report renders live tickets with the desk's own columns", async ({ page }) => {
  await page.goto("/service-desk/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 30000 });

  // Terminology resolved from the workspace, not a template default — this
  // desk calls a product a Line of Business and a vendor an Insurer.
  await expect(page.getByRole("columnheader", { name: "Line of Business" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Insurer (hrs)" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Total Handshakes" })).toBeVisible();
  await expect(page.getByText("SD-1")).toBeVisible();

  // The wall-clock / working-time split, on one live row. SD-3 sat 30 wall
  // hours with the insurer across a 09:30-18:30 shift, which is 14 working
  // hours; its overall TAT is 34 hours because that is what the requester
  // actually waited. Two different clocks, both correct, in the same row.
  const sd3 = page.locator("tr").filter({ hasText: "SD-3" });
  const cells = (await sd3.innerText()).split("\t");
  expect(cells).toContain("14"); // Insurer (hrs) — working
  expect(cells).toContain("34"); // Overall TAT (hrs) — elapsed
  await page.screenshot({ path: "/tmp/live-tat.png", fullPage: true });
});

test("the scorecard grades the real owners", async ({ page }) => {
  await page.goto("/service-desk/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Scorecard" }).click();

  await expect(page.getByRole("cell", { name: "Dana", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Rowan", exact: true })).toBeVisible();
  await expect(page.getByText(/compared across 2 owners/i)).toBeVisible();
  // Rowan's reopened ticket is the only one on the desk, so Not Reopened is 0%
  // for them — a real figure off real segments rather than a fixture.
  await expect(page.getByRole("columnheader", { name: "Not Reopened" })).toBeVisible();
  await page.screenshot({ path: "/tmp/live-scorecard.png", fullPage: true });
});

test("a custom KPI goes from builder to live score", async ({ page }) => {
  await page.goto("/settings/service-desk/scorecard");
  await page.getByRole("button", { name: "Add custom KPI" }).click();
  await page.getByPlaceholder("e.g. Escalation rate").fill("Escalation rate");

  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Add condition" }).first().click();
  await dialog.locator("select").nth(1).selectOption("handshakes");
  await dialog.locator("select").nth(2).selectOption("gt");
  await dialog.locator('input[type="number"]').first().fill("2");

  // The flow that used to 422: preview with nothing rebalanced, weights at 1.1.
  await page.getByRole("button", { name: "Run preview" }).click();
  await expect(dialog.getByText(/This changes/i)).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: "/tmp/live-builder.png" });

  await page.getByRole("button", { name: "Publish" }).click();
  // Now the save-time invariant does bite, and says so.
  await expect(page.getByText(/Total weight: Must total 100%/i)).toBeVisible();
  await page.getByRole("spinbutton").first().fill("0.1");
  await expect(page.getByText(/Total weight: Totals 100%/i)).toBeVisible();
  await page.getByRole("button", { name: "Save scorecard" }).click();

  // Survived the round trip: only a stored row with source="custom" renders this.
  await page.reload();
  await expect(page.getByText(/A custom KPI built from this desk/i)).toBeVisible({ timeout: 30000 });

  // And it is now scoring on the report, computed from real segments.
  await page.goto("/service-desk/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Scorecard" }).click();
  await expect(page.getByRole("columnheader", { name: "Escalation rate" })).toBeVisible();
  await page.screenshot({ path: "/tmp/live-scorecard-custom.png", fullPage: true });
});

test("the TAT export downloads the report as CSV", async ({ page }) => {
  await page.goto("/service-desk/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 30000 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.csv$/);
});
