"use client";

import { useState } from "react";
import { FileSearch, Plus, Loader2, RefreshCw } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMContentAnalyses } from "@/hooks/useGTM";
import { ChevronLeft, ChevronRight } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  pending:   "bg-amber-500/20 text-amber-400 border-amber-500/30",
  running:   "bg-blue-500/20 text-blue-400 border-blue-500/30",
  completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  failed:    "bg-red-500/20 text-red-400 border-red-500/30",
};

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

export default function ContentGapPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;

  const [page, setPage] = useState(1);

  const { analyses, total, isLoading } = useGTMContentAnalyses(workspaceId, { page });

  const PER_PAGE = 25;
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <FileSearch className="w-7 h-7 text-indigo-400" />
              Content Gaps
            </h1>
            <p className="text-zinc-400 mt-1">
              Identify content opportunities vs. competitor coverage
            </p>
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
              New Analysis
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
            <div className="px-6 py-4 border-b border-white/10">
              <span className="text-sm text-zinc-400">
                {total} analys{total !== 1 ? "es" : "is"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    {[
                      "Our Domain",
                      "Competitors",
                      "Status",
                      "Gaps",
                      "Opportunities",
                      "Pages Analyzed",
                      "Created",
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {analyses.map((analysis: any) => (
                    <tr key={analysis.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 text-sm text-white font-medium">
                        {analysis.our_domain ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-300 font-mono">
                        {Array.isArray(analysis.competitors)
                          ? analysis.competitors.length
                          : analysis.competitor_count ?? "—"}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={analysis.status ?? "pending"} />
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-300 font-mono">
                        {analysis.gaps_count?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-emerald-400 font-mono">
                        {analysis.opportunities_count?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-400 font-mono">
                        {analysis.pages_analyzed?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-500">
                        {analysis.created_at
                          ? new Date(analysis.created_at).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {analyses.length === 0 && (
              <div className="px-6 py-12 text-center">
                <FileSearch className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400 font-medium">No content gap analyses yet</p>
                <p className="text-zinc-500 text-sm mt-1">
                  Run an analysis to discover topics your competitors cover that you don't.
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
