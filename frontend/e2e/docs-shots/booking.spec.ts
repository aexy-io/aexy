/**
 * The screenshots in `docs/booking.md`.
 *
 * Seeded by `seed_marketing_demo.py --workspace <id>`: three meeting types of
 * different lengths, locations and notice periods.
 *
 * Availability is deliberately *not* seeded — it comes from a connected
 * calendar, which a seed cannot fake. The availability screen therefore
 * photographs as a workspace that has not connected one, which is the state a
 * reader of this guide is actually in.
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

const shooter = createShooter("booking");
const WS = `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}`;

test.describe("booking screenshots", () => {
  test.describe.configure({ mode: "default" });

  test.use(SHOT_CONTEXT);

  let eventTypes = 0;

  test.beforeAll(async ({ request }) => {
    const probe = await backendOnlyReady();
    test.skip(!probe.ok, `docs screenshots need a live stack — ${probe.reason}`);

    const list = await request.get(`${WS}/booking/event-types`, {
      headers: authHeaders(),
    });
    if (list.ok()) {
      const body = (await list.json()) as { total?: number };
      eventTypes = body.total ?? 0;
    }
  });

  test.beforeEach(async ({ page }) => {
    await setupAiLiveAuth(page);
    await forceLightTheme(page);
  });

  test("the demo workspace has meeting types", async () => {
    test.skip(
      eventTypes === 0,
      "no event types — run seed_marketing_demo.py --workspace <id> first",
    );
    expect(eventTypes).toBeGreaterThan(0);
  });

  test("event-types — what people can book", async ({ page }) => {
    test.skip(eventTypes === 0, "nothing to photograph");

    await page.goto("/booking/event-types");
    await ready(page);
    await expect(page.getByText("Product walkthrough").first()).toBeVisible({
      timeout: 20_000,
    });

    await shooter.shoot(page, "event-types", "main");
  });

  test("availability — the hours the slots come from", async ({ page }) => {
    await page.goto("/booking/availability");
    await ready(page);
    await shooter.shoot(page, "availability", "main");
  });

  test.afterAll(() => shooter.report());
});
