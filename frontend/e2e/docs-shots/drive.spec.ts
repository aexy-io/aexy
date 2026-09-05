/**
 * The screenshots in `docs/drive.md`.
 *
 * Files are uploaded by hand into the demo workspace rather than seeded in
 * Python: an upload goes through the object store, and a seeder that inserts
 * rows without the bytes produces a Drive whose every file fails to open.
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

const shooter = createShooter("drive");
const WS = `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}`;

test.describe("drive screenshots", () => {
  test.describe.configure({ mode: "default" });

  test.use(SHOT_CONTEXT);

  let files = 0;

  test.beforeAll(async ({ request }) => {
    const probe = await backendOnlyReady();
    test.skip(!probe.ok, `docs screenshots need a live stack — ${probe.reason}`);

    const list = await request.get(`${WS}/drive/files`, {
      headers: authHeaders(),
    });
    if (list.ok()) files = ((await list.json()) as { total: number }).total;
  });

  test.beforeEach(async ({ page }) => {
    await setupAiLiveAuth(page);
    await forceLightTheme(page);
  });

  test("the demo workspace has files", async () => {
    test.skip(files === 0, "no files in Drive — upload a few first");
    expect(files).toBeGreaterThan(0);
  });

  test("files — what is in the workspace's drive", async ({ page }) => {
    test.skip(files === 0, "nothing to photograph");

    await page.goto("/docs/drive");
    await ready(page);
    await expect(page.getByText("Q3 board pack.md").first()).toBeVisible({
      timeout: 20_000,
    });

    await shooter.shoot(page, "files", "main");
  });

  test.afterAll(() => shooter.report());
});
