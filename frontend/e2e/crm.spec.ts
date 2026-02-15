import { test, expect } from "./fixtures/base-test";
import type { Page } from "@playwright/test";
import { setupCommonMocks, API_BASE } from "./fixtures/shared-helpers";

const mockCRMObjects = [
  {
    id: "obj-1",
    name: "Contact",
    plural_name: "Contacts",
    slug: "contacts",
    object_type: "person",
    is_system: true,
    record_count: 42,
    attributes: Array(8).fill({ id: "a", name: "a", attribute_type: "text" }),
    description: "Manage contacts",
    workspace_id: "ws-1",
  },
  {
    id: "obj-2",
    name: "Company",
    plural_name: "Companies",
    slug: "companies",
    object_type: "company",
    is_system: true,
    record_count: 15,
    attributes: Array(6).fill({ id: "b", name: "b", attribute_type: "text" }),
    description: "Manage companies",
    workspace_id: "ws-1",
  },
  {
    id: "obj-3",
    name: "Deal",
    plural_name: "Deals",
    slug: "deals",
    object_type: "deal",
    is_system: true,
    record_count: 8,
    attributes: Array(10).fill({ id: "c", name: "c", attribute_type: "text" }),
    description: "Manage deals",
    workspace_id: "ws-1",
  },
];

async function setupCRMMocks(page: Page) {
  await setupCommonMocks(page);

  // CRM objects endpoint
  await page.route(`${API_BASE}/workspaces/ws-1/crm/objects`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockCRMObjects),
      });
    }
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  // CRM record counts
  await page.route(`${API_BASE}/workspaces/ws-1/crm/objects/recalculate-counts`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
  });

  // Google integration status
  await page.route(`${API_BASE}/workspaces/ws-1/google-integration/status`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ is_connected: false }),
    });
  });

  // Developer Google status
  await page.route(`${API_BASE}/developers/me/google-status`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ is_connected: false }),
    });
  });
}

test.describe("CRM Page — Main View", () => {
  test.beforeEach(async ({ page }) => {
    await setupCRMMocks(page);

    // Set onboarding complete so we get the main view
    await page.addInitScript(() => {
      localStorage.setItem("crm_onboarding_complete", "true");
      localStorage.setItem("crm_checklist_dismissed", "true");
    });

    await page.goto("/crm");
    await page.waitForSelector("text=CRM", { timeout: 45000 });
  });

  test("renders the CRM page with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "CRM" })).toBeVisible();
    await expect(page.getByText("Manage your contacts, companies, and deals")).toBeVisible();
  });

  test("shows standard object cards", async ({ page }) => {
    await expect(page.getByText("Contacts")).toBeVisible();
    await expect(page.getByText("Companies")).toBeVisible();
    await expect(page.getByText("Deals")).toBeVisible();
  });

  test("object cards show record counts", async ({ page }) => {
    await expect(page.getByText("42")).toBeVisible();
    await expect(page.getByText("records", { exact: false }).first()).toBeVisible();
  });

  test("shows quick access cards", async ({ page }) => {
    await expect(page.getByText("Inbox")).toBeVisible();
    await expect(page.getByText("Calendar")).toBeVisible();
    await expect(page.getByText("Activities")).toBeVisible();
  });

  test("search bar is present", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search objects...");
    await expect(searchInput).toBeVisible();
  });

  test("New Object button opens create modal", async ({ page }) => {
    await page.getByRole("button", { name: /New Object/i }).click();
    await expect(page.getByText("Create Custom Object")).toBeVisible();
    await expect(page.getByPlaceholder("e.g., Project")).toBeVisible();
  });

  test("shows Standard Objects section label", async ({ page }) => {
    await expect(page.getByText("Standard Objects")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Additional Mock Data
// ---------------------------------------------------------------------------

const mockRecords = {
  records: [
    {
      id: "rec-1",
      object_id: "obj-1",
      display_name: "John Doe",
      values: { email: "john@example.com", phone: "+1234567890", status: "active" },
      created_at: "2026-01-15T00:00:00Z",
      updated_at: "2026-02-10T00:00:00Z",
      is_archived: false,
    },
    {
      id: "rec-2",
      object_id: "obj-1",
      display_name: "Jane Smith",
      values: { email: "jane@example.com", phone: "+0987654321", status: "lead" },
      created_at: "2026-01-20T00:00:00Z",
      updated_at: "2026-02-12T00:00:00Z",
      is_archived: false,
    },
  ],
  total: 2,
};

const mockActivities: {
  activities: {
    id: string;
    workspace_id: string;
    activity_type: string;
    title: string;
    description: string;
    actor_id: string;
    actor_name: string;
    record_id: string | null;
    object_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }[];
  total: number;
} = {
  activities: [
    {
      id: "act-1",
      workspace_id: "ws-1",
      activity_type: "email",
      title: "Email sent to John Doe",
      description: "Follow-up email regarding the proposal",
      actor_id: "test-user-123",
      actor_name: "Test Developer",
      record_id: "rec-1",
      object_id: "obj-1",
      metadata: {},
      created_at: "2026-02-14T10:00:00Z",
    },
    {
      id: "act-2",
      workspace_id: "ws-1",
      activity_type: "meeting",
      title: "Meeting with Jane Smith",
      description: "Quarterly business review",
      actor_id: "test-user-123",
      actor_name: "Test Developer",
      record_id: "rec-2",
      object_id: "obj-1",
      metadata: {},
      created_at: "2026-02-13T14:30:00Z",
    },
    {
      id: "act-3",
      workspace_id: "ws-1",
      activity_type: "record_created",
      title: "Created contact Jane Smith",
      description: "New contact added from import",
      actor_id: "test-user-123",
      actor_name: "Test Developer",
      record_id: "rec-2",
      object_id: "obj-1",
      metadata: {},
      created_at: "2026-01-20T00:00:00Z",
    },
    {
      id: "act-4",
      workspace_id: "ws-1",
      activity_type: "call",
      title: "Phone call with John Doe",
      description: "Discussed pricing options",
      actor_id: "test-user-123",
      actor_name: "Test Developer",
      record_id: "rec-1",
      object_id: "obj-1",
      metadata: {},
      created_at: "2026-02-12T09:00:00Z",
    },
    {
      id: "act-5",
      workspace_id: "ws-1",
      activity_type: "note",
      title: "Note added",
      description: "Key decision-maker identified",
      actor_id: "test-user-123",
      actor_name: "Test Developer",
      record_id: null,
      object_id: null,
      metadata: {},
      created_at: "2026-02-11T16:00:00Z",
    },
  ],
  total: 5,
};

const mockCRMObjectsWithCustom = [
  ...mockCRMObjects,
  {
    id: "obj-4",
    name: "Project",
    plural_name: "Projects",
    slug: "projects",
    object_type: "custom",
    is_system: false,
    record_count: 3,
    attributes: Array(4).fill({ id: "d", name: "d", attribute_type: "text" }),
    description: "Track projects",
    workspace_id: "ws-1",
  },
];

// Enhanced mock setup that includes records and activities endpoints
async function setupCRMFullMocks(page: Page) {
  await setupCRMMocks(page);

  // Records endpoint
  await page.route(`${API_BASE}/workspaces/ws-1/crm/objects/obj-1/records`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockRecords),
      });
    }
    // POST for creating records
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(mockRecords.records[0]),
    });
  });

  // Activities endpoint
  await page.route(`${API_BASE}/workspaces/ws-1/crm/activities**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockActivities),
    });
  });
}

// Mock setup with custom objects included
async function setupCRMWithCustomObjectsMocks(page: Page) {
  await setupCommonMocks(page);

  // CRM objects endpoint — includes a custom object
  await page.route(`${API_BASE}/workspaces/ws-1/crm/objects`, (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockCRMObjectsWithCustom),
      });
    }
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/crm/objects/recalculate-counts`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
  });

  await page.route(`${API_BASE}/workspaces/ws-1/google-integration/status`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ is_connected: false }) });
  });

  await page.route(`${API_BASE}/developers/me/google-status`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ is_connected: false }) });
  });
}

// ---------------------------------------------------------------------------
// CRM Page — Search & Filter
// ---------------------------------------------------------------------------

test.describe("CRM Page — Search & Filter", () => {
  test.beforeEach(async ({ page }) => {
    await setupCRMMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem("crm_onboarding_complete", "true");
      localStorage.setItem("crm_checklist_dismissed", "true");
    });

    await page.goto("/crm");
    await page.waitForSelector("text=CRM", { timeout: 45000 });
  });

  test("search input accepts text and updates value", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search objects...");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("Contact");
    await expect(searchInput).toHaveValue("Contact");
  });

  test("filtering objects by search query hides non-matching objects", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search objects...");
    await searchInput.fill("Deal");
    // Deals should still be visible
    await expect(page.getByText("Deals")).toBeVisible();
    // Contacts and Companies should be filtered out
    await expect(page.getByText("Contacts")).not.toBeVisible();
    await expect(page.getByText("Companies")).not.toBeVisible();
  });

  test("object cards show attribute count", async ({ page }) => {
    // Contact has 8 attributes, Company has 6, Deal has 10
    await expect(page.getByText("8 attributes")).toBeVisible();
    await expect(page.getByText("6 attributes")).toBeVisible();
    await expect(page.getByText("10 attributes")).toBeVisible();
  });

  test("object cards link to object slug page", async ({ page }) => {
    // Click the Contacts card — it should navigate to /crm/contacts
    await page.getByText("Contacts").click();
    await page.waitForURL("**/crm/contacts", { timeout: 30000 });
    expect(page.url()).toContain("/crm/contacts");
  });

  test("custom objects section shown when custom objects exist", async ({ page }) => {
    // Re-setup with custom objects
    await page.goto("about:blank");
    await setupCRMWithCustomObjectsMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem("crm_onboarding_complete", "true");
      localStorage.setItem("crm_checklist_dismissed", "true");
    });

    await page.goto("/crm");
    await page.waitForSelector("text=CRM", { timeout: 45000 });

    await expect(page.getByText("Custom Objects")).toBeVisible();
    await expect(page.getByText("Projects")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// CRM Page — Create Object Modal
// ---------------------------------------------------------------------------

test.describe("CRM Page — Create Object Modal", () => {
  test.beforeEach(async ({ page }) => {
    await setupCRMMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem("crm_onboarding_complete", "true");
      localStorage.setItem("crm_checklist_dismissed", "true");
    });

    await page.goto("/crm");
    await page.waitForSelector("text=CRM", { timeout: 45000 });
    // Open the create modal
    await page.getByRole("button", { name: /New Object/i }).click();
    await page.waitForSelector("text=Create Custom Object", { timeout: 15000 });
  });

  test("modal opens with 'Create Custom Object' title", async ({ page }) => {
    await expect(page.getByText("Create Custom Object")).toBeVisible();
  });

  test("modal has name input with placeholder", async ({ page }) => {
    const nameInput = page.getByPlaceholder("e.g., Project");
    await expect(nameInput).toBeVisible();
  });

  test("modal has plural name input", async ({ page }) => {
    const pluralInput = page.getByPlaceholder("e.g., Projects");
    await expect(pluralInput).toBeVisible();
  });

  test("modal has description textarea", async ({ page }) => {
    const descriptionArea = page.getByPlaceholder("What is this object used for?");
    await expect(descriptionArea).toBeVisible();
  });

  test("modal has name labels for singular and plural", async ({ page }) => {
    await expect(page.getByText("Name (singular)")).toBeVisible();
    await expect(page.getByText("Name (plural)")).toBeVisible();
  });

  test("cancel button closes modal", async ({ page }) => {
    await expect(page.getByText("Create Custom Object")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Create Custom Object")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// CRM Page — Quick Access Cards
// ---------------------------------------------------------------------------

test.describe("CRM Page — Quick Access Cards", () => {
  test.beforeEach(async ({ page }) => {
    await setupCRMMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem("crm_onboarding_complete", "true");
      localStorage.setItem("crm_checklist_dismissed", "true");
    });

    await page.goto("/crm");
    await page.waitForSelector("text=CRM", { timeout: 45000 });
  });

  test("Inbox card navigates to /crm/inbox", async ({ page }) => {
    await page.getByText("Inbox").click();
    await page.waitForURL("**/crm/inbox", { timeout: 30000 });
    expect(page.url()).toContain("/crm/inbox");
  });

  test("Calendar card navigates to /crm/calendar", async ({ page }) => {
    await page.getByText("Calendar").click();
    await page.waitForURL("**/crm/calendar", { timeout: 30000 });
    expect(page.url()).toContain("/crm/calendar");
  });

  test("Activities card navigates to /crm/activities", async ({ page }) => {
    await page.getByText("Activities").click();
    await page.waitForURL("**/crm/activities", { timeout: 30000 });
    expect(page.url()).toContain("/crm/activities");
  });

  test("quick access cards show descriptions", async ({ page }) => {
    await expect(page.getByText("View synced emails and link to records")).toBeVisible();
    await expect(page.getByText("View meetings and schedule events")).toBeVisible();
    await expect(page.getByText("Track all interactions and tasks")).toBeVisible();
  });

  test("Integrations card navigates to /crm/settings/integrations", async ({ page }) => {
    await page.getByText("Integrations").click();
    await page.waitForURL("**/crm/settings/integrations", { timeout: 30000 });
    expect(page.url()).toContain("/crm/settings/integrations");
  });
});

// ---------------------------------------------------------------------------
// CRM — Record List Page
// ---------------------------------------------------------------------------

test.describe("CRM — Record List Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupCRMFullMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem("crm_onboarding_complete", "true");
      localStorage.setItem("crm_checklist_dismissed", "true");
    });

    await page.goto("/crm/contacts");
    await page.waitForSelector("text=Contacts", { timeout: 45000 });
  });

  test("navigate to /crm/contacts shows page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Contacts" })).toBeVisible();
  });

  test("shows record count", async ({ page }) => {
    await expect(page.getByText("2 records")).toBeVisible();
  });

  test("table view shows records with display names", async ({ page }) => {
    await expect(page.getByText("John Doe")).toBeVisible();
    await expect(page.getByText("Jane Smith")).toBeVisible();
  });

  test("records show display name in the table", async ({ page }) => {
    const johnCell = page.getByText("John Doe");
    await expect(johnCell).toBeVisible();
    const janeCell = page.getByText("Jane Smith");
    await expect(janeCell).toBeVisible();
  });

  test("search input exists on records page", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search contacts...");
    await expect(searchInput).toBeVisible();
  });

  test("'New Contact' button is visible", async ({ page }) => {
    const newRecordButton = page.getByRole("button", { name: /New Contact/i });
    await expect(newRecordButton).toBeVisible();
  });

  test("back link to /crm exists", async ({ page }) => {
    // The back button is a ChevronLeft icon button that navigates to /crm
    const backButton = page.locator("button").filter({ has: page.locator("svg.lucide-chevron-left") });
    await expect(backButton.first()).toBeVisible();
    await backButton.first().click();
    await page.waitForURL("**/crm", { timeout: 30000 });
    expect(page.url()).toMatch(/\/crm\/?$/);
  });

  test("filter button is visible", async ({ page }) => {
    const filterButton = page.getByRole("button", { name: /Filter/i });
    await expect(filterButton).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// CRM — Activities Page
// ---------------------------------------------------------------------------

test.describe("CRM — Activities Page", () => {
  test.beforeEach(async ({ page }) => {
    await setupCRMFullMocks(page);

    await page.addInitScript(() => {
      localStorage.setItem("crm_onboarding_complete", "true");
      localStorage.setItem("crm_checklist_dismissed", "true");
    });

    await page.goto("/crm/activities");
    await page.waitForSelector("text=Activities", { timeout: 45000 });
  });

  test("activities page renders with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Activities" })).toBeVisible();
  });

  test("shows activity items in timeline", async ({ page }) => {
    await expect(page.getByText("Email sent to John Doe")).toBeVisible();
    await expect(page.getByText("Meeting with Jane Smith")).toBeVisible();
    await expect(page.getByText("Phone call with John Doe")).toBeVisible();
  });

  test("activities show type badges", async ({ page }) => {
    // Each activity shows a type label badge
    await expect(page.getByText("Emails").first()).toBeVisible();
    await expect(page.getByText("Meetings").first()).toBeVisible();
    await expect(page.getByText("Calls").first()).toBeVisible();
  });

  test("activities show descriptions", async ({ page }) => {
    await expect(page.getByText("Follow-up email regarding the proposal")).toBeVisible();
    await expect(page.getByText("Quarterly business review")).toBeVisible();
    await expect(page.getByText("Discussed pricing options")).toBeVisible();
  });

  test("filter by activity type buttons exist", async ({ page }) => {
    // The page has filter type buttons: All, Created, Updated, Emails, Meetings, Calls, Notes, Tasks
    await expect(page.getByRole("button", { name: /All/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Emails/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Meetings/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Calls/i }).first()).toBeVisible();
  });

  test("back link to /crm exists and navigates correctly", async ({ page }) => {
    // The back button shows "CRM" text with a ChevronLeft icon
    const backLink = page.locator("button").filter({ hasText: "CRM" }).filter({ has: page.locator("svg") });
    await expect(backLink.first()).toBeVisible();
    await backLink.first().click();
    await page.waitForURL("**/crm", { timeout: 30000 });
    expect(page.url()).toMatch(/\/crm\/?$/);
  });
});
