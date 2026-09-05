/**
 * The screenshots in `docs/leave.md`.
 *
 * Seeded by `seed_marketing_demo.py --workspace <id>`: three leave types with
 * policies, a holiday calendar, and three requests — one of them left pending
 * on purpose, because an approvals queue with nothing in it photographs as a
 * module nobody uses.
 *
 * The tabs are URL-addressable (`?tab=`), so each shot navigates rather than
 * clicking through the previous one's state.
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

const shooter = createShooter("leave");
const WS = `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}`;

test.describe("leave screenshots", () => {
  test.describe.configure({ mode: "default" });

  test.use(SHOT_CONTEXT);

  let requests = 0;

  test.beforeAll(async ({ request }) => {
    const probe = await backendOnlyReady();
    test.skip(!probe.ok, `docs screenshots need a live stack — ${probe.reason}`);

    const list = await request.get(`${WS}/leave/requests`, {
      headers: authHeaders(),
    });
    requests = list.ok() ? ((await list.json()) as unknown[]).length : 0;
  });

  test.beforeEach(async ({ page }) => {
    await setupAiLiveAuth(page);
    await forceLightTheme(page);
  });

  test("the demo workspace has leave data", async () => {
    test.skip(
      requests === 0,
      "no leave requests — run seed_marketing_demo.py --workspace <id> first",
    );
    expect(requests).toBeGreaterThan(0);
  });

  test("my-leaves — balances and what I have booked", async ({ page }) => {
    test.skip(requests === 0, "nothing to photograph");

    await page.goto("/leave?tab=my-leaves");
    await ready(page);
    await expect(page.getByText("Annual leave").first()).toBeVisible({
      timeout: 20_000,
    });

    await shooter.shoot(page, "my-leaves", "main");
  });

  test("approvals — a decision waiting", async ({ page }) => {
    test.skip(requests === 0, "nothing to approve");

    await page.goto("/leave?tab=approvals");
    await ready(page);
    await shooter.shoot(page, "approvals", "main");
  });

  test("settings — types, policies and the holiday calendar", async ({ page }) => {
    await page.goto("/leave?tab=settings");
    await ready(page);
    await expect(page.getByText("Sick leave").first()).toBeVisible({
      timeout: 20_000,
    });

    await shooter.shoot(page, "settings", "main");
  });

  test.afterAll(() => shooter.report());
});
