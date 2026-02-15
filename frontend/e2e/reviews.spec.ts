import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE, mockUser, mockMembers } from "./fixtures/shared-helpers";

// ============ Mock Data ============

const mockReviewStats = {
  activeGoals: 3,
  completedGoals: 5,
  pendingPeerRequests: 2,
  totalContributions: 42,
};

const mockGoals = [
  {
    id: "goal-1",
    title: "Improve system performance",
    description: "Reduce API response time by 50%",
    goal_type: "performance",
    status: "active",
    priority: "high",
    progress_percentage: 60,
    is_private: false,
    developer_id: "test-user-123",
    workspace_id: "ws-1",
    key_results: [
      { id: "kr-1", description: "Reduce p95 latency", target: 400, current: 600, unit: "ms" },
    ],
    tracking_keywords: ["performance", "api-optimization"],
    specific: "Reduce p95 response time from 800ms to 400ms",
    measurable: "Track via monitoring dashboard",
    achievable: "Identified N+1 queries to optimize",
    relevant: "Improves UX and reduces costs",
    time_bound: "2026-06-30",
    linked_activity: null,
    review_cycle_id: null,
    learning_milestone_id: null,
    suggested_from_path: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-02-10T00:00:00Z",
    completed_at: null,
  },
  {
    id: "goal-2",
    title: "Learn Rust fundamentals",
    description: "Complete Rust programming course",
    goal_type: "skill_development",
    status: "in_progress",
    priority: "medium",
    progress_percentage: 30,
    is_private: false,
    developer_id: "test-user-123",
    workspace_id: "ws-1",
    key_results: [],
    tracking_keywords: [],
    specific: null,
    measurable: null,
    achievable: null,
    relevant: null,
    time_bound: "2026-03-31",
    linked_activity: null,
    review_cycle_id: null,
    learning_milestone_id: null,
    suggested_from_path: false,
    created_at: "2026-01-15T00:00:00Z",
    updated_at: "2026-02-08T00:00:00Z",
    completed_at: null,
  },
  {
    id: "goal-3",
    title: "Completed onboarding docs",
    description: "Write new hire documentation",
    goal_type: "team_contribution",
    status: "completed",
    priority: "low",
    progress_percentage: 100,
    is_private: false,
    developer_id: "test-user-123",
    workspace_id: "ws-1",
    key_results: [],
    tracking_keywords: [],
    specific: null,
    measurable: null,
    achievable: null,
    relevant: null,
    time_bound: null,
    linked_activity: null,
    review_cycle_id: null,
    learning_milestone_id: null,
    suggested_from_path: false,
    created_at: "2025-11-01T00:00:00Z",
    updated_at: "2026-01-20T00:00:00Z",
    completed_at: "2026-01-20T00:00:00Z",
  },
];

const mockGoalDetail = {
  ...mockGoals[0],
  linked_commits: [
    { sha: "abc123", title: "Optimize user queries with batch loading", additions: 150, deletions: 30 },
    { sha: "def456", title: "Add query caching layer", additions: 200, deletions: 50 },
  ],
  linked_pull_requests: [
    { id: "pr-10", title: "feat: batch query optimization", additions: 350, deletions: 80, url: "https://github.com/test/repo/pull/10" },
  ],
};

const mockPeerRequests = [
  {
    id: "pr-1",
    individual_review_id: "review-1",
    requester_id: "dev-2",
    requester_name: "Alice Johnson",
    reviewer_id: "test-user-123",
    reviewer_name: "Test Developer",
    reviewer_email: "test@example.com",
    reviewer_avatar_url: null,
    message: "Please review my Q4 contributions",
    request_source: "employee",
    assigned_by_id: null,
    status: "pending",
    submission_id: null,
    created_at: "2026-02-10T00:00:00Z",
    responded_at: null,
  },
  {
    id: "pr-2",
    individual_review_id: "review-2",
    requester_id: "dev-3",
    requester_name: "Bob Smith",
    reviewer_id: "test-user-123",
    reviewer_name: "Test Developer",
    reviewer_email: "test@example.com",
    reviewer_avatar_url: null,
    message: "Feedback on my design system work",
    request_source: "manager",
    assigned_by_id: "test-user-123",
    status: "completed",
    submission_id: "sub-1",
    created_at: "2026-01-20T00:00:00Z",
    responded_at: "2026-02-01T00:00:00Z",
  },
];

const mockContributionSummary = {
  id: "cs-1",
  developer_id: "test-user-123",
  period_start: "2025-10-01",
  period_end: "2026-02-15",
  period_type: "quarterly",
  metrics: {
    commits: { total: 120, by_repo: {}, by_month: {} },
    pull_requests: { total: 42, merged: 38, by_repo: {} },
    code_reviews: { total: 18, approved: 15, changes_requested: 3 },
    lines: { added: 5000, removed: 2000 },
    languages: { TypeScript: 80, Python: 20 },
    skills_demonstrated: ["TypeScript", "React"],
  },
  highlights: [],
  ai_insights: null,
  created_at: "2026-02-15T00:00:00Z",
};

const mockContributionSummaryWithInsights = {
  ...mockContributionSummary,
  ai_insights: "Strong focus on performance improvements with consistent code quality across 42 PRs.",
};

const mockReviewCycles = [
  {
    id: "cycle-1",
    workspace_id: "ws-1",
    name: "Q1 2026 Review",
    cycle_type: "quarterly",
    period_start: "2026-01-01",
    period_end: "2026-03-31",
    self_review_deadline: "2026-03-15",
    peer_review_deadline: "2026-03-22",
    manager_review_deadline: "2026-03-29",
    settings: {
      enable_self_review: true,
      enable_peer_review: true,
      enable_manager_review: true,
      anonymous_peer_reviews: true,
      min_peer_reviewers: 2,
      max_peer_reviewers: 5,
      peer_selection_mode: "both" as const,
      include_github_metrics: true,
      review_questions: [],
      rating_scale: 5,
    },
    status: "active",
    created_at: "2025-12-15T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "cycle-2",
    workspace_id: "ws-1",
    name: "H2 2025 Review",
    cycle_type: "semi_annual",
    period_start: "2025-07-01",
    period_end: "2025-12-31",
    self_review_deadline: "2025-12-15",
    peer_review_deadline: null,
    manager_review_deadline: null,
    settings: null,
    status: "completed",
    created_at: "2025-06-15T00:00:00Z",
    updated_at: "2026-01-05T00:00:00Z",
  },
];

const mockCycleDetail = {
  ...mockReviewCycles[0],
  total_reviews: 10,
  completed_reviews: 3,
  pending_self_reviews: 4,
  pending_peer_reviews: 2,
  pending_manager_reviews: 1,
};

const mockDraftCycleDetail = {
  id: "cycle-draft",
  workspace_id: "ws-1",
  name: "Q2 2026 Review",
  cycle_type: "quarterly",
  period_start: "2026-04-01",
  period_end: "2026-06-30",
  self_review_deadline: null,
  peer_review_deadline: null,
  manager_review_deadline: null,
  settings: {
    enable_self_review: true,
    enable_peer_review: true,
    enable_manager_review: true,
    anonymous_peer_reviews: true,
    min_peer_reviewers: 2,
    max_peer_reviewers: 5,
    peer_selection_mode: "both" as const,
    include_github_metrics: true,
    review_questions: [],
    rating_scale: 5,
  },
  status: "draft",
  created_at: "2026-02-01T00:00:00Z",
  updated_at: "2026-02-01T00:00:00Z",
  total_reviews: 0,
  completed_reviews: 0,
  pending_self_reviews: 0,
  pending_peer_reviews: 0,
  pending_manager_reviews: 0,
};

const mockMyReviews = [
  {
    id: "indiv-review-1",
    review_cycle_id: "cycle-1",
    developer_id: "test-user-123",
    developer_name: "Test Developer",
    developer_email: "test@example.com",
    developer_avatar_url: null,
    manager_id: null,
    manager_name: null,
    manager_source: "team_lead" as const,
    status: "pending" as const,
    overall_rating: null,
    ratings_breakdown: null,
    completed_at: null,
    acknowledged_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const mockManagerReviews = [
  {
    id: "mgr-review-1",
    review_cycle_id: "cycle-1",
    developer_id: "dev-2",
    developer_name: "Alice Johnson",
    developer_email: "alice@example.com",
    developer_avatar_url: null,
    manager_id: "test-user-123",
    manager_name: "Test Developer",
    manager_source: "team_lead" as const,
    status: "peer_review_in_progress" as const,
    overall_rating: null,
    ratings_breakdown: null,
    completed_at: null,
    acknowledged_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-02-05T00:00:00Z",
  },
  {
    id: "mgr-review-2",
    review_cycle_id: "cycle-1",
    developer_id: "dev-3",
    developer_name: "Bob Smith",
    developer_email: "bob@example.com",
    developer_avatar_url: null,
    manager_id: "test-user-123",
    manager_name: "Test Developer",
    manager_source: "team_lead" as const,
    status: "pending" as const,
    overall_rating: null,
    ratings_breakdown: null,
    completed_at: null,
    acknowledged_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

// ============ Mock Setup Helpers ============

async function setupReviewsMocks(page: Page) {
  await setupCommonMocks(page);

  // Review stats (legacy endpoint — kept for backwards compat)
  await page.route(`${API_BASE}/developers/test-user-123/reviews/stats**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        stats: mockReviewStats,
        goals: mockGoals,
        peer_requests: mockPeerRequests,
      }),
    });
  });

  // Goals list: GET /reviews/goals?developer_id=...
  await page.route(`${API_BASE}/reviews/goals?**`, (route) => {
    const url = route.request().url();
    // Goal detail
    if (url.match(/\/reviews\/goals\/goal-/)) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockGoalDetail),
      });
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockGoals),
    });
  });

  // Goals list without query params
  await page.route(`${API_BASE}/reviews/goals`, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "goal-new",
          title: "New test goal",
          description: "Test description",
          goal_type: "performance",
          status: "active",
          priority: "medium",
          progress_percentage: 0,
          is_private: false,
          developer_id: "test-user-123",
          workspace_id: "ws-1",
          key_results: [],
          tracking_keywords: [],
          specific: null,
          measurable: null,
          achievable: null,
          relevant: null,
          time_bound: null,
          linked_activity: null,
          review_cycle_id: null,
          learning_milestone_id: null,
          suggested_from_path: false,
          created_at: "2026-02-15T00:00:00Z",
          updated_at: "2026-02-15T00:00:00Z",
          completed_at: null,
        }),
      });
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockGoals),
    });
  });

  // Goal detail: GET /reviews/goals/:goalId
  await page.route(`${API_BASE}/reviews/goals/goal-*`, (route) => {
    const url = route.request().url();
    if (url.includes("/progress")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...mockGoalDetail, progress_percentage: 70 }),
      });
    }
    if (url.includes("/auto-link")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ linked_commits: 2, linked_pull_requests: 1, commits: [], pull_requests: [] }),
      });
    }
    if (url.includes("/complete")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...mockGoalDetail, status: "completed", progress_percentage: 100, completed_at: "2026-02-15T00:00:00Z" }),
      });
    }
    if (url.includes("/linked-contributions")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ goal_id: "goal-1", commits: [], pull_requests: [], total_additions: 0, total_deletions: 0 }),
      });
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockGoalDetail),
    });
  });

  // Review cycles list: GET /reviews/workspaces/ws-1/cycles
  await page.route(`${API_BASE}/reviews/workspaces/ws-1/cycles**`, (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "cycle-new",
          workspace_id: "ws-1",
          name: "New Test Cycle",
          cycle_type: "quarterly",
          period_start: "2026-04-01",
          period_end: "2026-06-30",
          self_review_deadline: null,
          peer_review_deadline: null,
          manager_review_deadline: null,
          settings: null,
          status: "draft",
          created_at: "2026-02-15T00:00:00Z",
          updated_at: "2026-02-15T00:00:00Z",
        }),
      });
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockReviewCycles),
    });
  });

  // Also match the old route pattern used by existing tests
  await page.route(`${API_BASE}/workspaces/ws-1/reviews/cycles**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockReviewCycles),
    });
  });

  // Cycle detail: GET /reviews/cycles/:cycleId
  await page.route(`${API_BASE}/reviews/cycles/cycle-1**`, (route) => {
    const url = route.request().url();
    if (url.includes("/activate")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...mockCycleDetail, status: "self_review" }),
      });
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockCycleDetail),
    });
  });

  await page.route(`${API_BASE}/reviews/cycles/cycle-draft**`, (route) => {
    const url = route.request().url();
    if (url.includes("/activate")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...mockDraftCycleDetail, status: "self_review" }),
      });
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockDraftCycleDetail),
    });
  });

  // My reviews: GET /reviews/my-reviews
  await page.route(`${API_BASE}/reviews/my-reviews**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockMyReviews),
    });
  });

  // Manager reviews: GET /reviews/manager-reviews
  await page.route(`${API_BASE}/reviews/manager-reviews**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockManagerReviews),
    });
  });

  // Peer requests pending: GET /reviews/peer-requests/pending
  await page.route(`${API_BASE}/reviews/peer-requests/pending**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockPeerRequests.filter((r) => r.status === "pending")),
    });
  });

  // Contribution summary: GET /reviews/contributions/summary
  await page.route(`${API_BASE}/reviews/contributions/summary**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockContributionSummary),
    });
  });

  // Contribution generate: POST /reviews/contributions/generate
  await page.route(`${API_BASE}/reviews/contributions/generate**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockContributionSummaryWithInsights),
    });
  });

  // Contribution summary (legacy)
  await page.route(`${API_BASE}/developers/test-user-123/contributions/summary**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockContributionSummary),
    });
  });

  // Goal suggestions: GET /reviews/goals/suggestions
  await page.route(`${API_BASE}/reviews/goals/suggestions**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Individual review detail: GET /reviews/:reviewId
  await page.route(`${API_BASE}/reviews/mgr-review-*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...mockManagerReviews[0],
        contribution_summary: {
          metrics: {
            commits: { total: 85 },
            pull_requests: { total: 30 },
            code_reviews: { total: 12 },
            lines: { added: 3200, removed: 1100 },
            skills_demonstrated: ["TypeScript", "React", "Node.js"],
          },
        },
        ai_summary: null,
        self_review: null,
        peer_reviews: [],
        manager_review: null,
        goals: [],
      }),
    });
  });
}

// ============ OVERVIEW PAGE TESTS ============

test.describe("Performance Reviews Page — Overview", () => {
  test.beforeEach(async ({ page }) => {
    await setupReviewsMocks(page);
    await page.goto("/reviews");
    await page.waitForSelector("text=Performance Reviews", { timeout: 45000 });
  });

  test("renders the reviews page with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Performance Reviews" })).toBeVisible();
    await expect(page.getByText("Track goals, contributions, and 360")).toBeVisible();
  });

  test("shows stats cards", async ({ page }) => {
    await expect(page.getByText("Active Goals")).toBeVisible();
    await expect(page.getByText("Completed")).toBeVisible();
    await expect(page.getByText("Peer Reviews")).toBeVisible();
    await expect(page.getByText("Contributions")).toBeVisible();
  });

  test("shows My Goals section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "My Goals" })).toBeVisible();
  });

  test("has New Goal button", async ({ page }) => {
    const newGoalLink = page.locator("a", { hasText: "New Goal" });
    await expect(newGoalLink).toBeVisible();
  });

  test("shows features overview cards", async ({ page }) => {
    await expect(page.getByText("SMART Goals")).toBeVisible();
    await expect(page.getByText("360° Feedback")).toBeVisible();
    await expect(page.getByText("AI Summaries")).toBeVisible();
  });

  test("shows Review Cycle section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Review Cycle" })).toBeVisible();
  });

  test("shows Contributions section with PR count", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Contributions" })).toBeVisible();
    await expect(page.getByText("42")).toBeVisible();
  });

  test("shows Feedback Requests section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Feedback Requests" })).toBeVisible();
  });

  test("displays goal cards with title and progress", async ({ page }) => {
    await expect(page.getByText("Improve system performance")).toBeVisible();
    await expect(page.getByText("Learn Rust fundamentals")).toBeVisible();
  });

  test("displays goal status badges", async ({ page }) => {
    await expect(page.getByText("active").first()).toBeVisible();
    await expect(page.getByText("in progress").first()).toBeVisible();
  });

  test("displays goal type labels", async ({ page }) => {
    await expect(page.getByText("performance").first()).toBeVisible();
  });

  test("has Management View button for workspace users", async ({ page }) => {
    const manageLink = page.locator("a", { hasText: "Management View" });
    await expect(manageLink).toBeVisible();
    await expect(manageLink).toHaveAttribute("href", "/reviews/manage");
  });

  test("has Manage Cycles button for workspace users", async ({ page }) => {
    const cyclesLink = page.locator("a", { hasText: "Manage Cycles" });
    await expect(cyclesLink).toBeVisible();
    await expect(cyclesLink).toHaveAttribute("href", "/reviews/cycles");
  });

  test("New Goal link navigates to goal creation", async ({ page }) => {
    const newGoalLink = page.locator("a", { hasText: "New Goal" }).first();
    await expect(newGoalLink).toHaveAttribute("href", "/reviews/goals/new");
  });

  test("View all goals link points to goals page", async ({ page }) => {
    const viewAllLink = page.locator("a", { hasText: "View all" }).first();
    await expect(viewAllLink).toHaveAttribute("href", "/reviews/goals");
  });

  test("shows contribution metrics grid with commits, PRs, and reviews", async ({ page }) => {
    await expect(page.getByText("Commits")).toBeVisible();
    await expect(page.getByText("PRs")).toBeVisible();
    await expect(page.getByText("Reviews")).toBeVisible();
    await expect(page.getByText("120")).toBeVisible();
    await expect(page.getByText("18")).toBeVisible();
  });

  test("has Generate Summary button in contributions section", async ({ page }) => {
    const generateBtn = page.getByRole("button", { name: /Generate Summary/i });
    await expect(generateBtn).toBeVisible();
  });

  test("shows active review cycle when one exists", async ({ page }) => {
    // The mock provides an active cycle so the CycleCard should render
    await expect(page.getByText("Q1 2026 Review")).toBeVisible();
  });

  test("shows peer request messages", async ({ page }) => {
    await expect(page.getByText("Please review my Q4 contributions")).toBeVisible();
  });
});

// ============ GOALS LIST PAGE TESTS ============

test.describe("Goals List Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupReviewsMocks(page);
    await page.goto("/reviews/goals");
    await page.waitForSelector('h1:has-text("My Goals")', { timeout: 45000 });
  });

  test("renders goals page with heading and description", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "My Goals" })).toBeVisible();
    await expect(page.getByText("Track your SMART goals and key results")).toBeVisible();
  });

  test("shows breadcrumb navigation back to reviews", async ({ page }) => {
    const breadcrumbLink = page.locator("a", { hasText: "Reviews" }).first();
    await expect(breadcrumbLink).toBeVisible();
  });

  test("displays filter tabs for All, Active, and Completed", async ({ page }) => {
    await expect(page.getByRole("button", { name: "all" })).toBeVisible();
    await expect(page.getByRole("button", { name: "active" })).toBeVisible();
    await expect(page.getByRole("button", { name: "completed" })).toBeVisible();
  });

  test("has search input for filtering goals", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search goals...");
    await expect(searchInput).toBeVisible();
  });

  test("displays goal cards with titles", async ({ page }) => {
    await expect(page.getByText("Improve system performance")).toBeVisible();
    await expect(page.getByText("Learn Rust fundamentals")).toBeVisible();
  });

  test("displays goal progress percentages", async ({ page }) => {
    await expect(page.getByText("60%")).toBeVisible();
    await expect(page.getByText("30%")).toBeVisible();
  });

  test("has New Goal button linking to create page", async ({ page }) => {
    const newGoalLink = page.locator("a", { hasText: "New Goal" });
    await expect(newGoalLink).toBeVisible();
    await expect(newGoalLink).toHaveAttribute("href", "/reviews/goals/new");
  });

  test("filtering by active shows only active/in_progress goals", async ({ page }) => {
    await page.getByRole("button", { name: "active" }).click();
    await expect(page.getByText("Improve system performance")).toBeVisible();
    await expect(page.getByText("Learn Rust fundamentals")).toBeVisible();
    // Completed goal should not be visible
    await expect(page.getByText("Completed onboarding docs")).not.toBeVisible();
  });

  test("filtering by completed shows only completed goals", async ({ page }) => {
    await page.getByRole("button", { name: "completed" }).click();
    await expect(page.getByText("Completed onboarding docs")).toBeVisible();
    // Active goals should not be visible
    await expect(page.getByText("Improve system performance")).not.toBeVisible();
  });

  test("search filters goals by title", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search goals...");
    await searchInput.fill("Rust");
    await expect(page.getByText("Learn Rust fundamentals")).toBeVisible();
    await expect(page.getByText("Improve system performance")).not.toBeVisible();
  });

  test("search with no results shows empty state", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search goals...");
    await searchInput.fill("nonexistent goal xyz");
    await expect(page.getByText("No matching goals")).toBeVisible();
    await expect(page.getByText("Try adjusting your filters")).toBeVisible();
  });

  test("goal cards have View Details link", async ({ page }) => {
    const viewDetailsLink = page.locator("a", { hasText: "View Details" }).first();
    await expect(viewDetailsLink).toBeVisible();
  });
});

// ============ GOAL DETAIL PAGE TESTS ============

test.describe("Goal Detail Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupReviewsMocks(page);
    await page.goto("/reviews/goals/goal-1");
    await page.waitForSelector('h1:has-text("Improve system performance")', { timeout: 45000 });
  });

  test("displays goal title and description", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Improve system performance" })).toBeVisible();
    await expect(page.getByText("Reduce API response time by 50%")).toBeVisible();
  });

  test("shows goal type, status, and priority badges", async ({ page }) => {
    await expect(page.getByText("performance").first()).toBeVisible();
    await expect(page.getByText("active").first()).toBeVisible();
    await expect(page.getByText("high").first()).toBeVisible();
  });

  test("shows progress bar with percentage", async ({ page }) => {
    await expect(page.getByText("60%")).toBeVisible();
    await expect(page.getByText("Progress").first()).toBeVisible();
  });

  test("displays SMART framework details", async ({ page }) => {
    await expect(page.getByText("SMART Framework")).toBeVisible();
    await expect(page.getByText("Specific")).toBeVisible();
    await expect(page.getByText("Reduce p95 response time from 800ms to 400ms")).toBeVisible();
    await expect(page.getByText("Measurable")).toBeVisible();
    await expect(page.getByText("Track via monitoring dashboard")).toBeVisible();
  });

  test("displays key results section", async ({ page }) => {
    await expect(page.getByText("Key Results (1)")).toBeVisible();
    await expect(page.getByText("Reduce p95 latency")).toBeVisible();
  });

  test("displays linked contributions section", async ({ page }) => {
    await expect(page.getByText("Linked Contributions")).toBeVisible();
    await expect(page.getByText("Commits (2)")).toBeVisible();
    await expect(page.getByText("Optimize user queries with batch loading")).toBeVisible();
  });

  test("displays linked pull requests", async ({ page }) => {
    await expect(page.getByText("Pull Requests (1)")).toBeVisible();
    await expect(page.getByText("feat: batch query optimization")).toBeVisible();
  });

  test("displays tracking keywords", async ({ page }) => {
    await expect(page.getByText("Tracking Keywords")).toBeVisible();
    await expect(page.getByText("performance")).toBeVisible();
    await expect(page.getByText("api-optimization")).toBeVisible();
  });

  test("has +10% progress button", async ({ page }) => {
    const progressBtn = page.getByRole("button", { name: "+10%" });
    await expect(progressBtn).toBeVisible();
  });

  test("has Auto-Link GitHub button", async ({ page }) => {
    const autoLinkBtn = page.getByRole("button", { name: /Auto-Link GitHub/i });
    await expect(autoLinkBtn).toBeVisible();
  });

  test("has Complete button for active goals", async ({ page }) => {
    const completeBtn = page.getByRole("button", { name: "Complete" });
    await expect(completeBtn).toBeVisible();
  });

  test("shows breadcrumb navigation", async ({ page }) => {
    await expect(page.locator("a", { hasText: "Reviews" }).first()).toBeVisible();
    await expect(page.locator("a", { hasText: "Goals" }).first()).toBeVisible();
  });

  test("displays quick stats sidebar", async ({ page }) => {
    await expect(page.getByText("Quick Stats")).toBeVisible();
    await expect(page.getByText("Linked Commits")).toBeVisible();
    await expect(page.getByText("Linked PRs")).toBeVisible();
  });
});

// ============ NEW GOAL PAGE TESTS ============

test.describe("New Goal Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupReviewsMocks(page);
    await page.goto("/reviews/goals/new");
    await page.waitForSelector('h1:has-text("Create SMART Goal")', { timeout: 45000 });
  });

  test("renders the new goal form", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Create SMART Goal" })).toBeVisible();
    await expect(page.getByText("Define specific, measurable objectives")).toBeVisible();
  });

  test("has required form fields", async ({ page }) => {
    await expect(page.getByLabel(/Goal Title/)).toBeVisible();
    await expect(page.getByLabel(/Description/)).toBeVisible();
    await expect(page.getByLabel(/Goal Type/)).toBeVisible();
    await expect(page.getByLabel(/Priority/)).toBeVisible();
    await expect(page.getByLabel(/Target Date/)).toBeVisible();
  });

  test("shows SMART framework section", async ({ page }) => {
    await expect(page.getByText("SMART Framework")).toBeVisible();
    await expect(page.getByText("Specific - What exactly")).toBeVisible();
    await expect(page.getByText("Measurable - How will you")).toBeVisible();
    await expect(page.getByText("Achievable - Is this realistic")).toBeVisible();
    await expect(page.getByText("Relevant - Why does this")).toBeVisible();
  });

  test("shows Key Results section with Add button", async ({ page }) => {
    await expect(page.getByText("Key Results (OKRs)")).toBeVisible();
    await expect(page.getByRole("button", { name: /Add Key Result/i })).toBeVisible();
  });

  test("shows Auto-Link GitHub Activity section", async ({ page }) => {
    await expect(page.getByText("Auto-Link GitHub Activity")).toBeVisible();
    await expect(page.getByLabel(/Tracking Keywords/)).toBeVisible();
  });

  test("has private goal checkbox", async ({ page }) => {
    await expect(page.getByText("Private goal (only visible to you and manager)")).toBeVisible();
  });

  test("Create Goal button is disabled without required fields", async ({ page }) => {
    const submitBtn = page.getByRole("button", { name: /Create Goal/i });
    await expect(submitBtn).toBeDisabled();
  });

  test("has Cancel link back to goals", async ({ page }) => {
    const cancelLink = page.locator("a", { hasText: "Cancel" });
    await expect(cancelLink).toBeVisible();
    await expect(cancelLink).toHaveAttribute("href", "/reviews/goals");
  });

  test("has Back to Goals breadcrumb link", async ({ page }) => {
    const backLink = page.locator("a", { hasText: "Back to Goals" });
    await expect(backLink).toBeVisible();
  });
});

// ============ REVIEW CYCLES LIST PAGE TESTS ============

test.describe("Review Cycles Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupReviewsMocks(page);
    await page.goto("/reviews/cycles");
    await page.waitForSelector('h1:has-text("Review Cycles")', { timeout: 45000 });
  });

  test("renders cycles page with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Review Cycles" })).toBeVisible();
    await expect(page.getByText("Manage performance review cycles")).toBeVisible();
  });

  test("has New Cycle button", async ({ page }) => {
    const newCycleLink = page.locator("a", { hasText: "New Cycle" });
    await expect(newCycleLink).toBeVisible();
    await expect(newCycleLink).toHaveAttribute("href", "/reviews/cycles/new");
  });

  test("displays cycle data in table", async ({ page }) => {
    await expect(page.getByText("Q1 2026 Review")).toBeVisible();
    await expect(page.getByText("H2 2025 Review")).toBeVisible();
  });

  test("shows cycle status badges", async ({ page }) => {
    await expect(page.getByText("Active").first()).toBeVisible();
    await expect(page.getByText("Completed").first()).toBeVisible();
  });

  test("displays cycle count", async ({ page }) => {
    await expect(page.getByText("2 cycles")).toBeVisible();
  });

  test("has status filter dropdown", async ({ page }) => {
    const filter = page.locator("select");
    await expect(filter).toBeVisible();
  });

  test("has View action links for each cycle", async ({ page }) => {
    const viewLinks = page.locator("a", { hasText: "View" });
    await expect(viewLinks.first()).toBeVisible();
  });

  test("shows help section with phase descriptions", async ({ page }) => {
    await expect(page.getByText("Self Review Phase")).toBeVisible();
    await expect(page.getByText("Peer Review Phase")).toBeVisible();
    await expect(page.getByText("Manager Review Phase")).toBeVisible();
  });

  test("has Back to Reviews link", async ({ page }) => {
    const backLink = page.locator("a", { hasText: "Back to Reviews" });
    await expect(backLink).toBeVisible();
  });

  test("table has correct column headers", async ({ page }) => {
    await expect(page.getByText("Cycle", { exact: true })).toBeVisible();
    await expect(page.getByText("Status", { exact: true })).toBeVisible();
    await expect(page.getByText("Period", { exact: true })).toBeVisible();
    await expect(page.getByText("Deadlines", { exact: true })).toBeVisible();
    await expect(page.getByText("Actions", { exact: true })).toBeVisible();
  });
});

// ============ CYCLE DETAIL PAGE TESTS ============

test.describe("Cycle Detail Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupReviewsMocks(page);
    await page.goto("/reviews/cycles/cycle-1");
    await page.waitForSelector('h1:has-text("Q1 2026 Review")', { timeout: 45000 });
  });

  test("displays cycle name and status", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Q1 2026 Review" })).toBeVisible();
    await expect(page.getByText("Active").first()).toBeVisible();
    await expect(page.getByText("Quarterly").first()).toBeVisible();
  });

  test("shows completion progress bar", async ({ page }) => {
    await expect(page.getByText("Completion Progress")).toBeVisible();
    await expect(page.getByText("30%")).toBeVisible();
  });

  test("displays stats grid with review counts", async ({ page }) => {
    await expect(page.getByText("Total Reviews")).toBeVisible();
    await expect(page.getByText("10")).toBeVisible();
    await expect(page.getByText("Pending Self")).toBeVisible();
    await expect(page.getByText("Pending Peer")).toBeVisible();
  });

  test("shows phase deadlines section", async ({ page }) => {
    await expect(page.getByText("Phase Deadlines")).toBeVisible();
    await expect(page.getByText("Self Review").first()).toBeVisible();
    await expect(page.getByText("Peer Review").first()).toBeVisible();
    await expect(page.getByText("Manager Review").first()).toBeVisible();
  });

  test("shows settings summary in sidebar", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("Anonymous Peer")).toBeVisible();
    await expect(page.getByText("GitHub Metrics")).toBeVisible();
  });

  test("shows breadcrumb navigation", async ({ page }) => {
    await expect(page.locator("a", { hasText: "Reviews" }).first()).toBeVisible();
    await expect(page.locator("a", { hasText: "Cycles" }).first()).toBeVisible();
  });
});

// ============ DRAFT CYCLE PAGE TESTS ============

test.describe("Draft Cycle Detail Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupReviewsMocks(page);
    await page.goto("/reviews/cycles/cycle-draft");
    await page.waitForSelector('h1:has-text("Q2 2026 Review")', { timeout: 45000 });
  });

  test("shows Start Cycle button for draft cycle", async ({ page }) => {
    const startBtn = page.getByRole("button", { name: /Start Cycle/i });
    await expect(startBtn).toBeVisible();
  });

  test("shows no participants enrolled message for draft cycle", async ({ page }) => {
    await expect(page.getByText("No participants enrolled yet")).toBeVisible();
  });

  test("clicking Start Cycle shows confirmation modal", async ({ page }) => {
    await page.getByRole("button", { name: /Start Cycle/i }).first().click();
    await expect(page.getByText("Start Review Cycle?")).toBeVisible();
    await expect(page.getByText("This will activate the cycle")).toBeVisible();
    // Modal has Cancel and Start Cycle buttons
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  });
});

// ============ NEW CYCLE PAGE TESTS ============

test.describe("New Cycle Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupReviewsMocks(page);
    await page.goto("/reviews/cycles/new");
    await page.waitForSelector('h1:has-text("Create Review Cycle")', { timeout: 45000 });
  });

  test("renders the new cycle form", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Create Review Cycle" })).toBeVisible();
    await expect(page.getByText("Set up a new performance review cycle")).toBeVisible();
  });

  test("has basic information fields", async ({ page }) => {
    await expect(page.getByLabel(/Cycle Name/)).toBeVisible();
    await expect(page.getByLabel(/Cycle Type/)).toBeVisible();
    await expect(page.getByLabel(/Period Start/)).toBeVisible();
    await expect(page.getByLabel(/Period End/)).toBeVisible();
  });

  test("has phase deadline fields", async ({ page }) => {
    await expect(page.getByText("Phase Deadlines")).toBeVisible();
    await expect(page.getByLabel(/Self Review Deadline/)).toBeVisible();
    await expect(page.getByLabel(/Peer Review Deadline/)).toBeVisible();
    await expect(page.getByLabel(/Manager Review Deadline/)).toBeVisible();
  });

  test("has review settings with checkboxes", async ({ page }) => {
    await expect(page.getByText("Review Settings")).toBeVisible();
    await expect(page.getByText("Self Review", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Peer Review", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Manager Review", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Anonymous peer reviews")).toBeVisible();
    await expect(page.getByText("Include GitHub metrics")).toBeVisible();
  });

  test("shows peer review settings when enabled", async ({ page }) => {
    await expect(page.getByText("Peer Review Settings")).toBeVisible();
    await expect(page.getByLabel(/Min Peer Reviewers/)).toBeVisible();
    await expect(page.getByLabel(/Max Peer Reviewers/)).toBeVisible();
    await expect(page.getByLabel(/Peer Selection Mode/)).toBeVisible();
  });

  test("Create Cycle button is disabled without required fields", async ({ page }) => {
    const submitBtn = page.getByRole("button", { name: /Create Cycle/i });
    await expect(submitBtn).toBeDisabled();
  });

  test("has Cancel link back to cycles list", async ({ page }) => {
    const cancelLink = page.locator("a", { hasText: "Cancel" });
    await expect(cancelLink).toBeVisible();
    await expect(cancelLink).toHaveAttribute("href", "/reviews/cycles");
  });

  test("has Back to Cycles link", async ({ page }) => {
    const backLink = page.locator("a", { hasText: "Back to Cycles" });
    await expect(backLink).toBeVisible();
  });
});

// ============ PEER REQUESTS PAGE TESTS ============

test.describe("Peer Requests Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupReviewsMocks(page);

    // Override peer requests pending to return all requests for this page
    await page.route(`${API_BASE}/reviews/peer-requests/pending**`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockPeerRequests),
      });
    });

    await page.goto("/reviews/peer-requests");
    await page.waitForSelector('h1:has-text("Peer Review Requests")', { timeout: 45000 });
  });

  test("renders peer requests page with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Peer Review Requests" })).toBeVisible();
    await expect(page.getByText("Feedback requests from your colleagues")).toBeVisible();
  });

  test("shows stats cards for total, pending, in progress, and completed", async ({ page }) => {
    await expect(page.getByText("Total Requests")).toBeVisible();
    await expect(page.getByText("Pending")).toBeVisible();
    await expect(page.getByText("In Progress")).toBeVisible();
  });

  test("displays pending peer request cards", async ({ page }) => {
    await expect(page.getByText("Please review my Q4 contributions")).toBeVisible();
  });

  test("shows request status badges", async ({ page }) => {
    await expect(page.getByText("Pending").first()).toBeVisible();
  });

  test("shows requester names", async ({ page }) => {
    await expect(page.getByText("Alice Johnson").first()).toBeVisible();
  });

  test("has Back to Reviews link", async ({ page }) => {
    const backLink = page.locator("a", { hasText: "Back to Reviews" });
    await expect(backLink).toBeVisible();
  });

  test("shows COIN framework help section", async ({ page }) => {
    await expect(page.getByText("About Peer Reviews")).toBeVisible();
    await expect(page.getByText("Context").first()).toBeVisible();
    await expect(page.getByText("Observation").first()).toBeVisible();
    await expect(page.getByText("Impact").first()).toBeVisible();
    await expect(page.getByText("Next Steps").first()).toBeVisible();
  });

  test("separates pending and completed requests", async ({ page }) => {
    await expect(page.getByText("Pending Requests (1)")).toBeVisible();
    await expect(page.getByText("Completed (1)")).toBeVisible();
  });
});

// ============ PEER REQUESTS EMPTY STATE TESTS ============

test.describe("Peer Requests Page — Empty State", () => {
  test("shows empty state when no requests exist", async ({ page }) => {
    await setupCommonMocks(page);

    // Override routes for empty peer requests
    await page.route(`${API_BASE}/reviews/peer-requests/pending**`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.goto("/reviews/peer-requests");
    await page.waitForSelector('h1:has-text("Peer Review Requests")', { timeout: 45000 });

    await expect(page.getByText("No peer requests yet")).toBeVisible();
    await expect(page.getByText("When colleagues request your feedback")).toBeVisible();
  });
});

// ============ MANAGEMENT PAGE TESTS ============

test.describe("Review Management Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupReviewsMocks(page);
    await page.goto("/reviews/manage");
    await page.waitForSelector('h1:has-text("Review Management")', { timeout: 45000 });
  });

  test("renders management page with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Review Management" })).toBeVisible();
    await expect(page.getByText("Monitor team reviews, track deliverables")).toBeVisible();
  });

  test("shows summary stats cards", async ({ page }) => {
    await expect(page.getByText("Team Members")).toBeVisible();
    await expect(page.getByText("In Progress")).toBeVisible();
    await expect(page.getByText("Action Needed")).toBeVisible();
    await expect(page.getByText("Suggestions")).toBeVisible();
  });

  test("displays tab navigation with Overview, Actionables, and GitHub Suggestions", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Team Overview/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Actionables/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /GitHub Suggestions/i })).toBeVisible();
  });

  test("shows team member cards in Overview tab", async ({ page }) => {
    // Team members from mockMembers should render
    await expect(page.getByText("Test Developer").first()).toBeVisible();
  });

  test("has search input for filtering members", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search team members...");
    await expect(searchInput).toBeVisible();
  });

  test("has status filter dropdown", async ({ page }) => {
    const statusFilter = page.locator("select");
    await expect(statusFilter).toBeVisible();
  });

  test("member cards have View Details link", async ({ page }) => {
    const viewDetailsLinks = page.locator("a", { hasText: "View Details" });
    await expect(viewDetailsLinks.first()).toBeVisible();
  });

  test("has Review Cycles link button", async ({ page }) => {
    const cyclesLink = page.locator("a", { hasText: "Review Cycles" });
    await expect(cyclesLink).toBeVisible();
  });

  test("has Export Report button", async ({ page }) => {
    const exportBtn = page.getByRole("button", { name: /Export Report/i });
    await expect(exportBtn).toBeVisible();
  });

  test("Actionables tab shows action items", async ({ page }) => {
    await page.getByRole("button", { name: /Actionables/i }).click();
    // Should show actionable items derived from mockManagerReviews
    await expect(page.getByText("Action Required")).toBeVisible();
  });

  test("GitHub Suggestions tab shows empty state when no suggestions", async ({ page }) => {
    await page.getByRole("button", { name: /GitHub Suggestions/i }).click();
    await expect(page.getByText("No suggestions yet")).toBeVisible();
    await expect(page.getByText("Goal suggestions will appear here")).toBeVisible();
  });

  test("has breadcrumb navigation", async ({ page }) => {
    await expect(page.locator("a", { hasText: "Reviews" }).first()).toBeVisible();
    await expect(page.getByText("Management")).toBeVisible();
  });
});

// ============ GOALS LIST EMPTY STATE TESTS ============

test.describe("Goals List Page — Empty State", () => {
  test("shows empty state when no goals exist", async ({ page }) => {
    await setupCommonMocks(page);

    // Override goals endpoint to return empty
    await page.route(`${API_BASE}/reviews/goals**`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });
    await page.route(`${API_BASE}/reviews/my-reviews**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route(`${API_BASE}/reviews/peer-requests/pending**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.goto("/reviews/goals");
    await page.waitForSelector('h1:has-text("My Goals")', { timeout: 45000 });

    await expect(page.getByText("No goals yet")).toBeVisible();
    await expect(page.getByText("SMART goals help you track progress")).toBeVisible();
    await expect(page.locator("a", { hasText: "Create Your First Goal" })).toBeVisible();
  });

  test("empty state shows goal type categories", async ({ page }) => {
    await setupCommonMocks(page);

    await page.route(`${API_BASE}/reviews/goals**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route(`${API_BASE}/reviews/my-reviews**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route(`${API_BASE}/reviews/peer-requests/pending**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.goto("/reviews/goals");
    await page.waitForSelector('h1:has-text("My Goals")', { timeout: 45000 });

    await expect(page.getByText("Performance")).toBeVisible();
    await expect(page.getByText("Skill Development")).toBeVisible();
    await expect(page.getByText("Project")).toBeVisible();
    await expect(page.getByText("Leadership")).toBeVisible();
  });
});

// ============ REVIEW CYCLES EMPTY STATE TESTS ============

test.describe("Review Cycles Page — Empty State", () => {
  test("shows empty state when no cycles exist", async ({ page }) => {
    await setupCommonMocks(page);

    await page.route(`${API_BASE}/reviews/workspaces/ws-1/cycles**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.goto("/reviews/cycles");
    await page.waitForSelector('h1:has-text("Review Cycles")', { timeout: 45000 });

    await expect(page.getByText("No review cycles yet")).toBeVisible();
    await expect(page.getByText("Create your first review cycle")).toBeVisible();
    await expect(page.locator("a", { hasText: "Create First Cycle" })).toBeVisible();
  });
});
