import { test, expect, Page } from "@playwright/test";

const API_BASE = "**/api/v1";
const WORKSPACE_ID = "ws-1";
const PROJECT_ID = "project-1";
const SPRINT_ID = "sprint-1";
const TASK_ID = "task-1";

const mockUser = {
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

const mockWorkspace = {
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

const mockEffectiveAccess = {
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

const mockProject = {
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

const mockSprint = {
  id: SPRINT_ID,
  team_id: PROJECT_ID,
  name: "Sprint 42",
  goal: "Ship task modal polish",
  status: "active",
  start_date: "2026-04-20",
  end_date: "2026-05-03",
  tasks_count: 1,
  completed_count: 0,
  total_points: 5,
  completed_points: 0,
  settings: {},
};

const mockTask = {
  id: TASK_ID,
  sprint_id: SPRINT_ID,
  team_id: PROJECT_ID,
  workspace_id: WORKSPACE_ID,
  source_type: "manual",
  source_id: "",
  source_url: null,
  title: "Fix task modal GitHub links",
  description: "Wire PR linking",
  description_json: null,
  story_points: 5,
  priority: "high",
  labels: [],
  assignee_id: "dev-1",
  assignee_name: "Dev User",
  assignee_avatar_url: null,
  assignment_reason: null,
  assignment_confidence: null,
  status: "in_progress",
  status_id: null,
  custom_fields: {},
  started_at: null,
  completed_at: null,
  work_started_at: null,
  cycle_time_hours: null,
  lead_time_hours: null,
  contributes_to_goal: false,
  carried_over_from_sprint_id: null,
  epic_id: null,
  parent_task_id: null,
  subtasks_count: 0,
  last_synced_at: null,
  external_updated_at: null,
  sync_status: "synced",
  mentioned_user_ids: [],
  mentioned_file_paths: [],
  is_archived: false,
  created_at: "2026-04-25T10:00:00Z",
  updated_at: "2026-04-25T10:00:00Z",
};

const existingLink = {
  id: "link-1",
  link_type: "pull_request",
  is_auto_linked: true,
  created_at: "2026-04-25T12:00:00Z",
  pull_request: {
    id: "pr-1",
    github_id: 101,
    number: 101,
    repository: "aexy/web",
    title: "Existing task modal cleanup",
    state: "open",
    url: "https://github.com/aexy/web/pull/101",
  },
  github_issue: null,
};

const existingIssueLink = {
  id: "issue-link-1",
  link_type: "github_issue",
  is_auto_linked: true,
  created_at: "2026-04-25T12:30:00Z",
  pull_request: null,
  github_issue: {
    repository: "aexy/web",
    number: 42,
    title: "Auto-linked modal issue",
    state: "open",
    url: "https://github.com/aexy/web/issues/42",
  },
};

const linkablePullRequest = {
  id: "pr-2",
  github_id: 102,
  number: 102,
  repository: "aexy/web",
  title: "Wire GitHub PR picker",
  state: "open",
  url: "https://github.com/aexy/web/pull/102",
};

const linkableIssue = {
  repository: "aexy/web",
  number: 43,
  title: "Manual issue picker link",
  state: "open",
  url: "https://github.com/aexy/web/issues/43",
};

const externalIssue = {
  repository: "aexy/api",
  number: 99,
  title: null,
  state: null,
  url: "https://github.com/aexy/api/issues/99",
};

async function setupTaskModalMocks(page: Page) {
  let githubLinks: Array<Record<string, unknown>> = [existingLink, existingIssueLink];
  const calls = { link: 0, issueLink: 0, externalIssueLink: 0, unlink: 0, issueUnlink: 0 };

  await page.addInitScript(() => {
    localStorage.setItem("token", "fake-test-token");
    localStorage.setItem("current_workspace_id", "ws-1");
  });

  await page.route(`${API_BASE}/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.route(`${API_BASE}/notifications/count**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0 }) });
  });

  await page.route(`${API_BASE}/notifications/poll**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ notifications: [], latest_timestamp: null }) });
  });

  await page.route(`${API_BASE}/notifications**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [], total: 0, page: 1, per_page: 20, has_next: false, unread_count: 0 }),
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
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "member-1", developer_id: "dev-1", developer_name: "Dev User", developer_email: "dev@example.com", developer_avatar_url: null, role: "owner", joined_at: "2026-01-01T00:00:00Z" }]),
    });
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

  await page.route(`${API_BASE}/sprints/${SPRINT_ID}/tasks`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([mockTask]) });
  });

  await page.route(`${API_BASE}/teams/${PROJECT_ID}/tasks**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
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

  await page.route(`${API_BASE}/sprints/${SPRINT_ID}/tasks/${TASK_ID}/github-links`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(githubLinks) });
  });

  await page.route(`${API_BASE}/sprints/${SPRINT_ID}/tasks/${TASK_ID}/github-links/issue-repositories`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ repositories: ["aexy/web"], inferred_repository: "aexy/web" }),
    });
  });

  await page.route(`${API_BASE}/sprints/${SPRINT_ID}/tasks/github/pull-requests**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([existingLink.pull_request, linkablePullRequest]) });
  });

  await page.route(`${API_BASE}/sprints/${SPRINT_ID}/tasks/github/issues**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([existingIssueLink.github_issue, linkableIssue]) });
  });

  await page.route(`${API_BASE}/sprints/${SPRINT_ID}/tasks/${TASK_ID}/github-links/pull-requests`, async (route) => {
    calls.link += 1;
    const newLink = { id: "link-2", link_type: "pull_request", is_auto_linked: false, created_at: "2026-04-26T12:00:00Z", pull_request: linkablePullRequest, github_issue: null };
    githubLinks = [...githubLinks, newLink];
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(newLink) });
  });

  await page.route(`${API_BASE}/sprints/${SPRINT_ID}/tasks/${TASK_ID}/github-links/issues`, async (route) => {
    const body = route.request().postDataJSON();
    const issue = body.repository === externalIssue.repository && body.issue_number === externalIssue.number
      ? externalIssue
      : linkableIssue;
    if (issue === externalIssue) {
      calls.externalIssueLink += 1;
    } else {
      calls.issueLink += 1;
    }
    const newLink = { id: `issue-link-${githubLinks.length + 1}`, link_type: "github_issue", is_auto_linked: false, created_at: "2026-04-26T12:30:00Z", pull_request: null, github_issue: issue };
    githubLinks = [...githubLinks, newLink];
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(newLink) });
  });

  await page.route(`${API_BASE}/sprints/${SPRINT_ID}/tasks/${TASK_ID}/github-links/link-1`, async (route) => {
    calls.unlink += 1;
    githubLinks = githubLinks.filter((link) => link.id !== "link-1");
    await route.fulfill({ status: 204, body: "" });
  });

  await page.route(`${API_BASE}/sprints/${SPRINT_ID}/tasks/${TASK_ID}/github-links/issue-link-1`, async (route) => {
    calls.issueUnlink += 1;
    githubLinks = githubLinks.filter((link) => link.id !== "issue-link-1");
    await route.fulfill({ status: 204, body: "" });
  });

  return calls;
}

test.describe("Task modal GitHub PR links", () => {
  test("shows, links, and unlinks synced pull requests", async ({ page }) => {
    const calls = await setupTaskModalMocks(page);

    await page.goto(`sprints/${PROJECT_ID}/board?task=${TASK_ID}`);
    await expect(page.getByRole("dialog", { name: "Fix task modal GitHub links" })).toBeVisible({ timeout: 20000 });

    await expect(page.getByRole("heading", { name: "GitHub PRs" })).toBeVisible();
    await expect(page.getByText("aexy/web #101 - Existing task modal cleanup")).toBeVisible();
    await expect(page.getByRole("heading", { name: "GitHub Issues" })).toBeVisible();
    await expect(page.getByText("aexy/web #42 - Auto-linked modal issue")).toBeVisible();
    await expect(page.getByText("Bare #123 links use aexy/web")).toBeVisible();

    await page.getByPlaceholder("Search synced PRs...").fill("picker");
    await page.getByLabel("Select pull request").selectOption("pr-2");
    await page.getByRole("button", { name: "Link", exact: true }).first().click();

    await expect(page.getByText("aexy/web #102 - Wire GitHub PR picker")).toBeVisible();
    expect(calls.link).toBe(1);

    await page.getByPlaceholder("Search imported issues...").fill("picker");
    await page.getByLabel("Select GitHub issue").selectOption("aexy/web#43");
    await page.getByRole("button", { name: "Link", exact: true }).last().click();

    await expect(page.getByText("aexy/web #43 - Manual issue picker link")).toBeVisible();
    expect(calls.issueLink).toBe(1);

    await page.getByLabel("GitHub issue repository").fill("aexy/api");
    await page.getByLabel("GitHub issue reference").fill("#99");
    await page.getByRole("button", { name: "Link issue" }).click();

    await expect(page.getByText("aexy/api #99")).toBeVisible();
    expect(calls.externalIssueLink).toBe(1);

    await page.getByRole("button", { name: "Unlink pull request" }).first().click();
    await expect(page.getByText("Existing task modal cleanup")).not.toBeVisible();
    expect(calls.unlink).toBe(1);

    await page.getByRole("button", { name: "Unlink GitHub issue" }).first().click();
    await expect(page.getByText("Auto-linked modal issue")).not.toBeVisible();
    expect(calls.issueUnlink).toBe(1);
  });
});
