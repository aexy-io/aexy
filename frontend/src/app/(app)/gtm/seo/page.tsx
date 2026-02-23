"use client";

import { useState } from "react";
import { Globe, Plus, Loader2, RefreshCw, BarChart2 } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMSEOAudits } from "@/hooks/useGTM";
import { ChevronLeft, ChevronRight } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  pending:   "bg-amber-500/20 text-amber-400 border-amber-500/30",
  running:   "bg-blue-500/20 text-blue-400 border-blue-500/30",
  completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  failed:    "bg-red-500/20 text-red-400 border-red-500/30",
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(Math.max(score, 0), 100);
  const color =
    pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-white/10 rounded-full h-2">
        <div
          className={`${color} h-2 rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm text-zinc-300 font-mono w-8 text-right">{score}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
        STATUS_STYLES[status] ?? "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
      }`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function SEOAuditPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;

  const [page, setPage] = useState(1);

  const { audits, total, isLoading } = useGTMSEOAudits(workspaceId, { page });

  const PER_PAGE = 25;
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Globe className="w-7 h-7 text-indigo-400" />
              SEO Audit
            </h1>
            <p className="text-zinc-400 mt-1">Technical SEO audits and site health scores</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 rounded-lg text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" />
              New Audit
            </button>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-400 text-sm">
                <BarChart2 className="w-4 h-4" />
                {total} audit{total !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Domain", "Target URL", "Score", "Status", "Pages Crawled", "Duration", "Created"].map(
                      (h) => (
                        <th
                          key={h}
                          className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {audits.map((audit: any) => (
                    <tr key={audit.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 text-sm text-white font-medium">
                        {audit.domain ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-400 max-w-xs">
                        <span
                          className="block truncate"
                          title={audit.target_url}
                        >
                          {audit.target_url ?? "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {audit.overall_score != null ? (
                          <ScoreBar score={audit.overall_score} />
                        ) : (
                          <span className="text-zinc-600 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={audit.status ?? "pending"} />
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-300 font-mono">
                        {audit.pages_crawled?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-400 font-mono">
                        {formatDuration(audit.duration_seconds)}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-500">
                        {audit.created_at
                          ? new Date(audit.created_at).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {audits.length === 0 && (
              <div className="px-6 py-12 text-center">
                <Globe className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400 font-medium">No SEO audits yet</p>
                <p className="text-zinc-500 text-sm mt-1">
                  Run your first audit to get a technical SEO health score.
                </p>
              </div>
            )}

            {totalPages > 1 && (
              <div className="px-6 py-3 border-t border-white/5 flex items-center justify-between">
                <span className="text-sm text-zinc-500">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-zinc-400" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded bg-white/5 hover:bg-white/10 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
