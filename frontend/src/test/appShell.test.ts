/**
 * Invariants the app shell owns, and pages must not re-declare.
 *
 * `AppShell` used to render children into `<div className="mx-0 p-0">` — it
 * supplied no header, no width, no padding and no landmark structure. Pages
 * filled all four gaps themselves, and the results contradicted each other and
 * the shell:
 *
 *  - **234 `min-h-screen` occurrences across 119 files**, each establishing a
 *    full-viewport box *inside* a container that already scrolls. Harmless while
 *    the shell had no header; once the topbar existed, every one of them
 *    overflowed by the topbar's height and put a scrollbar on the page.
 *  - **80 `<main>` elements across 57 pages**, nested inside the shell's own
 *    `<main>`. Two `main` landmarks make the "skip to main content" link
 *    ambiguous, and 56 routes had one.
 *  - **225 repaints of `bg-background`** on top of the background the shell had
 *    already painted.
 *
 * These are cheap to reintroduce by copying a neighbouring page, and none of
 * them looks wrong in a diff.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const APP = join(__dirname, "..", "app", "(app)");
const SHELL = join(__dirname, "..", "components", "layout", "AppShell.tsx");

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (entry.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const files = tsxFiles(APP);

/**
 * Source with comments removed.
 *
 * Every one of these rules is explained in a comment next to the code it
 * governs, and those comments quote the very thing being banned — the shell's
 * own note says "<main> keeps the id the skip link targets". Scanning raw text
 * counts the explanation as a violation.
 */
const read = (p: string) =>
  readFileSync(p, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Raw source, for assertions that are about the prose or the whole file. */
const readRaw = (p: string) => readFileSync(p, "utf8");

describe("the shell owns the page frame", () => {
  it("renders exactly one <main>, and it is the skip-link target", () => {
    expect(read(SHELL).match(/<main\b/g) ?? []).toHaveLength(1);
    expect(readRaw(SHELL)).toContain('id="main-content"');
    expect(readRaw(SHELL)).toContain('href="#main-content"');
  });

  it("<main> stays a block box, so pages that centre themselves keep their width", () => {
    /*
      107 pages wrap themselves in `mx-auto max-w-…`. That works because <main>
      lays them out as blocks: a block child fills the line, and the max-width
      then caps it while the auto margins centre what is left.

      Make <main> a flex or grid container and every one of those pages
      silently narrows. A flex item is stretched to the line's cross size only
      when neither cross-axis margin is `auto`, and `mx-auto` is exactly that —
      so the item falls back to its content width. `/exports` rendered at 704px
      inside a 1344px area, and nothing errored, warned, or failed a build.

      A page that needs to fill the viewport height gives itself a definite one
      (see ProjectLayoutClient) rather than making the shell a flex column.
    */
    const mainTag = read(SHELL).match(/<main[\s\S]*?>/)?.[0] ?? "";
    expect(mainTag, "the <main> tag moved").toContain("main-content");
    const classes = (mainTag.match(/className="([^"]*)"/)?.[1] ?? "").split(/\s+/);
    // Whole tokens only: `flex-1` is a flex *item* property and is fine here —
    // it is `display: flex` on the container that does the damage.
    for (const display of ["flex", "grid", "inline-flex", "inline-grid"]) {
      expect(
        classes.includes(display),
        `<main> must not be a ${display} container — it collapses every ` +
          "`mx-auto max-w-*` page to its content width"
      ).toBe(false);
    }
  });

  it("no page nests a second <main> inside it", () => {
    const offenders = files.filter((f) => /<main\b/.test(read(f))).map((f) => relative(APP, f));
    expect(offenders, "use a <div>: AppShell already provides the main landmark").toEqual([]);
  });

  it("no page re-establishes a full-viewport height", () => {
    // `min-h-full` is the right tool inside the shell — it resolves against the
    // scrolling column, which is the viewport minus the topbar.
    const offenders = files.filter((f) => /min-h-screen/.test(read(f))).map((f) => relative(APP, f));
    expect(offenders, "use min-h-full — min-h-screen overflows the shell by the topbar's height").toEqual([]);
  });

  it("the shell adds no padding or width of its own, so PageShell can own both", () => {
    // The regression this guards is the opposite of the others: putting padding
    // back on the shell would double it for every page that adopts PageShell.
    const shell = read(SHELL);
    expect(shell).not.toMatch(/<main[^>]*className="[^"]*\b(p|px|py|max-w)-/);
  });
});

describe("loading and error states", () => {
  const modules = readdirSync(APP).filter((e) => statSync(join(APP, e)).isDirectory());

  it("every module streams a skeleton while it resolves", () => {
    const missing = modules.filter((m) => {
      try {
        return !statSync(join(APP, m, "loading.tsx")).isFile();
      } catch {
        return true;
      }
    });
    expect(missing, "add a loading.tsx rendering <PageSkeleton />").toEqual([]);
  });

  /*
    The error half of the same promise. 30 modules had an `error.tsx` and 11 did
    not, which is the worst arrangement: a thrown render in `gtm` or `tables`
    escaped to the nearest boundary above it and blanked the whole shell,
    sidebar included, while the same failure in `crm` degraded to one panel.
  */
  it("every module contains its own render failures", () => {
    const missing = modules.filter((m) => {
      try {
        return !statSync(join(APP, m, "error.tsx")).isFile();
      } catch {
        return true;
      }
    });
    expect(missing, "add an error.tsx rendering <ModuleError />").toEqual([]);
  });
});

/*
  There is one breadcrumb on screen and the topbar draws it.

  `ui/breadcrumb.tsx` is imported by 49 pages that used to draw their own trail
  in the page body. Once the topbar started deriving one from the pathname,
  every one of those routes showed two trails forty pixels apart — the same
  defect that made /settings show two disagreeing ones. The component now
  publishes to the topbar and renders nothing, so a page that starts drawing
  its own `<nav aria-label="Breadcrumb">` again is reintroducing the bug.
*/
describe("breadcrumbs", () => {
  it("no page under (app) renders its own breadcrumb nav", () => {
    const offenders = files
      .filter((f) => /aria-label=["']Breadcrumb["']/.test(read(f)))
      .map((f) => relative(APP, f));
    expect(offenders).toEqual([]);
  });

  it("ui/breadcrumb publishes to the topbar rather than rendering a trail", () => {
    const src = read(join(__dirname, "..", "components", "ui", "breadcrumb.tsx"));
    expect(src).toContain("useBreadcrumbOverride");
    expect(src).not.toMatch(/<nav\b/);
  });
});
