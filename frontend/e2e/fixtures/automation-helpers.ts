/**
 * Helpers shared by every `ai-automation-*.spec.ts` file.
 *
 * Three categories of helper, mirroring `ai-helpers.ts`:
 *
 *   1. SCHEMA — load the generated trigger/action registry fixture so
 *      per-subtype tests parametrize from the same source of truth the
 *      backend uses (regenerate via `npm run schema:automation`).
 *
 *   2. CANVAS — open the canvas at `/automations/new`, add a node via
 *      the palette using the data-testid affordances added in
 *      NodePalette.tsx, locate nodes by type prefix, open the config
 *      panel, fill fields.
 *
 *   3. PERSISTENCE — save the workflow and round-trip-verify against
 *      the backend, so a test that *renders* the right node also
 *      proves the backend accepts the same shape.
 *
 * These helpers assume the new palette testids:
 *   - `palette-category-${kind}` on each category row
 *   - `palette-subtype-${kind}-${value}` on each subtype row
 * If you change those, fix this file in one place.
 */

import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import {
  API_BASE,
  REAL_BACKEND_WORKSPACE_ID,
  authHeaders,
} from "./ai-env";
// Static import keeps this CJS/ESM agnostic — `resolveJsonModule` is on
// in tsconfig.json. Regenerate the JSON via `npm run schema:automation`.
import schemaJson from "./automation-schema.generated.json";

// ─── Schema fixture ─────────────────────────────────────────────────

export interface AutomationSchemaEntry {
  id: string;
  description: string;
}

export interface AutomationSchema {
  _meta: { source: string; generator: string };
  modules: string[];
  triggers: Record<string, AutomationSchemaEntry[]>;
  actions: Record<string, AutomationSchemaEntry[]>;
}

/**
 * Generated automation schema fixture. Statically imported so the
 * helper stays CJS/ESM-mode agnostic — Playwright's runner balks at
 * `import.meta.url` here. Regenerate via `npm run schema:automation`
 * after editing `backend/src/aexy/schemas/automation.py`; the
 * `schema:automation:check` script gates drift in CI.
 */
export function loadAutomationSchema(): AutomationSchema {
  return schemaJson as AutomationSchema;
}

/** Triggers for a single module — driver for Layer B parametrized loops. */
export function triggersForModule(module: string): AutomationSchemaEntry[] {
  return loadAutomationSchema().triggers[module] ?? [];
}

export function moduleEnabled(module: string): boolean {
  return loadAutomationSchema().modules.includes(module);
}

/**
 * Actions for a single module + the common bucket, deduped by id.
 *
 * Some modules redeclare a common action (e.g. `sprints` registers
 * its own `create_task` even though `common` already has one). The
 * registry resolves them at runtime by precedence; in the test list
 * we want each id exactly once — first occurrence wins, so the common
 * entry is preferred when both exist.
 */
export function actionsForModule(module: string): AutomationSchemaEntry[] {
  const s = loadAutomationSchema();
  // Descoped modules (not in the generated fixture's module list) expose no
  // actions — even the shared "common" set — so their parametrized specs hit
  // the length===0 skip guard instead of failing on an empty palette. Re-enable
  // a module (ENABLED_MODULES in schemas/automation.py, then regenerate the
  // fixture) and its specs light back up automatically.
  if (!moduleEnabled(module)) return [];
  const merged = [...(s.actions.common ?? []), ...(s.actions[module] ?? [])];
  const seen = new Set<string>();
  return merged.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

// ─── Canvas open / blank-slate helpers ──────────────────────────────

/**
 * Navigate directly to a blank canvas filtered by module. We bypass
 * the TemplateGallery's "Start Blank" button because that handler
 * drops the `module` query param when the URL is rewritten (stale
 * closure over `moduleParam`), and tests would silently end up on a
 * CRM palette regardless of what module was requested.
 *
 * `?blank=1` is the same flag handleStartBlank sets, so the page
 * skips the gallery and mounts the canvas immediately.
 */
export async function openCanvas(
  page: Page,
  opts: { module?: string; waitForCanvasMs?: number } = {},
): Promise<void> {
  // Not named `module`: that shadows the CommonJS global.
  const moduleName = opts.module ?? "crm";

  // `?blank=1` is the same flag handleStartBlank sets — bypasses the
  // TemplateGallery and lets the canvas mount directly. We don't
  // route through the gallery's button because its onClick handler
  // captures a stale `moduleParam` and drops the module from the
  // URL when it rewrites — palette would silently fall back to CRM.
  const url = `/automations/new?blank=1&module=${encodeURIComponent(moduleName)}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

  // Canvas mount signal — ReactFlow always renders `.react-flow` once
  // the canvas component is alive.
  await expect(page.locator(".react-flow").first()).toBeVisible({
    timeout: opts.waitForCanvasMs ?? 15_000,
  });
}

// ─── Palette interaction ────────────────────────────────────────────

/**
 * Click the palette entry that adds a node of `kind` (and optional
 * `subtype`) to the canvas. Uses the data-testids added to NodePalette
 * — if those change, update this helper, not 200 tests.
 *
 * `kind` is one of the canvas node types: trigger | action | condition |
 * wait | agent | branch | join.
 *
 * Categories that *have* subtypes (trigger, action, wait, agent, join)
 * must be expanded first; categories without subtypes (condition, branch)
 * add the node directly on click.
 */
export async function addNodeFromPalette(
  page: Page,
  kind: string,
  subtype?: string,
): Promise<void> {
  const category = page.getByTestId(`palette-category-${kind}`);
  await expect(
    category,
    `palette category "${kind}" missing — did the testid scheme change?`,
  ).toBeVisible({ timeout: 10_000 });

  if (subtype !== undefined) {
    // Expand if collapsed. aria-expanded is set on category buttons
    // that have subtypes; categories without subtypes have it unset.
    const expanded = await category.getAttribute("aria-expanded");
    if (expanded === "false") {
      await category.click();
    }
    // `.first()` handles the case where a module-specific bucket
    // redeclares a common action (e.g. sprints registers its own
    // `create_task`). The palette currently renders both rows — a
    // backend bug worth flagging separately — but for the test we
    // just need one stable target.
    const sub = page
      .getByTestId(`palette-subtype-${kind}-${subtype}`)
      .first();
    await expect(
      sub,
      `palette subtype "${kind}/${subtype}" missing — registry drift?`,
    ).toBeVisible({ timeout: 10_000 });
    await sub.click();
  } else {
    // No subtype path — category click adds the node directly.
    await category.click();
  }
}

// ─── Canvas node locators ───────────────────────────────────────────

/**
 * Locator for canvas nodes of a given kind. ReactFlow tags each node
 * with `data-id` set to the node's id, and `addNode` builds ids as
 * `${type}-${Date.now()}`, so `data-id^="${kind}-"` is the stable hook.
 *
 * Use `.nth(i)` if a test adds multiple nodes of the same kind.
 */
export function canvasNodes(page: Page, kind: string): Locator {
  return page.locator(`.react-flow__node[data-id^="${kind}-"]`);
}

/**
 * Click a node on the canvas to open the NodeConfigPanel. Returns the
 * node locator so the caller can keep referencing it.
 */
export async function openNodeConfig(
  page: Page,
  kind: string,
  index = 0,
): Promise<Locator> {
  const node = canvasNodes(page, kind).nth(index);
  await expect(node).toBeVisible({ timeout: 10_000 });
  await node.click();
  await expect(
    page.getByTestId("node-config-panel"),
    "NodeConfigPanel didn't mount — testid drift or click missed?",
  ).toBeVisible({ timeout: 10_000 });
  return node;
}

/** Locator for the NodeConfigPanel drawer root. */
export function configPanel(page: Page): Locator {
  return page.getByTestId("node-config-panel");
}

/** Close the NodeConfigPanel by clicking its close button. */
export async function closeNodeConfig(page: Page): Promise<void> {
  await page
    .getByTestId("node-config-panel")
    .getByRole("button", { name: /close/i })
    .first()
    .click();
}

/**
 * Best-effort locator for a labeled form field inside the config panel.
 * Scoped to the panel so a field named "Object Type" doesn't accidentally
 * collide with the same label on the canvas or palette.
 *
 * The NodeConfigPanel uses many bare `<label>` elements that aren't
 * `htmlFor`-associated with their inputs, so `getByLabel` misses them.
 * The `<label>` fallback catches those — and is scoped to label elements
 * specifically so a `<option>` with the same text inside a closed
 * `<select>` doesn't satisfy the assertion (visible-state mismatch).
 */
export function getConfigField(page: Page, label: string | RegExp): Locator {
  const re = typeof label === "string" ? new RegExp(label, "i") : label;
  const panel = configPanel(page);
  return panel
    .getByLabel(re, { exact: false })
    .or(panel.getByRole("textbox", { name: re }))
    .or(panel.getByRole("combobox", { name: re }))
    .or(panel.getByPlaceholder(re))
    .or(panel.locator("label").filter({ hasText: re }))
    .first();
}

// ─── Edge connection ────────────────────────────────────────────────

interface ConnectEndpoint {
  /** Canvas node kind: trigger | action | condition | wait | agent | branch | join. */
  kind: string;
  /** Index when the canvas has multiple nodes of this kind (default 0). */
  index?: number;
  /**
   * Specific ReactFlow handle id to connect from/to. Defaults to the
   * first source handle on the from-side and the first target handle
   * on the to-side, which is right for most simple chains. Required
   * for branching nodes — e.g. condition exposes `"true"` and `"false"`
   * source handles, branch exposes `"branch-1"`, `"branch-2"`.
   */
  handleId?: string;
}

/**
 * Draw an edge between two canvas nodes by simulating a mouse drag
 * from the source handle to the target handle.
 *
 * Caveats — these are inherent to ReactFlow + Playwright, not bugs in
 * this helper:
 *   - The canvas must be at default zoom for handle hit-testing to
 *     work cleanly. `openCanvas` leaves it that way.
 *   - Nodes must be off-screen-distinct (auto-layout in WorkflowCanvas
 *     spreads them; if you add 5 nodes in rapid succession the
 *     `addNode` staggering keeps them apart).
 *   - Move the mouse with multiple `steps` so ReactFlow's
 *     onPointerMove fires the connection-line preview — a single
 *     teleport often misses.
 */
export async function connectNodes(
  page: Page,
  source: ConnectEndpoint,
  target: ConnectEndpoint,
): Promise<void> {
  const srcNode = canvasNodes(page, source.kind).nth(source.index ?? 0);
  const tgtNode = canvasNodes(page, target.kind).nth(target.index ?? 0);
  await expect(srcNode, `source node ${source.kind}[${source.index ?? 0}] missing`).toBeVisible();
  await expect(tgtNode, `target node ${target.kind}[${target.index ?? 0}] missing`).toBeVisible();

  // ReactFlow tags handles with class `source` / `target` (NOT a
  // data-handletype attribute) and exposes data-handleid for the
  // user-supplied id. See @xyflow/react Handle component.
  const srcHandle = source.handleId
    ? srcNode.locator(
        `.react-flow__handle.source[data-handleid="${source.handleId}"]`,
      )
    : srcNode.locator(".react-flow__handle.source").first();
  const tgtHandle = target.handleId
    ? tgtNode.locator(
        `.react-flow__handle.target[data-handleid="${target.handleId}"]`,
      )
    : tgtNode.locator(".react-flow__handle.target").first();

  const srcBox = await srcHandle.boundingBox();
  const tgtBox = await tgtHandle.boundingBox();
  if (!srcBox || !tgtBox) {
    throw new Error(
      `connectNodes: missing bounding box. ` +
        `src=${source.kind}/${source.handleId ?? "default"} ` +
        `tgt=${target.kind}/${target.handleId ?? "default"}`,
    );
  }

  const sx = srcBox.x + srcBox.width / 2;
  const sy = srcBox.y + srcBox.height / 2;
  const tx = tgtBox.x + tgtBox.width / 2;
  const ty = tgtBox.y + tgtBox.height / 2;

  await page.mouse.move(sx, sy);
  await page.mouse.down();
  // Stepped move so ReactFlow's pointermove handlers see intermediate
  // positions — a single teleport often misses the drop target.
  await page.mouse.move(tx, ty, { steps: 12 });
  await page.mouse.up();

  // Give RF a tick to commit the edge.
  await page.waitForTimeout(150);
}

/** Count edges currently on the canvas (`.react-flow__edge` is the RF class). */
export function canvasEdges(page: Page): Locator {
  return page.locator(".react-flow__edge");
}

// ─── Persistence ────────────────────────────────────────────────────

/**
 * Click the canvas's Save button and wait for the save round-trip.
 * Returns the automation id, parsed from the PUT workflow URL — that
 * URL embeds the id and fires on both first save AND subsequent
 * saves, so it's the most reliable place to capture it.
 *
 * `/automations/new` does NOT navigate after save (the parent page
 * just updates an internal ref via router.replace with the same path),
 * so don't try to read `page.url()` here.
 *
 * Returns null if the PUT URL has no parseable id (caller decides
 * whether that's fatal).
 */
export async function saveWorkflow(
  page: Page,
  opts: { timeoutMs?: number } = {},
): Promise<string | null> {
  const timeout = opts.timeoutMs ?? 30_000;

  // Close NodeConfigPanel if it's open — its backdrop (fixed inset-0,
  // z-40) covers the toolbar Save button. Without this the click is
  // intercepted and the save round-trip never fires.
  const panel = page.getByTestId("node-config-panel");
  if (await panel.isVisible({ timeout: 500 }).catch(() => false)) {
    await panel
      .getByRole("button", { name: /close/i })
      .first()
      .click();
    await expect(panel).toBeHidden({ timeout: 5_000 });
  }

  // PUT /workspaces/:ws/crm/automations/:id/workflow is the last call
  // in the save chain (after POST /automations and PATCH /automations/:id),
  // so waiting on it covers everything. We accept any response status
  // here (not just 2xx) — the strictness check happens AFTER so a 4xx
  // can be surfaced in the failure message with the body the server
  // returned, rather than swallowing it as a generic timeout.
  const putPromise = page.waitForResponse(
    (r) =>
      r.request().method() === "PUT" &&
      /\/crm\/automations\/[^/]+\/workflow(\?|$)/.test(r.url()),
    { timeout },
  );

  await page
    .getByRole("button", { name: /^save$/i })
    .first()
    .click();

  const resp = await putPromise;
  if (resp.status() >= 400) {
    const body = await resp.text().catch(() => "<unreadable>");
    throw new Error(
      `saveWorkflow: PUT ${resp.url()} returned HTTP ${resp.status()}\n${body}`,
    );
  }
  const m = resp.url().match(/\/automations\/([^/]+)\/workflow/);
  return m ? m[1] : null;
}

/**
 * Delete a seeded automation by id. Best-effort — never throws so it's
 * safe to use in `afterEach` cleanup.
 */
export async function deleteAutomation(
  request: APIRequestContext,
  automationId: string,
): Promise<void> {
  try {
    await request.delete(
      `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}/automations/${automationId}`,
      { headers: authHeaders() },
    );
  } catch {
    // ignore — throwaway resource
  }
}

/**
 * GET the persisted workflow JSON for an automation. Used by tests that
 * want to assert the saved nodes/edges match what they built in the
 * canvas. Endpoint: GET /workspaces/:ws/crm/automations/:id/workflow.
 */
export async function fetchWorkflow(
  request: APIRequestContext,
  automationId: string,
): Promise<{ nodes: unknown[]; edges: unknown[] } | null> {
  const resp = await request.get(
    `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}/crm/automations/${automationId}/workflow`,
    { headers: authHeaders() },
  );
  if (!resp.ok()) return null;
  const body = (await resp.json()) as { nodes?: unknown[]; edges?: unknown[] };
  return { nodes: body.nodes ?? [], edges: body.edges ?? [] };
}
