import { expect, test } from "@playwright/test";

import {
  API_BASE,
  WORKSPACE_ID,
  baseDriveFile,
  setupDriveMocks,
} from "./fixtures/drive-mock-data";

test.describe("Drive — multi-file upload", () => {
  test("uploads two files via the dropzone and reflects them in the list", async ({ page }) => {
    let uploadCalls = 0;
    let lastUploadBytes = 0;

    await setupDriveMocks(page, {
      files: [],
      onUploadFiles: async (route) => {
        uploadCalls += 1;
        lastUploadBytes = route.request().postDataBuffer()?.length ?? 0;
        const created = {
          ...baseDriveFile,
          id: `df-new-${uploadCalls}`,
          file_name: `new-${uploadCalls}.txt`,
          ai_status: "pending" as const,
        };
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ files: [created], total: 1 }),
        });
      },
    });

    await page.goto("/docs/drive");
    await expect(page.getByRole("heading", { name: /files\s*&\s*storage/i })).toBeVisible({
      timeout: 20000,
    });

    // Use the hidden input to drive setInputFiles directly.
    const input = page.getByTestId("drive-file-input");
    await input.setInputFiles([
      { name: "alpha.txt", mimeType: "text/plain", buffer: Buffer.from("alpha contents") },
      { name: "beta.txt", mimeType: "text/plain", buffer: Buffer.from("beta contents v2") },
    ]);

    // Per-file XHR upload — expect two POSTs.
    await expect.poll(() => uploadCalls).toBe(2);
    expect(lastUploadBytes).toBeGreaterThan(0);

    // Each item should land in the visible queue.
    await expect(page.getByTestId("drive-upload-item")).toHaveCount(2);

    // Regression: the drain loop used to re-dispatch the same pending item
    // once per concurrency slot (`setQueue` is async, so the queue snapshot
    // still reported it as pending), producing MAX_CONCURRENT rows and
    // MAX_CONCURRENT AI summaries for a single picked file. Settle, then
    // assert exactly one POST per file.
    await expect(page.getByTestId("drive-upload-item").first()).toHaveAttribute(
      "data-status",
      "done",
    );
    await expect(page.getByTestId("drive-upload-item").last()).toHaveAttribute(
      "data-status",
      "done",
    );
    await page.waitForTimeout(500);
    expect(uploadCalls, "one upload per picked file — no duplicate dispatch").toBe(2);
  });
});
