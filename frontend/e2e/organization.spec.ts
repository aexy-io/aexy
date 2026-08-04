import { test, expect, Page } from "@playwright/test";
import { mockUser } from "./fixtures/mock-data";

const API_BASE = "http://localhost:8000/api/v1";

const mockWorkspace = {
  id: "ws-1",
  name: "Bimaplan",
  slug: "bimaplan",
  type: "business",
  avatar_url: null,
  owner_id: "test-user-123",
  member_count: 6,
  team_count: 3,
  is_active: true,
};

// AppAccessGuard needs the organization app enabled for the page to render.
const mockEffectiveAccess = {
  apps: {
    organization: { enabled: true, modules: { chart: true, departments: true, directory: true } },
  },
  applied_template_id: null,
  applied_template_name: null,
  has_custom_overrides: false,
  is_admin: true,
};

const mockDepartments = [
  {
    id: "d-1", workspace_id: "ws-1", name: "Operations", slug: "operations",
    description: null, function_key: "ops_kam", parent_id: null, path: "/operations/",
    depth: 0, position: 0, head_id: null, cost_center: "CC-100", budget_amount: null,
    budget_currency: null, headcount_planned: 8, headcount_actual: 5, location: null,
    timezone: null, is_active: true, member_count: 5,
    created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
  },
  {
    id: "d-2", workspace_id: "ws-1", name: "Human Resources", slug: "hr",
    description: null, function_key: "hr", parent_id: null, path: "/hr/",
    depth: 0, position: 1, head_id: null, cost_center: "CC-200", budget_amount: null,
    budget_currency: null, headcount_planned: 3, headcount_actual: 2, location: null,
    timezone: null, is_active: true, member_count: 2,
    created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z",
  },
];

// Two workspace members: one placed in Operations, one in no department at all.
// The unplaced one is the state every new joiner starts in.
const mockPeople = [
  {
    developer_id: "dev-placed", name: "Neha Placed", email: "neha@bimaplan.co",
    avatar_url: null, workspace_role: "member",
    departments: [
      { id: "d-1", name: "Operations", function_key: "ops_kam", role_in_department: "member", is_primary: true },
    ],
    manager_id: null, manager_name: null,
  },
  {
    developer_id: "dev-stranded", name: "Sam Stranded", email: "sam@bimaplan.co",
    avatar_url: null, workspace_role: "member",
    departments: [],
    manager_id: "dev-placed", manager_name: "Neha Placed",
  },
];

const mockDepartmentDetail = {
  ...mockDepartments[0],
  members: [
    {
      id: "dm-1", developer_id: "dev-placed", name: "Neha Placed", email: "neha@bimaplan.co",
      avatar_url: null, role_in_department: "member", is_primary: true, allocation_percent: 100,
    },
  ],
  positions: [
    { id: "p-1", department_id: "d-1", title: "Senior KAM", status: "open", filled_by_id: null, created_at: "2026-07-01T00:00:00Z" },
  ],
};

/** @param canManage what GET /organization/my-permissions should report */
async function setup(page: Page, canManage: boolean) {
  await page.addInitScript(() => {
    localStorage.setItem("token", "fake-test-token");
    localStorage.setItem("current_workspace_id", "ws-1");
  });

  // Catch-all FIRST (Playwright checks routes last-registered-first).
  await page.route(`${API_BASE}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );

  await page.route(`${API_BASE}/workspaces`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([mockWorkspace]) }),
  );
  await page.route(`${API_BASE}/developers/me`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockUser) }),
  );
  // App-shell / sidebar hooks expect ARRAYS — the `{}` catch-all would crash them.
  await page.route(`${API_BASE}/notifications**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  await page.route(`${API_BASE}/workspaces/**`, (route) => {
    const url = route.request().url();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (url.includes("/apps/effective") || url.includes("/app-access/")) return json(mockEffectiveAccess);
    if (url.includes("/organization/my-permissions")) return json({ can_manage: canManage });
    if (url.includes("/organization/people")) return json(mockPeople);
    // Order matters: the by-id detail route is a prefix match on /departments.
    if (url.match(/\/organization\/departments\/[^/]+$/)) return json(mockDepartmentDetail);
    if (url.includes("/organization/departments")) return json(mockDepartments);
    if (url.includes("/organization/org-chart")) return json([]);
    // App-shell / sidebar collections (must return arrays, not {})
    if (url.match(/\/(spaces|documents|members|invites|task-statuses|teams|projects|notifications)/)) return json([]);
    if (url.endsWith("/workspaces/ws-1")) return json(mockWorkspace);
    return json({});
  });
}

test.describe("Organization UI", () => {
  test("departments page is editable with can_manage_org", async ({ page }) => {
    await setup(page, true);
    await page.goto("/organization/departments");
    await expect(page.getByRole("heading", { name: "Departments", level: 1 })).toBeVisible({ timeout: 15000 });

    // Data renders
    await expect(page.getByText("Operations")).toBeVisible();
    await expect(page.getByText("Human Resources")).toBeVisible();
    await expect(page.getByText("CC-100")).toBeVisible();

    // Editing affordances are offered
    await expect(page.getByRole("button", { name: "New Department" })).toBeVisible();
    await expect(page.getByLabel("delete").first()).toBeVisible();
    await expect(page.getByText(/read-only access/i)).toHaveCount(0);
  });

  test("departments page is read-only without can_manage_org", async ({ page }) => {
    await setup(page, false);
    await page.goto("/organization/departments");
    await expect(page.getByRole("heading", { name: "Departments", level: 1 })).toBeVisible({ timeout: 15000 });

    // Data is still visible ...
    await expect(page.getByText("Operations")).toBeVisible();
    await expect(page.getByText("Human Resources")).toBeVisible();
    // ... but nothing is editable, and the reason is stated.
    await expect(page.getByText(/read-only access/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "New Department" })).toHaveCount(0);
    await expect(page.getByLabel("delete")).toHaveCount(0);
  });

  test("department roster can be opened and edited", async ({ page }) => {
    await setup(page, true);
    await page.goto("/organization/departments");
    await expect(page.getByRole("heading", { name: "Departments", level: 1 })).toBeVisible({ timeout: 15000 });

    // The member count is the way in to the roster.
    await page.getByLabel("Manage members").first().click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText("Neha Placed")).toBeVisible();
    await expect(page.getByText("Senior KAM")).toBeVisible();

    // The person in no department is offered, and flagged as unassigned.
    const picker = page.getByRole("dialog").getByLabel("Add", { exact: true });
    await expect(picker).toBeVisible();
    await expect(picker.locator("option", { hasText: "Sam Stranded" })).toHaveCount(1);
    // ...and the one already in this department is not offered twice.
    await expect(picker.locator("option", { hasText: "Neha Placed" })).toHaveCount(0);

    await expect(page.getByLabel("Remove from department").first()).toBeVisible();
  });

  test("department roster is read-only without can_manage_org", async ({ page }) => {
    await setup(page, false);
    await page.goto("/organization/departments");
    await expect(page.getByRole("heading", { name: "Departments", level: 1 })).toBeVisible({ timeout: 15000 });

    await page.getByLabel("Manage members").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // The roster is still readable ...
    await expect(page.getByText("Neha Placed")).toBeVisible();
    // ... but nothing can be changed from here.
    await expect(page.getByRole("dialog").getByLabel("Add", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Remove from department")).toHaveCount(0);
  });

  test("directory surfaces people who are in no department", async ({ page }) => {
    await setup(page, true);
    await page.goto("/organization/directory");
    await expect(page.getByRole("heading", { name: "Directory", level: 1 })).toBeVisible({ timeout: 15000 });

    // Placed people appear under their department. Scoped to the row, since the
    // name also appears as an <option> in every manager picker.
    await expect(page.locator("div.font-medium", { hasText: "Neha Placed" })).toBeVisible();

    // The unplaced person gets their own group with an explanation — the whole
    // point, since a department-first view cannot show them at all.
    await expect(page.getByRole("heading", { name: /^unassigned$/i })).toBeVisible();
    await expect(page.locator("div.font-medium", { hasText: "Sam Stranded" })).toBeVisible();
    await expect(page.getByText(/can't be routed service desk work/i)).toBeVisible();

    // Reporting lines are editable for a manager.
    await expect(page.getByLabel("Reports to").first()).toBeVisible();
  });

  test("directory shows reporting lines as text for a read-only caller", async ({ page }) => {
    await setup(page, false);
    await page.goto("/organization/directory");
    await expect(page.getByRole("heading", { name: "Directory", level: 1 })).toBeVisible({ timeout: 15000 });

    // The manager's name is rendered, but not as an editable control.
    await expect(page.getByText("Neha Placed").first()).toBeVisible();
    await expect(page.locator("select[aria-label='Reports to']")).toHaveCount(0);
  });
});
