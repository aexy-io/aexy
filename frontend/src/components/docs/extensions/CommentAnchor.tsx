"use client";

import { Mark, mergeAttributes } from "@tiptap/core";

export const COMMENT_ANCHOR_ATTRIBUTE = "data-comment-anchor";

/** Generated client-side so the mark and the comment row can share an id before
 *  the row exists — the mark has to be in the document to be saved with it. */
export function newAnchorId(): string {
  return (
    globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 24) ??
    // `crypto` is present in every browser this runs in; the fallback exists for
    // jsdom in older setups rather than as a real code path.
    `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  );
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    commentAnchor: {
      /** Mark the current selection as the passage a thread is about. */
      setCommentAnchor: (anchorId: string) => ReturnType;
      /** Remove one anchor's mark wherever it appears. */
      unsetCommentAnchor: (anchorId: string) => ReturnType;
    };
  }
}

/**
 * The link between a comment thread and the passage it is about.
 *
 * A mark rather than a node, because the passage is a span of existing text and
 * must keep behaving like text — editable, splittable, and carrying whatever other
 * marks it already had. It lives inside `Document.content`, so it is saved and
 * loaded with the document for free and needs no second store.
 *
 * `anchorId` is the whole payload. No positions are recorded: ProseMirror keeps the
 * mark attached to the text through every edit above it, which is exactly what
 * character offsets could not do. The consequence is that deleting the text deletes
 * the mark while the comment row survives — that thread becomes "unanchored", which
 * the rail shows rather than hides.
 *
 * `inclusive: false` so typing at the end of a commented passage does not silently
 * extend what the comment claims to be about.
 */
export const CommentAnchor = Mark.create({
  name: "commentAnchor",

  // Several threads can cover overlapping text, so one span may carry more than
  // one anchor. Excluding itself would make the second comment replace the first.
  excludes: "",
  inclusive: false,
  // Keeps the mark out of `keepMarks`-style continuation and, more importantly,
  // means splitting the paragraph does not carry the anchor into new text.
  spanning: true,

  addAttributes() {
    return {
      anchorId: {
        default: null,
        parseHTML: (element) => element.getAttribute(COMMENT_ANCHOR_ATTRIBUTE),
        renderHTML: (attributes) =>
          attributes.anchorId ? { [COMMENT_ANCHOR_ATTRIBUTE]: attributes.anchorId } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: `span[${COMMENT_ANCHOR_ATTRIBUTE}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        // Styling lives here rather than in the editor's className soup so the
        // highlight travels with the mark, including into the read-only embed.
        class:
          "rounded-sm bg-amber-400/25 border-b-2 border-amber-500/70 cursor-pointer transition-colors hover:bg-amber-400/40 data-[active=true]:bg-amber-400/50",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCommentAnchor:
        (anchorId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { anchorId }),

      unsetCommentAnchor:
        (anchorId: string) =>
        ({ tr, state, dispatch }) => {
          // Walked rather than using `unsetMark`, which only clears the current
          // selection — a resolved thread's highlight has to go everywhere it
          // appears, and the caret is usually somewhere else by then.
          const markType = state.schema.marks[this.name];
          if (!markType) return false;
          let found = false;
          state.doc.descendants((node, pos) => {
            if (!node.isText) return;
            node.marks.forEach((mark) => {
              if (mark.type === markType && mark.attrs.anchorId === anchorId) {
                tr.removeMark(pos, pos + node.nodeSize, mark);
                found = true;
              }
            });
          });
          if (found && dispatch) dispatch(tr);
          return found;
        },
    };
  },
});

/** Every anchor id still present in the document, in document order. */
export function anchorIdsInDoc(json: unknown): string[] {
  const found: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const record = node as { marks?: unknown[]; content?: unknown[] };
    for (const mark of record.marks ?? []) {
      const m = mark as { type?: string; attrs?: { anchorId?: string } };
      if (m.type === "commentAnchor" && m.attrs?.anchorId && !found.includes(m.attrs.anchorId)) {
        found.push(m.attrs.anchorId);
      }
    }
    for (const child of record.content ?? []) walk(child);
  };
  walk(json);
  return found;
}
