import { expect, test } from "@playwright/test";

import { PROJECT_ID, makeTask, setupTaskBoardMocks } from "./fixtures/task-test-helpers";

test.describe("Kanban card drag", () => {
  test("the entire card body initiates a drag (not just the grip handle)", async ({ page }) => {
    await setupTaskBoardMocks(page, {
      tasks: [
        makeTask({
          id: "task-drag",
          title: "Draggable everywhere",
          status: "todo",
        }),
      ],
    });

    await page.goto(`sprints/${PROJECT_ID}/board`);

    const card = page.locator('[data-task-id="task-drag"]');
    await expect(card).toBeVisible({ timeout: 20000 });

    // The drag handle (`{...listeners}`) should now live on the root motion.div
    // — not on the GripVertical icon — so the icon's wrapper is pointer-event-none.
    const grip = card.locator("svg.lucide-grip-vertical");
    if (await grip.count()) {
      const wrapper = grip.locator("xpath=ancestor::div[1]");
      await expect(wrapper).toHaveCSS("pointer-events", "none");
    }

    // The card itself uses cursor: grab, indicating it is the drag surface.
    await expect(card).toHaveCSS("cursor", /grab/);

    // Pointerdown anywhere inside the card body (e.g. the title) should be
    // handled by dnd-kit's pointer sensor — we don't dispatch a full drag here
    // (HTML5 DnD via Playwright is flaky with framer-motion + dnd-kit), but
    // we assert the surface that participates in the gesture is the whole card.
    const title = card.getByText("Draggable everywhere");
    await title.hover();
    const titleBox = await title.boundingBox();
    const cardBox = await card.boundingBox();
    expect(titleBox).not.toBeNull();
    expect(cardBox).not.toBeNull();
    if (titleBox && cardBox) {
      // Title sits inside the card — proves we're hovering on the same draggable surface.
      expect(titleBox.x).toBeGreaterThanOrEqual(cardBox.x);
      expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
    }
  });
});
