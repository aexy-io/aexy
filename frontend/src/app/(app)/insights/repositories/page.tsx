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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/insights"
            className="text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <FolderGit2 className="h-6 w-6 text-indigo-400" />
              Repositories
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Activity breakdown by repository
            </p>
          </div>
        </div>
        <div className="flex bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriodType(opt.value)}
              className={`px-3 py-1.5 text-sm font-medium transition ${
                periodType === opt.value
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      {repositoryInsights && (
        <div className="text-sm text-slate-400">
          {repositoryInsights.total_repositories} repositories with activity
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-16 bg-slate-800 rounded-xl animate-pulse border border-slate-700"
            />
          ))}
        </div>
      ) : repos.length > 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 text-left">
                <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Repository
                </th>
                <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider text-right">
                  <span className="inline-flex items-center gap-1"><GitCommit className="h-3 w-3" /> Commits</span>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider text-right">
                  <span className="inline-flex items-center gap-1"><GitPullRequest className="h-3 w-3" /> PRs Merged</span>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider text-right">
                  <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Reviews</span>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider text-right">
                  <span className="inline-flex items-center gap-1"><Code className="h-3 w-3" /> Lines</span>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider text-right">
                  <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> Contributors</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {repos.map((repo) => (
                <tr
                  key={repo.repository}
                  onClick={() =>
                    router.push(
                      `/insights/repositories/${encodeURIComponent(repo.repository)}`
                    )
                  }
                  className="hover:bg-slate-700/30 cursor-pointer transition"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {repo.repository}
                      </span>
                      {repo.is_private && (
                        <Lock className="h-3 w-3 text-slate-500" />
                      )}
                      {repo.language && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                          {repo.language}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-white">
                    {formatNumber(repo.commits_count)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-white">
                    {formatNumber(repo.prs_merged)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-white">
                    {formatNumber(repo.reviews_count)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-white">
                    <span className="text-green-400">+{formatNumber(repo.lines_added)}</span>
                    {" / "}
                    <span className="text-red-400">-{formatNumber(repo.lines_removed)}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-mono text-white">
                    {repo.unique_contributors}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
          <FolderGit2 className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">
            No repository activity found for this period.
          </p>
          <p className="text-slate-500 text-sm mt-1">
            Enable repositories and sync data to see insights here.
          </p>
        </div>
      )}
    </div>
  );
}
