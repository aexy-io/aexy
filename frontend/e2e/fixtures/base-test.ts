/**
 * Custom Playwright test base that fixes Next.js dev server navigation.
 *
 * Next.js dev server uses streaming responses and HMR which prevent the
 * browser's "load" event from firing reliably. This causes page.goto()
 * to hang or abort with "net::ERR_ABORTED; maybe frame was detached?".
 *
 * This base test wraps page.goto() to use "domcontentloaded" by default,
 * which fires as soon as the HTML is parsed (before all resources load).
 * Tests should still use waitForSelector() to ensure page content renders.
 */
import { test as base } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    const originalGoto = page.goto.bind(page);
    page.goto = async (url: string, options?: Parameters<typeof page.goto>[1]) => {
      return originalGoto(url, {
        waitUntil: "domcontentloaded",
        ...options,
      });
    };

    const originalReload = page.reload.bind(page);
    page.reload = async (options?: Parameters<typeof page.reload>[0]) => {
      return originalReload({
        waitUntil: "domcontentloaded",
        ...options,
      });
    };

    await use(page);
  },
});

export { expect } from "@playwright/test";
