/**
 * The screenshots in `docs/crm.md`.
 *
 * Seeded by `seed_marketing_demo.py --workspace <id>`: four companies, their
 * people, a pipeline of deals, and two automations left switched off.
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

const shooter = createShooter("crm");
const WS = `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}`;

test.describe("crm screenshots", () => {
  test.describe.configure({ mode: "default" });

  test.use(SHOT_CONTEXT);

  let objects: { slug: string }[] = [];

  test.beforeAll(async ({ request }) => {
    const probe = await backendOnlyReady();
    test.skip(!probe.ok, `docs screenshots need a live stack — ${probe.reason}`);

    const list = await request.get(`${WS}/crm/objects`, {
      headers: authHeaders(),
    });
    if (list.ok()) objects = (await list.json()) as { slug: string }[];
  });

  test.beforeEach(async ({ page }) => {
    await setupAiLiveAuth(page);
    await forceLightTheme(page);
  });

  test("the demo workspace has a CRM schema", async () => {
    test.skip(
      objects.length === 0,
      "no CRM objects — run seed_marketing_demo.py --workspace <id> first",
    );
    expect(objects.length).toBeGreaterThan(0);
  });

  test("records — a list of companies", async ({ page }) => {
    test.skip(!objects.some((o) => o.slug === "company"), "no company object");

    await page.goto("/crm/company");
    await ready(page);
    await expect(page.getByText("Northwind Traders").first()).toBeVisible({
      timeout: 30_000,
    });

    await shooter.shoot(page, "records", "main");
  });

  test("deals — the pipeline", async ({ page }) => {
    test.skip(!objects.some((o) => o.slug === "deal"), "no deal object");

    await page.goto("/crm/deal");
    await ready(page);
    await shooter.shoot(page, "deals", "main");
  });

  test("automations — rules that run on a record", async ({ page }) => {
    await page.goto("/crm/automations");
    await ready(page);
    await shooter.shoot(page, "automations", "main");
  });

  test.afterAll(() => shooter.report());
});
