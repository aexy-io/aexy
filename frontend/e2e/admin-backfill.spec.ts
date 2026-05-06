import { expect, test } from "@playwright/test";

import {
  API_BASE,
  mockEffectiveAccess,
  mockUser,
  mockWorkspace,
} from "./fixtures/task-test-helpers";

test.describe("Admin AI metadata backfill", () => {
  test("super-admin can start a backfill and the status pill polls", async ({
    page,
  }) => {
    let startPayload: any = null;
    let statusCalls = 0;

    await page.addInitScript(() => {
      localStorage.setItem("token", "fake-test-token");
      localStorage.setItem("current_workspace_id", "ws-1");
    });

    await page.route(`${API_BASE}/**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      }),
    );
    await page.route(`${API_BASE}/developers/me`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockUser),
      }),
    );
    await page.route(`${API_BASE}/workspaces`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([mockWorkspace]),
      }),
    );
    await page.route(`${API_BASE}/workspaces/ws-1`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockWorkspace),
      }),
    );
    await page.route(
      `${API_BASE}/workspaces/ws-1/app-access/members/dev-1/effective`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mockEffectiveAccess),
        }),
    );
    await page.route(`${API_BASE}/platform-admin/check`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ is_admin: true, platform_org_id: "ws-1" }),
      }),
    );
    // Plans list (not the focus of this test, but the page renders it).
    await page.route(`${API_BASE}/platform-admin/plans`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plans: [] }),
      }),
    );

    // Backfill endpoints.
    await page.route(
      `${API_BASE}/platform-admin/workspaces/ws-target/backfill-file-metadata`,
      async (route) => {
        startPayload = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            workspace_id: "ws-target",
            workflow_id: "file-ai-backfill-ws-target",
            queued_at: "2026-04-25T10:00:00Z",
          }),
        });
      },
    );
    await page.route(
      `${API_BASE}/platform-admin/workspaces/ws-target/backfill-file-metadata/status`,
      (route) => {
        statusCalls += 1;
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            workspace_id: "ws-target",
            workflow_id: "file-ai-backfill-ws-target",
            status: "running",
            enqueued: 5,
            skipped: 0,
            started_at: "2026-04-25T10:00:00Z",
            closed_at: null,
          }),
        });
      },
    );

    await page.goto("/admin/plans");
    const panel = page.getByTestId("admin-backfill-panel");
    await expect(panel).toBeVisible({ timeout: 30000 });

    await page.getByTestId("admin-backfill-workspace-id").fill("ws-target");
    await page.getByTestId("admin-backfill-start").click();

    await expect.poll(() => startPayload).toBeTruthy();
    await expect.poll(() => statusCalls).toBeGreaterThan(0);
    await expect(page.getByTestId("admin-backfill-status")).toHaveText(/running/i);
  });
});
