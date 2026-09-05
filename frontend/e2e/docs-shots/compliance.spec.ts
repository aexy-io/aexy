/**
 * The screenshots in `docs/compliance.md`.
 *
 * Seeded by `seed_marketing_demo.py --workspace <id>`: three mandatory
 * trainings — two recurring, one once — and three certifications the workspace
 * tracks the expiry of.
 *
 * The assignments are seeded with a deliberate spread — one in progress, one
 * overdue, one not started, one complete. A workspace where every training
 * reads "0 assigned" photographs as a module nobody uses, and one where
 * everything is complete photographs as a module with nothing to do.
 *
 * See `harness.ts` for the run command and the shared capture settings.
 */

import { expect, test } from "@playwright/test";

import { backendOnlyReady, setupAiLiveAuth } from "../fixtures/ai-env";
import { SHOT_CONTEXT, createShooter, forceLightTheme, ready } from "./harness";

const shooter = createShooter("compliance");

test.describe("compliance screenshots", () => {
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

  test("training — what everybody has to do", async ({ page }) => {
    await page.goto("/compliance/training");
    await ready(page);
    await expect(
      page.getByText("Information security basics").first(),
    ).toBeVisible({ timeout: 20_000 });

    await shooter.shoot(page, "training", "main");
  });

  test("certifications — what the workspace tracks the expiry of", async ({
    page,
  }) => {
    await page.goto("/compliance/certifications");
    await ready(page);
    await expect(page.getByText("First Aid at Work").first()).toBeVisible({
      timeout: 20_000,
    });

    await shooter.shoot(page, "certifications", "main");
  });

  test.afterAll(() => shooter.report());
});
