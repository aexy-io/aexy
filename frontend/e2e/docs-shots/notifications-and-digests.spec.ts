/**
 * The screenshots in `docs/guides/notifications-and-digests.md`.
 *
 * The preference screen is the guide's subject: everything else the product
 * sends on a schedule is configured in its own module, and this is the one page
 * that answers "how do I stop this reaching me?".
 *
 * See `harness.ts` for the run command and the shared capture settings.
 */

import { expect, test } from "@playwright/test";

import { backendOnlyReady, setupAiLiveAuth } from "../fixtures/ai-env";
import { SHOT_CONTEXT, createShooter, forceLightTheme, ready } from "./harness";

const shooter = createShooter("notifications-and-digests");

test.describe("notification screenshots", () => {
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

  test("preferences — which channels reach you, per category", async ({
    page,
  }) => {
    await page.goto("/settings/notifications");
    await ready(page);

    // The viewport, not `main`. This page is one row per event type across
    // every module, so the element shot came out eleven thousand pixels tall —
    // a picture of a scrollbar. The top of it carries the part that matters:
    // the channels, and the first category's rows.
    await shooter.shoot(page, "preferences");
  });

  test.afterAll(() => shooter.report());
});
