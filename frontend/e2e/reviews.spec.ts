import { test, expect, Page } from "@playwright/test";

const API_BASE = "http://localhost:8000/api/v1";

const mockUser = {
  id: "test-user-123",
  name: "Test Developer",
  email: "test@example.com",
  avatar_url: "",
  github_connection: null,
  onboarding_completed: true,
  skill_fingerprint: null,
  work_patterns: null,
  growth_trajectory: null,
};

const mockWorkspace = {
  id: "ws-1",
  name: "Test Workspace",
  slug: "test-workspace",
};

const mockWorkspaceMember = {
  id: "member-1",
  workspace_id: "ws-1",
  developer_id: "test-user-123",
  developer_name: "Test Developer",
  developer_email: "test@example.com",
  developer_avatar_url: "",
  role: "owner",
  joined_at: "2025-06-15T10:00:00Z",
};

const mockWorkspaceMemberNoDate = {
  id: "member-2",
  workspace_id: "ws-1",
  developer_id: "user-no-date",
  developer_name: "New Member",
  developer_email: "new@example.com",
  developer_avatar_url: "",
  role: "developer",
  joined_at: null,
};

/**
 * Setup route interception for all reviews API calls.
 */
async function setupReviewsMocks(
  page: Page,
  opts?: {
    members?: typeof mockWorkspaceMember[];
  }
) {
  await page.addInitScript(() => {
    localStorage.setItem("token", "fake-test-token");
  });

  // Catch-all: return empty array for list-like endpoints, empty object otherwise
  await page.route(`${API_BASE}/**`, (route) => {
    const url = route.request().url();
    // Endpoints that return objects (not arrays)
    const objectEndpoints = ["/developers/me", "/preferences", "/effective", "/health"];
    const isObject = objectEndpoints.some((e) => url.includes(e));
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(isObject ? {} : []),
    });
  });

  // Mock effective access (must return apps object)
  await page.route(`${API_BASE}/workspaces/*/app-access/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        is_admin: true,
        applied_template_id: null,
        applied_template_name: null,
        has_custom_overrides: false,
        apps: {
          reviews: { enabled: true, modules: { cycles: true, goals: true, peer_requests: true, manage: true } },
          tracking: { enabled: true, modules: {} },
          sprints: { enabled: true, modules: {} },
          agents: { enabled: true, modules: {} },
          dashboard: { enabled: true, modules: {} },
        },
      }),
    });
  });

  // Mock document spaces (returns array)
  await page.route(`${API_BASE}/docs/spaces**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Mock auth
  await page.route(`${API_BASE}/developers/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockUser),
    });
  });

  // Mock workspaces
  await page.route(`${API_BASE}/workspaces`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([mockWorkspace]),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockWorkspace),
    });
  });

  // Mock workspace members
  const members = opts?.members || [mockWorkspaceMember];
  await page.route(`${API_BASE}/workspaces/ws-1/members**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(members),
    });
  });

  // Mock reviews
  await page.route(`${API_BASE}/reviews/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Mock goals
  await page.route(`${API_BASE}/reviews/goals**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Mock dashboard preferences
  await page.route(`${API_BASE}/dashboard/preferences**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "pref-1",
        preset_type: "developer",
        visible_widgets: [],
        widget_order: [],
        widget_sizes: {},
        sidebar_page_visits: {},
        sidebar_pinned_items: [],
        checklist_progress: [],
        checklist_dismissed: false,
      }),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// P0.1 — "Active Unknown" bug on management member cards
// ─────────────────────────────────────────────────────────────────────────────

test.describe("P0.1: Management view — Active Unknown bug", () => {
  test("member with joined_at shows formatted date, not 'Unknown'", async ({ page }) => {
    await setupReviewsMocks(page, { members: [mockWorkspaceMember] });
    await page.goto("/reviews/manage");
    await page.waitForSelector("text=Review Management");

    // Should show "Joined Jun 15, 2025" or similar — NOT "Active Unknown"
    await expect(page.locator("text=Active Unknown")).toHaveCount(0);
    // Should contain a formatted date
    const card = page.locator("[data-testid='member-card']").first();
    await expect(card.locator("[data-testid='member-activity']")).not.toContainText("Unknown");
  });

  test("member with null joined_at shows 'Recently joined'", async ({ page }) => {
    await setupReviewsMocks(page, { members: [mockWorkspaceMemberNoDate] });
    await page.goto("/reviews/manage");
    await page.waitForSelector("text=Review Management");

    // Should NOT show "Active Unknown"
    await expect(page.locator("text=Active Unknown")).toHaveCount(0);
    // Should show a graceful fallback
    const card = page.locator("[data-testid='member-card']").first();
    await expect(card.locator("[data-testid='member-activity']")).toContainText("Recently joined");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P0.2 — Date validation on cycle creation
// ─────────────────────────────────────────────────────────────────────────────

test.describe("P0.2: Cycle creation — date validation", () => {
  test("shows error when end date is before start date", async ({ page }) => {
    await setupReviewsMocks(page);
    await page.goto("/reviews/cycles/new");
    await page.waitForSelector("text=Create Review Cycle");

    // Fill name
    await page.fill('input[placeholder*="Q1 2024"]', "Test Cycle");

    // Set start date AFTER end date
    await page.fill('input[type="date"]>> nth=0', "2026-06-01");
    await page.fill('input[type="date"]>> nth=1', "2026-03-01");

    // Should show validation error
    await expect(page.locator("[data-testid='date-validation-error']")).toBeVisible();
    await expect(page.locator("[data-testid='date-validation-error']")).toContainText(
      "End date must be after start date"
    );

    // Submit button should remain disabled
    await expect(page.locator("button:has-text('Create Cycle')")).toBeDisabled();
  });

  test("no error when dates are valid", async ({ page }) => {
    await setupReviewsMocks(page);
    await page.goto("/reviews/cycles/new");
    await page.waitForSelector("text=Create Review Cycle");

    await page.fill('input[placeholder*="Q1 2024"]', "Test Cycle");
    await page.fill('input[type="date"]>> nth=0', "2026-01-01");
    await page.fill('input[type="date"]>> nth=1', "2026-03-31");

    // No error should be visible
    await expect(page.locator("[data-testid='date-validation-error']")).toHaveCount(0);

    // Submit button should be enabled
    await expect(page.locator("button:has-text('Create Cycle')")).toBeEnabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P0.3 — Tooltip on disabled Create buttons
// ─────────────────────────────────────────────────────────────────────────────

test.describe("P0.3: Disabled button tooltips", () => {
  test("goal create button shows tooltip when disabled", async ({ page }) => {
    await setupReviewsMocks(page);
    await page.goto("/reviews/goals/new");
    await page.waitForSelector("text=Create SMART Goal");

    // Button should be disabled and wrapped in a tooltip
    const btn = page.locator("button:has-text('Create Goal')");
    await expect(btn).toBeDisabled();

    // The wrapper should have a title attribute explaining why
    const wrapper = page.locator("[data-testid='create-goal-tooltip']");
    await expect(wrapper).toHaveAttribute("title", /title.*target date/i);
  });

  test("cycle create button shows tooltip when disabled", async ({ page }) => {
    await setupReviewsMocks(page);
    await page.goto("/reviews/cycles/new");
    await page.waitForSelector("text=Create Review Cycle");

    const btn = page.locator("button:has-text('Create Cycle')");
    await expect(btn).toBeDisabled();

    const wrapper = page.locator("[data-testid='create-cycle-tooltip']");
    await expect(wrapper).toHaveAttribute("title", /name.*start.*end/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P0.4 — Improved empty states with AI preview
// ─────────────────────────────────────────────────────────────────────────────

test.describe("P0.4: Reviews dashboard — empty state improvements", () => {
  test("AI contributions section shows preview when no data", async ({ page }) => {
    await setupReviewsMocks(page);
    await page.goto("/reviews");
    await page.waitForSelector("text=Performance Reviews");

    // Should show an AI preview sample instead of just zeros
    const contributions = page.locator("[data-testid='contributions-section']");
    await expect(contributions).toBeVisible();
    await expect(contributions.locator("[data-testid='ai-preview']")).toBeVisible();
    await expect(contributions.locator("[data-testid='ai-preview']")).toContainText(
      /connect.*github|sample.*insight/i
    );
  });

  test("goals section shows example goal preview", async ({ page }) => {
    await setupReviewsMocks(page);
    await page.goto("/reviews");
    await page.waitForSelector("text=Performance Reviews");

    // The empty goals section should show an example preview
    const goals = page.locator("[data-testid='goals-section']");
    await expect(goals).toBeVisible();
    await expect(goals.locator("[data-testid='example-goal']")).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P0.5 — Success toast after create/delete actions
// ─────────────────────────────────────────────────────────────────────────────

test.describe("P0.5: Success toasts", () => {
  test("shows toast after goal creation", async ({ page }) => {
    await setupReviewsMocks(page);

    // Mock successful goal creation
    await page.route(`${API_BASE}/reviews/goals`, (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "goal-1", title: "Test Goal" }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      }
    });

    await page.goto("/reviews/goals/new");
    await page.waitForSelector("text=Create SMART Goal");

    // Fill required fields
    await page.fill('input[placeholder*="Improve API"]', "Ship new dashboard");
    await page.fill('input[type="date"]', "2026-12-31");

    // Submit
    await page.click("button:has-text('Create Goal')");

    // Should show success toast
    await expect(page.locator("text=Goal created successfully")).toBeVisible({ timeout: 5000 });
  });

  test("shows toast after cycle creation", async ({ page }) => {
    await setupReviewsMocks(page);

    // Mock successful cycle creation
    await page.route(`${API_BASE}/reviews/workspaces/ws-1/cycles`, (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "cycle-1", name: "Q1 Review" }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      }
    });

    await page.goto("/reviews/cycles/new");
    await page.waitForSelector("text=Create Review Cycle");

    await page.fill('input[placeholder*="Q1 2024"]', "Q1 2026 Review");
    await page.fill('input[type="date"]>> nth=0', "2026-01-01");
    await page.fill('input[type="date"]>> nth=1', "2026-03-31");

    await page.click("button:has-text('Create Cycle')");

    await expect(page.locator("text=Review cycle created successfully")).toBeVisible({ timeout: 5000 });
  });
});
