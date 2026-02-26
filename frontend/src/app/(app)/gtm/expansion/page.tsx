"use client";

import { useState } from "react";
import { TrendingUp, Plus, Loader2, RefreshCw, DollarSign, X } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMExpansionPlaybooks, useGTMExpansionAnalytics } from "@/hooks/useGTM";
import { gtmApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const TYPE_COLORS: Record<string, string> = {
  upsell: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  cross_sell: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  renewal: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  adoption: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  draft: "bg-zinc-500/20 text-muted-foreground border-zinc-500/30",
  paused: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  archived: "bg-red-500/20 text-red-400 border-red-500/30",
};

function formatRevenue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

export default function ExpansionPage() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || null;
  const queryClient = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("upsell");
  const [formDescription, setFormDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { playbooks, isLoading: playbooksLoading, refetch: refetchPlaybooks } =
    useGTMExpansionPlaybooks(workspaceId);
  const { analytics, isLoading: analyticsLoading } =
    useGTMExpansionAnalytics(workspaceId);

  const isLoading = playbooksLoading || analyticsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <span className="text-muted-foreground text-sm">Loading expansion data...</span>
        </div>
      </div>
    );
  }

  const safePlaybooks = playbooks ?? [];
  const safeAnalytics = analytics ?? {
    active_playbooks: 0,
    total_enrollments: 0,
    total_conversions: 0,
    total_revenue: 0,
  };

  const activePlaybooks = safePlaybooks.filter((p: any) => p.status === "active").length;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <TrendingUp className="w-7 h-7 text-indigo-400" />
              Expansion Playbooks
            </h1>
            <p className="text-muted-foreground mt-1">
              Upsell, cross-sell, renewal, and adoption playbooks for revenue growth
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => refetchPlaybooks()}
              className="inline-flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted border border-border text-foreground rounded-lg text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={() => { setShowModal(true); setFormName(""); setFormType("upsell"); setFormDescription(""); setFormError(null); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Playbook
            </button>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <TrendingUp className="w-4 h-4" />
              Active Playbooks
            </div>
            <p className="text-3xl font-bold text-foreground">
              {safeAnalytics.active_playbooks ?? activePlaybooks}
            </p>
          </div>
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <RefreshCw className="w-4 h-4" />
              Total Enrollments
            </div>
            <p className="text-3xl font-bold text-foreground">
              {(safeAnalytics.total_enrollments ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Conversions
            </div>
            <p className="text-3xl font-bold text-emerald-400">
              {(safeAnalytics.total_conversions ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-muted/50 border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <DollarSign className="w-4 h-4 text-violet-400" />
              Revenue Generated
            </div>
            <p className="text-3xl font-bold text-violet-400">
              {formatRevenue(safeAnalytics.total_revenue ?? 0)}
            </p>
          </div>
        </div>

        {/* Playbooks Table */}
        <div className="bg-muted/50 border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Playbooks</h3>
            <span className="text-sm text-muted-foreground">{safePlaybooks.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50">
                  {[
                    "Name",
                    "Type",
                    "Status",
                    "Enrollments",
                    "Conversions",
                    "Revenue",
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
                {safePlaybooks.map((pb: any) => {
                  const convRate =
                    (pb.total_enrollments ?? 0) > 0
                      ? (((pb.conversion_count ?? 0) / pb.total_enrollments) * 100).toFixed(0)
                      : "0";
                  return (
                    <tr key={pb.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-foreground font-medium">
                        {pb.name}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            TYPE_COLORS[pb.playbook_type] ?? TYPE_COLORS.upsell
                          }`}
                        >
                          {pb.playbook_type?.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            STATUS_COLORS[pb.status] ?? STATUS_COLORS.draft
                          }`}
                        >
                          {pb.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground font-mono">
                        {(pb.total_enrollments ?? 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-foreground font-mono">
                            {(pb.conversion_count ?? 0).toLocaleString()}
                          </span>
                          {(pb.total_enrollments ?? 0) > 0 && (
                            <span className="text-xs text-muted-foreground">
                              ({convRate}%)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-violet-300 font-mono">
                        {pb.total_revenue_generated != null ? formatRevenue(pb.total_revenue_generated) : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {pb.created_at
                          ? new Date(pb.created_at).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {safePlaybooks.length === 0 && (
            <div className="px-6 py-12 text-center text-muted-foreground">
              No expansion playbooks yet. Create your first playbook to start driving revenue growth.
            </div>
          )}
        </div>

        {/* New Playbook Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="relative bg-background border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">New Playbook</h2>
                <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
                  <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Q1 Upsell Campaign" className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Type</label>
                  <select value={formType} onChange={(e) => setFormType(e.target.value)} className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                    <option value="upsell">Upsell</option>
                    <option value="cross_sell">Cross-sell</option>
                    <option value="renewal">Renewal</option>
                    <option value="adoption">Adoption</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
                  <textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={3} placeholder="Optional description..." className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none" />
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
                      await gtmApi.expansion.createPlaybook(workspaceId, { name: formName.trim(), playbook_type: formType, description: formDescription.trim() || undefined });
                      queryClient.invalidateQueries({ queryKey: ["gtmExpansionPlaybooks", workspaceId] });
                      setShowModal(false);
                    } catch {
                      setFormError("Failed to create playbook");
                    } finally {
                      setCreating(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Playbook
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
