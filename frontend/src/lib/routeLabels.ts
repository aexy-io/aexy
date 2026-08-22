/**
 * Turns a pathname into a breadcrumb trail, without any page having to say so.
 *
 * The app had no breadcrumbs anywhere outside settings. `ui/breadcrumb.tsx`
 * exists and 49 files reference it, but it is opt-in per page, so on a route
 * like `/sprints/<id>/<id>/analytics` nothing on screen told you where you were
 * or how to get back one level. Asking 277 pages to each declare a trail would
 * guarantee most of them never did.
 *
 * So the trail is derived. Every label already exists in configuration that has
 * to be correct for other reasons — `SIDEBAR_LAYOUTS` names the nav entries,
 * `APP_CATALOG` names the apps and their modules, `settingsNavigation` names the
 * 54 settings pages — and reusing those means a renamed nav item renames its
 * breadcrumb too, instead of drifting.
 *
 * Segments the config cannot name are dropped rather than guessed. A record id
 * has no label here, and inventing "8f3a…" or "Details" as a crumb is worse than
 * omitting it — a page that knows the record's real name passes `breadcrumbs` to
 * `PageHeader` and overrides the whole trail.
 */

import { SIDEBAR_LAYOUTS, type SidebarItemConfig } from "@/config/sidebarLayouts";
import { APP_CATALOG } from "@/config/appDefinitions";
import { settingsNavigation } from "@/config/settingsNavigation";
import type { Breadcrumb } from "@/components/ui/page";

/** Path (no query) → human label. Built once; the sources are static config. */
let cachedLabels: Map<string, string> | null = null;

function stripQuery(href: string): string {
  const q = href.indexOf("?");
  return q === -1 ? href : href.slice(0, q);
}

function collectSidebarItems(items: readonly SidebarItemConfig[], into: Map<string, string>) {
  for (const item of items) {
    const path = stripQuery(item.href);
    // First writer wins: GROUPED_LAYOUT is the default, so where the two
    // layouts disagree on a label the one most users see is the one used.
    if (!into.has(path)) into.set(path, item.label);
    if (item.items?.length) collectSidebarItems(item.items, into);
  }
}

function routeLabels(): Map<string, string> {
  if (cachedLabels) return cachedLabels;
  const labels = new Map<string, string>();

  for (const layout of Object.values(SIDEBAR_LAYOUTS)) {
    for (const section of layout.sections) collectSidebarItems(section.items, labels);
  }

  for (const app of Object.values(APP_CATALOG)) {
    if (!labels.has(app.baseRoute)) labels.set(app.baseRoute, app.name);
    for (const mod of app.modules) {
      // Modules without a route gate API capabilities rather than a page.
      if (!mod.route) continue;
      // A module route is relative to its app — all 55 of them are, and none
      // starts with its own baseRoute. Reading them as absolute is what made
      // every settings breadcrumb say "Master Data": Service Desk's module and
      // Email Marketing's both declare `route: "/settings"`, meaning
      // `/service-desk/settings` and `/email-marketing/settings`, and taken
      // literally they both claimed the global settings root. Joining resolves
      // the collision at the source instead of guarding against it.
      const href = `${app.baseRoute}${mod.route}`;
      if (labels.has(href)) continue;
      labels.set(href, mod.name);
    }
  }

  // Roots no nav config names, because nothing navigates *to* them — you reach
  // /settings through a footer button, not a sidebar item.
  if (!labels.has("/settings")) labels.set("/settings", "Settings");

  for (const category of settingsNavigation) {
    for (const item of category.items) {
      if (!labels.has(item.href)) labels.set(item.href, item.label);
    }
  }

  cachedLabels = labels;
  return labels;
}

/**
 * True for a segment that identifies a record rather than naming a place —
 * uuids, numeric ids, and the long opaque slugs used for tokens.
 */
function isRecordId(segment: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
    /^\d+$/.test(segment) ||
    /^[0-9a-f]{16,}$/i.test(segment)
  );
}

/**
 * The breadcrumb trail for a pathname, root-first, last crumb unlinked.
 *
 * Returns an empty array for a top-level route: a one-crumb trail duplicating
 * the page title is noise.
 */
export function breadcrumbsFor(pathname: string): Breadcrumb[] {
  const clean = stripQuery(pathname).replace(/\/+$/, "");
  if (!clean || clean === "/") return [];

  const labels = routeLabels();
  const segments = clean.split("/").filter(Boolean);
  const trail: Breadcrumb[] = [];

  let prefix = "";
  for (const segment of segments) {
    prefix += `/${segment}`;
    if (isRecordId(segment)) continue;

    // Only link a crumb the nav config actually knows. `/settings/service-desk`
    // is a real path prefix with no page behind it — eight settings pages live
    // under it and none of them is an index — so linking it would hand the user
    // a breadcrumb to a 404. Config membership is the test for "somewhere you
    // can go", because that is what the nav is.
    const known = labels.has(prefix);
    const label = labels.get(prefix) ?? titleCase(segment);
    // A nested route can repeat its parent's label (`/reviews` → "Reviews",
    // `/reviews/cycles` under a section also called "Reviews"). Showing it twice
    // reads as a bug.
    if (trail.at(-1)?.label === label) {
      trail[trail.length - 1] = known ? { label, href: prefix } : { label };
      continue;
    }
    trail.push(known ? { label, href: prefix } : { label });
  }

  if (trail.length < 2) return [];

  // The page you are on is not a link to itself.
  const last = trail[trail.length - 1];
  trail[trail.length - 1] = { label: last.label };
  return trail;
}

/** Best available name for a route — used by the mobile topbar, which has no room for a trail. */
export function labelFor(pathname: string): string | null {
  const clean = stripQuery(pathname).replace(/\/+$/, "");
  if (!clean || clean === "/") return null;
  const labels = routeLabels();
  if (labels.has(clean)) return labels.get(clean)!;

  const segments = clean.split("/").filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (isRecordId(segments[i])) continue;
    const prefix = "/" + segments.slice(0, i + 1).join("/");
    if (labels.has(prefix)) return labels.get(prefix)!;
    return titleCase(segments[i]);
  }
  return null;
}

function titleCase(segment: string): string {
  return segment
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    // Acronyms the config spells in caps; title-casing turns them into "Crm".
    .replace(/\bCrm\b/g, "CRM")
    .replace(/\bGtm\b/g, "GTM")
    .replace(/\bMcp\b/g, "MCP")
    .replace(/\bAi\b/g, "AI")
    .replace(/\bSso\b/g, "SSO")
    .replace(/\bApi\b/g, "API")
    .replace(/\bSla\b/g, "SLA");
}

/** Test seam: the sources are static, so the map is memoised. */
export function __resetRouteLabelCache() {
  cachedLabels = null;
}
