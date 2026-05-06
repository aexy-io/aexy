import type { Page, Route } from "@playwright/test";

import {
  API_BASE,
  WORKSPACE_ID,
  mockEffectiveAccess,
  mockMember,
  mockUser,
  mockWorkspace,
} from "./task-test-helpers";

export { API_BASE, WORKSPACE_ID } from "./task-test-helpers";

export const baseDriveFile = {
  id: "df-1",
  workspace_id: WORKSPACE_ID,
  parent_id: null,
  space_id: null,
  file_name: "design-spec.pdf",
  file_url: "https://example.com/design-spec.pdf",
  file_size_bytes: 524288,
  content_type: "application/pdf",
  kind: "pdf" as const,
  uploaded_by_id: "dev-1",
  uploaded_at: "2026-04-25T10:00:00Z",
  updated_at: "2026-04-25T10:00:00Z",
  deleted_at: null,
  ai_status: "done" as const,
  ai_error: null,
  ai_summary: "A product design specification covering Drive's Phase 1.",
  ai_tags: ["design-spec", "product"],
  ai_categories: ["product"],
  ai_processed_at: "2026-04-25T10:01:00Z",
};

export const defaultUsage = {
  used_bytes: 1024 * 1024 * 100, // 100 MB
  limit_bytes: 1024 * 1024 * 1024 * 5, // 5 GB
  unlimited: false,
  percent_used: 1.95,
  files_count: 12,
};

/**
 * Install the auth + workspace + drive route mocks needed to render
 * /docs/drive and the admin plans page. Specs layer specific overrides on
 * top of the catch-all by re-registering routes — Playwright's last-
 * registered route wins.
 */
export async function setupDriveMocks(
  page: Page,
  options: {
    files?: Array<Record<string, unknown>>;
    usage?: Partial<typeof defaultUsage>;
    smartViews?: Array<Record<string, unknown>>;
    onUploadFiles?: (route: Route) => Promise<void> | void;
  } = {},
) {
  const files = options.files ?? [baseDriveFile];
  const usage = { ...defaultUsage, ...(options.usage ?? {}) };
  const smartViews = options.smartViews ?? [];

  await page.addInitScript(() => {
    localStorage.setItem("token", "fake-test-token");
    localStorage.setItem("current_workspace_id", "ws-1");
  });

  // Permissive catch-all
  await page.route(`${API_BASE}/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  // Notifications + auth
  await page.route(`${API_BASE}/notifications/count**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ count: 0 }) }),
  );
  await page.route(`${API_BASE}/notifications/poll**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [], latest_timestamp: null }),
    }),
  );
  await page.route(`${API_BASE}/notifications**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        notifications: [],
        total: 0,
        page: 1,
        per_page: 20,
        has_next: false,
        unread_count: 0,
      }),
    }),
  );
  await page.route(`${API_BASE}/developers/me`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockUser) }),
  );
  await page.route(`${API_BASE}/workspaces`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([mockWorkspace]) }),
  );
  await page.route(`${API_BASE}/workspaces/${WORKSPACE_ID}`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockWorkspace) }),
  );
  await page.route(`${API_BASE}/workspaces/${WORKSPACE_ID}/members**`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([mockMember]) }),
  );
  // Override the base effective-access fixture so the `docs` app (which guards
  // `/docs/drive`) reads as enabled.
  const effectiveAccess = {
    ...mockEffectiveAccess,
    apps: {
      ...mockEffectiveAccess.apps,
      docs: { app_id: "docs", enabled: true, modules: {} },
    },
  };
  await page.route(
    `${API_BASE}/workspaces/${WORKSPACE_ID}/app-access/members/dev-1/effective`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(effectiveAccess),
      }),
  );

  // Drive endpoints
  await page.route(
    new RegExp(`/api/v1/workspaces/${WORKSPACE_ID}/drive/files\\?.*`),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ files, total: files.length }),
      }),
  );
  await page.route(
    `${API_BASE}/workspaces/${WORKSPACE_ID}/drive/files`,
    async (route) => {
      const method = route.request().method();
      if (method === "POST" && options.onUploadFiles) {
        await options.onUploadFiles(route);
        return;
      }
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ files, total: files.length }),
        });
        return;
      }
      await route.fallback();
    },
  );
  await page.route(
    `${API_BASE}/workspaces/${WORKSPACE_ID}/drive/usage`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(usage),
      }),
  );
  await page.route(
    `${API_BASE}/workspaces/${WORKSPACE_ID}/drive/smart-views`,
    (route) => {
      const method = route.request().method();
      if (method === "GET") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ smart_views: smartViews }),
        });
      } else {
        route.fallback();
      }
    },
  );
}
