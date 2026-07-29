/**
 * E2E: the secret picker in the workflow builder.
 *
 * Validation refuses a pasted credential in a webhook header. A refusal with
 * nothing offered in its place is just a wall — the author still has a token
 * and still has a header to put it in. So the config panel has to hand them
 * the reference, which is what this covers.
 *
 * Live backend + frontend, no LLM.
 */

import { expect, test } from "@playwright/test";

import {
  API_BASE,
  REAL_BACKEND_WORKSPACE_ID,
  authHeaders,
  backendOnlyReady,
  setupAiLiveAuth,
} from "./fixtures/ai-env";
import { deleteAutomation } from "./fixtures/automation-helpers";

test.describe.configure({ timeout: 180_000 });

const SECRET_VALUE = "sk-live-picker-must-never-be-rendered";

function secretsUrl(path = ""): string {
  return `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}/secrets${path}`;
}

/** A one-webhook graph, seeded through the API — dragging edges is flaky. */
function webhookCanvas() {
  return {
    nodes: [
      {
        id: "trigger-1",
        type: "trigger",
        position: { x: 80, y: 80 },
        data: { label: "Record Created", trigger_type: "record.created" },
      },
      {
        id: "action-1",
        type: "action",
        position: { x: 400, y: 80 },
        data: {
          label: "Call webhook",
          action_type: "webhook_call",
          webhook_url: "https://hooks.example.com/x",
          http_method: "POST",
          body_template: "{}",
          timeout_seconds: 5,
          headers: "{}",
        },
      },
    ],
    edges: [{ id: "e1", source: "trigger-1", target: "action-1" }],
  };
}

test.describe("AI / Secret picker in the builder (live)", () => {
  let automationId: string | null = null;
  const secretNames: string[] = [];

  test.beforeEach(async ({ page }) => {
    const ready = await backendOnlyReady();
    test.skip(!ready.ok, ready.reason);
    await setupAiLiveAuth(page);
  });

  test.afterEach(async ({ request }) => {
    if (automationId) {
      await deleteAutomation(request, automationId);
      automationId = null;
    }
    while (secretNames.length) {
      const name = secretNames.pop();
      if (name) {
        await request
          .delete(secretsUrl(`/${name}`), { headers: authHeaders() })
          .catch(() => undefined);
      }
    }
  });

  test("inserts a reference into the header, never a value", async ({
    page,
    request,
  }) => {
    const name = `E2E_PICK_${Date.now()}`;
    secretNames.push(name);
    const stored = await request.post(secretsUrl(), {
      headers: authHeaders(),
      data: { name, value: SECRET_VALUE, description: "picker e2e" },
    });
    expect(stored.ok(), `secret create returned ${stored.status()}`).toBeTruthy();

    const created = await request.post(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}/automations`,
      {
        headers: authHeaders(),
        data: {
          name: `e2e-secret-picker-${Date.now()}`,
          module: "crm",
          trigger_type: "record.created",
          trigger_config: {},
          actions: [],
        },
      },
    );
    expect(created.ok(), `automation create returned ${created.status()}`)
      .toBeTruthy();
    automationId = (await created.json()).id as string;

    const saved = await request.put(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}` +
        `/crm/automations/${automationId}/workflow`,
      { headers: authHeaders(), data: webhookCanvas() },
    );
    expect(saved.ok(), `workflow save returned ${saved.status()}`).toBeTruthy();

    await page.goto(`/automations/${automationId}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await expect(page.locator(".react-flow").first()).toBeVisible({
      timeout: 30_000,
    });

    // Open the webhook node's config.
    await page.locator('.react-flow__node[data-id="action-1"]').click();
    const panel = page.getByTestId("node-config-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    const headers = panel.getByPlaceholder(/Authorization/i);
    await expect(headers).toBeVisible();

    // Insert the reference.
    await panel.getByRole("button", { name: /Insert secret/i }).click();
    await page.getByText(name, { exact: true }).click();

    await expect(headers).toHaveValue(new RegExp(`\\{\\{secrets\\.${name}\\}\\}`));

    // The picker lists names. If it ever carried values, this is where the
    // value would show up.
    expect(
      await page.content(),
      "the picker put a secret value in the page",
    ).not.toContain(SECRET_VALUE);
  });

  test("the picker offers a way to add one when none exist", async ({
    page,
    request,
  }) => {
    // An empty picker that just says "nothing here" leaves the author stuck
    // with a refusal and no next step.
    const created = await request.post(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}/automations`,
      {
        headers: authHeaders(),
        data: {
          name: `e2e-secret-picker-empty-${Date.now()}`,
          module: "crm",
          trigger_type: "record.created",
          trigger_config: {},
          actions: [],
        },
      },
    );
    automationId = (await created.json()).id as string;

    await request.put(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}` +
        `/crm/automations/${automationId}/workflow`,
      { headers: authHeaders(), data: webhookCanvas() },
    );

    await page.goto(`/automations/${automationId}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await page.locator('.react-flow__node[data-id="action-1"]').click();
    const panel = page.getByTestId("node-config-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    await panel.getByRole("button", { name: /Insert secret/i }).click();

    await expect(
      page.getByRole("link", { name: /Add a secret/i }),
    ).toBeVisible();
  });
});
