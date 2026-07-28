/**
 * E2E: a webhook step is not a way to reach the inside of the network.
 *
 * The URL and headers come from whoever builds the automation, and the
 * request leaves from the backend. Unguarded, that is a request-forgery
 * primitive aimed at everything the backend can reach and the author
 * cannot: the cloud metadata endpoint on 169.254.169.254, Redis,
 * Temporal, other tenants' internal APIs. Validating only the scheme
 * leaves all of it reachable.
 *
 * Checked here rather than only in unit tests because the guard has to
 * hold on the path a user actually takes — through the config panel, into
 * a saved automation, and through whichever executor runs it. Both
 * executors apply it; leaving it off the durable one would mean adding a
 * wait node routes around the guard.
 *
 * These targets are refused before any request is made, so nothing is
 * dialled and the spec needs no network egress of its own.
 *
 * Live backend, no LLM.
 */

import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  API_BASE,
  REAL_BACKEND_WORKSPACE_ID,
  authHeaders,
  backendOnlyReady,
  setupAiLiveAuth,
} from "./fixtures/ai-env";
import { deleteAutomation, openCanvas } from "./fixtures/automation-helpers";

test.describe.configure({ timeout: 180_000 });

/**
 * Targets a webhook step must refuse. Each is reachable from the backend
 * and from nowhere a workspace user is entitled to reach.
 */
const INTERNAL_TARGETS = [
  { url: "http://169.254.169.254/latest/meta-data/", why: "cloud instance metadata" },
  { url: "http://127.0.0.1:8000/api/v1/workspaces", why: "the backend's own API" },
  { url: "http://localhost:6379/", why: "Redis" },
  { url: "http://10.0.0.1/admin", why: "RFC1918 private range" },
  { url: "http://192.168.1.1/", why: "RFC1918 private range" },
  { url: "http://[::1]:8000/", why: "IPv6 loopback" },
];

/** Schemes that are not HTTP at all — file:, gopher:, and friends. */
const NON_HTTP_TARGETS = [
  "file:///etc/passwd",
  "gopher://127.0.0.1:6379/_INFO",
];

async function createAutomation(
  request: APIRequestContext,
  name: string,
): Promise<string> {
  const resp = await request.post(
    `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}/automations`,
    {
      headers: authHeaders(),
      data: {
        name,
        description: "Webhook target-safety E2E (seeded via API).",
        module: "crm",
        trigger_type: "record.created",
        trigger_config: {},
        actions: [],
      },
    },
  );
  expect(resp.ok(), `automation create returned ${resp.status()}`).toBeTruthy();
  return (await resp.json()).id as string;
}

/**
 * Run a one-step webhook canvas against the dry-run executor and return
 * the node's result. /execute is the closest thing to "press Test" and
 * exercises the same handler a published run uses.
 */
async function runWebhookStep(
  request: APIRequestContext,
  automationId: string,
  url: string,
): Promise<{ status: string; error?: string }> {
  const put = await request.put(
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
              label: "Call webhook",
              action_type: "webhook_call",
              webhook_url: url,
              http_method: "POST",
              body_template: "{}",
              timeout_seconds: 5,
            },
          },
        ],
        edges: [{ id: "e1", source: "trigger-1", target: "action-1" }],
      },
    },
  );
  // A URL the builder rejects outright never reaches the executor — that
  // is a pass too, just an earlier one.
  if (put.status() === 400) {
    return { status: "failed", error: await put.text() };
  }
  expect(put.ok(), `workflow save returned ${put.status()}`).toBeTruthy();

  const exec = await request.post(
    `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}` +
      `/crm/automations/${automationId}/workflow/execute`,
    { headers: authHeaders(), data: { variables: {} } },
  );
  expect(exec.ok(), `execute returned ${exec.status()}`).toBeTruthy();

  const body = await exec.json();
  const results = (body.node_results ?? body.results ?? []) as {
    node_id?: string;
    status?: string;
    error?: string;
  }[];
  const node = results.find((r) => r.node_id === "action-1") ?? {};
  return { status: node.status ?? "unknown", error: node.error ?? "" };
}

test.describe("AI / Automation webhook target safety (live)", () => {
  let automationId: string | null = null;

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
  });

  test("internal targets are refused", async ({ request }) => {
    automationId = await createAutomation(request, `e2e-webhook-ssrf-${Date.now()}`);

    for (const target of INTERNAL_TARGETS) {
      const result = await runWebhookStep(request, automationId, target.url);
      expect(
        result.status,
        `${target.url} (${target.why}) must not be dialled by a webhook step`,
      ).not.toBe("success");
    }
  });

  test("non-HTTP schemes are refused", async ({ request }) => {
    automationId = await createAutomation(request, `e2e-webhook-scheme-${Date.now()}`);

    for (const url of NON_HTTP_TARGETS) {
      const result = await runWebhookStep(request, automationId, url);
      expect(result.status, `${url} must be refused`).not.toBe("success");
    }
  });

  test("the config panel flags an internal URL before save", async ({ page }) => {
    // The backend is the boundary that matters, but a user should learn
    // about it while editing rather than from a failed run.
    await openCanvas(page, { module: "crm" });

    const webhookCategory = page.getByTestId("palette-category-action");
    if ((await webhookCategory.getAttribute("aria-expanded")) === "false") {
      await webhookCategory.click();
    }
    const webhookRow = page.getByTestId("palette-subtype-action-webhook_call").first();
    test.skip(
      (await webhookRow.count()) === 0,
      "this build does not offer the webhook action",
    );
    await webhookRow.click();

    await page.locator('.react-flow__node[data-id^="action-"]').first().click();
    const panel = page.getByTestId("node-config-panel");
    await expect(panel).toBeVisible({ timeout: 10_000 });

    const urlField = panel.getByPlaceholder(/https?:\/\//i).first();
    test.skip(
      (await urlField.count()) === 0,
      "webhook URL field not found — config panel field layout changed",
    );
    await urlField.fill("ftp://169.254.169.254/");

    // Anything that stops this reaching a run is acceptable: an inline
    // message, or Publish going disabled. Assert the outcome, not the
    // particular affordance.
    const publish = page.getByRole("button", { name: /^publish$/i }).first();
    const flagged =
      (await panel.getByText(/must use HTTP|invalid|not allowed|internal/i).count()) > 0 ||
      (await publish.isDisabled().catch(() => false));

    expect(
      flagged,
      "an internal or non-HTTP webhook URL should be surfaced in the builder",
    ).toBeTruthy();
  });
});
