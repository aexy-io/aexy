/**
 * The screenshots in `docs/tickets-and-projects.md`.
 *
 * Seeded by `seed_marketing_demo.py --workspace <id>`, which builds a support
 * queue mid-week: two untriaged, one in progress, one waiting on the person who
 * raised it, one resolved. Deliberately *not* the Service Desk's tickets —
 * both modules store rows in the same table, and the demo has to show that they
 * are different queues.
 *
 * See `harness.ts` for the run command and the shared capture settings.
 */

import { expect, test } from "@playwright/test";

import {
  API_BASE,
  authHeaders,
  backendOnlyReady,
  setupAiLiveAuth,
  REAL_BACKEND_WORKSPACE_ID,
} from "../fixtures/ai-env";
import { SHOT_CONTEXT, createShooter, forceLightTheme, ready } from "./harness";

const shooter = createShooter("tickets-and-projects");
const WS = `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}`;

interface Ticket {
  id: string;
  title: string | null;
  status: string;
}

test.describe("ticketing screenshots", () => {
  test.describe.configure({ mode: "default" });

  test.use(SHOT_CONTEXT);

  let tickets: Ticket[] = [];
  let formToken = "";

  test.beforeAll(async ({ request }) => {
    const probe = await backendOnlyReady();
    test.skip(!probe.ok, `docs screenshots need a live stack — ${probe.reason}`);

    const list = await request.get(`${WS}/tickets?limit=25`, {
      headers: authHeaders(),
    });
    if (list.ok()) tickets = ((await list.json()) as { tickets: Ticket[] }).tickets;

    const forms = await request.get(`${WS}/ticket-forms`, {
      headers: authHeaders(),
    });
    if (forms.ok()) {
      const found = ((await forms.json()) as { slug: string; public_url_token: string }[])
        .find((f) => f.slug === "support");
      formToken = found?.public_url_token ?? "";
    }
  });

  test.beforeEach(async ({ page }) => {
    await setupAiLiveAuth(page);
    await forceLightTheme(page);
  });

  test("the demo workspace has a support queue", async () => {
    test.skip(
      tickets.length === 0,
      "no tickets — run seed_marketing_demo.py --workspace <id> first",
    );
    expect(tickets.length).toBeGreaterThan(0);
  });

  test("queue — form tickets in the work list", async ({ page }) => {
    test.skip(tickets.length === 0, "nothing to photograph");

    // Not `/tickets`. That route is a redirect to the dashboard: the queue is a
    // source filter inside the My Work widget, which is a thing the guide has
    // to say out loud, because the old documentation listed `/tickets` as the
    // ticket list and it has not been one for a while.
    await page.goto("/dashboard");
    await ready(page);

    const widget = page.getByTestId("my-work-queue");
    await expect(widget).toBeVisible({ timeout: 20_000 });
    await widget.getByRole("button", { name: "Tickets", exact: true }).click();

    // Everyone's, not just the signed-in user's: the queue only means
    // something as a queue. It defaults to "assigned to me", which on a seeded
    // desk is two rows out of five.
    await widget.getByTestId("my-work-only-mine").click();

    // Matched on the requester, because that is what a row shows — the widget
    // labels a ticket by who raised it, not by its subject. Asserting on the
    // subject waits for text this page never renders.
    await expect(widget.getByText("Tom Whitfield").first()).toBeVisible({
      timeout: 20_000,
    });

    await shooter.shoot(page, "queue", '[data-testid="my-work-queue"]');
  });

  test("ticket-detail — one request and its thread", async ({ page }) => {
    const target = tickets.find((t) => t.status === "in_progress") ?? tickets[0];
    test.skip(!target, "no ticket to open");

    await page.goto(`/tickets/${target.id}`);
    await ready(page);
    await expect(page.getByText(target.title!).first()).toBeVisible({
      timeout: 20_000,
    });

    await shooter.shoot(page, "ticket-detail", "main");
  });

  test("form-builder — the form the queue is fed by", async ({ page }) => {
    await page.goto("/settings/ticket-forms");
    await ready(page);
    await expect(page.getByText("Support").first()).toBeVisible({
      timeout: 20_000,
    });

    await shooter.shoot(page, "form-builder", "main");
  });

  test("public-form — what the person raising it sees", async ({ page }) => {
    test.skip(!formToken, "the support form has no public token");

    // The public page, so no auth bootstrap — that is the point of it. It has
    // no `main` landmark either, being outside the app shell.
    await page.goto(`/public/forms/${formToken}`);
    await ready(page, "form, body");

    await shooter.shoot(page, "public-form");
  });

  test.afterAll(() => shooter.report());
});
