import { expect, test } from "@playwright/test";

import { setupDriveMocks } from "./fixtures/drive-mock-data";

test.describe("Drive — storage quota banner", () => {
  test("renders Overdue-style red banner when quota is exhausted", async ({
    page,
  }) => {
    await setupDriveMocks(page, {
      usage: {
        used_bytes: 1024 * 1024 * 1024 * 5,
        limit_bytes: 1024 * 1024 * 1024 * 5,
        unlimited: false,
        percent_used: 100,
        files_count: 800,
      },
    });

    await page.goto("/docs/drive");
    const banner = page.getByTestId("drive-quota-banner");
    await expect(banner).toBeVisible({ timeout: 20000 });
    await expect(banner).toHaveAttribute("data-quota-state", "full");
    await expect(banner).toContainText(/storage limit reached/i);
  });

  test("renders amber warning at 90 percent", async ({ page }) => {
    await setupDriveMocks(page, {
      usage: {
        used_bytes: Math.round(1024 * 1024 * 1024 * 4.5),
        limit_bytes: 1024 * 1024 * 1024 * 5,
        unlimited: false,
        percent_used: 90,
        files_count: 700,
      },
    });

    await page.goto("/docs/drive");
    const banner = page.getByTestId("drive-quota-banner");
    await expect(banner).toBeVisible({ timeout: 20000 });
    await expect(banner).toHaveAttribute("data-quota-state", "warning");
  });

  test("does not render banner when usage is under 80 percent", async ({
    page,
  }) => {
    await setupDriveMocks(page, {
      usage: {
        used_bytes: 1024 * 1024 * 1024,
        limit_bytes: 1024 * 1024 * 1024 * 5,
        unlimited: false,
        percent_used: 20,
        files_count: 50,
      },
    });

    await page.goto("/docs/drive");
    await expect(page.getByRole("heading", { name: "Drive" })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByTestId("drive-quota-banner")).toHaveCount(0);
  });
});
