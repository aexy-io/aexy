import type { Page, Route } from "@playwright/test";

export const API_BASE = "**/api/v1";
export const WORKSPACE_ID = "ws-1";
export const PROJECT_ID = "project-1";
export const SPRINT_ID = "sprint-1";

export const mockUser = {
  id: "dev-1",
  email: "dev@example.com",
  name: "Dev User",
  avatar_url: null,
  skill_fingerprint: null,
  work_patterns: null,
  growth_trajectory: null,
  github_connection: {
    github_username: "devuser",
    github_name: "Dev User",
    github_avatar_url: null,
    connected_at: "2026-01-01T00:00:00Z",
    auth_status: "active",
    auth_error: null,
  },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

export const mockWorkspace = {
  id: WORKSPACE_ID,
  name: "Test Workspace",
  slug: "test-workspace",
  type: "internal",
  description: null,
  avatar_url: null,
  github_org_id: null,
  owner_id: "dev-1",
  member_count: 1,
  team_count: 1,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

export const mockEffectiveAccess = {
  apps: {
    dashboard: { app_id: "dashboard", enabled: true, modules: {} },
    sprints: { app_id: "sprints", enabled: true, modules: {} },
    settings: { app_id: "settings", enabled: true, modules: {} },
  },
  applied_template_id: null,
  applied_template_name: null,
  has_custom_overrides: false,
  is_admin: true,
};

export const mockProject = {
  id: PROJECT_ID,
  workspace_id: WORKSPACE_ID,
  name: "Aexy Web",
  slug: "aexy-web",
  description: null,
  is_public: false,
  public_slug: null,
  color: "#6366f1",
  icon: "layout-grid",
  settings: {},
  status: "active",
  member_count: 1,
  team_count: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

export const mockSprint = {
  id: SPRINT_ID,
  team_id: PROJECT_ID,
  name: "Sprint 42",
  goal: "Verify task feature changes",
  status: "active",
  start_date: "2026-04-20",
  end_date: "2026-05-15",
  tasks_count: 1,
  completed_count: 0,
  total_points: 0,
  completed_points: 0,
  settings: {},
};

export const mockMember = {
  id: "member-1",
  developer_id: "dev-1",
  developer_name: "Dev User",
  developer_email: "dev@example.com",
  developer_avatar_url: null,
  role: "owner",
  status: "active",
  joined_at: "2026-01-01T00:00:00Z",
};

const baseTaskFields = {
  team_id: PROJECT_ID,
  workspace_id: WORKSPACE_ID,
  sprint_id: SPRINT_ID,
  source_type: "manual",
  source_id: "",
  source_url: null,
  description_json: null,
  story_points: null,
  labels: [],
  assignee_id: null,
  assignee_name: null,
  assignee_avatar_url: null,
  assignment_reason: null,
  assignment_confidence: null,
  status_id: null,
  custom_fields: {},
  parent_task_id: null,
  subtasks_count: 0,
  started_at: null,
  completed_at: null,
  work_started_at: null,
  cycle_time_hours: null,
  lead_time_hours: null,
  contributes_to_goal: false,
  carried_over_from_sprint_id: null,
  epic_id: null,
  last_synced_at: null,
  external_updated_at: null,
  sync_status: "synced",
  mentioned_user_ids: [],
  mentioned_file_paths: [],
  is_archived: false,
  start_date: null,
  end_date: null,
  estimated_hours: null,
  attachments: [] as Array<Record<string, unknown>>,
  created_at: "2026-04-25T10:00:00Z",
  updated_at: "2026-04-25T10:00:00Z",
};

export function makeTask(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "task-1",
    title: "Fix task modal GitHub links",
    description: "Wire PR linking",
    priority: "high",
    status: "in_progress",
    ...baseTaskFields,
    ...overrides,
  };
}

/**
 * Install the bare-minimum stack of mocks needed to render the sprint board
 * with a single task. Specs can layer additional `page.route()` calls on top
 * before navigating, since Playwright matches the most-recently-registered
 * route first.
 */
export async function setupTaskBoardMocks(
  page: Page,
  options: {
    tasks?: Array<Record<string, unknown>>;
    onTaskRoute?: (route: Route) => Promise<void> | void;
  } = {},
) {
  const tasks = options.tasks ?? [makeTask()];

  await page.addInitScript(() => {
    localStorage.setItem("token", "fake-test-token");
    localStorage.setItem("current_workspace_id", "ws-1");
  });

  // Generic catch-all: anything not specifically mocked returns an empty array.
  await page.route(`${API_BASE}/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.route(`${API_BASE}/notifications/count**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0 }) });
  });

  await page.route(`${API_BASE}/notifications/poll**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [], latest_timestamp: null }),
    });
  });

  await page.route(`${API_BASE}/notifications**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        notifications: [],
        total: 0,
        page: 1,
        per_page: 20,
        has_next: false,
        unread_count: 0,
      }),
    });
  });

  await page.route(`${API_BASE}/developers/me`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockUser) });
  });

  await page.route(`${API_BASE}/workspaces`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([mockWorkspace]) });
  });

  await page.route(`${API_BASE}/workspaces/${WORKSPACE_ID}`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockWorkspace) });
  });

  await page.route(`${API_BASE}/workspaces/${WORKSPACE_ID}/members**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([mockMember]) });
  });

  await page.route(`${API_BASE}/workspaces/${WORKSPACE_ID}/app-access/members/dev-1/effective`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockEffectiveAccess) });
  });

  await page.route(`${API_BASE}/workspaces/${WORKSPACE_ID}/app-access/requests/mine**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.route(`${API_BASE}/workspaces/${WORKSPACE_ID}/teams/${PROJECT_ID}/sprints**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([mockSprint]) });
  });

  await page.route(`${API_BASE}/workspaces/${WORKSPACE_ID}/projects/${PROJECT_ID}`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockProject) });
  });

  await page.route(`${API_BASE}/workspaces/${WORKSPACE_ID}/epics**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.route(`${API_BASE}/workspaces/${WORKSPACE_ID}/saved-views/sprint_task**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.route(`${API_BASE}/workspaces/${WORKSPACE_ID}/task-templates**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], total: 0 }) });
  });

  await page.route(`${API_BASE}/teams/${PROJECT_ID}/tasks**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.route(`${API_BASE}/sprints/${SPRINT_ID}/tasks`, async (route) => {
    if (options.onTaskRoute) {
      await options.onTaskRoute(route);
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(tasks) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(tasks) });
  });

  // Default github-links + activities so the modal doesn't 404 on open.
  for (const task of tasks) {
    const id = (task as { id: string }).id;
    await page.route(`${API_BASE}/sprints/${SPRINT_ID}/tasks/${id}/github-links`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route(`${API_BASE}/sprints/${SPRINT_ID}/tasks/${id}/github-links/issue-repositories`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ repositories: [], inferred_repository: null }),
      });
    });
    await page.route(`${API_BASE}/sprints/${SPRINT_ID}/tasks/${id}/activities**`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ activities: [], total: 0 }),
      });
    });
  }
}
