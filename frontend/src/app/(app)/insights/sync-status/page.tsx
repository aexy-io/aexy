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
      bg: "bg-slate-500/10",
      text: "text-slate-400",
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

  const totalCommits = developer.repositories.reduce((s, r) => s + r.commits_synced, 0);
  const totalPRs = developer.repositories.reduce((s, r) => s + r.prs_synced, 0);
  const totalReviews = developer.repositories.reduce((s, r) => s + r.reviews_synced, 0);
  const enabledCount = developer.repositories.filter((r) => r.is_enabled).length;
  const failedCount = developer.repositories.filter((r) => r.sync_status === "failed").length;

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center gap-4 hover:bg-slate-700/30 transition text-left"
      >
        <span className="text-slate-400">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-white">
            {developer.developer_name || developer.developer_id.slice(0, 12)}
          </span>
          <span className="text-xs text-slate-500 ml-2">
            {enabledCount} repos enabled
            {failedCount > 0 && (
              <span className="text-red-400 ml-1">({failedCount} failed)</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400 shrink-0">
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
        <div className="border-t border-slate-700">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-slate-700/50">
                <th className="px-4 py-2 text-xs font-medium text-slate-500 uppercase pl-12">
                  Repository
                </th>
                <th className="px-4 py-2 text-xs font-medium text-slate-500 uppercase text-center">
                  Status
                </th>
                <th className="px-4 py-2 text-xs font-medium text-slate-500 uppercase text-right">
                  Commits
                </th>
                <th className="px-4 py-2 text-xs font-medium text-slate-500 uppercase text-right">
                  PRs
                </th>
                <th className="px-4 py-2 text-xs font-medium text-slate-500 uppercase text-right">
                  Reviews
                </th>
                <th className="px-4 py-2 text-xs font-medium text-slate-500 uppercase text-right">
                  Last Sync
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {developer.repositories.map((repo) => (
                <tr key={repo.repository_id} className="hover:bg-slate-700/20 transition">
                  <td className="px-4 py-2 pl-12">
                    <span className="text-sm text-white">{repo.repository_full_name}</span>
                    {!repo.is_enabled && (
                      <span className="text-xs text-slate-500 ml-1">(disabled)</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <StatusBadge status={repo.sync_status} />
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-mono text-slate-300">
                    {repo.commits_synced.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-mono text-slate-300">
                    {repo.prs_synced.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-mono text-slate-300">
                    {repo.reviews_synced.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-slate-400">
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
        <div className="border-t border-slate-700 px-4 py-4 pl-12 text-sm text-slate-500">
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

  const developers = syncStatus?.developers || [];

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
              <RefreshCw className="h-6 w-6 text-indigo-400" />
              Sync Status
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Data sync status per developer and repository
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-slate-800 text-slate-300 rounded-lg border border-slate-700 hover:text-white hover:border-slate-600 transition"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Summary */}
      {syncStatus && (
        <div className="text-sm text-slate-400">
          {syncStatus.total_developers} developers
        </div>
      )}

      {/* Developer List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 bg-slate-800 rounded-xl animate-pulse border border-slate-700"
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
        <div className="bg-slate-800 rounded-xl p-8 border border-slate-700 text-center">
          <RefreshCw className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No developers found in this workspace.</p>
        </div>
      )}
    </div>
  );
}
