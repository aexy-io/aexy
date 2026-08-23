/**
 * Every route inside the app must name itself in the browser tab.
 *
 * 121 of 277 app routes had no `metadata` anywhere in their layout chain, so
 * they inherited the root layout's marketing title. The tab, the history entry
 * and the bookmark all read "Aexy — AI Company OS for Engineering, CRM, HR &
 * GTM" — identical for a settings page, a sprint board and an agent inbox. With
 * a few tabs open there was no way to tell them apart.
 *
 * Two rules, and the second is the subtle one:
 *
 *  1. A route resolves a title somewhere in its chain — on the page if it is a
 *     server component, otherwise on a layout, because Next ignores `metadata`
 *     exported from a `"use client"` module and says nothing about it.
 *
 *  2. A layout that has titled routes beneath it must use the object form,
 *     `{ default, template }`, not a bare string. A bare `title` *replaces* the
 *     parent's title object rather than merging with it, which silently deletes
 *     the inherited template for that entire subtree — `/agents/new` came out as
 *     "New agent", with no product name, purely because `agents/layout.tsx` set
 *     `title: "Agents"`. Nothing warns; you only see it by reading the tab.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const APP = join(__dirname, "..", "app", "(app)");

function walk(dir: string, name: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, name, out);
    else if (entry === name) out.push(p);
  }
  return out;
}

const read = (p: string) => readFileSync(p, "utf8");

const declaresTitle = (src: string) =>
  /export const metadata/.test(src) || /generateMetadata/.test(src);

/** Walk up from a page to the app root looking for a metadata export. */
function resolvesTitle(pagePath: string): boolean {
  if (declaresTitle(read(pagePath))) return true;
  let dir = join(pagePath, "..");
  for (;;) {
    const layout = join(dir, "layout.tsx");
    if (existsSync(layout) && declaresTitle(read(layout))) return true;
    if (dir === APP) return false;
    dir = join(dir, "..");
  }
}

/**
 * A page whose whole body is `redirect(...)` never paints, so it has no tab to
 * name — demanding a title of it would be asking for a string no one can ever
 * see. The eight `/reminders/*` stubs left behind when reminders moved under
 * Compliance are all of this kind.
 *
 * Deliberately narrow: the file must *only* redirect. A page that redirects
 * conditionally does render in the other branch and still owes a title.
 */
const isPureRedirect = (src: string) =>
  /\bredirect\(/.test(src) && !/\breturn\s*\(?\s*</.test(src) && !/\buseState\b/.test(src);

describe("app route metadata", () => {
  it("every route resolves a title of its own", () => {
    const missing = walk(APP, "page.tsx")
      .filter((p) => !isPureRedirect(read(p)))
      .filter((p) => !resolvesTitle(p))
      .map((p) => relative(APP, p));
    expect(missing, "these routes fall back to the root layout's marketing title").toEqual([]);
  });

  /*
    The exemption is only safe if the redirect goes somewhere. Twenty pages in
    `(app)` are pure redirects — several of them app roots (`/tickets`,
    `/hiring`, `/my-work`) whose real landing page moved — and a redirect to a
    route that no longer exists is strictly worse than no page at all: the user
    clicks a live nav item and lands on a 404 with no way back.
  */
  it("sends every redirect somewhere that exists", () => {
    const pages = walk(APP, "page.tsx");
    const routes = pages.map((p) =>
      relative(APP, p).replace(/\/page\.tsx$/, "").replace(/^page\.tsx$/, ""),
    );
    const resolves = (target: string) => {
      const want = target.split("?")[0].split("#")[0].split("/").filter(Boolean);
      return routes.some((r) => {
        const have = r.split("/").filter(Boolean);
        return (
          have.length === want.length &&
          have.every((seg, i) => seg === want[i] || seg.startsWith("["))
        );
      });
    };
    const broken: string[] = [];
    for (const p of pages) {
      const src = read(p);
      if (!isPureRedirect(src)) continue;
      for (const m of src.matchAll(/redirect\(\s*[`"']([^`"'$]+)[`"']\s*\)/g)) {
        if (!resolves(m[1])) broken.push(`${relative(APP, p)} → ${m[1]}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("no client module tries to export metadata", () => {
    // Silently ignored by Next — it looks correct in the diff and does nothing.
    const offenders = [...walk(APP, "page.tsx"), ...walk(APP, "layout.tsx")]
      .filter((p) => {
        const src = read(p);
        return /^\s*["']use client["']/m.test(src) && /export const metadata/.test(src);
      })
      .map((p) => relative(APP, p));
    expect(offenders, "move the metadata to a sibling/parent server layout").toEqual([]);
  });

  it("a layout with titled routes below it defines a template, not a bare string", () => {
    const offenders: string[] = [];
    for (const layout of walk(APP, "layout.tsx")) {
      // Comments quote `title: "…"` when explaining this very rule; scanning
      // prose would flag the layouts that get it right.
      const src = read(layout).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      const bareTitle = /title:\s*["']/.test(src);
      if (!bareTitle) continue;

      const dir = join(layout, "..");
      const below = [
        ...walk(dir, "layout.tsx").filter((p) => p !== layout),
        ...walk(dir, "page.tsx"),
      ].filter((p) => declaresTitle(read(p)));

      if (below.length > 0) offenders.push(relative(APP, layout));
    }
    expect(
      offenders,
      "use `title: { default, template }` — a bare string drops the inherited template for everything below"
    ).toEqual([]);
  });
});
