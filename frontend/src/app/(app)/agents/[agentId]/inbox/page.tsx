"use client";

import { getApiErrorMessage } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Mail,
  MailOpen,
  Send,
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowLeft,
  Clock,
  User,
  RefreshCw,
  Sparkles,
  ChevronRight,
  CheckCircle,
  XCircle,
  ArrowUpRight,
  MessageSquare,
  Loader2,
  Keyboard,
  X,
  Copy,
} from "lucide-react";
import DOMPurify from "isomorphic-dompurify";
import { toast } from "sonner";

import { useWorkspace, useWorkspaceMembers } from "@/hooks/useWorkspace";
import { useAgent } from "@/hooks/useAgents";
import { useAgentInbox, useAgentInboxMessage, useAgentInboxThread } from "@/hooks/useAgentInbox";
import { AgentInboxMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/datetime";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const statusConfig = {
  pending: {
    label: "Pending",
    icon: Clock,
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-500/20",
  },
  processing: {
    label: "Processing",
    icon: RefreshCw,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/20",
  },
  responded: {
    label: "Responded",
    icon: CheckCircle,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-500/20",
  },
  escalated: {
    label: "Escalated",
    icon: ArrowUpRight,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-500/20",
  },
  archived: {
    label: "Archived",
    icon: Archive,
    color: "text-muted-foreground",
    bgColor: "bg-muted-foreground/20",
  },
};

const priorityConfig = {
  low: { label: "Low", color: "text-muted-foreground", bgColor: "bg-muted-foreground/20" },
  normal: { label: "Normal", color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-500/20" },
  high: { label: "High", color: "text-orange-600 dark:text-orange-400", bgColor: "bg-orange-500/20" },
  urgent: { label: "Urgent", color: "text-red-600 dark:text-red-400", bgColor: "bg-red-500/20" },
};

// formatDate moved to lib/datetime.ts (UX-CPY-001). The shared
// formatRelative is locale-aware and matches operations + automations
// so "3h ago" reads identically across surfaces.
const formatDate = formatRelative;

// Human-readable byte sizes for attachment chips. Keeps the chip
// width tight ("128 KB" instead of "131072 bytes"). Falls back to
// the raw byte count for sub-kilobyte sizes.
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function MessageCard({
  message,
  isSelected,
  isChecked,
  hasAnySelection,
  onClick,
  onToggleCheck,
}: {
  message: AgentInboxMessage;
  isSelected: boolean;
  isChecked: boolean;
  hasAnySelection: boolean;
  onClick: () => void;
  onToggleCheck: (event: React.MouseEvent | React.KeyboardEvent) => void;
}) {
  const status = statusConfig[message.status] || statusConfig.pending;
  const priority = priorityConfig[message.priority] || priorityConfig.normal;
  // Unread = still awaiting agent triage. After it's been processed/responded/
  // escalated/archived, the row collapses to neutral weight so the eye can
  // skip past resolved threads.
  const isUnread = message.status === "pending";

  // Anchor the row to a data attribute so the keyboard handler can scroll
  // the focused message into view without a ref-per-row.
  return (
    <div
      role="button"
      tabIndex={0}
      data-message-id={message.id}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group w-full text-left p-4 border-b border-border hover:bg-muted/50 transition-colors relative cursor-pointer",
        isSelected && "bg-muted/50",
        isSelected &&
          "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-0.5 before:bg-blue-500",
        isChecked && "bg-blue-500/5",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Bulk-select checkbox — visible whenever there's any selection
            active, or on hover otherwise. Click stops propagation so it
            doesn't open the message. */}
        <div
          className={cn(
            "shrink-0 pt-0.5 transition-opacity",
            hasAnySelection || isChecked
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
          )}
        >
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => {}}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCheck(e);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
              }
            }}
            aria-label="Select message"
            className="h-4 w-4 rounded border-border accent-blue-500 cursor-pointer"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {isUnread ? (
              <span
                className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0"
                aria-label="unread"
              />
            ) : null}
            <span
              className={cn(
                "text-sm truncate",
                isUnread
                  ? "font-semibold text-foreground"
                  : "font-normal text-muted-foreground",
              )}
            >
              {message.from_name || message.from_email}
            </span>
            {message.priority !== "normal" && (
              <span className={cn("text-xs px-1.5 py-0.5 rounded", priority.bgColor, priority.color)}>
                {priority.label}
              </span>
            )}
          </div>
          <p
            className={cn(
              "text-sm truncate",
              isUnread ? "text-foreground font-medium" : "text-muted-foreground",
            )}
          >
            {message.subject || "(No subject)"}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-1">
            {message.body_text?.slice(0, 100) || "(No content)"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-xs text-muted-foreground">{formatDate(message.created_at)}</span>
          <div className={cn("p-1 rounded", status.bgColor)}>
            <status.icon className={cn("h-3 w-3", status.color)} />
          </div>
        </div>
      </div>
      {message.confidence_score !== null && (
        <div className="flex items-center gap-2 mt-2">
          <Sparkles className="h-3 w-3 text-purple-600 dark:text-purple-400" aria-hidden />
          <span className="text-xs text-purple-700 dark:text-purple-300">
            {Math.round(message.confidence_score * 100)}% confidence
          </span>
        </div>
      )}
    </div>
  );
}

function MessageDetail({
  message,
  agentId,
  workspaceId,
  onReply,
  onEscalate,
  onArchive,
  onProcess,
  onSelectMessage,
  isReplying,
  isEscalating,
  isArchiving,
  isProcessing,
}: {
  message: AgentInboxMessage;
  agentId: string;
  workspaceId: string;
  onReply: (body: string, useSuggested?: boolean) => void;
  onEscalate: (escalateTo: string, note?: string) => void;
  onArchive: () => void;
  onProcess: () => void;
  onSelectMessage: (id: string) => void;
  isReplying: boolean;
  isEscalating: boolean;
  isArchiving: boolean;
  isProcessing: boolean;
}) {
  // UX-INB-027 / UX-DEF-007: thread fetch. Only fires when there's
  // actually a thread hint (thread_id or in_reply_to) so orphan
  // messages don't trigger a useless network round-trip.
  const hasThreadHint = Boolean(message.thread_id || message.in_reply_to_message_id);
  const { thread } = useAgentInboxThread(
    workspaceId,
    agentId,
    message.id,
    hasThreadHint,
  );

  // Draft persistence — keyed per message so switching threads doesn't
  // lose what the user typed. sessionStorage so the draft survives a
  // page refresh but not a new browser session (matches the audit
  // request in UX-INB-023 without persisting potentially-sensitive
  // reply drafts beyond the tab's lifetime).
  const draftKey = `inbox-draft:${message.id}`;
  const [replyText, setReplyText] = useState(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem(draftKey) || "";
  });
  // Re-read the draft when the user navigates between messages.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setReplyText(sessionStorage.getItem(draftKey) || "");
  }, [draftKey]);
  // Persist on every change. Skip empty so we don't leave a key behind
  // after the user clears the box.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (replyText) {
      sessionStorage.setItem(draftKey, replyText);
    } else {
      sessionStorage.removeItem(draftKey);
    }
  }, [draftKey, replyText]);

  const [showEscalateModal, setShowEscalateModal] = useState(false);
  // UX-INB-025: AI Analysis card is collapsible. Default open on
  // pending messages, collapsed once the agent has responded /
  // escalated so the body becomes the focus.
  const [analysisOpen, setAnalysisOpen] = useState(message.status === "pending");
  const replyTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow the textarea up to a sensible cap. Reset to auto so a
  // backspaced line shrinks the box back.
  useEffect(() => {
    const el = replyTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [replyText]);

  // Submit on Cmd/Ctrl+Enter from inside the textarea. The page-level
  // keyboard handler explicitly bails out when the focused element is
  // a textarea, so this shortcut and the global j/k don't conflict.
  const handleReplyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isSubmit =
      (e.metaKey || e.ctrlKey) && e.key === "Enter" && replyText.trim();
    if (isSubmit) {
      e.preventDefault();
      onReply(replyText.trim());
      setReplyText("");
    }
  };

  const status = statusConfig[message.status] || statusConfig.pending;
  const priority = priorityConfig[message.priority] || priorityConfig.normal;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <div className={cn("p-1.5 rounded-lg", status.bgColor)}>
              <status.icon className={cn("h-4 w-4", status.color)} />
            </div>
            <span className={cn("text-sm font-medium", status.color)}>
              {status.label}
            </span>
            {message.priority !== "normal" && (
              <span className={cn("text-xs px-2 py-0.5 rounded", priority.bgColor, priority.color)}>
                {priority.label}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(message.created_at).toLocaleString()}
          </span>
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">
          {message.subject || "(No subject)"}
        </h2>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="h-4 w-4" />
            <span>{message.from_name || message.from_email}</span>
          </div>
          <span className="text-muted-foreground">to</span>
          <span>{message.to_email}</span>
        </div>
      </div>

      {/* UX-INB-027: thread strip. Renders when this message has a
          parent OR sibling rows in the same thread. Each pill scrolls
          its target message into view by setting selectedMessageId
          via the embedded data attribute. Excludes the current
          message from the strip; the current one is already on
          screen below. */}
      {thread.length > 1 && (
        <div className="px-4 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 shrink-0">
              Thread ({thread.length})
            </span>
            <div className="flex items-center gap-1 flex-1">
              {thread.map((t, idx) => {
                const isCurrent = t.id === message.id;
                const label = t.from_name || t.from_email.split("@")[0];
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={isCurrent}
                    onClick={() => {
                      // Drive selection through page-level state — the
                      // list pane's row is virtualized via data-message-id
                      // for the keyboard handler, but selection itself
                      // belongs to React state, not a DOM .click().
                      onSelectMessage(t.id);
                      // Best-effort scroll the row into view if it
                      // happens to be in the visible list; harmless when
                      // it isn't (mobile, hidden behind detail pane).
                      requestAnimationFrame(() => {
                        const node = document.querySelector<HTMLElement>(
                          `[data-message-id="${t.id}"]`,
                        );
                        node?.scrollIntoView({ block: "nearest" });
                      });
                    }}
                    className={cn(
                      "px-2 py-1 rounded text-[11px] whitespace-nowrap transition-colors",
                      isCurrent
                        ? "bg-purple-500/20 text-purple-700 dark:text-purple-300 cursor-default"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent",
                    )}
                    title={`${t.from_email}\n${new Date(t.created_at).toLocaleString()}`}
                  >
                    {idx + 1}. {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* AI Analysis — collapsible. Default open on pending so users
            see the AI triage immediately; collapsed once the agent
            has acted so the body becomes the focus. UX-INB-025. */}
        {(message.classification || message.summary) && (
          <details
            open={analysisOpen}
            onToggle={(e) => setAnalysisOpen(e.currentTarget.open)}
            className="bg-purple-500/10 border border-purple-500/20 rounded-lg mb-4 group"
          >
            <summary className="flex items-center gap-2 p-4 cursor-pointer list-none">
              <Sparkles className="h-4 w-4 text-purple-500 dark:text-purple-400 shrink-0" />
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                AI Analysis
              </span>
              {message.summary && !analysisOpen ? (
                <span className="text-xs text-purple-700/70 dark:text-purple-300/70 truncate">
                  {message.summary}
                </span>
              ) : null}
              {message.confidence_score !== null && (
                <span className="text-xs text-purple-700 dark:text-purple-400 ml-auto shrink-0">
                  {Math.round(message.confidence_score * 100)}% confidence
                </span>
              )}
              <ChevronRight
                className={cn(
                  "h-4 w-4 text-purple-500 dark:text-purple-400 transition-transform shrink-0",
                  analysisOpen && "rotate-90",
                )}
              />
            </summary>
            <div className="px-4 pb-4 -mt-1 space-y-2">
              {message.summary ? (
                <p className="text-sm text-foreground">{message.summary}</p>
              ) : null}
              {message.classification && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {message.classification.sentiment && (
                    <ClassificationPill
                      label="Sentiment"
                      value={String(message.classification.sentiment)}
                    />
                  )}
                  {message.classification.urgency && (
                    <ClassificationPill
                      label="Urgency"
                      value={String(message.classification.urgency)}
                    />
                  )}
                  {message.classification.intent && (
                    <ClassificationPill
                      label="Intent"
                      value={String(message.classification.intent)}
                    />
                  )}
                </div>
              )}
            </div>
          </details>
        )}

        {/* Email Body — body_html is attacker-controlled (the sender wrote
            it), so we MUST sanitize before rendering. DOMPurify with the
            default config strips <script>, <iframe>, event handlers, and
            javascript: URLs. We also explicitly forbid forms + external
            stylesheets to keep phishing surfaces narrow. */}
        <div className="prose prose-sm prose-invert max-w-none">
          {message.body_html ? (
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(message.body_html, {
                  USE_PROFILES: { html: true },
                  FORBID_TAGS: ["form", "input", "button", "style"],
                  FORBID_ATTR: ["style"],
                }),
              }}
            />
          ) : (
            <p className="whitespace-pre-wrap">{message.body_text}</p>
          )}
        </div>

        {/* UX-INB-026: render attachments[] when present so the user
            knows the sender included files even though we don't yet
            expose a download endpoint. Chips show filename + type +
            human-readable size. Click is a no-op (cursor: default) for
            now — when the backend lands a /attachments/:id route the
            anchor target can be wired in here without changing the
            visual shape. */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-5 pt-4 border-t border-border">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Attachments ({message.attachments.length})
            </div>
            <div className="flex flex-wrap gap-2">
              {message.attachments.map((att, idx) => (
                <div
                  key={`${att.name}-${idx}`}
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-accent/50 border border-border rounded-lg text-xs text-foreground max-w-[240px]"
                  title={att.content_type ? `${att.content_type} - ${att.name}` : att.name}
                >
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
                  <span className="truncate">{att.name}</span>
                  {typeof att.length === "number" && (
                    <span className="text-muted-foreground shrink-0">
                      {formatBytes(att.length)}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground/80">
              Stored with the message. Download not available yet.
            </p>
          </div>
        )}

        {/* Suggested Response — UX-INB-024: prior version was a one-click
            commit ("Send Suggested Response") with no edit step. Users
            who wanted to tweak the AI suggestion had to copy-paste it
            manually. Now the primary action loads it into the reply
            textarea so the user can edit before sending; a secondary
            "Send as-is" preserves the original behavior for users who
            trust the suggestion verbatim. */}
        {message.suggested_response && message.status === "pending" && (
          <div className="mt-6 bg-green-500/10 border border-green-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-green-500 dark:text-green-400" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300">
                Suggested Response
              </span>
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap mb-4">
              {message.suggested_response}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setReplyText(message.suggested_response ?? "");
                  // Focus + scroll the textarea into view so the user lands
                  // on the editable surface, not the action button they
                  // just clicked.
                  requestAnimationFrame(() => {
                    const el = replyTextareaRef.current;
                    if (!el) return;
                    el.focus();
                    el.setSelectionRange(el.value.length, el.value.length);
                    el.scrollIntoView({ block: "nearest" });
                  });
                }}
                disabled={isReplying}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 text-sm font-medium"
              >
                <ArrowDown className="h-4 w-4" />
                Edit in reply
              </button>
              <button
                onClick={() => onReply(message.suggested_response!, true)}
                disabled={isReplying}
                className="flex items-center gap-2 px-3 py-2 border border-green-500/40 text-green-700 dark:text-green-300 rounded-lg hover:bg-green-500/10 transition-colors disabled:opacity-50 text-sm font-medium"
              >
                {isReplying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send as-is
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Actions Footer */}
      {message.status === "pending" && (
        <div className="p-4 border-t border-border bg-muted/50">
          {!message.classification && (
            <button
              onClick={onProcess}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 mb-3"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Analyze with AI
            </button>
          )}

          <div className="space-y-2">
            <textarea
              id="reply-textarea"
              data-reply-textarea
              ref={replyTextareaRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={handleReplyKeyDown}
              placeholder="Write a custom reply..."
              // resize-none + autosize effect for a tidy single-handle UX
              // (no manual drag handle showing). min-height keeps the box
              // a comfortable two lines even when empty; effect caps at
              // 320px so a very long draft scrolls inside the textarea.
              className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-foreground text-sm resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 min-h-[72px]"
              rows={3}
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground/80">
              <span>
                <kbd className="px-1 py-0.5 bg-background border border-border rounded font-mono text-[10px]">
                  ⌘/Ctrl
                </kbd>
                {" + "}
                <kbd className="px-1 py-0.5 bg-background border border-border rounded font-mono text-[10px]">
                  Enter
                </kbd>
                {" to send"}
              </span>
              {replyText.trim() ? <span>Draft saved</span> : null}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (replyText.trim()) {
                    onReply(replyText.trim());
                    setReplyText("");
                  }
                }}
                disabled={isReplying || !replyText.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {isReplying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send Reply
              </button>
              <button
                onClick={() => setShowEscalateModal(true)}
                disabled={isEscalating}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                <ArrowUpRight className="h-4 w-4" />
                Escalate
              </button>
              <button
                onClick={onArchive}
                disabled={isArchiving}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
              >
                <Archive className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {message.status === "responded" && (
        <div className="p-4 border-t border-border bg-green-500/10">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle className="h-5 w-5" aria-hidden />
            <span className="text-sm font-medium">
              Response sent on {message.responded_at ? new Date(message.responded_at).toLocaleString() : "Unknown"}
            </span>
          </div>
        </div>
      )}

      {message.status === "escalated" && (
        <div className="p-4 border-t border-border bg-orange-500/10">
          <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
            <ArrowUpRight className="h-5 w-5" aria-hidden />
            <span className="text-sm font-medium">
              Escalated on {message.escalated_at ? new Date(message.escalated_at).toLocaleString() : "Unknown"}
            </span>
          </div>
        </div>
      )}

      <EscalateDialog
        open={showEscalateModal}
        onOpenChange={setShowEscalateModal}
        workspaceId={workspaceId}
        isEscalating={isEscalating}
        onSubmit={(escalateTo, note) => {
          onEscalate(escalateTo, note);
          setShowEscalateModal(false);
        }}
      />
    </div>
  );
}

function EscalateDialog({
  open,
  onOpenChange,
  workspaceId,
  isEscalating,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  isEscalating: boolean;
  onSubmit: (escalateTo: string, note?: string) => void;
}) {
  const ti = useTranslations("inbox.escalate");
  const { members } = useWorkspaceMembers(workspaceId);
  const [escalateTo, setEscalateTo] = useState("");
  const [note, setNote] = useState("");

  // Reset state when the dialog closes so the next escalation starts fresh.
  useEffect(() => {
    if (!open) {
      setEscalateTo("");
      setNote("");
    }
  }, [open]);

  // Workspace members with an email + a non-removed status are the
  // candidate set. We sort by name for stable ordering and dedupe by
  // email — a single physical person should only appear once even if
  // they hold multiple workspace rows.
  const candidates = useMemo(() => {
    if (!members) return [];
    const seen = new Set<string>();
    return members
      .filter((m) => m.status === "active" && !!m.developer_email)
      .filter((m) => {
        const email = m.developer_email!.toLowerCase();
        if (seen.has(email)) return false;
        seen.add(email);
        return true;
      })
      .sort((a, b) => {
        const an = a.developer_name || a.developer_email || "";
        const bn = b.developer_name || b.developer_email || "";
        return an.localeCompare(bn);
      });
  }, [members]);

  const isValid = escalateTo.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={isEscalating ? undefined : onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-full p-2 shrink-0 bg-orange-500/15">
              <ArrowUpRight className="h-5 w-5 text-orange-500 dark:text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle>{ti("title")}</DialogTitle>
              <DialogDescription className="mt-1.5">
                {ti("description")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="escalate-to"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              {ti("assigneeLabel")}
            </label>
            {/* Combined input: a datalist-backed text input lets users
                either pick a teammate from the workspace roster or type
                an arbitrary email (oncall@, manager@) without forcing
                the latter through a separate "custom" toggle. */}
            <input
              id="escalate-to"
              type="text"
              list="escalate-candidates"
              value={escalateTo}
              onChange={(e) => setEscalateTo(e.target.value)}
              placeholder={ti("assigneePlaceholder")}
              autoFocus
              autoComplete="off"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            />
            <datalist id="escalate-candidates">
              {candidates.map((m) => (
                <option
                  key={m.id}
                  value={m.developer_email ?? ""}
                  label={m.developer_name ?? undefined}
                />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-muted-foreground">
              {ti("assigneeHint")}
            </p>
          </div>

          <div>
            <label
              htmlFor="escalate-note"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              {ti("noteLabel")}
            </label>
            <textarea
              id="escalate-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={ti("notePlaceholder")}
              rows={3}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isEscalating}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
          >
            {ti("cancel")}
          </button>
          <button
            type="button"
            onClick={() => onSubmit(escalateTo.trim(), note.trim() || undefined)}
            disabled={!isValid || isEscalating}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isEscalating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUpRight className="h-4 w-4" />
            )}
            {ti("submit")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AgentInboxPage() {
  const ti = useTranslations("inbox");
  const params = useParams();
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const agentId = params.agentId as string;
  const workspaceId = currentWorkspace?.id || null;

  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  // Multi-select for bulk triage. Tracked as a Set since order doesn't
  // matter; conversion to array happens only at action time.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const { agent, isLoading: agentLoading } = useAgent(workspaceId, agentId);
  const {
    messages,
    isLoading: inboxLoading,
    refetch,
    replyToMessage,
    escalateMessage,
    archiveMessage,
    unarchiveMessage,
    processMessage,
    isReplying,
    isEscalating,
    isArchiving,
    isProcessing,
  } = useAgentInbox(workspaceId, agentId, { status: statusFilter });

  const selectedMessage = messages.find((m) => m.id === selectedMessageId);

  // UX-INB-030: per-status counts on the filter dropdown. Only
  // populated when the user is on the unfiltered "All Status" view
  // since that's the only state where we have every message in
  // `messages`. When a status is selected the dropdown shows labels
  // only — the count would lie since we only fetched one slice.
  const statusCounts = useMemo<Record<string, number> | null>(() => {
    if (statusFilter) return null;
    return messages.reduce<Record<string, number>>((acc, m) => {
      acc[m.status] = (acc[m.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [messages, statusFilter]);

  // Drop any checked ids that vanished after a filter change / refetch so
  // the bulk bar's count stays accurate.
  useEffect(() => {
    if (checkedIds.size === 0) return;
    const present = new Set(messages.map((m) => m.id));
    let drift = false;
    checkedIds.forEach((id) => {
      if (!present.has(id)) drift = true;
    });
    if (drift) {
      setCheckedIds((prev) => {
        const next = new Set<string>();
        prev.forEach((id) => {
          if (present.has(id)) next.add(id);
        });
        return next;
      });
    }
  }, [messages, checkedIds]);

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleChecked =
    messages.length > 0 && messages.every((m) => checkedIds.has(m.id));
  const someVisibleChecked = checkedIds.size > 0 && !allVisibleChecked;

  const toggleSelectAllVisible = () => {
    if (allVisibleChecked) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(messages.map((m) => m.id)));
    }
  };

  const clearChecked = () => setCheckedIds(new Set());

  const handleBulkArchive = async () => {
    if (checkedIds.size === 0 || bulkPending) return;
    setBulkPending(true);
    try {
      // Run in parallel — these are independent rows. If a future endpoint
      // accepts a batch, swap this for a single call.
      await Promise.all(
        Array.from(checkedIds).map((id) => archiveMessage(id).catch(() => null)),
      );
      clearChecked();
      // Drop the selected message from the detail pane if it was archived.
      if (selectedMessageId && checkedIds.has(selectedMessageId)) {
        setSelectedMessageId(null);
      }
      refetch();
    } finally {
      setBulkPending(false);
    }
  };

  const handleBulkProcess = async () => {
    if (checkedIds.size === 0 || bulkPending) return;
    setBulkPending(true);
    try {
      await Promise.all(
        Array.from(checkedIds).map((id) => processMessage(id).catch(() => null)),
      );
      clearChecked();
      refetch();
    } finally {
      setBulkPending(false);
    }
  };

  // Keyboard nav — j/k or arrow keys move the selected message, x toggles
  // check, e archives the current message (or all checked), Esc clears.
  const messageIndex = useMemo(() => {
    return messages.findIndex((m) => m.id === selectedMessageId);
  }, [messages, selectedMessageId]);

  useEffect(() => {
    if (!messages.length) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Don't hijack shortcuts when the user is typing in a reply box,
      // search field, or contenteditable region.
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const idx = messages.findIndex((m) => m.id === selectedMessageId);
      const moveTo = (next: number) => {
        const clamped = Math.max(0, Math.min(messages.length - 1, next));
        const target = messages[clamped];
        if (!target) return;
        setSelectedMessageId(target.id);
        // Scroll the focused row into view.
        const node = document.querySelector<HTMLElement>(
          `[data-message-id="${target.id}"]`,
        );
        node?.scrollIntoView({ block: "nearest" });
      };

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          moveTo(idx < 0 ? 0 : idx + 1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          moveTo(idx < 0 ? 0 : idx - 1);
          break;
        case "x":
          if (selectedMessageId) {
            e.preventDefault();
            toggleChecked(selectedMessageId);
          }
          break;
        case "e":
          e.preventDefault();
          if (checkedIds.size > 0) {
            void handleBulkArchive();
          } else if (selectedMessageId) {
            void archiveMessage(selectedMessageId).then(() => {
              setSelectedMessageId(null);
              refetch();
            });
          }
          break;
        case "Escape":
          if (checkedIds.size > 0) {
            e.preventDefault();
            clearChecked();
          }
          break;
        case "r":
          // Focus the reply textarea for the currently-open message.
          // Only meaningful when a message is selected AND it's still
          // pending (responded/escalated/archived rows don't render the
          // reply box).
          if (selectedMessageId) {
            e.preventDefault();
            const reply = document.querySelector<HTMLTextAreaElement>(
              "[data-reply-textarea]",
            );
            if (reply) {
              reply.focus();
              reply.scrollIntoView({ block: "nearest" });
            }
          }
          break;
        case "?":
          e.preventDefault();
          setShowShortcuts((v) => !v);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, selectedMessageId, checkedIds, bulkPending]);

  const handleReply = async (body: string, useSuggested?: boolean) => {
    if (!selectedMessageId) return;
    await replyToMessage({
      messageId: selectedMessageId,
      body,
      useSuggested,
    });
    refetch();
  };

  const handleEscalate = async (escalateTo: string, note?: string) => {
    if (!selectedMessageId) return;
    await escalateMessage({
      messageId: selectedMessageId,
      escalateTo,
      note,
    });
    refetch();
  };

  const handleArchive = async () => {
    if (!selectedMessageId) return;
    // UX-INB-022: real undo via the inverse unarchive endpoint.
    // Captures the subject + id locally because the row's about to
    // vanish from the canonical list; the Undo action calls
    // unarchiveMessage with the captured id.
    const archived = messages.find((m) => m.id === selectedMessageId);
    const archivedId = selectedMessageId;
    await archiveMessage(archivedId);
    setSelectedMessageId(null);
    refetch();
    toast.success(
      archived?.subject
        ? `Archived "${archived.subject.slice(0, 60)}"`
        : "Message archived",
      {
        duration: 6000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await unarchiveMessage(archivedId);
              refetch();
              setSelectedMessageId(archivedId);
              toast.success("Message restored");
            } catch (err) {
              toast.error(
                getApiErrorMessage(err, "Failed to restore message"),
              );
            }
          },
        },
      },
    );
  };

  const handleProcess = async () => {
    if (!selectedMessageId) return;
    await processMessage(selectedMessageId);
    refetch();
  };

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="border-b border-border bg-muted/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Breadcrumb
            items={[
              { label: "Agents", href: "/agents" },
              { label: agent?.name || "Agent", href: `/agents/${agentId}` },
              { label: "Inbox" },
            ]}
            className="mb-3"
          />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden />
                  <h1 className="text-xl font-bold text-foreground">
                    {agent?.name || "Agent"} Inbox
                  </h1>
                </div>
                {agent?.email_address && (
                  <p className="text-sm text-muted-foreground mt-1">{agent.email_address}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={statusFilter || ""}
                onChange={(e) => setStatusFilter(e.target.value || undefined)}
                aria-label="Filter by status"
                className="bg-accent border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <option value="">
                  All Status{statusCounts ? ` (${messages.length})` : ""}
                </option>
                <option value="pending">
                  Pending{statusCounts?.pending !== undefined ? ` (${statusCounts.pending})` : ""}
                </option>
                <option value="processing">
                  Processing{statusCounts?.processing !== undefined ? ` (${statusCounts.processing})` : ""}
                </option>
                <option value="responded">
                  Responded{statusCounts?.responded !== undefined ? ` (${statusCounts.responded})` : ""}
                </option>
                <option value="escalated">
                  Escalated{statusCounts?.escalated !== undefined ? ` (${statusCounts.escalated})` : ""}
                </option>
                <option value="archived">
                  Archived{statusCounts?.archived !== undefined ? ` (${statusCounts.archived})` : ""}
                </option>
              </select>
              <button
                onClick={() => refetch()}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {agentLoading || inboxLoading ? (
          // UX-LE-003: list-shaped skeleton matching the post-load grid
          // so the layout doesn't reflow when data lands. Six skeleton
          // rows fill the list pane; the detail pane shows a centered
          // ghost matching the "Select a message" empty state.
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)] animate-pulse">
            <div className="lg:col-span-1 bg-muted border border-border rounded-xl overflow-hidden flex flex-col">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
                <div className="h-4 w-4 rounded bg-accent" />
                <div className="h-3 w-20 rounded bg-accent" />
              </div>
              <div className="flex-1 divide-y divide-border">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                      <div className="h-3 w-32 rounded bg-accent" />
                    </div>
                    <div className="h-3 w-3/4 rounded bg-accent" />
                    <div className="h-2.5 w-full rounded bg-accent" />
                  </div>
                ))}
              </div>
            </div>
            <div className="hidden lg:flex lg:col-span-2 bg-muted border border-border rounded-xl items-center justify-center">
              <div className="text-center text-muted-foreground/60">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <div className="h-3 w-32 rounded bg-accent mx-auto" />
              </div>
            </div>
          </div>
        ) : !agent?.email_enabled ? (
          <div className="text-center py-12">
            <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium text-foreground mb-2">
              {ti("emailNotEnabled.title")}
            </h2>
            <p className="text-muted-foreground mb-4">
              {ti("emailNotEnabled.description")}
            </p>
            <Link
              href={`/agents/${agentId}/edit?tab=email`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              {ti("emailNotEnabled.cta")}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        ) : messages.length === 0 ? (
          // UX-INB-028: when the global inbox is empty, surface the
          // agent's email address as a copy-friendly affordance. Without
          // this users had to scroll up to the header to find where to
          // send mail to in the first place — the empty state ended up
          // being a dead-end. Filtered-empty (statusFilter set) keeps
          // the terser copy because the address is already visible
          // above and the user is mid-triage.
          statusFilter ? (
            <div className="text-center py-12">
              <MailOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" aria-hidden />
              <h2 className="text-lg font-medium text-foreground mb-2">No Messages</h2>
              <p className="text-muted-foreground">
                {`No ${statusFilter} messages found.`}
              </p>
            </div>
          ) : (
            <div className="text-center py-12 max-w-md mx-auto">
              <MailOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" aria-hidden />
              <h2 className="text-lg font-medium text-foreground mb-2">Send the first email</h2>
              <p className="text-muted-foreground mb-4">
                This inbox is empty. Forward or send mail to the address
                below — the agent picks up new messages every few seconds.
              </p>
              {agent?.email_address ? (
                <div className="inline-flex items-center gap-2 bg-muted border border-border rounded-lg px-3 py-2">
                  <code className="text-sm text-foreground font-mono select-all">
                    {agent.email_address}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof navigator !== "undefined" && navigator.clipboard) {
                        navigator.clipboard.writeText(agent.email_address || "");
                        toast.success("Email address copied");
                      }
                    }}
                    aria-label="Copy inbox email address"
                    title="Copy address"
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <Copy className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>
          )
        ) : (
          // 200px ≈ AppShell sidebar header (16px mobile bar +
          // breadcrumb + page header + filter row + outer padding).
          // Pin the message grid to the available viewport so the
          // list scrolls within its column rather than the page.
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
            {/* Message List — on mobile, hidden when a message is open
                so the detail view gets the full viewport. The "Back to
                inbox" affordance in MessageDetail's header brings it
                back. UX-INB-029. */}
            <div
              className={cn(
                "lg:col-span-1 bg-muted border border-border rounded-xl overflow-hidden flex flex-col",
                selectedMessageId ? "hidden lg:flex" : "flex",
              )}
            >
              {/* List header: select-all + count / shortcuts hint. Doubles
                  as the bulk action bar when a selection is active. */}
              {checkedIds.size > 0 ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-blue-500/10">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allVisibleChecked}
                      ref={(node) => {
                        if (node) node.indeterminate = someVisibleChecked;
                      }}
                      onChange={toggleSelectAllVisible}
                      aria-label={ti("bulk.selectAll")}
                      className="h-4 w-4 rounded border-border accent-blue-500"
                    />
                    <span className="text-sm font-medium text-foreground">
                      {ti("bulk.selectedCount", { count: checkedIds.size })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleBulkProcess}
                      disabled={bulkPending}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                    >
                      {bulkPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {ti("bulk.process")}
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkArchive}
                      disabled={bulkPending}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                    >
                      {bulkPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Archive className="h-3.5 w-3.5" />
                      )}
                      {ti("bulk.archive")}
                    </button>
                    <button
                      type="button"
                      onClick={clearChecked}
                      disabled={bulkPending}
                      className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md disabled:opacity-50 transition-colors"
                      aria-label={ti("bulk.clear")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={toggleSelectAllVisible}
                      aria-label={ti("bulk.selectAll")}
                      className="h-4 w-4 rounded border-border accent-blue-500"
                    />
                    <span className="text-xs text-muted-foreground">
                      {ti("list.unread", {
                        count: messages.filter((m) => m.status === "pending").length,
                      })}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowShortcuts(true)}
                    className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
                    aria-label={ti("shortcuts.openLabel")}
                    title={ti("shortcuts.openLabel")}
                  >
                    <Keyboard className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="overflow-y-auto flex-1">
                {messages.map((message) => (
                  <MessageCard
                    key={message.id}
                    message={message}
                    isSelected={message.id === selectedMessageId}
                    isChecked={checkedIds.has(message.id)}
                    hasAnySelection={checkedIds.size > 0}
                    onClick={() => setSelectedMessageId(message.id)}
                    onToggleCheck={() => toggleChecked(message.id)}
                  />
                ))}
              </div>
            </div>

            {/* Message Detail — on mobile, only rendered when a message
                is selected. The list takes the full viewport otherwise. */}
            <div
              className={cn(
                "lg:col-span-2 bg-muted border border-border rounded-xl overflow-hidden flex flex-col",
                selectedMessage ? "flex" : "hidden lg:flex",
              )}
            >
              {selectedMessage ? (
                <>
                  {/* Mobile back affordance — only visible on <lg
                      because the desktop layout always shows both
                      panes side-by-side. Tapping it deselects the
                      message which the parent grid uses to swap
                      visibility. */}
                  <div className="lg:hidden flex items-center px-3 py-2 border-b border-border">
                    <button
                      type="button"
                      onClick={() => setSelectedMessageId(null)}
                      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-accent transition-colors"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Inbox
                    </button>
                  </div>
                  <div className="flex-1 min-h-0">
                    <MessageDetail
                      message={selectedMessage}
                      agentId={agentId}
                      workspaceId={workspaceId}
                      onReply={handleReply}
                      onEscalate={handleEscalate}
                      onArchive={handleArchive}
                      onProcess={handleProcess}
                      onSelectMessage={setSelectedMessageId}
                      isReplying={isReplying}
                      isEscalating={isEscalating}
                      isArchiving={isArchiving}
                      isProcessing={isProcessing}
                    />
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>{ti("detail.selectAMessage")}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showShortcuts ? (
        <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />
      ) : null}
    </div>
  );
}

// UX-INB-021: ShortcutsOverlay was a raw fixed-inset div with a manual
// Escape handler that fought the page-level keyboard nav for focus and
// Esc handling. Migrated to the Radix Dialog primitive — focus trap,
// scroll lock, Esc serialization, and aria-modal all come from Radix,
// and the page-level keydown handler bails out the moment focus is in
// a dialog (Radix dispatches a portal).
function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const ti = useTranslations("inbox.shortcuts");

  const rows: { keys: string[]; label: string }[] = [
    { keys: ["j", "↓"], label: ti("nextMessage") },
    { keys: ["k", "↑"], label: ti("prevMessage") },
    { keys: ["x"], label: ti("toggleSelect") },
    { keys: ["e"], label: ti("archive") },
    { keys: ["r"], label: ti("reply") },
    { keys: ["esc"], label: ti("clearOrClose") },
    { keys: ["?"], label: ti("toggleOverlay") },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-foreground" aria-hidden />
            <DialogTitle className="text-sm font-semibold">
              {ti("title")}
            </DialogTitle>
          </div>
        </DialogHeader>
        <ul className="space-y-1.5 pt-1">
          {rows.map(({ keys, label }) => (
            <li
              key={label}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">{label}</span>
              <span className="flex items-center gap-1">
                {keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-[11px] font-mono bg-background border border-border rounded text-foreground"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Colored pill for the AI Analysis classification chips. Tones the
 * background and text by the sentiment / urgency / intent value so a
 * "negative" sentiment doesn't read identical to a "positive" one —
 * the prior implementation used the same flat `bg-accent` for all
 * three.
 */
function ClassificationPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const v = value.toLowerCase();
  const tone =
    v === "negative" || v === "urgent" || v === "high" || v === "angry"
      ? "bg-red-500/15 text-red-700 dark:text-red-300"
      : v === "positive" || v === "low" || v === "happy"
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
        : v === "neutral" || v === "normal" || v === "medium"
          ? "bg-blue-500/15 text-blue-700 dark:text-blue-300"
          : "bg-accent text-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded font-medium",
        tone,
      )}
    >
      <span className="text-muted-foreground font-normal">{label}:</span>
      <span className="capitalize">{value}</span>
    </span>
  );
}
