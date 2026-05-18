"use client";

import { useQuery } from "@tanstack/react-query";
import { Cpu, Calendar } from "lucide-react";

import { api } from "@/lib/api";

interface ProviderEntry {
  in?: number;
  out?: number;
  req?: number;
}

interface WorkspaceLLMUsage {
  workspace_id: string;
  tokens_used_this_month: number;
  input_tokens_this_month: number;
  output_tokens_this_month: number;
  requests_this_month: number;
  overage_cost_cents: number;
  reset_at: string | null;
  provider_breakdown: Record<string, ProviderEntry>;
}

interface Props {
  workspaceId: string | null;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatResetDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Workspace-level monthly LLM token counter.
 *
 * Unlike `LLMUsageCard` (which rolls up the per-call analysis cache),
 * this reads the simple month-to-date counters maintained inline by
 * the AI sync activities. Reset lazily on the first read of a new month.
 * Visible to any workspace member — transparency over billing.
 */
export function WorkspaceLLMUsageCard({ workspaceId }: Props) {
  const { data, isLoading, error } = useQuery<WorkspaceLLMUsage>({
    queryKey: ["workspaceLLMUsage", workspaceId],
    queryFn: async () => {
      const response = await api.get(`/workspaces/${workspaceId}/llm-usage`);
      return response.data;
    },
    enabled: !!workspaceId,
    staleTime: 60 * 1000,
  });

  const providers = data
    ? Object.entries(data.provider_breakdown).sort(
        (a, b) =>
          ((b[1].in ?? 0) + (b[1].out ?? 0)) -
          ((a[1].in ?? 0) + (a[1].out ?? 0)),
      )
    : [];

  return (
    <section className="bg-card rounded-xl border border-border overflow-hidden">
      <header className="px-5 py-3 border-b border-border flex items-center gap-2">
        <Cpu className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          AI usage this month
        </h2>
        {data?.reset_at && (
          <div className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Resets {formatResetDate(data.reset_at)}
          </div>
        )}
      </header>

      <div className="p-5 space-y-4">
        {isLoading && (
          <div className="space-y-2">
            <div className="h-9 w-32 rounded bg-muted animate-pulse" />
            <div className="h-4 w-48 rounded bg-muted animate-pulse" />
          </div>
        )}
        {error && (
          <div className="text-sm text-destructive">
            Failed to load usage: {(error as Error).message}
          </div>
        )}

        {data && (
          <>
            {data.overage_cost_cents > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Plan free-tier exceeded — overage this month:{" "}
                <span className="font-semibold">
                  ${(data.overage_cost_cents / 100).toFixed(2)}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="text-2xl font-semibold text-foreground tabular-nums">
                  {formatTokens(data.tokens_used_this_month)}
                </div>
                <div className="text-xs text-muted-foreground">
                  total tokens
                </div>
              </div>
              <div>
                <div className="text-xl font-medium text-foreground tabular-nums">
                  {formatTokens(data.input_tokens_this_month)}
                </div>
                <div className="text-xs text-muted-foreground">input</div>
              </div>
              <div>
                <div className="text-xl font-medium text-foreground tabular-nums">
                  {formatTokens(data.output_tokens_this_month)}
                </div>
                <div className="text-xs text-muted-foreground">output</div>
              </div>
              <div>
                <div className="text-xl font-medium text-foreground tabular-nums">
                  {data.requests_this_month.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">requests</div>
              </div>
            </div>

            {providers.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  By provider
                </div>
                <ul className="space-y-1.5">
                  {providers.map(([name, entry]) => {
                    const total =
                      (entry.in ?? 0) + (entry.out ?? 0);
                    const share =
                      data.tokens_used_this_month > 0
                        ? (total / data.tokens_used_this_month) * 100
                        : 0;
                    return (
                      <li
                        key={name}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-foreground">
                            {name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {entry.req ?? 0} req
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {formatTokens(total)} ({share.toFixed(0)}%)
                          </span>
                          <div className="hidden sm:block h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary/70"
                              style={{ width: `${Math.min(100, share)}%` }}
                            />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {providers.length === 0 && data.tokens_used_this_month === 0 && (
              <p className="text-xs text-muted-foreground">
                No AI calls yet this month. Numbers populate as analyze_commit,
                analyze_pr and analyze_review activities run during GitHub sync.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
