import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "@/middleware";
import { safeInternalPath } from "@/lib/oauth";

/**
 * The auth gate sends an unauthenticated request to the landing page with a
 * `?next=` return address. It used to store `pathname` alone, which quietly
 * changed which screen you came back to: `/sprints?tab=epics` is the Epics view
 * and `/sprints` is Projects, so anyone opening the epics URL without the
 * presence cookie yet was bounced through the gate and dropped on Projects —
 * indistinguishable, from the reader's side, from the Epics tab not working.
 *
 * `clone()` also carries the original query, so the params of the denied page
 * leaked onto the landing page next to `next`, producing the mangled
 * `/?tab=epics&next=%2Fsprints`.
 */
const denied = (url: string) => {
  const response = middleware(new NextRequest(new URL(url, "https://aexy.io")));
  return new URL(response!.headers.get("location")!);
};

describe("auth-gate return address", () => {
  it("carries the query string, not just the path", () => {
    const location = denied("/sprints?tab=epics");
    expect(location.pathname).toBe("/");
    expect(location.searchParams.get("next")).toBe("/sprints?tab=epics");
  });

  it("does not leak the denied page's params onto the landing page", () => {
    const location = denied("/sprints?tab=epics");
    // `next` is the only param. `tab` sitting here as well is the bug.
    expect([...location.searchParams.keys()]).toEqual(["next"]);
  });

  it("keeps every filter, not only the first", () => {
    const location = denied("/crm?stage=won&owner=me&page=3");
    expect(location.searchParams.get("next")).toBe("/crm?stage=won&owner=me&page=3");
  });

  it("still works for a path with no query", () => {
    expect(denied("/sprints").searchParams.get("next")).toBe("/sprints");
  });

  it("leaves an authenticated request alone", () => {
    const request = new NextRequest(new URL("/sprints?tab=epics", "https://aexy.io"));
    request.cookies.set("aexy_authed", "1");
    expect(middleware(request).headers.get("location")).toBeNull();
  });

  it("produces a return address the sanitizer accepts", () => {
    // The landing page runs every `next` through `safeInternalPath` before
    // acting on it. A query string must not trip the open-redirect guard, and
    // must not become a way to smuggle one past it either.
    expect(safeInternalPath("/sprints?tab=epics")).toBe("/sprints?tab=epics");
    expect(safeInternalPath("//evil.com?next=/sprints")).toBeNull();
    expect(safeInternalPath("/\\evil.com?x=1")).toBeNull();
  });
});

/** Does the gate redirect this path for an anonymous visitor? */
const isGated = (path: string) =>
  middleware(new NextRequest(new URL(path, "https://aexy.io")))
    .headers.get("location") !== null;

/**
 * The prefix list is a hand-maintained copy of the route directories, and it
 * had drifted badly: twenty-one sections of the app had no entry, so each
 * served the signed-in shell to an anonymous visitor until the client-side
 * redirect fired — the leak the gate's own comment says it exists to prevent.
 * Two entries, `/email` and `/leaves`, looked like cover for `/email-marketing`
 * and `/leave` and matched neither.
 *
 * Deriving the expectation from the filesystem is the only version of this test
 * worth having. Listing the paths by hand would be a second copy to drift.
 */
const APP_DIR = join(process.cwd(), "src/app");
const routeSegments = (group: string) =>
  readdirSync(join(APP_DIR, group), { withFileTypes: true })
    .filter((e) => e.isDirectory() && !/^[([_]/.test(e.name))
    .map((e) => `/${e.name}`);

describe("every protected section is gated", () => {
  for (const group of ["(app)", "(admin)"]) {
    for (const path of routeSegments(group)) {
      it(`gates ${path}`, () => {
        expect(isGated(path)).toBe(true);
        // Sub-paths too — a prefix that only matched the section's own index
        // would leave every page beneath it open.
        expect(isGated(`${path}/anything`)).toBe(true);
      });
    }
  }
});

/**
 * The other half, and the reason this change was the risky kind: a prefix that
 * reaches a path it should not locks out visitors who are supposed to get in.
 */
describe("public surfaces stay public", () => {
  const publicPaths = [
    "/", "/pricing", "/about", "/blog", "/careers", "/contact", "/security",
    "/privacy", "/terms", "/story", "/mission", "/manifesto", "/handbook",
    "/changelog", "/guides", "/products", "/compare", "/use-cases", "/take",
    // The anonymous booking flow, and the rewrite source that reaches it.
    // Middleware runs before rewrites, so `/book/*` is what this sees — and
    // `/booking` must not capture it.
    "/book/acme/intro-call",
    "/public/book/acme/intro-call",
    // Forms, RSVPs, shared tables and the customer ticket portal: namespaced
    // under /public so no section prefix can reach them.
    "/public/forms/f-1", "/public/rsvp/r-1", "/public/tables/t-1",
    "/public/tickets/tk-1",
    // Embeds are iframed into customer pages by design.
    "/embed/tables/t-1",
    // Public profile slugs, the forum, and the auth entry points.
    "/p/some-slug", "/community", "/login", "/auth/callback", "/oauth/consent",
    "/invite/abc123",
    // The existing exception: reachable during signup, before the cookie exists.
    "/onboarding/connect",
  ];

  for (const path of publicPaths) {
    it(`leaves ${path} alone`, () => {
      expect(isGated(path)).toBe(false);
    });
  }

  it("does not confuse a section with a longer public path", () => {
    // `/t` is the task short-link resolver. It must match itself and `/t/…`
    // without swallowing `/take` or `/terms`.
    expect(isGated("/t")).toBe(true);
    expect(isGated("/t/acme/1042")).toBe(true);
    expect(isGated("/take")).toBe(false);
    expect(isGated("/terms")).toBe(false);
  });
});
