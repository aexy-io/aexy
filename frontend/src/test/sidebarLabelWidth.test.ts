/**
 * A sidebar row's label gets the width the row is not otherwise using.
 *
 * The Favorites rows read "Das… SERVICE DESK" and "Autom… AUTOPILOT" with
 * visible empty space to the right of them. Nothing was too long: the pin and
 * remove buttons are `opacity-0` until hover, but opacity does not free
 * layout, so they held 34px of the 204px row — plus their gap — at all times.
 * "Dashboard" needed 73px and was allotted 46.
 *
 * The fix is to take the hover controls out of flow. This test encodes that,
 * because jsdom has no layout engine and the widths themselves cannot be
 * asserted here — the measurement lives in the comment above and in the
 * browser session that produced it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const sidebar = readFileSync(
  join(__dirname, "..", "components", "layout", "Sidebar.tsx"),
  "utf8"
);

/** The Favorites row: from its `group/fav` marker to the end of that element. */
function favoritesRow(): string {
  const start = sidebar.indexOf("group/fav ");
  expect(start, "the Favorites row lost its group/fav marker").toBeGreaterThan(-1);
  return sidebar.slice(start, start + 2600);
}

describe("sidebar label width", () => {
  it("keeps the favourites hover controls out of the row's flow", () => {
    const row = favoritesRow();
    const controls = row.slice(row.indexOf("group-hover/fav:opacity-100"));
    // Look back at the class string the reveal lives in.
    const cluster = row.slice(
      row.lastIndexOf("<div", row.indexOf("group-hover/fav:opacity-100")),
      row.indexOf("group-hover/fav:opacity-100") + 40
    );
    expect(controls.length).toBeGreaterThan(0);
    expect(
      cluster,
      "opacity-0 hides the pin/remove buttons but still reserves their width — " +
        "position them absolutely so the label gets it instead"
    ).toMatch(/\babsolute\b/);
  });

  it("shrinks the app badge before it shrinks the item label", () => {
    const row = favoritesRow();
    const badge = row.slice(row.indexOf("{parentLabel && ("), row.indexOf("{parentLabel}"));
    expect(
      badge,
      "a shrink-0 badge takes its width off the label; a half-read app name " +
        "still identifies the row, a half-read item name does not"
    ).not.toMatch(/\bshrink-0\b/);
  });
});
