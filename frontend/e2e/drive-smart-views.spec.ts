import { expect, test } from "@playwright/test";

import { setupDriveMocks } from "./fixtures/drive-mock-data";

const SMART_VIEW = {
  id: "sv-1",
  workspace_id: "ws-1",
  name: "Invoices",
  icon: null,
  color: null,
  filter_query: { all_tags: ["invoice"] },
  is_shared: false,
  created_by_id: "dev-1",
  created_at: "2026-04-25T10:00:00Z",
  updated_at: "2026-04-25T10:00:00Z",
};

test.describe("Drive — smart views", () => {
  test("creates a smart view with all_tags filter and POSTs the expected payload", async ({ page }) => {
    let createPayload: any = null;

    await setupDriveMocks(page, { smartViews: [] });

    // Override smart-views POST to capture payload.
    await page.route(
      "**/api/v1/workspaces/ws-1/drive/smart-views",
      async (route) => {
        if (route.request().method() === "POST") {
          createPayload = route.request().postDataJSON();
          await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({ ...SMART_VIEW, ...createPayload }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ smart_views: [] }),
          });
        }
      },
    );

    await page.goto("/docs/drive");
    await expect(page.getByRole("heading", { name: "Drive" })).toBeVisible({
      timeout: 20000,
    });

    await page.getByTestId("drive-new-smart-view").click();
    await expect(page.getByTestId("smart-view-editor")).toBeVisible();

    await page.getByTestId("smart-view-name").fill("Invoices");
    const tagInput = page.getByTestId("smart-view-all-tags").locator("input");
    await tagInput.fill("invoice");
    await tagInput.press("Enter");

    await page.getByTestId("smart-view-save").click();
    await expect.poll(() => createPayload).toBeTruthy();
    expect(createPayload).toMatchObject({
      name: "Invoices",
      filter_query: { all_tags: ["invoice"] },
    });
  });

  test("renders the smart view in the sidebar and lists its files when clicked", async ({
    page,
  }) => {
    await setupDriveMocks(page, { smartViews: [SMART_VIEW] });
    await page.route(
      "**/api/v1/workspaces/ws-1/drive/smart-views/sv-1/files",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            files: [
              {
                id: "df-2",
                workspace_id: "ws-1",
                parent_id: null,
                space_id: null,
                file_name: "invoice-april.pdf",
                file_url: "https://example.com/invoice-april.pdf",
                file_size_bytes: 102400,
                content_type: "application/pdf",
                kind: "pdf",
                uploaded_by_id: "dev-1",
                uploaded_at: "2026-04-26T10:00:00Z",
                updated_at: "2026-04-26T10:00:00Z",
                deleted_at: null,
                ai_status: "done",
                ai_error: null,
                ai_summary: "April invoice from supplier.",
                ai_tags: ["invoice", "april"],
                ai_categories: ["financial"],
                ai_processed_at: "2026-04-26T10:01:00Z",
              },
            ],
            total: 1,
          }),
        }),
    );

    await page.goto("/docs/drive");
    await expect(page.getByTestId("drive-smart-view-link")).toBeVisible({
      timeout: 20000,
    });
    await page.getByTestId("drive-smart-view-link").click();
    await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
    await expect(page.getByTestId("drive-smart-view-files")).toContainText(
      "invoice-april.pdf",
    );
  });
});
