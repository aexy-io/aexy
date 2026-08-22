/**
 * Where each app's documentation lives — and, just as importantly, where it
 * does not.
 *
 * Phase D of the post-login UX work rests on being able to send a user from an
 * empty page to something that explains the page. That assumed the handbook
 * could carry the weight. Two things this file makes visible say otherwise, and
 * both are gaps rather than opinions:
 *
 *  1. **One of the 28 apps has no document.** It was nine — Service Desk, the
 *     Dashboard, Organization, Reports, Drive and On-Call have since been
 *     written, and On-Call and Community were blocked on having no page at
 *     all. `null` is not "we forgot to fill this in": it is the entry, and
 *     `src/test/docsCoverage.test.ts` fails when a new app appears without
 *     one, so the gap cannot grow silently.
 *
 *  2. **The documents that do exist are written for people building Aexy, not
 *     people using it.** `docs/crm.md` opens by explaining that records are
 *     "stored as JSONB against per-attribute schemas" and then lists router
 *     files with line numbers. Every module doc reads that way — they average
 *     14 code fences and 12 API paths each. Linking a confused first-time user
 *     into that is worse than linking them nowhere, because it tells them the
 *     product is not for them.
 *
 * So `href` is the *developer* handbook and is deliberately not surfaced in
 * empty states yet. `AppTopbar`'s help menu links the handbook root, which is
 * honest: it is a reference, and a reference is what a developer wants. The
 * user-facing guides that empty states should link are not written, and the
 * plan for them is in the review that produced this file.
 */

/** Slug under /handbook, or null when nothing documents this app. */
export type HandbookSlug = string | null;

export interface ModuleHelp {
  /** Handbook page for the app, when one exists. */
  href: HandbookSlug;
  /**
   * Why there is no page, when there is none. Present exactly when `href` is
   * null, so "undocumented" always carries a reason rather than a blank.
   */
  gap?: string;
}

export const MODULE_HELP: Record<string, ModuleHelp> = {
  agents: { href: "ai-agents" },
  crm: { href: "crm" },
  automations: { href: "workflows-and-automations" },
  booking: { href: "booking" },
  chat: { href: "notifications-and-chat" },
  compliance: { href: "compliance" },
  docs: { href: "documents-and-drive" },
  email_marketing: { href: "email-marketing" },
  forms: { href: "forms" },
  gtm: { href: "gtm" },
  hiring: { href: "reviews-and-people" },
  insights: { href: "analytics" },
  leave: { href: "leave" },
  learning: { href: "reviews-and-people" },
  mcp: { href: "mcp" },
  reviews: { href: "reviews-and-people" },
  sprints: { href: "sprints" },
  tables: { href: "tables" },
  tickets: { href: "tickets-and-projects" },
  tracking: { href: "tracking" },
  uptime: { href: "uptime" },
  dashboard: { href: "dashboard" },
  drive: { href: "drive" },
  oncall: { href: "oncall" },
  organization: { href: "organization" },
  reports: { href: "reports" },
  service_desk: { href: "service-desk" },

  // ── undocumented ────────────────────────────────────────────────────────
  community: {
    href: null,
    gap: "Community is contact-support availability and has no doc; write one when it becomes self-serve.",
  },
};
