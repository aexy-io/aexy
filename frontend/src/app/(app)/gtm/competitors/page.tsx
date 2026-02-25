"use client";

import { useState } from "react";
import Link from "next/link";
import { Swords, Plus, Loader2, RefreshCw, ExternalLink, X } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMCompetitors, useGTMCompetitorChanges } from "@/hooks/useGTM";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { gtmApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const SEVERITY_STYLES: Record<string, string> = {
  critical:  "bg-red-500/20 text-red-400 border-red-500/30",
  important: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  info:      "bg-zinc-500/20 text-muted-foreground border-zinc-500/30",
};

const CHANGE_TYPE_STYLES: Record<string, string> = {
  pricing:   "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  feature:   "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  content:   "bg-blue-500/20 text-blue-400 border-blue-500/30",
  job:       "bg-violet-500/20 text-violet-400 border-violet-500/30",
  design:    "bg-pink-500/20 text-pink-400 border-pink-500/30",
};

export default function CompetitorsPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const queryClient = useQueryClient();

  const [changesPage, setChangesPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDomain, setFormDomain] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { competitors, isLoading: competitorsLoading } = useGTMCompetitors(workspaceId);
  const { changes, total, isLoading: changesLoading } = useGTMCompetitorChanges(workspaceId, {
    page: changesPage,
  });

  const PER_PAGE = 20;
  const totalPages = Math.ceil(total / PER_PAGE);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <Swords className="w-7 h-7 text-indigo-400" />
              Competitors
            </h1>
            <p className="text-muted-foreground mt-1">Competitor intelligence and change monitoring</p>
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
              onClick={() => { setShowModal(true); setFormName(""); setFormDomain(""); setFormError(null); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Competitor
            </button>
          </div>
        </div>

        {/* Competitor Grid */}
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Tracked Competitors
        </h2>
        {competitorsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        ) : competitors.length === 0 ? (
          <div className="bg-muted/50 border border-border rounded-xl p-12 text-center mb-8">
            <Swords className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No competitors tracked yet</p>
            <p className="text-muted-foreground text-sm mt-1">Add a competitor to start monitoring their changes.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
            {competitors.map((comp: any) => (
              <Link
                key={comp.id}
                href={`/gtm/competitors/${comp.id}`}
                className="bg-muted/50 border border-border rounded-xl p-5 hover:border-border transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-foreground font-semibold group-hover:text-indigo-400 transition-colors">
                    {comp.name}
                  </h3>
                  {comp.is_active ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-zinc-500/20 text-muted-foreground border border-zinc-500/30">
                      Inactive
                    </span>
                  )}
                </div>
                {comp.domain && (
                  <div className="flex items-center gap-1 text-muted-foreground text-xs mb-3">
                    <ExternalLink className="w-3 h-3" />
                    {comp.domain}
                  </div>
                )}
                <p className="text-muted-foreground text-xs">
                  {(comp.tracked_pages ?? []).length} tracked page
                  {(comp.tracked_pages ?? []).length !== 1 ? "s" : ""}
                </p>
              </Link>
            ))}
          </div>
        )}

        {/* Recent Changes */}
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Recent Changes
        </h2>
        {changesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        ) : (
          <div className="bg-muted/50 border border-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    {["Competitor", "Change Type", "Title", "Severity", "Detected"].map((h) => (
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
                  {changes.map((ch: any) => (
                    <tr key={ch.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-foreground font-medium">
                        {ch.competitor_name ?? ch.competitor_id?.slice(0, 8) ?? "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                            CHANGE_TYPE_STYLES[ch.change_type] ??
                            "bg-zinc-500/20 text-muted-foreground border-zinc-500/30"
                          }`}
                        >
                          {ch.change_type?.replace(/_/g, " ") ?? "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground max-w-xs truncate">
                        {ch.title ?? "—"}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                            SEVERITY_STYLES[ch.severity] ?? SEVERITY_STYLES.info
                          }`}
                        >
                          {ch.severity ?? "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {ch.detected_at ? new Date(ch.detected_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {changes.length === 0 && (
              <div className="px-6 py-12 text-center">
                <p className="text-muted-foreground font-medium">No changes detected yet</p>
                <p className="text-muted-foreground text-sm mt-1">
                  Changes are captured automatically from tracked competitor pages.
                </p>
              </div>
            )}

            {totalPages > 1 && (
              <div className="px-6 py-3 border-t border-border/50 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Page {changesPage} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setChangesPage((p) => Math.max(1, p - 1))}
                    disabled={changesPage <= 1}
                    className="p-1.5 rounded bg-muted/50 hover:bg-muted disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => setChangesPage((p) => Math.min(totalPages, p + 1))}
                    disabled={changesPage >= totalPages}
                    className="p-1.5 rounded bg-muted/50 hover:bg-muted disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Add Competitor Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="relative bg-background border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">Add Competitor</h2>
                <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Company Name</label>
                  <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Acme Corp" className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Domain</label>
                  <input value={formDomain} onChange={(e) => setFormDomain(e.target.value)} placeholder="e.g. acme.com" className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
                {formError && <p className="text-sm text-red-400">{formError}</p>}
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                <button
                  disabled={!formName.trim() || creating}
                  onClick={async () => {
                    if (!workspaceId || !formName.trim()) return;
                    setCreating(true);
                    setFormError(null);
                    try {
                      await gtmApi.competitors.create(workspaceId, { name: formName.trim(), domain: formDomain.trim() || undefined, is_active: true });
                      queryClient.invalidateQueries({ queryKey: ["gtmCompetitors", workspaceId] });
                      setShowModal(false);
                    } catch {
                      setFormError("Failed to add competitor");
                    } finally {
                      setCreating(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Add Competitor
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
