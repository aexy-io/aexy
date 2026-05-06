import { expect, test } from "@playwright/test";

import {
  PROJECT_ID,
  makeTask,
  setupTaskBoardMocks,
} from "./fixtures/task-test-helpers";

const TASK_ID = "task-with-ai-attachment";
const ATTACHMENT_ID = "att-ai-1";

test.describe("Task attachment AI tags + popover", () => {
  test("EditTaskModal renders AI tags inline and a popover summary on hover", async ({
    page,
  }) => {
    const taskWithAttachment = makeTask({
      id: TASK_ID,
      title: "Review supplier invoice",
      attachments: [
        {
          id: ATTACHMENT_ID,
          task_id: TASK_ID,
          file_url: "https://example.com/invoice.pdf",
          file_name: "supplier-invoice.pdf",
          file_size: 12345,
          content_type: "application/pdf",
          uploaded_by: "dev-1",
          uploaded_at: "2026-04-25T10:00:00Z",
          ai: {
            metadata_id: "fm-1",
            source_type: "task_attachment",
            source_id: ATTACHMENT_ID,
            ai_status: "done",
            ai_error: null,
            ai_summary: "April invoice from supplier — total $4,200.",
            ai_tags: ["invoice", "april", "supplier"],
            ai_categories: ["financial"],
            ai_processed_at: "2026-04-25T10:05:00Z",
          },
        },
      ],
    });

    await setupTaskBoardMocks(page, { tasks: [taskWithAttachment] });

    await page.goto(`sprints/${PROJECT_ID}/board?task=${TASK_ID}`);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 20000 });

    // Inline tag strip should render the three AI tags (without hovering).
    const tagStrip = dialog.getByTestId("file-ai-tag-strip").first();
    await expect(tagStrip).toBeVisible();
    await expect(tagStrip).toContainText("invoice");
    await expect(tagStrip).toContainText("april");
    await expect(tagStrip).toContainText("supplier");

    // Hover the file name link → popover should appear with the summary.
    const anchor = dialog.getByTestId("file-metadata-popover-anchor").first();
    await anchor.hover();
    const popover = page.getByTestId("file-metadata-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("April invoice from supplier");
    // Popover also surfaces the categories line.
    await expect(popover).toContainText("financial");
  });
});
