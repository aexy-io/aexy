import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockProjects = [
  { id: "proj-1", name: "Frontend Redesign", workspace_id: "ws-1", description: "Revamping the UI", color: "#6366f1", status: "active" },
];

const mockSprints = [
  { id: "sprint-1", name: "Sprint 24", project_id: "proj-1", status: "active", start_date: "2026-02-10", end_date: "2026-02-24" },
  { id: "sprint-2", name: "Sprint 23", project_id: "proj-1", status: "completed", start_date: "2026-01-27", end_date: "2026-02-09" },
];

const mockTasks = [
  {
    id: "task-1",
    title: "Implement search feature",
    status: "in_progress",
    priority: "high",
    assignee_id: "test-user-123",
    sprint_id: "sprint-1",
    project_id: "proj-1",
    story_points: 5,
  },
  {
    id: "task-2",
    title: "Fix responsive layout",
    status: "todo",
    priority: "medium",
    assignee_id: "dev-2",
    sprint_id: "sprint-1",
    project_id: "proj-1",
    story_points: 3,
  },
];

const mockRoadmap = {
  milestones: [
    { id: "ms-1", name: "Q1 Release", date: "2026-03-31", status: "in_progress", task_count: 15, completed_count: 8 },
    { id: "ms-2", name: "Q2 Beta", date: "2026-06-30", status: "planned", task_count: 20, completed_count: 0 },
  ],
};

const mockTimeline = {
  sprints: mockSprints,
  milestones: [
    { id: "ms-1", name: "Q1 Release", date: "2026-03-31" },
  ],
};

const mockReleases = [
  { id: "rel-1", name: "v2.0.0", status: "released", release_date: "2026-02-01", description: "Major UI overhaul", task_count: 12 },
  { id: "rel-2", name: "v2.1.0", status: "planned", release_date: "2026-03-01", description: "Bug fixes and improvements", task_count: 8 },
];

const mockGoals = [
  { id: "goal-1", name: "Improve velocity by 20%", status: "in_progress", target_value: 20, current_value: 12, unit: "percent" },
  { id: "goal-2", name: "Zero critical bugs", status: "achieved", target_value: 0, current_value: 0, unit: "count" },
];

const mockBugs = [
  { id: "bug-1", title: "Login redirect broken on Safari", priority: "critical", status: "in_progress", assignee_id: "test-user-123" },
  { id: "bug-2", title: "Tooltip misaligned on mobile", priority: "low", status: "todo", assignee_id: "dev-2" },
];

const mockStories = [
  { id: "story-1", title: "As a user, I want to search for tasks", status: "in_progress", story_points: 8, acceptance_criteria: ["Search bar visible", "Results filter"] },
  { id: "story-2", title: "As a manager, I want to view team velocity", status: "todo", story_points: 5, acceptance_criteria: ["Velocity chart", "Period selector"] },
];

const mockTemplates = [
  { id: "tpl-1", name: "Bug Fix Sprint", description: "Template for bug fix sprints", task_templates: 5 },
  { id: "tpl-2", name: "Feature Sprint", description: "Template for feature development", task_templates: 8 },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupSprintsSubpageMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/projects`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockProjects) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/sprints**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockSprints) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/tasks**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTasks) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/roadmap**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRoadmap) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/timeline**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTimeline) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/releases**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockReleases) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/goals**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockGoals) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/bugs**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockBugs) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/stories**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockStories) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/templates**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTemplates) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/backlog**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTasks) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/projects/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockProjects[0]) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/task-statuses`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { id: "s1", name: "To Do", slug: "todo", category: "todo", color: "#3B82F6", is_default: true, position: 0 },
      { id: "s2", name: "In Progress", slug: "in_progress", category: "in_progress", color: "#F59E0B", is_default: false, position: 1 },
      { id: "s3", name: "Done", slug: "done", category: "done", color: "#10B981", is_default: false, position: 2 },
    ]) });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Sprints -- Roadmap Page", () => {
  test("renders the roadmap page", async ({ page }) => {
    await setupSprintsSubpageMocks(page);
    await page.goto("/sprints/proj-1/roadmap");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasRoadmap = await page.getByText(/roadmap/i).isVisible().catch(() => false);
    expect(hasRoadmap).toBeTruthy();
  });
});

test.describe("Sprints -- Timeline Page", () => {
  test("renders the timeline page", async ({ page }) => {
    await setupSprintsSubpageMocks(page);
    await page.goto("/sprints/proj-1/timeline");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasTimeline = await page.getByText(/timeline/i).isVisible().catch(() => false);
    expect(hasTimeline).toBeTruthy();
  });
});

test.describe("Sprints -- Releases Page", () => {
  test("renders the releases page", async ({ page }) => {
    await setupSprintsSubpageMocks(page);
    await page.goto("/sprints/proj-1/releases");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasReleases = await page.getByText(/release/i).isVisible().catch(() => false);
    expect(hasReleases).toBeTruthy();
  });
});

test.describe("Sprints -- Goals Page", () => {
  test("renders the goals page", async ({ page }) => {
    await setupSprintsSubpageMocks(page);
    await page.goto("/sprints/proj-1/goals");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasGoals = await page.getByText(/goal/i).isVisible().catch(() => false);
    expect(hasGoals).toBeTruthy();
  });
});

test.describe("Sprints -- Bugs Page", () => {
  test("renders the bugs page", async ({ page }) => {
    await setupSprintsSubpageMocks(page);
    await page.goto("/sprints/proj-1/bugs");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasBugs = await page.getByText(/bug/i).isVisible().catch(() => false);
    expect(hasBugs).toBeTruthy();
  });
});

test.describe("Sprints -- Stories Page", () => {
  test("renders the stories page", async ({ page }) => {
    await setupSprintsSubpageMocks(page);
    await page.goto("/sprints/proj-1/stories");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasStories = await page.getByText(/stor/i).isVisible().catch(() => false);
    expect(hasStories).toBeTruthy();
  });
});

test.describe("Sprints -- Templates Page", () => {
  test("renders the templates page", async ({ page }) => {
    await setupSprintsSubpageMocks(page);
    await page.goto("/sprints/proj-1/templates");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasTemplates = await page.getByText(/template/i).isVisible().catch(() => false);
    expect(hasTemplates).toBeTruthy();
  });
});
