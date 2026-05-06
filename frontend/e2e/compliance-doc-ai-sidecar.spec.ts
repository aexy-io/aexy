import { expect, test } from "@playwright/test";

import {
  API_BASE,
  WORKSPACE_ID,
  mockEffectiveAccess,
  mockUser,
  mockWorkspace,
} from "./fixtures/task-test-helpers";

const DOC_ID = "doc-1";

test.describe("Compliance document AI sidecar", () => {
  test("the FileMetadataSidecar renders summary + tags on the doc detail page", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("token", "fake-test-token");
      localStorage.setItem("current_workspace_id", "ws-1");
    });

    // Catch-all → empty array.
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
    await page.route(`${API_BASE}/workspaces/${WORKSPACE_ID}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockWorkspace),
      }),
    );
    // Grant compliance + docs access to the dev user.
    await page.route(
      `${API_BASE}/workspaces/${WORKSPACE_ID}/app-access/members/dev-1/effective`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ...mockEffectiveAccess,
            apps: {
              ...mockEffectiveAccess.apps,
              compliance: {
                app_id: "compliance",
                enabled: true,
                modules: { document_center: true },
              },
              docs: { app_id: "docs", enabled: true, modules: {} },
            },
          }),
        }),
    );

    // Compliance doc detail.
    await page.route(
      `${API_BASE}/workspaces/${WORKSPACE_ID}/compliance/documents/${DOC_ID}`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: DOC_ID,
            workspace_id: WORKSPACE_ID,
            folder_id: null,
            name: "Vendor MSA 2026.pdf",
            description: "Master services agreement",
            file_key: `wsfiles/${DOC_ID}.pdf`,
            file_size: 234567,
            mime_type: "application/pdf",
            status: "active",
            version: 1,
            uploaded_by: "dev-1",
            created_at: "2026-04-25T10:00:00Z",
            updated_at: "2026-04-25T10:00:00Z",
            archived_at: null,
            tags: ["legal", "vendor"],
            download_url: "https://example.com/msa.pdf",
          }),
        }),
    );

    // Document links list (panel renders empty).
    await page.route(
      `${API_BASE}/workspaces/${WORKSPACE_ID}/compliance/documents/${DOC_ID}/links`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        }),
    );

    // AI metadata for compliance_document.
    await page.route(
      `${API_BASE}/workspaces/${WORKSPACE_ID}/files/compliance_document/${DOC_ID}/metadata`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            metadata_id: "fm-msa",
            source_type: "compliance_document",
            source_id: DOC_ID,
            ai_status: "done",
            ai_error: null,
            ai_summary:
              "Master services agreement with Acme Corp covering 2026.",
            ai_tags: ["msa", "vendor", "acme"],
            ai_categories: ["legal", "contracts"],
            ai_processed_at: "2026-04-25T10:05:00Z",
          }),
        }),
    );

    await page.goto(`/compliance/documents/${DOC_ID}`);

    const sidecar = page.getByTestId("file-metadata-sidecar");
    await expect(sidecar).toBeVisible({ timeout: 20000 });
    await expect(sidecar).toContainText("Master services agreement with Acme");
    // Tag chips.
    await expect(sidecar).toContainText("msa");
    await expect(sidecar).toContainText("acme");
    // Categories section.
    await expect(sidecar).toContainText("legal");
    await expect(sidecar).toContainText("contracts");
    // Reannotate button.
    await expect(sidecar.getByTestId("file-reannotate-btn")).toBeVisible();
  });
});
