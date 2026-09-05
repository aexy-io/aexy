/**
 * The screenshots in `docs/workflows-and-automations.md`.
 *
 * Seeded by `seed_marketing_demo.py --workspace <id>`: two automations, left
 * switched **off** — an automation somebody is still building should not be
 * firing on live records, and a demo that ships enabled ones is a demo that
 * acts on its own data.
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

const shooter = createShooter("workflows-and-automations");
const WS = `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}`;

test.describe("automation screenshots", () => {
  test.describe.configure({ mode: "default" });

  test.use(SHOT_CONTEXT);

  let automations = 0;

  test.beforeAll(async ({ request }) => {
    const probe = await backendOnlyReady();
    test.skip(!probe.ok, `docs screenshots need a live stack — ${probe.reason}`);

    const list = await request.get(`${WS}/automations`, {
      headers: authHeaders(),
    });
    automations = list.ok() ? ((await list.json()) as unknown[]).length : 0;
  });

  test.beforeEach(async ({ page }) => {
    await setupAiLiveAuth(page);
    await forceLightTheme(page);
  });

  test("the demo workspace has automations", async () => {
    test.skip(
      automations === 0,
      "no automations — run seed_marketing_demo.py --workspace <id> first",
    );
    expect(automations).toBeGreaterThan(0);
  });

  test("automations — rules, and whether they are live", async ({ page }) => {
    test.skip(automations === 0, "nothing to photograph");

    await page.goto("/automations");
    await ready(page);
    await expect(
      page.getByText("Uptime alert").first(),
    ).toBeVisible({ timeout: 20_000 });

    await shooter.shoot(page, "automations", "main");
  });

  test.afterAll(() => shooter.report());
});
