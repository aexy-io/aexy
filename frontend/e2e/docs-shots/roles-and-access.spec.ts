/**
 * The screenshots in `docs/guides/roles-and-access.md`.
 *
 * The access matrix and the department profiles behind it — the two screens
 * that answer "why can they open that and I cannot?".
 *
 * See `harness.ts` for the run command and the shared capture settings.
 */

import { expect, test } from "@playwright/test";

import { backendOnlyReady, setupAiLiveAuth } from "../fixtures/ai-env";
import { SHOT_CONTEXT, createShooter, forceLightTheme, ready } from "./harness";

const shooter = createShooter("roles-and-access");

test.describe("access screenshots", () => {
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

  test("matrix — who can open what", async ({ page }) => {
    await page.goto("/settings/access?tab=matrix");
    await ready(page);
    await expect(page.getByText("Priya Raman").first()).toBeVisible({
      timeout: 30_000,
    });

    await shooter.shoot(page, "matrix", "main");
  });

  test("profiles — the access a department carries", async ({ page }) => {
    await page.goto("/settings/access?tab=departments");
    await ready(page);
    await expect(page.getByText("Operations").first()).toBeVisible({
      timeout: 30_000,
    });

    await shooter.shoot(page, "profiles", "main");
  });

  test.afterAll(() => shooter.report());
});
