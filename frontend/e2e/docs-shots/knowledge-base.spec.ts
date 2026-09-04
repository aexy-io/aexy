/**
 * The screenshots in `docs/knowledge-base.md`, taken from the running app.
 *
 * Documentation screenshots normally die the same way: somebody takes twenty
 * by hand, the UI shifts, and two releases later every one is a picture of
 * software that no longer exists. Nothing catches it, because an image cannot
 * fail a build.
 *
 * So they are produced by a spec instead. That buys three things:
 *
 *   - **re-runnable** — a UI change is one command away from correct docs;
 *   - **seeded** — every shot shows the same coherent sample knowledge base,
 *     not whatever happened to be in somebody's dev database (which is also how
 *     a customer name reaches a public website);
 *   - **loud** — a selector that disappears fails the run, which is the
 *     earliest possible signal that a screenshot has gone stale.
 *
 * See `harness.ts` for how to run it, and for everything shared with the other
 * documents' shots. Skips itself with a reason when the stack is absent, rather
 * than failing — the ordinary `npm run test:e2e` run must not go red because
 * docs tooling needs a database.
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

const shooter = createShooter("knowledge-base");
const API = API_BASE;

/**
 * Matched on *name*, because the backend does not accept a slug.
 * `DocumentSpaceService.create` derives one from the name and de-duplicates it
 * with a counter, ignoring whatever the payload sends — so a fixed slug looks
 * like an idempotency key while matching nothing, and every run quietly adds
 * another space (`payments`, `payments-1`, `payments-2`…). Which it did: the
 * sidebar screenshot had three identical "Payments" entries in it.
 */
const SAMPLE_SPACE_NAME = "Payments";

/** A sample knowledge base, so the shots tell one coherent story. */
async function seed(
  request: APIRequestContext,
): Promise<Record<string, string>> {
  const ws = REAL_BACKEND_WORKSPACE_ID;
  const ids: Record<string, string> = {};

  // Idempotent: reuse the sample space if it is already there.
  //
  // Otherwise every run leaves another "Payments" space behind, and the tenth
  // run photographs a sidebar with ten identical entries — an ugly screenshot,
  // and a workspace nobody wants to tidy by hand.
  const existing = await request.get(`${API}/workspaces/${ws}/spaces`, {
    headers: authHeaders(),
  });
  if (existing.ok()) {
    const found = (await existing.json()).find(
      (s: { name: string; id: string }) => s.name === SAMPLE_SPACE_NAME,
    );
    if (found) ids.space = found.id;
  }

  if (!ids.space) {
    const space = await request.post(`${API}/workspaces/${ws}/spaces`, {
      headers: authHeaders(),
      data: {
        name: SAMPLE_SPACE_NAME,
        description: "How money moves, and who to call when it does not.",
        icon: "💳",
      },
    });
    if (space.ok()) ids.space = (await space.json()).id;
  }

  // Pages, likewise by title rather than blindly.
  const already = await request.get(
    `${API}/workspaces/${ws}/documents?limit=100`,
    { headers: authHeaders() },
  );
  const byTitle = new Map<string, string>();
  if (already.ok()) {
    for (const d of await already.json()) byTitle.set(d.title, d.id);
  }

  const pages = [
    {
      title: "Refund policy",
      body: "Refunds are issued within fourteen days of purchase. Anything older needs a manager's approval.",
    },
    {
      title: "Payment provider runbook",
      body: "If the provider webhook stops arriving, check the signing secret first. It rotates every ninety days.",
    },
    {
      title: "Chargeback handling",
      body: "A chargeback is not a refund. Evidence must be submitted within seven days or the case is lost by default.",
    },
  ];

  for (const [index, page] of pages.entries()) {
    const seen = byTitle.get(page.title);
    if (seen) {
      ids[`page${index}`] = seen;
      continue;
    }

    const created = await request.post(`${API}/workspaces/${ws}/documents`, {
      headers: authHeaders(),
      data: {
        title: page.title,
        space_id: ids.space,
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: page.body }],
            },
          ],
        },
      },
    });
    if (created.ok()) ids[`page${index}`] = (await created.json()).id;
  }

  return ids;
}

// ──────────────────────────────────────────────────────────────────────

test.describe("knowledge base screenshots", () => {
  // Not serial: one shot that cannot find its selector must not prevent the
  // others from being retaken. The seed runs first via `beforeAll` ordering,
  // and every shot navigates independently.
  test.describe.configure({ mode: "default" });

  test.use(SHOT_CONTEXT);

  let ids: Record<string, string> = {};

  test.beforeAll(async ({ request }) => {
    const probe = await backendOnlyReady();
    test.skip(!probe.ok, `docs screenshots need a live stack — ${probe.reason}`);

    // Seeded here rather than as a test, so ordering is guaranteed however
    // Playwright decides to schedule the shots.
    ids = await seed(request);
  });

  test.beforeEach(async ({ page }) => {
    await setupAiLiveAuth(page);
    await forceLightTheme(page);
  });

  test("the sample knowledge base exists", async () => {
    expect(ids.space, "the sample space could not be created").toBeTruthy();
  });

  test("sidebar-tree — spaces and nested pages", async ({ page }) => {
    await page.goto("/docs");
    await ready(page);
    await shooter.shoot(page, "sidebar-tree");
  });

  test("editor — a page being written", async ({ page }) => {
    test.skip(!ids.page0, "no seeded page");
    await page.goto(`/docs/${ids.page0}`);
    await ready(page);
    await shooter.shoot(page, "editor");
  });

  test("editor-slash — the slash command menu", async ({ page }) => {
    test.skip(!ids.page0, "no seeded page");
    await page.goto(`/docs/${ids.page0}`);
    await ready(page);

    const editor = page.locator(".ProseMirror").first();
    await editor.click();
    await editor.press("End");
    await editor.press("Enter");
    await editor.type("/");
    await page.waitForTimeout(400);

    await shooter.shoot(page, "editor-slash");
  });

  test("search — results for a query", async ({ page }) => {
    await page.goto("/docs");
    await ready(page);

    // Cmd/Ctrl+K, which is the only way in: `/docs` mounts its own SearchModal
    // and captures the shortcut before the global command palette sees it
    // (DocsLayoutClient). There is no button.
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+k" : "Control+k",
    );

    // Everything scoped to the dialog. The sidebar has its own filter box with
    // the same placeholder, and the tree behind the modal contains the same
    // page titles — an unscoped locator matches those instead and the shot
    // ends up of whatever is underneath.
    const dialog = page.getByRole("dialog", { name: "Search documents" });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Asserted, not probed. The previous version wrapped the search in
    // `if (await search.count())` and took the shot either way, so when the
    // selector missed it silently wrote a byte-identical copy of the documents
    // home and published it captioned as search results. A shot that cannot
    // find its subject has to fail the run; that is the whole point of taking
    // these from a spec.
    await dialog.getByPlaceholder("Search documents...").fill("refund");

    // Waited for *inside the dialog*, because the modal renders
    // "No documents found" during the 300ms input debounce — results are still
    // empty and `isSearching` is still false. Matching the title anywhere on
    // the page passes instantly against the sidebar and photographs precisely
    // that empty state.
    await expect(dialog.getByText("Refund policy")).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByText(/No documents found/)).toHaveCount(0);

    // The doc says each result shows the passage that matched, with the terms
    // highlighted — so the shot has to actually contain one. "Chargeback
    // handling" is the case worth photographing: its title says nothing about
    // refunds and its body does, which is the only thing that explains why it
    // is in the list at all.
    await expect(dialog.locator("mark").first()).toBeVisible();
    await expect(dialog.getByText("Chargeback handling")).toBeVisible();

    await shooter.shoot(page, "search");
  });

  // No trash shot: the restore API exists but no screen reaches it yet, and a
  // screenshot named "trash" that is actually the documents home is worse than
  // no screenshot. Add one here when the UI lands.

  test.afterAll(() => shooter.report());
});
