import { describe, expect, it } from "vitest";

import {
  collapseUnchanged,
  diffBlocks,
  diffDocuments,
  diffStats,
  extractBlocks,
} from "@/components/docs/documentDiff";

const para = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const heading = (level: number, text: string) => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});

const doc = (...content: unknown[]) => ({ type: "doc", content });

describe("extractBlocks", () => {
  it("reads headings and paragraphs in document order", () => {
    const blocks = extractBlocks(doc(heading(2, "Auth"), para("It signs you in.")));

    expect(blocks).toEqual([
      { text: "Auth", level: 2 },
      { text: "It signs you in.", level: 0 },
    ]);
  });

  it("joins text split across marks", () => {
    // TipTap splits a sentence at every mark boundary. Comparing the pieces
    // would report a change every time someone bolded a word.
    const blocks = extractBlocks(
      doc({
        type: "paragraph",
        content: [
          { type: "text", text: "Call " },
          { type: "text", marks: [{ type: "code" }], text: "login()" },
          { type: "text", text: " first." },
        ],
      })
    );

    expect(blocks).toEqual([{ text: "Call login() first.", level: 0 }]);
  });

  it("reaches text nested inside lists", () => {
    const blocks = extractBlocks(
      doc({
        type: "bulletList",
        content: [{ type: "listItem", content: [para("A step")] }],
      })
    );

    expect(blocks).toEqual([{ text: "A step", level: 0 }]);
  });

  it("skips empty blocks", () => {
    expect(extractBlocks(doc(para(""), { type: "paragraph" }))).toEqual([]);
  });

  it("survives content that is not a document at all", () => {
    expect(extractBlocks(null)).toEqual([]);
    expect(extractBlocks({ title: "not tiptap" })).toEqual([]);
  });
});

describe("diffDocuments", () => {
  it("marks an added paragraph and leaves the rest alone", () => {
    const before = doc(heading(1, "Guide"), para("One."));
    const after = doc(heading(1, "Guide"), para("One."), para("Two."));

    expect(diffDocuments(before, after)).toEqual([
      { type: "unchanged", text: "Guide", level: 1 },
      { type: "unchanged", text: "One.", level: 0 },
      { type: "added", text: "Two.", level: 0 },
    ]);
  });

  it("reports a rewrite as one removal and one addition", () => {
    const result = diffDocuments(doc(para("Old wording.")), doc(para("New wording.")));

    expect(result).toEqual([
      { type: "removed", text: "Old wording.", level: 0 },
      { type: "added", text: "New wording.", level: 0 },
    ]);
  });

  it("does not mark everything below an insertion as changed", () => {
    // The reason for LCS rather than index-by-index. Getting this wrong reads
    // as "the AI rewrote the whole page" and teaches people to approve blind.
    const before = doc(para("A"), para("B"), para("C"));
    const after = doc(para("NEW"), para("A"), para("B"), para("C"));

    const result = diffDocuments(before, after)!;

    expect(diffStats(result)).toEqual({ added: 1, removed: 0 });
    expect(result.filter((l) => l.type === "unchanged").map((l) => l.text)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("handles a deletion in the middle", () => {
    const result = diffDocuments(
      doc(para("A"), para("B"), para("C")),
      doc(para("A"), para("C"))
    )!;

    expect(diffStats(result)).toEqual({ added: 0, removed: 1 });
    expect(result.find((l) => l.type === "removed")?.text).toBe("B");
  });

  it("returns no changes for identical documents", () => {
    const same = doc(heading(1, "Same"), para("Body."));

    expect(diffStats(diffDocuments(same, same)!)).toEqual({ added: 0, removed: 0 });
  });

  it("gives up rather than building a huge table", () => {
    // Past the bound the section summary is the better view; a quadratic
    // table in the browser is not.
    const many = doc(...Array.from({ length: 500 }, (_, i) => para(`line ${i}`)));

    expect(diffDocuments(many, many)).toBeNull();
  });
});

describe("collapseUnchanged", () => {
  it("hides long stretches of agreement and counts them", () => {
    const lines = diffBlocks(
      Array.from({ length: 20 }, (_, i) => ({ text: `line ${i}`, level: 0 })),
      [
        ...Array.from({ length: 20 }, (_, i) => ({ text: `line ${i}`, level: 0 })),
        { text: "new tail", level: 0 },
      ]
    )!;

    const collapsed = collapseUnchanged(lines, 2);

    expect(collapsed.some((l) => l.type === "gap")).toBe(true);
    expect(collapsed.length).toBeLessThan(lines.length);
    // The change itself always survives collapsing.
    expect(
      collapsed.some((l) => "text" in l && l.text === "new tail")
    ).toBe(true);
  });

  it("keeps context either side of a change", () => {
    const lines = diffBlocks(
      [
        { text: "a", level: 0 },
        { text: "b", level: 0 },
        { text: "c", level: 0 },
      ],
      [
        { text: "a", level: 0 },
        { text: "CHANGED", level: 0 },
        { text: "c", level: 0 },
      ]
    )!;

    const texts = collapseUnchanged(lines, 1)
      .filter((l): l is Exclude<typeof l, { type: "gap"; count: number }> =>
        "text" in l
      )
      .map((l) => l.text);

    expect(texts).toContain("a");
    expect(texts).toContain("c");
  });

  it("leaves a document with no changes fully collapsed", () => {
    const lines = diffBlocks(
      [{ text: "a", level: 0 }],
      [{ text: "a", level: 0 }]
    )!;

    expect(collapseUnchanged(lines)).toEqual([{ type: "gap", count: 1 }]);
  });
});
