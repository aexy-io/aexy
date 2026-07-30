import { test, expect, Page } from "@playwright/test";
import { mockUser } from "./fixtures/mock-data";

const API_BASE = "http://localhost:8000/api/v1";

const mockWorkspace = {
  id: "ws-1",
  name: "Bimaplan",
  slug: "bimaplan",
  type: "business",
  avatar_url: null,
  owner_id: "test-user-123",
  member_count: 6,
  team_count: 3,
  is_active: true,
};

// Effective app-access with the Service Desk (+ Organization) apps enabled so
// the AppAccessGuard lets the page render.
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

const mockDashboard = {
  total_open: 3,
  breaching: 1,
  stakeholders: [
    { pending_with: "kam", green: 2, amber: 0, red: 0, total: 2 },
    { pending_with: "insurer", green: 0, amber: 0, red: 1, total: 1 },
  ],
  tickets: [
    {
      ticket_id: "t-1", display_id: "BSD-1042", subject: "Policy status", lob_name: "Credit Life",
      partner_name: "ABC Finance", request_type: "claims", pending_with: "insurer",
      assigned_kam_id: "test-user-123", days_in_stage: 3.2, overall_days: 3.2, breach_level: "red",
      needs_triage: false, status: "in_progress",
    },
    {
      ticket_id: "t-2", display_id: "BSD-1043", subject: "New borrower batch", lob_name: "GPA",
      partner_name: "XYZ NBFC", request_type: "policy_issuance", pending_with: "kam",
      assigned_kam_id: "test-user-123", days_in_stage: 0.2, overall_days: 0.2, breach_level: "green",
      needs_triage: true, status: "new",
    },
  ],
};

const mockPartners = [
  { id: "p-1", workspace_id: "ws-1", name: "ABC Finance", assigned_kam_id: "test-user-123", is_active: true, domains: ["abcfinance.com"], created_at: "2026-07-01T00:00:00Z" },
];
const mockTemplates = [
  { key: "receipt", name: "Service Desk — Receipt", subject: "{{display_id}} {{subject}}", body: "Dear {{requester_name}}…", variables: ["requester_name", "display_id", "subject"], customised: false },
  { key: "closure", name: "Service Desk — Closure", subject: "Resolved {{display_id}}", body: "…", variables: ["display_id"], customised: false },
  { key: "digest", name: "Service Desk — Daily Digest", subject: "Daily Open Tickets — {{date}}", body: "…", variables: ["date"], customised: false },
];

async function setup(page: Page) {
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
  // App-shell / sidebar hooks expect ARRAYS — the `{}` catch-all would crash them.
  await page.route(`${API_BASE}/notifications**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  await page.route(`${API_BASE}/workspaces/**`, (route) => {
    const url = route.request().url();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (url.includes("/apps/effective") || url.includes("/app-access/")) return json(mockEffectiveAccess);
    if (url.includes("/service-desk/dashboard")) return json(mockDashboard);
    if (url.includes("/service-desk/tickets")) return json(mockDashboard.tickets);
    if (url.includes("/service-desk/settings"))
      return json({ ai_classification_enabled: false, can_manage: true, scope: "all", working_hours_start: "09:30", working_hours_end: "18:30" });
    if (url.includes("/service-desk/partners")) return json(mockPartners);
    if (url.includes("/service-desk/templates")) return json(mockTemplates);
    if (url.match(/\/service-desk\/(insurers|lobs|mailboxes)/)) return json([]);
    // App-shell / sidebar collections (must return arrays, not {})
    if (url.match(/\/(spaces|documents|members|invites|task-statuses|teams|projects|notifications)/)) return json([]);
    if (url.endsWith("/workspaces/ws-1")) return json(mockWorkspace);
    return json({});
  });
}

test.describe("Service Desk UI", () => {
  test("dashboard shows stakeholder matrix + open tickets", async ({ page }) => {
    await setup(page);
    await page.goto("/service-desk");
    await expect(page.getByRole("heading", { name: "Service Desk" })).toBeVisible({ timeout: 15000 });

    // Stat tiles + stakeholder × age matrix
    await expect(page.getByText(/Breaching/i)).toBeVisible();
    await expect(page.getByText("Open tickets by stakeholder and age")).toBeVisible();
    await expect(page.getByText("KAM").first()).toBeVisible(); // stakeholder row
    await expect(page.getByText("Insurer").first()).toBeVisible();

    // Individual ticket rows
    await expect(page.getByText("BSD-1042")).toBeVisible();
    await expect(page.getByText("ABC Finance").first()).toBeVisible();
    await expect(page.getByText("Triage").first()).toBeVisible(); // BSD-1043 needs_triage
  });

  test("clicking a ticket opens its detail", async ({ page }) => {
    await setup(page);
    // Detail fetches a single ticket
    await page.route(`${API_BASE}/workspaces/ws-1/service-desk/tickets/t-1`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...mockDashboard.tickets[0], id: "sd-1", workspace_id: "ws-1", ticket_number: 1042,
          requester_email: "rahul@abcfinance.com", requester_name: "Rahul", ai_confidence: null,
          origin: "email", insurer_id: null, lob_id: null, partner_id: "p-1", body: "Please check",
          linked_task_id: null, created_at: "2026-07-01T00:00:00Z",
          segments: [
            { id: "s1", pending_with: "kam", entered_at: "2026-07-01T10:00:00Z", exited_at: "2026-07-01T14:00:00Z", duration_seconds: 14400, changed_by_id: null, note: "Ticket created" },
            { id: "s2", pending_with: "insurer", entered_at: "2026-07-01T14:00:00Z", exited_at: null, duration_seconds: null, changed_by_id: null, note: "sent" },
          ],
          tat: { overall_seconds: 276480, overall_days: 3.2, current_pending_with: "insurer", current_stage_seconds: 262080, current_stage_days: 3.0, breach_level: "red", stakeholder_seconds: { kam: 14400, insurer: 262080 } },
        }),
      }),
    );

    await page.goto("/service-desk");
    await page.waitForSelector("text=BSD-1042", { timeout: 15000 });
    await page.getByText("BSD-1042").click();

    await expect(page.getByText("Handoff timeline")).toBeVisible();
    await expect(page.getByText("Overall TAT")).toBeVisible();
    await expect(page.getByText("Move to")).toBeVisible();
  });

  test("master data page shows AI toggle and email templates", async ({ page }) => {
    await setup(page);
    await page.goto("/service-desk/settings");
    await page.waitForSelector("text=Master Data", { timeout: 15000 });

    await expect(page.getByText("AI email categorisation")).toBeVisible();
    await expect(page.getByText("Email templates")).toBeVisible();
    await expect(page.getByText("Service Desk — Receipt")).toBeVisible();
    await expect(page.getByText("ABC Finance").first()).toBeVisible(); // seeded partner row

    // A manager sees the editing affordances.
    await expect(page.getByRole("switch")).toBeEnabled();
    await expect(page.getByRole("button", { name: "Add" }).first()).toBeVisible();
    await expect(page.getByLabel("delete").first()).toBeVisible();
    await expect(page.getByText(/read-only access/i)).toHaveCount(0);
  });

  test("ops can edit the working hours the breach clock runs on", async ({ page }) => {
    await setup(page);
    let patched: Record<string, unknown> | null = null;
    await page.route(`${API_BASE}/workspaces/ws-1/service-desk/settings`, async (route) => {
      if (route.request().method() === "PATCH") {
        patched = route.request().postDataJSON();
        return route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({
            ai_classification_enabled: false, can_manage: true, scope: "all",
            working_hours_start: "10:00", working_hours_end: "19:00",
          }),
        });
      }
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          ai_classification_enabled: false, can_manage: true, scope: "all",
          working_hours_start: "09:30", working_hours_end: "18:30",
        }),
      });
    });

    await page.goto("/service-desk/settings");
    await expect(page.getByRole("heading", { name: "Working hours" })).toBeVisible({ timeout: 15000 });

    const from = page.locator('input[type="time"]').first();
    const to = page.locator('input[type="time"]').nth(1);
    await expect(from).toHaveValue("09:30");
    await expect(to).toHaveValue("18:30");
    // The shift length is spelled out, so "2 days" is not ambiguous.
    await expect(page.getByText(/Shift is 9\.0h/)).toBeVisible();

    // Nothing to save until something changes.
    await expect(page.getByRole("button", { name: "Save hours" })).toBeDisabled();

    // An inverted window is refused client-side, before any request.
    await from.fill("20:00");
    await expect(page.getByText(/end must be later than the start/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save hours" })).toBeDisabled();

    // A valid change saves, and sends only the two fields it changed.
    await from.fill("10:00");
    await to.fill("19:00");
    await page.getByRole("button", { name: "Save hours" }).click();
    await expect.poll(() => patched).toEqual({
      working_hours_start: "10:00",
      working_hours_end: "19:00",
    });
  });

  test("master data is read-only without can_manage_service_desk", async ({ page }) => {
    await setup(page);
    // Same page, but the API reports the caller cannot manage the service desk.
    await page.route(`${API_BASE}/workspaces/ws-1/service-desk/settings`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ai_classification_enabled: false, can_manage: false, scope: "function", working_hours_start: "09:30", working_hours_end: "18:30" }),
      }),
    );

    await page.goto("/service-desk/settings");
    await page.waitForSelector("text=Master Data", { timeout: 15000 });

    // Data is still visible ...
    await expect(page.getByText("ABC Finance").first()).toBeVisible();
    await expect(page.getByText("Service Desk — Receipt")).toBeVisible();
    // ... but nothing is editable, and the reason is stated.
    await expect(page.getByText(/read-only access/i)).toBeVisible();
    await expect(page.getByRole("switch")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Add" })).toHaveCount(0);
    await expect(page.getByLabel("delete")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
    // The working hours are visible but not editable, and cannot be saved.
    await expect(page.locator('input[type="time"]').first()).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save hours" })).toHaveCount(0);
  });

  test("tickets page explains an empty list caused by no department", async ({ page }) => {
    await setup(page);
    // A caller in no department: the row filter can never match, so the list is
    // empty for a reason that has nothing to do with how busy the desk is.
    await page.route(`${API_BASE}/workspaces/ws-1/service-desk/settings`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ai_classification_enabled: false, can_manage: false, scope: "none", working_hours_start: "09:30", working_hours_end: "18:30" }),
      }),
    );
    await page.route(`${API_BASE}/workspaces/ws-1/service-desk/tickets`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );

    await page.goto("/service-desk/tickets");
    await expect(page.getByText(/not in a department yet/i)).toBeVisible({ timeout: 15000 });
  });

  test("tickets page does not cry misconfiguration when the desk is merely quiet", async ({ page }) => {
    await setup(page);
    // Same empty list, but the caller IS in a department — so this is a quiet
    // day, and claiming a misconfiguration would be wrong.
    await page.route(`${API_BASE}/workspaces/ws-1/service-desk/tickets`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );

    await page.goto("/service-desk/tickets");
    // h1 is the page title; the empty state repeats it as an h3.
    await expect(page.getByRole("heading", { name: "Tickets", level: 1 })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/not in a department yet/i)).toHaveCount(0);
  });
});
