/**
 * Anchored comments: the margin rail, and the mark that pins a thread to a passage.
 *
 * The parts worth pinning are the ones that are wrong-but-plausible:
 *
 * * a thread whose passage was edited away must appear as unanchored rather than
 *   vanish — the conversation is still why the document says what it says, and the
 *   quoted text is the only thing that keeps it readable;
 * * the foot-of-document section must show *only* whole-document comments now,
 *   or every anchored thread is rendered twice;
 * * `anchorIdsInDoc` is what tells those two groups apart, so it has to find marks
 *   at any depth of the TipTap tree, not just on top-level paragraphs;
 * * abandoning the composer has to take the mark back out, or the document keeps a
 *   highlight with no thread behind it.
 */
import { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentCommentRail } from "@/components/docs/DocumentCommentRail";
import { DocumentComments } from "@/components/docs/DocumentComments";
import { anchorIdsInDoc } from "@/components/docs/extensions/CommentAnchor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  comments: [] as unknown[],
  createComment: vi.fn(),
  setResolved: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "me" } }),
}));

vi.mock("@/hooks/useDocumentComments", () => ({
  useDocumentComments: () => ({
    comments: mocks.comments,
    total: mocks.comments.length,
    unresolvedCount: mocks.comments.length,
    isLoading: false,
    error: null,
    createComment: mocks.createComment,
    isCreating: false,
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    setResolved: mocks.setResolved,
  }),
}));

function comment(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    document_id: "d-1",
    parent_id: null,
    author_id: "someone-else",
    author_name: "Ada",
    author_avatar: null,
    content: "<p>Is this still true?</p>",
    anchor_id: null,
    quoted_text: null,
    is_resolved: false,
    resolved_by_id: null,
    resolved_at: null,
    is_deleted: false,
    is_edited: false,
    created_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-01T10:00:00Z",
    replies: [],
    ...overrides,
  };
}

describe("anchorIdsInDoc", () => {
  it("finds marks nested anywhere in the document", () => {
    // A comment on text inside a list item inside a table cell is not exotic, and a
    // shallow scan of top-level nodes would report it as orphaned.
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "plain" }] },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "bulletList",
                      content: [
                        {
                          type: "listItem",
                          content: [
                            {
                              type: "paragraph",
                              content: [
                                {
                                  type: "text",
                                  text: "deep",
                                  marks: [
                                    { type: "commentAnchor", attrs: { anchorId: "deep-1" } },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(anchorIdsInDoc(doc)).toEqual(["deep-1"]);
  });

  it("reports each anchor once even when the passage is split by other marks", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a", marks: [{ type: "commentAnchor", attrs: { anchorId: "x" } }] },
            {
              type: "text",
              text: "b",
              marks: [
                { type: "bold" },
                { type: "commentAnchor", attrs: { anchorId: "x" } },
              ],
            },
          ],
        },
      ],
    };

    expect(anchorIdsInDoc(doc)).toEqual(["x"]);
  });

  it("is empty for a document with no comments and survives junk", () => {
    expect(anchorIdsInDoc({ type: "doc", content: [] })).toEqual([]);
    expect(anchorIdsInDoc(null)).toEqual([]);
    expect(anchorIdsInDoc(undefined)).toEqual([]);
  });
});

describe("DocumentCommentRail", () => {
  let container: HTMLDivElement;
  let root: Root;
  const noop = () => {};

  /** The composer's draft belongs to the editor now, so the test plays that part
   *  — which is also what lets the rail be remounted without losing it. */
  function Harness(props: Record<string, unknown>) {
    const [draft, setDraft] = useState("");
    const contentRef = useRef(document.createElement("div"));
    return (
      <DocumentCommentRail
        // Keyed on the layout so switching it genuinely remounts the rail. React
        // would preserve internal state across a plain re-render, which would let
        // the draft test pass without the draft having been hoisted at all.
        key={`positioned-${props.positioned !== false}`}
        workspaceId="ws-1"
        documentId="d-1"
        contentRef={contentRef as React.RefObject<HTMLElement>}
        liveAnchorIds={["anchor-live"]}
        pending={null}
        onPendingCancel={noop}
        onPendingCommitted={noop}
        activeAnchorId={null}
        onActiveChange={noop}
        onRemoveAnchor={noop}
        draft={draft}
        onDraftChange={setDraft}
        {...props}
      />
    );
  }

  const render = async (props: Partial<Record<string, unknown>> = {}) => {
    await act(async () => root.render(<Harness {...props} />));
  };

  beforeEach(() => {
    mocks.comments = [];
    mocks.createComment.mockReset().mockResolvedValue(undefined);
    mocks.setResolved.mockReset().mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows a thread whose passage is gone as unanchored, with its quoted text", async () => {
    mocks.comments = [
      comment({ id: "c-gone", anchor_id: "anchor-deleted", quoted_text: "the API returns a 202" }),
    ];

    await render();

    expect(container.textContent).toContain("No longer in the document");
    // The quote is the only remaining clue about what was being discussed.
    expect(container.textContent).toContain("the API returns a 202");
    expect(container.textContent).toContain("Is this still true?");
  });

  it("keeps an anchored thread out of the unanchored group while its mark is live", async () => {
    mocks.comments = [comment({ id: "c-live", anchor_id: "anchor-live", quoted_text: "a passage" })];

    await render();

    expect(container.textContent).not.toContain("No longer in the document");
    expect(container.textContent).toContain("Is this still true?");
  });

  it("does not show whole-document comments — those belong at the foot of the page", async () => {
    mocks.comments = [comment({ id: "c-doc", anchor_id: null })];

    await render();

    expect(container.textContent).not.toContain("Is this still true?");
    // And it says how to start one instead of rendering an empty gutter.
    expect(container.textContent).toContain("Select text");
  });

  it("does not call an anchored thread orphaned just because it is not positioned", async () => {
    // Below `xl` there is no gutter, so the rail renders a plain list. The first
    // attempt achieved that by passing an empty `liveAnchorIds`, which made every
    // anchored thread on a phone claim its passage had been deleted.
    mocks.comments = [comment({ id: "c-live", anchor_id: "anchor-live", quoted_text: "a passage" })];

    await render({ positioned: false });

    expect(container.textContent).not.toContain("No longer in the document");
    expect(container.textContent).toContain("Is this still true?");
    // And nothing is absolutely positioned, since there is nothing to align to.
    expect(container.querySelector(".absolute")).toBeNull();
  });

  it("posts a new thread with the anchor and the quoted passage", async () => {
    await render({ pending: { anchorId: "anchor-new", quotedText: "the selected words" } });

    const box = container.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setter.call(box, "Is this right?");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const post = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Comment",
    )!;
    await act(async () => post.click());

    // Plain text, the same shape the composer at the foot of the document
    // stores. Two shapes in one stream would surface as markup in the edit box.
    expect(mocks.createComment).toHaveBeenCalledWith({
      content: "Is this right?",
      anchorId: "anchor-new",
      quotedText: "the selected words",
    });
  });

  it("keeps a half-written comment when the layout changes under it", async () => {
    // The rail used to be mounted twice, once per breakpoint, hidden from itself
    // by CSS — so the composer had two separate drafts and crossing `xl` showed
    // the empty one. The draft belongs to the editor now; this is what that buys.
    await render({ pending: { anchorId: "anchor-new", quotedText: "words" } });

    const box = container.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setter.call(box, "half a thought");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // The gutter goes away, so the rail switches to an unpositioned list.
    await render({
      pending: { anchorId: "anchor-new", quotedText: "words" },
      positioned: false,
    });

    expect(container.querySelector("textarea")!.value).toBe("half a thought");
  });

  it("removes the mark when the composer is abandoned", async () => {
    // The mark goes in as soon as the button is pressed so the rail has something
    // to align to. Cancelling has to take it back out, or the document keeps a
    // highlight with no thread behind it.
    const onRemoveAnchor = vi.fn();
    await render({
      pending: { anchorId: "anchor-new", quotedText: "words" },
      onRemoveAnchor,
    });

    const cancel = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Cancel",
    )!;
    await act(async () => cancel.click());

    expect(onRemoveAnchor).toHaveBeenCalledWith("anchor-new");
    expect(mocks.createComment).not.toHaveBeenCalled();
  });

  it("retires the highlight when a thread is resolved", async () => {
    mocks.comments = [comment({ id: "c-live", anchor_id: "anchor-live", quoted_text: "a passage" })];
    const onRemoveAnchor = vi.fn();
    await render({ onRemoveAnchor });

    const resolve = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.getAttribute("title") ?? "").toLowerCase().includes("resolve"),
    );
    expect(resolve, "the thread card offers a resolve control").toBeDefined();
    await act(async () => resolve!.click());

    expect(mocks.setResolved).toHaveBeenCalledWith({ commentId: "c-live", resolved: true });
    expect(onRemoveAnchor).toHaveBeenCalledWith("anchor-live");
  });
});

describe("DocumentComments after anchoring", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.comments = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows only whole-document comments, so anchored threads are not duplicated", async () => {
    mocks.comments = [
      comment({ id: "c-anchored", anchor_id: "anchor-live", content: "<p>About this line</p>" }),
      comment({ id: "c-doc", anchor_id: null, content: "<p>About the whole page</p>" }),
    ];

    await act(async () =>
      root.render(<DocumentComments workspaceId="ws-1" documentId="d-1" />),
    );

    expect(container.textContent).toContain("About the whole page");
    expect(container.textContent).not.toContain("About this line");
    // The heading counts what is under it, not every thread on the document.
    expect(container.textContent).toContain("Document discussion");
    expect(container.textContent).toContain("· 1");
  });
});
