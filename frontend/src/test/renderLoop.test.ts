/**
 * The render loop on /sprints/[projectId]/backlog, and the two places it needs
 * to stay fixed.
 *
 * Symptom: "Maximum update depth exceeded", thousands of renders deep, for as
 * long as the page was open. The chain:
 *
 *   useTaskStatuses  →  `statuses: statuses || []`
 *                       a *new* array identity every render while the query
 *                       is in flight, disabled, or errored
 *   useProjectBoard  →  projectStatusSlugs → tasksByStatus
 *                       four chained useMemos, every one of them invalidated
 *   backlog/page     →  backlogItems → filteredItems
 *                    →  useEffect(() => setOrderedItems(filteredItems),
 *                                 [filteredItems])
 *                       setState every render → render → new identity → repeat
 *
 * Introduced in e02b903f; nothing warned, and it fired on every visit.
 *
 * Both ends are covered because each is independently sufficient — verified by
 * reverting them one at a time against the running app — and because the
 * pattern at each end is common enough to come back on its own.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(root, p), "utf8");

describe("backlog render loop", () => {
  it("useTaskConfig hands out a stable empty array, not a fresh literal", () => {
    const hook = src("src/hooks/useTaskConfig.ts");
    // Only the returned public surface matters — a `|| []` inside a callback
    // body is not handed to a caller's dependency array.
    const returned = [...hook.matchAll(/^ {4}(\w+): ([^,\n]+),$/gm)].map((m) => ({
      key: m[1],
      value: m[2],
    }));
    expect(returned.length, "the return-shape scan matched nothing").toBeGreaterThan(5);
    const churning = returned.filter((r) => /(\|\||\?\?)\s*\[\]/.test(r.value));
    expect(
      churning.map((r) => `${r.key}: ${r.value}`),
      "a fresh [] per render invalidates every useMemo downstream — return " +
        "EMPTY_ARRAY from @/lib/emptyArray instead"
    ).toEqual([]);
  });

  it("the backlog sync effect can bail out instead of setting state every render", () => {
    const page = src("src/app/(app)/sprints/[projectId]/backlog/page.tsx");
    const at = page.indexOf("setOrderedItems(");
    expect(at, "the backlog sync effect moved").toBeGreaterThan(-1);
    const effect = page.slice(at, page.indexOf("}, [filteredItems]);", at) + 20);
    expect(
      effect,
      "setOrderedItems(filteredItems) unconditionally is a setState per render; " +
        "use the updater form and return `prev` when nothing changed so React " +
        "skips the re-render"
    ).toMatch(/setOrderedItems\(\s*\(prev\)\s*=>/);
    expect(effect, "the bail-out branch must return the previous array").toMatch(
      /\?\s*prev\b/
    );
  });
});

/**
 * The same `|| []` sat in 166 hook return properties across 46 files. Each one
 * was a fresh identity per render, and each one poisoned every dependency
 * array downstream of it; only the backlog page happened to end its chain in a
 * setState. This keeps the literal from coming back anywhere.
 */
describe("hooks return stable empty arrays", () => {
  const HOOKS = join(root, "src", "hooks");

  it("no hook return property allocates a fresh []", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(HOOKS).filter((f) => f.endsWith(".ts"))) {
      const text = src(join("src", "hooks", file));
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        // A return-object property: four-space indent, or inline in a
        // single-line `return { … }`. Both forms shipped this bug.
        const isProperty = /^ {4}[A-Za-z_$][\w$]*: .*\|\| \[\],$/.test(line);
        const isInlineReturn = /^\s*return \{.*\|\| \[\].*\};$/.test(line);
        if (isProperty || isInlineReturn) offenders.push(`${file}:${i + 1} ${line.trim()}`);
      });
    }
    expect(
      offenders,
      "use `?? EMPTY_ARRAY` from @/lib/emptyArray — a literal is a new " +
        "identity on every render, for as long as the query has no data"
    ).toEqual([]);
  });

  it("the shared empty array is frozen, so nothing can mutate it for everyone", () => {
    expect(src("src/lib/emptyArray.ts")).toMatch(/Object\.freeze\(\[\]\)/);
  });
});
