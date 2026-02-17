"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FolderGit2,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  Code,
  Lock,
  ArrowUpDown,
} from "lucide-react";
import { useRepositoryDetail } from "@/hooks/useInsights";
import { InsightsPeriodType, RepositoryDeveloperBreakdown } from "@/lib/api";

const PERIOD_OPTIONS: { value: InsightsPeriodType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "sprint", label: "Sprint" },
];

type SortField = "commits_count" | "prs_merged" | "lines_changed" | "reviews_given";

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

export default function RepositoryDetailPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();
  const params = useParams();
  const repoName = decodeURIComponent(params.repoName as string);
  const [periodType, setPeriodType] = useState<InsightsPeriodType>("weekly");
  const [sortField, setSortField] = useState<SortField>("commits_count");
  const [sortAsc, setSortAsc] = useState(false);

  const { repositoryDetail, isLoading } = useRepositoryDetail(
    currentWorkspaceId,
    repoName,
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

  const agg = repositoryDetail?.aggregate;
  const breakdown = repositoryDetail?.developer_breakdown || [];

  const sorted = [...breakdown].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    return sortAsc ? aVal - bVal : bVal - aVal;
  });

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  }

  function SortHeader({
    field,
    label,
    icon: Icon,
  }: {
    field: SortField;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }) {
    return (
      <button
        onClick={() => handleSort(field)}
        className="inline-flex items-center gap-1 hover:text-foreground transition"
      >
        <Icon className="h-3 w-3" />
        {label}
        {sortField === field && (
          <ArrowUpDown className="h-3 w-3 text-indigo-400" />
        )}
      </button>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/insights/repositories"
            className="text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FolderGit2 className="h-6 w-6 text-indigo-400" />
              {repoName}
              {agg?.is_private && <Lock className="h-4 w-4 text-muted-foreground" />}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              {agg?.language && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-accent text-foreground">
                  {agg.language}
                </span>
              )}
              <span className="text-muted-foreground text-sm">
                {agg?.unique_contributors || 0} contributors
              </span>
            </div>
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

      {/* Aggregate Stats Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 bg-muted rounded-xl animate-pulse border border-border"
            />
          ))}
        </div>
      ) : agg ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase mb-2">
              <GitCommit className="h-4 w-4" /> Commits
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">
              {formatNumber(agg.commits_count)}
            </div>
          </div>
          <div className="bg-muted rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase mb-2">
              <GitPullRequest className="h-4 w-4" /> PRs Merged
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">
              {formatNumber(agg.prs_merged)}
            </div>
          </div>
          <div className="bg-muted rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase mb-2">
              <MessageSquare className="h-4 w-4" /> Reviews
            </div>
            <div className="text-2xl font-bold font-mono text-foreground">
              {formatNumber(agg.reviews_count)}
            </div>
          </div>
          <div className="bg-muted rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase mb-2">
              <Code className="h-4 w-4" /> Lines Changed
            </div>
            <div className="text-lg font-bold font-mono text-foreground">
              <span className="text-green-400">+{formatNumber(agg.lines_added)}</span>
              {" / "}
              <span className="text-red-400">-{formatNumber(agg.lines_removed)}</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Developer Breakdown */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Developer Breakdown</h2>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-14 bg-muted rounded-xl animate-pulse border border-border"
              />
            ))}
          </div>
        ) : sorted.length > 0 ? (
          <div className="bg-muted rounded-xl border border-border overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Developer
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                    <SortHeader field="commits_count" label="Commits" icon={GitCommit} />
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                    <SortHeader field="prs_merged" label="PRs Merged" icon={GitPullRequest} />
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                    <SortHeader field="reviews_given" label="Reviews" icon={MessageSquare} />
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                    <SortHeader field="lines_changed" label="Lines" icon={Code} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {sorted.map((dev) => (
                  <tr key={dev.developer_id} className="hover:bg-accent/30 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/insights/developers/${dev.developer_id}`}
                          className="text-sm font-medium text-foreground hover:text-indigo-300 transition"
                        >
                          {dev.developer_name || dev.developer_id.slice(0, 12)}
                        </Link>
                        {!dev.is_workspace_member && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">
                            External
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-foreground">
                      {dev.commits_count}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-foreground">
                      {dev.prs_merged}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-foreground">
                      {dev.reviews_given}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-foreground">
                      <span className="text-green-400">+{formatNumber(dev.lines_added)}</span>
                      {" / "}
                      <span className="text-red-400">-{formatNumber(dev.lines_removed)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-muted rounded-xl p-8 border border-border text-center">
            <p className="text-muted-foreground">
              No developer activity found for this repository.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
