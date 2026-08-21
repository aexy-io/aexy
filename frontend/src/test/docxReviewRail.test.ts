/**
 * The review rail describes a proposal before anything is replayed.
 *
 * `summariseOps` is the pure half, and the half worth pinning: the banner used
 * to say "12 changes waiting", which is a count rather than something a person
 * can review. These tests hold it to describing each change in terms a reviewer
 * of a forty-page contract can act on.
 */

import { describe, expect, it } from "vitest";

import { summariseOps } from "@/components/docs/docxOps";

describe("summariseOps", () => {
  it("says what a replacement replaces, and with what", () => {
    const [row] = summariseOps([
      { kind: "replace_text", find: "thirty (30) days", replace: "sixty (60) days" },
    ]);
    expect(row.action).toBe("Replace text");
    expect(row.target).toBe("thirty (30) days");
    expect(row.becomes).toBe("sixty (60) days");
    expect(row.replayable).toBe(true);
    expect(row.asComment).toBe(false);
  });

  it("calls a deletion a deletion rather than showing an empty arrow", () => {
    // An empty `replace` is a delete. Rendering it as "→ " would read as a bug.
    const [row] = summariseOps([
      { kind: "replace_text", find: "and assigns", replace: "" },
    ]);
    expect(row.becomes).toBe("(deleted)");
  });

  it("prefers the backend's cell label over a raw coordinate", () => {
    // "Pricing tiers row 2, column 3" is reviewable; "table 0 / 1 / 2" is not.
    const [row] = summariseOps([
      {
        kind: "set_table_cell",
        table_index: 0,
        row: 1,
        column: 2,
        cell_label: "Pricing tiers row 2, column 3",
        expected_current: "£40,000",
        text: "£45,000",
      },
    ]);
    expect(row.target).toBe("Pricing tiers row 2, column 3");
    expect(row.becomes).toBe("£45,000");
  });

  it("falls back to what the cell said when there is no label", () => {
    const [row] = summariseOps([
      {
        kind: "set_table_cell",
        table_index: 0,
        row: 1,
        column: 2,
        expected_current: "£40,000",
        text: "£45,000",
      },
    ]);
    expect(row.target).toBe("£40,000");
  });

  it("reads a section op's body out of `markdown`", () => {
    // The field is `markdown`, not `body` — getting this wrong showed an empty
    // "becomes" on every section change.
    const [add] = summariseOps([
      { kind: "append_section", heading: "12. Governing law", markdown: "This deed…" },
    ]);
    expect(add.target).toBe("12. Governing law");
    expect(add.becomes).toBe("This deed…");

    const [rewrite] = summariseOps([
      { kind: "replace_section_body", heading: "4. Payment", markdown: "Net 60." },
    ]);
    expect(rewrite.action).toBe("Rewrite a section");
    expect(rewrite.becomes).toBe("Net 60.");
  });

  it("says where an appended section goes when it has no heading", () => {
    const [row] = summariseOps([{ kind: "append_section", markdown: "Schedule 3" }]);
    expect(row.target).toBe("at the end");
  });

  it("quotes the comment being replied to, not just its id", () => {
    // A `w:id` means nothing to a reviewer; the remark's own words do.
    const [row] = summariseOps([
      {
        kind: "reply_to_comment",
        comment_id: "7",
        expected_comment_text: "Is this the right cap?",
        text: "Confirmed with finance.",
      },
    ]);
    expect(row.target).toBe("Is this the right cap?");
    expect(row.becomes).toBe("Confirmed with finance.");
  });

  it("falls back to the id when the comment text was not stamped", () => {
    const [row] = summariseOps([
      { kind: "reply_to_comment", comment_id: "7", text: "Confirmed." },
    ]);
    expect(row.target).toBe("comment 7");
  });

  it("tells a comment apart from a tracked change", () => {
    // Both are replayable in the browser. Only one of them shows up as a
    // redline, and calling a comment "no redline" would send the reviewer
    // looking in the document text for a remark that is in the margin.
    const rows = summariseOps([
      { kind: "replace_text", find: "a", replace: "b" },
      { kind: "add_comment", anchor_find: "a", text: "why?" },
    ]);
    expect(rows[0]).toMatchObject({ replayable: true, asComment: false });
    expect(rows[1]).toMatchObject({ replayable: true, asComment: true });
  });

  it("flags an op the browser cannot replay at all", () => {
    // This is the case where nothing appears in the editor: the backend applies
    // it on accept. A reviewer told to look for markup would conclude the replay
    // is broken.
    const [row] = summariseOps([{ kind: "reflow_footnotes" }]);
    expect(row.replayable).toBe(false);
    expect(row.asComment).toBe(false);
  });

  it("carries a backend-known refusal through to the row", () => {
    // Shown before the replay rather than surfacing as a skipped op after it.
    const [row] = summariseOps([
      {
        kind: "set_table_cell",
        table_index: 9,
        row: 0,
        column: 0,
        unresolvable: "that table is not in this document",
      },
    ]);
    expect(row.unresolvable).toBe("that table is not in this document");
  });

  it("keeps an unknown op kind visible rather than dropping it", () => {
    // A proposal from a newer backend. Hiding the row would make the rail's
    // count disagree with the banner's.
    const rows = summariseOps([{ kind: "reflow_footnotes" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("reflow_footnotes");
    expect(rows[0].replayable).toBe(false);
  });

  it("shortens long text instead of letting a row run away", () => {
    const long = "x".repeat(400);
    const [row] = summariseOps([
      { kind: "replace_text", find: long, replace: "short" },
    ]);
    expect(row.target.length).toBeLessThanOrEqual(80);
    expect(row.target.endsWith("…")).toBe(true);
  });

  it("collapses whitespace so a multi-line body stays one row", () => {
    const [row] = summariseOps([
      { kind: "append_section", heading: "A", markdown: "one\n\n  two   three" },
    ]);
    expect(row.becomes).toBe("one two three");
  });

  it("indexes rows so a skipped op can be matched to its change", () => {
    const rows = summariseOps([
      { kind: "replace_text", find: "a", replace: "b" },
      { kind: "replace_text", find: "c", replace: "d" },
    ]);
    expect(rows.map((r) => r.index)).toEqual([0, 1]);
  });
});
