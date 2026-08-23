/**
 * Every route the product declares must have a page behind it.
 *
 * `appDefinitions.ts` advertises routes in three places — each app's
 * `baseRoute`, each module's `route`, and the `SIDEBAR_TO_APP_MAP` gate map — and
 * none of them is checked against the filesystem. Four were lies:
 *
 *   - `/oncall` — an app enabled by two shipped bundles, gated by
 *     `can_view_oncall`, with fifteen API endpoints and three components built
 *     behind it, and no page. The only way to touch on-call was a per-project
 *     settings screen three levels into /settings.
 *   - `/insights/developers` — a `developer_drilldown` module whose directory
 *     held nothing but `[developerId]/`, so the only way in was to already know
 *     a uuid.
 *   - `/email-marketing/settings` — meant `/settings/email-marketing`.
 *   - `/community` — the one that was not a 404 but was worse: it resolves to a
 *     *public* page outside the `(app)` group, so following it from the sidebar
 *     replaced the entire application, sidebar and topbar included.
 *
 * None of these fails a build. A declared route with no page is a door the
 * product opens onto nothing, and the only way to find them is to check.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, statSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { APP_CATALOG, SIDEBAR_TO_APP_MAP } from "@/config/appDefinitions";

const APP_DIR = join(__dirname, "..", "app", "(app)");
const ROOT_DIR = join(__dirname, "..", "app");

/** Every static and dynamic route with a `page.tsx`, as path-segment arrays. */
function routes(dir: string, base: string[] = [], out: string[][] = []): string[][] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (!statSync(p).isDirectory()) continue;
    // Route groups — `(app)`, `(admin)` — do not appear in the URL.
    const next = /^\(.*\)$/.test(entry) ? base : [...base, entry];
    if (existsSync(join(p, "page.tsx"))) out.push(next);
    routes(p, next, out);
  }
  return out;
}

const appRoutes = routes(APP_DIR);
const allRoutes = routes(ROOT_DIR);

function resolvesIn(pool: string[][], route: string): boolean {
  const want = route.split("/").filter(Boolean);
  return pool.some(
    (have) =>
      have.length === want.length &&
      have.every((seg, i) => seg === want[i] || seg.startsWith("[")),
  );
}

/**
 * Routes that deliberately resolve outside the app shell.
 *
 * `/community` is a public forum living at `src/app/community/`. Two pages
 * cannot resolve to one path, so there is no in-app twin to build; instead the
 * sidebar item carries `external: true` and opens it in a new tab rather than
 * replacing the app with it.
 */
const PUBLIC_BY_DESIGN = new Set(["/community"]);

describe("declared routes", () => {
  it("gives every app a page at its base route", () => {
    const dead = Object.values(APP_CATALOG)
      .filter((app) => !PUBLIC_BY_DESIGN.has(app.baseRoute) && !resolvesIn(appRoutes, app.baseRoute))
      .map((app) => `${app.id} → ${app.baseRoute}`);
    expect(dead).toEqual([]);
  });

  it("gives every module a page, relative to its app", () => {
    const dead: string[] = [];
    for (const app of Object.values(APP_CATALOG)) {
      for (const mod of app.modules) {
        if (!mod.route) continue; // capability-only modules gate an API, not a page
        const href = `${app.baseRoute}${mod.route}`;
        if (!PUBLIC_BY_DESIGN.has(href) && !resolvesIn(appRoutes, href)) {
          dead.push(`${app.id}/${mod.id} → ${href}`);
        }
      }
    }
    expect(dead).toEqual([]);
  });

  it("gates no route that does not exist", () => {
    const dead = Object.keys(SIDEBAR_TO_APP_MAP)
      .filter((r) => !PUBLIC_BY_DESIGN.has(r) && !resolvesIn(allRoutes, r))
      .map((r) => `${r} → ${SIDEBAR_TO_APP_MAP[r]}`);
    expect(dead).toEqual([]);
  });

  it("keeps the public-by-design list honest", () => {
    // If one of these ever gains an in-app page, the exemption is stale and the
    // sidebar's `external: true` is now wrong.
    for (const r of PUBLIC_BY_DESIGN) {
      expect(resolvesIn(appRoutes, r), `${r} now has an in-app page`).toBe(false);
      expect(resolvesIn(allRoutes, r), `${r} has no page at all`).toBe(true);
    }
  });
});

/**
 * The other direction: pages that exist and that nothing can reach.
 *
 * Seven shipped this way — four GTM features (SEO audits, content-gap
 * analysis, expansion playbooks, engineering→GTM handoffs), two Learning pages
 * and the Knowledge Graph. Each was maintained, type-checked and built into
 * every deployment, and no nav config named it and no line of source linked to
 * it. That is the most expensive kind of dead code, because it does not look
 * dead.
 */
describe("reachability", () => {
  const SRC = join(__dirname, "..");

  function sources(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) sources(p, out);
      else if (/\.tsx?$/.test(entry)) out.push(p);
    }
    return out;
  }

  /**
   * Reached by an external redirect, never by a link — Google Calendar sends
   * the browser here after consent. Nothing in the product should link to it.
   */
  const REACHED_EXTERNALLY = new Set(["/booking/calendars/callback"]);

  it("leaves no page that nothing links to", () => {
    const blob = sources(SRC).map((p) => readFileSync(p, "utf8")).join("\n");
    const named = new Set<string>();
    for (const f of ["config/sidebarLayouts.ts", "config/settingsNavigation.ts"]) {
      const p = join(SRC, f);
      if (!existsSync(p)) continue;
      for (const m of readFileSync(p, "utf8").matchAll(/href:\s*"(\/[^"?]*)/g)) named.add(m[1]);
    }
    for (const app of Object.values(APP_CATALOG)) {
      named.add(app.baseRoute);
      for (const mod of app.modules) if (mod.route) named.add(`${app.baseRoute}${mod.route}`);
    }

    const unreachable = appRoutes
      .map((segs) => `/${segs.join("/")}`)
      .filter((r) => !r.includes("["))
      // Settings has its own nav tree, already covered by settingsNavigation.
      .filter((r) => !r.startsWith("/settings"))
      .filter((r) => !named.has(r) && !REACHED_EXTERNALLY.has(r))
      // A page whose only job is to redirect is reached by its old URL.
      .filter((r) => {
        const p = join(APP_DIR, ...r.split("/").filter(Boolean), "page.tsx");
        if (!existsSync(p)) return true;
        const src = readFileSync(p, "utf8");
        return !(/\bredirect\(/.test(src) && !/\breturn\s*\(?\s*</.test(src));
      })
      .filter((r) => !new RegExp(`["\'\`]${r.replace(/[/-]/g, "\\$&")}["\'\`?#]`).test(blob));

    expect(
      unreachable,
      "add a sidebar entry, link to it from somewhere, or delete it",
    ).toEqual([]);
  });
});