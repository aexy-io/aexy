/**
 * The screenshots in `docs/forms.md`.
 *
 * Seeded by `seed_marketing_demo.py --workspace <id>`: three forms built from
 * the module's own templates, one of them deliberately inactive so the list
 * shows both states.
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

const shooter = createShooter("forms");
const WS = `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}`;

interface Form {
  id: string;
  name: string;
  is_active: boolean;
  public_url_token: string;
}

test.describe("forms screenshots", () => {
  test.describe.configure({ mode: "default" });

  test.use(SHOT_CONTEXT);

  let forms: Form[] = [];

  test.beforeAll(async ({ request }) => {
    const probe = await backendOnlyReady();
    test.skip(!probe.ok, `docs screenshots need a live stack — ${probe.reason}`);

    const list = await request.get(`${WS}/forms`, { headers: authHeaders() });
    if (list.ok()) forms = (await list.json()) as Form[];
  });

  test.beforeEach(async ({ page }) => {
    await setupAiLiveAuth(page);
    await forceLightTheme(page);
  });

  test("the demo workspace has forms", async () => {
    test.skip(
      forms.length === 0,
      "no forms — run seed_marketing_demo.py --workspace <id> first",
    );
    expect(forms.length).toBeGreaterThan(0);
  });

  test("list — the forms and whether they are live", async ({ page }) => {
    test.skip(forms.length === 0, "nothing to photograph");

    await page.goto("/forms");
    await ready(page);
    await expect(page.getByText("Talk to sales").first()).toBeVisible({
      timeout: 20_000,
    });

    await shooter.shoot(page, "list", "main");
  });

  test("builder — the fields, and where answers are routed", async ({ page }) => {
    const target = forms.find((f) => f.name === "Talk to sales") ?? forms[0];
    test.skip(!target, "no form to open");

    await page.goto(`/forms/${target.id}`);
    await ready(page);
    await shooter.shoot(page, "builder", "main");
  });

  test("public — what somebody outside the workspace fills in", async ({
    page,
  }) => {
    const target = forms.find((f) => f.is_active);
    test.skip(!target, "no active form");

    // No auth: a public form is the one page in this product that a stranger
    // is meant to reach, so photographing it signed in would be photographing
    // the wrong thing.
    await page.goto(`/public/forms/${target.public_url_token}`);
    await ready(page, "form, body");

    await shooter.shoot(page, "public");
  });

  test.afterAll(() => shooter.report());
});
