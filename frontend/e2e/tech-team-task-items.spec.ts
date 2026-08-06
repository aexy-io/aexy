import { expect, test, type Page } from "@playwright/test";

import {
  API_BASE,
  PROJECT_ID,
  makeTask,
  mockEffectiveAccess,
  setupTaskBoardMocks,
} from "./fixtures/task-test-helpers";

/**
 * The three things the tech team asked for after using the feature:
 * several people on one task, a progress-update stream separate from the
 * comment thread, and a History tab on tickets.
 *
 * These assert the parts that a type-check cannot: that a task with no primary
 * still shows its people rather than "Unassigned", and that the ticket page's
 * new tabs render the audit trail that was already being written but never read.
 */

const WORKSPACE_ID = "ws-1";
const TICKET_ID = "ticket-1";

test.describe("Several people on one task", () => {
  test("a card with a primary plus collaborators shows all of them", async ({ page }) => {
    await setupTaskBoardMocks(page, {
      tasks: [
        makeTask({
          id: "task-multi",
          title: "Paired work",
          status: "in_progress",
          assignee_id: "dev-1",
          assignee_name: "Ada",
          assignees: [
            { developer_id: "dev-1", name: "Ada", email: null, avatar_url: null, is_primary: true, added_by_id: null, created_at: null },
            { developer_id: "dev-2", name: "Grace", email: null, avatar_url: null, is_primary: false, added_by_id: null, created_at: null },
            { developer_id: "dev-3", name: "Linus", email: null, avatar_url: null, is_primary: false, added_by_id: null, created_at: null },
          ],
        }),
      ],
    });

    await page.goto(`sprints/${PROJECT_ID}/board`);

    const card = page.locator('[data-task-id="task-multi"]');
    await expect(card).toBeVisible({ timeout: 20000 });

    const stack = card.getByTestId("task-assignee-stack");
    await expect(stack).toHaveAttribute("data-assignee-count", "3");
    // The primary is named, with the rest counted.
    await expect(stack).toContainText("Ada");
    await expect(stack).toContainText("+2");
  });

  test("assignees with no primary are shown, not reported as Unassigned", async ({ page }) => {
    // The "everyone equally on this" arrangement: `assignee_id` is genuinely
    // null because nobody is individually accountable. Keying the card off that
    // column alone would render this as "Unassigned" — the opposite of true.
    await setupTaskBoardMocks(page, {
      tasks: [
        makeTask({
          id: "task-equal",
          title: "Shared work",
          status: "in_progress",
          assignee_id: null,
          assignee_name: null,
          assignees: [
            { developer_id: "dev-1", name: "Ada", email: null, avatar_url: null, is_primary: false, added_by_id: null, created_at: null },
            { developer_id: "dev-2", name: "Grace", email: null, avatar_url: null, is_primary: false, added_by_id: null, created_at: null },
          ],
        }),
      ],
    });

    await page.goto(`sprints/${PROJECT_ID}/board`);

    const card = page.locator('[data-task-id="task-equal"]');
    await expect(card).toBeVisible({ timeout: 20000 });

    const stack = card.getByTestId("task-assignee-stack");
    await expect(stack).toHaveAttribute("data-assignee-count", "2");
    await expect(stack).toContainText("2 assignees");
    await expect(card).not.toContainText("Unassigned");
  });

  test("a task nobody is on still reads as Unassigned", async ({ page }) => {
    await setupTaskBoardMocks(page, {
      tasks: [
        makeTask({ id: "task-nobody", title: "Orphan work", status: "todo", assignees: [] }),
      ],
    });

    await page.goto(`sprints/${PROJECT_ID}/board`);

    const card = page.locator('[data-task-id="task-nobody"]');
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card).toContainText("Unassigned");
    await expect(card.getByTestId("task-assignee-stack")).toHaveCount(0);
  });
});

// ── ticket detail: Updates and History tabs ─────────────────────────────

function ticketPayload() {
  return {
    id: TICKET_ID,
    form_id: "form-1",
    form_name: "Support request",
    workspace_id: WORKSPACE_ID,
    ticket_number: 42,
    submitter_email: "customer@example.test",
    submitter_name: "A Customer",
    email_verified: true,
    field_values: { summary: "Login fails on mobile" },
    attachments: [],
    status: "in_progress",
    priority: "high",
    severity: null,
    assignee_id: null,
    assignee_name: null,
    team_id: null,
    team_name: null,
    external_issues: [],
    linked_task_id: null,
    linked_crm_contact: null,
    customer_impact: null,
    affected_customers_count: null,
    first_response_at: null,
    resolved_at: null,
    closed_at: null,
    sla_due_at: null,
    sla_breached: false,
    created_at: "2026-08-01T09:00:00Z",
    updated_at: "2026-08-01T09:00:00Z",
  };
}

async function setupTicketMocks(
  page: Page,
  options: { timeline?: unknown[]; updates?: unknown[] } = {},
) {
  // Reuse the auth/workspace/notification scaffolding, then override with the
  // ticket routes. Playwright matches the most recently registered route first,
  // so these win over the catch-all.
  await setupTaskBoardMocks(page);

  // The base fixture enables only dashboard/sprints/settings, so the `tickets`
  // app reads as disabled and the page renders the "Request Access" gate instead
  // of the ticket.
  await page.route(
    `${API_BASE}/workspaces/${WORKSPACE_ID}/app-access/members/dev-1/effective`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...mockEffectiveAccess,
          apps: {
            ...mockEffectiveAccess.apps,
            tickets: { app_id: "tickets", enabled: true, modules: {} },
          },
        }),
      }),
  );

  await page.route(`${API_BASE}/workspaces/${WORKSPACE_ID}/tickets/${TICKET_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ticketPayload()),
    }),
  );

  await page.route(
    `${API_BASE}/workspaces/${WORKSPACE_ID}/tickets/${TICKET_ID}/responses**`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "resp-1",
            ticket_id: TICKET_ID,
            author_id: "dev-1",
            author_name: "Ada",
            author_email: null,
            is_internal: false,
            content: "Thanks, taking a look.",
            old_status: null,
            new_status: null,
            created_at: "2026-08-01T10:00:00Z",
          },
        ]),
      }),
  );

  await page.route(
    `${API_BASE}/workspaces/${WORKSPACE_ID}/activities/timeline/ticket/${TICKET_ID}**`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          entity_type: "ticket",
          entity_id: TICKET_ID,
          total: (options.timeline ?? []).length,
          entries: options.timeline ?? [],
        }),
      }),
  );

  await page.route(
    `${API_BASE}/workspaces/${WORKSPACE_ID}/work-updates/ticket/${TICKET_ID}`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: options.updates ?? [],
          total: (options.updates ?? []).length,
        }),
      }),
  );
}

test.describe("Ticket History tab", () => {
  test("renders the audit trail, resolving assignment ids to names", async ({ page }) => {
    await setupTicketMocks(page, {
      timeline: [
        {
          id: "act-2",
          activity_type: "assigned",
          actor: { id: "dev-1", name: "Ada" },
          title: "Assigned ticket #42",
          changes: { assignee_id: { old: null, new: "dev-2" } },
          created_at: "2026-08-01T11:00:00Z",
          display_text: "Ada assigned this",
        },
        {
          id: "act-1",
          activity_type: "status_changed",
          actor: { id: "dev-1", name: "Ada" },
          title: "Changed status",
          changes: { status: { old: "new", new: "in_progress" } },
          created_at: "2026-08-01T10:30:00Z",
          display_text: "Ada changed status from new to in_progress",
        },
      ],
    });

    await page.goto(`tickets/${TICKET_ID}`);

    // Responses is the default tab.
    await expect(page.getByTestId("ticket-tab-responses")).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Thanks, taking a look.")).toBeVisible();

    await page.getByTestId("ticket-tab-history").click();

    const items = page.getByTestId("ticket-history-item");
    await expect(items).toHaveCount(2);

    // Oldest first, so the chain reads in the order it happened.
    await expect(items.nth(0)).toContainText("changed status");
    // Slugs render as the same words the picker above uses.
    await expect(items.nth(0)).toContainText("In Progress");
    // A raw developer id would be useless here.
    await expect(items.nth(1)).toContainText("assigned this to");
    await expect(items.nth(1)).not.toContainText("dev-2");
  });

  test("says so when a ticket has no history yet", async ({ page }) => {
    await setupTicketMocks(page, { timeline: [] });
    await page.goto(`tickets/${TICKET_ID}`);
    await page.getByTestId("ticket-tab-history").click();
    await expect(page.getByTestId("ticket-history-empty")).toBeVisible();
  });
});

test.describe("Progress updates", () => {
  test("the ticket Updates tab lists updates and marks edited ones", async ({ page }) => {
    await setupTicketMocks(page, {
      updates: [
        {
          id: "upd-1",
          entity_type: "ticket",
          entity_id: TICKET_ID,
          author_id: "dev-1",
          author_name: "Ada",
          author_email: null,
          author_avatar_url: null,
          body: "Reproduced on iOS 17. Waiting on the vendor SDK fix.",
          created_at: "2026-08-02T09:00:00Z",
          edited_at: "2026-08-02T09:30:00Z",
        },
      ],
    });

    await page.goto(`tickets/${TICKET_ID}`);
    await page.getByTestId("ticket-tab-updates").click();

    const items = page.getByTestId("work-update-item");
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText("Reproduced on iOS 17");
    await expect(items.first()).toContainText("Ada");
    await expect(items.first()).toContainText("edited");
  });

  test("posting an update sends the body and clears the box", async ({ page }) => {
    await setupTicketMocks(page, { updates: [] });

    let posted: string | null = null;
    await page.route(
      `${API_BASE}/workspaces/${WORKSPACE_ID}/work-updates/ticket/${TICKET_ID}`,
      async (route) => {
        if (route.request().method() === "POST") {
          posted = (route.request().postDataJSON() as { body: string }).body;
          return route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({
              id: "upd-new",
              entity_type: "ticket",
              entity_id: TICKET_ID,
              author_id: "dev-1",
              author_name: "Ada",
              author_email: null,
              author_avatar_url: null,
              body: posted,
              created_at: "2026-08-06T09:00:00Z",
              edited_at: null,
            }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [], total: 0 }),
        });
      },
    );

    await page.goto(`tickets/${TICKET_ID}`);
    await page.getByTestId("ticket-tab-updates").click();

    const box = page.getByTestId("work-update-input");
    await expect(box).toBeVisible({ timeout: 20000 });
    await box.fill("Vendor confirmed a fix for Thursday.");
    await page.getByTestId("work-update-submit").click();

    await expect.poll(() => posted).toBe("Vendor confirmed a fix for Thursday.");
    await expect(box).toHaveValue("");
  });

  test("an empty box cannot be posted", async ({ page }) => {
    await setupTicketMocks(page, { updates: [] });
    await page.goto(`tickets/${TICKET_ID}`);
    await page.getByTestId("ticket-tab-updates").click();
    await expect(page.getByTestId("work-update-submit")).toBeDisabled();
  });
});
