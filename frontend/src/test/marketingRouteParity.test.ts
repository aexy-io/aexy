/**
 * Marketing product routes are wired by hand in four places, and nothing was
 * checking they agree.
 *
 * A product page needs: the route file, an entry in `sitemap.ts`'s
 * `productSlugs`, a card in `LandingHeader`'s `productLinks`, and a link in
 * `LandingFooter`. Miss the sitemap and the page ships uncrawled; miss the nav
 * and it ships unreachable. Both fail silently — there is no build error, no
 * failing test, and the page looks perfect when you visit it directly.
 *
 * These assertions are deliberately about *existence*, not content: they catch
 * the forgotten-sync class of bug without freezing marketing copy that is
 * expected to churn.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");
const SITEMAP = join(ROOT, "src", "app", "sitemap.ts");
const HEADER = join(ROOT, "src", "components", "landing", "LandingHeader.tsx");

function productSlugsFromSitemap(): string[] {
  const src = readFileSync(SITEMAP, "utf8");
  const block = src.slice(
    src.indexOf("const productSlugs"),
    src.indexOf("const useCaseSlugs")
  );
  return [...block.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
}

function productHrefsFromHeader(): string[] {
  const src = readFileSync(HEADER, "utf8");
  const block = src.slice(
    src.indexOf("const productLinks"),
    src.indexOf("const solutionLinks")
  );
  return [...block.matchAll(/href: "\/products\/([a-z0-9-]+)"/g)].map((m) => m[1]);
}

describe("marketing product route parity", () => {
  it("parses both sources", () => {
    // Guards against a refactor silently turning these into empty arrays, which
    // would make every assertion below vacuously true.
    expect(productSlugsFromSitemap().length).toBeGreaterThan(10);
    expect(productHrefsFromHeader().length).toBeGreaterThan(10);
  });

  it("every product page on disk is listed in the sitemap", () => {
    const slugs = productSlugsFromSitemap();
    const missing = slugs.filter(
      (slug) => !existsSync(join(ROOT, "src", "app", "products", slug, "page.tsx"))
    );
    expect(missing, "sitemap lists product slugs that have no page.tsx").toEqual([]);
  });

  it("every product in the header nav is in the sitemap", () => {
    const slugs = new Set(productSlugsFromSitemap());
    const orphaned = productHrefsFromHeader().filter((slug) => !slugs.has(slug));
    expect(
      orphaned,
      "linked from the products dropdown but absent from sitemap.ts — the page ships uncrawled"
    ).toEqual([]);
  });

  it("every product in the header nav has a page on disk", () => {
    const broken = productHrefsFromHeader().filter(
      (slug) => !existsSync(join(ROOT, "src", "app", "products", slug, "page.tsx"))
    );
    expect(broken, "products dropdown links to a route that does not exist").toEqual([]);
  });

  it("links the MCP product page from nav, footer and sitemap", () => {
    // Named explicitly rather than left to the generic checks: this is the page
    // the whole MCP push points at, and a broken link to it is the failure that
    // makes the rest of the work pointless.
    const header = readFileSync(HEADER, "utf8");
    expect(productSlugsFromSitemap()).toContain("mcp");
    expect(productHrefsFromHeader()).toContain("mcp");
    // The footer renders the product catalogue by mapping productLinks (the
    // Open Ledger header keeps nav minimal, so there are no hand-maintained
    // duplicate lists anymore). Assert the wiring that makes the mcp link
    // actually reach the page: the footer maps the same constant the checks
    // above validated.
    expect(header).toMatch(/links=\{\[\s*\.\.\.productLinks/);
    expect(header).toMatch(/<FooterColumn title="Solutions" links=\{solutionLinks\}/);
  });
});
