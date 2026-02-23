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
        STATUS_STYLES[status] ?? "bg-zinc-500/20 text-muted-foreground border-zinc-500/30"
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
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <FileSearch className="w-7 h-7 text-indigo-400" />
              Content Gaps
            </h1>
            <p className="text-muted-foreground mt-1">
              Identify content opportunities vs. competitor coverage
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted border border-border text-foreground rounded-lg text-sm transition-colors"
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
          <div className="bg-muted/50 border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <span className="text-sm text-muted-foreground">
                {total} analys{total !== 1 ? "es" : "is"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
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
                        className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {analyses.map((analysis: any) => (
                    <tr key={analysis.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-foreground font-medium">
                        {analysis.our_domain ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground font-mono">
                        {Array.isArray(analysis.competitors)
                          ? analysis.competitors.length
                          : analysis.competitor_count ?? "—"}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={analysis.status ?? "pending"} />
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground font-mono">
                        {analysis.gaps_count?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-emerald-400 font-mono">
                        {analysis.opportunities_count?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground font-mono">
                        {analysis.pages_analyzed?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
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
                <p className="text-muted-foreground font-medium">No content gap analyses yet</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Run an analysis to discover topics your competitors cover that you don't.
                </p>
              </div>
            )}

            {totalPages > 1 && (
              <div className="px-6 py-3 border-t border-border/50 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1.5 rounded bg-muted/50 hover:bg-muted disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1.5 rounded bg-muted/50 hover:bg-muted disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
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
