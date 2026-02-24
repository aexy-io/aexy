"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FolderGit2,
  Lock,
} from "lucide-react";
import { useRepositoryInsights } from "@/hooks/useInsights";
import { InsightsPeriodType, RepositoryInsightsSummary } from "@/lib/api";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";

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

  const columns = useMemo<DataTableColumn<RepositoryInsightsSummary>[]>(() => [
    {
      id: "repository",
      header: "Repository",
      cell: (repo) => (
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
      ),
      sortValue: (repo) => repo.repository,
    },
    {
      id: "commits",
      header: "Commits",
      cell: (repo) => <span className="font-mono">{formatNumber(repo.commits_count)}</span>,
      sortValue: (repo) => repo.commits_count,
      headerClassName: "text-right",
      cellClassName: "text-right",
    },
    {
      id: "prs",
      header: "PRs Merged",
      cell: (repo) => <span className="font-mono">{formatNumber(repo.prs_merged)}</span>,
      sortValue: (repo) => repo.prs_merged,
      headerClassName: "text-right",
      cellClassName: "text-right",
    },
    {
      id: "reviews",
      header: "Reviews",
      cell: (repo) => <span className="font-mono">{formatNumber(repo.reviews_count)}</span>,
      sortValue: (repo) => repo.reviews_count,
      headerClassName: "text-right",
      cellClassName: "text-right",
    },
    {
      id: "lines",
      header: "Lines",
      cell: (repo) => (
        <span className="font-mono">
          <span className="text-green-400">+{formatNumber(repo.lines_added)}</span>
          {" / "}
          <span className="text-red-400">-{formatNumber(repo.lines_removed)}</span>
        </span>
      ),
      sortValue: (repo) => repo.lines_added + repo.lines_removed,
      headerClassName: "text-right",
      cellClassName: "text-right",
    },
    {
      id: "contributors",
      header: "Contributors",
      cell: (repo) => <span className="font-mono">{repo.unique_contributors}</span>,
      sortValue: (repo) => repo.unique_contributors,
      headerClassName: "text-right",
      cellClassName: "text-right",
    },
  ], []);

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
      <DataTable
        columns={columns}
        data={repos}
        rowKey={(repo) => repo.repository}
        onRowClick={(repo) =>
          router.push(`/insights/repositories/${encodeURIComponent(repo.repository)}`)
        }
        isLoading={isLoading}
        skeletonRows={8}
        emptyIcon={<FolderGit2 className="h-12 w-12" />}
        emptyTitle="No repository activity found for this period"
        emptyDescription="Enable repositories and sync data to see insights here."
      />
    </div>
  );
}
