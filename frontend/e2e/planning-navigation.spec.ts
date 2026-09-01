import { test, expect, Page } from "@playwright/test";
import { mockUser } from "./fixtures/mock-data";

const API_BASE = "http://localhost:8000/api/v1";

const mockWorkspace = {
  id: "ws-1", name: "Bimaplan", slug: "bimaplan", type: "business", avatar_url: null,
  owner_id: "test-user-123", member_count: 6, team_count: 3, is_active: true,
};

const mockEffectiveAccess = {
  apps: {
    sprints: { enabled: true, modules: { dashboard: true, board: true, backlog: true } },
    analytics: { enabled: true, modules: {} },
  },
  applied_template_id: null, applied_template_name: null,
  has_custom_overrides: false, is_admin: true,
};

const EPICS = [
  {
    id: "e-1", workspace_id: "ws-1", key: "EPIC-1", title: "Billing rewrite",
    status: "in_progress", color: "#6366F1", owner_id: null, owner_name: "Priya",
    priority: "high", target_date: "2026-06-01",
    total_tasks: 10, completed_tasks: 4, progress_percentage: 40,
  },
  {
    id: "e-2", workspace_id: "ws-1", key: "EPIC-2", title: "Claims intake",
    status: "done", color: "#22C55E", owner_id: null, owner_name: null,
    priority: "low", target_date: null,
    total_tasks: 6, completed_tasks: 6, progress_percentage: 100,
  },
];

/** Whatever `?status=` / `?search=` the page asked the epics endpoint for. */
type EpicCall = { status?: string; search?: string; priority?: string };

async function setup(page: Page, calls: EpicCall[] = []) {
  await page.addInitScript(() => {
    localStorage.setItem("token", "fake-test-token");
    localStorage.setItem("current_workspace_id", "ws-1");
  });

  // Catch-all first — Playwright matches last-registered-first.
  await page.route(`${API_BASE}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route(`${API_BASE}/workspaces`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([mockWorkspace]) }),
  );
  await page.route(`${API_BASE}/developers/me`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockUser) }),
  );
  await page.route(`${API_BASE}/developers`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.route(`${API_BASE}/repositories/onboarding/status`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ completed: true }) }),
  );
  await page.route(`${API_BASE}/notifications**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  await page.route(`${API_BASE}/workspaces/**`, (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (path.includes("/apps/effective") || path.includes("/app-access/")) return json(mockEffectiveAccess);
    if (path.includes("/my-permissions"))
      return json({ permissions: ["can_view_sprints", "can_manage_sprints"], role: "owner", is_owner: true });

    if (path.match(/\/epics\/[^/]+\/(timeline|progress|burndown|detail)$/)) return json({});
    if (path.match(/\/epics\/[^/]+$/)) {
      return json({
        ...EPICS[0], description: "Move billing off the legacy job",
        owner_avatar_url: null, start_date: "2026-01-01", completed_date: null,
        labels: [], total_story_points: 20, completed_story_points: 8,
        source_type: "manual", source_id: null,
      });
    }
    if (path.endsWith("/epics")) {
      const status = url.searchParams.get("status") ?? undefined;
      const search = url.searchParams.get("search") ?? undefined;
      const priority = url.searchParams.get("priority") ?? undefined;
      calls.push({ status, search, priority });
      let out = EPICS;
      if (status) out = out.filter((e) => e.status === status);
      if (search) out = out.filter((e) => e.title.toLowerCase().includes(search.toLowerCase()));
      return json(out);
    }

    if (path.match(/\/(spaces|documents|members|invites|task-statuses|teams|projects|notifications|tasks|sprints)$/))
      return json([]);
    if (path.endsWith("/workspaces/ws-1")) return json(mockWorkspace);
    return json({});
  });
}

/**
 * The planning tabs, the epic list's filters, and the epic page's chrome — the
 * three things a reader hits in one motion when they open an epic and come back.
 */
test.describe("Planning navigation", () => {
  test("tabs are real links, and only the one in force is marked", async ({ page }) => {
    await setup(page);
    await page.goto("/sprints?tab=epics");

    const tabs = page.locator("nav[aria-label='Planning views'] a");
    await expect(tabs).toHaveCount(4);
    // Real hrefs: this is what makes cmd-click and "open in new tab" work at
    // all, which a button with an onClick could never do.
    await expect(tabs.nth(0)).toHaveAttribute("href", "/sprints");
    await expect(tabs.nth(1)).toHaveAttribute("href", "/sprints?tab=epics");
    // Naming the tab, not just counting: a count of one passed happily while
    // the marked tab was Projects and the epics view was nowhere on screen.
    const current = page.locator("nav[aria-label='Planning views'] a[aria-current='page']");
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute("href", "/sprints?tab=epics");
    await expect(page.getByText("Billing rewrite")).toBeVisible({ timeout: 15000 });
  });

  test("clicking a tab actually changes the view", async ({ page }) => {
    await setup(page);
    await page.goto("/sprints?tab=epics");
    await expect(page.getByText("Billing rewrite")).toBeVisible({ timeout: 15000 });

    await page.locator("nav[aria-label='Planning views'] a", { hasText: "Automations" }).click();
    await expect(page).toHaveURL(/tab=automations/);
    await expect(page.getByText("Billing rewrite")).toBeHidden();
  });

  test("a status card filters, and says so in the address bar", async ({ page }) => {
    const calls: EpicCall[] = [];
    await setup(page, calls);
    await page.goto("/sprints?tab=epics");
    await expect(page.getByText("Billing rewrite")).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: /Done/ }).first().click();

    await expect(page).toHaveURL(/status=done/);
    await expect(page.getByText("Claims intake")).toBeVisible();
    await expect(page.getByText("Billing rewrite")).toBeHidden();
    expect(calls.some((c) => c.status === "done")).toBe(true);
  });

  test("filters survive opening an epic and coming back", async ({ page }) => {
    await setup(page);
    await page.goto("/sprints?tab=epics&status=done");
    await expect(page.getByText("Claims intake")).toBeVisible({ timeout: 15000 });

    await page.getByText("Claims intake").click();
    await expect(page).toHaveURL(/\/sprints\/epics\//);

    // The whole point: the filtered queue is still there on the way back,
    // because it lives in the address rather than in component state.
    await page.goBack();
    await expect(page).toHaveURL(/status=done/);
    await expect(page.getByText("Claims intake")).toBeVisible();
    await expect(page.getByText("Billing rewrite")).toBeHidden();
  });

  test("an epic page draws no second copy of the app chrome", async ({ page }) => {
    await setup(page);
    await page.goto("/sprints/epics/e-1");
    await expect(page.getByRole("heading", { name: "Billing rewrite" })).toBeVisible({ timeout: 15000 });

    // The shell supplies the logo, the nav and the user menu. A page that draws
    // its own shows the reader two of everything.
    await expect(page.locator("main a[href='/learning']")).toHaveCount(0);
    await expect(page.locator("main a[href='/dashboard']")).toHaveCount(0);
    // The actions the page used to import icons for and never wire up.
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Link tasks" })).toBeVisible();
  });

  test("analytics draws no second copy of the app chrome either", async ({ page }) => {
    await setup(page);
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "Team Analytics" })).toBeVisible({ timeout: 20000 });

    await expect(page.locator("main a[href='/learning']")).toHaveCount(0);
    await expect(page.locator("main a[href='/hiring']")).toHaveCount(0);
  });
});
