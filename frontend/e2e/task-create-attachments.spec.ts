import { expect, test } from "@playwright/test";

import {
  API_BASE,
  PROJECT_ID,
  SPRINT_ID,
  makeTask,
  setupTaskBoardMocks,
} from "./fixtures/task-test-helpers";

const NEW_TASK_ID = "task-new";

test.describe("Task creation: attachments + dates + estimated hours", () => {
  test("submits new fields and uploads selected files after creation", async ({ page }) => {
    const calls = { created: 0, attachments: 0 };
    const captured: { taskBody?: Record<string, unknown>; attachmentBodyLength?: number } = {};

    await setupTaskBoardMocks(page);

    // POST /sprints/:sprint_id/tasks creates the new task — capture the body.
    await page.route(`${API_BASE}/sprints/${SPRINT_ID}/tasks`, async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
        return;
      }
      if (method === "POST") {
        calls.created += 1;
        captured.taskBody = route.request().postDataJSON();
        const created = makeTask({ id: NEW_TASK_ID, title: (captured.taskBody as { title: string }).title });
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(created) });
        return;
      }
      await route.fallback();
    });

    // POST /attachments accepts multipart with N files — capture raw body length to verify a non-empty payload.
    await page.route(
      `${API_BASE}/sprints/${SPRINT_ID}/tasks/${NEW_TASK_ID}/attachments`,
      async (route) => {
        calls.attachments += 1;
        const buf = route.request().postDataBuffer();
        captured.attachmentBodyLength = buf?.length ?? 0;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ attachments: [] }),
        });
      },
    );

    await page.goto(`sprints/${PROJECT_ID}/board`);
    await page.getByRole("button", { name: /Add Task|New Task/i }).first().click();

    // Title is required.
    await page.getByPlaceholder("What needs to be done?").fill("Schedule + estimates demo");

    // Pick a sprint so the create POST hits /sprints/:sprint_id/tasks (not the
    // project-backlog endpoint, which has no attachment support yet). The
    // Sprint dropdown is uniquely identifiable by its placeholder option.
    await page
      .locator('select:has(option:text("Project Backlog (No Sprint)"))')
      .selectOption("sprint-1");

    // Schedule
    await page.getByTestId("task-start-date").fill("2026-05-10T09:00");
    await page.getByTestId("task-end-date").fill("2026-05-12T17:00");

    // Estimated hours
    await page.getByTestId("task-estimated-hours").fill("8");

    // Two attachments
    await page.getByTestId("task-attachments-input").setInputFiles([
      { name: "spec.txt", mimeType: "text/plain", buffer: Buffer.from("hello world") },
      { name: "diagram.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    ]);

    await expect(page.getByTestId("task-attachments-list")).toContainText("spec.txt");
    await expect(page.getByTestId("task-attachments-list")).toContainText("diagram.png");

    await page.getByTestId("create-task-submit").click();

    // Wait for both calls
    await expect.poll(() => calls.created).toBe(1);
    await expect.poll(() => calls.attachments).toBe(1);

    expect(captured.taskBody).toMatchObject({
      title: "Schedule + estimates demo",
      estimated_hours: 8,
    });
    expect(captured.taskBody?.start_date).toBeTruthy();
    expect(captured.taskBody?.end_date).toBeTruthy();
    expect(captured.attachmentBodyLength ?? 0).toBeGreaterThan(0);
  });
});
