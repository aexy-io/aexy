"use client";

import { useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useAdminFeedback, useReviewFeedback } from "@/hooks/useFeedback";
import type { FeedbackAdminItem, FeedbackKind, FeedbackStatus } from "@/lib/api";

const STATUSES: FeedbackStatus[] = ["new", "triaged", "planned", "shipped", "declined"];
const KINDS: FeedbackKind[] = ["suggestion", "problem", "question", "app_request"];

const STATUS_STYLES: Record<FeedbackStatus, string> = {
  new: "bg-muted text-muted-foreground",
  triaged: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  planned: "bg-purple-500/10 text-purple-600 dark:text-purple-300",
  shipped: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  declined: "bg-red-500/10 text-red-600 dark:text-red-300",
};

/**
 * Feedback triage.
 *
 * This is the side of the board that knows who wrote what: the workspace, the
 * person, and the page they were on. Changing a status notifies the author —
 * including "declined", because an answer of no that is never delivered is
 * indistinguishable from being ignored.
 */
export default function AdminFeedbackPage() {
  const [status, setStatus] = useState<FeedbackStatus | undefined>(undefined);
  const [kind, setKind] = useState<FeedbackKind | undefined>(undefined);
  const { data, isLoading } = useAdminFeedback({ status, kind });
  const review = useReviewFeedback();
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const items: FeedbackAdminItem[] = data?.items ?? [];

  const setItemStatus = async (item: FeedbackAdminItem, next: FeedbackStatus) => {
    try {
      await review.mutateAsync({ feedbackId: item.id, status: next });
      toast.success(`Marked ${next}`, { description: "The author has been notified." });
    } catch {
      toast.error("Could not update that");
    }
  };

  const saveNote = async (item: FeedbackAdminItem) => {
    const note = noteDrafts[item.id];
    if (note === undefined) return;
    try {
      await review.mutateAsync({ feedbackId: item.id, admin_note: note });
      toast.success("Note saved");
    } catch {
      toast.error("Could not save that note");
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data?.total ?? 0} items. Newest first.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterRow
          label="Status"
          options={STATUSES}
          value={status}
          onChange={(v) => setStatus(v as FeedbackStatus | undefined)}
        />
        <FilterRow
          label="Kind"
          options={KINDS}
          value={kind}
          onChange={(v) => setKind(v as FeedbackKind | undefined)}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border p-12 text-center">
          <MessageSquare className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Nothing matches those filters.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl border border-border bg-background/50 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {item.kind.replace(/_/g, " ")}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[item.status]}`}
                >
                  {item.status}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {item.vote_count} {item.vote_count === 1 ? "vote" : "votes"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {item.workspace_name ?? item.workspace_id} ·{" "}
                  {item.developer_name ?? item.developer_email ?? item.developer_id}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </div>

              <p className="text-sm font-medium text-foreground">{item.subject}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.body}</p>

              {Object.keys(item.context ?? {}).length > 0 && (
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  {Object.entries(item.context)
                    .map(([key, value]) => `${key}=${String(value)}`)
                    .join("  ")}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {STATUSES.map((next) => (
                  <button
                    key={next}
                    type="button"
                    onClick={() => setItemStatus(item, next)}
                    disabled={review.isPending || item.status === next}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-40 ${
                      item.status === next
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {next}
                  </button>
                ))}
              </div>

              <div className="mt-3 flex items-start gap-2">
                <textarea
                  rows={2}
                  defaultValue={item.admin_note ?? ""}
                  onChange={(e) =>
                    setNoteDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  placeholder="Internal note"
                  className="flex-1 resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => saveNote(item)}
                  disabled={review.isPending || noteDrafts[item.id] === undefined}
                  className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      {[undefined, ...options].map((option) => (
        <button
          key={option ?? "all"}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
            value === option
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {option ? option.replace(/_/g, " ") : "any"}
        </button>
      ))}
    </div>
  );
}
