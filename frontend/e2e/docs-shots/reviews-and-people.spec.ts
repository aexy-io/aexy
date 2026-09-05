/**
 * The screenshots in `docs/reviews-and-people.md`.
 *
 * Seeded by `seed_marketing_demo.py --workspace <id>`: one active quarterly
 * cycle with its three deadlines, and an individual review inside it.
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

const shooter = createShooter("reviews-and-people");

test.describe("reviews screenshots", () => {
  test.describe.configure({ mode: "default" });

  test.use(SHOT_CONTEXT);

  let cycles = 0;

  test.beforeAll(async ({ request }) => {
    const probe = await backendOnlyReady();
    test.skip(!probe.ok, `docs screenshots need a live stack — ${probe.reason}`);

    // Reviews are mounted under `/reviews/workspaces/{id}`, not under
    // `/workspaces/{id}/reviews` like most modules — the workspace id is a path
    // segment inside the module's own prefix.
    const list = await request.get(
      `${API_BASE}/reviews/workspaces/${REAL_BACKEND_WORKSPACE_ID}/cycles`,
      { headers: authHeaders() },
    );
    cycles = list.ok() ? ((await list.json()) as unknown[]).length : 0;
  });

  test.beforeEach(async ({ page }) => {
    await setupAiLiveAuth(page);
    await forceLightTheme(page);
  });

  test("the demo workspace has a review cycle", async () => {
    test.skip(
      cycles === 0,
      "no cycles — run seed_marketing_demo.py --workspace <id> first",
    );
    expect(cycles).toBeGreaterThan(0);
  });

  test("cycles — a review period and its deadlines", async ({ page }) => {
    test.skip(cycles === 0, "nothing to photograph");

    await page.goto("/reviews/cycles");
    await ready(page);
    await expect(page.getByText("Q3 Engineering Reviews").first()).toBeVisible({
      timeout: 30_000,
    });

    await shooter.shoot(page, "cycles", "main");
  });

  test("goals — what somebody is working towards", async ({ page }) => {
    await page.goto("/reviews/goals");
    await ready(page);
    await shooter.shoot(page, "goals", "main");
  });

  test.afterAll(() => shooter.report());
});
