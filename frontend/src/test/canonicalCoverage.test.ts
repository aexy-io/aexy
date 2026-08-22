/**
 * Every public marketing route must declare its own canonical URL and its own
 * title/description.
 *
 * The bug this guards against shipped silently and cost the whole site: the
 * root layout carried `alternates: { canonical: "/" }`, and because Next
 * inherits metadata down the route tree, all 64 public pages emitted
 * `<link rel="canonical" href="https://aexy.io">`. Every product page,
 * comparison page, and guide told Google it was a duplicate of the homepage.
 * Twenty of them additionally inherited the homepage's title and description
 * verbatim, because their page.tsx is a client component (where a `metadata`
 * export is ignored) and no sibling layout.tsx supplied one.
 *
 * Neither failure is visible in a browser, in the build output, or in any
 * other test — the pages render perfectly while being uncrawlable.
 *
 * Like the other marketing tests here, these assertions are about *wiring*,
 * not copy: they check that a canonical and a description exist and point at
 * the right route, never what they say.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, relative, sep } from "path";

const ROOT = join(__dirname, "..", "..");
const APP = join(ROOT, "src", "app");

// Route groups and auth-gated / tokenised trees are out of scope: they are
// either noindex, robots-disallowed, or not marketing surfaces at all.
const EXCLUDED = [
  "(app)", "(admin)", "auth", "embed", "public", "community",
  "p", "take", "invite", "oauth",
];

function publicPages(dir = APP, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (dir === APP && EXCLUDED.includes(name)) continue;
      publicPages(full, acc);
    } else if (name === "page.tsx") {
      acc.push(full);
    }
  }
  return acc;
}

/** The URL path a page.tsx resolves to, e.g. "/products/crm". */
function routeOf(pageFile: string): string {
  const rel = relative(APP, pageFile).split(sep).slice(0, -1);
  return "/" + rel.join("/");
}

/** Strip comments — otherwise a comment *about* canonicals reads as one. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Remove nested `openGraph: {...}` / `twitter: {...}` blocks. Those carry their
 * own `title`, which is NOT subject to the document title.template and is
 * expected to spell the brand out in full.
 */
function stripSocialBlocks(src: string): string {
  let out = src;
  for (const key of ["openGraph", "twitter"]) {
    for (;;) {
      const at = out.indexOf(`${key}: {`);
      if (at === -1) break;
      const i = out.indexOf("{", at);
      let depth = 0, j = i;
      for (; j < out.length; j++) {
        if (out[j] === "{") depth++;
        else if (out[j] === "}" && --depth === 0) break;
      }
      out = out.slice(0, at) + out.slice(j + 1);
    }
  }
  return out;
}

/**
 * page.tsx, its sibling layout.tsx, and any local module the page builds its
 * metadata *from*.
 *
 * The last part matters because thirteen product pages export
 * `metadata = productMetadata(data)` rather than an object literal. The
 * canonical is set — in the helper, from the page's own slug — and a scan that
 * only reads the two files would report all thirteen as missing it. Following
 * the import is what keeps this check about the shipped `<head>` rather than
 * about how the file happens to be written.
 */
function metadataSources(pageFile: string): string {
  const layout = join(pageFile, "..", "layout.tsx");
  let raw = readFileSync(pageFile, "utf8") + (existsSync(layout) ? readFileSync(layout, "utf8") : "");

  for (const m of raw.matchAll(/export const metadata[^=]*=\s*(\w+)\(/g)) {
    const helper = m[1];
    const imp = raw.match(
      new RegExp(`import\\s*\\{[^}]*\\b${helper}\\b[^}]*\\}\\s*from\\s*"@/([^"]+)"`),
    );
    if (!imp) continue;
    for (const ext of [".tsx", ".ts"]) {
      const f = join(ROOT, "src", imp[1] + ext);
      if (existsSync(f)) {
        raw += readFileSync(f, "utf8");
        break;
      }
    }
  }
  return stripComments(raw);
}

const PAGES = publicPages();

describe("public route metadata coverage", () => {
  it("finds the marketing pages", () => {
    // Guards against the walker silently returning [] and making every
    // assertion below vacuously true.
    expect(PAGES.length).toBeGreaterThan(40);
  });

  it("the root layout does not set a site-wide canonical", () => {
    // The one line that broke every page. A canonical here is inherited by
    // every route that does not override it.
    const root = stripComments(readFileSync(join(APP, "layout.tsx"), "utf8"));
    const metadata = root.slice(root.indexOf("export const metadata"), root.indexOf("const webApplicationJsonLd"));
    expect(metadata).not.toMatch(/canonical/);
  });

  it("every public page declares a canonical", () => {
    const missing = PAGES.filter((f) => !metadataSources(f).includes("canonical")).map(routeOf);
    expect(missing, "no canonical — these inherit whatever the parent sets").toEqual([]);
  });

  it("every public page declares its own title and description", () => {
    const missing = PAGES.filter((f) => {
      const src = metadataSources(f);
      // `title,` / `description,` shorthand counts: /products/mcp builds both
      // from translations and passes them as shorthand properties.
      return !/\btitle\s*[:,]/.test(src) || !/\bdescription\s*[:,]/.test(src);
    }).map(routeOf);
    expect(missing, "no title/description — these inherit the homepage's").toEqual([]);
  });

  /*
    A page built from a shared metadata helper canonicalises to `slug`, not to a
    literal path — so the literal check below cannot see it, and a copy-pasted
    page whose slug was never updated would quietly tell Google it is a
    duplicate of whichever page it was copied from. That is the same failure the
    root-layout canonical caused, one page at a time.
  */
  it("helper-built product pages carry their own slug", () => {
    const wrong: string[] = [];
    for (const f of PAGES) {
      const src = stripComments(readFileSync(f, "utf8"));
      if (!/productMetadata\(/.test(src)) continue;
      const slug = src.match(/slug:\s*"([^"]+)"/)?.[1];
      const expected = routeOf(f).split("/").pop();
      if (slug !== expected) wrong.push(`${routeOf(f)} declares slug "${slug ?? "(none)"}"`);
    }
    expect(wrong).toEqual([]);
  });

  it("static routes canonicalise to their own path", () => {
    // Dynamic routes ([slug]) build theirs from params, so only check literals.
    const wrong: string[] = [];
    for (const f of PAGES) {
      const route = routeOf(f);
      if (route.includes("[")) continue;
      const src = metadataSources(f);
      const m = src.match(/canonical:\s*"([^"]+)"/);
      if (!m) continue;
      // The homepage is the one route legitimately canonicalising to "/".
      const expected = route === "/" ? ["/", "https://aexy.io/"] : [route];
      if (!expected.includes(m[1])) wrong.push(`${route} → ${m[1]}`);
    }
    expect(wrong, "canonical points somewhere other than the page's own URL").toEqual([]);
  });

  it("does not repeat the brand in titles the template already brands", () => {
    // The root layout's title.template is "%s | Aexy", so a plain-string child
    // title that also says "Aexy" renders twice — "About Aexy | Aexy". A title
    // that legitimately carries the brand (the /compare/* pages, where "Aexy
    // vs Jira" IS the target query) must opt out via `title: { absolute }`.
    const doubled: string[] = [];
    for (const f of PAGES) {
      const src = stripSocialBlocks(metadataSources(f));
      // Only bare `title: "..."` — `title: { absolute: "..." }` does not match.
      for (const m of src.matchAll(/\btitle:\s*[`"]([^`"]+)[`"]/g)) {
        if (/Aexy/.test(m[1])) doubled.push(`${routeOf(f)}: "${m[1]}"`);
      }
    }
    expect(doubled, "brand-carrying title must use `title: { absolute }`").toEqual([]);
  });
});
