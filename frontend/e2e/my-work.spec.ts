/**
 * Home: the personal work list, as a dashboard.
 *
 * It used to be a standalone page at /my-work, behind a nav item most people
 * never opened, while the landing page showed skill charts. It is the landing
 * page now, assembled from widgets on their own layout surface.
 *
 * These pin the four things that were broken about the old list and are easy to
 * break again: it showed every workspace at once with no way to say which one
 * you meant; its rows were `<button onClick>` handlers that resolved to nothing
 * for bugs and stories; its stat cards were inert `<div>`s; and it carried a
 * Manage Forms button that belonged in settings.
 */

import { test, expect, type Page, type Route } from "@playwright/test";
import { mockUser } from "./fixtures/task-test-helpers";

const API_BASE = "**/api/v1";

const WORKSPACES = [
  { id: "ws-1", name: "Acme", slug: "acme", owner_id: "dev-1", is_active: true },
  { id: "ws-2", name: "Globex", slug: "globex", owner_id: "dev-1", is_active: true },
];

const TASKS = [
  {
    id: "task-1",
    item_type: "task",
    title: "Wire the webhook",
    status: "in_progress",
    priority: "medium",
    story_points: 3,
    sprint_id: "sprint-1",
    project_id: "project-1",
    sprint_name: "Sprint 42",
    workspace_id: "ws-1",
    workspace_name: "Acme",
    epic_id: null,
    reference: "[acme:12]",
    labels: [],
    description: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  },
  {
    id: "bug-1",
    item_type: "bug",
    title: "Login 500s on retry",
    status: "new",
    priority: "high",
    story_points: null,
    sprint_id: null,
    project_id: "project-9",
    sprint_name: null,
    workspace_id: "ws-1",
    workspace_name: "Acme",
    epic_id: null,
    reference: "BUG-4",
    labels: [],
    description: null,
    created_at: "2026-07-30T00:00:00Z",
    updated_at: "2026-07-30T00:00:00Z",
  },
  {
    id: "story-1",
    item_type: "story",
    title: "Bulk import",
    status: "todo",
    priority: "low",
    story_points: 8,
    sprint_id: null,
    project_id: null,
    sprint_name: null,
    workspace_id: "ws-1",
    workspace_name: "Acme",
    epic_id: "epic-7",
    reference: "STORY-2",
    labels: [],
    description: null,
    created_at: "2026-07-29T00:00:00Z",
    updated_at: "2026-07-29T00:00:00Z",
  },
];

const TICKET = {
  id: "ticket-1",
  form_id: "form-1",
  ticket_number: 41,
  submitter_email: "customer@example.com",
  submitter_name: "Jo Customer",
  status: "new",
  priority: "urgent",
  sla_breached: true,
  created_at: "2026-08-03T00:00:00Z",
  updated_at: "2026-08-03T00:00:00Z",
  form_name: "Support",
  assignee_name: "Dev User",
};

const MY_WORK_PREFERENCES = {
  id: "prefs-1",
  developer_id: "dev-1",
  preset_type: "my_work",
  visible_widgets: ["myWorkStats", "myWorkQueue", "myWorkByType"],
  widget_order: ["myWorkStats", "myWorkQueue", "myWorkByType"],
  widget_sizes: {},
  layout: {},
  checklist_progress: [],
  checklist_dismissed: true,
  sidebar_page_visits: {},
  sidebar_pinned_items: [],
  sidebar_persona: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const json = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

/** Every request the home dashboard makes, and a record of the ones we assert on. */
async function setupHomeMocks(page: Page) {
  const assignedTaskUrls: string[] = [];
  const ticketUrls: string[] = [];

  await page.addInitScript(() => {
    localStorage.setItem("token", "fake-test-token");
    localStorage.setItem("current_workspace_id", "ws-1");
    localStorage.setItem("aexy_onboarding_complete", "true");
    // The scope selector persists; start every test from the default.
    localStorage.removeItem("my-work-filters");
  });

  // Playwright checks routes in reverse registration order, so the catch-all
  // goes first and the specific handlers after it. It answers with an empty
  // list rather than an empty object: most of what the app shell fetches on
  // every page (document spaces, agents, teams) is list-shaped, and `{}` makes
  // those crash before the dashboard under test ever renders.
  await page.route(`${API_BASE}/**`, (route) => json(route, []));

  // The app shell polls notifications on every page and expects a list shape;
  // the catch-all's bare list would crash it before the dashboard rendered.
  await page.route(`${API_BASE}/notifications**`, (route) =>
    json(route, { notifications: [], unread_count: 0, has_next: false, total: 0 })
  );
  // Without this the shell decides onboarding is unfinished and renders the
  // setup wizard over every route.
  await page.route(`${API_BASE}/repositories/onboarding/status`, (route) =>
    json(route, { completed: true })
  );

  await page.route(`${API_BASE}/developers/me`, (route) => json(route, mockUser));
  await page.route(`${API_BASE}/workspaces`, (route) => json(route, WORKSPACES));
  await page.route(`${API_BASE}/workspaces/ws-1`, (route) => json(route, WORKSPACES[0]));
  await page.route(`${API_BASE}/workspaces/ws-2`, (route) => json(route, WORKSPACES[1]));
  await page.route(`${API_BASE}/workspaces/*/app-access/members/*/effective`, (route) =>
    json(route, {
      apps: {
        dashboard: { app_id: "dashboard", enabled: true, modules: {} },
        sprints: { app_id: "sprints", enabled: true, modules: {} },
        tickets: { app_id: "tickets", enabled: true, modules: {} },
      },
      applied_template_id: null,
      applied_template_name: null,
      has_custom_overrides: false,
      is_admin: true,
    })
  );
  await page.route(`${API_BASE}/dashboard/preferences**`, (route) =>
    json(route, MY_WORK_PREFERENCES)
  );
  await page.route(`${API_BASE}/developers/me/assigned-tasks**`, (route) => {
    assignedTaskUrls.push(route.request().url());
    return json(route, TASKS);
  });
  await page.route(`${API_BASE}/workspaces/*/tickets**`, (route) => {
    ticketUrls.push(route.request().url());
    return json(route, { tickets: [TICKET], total: 1, limit: 100, offset: 0 });
  });

  return { assignedTaskUrls, ticketUrls };
}

test.describe("Home dashboard", () => {
  test("the old /my-work route lands on the home dashboard", async ({ page }) => {
    await setupHomeMocks(page);
    await page.goto("/my-work");

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("my-work-queue")).toBeVisible({ timeout: 25000 });
  });

  test("every row is a link, including bugs and stories", async ({ page }) => {
    await setupHomeMocks(page);
    await page.goto("/dashboard");

    const queue = page.getByTestId("my-work-queue");
    await expect(queue).toBeVisible({ timeout: 25000 });

    // A task with no board link used to be a dead button; these all resolve.
    await expect(queue.locator('a[href="/sprints?task=task-1"]')).toBeVisible();
    await expect(queue.locator('a[href="/sprints/project-9/bugs?bug=bug-1"]')).toBeVisible();
    await expect(queue.locator('a[href="/sprints/epics/epic-7"]')).toBeVisible();
    await expect(queue.locator('a[href="/tickets/ticket-1"]')).toBeVisible();
  });

  test("stat tiles filter the queue and toggle back off", async ({ page }) => {
    await setupHomeMocks(page);
    await page.goto("/dashboard");

    const queue = page.getByTestId("my-work-queue");
    await expect(queue).toBeVisible({ timeout: 25000 });
    await expect(queue.getByText("Bulk import")).toBeVisible();

    const inProgress = page.getByTestId("my-work-stat-in_progress");
    await inProgress.click();

    await expect(queue.getByText("Wire the webhook")).toBeVisible();
    await expect(queue.getByText("Bulk import")).toHaveCount(0);
    await expect(inProgress).toHaveAttribute("aria-pressed", "true");

    // Pressing the active tile clears the filter rather than latching it.
    await inProgress.click();
    await expect(queue.getByText("Bulk import")).toBeVisible();
  });

  test("scopes work to the current workspace, with an all-workspaces escape hatch", async ({
    page,
  }) => {
    const { assignedTaskUrls, ticketUrls } = await setupHomeMocks(page);
    await page.goto("/dashboard");

    const scope = page.getByTestId("my-work-workspace-scope");
    // Two workspaces is enough for the selector to be worth showing.
    await expect(scope).toBeVisible({ timeout: 25000 });
    await expect(scope).toHaveValue("ws-1");

    await expect
      .poll(() => assignedTaskUrls.some((url) => url.includes("workspace_id=ws-1")))
      .toBe(true);
    // Scoped, so only the selected workspace's tickets are fetched.
    await expect.poll(() => ticketUrls.every((url) => url.includes("/ws-1/"))).toBe(true);

    await scope.selectOption("all");

    // "All workspaces" drops the filter entirely and asks every workspace for
    // its tickets — the old behaviour, now something you choose.
    await expect
      .poll(() => assignedTaskUrls.some((url) => !url.includes("workspace_id=")))
      .toBe(true);
    await expect.poll(() => ticketUrls.some((url) => url.includes("/ws-2/"))).toBe(true);
  });

  test("does not offer Manage Forms", async ({ page }) => {
    await setupHomeMocks(page);
    await page.goto("/dashboard");

    await expect(page.getByTestId("my-work-queue")).toBeVisible({ timeout: 25000 });
    // Ticket form configuration lives in settings; it is not a thing on your plate.
    await expect(page.getByRole("button", { name: /manage forms/i })).toHaveCount(0);
  });

  test("keeps the workspace-wide ticket queue reachable", async ({ page }) => {
    await setupHomeMocks(page);
    await page.goto("/dashboard");

    const onlyMine = page.getByTestId("my-work-only-mine");
    await expect(onlyMine).toBeVisible({ timeout: 25000 });
    await onlyMine.click();
    // The triage view the old Form Tickets tab offered is still one click away.
    await expect(onlyMine).toContainText("Everyone's tickets");
  });
});
