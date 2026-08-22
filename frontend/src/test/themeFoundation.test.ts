/**
 * Guards for the Open Ledger token layer.
 *
 * Three things here fail silently in a way no page test would catch:
 *
 *  1. A token wired into tailwind.config.ts but missing from one of the two
 *     themes. `hsl(var(--missing))` is not an error — it resolves to an invalid
 *     colour, so the element paints transparent or black in that theme only.
 *     Nobody notices until somebody switches themes on the one page that uses
 *     it. Every `hsl(var(--x))` in the config must exist in BOTH blocks.
 *
 *  2. The pre-hydration theme script. It exists because ThemeProvider stamps
 *     the class in a `useEffect`, one frame after paint. Convert it to
 *     `next/script`, move it below `<body>`, or drop it while refactoring the
 *     root layout and the flash comes straight back — with no test failure and
 *     no visual diff in a warm reload, which is exactly how it survived this
 *     long the first time.
 *
 *  3. The default theme and the storage key are read by BOTH the store and the
 *     script. If those two ever disagree, the class stamped before paint gets
 *     replaced on hydration — which is the flash the script exists to prevent,
 *     reintroduced by the fix for it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");
const css = readFileSync(join(ROOT, "src", "app", "globals.css"), "utf8");
const tw = readFileSync(join(ROOT, "tailwind.config.ts"), "utf8");
const layout = readFileSync(join(ROOT, "src", "app", "layout.tsx"), "utf8");
const store = readFileSync(join(ROOT, "src", "stores", "themeStore.ts"), "utf8");

/** The `:root, .light` block — the paper theme. */
function paperBlock(): string {
  const m = css.match(/:root,\s*\.light\s*\{([\s\S]*?)\n {2}\}/);
    if (!m) throw new Error("paper theme block (`:root, .light`) not found in globals.css");
  return m[1];
}

/** The `.dark` block — Ledger Dark. */
function darkBlock(): string {
  const m = css.match(/\n {2}\.dark\s*\{([\s\S]*?)\n {2}\}/);
  if (!m) throw new Error("`.dark` block not found in globals.css");
  return m[1];
}

function declaredVars(block: string): Set<string> {
  return new Set([...block.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
}

describe("theme cascade", () => {
  it("puts the palette on :root so an unstamped document still paints", () => {
    // Paper is the default, so it must live on the bare selector. If the
    // palette moves back under a class, SSR and no-JS render unstyled.
    expect(paperBlock()).toMatch(/--background:/);
    expect(darkBlock()).toMatch(/--background:/);
  });

  it("keeps .light as an alias of :root rather than a competing block", () => {
    // ThemeProvider still writes `.light`. If it stops being an alias, a
    // light-mode user gets whichever block wins the cascade, not the one the
    // pre-hydration script assumed.
    expect(css).toMatch(/:root,\s*\.light\s*\{/);
  });

  it("defines every token tailwind.config.ts consumes, in both themes", () => {
    const consumed = [...tw.matchAll(/hsl\(var\((--[a-z0-9-]+)\)\)/g)].map((m) => m[1]);
    expect(consumed.length).toBeGreaterThan(20);

    const paper = declaredVars(paperBlock());
    const dark = declaredVars(darkBlock());

    const missingFromPaper = [...new Set(consumed)].filter((v) => !paper.has(v)).sort();
    const missingFromDark = [...new Set(consumed)].filter((v) => !dark.has(v)).sort();

    expect(missingFromPaper, "tokens used by tailwind.config.ts but undefined in the paper theme").toEqual([]);
    expect(missingFromDark, "tokens used by tailwind.config.ts but undefined in Ledger Dark").toEqual([]);
  });

  it("gives every status role all four slots", () => {
    // The missing -subtle/-border slots are why ~5,000 raw palette classes
    // exist. A role that ships without them sends the next author back to
    // `bg-red-50 text-red-700 border-red-200`.
    const paper = declaredVars(paperBlock());
    const dark = declaredVars(darkBlock());
    for (const role of ["success", "warning", "info", "neutral", "destructive"]) {
      for (const slot of ["", "-foreground", "-subtle", "-border"]) {
        expect(paper.has(`--${role}${slot}`), `--${role}${slot} missing from paper`).toBe(true);
        expect(dark.has(`--${role}${slot}`), `--${role}${slot} missing from Ledger Dark`).toBe(true);
      }
    }
  });

  it("routes every radius except `full` through --radius", () => {
    // Only lg/md/sm are wired by default, which would leave `rounded`,
    // `rounded-xl` and `rounded-2xl` (~3,100 uses) soft on a 2px design.
    expect(css).toMatch(/--radius:\s*2px/);
    for (const key of ["DEFAULT", "sm", "md", "lg", "xl", '"2xl"', '"3xl"']) {
      expect(tw, `borderRadius.${key} must derive from var(--radius)`).toMatch(
        new RegExp(`${key}:\\s*"[^"]*var\\(--radius\\)`),
      );
    }
  });

  it("leaves no hardcoded palette hexes in globals.css", () => {
    // Scrollbars and the nprogress bar used to pin slate and indigo literals,
    // so they did not follow the theme.
    //
    // Two exemptions. Comments quote the brand hexes to document what the HSL
    // values came from — prose, not paint. And the `.theme-ledger` block holds
    // marketing's brand colours, which are static on purpose: that surface must
    // not flip with the app's dark mode.
    const scannable = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\.theme-ledger\s*\{[\s\S]*?\n\}/, "");
    const hexes = [...scannable.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]);
    expect(hexes, "use hsl(var(--token)) instead").toEqual([]);
  });
});

describe("pre-hydration theme script", () => {
  it("is a plain inline <script>, not next/script", () => {
    // next/script defers even at beforeInteractive; only a synchronous inline
    // script is guaranteed to run before the first paint.
    const m = layout.match(/<script\s+dangerouslySetInnerHTML=\{\{\s*__html:[\s\S]*?\}\}\s*\/>/);
    expect(m, "inline theme script missing from app/layout.tsx").toBeTruthy();
    expect(m![0]).toContain("classList.add");
  });

  it("runs before <body>", () => {
    const scriptAt = layout.indexOf("classList.add");
    const bodyAt = layout.indexOf("<body");
    expect(scriptAt).toBeGreaterThan(-1);
    expect(scriptAt, "the theme script must be in <head>, above <body>").toBeLessThan(bodyAt);
  });

  it("reads the storage key and default from the store, not its own literals", () => {
    // Two copies of "what does a new visitor get" drift, and the drift shows
    // up as the exact flash this script prevents.
    expect(layout).toMatch(/THEME_STORAGE_KEY/);
    expect(layout).toMatch(/DEFAULT_THEME/);
    expect(layout).not.toMatch(/localStorage\.getItem\('aexy-theme'\)/);
    expect(store).toMatch(/export const DEFAULT_THEME/);
    expect(store).toMatch(/export const THEME_STORAGE_KEY/);
  });

  it("resolves 'system' rather than assuming a face for it", () => {
    expect(layout).toContain("prefers-color-scheme: dark");
  });
});

/*
  Contrast is a property of the token *values*, so it is checkable here rather
  than only in a browser. `npm run audit:contrast` drives real routes and
  catches what raw palette classes do on top of these tokens; this catches the
  floor those routes are built on, and it catches it in CI without a backend.

  The first pass of this file shipped six pairs below the line — light `warning`
  at 4.48, dark `destructive` at 4.43 (the one role you least want under AA),
  and `--input` at 1.24:1 against paper, which made every text field on a page
  background effectively borderless. All six were a lightness digit.
*/

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

function relativeLuminance(hsl: string): number {
  const [h, s, l] = hsl.split(/\s+/).map((p) => parseFloat(p));
  // HSL → RGB, then the WCAG luminance transfer curve.
  const c = (1 - Math.abs((2 * l) / 100 - 1)) * (s / 100);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l / 100 - c / 2;
  const [r, g, b] = (
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
      : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  ).map((v) => v + m);
  const lin = (u: number) => (u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Foreground/background pairs the token layer promises are readable. */
const TEXT_PAIRS: Array<[string, string]> = [
  ["foreground", "background"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["primary", "background"],
  ["primary-foreground", "primary"],
  ["destructive", "background"],
  ["destructive", "destructive-subtle"],
  ["destructive-foreground", "destructive"],
  ["success", "background"],
  ["success", "success-subtle"],
  ["warning", "background"],
  ["warning", "warning-subtle"],
  ["info", "background"],
  ["info", "info-subtle"],
  ["neutral", "background"],
  ["neutral", "neutral-subtle"],
];

/**
 * Control boundaries, which WCAG 1.4.11 holds to 3:1 rather than 4.5:1.
 * `--border` is deliberately *not* here — a hairline rule is decoration, and
 * holding it to 3:1 would mean giving up the Open Ledger look. `--input` is,
 * because ui/input.tsx renders `border border-input bg-background`: on a page
 * background that border is the only thing saying "type here".
 */
const BOUNDARY_PAIRS: Array<[string, string]> = [
  ["input", "background"],
  ["input", "card"],
];

describe("token contrast", () => {
  for (const [name, block] of [["paper", paperBlock()], ["ledger dark", darkBlock()]] as const) {
    const t = tokens(block);

    it(`${name}: every text pair clears WCAG AA (4.5:1)`, () => {
      const failures = TEXT_PAIRS.filter(([fg, bg]) => t[fg] && t[bg] && ratio(t[fg], t[bg]) < 4.5)
        .map(([fg, bg]) => `--${fg} on --${bg} = ${ratio(t[fg], t[bg]).toFixed(2)}`);
      expect(failures).toEqual([]);
    });

    it(`${name}: control boundaries clear WCAG 1.4.11 (3:1)`, () => {
      const failures = BOUNDARY_PAIRS.filter(([fg, bg]) => t[fg] && t[bg] && ratio(t[fg], t[bg]) < 3)
        .map(([fg, bg]) => `--${fg} on --${bg} = ${ratio(t[fg], t[bg]).toFixed(2)}`);
      expect(failures).toEqual([]);
    });

    it(`${name}: --input is not just --border again`, () => {
      expect(t.input).not.toBe(t.border);
    });
  }
});
