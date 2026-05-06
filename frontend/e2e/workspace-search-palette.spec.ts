import { expect, test } from "@playwright/test";

import {
  API_BASE,
  WORKSPACE_ID,
  setupDriveMocks,
} from "./fixtures/drive-mock-data";

test.describe("Cmd+Shift+F workspace file search palette", () => {
  test("opens, queries, lands on universal file detail on Enter", async ({
    page,
  }) => {
    await setupDriveMocks(page);

    // Mock the workspace search endpoint to return one hit.
    await page.route(
      `${API_BASE}/workspaces/${WORKSPACE_ID}/search/files**`,
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            results: [
              {
                metadata_id: "fm-1",
                source_type: "task_attachment",
                source_id: "att-1",
                workspace_id: WORKSPACE_ID,
                file_name: "invoice-april.pdf",
                file_url: "https://example.com/invoice-april.pdf",
                content_type: "application/pdf",
                ai_summary: "April invoice from supplier.",
                ai_tags: ["invoice", "april"],
                ai_categories: ["financial"],
                ai_status: "done",
                score: 0.91,
                highlights: ["April invoice"],
              },
            ],
          }),
        });
      },
    );
    await page.route(
      `${API_BASE}/workspaces/${WORKSPACE_ID}/files/task_attachment/att-1/metadata`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            metadata_id: "fm-1",
            source_type: "task_attachment",
            source_id: "att-1",
            ai_status: "done",
            ai_error: null,
            ai_summary: "April invoice from supplier.",
            ai_tags: ["invoice", "april"],
            ai_categories: ["financial"],
            ai_processed_at: "2026-04-25T10:00:00Z",
          }),
        }),
    );

    await page.goto("/docs/drive");
    await expect(page.getByRole("heading", { name: "Drive" })).toBeVisible({
      timeout: 20000,
    });

    // Trigger Cmd+Shift+F.
    await page.keyboard.press("Meta+Shift+F");
    await expect(page.getByTestId("workspace-search-palette")).toBeVisible();

    await page.getByTestId("workspace-search-input").fill("invoice");

    const result = page.getByTestId("workspace-search-result").first();
    await expect(result).toBeVisible({ timeout: 10000 });
    await expect(result).toHaveAttribute("data-source-type", "task_attachment");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/docs\/files\/task_attachment\/att-1$/);
  });
});
