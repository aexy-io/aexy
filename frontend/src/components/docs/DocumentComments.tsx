"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import DOMPurify from "isomorphic-dompurify";
import {
  Check,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Pencil,
  Reply,
  Trash2,
  X,
} from "lucide-react";
import { useDocumentComments } from "@/hooks/useDocumentComments";
import { useAuth } from "@/hooks/useAuth";
import { DocumentComment } from "@/lib/api";

/**
 * Comment threads for a document.
 *
 * Resolved threads collapse rather than disappear. A resolved conversation is
 * still the record of why the document says what it says, and hiding it outright
 * is how that context gets lost — but leaving them expanded buries the threads
 * that still need an answer.
 */
export function DocumentComments({
  workspaceId,
  documentId,
}: {
  workspaceId: string | null;
  documentId: string;
}) {
  const t = useTranslations("docs.comments");
  const { user } = useAuth();
  const {
    comments,
    isLoading,
    createComment,
    isCreating,
    updateComment,
    deleteComment,
    setResolved,
  } = useDocumentComments(workspaceId, documentId);

  const [draft, setDraft] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  // Anchored threads belong beside the passage they are about, not at the foot of
  // the page — the rail renders those. What is left here is what this section was
  // always for: remarks about the document as a whole.
  const wholeDocument = comments.filter((comment) => !comment.anchor_id);
  const wholeDocumentUnresolved = wholeDocument.filter((c) => !c.is_resolved).length;

  const submit = async () => {
    const content = draft.trim();
    if (!content) return;
    await createComment({ content });
    setDraft("");
  };

  return (
    <section className="border-t border-border mt-8 pt-6" data-testid="document-comments">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 mb-4 text-foreground"
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">
          {t("documentDiscussion")}
          {wholeDocument.length > 0 ? (
            <span className="text-muted-foreground"> · {wholeDocument.length}</span>
          ) : null}
        </h2>
        {wholeDocumentUnresolved > 0 && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary-500/20 text-primary-400 rounded-full">
            {wholeDocumentUnresolved} open
          </span>
        )}
      </button>

      {!collapsed && (
        <>
          <div className="space-y-4 mb-4">
            {isLoading ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1].map((i) => (
                  <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : wholeDocument.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No comments yet. Mention someone with @ to bring them in.
              </p>
            ) : (
              wholeDocument.map((comment) => (
                <Thread
                  key={comment.id}
                  comment={comment}
                  currentUserId={user?.id ? String(user.id) : null}
                  onReply={(content) =>
                    createComment({ content, parentId: comment.id })
                  }
                  onEdit={(commentId, content) =>
                    updateComment({ commentId, content })
                  }
                  onDelete={(commentId) => deleteComment(commentId)}
                  onToggleResolved={() =>
                    setResolved({
                      commentId: comment.id,
                      resolved: !comment.is_resolved,
                    })
                  }
                />
              ))
            )}
          </div>

          <div className="flex flex-col gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a comment…"
              rows={2}
              data-testid="comment-input"
              className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary-500 resize-y"
            />
            <div className="flex justify-end">
              <button
                onClick={submit}
                disabled={!draft.trim() || isCreating}
                data-testid="comment-submit"
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? "Posting…" : "Comment"}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export function Thread({
  comment,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  onToggleResolved,
}: {
  comment: DocumentComment;
  currentUserId: string | null;
  onReply: (content: string) => Promise<unknown>;
  onEdit: (commentId: string, content: string) => Promise<unknown>;
  onDelete: (commentId: string) => Promise<unknown>;
  onToggleResolved: () => Promise<unknown>;
}) {
  const [replyDraft, setReplyDraft] = useState("");
  const [replying, setReplying] = useState(false);
  // A resolved thread starts collapsed to its first line — present, not in the way.
  const [expanded, setExpanded] = useState(!comment.is_resolved);

  const sendReply = async () => {
    const content = replyDraft.trim();
    if (!content) return;
    await onReply(content);
    setReplyDraft("");
    setReplying(false);
  };

  return (
    <div
      className={`rounded-lg border p-3 ${
        comment.is_resolved
          ? "border-border bg-muted/30"
          : "border-border bg-muted/60"
      }`}
      data-testid={comment.is_resolved ? "thread-resolved" : "thread-open"}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <CommentBody
            comment={comment}
            currentUserId={currentUserId}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
        <button
          onClick={onToggleResolved}
          title={comment.is_resolved ? "Reopen thread" : "Resolve thread"}
          aria-pressed={comment.is_resolved}
          data-testid="thread-resolve-toggle"
          className={`shrink-0 p-1 rounded transition ${
            comment.is_resolved
              ? "text-green-500 hover:bg-accent"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          }`}
        >
          <Check className="h-4 w-4" />
        </button>
      </div>

      {comment.is_resolved && !expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Resolved
          {comment.replies.length > 0
            ? ` · show ${comment.replies.length} ${
                comment.replies.length === 1 ? "reply" : "replies"
              }`
            : ""}
        </button>
      ) : (
        <>
          {comment.replies.length > 0 && (
            <div className="mt-3 pl-3 border-l border-border space-y-3">
              {comment.replies.map((reply) => (
                <CommentBody
                  key={reply.id}
                  comment={reply}
                  currentUserId={currentUserId}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}

          {replying ? (
            <div className="mt-3 flex flex-col gap-2">
              <textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                placeholder="Reply…"
                rows={2}
                autoFocus
                data-testid="reply-input"
                className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary-500 resize-y"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setReplying(false);
                    setReplyDraft("");
                  }}
                  className="px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={sendReply}
                  disabled={!replyDraft.trim()}
                  className="px-2 py-1 rounded text-xs font-medium bg-primary-500 text-white disabled:opacity-50"
                >
                  Reply
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setReplying(true)}
              data-testid="thread-reply"
              className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Reply className="h-3 w-3" />
              Reply
            </button>
          )}
        </>
      )}
    </div>
  );
}

function CommentBody({
  comment,
  currentUserId,
  onEdit,
  onDelete,
}: {
  comment: DocumentComment;
  currentUserId: string | null;
  onEdit: (commentId: string, content: string) => Promise<unknown>;
  onDelete: (commentId: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(comment.content);
  const isMine = !!currentUserId && comment.author_id === currentUserId;

  // Comment content is rich text written by other people in the workspace and
  // rendered as HTML so mention anchors survive the round trip. That makes it an
  // injection vector from any workspace member into every reader of the document,
  // so it is sanitised here rather than trusted — the allow-list is what a comment
  // legitimately needs and nothing that executes.
  const safeHtml = useMemo(
    () =>
      DOMPurify.sanitize(comment.content, {
        ALLOWED_TAGS: [
          "p", "br", "strong", "b", "em", "i", "u", "s", "code", "pre",
          "blockquote", "ul", "ol", "li", "a", "span",
        ],
        ALLOWED_ATTR: ["href", "target", "rel", "class", "data-type", "data-id"],
        // Mentions are stored as `mention:user:{uuid}` hrefs, which is not a
        // scheme a browser navigates, so it has to be permitted explicitly.
        ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|mention:|#|\/)/i,
      }),
    [comment.content]
  );

  if (comment.is_deleted) {
    // The row survives so replies keep their place in the thread.
    return <p className="text-sm italic text-muted-foreground">Comment deleted</p>;
  }

  const save = async () => {
    const content = editDraft.trim();
    if (!content) return;
    await onEdit(comment.id, content);
    setEditing(false);
  };

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-foreground">
          {comment.author_name || "Someone"}
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(comment.created_at).toLocaleString()}
        </span>
        {comment.is_edited && (
          <span className="text-xs text-muted-foreground">(edited)</span>
        )}
        {isMine && !editing && (
          <span className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => {
                setEditDraft(comment.content);
                setEditing(true);
              }}
              title="Edit"
              data-testid="comment-edit"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={() => onDelete(comment.id)}
              title="Delete"
              data-testid="comment-delete"
              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-accent"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            rows={2}
            autoFocus
            className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary-500 resize-y"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setEditing(false)}
              className="p-1 rounded text-muted-foreground hover:text-foreground"
              title="Cancel"
            >
              <X className="h-3 w-3" />
            </button>
            <button
              onClick={save}
              disabled={!editDraft.trim()}
              className="px-2 py-1 rounded text-xs font-medium bg-primary-500 text-white disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div
          className="mt-1 text-sm text-foreground break-words [&_a]:text-primary-400 [&_a]:underline"
          data-testid="comment-content"
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
      )}
    </div>
  );
}
