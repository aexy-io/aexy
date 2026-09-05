/**
 * The screenshots in `docs/community.md`.
 *
 * Seeded by `backend/scripts/seed_community_demo.py --workspace <id>
 * --participation`, which publishes a community with three channels and a
 * thread that has a permalink.
 *
 * Both shots are of the **public** pages, signed out. That is the whole point
 * of the module — what a stranger sees — and photographing it signed in would
 * photograph the wrong thing.
 *
 * See `harness.ts` for the run command and the shared capture settings.
 */

import { expect, test } from "@playwright/test";

import { backendOnlyReady } from "../fixtures/ai-env";
import { SHOT_CONTEXT, createShooter, forceLightTheme, ready } from "./harness";

const shooter = createShooter("community");
const SLUG = process.env.AEXY_COMMUNITY_SLUG || "demo-workspace";

test.describe("community screenshots", () => {
  test.describe.configure({ mode: "default" });

  test.use(SHOT_CONTEXT);

  test.beforeAll(async () => {
    const probe = await backendOnlyReady();
    test.skip(!probe.ok, `docs screenshots need a live stack — ${probe.reason}`);
  });

  test.beforeEach(async ({ page }) => {
    // No auth bootstrap: these pages are for people who do not have accounts.
    await forceLightTheme(page);
  });

  test("public — the forum a stranger arrives at", async ({ page }) => {
    await page.goto(`/community/${SLUG}`);
    await ready(page, "main, body");

    // The *published* channel, not every channel the seed created. Publishing
    // is per channel, so a community's public page shows a subset of what the
    // workspace has — which is the thing the doc most needs to be clear about.
    await expect(
      page.getByRole("heading", { name: "Releases" }).first(),
    ).toBeVisible({ timeout: 20_000 });

    await shooter.shoot(page, "public");
  });

  test.afterAll(() => shooter.report());
});
