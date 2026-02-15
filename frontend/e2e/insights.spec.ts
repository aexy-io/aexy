import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import {
  setupCommonMocks,
  API_BASE,
  mockUser,
} from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockTeamInsights = {
  workspace_id: "ws-1",
  period_type: "weekly",
  member_count: 5,
  aggregate: {
    total_commits: 142,
    total_prs_merged: 38,
    total_reviews: 67,
    total_lines_changed: 14500,
    avg_commits_per_member: 28.4,
    avg_prs_per_member: 7.6,
    avg_reviews_per_member: 13.4,
    avg_lines_per_member: 2900,
    avg_pr_cycle_time_hours: 6.2,
    avg_time_to_first_review_hours: 1.8,
  },
  distribution: {
    gini_coefficient: 0.28,
    top_contributor_share: 0.32,
    bottleneck_developers: ["dev-2"],
    member_metrics: [
      {
        developer_id: "test-user-123",
        developer_name: "Test Developer",
        commits_count: 45,
        prs_merged: 12,
        lines_changed: 4800,
        reviews_given: 18,
        avg_pr_cycle_time_hours: 5.1,
      },
      {
        developer_id: "dev-2",
        developer_name: "Alice Johnson",
        commits_count: 38,
        prs_merged: 10,
        lines_changed: 3600,
        reviews_given: 22,
        avg_pr_cycle_time_hours: 4.8,
      },
      {
        developer_id: "dev-3",
        developer_name: "Bob Smith",
        commits_count: 28,
        prs_merged: 8,
        lines_changed: 2900,
        reviews_given: 12,
        avg_pr_cycle_time_hours: 7.2,
      },
      {
        developer_id: "dev-4",
        developer_name: "Carol White",
        commits_count: 18,
        prs_merged: 5,
        lines_changed: 1800,
        reviews_given: 10,
        avg_pr_cycle_time_hours: 8.5,
      },
      {
        developer_id: "dev-5",
        developer_name: "Dan Lee",
        commits_count: 13,
        prs_merged: 3,
        lines_changed: 1400,
        reviews_given: 5,
        avg_pr_cycle_time_hours: 9.1,
      },
    ],
  },
};

const mockLeaderboard = {
  metric: "commits",
  period_type: "weekly",
  entries: [
    { developer_id: "test-user-123", developer_name: "Test Developer", rank: 1, value: 45 },
    { developer_id: "dev-2", developer_name: "Alice Johnson", rank: 2, value: 38 },
    { developer_id: "dev-3", developer_name: "Bob Smith", rank: 3, value: 28 },
    { developer_id: "dev-4", developer_name: "Carol White", rank: 4, value: 18 },
    { developer_id: "dev-5", developer_name: "Dan Lee", rank: 5, value: 13 },
  ],
};

const mockDeveloperInsights = {
  developer_id: "test-user-123",
  developer_name: "Test Developer",
  period_type: "weekly",
  velocity: {
    commits_count: 45,
    prs_merged: 12,
    prs_opened: 14,
    lines_added: 3200,
    lines_removed: 1600,
    lines_changed: 4800,
    commit_frequency: 6.4,
    pr_throughput: 1.7,
    avg_commit_size: 107,
  },
  efficiency: {
    avg_pr_cycle_time_hours: 5.1,
    avg_time_to_first_review_hours: 1.5,
    pr_merge_rate: 0.86,
    rework_ratio: 0.12,
    first_pass_yield: 0.88,
  },
  quality: {
    review_participation_rate: 0.82,
    avg_review_depth: 3.4,
    self_merge_rate: 0.05,
    bug_fix_ratio: 0.15,
  },
  sustainability: {
    weekend_commit_ratio: 0.04,
    late_night_commit_ratio: 0.02,
    focus_score: 0.78,
    burst_ratio: 0.18,
  },
  collaboration: {
    unique_collaborators: 8,
    cross_team_prs: 3,
    knowledge_sharing_score: 0.72,
    mentoring_score: 0.65,
  },
};

const mockHealthScore = {
  developer_id: "test-user-123",
  score: 82,
  breakdown: {
    velocity: { score: 85, weight: 0.3 },
    efficiency: { score: 78, weight: 0.25 },
    quality: { score: 88, weight: 0.25 },
    sustainability: { score: 76, weight: 0.2 },
  },
  period_type: "weekly",
};

const mockRepositoryInsights = {
  total_repositories: 3,
  period_type: "weekly",
  repositories: [
    {
      repository: "acme/frontend",
      language: "TypeScript",
      is_private: false,
      commits_count: 62,
      prs_merged: 18,
      reviews_count: 34,
      lines_added: 4200,
      lines_removed: 1800,
      unique_contributors: 4,
    },
    {
      repository: "acme/backend",
      language: "Python",
      is_private: true,
      commits_count: 48,
      prs_merged: 12,
      reviews_count: 22,
      lines_added: 3100,
      lines_removed: 1200,
      unique_contributors: 3,
    },
    {
      repository: "acme/infra",
      language: "Go",
      is_private: true,
      commits_count: 32,
      prs_merged: 8,
      reviews_count: 11,
      lines_added: 1500,
      lines_removed: 600,
      unique_contributors: 2,
    },
  ],
};

const mockAINarrative = {
  narrative:
    "**Weekly Team Summary**\n\nThe engineering team had a productive week with 142 total commits across 5 active contributors. PR throughput increased by 15% compared to the previous period.\n\n1. Test Developer led the charge with 45 commits\n2. Alice Johnson maintained strong review activity\n\n- Code review turnaround improved to 1.8 hours on average\n- The Gini coefficient of 0.28 indicates a balanced workload distribution",
  generated: true,
  tokens_used: 450,
};

const mockEnabledRepos = [
  {
    id: "repo-1",
    name: "frontend",
    full_name: "acme/frontend",
    owner: "acme",
    is_private: false,
    language: "TypeScript",
    is_enabled: true,
  },
  {
    id: "repo-2",
    name: "backend",
    full_name: "acme/backend",
    owner: "acme",
    is_private: true,
    language: "Python",
    is_enabled: true,
  },
];

const mockSnapshotStatus = {
  last_generated: "2026-02-13T10:00:00Z",
  snapshots_count: 25,
  status: "completed",
};

const mockPercentile = {
  developer_id: "test-user-123",
  peer_count: 5,
  rankings: {
    commits: { percentile: 90, rank: 1, total: 5 },
    prs_merged: { percentile: 80, rank: 1, total: 5 },
    reviews: { percentile: 70, rank: 2, total: 5 },
    lines_changed: { percentile: 85, rank: 1, total: 5 },
  },
};

const mockInstallationStatus = {
  has_installation: true,
  install_url: null,
  installations: [{ id: 1, account: "acme" }],
};

// ---------------------------------------------------------------------------
// Setup function: common mocks + insights-specific mocks
// ---------------------------------------------------------------------------

async function setupInsightsMocks(page: Page) {
  await setupCommonMocks(page);

  // Override the workspace sub-routes to add insights-specific endpoints
  await page.route(`${API_BASE}/workspaces/**`, (route) => {
    const url = route.request().url();

    // AI team narrative
    if (url.includes("/insights/ai/team/narrative")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockAINarrative),
      });
    }

    // AI sprint retro
    if (url.includes("/insights/ai/team/sprint-retro")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          retro: "**Sprint Retrospective**\n\nThe team completed 38 PRs this sprint with an average cycle time of 6.2 hours.",
          metrics_summary: { total_prs: 38, avg_cycle_time: "6.2h", review_coverage: "82%", rework_rate: "12%" },
          generated: true,
        }),
      });
    }

    // AI team trajectory
    if (url.includes("/insights/ai/team/trajectory")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          trajectory: "**Team Trajectory Forecast**\n\nBased on recent trends, the team velocity is projected to increase by 10% over the next sprint.",
          trends: { velocity_change: 10, efficiency_change: 5, quality_change: 3, sustainability_change: -2 },
          generated: true,
        }),
      });
    }

    // AI root cause
    if (url.includes("/insights/ai/team/root-cause-analysis")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          analysis: "**Root Cause Analysis**\n\nThe slight dip in review turnaround is attributed to the frontend refactoring effort.",
          generated: true,
        }),
      });
    }

    // AI composition recommendations
    if (url.includes("/insights/ai/team/composition-recommendations")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          recommendations: "**Team Composition**\n\nThe team has a healthy mix of senior and junior contributors.",
          generated: true,
        }),
      });
    }

    // AI hiring forecast
    if (url.includes("/insights/ai/team/hiring-forecast")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          forecast: "**Hiring Forecast**\n\nBased on current workload distribution, hiring a mid-level engineer is recommended within 2 months.",
          indicators: { workload_index: "0.78", bus_factor: 2, projected_capacity_gap: "15%", recommended_hire_timeline: "2 months" },
          generated: true,
        }),
      });
    }

    // Snapshot status
    if (url.includes("/insights/snapshots/status")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockSnapshotStatus),
      });
    }

    // Snapshot generate (POST)
    if (url.includes("/insights/snapshots/generate") && route.request().method() === "POST") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ snapshots_generated: 5, message: "Snapshots generated successfully" }),
      });
    }

    // Developer health score (must be before generic developer insights)
    if (url.includes("/insights/developers/") && url.includes("/health-score")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockHealthScore),
      });
    }

    // Developer percentile
    if (url.includes("/insights/developers/") && url.includes("/percentile")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockPercentile),
      });
    }

    // Developer export
    if (url.includes("/insights/developers/") && url.includes("/export")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ developer_id: "test-user-123", data: mockDeveloperInsights }),
      });
    }

    // Developer insights (generic — after more specific developer sub-routes)
    if (url.includes("/insights/developers/") && !url.includes("/ai/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockDeveloperInsights),
      });
    }

    // Leaderboard
    if (url.includes("/insights/team/leaderboard")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockLeaderboard),
      });
    }

    // Repository insights
    if (url.includes("/insights/repositories")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockRepositoryInsights),
      });
    }

    // Team insights
    if (url.includes("/insights/team")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockTeamInsights),
      });
    }

    // Enabled repositories list (workspace-scoped)
    if (url.includes("/repositories") && !url.includes("/insights/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockEnabledRepos),
      });
    }

    // App access
    if (url.includes("/app-access/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ apps: {}, applied_template_id: null, applied_template_name: null, has_custom_overrides: false, is_admin: true }),
      });
    }

    // Documents
    if (url.includes("/documents/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Spaces
    if (url.includes("/spaces")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Members
    if (url.includes("/members")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { developer_id: "test-user-123", name: "Test Developer", email: "test@example.com", role: "admin", avatar_url: null, status: "active" },
          { developer_id: "dev-2", name: "Alice Johnson", email: "alice@example.com", role: "member", avatar_url: null, status: "active" },
          { developer_id: "dev-3", name: "Bob Smith", email: "bob@example.com", role: "member", avatar_url: null, status: "active" },
        ]),
      });
    }

    // Invites
    if (url.includes("/invites")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Task statuses
    if (url.includes("/task-statuses")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Apps
    if (url.includes("/apps")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    }

    // Billing
    if (url.includes("/billing")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plan: { tier: "pro" }, status: "active" }),
      });
    }

    // Teams
    if (url.includes("/teams")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Default: workspace object
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "ws-1", name: "Test Workspace", slug: "test-ws", type: "engineering" }),
    });
  });

  // Installation status (non-workspace-scoped route)
  await page.route(`${API_BASE}/repositories/installation/status`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockInstallationStatus),
    });
  });

  // Repositories list (non-workspace-scoped, used by useEnabledRepositories)
  await page.route(`${API_BASE}/repositories`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockEnabledRepos),
    });
  });

  // Repositories sub-routes (enable, disable, etc.)
  await page.route(`${API_BASE}/repositories/**`, (route) => {
    const url = route.request().url();

    if (url.includes("/installation/status")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockInstallationStatus),
      });
    }

    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
}

// ---------------------------------------------------------------------------
// Test Suite: Team Insights Page
// ---------------------------------------------------------------------------

test.describe("Insights Page -- Team Insights", () => {
  test.beforeEach(async ({ page }) => {
    await setupInsightsMocks(page);
    await page.goto("/insights");
    await page.waitForSelector("text=Team Insights", { timeout: 45000 });
  });

  test("renders heading and description", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Team Insights" })).toBeVisible();
    await expect(
      page.getByText("Metrics-driven view of team velocity, efficiency, and workload distribution")
    ).toBeVisible();
  });

  test("shows period selector buttons (Weekly/Monthly/Sprint)", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Weekly" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Monthly" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sprint" })).toBeVisible();
  });

  test("shows stat cards with correct data", async ({ page }) => {
    // Team Size
    await expect(page.getByText("Team Size")).toBeVisible();
    await expect(page.getByText("5", { exact: true }).first()).toBeVisible();

    // Commits
    await expect(page.getByText("Commits").first()).toBeVisible();
    await expect(page.getByText("142")).toBeVisible();

    // PRs Merged
    await expect(page.getByText("PRs Merged").first()).toBeVisible();
    await expect(page.getByText("38")).toBeVisible();

    // Reviews
    await expect(page.getByText("Reviews").first()).toBeVisible();

    // Lines Changed
    await expect(page.getByText("Lines Changed")).toBeVisible();
    await expect(page.getByText("14.5K")).toBeVisible();
  });

  test("shows Developer Summary table with member data", async ({ page }) => {
    await expect(page.getByText("Developer Summary")).toBeVisible();

    // Table headers
    await expect(page.getByText("Developer").first()).toBeVisible();

    // Developer rows
    await expect(page.getByText("Test Developer").first()).toBeVisible();
    await expect(page.getByText("Alice Johnson").first()).toBeVisible();
    await expect(page.getByText("Bob Smith").first()).toBeVisible();
    await expect(page.getByText("Carol White")).toBeVisible();
    await expect(page.getByText("Dan Lee")).toBeVisible();
  });

  test("shows bottleneck badge for flagged developers", async ({ page }) => {
    await expect(page.getByText("bottleneck")).toBeVisible();
  });

  test("shows Top Contributors leaderboard", async ({ page }) => {
    await expect(page.getByText("Top Contributors")).toBeVisible();
    await expect(page.getByText("View all")).toBeVisible();
  });

  test("shows Workload Distribution chart section", async ({ page }) => {
    await expect(page.getByText("Workload Distribution")).toBeVisible();
  });

  test("shows navigation links to sub-pages", async ({ page }) => {
    await expect(page.getByRole("link", { name: "AI Insights" })).toBeVisible();
    await expect(page.getByRole("link", { name: "My Insights" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Compare" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Allocations" })).toBeVisible();
  });

  test("shows Generate Snapshots button", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Generate Snapshots" })).toBeVisible();
  });

  test("switching period selector updates view", async ({ page }) => {
    // Click Monthly
    await page.getByRole("button", { name: "Monthly" }).click();

    // Page should still render (data re-fetches, same mock returns)
    await expect(page.getByText("Team Insights")).toBeVisible();
    await expect(page.getByText("Team Size")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: My Insights Page
// ---------------------------------------------------------------------------

test.describe("Insights Page -- My Insights", () => {
  test.beforeEach(async ({ page }) => {
    await setupInsightsMocks(page);
    await page.goto("/insights/me");
    await page.waitForSelector("text=My Insights", { timeout: 45000 });
  });

  test("renders heading and description", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "My Insights" })).toBeVisible();
    await expect(
      page.getByText("Your personal engineering metrics")
    ).toBeVisible();
  });

  test("shows Health Score", async ({ page }) => {
    await expect(page.getByText("Health Score")).toBeVisible();
    await expect(page.getByText("82")).toBeVisible();
  });

  test("shows personal velocity metrics", async ({ page }) => {
    // Key stat cards
    await expect(page.getByText("Commits").first()).toBeVisible();
    await expect(page.getByText("45").first()).toBeVisible();
    await expect(page.getByText("PRs Merged").first()).toBeVisible();
    await expect(page.getByText("12").first()).toBeVisible();
    await expect(page.getByText("Collaborators")).toBeVisible();
    await expect(page.getByText("8").first()).toBeVisible();
  });

  test("shows Velocity & Efficiency section", async ({ page }) => {
    await expect(page.getByText("Velocity & Efficiency")).toBeVisible();
    await expect(page.getByText("Commit Frequency")).toBeVisible();
    await expect(page.getByText("6.4/day")).toBeVisible();
    await expect(page.getByText("PR Throughput")).toBeVisible();
    await expect(page.getByText("PR Cycle Time")).toBeVisible();
    await expect(page.getByText("PR Merge Rate")).toBeVisible();
  });

  test("shows Quality & Sustainability section", async ({ page }) => {
    await expect(page.getByText("Quality & Sustainability")).toBeVisible();
    await expect(page.getByText("Review Participation")).toBeVisible();
    await expect(page.getByText("Self-Merge Rate")).toBeVisible();
    await expect(page.getByText("Focus Score")).toBeVisible();
    await expect(page.getByText("Knowledge Sharing")).toBeVisible();
  });

  test("shows period selector buttons", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Weekly" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Monthly" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sprint" })).toBeVisible();
  });

  test("shows Export Data button", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Export Data" })).toBeVisible();
  });

  test("shows back link to team insights", async ({ page }) => {
    const backLink = page.getByRole("link", { name: "" }).first();
    // The back arrow is a link to /insights
    await expect(page.locator("a[href='/insights']").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Leaderboard Page
// ---------------------------------------------------------------------------

test.describe("Insights Page -- Leaderboard", () => {
  test.beforeEach(async ({ page }) => {
    await setupInsightsMocks(page);
    await page.goto("/insights/leaderboard");
    await page.waitForSelector("text=Leaderboard", { timeout: 45000 });
  });

  test("renders heading and description", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
    await expect(page.getByText("Ranked developer metrics")).toBeVisible();
  });

  test("shows ranked developer entries", async ({ page }) => {
    await expect(page.getByText("Test Developer").first()).toBeVisible();
    await expect(page.getByText("Alice Johnson").first()).toBeVisible();
    await expect(page.getByText("Bob Smith").first()).toBeVisible();
    await expect(page.getByText("Carol White")).toBeVisible();
    await expect(page.getByText("Dan Lee")).toBeVisible();
  });

  test("shows metric selector buttons", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Commits" })).toBeVisible();
    await expect(page.getByRole("button", { name: "PRs Merged" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reviews" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Lines Changed" })).toBeVisible();
  });

  test("shows period selector buttons", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Weekly" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Monthly" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sprint" })).toBeVisible();
  });

  test("shows numeric values for the ranked metric", async ({ page }) => {
    // Commit values from mock leaderboard
    await expect(page.getByText("45").first()).toBeVisible();
    await expect(page.getByText("38").first()).toBeVisible();
    await expect(page.getByText("28").first()).toBeVisible();
  });

  test("switching metric selector updates the leaderboard", async ({ page }) => {
    await page.getByRole("button", { name: "PRs Merged" }).click();

    // Page should still show leaderboard entries (same mock returns)
    await expect(page.getByText("Leaderboard")).toBeVisible();
    await expect(page.getByText("Test Developer").first()).toBeVisible();
  });

  test("shows back link to team insights", async ({ page }) => {
    await expect(page.locator("a[href='/insights']").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Repositories Page
// ---------------------------------------------------------------------------

test.describe("Insights Page -- Repositories", () => {
  test.beforeEach(async ({ page }) => {
    await setupInsightsMocks(page);
    await page.goto("/insights/repositories");
    await page.waitForSelector("text=Repositories", { timeout: 45000 });
  });

  test("renders heading and description", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Repositories" })).toBeVisible();
    await expect(page.getByText("Activity breakdown by repository")).toBeVisible();
  });

  test("shows repository count summary", async ({ page }) => {
    await expect(page.getByText("3 repositories with activity")).toBeVisible();
  });

  test("shows repository table with data", async ({ page }) => {
    // Table headers
    await expect(page.getByText("Repository").first()).toBeVisible();

    // Repository names
    await expect(page.getByText("acme/frontend")).toBeVisible();
    await expect(page.getByText("acme/backend")).toBeVisible();
    await expect(page.getByText("acme/infra")).toBeVisible();
  });

  test("shows language badges for repositories", async ({ page }) => {
    await expect(page.getByText("TypeScript").first()).toBeVisible();
    await expect(page.getByText("Python").first()).toBeVisible();
    await expect(page.getByText("Go").first()).toBeVisible();
  });

  test("shows commit, PR, and contributor counts", async ({ page }) => {
    // acme/frontend row values
    await expect(page.getByText("62").first()).toBeVisible();
  });

  test("shows period selector buttons", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Weekly" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Monthly" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sprint" })).toBeVisible();
  });

  test("shows back link to team insights", async ({ page }) => {
    await expect(page.locator("a[href='/insights']").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Repositories Page -- Empty State
// ---------------------------------------------------------------------------

test.describe("Insights Page -- Repositories Empty State", () => {
  test("shows empty state when no repository data", async ({ page }) => {
    await setupCommonMocks(page);

    // Override workspace sub-routes with empty repo insights
    await page.route(`${API_BASE}/workspaces/**`, (route) => {
      const url = route.request().url();

      if (url.includes("/insights/repositories")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ total_repositories: 0, period_type: "weekly", repositories: [] }),
        });
      }

      if (url.includes("/app-access/")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ apps: {}, applied_template_id: null, applied_template_name: null, has_custom_overrides: false, is_admin: true }),
        });
      }

      if (url.includes("/documents/")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }

      if (url.includes("/spaces")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }

      if (url.includes("/members")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }

      if (url.includes("/invites")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }

      if (url.includes("/task-statuses")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }

      if (url.includes("/apps")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      }

      if (url.includes("/billing")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: { tier: "pro" }, status: "active" }) });
      }

      if (url.includes("/teams")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "ws-1", name: "Test Workspace", slug: "test-ws", type: "engineering" }),
      });
    });

    // Installation status
    await page.route(`${API_BASE}/repositories/installation/status`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockInstallationStatus) });
    });

    await page.route(`${API_BASE}/repositories`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockEnabledRepos) });
    });

    await page.route(`${API_BASE}/repositories/**`, (route) => {
      const url = route.request().url();
      if (url.includes("/installation/status")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockInstallationStatus) });
      }
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });

    await page.goto("/insights/repositories");
    await page.waitForSelector("text=Repositories", { timeout: 45000 });

    await expect(page.getByText("No repository activity found for this period")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: AI Insights Page
// ---------------------------------------------------------------------------

test.describe("Insights Page -- AI Insights", () => {
  test.beforeEach(async ({ page }) => {
    await setupInsightsMocks(page);
    await page.goto("/insights/ai");
    await page.waitForSelector("text=AI Insights", { timeout: 45000 });
  });

  test("renders heading and description", async ({ page }) => {
    await expect(page.getByText("AI Insights")).toBeVisible();
    await expect(page.getByText("LLM-powered intelligence for your engineering team")).toBeVisible();
  });

  test("shows all AI tab buttons", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Team Narrative" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sprint Retro" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Trajectory" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Root Cause" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Team Composition" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hiring Forecast" })).toBeVisible();
  });

  test("Team Narrative tab shows narrative content", async ({ page }) => {
    // Team Narrative is the default active tab
    await expect(page.getByText("AI-generated summary of team metrics")).toBeVisible();

    // Wait for narrative content to load
    await expect(page.getByText("Weekly Team Summary")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("AI Generated")).toBeVisible();
  });

  test("switching to Sprint Retro tab shows retro content", async ({ page }) => {
    await page.getByRole("button", { name: "Sprint Retro" }).click();

    await expect(page.getByText("AI-powered retrospective insights")).toBeVisible();
    await expect(page.getByText("Sprint Retrospective")).toBeVisible({ timeout: 30000 });
  });

  test("switching to Trajectory tab shows forecast content", async ({ page }) => {
    await page.getByRole("button", { name: "Trajectory" }).click();

    await expect(page.getByText("Team performance trajectory forecast")).toBeVisible();
    await expect(page.getByText("Team Trajectory Forecast")).toBeVisible({ timeout: 30000 });
  });

  test("switching to Root Cause tab shows analysis content", async ({ page }) => {
    await page.getByRole("button", { name: "Root Cause" }).click();

    await expect(page.getByText("Analyze why metrics changed")).toBeVisible();
    await expect(page.getByText("Root Cause Analysis")).toBeVisible({ timeout: 30000 });
  });

  test("switching to Team Composition tab shows recommendations", async ({ page }) => {
    await page.getByRole("button", { name: "Team Composition" }).click();

    await expect(page.getByText("Recommendations for team structure")).toBeVisible();
    await expect(page.getByText("Team Composition", { exact: false }).nth(1)).toBeVisible({ timeout: 30000 });
  });

  test("switching to Hiring Forecast tab shows forecast", async ({ page }) => {
    await page.getByRole("button", { name: "Hiring Forecast" }).click();

    await expect(page.getByText("When to hire next")).toBeVisible();
    await expect(page.getByText("Hiring Forecast", { exact: false }).nth(1)).toBeVisible({ timeout: 30000 });
  });

  test("shows period selector dropdown", async ({ page }) => {
    const periodSelect = page.locator("select").first();
    await expect(periodSelect).toBeVisible();
    await expect(periodSelect).toHaveValue("weekly");
  });

  test("shows back link to team insights", async ({ page }) => {
    await expect(page.locator("a[href='/insights']").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Team Insights -- No GitHub Installation
// ---------------------------------------------------------------------------

test.describe("Insights Page -- No GitHub Installation", () => {
  test("shows connect GitHub prompt when no installation exists", async ({ page }) => {
    await setupCommonMocks(page);

    // Override workspace sub-routes for insights with no data
    await page.route(`${API_BASE}/workspaces/**`, (route) => {
      const url = route.request().url();

      if (url.includes("/insights/team/leaderboard")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ metric: "commits", period_type: "weekly", entries: [] }) });
      }

      if (url.includes("/insights/team")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(null) });
      }

      if (url.includes("/app-access/")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apps: {}, applied_template_id: null, applied_template_name: null, has_custom_overrides: false, is_admin: true }) });
      }

      if (url.includes("/documents/")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }

      if (url.includes("/spaces")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }

      if (url.includes("/members")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }

      if (url.includes("/invites")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }

      if (url.includes("/task-statuses")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }

      if (url.includes("/apps")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      }

      if (url.includes("/billing")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: { tier: "pro" }, status: "active" }) });
      }

      if (url.includes("/teams")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }

      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "ws-1", name: "Test Workspace", slug: "test-ws", type: "engineering" }),
      });
    });

    // No installation
    await page.route(`${API_BASE}/repositories/installation/status`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ has_installation: false, install_url: "https://github.com/apps/aexy/install", installations: [] }),
      });
    });

    await page.route(`${API_BASE}/repositories`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.route(`${API_BASE}/repositories/**`, (route) => {
      const url = route.request().url();
      if (url.includes("/installation/status")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ has_installation: false, install_url: "https://github.com/apps/aexy/install", installations: [] }),
        });
      }
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });

    await page.goto("/insights");
    await page.waitForSelector("text=Team Insights", { timeout: 45000 });

    await expect(page.getByText("Connect your GitHub account")).toBeVisible();
    await expect(page.getByText("Install the Aexy GitHub App")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Navigation Between Insights Pages
// ---------------------------------------------------------------------------

test.describe("Insights Page -- Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await setupInsightsMocks(page);
  });

  test("navigates from Team Insights to My Insights", async ({ page }) => {
    await page.goto("/insights");
    await page.waitForSelector("text=Team Insights", { timeout: 45000 });

    await page.getByRole("link", { name: "My Insights" }).click();
    await page.waitForSelector("text=My Insights", { timeout: 45000 });

    await expect(page.getByRole("heading", { name: "My Insights" })).toBeVisible();
  });

  test("navigates from Team Insights to AI Insights", async ({ page }) => {
    await page.goto("/insights");
    await page.waitForSelector("text=Team Insights", { timeout: 45000 });

    await page.getByRole("link", { name: "AI Insights" }).click();
    await page.waitForSelector("text=AI Insights", { timeout: 45000 });

    await expect(page.getByText("AI Insights")).toBeVisible();
  });

  test("navigates from Team Insights to Leaderboard via View all", async ({ page }) => {
    await page.goto("/insights");
    await page.waitForSelector("text=Team Insights", { timeout: 45000 });

    await page.getByText("View all").click();
    await page.waitForSelector("text=Leaderboard", { timeout: 45000 });

    await expect(page.getByRole("heading", { name: "Leaderboard" })).toBeVisible();
  });
});
