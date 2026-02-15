import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE, mockUser } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockDevelopers = [
  { id: "test-user-123", name: "Test Developer", email: "test@example.com", avatar_url: null },
  { id: "dev-2", name: "Alice Johnson", email: "alice@example.com", avatar_url: null },
];

const mockSkillHeatmap = {
  skills: ["TypeScript", "Python", "Go"],
  developer_skills: [
    {
      developer_id: "test-user-123",
      developer_name: "Test Developer",
      skills: [
        { skill: "TypeScript", value: 92 },
        { skill: "Python", value: 78 },
        { skill: "Go", value: 0 },
      ],
    },
    {
      developer_id: "dev-2",
      developer_name: "Alice Johnson",
      skills: [
        { skill: "TypeScript", value: 85 },
        { skill: "Python", value: 0 },
        { skill: "Go", value: 60 },
      ],
    },
  ],
};

const mockProductivity = {
  periods: ["2026-02-08", "2026-02-09", "2026-02-10"],
  developer_trends: [
    {
      developer_id: "test-user-123",
      commits: [12, 18, 15],
      prs_merged: [3, 5, 4],
      reviews: [5, 8, 6],
    },
    {
      developer_id: "dev-2",
      commits: [8, 10, 12],
      prs_merged: [2, 3, 2],
      reviews: [3, 4, 5],
    },
  ],
  overall_trend: "increasing",
};

const mockWorkload = {
  workloads: [
    { developer_id: "test-user-123", developer_name: "Test Developer", workload: 55, percentage: 55 },
    { developer_id: "dev-2", developer_name: "Alice Johnson", workload: 45, percentage: 45 },
  ],
  total_workload: 100,
  average_workload: 50,
  imbalance_score: 0.1,
};

const mockCollaboration = {
  nodes: [
    { id: "test-user-123", name: "Test Developer", activity_level: 0.8 },
    { id: "dev-2", name: "Alice Johnson", activity_level: 0.6 },
  ],
  edges: [
    { source: "test-user-123", target: "dev-2", weight: 12, interaction_type: "review" },
  ],
  density: 0.75,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupAnalyticsMocks(page: Page) {
  await setupCommonMocks(page);

  // developerApi.list() calls GET /developers/ (with trailing slash and optional query params)
  // Use regex to match /developers/ with optional query params but NOT /developers/me
  await page.route(
    new RegExp(`${API_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/developers/(\\?.*)?$`),
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockDevelopers),
      });
    }
  );

  // All analytics endpoints are POST requests
  await page.route(`${API_BASE}/analytics/heatmap/skills`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockSkillHeatmap),
    });
  });

  await page.route(`${API_BASE}/analytics/productivity`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockProductivity),
    });
  });

  await page.route(`${API_BASE}/analytics/workload`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockWorkload),
    });
  });

  await page.route(`${API_BASE}/analytics/collaboration`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockCollaboration),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Analytics Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupAnalyticsMocks(page);
    await page.goto("/analytics");
    await page.waitForSelector("text=Team Analytics", { timeout: 45000 });
  });

  test("renders the page heading and description", async ({ page }) => {
    await expect(page.getByText("Team Analytics")).toBeVisible();
    await expect(page.getByText("Visualize team skills, productivity, and collaboration patterns")).toBeVisible();
  });

  test("shows developer count", async ({ page }) => {
    // The page renders: "Analyzing 2 developers" in a single element
    await expect(page.getByText(/Analyzing\s+2\s+developers/)).toBeVisible();
  });

  test("shows Refresh and Export buttons", async ({ page }) => {
    await expect(page.getByText("Refresh")).toBeVisible();
    await expect(page.getByText("Export")).toBeVisible();
  });

  test("shows analytics chart sections", async ({ page }) => {
    await expect(page.getByText("Team Skill Distribution")).toBeVisible();
    await expect(page.getByText("Productivity Trends")).toBeVisible();
    await expect(page.getByText("Workload Distribution")).toBeVisible();
    await expect(page.getByText("Collaboration Network")).toBeVisible();
  });

  test("has navigation links in header", async ({ page }) => {
    await expect(page.locator("a[href='/dashboard']").first()).toBeVisible();
    await expect(page.locator("a[href='/analytics']").first()).toBeVisible();
    await expect(page.locator("a[href='/insights']").first()).toBeVisible();
  });

  test("shows user name in header", async ({ page }) => {
    await expect(page.getByText("Test Developer").first()).toBeVisible();
  });
});

test.describe("Analytics Page -- Empty State", () => {
  test("shows loading state with no developers", async ({ page }) => {
    await setupCommonMocks(page);

    await page.route(
      new RegExp(`${API_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/developers/(\\?.*)?$`),
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      }
    );

    await page.goto("/analytics");
    await page.waitForSelector("text=Team Analytics", { timeout: 45000 });

    await expect(page.getByText(/Analyzing\s+0\s+developers/)).toBeVisible();
  });
});
