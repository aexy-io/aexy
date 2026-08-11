"use client";

/**
 * What a connected mailbox stores.
 *
 * `all` syncs the inbox and subtracts the exclusion rules — subtractive, so it
 * asks somebody to predict everything worth keeping out of a shared workspace,
 * and whatever they fail to predict is already in it before they notice.
 * `opt_in` inverts the default: nothing is stored until a thread is asked for.
 *
 * Sits above the exclusions panel because it decides whether that panel is even
 * the right tool — on an opt-in account, exclusions are a second line rather
 * than the first.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Inbox, Loader2, Tag } from "lucide-react";
import { toast } from "sonner";

import { googleIntegrationApi, GoogleThreadSummary } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/utils";

export function GmailSyncMode({
  workspaceId,
  integrationId,
  syncMode,
  optInLabel,
  isMine,
  onModeChanged,
}: {
  workspaceId: string | null;
  integrationId: string | null;
  syncMode: "all" | "opt_in";
  optInLabel: string;
  /** Only the person who connected an account may change what it syncs. */
  isMine: boolean;
  onModeChanged: () => void;
}) {
  const [threads, setThreads] = useState<GoogleThreadSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [busyThread, setBusyThread] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    if (!workspaceId || syncMode !== "opt_in") return;
    setIsLoading(true);
    try {
      const data = await googleIntegrationApi.threads.list(workspaceId, integrationId, {
        page_size: 50,
      });
      setThreads(data.threads);
    } catch {
      // A 403 here means the account is somebody else's, which the panel
      // already reflects by hiding its controls. Nothing worth a toast.
      setThreads([]);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, integrationId, syncMode]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  if (!isMine) return null;

  const switchMode = async (mode: "all" | "opt_in") => {
    if (!workspaceId || mode === syncMode || isSwitching) return;
    setIsSwitching(true);
    try {
      await googleIntegrationApi.threads.setSyncMode(workspaceId, { sync_mode: mode }, integrationId);
      // Said plainly, because the opposite is the natural assumption: turning
      // opt-in on looks like it should clear what is already there.
      toast.success(
        mode === "opt_in"
          ? "Only marked threads will sync from now on. Mail already synced stays — use Never sync to remove it."
          : "This account will sync its whole inbox again, minus your Never sync rules."
      );
      onModeChanged();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not change what this account syncs"));
    } finally {
      setIsSwitching(false);
    }
  };

  const toggleThread = async (thread: GoogleThreadSummary) => {
    if (!workspaceId || busyThread) return;
    setBusyThread(thread.gmail_thread_id);
    try {
      const result = thread.is_marked
        ? await googleIntegrationApi.threads.unmark(workspaceId, thread.gmail_thread_id, integrationId)
        : await googleIntegrationApi.threads.mark(workspaceId, thread.gmail_thread_id, integrationId);

      // Unmarking removes what the thread already put in the CRM. That reaches
      // backwards, so it is reported rather than left to be discovered.
      toast.success(
        result.is_marked
          ? `Syncing this thread${result.messages_changed ? ` — ${result.messages_changed} message${result.messages_changed === 1 ? "" : "s"} added` : ""}`
          : `Stopped syncing${result.messages_changed ? ` — ${result.messages_changed} message${result.messages_changed === 1 ? "" : "s"} removed` : ""}`
      );
      await loadThreads();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not change that thread"));
    } finally {
      setBusyThread(null);
    }
  };

  return (
    <div className="ml-14 pl-4 border-l-2 border-border space-y-3" data-testid="gmail-sync-mode">
      <div>
        <h4 className="font-medium text-foreground text-sm flex items-center gap-2">
          <Inbox className="w-3.5 h-3.5" />
          What this account syncs
        </h4>
        <p className="text-xs text-muted-foreground mt-1">
          Sync the whole inbox and exclude what you don&apos;t want, or sync
          nothing until you ask for a thread.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="What this account syncs">
        {(
          [
            { value: "all", label: "Everything", hint: "minus Never sync" },
            { value: "opt_in", label: "Only what I mark", hint: "nothing by default" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            onClick={() => switchMode(option.value)}
            disabled={isSwitching}
            data-testid={`sync-mode-${option.value}`}
            aria-pressed={syncMode === option.value}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
              syncMode === option.value
                ? "border-purple-500 bg-purple-500/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {isSwitching && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
            {option.label}
            <span className="ml-1 text-xs text-muted-foreground">({option.hint})</span>
          </button>
        ))}
      </div>

      {syncMode === "opt_in" && (
        <>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Tag className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              Apply the <span className="text-foreground">{optInLabel}</span>{" "}
              label to a thread in Gmail and it syncs too — useful on a phone,
              at the moment the mail arrives.
            </span>
          </p>

          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : threads.length === 0 ? (
            <p className="text-xs text-muted-foreground" data-testid="thread-list-empty">
              No threads seen yet. Aexy records a thread&apos;s subject and
              participants so you have something to pick from — never its
              contents until you mark it.
            </p>
          ) : (
            <ul className="space-y-1" data-testid="thread-list">
              {threads.map((thread) => (
                <li
                  key={thread.gmail_thread_id}
                  data-testid={`thread-${thread.gmail_thread_id}`}
                  className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-foreground">
                      {thread.subject || "(no subject)"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {thread.participants.join(", ")}
                      {thread.message_count > 1 ? ` · ${thread.message_count} messages` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleThread(thread)}
                    disabled={busyThread !== null}
                    data-testid={`thread-toggle-${thread.gmail_thread_id}`}
                    className={`flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors disabled:opacity-50 ${
                      thread.is_marked
                        ? "border-purple-500 bg-purple-500/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {busyThread === thread.gmail_thread_id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : thread.is_marked ? (
                      <Check className="h-3 w-3" />
                    ) : null}
                    {thread.is_marked ? "Syncing" : "Sync this"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
