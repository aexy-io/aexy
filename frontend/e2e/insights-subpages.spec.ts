import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE, mockUser, mockMembers } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockCompareData = {
  developers: [
    {
      developer_id: "test-user-123",
      developer_name: "Test Developer",
      commits: 45,
      prs_merged: 12,
      reviews: 18,
      lines_changed: 4800,
    },
    {
      developer_id: "dev-2",
      developer_name: "Alice Johnson",
      commits: 38,
      prs_merged: 10,
      reviews: 22,
      lines_changed: 3600,
    },
  ],
  period_type: "weekly",
};

const mockAllocations = {
  allocations: [
    {
      developer_id: "test-user-123",
      developer_name: "Test Developer",
      repositories: [
        { repo: "acme/frontend", percentage: 60 },
        { repo: "acme/backend", percentage: 40 },
      ],
    },
    {
      developer_id: "dev-2",
      developer_name: "Alice Johnson",
      repositories: [
        { repo: "acme/backend", percentage: 80 },
        { repo: "acme/infra", percentage: 20 },
      ],
    },
  ],
  period_type: "weekly",
};

const mockAlerts = [
  {
    id: "alert-1",
    type: "bottleneck",
    severity: "warning",
    message: "Alice Johnson is a bottleneck for PR reviews",
    developer_id: "dev-2",
    created_at: "2026-02-14T10:00:00Z",
  },
  {
    id: "alert-2",
    type: "sustainability",
    severity: "info",
    message: "Weekend commit ratio above threshold for Test Developer",
    developer_id: "test-user-123",
    created_at: "2026-02-13T15:00:00Z",
  },
];

const mockExecutive = {
  summary: {
    total_commits: 142,
    total_prs: 38,
    total_reviews: 67,
    avg_cycle_time_hours: 6.2,
    team_health_score: 82,
  },
  highlights: [
    "PR throughput increased 15% this week",
    "Review turnaround improved to 1.8 hours average",
  ],
  risks: [
    "One developer flagged as bottleneck",
  ],
  period_type: "weekly",
};

const mockSprintCapacity = {
  current_sprint: {
    id: "sprint-1",
    name: "Sprint 24",
    total_points: 55,
    completed_points: 32,
    remaining_points: 23,
    days_remaining: 5,
  },
  team_capacity: [
    { developer_id: "test-user-123", developer_name: "Test Developer", capacity_points: 13, allocated_points: 11 },
    { developer_id: "dev-2", developer_name: "Alice Johnson", capacity_points: 10, allocated_points: 10 },
  ],
};

const mockSyncStatus = {
  repositories: [
    { repo: "acme/frontend", last_sync: "2026-02-15T09:00:00Z", status: "synced", commits_synced: 1250 },
    { repo: "acme/backend", last_sync: "2026-02-15T08:30:00Z", status: "synced", commits_synced: 980 },
    { repo: "acme/infra", last_sync: "2026-02-15T07:00:00Z", status: "error", commits_synced: 500 },
  ],
};

const mockDeveloperDetail = {
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

const mockRepoDetail = {
  repository: "acme/frontend",
  language: "TypeScript",
  period_type: "weekly",
  commits_count: 62,
  prs_merged: 18,
  reviews_count: 34,
  lines_added: 4200,
  lines_removed: 1800,
  unique_contributors: 4,
  contributors: [
    { developer_id: "test-user-123", developer_name: "Test Developer", commits: 28, prs: 8 },
    { developer_id: "dev-2", developer_name: "Alice Johnson", commits: 20, prs: 6 },
  ],
};

const mockEnabledRepos = [
  { id: "repo-1", name: "frontend", full_name: "acme/frontend", owner: "acme", is_private: false, language: "TypeScript", is_enabled: true },
  { id: "repo-2", name: "backend", full_name: "acme/backend", owner: "acme", is_private: true, language: "Python", is_enabled: true },
];

const mockInstallationStatus = {
  has_installation: true,
  install_url: null,
  installations: [{ id: 1, account: "acme" }],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupInsightsSubpageMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/**`, (route) => {
    const url = route.request().url();

    // Compare
    if (url.includes("/insights/compare")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCompareData) });
    }
    // Allocations
    if (url.includes("/insights/allocations")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAllocations) });
    }
    // Alerts
    if (url.includes("/insights/alerts")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAlerts) });
    }
    // Executive
    if (url.includes("/insights/executive")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockExecutive) });
    }
    // Sprint Capacity
    if (url.includes("/insights/sprint-capacity")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockSprintCapacity) });
    }
    // Sync Status
    if (url.includes("/insights/sync-status")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockSyncStatus) });
    }
    // Snapshot status
    if (url.includes("/insights/snapshots/status")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ last_generated: "2026-02-13T10:00:00Z", snapshots_count: 25, status: "completed" }) });
    }
    // Developer detail
    if (url.includes("/insights/developers/")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockDeveloperDetail) });
    }
    // Repository detail
    if (url.includes("/insights/repositories/")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRepoDetail) });
    }
    // Insights settings
    if (url.includes("/insights/settings")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    }
    // Team insights
    if (url.includes("/insights/team")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ workspace_id: "ws-1", period_type: "weekly", member_count: 5, aggregate: {}, distribution: {} }) });
    }
    // Repositories
    if (url.includes("/insights/repositories")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total_repositories: 2, period_type: "weekly", repositories: [] }) });
    }
    // App access
    if (url.includes("/app-access/")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apps: {}, applied_template_id: null, applied_template_name: null, has_custom_overrides: false, is_admin: true }) });
    }
    // Documents
    if (url.includes("/documents/")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
    // Spaces
    if (url.includes("/spaces")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
    // Members
    if (url.includes("/members")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockMembers) });
    }
    // Invites
    if (url.includes("/invites")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
    // Task statuses
    if (url.includes("/task-statuses")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
    // Apps
    if (url.includes("/apps")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    }
    // Billing
    if (url.includes("/billing")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: { tier: "pro" }, status: "active" }) });
    }
    // Teams
    if (url.includes("/teams")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    }
    // Default workspace
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "ws-1", name: "Test Workspace", slug: "test-ws", type: "engineering" }) });
  });

  await page.route(`${API_BASE}/repositories/installation/status`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockInstallationStatus) });
  });

  await page.route(`${API_BASE}/repositories`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockEnabledRepos) });
  });

  await page.route(`${API_BASE}/repositories/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });
}

// ---------------------------------------------------------------------------
// Tests: Compare Page
// ---------------------------------------------------------------------------

test.describe("Insights -- Compare Page", () => {
  test("renders the compare page", async ({ page }) => {
    await setupInsightsSubpageMocks(page);
    const response = await page.goto("/insights/compare");
    expect(response?.status()).toBeLessThan(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: Allocations Page
// ---------------------------------------------------------------------------

test.describe("Insights -- Allocations Page", () => {
  test("renders the allocations page", async ({ page }) => {
    await setupInsightsSubpageMocks(page);
    await page.goto("/insights/allocations");
    await page.waitForTimeout(5000);

    await expect(page.locator("body")).toBeVisible();
    // Verify no unhandled runtime error
    const hasError = await page.getByText("Unhandled Runtime Error").isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Alerts Page
// ---------------------------------------------------------------------------

test.describe("Insights -- Alerts Page", () => {
  test("renders the alerts page", async ({ page }) => {
    await setupInsightsSubpageMocks(page);
    await page.goto("/insights/alerts");
    await page.waitForTimeout(5000);

    await expect(page.locator("body")).toBeVisible();
    const hasError = await page.getByText("Unhandled Runtime Error").isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Executive Page
// ---------------------------------------------------------------------------

test.describe("Insights -- Executive Page", () => {
  test("renders the executive dashboard page", async ({ page }) => {
    await setupInsightsSubpageMocks(page);
    const response = await page.goto("/insights/executive");
    expect(response?.status()).toBeLessThan(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: Sprint Capacity Page
// ---------------------------------------------------------------------------

test.describe("Insights -- Sprint Capacity Page", () => {
  test("renders the sprint capacity page", async ({ page }) => {
    await setupInsightsSubpageMocks(page);
    const response = await page.goto("/insights/sprint-capacity");
    expect(response?.status()).toBeLessThan(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: Sync Status Page
// ---------------------------------------------------------------------------

test.describe("Insights -- Sync Status Page", () => {
  test("renders the sync status page", async ({ page }) => {
    await setupInsightsSubpageMocks(page);
    await page.goto("/insights/sync-status");
    await page.waitForTimeout(5000);

    await expect(page.locator("body")).toBeVisible();
    const hasError = await page.getByText("Unhandled Runtime Error").isVisible().catch(() => false);
    expect(hasError).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Developer Detail Page
// ---------------------------------------------------------------------------

test.describe("Insights -- Developer Detail Page", () => {
  test("renders the developer detail page", async ({ page }) => {
    await setupInsightsSubpageMocks(page);
    const response = await page.goto("/insights/developers/test-user-123");
    expect(response?.status()).toBeLessThan(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: Repository Detail Page
// ---------------------------------------------------------------------------

test.describe("Insights -- Repository Detail Page", () => {
  test("renders the repository detail page", async ({ page }) => {
    await setupInsightsSubpageMocks(page);
    const response = await page.goto("/insights/repositories/frontend");
    expect(response?.status()).toBeLessThan(400);
  });
});
