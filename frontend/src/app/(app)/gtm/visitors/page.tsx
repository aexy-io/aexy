"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  Search,
} from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMVisitors } from "@/hooks/useGTM";
import { IdentificationStatus } from "@/lib/api";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "anonymous", label: "Anonymous" },
  { value: "identified", label: "Identified" },
  { value: "resolved", label: "Resolved" },
];

function StatusBadge({ status }: { status: IdentificationStatus }) {
  const styles: Record<string, string> = {
    identified: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    anonymous: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
    resolved: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    failed: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
        styles[status] || styles.anonymous
      }`}
    >
      {status}
    </span>
  );
}

function truncateId(id: string, maxLen: number = 12): string {
  if (id.length <= maxLen) return id;
  return `${id.slice(0, maxLen)}...`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}

function formatLastSeen(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function GTMVisitorsPage() {
  const { currentWorkspace } = useWorkspace();
  const router = useRouter();
  const workspaceId = currentWorkspace?.id || null;
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  const { sessions, total, perPage, isLoading, error, refetch } =
    useGTMVisitors(workspaceId, {
      status: statusFilter === "all" ? undefined : statusFilter,
      page,
    });

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  function handleRowClick(sessionId: string) {
    router.push(`/gtm/visitors/${sessionId}`);
  }

  if (isLoading && sessions.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <span className="text-zinc-400 text-sm">
            Loading visitor sessions...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="bg-white/5 border border-red-500/20 rounded-xl p-8 max-w-md text-center">
          <p className="text-red-400 font-medium mb-2">
            Failed to load visitor sessions
          </p>
          <p className="text-zinc-500 text-sm mb-4">
            {(error as Error).message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-lg text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/gtm"
              className="flex items-center justify-center w-9 h-9 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-zinc-400" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <Users className="w-7 h-7 text-indigo-400" />
                Visitor Sessions
              </h1>
              <p className="text-zinc-400 mt-1">
                {total.toLocaleString()} total sessions tracked.
              </p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 rounded-lg text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Filter Bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by company or anonymous ID..."
              className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-colors"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="appearance-none pl-9 pr-8 py-2.5 bg-white/5 border border-white/10 rounded-lg text-zinc-300 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-colors cursor-pointer"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">
                    Anonymous ID
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">
                    Company
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">
                    Pages
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">
                    Duration
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">
                    Status
                  </th>
                  <th className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3">
                    Last Seen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sessions.map((session) => (
                  <tr
                    key={session.id}
                    onClick={() => handleRowClick(session.id)}
                    className="hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <span className="text-zinc-300 text-sm font-mono">
                        {truncateId(session.anonymous_id)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-white text-sm font-medium">
                        {session.identified_company || (
                          <span className="text-zinc-600 italic">Unknown</span>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-zinc-300 text-sm">
                      {session.page_count}
                    </td>
                    <td className="px-6 py-4 text-zinc-400 text-sm">
                      {formatDuration(session.total_duration_seconds)}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={session.identification_status} />
                    </td>
                    <td className="px-6 py-4 text-zinc-400 text-sm">
                      {formatLastSeen(session.last_seen_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Empty State */}
          {sessions.length === 0 && !isLoading && (
            <div className="px-6 py-16 text-center">
              <Users className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400 font-medium mb-1">
                No visitor sessions found
              </p>
              <p className="text-zinc-600 text-sm">
                {statusFilter !== "all" || searchQuery
                  ? "Try adjusting your filters or search query."
                  : "Sessions will appear here once your tracking is configured."}
              </p>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
              <span className="text-zinc-500 text-sm">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 rounded-lg text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 rounded-lg text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
