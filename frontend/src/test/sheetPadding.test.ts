/**
 * A `SheetContent` must lay itself out, because the primitive will not.
 *
 * `sheetVariants` in `ui/sheet.tsx` deliberately drops `p-6` from its base so a
 * sheet can compose `SheetHeader` / `SheetBody` / `SheetFooter` with their own
 * padding and scroll behaviour. That is a reasonable design and it has one
 * sharp edge: a sheet that uses neither the slots nor its own padding class
 * silently gets **zero**, and nothing in the type system or the build says so.
 *
 * The landing header's mobile menu was exactly that. Measured at 375px:
 *
 *   - `padding: 0px` on the panel
 *   - the "Menu" title at `top: 0`, against the very top of the screen
 *   - every nav link starting 1px from the panel edge
 *   - the "Get started" button running flush into the right edge of the viewport
 *
 * It looked deliberate enough in code review — the className carried a width, a
 * background and a border, so it read as styled.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const SRC = join(__dirname, "..");

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (entry.endsWith(".tsx")) out.push(p);
  }
  return out;
}

interface Usage {
  file: string;
  line: number;
  openTag: string;
  body: string;
}

function sheetUsages(): Usage[] {
  const out: Usage[] = [];
  for (const file of tsxFiles(SRC)) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("<SheetContent")) continue;
    for (const m of src.matchAll(/<SheetContent\b/g)) {
      const start = m.index!;
      const close = src.indexOf("</SheetContent>", start);
      const body = src.slice(start, close === -1 ? start + 2000 : close);
      out.push({
        file: relative(SRC, file),
        line: src.slice(0, start).split("\n").length,
        openTag: body.slice(0, body.indexOf(">") + 1),
        body,
      });
    }
  }
  return out;
}

const USAGES = sheetUsages();

describe("sheet layout", () => {
  it("finds the sheets", () => {
    // Guards against the scan silently matching nothing.
    expect(USAGES.length).toBeGreaterThan(1);
  });

  it("every sheet either pads itself or composes the layout slots", () => {
    const bare = USAGES.filter((u) => {
      const padded = /\b(p|px|py)-\d/.test(u.openTag);
      const slots = /<Sheet(Header|Body|Footer)\b/.test(u.body);
      return !padded && !slots;
    }).map((u) => `${u.file}:${u.line}`);
    expect(
      bare,
      "SheetContent with no padding and no SheetHeader/Body/Footer — the base variant supplies none, so its children sit flush against the panel edges",
    ).toEqual([]);
  });

  /*
    `p-0` is how a sheet says "my children handle this", and it is correct in
    two shapes: composing SheetHeader/Body/Footer (each of which pads itself),
    or wrapping a single component that owns its padding — AppShell's mobile
    nav wraps `<Sidebar>`, which has its own `px-2`. What it must not be is a
    way of saying nothing at all.
  */
  it("only uses p-0 where something else owns the padding", () => {
    const suspicious = USAGES.filter(
      (u) =>
        /\bp-0\b/.test(u.openTag) &&
        !/<Sheet(Header|Body|Footer)\b/.test(u.body) &&
        !/<(Sidebar|SettingsSidebar)\b/.test(u.body),
    ).map((u) => `${u.file}:${u.line}`);
    expect(
      suspicious,
      "p-0 on a sheet that neither composes the layout slots nor wraps a self-padding child",
    ).toEqual([]);
  });

  /*
    A drawer that covers the whole viewport leaves nothing to tap to dismiss,
    and on a 320px phone a flat `w-[300px]` leaves 20 pixels. Any fixed pixel
    width has to be capped against the viewport too.
  */
  it("caps fixed-pixel sheet widths against the viewport", () => {
    const uncapped = USAGES.filter((u) => {
      const fixed = /\bw-\[(\d+)px\]/.exec(u.openTag);
      if (!fixed) return false;
      return !/max-w-\[\d+vw\]/.test(u.openTag);
    }).map((u) => `${u.file}:${u.line}`);
    expect(
      uncapped,
      "fixed-px sheet width with no vw cap — use w-[min(Npx,85vw)] or add max-w-[85vw]",
    ).toEqual([]);
  });
});
