import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE, mockMembers } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockTrackingAnalytics = {
  total_standups: 45,
  participation_rate: 82,
  avg_blockers_per_day: 1.2,
  sentiment_trend: [
    { date: "2026-02-10", avg_sentiment: 0.72 },
    { date: "2026-02-11", avg_sentiment: 0.68 },
    { date: "2026-02-12", avg_sentiment: 0.75 },
  ],
  top_blockers: [
    { category: "Design Review", count: 5 },
    { category: "API Dependencies", count: 3 },
  ],
};

const mockTeamStandups = [
  {
    id: "standup-t1",
    developer_id: "dev-2",
    developer_name: "Alice Johnson",
    developer_avatar: null,
    standup_date: "2026-02-15",
    yesterday_summary: "Finished API integration",
    today_plan: "Starting frontend work",
    blockers_summary: null,
    sentiment_score: 0.8,
  },
  {
    id: "standup-t2",
    developer_id: "dev-3",
    developer_name: "Bob Smith",
    developer_avatar: null,
    standup_date: "2026-02-15",
    yesterday_summary: "Code reviews",
    today_plan: "Bug fixes",
    blockers_summary: "Waiting for QA feedback",
    sentiment_score: 0.6,
  },
];

const mockTeamTracking = {
  team: {
    id: "team-1",
    name: "Engineering",
    member_count: 5,
  },
  members: [
    { developer_id: "test-user-123", name: "Test Developer", has_standup_today: true, blockers_count: 1 },
    { developer_id: "dev-2", name: "Alice Johnson", has_standup_today: true, blockers_count: 0 },
    { developer_id: "dev-3", name: "Bob Smith", has_standup_today: false, blockers_count: 0 },
  ],
};

const mockTimeEntries = [
  {
    id: "time-1",
    developer_id: "test-user-123",
    date: "2026-02-15",
    hours: 6.5,
    description: "Frontend development",
    project_id: "proj-1",
    project_name: "Frontend Redesign",
  },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupTrackingSubpageMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/tracking/analytics**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTrackingAnalytics),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/tracking/standups/team**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTeamStandups),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/tracking/teams/team-1**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTeamTracking),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/tracking/teams/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTeamTracking),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/tracking/time**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockTimeEntries),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/tracking/standups**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/tracking/blockers**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/tracking/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests: Tracking Analytics
// ---------------------------------------------------------------------------

test.describe("Tracking -- Analytics Page", () => {
  test("navigates to the analytics page", async ({ page }) => {
    await setupTrackingSubpageMocks(page);
    const response = await page.goto("/tracking/analytics");
    // Verify the route exists (not a 404 from Next.js)
    expect(response?.status()).toBeLessThan(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: Team Standups
// ---------------------------------------------------------------------------

test.describe("Tracking -- Team Standups Page", () => {
  test("navigates to the team standups page", async ({ page }) => {
    await setupTrackingSubpageMocks(page);
    const response = await page.goto("/tracking/standups/team");
    expect(response?.status()).toBeLessThan(400);
  });
});

// ---------------------------------------------------------------------------
// Tests: Team Detail
// ---------------------------------------------------------------------------

test.describe("Tracking -- Team Detail Page", () => {
  test("navigates to the team tracking detail page", async ({ page }) => {
    await setupTrackingSubpageMocks(page);
    const response = await page.goto("/tracking/team/team-1");
    expect(response?.status()).toBeLessThan(400);
  });
});
