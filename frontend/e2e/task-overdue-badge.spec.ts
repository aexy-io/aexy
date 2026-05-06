import { expect, test } from "@playwright/test";

import { PROJECT_ID, makeTask, setupTaskBoardMocks } from "./fixtures/task-test-helpers";

test.describe("Task overdue badge", () => {
  test("renders Overdue badge when end_date is in the past and task is not done", async ({ page }) => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    await setupTaskBoardMocks(page, {
      tasks: [
        makeTask({
          id: "task-overdue",
          title: "Late task",
          status: "in_progress",
          end_date: yesterday,
        }),
      ],
    });

    await page.goto(`sprints/${PROJECT_ID}/board`);

    const card = page.locator('[data-task-id="task-overdue"]');
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card.getByTestId("overdue-badge")).toHaveText(/overdue/i);
  });

  test("does NOT render Overdue badge for a done task even if end_date is past", async ({ page }) => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    await setupTaskBoardMocks(page, {
      tasks: [
        makeTask({
          id: "task-done-late",
          title: "Late but done",
          status: "done",
          end_date: yesterday,
        }),
      ],
    });

    await page.goto(`sprints/${PROJECT_ID}/board`);

    const card = page.locator('[data-task-id="task-done-late"]');
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card.getByTestId("overdue-badge")).toHaveCount(0);
  });
});
