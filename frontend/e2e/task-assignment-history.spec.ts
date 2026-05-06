import { expect, test } from "@playwright/test";

import {
  API_BASE,
  PROJECT_ID,
  SPRINT_ID,
  makeTask,
  mockMember,
  setupTaskBoardMocks,
} from "./fixtures/task-test-helpers";

const TASK_ID = "task-history";

test.describe("Task assignment history", () => {
  test("History tab shows the full reassignment chain ordered chronologically", async ({ page }) => {
    const member2 = { ...mockMember, id: "member-2", developer_id: "dev-2", developer_name: "Asha Rao", status: "active" };
    const member3 = { ...mockMember, id: "member-3", developer_id: "dev-3", developer_name: "Sharief K", status: "active" };

    await setupTaskBoardMocks(page, {
      tasks: [makeTask({ id: TASK_ID, title: "Reassigned task", assignee_id: "dev-3" })],
    });

    // Override workspace members to include three users so the History tab can resolve names.
    await page.route(`${API_BASE}/workspaces/ws-1/members**`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([mockMember, member2, member3]),
      });
    });

    // Activities: assigned A→B (older), then B→C (newest).
    await page.route(`${API_BASE}/sprints/${SPRINT_ID}/tasks/${TASK_ID}/activities**`, (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          activities: [
            {
              id: "act-2",
              task_id: TASK_ID,
              action: "assigned",
              actor_id: "dev-2",
              actor_name: "Asha Rao",
              actor_avatar_url: null,
              field_name: "assignee_id",
              old_value: "dev-2",
              new_value: "dev-3",
              comment: null,
              metadata: { from_assignee_id: "dev-2", to_assignee_id: "dev-3" },
              created_at: "2026-04-25T12:00:00Z",
            },
            {
              id: "act-1",
              task_id: TASK_ID,
              action: "assigned",
              actor_id: "dev-1",
              actor_name: "Dev User",
              actor_avatar_url: null,
              field_name: "assignee_id",
              old_value: "dev-1",
              new_value: "dev-2",
              comment: null,
              metadata: { from_assignee_id: "dev-1", to_assignee_id: "dev-2" },
              created_at: "2026-04-25T11:00:00Z",
            },
          ],
          total: 2,
        }),
      });
    });

    await page.goto(`sprints/${PROJECT_ID}/board?task=${TASK_ID}`);

    // Open History tab in the EditTaskModal.
    await page.getByTestId("task-tab-history").click();

    const items = page.getByTestId("task-history-item");
    await expect(items).toHaveCount(2, { timeout: 20000 });

    // Oldest event first (top), newest last — preserves the actual flow A→B→C.
    await expect(items.nth(0)).toContainText("Dev User");
    await expect(items.nth(0)).toContainText("Asha Rao");
    await expect(items.nth(1)).toContainText("Asha Rao");
    await expect(items.nth(1)).toContainText("Sharief K");
  });
});
