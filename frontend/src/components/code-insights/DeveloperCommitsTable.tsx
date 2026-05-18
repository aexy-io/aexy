"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, GitCommit } from "lucide-react";

import { api } from "@/lib/api";

interface CommitRow {
  id: string;
  sha: string;
  message: string;
  repository: string;
  additions: number;
  deletions: number;
  files_changed: number;
  committed_at: string | null;
  author_github_login: string | null;
  author_email: string | null;
  is_merge: boolean;
  change_class: string | null;
  author_class: string | null;
  html_url: string | null;
}

interface CommitsResponse {
  developer_id: string;
  workspace_id: string;
  period_start: string;
  period_end: string;
  total: number;
  limit: number;
  offset: number;
  commits: CommitRow[];
}

interface Props {
  workspaceId: string | null;
  developerId: string;
  /** Same start/end the parent insights page is showing. ISO strings. */
  startDate?: string | null;
  endDate?: string | null;
  /** Falls back to weekly server-side default when start/end are absent. */
  periodType?: "daily" | "weekly" | "monthly" | "sprint";
}

function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function DeveloperCommitsTable({
  workspaceId,
  developerId,
  startDate,
  endDate,
  periodType = "weekly",
}: Props) {
  const enabled = !!workspaceId && !!developerId;

  const { data, isLoading, error } = useQuery<CommitsResponse>({
    queryKey: [
      "developerCommits",
      workspaceId,
      developerId,
      startDate,
      endDate,
      periodType,
    ],
    queryFn: async () => {
      const params: Record<string, string> = {
        limit: "200",
        period_type: periodType,
      };
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const response = await api.get(
        `/workspaces/${workspaceId}/insights/developers/${developerId}/commits`,
        { params },
      );
      return response.data;
    },
    enabled,
    staleTime: 30 * 1000,
  });

  return (
    <section className="bg-card rounded-xl border border-border overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <GitCommit className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">
            Synced commits
          </h3>
          {data && (
            <span className="text-xs text-muted-foreground">
              {data.total === data.commits.length
                ? `${data.total}`
                : `${data.commits.length} of ${data.total}`}
            </span>
          )}
        </div>
        {data && data.commits.length < data.total && (
          <span className="text-[11px] text-muted-foreground">
            Showing newest {data.commits.length}. Narrow the period to see older
            commits.
          </span>
        )}
      </header>

      {isLoading && (
        <div className="p-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-8 rounded bg-muted/60 animate-pulse"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="p-4 text-sm text-destructive">
          Failed to load commits: {(error as Error).message}
        </div>
      )}

      {data && data.commits.length === 0 && (
        <div className="p-6 text-sm text-muted-foreground text-center">
          No commits attributed to this developer in this period.
          {" "}
          The aggregate metrics above may still reflect activity via the
          alias map.
        </div>
      )}

      {data && data.commits.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground uppercase">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Repo</th>
                <th className="px-4 py-2 font-medium">Message</th>
                <th className="px-4 py-2 font-medium text-right">
                  +/-
                </th>
                <th className="px-4 py-2 font-medium">Author identity</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.commits.map((c) => {
                const committed = c.committed_at
                  ? new Date(c.committed_at)
                  : null;
                const isExternal = c.author_class === "external";
                const isBot = c.author_class === "bot";
                const isAlias = !c.author_github_login;
                return (
                  <tr
                    key={c.id}
                    className="hover:bg-accent/30 transition"
                  >
                    <td className="px-4 py-2 text-xs whitespace-nowrap text-muted-foreground">
                      {committed
                        ? committed.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs whitespace-nowrap font-mono text-muted-foreground">
                      {c.repository.split("/").pop()}
                    </td>
                    <td className="px-4 py-2 text-sm text-foreground min-w-[280px]">
                      <div className="flex items-center gap-2">
                        <code className="text-[11px] text-muted-foreground font-mono">
                          {c.sha.slice(0, 7)}
                        </code>
                        <span className="truncate" title={c.message}>
                          {c.message || <em className="text-muted-foreground">no message</em>}
                        </span>
                        {c.is_merge && (
                          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            merge
                          </span>
                        )}
                        {c.change_class === "docs_only" && (
                          <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            docs
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs whitespace-nowrap font-mono text-right">
                      <span className="text-emerald-600 dark:text-emerald-400">
                        +{formatBytes(c.additions)}
                      </span>{" "}
                      <span className="text-red-600 dark:text-red-400">
                        -{formatBytes(c.deletions)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs whitespace-nowrap text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        {c.author_github_login ? (
                          <span className="font-mono">
                            @{c.author_github_login}
                          </span>
                        ) : (
                          <span className="font-mono italic">
                            {c.author_email ?? "no login"}
                          </span>
                        )}
                        {isBot && (
                          <span className="rounded-md bg-muted px-1 py-0.5 text-[10px]">
                            bot
                          </span>
                        )}
                        {isExternal && (
                          <span className="rounded-md bg-muted px-1 py-0.5 text-[10px]">
                            external
                          </span>
                        )}
                        {isAlias && !isBot && (
                          <span
                            className="rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1 py-0.5 text-[10px]"
                            title="No GitHub login on this commit — attributed via email. Manage aliases on /settings/identity."
                          >
                            alias
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {c.html_url && (
                        <a
                          href={c.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-muted-foreground hover:text-foreground"
                          title="Open on GitHub"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
