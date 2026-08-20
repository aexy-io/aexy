/**
 * Replaying Aexy ops into a document, against a fake automation host.
 *
 * The test that matters most is `test_replacements_are_applied_in_reverse`. The
 * obvious implementation — search, replace, search again — loops for ever in
 * suggesting mode, because a tracked replacement leaves the original text in the
 * document wrapped in `w:del`, so the next search finds the phrase it just
 * "replaced". The observable symptom was a paragraph containing the replacement
 * fifty times over, and the revision counts in the saved file looked entirely
 * plausible throughout: `w:ins` was 6 either way. Nothing but the rendered
 * document showed it, which is why the shape of the calls is pinned here.
 */

import { describe, expect, it } from "vitest";

import { applyAexyOps, opsAreFullyReviewable } from "@/components/docs/docxOps";

type Op = Record<string, unknown>;

interface FakeComment {
  id: string;
  author: string;
  text: string;
  replies?: readonly FakeComment[];
}

const handleFor = (comment: FakeComment) => ({ kind: "comment", ref: `c${comment.id}` });

/**
 * Minimal stand-in for the engine's automation host.
 *
 * Records every batch so a test can assert the *order* operations were issued
 * in, which is the property the reverse-order fix is about.
 */
function fakeHost(options: {
  /** How many spans `search` answers. */
  matches?: number;
  /** Batches whose first op kind is in here answer `ok: false`. */
  refuse?: Set<string>;
  /** Body paragraphs, as `[styleName, text]`. "" style means body prose. */
  paragraphs?: readonly [string, string][];
  /** Comment threads in the document. Replies are nested, as the engine reports them. */
  comments?: readonly FakeComment[];
} = {}) {
  const matches = options.matches ?? 1;
  const refuse = options.refuse ?? new Set<string>();
  const paragraphs = options.paragraphs ?? [];
  const comments = options.comments ?? [];
  const calls: Op[] = [];

  const flat = new Map<string, FakeComment>();
  const collect = (list: readonly FakeComment[]) => {
    for (const comment of list) {
      flat.set(comment.id, comment);
      collect(comment.replies ?? []);
    }
  };
  collect(comments);
  const commentOf = (op: Op) =>
    flat.get(String((op.comment as { ref: string } | undefined)?.ref).slice(1));
  const batchSizes: number[] = [];

  const host = {
    calls,
    /** Length of each batch, index-aligned with `calls`. */
    batchSizes,
    capabilities: {} as never,
    revision: () => 0,
    subscribe: () => () => undefined,
    dispose: () => undefined,
    save: () => ({ ok: true, bytes: new Uint8Array() }) as never,
    execute: (request: { operations: Op[] }) => {
      const op = request.operations[0];
      calls.push(op);
      batchSizes.push(request.operations.length);
      const kind = op.op as string;

      if (refuse.has(kind)) return { ok: false, results: [{ status: "error" }] };

      if (kind === "getDocument") {
        return {
          ok: true,
          results: [{ status: "ok", value: { kind: "handle", handle: { kind: "document", ref: "d" } } }],
        };
      }
      if (kind === "getBody") {
        return {
          ok: true,
          results: [{ status: "ok", value: { kind: "handle", handle: { kind: "body", ref: "b" } } }],
        };
      }
      if (kind === "getParagraphs") {
        return {
          ok: true,
          results: [
            {
              status: "ok",
              value: {
                kind: "handles",
                handles: paragraphs.map((_, i) => ({ kind: "paragraph", ref: `p${i}` })),
              },
            },
          ],
        };
      }
      if (kind === "getStyle") {
        const ref = ((op.span as { paragraph: { ref: string } }).paragraph).ref;
        const i = Number(ref.slice(1));
        return { ok: true, results: [{ status: "ok", value: { kind: "text", style: paragraphs[i]?.[0] ?? "" } }] };
      }
      if (kind === "getText") {
        const ref = (op.target as { ref: string }).ref;
        const i = Number(ref.slice(1));
        return { ok: true, results: [{ status: "ok", value: { kind: "text", text: paragraphs[i]?.[1] ?? "" } }] };
      }
      if (kind === "deleteParagraph") {
        return { ok: true, results: [{ status: "ok", value: { kind: "text", text: "" } }] };
      }
      if (kind === "search") {
        return {
          ok: true,
          results: [
            {
              status: "ok",
              value: {
                kind: "spans",
                // Distinguishable so order is assertable.
                spans: Array.from({ length: matches }, (_, i) => ({ id: i })),
              },
            },
          ],
        };
      }
      if (kind === "insertParagraph") {
        return {
          ok: true,
          results: [
            {
              status: "ok",
              value: {
                kind: "handle",
                handle: { kind: "paragraph", ref: `p${calls.length}` },
              },
            },
          ],
        };
      }
      if (kind === "getComments") {
        // Thread PARENTS only, exactly like the engine: a reply is reachable
        // solely through getCommentReplies, which is what findComment must walk.
        return {
          ok: true,
          results: [{ status: "ok", value: { kind: "handles", handles: comments.map(handleFor) } }],
        };
      }
      if (kind === "getCommentReplies") {
        const replies = commentOf(op)?.replies ?? [];
        return {
          ok: true,
          results: [{ status: "ok", value: { kind: "handles", handles: replies.map(handleFor) } }],
        };
      }
      if (kind === "getCommentId") {
        return { ok: true, results: [{ status: "ok", value: { kind: "text", text: commentOf(op)?.id ?? "" } }] };
      }
      if (kind === "getCommentAuthor") {
        return { ok: true, results: [{ status: "ok", value: { kind: "text", text: commentOf(op)?.author ?? "" } }] };
      }
      if (kind === "getCommentText") {
        return { ok: true, results: [{ status: "ok", value: { kind: "text", text: commentOf(op)?.text ?? "" } }] };
      }
      if (kind === "insertComment" || kind === "replyToComment") {
        return { ok: true, results: [{ status: "ok", value: { kind: "handle", handle: { kind: "comment", ref: "cNew" } } }] };
      }
      if (kind === "setCommentResolved") {
        return { ok: true, results: [{ status: "ok", value: { kind: "applied" } }] };
      }
      // replaceSpan, setStyle
      return { ok: true, results: [{ status: "ok", value: { kind: "handle", handle: { kind: "x", ref: "x" } } }] };
    },
  };
  return host;
}

describe("opsAreFullyReviewable", () => {
  it("is true when every op can be marked up", () => {
    expect(
      opsAreFullyReviewable([
        { kind: "replace_text", find: "a" },
        { kind: "append_section", heading: "H" },
      ])
    ).toBe(true);
  });

  it("is true for all four kinds the backend can produce", () => {
    expect(
      opsAreFullyReviewable([
        { kind: "replace_text", find: "a" },
        { kind: "append_section", heading: "H" },
        { kind: "replace_section_body", heading: "H" },
        { kind: "set_table_cell", table_index: 0, row: 0, column: 0 },
      ])
    ).toBe(true);
  });

  it("is false for a kind this version does not know", () => {
    // A proposal written by a newer backend than the page it is opened in.
    expect(
      opsAreFullyReviewable([
        { kind: "replace_text", find: "a" },
        { kind: "insert_image" },
      ])
    ).toBe(false);
  });
});

describe("applyAexyOps — replace_text", () => {
  it("searches once and replaces, rather than re-searching per match", () => {
    const host = fakeHost({ matches: 3 });

    const result = applyAexyOps(host as never, [
      { kind: "replace_text", find: "20%", replace: "30%" },
    ]);

    expect(result).toEqual({ applied: 1, skipped: [] });

    const searches = host.calls.filter((c) => c.op === "search");
    const replaces = host.calls.filter((c) => c.op === "replaceSpan");
    // One search for three matches. Re-searching is what loops for ever.
    expect(searches).toHaveLength(1);
    expect(replaces).toHaveLength(3);
  });

  it("applies replacements in reverse document order", () => {
    const host = fakeHost({ matches: 3 });

    applyAexyOps(host as never, [
      { kind: "replace_text", find: "20%", replace: "30%" },
    ]);

    const replacedSpanIds = host.calls
      .filter((c) => c.op === "replaceSpan")
      .map((c) => (c.span as { id: number }).id);
    // Last match first: an edit shifts the offsets of everything after it, so
    // walking backwards leaves the not-yet-processed spans still valid.
    expect(replacedSpanIds).toEqual([2, 1, 0]);
  });

  it("does not loop when the replacement contains the search text", () => {
    const host = fakeHost({ matches: 1 });

    const result = applyAexyOps(host as never, [
      { kind: "replace_text", find: "20%", replace: "20% (was 25%)" },
    ]);

    expect(result.applied).toBe(1);
    expect(host.calls.filter((c) => c.op === "search")).toHaveLength(1);
    expect(host.calls.filter((c) => c.op === "replaceSpan")).toHaveLength(1);
  });

  it("reports text that is not there instead of silently doing nothing", () => {
    const host = fakeHost({ matches: 0 });

    const result = applyAexyOps(host as never, [
      { kind: "replace_text", find: "nowhere", replace: "x" },
    ]);

    expect(result.applied).toBe(0);
    expect(result.skipped[0].reason).toContain("not in this document");
  });

  it("refuses before editing when the occurrence count disagrees", () => {
    const host = fakeHost({ matches: 1 });

    const result = applyAexyOps(host as never, [
      { kind: "replace_text", find: "20%", replace: "30%", count: 3 },
    ]);

    expect(result.applied).toBe(0);
    expect(result.skipped[0].reason).toContain("expected 3");
    // Nothing was written: an op written against a different document must not
    // half-apply.
    expect(host.calls.filter((c) => c.op === "replaceSpan")).toHaveLength(0);
  });
});

describe("applyAexyOps — append_section", () => {
  it("anchors on the body rather than a bare handle", () => {
    const host = fakeHost();

    const result = applyAexyOps(host as never, [
      { kind: "append_section", heading: "Risks", level: 2, markdown: "One.\n\nTwo." },
    ]);

    expect(result).toEqual({ applied: 1, skipped: [] });

    const inserts = host.calls.filter((c) => c.op === "insertParagraph");
    // Heading plus two body paragraphs.
    expect(inserts).toHaveLength(3);
    // The engine rejects a bare handle as `not-a-body-handle`.
    expect(inserts[0].anchor).toEqual({ body: { kind: "body", ref: "b" }, at: "last" });
    expect(inserts[1].anchor).toHaveProperty("paragraph");
    expect(host.calls.some((c) => c.op === "setStyle")).toBe(true);
  });

  it("reports a refused heading rather than claiming success", () => {
    const host = fakeHost({ refuse: new Set(["insertParagraph"]) });

    const result = applyAexyOps(host as never, [
      { kind: "append_section", heading: "Risks" },
    ]);

    expect(result.applied).toBe(0);
    expect(result.skipped[0].reason).toContain("refused");
  });
});

describe("applyAexyOps — unsupported ops", () => {
  it("skips a kind it does not know, naming the op and why", () => {
    const host = fakeHost({ matches: 1 });

    const result = applyAexyOps(host as never, [
      { kind: "replace_text", find: "20%", replace: "30%" },
      { kind: "insert_image", text: "logo.png" },
    ]);

    expect(result.applied).toBe(1);
    expect(result.skipped).toEqual([
      {
        index: 1,
        kind: "insert_image",
        reason: "cannot be shown as a tracked change yet",
      },
    ]);
  });

  it("skips everything when the document cannot be addressed", () => {
    const host = fakeHost({ refuse: new Set(["getDocument"]) });

    const result = applyAexyOps(host as never, [
      { kind: "replace_text", find: "a", replace: "b" },
    ]);

    expect(result.applied).toBe(0);
    expect(result.skipped[0].reason).toContain("could not be addressed");
  });
});


describe("applyAexyOps — replace_section_body", () => {
  const doc: readonly [string, string][] = [
    ["Heading 1", "Policy"],
    ["Heading 2", "Scope"],
    ["", "Old scope line one."],
    ["", "Old scope line two."],
    ["Heading 3", "Sub-detail"],
    ["", "Belongs to Scope."],
    ["Heading 2", "Notes"],
    ["", "Keep me."],
  ];

  /** Paragraph refs cleared or rewritten via replaceSpan. */
  const spanEdits = (host: ReturnType<typeof fakeHost>) =>
    host.calls
      .filter((c) => c.op === "replaceSpan")
      .map((c) => ({
        ref: ((c.span as { paragraph?: { ref: string } }).paragraph ?? { ref: "?" }).ref,
        text: c.text as string,
      }));

  it("never uses deleteParagraph, which is destructive even when suggesting", () => {
    // The engine removes the text outright with no `w:del`, leaving a reviewer
    // nothing to reject. Verified against the real engine both ways.
    const host = fakeHost({ paragraphs: doc });

    applyAexyOps(host as never, [
      { kind: "replace_section_body", heading: "Scope", markdown: "New scope." },
    ]);

    expect(host.calls.some((c) => c.op === "deleteParagraph")).toBe(false);
  });

  it("clears only the section's own body, as tracked edits", () => {
    const host = fakeHost({ paragraphs: doc });

    const result = applyAexyOps(host as never, [
      { kind: "replace_section_body", heading: "Scope", markdown: "New scope." },
    ]);

    expect(result).toEqual({ applied: 1, skipped: [] });

    const edits = spanEdits(host);
    const refs = edits.map((e) => e.ref);
    // Indices 2..5 — the body plus the deeper subsection, which is part of this
    // section. Index 6 ("Notes", same level) ends it and survives.
    expect(new Set(refs)).toEqual(new Set(["p2", "p3", "p4", "p5"]));
    expect(refs).not.toContain("p6");
    expect(refs).not.toContain("p7");
    // The heading itself is untouched.
    expect(refs).not.toContain("p1");
  });

  it("puts the replacement text on the first old paragraph", () => {
    // So the redline reads as "this became that", not as a deletion sitting
    // next to an unrelated insertion.
    const host = fakeHost({ paragraphs: doc });

    applyAexyOps(host as never, [
      { kind: "replace_section_body", heading: "Scope", markdown: "New scope." },
    ]);

    const edits = spanEdits(host);
    expect(edits.find((e) => e.ref === "p2")?.text).toBe("New scope.");
    expect(edits.find((e) => e.ref === "p3")?.text).toBe("");
  });

  it("edits last-first", () => {
    const host = fakeHost({ paragraphs: doc });

    applyAexyOps(host as never, [
      { kind: "replace_section_body", heading: "Scope", markdown: "New." },
    ]);

    const order = spanEdits(host).map((e) => Number(e.ref.slice(1)));
    expect(order).toEqual([...order].sort((a, b) => b - a));
  });

  it("inserts additional blocks beyond the first as new paragraphs", () => {
    const host = fakeHost({ paragraphs: doc });

    applyAexyOps(host as never, [
      { kind: "replace_section_body", heading: "Scope", markdown: "One.\n\nTwo.\n\nThree." },
    ]);

    const inserted = host.calls
      .filter((c) => c.op === "insertParagraph")
      .map((c) => c.text as string);
    // "One." replaced the first old paragraph; the rest are genuinely new.
    expect(inserted).toEqual(["Two.", "Three."]);
  });

  it("runs to the end of the document when nothing closes the section", () => {
    const host = fakeHost({
      paragraphs: [
        ["Heading 2", "Notes"],
        ["", "One."],
        ["", "Two."],
      ],
    });

    applyAexyOps(host as never, [
      { kind: "replace_section_body", heading: "Notes", markdown: "New." },
    ]);

    expect(spanEdits(host)).toHaveLength(2);
  });

  it("reports a heading that is not there, having changed nothing", () => {
    const host = fakeHost({ paragraphs: doc });

    const result = applyAexyOps(host as never, [
      { kind: "replace_section_body", heading: "Nonexistent", markdown: "x" },
    ]);

    expect(result.applied).toBe(0);
    expect(result.skipped[0].reason).toContain("no heading titled");
    expect(host.calls.some((c) => c.op === "replaceSpan")).toBe(false);
  });

  it("refuses an empty replacement of an already-empty section", () => {
    const host = fakeHost({
      paragraphs: [
        ["Heading 2", "Notes"],
        ["Heading 2", "Next"],
      ],
    });

    const result = applyAexyOps(host as never, [
      { kind: "replace_section_body", heading: "Notes", markdown: "" },
    ]);

    expect(result.applied).toBe(0);
    expect(result.skipped[0].reason).toContain("already empty");
  });
});

describe("applyAexyOps — set_table_cell", () => {
  it("locates the cell by the text the backend resolved", () => {
    const host = fakeHost({ matches: 1 });

    const result = applyAexyOps(host as never, [
      {
        kind: "set_table_cell",
        table_index: 0,
        row: 2,
        column: 2,
        text: "$150k",
        expected_current: "$120k",
        cell_label: "Price, row 3",
      },
    ]);

    expect(result).toEqual({ applied: 1, skipped: [] });
    const search = host.calls.find((c) => c.op === "search");
    expect(search?.text).toBe("$120k");
  });

  it("refuses when the text is ambiguous rather than editing the wrong cell", () => {
    const host = fakeHost({ matches: 4 });

    const result = applyAexyOps(host as never, [
      {
        kind: "set_table_cell",
        expected_current: "Yes",
        text: "No",
        cell_label: "Approved, row 2",
      },
    ]);

    expect(result.applied).toBe(0);
    expect(result.skipped[0].reason).toContain("appears 4 times");
    expect(host.calls.some((c) => c.op === "replaceSpan")).toBe(false);
  });

  it("refuses when the cell no longer says what the agent saw", () => {
    const host = fakeHost({ matches: 0 });

    const result = applyAexyOps(host as never, [
      { kind: "set_table_cell", expected_current: "$120k", text: "$150k" },
    ]);

    expect(result.applied).toBe(0);
    expect(result.skipped[0].reason).toContain('no longer says "$120k"');
  });

  it("reports an unresolved coordinate instead of guessing", () => {
    const host = fakeHost({ matches: 1 });

    const result = applyAexyOps(host as never, [
      { kind: "set_table_cell", table_index: 9, row: 0, column: 0, text: "x" },
    ]);

    expect(result.applied).toBe(0);
    expect(result.skipped[0].reason).toContain("current text is unknown");
  });
});


describe("applyAexyOps — headings in a renamed or localised document", () => {
  it("finds a heading whose style is not called \"Heading N\"", () => {
    // A document authored in a non-English Word, or from a corporate template.
    // The backend reads `w:outlineLvl` for these; the automation protocol does
    // not expose it, so the browser matches the text and uses the style as an
    // opaque token to bound the section.
    const host = fakeHost({
      paragraphs: [
        ["Titre 1", "Politique"],
        ["Titre 2", "Portée"],
        ["", "Ancienne ligne."],
        ["Titre 2", "Notes"],
        ["", "Garder."],
      ],
    });

    const result = applyAexyOps(host as never, [
      { kind: "replace_section_body", heading: "Portée", markdown: "Nouvelle." },
    ]);

    expect(result).toEqual({ applied: 1, skipped: [] });
    const edited = host.calls
      .filter((c) => c.op === "replaceSpan")
      .map((c) => ((c.span as { paragraph: { ref: string } }).paragraph).ref);
    // Only the section's body: bounded by the next paragraph wearing "Titre 2".
    expect(edited).toEqual(["p2"]);
  });

  it("prefers the style-name strategy when both could match", () => {
    // "Heading 2" carries a level, which gives the correct extent — a deeper
    // subsection stays inside the section. The fallback cannot know that.
    const host = fakeHost({
      paragraphs: [
        ["Heading 2", "Scope"],
        ["", "Body."],
        ["Heading 3", "Deeper"],
        ["", "Also body."],
        ["Heading 2", "Notes"],
      ],
    });

    applyAexyOps(host as never, [
      { kind: "replace_section_body", heading: "Scope", markdown: "New." },
    ]);

    const edited = host.calls
      .filter((c) => c.op === "replaceSpan")
      .map((c) => ((c.span as { paragraph: { ref: string } }).paragraph).ref);
    expect(new Set(edited)).toEqual(new Set(["p1", "p2", "p3"]));
  });

  it("refuses an ambiguous fallback rather than picking one", () => {
    // Without a level there is nothing to disambiguate two sections with the
    // same title, so guessing would edit the wrong one.
    const host = fakeHost({
      paragraphs: [
        ["Titre 2", "Notes"],
        ["", "One."],
        ["Titre 2", "Notes"],
        ["", "Two."],
      ],
    });

    const result = applyAexyOps(host as never, [
      { kind: "replace_section_body", heading: "Notes", markdown: "x" },
    ]);

    expect(result.applied).toBe(0);
    expect(result.skipped[0].reason).toContain("no heading titled");
    expect(host.calls.some((c) => c.op === "replaceSpan")).toBe(false);
  });

  it("does not treat body prose as a heading", () => {
    const host = fakeHost({
      paragraphs: [
        ["Heading 1", "Doc"],
        ["", "Scope"],
        ["Normal", "Scope"],
      ],
    });

    const result = applyAexyOps(host as never, [
      { kind: "replace_section_body", heading: "Scope", markdown: "x" },
    ]);

    expect(result.applied).toBe(0);
  });
});

describe("applyAexyOps — a cell the backend could not resolve", () => {
  it("reports the backend's reason rather than a vaguer guess", () => {
    const host = fakeHost({ matches: 1 });

    const result = applyAexyOps(host as never, [
      {
        kind: "set_table_cell",
        table_index: 0,
        row: 1,
        column: 0,
        text: "x",
        unresolvable: "that cell holds more than one paragraph, which cannot be located by its text",
      },
    ]);

    expect(result.applied).toBe(0);
    expect(result.skipped[0].reason).toContain("more than one paragraph");
    expect(host.calls.some((c) => c.op === "search")).toBe(false);
  });
});

describe("comment ops", () => {
  const thread: FakeComment[] = [
    {
      id: "0",
      author: "Priya",
      text: "Is this still the enterprise price?",
      replies: [{ id: "1", author: "Sam", text: "Checking with finance." }],
    },
  ];

  it("attaches a remark to the first occurrence only", () => {
    const host = fakeHost({ matches: 3 });
    const result = applyAexyOps(host as never, [
      { kind: "add_comment", anchor_find: "$50k", text: "Confirm this figure." },
    ]);

    expect(result).toEqual({ applied: 1, skipped: [] });
    // A remark is about one place. Three matches must still write one comment —
    // a model that meant every occurrence would have written a replace_text.
    const inserted = host.calls.filter((c) => c.op === "insertComment");
    expect(inserted).toHaveLength(1);
    expect(inserted[0].span).toEqual({ id: 0 });
  });

  it("names the author on the comment it writes", () => {
    // w:author is required by the schema, so the engine refuses a comment with
    // neither an ambient nor an explicit author.
    const host = fakeHost();
    applyAexyOps(host as never, [{ kind: "add_comment", anchor_find: "a", text: "b" }], {
      author: "Aexy AI",
    });
    expect(host.calls.find((c) => c.op === "insertComment")?.author).toBe("Aexy AI");
  });

  it("refuses to comment on text that is not there", () => {
    const host = fakeHost({ matches: 0 });
    const result = applyAexyOps(host as never, [
      { kind: "add_comment", anchor_find: "$60k", text: "Confirm." },
    ]);
    expect(result.applied).toBe(0);
    expect(result.skipped[0].reason).toContain("not in this document");
    expect(host.calls.some((c) => c.op === "insertComment")).toBe(false);
  });

  it("finds a reply target nested inside a thread", () => {
    // getComments lists parents only. A flat scan of the top level would miss
    // exactly the comments a reply is most likely aimed at.
    const host = fakeHost({ comments: thread });
    const result = applyAexyOps(host as never, [
      { kind: "reply_to_comment", comment_id: "1", text: "Confirmed." },
    ]);

    expect(result).toEqual({ applied: 1, skipped: [] });
    expect(host.calls.find((c) => c.op === "replyToComment")?.comment).toEqual({
      kind: "comment",
      ref: "c1",
    });
  });

  it("refuses a comment id the document no longer has", () => {
    const host = fakeHost({ comments: thread });
    const result = applyAexyOps(host as never, [
      { kind: "reply_to_comment", comment_id: "7", text: "Confirmed." },
    ]);
    expect(result.skipped[0].reason).toContain("no longer in this document");
    expect(host.calls.some((c) => c.op === "replyToComment")).toBe(false);
  });

  it("refuses when the target comment has been edited since drafting", () => {
    // A w:id is unique within one package and reused after a deletion, so
    // replying by id alone can land on a remark nobody wrote. The backend
    // stamps what the AI read; disagreeing means the document moved on.
    const host = fakeHost({ comments: thread });
    const result = applyAexyOps(host as never, [
      {
        kind: "reply_to_comment",
        comment_id: "0",
        text: "Confirmed.",
        expected_comment_text: "Is this the old price?",
      },
    ]);
    expect(result.applied).toBe(0);
    expect(result.skipped[0].reason).toContain("edited since");
    expect(host.calls.some((c) => c.op === "replyToComment")).toBe(false);
  });

  it("replies when the stamped text still matches", () => {
    const host = fakeHost({ comments: thread });
    const result = applyAexyOps(host as never, [
      {
        kind: "reply_to_comment",
        comment_id: "0",
        text: "Confirmed.",
        expected_comment_text: "Is this still the enterprise price?",
      },
    ]);
    expect(result).toEqual({ applied: 1, skipped: [] });
  });

  it("resolves a thread", () => {
    const host = fakeHost({ comments: thread });
    const result = applyAexyOps(host as never, [
      { kind: "resolve_comment", comment_id: "0" },
    ]);
    expect(result).toEqual({ applied: 1, skipped: [] });
    expect(host.calls.find((c) => c.op === "setCommentResolved")?.resolved).toBe(true);
  });

  it("keeps every comment op alone in its batch", () => {
    // insertComment, replyToComment and setCommentResolved are solitary in the
    // protocol: the engine refuses a batch holding one beside anything else.
    const host = fakeHost({ comments: thread });
    applyAexyOps(host as never, [
      { kind: "add_comment", anchor_find: "a", text: "b" },
      { kind: "reply_to_comment", comment_id: "0", text: "c" },
      { kind: "resolve_comment", comment_id: "0" },
    ]);
    const solitary = ["insertComment", "replyToComment", "setCommentResolved"];
    const offenders = host.calls
      .map((call, index) => ({ op: call.op as string, size: host.batchSizes[index] }))
      .filter((entry) => solitary.includes(entry.op) && entry.size !== 1);

    expect(offenders).toEqual([]);
    // And all three did run, so the assertion above is not vacuous.
    expect(
      host.calls.filter((c) => solitary.includes(c.op as string))
    ).toHaveLength(3);
  });

  it("reports an empty remark rather than writing one", () => {
    const host = fakeHost();
    const result = applyAexyOps(host as never, [
      { kind: "add_comment", anchor_find: "a", text: "" },
    ]);
    expect(result.skipped[0].reason).toContain("empty");
  });
});
