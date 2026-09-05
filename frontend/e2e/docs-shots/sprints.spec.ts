/**
 * The screenshots in `docs/sprints.md`.
 *
 * Seeded by `seed_marketing_demo.py --workspace <id>`: one project, one active
 * sprint, a five-column board and eight tasks spread across it.
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

const shooter = createShooter("sprints");
const WS = `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}`;

test.describe("sprint screenshots", () => {
  test.describe.configure({ mode: "default" });

  test.use(SHOT_CONTEXT);

  let projectId = "";
  let sprintId = "";

  test.beforeAll(async ({ request }) => {
    const probe = await backendOnlyReady();
    test.skip(!probe.ok, `docs screenshots need a live stack — ${probe.reason}`);

    const sprints = await request.get(`${WS}/sprints`, {
      headers: authHeaders(),
    });
    if (sprints.ok()) {
      const rows = (await sprints.json()) as { id: string; team_id: string }[];
      // `team_id` is the project: the sprint module keys off the project's own
      // team row, which shares its id. Reading `project_id` here returns
      // undefined and every navigation lands on /sprints/undefined.
      if (rows.length) {
        sprintId = rows[0].id;
        projectId = rows[0].team_id;
      }
    }
  });

  test.beforeEach(async ({ page }) => {
    await setupAiLiveAuth(page);
    await forceLightTheme(page);
  });

  test("the demo workspace has a sprint", async () => {
    test.skip(
      !sprintId,
      "no sprint — run seed_marketing_demo.py --workspace <id> first",
    );
    expect(sprintId).toBeTruthy();
  });

  test("board — the sprint in columns", async ({ page }) => {
    test.skip(!projectId, "no project");

    await page.goto(`/sprints/${projectId}/board`);
    await ready(page);
    await expect(page.getByText("Ship SSO for Northwind").first()).toBeVisible({
      timeout: 30_000,
    });

    await shooter.shoot(page, "board", "main");
  });

  test("backlog — what is not in a sprint yet", async ({ page }) => {
    test.skip(!projectId, "no project");

    await page.goto(`/sprints/${projectId}/backlog`);
    await ready(page);
    await shooter.shoot(page, "backlog", "main");
  });

  test("sprint — the sprint's own page", async ({ page }) => {
    test.skip(!sprintId, "no sprint");

    await page.goto(`/sprints/${projectId}/${sprintId}`);
    await ready(page);
    await expect(page.getByText("Sprint 24").first()).toBeVisible({
      timeout: 30_000,
    });

    await shooter.shoot(page, "sprint", "main");
  });

  test.afterAll(() => shooter.report());
});
