"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FolderGit2,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  Users,
  Code,
  Lock,
} from "lucide-react";
import { useRepositoryInsights } from "@/hooks/useInsights";
import { InsightsPeriodType } from "@/lib/api";

const PERIOD_OPTIONS: { value: InsightsPeriodType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "sprint", label: "Sprint" },
];

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

export default function RepositoriesPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const router = useRouter();
  const [periodType, setPeriodType] = useState<InsightsPeriodType>("weekly");

  const { repositoryInsights, isLoading } = useRepositoryInsights(
    currentWorkspaceId,
    { period_type: periodType }
  );

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect("/");
  }

  const repos = repositoryInsights?.repositories || [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/insights"
            className="text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FolderGit2 className="h-6 w-6 text-indigo-400" />
              Repositories
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Activity breakdown by repository
            </p>
          </div>
        </div>
        <div className="flex bg-muted rounded-lg border border-border overflow-hidden">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriodType(opt.value)}
              className={`px-3 py-1.5 text-sm font-medium transition ${
                periodType === opt.value
                  ? "bg-indigo-600 text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      {repositoryInsights && (
        <div className="text-sm text-muted-foreground">
          {repositoryInsights.total_repositories} repositories with activity
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-16 bg-muted rounded-xl animate-pulse border border-border"
            />
          ))}
        </div>
      ) : repos.length > 0 ? (
        <div className="bg-muted rounded-xl border border-border overflow-hidden overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Repository
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                  <span className="inline-flex items-center gap-1"><GitCommit className="h-3 w-3" /> Commits</span>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                  <span className="inline-flex items-center gap-1"><GitPullRequest className="h-3 w-3" /> PRs Merged</span>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                  <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Reviews</span>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                  <span className="inline-flex items-center gap-1"><Code className="h-3 w-3" /> Lines</span>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                  <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> Contributors</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {repos.map((repo) => (
                <tr
                  key={repo.repository}
                  onClick={() =>
                    router.push(
                      `/insights/repositories/${encodeURIComponent(repo.repository)}`
                    )
                  }
                  className="hover:bg-accent/30 cursor-pointer transition"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {repo.repository}
                      </span>
                      {repo.is_private && (
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      )}
                      {repo.language && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-accent text-foreground">
                          {repo.language}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-foreground">
                    {formatNumber(repo.commits_count)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-foreground">
                    {formatNumber(repo.prs_merged)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-foreground">
                    {formatNumber(repo.reviews_count)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-foreground">
                    <span className="text-green-400">+{formatNumber(repo.lines_added)}</span>
                    {" / "}
                    <span className="text-red-400">-{formatNumber(repo.lines_removed)}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-foreground">
                    {repo.unique_contributors}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-muted rounded-xl p-8 border border-border text-center">
          <FolderGit2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">
            No repository activity found for this period.
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            Enable repositories and sync data to see insights here.
          </p>
        </div>
      )}
    </div>
  );
}
