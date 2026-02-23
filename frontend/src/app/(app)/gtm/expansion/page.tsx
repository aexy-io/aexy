"use client";

import { useState } from "react";
import { TrendingUp, Plus, Loader2, RefreshCw, DollarSign } from "lucide-react";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useGTMExpansionPlaybooks, useGTMExpansionAnalytics } from "@/hooks/useGTM";

const TYPE_COLORS: Record<string, string> = {
  upsell: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  cross_sell: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  renewal: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  adoption: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  draft: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
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

  const { playbooks, isLoading: playbooksLoading, refetch: refetchPlaybooks } =
    useGTMExpansionPlaybooks(workspaceId);
  const { analytics, isLoading: analyticsLoading } =
    useGTMExpansionAnalytics(workspaceId);

  const isLoading = playbooksLoading || analyticsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <span className="text-zinc-400 text-sm">Loading expansion data...</span>
        </div>
      </div>
    );
  }

  const safePlaybooks = playbooks ?? [];
  const safeAnalytics = analytics ?? {
    active_playbooks: 0,
    total_enrollments: 0,
    total_conversions: 0,
    total_revenue_generated: 0,
  };

  const activePlaybooks = safePlaybooks.filter((p: any) => p.status === "active").length;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <TrendingUp className="w-7 h-7 text-indigo-400" />
              Expansion Playbooks
            </h1>
            <p className="text-zinc-400 mt-1">
              Upsell, cross-sell, renewal, and adoption playbooks for revenue growth
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => refetchPlaybooks()}
              className="inline-flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 rounded-lg text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" />
              New Playbook
            </button>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <TrendingUp className="w-4 h-4" />
              Active Playbooks
            </div>
            <p className="text-3xl font-bold text-white">
              {safeAnalytics.active_playbooks ?? activePlaybooks}
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <RefreshCw className="w-4 h-4" />
              Total Enrollments
            </div>
            <p className="text-3xl font-bold text-white">
              {(safeAnalytics.total_enrollments ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Conversions
            </div>
            <p className="text-3xl font-bold text-emerald-400">
              {(safeAnalytics.total_conversions ?? 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-2 text-zinc-400 text-sm mb-2">
              <DollarSign className="w-4 h-4 text-violet-400" />
              Revenue Generated
            </div>
            <p className="text-3xl font-bold text-violet-400">
              {formatRevenue(safeAnalytics.total_revenue_generated ?? 0)}
            </p>
          </div>
        </div>

        {/* Playbooks Table */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Playbooks</h3>
            <span className="text-sm text-zinc-400">{safePlaybooks.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
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
                      className="text-left text-xs font-medium text-zinc-500 uppercase tracking-wider px-6 py-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {safePlaybooks.map((pb: any) => {
                  const convRate =
                    pb.enrollments > 0
                      ? ((pb.conversions / pb.enrollments) * 100).toFixed(0)
                      : "0";
                  return (
                    <tr key={pb.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4 text-sm text-zinc-200 font-medium">
                        {pb.name}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            TYPE_COLORS[pb.type] ?? TYPE_COLORS.upsell
                          }`}
                        >
                          {pb.type?.replace(/_/g, " ")}
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
                      <td className="px-6 py-4 text-sm text-zinc-300 font-mono">
                        {(pb.enrollments ?? 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-zinc-300 font-mono">
                            {(pb.conversions ?? 0).toLocaleString()}
                          </span>
                          {pb.enrollments > 0 && (
                            <span className="text-xs text-zinc-500">
                              ({convRate}%)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-violet-300 font-mono">
                        {pb.revenue != null ? formatRevenue(pb.revenue) : "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-500">
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
            <div className="px-6 py-12 text-center text-zinc-500">
              No expansion playbooks yet. Create your first playbook to start driving revenue growth.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
