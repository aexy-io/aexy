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
    await panel
      .getByTestId("secret-picker-headers")
      .getByRole("button", { name: /Insert secret/i })
      .click();
    await page.getByText(name, { exact: true }).click();

    await expect(headers).toHaveValue(new RegExp(`\\{\\{secrets\\.${name}\\}\\}`));

    // The picker lists names. If it ever carried values, this is where the
    // value would show up.
    expect(
      await page.content(),
      "the picker put a secret value in the page",
    ).not.toContain(SECRET_VALUE);
  });

  test("the api_request auth field takes a reference, not a token", async ({
    page,
    request,
  }) => {
    // These fields were the last place in the builder that asked for a raw
    // credential — and nothing read them, so the token sat in the workflow
    // definition while the request went out unauthenticated.
    const name = `E2E_AUTH_${Date.now()}`;
    secretNames.push(name);
    await request.post(secretsUrl(), {
      headers: authHeaders(),
      data: { name, value: SECRET_VALUE },
    });

    const created = await request.post(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}/automations`,
      {
        headers: authHeaders(),
        data: {
          name: `e2e-secret-auth-${Date.now()}`,
          module: "crm",
          trigger_type: "record.created",
          trigger_config: {},
          actions: [],
        },
      },
    );
    automationId = (await created.json()).id as string;

    const saved = await request.put(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}` +
        `/crm/automations/${automationId}/workflow`,
      {
        headers: authHeaders(),
        data: {
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
                label: "Call API",
                action_type: "api_request",
                api_url: "https://api.example.com/x",
                api_method: "POST",
                auth_type: "bearer",
              },
            },
          ],
          edges: [{ id: "e1", source: "trigger-1", target: "action-1" }],
        },
      },
    );
    expect(saved.ok(), `workflow save returned ${saved.status()}`).toBeTruthy();

    await page.goto(`/automations/${automationId}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await expect(page.locator(".react-flow").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.locator('.react-flow__node[data-id="action-1"]').click();
    const panel = page.getByTestId("node-config-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    const token = panel.getByPlaceholder("{{secrets.NAME}}");
    await expect(token).toBeVisible();

    // Scope to the auth field's picker: this panel has two, the other being
    // on headers. `.first()` would depend on render order.
    await panel
      .getByTestId("secret-picker-auth")
      .getByRole("button", { name: /Insert secret/i })
      .click();
    await page.getByText(name, { exact: true }).click();

    await expect(token).toHaveValue(`{{secrets.${name}}}`);
    expect(
      await page.content(),
      "the picker put a secret value in the page",
    ).not.toContain(SECRET_VALUE);
  });

  test("Basic Auth is not offered, having had no fields behind it", async ({
    page,
    request,
  }) => {
    // Choosing it could only produce a step that fails.
    const created = await request.post(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}/automations`,
      {
        headers: authHeaders(),
        data: {
          name: `e2e-secret-basic-${Date.now()}`,
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
      {
        headers: authHeaders(),
        data: {
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
                label: "Call API",
                action_type: "api_request",
                api_url: "https://api.example.com/x",
              },
            },
          ],
          edges: [{ id: "e1", source: "trigger-1", target: "action-1" }],
        },
      },
    );

    await page.goto(`/automations/${automationId}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });
    await page.locator('.react-flow__node[data-id="action-1"]').click();
    const panel = page.getByTestId("node-config-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    await expect(
      panel.getByRole("option", { name: /Basic Auth/i }),
    ).toHaveCount(0);
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

    await panel
      .getByTestId("secret-picker-headers")
      .getByRole("button", { name: /Insert secret/i })
      .click();

    await expect(
      page.getByRole("link", { name: /Add a secret/i }),
    ).toBeVisible();
  });
});
