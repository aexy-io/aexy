/**
 * E2E: a webhook credential must not be readable by everyone who can open the
 * builder.
 *
 * Header templates are stored verbatim in the workflow definition, and reading
 * a workflow needs only `member`. A pasted `Authorization: Bearer sk-live-…`
 * was therefore visible to the whole workspace. `{{secrets.NAME}}` keeps the
 * reference in the graph and the value out of it.
 *
 * These assert the security contract as an API client sees it: no path returns
 * a value, one workspace cannot reach another's, a pasted credential is
 * refused and a reference is accepted.
 *
 * Deliberately NOT here: proving the resolved value reaches the wire while the
 * stored response is scrubbed. That needs an echo server the backend can reach,
 * and the SSRF guard refuses internal targets by design — standing it up would
 * mean shipping a spec that only passes with ALLOW_PRIVATE_WEBHOOK_TARGETS set.
 * It is covered by test_workspace_secrets.py with a client that replays request
 * headers the way httpbin does, which is the case that caught the leak.
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

const SECRET_VALUE = "sk-live-e2e-must-never-be-returned";

function secretsUrl(path = ""): string {
  return `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}/secrets${path}`;
}

async function putSecret(
  request: APIRequestContext,
  name: string,
  value = SECRET_VALUE,
) {
  return request.post(secretsUrl(), {
    headers: authHeaders(),
    data: { name, value, description: "created by e2e" },
  });
}

/**
 * A public IP literal rather than a hostname. The target check runs before
 * secret resolution, and it short-circuits on a literal without touching DNS —
 * so a made-up hostname would be refused as unresolvable and mask the error
 * this file is actually asserting. Nothing is dialled: resolution fails first.
 */
const PUBLIC_LITERAL_URL = "https://93.184.216.34/webhook";

/** A canvas whose webhook header carries `headers`, for the validate endpoint. */
function canvasWithHeaders(headers: string, url = "https://hooks.example.com/x") {
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
          webhook_url: url,
          http_method: "POST",
          body_template: "{}",
          timeout_seconds: 5,
          headers,
        },
      },
    ],
    edges: [{ id: "e1", source: "trigger-1", target: "action-1" }],
  };
}

async function createAutomation(request: APIRequestContext): Promise<string> {
  const resp = await request.post(
    `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}/automations`,
    {
      headers: authHeaders(),
      data: {
        name: `e2e-secrets-${Date.now()}`,
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

test.describe("AI / Automation workspace secrets (live)", () => {
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

  test("creating a secret never echoes the value back", async ({ request }) => {
    const name = `E2E_CREATE_${Date.now()}`;
    const resp = await putSecret(request, name);
    created.push(name);

    expect(resp.status()).toBe(201);
    const body = await resp.text();
    expect(body, "the create response returned the secret").not.toContain(
      SECRET_VALUE,
    );
  });

  test("listing secrets returns names, never values", async ({ request }) => {
    const name = `E2E_LIST_${Date.now()}`;
    await putSecret(request, name);
    created.push(name);

    const resp = await request.get(secretsUrl(), { headers: authHeaders() });
    expect(resp.ok()).toBeTruthy();
    const body = await resp.text();

    expect(body).toContain(name);
    expect(body, "listing leaked a secret value").not.toContain(SECRET_VALUE);
  });

  test("there is no endpoint that reads a secret back", async ({ request }) => {
    // The guarantee is the absence of a read path, so this probes for one
    // rather than trusting that none was added later.
    const name = `E2E_READ_${Date.now()}`;
    await putSecret(request, name);
    created.push(name);

    for (const path of [`/${name}`, `/${name}/value`, `/${name}/reveal`]) {
      const resp = await request.get(secretsUrl(path), {
        headers: authHeaders(),
      });
      const body = resp.ok() ? await resp.text() : "";
      expect(
        body,
        `GET ${path} returned the secret value — there must be no read path`,
      ).not.toContain(SECRET_VALUE);
    }
  });

  test("rotation replaces the value rather than adding a second", async ({
    request,
  }) => {
    const name = `E2E_ROTATE_${Date.now()}`;
    await putSecret(request, name, "first-value");
    created.push(name);
    await putSecret(request, name, "second-value");

    const listed = await (
      await request.get(secretsUrl(), { headers: authHeaders() })
    ).json();

    const matching = listed.filter(
      (s: { name: string }) => s.name === name,
    );
    expect(matching, "rotation created a duplicate").toHaveLength(1);
  });

  test("a pasted credential in a header is refused at validate", async ({
    request,
  }) => {
    const id = await createAutomation(request);

    const resp = await request.post(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}` +
        `/crm/automations/${id}/workflow/validate`,
      {
        headers: authHeaders(),
        data: canvasWithHeaders(
          JSON.stringify({ Authorization: "Bearer sk-live-pasted" }),
        ),
      },
    );
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();

    const flagged = body.errors.filter(
      (e: { error_type: string }) => e.error_type === "literal_secret_in_header",
    );
    expect(
      flagged.length,
      "a pasted credential must block the save now that secrets exist",
    ).toBe(1);
    expect(flagged[0].message).toContain("{{secrets.NAME}}");
    expect(body.is_valid).toBe(false);
  });

  test("a secret reference in a header validates cleanly", async ({
    request,
  }) => {
    const id = await createAutomation(request);

    const resp = await request.post(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}` +
        `/crm/automations/${id}/workflow/validate`,
      {
        headers: authHeaders(),
        data: canvasWithHeaders(
          JSON.stringify({ Authorization: "Bearer {{secrets.STRIPE}}" }),
        ),
      },
    );
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();

    expect(
      body.errors.map((e: { error_type: string }) => e.error_type),
      "a reference is not a credential and must not be flagged",
    ).toEqual([]);
    expect(body.is_valid).toBe(true);
  });

  test("a literal credential in the api_request auth field is refused", async ({
    request,
  }) => {
    // Same exposure as a pasted header, on a field that *is* a credential by
    // definition — no guessing from the header name needed.
    const id = await createAutomation(request);

    const resp = await request.post(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}` +
        `/crm/automations/${id}/workflow/validate`,
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
                bearer_token: "sk-live-pasted",
              },
            },
          ],
          edges: [{ id: "e1", source: "trigger-1", target: "action-1" }],
        },
      },
    );
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();

    const flagged = body.errors.filter(
      (e: { error_type: string }) => e.error_type === "literal_secret_in_auth",
    );
    expect(flagged.length, "a pasted credential must block the save").toBe(1);
    expect(body.is_valid).toBe(false);
  });

  test("api_request is offered by the palette now that it runs", async ({
    request,
  }) => {
    // It was withheld with "No published executor is connected", which was
    // accurate: the panel wrote api_url/api_method/api_body and the handler
    // read webhook_url/http_method/body_template, so the step could not run
    // whatever you configured. Fixing that is what makes the auth fields
    // reachable at all.
    const resp = await request.get(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}` +
        `/automations/registry/modules/crm/actions`,
      { headers: authHeaders() },
    );
    expect(resp.ok()).toBeTruthy();

    const ids = (await resp.json()).actions.map(
      (a: { id: string }) => a.id,
    );
    expect(ids).toContain("api_request");
  });

  test("a step referencing a secret that does not exist fails, not sends", async ({
    request,
  }) => {
    // Leaving the reference unsubstituted would send the literal
    // `{{secrets.X}}` as the credential, which fails confusingly at the far
    // end instead of clearly here.
    const id = await createAutomation(request);

    const put = await request.put(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}` +
        `/crm/automations/${id}/workflow`,
      {
        headers: authHeaders(),
        data: canvasWithHeaders(
          JSON.stringify({ Authorization: "Bearer {{secrets.NO_SUCH_SECRET}}" }),
          PUBLIC_LITERAL_URL,
        ),
      },
    );
    expect(put.ok(), `workflow save returned ${put.status()}`).toBeTruthy();

    const publish = await request.post(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}` +
        `/crm/automations/${id}/workflow/publish`,
      { headers: authHeaders() },
    );
    expect(publish.ok(), `publish returned ${publish.status()}`).toBeTruthy();

    const exec = await request.post(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}` +
        `/crm/automations/${id}/workflow/execute`,
      { headers: authHeaders(), data: { variables: {} } },
    );
    expect(exec.ok()).toBeTruthy();
    const executionId = (await exec.json()).execution_id as string;

    const deadline = Date.now() + 60_000;
    let detail: {
      status?: string;
      steps?: { node_id?: string; status?: string; error?: string }[];
    } = {};
    while (Date.now() < deadline) {
      const resp = await request.get(
        `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}` +
          `/crm/automations/${id}/workflow/executions/${executionId}`,
        { headers: authHeaders() },
      );
      expect(resp.ok()).toBeTruthy();
      detail = await resp.json();
      if (detail.status && !["pending", "running"].includes(detail.status)) break;
      await new Promise((r) => setTimeout(r, 1_000));
    }

    // Distinguish "the step ran and did not fail" from "nothing ran at all".
    // Without the temporal worker up, the execution sits in pending forever
    // and the assertion below reports a missing status, which reads like the
    // secret check is broken rather than like the stack is incomplete.
    expect(
      detail.status,
      "the execution never reached a terminal status — is the temporal " +
        "worker running? (docker compose up -d temporal-worker)",
    ).not.toMatch(/^(pending|running)$/);

    const step = (detail.steps ?? []).find((s) => s.node_id === "action-1");
    expect(step?.status, "a missing secret must fail the step").toBe("failed");
    expect(step?.error ?? "").toMatch(/secret/i);
  });
});
