/**
 * E2E: the secrets settings page, driven through the browser.
 *
 * The API guarantees are covered by ai-automation-secrets.spec.ts. What this
 * file is for is the surface an author actually touches, and specifically the
 * thing it must *not* grow: a reveal button. The API has no read path, so a UI
 * that appeared to offer one would either be broken or would mean someone had
 * added the endpoint — and the page is where that would show up first.
 *
 * So the assertions here are mostly about absence: the value never reaches the
 * DOM, and no control offers to show it.
 *
 * Live backend + frontend, no LLM.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  API_BASE,
  REAL_BACKEND_WORKSPACE_ID,
  authHeaders,
  backendOnlyReady,
  setupAiLiveAuth,
} from "./fixtures/ai-env";

test.describe.configure({ timeout: 180_000 });

const SECRET_VALUE = "sk-live-ui-must-never-be-rendered";

function secretsUrl(path = ""): string {
  return `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}/secrets${path}`;
}

async function openSecretsPage(page: Page): Promise<void> {
  await setupAiLiveAuth(page);
  await page.goto("/settings/workflow-secrets");
  await expect(
    page.getByRole("heading", { name: "Workflow Secrets" }),
  ).toBeVisible({ timeout: 60_000 });
}

test.describe("AI / Workflow secrets UI (live)", () => {
  const created: string[] = [];

  test.beforeEach(async () => {
    const ready = await backendOnlyReady();
    test.skip(!ready.ok, ready.reason);
  });

  test.afterEach(async ({ request }) => {
    while (created.length) {
      const name = created.pop();
      if (name) {
        await request
          .delete(secretsUrl(`/${name}`), { headers: authHeaders() })
          .catch(() => undefined);
      }
    }
  });

  test("an author can add a secret and never sees it again", async ({
    page,
  }) => {
    const name = `E2E_UI_${Date.now()}`;
    created.push(name);

    await openSecretsPage(page);

    await page.getByRole("button", { name: "Add secret" }).click();
    await page.getByPlaceholder("STRIPE_API_KEY").fill(name);
    await page.getByPlaceholder("Paste the credential").fill(SECRET_VALUE);
    await page.getByRole("button", { name: "Save secret" }).click();

    // It appears in the list…
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    // …and the value is nowhere in the rendered markup. Not in a data
    // attribute, not in a hidden input, not in the react payload.
    expect(
      await page.content(),
      "the secret value reached the DOM",
    ).not.toContain(SECRET_VALUE);

    // page.content() would not catch it either way: fill() sets a DOM
    // property, not an attribute, so a form that kept the credential in a
    // live input would pass the check above while the value sat in the page
    // for the rest of the session. Read the properties too.
    const liveValues = await page
      .locator("input, textarea")
      .evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLInputElement).value ?? ""),
      );
    expect(
      liveValues,
      "an input still holds the credential after saving",
    ).not.toContain(SECRET_VALUE);
  });

  test("the page offers the reference, not the value", async ({ page }) => {
    // The useful thing to hand an author is the string they paste into a step.
    const name = `E2E_UI_REF_${Date.now()}`;
    created.push(name);
    await page.request.post(secretsUrl(), {
      headers: authHeaders(),
      data: { name, value: SECRET_VALUE },
    });

    await openSecretsPage(page);

    await expect(
      page.getByText(`{{secrets.${name}}}`, { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("there is no control that reveals a value", async ({ page }) => {
    // The guarantee is an absence, so this looks for one rather than trusting
    // that nobody adds it. If a reveal path is ever built, this fails here
    // before it ships.
    const name = `E2E_UI_NOREVEAL_${Date.now()}`;
    created.push(name);
    await page.request.post(secretsUrl(), {
      headers: authHeaders(),
      data: { name, value: SECRET_VALUE },
    });

    await openSecretsPage(page);
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    for (const label of [/reveal/i, /show value/i, /view secret/i, /^show$/i]) {
      await expect(
        page.getByRole("button", { name: label }),
        `a "${label}" control exists — there is no endpoint behind it`,
      ).toHaveCount(0);
    }
  });

  test("rotation replaces the value rather than adding a row", async ({
    page,
  }) => {
    const name = `E2E_UI_ROTATE_${Date.now()}`;
    created.push(name);
    await page.request.post(secretsUrl(), {
      headers: authHeaders(),
      data: { name, value: "first-value" },
    });

    await openSecretsPage(page);
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    // Scope to this secret's row. `.first()` was wrong: rows are sorted by
    // name, so with any other secret in the workspace it clicked a different
    // one — and the test then rotated something it had not created.
    await page
      .getByTestId(`secret-row-${name}`)
      .getByTitle("Replace the value")
      .click();
    await expect(
      page.getByRole("heading", { name: `Replace the value of ${name}` }),
    ).toBeVisible();

    // The name is fixed while rotating — renaming and rotating at once would
    // silently leave the old secret behind, still resolvable.
    await expect(page.getByPlaceholder("STRIPE_API_KEY")).toBeDisabled();

    await page.getByPlaceholder("Paste the credential").fill("second-value");
    await page.getByRole("button", { name: "Replace value" }).click();

    await expect(page.getByText(name, { exact: true })).toHaveCount(1, {
      timeout: 30_000,
    });
  });

  test("a name that could not be referenced is refused before saving", async ({
    page,
  }) => {
    // A secret that stores but cannot be addressed as {{secrets.NAME}} would
    // be a trap, so the form says so rather than letting the API do it.
    await openSecretsPage(page);

    await page.getByRole("button", { name: "Add secret" }).click();
    await page.getByPlaceholder("STRIPE_API_KEY").fill("has spaces");
    await page.getByPlaceholder("Paste the credential").fill("x");

    await expect(page.getByText(/Letters, numbers, underscore/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save secret" }),
    ).toBeDisabled();
  });

  test("the page says values cannot be read back", async ({ page }) => {
    // Not decoration: an author who believes they can look a credential up
    // later will not record it anywhere else.
    await openSecretsPage(page);

    await expect(page.getByText(/cannot be read back/i)).toBeVisible();
  });
});
