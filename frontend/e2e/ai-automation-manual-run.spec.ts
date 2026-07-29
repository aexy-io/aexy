/**
 * E2E: running an automation by hand must not report work it cannot know about.
 *
 * Execution happens in a background task whose exceptions go nowhere, and the
 * endpoint used to answer "Automation triggered" before any of it ran. A
 * paused automation, an exhausted monthly allowance, a record from another
 * workspace and a record of the wrong type all looked exactly like success —
 * and no failed run appeared either, because the run row is only created once
 * execution starts. The button reported work that never happened, with nowhere
 * to go and look.
 *
 * So the refusals are the point of this file, not the happy path.
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

async function createAutomation(
  request: APIRequestContext,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const resp = await request.post(`${API_BASE}/workspaces/${WS()}/automations`, {
    headers: authHeaders(),
    data: {
      name: `e2e-manual-run-${Date.now()}`,
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

function triggerUrl(id: string, recordId?: string): string {
  const base = `${API_BASE}/workspaces/${WS()}/automations/${id}/trigger`;
  return recordId ? `${base}?record_id=${encodeURIComponent(recordId)}` : base;
}

/** A record that exists in this workspace, and the object it belongs to. */
async function anyRecord(
  request: APIRequestContext,
): Promise<{ recordId: string; objectId: string } | null> {
  const objects = await request.get(
    `${API_BASE}/workspaces/${WS()}/crm/objects`,
    { headers: authHeaders() },
  );
  if (!objects.ok()) return null;
  for (const object of await objects.json()) {
    const records = await request.get(
      `${API_BASE}/workspaces/${WS()}/crm/objects/${object.id}/records?limit=1`,
      { headers: authHeaders() },
    );
    if (!records.ok()) continue;
    const first = (await records.json()).records?.[0];
    if (first) return { recordId: first.id, objectId: object.id };
  }
  return null;
}

test.describe("AI / Automation manual run (live)", () => {
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
          .delete(`${API_BASE}/workspaces/${WS()}/automations/${id}`, {
            headers: authHeaders(),
          })
          .catch(() => undefined);
      }
    }
  });

  test("a CRM automation with no record is refused", async ({ request }) => {
    // Every CRM action reads from a record; without one they would all fail
    // one by one instead of the request being turned down.
    const id = await createAutomation(request);
    created.push(id);

    const resp = await request.post(triggerUrl(id), { headers: authHeaders() });

    expect(resp.status()).toBe(400);
    expect((await resp.text()).toLowerCase()).toContain("record");
  });

  test("a record from another workspace is refused", async ({ request }) => {
    const id = await createAutomation(request);
    created.push(id);

    const resp = await request.post(
      triggerUrl(id, "00000000-0000-0000-0000-000000000000"),
      { headers: authHeaders() },
    );

    expect(resp.status()).toBe(404);
  });

  test("a paused automation is refused", async ({ request }) => {
    const id = await createAutomation(request, { is_active: false });
    created.push(id);

    const resp = await request.post(
      triggerUrl(id, "00000000-0000-0000-0000-000000000000"),
      { headers: authHeaders() },
    );

    // Paused is checked before the record, so this is 409 rather than 404.
    expect(resp.status()).toBe(409);
    expect((await resp.text()).toLowerCase()).toContain("paused");
  });

  test("an exhausted monthly allowance is refused", async ({ request }) => {
    // Spend the allowance by actually running, not by writing runs_this_month:
    // the PATCH endpoint accepts that field and silently ignores it, so the
    // first version of this test set a limit that was never reached and then
    // asserted the wrong refusal. It passed for the wrong reason until the
    // status code disagreed.
    const found = await anyRecord(request);
    test.skip(!found, "no CRM record in this workspace to test against");

    const id = await createAutomation(request, { run_limit_per_month: 1 });
    created.push(id);

    const first = await request.post(triggerUrl(id, found!.recordId), {
      headers: authHeaders(),
    });
    expect(first.ok(), `first run returned ${first.status()}`).toBeTruthy();

    // The slot is claimed when the run is admitted, which happens in the
    // background task — so wait for the counter to actually move.
    const deadline = Date.now() + 30_000;
    let second = await request.post(triggerUrl(id, found!.recordId), {
      headers: authHeaders(),
    });
    while (second.status() !== 409 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1_000));
      second = await request.post(triggerUrl(id, found!.recordId), {
        headers: authHeaders(),
      });
    }

    expect(second.status()).toBe(409);
    expect((await second.text()).toLowerCase()).toContain("limit");
  });

  test("a record of the wrong type is refused", async ({ request }) => {
    const found = await anyRecord(request);
    test.skip(!found, "no CRM record in this workspace to test against");

    // A second *real* object to bind the automation to. A made-up object id
    // cannot be used: object_id is a foreign key, so creating the automation
    // fails with a 500 before the test reaches the case it is about.
    const otherObject = await request.post(
      `${API_BASE}/workspaces/${WS()}/crm/objects`,
      {
        headers: authHeaders(),
        data: {
          name: `E2E Other ${Date.now()}`,
          plural_name: "E2E Others",
          object_type: "custom",
        },
      },
    );
    expect(
      otherObject.ok(),
      `second object create returned ${otherObject.status()}`,
    ).toBeTruthy();
    const otherObjectId = (await otherObject.json()).id as string;

    const id = await createAutomation(request, { object_id: otherObjectId });
    created.push(id);

    const resp = await request.post(triggerUrl(id, found!.recordId), {
      headers: authHeaders(),
    });

    expect(resp.status()).toBe(400);
    expect((await resp.text()).toLowerCase()).toContain("type");
  });

  test("a valid run reports started, never succeeded", async ({ request }) => {
    // The work happens after the response. Claiming success here would be the
    // original defect in a new place.
    const found = await anyRecord(request);
    test.skip(!found, "no CRM record in this workspace to test against");

    const id = await createAutomation(request);
    created.push(id);

    const resp = await request.post(triggerUrl(id, found!.recordId), {
      headers: authHeaders(),
    });

    expect(resp.ok(), `trigger returned ${resp.status()}`).toBeTruthy();
    const body = await resp.json();
    expect(body.started).toBe(true);
    expect(body.message.toLowerCase()).toContain("started");
    expect(
      body.message.toLowerCase(),
      "the outcome is not known yet, so it must not be claimed",
    ).not.toContain("success");
  });

  test("a manual run reaches run history", async ({ request }) => {
    // The response only promises the run started; run history is where the
    // outcome actually lands, so it has to arrive there.
    const found = await anyRecord(request);
    test.skip(!found, "no CRM record in this workspace to test against");

    const id = await createAutomation(request);
    created.push(id);

    await request.post(triggerUrl(id, found!.recordId), {
      headers: authHeaders(),
    });

    const deadline = Date.now() + 45_000;
    let runs: unknown[] = [];
    while (Date.now() < deadline) {
      const resp = await request.get(
        `${API_BASE}/workspaces/${WS()}/automations/${id}/runs`,
        { headers: authHeaders() },
      );
      if (resp.ok()) {
        runs = await resp.json();
        if (runs.length > 0) break;
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }

    expect(runs.length, "the run never appeared in history").toBeGreaterThan(0);
  });
});
