/**
 * E2E: a step that survives publish must survive execution.
 *
 * Publishing flattens the canvas onto `automation.actions`, and that
 * flattening keeps ONLY `action` nodes. A structural node (condition,
 * wait, branch, agent) therefore has to be routed to the durable engine
 * instead — or it is dropped on publish and the automation runs its
 * remaining actions unconditionally, with every step recorded green,
 * because from the executor's point of view nothing went wrong.
 *
 * Not hypothetical: publish once accepted `condition` while only `wait`
 * was routed durably, so "if deal value > 50k, notify the VP" published
 * cleanly and then notified the VP on every deal. Run history showed all
 * steps successful. The unit guard is
 * test_every_publishable_node_type_has_somewhere_to_run; this is the same
 * invariant from the outside, where a user meets it.
 *
 * Written against the palette rather than a hardcoded node list, so it
 * keeps checking the invariant as capabilities are un-hidden across
 * releases instead of needing an edit each time.
 *
 * Live backend, no LLM.
 */

import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  API_BASE,
  REAL_BACKEND_WORKSPACE_ID,
  authHeaders,
  backendOnlyReady,
  setupAiLiveAuth,
} from "./fixtures/ai-env";
import {
  canvasNodes,
  deleteAutomation,
  openCanvas,
} from "./fixtures/automation-helpers";

test.describe.configure({ timeout: 180_000 });

/** Canvas categories that are structural rather than plain actions. */
const STRUCTURAL_CATEGORIES = ["condition", "wait", "agent", "branch", "join"];

/** Minimal node data that satisfies each structural type's own validation. */
const STRUCTURAL_NODE_DATA: Record<string, Record<string, unknown>> = {
  condition: {
    conditions: [
      { field: "record.values.email", operator: "is_not_empty", value: "" },
    ],
    conjunction: "and",
  },
  wait: { wait_type: "duration", duration_value: 1, duration_unit: "hours" },
  agent: { agent_id: "00000000-0000-0000-0000-000000000000" },
  branch: {
    branches: [
      { id: "b1", label: "Path 1", field: "record.values.email", operator: "is_not_empty" },
      { id: "else", label: "Else", is_else: true },
    ],
  },
  join: { join_type: "all", incoming_branches: 2 },
};

const TRIGGER_NODE = {
  id: "trigger-1",
  type: "trigger",
  position: { x: 80, y: 80 },
  data: { label: "Record Created", trigger_type: "record.created" },
};

const ACTION_NODE = {
  id: "action-1",
  type: "action",
  position: { x: 640, y: 80 },
  data: {
    label: "Send Welcome",
    action_type: "send_email",
    email_field: "email",
    email_subject: "Welcome",
    email_body: "Hi there.",
  },
};

/** Which structural categories does this build's palette actually offer? */
async function offeredStructuralCategories(page: Page): Promise<string[]> {
  const offered: string[] = [];
  for (const kind of STRUCTURAL_CATEGORIES) {
    if ((await page.getByTestId(`palette-category-${kind}`).count()) > 0) {
      offered.push(kind);
    }
  }
  return offered;
}

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
        description: "Publish-routing E2E (seeded via API).",
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
 * Ask the backend to validate a canvas holding one structural node.
 * Goes through /validate rather than the UI because the palette will not
 * offer a withheld node — but a canvas saved by an older build, or built
 * straight through the API, still reaches publish, and that is the path
 * that used to drop the node in silence.
 */
async function validateWithStructuralNode(
  request: APIRequestContext,
  automationId: string,
  kind: string,
): Promise<{ is_valid: boolean; errors: { error_type: string; node_id: string }[] }> {
  const resp = await request.post(
    `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}` +
      `/crm/automations/${automationId}/workflow/validate`,
    {
      headers: authHeaders(),
      data: {
        nodes: [
          TRIGGER_NODE,
          {
            id: `${kind}-1`,
            type: kind,
            position: { x: 360, y: 80 },
            data: { label: kind, ...(STRUCTURAL_NODE_DATA[kind] ?? {}) },
          },
          ACTION_NODE,
        ],
        edges: [
          { id: "e1", source: "trigger-1", target: `${kind}-1` },
          { id: "e2", source: `${kind}-1`, target: "action-1" },
        ],
      },
    },
  );
  expect(resp.ok(), `validate returned ${resp.status()}`).toBeTruthy();
  return resp.json();
}

test.describe("AI / Automation publish routing (live)", () => {
  const created: string[] = [];

  test.beforeEach(async ({ page }) => {
    const ready = await backendOnlyReady();
    test.skip(!ready.ok, ready.reason);
    await setupAiLiveAuth(page);
    await openCanvas(page, { module: "crm" });
  });

  test.afterEach(async ({ request }) => {
    while (created.length) {
      const id = created.pop();
      if (id) await deleteAutomation(request, id);
    }
  });

  test("a plain trigger + action canvas validates", async ({ request }) => {
    // Control case. Without it, a failure below could mean "nothing
    // validates at all" rather than anything about routing.
    const id = await createAutomation(request, `e2e-routing-control-${Date.now()}`);
    created.push(id);

    const resp = await request.post(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}` +
        `/crm/automations/${id}/workflow/validate`,
      {
        headers: authHeaders(),
        data: {
          nodes: [TRIGGER_NODE, ACTION_NODE],
          edges: [{ id: "e1", source: "trigger-1", target: "action-1" }],
        },
      },
    );
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(
      body.errors,
      "a trigger + action flow must validate cleanly",
    ).toEqual([]);
  });

  test("a structural node the palette withholds is refused, not dropped", async ({
    page,
    request,
  }) => {
    const offered = await offeredStructuralCategories(page);
    const withheld = STRUCTURAL_CATEGORIES.filter((k) => !offered.includes(k));
    test.skip(
      withheld.length === 0,
      "this build offers every structural node — nothing is withheld to refuse",
    );

    const id = await createAutomation(request, `e2e-routing-withheld-${Date.now()}`);
    created.push(id);

    for (const kind of withheld) {
      const body = await validateWithStructuralNode(request, id, kind);
      const unsupported = body.errors.filter(
        (e) => e.error_type === "unsupported_node_type",
      );
      expect(
        unsupported.map((e) => e.node_id),
        `"${kind}" is withheld from the palette, so publish must refuse it. ` +
          `Accepting it means flattening drops the node and the automation ` +
          `runs every action unconditionally with nothing reported.`,
      ).toContain(`${kind}-1`);
    }
  });

  test("every structural node the palette offers is accepted", async ({
    page,
    request,
  }) => {
    const offered = await offeredStructuralCategories(page);
    test.skip(
      offered.length === 0,
      "this build offers no structural nodes — nothing to route",
    );

    const id = await createAutomation(request, `e2e-routing-offered-${Date.now()}`);
    created.push(id);

    for (const kind of offered) {
      const body = await validateWithStructuralNode(request, id, kind);
      const unsupported = body.errors.filter(
        (e) => e.error_type === "unsupported_node_type",
      );
      expect(
        unsupported,
        `the palette offers "${kind}", which is a promise that publishing one ` +
          `works. Publish refusing it means the palette and ` +
          `_EXECUTABLE_NODE_TYPES have drifted apart.`,
      ).toEqual([]);
    }
  });

  test("an offered structural node can be added to the canvas", async ({ page }) => {
    // Guards the other direction of the same drift: a category can be
    // rendered while its click handler produces no node.
    const offered = await offeredStructuralCategories(page);
    test.skip(offered.length === 0, "no structural nodes offered");

    for (const kind of offered) {
      await page.getByTestId(`palette-category-${kind}`).click();
      await expect(
        canvasNodes(page, kind).first(),
        `palette offers "${kind}" but clicking it added no node`,
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});
