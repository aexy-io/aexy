/**
 * Importing a Notion or Confluence export.
 *
 * Mocked, so it runs in the ordinary suite: the point is the screen, and the
 * import itself is a background job whose behaviour belongs to the backend
 * tests. What is asserted here is the sequence a person goes through - pick an
 * archive, choose a destination, watch it, and see the pages that would not
 * convert - plus the two refusals that happen before anything is uploaded.
 *
 * The progress mock **advances**: the first poll is still importing and the
 * second is finished. A fixed response would let a spec pass against a UI that
 * never polls at all.
 */

import { test, expect, Page } from "@playwright/test";
import { mockUser } from "./fixtures/mock-data";

const API_BASE = "http://localhost:8000/api/v1";

const mockWorkspace = {
  id: "ws-1",
  name: "Northwind",
  slug: "northwind",
  type: "business",
  avatar_url: null,
  owner_id: "test-user-123",
  member_count: 6,
  team_count: 3,
  is_active: true,
};

const mockSpaces = [
  {
    id: "space-1",
    workspace_id: "ws-1",
    name: "Engineering",
    slug: "engineering",
    icon: "B",
    color: "#6366F1",
    is_default: true,
    is_archived: false,
    document_count: 3,
  },
];

const RUNNING = {
  id: "job-1",
  source: "confluence",
  status: "importing",
  space_id: "space-1",
  archive_name: "space-export.zip",
  total_pages: 120,
  imported_pages: 45,
  failed_pages: 0,
  warnings: [] as string[],
  error: null,
  created_at: "2026-09-05T09:00:00Z",
  completed_at: null,
};

const PARTIAL = {
  ...RUNNING,
  status: "partial",
  imported_pages: 118,
  failed_pages: 2,
  warnings: [
    "Release checklist - table with merged cells could not be converted",
    "Runbook (old) - attachment missing from the archive",
  ],
  completed_at: "2026-09-05T09:04:00Z",
};

async function setup(
  page: Page,
  options: { startStatus?: number; startBody?: unknown } = {},
) {
  await page.addInitScript(() => {
    localStorage.setItem("token", "fake-test-token");
    localStorage.setItem("current_workspace_id", "ws-1");
  });
  await page.context().addCookies([
    { name: "aexy_authed", value: "1", url: "http://localhost:3000" },
  ]);

  let polls = 0;

  // Catch-all FIRST (Playwright checks routes last-registered-first).
  await page.route(`${API_BASE}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.route(`${API_BASE}/workspaces`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([mockWorkspace]),
    }),
  );
  await page.route(`${API_BASE}/developers/me`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockUser),
    }),
  );
  await page.route(`${API_BASE}/notifications**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );

  await page.route(`${API_BASE}/workspaces/**`, (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (url.includes("/documents/import/") && url.endsWith("/retry")) {
      return json({
        job_id: "job-1",
        source: "confluence",
        total_pages: 120,
        status: "pending",
      });
    }
    if (method === "POST" && url.includes("/documents/import")) {
      return json(
        options.startBody ?? {
          job_id: "job-1",
          source: "confluence",
          total_pages: 120,
          status: "pending",
        },
        options.startStatus ?? 202,
      );
    }
    if (url.match(/\/documents\/import\/[^/]+$/)) {
      polls += 1;
      return json(polls === 1 ? RUNNING : PARTIAL);
    }
    if (url.endsWith("/documents/import")) return json([]);
    // AppAccessGuard renders "Access to Docs" instead of the page unless the
    // docs app comes back enabled, so an empty apps map fails every test here
    // on a screen that has nothing to do with importing.
    if (url.includes("/apps/effective") || url.includes("/app-access/"))
      return json({
        apps: { docs: { enabled: true, modules: {} } },
        applied_template_id: null,
        applied_template_name: null,
        has_custom_overrides: false,
        is_admin: true,
      });
    if (url.match(/\/spaces(\?|$)/)) return json(mockSpaces);
    if (
      url.match(
        /\/(spaces|documents|members|invites|task-statuses|teams|projects|notifications)/,
      )
    )
      return json([]);
    if (url.endsWith("/workspaces/ws-1")) return json(mockWorkspace);
    return json({});
  });
}

/** A .zip the browser will accept from the file input. */
const archive = {
  name: "space-export.zip",
  mimeType: "application/zip",
  buffer: Buffer.from("PK" + "0".repeat(64)),
};

async function openDialog(page: Page) {
  await page.goto("/docs");
  await page.getByTestId("sidebar-import-wiki").click();
  await expect(page.getByTestId("import-wiki-modal")).toBeVisible({
    timeout: 15000,
  });
}

test.describe("Wiki import", () => {
  test("uploads an archive and follows the job to its end", async ({ page }) => {
    await setup(page);
    await openDialog(page);

    await page.getByTestId("import-wiki-file").setInputFiles(archive);
    await page.getByTestId("import-wiki-space").selectOption("space-1");

    // The request itself is asserted, not just the outcome: the destination is
    // a query parameter, and a UI that silently dropped it would still show a
    // perfectly convincing progress bar.
    const [request] = await Promise.all([
      page.waitForRequest(
        (r) => r.method() === "POST" && r.url().includes("/documents/import"),
      ),
      page.getByTestId("import-wiki-start").click(),
    ]);
    expect(request.url()).toContain("space_id=space-1");

    await expect(page.getByTestId("import-wiki-progress")).toBeVisible();

    // The second poll is terminal - and terminal with pages skipped, which is
    // not a failure and must not be shown as one.
    await expect(page.getByText("Imported, with pages skipped")).toBeVisible({
      timeout: 15000,
    });
    await expect(
      page.getByText(/merged cells could not be converted/),
    ).toBeVisible();
  });

  test("refuses an empty archive before uploading anything", async ({ page }) => {
    await setup(page);
    await openDialog(page);

    let uploaded = false;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().includes("/documents/import"))
        uploaded = true;
    });

    await page.getByTestId("import-wiki-file").setInputFiles({
      name: "empty.zip",
      mimeType: "application/zip",
      buffer: Buffer.alloc(0),
    });

    await expect(page.getByTestId("import-wiki-error")).toBeVisible();
    await expect(page.getByTestId("import-wiki-start")).toBeDisabled();
    expect(uploaded).toBe(false);
  });

  test("explains a refused import instead of failing silently", async ({
    page,
  }) => {
    await setup(page, {
      startStatus: 403,
      startBody: {
        detail: "Importing requires admin access to the destination space",
      },
    });
    await openDialog(page);

    await page.getByTestId("import-wiki-file").setInputFiles(archive);
    await page.getByTestId("import-wiki-start").click();

    await expect(page.getByTestId("import-wiki-error")).toContainText(/admin/i);
    await expect(page.getByTestId("import-wiki-progress")).toHaveCount(0);
  });
});
