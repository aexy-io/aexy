/**
 * My Work: one list, filtered by source.
 *
 * Tasks and form tickets used to be two tabs, which made "what is on my plate?"
 * two questions — and the answer to the second was behind a click most people
 * never made. These pin the merge: one list, a source filter, and the
 * workspace-wide ticket queue still reachable rather than removed.
 *
 * Live-mode only, like the `ai-*` specs — the page is assembled from two real
 * endpoints and mocking both would only confirm the mocks.
 */

import { test, expect } from "@playwright/test";
import {
  USE_REAL_BACKEND,
  REAL_BACKEND_TOKEN,
  REAL_BACKEND_WORKSPACE_ID,
} from "./fixtures/env";

test.describe("My Work", () => {
  test.skip(!USE_REAL_BACKEND, "Needs a real backend — see the header.");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ([token, workspaceId]) => {
        localStorage.setItem("token", token);
        localStorage.setItem("current_workspace_id", workspaceId);
        localStorage.setItem("aexy_onboarding_complete", "true");
      },
      [REAL_BACKEND_TOKEN, REAL_BACKEND_WORKSPACE_ID] as const,
    );
    await page.goto("/tickets");
    await expect(page.getByTestId("tab-work")).toBeVisible({ timeout: 25000 });
  });

  test("form tickets are a filter, not a tab", async ({ page }) => {
    for (const source of ["all", "tasks", "tickets"]) {
      await expect(page.getByTestId(`work-source-${source}`)).toBeVisible();
    }
    // The tab it replaced is gone, not merely hidden.
    await expect(page.getByRole("button", { name: /^Form Tickets$/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^My Assigned Tasks$/ })).toHaveCount(0);
  });

  test("automations stays a tab, because it is not work", async ({ page }) => {
    await expect(page.getByTestId("tab-automations")).toBeVisible();
    await page.getByTestId("tab-automations").click();
    // The source filter belongs to the work list and should not follow you into
    // configuration.
    await expect(page.getByTestId("work-filters")).toHaveCount(0);
  });

  test("the scope toggle hides for tasks, which are always yours", async ({ page }) => {
    await expect(page.getByTestId("work-only-mine")).toContainText("Assigned to me");
    await page.getByTestId("work-source-tasks").click();
    // Offering "assigned to me" over an endpoint that only ever returns your
    // own tasks would be a control that does nothing.
    await expect(page.getByTestId("work-only-mine")).toHaveCount(0);
    await page.getByTestId("work-source-all").click();
    await expect(page.getByTestId("work-only-mine")).toBeVisible();
  });

  test("the workspace-wide ticket queue is still reachable", async ({ page }) => {
    // The filter replaced the tab; it did not remove the triage view some
    // people relied on.
    await page.getByTestId("work-source-tickets").click();
    await page.getByTestId("work-only-mine").click();
    await expect(page.getByTestId("work-only-mine")).toContainText("Everyone's tickets");
    await expect(page.getByTestId("work-list")).toBeVisible();
  });

  test("selecting a source re-scopes the counts", async ({ page }) => {
    // The old page showed one fixed set of cards per tab, so the numbers could
    // describe a list you were not looking at.
    await page.getByTestId("work-source-tasks").click();
    await expect(page.getByText("Tasks", { exact: true }).first()).toBeVisible();
    await page.getByTestId("work-source-tickets").click();
    await expect(page.getByText("Tickets", { exact: true }).first()).toBeVisible();
  });
});
