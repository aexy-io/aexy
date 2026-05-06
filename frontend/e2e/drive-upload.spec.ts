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
    await expect(page.getByRole("heading", { name: "Drive" })).toBeVisible({
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
  });
});
