"use client";

import { useState } from "react";
import { FileSearch, Plus, Loader2, RefreshCw, X } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMContentAnalyses } from "@/hooks/useGTM";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { gtmApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

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
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [formOurDomain, setFormOurDomain] = useState("");
  const [formCompetitorDomains, setFormCompetitorDomains] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
            <button
              onClick={() => { setShowModal(true); setFormOurDomain(""); setFormCompetitorDomains(""); setFormError(null); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
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
                        {Array.isArray(analysis.competitor_domains)
                          ? analysis.competitor_domains.length
                          : "—"}
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={analysis.status ?? "pending"} />
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground font-mono">
                        {Array.isArray(analysis.gaps)
                          ? analysis.gaps.length.toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-emerald-400 font-mono">
                        {Array.isArray(analysis.opportunities)
                          ? analysis.opportunities.length.toLocaleString()
                          : "—"}
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
        {/* New Analysis Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="relative bg-background border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">New Content Gap Analysis</h2>
                <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Your Domain</label>
                  <input value={formOurDomain} onChange={(e) => setFormOurDomain(e.target.value)} placeholder="e.g. yourcompany.com" className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Competitor Domains</label>
                  <textarea
                    value={formCompetitorDomains}
                    onChange={(e) => setFormCompetitorDomains(e.target.value)}
                    rows={3}
                    placeholder="One domain per line, e.g.&#10;competitor1.com&#10;competitor2.com"
                    className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Enter one domain per line</p>
                </div>
                {formError && <p className="text-sm text-red-400">{formError}</p>}
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                <button
                  disabled={!formOurDomain.trim() || !formCompetitorDomains.trim() || creating}
                  onClick={async () => {
                    if (!workspaceId || !formOurDomain.trim() || !formCompetitorDomains.trim()) return;
                    setCreating(true);
                    setFormError(null);
                    const domains = formCompetitorDomains.split("\n").map(d => d.trim()).filter(Boolean);
                    if (domains.length === 0) { setFormError("Add at least one competitor domain"); setCreating(false); return; }
                    try {
                      await gtmApi.contentGap.createAnalysis(workspaceId, { our_domain: formOurDomain.trim(), competitor_domains: domains });
                      queryClient.invalidateQueries({ queryKey: ["gtmContentAnalyses", workspaceId] });
                      setShowModal(false);
                    } catch {
                      setFormError("Failed to start analysis");
                    } finally {
                      setCreating(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Start Analysis
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
