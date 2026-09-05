/**
 * The screenshots in `docs/reports.md`.
 *
 * Two reports created from the module's own templates. Templates rather than
 * hand-built definitions, because the templates are what a workspace actually
 * starts from and a two-widget report of my own invention would show less.
 *
 * See `harness.ts` for the run command and the shared capture settings.
 */

import { expect, test } from "@playwright/test";

import {
  API_BASE,
  authHeaders,
  backendOnlyReady,
  setupAiLiveAuth,
  REAL_BACKEND_WORKSPACE_ID,
} from "../fixtures/ai-env";
import { SHOT_CONTEXT, createShooter, forceLightTheme, ready } from "./harness";

const shooter = createShooter("reports");

test.describe("reports screenshots", () => {
  test.describe.configure({ mode: "default" });

  test.use(SHOT_CONTEXT);

  let reports = 0;

  test.beforeAll(async ({ request }) => {
    const probe = await backendOnlyReady();
    test.skip(!probe.ok, `docs screenshots need a live stack — ${probe.reason}`);

    // Workspace-scoped as of 0.36. It used to be mounted at the API root and
    // scoped by creator, which is what kept the module out of reach of the app
    // toggle; the old path now 404s, and a spec still pointed at it would skip
    // itself quietly rather than fail.
    const list = await request.get(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}/reports`,
      { headers: authHeaders() },
    );
    reports = list.ok() ? ((await list.json()) as unknown[]).length : 0;
  });

  test.beforeEach(async ({ page }) => {
    await setupAiLiveAuth(page);
    await forceLightTheme(page);
  });

  test("the demo workspace has reports", async () => {
    test.skip(reports === 0, "no reports — create one from a template first");
    expect(reports).toBeGreaterThan(0);
  });

  test("list — the reports a workspace keeps", async ({ page }) => {
    test.skip(reports === 0, "nothing to photograph");

    await page.goto("/reports");
    await ready(page);
    await expect(page.getByText("Weekly Team Report").first()).toBeVisible({
      timeout: 20_000,
    });

    await shooter.shoot(page, "list", "main");
  });

  test.afterAll(() => shooter.report());
});
