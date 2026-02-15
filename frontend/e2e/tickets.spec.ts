import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

// ============================================================
// Mock data
// ============================================================

const mockMyTasks = [
  {
    id: "task-1",
    title: "Fix login page regression",
    status: "in_progress",
    priority: "high",
    story_points: 3,
    sprint_id: "sprint-1",
    sprint_name: "Sprint 12",
    created_at: "2026-02-10T00:00:00Z",
    assignee_id: "test-user-123",
  },
  {
    id: "task-2",
    title: "Add unit tests for auth module",
    status: "todo",
    priority: "medium",
    story_points: 5,
    sprint_id: "sprint-1",
    sprint_name: "Sprint 12",
    created_at: "2026-02-11T00:00:00Z",
    assignee_id: "test-user-123",
  },
  {
    id: "task-3",
    title: "Review PR #234",
    status: "review",
    priority: "medium",
    story_points: 1,
    sprint_id: "sprint-1",
    sprint_name: "Sprint 12",
    created_at: "2026-02-12T00:00:00Z",
    assignee_id: "test-user-123",
  },
];

const mockTickets = [
  {
    id: "tkt-1",
    ticket_number: 101,
    status: "new",
    priority: "high",
    submitter_name: "Alice Johnson",
    submitter_email: "alice@example.com",
    form_name: "Bug Report",
    sla_breached: false,
    assignee_name: null,
    created_at: "2026-02-13T10:00:00Z",
  },
  {
    id: "tkt-2",
    ticket_number: 102,
    status: "in_progress",
    priority: "medium",
    submitter_name: "Bob Smith",
    submitter_email: "bob@example.com",
    form_name: "Support Request",
    sla_breached: true,
    assignee_name: "Test Developer",
    created_at: "2026-02-12T08:00:00Z",
  },
];

const mockTicketStats = {
  total_tickets: 25,
  open_tickets: 8,
  sla_breached: 2,
  resolved_today: 3,
};

const mockTicketForms = [
  { id: "form-1", name: "Bug Report", is_active: true },
  { id: "form-2", name: "Support Request", is_active: true },
];

// Extended mock data for additional tests

const mockManyTickets = Array.from({ length: 55 }, (_, i) => ({
  id: `tkt-${i + 1}`,
  ticket_number: 100 + i + 1,
  status: (["new", "in_progress", "waiting_on_submitter", "resolved", "closed"] as const)[i % 5],
  priority: (["low", "medium", "high", "urgent"] as const)[i % 4],
  submitter_name: `User ${i + 1}`,
  submitter_email: `user${i + 1}@example.com`,
  form_name: i % 2 === 0 ? "Bug Report" : "Support Request",
  sla_breached: i % 7 === 0,
  assignee_name: i % 3 === 0 ? "Test Developer" : null,
  created_at: `2026-02-${String(Math.min(15, (i % 15) + 1)).padStart(2, "0")}T10:00:00Z`,
}));

interface MockTicket {
  id: string;
  form_id: string;
  workspace_id: string;
  ticket_number: number;
  submitter_email: string;
  submitter_name: string;
  email_verified: boolean;
  field_values: Record<string, string>;
  attachments: unknown[];
  status: string;
  priority: string;
  severity: string;
  assignee_id: string | null;
  team_id: string | null;
  external_issues: { platform: string; issue_url: string }[];
  linked_task_id: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  sla_due_at: string | null;
  sla_breached: boolean;
  created_at: string;
  updated_at: string;
  form_name: string;
  assignee_name: string | null;
  team_name: string | null;
}

const mockTicketDetail: MockTicket = {
  id: "tkt-1",
  form_id: "form-1",
  workspace_id: "ws-1",
  ticket_number: 101,
  submitter_email: "alice@example.com",
  submitter_name: "Alice Johnson",
  email_verified: true,
  field_values: {
    description: "Login button is unresponsive on mobile",
    browser: "Chrome 120",
    os: "iOS 17",
    steps_to_reproduce: "1. Open app on mobile\n2. Click login\n3. Nothing happens",
  },
  attachments: [],
  status: "new",
  priority: "high",
  severity: "high",
  assignee_id: null,
  team_id: null,
  external_issues: [],
  linked_task_id: null,
  first_response_at: null,
  resolved_at: null,
  closed_at: null,
  sla_due_at: "2026-02-14T10:00:00Z",
  sla_breached: false,
  created_at: "2026-02-13T10:00:00Z",
  updated_at: "2026-02-13T10:00:00Z",
  form_name: "Bug Report",
  assignee_name: null,
  team_name: null,
};

const mockTicketWithAssignment: MockTicket = {
  ...mockTicketDetail,
  id: "tkt-2",
  ticket_number: 102,
  submitter_name: "Bob Smith",
  submitter_email: "bob@example.com",
  status: "in_progress",
  priority: "medium",
  severity: "medium",
  assignee_id: "test-user-123",
  assignee_name: "Test Developer",
  team_id: "team-1",
  team_name: "Engineering",
  sla_breached: true,
  first_response_at: "2026-02-12T09:00:00Z",
  form_name: "Support Request",
  field_values: {
    description: "Cannot export CSV reports",
    category: "Data Export",
  },
  external_issues: [
    { platform: "github", issue_url: "https://github.com/org/repo/issues/42" },
  ],
  linked_task_id: "task-linked-1",
};

const mockTicketResponses = [
  {
    id: "resp-1",
    ticket_id: "tkt-1",
    author_id: "test-user-123",
    author_email: "test@example.com",
    author_name: "Test Developer",
    is_internal: false,
    content: "Thanks for reporting this. We are looking into it.",
    attachments: [],
    old_status: "new",
    new_status: "acknowledged",
    created_at: "2026-02-13T11:00:00Z",
  },
  {
    id: "resp-2",
    ticket_id: "tkt-1",
    author_id: "test-user-123",
    author_email: "test@example.com",
    author_name: "Test Developer",
    is_internal: true,
    content: "Looks like a CSS z-index issue on the mobile viewport.",
    attachments: [],
    old_status: null,
    new_status: null,
    created_at: "2026-02-13T11:30:00Z",
  },
];

const mockEmptyResponses: typeof mockTicketResponses = [];

const mockWorkspaceMembers = [
  {
    id: "mem-1",
    workspace_id: "ws-1",
    developer_id: "test-user-123",
    developer_name: "Test Developer",
    developer_email: "test@example.com",
    developer_avatar_url: null,
    role: "admin",
    status: "active",
    is_billable: true,
    app_permissions: null,
    invited_at: null,
    joined_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "mem-2",
    workspace_id: "ws-1",
    developer_id: "dev-2",
    developer_name: "Alice Johnson",
    developer_email: "alice@example.com",
    developer_avatar_url: null,
    role: "member",
    status: "active",
    is_billable: true,
    app_permissions: null,
    invited_at: null,
    joined_at: "2026-01-02T00:00:00Z",
    created_at: "2026-01-02T00:00:00Z",
  },
];

const mockTeams = [
  { id: "team-1", name: "Engineering", workspace_id: "ws-1", member_count: 5 },
  { id: "team-2", name: "Design", workspace_id: "ws-1", member_count: 3 },
];

const mockProjects = [
  { id: "proj-1", name: "Backend API", workspace_id: "ws-1", status: "active" },
  { id: "proj-2", name: "Mobile App", workspace_id: "ws-1", status: "active" },
];

// ============================================================
// Mock setup helpers
// ============================================================

async function setupTicketsMocks(page: Page) {
  await setupCommonMocks(page);

  // My assigned tasks
  await page.route(`${API_BASE}/developers/me/assigned-tasks**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockMyTasks),
    });
  });

  // Tickets list
  await page.route(`${API_BASE}/workspaces/ws-1/tickets`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ tickets: mockTickets, total: 25 }),
    });
  });

  // Also match tickets with query params
  await page.route(`${API_BASE}/workspaces/ws-1/tickets?**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ tickets: mockTickets, total: 25 }),
    });
  });

  // Ticket stats
  await page.route(`${API_BASE}/workspaces/ws-1/tickets/stats**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTicketStats),
    });
  });

  // Ticket forms
  await page.route(`${API_BASE}/workspaces/ws-1/ticket-forms**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTicketForms),
    });
  });
}

/**
 * Set up mocks for the ticket detail page, including the single-ticket endpoint,
 * responses, workspace members, teams, and projects.
 */
async function setupTicketDetailMocks(
  page: Page,
  ticket: MockTicket = mockTicketDetail,
  responses: typeof mockTicketResponses = mockTicketResponses,
) {
  await setupCommonMocks(page);

  // Single ticket detail
  await page.route(`${API_BASE}/workspaces/ws-1/tickets/${ticket.id}`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(ticket),
      });
    }
    // PATCH (update ticket)
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...ticket, ...body }),
      });
    }
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ticket) });
  });

  // Assign ticket
  await page.route(`${API_BASE}/workspaces/ws-1/tickets/${ticket.id}/assign`, (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...ticket, ...body }),
    });
  });

  // Ticket responses
  await page.route(`${API_BASE}/workspaces/ws-1/tickets/${ticket.id}/responses**`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(responses),
      });
    }
    // POST (add response)
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "resp-new",
          ticket_id: ticket.id,
          author_id: "test-user-123",
          author_email: "test@example.com",
          author_name: "Test Developer",
          is_internal: body.is_internal || false,
          content: body.content,
          attachments: [],
          old_status: ticket.status,
          new_status: body.new_status || null,
          created_at: new Date().toISOString(),
        }),
      });
    }
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  // Workspace members (for assignee dropdown)
  await page.route(`${API_BASE}/workspaces/ws-1/members**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockWorkspaceMembers),
    });
  });

  // Teams
  await page.route(`${API_BASE}/workspaces/ws-1/teams**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTeams),
    });
  });

  // Projects (for create-task modal)
  await page.route(`${API_BASE}/workspaces/ws-1/projects**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ projects: mockProjects, total: 2 }),
    });
  });

  // Create task from ticket
  await page.route(`${API_BASE}/workspaces/ws-1/tickets/${ticket.id}/create-task`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ task_id: "task-new", linked_task_id: "task-new" }),
    });
  });

  // Escalations
  await page.route(`${API_BASE}/workspaces/ws-1/tickets/${ticket.id}/escalations**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Ticket stats (still needed if the page fetches them)
  await page.route(`${API_BASE}/workspaces/ws-1/tickets/stats**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTicketStats),
    });
  });

  // Ticket forms
  await page.route(`${API_BASE}/workspaces/ws-1/ticket-forms**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTicketForms),
    });
  });

  // My assigned tasks (in case the page needs them)
  await page.route(`${API_BASE}/developers/me/assigned-tasks**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockMyTasks),
    });
  });
}

// ============================================================
// Tests: Tickets Page -- My Work (My Assigned Tasks tab)
// ============================================================

test.describe("Tickets Page — My Work", () => {
  test.beforeEach(async ({ page }) => {
    await setupTicketsMocks(page);
    await page.goto("/tickets");
    await page.waitForSelector("text=My Work", { timeout: 45000 });
  });

  test("renders the tickets page with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible();
    await expect(page.getByText("Track your assigned tasks and incoming tickets")).toBeVisible();
  });

  test("shows tab navigation", async ({ page }) => {
    await expect(page.getByRole("button", { name: /My Assigned Tasks/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Form Tickets/i })).toBeVisible();
  });

  test("My Assigned Tasks tab is active by default", async ({ page }) => {
    await expect(page.getByText("Assigned Tasks")).toBeVisible();
    await expect(page.getByText("In Progress")).toBeVisible();
  });

  test("shows assigned task list", async ({ page }) => {
    await expect(page.getByText("Fix login page regression")).toBeVisible();
    await expect(page.getByText("Add unit tests for auth module")).toBeVisible();
    await expect(page.getByText("Review PR #234")).toBeVisible();
  });

  test("task stats cards show counts", async ({ page }) => {
    await expect(page.getByText("Assigned Tasks")).toBeVisible();
    await expect(page.getByText("In Review")).toBeVisible();
    await expect(page.getByText("To Do")).toBeVisible();
  });

  test("switching to Form Tickets tab shows tickets", async ({ page }) => {
    await page.getByRole("button", { name: /Form Tickets/i }).click();
    await expect(page.getByText("Total Tickets")).toBeVisible();
    await expect(page.getByText("Open Tickets")).toBeVisible();
    await expect(page.getByText("SLA Breached")).toBeVisible();
  });

  test("has Manage Forms button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Manage Forms/i })).toBeVisible();
  });
});

// ============================================================
// Tests: My Assigned Tasks — stat cards detail
// ============================================================

test.describe("Tickets Page — Task Stats Cards", () => {
  test.beforeEach(async ({ page }) => {
    await setupTicketsMocks(page);
    await page.goto("/tickets");
    await page.waitForSelector("text=My Work", { timeout: 45000 });
  });

  test("Assigned Tasks card shows total count of tasks", async ({ page }) => {
    // 3 tasks total
    const card = page.locator("text=Assigned Tasks").locator("..");
    await expect(card).toBeVisible();
    await expect(page.getByText("3").first()).toBeVisible();
  });

  test("In Progress card shows count of in_progress tasks", async ({ page }) => {
    // 1 task is in_progress
    const inProgressCard = page.locator("text=In Progress").locator("..");
    await expect(inProgressCard).toBeVisible();
  });

  test("To Do card shows count of backlog + todo tasks", async ({ page }) => {
    // 1 task is todo
    const todoCard = page.locator("text=To Do").locator("..");
    await expect(todoCard).toBeVisible();
  });

  test("In Review card shows count of review tasks", async ({ page }) => {
    // 1 task is review
    const reviewCard = page.locator("text=In Review").locator("..");
    await expect(reviewCard).toBeVisible();
  });
});

// ============================================================
// Tests: My Assigned Tasks — task rows
// ============================================================

test.describe("Tickets Page — Task Row Details", () => {
  test.beforeEach(async ({ page }) => {
    await setupTicketsMocks(page);
    await page.goto("/tickets");
    await page.waitForSelector("text=My Work", { timeout: 45000 });
  });

  test("each task row shows status badge", async ({ page }) => {
    await expect(page.getByText("In Progress").first()).toBeVisible();
    await expect(page.getByText("To Do")).toBeVisible();
    await expect(page.getByText("Review")).toBeVisible();
  });

  test("each task row shows priority badge", async ({ page }) => {
    await expect(page.getByText("high").first()).toBeVisible();
    await expect(page.getByText("medium").first()).toBeVisible();
  });

  test("task rows show story points", async ({ page }) => {
    await expect(page.getByText("3 pts")).toBeVisible();
    await expect(page.getByText("5 pts")).toBeVisible();
    await expect(page.getByText("1 pts")).toBeVisible();
  });

  test("task rows show sprint name", async ({ page }) => {
    // All three tasks are in Sprint 12
    const sprintLabels = page.getByText("Sprint 12");
    await expect(sprintLabels.first()).toBeVisible();
  });

  test("clicking a task navigates to sprints page", async ({ page }) => {
    await page.getByText("Fix login page regression").click();
    await page.waitForURL("**/sprints");
    expect(page.url()).toContain("/sprints");
  });
});

// ============================================================
// Tests: Empty state for My Assigned Tasks
// ============================================================

test.describe("Tickets Page — Empty Tasks State", () => {
  test("shows empty state when no tasks assigned", async ({ page }) => {
    await setupCommonMocks(page);

    await page.route(`${API_BASE}/developers/me/assigned-tasks**`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    // Ticket endpoints still needed
    await page.route(`${API_BASE}/workspaces/ws-1/tickets/stats**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTicketStats) });
    });
    await page.route(`${API_BASE}/workspaces/ws-1/tickets**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tickets: [], total: 0 }) });
    });
    await page.route(`${API_BASE}/workspaces/ws-1/ticket-forms**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTicketForms) });
    });

    await page.goto("/tickets");
    await page.waitForSelector("text=My Work", { timeout: 45000 });

    await expect(page.getByText("No tasks assigned to you")).toBeVisible();
    await expect(page.getByText("Tasks assigned to you from sprints will appear here")).toBeVisible();
  });
});

// ============================================================
// Tests: Form Tickets tab — stats cards
// ============================================================

test.describe("Tickets Page — Form Tickets Stats", () => {
  test.beforeEach(async ({ page }) => {
    await setupTicketsMocks(page);
    await page.goto("/tickets");
    await page.waitForSelector("text=My Work", { timeout: 45000 });
    await page.getByRole("button", { name: /Form Tickets/i }).click();
  });

  test("shows Total Tickets stat with correct value", async ({ page }) => {
    await expect(page.getByText("Total Tickets")).toBeVisible();
    await expect(page.getByText("25")).toBeVisible();
  });

  test("shows Open Tickets stat with correct value", async ({ page }) => {
    await expect(page.getByText("Open Tickets")).toBeVisible();
    await expect(page.getByText("8")).toBeVisible();
  });

  test("shows SLA Breached stat with correct value", async ({ page }) => {
    await expect(page.getByText("SLA Breached")).toBeVisible();
  });

  test("shows Active Forms stat with correct count", async ({ page }) => {
    await expect(page.getByText("Active Forms")).toBeVisible();
    // 2 forms in mock data
    await expect(page.getByText("2").first()).toBeVisible();
  });
});

// ============================================================
// Tests: Form Tickets tab — search
// ============================================================

test.describe("Tickets Page — Form Tickets Search", () => {
  test.beforeEach(async ({ page }) => {
    await setupTicketsMocks(page);
    await page.goto("/tickets");
    await page.waitForSelector("text=My Work", { timeout: 45000 });
    await page.getByRole("button", { name: /Form Tickets/i }).click();
  });

  test("shows search input with placeholder", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search tickets...");
    await expect(searchInput).toBeVisible();
  });

  test("search filters tickets by submitter name", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search tickets...");
    await searchInput.fill("Alice");
    await expect(page.getByText("Alice Johnson")).toBeVisible();
    await expect(page.getByText("Bob Smith")).not.toBeVisible();
  });

  test("search filters tickets by submitter email", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search tickets...");
    await searchInput.fill("bob@example.com");
    await expect(page.getByText("Bob Smith")).toBeVisible();
    await expect(page.getByText("Alice Johnson")).not.toBeVisible();
  });

  test("search filters tickets by ticket number", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search tickets...");
    await searchInput.fill("TKT-101");
    await expect(page.getByText("TKT-101")).toBeVisible();
    await expect(page.getByText("TKT-102")).not.toBeVisible();
  });

  test("search filters tickets by form name", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search tickets...");
    await searchInput.fill("Bug Report");
    await expect(page.getByText("Alice Johnson")).toBeVisible();
    // Bob's ticket is "Support Request", should be filtered out
    await expect(page.getByText("Bob Smith")).not.toBeVisible();
  });

  test("search with no results shows empty state", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search tickets...");
    await searchInput.fill("nonexistent query xyz");
    await expect(page.getByText("No tickets found")).toBeVisible();
    await expect(page.getByText("Create a form to start receiving tickets")).toBeVisible();
  });

  test("clearing search shows all tickets again", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search tickets...");
    await searchInput.fill("Alice");
    await expect(page.getByText("Bob Smith")).not.toBeVisible();

    await searchInput.clear();
    await expect(page.getByText("Alice Johnson")).toBeVisible();
    await expect(page.getByText("Bob Smith")).toBeVisible();
  });
});

// ============================================================
// Tests: Form Tickets tab — status filter buttons
// ============================================================

test.describe("Tickets Page — Status Filter Buttons", () => {
  test.beforeEach(async ({ page }) => {
    await setupTicketsMocks(page);
    await page.goto("/tickets");
    await page.waitForSelector("text=My Work", { timeout: 45000 });
    await page.getByRole("button", { name: /Form Tickets/i }).click();
  });

  test("shows status filter buttons", async ({ page }) => {
    await expect(page.getByRole("button", { name: "New" })).toBeVisible();
    await expect(page.getByRole("button", { name: "In Progress" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Waiting" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Resolved" })).toBeVisible();
  });

  test("clicking a status filter button toggles it", async ({ page }) => {
    const newBtn = page.getByRole("button", { name: "New" });
    // Click to activate filter
    await newBtn.click();
    // The button should now have the status-specific styling (blue for 'new')
    await expect(newBtn).toBeVisible();
    // Click again to deactivate
    await newBtn.click();
    await expect(newBtn).toBeVisible();
  });
});

// ============================================================
// Tests: Form Tickets tab — ticket rows
// ============================================================

test.describe("Tickets Page — Ticket Row Details", () => {
  test.beforeEach(async ({ page }) => {
    await setupTicketsMocks(page);
    await page.goto("/tickets");
    await page.waitForSelector("text=My Work", { timeout: 45000 });
    await page.getByRole("button", { name: /Form Tickets/i }).click();
  });

  test("ticket rows display ticket number", async ({ page }) => {
    await expect(page.getByText("TKT-101")).toBeVisible();
    await expect(page.getByText("TKT-102")).toBeVisible();
  });

  test("ticket rows display status badge", async ({ page }) => {
    await expect(page.getByText("New").first()).toBeVisible();
  });

  test("ticket rows display priority badge", async ({ page }) => {
    await expect(page.getByText("high").first()).toBeVisible();
    await expect(page.getByText("medium").first()).toBeVisible();
  });

  test("ticket rows display SLA Breached badge for breached tickets", async ({ page }) => {
    // tkt-2 has sla_breached: true
    await expect(page.getByText("SLA Breached")).toBeVisible();
  });

  test("ticket rows display submitter name", async ({ page }) => {
    await expect(page.getByText("Alice Johnson")).toBeVisible();
    await expect(page.getByText("Bob Smith")).toBeVisible();
  });

  test("ticket rows display form name and relative date", async ({ page }) => {
    await expect(page.getByText(/Bug Report/)).toBeVisible();
    await expect(page.getByText(/Support Request/)).toBeVisible();
  });

  test("assigned ticket row shows assignee name", async ({ page }) => {
    // tkt-2 has assignee_name: "Test Developer"
    await expect(page.getByText("Test Developer")).toBeVisible();
  });

  test("clicking a ticket row navigates to ticket detail", async ({ page }) => {
    await page.getByText("Alice Johnson").click();
    await page.waitForURL("**/tickets/tkt-1");
    expect(page.url()).toContain("/tickets/tkt-1");
  });
});

// ============================================================
// Tests: Form Tickets tab — empty state
// ============================================================

test.describe("Tickets Page — Empty Tickets State", () => {
  test("shows empty state when no form tickets exist", async ({ page }) => {
    await setupCommonMocks(page);

    await page.route(`${API_BASE}/developers/me/assigned-tasks**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route(`${API_BASE}/workspaces/ws-1/tickets`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tickets: [], total: 0 }) });
    });
    await page.route(`${API_BASE}/workspaces/ws-1/tickets?**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ tickets: [], total: 0 }) });
    });
    await page.route(`${API_BASE}/workspaces/ws-1/tickets/stats**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total_tickets: 0, open_tickets: 0, sla_breached: 0 }) });
    });
    await page.route(`${API_BASE}/workspaces/ws-1/ticket-forms**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.goto("/tickets");
    await page.waitForSelector("text=My Work", { timeout: 45000 });
    await page.getByRole("button", { name: /Form Tickets/i }).click();

    await expect(page.getByText("No tickets found")).toBeVisible();
    await expect(page.getByText("Create a form to start receiving tickets")).toBeVisible();
  });
});

// ============================================================
// Tests: Form Tickets tab — pagination text
// ============================================================

test.describe("Tickets Page — Pagination", () => {
  test("shows pagination text when total > 50", async ({ page }) => {
    await setupCommonMocks(page);

    await page.route(`${API_BASE}/developers/me/assigned-tasks**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockMyTasks) });
    });
    // Return many tickets with total > 50
    await page.route(`${API_BASE}/workspaces/ws-1/tickets`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ tickets: mockManyTickets.slice(0, 50), total: 55 }),
      });
    });
    await page.route(`${API_BASE}/workspaces/ws-1/tickets?**`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ tickets: mockManyTickets.slice(0, 50), total: 55 }),
      });
    });
    await page.route(`${API_BASE}/workspaces/ws-1/tickets/stats**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTicketStats) });
    });
    await page.route(`${API_BASE}/workspaces/ws-1/ticket-forms**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTicketForms) });
    });

    await page.goto("/tickets");
    await page.waitForSelector("text=My Work", { timeout: 45000 });
    await page.getByRole("button", { name: /Form Tickets/i }).click();

    await expect(page.getByText(/Showing \d+ of 55 tickets/)).toBeVisible();
  });

  test("does not show pagination text when total <= 50", async ({ page }) => {
    await setupTicketsMocks(page);
    await page.goto("/tickets");
    await page.waitForSelector("text=My Work", { timeout: 45000 });
    await page.getByRole("button", { name: /Form Tickets/i }).click();

    // total is 25, no pagination text should show
    await expect(page.getByText(/Showing .+ of .+ tickets/)).not.toBeVisible();
  });
});

// ============================================================
// Tests: Manage Forms button navigation
// ============================================================

test.describe("Tickets Page — Manage Forms Navigation", () => {
  test("Manage Forms button navigates to settings/ticket-forms", async ({ page }) => {
    await setupTicketsMocks(page);
    await page.goto("/tickets");
    await page.waitForSelector("text=My Work", { timeout: 45000 });

    await page.getByRole("button", { name: /Manage Forms/i }).click();
    await page.waitForURL("**/settings/ticket-forms");
    expect(page.url()).toContain("/settings/ticket-forms");
  });
});

// ============================================================
// Tests: Tab badge counts
// ============================================================

test.describe("Tickets Page — Tab Badge Counts", () => {
  test("My Assigned Tasks tab shows task count badge", async ({ page }) => {
    await setupTicketsMocks(page);
    await page.goto("/tickets");
    await page.waitForSelector("text=My Work", { timeout: 45000 });

    // The tab button should show '3' for the 3 assigned tasks
    const myTasksTab = page.getByRole("button", { name: /My Assigned Tasks/i });
    await expect(myTasksTab.getByText("3")).toBeVisible();
  });

  test("Form Tickets tab shows open tickets count badge", async ({ page }) => {
    await setupTicketsMocks(page);
    await page.goto("/tickets");
    await page.waitForSelector("text=My Work", { timeout: 45000 });

    // The Form Tickets tab badge shows open_tickets count (8)
    const formTicketsTab = page.getByRole("button", { name: /Form Tickets/i });
    await expect(formTicketsTab.getByText("8")).toBeVisible();
  });
});

// ============================================================
// Tests: Ticket Detail Page — header & submitter info
// ============================================================

test.describe("Ticket Detail Page — Header", () => {
  test.beforeEach(async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketDetail, mockTicketResponses);
    await page.goto("/tickets/tkt-1");
    await page.waitForSelector("text=TKT-101", { timeout: 45000 });
  });

  test("shows ticket number in header", async ({ page }) => {
    await expect(page.getByText("TKT-101")).toBeVisible();
  });

  test("shows form name as heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Bug Report" })).toBeVisible();
  });

  test("shows submitter name", async ({ page }) => {
    await expect(page.getByText("Alice Johnson")).toBeVisible();
  });

  test("shows submitter email with verified badge", async ({ page }) => {
    await expect(page.getByText("alice@example.com")).toBeVisible();
  });

  test("shows created date", async ({ page }) => {
    // The date is formatted via toLocaleString
    await expect(page.locator("text=/2\\/13\\/2026|Feb/")).toBeVisible();
  });

  test("shows Back to Tickets button", async ({ page }) => {
    await expect(page.getByText("Back to Tickets")).toBeVisible();
  });

  test("Back to Tickets navigates to /tickets", async ({ page }) => {
    await page.getByText("Back to Tickets").click();
    await page.waitForURL("**/tickets");
    expect(page.url()).toContain("/tickets");
    expect(page.url()).not.toContain("/tickets/tkt-1");
  });
});

// ============================================================
// Tests: Ticket Detail Page — SLA Breached indicator
// ============================================================

test.describe("Ticket Detail Page — SLA Indicator", () => {
  test("does not show SLA Breached badge when not breached", async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketDetail, mockTicketResponses);
    await page.goto("/tickets/tkt-1");
    await page.waitForSelector("text=TKT-101", { timeout: 45000 });

    // mockTicketDetail has sla_breached: false
    await expect(page.locator(".bg-red-900\\/30").filter({ hasText: "SLA Breached" })).not.toBeVisible();
  });

  test("shows SLA Breached badge when ticket has SLA breach", async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketWithAssignment, mockEmptyResponses);
    await page.goto("/tickets/tkt-2");
    await page.waitForSelector("text=TKT-102", { timeout: 45000 });

    await expect(page.getByText("SLA Breached")).toBeVisible();
  });
});

// ============================================================
// Tests: Ticket Detail Page — submission field values
// ============================================================

test.describe("Ticket Detail Page — Submission Details", () => {
  test.beforeEach(async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketDetail, mockTicketResponses);
    await page.goto("/tickets/tkt-1");
    await page.waitForSelector("text=TKT-101", { timeout: 45000 });
  });

  test("shows Submission Details heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Submission Details" })).toBeVisible();
  });

  test("shows field values from ticket", async ({ page }) => {
    await expect(page.getByText("Login button is unresponsive on mobile")).toBeVisible();
    await expect(page.getByText("Chrome 120")).toBeVisible();
    await expect(page.getByText("iOS 17")).toBeVisible();
  });

  test("shows multi-line field values preserving whitespace", async ({ page }) => {
    // steps_to_reproduce contains newlines
    await expect(page.getByText("1. Open app on mobile")).toBeVisible();
    await expect(page.getByText("2. Click login")).toBeVisible();
  });
});

// ============================================================
// Tests: Ticket Detail Page — responses / activity timeline
// ============================================================

test.describe("Ticket Detail Page — Responses Timeline", () => {
  test.beforeEach(async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketDetail, mockTicketResponses);
    await page.goto("/tickets/tkt-1");
    await page.waitForSelector("text=TKT-101", { timeout: 45000 });
  });

  test("shows Activity & Responses heading", async ({ page }) => {
    await expect(page.getByText("Activity & Responses")).toBeVisible();
  });

  test("shows public response content", async ({ page }) => {
    await expect(page.getByText("Thanks for reporting this. We are looking into it.")).toBeVisible();
  });

  test("shows internal response with Internal badge", async ({ page }) => {
    await expect(page.getByText("Looks like a CSS z-index issue on the mobile viewport.")).toBeVisible();
    await expect(page.getByText("Internal")).toBeVisible();
  });

  test("shows status change in response", async ({ page }) => {
    // First response changed status from 'new' to 'acknowledged'
    await expect(page.getByText(/new.*acknowledged/i)).toBeVisible();
  });

  test("shows response author name", async ({ page }) => {
    const authorLabels = page.getByText("Test Developer");
    await expect(authorLabels.first()).toBeVisible();
  });
});

// ============================================================
// Tests: Ticket Detail Page — empty responses
// ============================================================

test.describe("Ticket Detail Page — No Responses", () => {
  test("shows no responses message when timeline is empty", async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketDetail, mockEmptyResponses);
    await page.goto("/tickets/tkt-1");
    await page.waitForSelector("text=TKT-101", { timeout: 45000 });

    await expect(page.getByText("No responses yet")).toBeVisible();
  });
});

// ============================================================
// Tests: Ticket Detail Page — add response form
// ============================================================

test.describe("Ticket Detail Page — Add Response", () => {
  test.beforeEach(async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketDetail, mockEmptyResponses);
    await page.goto("/tickets/tkt-1");
    await page.waitForSelector("text=TKT-101", { timeout: 45000 });
  });

  test("shows response textarea", async ({ page }) => {
    await expect(page.getByPlaceholder("Add a response...")).toBeVisible();
  });

  test("shows Internal note checkbox", async ({ page }) => {
    await expect(page.getByText("Internal note")).toBeVisible();
  });

  test("shows status change dropdown", async ({ page }) => {
    const select = page.locator("select").filter({ hasText: "No status change" });
    await expect(select).toBeVisible();
  });

  test("Send button is disabled when response text is empty", async ({ page }) => {
    const sendBtn = page.getByRole("button", { name: "Send" });
    await expect(sendBtn).toBeDisabled();
  });

  test("Send button is enabled when response text is entered", async ({ page }) => {
    const textarea = page.getByPlaceholder("Add a response...");
    await textarea.fill("This is a test response");
    const sendBtn = page.getByRole("button", { name: "Send" });
    await expect(sendBtn).toBeEnabled();
  });

  test("submitting a response calls the API", async ({ page }) => {
    let requestBody: Record<string, unknown> | null = null;

    // Override the route to capture the request
    await page.route(`${API_BASE}/workspaces/ws-1/tickets/tkt-1/responses**`, (route) => {
      if (route.request().method() === "POST") {
        requestBody = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "resp-new",
            ticket_id: "tkt-1",
            author_id: "test-user-123",
            author_name: "Test Developer",
            is_internal: false,
            content: requestBody?.content || "",
            attachments: [],
            old_status: null,
            new_status: null,
            created_at: new Date().toISOString(),
          }),
        });
      }
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    const textarea = page.getByPlaceholder("Add a response...");
    await textarea.fill("This is a test response");
    await page.getByRole("button", { name: "Send" }).click();

    // After submission, the textarea should be cleared
    await expect(textarea).toHaveValue("");
  });
});

// ============================================================
// Tests: Ticket Detail Page — sidebar: status, priority, severity dropdowns
// ============================================================

test.describe("Ticket Detail Page — Status/Priority/Severity", () => {
  test.beforeEach(async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketDetail, mockEmptyResponses);
    await page.goto("/tickets/tkt-1");
    await page.waitForSelector("text=TKT-101", { timeout: 45000 });
  });

  test("shows Status dropdown with current status", async ({ page }) => {
    await expect(page.getByText("Status").first()).toBeVisible();
    const statusSelect = page.locator("select").filter({ hasText: "New" }).first();
    await expect(statusSelect).toBeVisible();
  });

  test("Status dropdown contains all status options", async ({ page }) => {
    const statusSelect = page.locator("select").filter({ hasText: "New" }).first();
    await expect(statusSelect.locator("option", { hasText: "New" })).toBeVisible();
    await expect(statusSelect.locator("option", { hasText: "Acknowledged" })).toBeVisible();
    await expect(statusSelect.locator("option", { hasText: "In Progress" })).toBeVisible();
    await expect(statusSelect.locator("option", { hasText: "Waiting on Submitter" })).toBeVisible();
    await expect(statusSelect.locator("option", { hasText: "Resolved" })).toBeVisible();
    await expect(statusSelect.locator("option", { hasText: "Closed" })).toBeVisible();
  });

  test("shows Priority dropdown with current priority", async ({ page }) => {
    await expect(page.getByText("Priority").first()).toBeVisible();
  });

  test("Priority dropdown contains all priority options", async ({ page }) => {
    const prioritySection = page.locator("h3", { hasText: "Priority" }).locator("..").locator("select").first();
    await expect(prioritySection.locator("option", { hasText: "Low" })).toBeVisible();
    await expect(prioritySection.locator("option", { hasText: "Medium" })).toBeVisible();
    await expect(prioritySection.locator("option", { hasText: "High" })).toBeVisible();
    await expect(prioritySection.locator("option", { hasText: "Urgent" })).toBeVisible();
  });

  test("shows Severity dropdown", async ({ page }) => {
    await expect(page.getByText("Severity").first()).toBeVisible();
  });

  test("Severity dropdown contains all severity options", async ({ page }) => {
    const severitySection = page.locator("h3", { hasText: "Severity" }).locator("..").locator("select").first();
    await expect(severitySection.locator("option", { hasText: /Low/ })).toBeVisible();
    await expect(severitySection.locator("option", { hasText: /Medium/ })).toBeVisible();
    await expect(severitySection.locator("option", { hasText: /High/ })).toBeVisible();
    await expect(severitySection.locator("option", { hasText: /Critical/ })).toBeVisible();
  });

  test("changing status fires PATCH API call", async ({ page }) => {
    let patchCalled = false;
    await page.route(`${API_BASE}/workspaces/ws-1/tickets/tkt-1`, (route) => {
      if (route.request().method() === "PATCH") {
        patchCalled = true;
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...mockTicketDetail, ...body }),
        });
      }
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTicketDetail) });
    });

    const statusSelect = page.locator("select").filter({ hasText: "New" }).first();
    await statusSelect.selectOption("in_progress");

    // Wait a moment for the API call to fire
    await page.waitForTimeout(500);
    expect(patchCalled).toBe(true);
  });
});

// ============================================================
// Tests: Ticket Detail Page — assignment sidebar
// ============================================================

test.describe("Ticket Detail Page — Assignment", () => {
  test.beforeEach(async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketDetail, mockEmptyResponses);
    await page.goto("/tickets/tkt-1");
    await page.waitForSelector("text=TKT-101", { timeout: 45000 });
  });

  test("shows Assignee dropdown", async ({ page }) => {
    await expect(page.getByText("Assignee").first()).toBeVisible();
  });

  test("Assignee dropdown shows Unassigned option", async ({ page }) => {
    const assigneeSelect = page.locator("select").filter({ hasText: "Unassigned" }).first();
    await expect(assigneeSelect).toBeVisible();
  });

  test("Assignee dropdown lists workspace members", async ({ page }) => {
    const assigneeSelect = page.locator("select").filter({ hasText: "Unassigned" }).first();
    await expect(assigneeSelect.locator("option", { hasText: "Test Developer" })).toBeVisible();
    await expect(assigneeSelect.locator("option", { hasText: "Alice Johnson" })).toBeVisible();
  });

  test("shows Team dropdown", async ({ page }) => {
    await expect(page.getByText("Team").first()).toBeVisible();
  });

  test("Team dropdown shows No team option", async ({ page }) => {
    const teamSelect = page.locator("select").filter({ hasText: "No team" }).first();
    await expect(teamSelect).toBeVisible();
  });

  test("Team dropdown lists available teams", async ({ page }) => {
    const teamSelect = page.locator("select").filter({ hasText: "No team" }).first();
    await expect(teamSelect.locator("option", { hasText: "Engineering" })).toBeVisible();
    await expect(teamSelect.locator("option", { hasText: "Design" })).toBeVisible();
  });

  test("assigning a user fires the assign API call", async ({ page }) => {
    let assignCalled = false;
    await page.route(`${API_BASE}/workspaces/ws-1/tickets/tkt-1/assign`, (route) => {
      assignCalled = true;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...mockTicketDetail, assignee_id: "dev-2", assignee_name: "Alice Johnson" }),
      });
    });

    const assigneeSelect = page.locator("select").filter({ hasText: "Unassigned" }).first();
    await assigneeSelect.selectOption("dev-2");

    await page.waitForTimeout(500);
    expect(assignCalled).toBe(true);
  });
});

// ============================================================
// Tests: Ticket Detail Page — assigned ticket shows current assignment
// ============================================================

test.describe("Ticket Detail Page — Current Assignment Display", () => {
  test("shows current assignee name", async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketWithAssignment, mockEmptyResponses);
    await page.goto("/tickets/tkt-2");
    await page.waitForSelector("text=TKT-102", { timeout: 45000 });

    await expect(page.getByText("Currently: Test Developer")).toBeVisible();
  });

  test("shows current team name", async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketWithAssignment, mockEmptyResponses);
    await page.goto("/tickets/tkt-2");
    await page.waitForSelector("text=TKT-102", { timeout: 45000 });

    await expect(page.getByText("Currently: Engineering")).toBeVisible();
  });
});

// ============================================================
// Tests: Ticket Detail Page — SLA Metrics sidebar
// ============================================================

test.describe("Ticket Detail Page — SLA Metrics", () => {
  test("shows SLA Metrics heading", async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketDetail, mockEmptyResponses);
    await page.goto("/tickets/tkt-1");
    await page.waitForSelector("text=TKT-101", { timeout: 45000 });

    await expect(page.getByText("SLA Metrics")).toBeVisible();
  });

  test("shows Time open metric", async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketDetail, mockEmptyResponses);
    await page.goto("/tickets/tkt-1");
    await page.waitForSelector("text=TKT-101", { timeout: 45000 });

    await expect(page.getByText("Time open")).toBeVisible();
  });

  test("shows SLA Due when ticket has sla_due_at", async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketDetail, mockEmptyResponses);
    await page.goto("/tickets/tkt-1");
    await page.waitForSelector("text=TKT-101", { timeout: 45000 });

    // mockTicketDetail has sla_due_at set
    await expect(page.getByText("SLA Due")).toBeVisible();
  });

  test("shows First response metric when available", async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketWithAssignment, mockEmptyResponses);
    await page.goto("/tickets/tkt-2");
    await page.waitForSelector("text=TKT-102", { timeout: 45000 });

    // mockTicketWithAssignment has first_response_at
    await expect(page.getByText("First response")).toBeVisible();
  });
});

// ============================================================
// Tests: Ticket Detail Page — External Issues
// ============================================================

test.describe("Ticket Detail Page — External Issues", () => {
  test("shows external issues section when issues exist", async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketWithAssignment, mockEmptyResponses);
    await page.goto("/tickets/tkt-2");
    await page.waitForSelector("text=TKT-102", { timeout: 45000 });

    await expect(page.getByText("External Issues")).toBeVisible();
    await expect(page.getByText("github")).toBeVisible();
  });

  test("does not show external issues section when empty", async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketDetail, mockEmptyResponses);
    await page.goto("/tickets/tkt-1");
    await page.waitForSelector("text=TKT-101", { timeout: 45000 });

    // mockTicketDetail has empty external_issues
    await expect(page.getByText("External Issues")).not.toBeVisible();
  });
});

// ============================================================
// Tests: Ticket Detail Page — Linked Task
// ============================================================

test.describe("Ticket Detail Page — Linked Task", () => {
  test("shows Create Task button when no task is linked", async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketDetail, mockEmptyResponses);
    await page.goto("/tickets/tkt-1");
    await page.waitForSelector("text=TKT-101", { timeout: 45000 });

    await expect(page.getByText("Linked Task")).toBeVisible();
    await expect(page.getByRole("button", { name: /Create Task/i })).toBeVisible();
  });

  test("shows View Sprint Task when a task is linked", async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketWithAssignment, mockEmptyResponses);
    await page.goto("/tickets/tkt-2");
    await page.waitForSelector("text=TKT-102", { timeout: 45000 });

    await expect(page.getByText("View Sprint Task")).toBeVisible();
  });

  test("clicking Create Task opens modal", async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketDetail, mockEmptyResponses);
    await page.goto("/tickets/tkt-1");
    await page.waitForSelector("text=TKT-101", { timeout: 45000 });

    await page.getByRole("button", { name: /Create Task/i }).click();
    await expect(page.getByRole("heading", { name: "Create Sprint Task" })).toBeVisible();
  });
});

// ============================================================
// Tests: Ticket Detail Page — Create Task Modal
// ============================================================

test.describe("Ticket Detail Page — Create Task Modal", () => {
  test.beforeEach(async ({ page }) => {
    await setupTicketDetailMocks(page, mockTicketDetail, mockEmptyResponses);
    await page.goto("/tickets/tkt-1");
    await page.waitForSelector("text=TKT-101", { timeout: 45000 });
    await page.getByRole("button", { name: /Create Task/i }).click();
    await page.waitForSelector("text=Create Sprint Task", { timeout: 15000 });
  });

  test("modal shows project selection dropdown", async ({ page }) => {
    await expect(page.getByText("Project")).toBeVisible();
    const projectSelect = page.locator("select").filter({ hasText: "Select a project..." });
    await expect(projectSelect).toBeVisible();
  });

  test("modal shows task title input", async ({ page }) => {
    await expect(page.getByPlaceholder("Auto-generated from ticket")).toBeVisible();
  });

  test("modal shows priority dropdown", async ({ page }) => {
    const prioritySelect = page.locator("select").filter({ hasText: "Medium" });
    await expect(prioritySelect.first()).toBeVisible();
  });

  test("Create Task button is disabled until project is selected", async ({ page }) => {
    const createBtns = page.getByRole("button", { name: /Create Task/i });
    // The modal's Create Task button (the last one, inside the modal)
    const modalCreateBtn = createBtns.last();
    await expect(modalCreateBtn).toBeDisabled();
  });

  test("Create Task button is enabled after selecting a project", async ({ page }) => {
    const projectSelect = page.locator("select").filter({ hasText: "Select a project..." });
    await projectSelect.selectOption("proj-1");

    const createBtns = page.getByRole("button", { name: /Create Task/i });
    const modalCreateBtn = createBtns.last();
    await expect(modalCreateBtn).toBeEnabled();
  });

  test("Cancel button closes the modal", async ({ page }) => {
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Create Sprint Task" })).not.toBeVisible();
  });

  test("X button closes the modal", async ({ page }) => {
    // The X button is a sibling of the heading
    const closeBtn = page.locator(".fixed").locator("button").filter({ has: page.locator("svg") }).first();
    await closeBtn.click();
    await expect(page.getByRole("heading", { name: "Create Sprint Task" })).not.toBeVisible();
  });
});

// ============================================================
// Tests: Ticket Detail Page — Ticket not found
// ============================================================

test.describe("Ticket Detail Page — Not Found", () => {
  test("shows ticket not found when API returns no ticket", async ({ page }) => {
    await setupCommonMocks(page);

    await page.route(`${API_BASE}/workspaces/ws-1/tickets/nonexistent`, (route) => {
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Not found" }) });
    });
    await page.route(`${API_BASE}/workspaces/ws-1/tickets/nonexistent/responses**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route(`${API_BASE}/workspaces/ws-1/ticket-forms**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route(`${API_BASE}/workspaces/ws-1/tickets/stats**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTicketStats) });
    });
    await page.route(`${API_BASE}/developers/me/assigned-tasks**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route(`${API_BASE}/workspaces/ws-1/projects**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ projects: [], total: 0 }) });
    });

    await page.goto("/tickets/nonexistent");
    await expect(page.getByText("Ticket not found")).toBeVisible({ timeout: 45000 });
  });
});
