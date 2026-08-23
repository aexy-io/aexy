/**
 * Dashboard widgets are as tall as their contents.
 *
 * The grid used to force every card in a row to the height of the tallest
 * (`[&>*]:h-full` on the item, `flex-1` on the card's last section). "My Work"
 * set a 669px row, so "Work by type" — five bars, ~295px of content — was
 * inflated to 669 and drew ~370px of empty card. Two of those were visible
 * above the fold on a 1600×900 screen.
 *
 * Items now span as many 1px rows as they measure, and `grid-flow-row-dense`
 * packs the rest around them. Measured after: every item carries exactly the
 * 16px baked-in row gap as slack, and the grid is 1207px instead of ~1700.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(
  join(__dirname, "..", "components", "dashboard", "SortableWidgetGrid.tsx"),
  "utf8"
);

// The doc comments quote the classes they explain having removed, so scanning
// prose would flag the file for getting it right.
const grid = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("dashboard widget grid", () => {
  it("does not stretch a card to its row's height", () => {
    for (const stretch of ["[&>*]:h-full", "[&>*>*:last-child]:flex-1"]) {
      expect(
        grid.includes(stretch),
        `${stretch} inflates a short widget to the tallest one in its row — ` +
          "that is the empty-card bug this layout replaced"
      ).toBe(false);
    }
  });

  it("sizes rows from measured content", () => {
    expect(grid, "1px auto-rows is what makes per-item spans possible").toMatch(
      /\[grid-auto-rows:1px\]/
    );
    expect(grid, "dense packing is what closes the gaps the spans leave").toMatch(
      /grid-flow-row-dense/
    );
    expect(grid).toMatch(/gridRowEnd: `span \$\{span\}`/);
  });

  it("the measurement cannot drive a render loop", () => {
    // A ResizeObserver that sets state unconditionally, on an element whose
    // height that state controls, is an infinite loop. The bail-out is the
    // whole safety argument — see renderLoop.test.ts for the one that shipped.
    expect(grid, "setSpan must return `prev` when the value is unchanged").toMatch(
      /setSpan\(\(prev\) => \(prev === next \? prev : next\)\)/
    );
  });

  it("an empty widget collapses but stays measurable", () => {
    // `display: none` measures 0 forever, so a widget that starts empty and
    // later has something to show — Sprint Overview once its team query
    // resolves — could never measure its way back into view.
    expect(grid).not.toMatch(/display: "none"/);
    expect(grid, "an empty item collapses to a single row instead").toMatch(
      /gridRowEnd: "span 1"/
    );
  });
});
