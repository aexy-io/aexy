/**
 * The screenshots in `docs/guides/workspace-setup.md`.
 *
 * An administrator's first hour: who is in the workspace, what each of them may
 * open, and which modules are switched on at all. Everything here is a settings
 * page against the seeded demo workspace — no writes, because a guide's
 * screenshots should not change the thing they are photographing.
 *
 * See `harness.ts` for the run command and the shared capture settings.
 */

import { expect, test } from "@playwright/test";

import { backendOnlyReady, setupAiLiveAuth } from "../fixtures/ai-env";
import { SHOT_CONTEXT, createShooter, forceLightTheme, ready } from "./harness";

const shooter = createShooter("workspace-setup");

test.describe("workspace setup screenshots", () => {
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

  test("members — who is in the workspace, and as what", async ({ page }) => {
    await page.goto("/settings/organization");
    await ready(page);

    await expect(page.getByText("Team Members").first()).toBeVisible({
      timeout: 20_000,
    });
    // A seeded colleague, so the shot is of a populated workspace rather than
    // of the section heading with a spinner under it.
    await expect(page.getByText("Priya Raman").first()).toBeVisible({
      timeout: 20_000,
    });

    await shooter.shoot(page, "members", "main");
  });

  test("invite — asking somebody to join", async ({ page }) => {
    await page.goto("/settings/organization");
    await ready(page);

    await page.getByRole("button", { name: /Invite Member/i }).first().click();

    // Anchored on the modal's own heading: this one is a plain overlay rather
    // than an ARIA dialog, so `getByRole("dialog")` matches nothing and the
    // shot times out on a modal that is plainly on screen.
    await expect(page.getByText("Invite Team Member").first()).toBeVisible({
      timeout: 10_000,
    });

    // The viewport, so the modal is shown over the page it belongs to.
    await shooter.shoot(page, "invite");
  });

  test.afterAll(() => shooter.report());
});
