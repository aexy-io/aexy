/**
 * The screenshots in `docs/guides/importing-data.md`.
 *
 * The routes that actually exist. There is deliberately no shot of a
 * Notion/Confluence archive import: that endpoint has no frontend at all — no
 * client method, no component — so the guide documents it as an API call and
 * says so, rather than illustrating a screen nobody can open.
 *
 * See `harness.ts` for the run command and the shared capture settings.
 */

import { expect, test } from "@playwright/test";

import { backendOnlyReady, setupAiLiveAuth } from "../fixtures/ai-env";
import { SHOT_CONTEXT, createShooter, forceLightTheme, ready } from "./harness";

const shooter = createShooter("importing-data");

test.describe("import screenshots", () => {
  test.describe.configure({ mode: "default" });

  test.use(SHOT_CONTEXT);

  test.beforeAll(async () => {
    const probe = await backendOnlyReady();
    test.skip(!probe.ok, `docs screenshots need a live stack — ${probe.reason}`);
  });

  test.beforeEach(async ({ page }) => {
    await setupAiLiveAuth(page);
    await forceLightTheme(page);
  });

  test("crm — the four ways records get in", async ({ page }) => {
    await page.goto("/crm/onboarding/import");
    await ready(page, "main, body");
    await expect(page.getByText("Import from CSV").first()).toBeVisible({
      timeout: 20_000,
    });

    await shooter.shoot(page, "crm");
  });

  test("gtm — a list of prospects", async ({ page }) => {
    await page.goto("/gtm/import");
    await ready(page, "main, body");

    await shooter.shoot(page, "gtm", "main");
  });

  test.afterAll(() => shooter.report());
});
