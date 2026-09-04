/**
 * The screenshots in `docs/service-desk.md`, taken from the running app.
 *
 * Two of them for now, chosen to prove the loop end to end before a dozen more
 * are written around it: one full-page shot and one element shot, which are the
 * only two things `shoot()` does.
 *
 * The desk is **not** seeded from here. Unlike the knowledge base — three pages
 * and a space, which a spec can POST in a second — a Service Desk that means
 * anything needs master data, a taxonomy, owners, and tickets whose pending-with
 * ledger has actually moved. That already exists as
 * `backend/scripts/seed_service_desk_reporting_demo.py`, written for the live
 * reports spec, and a second seeder would be a second thing to keep in step:
 *
 *   docker cp backend/scripts/seed_service_desk_reporting_demo.py aexy-backend:/tmp/
 *   docker exec aexy-backend python /tmp/seed_service_desk_reporting_demo.py
 *
 * So this spec reads the desk rather than writing it, and skips with an
 * instruction when it finds nothing. A screenshot of an empty state captioned
 * as the queue board is worse than a missing screenshot.
 *
 * See `harness.ts` for the run command and the shared capture settings.
 */

import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  API_BASE,
  authHeaders,
  backendOnlyReady,
  setupAiLiveAuth,
  REAL_BACKEND_WORKSPACE_ID,
} from "../fixtures/ai-env";
import { SHOT_CONTEXT, createShooter, forceLightTheme, ready } from "./harness";

const shooter = createShooter("service-desk");
const DESK = `${API_BASE}/workspaces/${REAL_BACKEND_WORKSPACE_ID}/service-desk`;

interface TicketRow {
  /**
   * The *generic* ticket id, which is what addresses a ticket everywhere else:
   * `/service-desk/tickets/{ticket_id}` in the app, and the same in the API.
   * The row's own `id` is the `service_desk_tickets` join row and 404s.
   */
  ticket_id: string;
  display_id: string | null;
}

/**
 * A ticket that has actually changed hands.
 *
 * The point of the timeline shot is the handoff ledger, so a ticket with one
 * segment photographs a single row and explains nothing. Checked against the
 * detail endpoint rather than guessed from the list, because the list does not
 * carry segments.
 */
async function ticketWithHandoffs(
  request: APIRequestContext,
): Promise<TicketRow | null> {
  const list = await request.get(`${DESK}/tickets?limit=50`, {
    headers: authHeaders(),
  });
  if (!list.ok()) return null;

  for (const row of (await list.json()) as TicketRow[]) {
    const detail = await request.get(`${DESK}/tickets/${row.ticket_id}`, {
      headers: authHeaders(),
    });
    if (!detail.ok()) continue;
    const { segments } = (await detail.json()) as { segments: unknown[] };
    if (segments && segments.length > 1) return row;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────

test.describe("service desk screenshots", () => {
  test.describe.configure({ mode: "default" });

  test.use(SHOT_CONTEXT);

  let handoffTicket: TicketRow | null = null;
  let ticketCount = 0;

  test.beforeAll(async ({ request }) => {
    const probe = await backendOnlyReady();
    test.skip(!probe.ok, `docs screenshots need a live stack — ${probe.reason}`);

    const list = await request.get(`${DESK}/tickets?limit=50`, {
      headers: authHeaders(),
    });
    ticketCount = list.ok() ? ((await list.json()) as TicketRow[]).length : 0;
    handoffTicket = await ticketWithHandoffs(request);
  });

  test.beforeEach(async ({ page }) => {
    await setupAiLiveAuth(page);
    await forceLightTheme(page);
  });

  test("the sample desk has tickets", async () => {
    test.skip(
      ticketCount === 0,
      "no tickets on this desk — run seed_service_desk_reporting_demo.py first",
    );
    expect(ticketCount).toBeGreaterThan(0);
  });

  test("dashboard — the queue board", async ({ page }) => {
    test.skip(ticketCount === 0, "no tickets to photograph");

    await page.goto("/service-desk");
    await ready(page);

    // Waited for the matrix specifically. The heading and the stat tiles render
    // while the dashboard query is still in flight, so `ready()` alone is
    // satisfied by a page whose subject has not arrived — and the shot comes
    // out as the module's signature screen with a hole in it.
    await expect(page.getByTestId("sd-matrix")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByTestId("sd-matrix").locator("tbody tr").first(),
    ).toBeVisible();

    // The main region rather than the whole window. It still carries the
    // tiles, the matrix and the ticket list — everything the doc is explaining
    // — while leaving out the signed-in user's name and email in the sidebar
    // footer and the floating support bubble, neither of which belongs in a
    // published screenshot even when the account is fictional.
    await shooter.shoot(page, "dashboard", "main");
  });

  test("ticket-timeline — where a ticket has been", async ({ page }) => {
    test.skip(
      !handoffTicket,
      "no ticket has changed hands — run seed_service_desk_reporting_demo.py first",
    );

    await page.goto(`/service-desk/tickets/${handoffTicket!.ticket_id}`);
    await ready(page);

    const timeline = page.getByTestId("sd-timeline");
    await expect(timeline).toBeVisible({ timeout: 20_000 });

    // More than one entry, asserted rather than hoped for: the reason this
    // ticket was chosen is that it changed hands, and if that stops being true
    // the shot silently becomes a picture of a single row.
    await expect(timeline.locator("ol > li").nth(1)).toBeVisible();

    // Element shot — the ledger is the subject, and a full page reduced to
    // article width makes its dates and durations unreadable.
    await shooter.shoot(page, "ticket-timeline", '[data-testid="sd-timeline"]');
  });

  test.afterAll(() => shooter.report());
});
