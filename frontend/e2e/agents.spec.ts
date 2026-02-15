import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import {
  setupCommonMocks,
  API_BASE,
} from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockAgents = [
  {
    id: "agent-1",
    workspace_id: "ws-1",
    name: "Customer Support Bot",
    description: "Handles customer support inquiries, triages issues, and escalates when necessary.",
    agent_type: "support",
    mention_handle: "support-bot",
    is_system: false,
    llm_provider: "gemini",
    llm_model: "gemini-2.0-flash",
    temperature: 0.7,
    max_tokens: 2000,
    goal: null,
    system_prompt: "You are a helpful customer support agent.",
    custom_instructions: null,
    tools: ["reply", "escalate", "search_contacts", "get_email_history"],
    max_iterations: 10,
    timeout_seconds: 120,
    model: "gemini-2.0-flash",
    auto_respond: true,
    confidence_threshold: 0.7,
    require_approval_below: 0.5,
    max_daily_responses: 100,
    response_delay_minutes: 5,
    working_hours: { enabled: true, timezone: "America/New_York", start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5] },
    escalation_email: "team@example.com",
    escalation_slack_channel: null,
    email_address: "support@agents.example.com",
    email_enabled: true,
    auto_reply_enabled: true,
    email_signature: "Best,\nSupport Bot",
    crm_sync: false,
    calendar_sync: false,
    calendar_id: null,
    is_active: true,
    last_active_at: "2026-02-14T10:30:00Z",
    created_by_id: "test-user-123",
    total_executions: 1247,
    successful_executions: 1185,
    failed_executions: 62,
    avg_duration_ms: 3400,
    total_processed: 900,
    total_auto_replied: 750,
    total_escalated: 150,
    avg_confidence: 0.85,
    created_at: "2025-11-01T08:00:00Z",
    updated_at: "2026-02-14T10:30:00Z",
  },
  {
    id: "agent-2",
    workspace_id: "ws-1",
    name: "Sales Outreach Assistant",
    description: "Assists with sales outreach, follow-ups, and CRM updates for the sales team.",
    agent_type: "sales",
    mention_handle: "sales-assistant",
    is_system: false,
    llm_provider: "claude",
    llm_model: "claude-sonnet-4-20250514",
    temperature: 0.5,
    max_tokens: 3000,
    goal: null,
    system_prompt: "You are a professional sales assistant.",
    custom_instructions: null,
    tools: ["reply", "send_email", "search_contacts", "enrich_person", "update_crm"],
    max_iterations: 15,
    timeout_seconds: 180,
    model: "claude-sonnet-4-20250514",
    auto_respond: false,
    confidence_threshold: 0.8,
    require_approval_below: 0.6,
    max_daily_responses: 50,
    response_delay_minutes: 10,
    working_hours: null,
    escalation_email: null,
    escalation_slack_channel: null,
    email_address: null,
    email_enabled: false,
    auto_reply_enabled: false,
    email_signature: null,
    crm_sync: true,
    calendar_sync: false,
    calendar_id: null,
    is_active: true,
    last_active_at: "2026-02-13T16:45:00Z",
    created_by_id: "test-user-123",
    total_executions: 542,
    successful_executions: 498,
    failed_executions: 44,
    avg_duration_ms: 5200,
    total_processed: 300,
    total_auto_replied: 0,
    total_escalated: 25,
    avg_confidence: 0.78,
    created_at: "2025-12-15T10:00:00Z",
    updated_at: "2026-02-13T16:45:00Z",
  },
  {
    id: "agent-3",
    workspace_id: "ws-1",
    name: "Meeting Scheduler",
    description: "Manages meeting scheduling and calendar coordination for the team.",
    agent_type: "scheduling",
    mention_handle: "scheduler",
    is_system: false,
    llm_provider: "gemini",
    llm_model: "gemini-2.0-flash",
    temperature: 0.3,
    max_tokens: 1500,
    goal: null,
    system_prompt: "You are a scheduling assistant.",
    custom_instructions: null,
    tools: ["reply", "schedule", "get_email_history"],
    max_iterations: 8,
    timeout_seconds: 90,
    model: "gemini-2.0-flash",
    auto_respond: true,
    confidence_threshold: 0.9,
    require_approval_below: 0.7,
    max_daily_responses: 200,
    response_delay_minutes: 2,
    working_hours: null,
    escalation_email: null,
    escalation_slack_channel: null,
    email_address: null,
    email_enabled: false,
    auto_reply_enabled: false,
    email_signature: null,
    crm_sync: false,
    calendar_sync: true,
    calendar_id: "cal-1",
    is_active: false,
    last_active_at: "2026-01-20T14:00:00Z",
    created_by_id: "test-user-123",
    total_executions: 89,
    successful_executions: 82,
    failed_executions: 7,
    avg_duration_ms: 1800,
    total_processed: 60,
    total_auto_replied: 50,
    total_escalated: 5,
    avg_confidence: 0.92,
    created_at: "2026-01-10T09:00:00Z",
    updated_at: "2026-01-20T14:00:00Z",
  },
];

const mockAgentMetrics = {
  total_runs: 1247,
  successful_runs: 1185,
  failed_runs: 62,
  success_rate: 95,
  avg_duration_ms: 3400,
  avg_confidence: 0.85,
  runs_today: 23,
  runs_this_week: 156,
  recent_executions: [],
};

const mockAgentTools = [
  { name: "reply", description: "Send a reply message", category: "communication" },
  { name: "escalate", description: "Escalate to a human agent", category: "communication" },
  { name: "search_contacts", description: "Search CRM contacts", category: "crm" },
  { name: "send_email", description: "Send an email", category: "communication" },
  { name: "enrich_person", description: "Enrich contact data", category: "crm" },
  { name: "update_crm", description: "Update CRM records", category: "crm" },
  { name: "schedule", description: "Schedule a meeting", category: "calendar" },
  { name: "get_email_history", description: "Get email conversation history", category: "communication" },
  { name: "create_task", description: "Create a task", category: "productivity" },
  { name: "get_writing_style", description: "Get user writing style", category: "ai" },
];

const mockEmailDomains = {
  domains: [
    { domain: "agents.example.com", is_default: true },
    { domain: "mail.example.com", is_default: false },
  ],
  default_domain: "agents.example.com",
};

/**
 * Setup agent-specific route mocks on top of common mocks.
 * Uses setupCommonMocks for auth/workspace, then adds agent API interceptions.
 */
async function setupAgentMocks(page: Page, agents = mockAgents) {
  await setupCommonMocks(page);

  // Agent-specific routes (registered AFTER common mocks, so checked FIRST by Playwright)
  await page.route(`${API_BASE}/workspaces/ws-1/crm/agents/**`, (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // Check handle availability
    if (url.includes("/check-handle")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ available: true }),
      });
    }

    // Agent tools list
    if (url.includes("/agents/tools")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockAgentTools),
      });
    }

    // Email domains
    if (url.includes("/email/domains")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockEmailDomains),
      });
    }

    // Agent metrics: GET /crm/agents/{id}/metrics
    if (url.match(/\/agents\/agent-\w+\/metrics/)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockAgentMetrics),
      });
    }

    // Agent executions: GET /crm/agents/{id}/executions
    if (url.match(/\/agents\/agent-\w+\/executions/)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Single agent: GET /crm/agents/{id}
    const singleAgentMatch = url.match(/\/agents\/(agent-\w+)$/);
    if (singleAgentMatch) {
      const agentId = singleAgentMatch[1];
      const agent = agents.find((a) => a.id === agentId);
      if (agent) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(agent),
        });
      }
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Agent not found" }),
      });
    }

    // Default fallback for unknown sub-routes
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  // Agent list + create: exact /crm/agents path
  await page.route(`${API_BASE}/workspaces/ws-1/crm/agents`, (route) => {
    const method = route.request().method();

    if (method === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "agent-new",
          workspace_id: "ws-1",
          ...body,
          is_system: false,
          is_active: true,
          total_executions: 0,
          successful_executions: 0,
          failed_executions: 0,
          avg_duration_ms: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
    }

    // GET: list agents
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(agents),
    });
  });
}

// ---------------------------------------------------------------------------
// Test Suite: Agent List Page
// ---------------------------------------------------------------------------

test.describe("Agents Page -- List View", () => {
  test.beforeEach(async ({ page }) => {
    await setupAgentMocks(page);
    await page.goto("/agents");
    await page.waitForSelector("text=AI Agents", { timeout: 45000 });
  });

  test("renders the agents page with title and Create Agent button", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "AI Agents" })).toBeVisible();
    await expect(page.getByText("Create and manage intelligent automation agents")).toBeVisible();
    await expect(page.getByRole("link", { name: /Create Agent/i })).toBeVisible();
  });

  test("renders summary stats cards", async ({ page }) => {
    // Total Agents
    await expect(page.getByText("Total Agents")).toBeVisible();
    await expect(page.getByText("3", { exact: true }).first()).toBeVisible();

    // Active Agents
    await expect(page.getByText("Active Agents")).toBeVisible();
    await expect(page.getByText("2", { exact: true }).first()).toBeVisible();

    // Total Executions
    await expect(page.getByText("Total Executions")).toBeVisible();
  });

  test("renders agent cards with name, type badge, and status badge", async ({ page }) => {
    // Agent names
    await expect(page.getByText("Customer Support Bot")).toBeVisible();
    await expect(page.getByText("Sales Outreach Assistant")).toBeVisible();
    await expect(page.getByText("Meeting Scheduler")).toBeVisible();

    // Type badges (labels from AGENT_TYPE_CONFIG)
    await expect(page.getByText("Support Agent").first()).toBeVisible();
    await expect(page.getByText("Sales Agent").first()).toBeVisible();
    await expect(page.getByText("Scheduling Agent").first()).toBeVisible();

    // Status badges
    const activeBadges = page.getByText("Active", { exact: true });
    const inactiveBadges = page.getByText("Inactive", { exact: true });
    const activeCount = await activeBadges.count();
    const inactiveCount = await inactiveBadges.count();
    expect(activeCount).toBeGreaterThanOrEqual(2);
    expect(inactiveCount).toBeGreaterThanOrEqual(1);
  });

  test("agent cards show descriptions", async ({ page }) => {
    await expect(
      page.getByText("Handles customer support inquiries, triages issues, and escalates when necessary.")
    ).toBeVisible();
    await expect(
      page.getByText("Assists with sales outreach, follow-ups, and CRM updates for the sales team.")
    ).toBeVisible();
    await expect(
      page.getByText("Manages meeting scheduling and calendar coordination for the team.")
    ).toBeVisible();
  });

  test("agent cards show execution stats", async ({ page }) => {
    // Total Runs for support bot (1247 -> 1.2K)
    await expect(page.getByText("1.2K")).toBeVisible();
    // Success rate for support bot (1185/1247 = 95%)
    await expect(page.getByText("95%").first()).toBeVisible();
    // Avg Time for support bot (3400ms -> 3.4s)
    await expect(page.getByText("3.4s").first()).toBeVisible();

    // Stats labels
    const totalRunsLabels = page.getByText("Total Runs");
    const successLabels = page.getByText("Success");
    const avgTimeLabels = page.getByText("Avg Time");
    expect(await totalRunsLabels.count()).toBeGreaterThanOrEqual(3);
    expect(await successLabels.count()).toBeGreaterThanOrEqual(3);
    expect(await avgTimeLabels.count()).toBeGreaterThanOrEqual(3);
  });

  test("agent cards show mention handles", async ({ page }) => {
    await expect(page.getByText("@support-bot")).toBeVisible();
    await expect(page.getByText("@sales-assistant")).toBeVisible();
    await expect(page.getByText("@scheduler")).toBeVisible();
  });

  test("search field filters agents", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search agents...");
    await expect(searchInput).toBeVisible();

    await searchInput.fill("Support");
    // Support bot should remain visible
    await expect(page.getByText("Customer Support Bot")).toBeVisible();
    // Other agents should be filtered out
    await expect(page.getByText("Sales Outreach Assistant")).not.toBeVisible();
    await expect(page.getByText("Meeting Scheduler")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Agent List -- Empty State
// ---------------------------------------------------------------------------

test.describe("Agents Page -- Empty State", () => {
  test("shows empty state when no agents exist", async ({ page }) => {
    await setupAgentMocks(page, []);
    await page.goto("/agents");
    await page.waitForSelector("text=AI Agents", { timeout: 45000 });

    await expect(page.getByText("No Agents Yet")).toBeVisible();
    await expect(
      page.getByText("Create AI agents to automate email responses, schedule meetings, manage")
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Create Your First Agent/i })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Create Agent Wizard
// ---------------------------------------------------------------------------

test.describe("Create Agent Wizard -- Navigation & Steps", () => {
  test.beforeEach(async ({ page }) => {
    await setupAgentMocks(page);
    await page.goto("/agents/new");
    await page.waitForSelector("text=Create New Agent", { timeout: 45000 });
  });

  test("renders the wizard with title and step progress", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Create New Agent" })).toBeVisible();
    // Step indicator should show "Step 1 of 8"
    await expect(page.getByText("Step 1 of 8")).toBeVisible();
  });

  test("type selection step shows all agent types", async ({ page }) => {
    await expect(
      page.getByText("What type of agent do you want to create?")
    ).toBeVisible();

    // All 7 type options from AGENT_TYPE_CONFIG
    await expect(page.getByText("Support Agent")).toBeVisible();
    await expect(page.getByText("Sales Agent")).toBeVisible();
    await expect(page.getByText("Scheduling Agent")).toBeVisible();
    await expect(page.getByText("Onboarding Agent")).toBeVisible();
    await expect(page.getByText("Recruiting Agent")).toBeVisible();
    await expect(page.getByText("Newsletter Agent")).toBeVisible();
    await expect(page.getByText("Custom Agent")).toBeVisible();
  });

  test("type selection step shows descriptions for each type", async ({ page }) => {
    await expect(page.getByText("Handle customer support inquiries and issues")).toBeVisible();
    await expect(page.getByText("Assist with sales outreach and follow-ups")).toBeVisible();
    await expect(page.getByText("Manage meeting scheduling and calendar coordination")).toBeVisible();
    await expect(page.getByText("Build a custom agent with your own configuration")).toBeVisible();
  });

  test("Continue button is disabled without selecting a type", async ({ page }) => {
    const continueBtn = page.getByRole("button", { name: /Continue/i });
    await expect(continueBtn).toBeVisible();
    // Button should be disabled (has opacity-50 and cursor-not-allowed)
    await expect(continueBtn).toBeDisabled();
  });

  test("selecting a type enables the Continue button", async ({ page }) => {
    // Click on Support Agent type
    await page.getByText("Support Agent").click();

    const continueBtn = page.getByRole("button", { name: /Continue/i });
    await expect(continueBtn).toBeEnabled();
  });

  test("proceeds to Basic Info step after selecting type and clicking Continue", async ({ page }) => {
    await page.getByText("Support Agent").click();
    await page.getByRole("button", { name: /Continue/i }).click();

    // Should now be on step 2
    await expect(page.getByText("Step 2 of 8")).toBeVisible();
    await expect(page.getByText("Basic Information")).toBeVisible();
    await expect(page.getByText("Agent Name")).toBeVisible();
  });

  test("Basic Info step requires name to proceed", async ({ page }) => {
    // Select type and go to Basic Info
    await page.getByText("Sales Agent").click();
    await page.getByRole("button", { name: /Continue/i }).click();
    await expect(page.getByText("Basic Information")).toBeVisible();

    // Continue should be disabled without a name
    const continueBtn = page.getByRole("button", { name: /Continue/i });
    await expect(continueBtn).toBeDisabled();

    // Fill in the name
    await page.getByPlaceholder("e.g., Support Bot, Sales Assistant").fill("My Test Agent");
    await expect(continueBtn).toBeEnabled();
  });

  test("Back button goes to previous step", async ({ page }) => {
    // Go to step 2
    await page.getByText("Scheduling Agent").click();
    await page.getByRole("button", { name: /Continue/i }).click();
    await expect(page.getByText("Step 2 of 8")).toBeVisible();

    // Click Back
    await page.getByRole("button", { name: /Back/i }).click();
    await expect(page.getByText("Step 1 of 8")).toBeVisible();
    await expect(page.getByText("What type of agent do you want to create?")).toBeVisible();
  });

  test("Back button is disabled on first step", async ({ page }) => {
    const backBtn = page.getByRole("button", { name: /Back/i });
    await expect(backBtn).toBeDisabled();
  });

  test("wizard has all expected step labels in progress", async ({ page }) => {
    // Step titles visible in the progress bar
    await expect(page.getByText("Type", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Basic Info", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("LLM", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Tools", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Behavior", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Prompts", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Email", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Review", { exact: true }).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Create Agent Wizard -- Full Flow
// ---------------------------------------------------------------------------

test.describe("Create Agent Wizard -- Multi-Step Flow", () => {
  test("can navigate through type, basic info, and LLM steps", async ({ page }) => {
    await setupAgentMocks(page);
    await page.goto("/agents/new");
    await page.waitForSelector("text=Create New Agent", { timeout: 45000 });

    // Step 1: Select type
    await page.getByText("Custom Agent").click();
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 2: Fill basic info
    await expect(page.getByText("Basic Information")).toBeVisible();
    await page.getByPlaceholder("e.g., Support Bot, Sales Assistant").fill("Test Custom Agent");
    await page.getByPlaceholder("Describe what this agent does...").fill("A test agent for E2E testing.");
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 3: LLM Config
    await expect(page.getByText("Step 3 of 8")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Agent Detail Page
// ---------------------------------------------------------------------------

test.describe("Agent Detail Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupAgentMocks(page);
    await page.goto("/agents/agent-1");
    await page.waitForSelector("text=Customer Support Bot", { timeout: 45000 });
  });

  test("renders agent name, type, and status in header", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Customer Support Bot" })).toBeVisible();
    await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Support Agent").first()).toBeVisible();
    await expect(page.getByText("@support-bot")).toBeVisible();
  });

  test("shows action buttons in header", async ({ page }) => {
    await expect(page.getByRole("link", { name: /Chat/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Run/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Pause/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Edit/i }).first()).toBeVisible();
  });

  test("shows statistics panel", async ({ page }) => {
    await expect(page.getByText("Statistics")).toBeVisible();
    await expect(page.getByText("Total Runs")).toBeVisible();
    await expect(page.getByText("Success Rate")).toBeVisible();
    await expect(page.getByText("Avg Duration")).toBeVisible();
  });

  test("shows configuration panel", async ({ page }) => {
    await expect(page.getByText("Configuration")).toBeVisible();
    await expect(page.getByText("LLM")).toBeVisible();
    await expect(page.getByText("Temperature")).toBeVisible();
    await expect(page.getByText("Working Hours")).toBeVisible();
    await expect(page.getByText("Tools", { exact: true }).first()).toBeVisible();
  });

  test("shows execution history section", async ({ page }) => {
    await expect(page.getByText("Execution History")).toBeVisible();
    // With empty executions, should show the empty state
    await expect(page.getByText("No executions yet")).toBeVisible();
  });

  test("shows execution details placeholder", async ({ page }) => {
    await expect(page.getByText("Execution Details")).toBeVisible();
    await expect(page.getByText("Select an execution to view details")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Agent Detail Page -- Inactive Agent
// ---------------------------------------------------------------------------

test.describe("Agent Detail Page -- Inactive Agent", () => {
  test("shows Activate button for inactive agent", async ({ page }) => {
    await setupAgentMocks(page);
    await page.goto("/agents/agent-3");
    await page.waitForSelector("text=Meeting Scheduler", { timeout: 45000 });

    await expect(page.getByText("Inactive", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Activate/i }).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Navigating from List to New Agent
// ---------------------------------------------------------------------------

test.describe("Agents Page -- Navigation", () => {
  test("Create Agent link navigates to the wizard", async ({ page }) => {
    await setupAgentMocks(page);
    await page.goto("/agents");
    await page.waitForSelector("text=AI Agents", { timeout: 45000 });

    const createLink = page.getByRole("link", { name: /Create Agent/i });
    await expect(createLink).toBeVisible();
    await expect(createLink).toHaveAttribute("href", "/agents/new");
  });
});
