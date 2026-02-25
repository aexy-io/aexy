"use client";

import { useState } from "react";
import { Globe, Plus, Loader2, RefreshCw, BarChart2, X } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMSEOAudits } from "@/hooks/useGTM";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { gtmApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

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
      <div className="w-20 bg-muted rounded-full h-2">
        <div
          className={`${color} h-2 rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm text-foreground font-mono w-8 text-right">{score}</span>
    </div>
  );
}

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

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function SEOAuditPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [formUrl, setFormUrl] = useState("");
  const [formMaxPages, setFormMaxPages] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { audits, total, isLoading } = useGTMSEOAudits(workspaceId, { page });

  const PER_PAGE = 25;
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <Globe className="w-7 h-7 text-indigo-400" />
              SEO Audit
            </h1>
            <p className="text-muted-foreground mt-1">Technical SEO audits and site health scores</p>
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
              onClick={() => { setShowModal(true); setFormUrl(""); setFormMaxPages(""); setFormError(null); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
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
          <div className="bg-muted/50 border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <BarChart2 className="w-4 h-4" />
                {total} audit{total !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    {["Domain", "Target URL", "Score", "Status", "Pages Crawled", "Duration", "Created"].map(
                      (h) => (
                        <th
                          key={h}
                          className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-3"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {audits.map((audit: any) => (
                    <tr key={audit.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-foreground font-medium">
                        {audit.domain ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground max-w-xs">
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
                      <td className="px-6 py-4 text-sm text-foreground font-mono">
                        {audit.pages_crawled?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground font-mono">
                        {formatDuration(audit.duration_seconds)}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
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
                <p className="text-muted-foreground font-medium">No SEO audits yet</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Run your first audit to get a technical SEO health score.
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
        {/* New Audit Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="relative bg-background border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">New SEO Audit</h2>
                <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Target URL</label>
                  <input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="e.g. https://example.com" className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Max Pages to Crawl</label>
                  <input type="number" value={formMaxPages} onChange={(e) => setFormMaxPages(e.target.value)} placeholder="Optional (default: unlimited)" className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
                {formError && <p className="text-sm text-red-400">{formError}</p>}
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                <button
                  disabled={!formUrl.trim() || creating}
                  onClick={async () => {
                    if (!workspaceId || !formUrl.trim()) return;
                    setCreating(true);
                    setFormError(null);
                    try {
                      await gtmApi.seo.createAudit(workspaceId, {
                        target_url: formUrl.trim(),
                        max_pages: formMaxPages ? parseInt(formMaxPages, 10) : undefined,
                      });
                      queryClient.invalidateQueries({ queryKey: ["gtmSEOAudits", workspaceId] });
                      setShowModal(false);
                    } catch {
                      setFormError("Failed to start audit");
                    } finally {
                      setCreating(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Start Audit
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
