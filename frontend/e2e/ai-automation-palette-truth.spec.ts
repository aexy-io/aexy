/**
 * E2E: palette honesty — the CRM automation palette exposes ONLY what
 * actually executes, and everything it exposes.
 *
 * Derived from the generated registry fixture, not a hand-written list.
 * The previous version enumerated removed capabilities by hand and had
 * drifted seven entries out of date: delete_record, link_records,
 * enroll_in_sequence, remove_from_sequence, list_entry.added,
 * list_entry.removed and form.submitted had all been un-hidden on the
 * backend while the spec still asserted they were absent. Nothing caught
 * it because this suite only runs with E2E_REAL_BACKEND=1, so a list that
 * has to be edited in lockstep with the backend is a list that silently
 * rots. Regenerate the fixture with `npm run schema:automation` and this
 * spec follows automatically; `npm run schema:automation:check` gates the
 * drift.
 *
 * Live backend, no LLM. The palette reads the registry API; this spec is
 * the UI-side guard that what the registry serves is what a user can pick.
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { backendOnlyReady, setupAiLiveAuth } from "./fixtures/ai-env";
import {
  actionsForModule,
  openCanvas,
  triggersForModule,
} from "./fixtures/automation-helpers";

test.describe.configure({ timeout: 120_000 });

/**
 * Registry ids the palette renders as their own canvas category rather
 * than as an action row. Mirrors STRUCTURAL_CAPABILITIES in
 * NodePalette.tsx — the registry ships them over the action transport,
 * but a user drops a `condition` node, not a "condition" action.
 */
const STRUCTURAL_ACTION_TO_CATEGORY: Record<string, string> = {
  condition: "condition",
  wait: "wait",
  run_agent: "agent",
  branch: "branch",
};

/**
 * Actions the registry serves module-wide but the palette only offers once
 * the workspace has connected the integration behind them. Mirrors
 * INTEGRATION_GATED_ACTIONS in schemas/automation.py. They are legitimately
 * absent on a workspace without that integration, so they cannot be required
 * — but they are still registry members, so they stay allowed.
 */
const INTEGRATION_GATED_ACTIONS = ["send_slack"];

const REGISTRY_ACTIONS = actionsForModule("crm").map((a) => a.id);
const REGISTRY_TRIGGERS = triggersForModule("crm").map((t) => t.id);

/**
 * Action rows the palette must list: registry members, minus the ones shown
 * as their own category, minus the ones gated on a workspace integration.
 */
const EXPECTED_ACTION_SUBTYPES = REGISTRY_ACTIONS.filter(
  (id) =>
    !(id in STRUCTURAL_ACTION_TO_CATEGORY) &&
    !INTEGRATION_GATED_ACTIONS.includes(id),
);

/** Categories the palette should show for structural registry entries. */
const EXPECTED_STRUCTURAL_CATEGORIES = REGISTRY_ACTIONS.filter(
  (id) => id in STRUCTURAL_ACTION_TO_CATEGORY,
).map((id) => STRUCTURAL_ACTION_TO_CATEGORY[id]);

/**
 * Capabilities that must never appear whatever the registry says: they
 * have no executor at all, so offering one records a successful step that
 * did nothing. `join` is here because the engine skips the node outright.
 */
const NEVER_OFFERED_ACTIONS = [
  "api_request",
  "enrich_record",
  "classify_record",
  "generate_summary",
];
const NEVER_OFFERED_CATEGORIES = ["join"];

/** A representative non-CRM trigger that must not leak onto the CRM palette. */
const NON_CRM_TRIGGER_SUBTYPES = [
  "ticket.created",
  "candidate.created",
  "campaign.sent",
];

async function expandCategory(page: Page, kind: string): Promise<void> {
  const category = page.getByTestId(`palette-category-${kind}`);
  if ((await category.getAttribute("aria-expanded")) === "false") {
    await category.click();
  }
}

// Outside the live describe on purpose: this one needs no backend, so it
// still runs in ordinary CI. Every assertion below is driven by the fixture,
// and a fixture that failed to load would make all of them pass vacuously —
// exactly the failure mode this rewrite exists to remove.
test("the automation registry fixture is not empty", () => {
  expect(
    REGISTRY_ACTIONS.length,
    "no CRM actions in the fixture — regenerate with npm run schema:automation",
  ).toBeGreaterThan(0);
  expect(REGISTRY_TRIGGERS.length, "no CRM triggers in the fixture").toBeGreaterThan(0);
});

test.describe("AI / Automation palette honesty (live)", () => {
  test.beforeAll(async ({ browser }) => {
    // describe-level `timeout` applies to tests, not hooks — a hook keeps the
    // 30s default, which is less than the compile this hook exists to absorb.
    test.setTimeout(240_000);
    // Warm the route in a real page. Next's dev server compiles
    // /automations/new on first visit, and that alone can outlast
    // openCanvas's 30s networkidle budget — the first test in the file would
    // then fail on compile time and say nothing about the palette.
    //
    // A plain fetch is not enough: it returns once the HTML is served, while
    // the client chunks the canvas needs are still being built. Loading it in
    // a browser is what actually pays that cost up front.
    const ready = await backendOnlyReady();
    if (!ready.ok) return;
    const page = await browser.newPage();
    try {
      await page.goto("/automations/new?blank=1&module=crm", {
        waitUntil: "domcontentloaded",
        timeout: 180_000,
      });
      await page.locator(".react-flow").first().waitFor({ timeout: 60_000 });
    } catch {
      // Warming is best-effort; the tests below report the real problem.
    } finally {
      await page.close();
    }
  });

  test.beforeEach(async ({ page }) => {
    const ready = await backendOnlyReady();
    test.skip(!ready.ok, ready.reason);
    await setupAiLiveAuth(page);
    await openCanvas(page, { module: "crm" });
  });

  test("core categories are present", async ({ page }) => {
    for (const kind of ["trigger", "action"]) {
      await expect(
        page.getByTestId(`palette-category-${kind}`),
        `"${kind}" category should be available`,
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("structural registry entries appear as their own category", async ({ page }) => {
    for (const kind of EXPECTED_STRUCTURAL_CATEGORIES) {
      await expect(
        page.getByTestId(`palette-category-${kind}`),
        `registry offers this capability, so the "${kind}" category must be pickable`,
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("structural entries the registry withholds are absent", async ({ page }) => {
    const offered = new Set(EXPECTED_STRUCTURAL_CATEGORIES);
    const withheld = Object.values(STRUCTURAL_ACTION_TO_CATEGORY).filter(
      (kind) => !offered.has(kind),
    );
    for (const kind of withheld) {
      await expect(
        page.getByTestId(`palette-category-${kind}`),
        `registry withholds "${kind}", so publishing one would drop it silently`,
      ).toHaveCount(0);
    }
  });

  test("categories with no executor never appear", async ({ page }) => {
    for (const kind of NEVER_OFFERED_CATEGORIES) {
      await expect(
        page.getByTestId(`palette-category-${kind}`),
        `"${kind}" has no executor — the engine skips it silently`,
      ).toHaveCount(0);
    }
  });

  test("every registry action is offered", async ({ page }) => {
    await expandCategory(page, "action");
    for (const sub of EXPECTED_ACTION_SUBTYPES) {
      await expect(
        page.getByTestId(`palette-subtype-action-${sub}`).first(),
        `registry serves action "${sub}" but the palette does not offer it`,
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("no action outside the registry is offered", async ({ page }) => {
    await expandCategory(page, "action");
    const offered = await page
      .locator('[data-testid^="palette-subtype-action-"]')
      .evaluateAll((nodes) =>
        nodes.map((n) =>
          (n.getAttribute("data-testid") ?? "").replace(
            "palette-subtype-action-",
            "",
          ),
        ),
      );

    const unexpected = [...new Set(offered)].filter(
      (id) => !REGISTRY_ACTIONS.includes(id),
    );
    expect(
      unexpected,
      "palette offers actions the registry does not serve — each is a step a " +
        "user can configure with no executor behind it",
    ).toEqual([]);
  });

  test("actions with no executor are never offered", async ({ page }) => {
    await expandCategory(page, "action");
    for (const sub of NEVER_OFFERED_ACTIONS) {
      await expect(
        page.getByTestId(`palette-subtype-action-${sub}`),
        `action "${sub}" has no handler — offering it records a success that did nothing`,
      ).toHaveCount(0);
    }
  });

  test("every registry trigger is offered, and only CRM ones", async ({ page }) => {
    await expandCategory(page, "trigger");
    for (const sub of REGISTRY_TRIGGERS) {
      await expect(
        page.getByTestId(`palette-subtype-trigger-${sub}`).first(),
        `registry serves trigger "${sub}" but the palette does not offer it`,
      ).toBeVisible({ timeout: 10_000 });
    }
    for (const sub of NON_CRM_TRIGGER_SUBTYPES) {
      await expect(
        page.getByTestId(`palette-subtype-trigger-${sub}`),
        `non-CRM trigger "${sub}" should not leak onto the CRM palette`,
      ).toHaveCount(0);
    }
  });
});
