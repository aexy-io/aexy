"use client";

import { useState } from "react";
import { ArrowBigUp, Lightbulb, MessageSquarePlus } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useFeedbackBoard, useMyFeedback, useVoteFeedback } from "@/hooks/useFeedback";
import { useFeedbackStore } from "@/stores/feedbackStore";
import { EmptyState } from "@/components/EmptyState";
import type { FeedbackItem, FeedbackKind, FeedbackStatus } from "@/lib/api";

const KIND_LABELS: Record<FeedbackKind, string> = {
  suggestion: "Suggestion",
  problem: "Problem",
  question: "Question",
  app_request: "App request",
};

const STATUS_STYLES: Record<FeedbackStatus, string> = {
  new: "bg-muted text-muted-foreground",
  triaged: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  planned: "bg-purple-500/10 text-purple-600 dark:text-purple-300",
  shipped: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  declined: "bg-red-500/10 text-red-600 dark:text-red-300",
};

const TABS: { id: "board" | "mine"; label: string }[] = [
  { id: "board", label: "All feedback" },
  { id: "mine", label: "Mine" },
];

/**
 * The shared feedback board.
 *
 * Items span workspaces so that ten teams asking for the same thing shows up as
 * one item with a count rather than ten copies nobody can compare. That is the
 * whole reason it is votable — and the reason rows carry no author and no
 * workspace: wanting something should not disclose who wants it.
 */
export default function FeedbackPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const [tab, setTab] = useState<"board" | "mine">("board");
  const [kind, setKind] = useState<FeedbackKind | undefined>(undefined);

  const board = useFeedbackBoard(workspaceId, { kind });
  const mine = useMyFeedback(workspaceId);
  const vote = useVoteFeedback(workspaceId, { kind });
  const openComposer = useFeedbackStore((s) => s.open);

  const items: FeedbackItem[] =
    (tab === "board" ? board.data?.items : mine.data?.items) ?? [];
  const isLoading = tab === "board" ? board.isLoading : mine.isLoading;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Feedback</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What people want from Aexy, and what we are doing about it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openComposer()}
          data-testid="feedback-open-composer"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          <MessageSquarePlus className="h-4 w-4" />
          Send feedback
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          {TABS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setTab(option.id)}
              aria-pressed={tab === option.id}
              data-testid={`feedback-tab-${option.id}`}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === option.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {tab === "board" && (
          <div className="flex flex-wrap items-center gap-1">
            {([undefined, "suggestion", "problem", "question", "app_request"] as const).map(
              (option) => (
                <button
                  key={option ?? "all"}
                  type="button"
                  onClick={() => setKind(option)}
                  aria-pressed={kind === option}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    kind === option
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option ? KIND_LABELS[option] : "Everything"}
                </button>
              ),
            )}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-background/50">
        {isLoading ? (
          <div className="animate-pulse space-y-3 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-muted" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Lightbulb}
            title={tab === "mine" ? "You haven't sent anything yet" : "Nothing here yet"}
            description={
              tab === "mine"
                ? "Anything you send shows up here with what came of it."
                : "Be the first to say what Aexy should do next."
            }
            compact
          />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-4 p-4">
                <button
                  type="button"
                  onClick={() => vote.mutate({ feedbackId: item.id, voted: item.voted })}
                  aria-pressed={item.voted}
                  aria-label={item.voted ? "Remove your vote" : "Vote for this"}
                  data-testid={`feedback-vote-${item.id}`}
                  className={`flex w-12 shrink-0 flex-col items-center rounded-lg border py-1.5 transition ${
                    item.voted
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ArrowBigUp className={`h-4 w-4 ${item.voted ? "fill-current" : ""}`} />
                  <span className="text-xs font-semibold tabular-nums">{item.vote_count}</span>
                </button>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {KIND_LABELS[item.kind]}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[item.status]}`}
                    >
                      {item.status}
                    </span>
                    {item.mine && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                        yours
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground">{item.subject}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
