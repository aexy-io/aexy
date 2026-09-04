/**
 * The screenshots in `docs/organization.md`, taken from the running app.
 *
 * Seeded by `backend/scripts/seed_marketing_demo.py --workspace <id>`, which
 * builds the demo workspace's departments, memberships, open seats and
 * reporting lines through `OrganizationService` — so what is photographed here
 * is the same structure the Service Desk reads when it decides who may see a
 * ticket.
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

const shooter = createShooter("organization");
const ORG = `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}/organization`;

test.describe("organization screenshots", () => {
  test.describe.configure({ mode: "default" });

  test.use(SHOT_CONTEXT);

  let departments = 0;

  test.beforeAll(async ({ request }) => {
    const probe = await backendOnlyReady();
    test.skip(!probe.ok, `docs screenshots need a live stack — ${probe.reason}`);

    const list = await request.get(`${ORG}/departments`, {
      headers: authHeaders(),
    });
    departments = list.ok() ? ((await list.json()) as unknown[]).length : 0;
  });

  test.beforeEach(async ({ page }) => {
    await setupAiLiveAuth(page);
    await forceLightTheme(page);
  });

  test("the demo workspace has an org structure", async () => {
    test.skip(
      departments === 0,
      "no departments — run seed_marketing_demo.py --workspace <id> first",
    );
    expect(departments).toBeGreaterThan(0);
  });

  test("org-chart — departments, their heads and their headcount", async ({
    page,
  }) => {
    test.skip(departments === 0, "nothing to chart");

    await page.goto("/organization");
    await ready(page);

    // A named department, not just the page frame: the chart renders its
    // heading while the tree is still loading, and the empty state says
    // "No departments yet" — which is a screenshot that would tell the reader
    // the opposite of what the page is for.
    await expect(page.getByText("Operations").first()).toBeVisible({
      timeout: 20_000,
    });
    await shooter.shoot(page, "org-chart", "main");
  });

  test("departments — the table the structure is edited in", async ({ page }) => {
    test.skip(departments === 0, "nothing to show");

    await page.goto("/organization/departments");
    await ready(page);
    await expect(page.getByText("Claims").first()).toBeVisible({
      timeout: 20_000,
    });

    await shooter.shoot(page, "departments", "main");
  });

  test("directory — everybody, including whoever is in no department", async ({
    page,
  }) => {
    test.skip(departments === 0, "nothing to list");

    await page.goto("/organization/directory");
    await ready(page);
    // Matched on the address rather than the name. Every person on this page
    // also appears inside the "Reports to" pickers, and an <option> in a closed
    // select is in the accessibility tree but not visible — so a name locator
    // waits thirty seconds for a dropdown entry that will never be shown.
    await expect(
      page.getByText("priya.raman@northwind.example").first(),
    ).toBeVisible({ timeout: 20_000 });

    await shooter.shoot(page, "directory", "main");
  });

  test.afterAll(() => shooter.report());
});
