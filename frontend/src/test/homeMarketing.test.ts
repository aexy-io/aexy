/**
 * Source-scan guards for the marketing homepage (`app/page.tsx`).
 *
 * The homepage was split into a server component plus two client islands
 * (AuthRedirect, plus the shared LandingHeader) so it can export metadata and stop shipping
 * the whole marketing tree as client JS. Nothing in the build enforces that
 * split: adding `"use client"` back, dropping the metadata export, or
 * forgetting to render AuthRedirect all ship silently — the page still looks
 * fine in a browser while losing its SERP title or its logged-in bounce.
 *
 * Same philosophy as marketingRouteParity.test.ts: assert existence and
 * wiring, not copy, so marketing text can churn without breaking tests.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");
const APP = join(ROOT, "src", "app");
const PAGE = join(APP, "page.tsx");
const HOME_DIR = join(ROOT, "src", "components", "landing", "home");

const page = () => readFileSync(PAGE, "utf8");

// Anchor targets that other marketing pages and old inbound links rely on.
// #platform survives the product-tour restructure on purpose.
const REQUIRED_ANCHORS = ["solutions", "platform", "agents", "mcp", "compare"];

function internalHrefs(src: string): string[] {
  // href="/x/y" in JSX and href: "/x/y" in content arrays. Anchors, external
  // URLs, and bare "/" (the logo link) are out of scope.
  const matches = [
    ...src.matchAll(/href=["']\/([a-z0-9-][a-z0-9/-]*)["']/g),
    ...src.matchAll(/href: ["']\/([a-z0-9-][a-z0-9/-]*)["']/g),
  ];
  return [...new Set(matches.map((m) => m[1]))];
}

function routeExists(slug: string): boolean {
  return existsSync(join(APP, ...slug.split("/"), "page.tsx"));
}

describe("homepage server/client split", () => {
  it("page.tsx is a server component", () => {
    expect(page().includes('"use client"'), "page.tsx must not be a client component — the metadata export would be silently ignored").toBe(false);
  });

  it("page.tsx exports page-level metadata", () => {
    expect(page()).toMatch(/export const metadata/);
  });

  it("page.tsx renders the AuthRedirect island", () => {
    expect(page()).toMatch(/<AuthRedirect\s*\/>/);
  });

  it("uses the same chrome as every other marketing page", () => {
    // The homepage used to carry its own forked header and footer, which is
    // how the chrome drifts: a link added to the shared nav silently misses
    // the highest-traffic page.
    //
    // LedgerPage now renders the header and footer itself, so composing it is
    // what guarantees the shared chrome. It also means the homepage must NOT
    // render them again — doing so produced a visibly doubled footer, since
    // two fixed headers stack invisibly but two footers do not.
    const src = page();
    expect(src, "homepage must compose LedgerPage").toMatch(/<LedgerPage>/);
    expect(src, "LedgerPage renders the header; a second one duplicates it").not.toMatch(/<LandingHeader\s*\/>/);
    expect(src, "LedgerPage renders the footer; a second one duplicates it").not.toMatch(/<LandingFooter\s*\/>/);
  });

  it("the auth island validates the token before setting the presence cookie", () => {
    // Regression guard for the documented cookie-before-validate bug: setting
    // aexy_authed before getOnboardingStatus confirmed the token left
    // stale-token users routed into a protected shell.
    const src = readFileSync(join(HOME_DIR, "AuthRedirect.tsx"), "utf8");
    const validateAt = src.indexOf("getOnboardingStatus");
    const cookieAt = src.indexOf("setAuthPresenceCookie()");
    expect(validateAt).toBeGreaterThan(-1);
    expect(cookieAt).toBeGreaterThan(validateAt);
  });
});

describe("homepage anchors and links", () => {
  it("keeps the anchor ids other pages and inbound links target", () => {
    const src = page();
    const missing = REQUIRED_ANCHORS.filter((id) => !src.includes(`id="${id}"`));
    expect(missing, "anchor section ids missing from page.tsx").toEqual([]);
  });

  it("every internal link on the homepage resolves to a route on disk", () => {
    const sources = [
      page(),
      readFileSync(join(HOME_DIR, "homeContent.ts"), "utf8"),
      // The homepage renders the shared LandingHeader/LandingFooter (the same
      // chrome as every other marketing page), so their link catalogue is part
      // of the homepage's link surface too.
      readFileSync(join(ROOT, "src", "components", "landing", "LandingHeader.tsx"), "utf8"),
    ].join("\n");
    const broken = internalHrefs(sources).filter((slug) => !routeExists(slug));
    expect(broken, "homepage links to routes that do not exist").toEqual([]);
  });

  it("feeds the FAQPage structured data from the same list as the visible FAQ", () => {
    // buildHomepageJsonLd(faqs) must receive the composed list (with the
    // translated MCP entry spliced in), not the module-scope English array.
    expect(page()).toMatch(/buildHomepageJsonLd\(faqs\)/);
  });
});
