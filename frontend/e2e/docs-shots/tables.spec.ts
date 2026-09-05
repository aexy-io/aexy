/**
 * The screenshots in `docs/tables.md`.
 *
 * Seeded by `seed_marketing_demo.py --workspace <id>`: one standalone table —
 * a contract renewal tracker — with four typed fields and three rows.
 *
 * The seed exists because the module lists standalone tables *and* the CRM's
 * objects, so a workspace whose only tables are Company, Person, Deal and Lead
 * photographs as a CRM rather than as what this module is for.
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

const shooter = createShooter("tables");
const WS = `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}`;

test.describe("tables screenshots", () => {
  test.describe.configure({ mode: "default" });

  test.use(SHOT_CONTEXT);

  let tableId = "";

  test.beforeAll(async ({ request }) => {
    const probe = await backendOnlyReady();
    test.skip(!probe.ok, `docs screenshots need a live stack — ${probe.reason}`);

    const list = await request.get(`${WS}/tables?scope=standalone`, {
      headers: authHeaders(),
    });
    if (list.ok()) {
      const rows = (await list.json()) as { id: string; name: string }[];
      tableId = rows.find((t) => t.name === "Contracts")?.id ?? "";
    }
  });

  test.beforeEach(async ({ page }) => {
    await setupAiLiveAuth(page);
    await forceLightTheme(page);
  });

  test("the demo workspace has a table of its own", async () => {
    test.skip(
      !tableId,
      "no standalone table — run seed_marketing_demo.py --workspace <id> first",
    );
    expect(tableId).toBeTruthy();
  });

  test("list — tables, including the CRM's own", async ({ page }) => {
    await page.goto("/tables");
    await ready(page);
    await expect(page.getByText("Contracts").first()).toBeVisible({
      timeout: 20_000,
    });

    await shooter.shoot(page, "list", "main");
  });

  test("grid — typed columns and rows", async ({ page }) => {
    test.skip(!tableId, "no table to open");

    await page.goto(`/tables/${tableId}`);
    await ready(page);
    await expect(page.getByText("Northwind Cloud").first()).toBeVisible({
      timeout: 20_000,
    });

    await shooter.shoot(page, "grid", "main");
  });

  test.afterAll(() => shooter.report());
});
