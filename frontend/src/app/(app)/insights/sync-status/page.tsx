"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  GitCommit,
  GitPullRequest,
  MessageSquare,
} from "lucide-react";
import { useSyncStatus } from "@/hooks/useInsights";
import { DeveloperSyncStatusData, RepositorySyncInfo } from "@/lib/api";

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    synced: {
      bg: "bg-green-500/10",
      text: "text-green-400",
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: "Synced",
    },
    syncing: {
      bg: "bg-yellow-500/10",
      text: "text-yellow-400",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Syncing",
    },
    failed: {
      bg: "bg-red-500/10",
      text: "text-red-400",
      icon: <AlertCircle className="h-3 w-3" />,
      label: "Failed",
    },
    pending: {
      bg: "bg-muted/10",
      text: "text-muted-foreground",
      icon: <Clock className="h-3 w-3" />,
      label: "Pending",
    },
  };

  const c = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DeveloperRow({ developer }: { developer: DeveloperSyncStatusData }) {
  const [expanded, setExpanded] = useState(false);

  // Sort repos: enabled first, then by commits_synced descending
  const sortedRepos = [...developer.repositories].sort((a, b) => {
    if (a.is_enabled !== b.is_enabled) return a.is_enabled ? -1 : 1;
    return b.commits_synced - a.commits_synced;
  });

  const totalCommits = developer.repositories.reduce((s, r) => s + r.commits_synced, 0);
  const totalPRs = developer.repositories.reduce((s, r) => s + r.prs_synced, 0);
  const totalReviews = developer.repositories.reduce((s, r) => s + r.reviews_synced, 0);
  const enabledCount = developer.repositories.filter((r) => r.is_enabled).length;
  const failedCount = developer.repositories.filter((r) => r.sync_status === "failed").length;

  return (
    <div className="bg-muted rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-4 hover:bg-accent/30 transition text-left"
      >
        <span className="text-muted-foreground">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground">
            {developer.developer_name || developer.developer_id.slice(0, 12)}
          </span>
          {!developer.is_workspace_member && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium ml-2">
              External
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-2">
            {enabledCount} repos enabled
            {failedCount > 0 && (
              <span className="text-red-400 ml-1">({failedCount} failed)</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
          <span className="inline-flex items-center gap-1">
            <GitCommit className="h-3 w-3" /> {totalCommits.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1">
            <GitPullRequest className="h-3 w-3" /> {totalPRs.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> {totalReviews.toLocaleString()}
          </span>
        </div>
      </button>

      {expanded && developer.repositories.length > 0 && (
        <div className="border-t border-border overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="text-left border-b border-border/50">
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase pl-12">
                  Repository
                </th>
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase text-center">
                  Status
                </th>
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase text-right">
                  Commits
                </th>
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase text-right">
                  PRs
                </th>
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase text-right">
                  Reviews
                </th>
                <th className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase text-right">
                  Last Sync
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {sortedRepos.map((repo) => (
                <tr key={repo.repository_id} className="hover:bg-accent/20 transition">
                  <td className="px-4 py-2 pl-12">
                    <span className="text-sm text-foreground">{repo.repository_full_name}</span>
                    {!repo.is_enabled && (
                      <span className="text-xs text-muted-foreground ml-1">(disabled)</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <StatusBadge status={repo.sync_status} />
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-mono text-foreground">
                    {repo.commits_synced.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-mono text-foreground">
                    {repo.prs_synced.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-mono text-foreground">
                    {repo.reviews_synced.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                    {formatDate(repo.last_sync_at)}
                    {repo.sync_error && (
                      <div className="text-red-400 mt-0.5 truncate max-w-[200px]" title={repo.sync_error}>
                        {repo.sync_error}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {expanded && developer.repositories.length === 0 && (
        <div className="border-t border-border px-4 py-4 pl-12 text-sm text-muted-foreground">
          No repositories linked.
        </div>
      )}
    </div>
  );
}

export default function SyncStatusPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const { currentWorkspaceId } = useWorkspace();

  const { syncStatus, isLoading, refetch } = useSyncStatus(currentWorkspaceId);

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

  // Sort developers: those with enabled repos first, then by total synced data
  const developers = [...(syncStatus?.developers || [])].sort((a, b) => {
    const aEnabled = a.repositories.some((r) => r.is_enabled);
    const bEnabled = b.repositories.some((r) => r.is_enabled);
    if (aEnabled !== bEnabled) return aEnabled ? -1 : 1;
    const aTotal = a.repositories.reduce((s, r) => s + r.commits_synced, 0);
    const bTotal = b.repositories.reduce((s, r) => s + r.commits_synced, 0);
    return bTotal - aTotal;
  });

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
              <RefreshCw className="h-6 w-6 text-indigo-400" />
              Sync Status
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Data sync status per developer and repository
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-muted text-foreground rounded-lg border border-border hover:text-foreground hover:border-border transition"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Summary */}
      {syncStatus && (
        <div className="text-sm text-muted-foreground">
          {syncStatus.total_developers} developers
        </div>
      )}

      {/* Developer List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 bg-muted rounded-xl animate-pulse border border-border"
            />
          ))}
        </div>
      ) : developers.length > 0 ? (
        <div className="space-y-2">
          {developers.map((dev) => (
            <DeveloperRow key={dev.developer_id} developer={dev} />
          ))}
        </div>
      ) : (
        <div className="bg-muted rounded-xl p-8 border border-border text-center">
          <RefreshCw className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No developers found in this workspace.</p>
        </div>
      )}
    </div>
  );
}
