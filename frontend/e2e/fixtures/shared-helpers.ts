/**
 * Shared E2E test helpers for all spec files.
 * Provides common mock data, workspace setup, and route interceptors.
 */
import { Page } from "@playwright/test";

/**
 * Navigate to a page using domcontentloaded wait strategy.
 * Next.js dev server streaming/HMR prevents the default "load" event
 * from firing, so we use "domcontentloaded" instead.
 */
export async function navigateTo(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

export const API_BASE = "http://localhost:8000/api/v1";

export const mockUser = {
  id: "test-user-123",
  name: "Test Developer",
  email: "test@example.com",
  avatar_url: "",
  github_connection: {
    github_username: "testdev",
    github_id: 12345,
  },
  onboarding_completed: true,
  skill_fingerprint: {
    languages: [
      { name: "TypeScript", proficiency_score: 92, commits_count: 450, trend: "growing" },
      { name: "Python", proficiency_score: 78, commits_count: 280, trend: "stable" },
    ],
    frameworks: [
      { name: "React", proficiency_score: 90, category: "frontend", usage_count: 300 },
      { name: "Next.js", proficiency_score: 85, category: "frontend", usage_count: 200 },
    ],
    domains: [
      { name: "web_development", confidence_score: 95 },
    ],
  },
  work_patterns: {
    preferred_complexity: "high",
    peak_productivity_hours: [10, 11, 14],
    average_review_turnaround_hours: 4.5,
    average_pr_size: 120,
    collaboration_style: "collaborative",
  },
  growth_trajectory: null,
};

export const mockWorkspace = {
  id: "ws-1",
  name: "Test Workspace",
  slug: "test-ws",
  type: "engineering",
  avatar_url: null,
  owner_id: "test-user-123",
  member_count: 10,
  team_count: 2,
  is_active: true,
};

export const mockSubscription = {
  plan: {
    tier: "pro",
    max_repos: 100,
    max_commits_per_repo: 100000,
    max_prs_per_repo: 10000,
    llm_requests_per_day: 1000,
    enable_team_features: true,
    enable_advanced_analytics: true,
    enable_exports: true,
    enable_webhooks: true,
    enable_real_time_sync: true,
  },
  status: "active",
};

export const mockMembers = [
  { developer_id: "test-user-123", name: "Test Developer", email: "test@example.com", role: "admin", avatar_url: null, status: "active" },
  { developer_id: "dev-2", name: "Alice Johnson", email: "alice@example.com", role: "member", avatar_url: null, status: "active" },
  { developer_id: "dev-3", name: "Bob Smith", email: "bob@example.com", role: "member", avatar_url: null, status: "active" },
];

export const mockTeams = [
  { id: "team-1", name: "Engineering", workspace_id: "ws-1", member_count: 5 },
  { id: "team-2", name: "Design", workspace_id: "ws-1", member_count: 3 },
];

/**
 * Setup common auth and workspace mocks for any page.
 * Call this before navigating to any authenticated page.
 */
export async function setupCommonMocks(page: Page) {
  // Set auth token and workspace before navigating
  await page.addInitScript(() => {
    localStorage.setItem("token", "fake-test-token");
    localStorage.setItem("current_workspace_id", "ws-1");
  });

  // Catch-all FIRST (checked LAST by Playwright's reverse-order matching)
  await page.route(`${API_BASE}/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  // Workspace list: GET /workspaces (returns array)
  await page.route(`${API_BASE}/workspaces`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([mockWorkspace]),
    });
  });

  // Workspace sub-routes (leave, calendar, members, billing, etc.)
  await page.route(`${API_BASE}/workspaces/**`, (route) => {
    const url = route.request().url();

    // Agents (workspace-scoped)
    if (url.includes("/agents")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
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
        body: JSON.stringify(mockMembers),
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
        body: JSON.stringify(mockSubscription),
      });
    }

    // Teams
    if (url.includes("/teams")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockTeams),
      });
    }

    // Projects
    if (url.includes("/projects")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ projects: [] }),
      });
    }

    // Repositories
    if (url.includes("/repositories")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Reminders
    if (url.includes("/reminders")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Standups / Tracking
    if (url.includes("/standups")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ standups: [], total: 0 }),
      });
    }

    // Monitors / Uptime
    if (url.includes("/monitors")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ monitors: [], total: 0 }),
      });
    }

    // Incidents
    if (url.includes("/incidents")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ incidents: [], total: 0 }),
      });
    }

    // Epics
    if (url.includes("/epics")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Sprints
    if (url.includes("/sprints")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Tickets
    if (url.includes("/tickets")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ tickets: [], total: 0 }),
      });
    }

    // Contacts / CRM
    if (url.includes("/contacts")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ contacts: [], total: 0 }),
      });
    }

    // Deals
    if (url.includes("/deals")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ deals: [], total: 0 }),
      });
    }

    // Campaigns
    if (url.includes("/campaigns")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ campaigns: [], total: 0 }),
      });
    }

    // Email lists
    if (url.includes("/email-lists")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Forms
    if (url.includes("/forms")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Automations
    if (url.includes("/automations")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Default: single workspace object
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockWorkspace),
    });
  });

  // Auth - developers/me
  await page.route(`${API_BASE}/developers/me`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockUser),
    });
  });

  // Dashboard preferences
  await page.route(`${API_BASE}/dashboard/preferences`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ preset_type: "developer", visible_widgets: [], widget_order: [], widget_sizes: {} }),
    });
  });

  // Subscription status
  await page.route(`${API_BASE}/billing/subscription/status**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockSubscription),
    });
  });

  // Agents (shared)
  await page.route(`${API_BASE}/agents**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Repositories (non-workspace scoped)
  await page.route(`${API_BASE}/repositories/**`, (route) => {
    const url = route.request().url();
    if (url.includes("/onboarding/status")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ completed: true, current_step: "complete" }),
      });
    }
    if (url.includes("/installation-status")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ has_installation: true, install_url: "" }),
      });
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Insights API (non-workspace scoped)
  await page.route(`${API_BASE}/insights/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ insights: [], distribution: null, summary: null }),
    });
  });

  // Analytics endpoints (POST)
  await page.route(`${API_BASE}/analytics/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  // Predictions API
  await page.route(`${API_BASE}/predictions/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  // Templates (non-workspace scoped, used by docs and other modules)
  await page.route(`${API_BASE}/templates**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Developers list (non-me endpoint, with optional query params)
  const escapedBase = API_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await page.route(
    new RegExp(`${escapedBase}/developers/(\\?.*)?$`),
    (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
  );
}
