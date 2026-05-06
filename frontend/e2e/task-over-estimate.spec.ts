import { expect, test } from "@playwright/test";

import { PROJECT_ID, makeTask, setupTaskBoardMocks } from "./fixtures/task-test-helpers";

test.describe("Task over-estimate badge", () => {
  test("shows Over estimate badge when actual cycle time exceeds estimated_hours", async ({ page }) => {
    await setupTaskBoardMocks(page, {
      tasks: [
        makeTask({
          id: "task-slow",
          title: "Slower than expected",
          status: "done",
          estimated_hours: 1,
          // 3-hour actual cycle time
          cycle_time_hours: 3,
          completed_at: "2026-04-25T13:00:00Z",
          work_started_at: "2026-04-25T10:00:00Z",
          started_at: "2026-04-25T10:00:00Z",
        }),
      ],
    });

    await page.goto(`sprints/${PROJECT_ID}/board`);

    const card = page.locator('[data-task-id="task-slow"]');
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card.getByTestId("over-estimate-badge")).toHaveText(/over estimate/i);
  });

  test("does NOT show Over estimate badge when actual cycle time is within estimate", async ({ page }) => {
    await setupTaskBoardMocks(page, {
      tasks: [
        makeTask({
          id: "task-fast",
          title: "Done in time",
          status: "done",
          estimated_hours: 5,
          cycle_time_hours: 2,
          completed_at: "2026-04-25T12:00:00Z",
          work_started_at: "2026-04-25T10:00:00Z",
          started_at: "2026-04-25T10:00:00Z",
        }),
      ],
    });

    await page.goto(`sprints/${PROJECT_ID}/board`);

    const card = page.locator('[data-task-id="task-fast"]');
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card.getByTestId("over-estimate-badge")).toHaveCount(0);
  });
});
