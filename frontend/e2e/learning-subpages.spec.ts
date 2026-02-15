import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockLearningAnalytics = {
  total_learners: 10,
  active_paths: 5,
  completion_rate: 72,
  avg_score: 85,
  top_skills: [
    { name: "TypeScript", learners: 8 },
    { name: "React", learners: 7 },
    { name: "Python", learners: 5 },
  ],
};

const mockComplianceCourses = [
  {
    id: "cc-1",
    name: "Security Awareness",
    description: "Annual security training",
    status: "required",
    due_date: "2026-03-31T00:00:00Z",
    completion_rate: 65,
    total_enrolled: 10,
    completed_count: 6,
  },
  {
    id: "cc-2",
    name: "GDPR Training",
    description: "Data protection regulations",
    status: "required",
    due_date: "2026-06-30T00:00:00Z",
    completion_rate: 30,
    total_enrolled: 10,
    completed_count: 3,
  },
];

const mockIntegrations = [
  { id: "int-1", name: "Udemy", status: "connected", courses_synced: 25 },
  { id: "int-2", name: "Coursera", status: "disconnected", courses_synced: 0 },
];

const mockManagerDashboard = {
  team_progress: [
    { developer_id: "test-user-123", name: "Test Developer", paths_completed: 3, paths_in_progress: 1, avg_score: 88 },
    { developer_id: "dev-2", name: "Alice Johnson", paths_completed: 2, paths_in_progress: 2, avg_score: 82 },
  ],
  pending_approvals: 2,
  budget_used: 1200,
  budget_total: 5000,
};

const mockApprovals = [
  {
    id: "app-1",
    developer_id: "dev-2",
    developer_name: "Alice Johnson",
    course_name: "Advanced React Patterns",
    cost: 49.99,
    status: "pending",
    requested_at: "2026-02-13T10:00:00Z",
  },
  {
    id: "app-2",
    developer_id: "dev-3",
    developer_name: "Bob Smith",
    course_name: "System Design Masterclass",
    cost: 79.99,
    status: "pending",
    requested_at: "2026-02-12T14:00:00Z",
  },
];

const mockPaths = [
  {
    id: "path-1",
    name: "Frontend Mastery",
    description: "Complete frontend development path",
    modules: 8,
    enrolled: 5,
    avg_completion: 65,
  },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupLearningSubpageMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/learning/analytics**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLearningAnalytics) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/learning/compliance**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockComplianceCourses) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/learning/integrations**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockIntegrations) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/learning/manager`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockManagerDashboard) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/learning/manager/approvals**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockApprovals) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/learning/paths**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockPaths) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/learning/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });
}

// ---------------------------------------------------------------------------
// Tests: Learning Analytics
// ---------------------------------------------------------------------------

test.describe("Learning -- Analytics Page", () => {
  test("renders the learning analytics page", async ({ page }) => {
    await setupLearningSubpageMocks(page);
    await page.goto("/learning/analytics");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasAnalytics = await page.getByText(/analytics/i).isVisible().catch(() => false);
    expect(hasAnalytics).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Learning Compliance
// ---------------------------------------------------------------------------

test.describe("Learning -- Compliance Page", () => {
  test("renders the learning compliance page", async ({ page }) => {
    await setupLearningSubpageMocks(page);
    await page.goto("/learning/compliance");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasCompliance = await page.getByText(/compliance/i).isVisible().catch(() => false);
    expect(hasCompliance).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Learning Integrations
// ---------------------------------------------------------------------------

test.describe("Learning -- Integrations Page", () => {
  test("renders the learning integrations page", async ({ page }) => {
    await setupLearningSubpageMocks(page);
    await page.goto("/learning/integrations");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasIntegrations = await page.getByText(/integration/i).isVisible().catch(() => false);
    expect(hasIntegrations).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Manager Dashboard
// ---------------------------------------------------------------------------

test.describe("Learning -- Manager Dashboard Page", () => {
  test("renders the learning manager page", async ({ page }) => {
    await setupLearningSubpageMocks(page);
    await page.goto("/learning/manager");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasManager = await page.getByText(/manager/i).isVisible().catch(() => false);
    expect(hasManager).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Manager Approvals
// ---------------------------------------------------------------------------

test.describe("Learning -- Manager Approvals Page", () => {
  test("renders the learning approvals page", async ({ page }) => {
    await setupLearningSubpageMocks(page);
    await page.goto("/learning/manager/approvals");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasApprovals = await page.getByText(/approval/i).isVisible().catch(() => false);
    expect(hasApprovals).toBeTruthy();
  });
});
