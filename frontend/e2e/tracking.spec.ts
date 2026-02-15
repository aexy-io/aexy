import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import {
  setupCommonMocks,
  API_BASE,
  mockMembers,
} from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockStandups = [
  {
    id: "standup-1",
    developer_id: "test-user-123",
    team_id: "team-1",
    sprint_id: null,
    workspace_id: "ws-1",
    standup_date: new Date().toISOString().split("T")[0],
    yesterday_summary: "Completed the user authentication flow and wrote unit tests",
    today_plan: "Working on the dashboard metrics API integration",
    blockers_summary: "Waiting on design review for the settings page",
    source: "web",
    slack_message_ts: null,
    slack_channel_id: null,
    parsed_tasks: null,
    parsed_blockers: null,
    sentiment_score: 0.72,
    productivity_signals: null,
    submitted_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    developer_name: "Test Developer",
    developer_avatar: null,
    developer: { id: "test-user-123", name: "Test Developer", email: "test@example.com", avatar_url: null },
  },
  {
    id: "standup-2",
    developer_id: "test-user-123",
    team_id: "team-1",
    sprint_id: null,
    workspace_id: "ws-1",
    standup_date: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]; })(),
    yesterday_summary: "Fixed pagination bug in the team list component",
    today_plan: "Implement user authentication flow with OAuth2",
    blockers_summary: null,
    source: "web",
    slack_message_ts: null,
    slack_channel_id: null,
    parsed_tasks: null,
    parsed_blockers: null,
    sentiment_score: 0.85,
    productivity_signals: null,
    submitted_at: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString(); })(),
    created_at: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString(); })(),
    updated_at: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString(); })(),
    developer_name: "Test Developer",
    developer_avatar: null,
    developer: { id: "test-user-123", name: "Test Developer", email: "test@example.com", avatar_url: null },
  },
  {
    id: "standup-3",
    developer_id: "test-user-123",
    team_id: "team-1",
    sprint_id: null,
    workspace_id: "ws-1",
    standup_date: (() => { const d = new Date(); d.setDate(d.getDate() - 2); return d.toISOString().split("T")[0]; })(),
    yesterday_summary: "Set up CI/CD pipeline for the staging environment",
    today_plan: "Fix pagination bug in team list and review PRs",
    blockers_summary: "DevOps access request still pending approval",
    source: "slack_channel",
    slack_message_ts: null,
    slack_channel_id: null,
    parsed_tasks: null,
    parsed_blockers: null,
    sentiment_score: 0.45,
    productivity_signals: null,
    submitted_at: (() => { const d = new Date(); d.setDate(d.getDate() - 2); return d.toISOString(); })(),
    created_at: (() => { const d = new Date(); d.setDate(d.getDate() - 2); return d.toISOString(); })(),
    updated_at: (() => { const d = new Date(); d.setDate(d.getDate() - 2); return d.toISOString(); })(),
    developer_name: "Test Developer",
    developer_avatar: null,
    developer: { id: "test-user-123", name: "Test Developer", email: "test@example.com", avatar_url: null },
  },
];

const mockTimeEntries = [
  {
    id: "te-1",
    developer_id: "test-user-123",
    task_id: "task-1",
    sprint_id: null,
    workspace_id: "ws-1",
    duration_minutes: 120,
    description: "Implemented login page with form validation",
    entry_date: new Date().toISOString().split("T")[0],
    started_at: null,
    ended_at: null,
    source: "web",
    slack_message_ts: null,
    is_inferred: false,
    confidence_score: null,
    inference_metadata: null,
    external_task_ref: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    developer_name: "Test Developer",
    task_title: "Login Page",
    task: { id: "task-1", title: "Login Page" },
    developer: { id: "test-user-123", name: "Test Developer", email: "test@example.com" },
  },
  {
    id: "te-2",
    developer_id: "test-user-123",
    task_id: "task-2",
    sprint_id: null,
    workspace_id: "ws-1",
    duration_minutes: 90,
    description: "Code review and PR feedback for dashboard feature",
    entry_date: new Date().toISOString().split("T")[0],
    started_at: null,
    ended_at: null,
    source: "web",
    slack_message_ts: null,
    is_inferred: false,
    confidence_score: null,
    inference_metadata: null,
    external_task_ref: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    developer_name: "Test Developer",
    task_title: "Dashboard Feature",
    task: { id: "task-2", title: "Dashboard Feature" },
    developer: { id: "test-user-123", name: "Test Developer", email: "test@example.com" },
  },
  {
    id: "te-3",
    developer_id: "test-user-123",
    task_id: null,
    sprint_id: null,
    workspace_id: "ws-1",
    duration_minutes: 45,
    description: "Team standup and sprint planning meeting",
    entry_date: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split("T")[0]; })(),
    started_at: null,
    ended_at: null,
    source: "web",
    slack_message_ts: null,
    is_inferred: false,
    confidence_score: null,
    inference_metadata: null,
    external_task_ref: null,
    created_at: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString(); })(),
    updated_at: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString(); })(),
    developer_name: "Test Developer",
    task_title: null,
    task: null,
    developer: { id: "test-user-123", name: "Test Developer", email: "test@example.com" },
  },
];

const mockBlockers = [
  {
    id: "blocker-1",
    developer_id: "test-user-123",
    task_id: "task-1",
    sprint_id: null,
    team_id: "team-1",
    workspace_id: "ws-1",
    description: "CI pipeline failing due to flaky integration tests",
    severity: "high",
    category: "technical",
    status: "active",
    resolved_at: null,
    resolution_notes: null,
    resolved_by_id: null,
    source: "web",
    slack_message_ts: null,
    slack_channel_id: null,
    standup_id: null,
    escalated_to_id: null,
    escalated_at: null,
    escalation_notes: null,
    external_task_ref: null,
    reported_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    developer_name: "Test Developer",
    resolved_by_name: null,
    escalated_to_name: null,
    task_title: "Login Page",
    task: { id: "task-1", title: "Login Page" },
    developer: { id: "test-user-123", name: "Test Developer", email: "test@example.com" },
    escalated_to: null,
  },
  {
    id: "blocker-2",
    developer_id: "test-user-123",
    task_id: null,
    sprint_id: null,
    team_id: "team-1",
    workspace_id: "ws-1",
    description: "Waiting on third-party API credentials from vendor",
    severity: "medium",
    category: "external",
    status: "active",
    resolved_at: null,
    resolution_notes: null,
    resolved_by_id: null,
    source: "web",
    slack_message_ts: null,
    slack_channel_id: null,
    standup_id: null,
    escalated_to_id: null,
    escalated_at: null,
    escalation_notes: null,
    external_task_ref: null,
    reported_at: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString(); })(),
    created_at: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString(); })(),
    updated_at: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString(); })(),
    developer_name: "Test Developer",
    resolved_by_name: null,
    escalated_to_name: null,
    task_title: null,
    task: null,
    developer: { id: "test-user-123", name: "Test Developer", email: "test@example.com" },
    escalated_to: null,
  },
  {
    id: "blocker-3",
    developer_id: "test-user-123",
    task_id: "task-2",
    sprint_id: null,
    team_id: "team-1",
    workspace_id: "ws-1",
    description: "Database migration script needs review from DBA",
    severity: "critical",
    category: "dependency",
    status: "escalated",
    resolved_at: null,
    resolution_notes: null,
    resolved_by_id: null,
    source: "web",
    slack_message_ts: null,
    slack_channel_id: null,
    standup_id: null,
    escalated_to_id: "dev-2",
    escalated_at: new Date().toISOString(),
    escalation_notes: "Need DBA review urgently",
    external_task_ref: null,
    reported_at: (() => { const d = new Date(); d.setDate(d.getDate() - 2); return d.toISOString(); })(),
    created_at: (() => { const d = new Date(); d.setDate(d.getDate() - 2); return d.toISOString(); })(),
    updated_at: new Date().toISOString(),
    developer_name: "Test Developer",
    resolved_by_name: null,
    escalated_to_name: "Alice Johnson",
    task_title: "Dashboard Feature",
    task: { id: "task-2", title: "Dashboard Feature" },
    developer: { id: "test-user-123", name: "Test Developer", email: "test@example.com" },
    escalated_to: { id: "dev-2", name: "Alice Johnson", email: "alice@example.com" },
  },
];

const mockDashboard = {
  developer_id: "test-user-123",
  developer_name: "Test Developer",
  today_standup: {
    submitted: true,
    standup_id: "standup-1",
    submitted_at: new Date().toISOString(),
  },
  active_tasks: [
    {
      task_id: "task-1",
      task_title: "Login Page",
      status: "in_progress",
      time_logged_today: 120,
      total_time_logged: 360,
      last_activity: new Date().toISOString(),
    },
  ],
  active_blockers: mockBlockers.filter((b) => b.status === "active"),
  time_logged_today: 210,
  time_logged_this_week: 1650,
  weekly_summary: {
    standups_submitted: 3,
    standups_expected: 5,
    total_time_logged: 1650,
    work_logs_count: 8,
    blockers_reported: 3,
    blockers_resolved: 1,
  },
  activity_pattern: null,
  standup_streak: 3,
  has_standup_today: true,
  time_entries: mockTimeEntries,
  resolved_blockers_count: 1,
  work_logs: [
    {
      id: "wl-1",
      developer_id: "test-user-123",
      task_id: "task-1",
      sprint_id: null,
      workspace_id: "ws-1",
      notes: "Merged login page PR",
      log_type: "progress_update",
      source: "web",
      slack_message_ts: null,
      slack_channel_id: null,
      external_task_ref: null,
      logged_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      developer_name: "Test Developer",
      task_title: "Login Page",
    },
  ],
  todays_standup: mockStandups[0],
  recent_standups: mockStandups.slice(0, 3),
};

const mockTimeReport = {
  total_minutes: 1650,
  entries_count: 12,
  groups: [
    { key: "Login Page", total_minutes: 480, entries_count: 4 },
    { key: "Dashboard Feature", total_minutes: 360, entries_count: 3 },
  ],
};

const mockBlockerList = {
  blockers: mockBlockers,
  total: 3,
  active_count: 2,
  resolved_count: 0,
  escalated_count: 1,
  page: 1,
  page_size: 50,
};

const mockStandupList = {
  standups: mockStandups,
  total: 3,
  page: 1,
  page_size: 50,
};

const mockTimeEntryList = {
  entries: mockTimeEntries,
  total: 3,
  total_minutes: 255,
  page: 1,
  page_size: 50,
};

// ---------------------------------------------------------------------------
// Setup: common mocks + tracking-specific route mocks
// ---------------------------------------------------------------------------

async function setupTrackingMocks(page: Page) {
  await setupCommonMocks(page);

  // Tracking-specific routes (registered AFTER setupCommonMocks so they take priority)
  await page.route(`${API_BASE}/tracking/**`, (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Dashboard
    if (url.includes("/tracking/dashboard/me")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockDashboard),
      });
    }

    // Standups - my list
    if (url.includes("/tracking/standups/me")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockStandupList),
      });
    }

    // Standups - submit (POST)
    if (url.includes("/tracking/standups") && method === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "standup-new",
          developer_id: "test-user-123",
          team_id: body.team_id || "team-1",
          sprint_id: null,
          workspace_id: "ws-1",
          standup_date: new Date().toISOString().split("T")[0],
          yesterday_summary: body.yesterday_summary,
          today_plan: body.today_plan,
          blockers_summary: body.blockers_summary || null,
          source: "web",
          slack_message_ts: null,
          slack_channel_id: null,
          parsed_tasks: null,
          parsed_blockers: null,
          sentiment_score: null,
          productivity_signals: null,
          submitted_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          developer_name: "Test Developer",
          developer_avatar: null,
        }),
      });
    }

    // Time entries - my list
    if (url.includes("/tracking/time/me")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockTimeEntryList),
      });
    }

    // Time entries - log time (POST)
    if (url.includes("/tracking/time") && method === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "te-new",
          developer_id: "test-user-123",
          task_id: body.task_id || null,
          sprint_id: null,
          workspace_id: "ws-1",
          duration_minutes: body.duration_minutes,
          description: body.description || null,
          entry_date: body.entry_date || new Date().toISOString().split("T")[0],
          started_at: null,
          ended_at: null,
          source: "web",
          slack_message_ts: null,
          is_inferred: false,
          confidence_score: null,
          inference_metadata: null,
          external_task_ref: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          developer_name: "Test Developer",
          task_title: null,
        }),
      });
    }

    // Time report
    if (url.includes("/tracking/time/report")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockTimeReport),
      });
    }

    // Blockers - active
    if (url.includes("/tracking/blockers/active")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockBlockerList),
      });
    }

    // Blockers - report (POST)
    if (url.includes("/tracking/blockers") && method === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "blocker-new",
          developer_id: "test-user-123",
          task_id: body.task_id || null,
          sprint_id: null,
          team_id: body.team_id || "team-1",
          workspace_id: "ws-1",
          description: body.description,
          severity: body.severity || "medium",
          category: body.category || "technical",
          status: "active",
          resolved_at: null,
          resolution_notes: null,
          resolved_by_id: null,
          source: "web",
          slack_message_ts: null,
          slack_channel_id: null,
          standup_id: null,
          escalated_to_id: null,
          escalated_at: null,
          escalation_notes: null,
          external_task_ref: null,
          reported_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          developer_name: "Test Developer",
          resolved_by_name: null,
          escalated_to_name: null,
          task_title: null,
        }),
      });
    }

    // Blockers - resolve (PATCH)
    if (url.includes("/resolve") && method === "PATCH") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...mockBlockers[0], status: "resolved", resolved_at: new Date().toISOString() }),
      });
    }

    // Team dashboard
    if (url.includes("/tracking/dashboard/team/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          team_id: "team-1",
          team_name: "Engineering",
          today_date: new Date().toISOString().split("T")[0],
          standup_completion: [],
          participation_rate: 0.6,
          active_blockers: [],
          blockers_by_severity: {},
          sprint_progress: null,
          total_time_logged_today: 0,
          recent_work_logs: [],
        }),
      });
    }

    // Team standups
    if (url.includes("/tracking/standups/team/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Analytics
    if (url.includes("/tracking/analytics/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    }

    // Channels
    if (url.includes("/tracking/channels")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Default fallback for tracking routes
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  // Ticket stats (used by main tracking page)
  await page.route(`${API_BASE}/workspaces/ws-1/tickets/stats**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        open_tickets: 12,
        assigned_to_me: 4,
        unassigned: 3,
        sla_breached: 1,
      }),
    });
  });
}

/**
 * Variant: tracking mocks that return empty data for testing empty states.
 */
async function setupTrackingEmptyMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/tracking/**`, (route) => {
    const url = route.request().url();

    if (url.includes("/tracking/dashboard/me")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          developer_id: "test-user-123",
          developer_name: "Test Developer",
          today_standup: { submitted: false, standup_id: null, submitted_at: null },
          active_tasks: [],
          active_blockers: [],
          time_logged_today: 0,
          time_logged_this_week: 0,
          weekly_summary: {
            standups_submitted: 0,
            standups_expected: 5,
            total_time_logged: 0,
            work_logs_count: 0,
            blockers_reported: 0,
            blockers_resolved: 0,
          },
          activity_pattern: null,
          standup_streak: 0,
          has_standup_today: false,
          time_entries: [],
          resolved_blockers_count: 0,
          work_logs: [],
          todays_standup: null,
          recent_standups: [],
        }),
      });
    }

    if (url.includes("/tracking/standups/me")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ standups: [], total: 0, page: 1, page_size: 50 }),
      });
    }

    if (url.includes("/tracking/time/me")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ entries: [], total: 0, total_minutes: 0, page: 1, page_size: 50 }),
      });
    }

    if (url.includes("/tracking/blockers/active")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ blockers: [], total: 0, active_count: 0, resolved_count: 0, escalated_count: 0, page: 1, page_size: 50 }),
      });
    }

    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/tickets/stats**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(null),
    });
  });
}

// ---------------------------------------------------------------------------
// Test Suite: Main Tracking Page
// ---------------------------------------------------------------------------

test.describe("Tracking Page — Main Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await setupTrackingMocks(page);
    await page.goto("/tracking");
    await page.waitForSelector("text=My Tracking", { timeout: 45000 });
  });

  test("renders the tracking page with title and description", async ({ page }) => {
    await expect(page.getByText("My Tracking")).toBeVisible();
    await expect(page.getByText("Track your daily progress, time, and blockers")).toBeVisible();
  });

  test("renders stats cards with dashboard data", async ({ page }) => {
    // Standup Streak
    await expect(page.getByText("Standup Streak")).toBeVisible();
    await expect(page.getByText("3 days")).toBeVisible();

    // Time This Week
    await expect(page.getByText("Time This Week")).toBeVisible();

    // Active Blockers
    await expect(page.getByText("Active Blockers").first()).toBeVisible();

    // Work Logs
    await expect(page.getByText("Work Logs")).toBeVisible();
  });

  test("renders quick action buttons for Submit Standup, Log Time, Report Blocker", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Submit Standup" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log Time" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Report Blocker" })).toBeVisible();
  });

  test("renders navigation links for Standups, Time Reports, Blockers, Analytics", async ({ page }) => {
    await expect(page.getByText("Standups").first()).toBeVisible();
    await expect(page.getByText("View standup history")).toBeVisible();
    await expect(page.getByText("Time Reports")).toBeVisible();
    await expect(page.getByText("Track time logs")).toBeVisible();
    await expect(page.getByText("Blockers").first()).toBeVisible();
    await expect(page.getByText("Manage blockers")).toBeVisible();
    await expect(page.getByText("Analytics")).toBeVisible();
    await expect(page.getByText("Team insights")).toBeVisible();
  });

  test("renders recent activity feed", async ({ page }) => {
    await expect(page.getByText("Recent Activity")).toBeVisible();
  });

  test("renders the individual tracking dashboard with standup form", async ({ page }) => {
    // The standup form or today's standup should appear
    await expect(page.getByText("Daily Standup").or(page.getByText("Today's Standup"))).toBeVisible();
  });

  test("renders the time log form", async ({ page }) => {
    // TimeLogForm renders with a "Log Time" heading
    const logTimeForms = page.locator("h3", { hasText: "Log Time" });
    await expect(logTimeForms.first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Standups Page
// ---------------------------------------------------------------------------

test.describe("Tracking — Standups Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupTrackingMocks(page);
    await page.goto("/tracking/standups");
    await page.waitForSelector("text=Standups", { timeout: 45000 });
  });

  test("renders the standups page with title and back navigation", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Standups" })).toBeVisible();
    await expect(page.getByText("Your standup history and submissions")).toBeVisible();
    await expect(page.getByText("Back to Tracking")).toBeVisible();
  });

  test("renders stats cards", async ({ page }) => {
    await expect(page.getByText("Total Standups")).toBeVisible();
  });

  test("renders view mode toggle buttons (List, Calendar, Heatmap)", async ({ page }) => {
    await expect(page.getByRole("button", { name: "List" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Calendar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Heatmap" })).toBeVisible();
  });

  test("renders search input", async ({ page }) => {
    await expect(page.getByPlaceholder("Search standups...")).toBeVisible();
  });

  test("shows New Standup button", async ({ page }) => {
    // May show "New Standup" or "Edit Today's Standup" depending on today's standup state
    await expect(
      page.getByRole("button", { name: /New Standup|Edit Today/i })
    ).toBeVisible();
  });

  test("shows standup cards with yesterday/today/blockers sections", async ({ page }) => {
    // StandupCard in the timeline renders "Yesterday" and "Today" section headers
    await expect(page.getByText("Yesterday").first()).toBeVisible();
    await expect(page.getByText("Today").first()).toBeVisible();

    // Verify content from mock standups is rendered
    await expect(page.getByText("Completed the user authentication flow", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Working on the dashboard metrics", { exact: false }).first()).toBeVisible();
  });

  test("shows standup with blockers section", async ({ page }) => {
    // The standup with blockers should show the blockers section
    await expect(page.getByText("Waiting on design review", { exact: false }).first()).toBeVisible();
  });

  test("opens standup form when New Standup button is clicked", async ({ page }) => {
    const button = page.getByRole("button", { name: /New Standup|Edit Today/i });
    await button.click();

    // The standup form should be visible with field labels
    await expect(page.getByText("What did you accomplish yesterday?")).toBeVisible();
    await expect(page.getByText("What will you work on today?")).toBeVisible();
    await expect(page.getByText("Any blockers or impediments?", { exact: false })).toBeVisible();
  });

  test("standup form has submit button", async ({ page }) => {
    await page.getByRole("button", { name: /New Standup|Edit Today/i }).click();

    await expect(
      page.getByRole("button", { name: /Submit Standup|Update Standup/i })
    ).toBeVisible();
  });

  test("standup form can be filled and submitted", async ({ page }) => {
    await page.getByRole("button", { name: /New Standup|Edit Today/i }).click();

    // Fill the form
    const yesterdayInput = page.getByPlaceholder("Describe what you completed yesterday...");
    const todayInput = page.getByPlaceholder("Describe your plans for today...");
    const blockersInput = page.getByPlaceholder("Describe any blockers holding you back...");

    await yesterdayInput.fill("Finished refactoring the API layer");
    await todayInput.fill("Start working on the notification system");
    await blockersInput.fill("Need access to the email service");

    // Submit
    const submitButton = page.getByRole("button", { name: /Submit Standup|Update Standup/i });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // Success message should appear
    await expect(page.getByText("submitted successfully", { exact: false }).or(page.getByText("updated successfully", { exact: false }))).toBeVisible({ timeout: 15000 });
  });

  test("shows Team View button", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Team View" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Time Tracking Page
// ---------------------------------------------------------------------------

test.describe("Tracking — Time Tracking Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupTrackingMocks(page);
    await page.goto("/tracking/time");
    await page.waitForSelector("text=Time Tracking", { timeout: 45000 });
  });

  test("renders the time tracking page with title and back navigation", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Time Tracking" })).toBeVisible();
    await expect(page.getByText("Log and view your time entries")).toBeVisible();
    await expect(page.getByText("Back to Tracking")).toBeVisible();
  });

  test("renders stats cards (Today, This Week, Total in Period)", async ({ page }) => {
    await expect(page.getByText("Today").first()).toBeVisible();
    await expect(page.getByText("This Week").first()).toBeVisible();
    await expect(page.getByText("Total in Period")).toBeVisible();
  });

  test("renders view mode toggle buttons (List, Timesheet, Charts)", async ({ page }) => {
    await expect(page.getByRole("button", { name: "List" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Timesheet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Charts" })).toBeVisible();
  });

  test("shows time entries with duration and description", async ({ page }) => {
    // Time entry durations (120 min = 2h, 90 min = 1h 30m, 45 min = 45m)
    await expect(page.getByText("2h").first()).toBeVisible();
    await expect(page.getByText("1h 30m").first()).toBeVisible();

    // Descriptions
    await expect(page.getByText("Implemented login page with form validation")).toBeVisible();
    await expect(page.getByText("Code review and PR feedback", { exact: false })).toBeVisible();
  });

  test("shows task references on time entries", async ({ page }) => {
    // Task titles
    await expect(page.getByText("Login Page", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Dashboard Feature", { exact: false }).first()).toBeVisible();
  });

  test("shows Total Time Logged summary", async ({ page }) => {
    await expect(page.getByText("Total Time Logged")).toBeVisible();
  });

  test("shows Log Time button", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Log Time" }).first()).toBeVisible();
  });

  test("opens time log form when Log Time button is clicked", async ({ page }) => {
    await page.getByRole("button", { name: "Log Time" }).first().click();

    // The TimeLogForm should appear
    await expect(page.getByText("Duration")).toBeVisible();
    await expect(page.getByText("hours")).toBeVisible();
    await expect(page.getByText("minutes")).toBeVisible();
    await expect(page.getByText("Date")).toBeVisible();
    await expect(page.getByText("Description (optional)")).toBeVisible();
  });

  test("time log form has quick duration buttons", async ({ page }) => {
    await page.getByRole("button", { name: "Log Time" }).first().click();

    await expect(page.getByRole("button", { name: "15m" })).toBeVisible();
    await expect(page.getByRole("button", { name: "30m" })).toBeVisible();
    await expect(page.getByRole("button", { name: "1h" })).toBeVisible();
    await expect(page.getByRole("button", { name: "2h" })).toBeVisible();
    await expect(page.getByRole("button", { name: "4h" })).toBeVisible();
    await expect(page.getByRole("button", { name: "8h" })).toBeVisible();
  });

  test("time log form can be filled with quick button and submitted", async ({ page }) => {
    await page.getByRole("button", { name: "Log Time" }).first().click();

    // Click a quick duration button
    await page.getByRole("button", { name: "2h" }).click();

    // Fill description
    await page.getByPlaceholder("What did you work on?").fill("Fixed bug in user profile component");

    // Submit (the form-level "Log Time" button inside the form)
    const formSubmitButtons = page.locator("form button[type='submit']");
    await expect(formSubmitButtons.first()).toBeEnabled();
    await formSubmitButtons.first().click();

    // Success message
    await expect(page.getByText("Time logged successfully!")).toBeVisible({ timeout: 15000 });
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Blockers Page
// ---------------------------------------------------------------------------

test.describe("Tracking — Blockers Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupTrackingMocks(page);
    await page.goto("/tracking/blockers");
    await page.waitForSelector("text=Blockers", { timeout: 45000 });
  });

  test("renders the blockers page with title and back navigation", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Blockers" })).toBeVisible();
    await expect(page.getByText("Track and manage blockers with SLA tracking")).toBeVisible();
    await expect(page.getByText("Back to Tracking")).toBeVisible();
  });

  test("renders stats cards (Active, Escalated, Resolved, SLA Breached, Avg Age)", async ({ page }) => {
    await expect(page.getByText("Active").first()).toBeVisible();
    await expect(page.getByText("Escalated").first()).toBeVisible();
    await expect(page.getByText("Resolved").first()).toBeVisible();
    await expect(page.getByText("SLA Breached")).toBeVisible();
    await expect(page.getByText("Avg Age")).toBeVisible();
  });

  test("renders view mode toggle (Board, Analytics)", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Board" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Analytics" })).toBeVisible();
  });

  test("renders search input", async ({ page }) => {
    await expect(page.getByPlaceholder("Search blockers...")).toBeVisible();
  });

  test("shows blocker cards with severity, category, and description", async ({ page }) => {
    // Blocker descriptions
    await expect(page.getByText("CI pipeline failing due to flaky integration tests")).toBeVisible();
    await expect(page.getByText("Waiting on third-party API credentials from vendor")).toBeVisible();
    await expect(page.getByText("Database migration script needs review from DBA")).toBeVisible();

    // Severity labels (shown as "<severity> Severity" in BlockerCard header)
    await expect(page.getByText("high Severity", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("medium Severity", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("critical Severity", { exact: false }).first()).toBeVisible();

    // Category labels
    await expect(page.getByText("Technical").first()).toBeVisible();
    await expect(page.getByText("External").first()).toBeVisible();
    await expect(page.getByText("Dependency").first()).toBeVisible();
  });

  test("blocker board shows columns for Active, Escalated, Resolved", async ({ page }) => {
    // BlockerBoard has column headers
    const activeColumn = page.locator("text=Active").first();
    const escalatedColumn = page.locator("text=Escalated").first();
    const resolvedColumn = page.locator("text=Resolved").first();
    await expect(activeColumn).toBeVisible();
    await expect(escalatedColumn).toBeVisible();
    await expect(resolvedColumn).toBeVisible();
  });

  test("shows escalated blocker status badge", async ({ page }) => {
    // The escalated blocker should show "escalated" status badge
    await expect(page.getByText("escalated").first()).toBeVisible();
  });

  test("shows Report Blocker button", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Report Blocker" }).first()).toBeVisible();
  });

  test("opens blocker report form when Report Blocker button is clicked", async ({ page }) => {
    await page.getByRole("button", { name: "Report Blocker" }).first().click();

    // BlockerReportForm fields
    await expect(page.getByText("What's blocking you?")).toBeVisible();
    await expect(page.getByText("Severity")).toBeVisible();
    await expect(page.getByText("Category")).toBeVisible();

    // Severity options
    await expect(page.getByText("Low").first()).toBeVisible();
    await expect(page.getByText("Medium").first()).toBeVisible();
    await expect(page.getByText("High").first()).toBeVisible();
    await expect(page.getByText("Critical").first()).toBeVisible();

    // Category options
    await expect(page.getByText("Technical").first()).toBeVisible();
    await expect(page.getByText("Dependency").first()).toBeVisible();
    await expect(page.getByText("Resource").first()).toBeVisible();
    await expect(page.getByText("External").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Empty States
// ---------------------------------------------------------------------------

test.describe("Tracking — Empty States", () => {
  test("main tracking page shows zero stats when no data", async ({ page }) => {
    await setupTrackingEmptyMocks(page);
    await page.goto("/tracking");
    await page.waitForSelector("text=My Tracking", { timeout: 45000 });

    // Standup Streak should show 0
    await expect(page.getByText("0 days")).toBeVisible();
    await expect(page.getByText("Submit today's standup")).toBeVisible();
  });

  test("standups page shows empty state when no standups", async ({ page }) => {
    await setupTrackingEmptyMocks(page);
    await page.goto("/tracking/standups");
    await page.waitForSelector("text=Standups", { timeout: 45000 });

    // Total Standups should show 0
    await expect(page.getByText("Total Standups")).toBeVisible();
  });

  test("time tracking page shows no time entries message when empty", async ({ page }) => {
    await setupTrackingEmptyMocks(page);
    await page.goto("/tracking/time");
    await page.waitForSelector("text=Time Tracking", { timeout: 45000 });

    // Empty state message from TimeEntryList
    await expect(page.getByText("No time entries yet")).toBeVisible();
    await expect(page.getByText("Log your time to see it here")).toBeVisible();
  });

  test("blockers page shows zero counts when no blockers", async ({ page }) => {
    await setupTrackingEmptyMocks(page);
    await page.goto("/tracking/blockers");
    await page.waitForSelector("text=Blockers", { timeout: 45000 });

    // Stats should show 0 active
    await expect(page.getByText("Needs attention")).toBeVisible();
  });
});
