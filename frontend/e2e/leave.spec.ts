import { test, expect, Page } from "@playwright/test";
import { mockUser } from "./fixtures/mock-data";
import {
  mockLeaveTypes,
  mockLeaveBalances,
  mockLeaveRequests,
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
    await page.waitForSelector("text=Leave Management", { timeout: 15000 });
  });

  test("renders the leave page with title and request button", async ({ page }) => {
    await expect(page.getByText("Leave Management")).toBeVisible();
    await expect(page.getByRole("button", { name: /Request Leave/i })).toBeVisible();
  });

  test("shows My Leaves tab by default", async ({ page }) => {
    // My Leaves tab should be active
    const myLeavesTab = page.getByRole("button", { name: "My Leaves" });
    await expect(myLeavesTab).toBeVisible();

    // Leave balance cards should render
    await expect(page.getByRole("heading", { name: "Vacation" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sick Leave" }).first()).toBeVisible();
  });

  test("switches to Team Leaves tab", async ({ page }) => {
    await page.getByRole("button", { name: "Team Leaves" }).click();

    // Team leave table should show
    await expect(page.getByText("Employee").first()).toBeVisible();
  });

  test("switches to Approvals tab and shows pending count", async ({ page }) => {
    await page.getByRole("button", { name: /Approvals/i }).click();

    // Should show pending approval cards
    await expect(page.getByText("Alice Johnson")).toBeVisible();
    await expect(page.getByText("Bob Smith")).toBeVisible();
  });

  test("switches to Settings tab with sub-navigation", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();

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
    await page.waitForSelector("text=Leave Management", { timeout: 15000 });
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
    await page.waitForSelector("text=Leave Management", { timeout: 15000 });
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
    await page.waitForSelector("text=Leave Management", { timeout: 15000 });
    await page.getByRole("button", { name: /Approvals/i }).click();
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
    await page.waitForSelector("text=Leave Management", { timeout: 15000 });
    await page.getByRole("button", { name: "Settings" }).click();
  });

  test("Leave Types settings shows table with types", async ({ page }) => {
    // Should default to Leave Types sub-tab
    await expect(page.getByRole("heading", { name: "Leave Types" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add Type/i })).toBeVisible();

    // Wait for leave types to load, then verify table contents
    await expect(page.getByRole("cell", { name: "Vacation" })).toBeVisible({ timeout: 10000 });
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
    await page.waitForSelector("text=Welcome back", { timeout: 15000 });

    // Leave Balance widget should show
    await expect(page.getByText("Leave Balance")).toBeVisible();
    await expect(page.getByText("Vacation").first()).toBeVisible();
    await expect(page.getByText("16 left", { exact: false })).toBeVisible();
  });

  test("Team Calendar widget renders with month grid", async ({ page }) => {
    await setupDashboardWithLeaveWidgets(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=Welcome back", { timeout: 15000 });

    await expect(page.getByText("Team Calendar")).toBeVisible();
    // Should show day headers
    await expect(page.getByText("Su").first()).toBeVisible();
    await expect(page.getByText("Mo").first()).toBeVisible();
  });

  test("Pending Leave Approvals widget renders with requests", async ({ page }) => {
    await setupDashboardWithLeaveWidgets(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=Welcome back", { timeout: 15000 });

    await expect(page.getByText("Leave Approvals")).toBeVisible();
    await expect(page.getByText("2 pending")).toBeVisible();
    await expect(page.getByText("Alice Johnson")).toBeVisible();
    await expect(page.getByText("Bob Smith")).toBeVisible();
  });

  test("Team Availability widget renders with summary", async ({ page }) => {
    await setupDashboardWithLeaveWidgets(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=Welcome back", { timeout: 15000 });

    await expect(page.getByText("Team Availability")).toBeVisible();
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
    await page.waitForSelector("text=Team Calendar", { timeout: 15000 });
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
