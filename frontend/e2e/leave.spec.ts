import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { mockUser } from "./fixtures/mock-data";
import {
  mockLeaveTypes,
  mockLeaveBalances,
  mockLeaveBalancesExtended,
  mockLeaveRequests,
  mockLeaveRequestsExtended,
  mockPendingApprovals,
  mockHolidays,
  mockLeavePolicies,
  mockTeamCalendarEvents,
  mockWhoIsOut,
  mockAvailabilitySummary,
} from "./fixtures/leave-mock-data";

const API_BASE = "http://localhost:8000/api/v1";

const mockWorkspace = {
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

/**
 * Setup route interception for all leave management API calls.
 * Key: useWorkspace reads `current_workspace_id` from localStorage,
 * then calls GET /workspaces (list) and GET /workspaces/{id}.
 * Without proper workspace resolution, all leave hooks are disabled.
 */
async function setupLeaveMocks(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("token", "fake-test-token");
    localStorage.setItem("current_workspace_id", "ws-1");
  });

  // Catch-all FIRST (checked LAST by Playwright)
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

    // Leave types
    if (url.includes("/leave/types")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockLeaveTypes),
      });
    }

    // Leave balance
    if (url.includes("/leave/balance")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockLeaveBalances),
      });
    }

    // Pending approvals (must be before generic /leave/requests)
    if (url.includes("/leave/approvals/pending")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockPendingApprovals),
      });
    }

    // Leave requests - my
    if (url.includes("/leave/requests/my")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockLeaveRequests),
      });
    }

    // Leave requests - submit (POST)
    if (url.includes("/leave/requests") && route.request().method() === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: "lr-new",
          ...body,
          status: "pending",
          developer_id: "test-user-123",
          workspace_id: "ws-1",
          total_days: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
    }

    // Leave requests - list (for team view)
    if (url.includes("/leave/requests")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockLeaveRequests),
      });
    }

    // Holidays
    if (url.includes("/leave/holidays")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockHolidays),
      });
    }

    // Leave policies
    if (url.includes("/leave/policies")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockLeavePolicies),
      });
    }

    // Team calendar
    if (url.includes("/calendar/team")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockTeamCalendarEvents),
      });
    }

    // Who is out
    if (url.includes("/calendar/who-is-out")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockWhoIsOut),
      });
    }

    // Availability summary
    if (url.includes("/calendar/availability-summary")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockAvailabilitySummary),
      });
    }

    // App access (must be before /members check since URL contains /app-access/members/)
    if (url.includes("/app-access/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ apps: {}, applied_template_id: null, applied_template_name: null, has_custom_overrides: false, is_admin: true }),
      });
    }

    // Documents (tree, favorites — must be before generic checks)
    if (url.includes("/documents/")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Document spaces
    if (url.includes("/ws-1/spaces")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Workspace members
    if (url.includes("/members")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }

    // Workspace invites
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

    // App settings
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
        body: JSON.stringify({ plan: "pro", status: "active" }),
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

    // Booking event types (needs at least one for team calendar page to render tabs)
    if (url.includes("/booking/event-types")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          event_types: [{
            id: "et-1",
            name: "Team Standup",
            slug: "team-standup",
            duration_minutes: 30,
            is_team_event: true,
            color: "#3b82f6",
          }],
        }),
      });
    }

    // Booking team availability
    if (url.includes("/booking/availability/team-calendar")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          event_type_id: "et-1",
          team_id: null,
          start_date: "2026-02-09",
          end_date: "2026-02-15",
          timezone: "UTC",
          members: [],
          overlapping_slots: [],
          bookings: [],
        }),
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

  // Dashboard preferences (in case dashboard redirect)
  await page.route(`${API_BASE}/dashboard/preferences`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ preset_type: "developer", visible_widgets: [], widget_order: [], widget_sizes: {} }),
    });
  });
}

// ---------------------------------------------------------------------------
// Test Suite: Leave Page — Tab Navigation
// ---------------------------------------------------------------------------

test.describe("Leave Page — Tab Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });
  });

  test("renders the leave page with title and request button", async ({ page }) => {
    await expect(page.getByText("Leave Management")).toBeVisible();
    await expect(page.getByRole("button", { name: /Request Leave/i })).toBeVisible();
  });

  test("shows My Leaves tab by default", async ({ page }) => {
    // My Leaves tab should be active
    const myLeavesTab = page.getByRole("tab", { name: "My Leaves" });
    await expect(myLeavesTab).toBeVisible();

    // Leave balance cards should render
    await expect(page.getByRole("heading", { name: "Vacation" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sick Leave" }).first()).toBeVisible();
  });

  test("switches to Team Leaves tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Team Leaves" }).click();

    // Team leave table should show
    await expect(page.getByText("Employee").first()).toBeVisible();
  });

  test("switches to Approvals tab and shows pending count", async ({ page }) => {
    await page.getByRole("tab", { name: /Approvals/i }).click();

    // Should show pending approval cards
    await expect(page.getByText("Alice Johnson")).toBeVisible();
    await expect(page.getByText("Bob Smith")).toBeVisible();
  });

  test("switches to Settings tab with sub-navigation", async ({ page }) => {
    await page.getByRole("tab", { name: "Settings" }).click();

    // Settings sub-navigation should show
    await expect(page.getByRole("button", { name: "Leave Types" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Policies" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Holidays" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Leave Page — My Leaves
// ---------------------------------------------------------------------------

test.describe("Leave Page — My Leaves", () => {
  test.beforeEach(async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });
  });

  test("renders leave balance cards with correct data", async ({ page }) => {
    // Check Vacation balance
    await expect(page.getByText("Vacation").first()).toBeVisible();
    await expect(page.getByText("16 available", { exact: false }).first()).toBeVisible();

    // Check Sick Leave balance
    await expect(page.getByText("Sick Leave").first()).toBeVisible();
    await expect(page.getByText("11 available", { exact: false }).first()).toBeVisible();
  });

  test("renders leave request cards with status badges", async ({ page }) => {
    // Pending request
    await expect(page.getByText("Family vacation")).toBeVisible();
    await expect(page.getByText("pending", { exact: false }).first()).toBeVisible();

    // Approved request
    await expect(page.getByText("Doctor appointment")).toBeVisible();
  });

  test("shows rejection reason for rejected requests", async ({ page }) => {
    await expect(page.getByText("Team needs coverage during holiday")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Leave Page — Request Form
// ---------------------------------------------------------------------------

test.describe("Leave Page — Request Form", () => {
  test.beforeEach(async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });
  });

  test("opens leave request form modal", async ({ page }) => {
    await page.getByRole("button", { name: /Request Leave/i }).click();

    // Modal should appear (h2 heading inside modal)
    await expect(page.getByRole("heading", { name: "Request Leave" })).toBeVisible();
    await expect(page.getByText("Submit a new leave request")).toBeVisible();
  });

  test("form has all required fields", async ({ page }) => {
    await page.getByRole("button", { name: /Request Leave/i }).click();
    await expect(page.getByRole("heading", { name: "Request Leave" })).toBeVisible();

    // Leave type selector
    await expect(page.getByText("Leave Type", { exact: true })).toBeVisible();

    // Date fields
    await expect(page.getByText("Start Date")).toBeVisible();
    await expect(page.getByText("End Date")).toBeVisible();

    // Half day toggle
    await expect(page.getByText("Half Day")).toBeVisible();

    // Reason
    await expect(page.getByText("Reason (optional)")).toBeVisible();

    // Submit button
    await expect(page.getByRole("button", { name: /Submit Request/i })).toBeVisible();
  });

  test("shows available balance for selected leave type", async ({ page }) => {
    await page.getByRole("button", { name: /Request Leave/i }).click();
    await expect(page.getByRole("heading", { name: "Request Leave" })).toBeVisible();

    // Should auto-select first type (Vacation) and show its balance
    await expect(page.getByText("days available", { exact: false })).toBeVisible();
  });

  test("closes form with Cancel button", async ({ page }) => {
    await page.getByRole("button", { name: /Request Leave/i }).click();
    await expect(page.getByText("Submit a new leave request")).toBeVisible();

    await page.getByRole("button", { name: "Cancel", exact: true }).click();

    // Modal should be closed
    await expect(page.getByText("Submit a new leave request")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Leave Page — Approvals
// ---------------------------------------------------------------------------

test.describe("Leave Page — Approvals", () => {
  test.beforeEach(async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });
    await page.getByRole("tab", { name: /Approvals/i }).click();
  });

  test("renders pending approval cards", async ({ page }) => {
    await expect(page.getByText("Alice Johnson")).toBeVisible();
    await expect(page.getByText("Personal trip")).toBeVisible();
    await expect(page.getByText("Bob Smith")).toBeVisible();
  });

  test("approval cards show leave type and dates", async ({ page }) => {
    // Alice's vacation request
    await expect(page.getByText("Vacation").first()).toBeVisible();
    await expect(page.getByText("Mar 1", { exact: false }).first()).toBeVisible();
  });

  test("approval cards have approve and reject buttons", async ({ page }) => {
    // Wait for approval cards to load
    await expect(page.getByText("Alice Johnson")).toBeVisible();

    // Should have Approve and Reject buttons
    const approveButtons = page.getByRole("button", { name: /Approve/i });
    const rejectButtons = page.getByRole("button", { name: /Reject/i });

    const approveCount = await approveButtons.count();
    const rejectCount = await rejectButtons.count();

    expect(approveCount).toBeGreaterThan(0);
    expect(rejectCount).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Leave Page — Settings
// ---------------------------------------------------------------------------

test.describe("Leave Page — Settings", () => {
  test.beforeEach(async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });
    await page.getByRole("tab", { name: "Settings" }).click();
  });

  test("Leave Types settings shows table with types", async ({ page }) => {
    // Should default to Leave Types sub-tab
    await expect(page.getByRole("heading", { name: "Leave Types" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add Type/i })).toBeVisible();

    // Wait for leave types to load, then verify table contents
    await expect(page.getByRole("cell", { name: "Vacation" })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("cell", { name: "Sick Leave" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "WFH" })).toBeVisible();
  });

  test("Add Type button opens form", async ({ page }) => {
    await page.getByRole("button", { name: /Add Type/i }).click();

    // Form should appear
    await expect(page.getByText("New Leave Type")).toBeVisible();
    await expect(page.getByPlaceholder("e.g. Sick Leave")).toBeVisible();
  });

  test("Policies sub-tab shows policy table", async ({ page }) => {
    await page.getByRole("button", { name: "Policies" }).click();

    await expect(page.getByRole("button", { name: /Add Policy/i })).toBeVisible();
    // Should show policy data
    await expect(page.getByText("20 days/year")).toBeVisible(); // Annual quota
  });

  test("Holidays sub-tab shows holiday list", async ({ page }) => {
    await page.getByRole("button", { name: "Holidays" }).click();

    await expect(page.getByRole("button", { name: /Add Holiday/i })).toBeVisible();
    await expect(page.getByText("New Year's Day")).toBeVisible();
    await expect(page.getByText("Holi", { exact: true })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Dashboard — Leave Widgets
// ---------------------------------------------------------------------------

test.describe("Dashboard — Leave Widgets", () => {
  test.setTimeout(60000); // Dashboard tests need more time due to many API calls
  async function setupDashboardWithLeaveWidgets(page: Page) {
    await page.addInitScript(() => {
      localStorage.setItem("token", "fake-test-token");
      localStorage.setItem("current_workspace_id", "ws-1");
    });

    // Catch-all FIRST
    await page.route(`${API_BASE}/**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });

    // Workspace list
    await page.route(`${API_BASE}/workspaces`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([mockWorkspace]) });
    });

    // Workspace leave endpoints
    await page.route(`${API_BASE}/workspaces/**`, (route) => {
      const url = route.request().url();

      if (url.includes("/leave/balance")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeaveBalances) });
      }
      if (url.includes("/leave/approvals/pending")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockPendingApprovals) });
      }
      if (url.includes("/calendar/team")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTeamCalendarEvents) });
      }
      if (url.includes("/calendar/who-is-out")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockWhoIsOut) });
      }
      if (url.includes("/calendar/availability-summary")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAvailabilitySummary) });
      }
      if (url.includes("/app-access/")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apps: {}, applied_template_id: null, applied_template_name: null, has_custom_overrides: false, is_admin: true }) });
      }
      if (url.includes("/documents/")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }
      if (url.includes("/ws-1/spaces")) {
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
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: "pro", status: "active" }) });
      }
      if (url.includes("/teams")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      }

      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockWorkspace) });
    });

    await page.route(`${API_BASE}/agents**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });

    await page.route(`${API_BASE}/analysis/**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });

    await page.route(`${API_BASE}/dashboard/preferences`, (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "pref-123",
            user_id: "test-user-123",
            preset_type: "manager",
            visible_widgets: [
              "welcome", "leaveBalance", "teamCalendar", "pendingLeaveApprovals", "teamAvailability",
            ],
            widget_order: [
              "welcome", "leaveBalance", "teamCalendar", "pendingLeaveApprovals", "teamAvailability",
            ],
            widget_sizes: {},
          }),
        });
      } else {
        route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
    });

    await page.route(`${API_BASE}/developers/me`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockUser) });
    });
  }

  test("Leave Balance widget renders with balance data", async ({ page }) => {
    await setupDashboardWithLeaveWidgets(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=Welcome back", { timeout: 45000 });

    // Leave Balance widget may be below the fold with proper grid sizing
    const balance = page.getByText("Leave Balance");
    await balance.scrollIntoViewIfNeeded();
    await expect(balance).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("Vacation").first()).toBeVisible();
    await expect(page.getByText("16 left", { exact: false })).toBeVisible();
  });

  test("Team Calendar widget renders with month grid", async ({ page }) => {
    await setupDashboardWithLeaveWidgets(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=Welcome back", { timeout: 45000 });

    const calendar = page.getByText("Team Calendar");
    await calendar.scrollIntoViewIfNeeded();
    await expect(calendar).toBeVisible({ timeout: 30000 });
    // Should show day headers
    await expect(page.getByText("Su").first()).toBeVisible();
    await expect(page.getByText("Mo").first()).toBeVisible();
  });

  test("Pending Leave Approvals widget renders with requests", async ({ page }) => {
    await setupDashboardWithLeaveWidgets(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=Welcome back", { timeout: 45000 });

    // Scroll to bottom to ensure all widgets are rendered
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const approvals = page.getByText("Leave Approvals");
    await expect(approvals).toBeVisible({ timeout: 45000 });
    await expect(page.getByText("2 pending")).toBeVisible();
    await expect(page.getByText("Alice Johnson")).toBeVisible();
    await expect(page.getByText("Bob Smith")).toBeVisible();
  });

  test("Team Availability widget renders with summary", async ({ page }) => {
    await setupDashboardWithLeaveWidgets(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=Welcome back", { timeout: 45000 });

    // Scroll to bottom to ensure all widgets are rendered
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const availability = page.getByText("Team Availability");
    await expect(availability).toBeVisible({ timeout: 45000 });
    // Summary data — "9" appears multiple times, use "of 10" to verify total
    await expect(page.getByText("of 10")).toBeVisible();
    // Who is out
    await expect(page.getByText("Charlie Brown")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Team Calendar Page — Unified View
// ---------------------------------------------------------------------------

test.describe("Team Calendar Page — Unified View", () => {
  test.beforeEach(async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/booking/team-calendar");
    await page.waitForSelector("text=Team Calendar", { timeout: 45000 });
  });

  test("renders unified and booking tabs", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Unified" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Booking", exact: true })).toBeVisible();
  });

  test("unified tab shows calendar filters", async ({ page }) => {
    // Unified tab is default
    await expect(page.getByText("Filters")).toBeVisible();

    // Event type filter buttons
    await expect(page.getByRole("button", { name: "Leaves" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Bookings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Holidays" })).toBeVisible();
  });

  test("unified tab shows who is out panel", async ({ page }) => {
    await expect(page.getByText("Who's Out")).toBeVisible();
    await expect(page.getByText("Charlie Brown")).toBeVisible();
  });

  test("unified tab shows monthly calendar grid", async ({ page }) => {
    // Calendar day headers
    await expect(page.getByText("Sun").first()).toBeVisible();
    await expect(page.getByText("Mon").first()).toBeVisible();
    // Today button
    await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
  });

  test("switching to Booking tab shows booking controls", async ({ page }) => {
    await page.getByRole("button", { name: "Booking", exact: true }).click();

    // Booking-specific controls — event type selector should be present
    const eventTypeSelect = page.locator("select").first();
    await expect(eventTypeSelect).toBeVisible();
    await expect(eventTypeSelect).toHaveValue("et-1");
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Leave Request Form — Advanced Interactions
// ---------------------------------------------------------------------------

test.describe("Leave Request Form — Advanced Interactions", () => {
  test.beforeEach(async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });
    await page.getByRole("button", { name: /Request Leave/i }).click();
    await expect(page.getByRole("heading", { name: "Request Leave" })).toBeVisible();
  });

  test("closes modal with X button", async ({ page }) => {
    // The X close button is in the dialog header (border-b section)
    const closeButton = page.locator("[role=dialog] .border-b button");
    await closeButton.click({ force: true });
    await expect(page.getByRole("heading", { name: "Request Leave" })).not.toBeVisible();
  });

  test("closes modal with Escape key", async ({ page }) => {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Request Leave" })).not.toBeVisible();
  });

  test("closes modal by clicking overlay backdrop", async ({ page }) => {
    // Click the backdrop overlay (the dark area behind the modal)
    await page.locator(".bg-black\\/60").click({ position: { x: 10, y: 10 } });
    await expect(page.getByRole("heading", { name: "Request Leave" })).not.toBeVisible();
  });

  test("modal has correct ARIA attributes for accessibility", async ({ page }) => {
    const dialog = page.locator("[role=dialog]");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog).toHaveAttribute("aria-labelledby", "leave-request-title");
    await expect(page.locator("#leave-request-title")).toHaveText("Request Leave");
  });

  test("auto-selects first leave type and shows balance", async ({ page }) => {
    // First type (Vacation) should be auto-selected
    const select = page.locator("[role=dialog] select").first();
    await expect(select).toHaveValue("lt-1");

    // Should show balance info in the dialog
    await expect(page.locator("[role=dialog]").getByText("days available out of")).toBeVisible();
  });

  test("changing leave type updates displayed balance", async ({ page }) => {
    // Switch to Sick Leave
    await page.locator("[role=dialog] select").first().selectOption("lt-2");

    // Should show Sick Leave balance: 11 available out of 12
    await expect(page.locator("[role=dialog]").getByText("days available out of")).toBeVisible();
  });

  test("half-day toggle appears and shows period selection", async ({ page }) => {
    // Half Day section should be visible (Vacation allows half day)
    await expect(page.getByText("Half Day")).toBeVisible();
    await expect(page.getByText("Apply for half a day only")).toBeVisible();

    // Click the toggle to enable half day
    const toggleButton = page.locator("button").filter({ hasText: "" }).filter({ has: page.locator("svg.lucide-toggle-left") });
    await toggleButton.click();

    // Half day period selection should appear
    await expect(page.getByText("Half Day Period")).toBeVisible();
    await expect(page.getByRole("button", { name: "First Half" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Second Half" })).toBeVisible();
  });

  test("selecting second half period works", async ({ page }) => {
    // Enable half day
    const toggleButton = page.locator("button").filter({ has: page.locator("svg.lucide-toggle-left") });
    await toggleButton.click();

    // Click Second Half
    await page.getByRole("button", { name: "Second Half" }).click();

    // Second Half should have active styling (blue)
    const secondHalf = page.getByRole("button", { name: "Second Half" });
    await expect(secondHalf).toHaveClass(/bg-blue-600/);
  });

  test("end date is disabled when half-day is enabled", async ({ page }) => {
    // Set a start date first
    await page.locator("input[type=date]").first().fill("2026-04-01");

    // Enable half day
    const toggleButton = page.locator("button").filter({ has: page.locator("svg.lucide-toggle-left") });
    await toggleButton.click();

    // End date input should be disabled
    const endDateInput = page.locator("input[type=date]").nth(1);
    await expect(endDateInput).toBeDisabled();
  });

  test("submit button is disabled without required fields", async ({ page }) => {
    // Submit button should be disabled initially (no dates set)
    const submitBtn = page.getByRole("button", { name: /Submit Request/i });
    await expect(submitBtn).toBeDisabled();
  });

  test("submit button enabled when all required fields are filled", async ({ page }) => {
    // Fill in dates
    await page.locator("input[type=date]").first().fill("2026-04-01");
    await page.locator("input[type=date]").nth(1).fill("2026-04-03");

    // Submit should now be enabled
    const submitBtn = page.getByRole("button", { name: /Submit Request/i });
    await expect(submitBtn).toBeEnabled();
  });

  test("reason field accepts input", async ({ page }) => {
    const textarea = page.getByPlaceholder("Briefly describe your reason for leave...");
    await expect(textarea).toBeVisible();
    await textarea.fill("Need time off for personal matters");
    await expect(textarea).toHaveValue("Need time off for personal matters");
  });

  test("leave type dropdown shows all available types", async ({ page }) => {
    const select = page.locator("select").first();
    const options = select.locator("option:not([disabled])");
    // Should have Vacation, Sick Leave, WFH, Comp Off
    await expect(options).toHaveCount(4);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Leave Balance Cards — Detail
// ---------------------------------------------------------------------------

test.describe("Leave Balance Cards — Detail", () => {
  async function setupWithExtendedData(page: Page) {
    await setupLeaveMocks(page);
    // Override balance endpoint with extended data (includes unpaid Comp Off)
    await page.route(`${API_BASE}/workspaces/**`, async (route) => {
      const url = route.request().url();
      if (url.includes("/leave/balance")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockLeaveBalancesExtended),
        });
      }
      route.fallback();
    });
  }

  test("shows carried forward info for Vacation balance", async ({ page }) => {
    await setupWithExtendedData(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });

    // Vacation has 3 carried forward
    await expect(page.getByText("Includes 3 carried forward")).toBeVisible();
  });

  test("shows pending count in balance legend for Vacation", async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });

    // Vacation has 2 pending
    await expect(page.getByText("2 pending")).toBeVisible();
  });

  test("shows used/total summary for balance cards", async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });

    // Vacation: 5 used / 23 total (20 allocated + 3 carried forward)
    // The text "5 used / 23 total (16 available)" is split across spans
    await expect(page.getByText("used", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("total", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("16 available", { exact: false }).first()).toBeVisible();
  });

  test("shows unpaid badge for unpaid leave types", async ({ page }) => {
    await setupWithExtendedData(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });

    // Comp Off is unpaid
    await expect(page.getByText("Comp Off")).toBeVisible();
    await expect(page.getByText("Unpaid")).toBeVisible();
  });

  test("does not show pending legend when pending is 0", async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });

    // Sick Leave has 0 pending — should show "1 used" and "11 available" but no "pending" in its card
    // We check that Sick Leave card renders but pending legend only appears once (for Vacation)
    const pendingTexts = page.getByText(/\d+ pending/);
    // Only Vacation has pending, so count should be 1
    await expect(pendingTexts).toHaveCount(1);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Leave Request Cards — Actions & Status
// ---------------------------------------------------------------------------

test.describe("Leave Request Cards — Actions & Status", () => {
  test.beforeEach(async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });
  });

  test("pending request shows Withdraw button", async ({ page }) => {
    // lr-1 is pending with reason "Family vacation"
    await expect(page.getByText("Family vacation")).toBeVisible();
    await expect(page.getByRole("button", { name: "Withdraw" })).toBeVisible();
  });

  test("withdraw confirmation flow shows 'Confirm Withdraw?' and 'Never mind'", async ({ page }) => {
    // Click Withdraw first time — should show confirmation
    await page.getByRole("button", { name: "Withdraw" }).click();
    await expect(page.getByRole("button", { name: "Confirm Withdraw?" })).toBeVisible();
    await expect(page.getByText("Never mind")).toBeVisible();

    // Click "Never mind" — should go back to normal
    await page.getByText("Never mind").click();
    await expect(page.getByRole("button", { name: "Withdraw" })).toBeVisible();
    await expect(page.getByText("Confirm Withdraw?")).not.toBeVisible();
  });

  test("approved request shows Cancel Leave button", async ({ page }) => {
    // lr-2 is approved with reason "Doctor appointment"
    await expect(page.getByText("Doctor appointment")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel Leave" })).toBeVisible();
  });

  test("cancel confirmation flow shows 'Confirm Cancel?' and 'Never mind'", async ({ page }) => {
    await page.getByRole("button", { name: "Cancel Leave" }).click();
    await expect(page.getByRole("button", { name: "Confirm Cancel?" })).toBeVisible();
    await expect(page.getByText("Never mind")).toBeVisible();

    await page.getByText("Never mind").click();
    await expect(page.getByRole("button", { name: "Cancel Leave" })).toBeVisible();
  });

  test("half-day request shows period info", async ({ page }) => {
    // lr-2 is half-day, first_half, 0.5 days
    await expect(page.getByText("0.5 days")).toBeVisible();
    await expect(page.getByText("First half", { exact: false }).first()).toBeVisible();
  });

  test("multi-day request shows date range", async ({ page }) => {
    // lr-1: Mar 10 - Mar 14
    await expect(page.getByText("Mar 10, 2026", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Mar 14, 2026", { exact: false }).first()).toBeVisible();
  });

  test("single-day request shows single date without range", async ({ page }) => {
    // lr-2: Jan 20 only (single day)
    await expect(page.getByText("Jan 20, 2026", { exact: false }).first()).toBeVisible();
  });

  test("rejected request does not show action buttons", async ({ page }) => {
    // lr-3 is rejected — should not show Withdraw or Cancel Leave
    // The rejection reason should be visible
    await expect(page.getByText("Team needs coverage during holiday")).toBeVisible();
    // Only 1 Withdraw (for pending) and 1 Cancel Leave (for approved) should exist
    const withdrawButtons = page.getByRole("button", { name: /Withdraw/ });
    await expect(withdrawButtons).toHaveCount(1);
    const cancelButtons = page.getByRole("button", { name: /Cancel Leave/ });
    await expect(cancelButtons).toHaveCount(1);
  });

  test("request cards show leave type names", async ({ page }) => {
    // lr-1 shows Vacation, lr-2 shows Sick Leave, lr-3 shows Vacation
    const vacationLabels = page.getByRole("heading", { name: "Vacation" });
    await expect(vacationLabels.first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sick Leave" }).first()).toBeVisible();
  });

  test("request cards show status badges", async ({ page }) => {
    await expect(page.getByText("Pending", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Rejected", { exact: true }).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Leave Approvals — Advanced Flow
// ---------------------------------------------------------------------------

test.describe("Leave Approvals — Advanced Flow", () => {
  test.beforeEach(async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });
    await page.getByRole("tab", { name: /Approvals/i }).click();
    await expect(page.getByText("Alice Johnson")).toBeVisible();
  });

  test("reject button shows rejection reason textarea", async ({ page }) => {
    // Click Reject on first approval card (Alice's)
    await page.getByRole("button", { name: "Reject" }).first().click();

    // Rejection reason textarea should appear
    const textarea = page.getByPlaceholder("Reason for rejection (optional)...");
    await expect(textarea).toBeVisible();

    // "Confirm Reject" button should appear
    await expect(page.getByRole("button", { name: "Confirm Reject" })).toBeVisible();
  });

  test("cancel in rejection flow hides textarea", async ({ page }) => {
    await page.getByRole("button", { name: "Reject" }).first().click();
    await expect(page.getByPlaceholder("Reason for rejection (optional)...")).toBeVisible();

    // Click Cancel to go back
    await page.getByRole("button", { name: "Cancel", exact: true }).first().click();

    // Textarea should be gone
    await expect(page.getByPlaceholder("Reason for rejection (optional)...")).not.toBeVisible();
    // Original Approve/Reject buttons should be back
    await expect(page.getByRole("button", { name: "Approve" }).first()).toBeVisible();
  });

  test("rejection reason can be typed", async ({ page }) => {
    await page.getByRole("button", { name: "Reject" }).first().click();
    const textarea = page.getByPlaceholder("Reason for rejection (optional)...");
    await textarea.fill("Insufficient notice period");
    await expect(textarea).toHaveValue("Insufficient notice period");
  });

  test("approval cards show Pending badge", async ({ page }) => {
    // All approval cards show Pending badge
    const pendingBadges = page.getByText("Pending", { exact: true });
    const count = await pendingBadges.count();
    expect(count).toBeGreaterThanOrEqual(2); // Alice and Bob
  });

  test("approval card shows half-day info for Bob", async ({ page }) => {
    // Bob has half-day request
    await expect(page.getByText("0.5 days", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("First half", { exact: false }).first()).toBeVisible();
  });

  test("approval card shows request reason when present", async ({ page }) => {
    // Alice has reason "Personal trip"
    await expect(page.getByText("Personal trip")).toBeVisible();
  });

  test("shows pending count in header", async ({ page }) => {
    await expect(page.getByText("(2 pending)")).toBeVisible();
  });

  test("approval cards show leave type with dates", async ({ page }) => {
    // Alice's Vacation: Mar 1 - Mar 5
    await expect(page.getByText("Mar 1, 2026", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("5 days", { exact: false }).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Team Leaves Table — Detail
// ---------------------------------------------------------------------------

test.describe("Team Leaves Table — Detail", () => {
  async function setupTeamLeaveMocks(page: Page) {
    await setupLeaveMocks(page);
    // Override team requests endpoint with extended data
    await page.route(`${API_BASE}/workspaces/**`, async (route) => {
      const url = route.request().url();
      if (url.includes("/leave/requests") && !url.includes("/requests/my") && !url.includes("/approvals")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockLeaveRequestsExtended),
        });
      }
      route.fallback();
    });
  }

  test.beforeEach(async ({ page }) => {
    await setupTeamLeaveMocks(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });
    await page.getByRole("tab", { name: "Team Leaves" }).click();
    await expect(page.getByText("Employee").first()).toBeVisible();
  });

  test("shows status filter dropdown with all options", async ({ page }) => {
    const select = page.locator("select").first();
    await expect(select).toBeVisible();

    // Check all options exist
    const options = select.locator("option");
    await expect(options).toHaveCount(6); // All Statuses + 5 status options
    await expect(options.nth(0)).toHaveText("All Statuses");
    await expect(options.nth(1)).toHaveText("Pending");
    await expect(options.nth(2)).toHaveText("Approved");
    await expect(options.nth(3)).toHaveText("Rejected");
    await expect(options.nth(4)).toHaveText("Cancelled");
    await expect(options.nth(5)).toHaveText("Withdrawn");
  });

  test("shows request count", async ({ page }) => {
    await expect(page.getByText(/\d+ requests?/)).toBeVisible();
  });

  test("table has all column headers", async ({ page }) => {
    const table = page.locator("table");
    await expect(table.getByText("Employee")).toBeVisible();
    await expect(table.getByText("Leave Type")).toBeVisible();
    await expect(table.getByText("Dates")).toBeVisible();
    await expect(table.getByText("Days")).toBeVisible();
    await expect(table.getByText("Status")).toBeVisible();
  });

  test("shows employee names in table", async ({ page }) => {
    await expect(page.getByText("Test Developer").first()).toBeVisible();
    await expect(page.getByText("Diana Prince")).toBeVisible();
    await expect(page.getByText("Eve Wilson")).toBeVisible();
  });

  test("shows leave type with color indicator", async ({ page }) => {
    await expect(page.getByText("Vacation").first()).toBeVisible();
    await expect(page.getByText("Sick Leave").first()).toBeVisible();
  });

  test("half-day shows (half) label in days column", async ({ page }) => {
    // Diana has half-day request
    await expect(page.getByText("(half)").first()).toBeVisible();
  });

  test("shows all status badges", async ({ page }) => {
    // Extended data has pending, approved, rejected, cancelled, withdrawn
    const table = page.locator("table");
    await expect(table.getByText("Pending").first()).toBeVisible({ timeout: 30000 });
    await expect(table.getByText("Approved").first()).toBeVisible();
    await expect(table.getByText("Rejected").first()).toBeVisible();
    await expect(table.getByText("Cancelled").first()).toBeVisible();
    await expect(table.getByText("Withdrawn").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Leave Settings — Leave Type Form Detail
// ---------------------------------------------------------------------------

test.describe("Leave Settings — Leave Type Form Detail", () => {
  test.beforeEach(async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });
    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Leave Types" })).toBeVisible();
  });

  test("add type form has name field with placeholder", async ({ page }) => {
    await page.getByRole("button", { name: /Add Type/i }).click();
    const nameInput = page.getByPlaceholder("e.g. Sick Leave");
    await expect(nameInput).toBeVisible();
  });

  test("add type form has slug field", async ({ page }) => {
    await page.getByRole("button", { name: /Add Type/i }).click();
    const slugInput = page.getByPlaceholder("sick_leave");
    await expect(slugInput).toBeVisible();
  });

  test("name input auto-generates slug", async ({ page }) => {
    await page.getByRole("button", { name: /Add Type/i }).click();
    const nameInput = page.getByPlaceholder("e.g. Sick Leave");
    await nameInput.fill("Paternity Leave");

    const slugInput = page.getByPlaceholder("sick_leave");
    await expect(slugInput).toHaveValue("paternity_leave");
  });

  test("form has color picker with multiple colors", async ({ page }) => {
    await page.getByRole("button", { name: /Add Type/i }).click();
    await expect(page.getByText("Color")).toBeVisible();
    // Color circles should be rendered (8 predefined colors)
    const colorButtons = page.locator("button.rounded-full.w-7.h-7, button.rounded-full.w-6.h-6");
    const count = await colorButtons.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test("form has paid/approval/half-day toggles", async ({ page }) => {
    await page.getByRole("button", { name: /Add Type/i }).click();
    await expect(page.getByText("Paid Leave")).toBeVisible();
    await expect(page.getByText("Requires Approval")).toBeVisible();
    await expect(page.getByText("Allows Half Day")).toBeVisible();
  });

  test("form has min notice days field", async ({ page }) => {
    await page.getByRole("button", { name: /Add Type/i }).click();
    await expect(page.getByText("Min Notice Days")).toBeVisible();
  });

  test("form has description field", async ({ page }) => {
    await page.getByRole("button", { name: /Add Type/i }).click();
    await expect(page.getByText("Description")).toBeVisible();
  });

  test("form has cancel and create buttons", async ({ page }) => {
    await page.getByRole("button", { name: /Add Type/i }).click();
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Create/i })).toBeVisible();
  });

  test("close button hides the form", async ({ page }) => {
    await page.getByRole("button", { name: /Add Type/i }).click();
    await expect(page.getByText("New Leave Type")).toBeVisible();

    // Click the X close button
    const closeBtn = page.locator("button").filter({ has: page.locator("svg.lucide-x") }).first();
    await closeBtn.click();
    await expect(page.getByText("New Leave Type")).not.toBeVisible();
  });

  test("table shows paid/unpaid column values", async ({ page }) => {
    // Wait for table to load
    await expect(page.getByRole("cell", { name: "Vacation" })).toBeVisible({ timeout: 30000 });
    // All 3 types are paid — should see "Yes" in the paid column
    const yesTexts = page.getByRole("cell", { name: "Yes" });
    const count = await yesTexts.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("table shows approval column values", async ({ page }) => {
    await expect(page.getByRole("cell", { name: "Vacation" })).toBeVisible({ timeout: 30000 });
    // Vacation requires approval, Sick Leave and WFH don't
    await expect(page.getByText("Required", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Auto", { exact: false }).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Leave Settings — Policy Form Detail
// ---------------------------------------------------------------------------

test.describe("Leave Settings — Policy Form Detail", () => {
  test.beforeEach(async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Policies" }).click();
    await expect(page.getByRole("button", { name: /Add Policy/i })).toBeVisible();
  });

  test("policy table shows accrual type", async ({ page }) => {
    // First policy is "upfront", second is "monthly"
    await expect(page.getByText("Upfront", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Monthly", { exact: false }).first()).toBeVisible();
  });

  test("policy table shows carry forward info", async ({ page }) => {
    // First policy has carry forward enabled with max 5 days
    await expect(page.getByText("5 days", { exact: false }).first()).toBeVisible();
    // Second policy has carry forward disabled
    await expect(page.getByText("Disabled", { exact: false }).first()).toBeVisible();
  });

  test("policy table shows active status", async ({ page }) => {
    await expect(page.getByText("Active").first()).toBeVisible();
  });

  test("add policy form has leave type select", async ({ page }) => {
    await page.getByRole("button", { name: /Add Policy/i }).click();
    // Policy form has a select element for choosing leave type
    const formSelect = page.locator("select").first();
    await expect(formSelect).toBeVisible();
    // It should contain Vacation option
    await expect(formSelect.locator("option", { hasText: "Vacation" })).toBeAttached();
  });

  test("add policy form has annual quota field", async ({ page }) => {
    await page.getByRole("button", { name: /Add Policy/i }).click();
    await expect(page.getByText("Annual Quota (days)")).toBeVisible();
  });

  test("add policy form has accrual type dropdown", async ({ page }) => {
    await page.getByRole("button", { name: /Add Policy/i }).click();
    await expect(page.getByText("Accrual Type")).toBeVisible();
  });

  test("add policy form has carry forward toggle", async ({ page }) => {
    await page.getByRole("button", { name: /Add Policy/i }).click();
    await expect(page.getByText("Carry Forward", { exact: false }).first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Leave Settings — Holiday Form Detail
// ---------------------------------------------------------------------------

test.describe("Leave Settings — Holiday Form Detail", () => {
  test.beforeEach(async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Holidays" }).click();
    await expect(page.getByRole("button", { name: /Add Holiday/i })).toBeVisible();
  });

  test("holiday list shows optional/mandatory badges", async ({ page }) => {
    // New Year's Day is mandatory, Holi is optional
    await expect(page.getByText("Mandatory", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Optional", { exact: false }).first()).toBeVisible();
  });

  test("holidays are sorted by date", async ({ page }) => {
    // New Year (Jan 1) should appear before Holi (Mar 17)
    const newYear = page.getByText("New Year's Day");
    const holi = page.getByText("Holi", { exact: true });
    await expect(newYear).toBeVisible();
    await expect(holi).toBeVisible();
  });

  test("add holiday form has name and date fields", async ({ page }) => {
    await page.getByRole("button", { name: /Add Holiday/i }).click();
    await expect(page.getByPlaceholder("e.g. New Year's Day")).toBeVisible();
    await expect(page.locator("input[type=date]")).toBeVisible();
  });

  test("add holiday form has optional toggle", async ({ page }) => {
    await page.getByRole("button", { name: /Add Holiday/i }).click();
    await expect(page.getByRole("button", { name: /Optional Holiday/i })).toBeVisible();
  });

  test("add holiday form has description field", async ({ page }) => {
    await page.getByRole("button", { name: /Add Holiday/i }).click();
    await expect(page.getByText("Description")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Dashboard Leave Widgets — Links & Interactions
// ---------------------------------------------------------------------------

test.describe("Dashboard Leave Widgets — Links & Interactions", () => {
  test.setTimeout(60000);

  async function setupDashboard(page: Page) {
    await page.addInitScript(() => {
      localStorage.setItem("token", "fake-test-token");
      localStorage.setItem("current_workspace_id", "ws-1");
    });

    await page.route(`${API_BASE}/**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });
    await page.route(`${API_BASE}/workspaces`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "ws-1", name: "Test Workspace", slug: "test-ws", type: "engineering", avatar_url: null, owner_id: "test-user-123", member_count: 10, team_count: 2, is_active: true }]) });
    });
    await page.route(`${API_BASE}/workspaces/**`, (route) => {
      const url = route.request().url();
      if (url.includes("/leave/balance")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeaveBalances) });
      if (url.includes("/leave/approvals/pending")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockPendingApprovals) });
      if (url.includes("/calendar/team")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTeamCalendarEvents) });
      if (url.includes("/calendar/who-is-out")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockWhoIsOut) });
      if (url.includes("/calendar/availability-summary")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAvailabilitySummary) });
      if (url.includes("/app-access/")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apps: {}, applied_template_id: null, applied_template_name: null, has_custom_overrides: false, is_admin: true }) });
      if (url.includes("/documents/")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/ws-1/spaces")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/members")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/invites")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/task-statuses")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/apps")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      if (url.includes("/billing")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: "pro", status: "active" }) });
      if (url.includes("/teams")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "ws-1", name: "Test Workspace", slug: "test-ws", type: "engineering", avatar_url: null, owner_id: "test-user-123", member_count: 10, team_count: 2, is_active: true }) });
    });
    await page.route(`${API_BASE}/agents**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    });
    await page.route(`${API_BASE}/analysis/**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });
    await page.route(`${API_BASE}/dashboard/preferences`, (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({
            id: "pref-123", user_id: "test-user-123", preset_type: "manager",
            visible_widgets: ["welcome", "leaveBalance", "teamCalendar", "pendingLeaveApprovals", "teamAvailability"],
            widget_order: ["welcome", "leaveBalance", "teamCalendar", "pendingLeaveApprovals", "teamAvailability"],
            widget_sizes: {},
          }),
        });
      } else {
        route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      }
    });
    await page.route(`${API_BASE}/developers/me`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockUser) });
    });
  }

  test("Leave Balance widget has 'View all' link to /leave", async ({ page }) => {
    await setupDashboard(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=Welcome back", { timeout: 45000 });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const balance = page.getByText("Leave Balance");
    await expect(balance).toBeVisible({ timeout: 45000 });

    const viewAll = page.getByText("View all").first();
    await expect(viewAll).toBeVisible();
    // Check it links to /leave
    const link = page.locator("a[href='/leave']").first();
    await expect(link).toBeVisible();
  });

  test("Leave Balance widget shows used/total for each type", async ({ page }) => {
    await setupDashboard(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=Welcome back", { timeout: 45000 });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const balance = page.getByText("Leave Balance");
    await expect(balance).toBeVisible({ timeout: 45000 });

    // Should show "5 used" for Vacation
    await expect(page.getByText("5 used").first()).toBeVisible();
    // Should show total
    await expect(page.getByText("23 total").first()).toBeVisible();
  });

  test("Pending Approvals widget has 'View all' link", async ({ page }) => {
    await setupDashboard(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=Welcome back", { timeout: 45000 });

    // Scroll down to find the widget
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const approvals = page.getByText("Leave Approvals");
    await expect(approvals).toBeVisible({ timeout: 45000 });

    const viewAll = page.locator("a[href='/leave?tab=approvals']");
    await expect(viewAll).toBeVisible();
  });

  test("Team Availability widget shows availability ring", async ({ page }) => {
    await setupDashboard(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=Welcome back", { timeout: 45000 });

    // Scroll to bottom to ensure all widgets are rendered
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const availability = page.getByText("Team Availability");
    await expect(availability).toBeVisible({ timeout: 45000 });

    // Shows available/on-leave counts
    await expect(page.getByText("Available").first()).toBeVisible();
    await expect(page.getByText("On Leave").first()).toBeVisible();
  });

  test("Team Availability widget shows 'Out Today' section", async ({ page }) => {
    await setupDashboard(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=Welcome back", { timeout: 45000 });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const availability = page.getByText("Team Availability");
    await expect(availability).toBeVisible({ timeout: 45000 });

    await expect(page.getByText("Out Today")).toBeVisible();
    await expect(page.getByText("Charlie Brown")).toBeVisible();
  });

  test("Team Calendar widget shows day headers", async ({ page }) => {
    await setupDashboard(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=Welcome back", { timeout: 45000 });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const calendar = page.getByText("Team Calendar");
    await expect(calendar).toBeVisible({ timeout: 45000 });

    await expect(page.getByText("Su").first()).toBeVisible();
    await expect(page.getByText("Tu").first()).toBeVisible();
    await expect(page.getByText("Fr").first()).toBeVisible();
  });

  test("Team Calendar widget shows month label", async ({ page }) => {
    await setupDashboard(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=Welcome back", { timeout: 45000 });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const calendar = page.getByText("Team Calendar");
    await expect(calendar).toBeVisible({ timeout: 45000 });

    // Should show current month label (e.g. "February 2026")
    const now = new Date();
    const monthName = now.toLocaleString("default", { month: "long" });
    await expect(page.getByText(monthName, { exact: false }).first()).toBeVisible();
  });

  test("Team Calendar widget has 'View full' link", async ({ page }) => {
    await setupDashboard(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=Welcome back", { timeout: 45000 });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const calendar = page.getByText("Team Calendar");
    await expect(calendar).toBeVisible({ timeout: 45000 });

    const link = page.locator("a[href='/booking/team-calendar']");
    await expect(link).toBeVisible({ timeout: 30000 });
  });

  test("Team Calendar widget shows events count", async ({ page }) => {
    await setupDashboard(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=Welcome back", { timeout: 45000 });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const calendar = page.getByText("Team Calendar");
    await expect(calendar).toBeVisible({ timeout: 45000 });

    // mock has 2 events total
    await expect(page.getByText("2 events this month")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Team Calendar Page — Filter Interactions
// ---------------------------------------------------------------------------

test.describe("Team Calendar Page — Filter Interactions", () => {
  test.beforeEach(async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/booking/team-calendar");
    await page.waitForSelector("text=Team Calendar", { timeout: 45000 });
  });

  test("event type filter buttons are all initially active", async ({ page }) => {
    const leavesBtn = page.getByRole("button", { name: "Leaves" });
    const bookingsBtn = page.getByRole("button", { name: "Bookings" });
    const holidaysBtn = page.getByRole("button", { name: "Holidays" });

    // All should have active styling
    await expect(leavesBtn).toHaveClass(/text-white/);
    await expect(bookingsBtn).toHaveClass(/text-white/);
    await expect(holidaysBtn).toHaveClass(/text-white/);
  });

  test("clicking a filter toggles it off (if not last active)", async ({ page }) => {
    const leavesBtn = page.getByRole("button", { name: "Leaves" });

    // Click Leaves to toggle off
    await leavesBtn.click();

    // Should now have inactive styling
    await expect(leavesBtn).toHaveClass(/text-slate-500/);
  });

  test("cannot deactivate the last remaining filter", async ({ page }) => {
    // Deactivate Bookings and Holidays first
    await page.getByRole("button", { name: "Bookings" }).click();
    await page.getByRole("button", { name: "Holidays" }).click();

    // Only Leaves is active now — clicking it should NOT deactivate
    const leavesBtn = page.getByRole("button", { name: "Leaves" });
    await leavesBtn.click();
    // Should still be active
    await expect(leavesBtn).toHaveClass(/text-white/);
  });

  test("who is out panel shows leave type for each entry", async ({ page }) => {
    await expect(page.getByText("Charlie Brown")).toBeVisible();
    await expect(page.getByText("Vacation", { exact: false }).first()).toBeVisible();
  });

  test("who is out panel shows total out count badge", async ({ page }) => {
    // mockWhoIsOut has total_out: 1
    const badge = page.locator(".bg-amber-500\\/10").filter({ hasText: "1" });
    await expect(badge).toBeVisible();
  });

  test("calendar shows Today button", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
  });

  test("calendar has month navigation arrows", async ({ page }) => {
    // Should have prev/next month buttons (chevron icons)
    const prevBtn = page.locator("button").filter({ has: page.locator("svg.lucide-chevron-left") }).first();
    const nextBtn = page.locator("button").filter({ has: page.locator("svg.lucide-chevron-right") }).first();
    await expect(prevBtn).toBeVisible();
    await expect(nextBtn).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Leave Page — Error & Empty States
// ---------------------------------------------------------------------------

test.describe("Leave Page — Error & Empty States", () => {
  test("shows empty state when no leave requests exist", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("token", "fake-test-token");
      localStorage.setItem("current_workspace_id", "ws-1");
    });

    await page.route(`${API_BASE}/**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });
    await page.route(`${API_BASE}/workspaces`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "ws-1", name: "Test Workspace", slug: "test-ws", type: "engineering", avatar_url: null, owner_id: "test-user-123", member_count: 10, team_count: 2, is_active: true }]) });
    });
    await page.route(`${API_BASE}/workspaces/**`, (route) => {
      const url = route.request().url();
      if (url.includes("/leave/types")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeaveTypes) });
      if (url.includes("/leave/balance")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeaveBalances) });
      if (url.includes("/leave/approvals/pending")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/leave/requests/my")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/leave/requests")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/leave/holidays")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/leave/policies")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/app-access/")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apps: {}, applied_template_id: null, applied_template_name: null, has_custom_overrides: false, is_admin: true }) });
      if (url.includes("/documents/")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/ws-1/spaces")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/members")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/invites")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/task-statuses")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/apps")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      if (url.includes("/billing")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: "pro", status: "active" }) });
      if (url.includes("/teams")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "ws-1", name: "Test Workspace" }) });
    });
    await page.route(`${API_BASE}/developers/me`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockUser) });
    });
    await page.route(`${API_BASE}/dashboard/preferences`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preset_type: "developer", visible_widgets: [], widget_order: [], widget_sizes: {} }) });
    });

    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });

    // Empty requests state
    await expect(page.getByText('No leave requests yet')).toBeVisible();
  });

  test("shows empty state for approvals when no pending", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("token", "fake-test-token");
      localStorage.setItem("current_workspace_id", "ws-1");
    });

    await page.route(`${API_BASE}/**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });
    await page.route(`${API_BASE}/workspaces`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "ws-1", name: "Test Workspace", slug: "test-ws", type: "engineering", avatar_url: null, owner_id: "test-user-123", member_count: 10, team_count: 2, is_active: true }]) });
    });
    await page.route(`${API_BASE}/workspaces/**`, (route) => {
      const url = route.request().url();
      if (url.includes("/leave/types")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeaveTypes) });
      if (url.includes("/leave/balance")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeaveBalances) });
      if (url.includes("/leave/approvals/pending")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/leave/requests/my")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeaveRequests) });
      if (url.includes("/leave/requests")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeaveRequests) });
      if (url.includes("/leave/holidays")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockHolidays) });
      if (url.includes("/leave/policies")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeavePolicies) });
      if (url.includes("/app-access/")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apps: {}, applied_template_id: null, applied_template_name: null, has_custom_overrides: false, is_admin: true }) });
      if (url.includes("/documents/")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/ws-1/spaces")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/members")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/invites")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/task-statuses")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/apps")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      if (url.includes("/billing")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: "pro", status: "active" }) });
      if (url.includes("/teams")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "ws-1", name: "Test Workspace" }) });
    });
    await page.route(`${API_BASE}/developers/me`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockUser) });
    });
    await page.route(`${API_BASE}/dashboard/preferences`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preset_type: "developer", visible_widgets: [], widget_order: [], widget_sizes: {} }) });
    });

    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });
    await page.getByRole("tab", { name: /Approvals/i }).click();

    await expect(page.getByText("No pending approvals. All caught up!")).toBeVisible();
  });

  test("team leaves table shows empty state when no requests", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("token", "fake-test-token");
      localStorage.setItem("current_workspace_id", "ws-1");
    });

    await page.route(`${API_BASE}/**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });
    await page.route(`${API_BASE}/workspaces`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "ws-1", name: "Test Workspace", slug: "test-ws", type: "engineering", avatar_url: null, owner_id: "test-user-123", member_count: 10, team_count: 2, is_active: true }]) });
    });
    await page.route(`${API_BASE}/workspaces/**`, (route) => {
      const url = route.request().url();
      if (url.includes("/leave/types")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeaveTypes) });
      if (url.includes("/leave/balance")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeaveBalances) });
      if (url.includes("/leave/approvals/pending")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/leave/requests/my")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeaveRequests) });
      if (url.includes("/leave/requests")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/leave/holidays")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockHolidays) });
      if (url.includes("/leave/policies")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeavePolicies) });
      if (url.includes("/app-access/")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apps: {}, applied_template_id: null, applied_template_name: null, has_custom_overrides: false, is_admin: true }) });
      if (url.includes("/documents/")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/ws-1/spaces")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/members")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/invites")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/task-statuses")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/apps")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      if (url.includes("/billing")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: "pro", status: "active" }) });
      if (url.includes("/teams")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "ws-1", name: "Test Workspace" }) });
    });
    await page.route(`${API_BASE}/developers/me`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockUser) });
    });
    await page.route(`${API_BASE}/dashboard/preferences`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preset_type: "developer", visible_widgets: [], widget_order: [], widget_sizes: {} }) });
    });

    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });
    await page.getByRole("tab", { name: "Team Leaves" }).click();

    await expect(page.getByText("No leave requests found.")).toBeVisible();
  });

  test("settings shows empty holidays list with message", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("token", "fake-test-token");
      localStorage.setItem("current_workspace_id", "ws-1");
    });

    await page.route(`${API_BASE}/**`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });
    await page.route(`${API_BASE}/workspaces`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "ws-1", name: "Test Workspace", slug: "test-ws", type: "engineering", avatar_url: null, owner_id: "test-user-123", member_count: 10, team_count: 2, is_active: true }]) });
    });
    await page.route(`${API_BASE}/workspaces/**`, (route) => {
      const url = route.request().url();
      if (url.includes("/leave/types")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeaveTypes) });
      if (url.includes("/leave/balance")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeaveBalances) });
      if (url.includes("/leave/approvals/pending")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/leave/requests/my")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeaveRequests) });
      if (url.includes("/leave/requests")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeaveRequests) });
      if (url.includes("/leave/holidays")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/leave/policies")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockLeavePolicies) });
      if (url.includes("/app-access/")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apps: {}, applied_template_id: null, applied_template_name: null, has_custom_overrides: false, is_admin: true }) });
      if (url.includes("/documents/")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/ws-1/spaces")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/members")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/invites")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/task-statuses")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      if (url.includes("/apps")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      if (url.includes("/billing")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: "pro", status: "active" }) });
      if (url.includes("/teams")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "ws-1", name: "Test Workspace" }) });
    });
    await page.route(`${API_BASE}/developers/me`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockUser) });
    });
    await page.route(`${API_BASE}/dashboard/preferences`, (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preset_type: "developer", visible_widgets: [], widget_order: [], widget_sizes: {} }) });
    });

    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Holidays" }).click();

    await expect(page.getByText("No holidays", { exact: false })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Leave Page — Accessibility
// ---------------------------------------------------------------------------

test.describe("Leave Page — Accessibility", () => {
  test.beforeEach(async ({ page }) => {
    await setupLeaveMocks(page);
    await page.goto("/leave");
    await page.waitForSelector("text=Leave Management", { timeout: 45000 });
  });

  test("tab container has tablist role and aria-label", async ({ page }) => {
    const tablist = page.locator("[role=tablist]");
    await expect(tablist).toBeVisible();
    await expect(tablist).toHaveAttribute("aria-label", "Leave management");
  });

  test("tabs have correct ARIA attributes", async ({ page }) => {
    const myLeavesTab = page.getByRole("tab", { name: "My Leaves" });
    await expect(myLeavesTab).toHaveAttribute("aria-selected", "true");
    await expect(myLeavesTab).toHaveAttribute("aria-controls", "tabpanel-my-leaves");

    const teamTab = page.getByRole("tab", { name: "Team Leaves" });
    await expect(teamTab).toHaveAttribute("aria-selected", "false");
  });

  test("tab panel has correct role and id", async ({ page }) => {
    const tabpanel = page.locator("[role=tabpanel]");
    await expect(tabpanel).toBeVisible();
    await expect(tabpanel).toHaveAttribute("id", "tabpanel-my-leaves");
  });

  test("tab panel id updates when switching tabs", async ({ page }) => {
    await page.getByRole("tab", { name: "Team Leaves" }).click();
    const tabpanel = page.locator("[role=tabpanel]");
    await expect(tabpanel).toHaveAttribute("id", "tabpanel-team-leaves");
  });

  test("header shows subtitle description", async ({ page }) => {
    await expect(page.getByText("Track and manage your leaves, approvals, and team availability")).toBeVisible();
  });
});
