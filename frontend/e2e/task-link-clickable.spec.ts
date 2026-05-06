import { expect, test } from "@playwright/test";

import { PROJECT_ID, makeTask, setupTaskBoardMocks } from "./fixtures/task-test-helpers";

const TASK_ID = "task-link";

test.describe("Task description link clickability", () => {
  test("links rendered in description are clickable and open in a new tab", async ({ page }) => {
    // Pre-seed the task with a description_json containing a link mark, so the
    // editor renders an <a target="_blank"> element on open.
    const taskWithLink = makeTask({
      id: TASK_ID,
      title: "Link test",
      description: "https://example.com",
      description_json: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                marks: [
                  {
                    type: "link",
                    attrs: {
                      href: "https://example.com",
                      target: "_blank",
                      rel: "noopener noreferrer nofollow",
                    },
                  },
                ],
                text: "https://example.com",
              },
            ],
          },
        ],
      },
    });

    await setupTaskBoardMocks(page, { tasks: [taskWithLink] });

    await page.goto(`sprints/${PROJECT_ID}/board?task=${TASK_ID}`);

    // The TipTap editor renders an anchor inside the dialog. It should have
    // target="_blank" and rel containing noopener — which together make a
    // user click open in a new tab without the modal stealing the click.
    const link = page
      .getByRole("dialog")
      .getByRole("link", { name: "https://example.com" });
    await expect(link).toBeVisible({ timeout: 20000 });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(link).toHaveAttribute("href", "https://example.com");
  });
});
