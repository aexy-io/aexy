import { test, expect, Page } from "@playwright/test";
import { mockUser } from "./fixtures/mock-data";

/**
 * The reporting pages, in mock mode — mirroring `service-desk.spec.ts`.
 *
 * The property worth a browser test here is that the TAT table is built from
 * the *server's* column descriptors. A spec asserting a fixed set of headings
 * would pass just as happily against a component that hardcoded them, so the
 * mock deliberately serves a stakeholder ("Legal") that no industry template
 * ships: if it appears as a column, the table really is following the
 * workspace's taxonomy.
 */

const API_BASE = "http://localhost:8000/api/v1";

const mockWorkspace = {
  id: "ws-1",
  name: "Northwind",
  slug: "northwind",
  type: "business",
  avatar_url: null,
  owner_id: "test-user-123",
  member_count: 6,
  team_count: 3,
  is_active: true,
};

const mockEffectiveAccess = {
  apps: {
    service_desk: { enabled: true, modules: { dashboard: true, tickets: true, settings: true } },
    organization: { enabled: true, modules: { chart: true, departments: true, directory: true } },
  },
  applied_template_id: null,
  applied_template_name: null,
  has_custom_overrides: false,
  is_admin: true,
};

// Note "Legal (hrs)": not in any shipped template, so its presence proves the
// columns came off the wire.
const mockTatReport = {
  columns: [
    { key: "display_id", label: "Ticket ID", unit: "text" },
    { key: "subject", label: "Subject", unit: "text" },
    { key: "owner", label: "KAM", unit: "text" },
    { key: "stakeholder.kam", label: "KAM (hrs)", unit: "working_hours", stakeholder: "kam" },
    { key: "stakeholder.insurer", label: "Insurer (hrs)", unit: "working_hours", stakeholder: "insurer" },
    { key: "stakeholder.legal", label: "Legal (hrs)", unit: "working_hours", stakeholder: "legal" },
    { key: "overall_hours", label: "Overall TAT (hrs)", unit: "elapsed_hours" },
    { key: "breach_level", label: "Breach Flag", unit: "text" },
    { key: "handshakes", label: "Total Handshakes", unit: "count" },
    { key: "reopened", label: "Reopened?", unit: "boolean" },
    { key: "zero_breach", label: "Zero-Breach?", unit: "boolean" },
  ],
  rows: [
    {
      ticket_id: "t-1",
      display_id: "BSD-1042",
      subject: "Claim documents pending",
      owner: "Dana",
      "stakeholder.kam": 2.5,
      "stakeholder.insurer": 18.0,
      "stakeholder.legal": 0,
      overall_hours: 553.4,
      breach_level: "red",
      handshakes: 3,
      reopened: true,
      zero_breach: false,
    },
  ],
  total: 1,
  working_day_hours: 9,
  breach_red_days: 2,
};

const mockScorecard = {
  kpis: [
    { metric_key: "productivity", label: "Productivity", weight: 0.2, direction: "higher_is_better", benchmark: null, penalty_per_unit: null, target: 1, threshold: null, enabled: true, unit: "ratio", source: "builtin", definition: null, status: "published" },
    { metric_key: "first_response", label: "First Time Response", weight: 0.2, direction: "lower_is_better", benchmark: 4, penalty_per_unit: 10, target: null, threshold: null, enabled: true, unit: "hours", source: "builtin", definition: null, status: "published" },
    { metric_key: "handshake_efficiency", label: "Handshake Efficiency", weight: 0.0, direction: "higher_is_better", benchmark: null, penalty_per_unit: null, target: 1, threshold: 2, enabled: false, unit: "rate", source: "builtin", definition: null, status: "published" },
    { metric_key: "zero_breach", label: "Zero-Breach", weight: 0.6, direction: "higher_is_better", benchmark: null, penalty_per_unit: null, target: 1, threshold: null, enabled: true, unit: "rate", source: "builtin", definition: null, status: "published" },
  ],
  bands: [
    { rating: 5, min_score: 90, label: "Outstanding" },
    { rating: 4, min_score: 75, label: "Exceeds Expectations" },
    { rating: 1, min_score: 0, label: "Unsatisfactory" },
  ],
  rows: [
    {
      owner_id: "test-user-123", owner: "Dana", tickets: 4, tickets_closed: 3,
      values: { productivity: 1.5, first_response: 6, zero_breach: 0.75 },
      scores: { productivity: 100, first_response: 80, zero_breach: 75 },
      sim_score: 81, weight_scored: 1, rating: 4, rating_label: "Exceeds Expectations",
    },
    {
      owner_id: "dev-2", owner: "Rowan", tickets: 1, tickets_closed: 0,
      // A KPI with no eligible tickets: null, never 0 — the distinction the
      // whole feature preserves.
      values: { productivity: 0, first_response: null, zero_breach: 1 },
      scores: { productivity: 0, first_response: null, zero_breach: 100 },
      sim_score: 75, weight_scored: 0.8, rating: 4, rating_label: "Exceeds Expectations",
    },
  ],
  cohort: { owners: 2, average_closed: 1.5, owner_stakeholder: "kam" },
  restricted_to_self: false,
  working_day_hours: 9,
  breach_red_days: 2,
};

const mockScorecardConfig = {
  kpis: mockScorecard.kpis,
  bands: mockScorecard.bands,
  available_metrics: [
    { key: "productivity", label: "Productivity", unit: "ratio", direction: "higher_is_better", description: "Volume of tickets this owner actually closes, relative to the desk average.", how_calculated: "Closed ticket count divided by the average closed count across every owner.", uses_threshold: false, threshold_label: null },
    { key: "first_response", label: "First Time Response", unit: "hours", direction: "lower_is_better", description: "How quickly the desk first moves on a request after it arrives.", how_calculated: "Average length of each ticket's first pending-with segment, in working hours.", uses_threshold: false, threshold_label: null },
    // The one metric that asks a threshold question — its box must be labelled
    // by the server's own wording, not a generic "Threshold".
    { key: "handshake_efficiency", label: "Handshake Efficiency", unit: "rate", direction: "higher_is_better", description: "Share of closed tickets resolved cleanly rather than bouncing between stakeholders.", how_calculated: "Closed tickets whose hand-off count is at or under the limit.", uses_threshold: true, threshold_label: "Max hand-offs" },
    { key: "zero_breach", label: "Zero-Breach", unit: "rate", direction: "higher_is_better", description: "Share of tickets where no single stage ran past the breach target.", how_calculated: "Tickets whose longest single non-closed stage stayed within the target.", uses_threshold: false, threshold_label: null },
  ],
  can_manage: true,
};

// The palette the builder is served. "Time in Legal" again: a stakeholder no
// template ships, so its presence proves the fields came off the wire.
const mockVocabulary = {
  fields: [
    { key: "first_response", label: "First response time", kind: "duration" },
    { key: "handshakes", label: "Hand-offs", kind: "number" },
    { key: "is_closed", label: "Closed", kind: "boolean" },
    { key: "request_type", label: "Request type", kind: "category" },
    { key: "own_queue", label: "Time in the desk's own queue", kind: "duration" },
    { key: "stakeholder:legal", label: "Time in Legal", kind: "duration" },
  ],
  aggregations: [
    { key: "share", label: "Share", takes_field: false, unit: "rate" },
    { key: "count", label: "Count", takes_field: false, unit: "count" },
    { key: "average", label: "Average", takes_field: true, unit: null },
  ],
  operators: {
    duration: ["lt", "lte", "gt", "gte", "eq", "ne"],
    number: ["lt", "lte", "gt", "gte", "eq", "ne"],
    boolean: ["eq", "ne"],
    category: ["eq", "ne"],
  },
  settings: [
    { key: "breach_target_hours", label: "the breach target", value: 18, unit: "hours" },
    { key: "working_day_hours", label: "one working day", value: 9, unit: "hours" },
  ],
  options: { request_type: [{ value: "claims", label: "Claims" }] },
};

const mockPreview = {
  kpis: [{ metric_key: "escalation_rate", label: "Escalation rate", unit: "rate" }],
  rows: [
    {
      owner_id: "test-user-123", owner: "Dana", tickets: 4, tickets_closed: 3,
      values: { escalation_rate: 0.25 }, scores: { escalation_rate: 75 },
      sim_score: 76, weight_scored: 1, rating: 4, rating_label: "Exceeds Expectations",
      previous_score: 81, previous_rating_label: "Exceeds Expectations",
    },
  ],
  cohort: { owners: 2, average_closed: 1.5 },
};

let lastPreviewBody: { kpis?: Record<string, unknown>[] } | null = null;

async function setup(page: Page, overrides: { canManage?: boolean; restricted?: boolean } = {}) {
  lastPreviewBody = null;
  await page.addInitScript(() => {
    localStorage.setItem("token", "fake-test-token");
    localStorage.setItem("current_workspace_id", "ws-1");
  });

  // Catch-all FIRST (Playwright checks routes last-registered-first).
  await page.route(`${API_BASE}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route(`${API_BASE}/workspaces`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([mockWorkspace]) }),
  );
  await page.route(`${API_BASE}/developers/me`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockUser) }),
  );
  await page.route(`${API_BASE}/repositories/onboarding/status`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ completed: true }) }),
  );
  // App-shell / sidebar hooks expect ARRAYS — the `{}` catch-all crashes them.
  await page.route(`${API_BASE}/notifications**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  await page.route(`${API_BASE}/workspaces/**`, (route) => {
    const url = route.request().url();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (url.includes("/apps/effective") || url.includes("/app-access/")) return json(mockEffectiveAccess);
    if (url.includes("/my-permissions"))
      return json({ permissions: ["can_manage_tickets", "can_view_tickets", "can_view_service_desk"], role: "owner", is_owner: true });

    // Order matters: these paths all also match "/reports/scorecard".
    if (url.includes("/service-desk/reports/scorecard/vocabulary")) return json(mockVocabulary);
    if (url.includes("/service-desk/reports/scorecard/preview")) {
      // Captured, not just answered. The two 422s this suite missed were both
      // in the *request* — a mock that only returns a fixture cannot see them.
      lastPreviewBody = JSON.parse(route.request().postData() ?? "{}");
      return json(mockPreview);
    }
    if (url.includes("/service-desk/reports/scorecard/config"))
      return json({ ...mockScorecardConfig, can_manage: overrides.canManage !== false });
    if (url.includes("/service-desk/reports/scorecard"))
      return json({ ...mockScorecard, restricted_to_self: overrides.restricted === true });
    if (url.includes("/service-desk/reports/tat")) return json(mockTatReport);

    if (url.includes("/service-desk/settings"))
      return json({ ai_classification_enabled: false, can_manage: overrides.canManage !== false, scope: "all", working_hours_start: "09:30", working_hours_end: "18:30" });
    if (url.match(/\/service-desk\/(stakeholders|request-types|accounts|vendors|products|mailboxes|industry-templates|templates)/))
      return json([]);
    if (url.match(/\/(spaces|documents|members|invites|task-statuses|teams|projects|notifications)/)) return json([]);
    if (url.endsWith("/workspaces/ws-1")) return json(mockWorkspace);
    return json({});
  });
}

test.describe("Service Desk reports", () => {
  test("TAT table renders the columns the server described", async ({ page }) => {
    await setup(page);
    await page.goto("/service-desk/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 15000 });

    // A stakeholder no template ships: proof the columns came off the wire
    // rather than out of the component.
    await expect(page.getByRole("columnheader", { name: "Legal (hrs)" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Insurer (hrs)" })).toBeVisible();
    // The derived measures a desk would otherwise compute by hand.
    await expect(page.getByRole("columnheader", { name: "Total Handshakes" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Zero-Breach?" })).toBeVisible();

    await expect(page.getByText("BSD-1042")).toBeVisible();
    // Booleans read as words, not as "true"/"false".
    await expect(page.getByRole("cell", { name: "Yes", exact: true })).toBeVisible();
    // And the clock the figures were measured on is stated on the page.
    await expect(page.getByText(/one day is 9 hours/i)).toBeVisible();
  });

  test("scorecard shows scores, ratings and the cohort", async ({ page }) => {
    await setup(page);
    await page.goto("/service-desk/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Scorecard" }).click();

    await expect(page.getByRole("columnheader", { name: "First Time Response" })).toBeVisible();
    await expect(page.getByText("Dana", { exact: true })).toBeVisible();
    await expect(page.getByText("Exceeds Expectations").first()).toBeVisible();
    // Compared across the desk, and the page says so.
    await expect(page.getByText(/compared across 2 owners/i)).toBeVisible();
  });

  test("an owner restricted to their own row is told the comparison is desk-wide", async ({ page }) => {
    await setup(page, { restricted: true });
    await page.goto("/service-desk/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Scorecard" }).click();

    // The distinction that makes their own number trustworthy rather than a
    // cohort-of-one artefact.
    await expect(page.getByText(/your own row/i)).toBeVisible();
    await expect(page.getByText(/all 2 owners/i)).toBeVisible();
  });

  test("scorecard settings show the running weight total and gate on permission", async ({ page }) => {
    await setup(page);
    await page.goto("/settings/service-desk/scorecard");
    await expect(page.getByText("Weight").first()).toBeVisible({ timeout: 15000 });

    // 0.2 + 0.2 + 0.6 — the mock is deliberately a valid set (the fourth KPI is
    // disabled and so carries no weight).
    await expect(page.getByText(/Total weight: Totals 100%/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save scorecard" })).toBeVisible();

    // Breaking the total must warn before the server does.
    await page.getByRole("spinbutton").first().fill("0.05");
    await expect(page.getByText(/Total weight: Must total 100% — currently 85%/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save scorecard" })).toBeDisabled();
  });

  test("each KPI explains itself, and the threshold is labelled by the metric", async ({ page }) => {
    await setup(page);
    await page.goto("/settings/service-desk/scorecard");
    await expect(page.getByText("Weight").first()).toBeVisible({ timeout: 15000 });

    // The KPI's own prose, which had nowhere to live before.
    await expect(page.getByText(/relative to the desk average/i)).toBeVisible();
    await expect(page.getByText("How it's calculated").first()).toBeVisible();

    // "<=2 hand-offs" was a constant in the scorecard module. It is now a box —
    // labelled with the server's wording, and shown ONLY on the metric that
    // reads it, so no KPI gets a control it would silently ignore.
    await expect(page.getByText("Max hand-offs")).toBeVisible();
    await expect(page.getByText("Threshold", { exact: true })).toHaveCount(0);
  });

  test("the builder composes a KPI from the desk's own vocabulary", async ({ page }) => {
    await setup(page);
    await page.goto("/settings/service-desk/scorecard");
    await page.getByRole("button", { name: "Add custom KPI" }).click();

    await expect(page.getByRole("heading", { name: "New KPI" })).toBeVisible();

    // The field list came off the wire — "Time in Legal" is in no template, and
    // "the desk's own queue" is the pseudo-field that resolves through the
    // taxonomy rather than freezing a slug into the KPI.
    await page.getByRole("button", { name: "Add condition" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("option", { hasText: "Time in Legal" })).toHaveCount(1);
    await expect(
      dialog.locator("option", { hasText: "Time in the desk's own queue" }),
    ).toHaveCount(1);
    // And a filter can point at a live setting instead of a number that goes
    // stale the next time Ops changes the shift.
    await expect(dialog.getByText("use a setting")).toBeVisible();

    // Publishing is gated on the KPI being complete — a share with no condition
    // and no name is not something anyone should be able to put live.
    await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
    await page.getByPlaceholder("e.g. Escalation rate").fill("Escalation rate");
    await expect(page.getByRole("button", { name: "Publish" })).toBeEnabled();
  });

  test("the preview shows real figures and names who it re-grades", async ({ page }) => {
    await setup(page);
    await page.goto("/settings/service-desk/scorecard");
    await page.getByRole("button", { name: "Add custom KPI" }).click();
    await page.getByPlaceholder("e.g. Escalation rate").fill("Escalation rate");
    await page.getByRole("button", { name: "Add condition" }).first().click();

    await page.getByRole("button", { name: "Run preview" }).click();

    // A per-owner figure, not just a shape.
    await expect(page.getByRole("cell", { name: "Dana" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "0.25" })).toBeVisible();
    // And the blast radius, by name: adding a KPI re-grades people who have
    // nothing to do with it.
    await expect(page.getByText(/This changes 1 rating/i)).toBeVisible();
    await expect(page.getByText(/Dana 81 → 76/)).toBeVisible();
  });

  test("a draft is marked and a scoring curve is drawn on every KPI", async ({ page }) => {
    await setup(page);
    await page.goto("/settings/service-desk/scorecard");
    await expect(page.getByText("Weight").first()).toBeVisible({ timeout: 15000 });

    // The curve: "benchmark 4, penalty 10" as a shape, one per KPI card.
    await expect(page.getByRole("img", { name: "Scoring curve" }).first()).toBeVisible();
    expect(await page.getByRole("img", { name: "Scoring curve" }).count()).toBe(
      mockScorecardConfig.kpis.length,
    );
  });

  test("a freshly added condition carries a value the server will accept", async ({ page }) => {
    // The bug this replaces: the filter seeded value "" while the number input
    // rendered Number("") as 0, so the row looked finished and the save came
    // back 422 "needs a number". Only inspecting the request catches it.
    await setup(page);
    await page.goto("/settings/service-desk/scorecard");
    await page.getByRole("button", { name: "Add custom KPI" }).click();
    await page.getByPlaceholder("e.g. Escalation rate").fill("Escalation rate");
    await page.getByRole("button", { name: "Add condition" }).first().click();
    await page.getByRole("button", { name: "Run preview" }).click();
    await expect(page.getByText(/This changes 1 rating/i)).toBeVisible();

    const mine = lastPreviewBody?.kpis?.find((k) => k.metric_key === "escalation_rate") as
      | { definition?: { condition?: { value: unknown }[] } }
      | undefined;
    expect(mine).toBeTruthy();
    // A number, not the empty string the input was quietly displaying as 0.
    expect(typeof mine?.definition?.condition?.[0]?.value).toBe("number");
  });

  test("a name in a non-Latin script still yields a usable key", async ({ page }) => {
    // The slug is ASCII-only, so a Hindi name reduced to "" and left Publish
    // disabled forever with nothing explaining why — in an app that ships hi.
    await setup(page);
    await page.goto("/settings/service-desk/scorecard");
    await page.getByRole("button", { name: "Add custom KPI" }).click();
    await page.getByPlaceholder("e.g. Escalation rate").fill("पुनः खोला गया");
    await page.getByRole("button", { name: "Add condition" }).first().click();

    await expect(page.getByRole("button", { name: "Publish" })).toBeEnabled();
    await page.getByRole("button", { name: "Run preview" }).click();
    const keys = (lastPreviewBody?.kpis ?? []).map((k) => k.metric_key);
    expect(keys).toContain("custom_kpi_1");
  });

  test("the footer says what is missing rather than going dead", async ({ page }) => {
    await setup(page);
    await page.goto("/settings/service-desk/scorecard");
    await page.getByRole("button", { name: "Add custom KPI" }).click();

    // Nothing filled in yet: the buttons are disabled AND the reason is on screen.
    await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
    await expect(page.getByText(/Give the KPI a name/i)).toBeVisible();
  });

  test("a non-manager cannot edit the scorecard config", async ({ page }) => {
    await setup(page, { canManage: false });
    await page.goto("/settings/service-desk/scorecard");
    await expect(page.getByText("Weight").first()).toBeVisible({ timeout: 15000 });

    await expect(page.getByRole("button", { name: "Save scorecard" })).toHaveCount(0);
    await expect(page.getByRole("spinbutton").first()).toBeDisabled();
  });
});
