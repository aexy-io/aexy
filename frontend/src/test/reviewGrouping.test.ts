/**
 * The unit of review is the change, not the document.
 *
 * One merge can leave proposals on a dozen pages. "The auth rework touched
 * these four" is a decision somebody takes in one pass; four unrelated
 * documents are four chores they put off — which is how a review queue stops
 * being opened at all.
 *
 * The grouping itself is pure, so it is tested here rather than through the
 * page.
 */

import { describe, expect, it } from "vitest";

import type { ReviewItem } from "@/lib/api";

/** Mirrors the grouping in the review page. */
function group(items: ReviewItem[]) {
  const byKey = new Map<string, { label: string; items: ReviewItem[] }>();
  const ungrouped: ReviewItem[] = [];
  for (const item of items) {
    if (!item.group_key) {
      ungrouped.push(item);
      continue;
    }
    const existing = byKey.get(item.group_key);
    if (existing) existing.items.push(item);
    else byKey.set(item.group_key, { label: item.group_label ?? item.group_key, items: [item] });
  }
  const real: { key: string; label: string; items: ReviewItem[] }[] = [];
  for (const [key, g] of byKey) {
    if (g.items.length > 1) real.push({ key, ...g });
    else ungrouped.push(g.items[0]);
  }
  ungrouped.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { real, ungrouped };
}

const item = (over: Partial<ReviewItem> = {}): ReviewItem =>
  ({
    kind: "document_proposal",
    id: "i1",
    title: "Doc",
    summary: "changed",
    requested_by_id: null,
    created_at: "2026-03-01T00:00:00Z",
    reason: null,
    needs_attention: false,
    document_id: "d1",
    ...over,
  }) as ReviewItem;

describe("review grouping", () => {
  it("collects items caused by the same change", () => {
    const { real } = group([
      item({ id: "a", group_key: "commit:abc", group_label: "Commit abc1234" }),
      item({ id: "b", group_key: "commit:abc", group_label: "Commit abc1234" }),
      item({ id: "c", group_key: "commit:abc", group_label: "Commit abc1234" }),
    ]);

    expect(real).toHaveLength(1);
    expect(real[0].label).toBe("Commit abc1234");
    expect(real[0].items.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps separate causes separate", () => {
    const { real } = group([
      item({ id: "a", group_key: "commit:abc", group_label: "Commit abc" }),
      item({ id: "b", group_key: "commit:abc", group_label: "Commit abc" }),
      item({ id: "c", group_key: "pr:412", group_label: "Pull request #412" }),
      item({ id: "d", group_key: "pr:412", group_label: "Pull request #412" }),
    ]);

    expect(real.map((g) => g.key).sort()).toEqual(["commit:abc", "pr:412"]);
  });

  it("does not put a heading over a single item", () => {
    // A group of one is furniture: it costs a heading and a button to say
    // nothing the row did not already say.
    const { real, ungrouped } = group([
      item({ id: "alone", group_key: "commit:xyz", group_label: "Commit xyz" }),
    ]);

    expect(real).toHaveLength(0);
    expect(ungrouped.map((i) => i.id)).toEqual(["alone"]);
  });

  it("leaves items nobody caused ungrouped", () => {
    // A manual regenerate has no cause but the person who asked. Collecting
    // those under a heading would imply a relationship they do not have.
    const { real, ungrouped } = group([
      item({ id: "manual-1" }),
      item({ id: "manual-2" }),
    ]);

    expect(real).toHaveLength(0);
    expect(ungrouped).toHaveLength(2);
  });

  it("orders the ungrouped oldest first", () => {
    const { ungrouped } = group([
      item({ id: "new", created_at: "2026-03-05T00:00:00Z" }),
      item({ id: "old", created_at: "2026-03-01T00:00:00Z" }),
    ]);

    expect(ungrouped.map((i) => i.id)).toEqual(["old", "new"]);
  });

  it("mixes kinds within one cause", () => {
    // A push can leave both a document rewrite and a held tool call behind.
    const { real } = group([
      item({ id: "doc", group_key: "commit:abc", group_label: "Commit abc" }),
      item({
        id: "act",
        kind: "agent_action",
        group_key: "commit:abc",
        group_label: "Commit abc",
      }),
    ]);

    expect(real[0].items.map((i) => i.kind)).toEqual([
      "document_proposal",
      "agent_action",
    ]);
  });
});
