import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const mockEventType = {
  id: "evt-1",
  name: "30 Min Meeting",
  slug: "30-min-meeting",
  description: "Quick sync meeting",
  duration_minutes: 30,
  color: "#3b82f6",
  is_active: true,
  location_type: "video",
  buffer_before_minutes: 5,
  buffer_after_minutes: 5,
  max_bookings_per_day: 8,
  workspace_id: "ws-1",
};

const mockEventTypes = {
  event_types: [
    mockEventType,
    {
      id: "evt-2",
      name: "60 Min Consultation",
      slug: "60-min-consultation",
      description: "In-depth consultation",
      duration_minutes: 60,
      color: "#10b981",
      is_active: true,
      location_type: "video",
      buffer_before_minutes: 10,
      buffer_after_minutes: 10,
      max_bookings_per_day: 4,
      workspace_id: "ws-1",
    },
  ],
};

const mockBookingDetail = {
  id: "booking-1",
  event_type_id: "evt-1",
  event_type: mockEventType,
  attendee_name: "John Smith",
  attendee_email: "john@example.com",
  start_time: "2026-02-20T10:00:00Z",
  end_time: "2026-02-20T10:30:00Z",
  status: "confirmed",
  location: "https://meet.google.com/abc-def-ghi",
  notes: "Discuss project timeline",
  created_at: "2026-02-15T08:00:00Z",
};

const mockTeamCalendar = {
  events: [
    {
      id: "tcal-1",
      title: "30 Min Meeting with John",
      start: "2026-02-20T10:00:00Z",
      end: "2026-02-20T10:30:00Z",
      type: "booking",
      host_id: "test-user-123",
      host_name: "Test Developer",
    },
  ],
};

const mockAvailability = {
  rules: [
    { day: "monday", start: "09:00", end: "17:00", is_active: true },
    { day: "tuesday", start: "09:00", end: "17:00", is_active: true },
    { day: "wednesday", start: "09:00", end: "17:00", is_active: true },
    { day: "thursday", start: "09:00", end: "17:00", is_active: true },
    { day: "friday", start: "09:00", end: "17:00", is_active: true },
    { day: "saturday", start: "09:00", end: "17:00", is_active: false },
    { day: "sunday", start: "09:00", end: "17:00", is_active: false },
  ],
  timezone: "America/New_York",
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

async function setupBookingSubpageMocks(page: Page) {
  await setupCommonMocks(page);

  await page.route(`${API_BASE}/workspaces/ws-1/booking/event-types`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockEventTypes) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/booking/event-types/evt-1`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockEventType) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/booking/event-types/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockEventType) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/booking/bookings/booking-1`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockBookingDetail) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/booking/bookings/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockBookingDetail) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/booking/bookings`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bookings: [mockBookingDetail], total: 1 }) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/booking/team-calendar**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockTeamCalendar) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/booking/availability**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockAvailability) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/booking/calendars**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/booking/**`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });
}

// ---------------------------------------------------------------------------
// Tests: Event Type Detail
// ---------------------------------------------------------------------------

test.describe("Booking -- Event Type Detail Page", () => {
  test("renders the event type detail page", async ({ page }) => {
    await setupBookingSubpageMocks(page);
    await page.goto("/booking/event-types/evt-1");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasEvent = await page.getByText(/30 Min Meeting|event type/i).isVisible().catch(() => false);
    expect(hasEvent).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: New Event Type
// ---------------------------------------------------------------------------

test.describe("Booking -- New Event Type Page", () => {
  test("renders the new event type page", async ({ page }) => {
    await setupBookingSubpageMocks(page);
    await page.goto("/booking/event-types/new");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasNew = await page.getByText(/create|new|event type/i).isVisible().catch(() => false);
    expect(hasNew).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests: Booking Detail
// ---------------------------------------------------------------------------

test.describe("Booking -- Booking Detail Page", () => {
  test("renders the booking detail page", async ({ page }) => {
    await setupBookingSubpageMocks(page);
    await page.goto("/booking/bookings/booking-1");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Tests: Team Calendar
// ---------------------------------------------------------------------------

test.describe("Booking -- Team Calendar Page", () => {
  test("renders the team calendar page", async ({ page }) => {
    await setupBookingSubpageMocks(page);
    await page.goto("/booking/team-calendar");
    await page.waitForTimeout(5000);
    await expect(page.locator("body")).toBeVisible();
    const hasCal = await page.getByText(/calendar|team/i).isVisible().catch(() => false);
    expect(hasCal).toBeTruthy();
  });
});
