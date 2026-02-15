import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE, mockUser } from "./fixtures/shared-helpers";

const mockPaths = [
  {
    id: "path-1",
    target_role_name: "Senior Engineer",
    status: "active",
    progress_percentage: 45,
    trajectory_status: "on_track",
    skill_gaps: { Rust: 0.3, Kubernetes: 0.5 },
    estimated_success_probability: 0.8,
    phases: [{ id: "p1", name: "Phase 1" }],
    risk_factors: ["Limited time for deep learning"],
  },
];

const mockRoles = [
  { id: "role-1", name: "Senior Engineer", level: 3 },
  { id: "role-2", name: "Staff Engineer", level: 4 },
];

const mockMilestones = [
  {
    id: "ms-1",
    skill_name: "Rust",
    status: "in_progress",
    current_score: 40,
    target_score: 80,
  },
  {
    id: "ms-2",
    skill_name: "Kubernetes",
    status: "not_started",
    current_score: 10,
    target_score: 70,
  },
];

const mockActivities = [
  {
    type: "course",
    description: "Complete Rust Programming Course",
    source: "recommended",
    estimated_hours: 20,
    url: "https://example.com/rust-course",
  },
];

const mockGamificationProfile = {
  level: 5,
  total_points: 1250,
  activities_completed: 15,
  total_learning_minutes: 720,
  earned_badges: [],
};

const mockStreak = {
  current_streak: 7,
  longest_streak: 14,
  is_active_today: true,
  streak_at_risk: false,
};

const mockLevelProgress = {
  current_level_name: "Learner",
  progress_percentage: 65,
  points_in_level: 250,
  points_for_next_level: 150,
};

async function setupLearningMocks(page: Page) {
  await setupCommonMocks(page);

  // Learning paths
  await page.route(`${API_BASE}/learning/paths**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockPaths),
    });
  });

  // Career roles
  await page.route(`${API_BASE}/career/roles**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockRoles),
    });
  });

  // Milestones
  await page.route(`${API_BASE}/learning/paths/path-1/milestones**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockMilestones),
    });
  });

  // Activities
  await page.route(`${API_BASE}/learning/paths/path-1/activities**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockActivities),
    });
  });

  // Gamification profile
  await page.route(`${API_BASE}/gamification/profile**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockGamificationProfile),
    });
  });

  // Streak
  await page.route(`${API_BASE}/gamification/streak**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockStreak),
    });
  });

  // Level progress
  await page.route(`${API_BASE}/gamification/level-progress**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockLevelProgress),
    });
  });

  // Badges
  await page.route(`${API_BASE}/gamification/badges**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Learning activities tracking
  await page.route(`${API_BASE}/learning-activities**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Activity stats
  await page.route(`${API_BASE}/learning-activities/stats**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ total_activities: 0, total_minutes: 0 }),
    });
  });

  // Daily summaries
  await page.route(`${API_BASE}/learning-activities/daily-summaries**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
}

test.describe("Learning Page — My Learning Path", () => {
  test.beforeEach(async ({ page }) => {
    await setupLearningMocks(page);
    await page.goto("/learning");
    await page.waitForSelector("text=My Learning Path", { timeout: 45000 });
  });

  test("renders the learning page with heading", async ({ page }) => {
    await expect(page.getByText("My Learning Path")).toBeVisible();
    await expect(page.getByText("Track your growth and skill development")).toBeVisible();
  });

  test("shows Create New Path button", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Create New Path" })).toBeVisible();
  });

  test("shows Your Paths section with path list", async ({ page }) => {
    await expect(page.getByText("Your Paths")).toBeVisible();
    await expect(page.getByText("Senior Engineer")).toBeVisible();
  });

  test("shows selected path details with progress", async ({ page }) => {
    await expect(page.getByText("45%")).toBeVisible();
    await expect(page.getByText("Success Probability")).toBeVisible();
    await expect(page.getByText("Skills to Develop")).toBeVisible();
  });

  test("shows milestones section", async ({ page }) => {
    await expect(page.getByText("Milestones")).toBeVisible();
    await expect(page.getByText("Rust")).toBeVisible();
    await expect(page.getByText("Kubernetes")).toBeVisible();
  });

  test("shows My Learning toggle", async ({ page }) => {
    await expect(page.getByRole("button", { name: "My Learning" })).toBeVisible();
  });
});
