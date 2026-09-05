/**
 * The screenshots in `docs/guides/email-setup.md`.
 *
 * Mail leaving the workspace and mail arriving at it are configured in
 * different places, which is most of why the guide exists. The inbound half is
 * illustrated with the Service Desk's own mailbox page — the guide references
 * that image rather than taking a second copy of it.
 *
 * These pages are photographed **unconfigured**, on purpose: a reader opening
 * this guide has not set them up yet, and a screenshot of somebody else's
 * verified domain does not show them what they are about to see.
 *
 * See `harness.ts` for the run command and the shared capture settings.
 */

import { expect, test } from "@playwright/test";

import { backendOnlyReady, setupAiLiveAuth } from "../fixtures/ai-env";
import { SHOT_CONTEXT, createShooter, forceLightTheme, ready } from "./harness";

const shooter = createShooter("email-setup");

test.describe("email setup screenshots", () => {
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

  test("sending — the domain outbound mail is sent from", async ({ page }) => {
    await page.goto("/settings/email-marketing");
    await ready(page);

    await shooter.shoot(page, "sending", "main");
  });

  // No shot of `/settings/email-delivery`. On a workspace without the
  // Enterprise plan that page is an upgrade prompt, and a picture of a paywall
  // teaches a reader nothing about setting up email. The guide describes what
  // the page is for and says which plan it needs.

  test("connected-accounts — the mailboxes Aexy can read", async ({ page }) => {
    await page.goto("/settings/connected-accounts");
    await ready(page);
    await shooter.shoot(page, "connected-accounts", "main");
  });

  test.afterAll(() => shooter.report());
});
