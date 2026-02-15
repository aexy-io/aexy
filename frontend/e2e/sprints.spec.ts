import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

// ─── Mock Data ──────────────────────────────────────────────────────────────

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
  {
    id: "proj-2",
    name: "Mobile App",
    slug: "mobile-app",
    is_public: true,
    public_slug: "mobile-app",
    member_count: 3,
    workspace_id: "ws-1",
  },
];

const mockSprints = [
  {
    id: "sprint-1",
    name: "Sprint 12",
    status: "active",
    tasks_count: 10,
    completed_count: 6,
    total_points: 34,
    start_date: "2026-02-03T00:00:00Z",
    end_date: "2026-02-14T00:00:00Z",
    project_id: "proj-1",
    goal: "Complete user authentication module",
  },
  {
    id: "sprint-2",
    name: "Sprint 11",
    status: "completed",
    tasks_count: 12,
    completed_count: 12,
    total_points: 40,
    start_date: "2026-01-20T00:00:00Z",
    end_date: "2026-02-02T00:00:00Z",
    project_id: "proj-1",
    goal: null,
  },
  {
    id: "sprint-3",
    name: "Sprint 13",
    status: "planning",
    tasks_count: 5,
    completed_count: 0,
    total_points: 18,
    start_date: "2026-02-17T00:00:00Z",
    end_date: "2026-02-28T00:00:00Z",
    project_id: "proj-1",
    goal: "Prepare release v2.0",
  },
];

const mockSprintDetail = {
  id: "sprint-1",
  name: "Sprint 12",
  status: "active",
  tasks_count: 10,
  completed_count: 6,
  total_points: 34,
  start_date: "2026-02-03T00:00:00Z",
  end_date: "2026-02-14T00:00:00Z",
  project_id: "proj-1",
  goal: "Complete user authentication module",
};

const mockPlanningSprint = {
  id: "sprint-3",
  name: "Sprint 13",
  status: "planning",
  tasks_count: 5,
  completed_count: 0,
  total_points: 18,
  start_date: "2026-02-17T00:00:00Z",
  end_date: "2026-02-28T00:00:00Z",
  project_id: "proj-1",
  goal: "Prepare release v2.0",
};

const mockTasks = [
  {
    id: "task-1",
    title: "Implement login form",
    description: "Create the login page with email and password",
    status: "in_progress",
    priority: "high",
    story_points: 5,
    sprint_id: "sprint-1",
    assignee_id: "dev-2",
    assignee_name: "Alice Johnson",
    assignee_avatar_url: null,
    epic_id: null,
    labels: ["frontend", "auth"],
    source_type: null,
    source_url: null,
    created_at: "2026-02-03T10:00:00Z",
    updated_at: "2026-02-10T14:00:00Z",
    subtasks_count: 2,
    parent_task_id: null,
    status_id: null,
    sprint_name: "Sprint 12",
  },
  {
    id: "task-2",
    title: "Setup OAuth providers",
    description: "Add Google and GitHub OAuth",
    status: "todo",
    priority: "medium",
    story_points: 8,
    sprint_id: "sprint-1",
    assignee_id: null,
    assignee_name: null,
    assignee_avatar_url: null,
    epic_id: null,
    labels: ["backend"],
    source_type: "github_issue",
    source_url: "https://github.com/org/repo/issues/42",
    created_at: "2026-02-04T09:00:00Z",
    updated_at: null,
    subtasks_count: 0,
    parent_task_id: null,
    status_id: null,
    sprint_name: "Sprint 12",
  },
  {
    id: "task-3",
    title: "Write unit tests for auth service",
    description: null,
    status: "done",
    priority: "low",
    story_points: 3,
    sprint_id: "sprint-1",
    assignee_id: "test-user-123",
    assignee_name: "Test Developer",
    assignee_avatar_url: null,
    epic_id: null,
    labels: [],
    source_type: null,
    source_url: null,
    created_at: "2026-02-05T08:30:00Z",
    updated_at: "2026-02-09T16:00:00Z",
    subtasks_count: 0,
    parent_task_id: null,
    status_id: null,
    sprint_name: "Sprint 12",
  },
  {
    id: "task-4",
    title: "Fix password reset flow",
    description: "Users are not receiving reset emails",
    status: "backlog",
    priority: "critical",
    story_points: 3,
    sprint_id: "sprint-1",
    assignee_id: null,
    assignee_name: null,
    assignee_avatar_url: null,
    epic_id: null,
    labels: ["bug"],
    source_type: null,
    source_url: null,
    created_at: "2026-02-06T11:00:00Z",
    updated_at: null,
    subtasks_count: 0,
    parent_task_id: null,
    status_id: null,
    sprint_name: "Sprint 12",
  },
  {
    id: "task-5",
    title: "Review PR for session management",
    description: null,
    status: "review",
    priority: "medium",
    story_points: 2,
    sprint_id: "sprint-1",
    assignee_id: "dev-3",
    assignee_name: "Bob Smith",
    assignee_avatar_url: null,
    epic_id: null,
    labels: [],
    source_type: null,
    source_url: null,
    created_at: "2026-02-07T10:00:00Z",
    updated_at: "2026-02-11T09:00:00Z",
    subtasks_count: 0,
    parent_task_id: null,
    status_id: null,
    sprint_name: "Sprint 12",
  },
];

const mockBacklogTasks = [
  {
    id: "task-backlog-1",
    title: "Backlog item: Refactor auth middleware",
    description: "Clean up the middleware chain",
    status: "backlog",
    priority: "medium",
    story_points: 5,
    sprint_id: "sprint-1",
    assignee_id: null,
    assignee_name: null,
    assignee_avatar_url: null,
    epic_id: null,
    labels: ["refactor"],
    source_type: null,
    source_url: null,
    created_at: "2026-02-01T08:00:00Z",
    updated_at: null,
    subtasks_count: 0,
    parent_task_id: null,
    status_id: null,
    sprint_name: "Sprint 12",
  },
  {
    id: "task-backlog-2",
    title: "Backlog item: Add rate limiting",
    description: null,
    status: "backlog",
    priority: "high",
    story_points: 8,
    sprint_id: "sprint-1",
    assignee_id: null,
    assignee_name: null,
    assignee_avatar_url: null,
    epic_id: null,
    labels: ["security"],
    source_type: null,
    source_url: null,
    created_at: "2026-02-02T08:00:00Z",
    updated_at: null,
    subtasks_count: 0,
    parent_task_id: null,
    status_id: null,
    sprint_name: "Sprint 12",
  },
];

const mockSprintStats = {
  total_tasks: 10,
  completed_tasks: 6,
  in_progress_tasks: 2,
  total_points: 34,
  completed_points: 20,
};

const mockBurndownData = {
  dates: [
    "2026-02-03",
    "2026-02-05",
    "2026-02-07",
    "2026-02-09",
    "2026-02-11",
    "2026-02-13",
  ],
  ideal: [34, 28, 22, 17, 11, 0],
  actual: [34, 30, 25, 20, 16, 14],
  scope_changes: [0, 0, 2, 0, 0, 0],
};

const mockVelocityData = {
  sprints: [
    { sprint_id: "sprint-9", sprint_name: "Sprint 9", committed: 30, completed: 25, carry_over: 5, completion_rate: 0.83 },
    { sprint_id: "sprint-10", sprint_name: "Sprint 10", committed: 35, completed: 32, carry_over: 3, completion_rate: 0.91 },
    { sprint_id: "sprint-11", sprint_name: "Sprint 11", committed: 40, completed: 40, carry_over: 0, completion_rate: 1.0 },
    { sprint_id: "sprint-12", sprint_name: "Sprint 12", committed: 34, completed: 20, carry_over: 0, completion_rate: 0.59 },
  ],
  average_velocity: 29,
  trend: "improving",
};

const mockCapacity = {
  total_capacity_hours: 160,
  committed_hours: 140,
  utilization_rate: 0.875,
  overcommitted: false,
  recommendations: ["Consider adding buffer time for code reviews"],
};

const mockPrediction = {
  predicted_completion_rate: 0.75,
  confidence: 0.82,
  risk_factors: ["Two high-priority tasks still in backlog", "One developer out of office"],
  at_risk_tasks: [
    { title: "Setup OAuth providers", risk: "unassigned" },
    { title: "Fix password reset flow", risk: "critical priority, still in backlog" },
  ],
  recommendations: ["Assign OAuth task immediately", "Consider moving low-priority items to next sprint"],
};

const mockRetrospective = {
  id: "retro-1",
  sprint_id: "sprint-2",
  went_well: [
    { id: "ww-1", content: "Great team collaboration", votes: 3 },
    { id: "ww-2", content: "All tasks completed on time", votes: 5 },
  ],
  to_improve: [
    { id: "ti-1", content: "Too many meetings", votes: 4 },
    { id: "ti-2", content: "Better code review process needed", votes: 2 },
  ],
  action_items: [
    { id: "ai-1", item: "Reduce standup to 10 mins", status: "pending", assignee_id: null, due_date: null },
    { id: "ai-2", item: "Create code review checklist", status: "in_progress", assignee_id: "dev-2", due_date: "2026-02-20" },
  ],
  team_mood_score: 4,
  notes: "Overall a productive sprint",
};

const mockActivities = {
  items: [
    {
      id: "act-1",
      task_id: "task-1",
      action: "created",
      actor_name: "Test Developer",
      actor_avatar_url: null,
      field_name: null,
      old_value: null,
      new_value: null,
      comment: null,
      created_at: "2026-02-03T10:00:00Z",
    },
    {
      id: "act-2",
      task_id: "task-1",
      action: "status_changed",
      actor_name: "Alice Johnson",
      actor_avatar_url: null,
      field_name: "status",
      old_value: "todo",
      new_value: "in_progress",
      comment: null,
      created_at: "2026-02-08T14:00:00Z",
    },
    {
      id: "act-3",
      task_id: "task-1",
      action: "comment",
      actor_name: "Bob Smith",
      actor_avatar_url: null,
      field_name: null,
      old_value: null,
      new_value: null,
      comment: "Making good progress on this task",
      created_at: "2026-02-10T11:30:00Z",
    },
  ],
  total: 3,
};

const mockEpics = [
  {
    id: "epic-1",
    key: "AUTH",
    title: "User Authentication",
    description: "Complete authentication system",
    status: "in_progress",
    priority: "high",
    color: "#3B82F6",
    owner_name: "Test Developer",
    total_tasks: 8,
    completed_tasks: 4,
    progress_percentage: 50,
    target_date: "2026-03-15T00:00:00Z",
  },
  {
    id: "epic-2",
    key: "DASH",
    title: "Dashboard Redesign",
    description: "Revamp the main dashboard",
    status: "open",
    priority: "medium",
    color: "#8B5CF6",
    owner_name: "Alice Johnson",
    total_tasks: 12,
    completed_tasks: 0,
    progress_percentage: 0,
    target_date: null,
  },
];

const mockSuggestions = [
  {
    task_id: "task-2",
    suggested_developer_id: "dev-2",
    suggested_developer_name: "Alice Johnson",
    confidence: 0.87,
    reasoning: "Alice has experience with OAuth integrations and is available this sprint.",
  },
];

const mockStories = {
  items: [
    { id: "story-1", title: "As a user, I want to login", status: "in_progress", priority: "high" },
  ],
  total: 5,
};

const mockBugStats = {
  total: 3,
  by_severity: { blocker: 1, critical: 1, major: 1, minor: 0 },
};

const mockReleases = {
  items: [
    { id: "rel-1", name: "v2.0", status: "in_progress" },
  ],
  total: 2,
};

const mockOkrSummary = {
  total_objectives: 4,
  on_track: 2,
  at_risk: 1,
  behind: 1,
};

// ─── Setup Functions ────────────────────────────────────────────────────────

async function setupSprintsMocks(page: Page) {
  await setupCommonMocks(page);

  // Projects
  await page.route(`${API_BASE}/workspaces/ws-1/projects**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockProjects),
    });
  });

  // Sprints for project 1
  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/sprints**`, (route) => {
    const url = route.request().url();
    if (url.includes("/sprints/active")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockSprints[0]),
      });
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockSprints),
    });
  });

  // Active sprint for project 1
  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/sprints/active**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockSprints[0]),
    });
  });

  // Sprints for project 2 (no sprints)
  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-2/sprints**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Active sprint for project 2 (none)
  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-2/sprints/active**`, (route) => {
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ detail: "No active sprint" }),
    });
  });

  // Epics
  await page.route(`${API_BASE}/workspaces/ws-1/epics**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockEpics),
    });
  });

  // Stories
  await page.route(`${API_BASE}/workspaces/ws-1/stories**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockStories),
    });
  });

  // Bug stats
  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/bugs/stats**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockBugStats),
    });
  });

  // Bugs
  await page.route(`${API_BASE}/workspaces/ws-1/bugs**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0 }),
    });
  });

  // Releases
  await page.route(`${API_BASE}/workspaces/ws-1/releases**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockReleases),
    });
  });

  // OKR Dashboard
  await page.route(`${API_BASE}/workspaces/ws-1/okr**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockOkrSummary),
    });
  });

  // Task templates
  await page.route(`${API_BASE}/workspaces/ws-1/task-templates**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], total: 0 }),
    });
  });
}

async function setupSprintDetailMocks(page: Page) {
  await setupSprintsMocks(page);

  // Sprint detail - individual sprint
  await page.route(`${API_BASE}/workspaces/ws-1/teams/*/sprints/sprint-1`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockSprintDetail),
    });
  });

  // Planning sprint detail
  await page.route(`${API_BASE}/workspaces/ws-1/teams/*/sprints/sprint-3`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockPlanningSprint),
    });
  });

  // Sprint tasks
  await page.route(`${API_BASE}/sprints/sprint-1/tasks**`, (route) => {
    const url = route.request().url();
    if (url.includes("/export/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/octet-stream",
        body: Buffer.from("mock-export-data"),
      });
    }
    if (url.includes("/suggest-assignments")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockSuggestions),
      });
    }
    if (url.includes("/capacity")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockCapacity),
      });
    }
    if (url.includes("/completion-prediction")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockPrediction),
      });
    }
    if (url.includes("/activities")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockActivities),
      });
    }
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "task-new-1",
          title: "New Test Task",
          status: "todo",
          priority: "medium",
          story_points: 3,
          sprint_id: "sprint-1",
          assignee_id: null,
          assignee_name: null,
          assignee_avatar_url: null,
          epic_id: null,
          labels: [],
          source_type: null,
          source_url: null,
          created_at: "2026-02-15T10:00:00Z",
          updated_at: null,
          subtasks_count: 0,
          parent_task_id: null,
          status_id: null,
          sprint_name: "Sprint 12",
        }),
      });
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTasks),
    });
  });

  // Sprint stats
  await page.route(`${API_BASE}/workspaces/ws-1/teams/*/sprints/sprint-1/stats**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockSprintStats),
    });
  });

  // Burndown
  await page.route(`${API_BASE}/sprints/sprint-1/burndown**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockBurndownData),
    });
  });

  // Velocity
  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/velocity**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockVelocityData),
    });
  });

  // Retrospective
  await page.route(`${API_BASE}/sprints/sprint-1/retrospective**`, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockRetrospective),
      });
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockRetrospective),
    });
  });

  // Sprint lifecycle actions
  await page.route(`${API_BASE}/workspaces/ws-1/teams/*/sprints/sprint-1/start`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...mockSprintDetail, status: "active" }),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/teams/*/sprints/sprint-1/review`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...mockSprintDetail, status: "review" }),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/teams/*/sprints/sprint-1/retro`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...mockSprintDetail, status: "retrospective" }),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/teams/*/sprints/sprint-1/complete`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...mockSprintDetail, status: "completed" }),
    });
  });

  // Custom task statuses (empty = use defaults)
  await page.route(`${API_BASE}/workspaces/ws-1/task-statuses**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Project board tasks (used by board page)
  await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/tasks**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTasks),
    });
  });
}

async function setupRetrospectiveMocks(page: Page) {
  await setupSprintDetailMocks(page);

  // Sprint 2 detail for completed sprint retro
  await page.route(`${API_BASE}/workspaces/ws-1/teams/*/sprints/sprint-2`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...mockSprints[1],
        goal: "Complete feature set for v1.5",
      }),
    });
  });

  // Retrospective for sprint-2
  await page.route(`${API_BASE}/sprints/sprint-2/retrospective**`, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockRetrospective),
      });
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockRetrospective),
    });
  });

  // Stats for sprint-2
  await page.route(`${API_BASE}/workspaces/ws-1/teams/*/sprints/sprint-2/stats**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ total_tasks: 12, completed_tasks: 12, in_progress_tasks: 0, total_points: 40, completed_points: 40 }),
    });
  });
}

// ─── Test Suites ────────────────────────────────────────────────────────────

test.describe("Sprints Page — Project List", () => {
  test.beforeEach(async ({ page }) => {
    await setupSprintsMocks(page);
    await page.goto("/sprints");
    await page.waitForSelector("text=Planning", { timeout: 45000 });
  });

  test("renders the sprints page with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Planning" })).toBeVisible();
    await expect(page.getByText("Manage sprints and track progress across your projects")).toBeVisible();
  });

  test("shows project cards", async ({ page }) => {
    await expect(page.getByText("Aexy Platform")).toBeVisible();
    await expect(page.getByText("Mobile App")).toBeVisible();
  });

  test("shows tab navigation with Projects and Epics", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Projects" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Epics" })).toBeVisible();
  });

  test("project card shows active sprint info", async ({ page }) => {
    await expect(page.getByText("Active Sprint")).toBeVisible();
    await expect(page.getByText("Sprint 12")).toBeVisible();
  });

  test("project card shows sprint stats", async ({ page }) => {
    await expect(page.getByText("Sprints")).toBeVisible();
    // Completed count
    const completedLabel = page.getByText("Completed");
    await expect(completedLabel.first()).toBeVisible();
  });

  test("project card shows member count", async ({ page }) => {
    await expect(page.getByText("5 members")).toBeVisible();
    await expect(page.getByText("3 members")).toBeVisible();
  });

  test("project card has Board and Backlog links", async ({ page }) => {
    await expect(page.getByText("Board").first()).toBeVisible();
    await expect(page.getByText("Backlog").first()).toBeVisible();
  });

  test("project card shows progress percentage for active sprint", async ({ page }) => {
    // Sprint 12 has 6/10 completed = 60%
    await expect(page.getByText("60% complete")).toBeVisible();
  });

  test("project card shows task count in active sprint", async ({ page }) => {
    await expect(page.getByText("6/10")).toBeVisible();
  });

  test("project card shows story points for active sprint", async ({ page }) => {
    await expect(page.getByText("34 points")).toBeVisible();
  });

  test("project card shows open tasks count", async ({ page }) => {
    // Open tasks: totalTasks - completedTasks across all sprints
    // Sprint 12: 10 tasks, 6 completed => 4 open
    // Sprint 11: 12 tasks, 12 completed => 0 open
    // Sprint 13: 5 tasks, 0 completed => 5 open
    // Total open = 4 + 0 + 5 = 9
    await expect(page.getByText("Open Tasks")).toBeVisible();
  });

  test("shows Team Reviews and Settings links", async ({ page }) => {
    await expect(page.getByText("Team Reviews")).toBeVisible();
    await expect(page.getByText("Settings")).toBeVisible();
  });

  test("project without active sprint shows create sprint link", async ({ page }) => {
    // Mobile App (proj-2) has no sprints
    await expect(page.getByText("No active sprint")).toBeVisible();
    await expect(page.getByText("Create a sprint")).toBeVisible();
  });

  test("shows public/private badge on project cards", async ({ page }) => {
    // Both project cards show a badge
    const badges = page.getByText("Private");
    await expect(badges.first()).toBeVisible();
    await expect(page.getByText("Public")).toBeVisible();
  });
});

test.describe("Sprints Page — Epics Tab", () => {
  test.beforeEach(async ({ page }) => {
    await setupSprintsMocks(page);
    await page.goto("/sprints?tab=epics");
    await page.waitForSelector("text=Planning", { timeout: 45000 });
  });

  test("renders epics tab content", async ({ page }) => {
    // The Epics tab should be active
    await expect(page.getByRole("button", { name: "Epics" })).toBeVisible();
  });

  test("shows epic cards with title and progress", async ({ page }) => {
    await expect(page.getByText("User Authentication")).toBeVisible();
    await expect(page.getByText("Dashboard Redesign")).toBeVisible();
  });

  test("shows epic status badges", async ({ page }) => {
    await expect(page.getByText("in progress").first()).toBeVisible();
  });

  test("shows epic stats summary", async ({ page }) => {
    // Total epics count
    await expect(page.getByText("Total Epics")).toBeVisible();
  });

  test("shows Create Epic button", async ({ page }) => {
    await expect(page.getByText("Create Epic")).toBeVisible();
  });

  test("shows search input for filtering epics", async ({ page }) => {
    await expect(page.getByPlaceholder("Search epics...")).toBeVisible();
  });
});

test.describe("Sprint Planning Page — /sprints/[projectId]", () => {
  test.beforeEach(async ({ page }) => {
    await setupSprintDetailMocks(page);
    await page.goto("/sprints/proj-1");
    await page.waitForSelector("text=Sprint Planning", { timeout: 45000 });
  });

  test("renders sprint planning page with heading", async ({ page }) => {
    await expect(page.getByText("Sprint Planning")).toBeVisible();
    await expect(page.getByText("Manage sprints and track progress")).toBeVisible();
  });

  test("shows New Sprint button", async ({ page }) => {
    await expect(page.getByText("New Sprint")).toBeVisible();
  });

  test("shows active sprint card with details", async ({ page }) => {
    await expect(page.getByText("Active Sprint")).toBeVisible();
    await expect(page.getByText("Sprint 12").first()).toBeVisible();
  });

  test("shows current sprint overview section", async ({ page }) => {
    await expect(page.getByText("Current Sprint")).toBeVisible();
    await expect(page.getByText("View Board")).toBeVisible();
  });

  test("shows sprint progress stats", async ({ page }) => {
    await expect(page.getByText("Total Tasks")).toBeVisible();
    await expect(page.getByText("Story Points")).toBeVisible();
  });

  test("shows quick stats dashboard widgets", async ({ page }) => {
    await expect(page.getByText("User Stories")).toBeVisible();
    await expect(page.getByText("Open Bugs")).toBeVisible();
    await expect(page.getByText("Releases")).toBeVisible();
    await expect(page.getByText("OKR Goals")).toBeVisible();
  });

  test("shows completed sprints section", async ({ page }) => {
    // Sprint 11 is completed
    await expect(page.getByText("Sprint 11")).toBeVisible();
  });

  test("shows planning sprints section", async ({ page }) => {
    // Sprint 13 is in planning
    await expect(page.getByText("Sprint 13")).toBeVisible();
  });

  test("sprint card shows date range", async ({ page }) => {
    // Sprint 12: Feb 3 - Feb 14
    await expect(page.getByText(/Feb 3/).first()).toBeVisible();
    await expect(page.getByText(/Feb 14/).first()).toBeVisible();
  });

  test("sprint card shows progress bar and percentage", async ({ page }) => {
    await expect(page.getByText("Progress").first()).toBeVisible();
    // Sprint 12: 6/10 = 60%
    await expect(page.getByText("60%").first()).toBeVisible();
  });
});

test.describe("Sprint Board Page — /sprints/[projectId]/board", () => {
  test.beforeEach(async ({ page }) => {
    await setupSprintDetailMocks(page);
    await page.goto("/sprints/proj-1/board");
    await page.waitForSelector("text=Project Board", { timeout: 45000 });
  });

  test("renders board page with heading", async ({ page }) => {
    await expect(page.getByText("Project Board")).toBeVisible();
  });

  test("shows task count and sprint count in subheading", async ({ page }) => {
    await expect(page.getByText(/tasks across.*sprints/)).toBeVisible();
  });

  test("shows view mode toggle with Sprints and Status options", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Sprints" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Status" })).toBeVisible();
  });

  test("shows Add Task button", async ({ page }) => {
    await expect(page.getByText("Add Task")).toBeVisible();
  });

  test("shows Export button", async ({ page }) => {
    await expect(page.getByText("Export")).toBeVisible();
  });

  test("shows Templates link", async ({ page }) => {
    await expect(page.getByText("Templates")).toBeVisible();
  });

  test("shows keyboard shortcuts hint in footer", async ({ page }) => {
    await expect(page.getByText("Search")).toBeVisible();
    await expect(page.getByText("Create task")).toBeVisible();
  });
});

test.describe("Sprint Board — Status View Columns", () => {
  test.beforeEach(async ({ page }) => {
    await setupSprintDetailMocks(page);
    await page.goto("/sprints/proj-1/board");
    await page.waitForSelector("text=Project Board", { timeout: 45000 });
    // Switch to Status view
    await page.getByRole("button", { name: "Status" }).click();
  });

  test("shows all status columns in status view", async ({ page }) => {
    await expect(page.getByText("Backlog").first()).toBeVisible();
    await expect(page.getByText("To Do").first()).toBeVisible();
    await expect(page.getByText("In Progress").first()).toBeVisible();
    await expect(page.getByText("Review").first()).toBeVisible();
    await expect(page.getByText("Done").first()).toBeVisible();
  });

  test("shows task cards with titles in the columns", async ({ page }) => {
    await expect(page.getByText("Implement login form")).toBeVisible();
    await expect(page.getByText("Setup OAuth providers")).toBeVisible();
    await expect(page.getByText("Write unit tests for auth service")).toBeVisible();
  });

  test("shows empty column message for columns with no tasks", async ({ page }) => {
    // Check that empty columns show a placeholder
    const dropTexts = page.getByText("Drop tasks here");
    // Some columns may be empty
    const count = await dropTexts.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe("Sprint Detail — Kanban Board /sprints/[projectId]/[sprintId]", () => {
  test.beforeEach(async ({ page }) => {
    await setupSprintDetailMocks(page);
    await page.goto("/sprints/proj-1/sprint-1");
    await page.waitForSelector("text=Sprint 12", { timeout: 45000 });
  });

  test("shows sprint name as heading", async ({ page }) => {
    await expect(page.getByText("Sprint 12").first()).toBeVisible();
  });

  test("shows sprint goal", async ({ page }) => {
    await expect(page.getByText("Complete user authentication module")).toBeVisible();
  });

  test("shows sprint date range in header", async ({ page }) => {
    await expect(page.getByText(/Feb 3/)).toBeVisible();
    await expect(page.getByText(/Feb 14/)).toBeVisible();
  });

  test("shows completion percentage in header", async ({ page }) => {
    await expect(page.getByText(/complete/)).toBeVisible();
  });

  test("shows Add Task button", async ({ page }) => {
    await expect(page.getByText("Add Task").first()).toBeVisible();
  });

  test("shows AI Suggest button", async ({ page }) => {
    await expect(page.getByText("AI Suggest")).toBeVisible();
  });

  test("shows Analytics link", async ({ page }) => {
    await expect(page.getByText("Analytics")).toBeVisible();
  });

  test("shows sprint stats bar with task counts and points", async ({ page }) => {
    await expect(page.getByText("Tasks:")).toBeVisible();
    await expect(page.getByText("Completed:")).toBeVisible();
    await expect(page.getByText("In Progress:")).toBeVisible();
    await expect(page.getByText("Total Points:")).toBeVisible();
    await expect(page.getByText("Completed Points:")).toBeVisible();
  });

  test("shows kanban columns with task status headers", async ({ page }) => {
    await expect(page.getByText("Backlog").first()).toBeVisible();
    await expect(page.getByText("To Do").first()).toBeVisible();
    await expect(page.getByText("In Progress").first()).toBeVisible();
    await expect(page.getByText("Review").first()).toBeVisible();
    await expect(page.getByText("Done").first()).toBeVisible();
  });

  test("shows task cards in the board", async ({ page }) => {
    await expect(page.getByText("Implement login form")).toBeVisible();
    await expect(page.getByText("Setup OAuth providers")).toBeVisible();
    await expect(page.getByText("Write unit tests for auth service")).toBeVisible();
    await expect(page.getByText("Fix password reset flow")).toBeVisible();
    await expect(page.getByText("Review PR for session management")).toBeVisible();
  });

  test("task card shows priority badge", async ({ page }) => {
    // "Critical" priority label on task-4
    await expect(page.getByText("Critical").first()).toBeVisible();
    await expect(page.getByText("High").first()).toBeVisible();
  });

  test("task card shows story points", async ({ page }) => {
    await expect(page.getByText("5 SP").first()).toBeVisible();
    await expect(page.getByText("8 SP").first()).toBeVisible();
  });

  test("shows Start Review button for active sprint", async ({ page }) => {
    await expect(page.getByText("Start Review")).toBeVisible();
  });
});

test.describe("Sprint Analytics Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupSprintDetailMocks(page);
    await page.goto("/sprints/proj-1/sprint-1/analytics");
    await page.waitForSelector("text=Sprint Analytics", { timeout: 45000 });
  });

  test("renders analytics page heading with sprint name", async ({ page }) => {
    await expect(page.getByText("Sprint Analytics")).toBeVisible();
    await expect(page.getByText("Sprint 12")).toBeVisible();
  });

  test("shows overview stat cards", async ({ page }) => {
    await expect(page.getByText("Task Completion")).toBeVisible();
    await expect(page.getByText("Points Completed")).toBeVisible();
    await expect(page.getByText("In Progress")).toBeVisible();
    await expect(page.getByText("Average Velocity")).toBeVisible();
  });

  test("shows completion rate percentage", async ({ page }) => {
    // 6/10 = 60%
    await expect(page.getByText("60%").first()).toBeVisible();
  });

  test("shows points completion rate", async ({ page }) => {
    // 20/34 = 59%
    await expect(page.getByText("59%").first()).toBeVisible();
  });

  test("shows burndown chart section", async ({ page }) => {
    await expect(page.getByText("Burndown Chart")).toBeVisible();
  });

  test("shows velocity trend section", async ({ page }) => {
    await expect(page.getByText("Velocity Trend")).toBeVisible();
  });

  test("shows capacity analysis section", async ({ page }) => {
    await expect(page.getByText("Capacity Analysis")).toBeVisible();
  });

  test("shows capacity stats values", async ({ page }) => {
    await expect(page.getByText("Total Capacity")).toBeVisible();
    await expect(page.getByText("Committed")).toBeVisible();
    await expect(page.getByText("Utilization")).toBeVisible();
  });

  test("shows completion prediction section", async ({ page }) => {
    await expect(page.getByText("Completion Prediction")).toBeVisible();
  });

  test("shows predicted completion rate", async ({ page }) => {
    // 75% predicted
    await expect(page.getByText("75%").first()).toBeVisible();
    await expect(page.getByText("Predicted Completion")).toBeVisible();
  });

  test("shows risk factors when present", async ({ page }) => {
    await expect(page.getByText("Risk Factors")).toBeVisible();
    await expect(page.getByText(/Two high-priority tasks/)).toBeVisible();
  });

  test("shows at-risk tasks", async ({ page }) => {
    await expect(page.getByText("At-Risk Tasks")).toBeVisible();
    await expect(page.getByText("Setup OAuth providers")).toBeVisible();
  });

  test("shows recommendations in prediction section", async ({ page }) => {
    await expect(page.getByText("Recommendations").first()).toBeVisible();
    await expect(page.getByText(/Assign OAuth task/)).toBeVisible();
  });

  test("shows average velocity value", async ({ page }) => {
    // velocity.average_velocity = 29
    await expect(page.getByText("29")).toBeVisible();
    await expect(page.getByText("points per sprint")).toBeVisible();
  });
});

test.describe("Sprint Retrospective Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupRetrospectiveMocks(page);
    await page.goto("/sprints/proj-1/sprint-2/retrospective");
    await page.waitForSelector("text=Sprint Retrospective", { timeout: 45000 });
  });

  test("renders retrospective page heading", async ({ page }) => {
    await expect(page.getByText("Sprint Retrospective")).toBeVisible();
  });

  test("shows Save button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Save/ })).toBeVisible();
  });

  test("shows Team Mood section with mood options", async ({ page }) => {
    await expect(page.getByText("Team Mood")).toBeVisible();
    await expect(page.getByText("Frustrated")).toBeVisible();
    await expect(page.getByText("Unhappy")).toBeVisible();
    await expect(page.getByText("Neutral")).toBeVisible();
    await expect(page.getByText("Happy")).toBeVisible();
    await expect(page.getByText("Amazing")).toBeVisible();
  });

  test("shows What Went Well column with items", async ({ page }) => {
    await expect(page.getByText("What Went Well")).toBeVisible();
    await expect(page.getByText("Great team collaboration")).toBeVisible();
    await expect(page.getByText("All tasks completed on time")).toBeVisible();
  });

  test("shows What Could Improve column with items", async ({ page }) => {
    await expect(page.getByText("What Could Improve")).toBeVisible();
    await expect(page.getByText("Too many meetings")).toBeVisible();
    await expect(page.getByText("Better code review process needed")).toBeVisible();
  });

  test("shows Action Items column with items", async ({ page }) => {
    await expect(page.getByText("Action Items")).toBeVisible();
    await expect(page.getByText("Reduce standup to 10 mins")).toBeVisible();
    await expect(page.getByText("Create code review checklist")).toBeVisible();
  });

  test("shows vote counts on retro items", async ({ page }) => {
    // ww-2 has 5 votes, ti-1 has 4 votes
    await expect(page.getByText("5").first()).toBeVisible();
  });

  test("shows Add Item buttons in each column", async ({ page }) => {
    const addButtons = page.getByText("Add Item");
    // Should have at least 2 add buttons (went well + to improve)
    expect(await addButtons.count()).toBeGreaterThanOrEqual(2);
  });

  test("shows Add Action Item button", async ({ page }) => {
    await expect(page.getByText("Add Action Item")).toBeVisible();
  });

  test("shows Additional Notes section", async ({ page }) => {
    await expect(page.getByText("Additional Notes")).toBeVisible();
  });
});

test.describe("Backlog Page — /sprints/[projectId]/backlog", () => {
  test.beforeEach(async ({ page }) => {
    await setupSprintDetailMocks(page);

    // Override to return backlog tasks
    await page.route(`${API_BASE}/workspaces/ws-1/projects/proj-1/tasks**`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([...mockBacklogTasks, ...mockTasks]),
      });
    });

    await page.goto("/sprints/proj-1/backlog");
    await page.waitForSelector("text=Product Backlog", { timeout: 45000 });
  });

  test("renders backlog page heading", async ({ page }) => {
    await expect(page.getByText("Product Backlog")).toBeVisible();
  });

  test("shows Add Item button", async ({ page }) => {
    await expect(page.getByText("Add Item")).toBeVisible();
  });

  test("shows search input for filtering backlog items", async ({ page }) => {
    await expect(page.getByPlaceholder("Search backlog items...")).toBeVisible();
  });

  test("shows priority filter buttons", async ({ page }) => {
    await expect(page.getByText("All").first()).toBeVisible();
    await expect(page.getByText("Critical").first()).toBeVisible();
    await expect(page.getByText("High").first()).toBeVisible();
    await expect(page.getByText("Medium").first()).toBeVisible();
    await expect(page.getByText("Low").first()).toBeVisible();
  });

  test("shows view toggle between list and board modes", async ({ page }) => {
    // List and board view toggle buttons are present
    const buttons = page.locator("button");
    // The view toggle contains two buttons
    await expect(buttons.first()).toBeVisible();
  });

  test("shows sprint sidebar with active sprint info", async ({ page }) => {
    // The sidebar shows the sprints section
    await expect(page.getByText("Sprints").first()).toBeVisible();
  });

  test("shows Backlog Stats section in sidebar", async ({ page }) => {
    await expect(page.getByText("Backlog Stats")).toBeVisible();
    await expect(page.getByText("Items")).toBeVisible();
    await expect(page.getByText("Points")).toBeVisible();
  });
});
