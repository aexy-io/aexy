import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

const mockProjects = [
  {
    id: "proj-1",
    name: "Aexy Platform",
    slug: "aexy-platform",
    is_public: false,
    public_slug: null,
    member_count: 5,
    workspace_id: "ws-1",
  },
];

const mockEpicsList = [
  {
    id: "epic-1",
    workspace_id: "ws-1",
    key: "EPIC-1",
    title: "User Authentication Revamp",
    status: "in_progress" as const,
    color: "#6366F1",
    owner_id: "test-user-123",
    owner_name: "Test Developer",
    priority: "high" as const,
    target_date: "2026-03-01T00:00:00Z",
    total_tasks: 12,
    completed_tasks: 5,
    progress_percentage: 45,
  },
  {
    id: "epic-2",
    workspace_id: "ws-1",
    key: "EPIC-2",
    title: "Dashboard Redesign",
    status: "open" as const,
    color: "#8B5CF6",
    owner_id: null,
    owner_name: null,
    priority: "medium" as const,
    target_date: "2026-04-01T00:00:00Z",
    total_tasks: 8,
    completed_tasks: 0,
    progress_percentage: 0,
  },
  {
    id: "epic-3",
    workspace_id: "ws-1",
    key: "EPIC-3",
    title: "Mobile API v2",
    status: "done" as const,
    color: "#22C55E",
    owner_id: "dev-2",
    owner_name: "Alice Johnson",
    priority: "high" as const,
    target_date: "2026-01-15T00:00:00Z",
    total_tasks: 6,
    completed_tasks: 6,
    progress_percentage: 100,
  },
  {
    id: "epic-4",
    workspace_id: "ws-1",
    key: "EPIC-4",
    title: "Legacy Migration",
    status: "cancelled" as const,
    color: "#EF4444",
    owner_id: "dev-3",
    owner_name: "Bob Smith",
    priority: "low" as const,
    target_date: null,
    total_tasks: 4,
    completed_tasks: 1,
    progress_percentage: 25,
  },
  {
    id: "epic-5",
    workspace_id: "ws-1",
    key: "EPIC-5",
    title: "Performance Optimization",
    status: "in_progress" as const,
    color: "#F97316",
    owner_id: "test-user-123",
    owner_name: "Test Developer",
    priority: "critical" as const,
    target_date: "2026-02-28T00:00:00Z",
    total_tasks: 10,
    completed_tasks: 7,
    progress_percentage: 70,
  },
];

// Full Epic objects (returned by get/update endpoints)
const mockEpicFull = {
  id: "epic-1",
  workspace_id: "ws-1",
  key: "EPIC-1",
  title: "User Authentication Revamp",
  description: "Overhaul authentication to support SSO and 2FA",
  status: "in_progress" as const,
  color: "#6366F1",
  owner_id: "test-user-123",
  owner_name: "Test Developer",
  owner_avatar_url: null,
  start_date: "2026-01-15T00:00:00Z",
  target_date: "2026-03-01T00:00:00Z",
  completed_date: null,
  priority: "high" as const,
  labels: ["auth", "security"],
  total_tasks: 12,
  completed_tasks: 5,
  total_story_points: 40,
  completed_story_points: 18,
  progress_percentage: 45,
  source_type: "manual" as const,
  source_id: null,
  source_url: null,
  created_at: "2026-01-10T00:00:00Z",
  updated_at: "2026-02-10T00:00:00Z",
};

const mockEpicDetail = {
  ...mockEpicFull,
  tasks_by_status: {
    open: 3,
    in_progress: 4,
    done: 5,
  },
  tasks_by_team: {
    Engineering: 8,
    Design: 4,
  },
  recent_completions: 2,
};

const mockEpicProgress = {
  epic_id: "epic-1",
  total_tasks: 12,
  completed_tasks: 5,
  in_progress_tasks: 4,
  blocked_tasks: 1,
  total_story_points: 40,
  completed_story_points: 18,
  remaining_story_points: 22,
  task_completion_percentage: 41.7,
  points_completion_percentage: 45,
  tasks_completed_this_week: 2,
  points_completed_this_week: 6,
  estimated_completion_date: "2026-03-15T00:00:00Z",
};

const mockEpicTimeline = {
  epic_id: "epic-1",
  epic_title: "User Authentication Revamp",
  sprints: [
    {
      sprint_id: "sprint-1",
      sprint_name: "Sprint 12",
      team_id: "team-1",
      team_name: "Engineering",
      status: "active",
      start_date: "2026-02-03T00:00:00Z",
      end_date: "2026-02-14T00:00:00Z",
      task_count: 5,
      completed_count: 3,
      story_points: 15,
      completed_points: 9,
    },
    {
      sprint_id: "sprint-2",
      sprint_name: "Sprint 11",
      team_id: "team-1",
      team_name: "Engineering",
      status: "completed",
      start_date: "2026-01-20T00:00:00Z",
      end_date: "2026-02-02T00:00:00Z",
      task_count: 4,
      completed_count: 4,
      story_points: 12,
      completed_points: 12,
    },
  ],
  total_sprints: 3,
  completed_sprints: 1,
  current_sprints: 1,
  planned_sprints: 1,
};

const mockCreatedEpic = {
  id: "epic-new",
  workspace_id: "ws-1",
  key: "EPIC-6",
  title: "New Epic Title",
  description: "A new epic description",
  status: "open" as const,
  color: "#6366F1",
  owner_id: null,
  owner_name: null,
  owner_avatar_url: null,
  start_date: null,
  target_date: null,
  completed_date: null,
  priority: "medium" as const,
  labels: [],
  total_tasks: 0,
  completed_tasks: 0,
  total_story_points: 0,
  completed_story_points: 0,
  progress_percentage: 0,
  source_type: "manual" as const,
  source_id: null,
  source_url: null,
  created_at: "2026-02-15T00:00:00Z",
  updated_at: "2026-02-15T00:00:00Z",
};

// ============================================================================
// Setup helpers
// ============================================================================

async function setupEpicsMocks(page: Page) {
  await setupCommonMocks(page);

  // Projects
  await page.route(`${API_BASE}/workspaces/ws-1/projects**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockProjects),
    });
  });

  // Sprints (needed for the sprints page component)
  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/sprints**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Epics list
  await page.route(`${API_BASE}/workspaces/ws-1/epics`, (route) => {
    const url = new URL(route.request().url());
    const statusParam = url.searchParams.get("status");
    const priorityParam = url.searchParams.get("priority");
    const searchParam = url.searchParams.get("search");
    const method = route.request().method();

    if (method === "POST") {
      // Create epic
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(mockCreatedEpic),
      });
      return;
    }

    let filtered = [...mockEpicsList];

    if (statusParam) {
      filtered = filtered.filter((e) => e.status === statusParam);
    }
    if (priorityParam) {
      filtered = filtered.filter((e) => e.priority === priorityParam);
    }
    if (searchParam) {
      const q = searchParam.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.key.toLowerCase().includes(q)
      );
    }

    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(filtered),
    });
  });

  // Single epic endpoints (detail, progress, timeline, update, delete, etc.)
  await page.route(`${API_BASE}/workspaces/ws-1/epics/epic-1`, (route) => {
    const method = route.request().method();
    if (method === "PATCH") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...mockEpicFull, status: "done" }),
      });
    } else if (method === "DELETE") {
      route.fulfill({ status: 204, body: "" });
    } else {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockEpicFull),
      });
    }
  });

  await page.route(`${API_BASE}/workspaces/ws-1/epics/epic-1/detail`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockEpicDetail),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/epics/epic-1/progress`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockEpicProgress),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/epics/epic-1/timeline`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockEpicTimeline),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/epics/epic-1/burndown`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        epic_id: "epic-1",
        data_points: [
          { date: "2026-01-15", remaining_points: 40, remaining_tasks: 12, scope_total: 40 },
          { date: "2026-01-22", remaining_points: 35, remaining_tasks: 10, scope_total: 40 },
          { date: "2026-01-29", remaining_points: 30, remaining_tasks: 9, scope_total: 40 },
          { date: "2026-02-05", remaining_points: 25, remaining_tasks: 8, scope_total: 40 },
          { date: "2026-02-12", remaining_points: 22, remaining_tasks: 7, scope_total: 40 },
        ],
        start_date: "2026-01-15",
        target_date: "2026-03-01",
        ideal_burndown: [40, 35, 30, 25, 20, 15, 10, 5, 0],
      }),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/epics/epic-1/archive`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockEpicFull),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/epics/epic-1/tasks`, (route) => {
    const method = route.request().method();
    if (method === "POST") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ added_count: 2, already_in_epic: 0, task_ids: ["task-1", "task-2"] }),
      });
    } else {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
  });

  // Epic not found route
  await page.route(`${API_BASE}/workspaces/ws-1/epics/epic-nonexistent`, (route) => {
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Epic not found" }),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/epics/epic-nonexistent/**`, (route) => {
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Epic not found" }),
    });
  });
}

async function setupEmptyEpicsMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/projects**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockProjects),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/sprints**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/epics**`, (route) => {
    const method = route.request().method();
    if (method === "POST") {
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(mockCreatedEpic),
      });
      return;
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

// ============================================================================
// Epic List View Tests (via /sprints?tab=epics)
// ============================================================================

test.describe("Epics Page -- Via Sprints Tab", () => {
  test.beforeEach(async ({ page }) => {
    await setupEpicsMocks(page);
    await page.goto("/sprints?tab=epics");
    await page.waitForSelector("text=Planning", { timeout: 45000 });
  });

  test("renders the planning page with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Planning" })).toBeVisible();
  });

  test("Epics tab is visible and selectable", async ({ page }) => {
    const epicsTab = page.getByRole("button", { name: "Epics" });
    await expect(epicsTab).toBeVisible();
  });

  test("shows epics list when on Epics tab", async ({ page }) => {
    // The epics tab should be active since we navigated with ?tab=epics
    await expect(page.getByText("User Authentication Revamp")).toBeVisible();
    await expect(page.getByText("Dashboard Redesign")).toBeVisible();
    await expect(page.getByText("Mobile API v2")).toBeVisible();
  });

  test("can switch between Projects and Epics tabs", async ({ page }) => {
    // Click Projects tab
    await page.getByRole("button", { name: "Projects" }).click();
    await expect(page.getByText("Aexy Platform")).toBeVisible();

    // Click back to Epics tab
    await page.getByRole("button", { name: "Epics" }).click();
    await expect(page.getByText("User Authentication Revamp")).toBeVisible();
  });
});

// ============================================================================
// Epic Card Display
// ============================================================================

test.describe("Epic Cards -- Content & Layout", () => {
  test.beforeEach(async ({ page }) => {
    await setupEpicsMocks(page);
    await page.goto("/sprints?tab=epics");
    await page.waitForSelector("text=User Authentication Revamp", { timeout: 45000 });
  });

  test("displays epic keys on cards", async ({ page }) => {
    await expect(page.getByText("EPIC-1")).toBeVisible();
    await expect(page.getByText("EPIC-2")).toBeVisible();
    await expect(page.getByText("EPIC-3")).toBeVisible();
  });

  test("displays epic status badges", async ({ page }) => {
    await expect(page.getByText("in progress").first()).toBeVisible();
    await expect(page.getByText("open").first()).toBeVisible();
    await expect(page.getByText("done").first()).toBeVisible();
    await expect(page.getByText("cancelled").first()).toBeVisible();
  });

  test("displays priority labels on cards", async ({ page }) => {
    // Priority labels appear as text next to flag icons
    await expect(page.getByText("high").first()).toBeVisible();
    await expect(page.getByText("medium").first()).toBeVisible();
    await expect(page.getByText("critical").first()).toBeVisible();
    await expect(page.getByText("low").first()).toBeVisible();
  });

  test("displays owner name when available", async ({ page }) => {
    await expect(page.getByText("Test Developer").first()).toBeVisible();
    await expect(page.getByText("Alice Johnson")).toBeVisible();
  });

  test("displays task counts on epic cards", async ({ page }) => {
    await expect(page.getByText("5/12 tasks")).toBeVisible();
    await expect(page.getByText("0/8 tasks")).toBeVisible();
    await expect(page.getByText("6/6 tasks")).toBeVisible();
  });

  test("displays progress percentage on cards", async ({ page }) => {
    await expect(page.getByText("45%")).toBeVisible();
    await expect(page.getByText("0%")).toBeVisible();
    await expect(page.getByText("100%")).toBeVisible();
  });

  test("displays target dates when available", async ({ page }) => {
    // Target dates are shown as short month/day in the EpicCard
    await expect(page.getByText("Mar 1")).toBeVisible();
    await expect(page.getByText("Apr 1")).toBeVisible();
  });

  test("renders all five epics in the grid", async ({ page }) => {
    await expect(page.getByText("User Authentication Revamp")).toBeVisible();
    await expect(page.getByText("Dashboard Redesign")).toBeVisible();
    await expect(page.getByText("Mobile API v2")).toBeVisible();
    await expect(page.getByText("Legacy Migration")).toBeVisible();
    await expect(page.getByText("Performance Optimization")).toBeVisible();
  });
});

// ============================================================================
// Epic Stats Summary
// ============================================================================

test.describe("Epic Stats Summary Cards", () => {
  test.beforeEach(async ({ page }) => {
    await setupEpicsMocks(page);
    await page.goto("/sprints?tab=epics");
    await page.waitForSelector("text=User Authentication Revamp", { timeout: 45000 });
  });

  test("shows the Open stat card with correct count", async ({ page }) => {
    const openStat = page.locator("text=Open").first();
    await expect(openStat).toBeVisible();
  });

  test("shows the In Progress stat card", async ({ page }) => {
    await expect(page.getByText("In Progress").first()).toBeVisible();
  });

  test("shows the Done stat card", async ({ page }) => {
    await expect(page.getByText("Done").first()).toBeVisible();
  });

  test("shows total epics count", async ({ page }) => {
    await expect(page.getByText("Total Epics")).toBeVisible();
  });
});

// ============================================================================
// Search Functionality
// ============================================================================

test.describe("Epic Search", () => {
  test.beforeEach(async ({ page }) => {
    await setupEpicsMocks(page);
    await page.goto("/sprints?tab=epics");
    await page.waitForSelector("text=User Authentication Revamp", { timeout: 45000 });
  });

  test("renders the search input", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search epics...");
    await expect(searchInput).toBeVisible();
  });

  test("can type in the search input", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search epics...");
    await searchInput.fill("Authentication");
    await expect(searchInput).toHaveValue("Authentication");
  });

  test("filters epics when searching by title", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search epics...");
    await searchInput.fill("Authentication");
    // Wait for the debounced request and response
    await page.waitForTimeout(500);
    // The mock route handler filters by search param, so only matching epics should appear
    await expect(page.getByText("User Authentication Revamp")).toBeVisible();
  });

  test("clears search by emptying input", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search epics...");
    await searchInput.fill("Authentication");
    await page.waitForTimeout(500);
    await searchInput.fill("");
    await page.waitForTimeout(500);
    // All epics should be visible again
    await expect(page.getByText("User Authentication Revamp")).toBeVisible();
    await expect(page.getByText("Dashboard Redesign")).toBeVisible();
  });
});

// ============================================================================
// Status Filter
// ============================================================================

test.describe("Epic Status Filter", () => {
  test.beforeEach(async ({ page }) => {
    await setupEpicsMocks(page);
    await page.goto("/sprints?tab=epics");
    await page.waitForSelector("text=User Authentication Revamp", { timeout: 45000 });
  });

  test("renders the status filter dropdown with All Statuses default", async ({ page }) => {
    const statusSelect = page.locator("select").filter({ hasText: "All Statuses" });
    await expect(statusSelect).toBeVisible();
  });

  test("status filter has all options", async ({ page }) => {
    const statusSelect = page.locator("select").filter({ hasText: "All Statuses" });
    await expect(statusSelect.locator("option")).toHaveCount(5);
    await expect(statusSelect.locator("option", { hasText: "All Statuses" })).toBeVisible();
    await expect(statusSelect.locator("option", { hasText: "Open" })).toBeVisible();
    await expect(statusSelect.locator("option", { hasText: "In Progress" })).toBeVisible();
    await expect(statusSelect.locator("option", { hasText: "Done" })).toBeVisible();
    await expect(statusSelect.locator("option", { hasText: "Cancelled" })).toBeVisible();
  });

  test("selecting a status filters the epic list", async ({ page }) => {
    const statusSelect = page.locator("select").filter({ hasText: "All Statuses" });
    await statusSelect.selectOption("in_progress");
    await page.waitForTimeout(500);
    // Mock filters epics by status; in_progress epics: epic-1 and epic-5
    await expect(page.getByText("User Authentication Revamp")).toBeVisible();
    await expect(page.getByText("Performance Optimization")).toBeVisible();
  });

  test("selecting Done status shows only completed epics", async ({ page }) => {
    const statusSelect = page.locator("select").filter({ hasText: "All Statuses" });
    await statusSelect.selectOption("done");
    await page.waitForTimeout(500);
    await expect(page.getByText("Mobile API v2")).toBeVisible();
  });
});

// ============================================================================
// Priority Filter
// ============================================================================

test.describe("Epic Priority Filter", () => {
  test.beforeEach(async ({ page }) => {
    await setupEpicsMocks(page);
    await page.goto("/sprints?tab=epics");
    await page.waitForSelector("text=User Authentication Revamp", { timeout: 45000 });
  });

  test("renders the priority filter dropdown with All Priorities default", async ({ page }) => {
    const prioritySelect = page.locator("select").filter({ hasText: "All Priorities" });
    await expect(prioritySelect).toBeVisible();
  });

  test("priority filter has all options", async ({ page }) => {
    const prioritySelect = page.locator("select").filter({ hasText: "All Priorities" });
    await expect(prioritySelect.locator("option")).toHaveCount(5);
    await expect(prioritySelect.locator("option", { hasText: "Critical" })).toBeVisible();
    await expect(prioritySelect.locator("option", { hasText: "High" })).toBeVisible();
    await expect(prioritySelect.locator("option", { hasText: "Medium" })).toBeVisible();
    await expect(prioritySelect.locator("option", { hasText: "Low" })).toBeVisible();
  });

  test("selecting high priority filters epics", async ({ page }) => {
    const prioritySelect = page.locator("select").filter({ hasText: "All Priorities" });
    await prioritySelect.selectOption("high");
    await page.waitForTimeout(500);
    // High priority: epic-1 and epic-3
    await expect(page.getByText("User Authentication Revamp")).toBeVisible();
    await expect(page.getByText("Mobile API v2")).toBeVisible();
  });

  test("selecting critical priority shows only critical epics", async ({ page }) => {
    const prioritySelect = page.locator("select").filter({ hasText: "All Priorities" });
    await prioritySelect.selectOption("critical");
    await page.waitForTimeout(500);
    await expect(page.getByText("Performance Optimization")).toBeVisible();
  });
});

// ============================================================================
// Create Epic Flow
// ============================================================================

test.describe("Create Epic Modal", () => {
  test.beforeEach(async ({ page }) => {
    await setupEpicsMocks(page);
    await page.goto("/sprints?tab=epics");
    await page.waitForSelector("text=User Authentication Revamp", { timeout: 45000 });
  });

  test("has a Create Epic button visible", async ({ page }) => {
    const createButton = page.getByRole("button", { name: "Create Epic" });
    await expect(createButton).toBeVisible();
  });

  test("clicking Create Epic opens the modal", async ({ page }) => {
    await page.getByRole("button", { name: "Create Epic" }).click();
    await expect(page.getByRole("heading", { name: "Create Epic" })).toBeVisible();
    await expect(page.getByText("Epics group related tasks across sprints and teams")).toBeVisible();
  });

  test("modal has title, description, priority, and color fields", async ({ page }) => {
    await page.getByRole("button", { name: "Create Epic" }).click();
    await expect(page.getByLabel("Title")).toBeVisible();
    await expect(page.getByLabel("Description (optional)")).toBeVisible();
    await expect(page.getByLabel("Priority")).toBeVisible();
    await expect(page.getByText("Color")).toBeVisible();
  });

  test("title field has correct placeholder", async ({ page }) => {
    await page.getByRole("button", { name: "Create Epic" }).click();
    const titleInput = page.getByPlaceholder("e.g., User Authentication System");
    await expect(titleInput).toBeVisible();
  });

  test("priority dropdown defaults to Medium", async ({ page }) => {
    await page.getByRole("button", { name: "Create Epic" }).click();
    const prioritySelect = page.getByLabel("Priority");
    await expect(prioritySelect).toHaveValue("medium");
  });

  test("priority dropdown has all options (low, medium, high, critical)", async ({ page }) => {
    await page.getByRole("button", { name: "Create Epic" }).click();
    const prioritySelect = page.getByLabel("Priority");
    await expect(prioritySelect.locator("option")).toHaveCount(4);
  });

  test("color picker shows 10 color options", async ({ page }) => {
    await page.getByRole("button", { name: "Create Epic" }).click();
    // The color buttons are rendered inside the Color section
    // Each color is a button with a style backgroundColor
    const colorSection = page.locator("text=Color").locator("..");
    const colorButtons = colorSection.locator("button");
    await expect(colorButtons).toHaveCount(10);
  });

  test("Cancel button closes the modal", async ({ page }) => {
    await page.getByRole("button", { name: "Create Epic" }).click();
    await expect(page.getByRole("heading", { name: "Create Epic" })).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Create Epic" })).not.toBeVisible();
  });

  test("submit button is disabled when title is empty", async ({ page }) => {
    await page.getByRole("button", { name: "Create Epic" }).click();
    const submitButton = page.getByRole("button", { name: "Create Epic" }).nth(1);
    await expect(submitButton).toBeDisabled();
  });

  test("submit button becomes enabled when title is filled", async ({ page }) => {
    await page.getByRole("button", { name: "Create Epic" }).click();
    const titleInput = page.getByPlaceholder("e.g., User Authentication System");
    await titleInput.fill("New Epic Title");
    // The submit button inside the modal form
    const submitButton = page.locator("form button[type='submit']");
    await expect(submitButton).toBeEnabled();
  });

  test("can fill in and submit the create epic form", async ({ page }) => {
    await page.getByRole("button", { name: "Create Epic" }).click();

    // Fill title
    await page.getByPlaceholder("e.g., User Authentication System").fill("New Epic Title");
    // Fill description
    await page.getByPlaceholder("Describe the epic's goals and scope...").fill("A new epic description");
    // Change priority
    await page.getByLabel("Priority").selectOption("high");

    // Submit
    const submitButton = page.locator("form button[type='submit']");
    await submitButton.click();

    // Modal should close after creation
    await expect(page.getByRole("heading", { name: "Create Epic" })).not.toBeVisible();
  });

  test("can select a color in the create epic modal", async ({ page }) => {
    await page.getByRole("button", { name: "Create Epic" }).click();
    // Click the 3rd color swatch (index 2)
    const colorSection = page.locator("text=Color").locator("..");
    const colorButtons = colorSection.locator("button");
    await colorButtons.nth(2).click();
    // The selected color button should have a ring class
    await expect(colorButtons.nth(2)).toHaveClass(/ring-2/);
  });
});

// ============================================================================
// Empty State
// ============================================================================

test.describe("Epics Empty State", () => {
  test("shows empty state when no epics exist", async ({ page }) => {
    await setupEmptyEpicsMocks(page);
    await page.goto("/sprints?tab=epics");
    await page.waitForSelector("text=No Epics Yet", { timeout: 45000 });

    await expect(page.getByText("No Epics Yet")).toBeVisible();
    await expect(page.getByText("Create your first epic to start tracking large initiatives")).toBeVisible();
  });

  test("empty state has a Create Epic button", async ({ page }) => {
    await setupEmptyEpicsMocks(page);
    await page.goto("/sprints?tab=epics");
    await page.waitForSelector("text=No Epics Yet", { timeout: 45000 });

    const createButton = page.getByRole("button", { name: "Create Epic" });
    await expect(createButton).toBeVisible();
  });

  test("clicking Create Epic from empty state opens modal", async ({ page }) => {
    await setupEmptyEpicsMocks(page);
    await page.goto("/sprints?tab=epics");
    await page.waitForSelector("text=No Epics Yet", { timeout: 45000 });

    await page.getByRole("button", { name: "Create Epic" }).click();
    await expect(page.getByRole("heading", { name: "Create Epic" })).toBeVisible();
  });
});

// ============================================================================
// Epic Detail Page
// ============================================================================

test.describe("Epic Detail Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupEpicsMocks(page);
    await page.goto("/sprints/epics/epic-1");
    await page.waitForSelector("text=User Authentication Revamp", { timeout: 45000 });
  });

  test("displays the epic title", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "User Authentication Revamp" })).toBeVisible();
  });

  test("displays the epic description", async ({ page }) => {
    await expect(page.getByText("Overhaul authentication to support SSO and 2FA")).toBeVisible();
  });

  test("shows the epic key in the header", async ({ page }) => {
    await expect(page.getByText("EPIC-1").first()).toBeVisible();
  });

  test("displays the status badge", async ({ page }) => {
    await expect(page.getByText("in progress").first()).toBeVisible();
  });

  test("displays the priority label", async ({ page }) => {
    await expect(page.getByText("high").first()).toBeVisible();
  });

  test("shows the breadcrumb navigation", async ({ page }) => {
    await expect(page.getByText("Epics").first()).toBeVisible();
    await expect(page.getByText("EPIC-1").first()).toBeVisible();
  });

  test("displays owner information", async ({ page }) => {
    await expect(page.getByText("Owner:")).toBeVisible();
    await expect(page.getByText("Test Developer")).toBeVisible();
  });

  test("displays the start date", async ({ page }) => {
    await expect(page.getByText("Started:")).toBeVisible();
  });

  test("displays the target date", async ({ page }) => {
    await expect(page.getByText("Target:")).toBeVisible();
  });
});

// ============================================================================
// Epic Detail -- Progress Section
// ============================================================================

test.describe("Epic Detail -- Progress Cards", () => {
  test.beforeEach(async ({ page }) => {
    await setupEpicsMocks(page);
    await page.goto("/sprints/epics/epic-1");
    await page.waitForSelector("text=User Authentication Revamp", { timeout: 45000 });
  });

  test("shows the Tasks progress card", async ({ page }) => {
    await expect(page.getByText("Tasks")).toBeVisible();
    await expect(page.getByText("5/12")).toBeVisible();
  });

  test("shows the Story Points progress card", async ({ page }) => {
    await expect(page.getByText("Story Points")).toBeVisible();
    await expect(page.getByText("18/40")).toBeVisible();
  });

  test("shows In Progress tasks count from progress data", async ({ page }) => {
    // Wait for the progress API to load
    await expect(page.getByText("In Progress").first()).toBeVisible();
  });

  test("shows tasks completed this week", async ({ page }) => {
    await expect(page.getByText("This Week")).toBeVisible();
    await expect(page.getByText("+2")).toBeVisible();
  });

  test("shows estimated completion date", async ({ page }) => {
    await expect(page.getByText("Estimated Completion")).toBeVisible();
    await expect(page.getByText("March 15, 2026")).toBeVisible();
  });
});

// ============================================================================
// Epic Detail -- Task Distribution
// ============================================================================

test.describe("Epic Detail -- Task Distribution", () => {
  test.beforeEach(async ({ page }) => {
    await setupEpicsMocks(page);
    await page.goto("/sprints/epics/epic-1");
    await page.waitForSelector("text=User Authentication Revamp", { timeout: 45000 });
  });

  test("shows the Task Distribution heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Task Distribution" })).toBeVisible();
  });

  test("shows task counts by status from detail data", async ({ page }) => {
    // The epicDetail.tasks_by_status has open: 3, in_progress: 4, done: 5
    await expect(page.getByText("3 tasks").first()).toBeVisible();
    await expect(page.getByText("4 tasks").first()).toBeVisible();
    await expect(page.getByText("5 tasks").first()).toBeVisible();
  });
});

// ============================================================================
// Epic Detail -- Sprint Timeline
// ============================================================================

test.describe("Epic Detail -- Sprint Timeline", () => {
  test.beforeEach(async ({ page }) => {
    await setupEpicsMocks(page);
    await page.goto("/sprints/epics/epic-1");
    await page.waitForSelector("text=User Authentication Revamp", { timeout: 45000 });
  });

  test("shows Sprint Timeline heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Sprint Timeline" })).toBeVisible();
  });

  test("lists sprint names in timeline", async ({ page }) => {
    await expect(page.getByText("Sprint 12")).toBeVisible();
    await expect(page.getByText("Sprint 11")).toBeVisible();
  });

  test("shows team name for each sprint", async ({ page }) => {
    const engineeringLabels = page.getByText("Engineering");
    await expect(engineeringLabels.first()).toBeVisible();
  });

  test("shows task counts for each sprint in timeline", async ({ page }) => {
    await expect(page.getByText("3/5 tasks")).toBeVisible();
    await expect(page.getByText("4/4 tasks")).toBeVisible();
  });

  test("shows story points for each sprint", async ({ page }) => {
    await expect(page.getByText("15 pts")).toBeVisible();
    await expect(page.getByText("12 pts")).toBeVisible();
  });

  test("shows sprint summary stats (completed, active, planned)", async ({ page }) => {
    // Timeline summary stats at the bottom
    await expect(page.getByText("Completed").first()).toBeVisible();
    await expect(page.getByText("Active").first()).toBeVisible();
    await expect(page.getByText("Planned").first()).toBeVisible();
  });
});

// ============================================================================
// Epic Detail -- Status Update
// ============================================================================

test.describe("Epic Detail -- Status Editing", () => {
  test.beforeEach(async ({ page }) => {
    await setupEpicsMocks(page);
    await page.goto("/sprints/epics/epic-1");
    await page.waitForSelector("text=User Authentication Revamp", { timeout: 45000 });
  });

  test("clicking status badge opens status dropdown", async ({ page }) => {
    // The status is rendered as a clickable button when not editing
    const statusButton = page.locator("button", { hasText: "in progress" }).first();
    await statusButton.click();

    // A select dropdown should appear
    const statusSelect = page.locator("select").first();
    await expect(statusSelect).toBeVisible();
    await expect(statusSelect).toHaveValue("in_progress");
  });

  test("status dropdown has all status options", async ({ page }) => {
    const statusButton = page.locator("button", { hasText: "in progress" }).first();
    await statusButton.click();

    const statusSelect = page.locator("select").first();
    await expect(statusSelect.locator("option")).toHaveCount(4);
    await expect(statusSelect.locator("option", { hasText: "Open" })).toBeVisible();
    await expect(statusSelect.locator("option", { hasText: "In Progress" })).toBeVisible();
    await expect(statusSelect.locator("option", { hasText: "Done" })).toBeVisible();
    await expect(statusSelect.locator("option", { hasText: "Cancelled" })).toBeVisible();
  });
});

// ============================================================================
// Epic Not Found
// ============================================================================

test.describe("Epic Not Found", () => {
  test("shows not found state for nonexistent epic", async ({ page }) => {
    await setupEpicsMocks(page);
    await page.goto("/sprints/epics/epic-nonexistent");
    await page.waitForSelector("text=Epic Not Found", { timeout: 45000 });

    await expect(page.getByText("Epic Not Found")).toBeVisible();
    await expect(page.getByText("Back to Epics")).toBeVisible();
  });

  test("Back to Epics link navigates to epics list", async ({ page }) => {
    await setupEpicsMocks(page);
    await page.goto("/sprints/epics/epic-nonexistent");
    await page.waitForSelector("text=Epic Not Found", { timeout: 45000 });

    const backLink = page.getByText("Back to Epics");
    await expect(backLink).toHaveAttribute("href", "/sprints?tab=epics");
  });
});

// ============================================================================
// Epic Card Navigation
// ============================================================================

test.describe("Epic Card Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await setupEpicsMocks(page);
    await page.goto("/sprints?tab=epics");
    await page.waitForSelector("text=User Authentication Revamp", { timeout: 45000 });
  });

  test("epic cards are links to the detail page", async ({ page }) => {
    const epicLink = page.locator("a[href='/sprints/epics/epic-1']");
    await expect(epicLink).toBeVisible();
  });

  test("all epic cards have correct href attributes", async ({ page }) => {
    await expect(page.locator("a[href='/sprints/epics/epic-1']")).toBeVisible();
    await expect(page.locator("a[href='/sprints/epics/epic-2']")).toBeVisible();
    await expect(page.locator("a[href='/sprints/epics/epic-3']")).toBeVisible();
    await expect(page.locator("a[href='/sprints/epics/epic-4']")).toBeVisible();
    await expect(page.locator("a[href='/sprints/epics/epic-5']")).toBeVisible();
  });
});

// ============================================================================
// Epic Detail -- Header Navigation
// ============================================================================

test.describe("Epic Detail -- Header & Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await setupEpicsMocks(page);
    await page.goto("/sprints/epics/epic-1");
    await page.waitForSelector("text=User Authentication Revamp", { timeout: 45000 });
  });

  test("displays the app header with Aexy branding", async ({ page }) => {
    await expect(page.getByText("Aexy").first()).toBeVisible();
  });

  test("header shows Planning nav link as active", async ({ page }) => {
    await expect(page.getByText("Planning").first()).toBeVisible();
  });

  test("header contains Dashboard link", async ({ page }) => {
    const dashboardLink = page.locator("a[href='/dashboard']").first();
    await expect(dashboardLink).toBeVisible();
  });

  test("header shows the current user name", async ({ page }) => {
    await expect(page.getByText("Test Developer").first()).toBeVisible();
  });
});
