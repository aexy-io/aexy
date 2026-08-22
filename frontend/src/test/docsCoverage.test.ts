/**
 * Documentation coverage, as a check rather than a claim.
 *
 * Two separate promises are made about the handbook and neither was enforced:
 *
 *  - **Everything published is meant to be public.** Four internal planning
 *    documents — MCP_COVERAGE_PLAN, TEAM_INBOX_PLAN, UNIFIED_EMAIL_PLAN and
 *    plans/docs-from-code-ux — were not referenced from docs/README.md, so the
 *    generator's orphan bucketer swept them into a section called "Modules",
 *    titled them with their raw uppercase filenames, added them to the search
 *    index and listed them in sitemap.xml. They carry "Status: proposed",
 *    unreleased branch names and candid notes on what is broken.
 *
 *  - **Every app either has a document or an admitted reason it does not.**
 *    Nine apps have no doc. That is allowed; what is not allowed is a *new* app
 *    arriving with neither, because then the gap grows without anyone deciding
 *    it should.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { APP_CATALOG } from "@/config/appDefinitions";
import { MODULE_HELP } from "@/config/moduleHelp";

const ROOT = join(__dirname, "..", "..");
const DOCS_OUT = join(ROOT, "public", "docs");
const DOCS_SRC = join(ROOT, "..", "docs");

interface DocIndex {
  sections: { title: string; items: { slug: string }[] }[];
  lookup: Record<string, unknown>;
}

const index: DocIndex | null = existsSync(join(DOCS_OUT, "index.json"))
  ? JSON.parse(readFileSync(join(DOCS_OUT, "index.json"), "utf8"))
  : null;

/** Same shapes the generator holds back. Kept in step by the test below. */
const INTERNAL = [/(^|\/)[A-Z0-9_]+_PLAN\.md$/, /^plans\//];

describe("the published handbook", () => {
  it("has been generated", () => {
    expect(index, "run `npm run docs:gen`").not.toBeNull();
  });

  it("publishes no internal planning document", () => {
    const leaked = Object.keys(index!.lookup).filter((slug) =>
      INTERNAL.some((re) => re.test(`${slug}.md`)),
    );
    expect(leaked).toEqual([]);
  });

  /*
    The orphan bucketer is a safety net, not a filing system: anything it
    catches is a page nobody chose to publish, sitting under a machine-made
    heading. An empty net means every published page was placed deliberately.
  */
  it("files every page under a curated section, with nothing in 'Other'", () => {
    const other = index!.sections.find((s) => s.title === "Other");
    expect(other?.items.map((i) => i.slug) ?? []).toEqual([]);
  });

  it("holds back every internal document that exists in docs/", () => {
    const found: string[] = [];
    const walk = (dir: string, base = "") => {
      for (const name of readdirSync(dir)) {
        const abs = join(dir, name);
        const rel = base ? `${base}/${name}` : name;
        if (statSync(abs).isDirectory()) walk(abs, rel);
        else if (name.endsWith(".md") && INTERNAL.some((re) => re.test(rel))) found.push(rel);
      }
    };
    if (existsSync(DOCS_SRC)) walk(DOCS_SRC);
    // The patterns must still match something, or a rename has quietly turned
    // the filter into a no-op and the next plan document ships publicly.
    expect(found.length).toBeGreaterThan(0);
    for (const rel of found) {
      expect(Object.keys(index!.lookup)).not.toContain(rel.replace(/\.md$/, ""));
    }
  });
});

describe("module documentation coverage", () => {
  it("records a decision for every app in the catalog", () => {
    const undecided = Object.keys(APP_CATALOG).filter((id) => !(id in MODULE_HELP));
    expect(
      undecided,
      "add an entry to src/config/moduleHelp.ts — a handbook slug, or null with a `gap` saying why not",
    ).toEqual([]);
  });

  it("describes no app the catalog does not have", () => {
    const stale = Object.keys(MODULE_HELP).filter((id) => !(id in APP_CATALOG));
    expect(stale).toEqual([]);
  });

  it("points every documented app at a page that exists", () => {
    const broken = Object.entries(MODULE_HELP)
      .filter(([, h]) => h.href && !(h.href in index!.lookup))
      .map(([id, h]) => `${id} → ${h.href}`);
    expect(broken).toEqual([]);
  });

  it("gives every undocumented app a stated reason", () => {
    const silent = Object.entries(MODULE_HELP)
      .filter(([, h]) => h.href === null && !h.gap?.trim())
      .map(([id]) => id);
    expect(silent).toEqual([]);
  });
});
