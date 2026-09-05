/**
 * The screenshots in `docs/dashboard.md`.
 *
 * Both dashboards, because the module's own documentation had to open by
 * explaining that they are two different pages: `/dashboard` is the personal
 * work list and `/dashboard/overview` is the configurable widget grid.
 *
 * See `harness.ts` for the run command and the shared capture settings.
 */

import { expect, test } from "@playwright/test";

import { backendOnlyReady, setupAiLiveAuth } from "../fixtures/ai-env";
import { SHOT_CONTEXT, createShooter, forceLightTheme, ready } from "./harness";

const shooter = createShooter("dashboard");

test.describe("dashboard screenshots", () => {
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

  test("my-work — what is on my plate", async ({ page }) => {
    await page.goto("/dashboard");
    await ready(page);

    // The queue widget, not just the greeting: the page renders its heading
    // immediately and fills in afterwards.
    await expect(page.getByTestId("my-work-queue")).toBeVisible({
      timeout: 30_000,
    });
    await shooter.shoot(page, "my-work", "main");
  });

  /**
   * The grid starts empty and stays empty until somebody picks a starting
   * layout — a "Welcome" dialog offers one per role, and until it is answered
   * the page is a placeholder reading "Your dashboard is empty".
   *
   * Answering it is part of what the doc describes, so the shots answer it
   * rather than photographing the placeholder. It is a one-time choice stored
   * against the user, so this is a no-op on every run after the first.
   */
  async function chooseLayoutIfAsked(page: import("@playwright/test").Page) {
    const welcome = page.getByRole("dialog", { name: "Welcome" });
    if (await welcome.isVisible().catch(() => false)) {
      await welcome
        .getByRole("button", { name: /Engineering Manager/ })
        .click();
      await page.waitForTimeout(1_500);
    }
  }

  test("overview — the widget grid", async ({ page }) => {
    await page.goto("/dashboard/overview");
    await ready(page);
    await chooseLayoutIfAsked(page);

    // An empty grid is a legitimate state of this page and a useless picture of
    // it, so fail rather than photograph the placeholder.
    await expect(page.getByText(/Your dashboard is empty/)).toHaveCount(0);

    // Each widget fetches for itself, so the grid arrives in pieces. Waiting on
    // one that renders a number means the shot is of a dashboard rather than of
    // a page mid-load.
    await expect(page.getByText("Sprint Burndown").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(2_500);

    // The viewport, not `main`. This grid scrolls for several screens and the
    // element shot came out four thousand pixels tall — mostly empty, with the
    // widgets a strip along the top. What a reader needs is what the page looks
    // like when it opens.
    await shooter.shoot(page, "overview");
  });

  test("customize — choosing what is on it", async ({ page }) => {
    await page.goto("/dashboard/overview");
    await ready(page);
    await chooseLayoutIfAsked(page);

    await page.getByRole("button", { name: "Customize" }).first().click();
    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await shooter.shoot(page, "customize", '[role="dialog"]');
  });

  test.afterAll(() => shooter.report());
});
