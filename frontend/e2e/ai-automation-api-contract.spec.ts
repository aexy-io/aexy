/**
 * E2E: the automations API must refuse what it cannot apply.
 *
 * Two defects of the same shape, both found while writing the manual-run
 * tests rather than by reading the code.
 *
 * Pydantic drops undeclared fields, so anything missing from AutomationUpdate
 * was accepted with a 200 and discarded. PATCHing `runs_this_month` looked
 * like it reset the counter and did not — which is how the manual-run
 * allowance test came to assert a refusal that could never fire. And the
 * builder PATCHes `trigger_type` on every canvas save to keep the stored
 * trigger in step with the trigger node; that field was not declared either,
 * so it had never once taken effect.
 *
 * Separately, `object_id` is a foreign key with no workspace in it and nothing
 * checked it before insert: a made-up id came back as a 500, and another
 * workspace's id was accepted outright.
 *
 * These run against the API rather than the UI because the contract is the
 * status code, and a browser would only show what the page chose to do with it.
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
} from "./fixtures/ai-env";

test.describe.configure({ timeout: 120_000 });

const WS = () => REAL_BACKEND_WORKSPACE_ID;

/** Well-formed and certain not to exist. */
const ABSENT_UUID = "00000000-0000-0000-0000-000000000000";

async function createAutomation(
  request: APIRequestContext,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const resp = await request.post(`${API_BASE}/workspaces/${WS()}/automations`, {
    headers: authHeaders(),
    data: {
      name: `e2e-contract-${Date.now()}`,
      module: "crm",
      trigger_type: "record.created",
      trigger_config: {},
      actions: [],
      ...extra,
    },
  });
  expect(resp.ok(), `automation create returned ${resp.status()}`).toBeTruthy();
  return (await resp.json()).id as string;
}

function automationUrl(id: string): string {
  return `${API_BASE}/workspaces/${WS()}/automations/${id}`;
}

test.describe("AI / Automation API contract (live)", () => {
  const created: string[] = [];

  test.beforeEach(async () => {
    const ready = await backendOnlyReady();
    test.skip(!ready.ok, ready.reason);
  });

  test.afterEach(async ({ request }) => {
    while (created.length) {
      const id = created.pop();
      if (id) {
        await request
          .delete(automationUrl(id), { headers: authHeaders() })
          .catch(() => undefined);
      }
    }
  });

  // ── PATCH refuses what it will not apply ────────────────────────────

  test("PATCHing a run counter is refused, not quietly dropped", async ({
    request,
  }) => {
    const id = await createAutomation(request, { run_limit_per_month: 5 });
    created.push(id);

    const resp = await request.patch(automationUrl(id), {
      headers: authHeaders(),
      data: { runs_this_month: 0 },
    });

    expect(
      resp.status(),
      "a 200 here means the counter looked resettable and was not",
    ).toBe(422);
    expect((await resp.text())).toContain("runs_this_month");
  });

  test("an unknown field is refused rather than silently ignored", async ({
    request,
  }) => {
    // A typo in a field name should fail, not look like it worked.
    const id = await createAutomation(request);
    created.push(id);

    const resp = await request.patch(automationUrl(id), {
      headers: authHeaders(),
      data: { nmae: "typo" },
    });

    expect(resp.status()).toBe(422);
  });

  test("the trigger the builder sends is actually applied", async ({
    request,
  }) => {
    // The regression this file exists for. The builder PATCHes trigger_type on
    // every canvas save; it was discarded, so the stored trigger and the
    // trigger node could disagree forever with nothing to show for it.
    const id = await createAutomation(request);
    created.push(id);

    const patched = await request.patch(automationUrl(id), {
      headers: authHeaders(),
      data: { trigger_type: "record.updated" },
    });
    expect(patched.ok(), `PATCH returned ${patched.status()}`).toBeTruthy();

    const after = await request.get(automationUrl(id), {
      headers: authHeaders(),
    });
    expect(
      (await after.json()).trigger_type,
      "the trigger was accepted and then not applied",
    ).toBe("record.updated");
  });

  test("a trigger the module does not offer is refused", async ({ request }) => {
    const id = await createAutomation(request);
    created.push(id);

    const resp = await request.patch(automationUrl(id), {
      headers: authHeaders(),
      data: { trigger_type: "not.a.real.trigger" },
    });

    expect(resp.status()).toBe(422);
  });

  test("an ordinary edit still leaves everything else alone", async ({
    request,
  }) => {
    // Forbidding extras must not turn PATCH into PUT: absent fields have to
    // stay absent rather than being written as null.
    const id = await createAutomation(request, {
      description: "keep me",
      run_limit_per_month: 7,
    });
    created.push(id);

    const resp = await request.patch(automationUrl(id), {
      headers: authHeaders(),
      data: { name: "renamed by e2e" },
    });
    expect(resp.ok(), `PATCH returned ${resp.status()}`).toBeTruthy();

    const after = await resp.json();
    expect(after.name).toBe("renamed by e2e");
    expect(after.description).toBe("keep me");
    expect(after.run_limit_per_month).toBe(7);
  });

  // ── create refuses a target object it cannot bind ───────────────────

  test("creating with an object that does not exist is a 400, not a 500", async ({
    request,
  }) => {
    const resp = await request.post(
      `${API_BASE}/workspaces/${WS()}/automations`,
      {
        headers: authHeaders(),
        data: {
          name: `e2e-contract-absent-${Date.now()}`,
          module: "crm",
          trigger_type: "record.created",
          trigger_config: {},
          actions: [],
          object_id: ABSENT_UUID,
        },
      },
    );

    expect(
      resp.status(),
      "an ordinary mistake was being reported as the server breaking",
    ).toBe(400);
    expect((await resp.text()).toLowerCase()).toContain("object");
  });

  test("creating with a malformed object id is a 400, not a 500", async ({
    request,
  }) => {
    const resp = await request.post(
      `${API_BASE}/workspaces/${WS()}/automations`,
      {
        headers: authHeaders(),
        data: {
          name: `e2e-contract-malformed-${Date.now()}`,
          module: "crm",
          trigger_type: "record.created",
          trigger_config: {},
          actions: [],
          object_id: "not-a-uuid",
        },
      },
    );

    expect(resp.status()).toBe(400);
  });

  test("a real object in this workspace is still accepted", async ({
    request,
  }) => {
    // The guard has to refuse the bad case without breaking the good one.
    const object = await request.post(
      `${API_BASE}/workspaces/${WS()}/crm/objects`,
      {
        headers: authHeaders(),
        data: {
          name: `E2E Contract ${Date.now()}`,
          plural_name: "E2E Contracts",
          object_type: "custom",
        },
      },
    );
    expect(object.ok(), `object create returned ${object.status()}`).toBeTruthy();
    const objectId = (await object.json()).id as string;

    const id = await createAutomation(request, { object_id: objectId });
    created.push(id);

    const after = await request.get(automationUrl(id), {
      headers: authHeaders(),
    });
    expect((await after.json()).object_id).toBe(objectId);
  });

  test("triggering with a malformed record id is a 400, not a 500", async ({
    request,
  }) => {
    const id = await createAutomation(request);
    created.push(id);

    const resp = await request.post(
      `${automationUrl(id)}/trigger?record_id=not-a-uuid`,
      { headers: authHeaders() },
    );

    expect(resp.status()).toBe(400);
  });
});
