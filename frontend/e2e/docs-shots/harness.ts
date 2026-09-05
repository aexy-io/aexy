/**
 * The shared half of the documentation screenshots.
 *
 * Every doc that carries images gets one spec in this directory, named after
 * the document it illustrates, writing into `docs/images/<that name>/`. The
 * convention is load-bearing rather than tidy: `test_docs_images_have_a_spec`
 * fails on an image directory with no spec beside it, which is how a
 * hand-taken PNG — the kind that quietly becomes a picture of software that no
 * longer exists — gets caught.
 *
 * What lives here is everything that must be identical across those specs:
 * the capture size, the theme, the optimiser, and the summary line. What lives
 * in a spec is what is particular to one module — its seed data, its
 * selectors, and the reason each shot exists.
 *
 * Running them:
 *
 *   docker compose up -d
 *   docker compose exec backend python scripts/seed_demo_workspace.py
 *   docker exec aexy-backend python scripts/generate_test_token.py --first
 *
 *   E2E_REAL_BACKEND=1 \
 *     AEXY_TEST_TOKEN=<jwt> \
 *     AEXY_TEST_WORKSPACE_ID=<workspace-uuid> \
 *     npm run docs:shots               # every document
 *     npm run docs:shots -- service-desk   # one of them, after a UI change
 *
 * Deliberately NOT in CI. These need a running stack, and a docs job that
 * breaks the build every time a button moves is a docs job somebody disables.
 * The integrity guards in `backend/tests/unit/test_docs_integrity.py` are the
 * part that does run there.
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { expect, type Page } from "@playwright/test";

/**
 * Fixed so the whole set looks like one product rather than twelve sessions.
 *
 * 1440×900 at 2×: retina, and narrow enough that text stays legible after the
 * docs site scales the image down to article width. A 2560-wide full-page shot
 * reduced to 700px is unreadable, which is the most common way a screenshot
 * ends up decorative.
 */
export const VIEWPORT = { width: 1440, height: 900 };

/**
 * The capture is 2880px wide (1440 at 2×) and ~290 KB; the docs site renders it
 * into a ~630px column, so most of those bytes are downloaded, decoded and
 * thrown away on every page view — twice over, since `public/docs/` holds a
 * second copy that ships in the image. 1440 is still 2.3× the rendered width,
 * which is retina at the size anyone actually sees.
 *
 * Palette PNG rather than WebP: measured on the most text-dense shot, palette
 * costs an RMSE of 0.24 against the unquantised resize (invisible) where WebP
 * q90 costs 0.91 for a further 16 KB. Text is the entire point of a screenshot
 * of an application, so the error matters more than the last few kilobytes.
 */
export const MAX_WIDTH = 1440;

/**
 * Spread into `test.use()` by each spec.
 *
 * `deviceScaleFactor` has to be set on the context — `setViewportSize` ignores
 * it silently, which is how a set of screenshots ends up soft on a retina
 * display.
 */
export const SHOT_CONTEXT = {
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
  colorScheme: "light" as const,
};

/** Beside the prose, so a moved document takes its pictures with it. */
export function imagesDirFor(doc: string): string {
  return path.resolve(__dirname, "..", "..", "..", "docs", "images", doc);
}

/**
 * Wait for the app to have actually rendered.
 *
 * Not `networkidle`: this app holds connections open — live collaboration,
 * polling — so the network never goes idle and the wait times out on a page
 * that finished rendering twenty seconds earlier.
 */
export async function ready(page: Page, marker = "main, [role='main']") {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(marker).first()).toBeVisible({ timeout: 30_000 });
  // Let React settle and the first data fetch paint.
  await page.waitForTimeout(2_500);
}

/**
 * Light theme, forced through the app's own store.
 *
 * `colorScheme: "light"` on the context only sets `prefers-color-scheme`,
 * which this app ignores — it keeps an explicit preference in a Zustand store
 * persisted at `aexy-theme`. Without this every screenshot comes out dark
 * regardless of what the Playwright config says, and a docs page that mixes
 * light and dark shots looks broken rather than configurable.
 */
export async function forceLightTheme(page: Page) {
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
}

export interface Shooter {
  /**
   * Capture one image. `locator` takes an element shot, which is what you want
   * wherever the subject is a single panel — a full page reduced to article
   * width makes the thing being explained too small to read.
   */
  shoot(page: Page, name: string, locator?: string): Promise<void>;
  /** Call from `test.afterAll`. Prints what was written and what it cost. */
  report(): void;
}

/**
 * One shooter per document, holding that document's output directory and its
 * byte tally.
 */
export function createShooter(doc: string): Shooter {
  const outDir = imagesDirFor(doc);
  const taken: string[] = [];
  let bytesRaw = 0;
  let bytesOut = 0;

  return {
    async shoot(page: Page, name: string, locator?: string) {
      fs.mkdirSync(outDir, { recursive: true });

      // Next's dev overlay renders *over* the app, so a compile failure is not
      // necessarily something the waits notice: the page underneath can be
      // perfectly ready while a red "Build Error" dialog sits on top of it, and
      // the shot goes to disk with the error in the frame. Worth one assertion
      // — it happened on the first run of these, when the container's
      // node_modules turned out to be older than package.json.
      await expect(
        page.getByRole("dialog", { name: /Build Error|Runtime Error/ }),
        `${name}: the Next dev error overlay is on screen`,
      ).toHaveCount(0);

      // Captured to a buffer rather than straight to disk, so the only file
      // ever written is the optimised one — an unoptimised PNG cannot be left
      // behind by a run that fails between the capture and the resize.
      let raw: Buffer;
      if (locator) {
        const target = page.locator(locator).first();
        await expect(target).toBeVisible({ timeout: 15_000 });
        raw = await target.screenshot();
      } else {
        raw = await page.screenshot();
      }

      const optimised = await sharp(raw)
        // `withoutEnlargement` so an element shot narrower than MAX_WIDTH is
        // left at its own size rather than blown up into a blurry one.
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .png({ compressionLevel: 9, palette: true })
        .toBuffer();

      fs.writeFileSync(path.join(outDir, `${name}.png`), optimised);

      bytesRaw += raw.length;
      bytesOut += optimised.length;
      taken.push(name);
    },

    report() {
      if (!taken.length) return;
      const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
      console.log(
        `\n  ${taken.length} screenshot(s) → docs/images/${doc}/\n` +
          taken.map((n) => `    ${n}.png`).join("\n") +
          `\n\n  optimised ${kb(bytesRaw)} → ${kb(bytesOut)} ` +
          `(${(100 - (bytesOut / bytesRaw) * 100).toFixed(0)}% smaller)\n` +
          "  run `node scripts/generate-docs.mjs` to publish them\n",
      );
    },
  };
}
