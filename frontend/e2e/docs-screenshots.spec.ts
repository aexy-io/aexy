/**
 * The screenshots in `docs/knowledge-base.md`, taken from the running app.
 *
 * Documentation screenshots normally die the same way: somebody takes twenty by
 * hand, the UI shifts, and two releases later every one is a picture of
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
 * Deliberately NOT in CI. It needs a running stack, and a docs job that breaks
 * the build every time a button moves is a docs job somebody disables.
 *
 *   docker compose up -d
 *   docker exec aexy-backend python scripts/generate_test_token.py --first
 *
 *   E2E_REAL_BACKEND=1 \
 *     AEXY_TEST_TOKEN=<jwt> \
 *     AEXY_TEST_WORKSPACE_ID=<workspace-uuid> \
 *     npm run docs:shots
 *
 * Skips itself with a reason when those are absent, rather than failing — the
 * ordinary `npm run test:e2e` run must not go red because docs tooling needs a
 * database.
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import {
  API_BASE,
  authHeaders,
  backendOnlyReady,
  setupAiLiveAuth,
  REAL_BACKEND_WORKSPACE_ID,
} from "./fixtures/ai-env";

/** Beside the prose, so a moved document takes its pictures with it. */
const OUT_DIR = path.resolve(__dirname, "..", "..", "docs", "images", "knowledge-base");

/**
 * Fixed so the set looks like one product rather than twelve sessions.
 *
 * 1440×900 at 2x: retina, and narrow enough that text stays legible after the
 * docs site scales the image down to article width. A 2560-wide full-page shot
 * reduced to 700px is unreadable, which is the most common way a screenshot
 * ends up decorative.
 *
 * The 2x capture is downsampled to `MAX_WIDTH` before it is written; see there.
 */
const VIEWPORT = { width: 1440, height: 900 };

const API = API_BASE;

/**
 * Screenshots are optimised here rather than by hand, for the same reason they
 * are taken here: a manual step decays. The raw capture is 2880px wide (1440
 * viewport at 2x) and ~290 KB, and the docs site renders it into a ~630px
 * column — so most of those bytes are downloaded, decoded, and thrown away on
 * every page view, twice over, because `public/docs/` holds a second copy that
 * ships in the image.
 *
 * 1440 is still 2.3x the rendered width, which is retina at the size anyone
 * actually sees. Clicking through to the file gets 1440 rather than 2880; that
 * is the trade, and it is the right way round for a page of UI screenshots.
 *
 * Palette PNG rather than WebP: measured on the most text-dense shot, palette
 * costs an RMSE of 0.24 against the unquantised resize (invisible) where WebP
 * q90 costs 0.91 for a further 16 KB. Text is the entire point of a screenshot
 * of a text editor, so the error matters more than the last few kilobytes.
 */
const MAX_WIDTH = 1440;

/** Reported at the end, so a regression in image weight is visible. */
let bytesRaw = 0;
let bytesOut = 0;

/**
 * Matched on *name*, because the backend does not accept a slug.
 * `DocumentSpaceService.create` derives one from the name and de-duplicates it
 * with a counter, ignoring whatever the payload sends — so a fixed slug looks
 * like an idempotency key while matching nothing, and every run quietly adds
 * another space (`payments`, `payments-1`, `payments-2`…). Which it did: the
 * sidebar screenshot had three identical "Payments" entries in it.
 */
const SAMPLE_SPACE_NAME = "Payments";

const taken: string[] = [];

/**
 * Wait for the app to have actually rendered.
 *
 * Not `networkidle`: this app holds connections open — live collaboration,
 * polling — so the network never goes idle and the wait times out on a page
 * that finished rendering twenty seconds earlier.
 */
async function ready(page: Page, marker = "main, [role='main']") {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(marker).first()).toBeVisible({ timeout: 30_000 });
  // Let React settle and the first data fetch paint.
  await page.waitForTimeout(2_500);
}

async function shoot(page: Page, name: string, locator?: string) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.png`);

  // Captured to a buffer rather than straight to disk, so the only file ever
  // written is the optimised one — an unoptimised PNG cannot be left behind by
  // a run that fails between the capture and the resize.
  //
  // An element shot wherever the subject is one panel. A full page reduced to
  // article width makes the thing being explained too small to read.
  let raw: Buffer;
  if (locator) {
    const target = page.locator(locator).first();
    await expect(target).toBeVisible({ timeout: 15_000 });
    raw = await target.screenshot();
  } else {
    raw = await page.screenshot();
  }

  const optimised = await sharp(raw)
    // `withoutEnlargement` so an element shot narrower than MAX_WIDTH is left
    // at its own size rather than being blown up into a blurry one.
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();

  fs.writeFileSync(file, optimised);

  bytesRaw += raw.length;
  bytesOut += optimised.length;
  taken.push(name);
}

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

test.describe("documentation screenshots", () => {
  // Not serial: one shot that cannot find its selector must not prevent the
  // other eleven from being retaken. The seed runs first via `beforeAll`
  // ordering, and every shot navigates independently.
  test.describe.configure({ mode: "default" });

  // `deviceScaleFactor` has to be set on the context, so it goes here rather
  // than in `setViewportSize` — which silently ignores it, and is how a set of
  // screenshots ends up soft on a retina display.
  //
  // Light theme fixed: the site renders both, but a page mixing light and dark
  // screenshots looks broken rather than configurable.
  test.use({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: "light",
  });

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

    // Light theme, forced through the app's own store.
    //
    // `colorScheme: "light"` on the context only sets `prefers-color-scheme`,
    // which this app ignores — it keeps an explicit preference in a Zustand
    // store persisted at `aexy-theme`. Without this every screenshot comes out
    // dark regardless of what the Playwright config says, and a docs page that
    // mixes light and dark shots looks broken rather than configurable.
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          "aexy-theme",
          JSON.stringify({ state: { theme: "light" }, version: 0 }),
        );
      } catch {
        // Storage can be unavailable; the shot is merely dark, not wrong.
      }
    });
  });

  test("the sample knowledge base exists", async () => {
    expect(ids.space, "the sample space could not be created").toBeTruthy();
  });

  test("sidebar-tree — spaces and nested pages", async ({ page }) => {
    await page.goto("/docs");
    await ready(page);
    await shoot(page, "sidebar-tree");
  });

  test("editor — a page being written", async ({ page }) => {
    test.skip(!ids.page0, "no seeded page");
    await page.goto(`/docs/${ids.page0}`);
    await ready(page);
    await shoot(page, "editor");
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

    await shoot(page, "editor-slash");
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

    await shoot(page, "search");
  });

  // No trash shot: the restore API exists but no screen reaches it yet, and a
  // screenshot named "trash" that is actually the documents home is worse than
  // no screenshot. Add one here when the UI lands.

  test.afterAll(() => {
    if (taken.length) {
      const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
      console.log(
        `\n  ${taken.length} screenshot(s) → docs/images/knowledge-base/\n` +
          taken.map((n) => `    ${n}.png`).join("\n") +
          `\n\n  optimised ${kb(bytesRaw)} → ${kb(bytesOut)} ` +
          `(${(100 - (bytesOut / bytesRaw) * 100).toFixed(0)}% smaller)\n` +
          "  run `node scripts/generate-docs.mjs` to publish them\n",
      );
    }
  });
});
