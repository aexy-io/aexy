/**
 * A queue nobody opens is the failure this area keeps running into.
 *
 * The review inbox only works if you can see it filling without visiting it,
 * which is what the badge is for — and a badge is only worth having if it is
 * wired to a real count and disappears when there is nothing waiting.
 */

import { describe, expect, it } from "vitest";

import { SIDEBAR_LAYOUTS, type SidebarItemConfig } from "@/config/sidebarLayouts";

function allItems(): SidebarItemConfig[] {
  const out: SidebarItemConfig[] = [];
  const walk = (items: SidebarItemConfig[]) => {
    for (const item of items) {
      out.push(item);
      if (item.items) walk(item.items);
    }
  };
  for (const layout of Object.values(SIDEBAR_LAYOUTS)) {
    for (const section of layout.sections) walk(section.items);
  }
  return out;
}

describe("sidebar badges", () => {
  it("marks the review queue as carrying a count", () => {
    const review = allItems().filter((item) => item.href === "/review");

    expect(review.length).toBeGreaterThan(0);
    for (const item of review) {
      expect(item.badge).toBe("review");
    }
  });

  it("only declares badges the hook can resolve", () => {
    // A badge naming a key nothing supplies renders as a permanent zero —
    // which reads as "nothing waiting" and is worse than no badge at all.
    const known = new Set(["review"]);
    const unknown = allItems()
      .filter((item) => item.badge && !known.has(item.badge))
      .map((item) => `${item.href} → ${item.badge}`);

    expect(unknown).toEqual([]);
  });

  it("leaves every other entry unbadged", () => {
    // The point of a badge is that it means something. One on every row is
    // decoration people stop seeing.
    const badged = allItems().filter((item) => item.badge);

    expect(new Set(badged.map((item) => item.href))).toEqual(new Set(["/review"]));
  });

  it("points at the workspace-level queue, not the docs one", () => {
    // The queue holds agent actions from any module, so it cannot live behind
    // the docs app's access gate.
    const stale = allItems().filter((item) => item.href === "/docs/review");

    expect(stale).toEqual([]);
  });
});
