"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MessageSquarePlus, Unlink } from "lucide-react";
import { useDocumentComments } from "@/hooks/useDocumentComments";
import { useAuth } from "@/hooks/useAuth";
import { DocumentComment } from "@/lib/api";
import { COMMENT_ANCHOR_ATTRIBUTE } from "./extensions/CommentAnchor";
import { Thread } from "./DocumentComments";

/** A thread the user is about to start: the mark exists, the comment does not yet. */
export interface PendingAnchor {
  anchorId: string;
  quotedText: string;
}

interface DocumentCommentRailProps {
  workspaceId: string | null;
  documentId: string;
  /** The element the marks live inside — positions are measured against it. */
  contentRef: React.RefObject<HTMLElement | null>;
  /** Anchor ids still present in the document, so orphans can be told apart. */
  liveAnchorIds: string[];
  pending: PendingAnchor | null;
  onPendingCancel: () => void;
  /** Called once the thread exists, so the editor can stop treating it as pending. */
  onPendingCommitted: () => void;
  activeAnchorId: string | null;
  onActiveChange: (anchorId: string | null) => void;
  /** Drops the mark for a thread whose highlight should stop showing. */
  onRemoveAnchor: (anchorId: string) => void;
  /** When false, threads are an ordinary stacked list instead of being aligned to
   *  their marks. Below `xl` there is no gutter to align into, and passing an empty
   *  `liveAnchorIds` to fake that would label every anchored thread as orphaned. */
  positioned?: boolean;
}

/** Vertical gap kept between stacked cards. */
const CARD_GAP = 12;

/**
 * Comment threads in the margin, each aligned to the passage it is about.
 *
 * Positions are measured from the DOM rather than stored: the mark is the source of
 * truth for where a thread belongs, and ProseMirror keeps it attached to the text
 * through every edit. Cards are absolutely positioned at their mark's offset and
 * pushed down when they would overlap the one above, which is what keeps two
 * comments on adjacent lines readable.
 *
 * A thread whose mark has gone — the passage was rewritten, or the document made a
 * round trip through Markdown, which drops marks — is not lost. It moves to an
 * "unanchored" group at the top with the text it was written against, because the
 * conversation is still the record of why the document says what it says.
 */
export function DocumentCommentRail({
  workspaceId,
  documentId,
  contentRef,
  liveAnchorIds,
  pending,
  onPendingCancel,
  onPendingCommitted,
  activeAnchorId,
  onActiveChange,
  onRemoveAnchor,
  positioned = true,
}: DocumentCommentRailProps) {
  const { user } = useAuth();
  const {
    comments,
    createComment,
    isCreating,
    updateComment,
    deleteComment,
    setResolved,
  } = useDocumentComments(workspaceId, documentId);

  const [draft, setDraft] = useState("");
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const cardHeights = useRef<Record<string, number>>({});

  const { live, orphaned } = useMemo(() => {
    const anchored = comments.filter((comment) => comment.anchor_id);
    return {
      live: anchored.filter((comment) => liveAnchorIds.includes(comment.anchor_id!)),
      orphaned: anchored.filter((comment) => !liveAnchorIds.includes(comment.anchor_id!)),
    };
  }, [comments, liveAnchorIds]);

  // What `measure` needs, held in a ref so it is not a dependency. `.filter()`
  // returns a fresh array on every render, so depending on the partitions directly
  // made `measure` a new function each render, which re-fired the layout effect,
  // which set state — an update loop that React stops with "maximum update depth
  // exceeded". The key below is what actually decides when to re-measure.
  const toMeasure = useRef<string[]>([]);
  toMeasure.current = positioned
    ? [...(pending ? [pending.anchorId] : []), ...live.map((c) => c.anchor_id!)]
    : [];
  const layoutKey = toMeasure.current.join("|");

  /**
   * Lay the cards out against their marks, top to bottom.
   *
   * Ordered by the mark's position in the document, not by when the comment was
   * written, so the rail reads in the same order as the page. The running `next`
   * is what stops a tall card from covering the one below it.
   */
  const measure = useCallback(() => {
    const container = contentRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;

    const measured = toMeasure.current
      .map((id) => {
        const mark = container.querySelector<HTMLElement>(`[${COMMENT_ANCHOR_ATTRIBUTE}="${id}"]`);
        if (!mark) return null;
        return { id, top: mark.getBoundingClientRect().top - containerTop };
      })
      .filter((entry): entry is { id: string; top: number } => entry !== null)
      .sort((a, b) => a.top - b.top);

    const next: Record<string, number> = {};
    let floor = 0;
    for (const entry of measured) {
      const top = Math.max(entry.top, floor);
      next[entry.id] = top;
      floor = top + (cardHeights.current[entry.id] ?? 96) + CARD_GAP;
    }
    // Bail when nothing moved. The observers below fire on every keystroke, and
    // setting a fresh object each time would re-render the whole rail for no
    // reason — and would turn any future dependency slip back into a loop.
    setOffsets((current) => {
      const keys = Object.keys(next);
      const unchanged =
        keys.length === Object.keys(current).length &&
        keys.every((key) => current[key] === next[key]);
      return unchanged ? current : next;
    });
  }, [contentRef]);

  // Layout effect so cards are placed in the same frame they appear, rather than
  // visibly jumping from 0 to their position. Keyed on which anchors are present:
  // that is what changes where cards go, and it is a string so it compares by value.
  useLayoutEffect(() => {
    measure();
  }, [measure, layoutKey]);

  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    // Typing above a comment moves it, and so does the window changing width, so
    // both have to re-measure. A MutationObserver rather than the editor's
    // onUpdate: the mark's DOM position is what matters, and that settles after
    // ProseMirror has written to the DOM.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    const mutations = new MutationObserver(measure);
    mutations.observe(container, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [contentRef, measure]);

  const submitPending = async () => {
    const content = draft.trim();
    if (!content || !pending) return;
    await createComment({
      content: `<p>${content}</p>`,
      anchorId: pending.anchorId,
      quotedText: pending.quotedText,
    });
    setDraft("");
    onPendingCommitted();
  };

  const cancelPending = () => {
    setDraft("");
    // The mark was added optimistically when the button was pressed, so abandoning
    // the composer has to take it back out or the document keeps a highlight with
    // no thread behind it.
    if (pending) onRemoveAnchor(pending.anchorId);
    onPendingCancel();
  };

  const threadProps = (comment: DocumentComment) => ({
    comment,
    currentUserId: user?.id ? String(user.id) : null,
    onReply: (content: string) => createComment({ content, parentId: comment.id }),
    onEdit: (commentId: string, content: string) => updateComment({ commentId, content }),
    onDelete: (commentId: string) => deleteComment(commentId),
    onToggleResolved: async () => {
      await setResolved({ commentId: comment.id, resolved: !comment.is_resolved });
      // Resolving retires the highlight: the passage is settled, and leaving it
      // marked makes a clean document look like it is still under review.
      if (!comment.is_resolved && comment.anchor_id) onRemoveAnchor(comment.anchor_id);
    },
  });

  const card = (id: string, children: React.ReactNode) => (
    <div
      key={id}
      ref={(node) => {
        if (node) cardHeights.current[id] = node.offsetHeight;
      }}
      onClick={() => onActiveChange(id)}
      style={positioned ? { transform: `translateY(${offsets[id] ?? 0}px)` } : undefined}
      className={`${
        positioned
          ? "absolute inset-x-0 top-0 transition-[transform,box-shadow] duration-150"
          : "mb-2"
      } ${activeAnchorId === id ? "z-10 rounded-lg ring-2 ring-amber-500/60" : ""}`}
    >
      {children}
    </div>
  );

  return (
    <aside className="relative w-full" data-testid="document-comment-rail">
      {orphaned.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Unlink className="h-3.5 w-3.5" aria-hidden />
            No longer in the document
          </p>
          {orphaned.map((comment) => (
            <div key={comment.id} className="space-y-1">
              {comment.quoted_text && (
                <p className="border-l-2 border-muted-foreground/40 pl-2 text-xs italic text-muted-foreground">
                  “{comment.quoted_text}”
                </p>
              )}
              <Thread {...threadProps(comment)} />
            </div>
          ))}
        </div>
      )}

      {/* Positioned cards share one relative box whose height has to cover the
          document, or the last card would be clipped. */}
      <div
        className={positioned ? "relative" : ""}
        style={positioned ? { minHeight: contentRef.current?.offsetHeight ?? 0 } : undefined}
      >
        {pending &&
          card(
            pending.anchorId,
            <div className="rounded-lg border border-amber-500/60 bg-background p-3 shadow-lg">
              <p className="mb-2 border-l-2 border-amber-500/60 pl-2 text-xs italic text-muted-foreground">
                “{pending.quotedText}”
              </p>
              <textarea
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                placeholder="Add a comment…"
                aria-label="Comment on the selected text"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={submitPending}
                  disabled={!draft.trim() || isCreating}
                  className="rounded-md bg-primary-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  {isCreating ? "Posting…" : "Comment"}
                </button>
                <button
                  onClick={cancelPending}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>,
          )}

        {live.map((comment) =>
          card(
            comment.anchor_id!,
            <div className="rounded-lg bg-background/95 shadow-sm backdrop-blur">
              <Thread {...threadProps(comment)} />
            </div>,
          ),
        )}
      </div>

      {!pending && live.length === 0 && orphaned.length === 0 && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <MessageSquarePlus className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Select text and use the comment button to start a thread here.
        </p>
      )}
    </aside>
  );
}
