/**
 * The breadcrumb trail is derived, not written down, so its correctness is
 * entirely a property of this mapping — and the mapping is built from three
 * config files that disagree about what a route string means.
 *
 * That disagreement already shipped one bug. `APP_CATALOG` module routes are
 * relative to their app's `baseRoute` (all 55 of them; not one starts with its
 * own base), but the first version of `routeLabels` read them as absolute. Two
 * modules — Service Desk's "Master Data" and Email Marketing's "Settings" —
 * declare `route: "/settings"`, so whichever iterated first labelled the global
 * settings root after itself, and every settings breadcrumb read "Master Data".
 *
 * The fix for *that* then introduced a quieter one: a `startsWith(baseRoute)`
 * guard, which is false for every relative route, so the entire module loop
 * became dead code. Nothing failed, because `titleCase(segment)` produces a
 * plausible-looking label for anything — "Developers" instead of "Developer
 * Drill-down". A silent fallback is exactly the kind of bug a derived system
 * needs a test for.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { breadcrumbsFor, labelFor, __resetRouteLabelCache } from "@/lib/routeLabels";
import { APP_CATALOG } from "@/config/appDefinitions";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const APP_DIR = join(__dirname, "..", "app", "(app)");

beforeEach(() => __resetRouteLabelCache());

describe("route labels", () => {
  it("resolves module routes against their app, not the site root", () => {
    // Both of these declare route: "/settings".
    expect(labelFor("/service-desk/settings")).toBe("Master Data");
    expect(labelFor("/email-marketing/settings")).toBe("Settings");
    // …and neither one gets to claim the global settings root.
    expect(labelFor("/settings")).toBe("Settings");
  });

  it("uses the catalog's own name for a module rather than the URL segment", () => {
    // `titleCase` would give "Developers"; the catalog says otherwise.
    expect(labelFor("/insights/developers")).toBe("Developer Drill-down");
    expect(labelFor("/tracking/standups")).toBe("Standups");
  });

  /*
    The sidebar label wins over the catalog name, deliberately — a nav rail has
    less room than a page header, and "GTM" is a better rail label than "GTM
    Intelligence". What it must not do is pick a *different word*, because then
    the rail, the breadcrumb and the page disagree about what the place is
    called and the user has to learn two names for one destination.

    Three did: /dashboard was "Home", /sprints was "Planning", /automations was
    "Workflows". Abbreviating is allowed; renaming is not.
  */
  it("never gives an app a rail name that contradicts its catalog name", () => {
    const contradictions = Object.values(APP_CATALOG)
      .map((app) => [app, String(labelFor(app.baseRoute) ?? "")] as const)
      .filter(([app, rail]) => {
        const a = rail.toLowerCase();
        const b = app.name.toLowerCase();
        return a !== b && !b.includes(a) && !a.includes(b);
      })
      .map(([app, rail]) => `${app.baseRoute}: rail says "${rail}", catalog says "${app.name}"`);
    expect(contradictions).toEqual([]);
  });

  /*
    The same rule one level down: an app's browser-tab title is a third place
    its name is written, and it drifted too. `/automations` opened a tab
    called "Workflows" and `/dashboard` one called "Home" — the words the nav
    rail used before they were reconciled, left behind in the generated
    layouts.

    Compared against the catalog rather than the rail, because a collapsible
    group's first child legitimately shares its parent's href with a different
    label ("Overview" under CRM, "Board" under Sprints).
  */
  it("gives every app a tab title that matches its catalog name", () => {
    const wrong: string[] = [];
    for (const app of Object.values(APP_CATALOG)) {
      const seg = app.baseRoute.split("/").filter(Boolean);
      if (seg.length !== 1) continue; // nested app roots have no own layout
      const file = join(APP_DIR, seg[0], "layout.tsx");
      if (!existsSync(file)) continue;
      const src = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const tab = src.match(/default:\s*"([^"]+)"/)?.[1] ?? src.match(/title:\s*"([^"]+)"/)?.[1];
      if (!tab) continue;
      const a = tab.toLowerCase();
      const b = app.name.toLowerCase();
      if (a !== b && !b.includes(a) && !a.includes(b)) {
        wrong.push(`${app.baseRoute}: tab says "${tab}", catalog says "${app.name}"`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("returns no trail for a top-level route, where it would only repeat the title", () => {
    expect(breadcrumbsFor("/crm")).toEqual([]);
    expect(breadcrumbsFor("/")).toEqual([]);
  });

  it("drops record ids and leaves the current page unlinked", () => {
    const trail = breadcrumbsFor("/sprints/8f14e45f-ceea-467a-9c1e-6d0f1a2b3c4d/board");
    expect(trail.map((c) => c.label)).toEqual(["Sprints", "Board"]);
    expect(trail[0].href).toBe("/sprints");
    expect(trail.at(-1)!.href).toBeUndefined();
  });

  it("does not link a path prefix that has no page behind it", () => {
    // Eight settings pages live under /settings/service-desk and none of them
    // is an index, so linking the middle crumb would be a breadcrumb to a 404.
    const trail = breadcrumbsFor("/settings/service-desk/mailboxes");
    const middle = trail.find((c) => c.label.toLowerCase().includes("service"));
    expect(middle?.href).toBeUndefined();
  });

  it("never repeats a label twice in a row", () => {
    for (const path of ["/reviews/cycles", "/docs/drive", "/insights/leaderboard"]) {
      const labels = breadcrumbsFor(path).map((c) => c.label);
      expect(new Set(labels).size, `${path}: ${labels.join(" › ")}`).toBe(labels.length);
    }
  });

  it("keeps acronyms spelled the way the product spells them", () => {
    expect(labelFor("/crm")).toBe("CRM");
    // Abbreviated by the rail, but still recognisably the same place.
    expect(labelFor("/gtm")).toBe("GTM");
    // The fallback path: no config names this, so it is title-cased from the
    // segment — and the acronym fixups are what keep that from reading "Api".
    expect(labelFor("/insights/api-usage")).toBe("API Usage");
  });
});
